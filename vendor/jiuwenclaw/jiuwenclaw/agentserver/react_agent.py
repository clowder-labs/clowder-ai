# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""JiuClawReActAgent - Inherits openjiuwen ReActAgent, overrides invoke/stream.

Emits todo.updated events after todo tool calls for frontend real-time sync.
Sends evolution approval requests to user via chat.ask_user_question (keep/undo).
"""
from __future__ import annotations

import asyncio
import importlib.util
import re
import sys
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import tiktoken
from openjiuwen.core.context_engine.schema.messages import OffloadMixin
from openjiuwen.core.foundation.llm import (
    AssistantMessage,
    SystemMessage,
    UserMessage,
    BaseMessage,
    Model
)
from openjiuwen.core.foundation.tool import ToolInfo
from openjiuwen.core.session.agent import Session
from openjiuwen.core.session.stream import OutputSchema
from openjiuwen.core.session.stream.base import StreamMode
from jiuwenclaw.agentserver.tools.subagent_executor import set_subagent_parent_session
from openjiuwen.core.single_agent import AgentCard, ReActAgent

from jiuwenclaw.agentserver.permissions import (
    assess_command_risk_with_llm,
    check_tool_permissions,
    persist_external_directory_allow,
    persist_permission_allow_rule,
)
from jiuwenclaw.agentserver.permissions.models import PermissionLevel
from jiuwenclaw.agentserver.tools.todo_toolkits import TodoToolkit
from jiuwenclaw.evolution.service import EvolutionService
from jiuwenclaw.utils import (
    fix_json_arguments,
    get_agent_memory_dir,
    get_env_file,
    get_workspace_dir,
    logger,
)
from jiuwenclaw.config import get_config
from jiuwenclaw.agentserver.context_window_unload import (
    context_engine_compression_enabled,
    effective_token_budget,
    resolve_model_context_window,
    shrink_messages_for_context_window,
)
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=get_env_file())
# 加载流式输出配置
_react_config = get_config().get("react", {})
ANSWER_CHUNK_SIZE = _react_config.get("answer_chunk_size", 500)
STREAM_CHUNK_THRESHOLD = _react_config.get("stream_chunk_threshold", 50)
STREAM_CHARACTER_THRESHOLD = _react_config.get("stream_character_threshold", 2000)
_llm_max_tokens_env = os.environ.get("LLM_MAX_TOKENS", "").strip()
LLM_MAX_TOKENS = int(_llm_max_tokens_env) if _llm_max_tokens_env else 16384

_TODO_TOOL_NAMES = frozenset(
    ["todo_create", "todo_complete", "todo_insert", "todo_remove", "todo_list"]
)
_CMD_EVOLVE = "/evolve"
_CMD_SOLIDIFY = "/solidify"

_PERMISSION_APPROVAL_TIMEOUT = 300  # Auto-reject after 5 minute timeout

_BASH_BLOCK_RE = re.compile(r'```bash\s*\n(.*?)```', re.DOTALL)


def _parse_skill_bash_commands(skill_md_text: str) -> list:
    """Extract executable bash commands from SKILL.md ```bash blocks."""
    commands: list = []
    for block in _BASH_BLOCK_RE.findall(skill_md_text):
        for line in block.strip().splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                commands.append(line)
    return commands

# Default truncation length (characters) for tool result content
DEFAULT_TRUNCATE_LENGTH = 20000


def _deduplicate_tools_by_name(tools: List[Any]) -> List[Any]:
    """Deduplicate tool infos by tool name while preserving order."""
    seen: set[str] = set()
    unique: List[Any] = []
    for tool in tools:
        name = getattr(tool, "name", None)
        if not name:
            unique.append(tool)
            continue
        if name in seen:
            continue
        seen.add(name)
        unique.append(tool)
    return unique


def _chunk_text(text: str, chunk_size: int) -> List[str]:
    """Split text into chunks of specified size at word/char boundaries.

    Args:
        text: Input text to chunk.
        chunk_size: Maximum characters per chunk.

    Returns:
        List of text chunks.
    """
    if not text or len(text) <= chunk_size:
        return [text] if text else []

    chunks: List[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunks.append(text[start:])
            break

        # Try to break at whitespace for cleaner chunks
        chunk = text[start:end]
        last_space = chunk.rfind(" ")
        last_newline = chunk.rfind("\n")
        break_point = max(last_space, last_newline)

        if break_point > chunk_size // 2:
            chunks.append(chunk[:break_point])
            start += break_point + 1
        else:
            chunks.append(chunk)
            start += chunk_size

    return chunks


class JiuClawReActAgent(ReActAgent):
    """Inherits ReActAgent, overrides invoke/stream to support todo.updated events."""

    def __init__(self, card: AgentCard) -> None:
        self._evolution_service: Optional[EvolutionService] = None
        self._pending_auto_evolution_history: Optional[List[Any]] = None
        self._pending_approvals: Dict[str, asyncio.Future] = {}  # request_id -> Future (权限审批)
        self._pending_permission_meta: Dict[str, dict] = {}  # request_id -> {tool_name, tool_args}
        super().__init__(card)
        self._stream_tasks: set[asyncio.Task] = set()
        self._pause_events: dict[str, asyncio.Event] = {}  # task_key -> event
        self._workspace_dir = get_workspace_dir()
        self._memory_dir = get_agent_memory_dir()
        self._agent_id: str = "main_agent"
        # Skill compliance: track active skill and cache content for periodic re-injection
        self._active_skill: Optional[str] = None
        self._active_skill_content: Optional[str] = None
        self._skill_tool_count: int = 0  # tool calls since last re-injection
        self._last_declared_step: Optional[int] = None  # last declared stage number
        self._skip_warned: bool = False  # True = already warned once, next skip will block
        self._pending_skip_warning: Optional[str] = None  # soft warning to inject in compliance
        self._current_session_id: Optional[str] = None
        self._no_tool_invoke_count: int = 0  # consecutive invokes ending without tool calls
        self._skill_bash_commands: List[str] = []  # parsed from SKILL.md ```bash blocks
        self._last_reasoning_content: Optional[str] = None  # previous iteration's reasoning_content
        self._reasoning_repeat_count: int = 0  # consecutive identical reasoning_content count
        self._stop_reasoning_output: bool = False  # stop streaming reasoning when repeated with tool_calls

    def set_workspace(self, workspace_dir: str, agent_id: str) -> None:
        """Set workspace directory and Agent ID."""
        self._workspace_dir = workspace_dir
        self._agent_id = agent_id

    def _apply_pre_llm_context_window_budget(
        self,
        system_messages: List,
        history_messages: List,
        context_window: Any,
        session_id: str,
        session: Optional[Session],
    ) -> Tuple[List[Any], Optional[Dict[str, Any]]]:
        """After get_context_window: optionally trim oldest user rounds to fit MODEL_CONTEXT_WINDOW.

        Skipped when context_engine compression is enabled (mutual exclusion) or env unset.
        """
        tools = context_window.get_tools() or None
        messages = [*system_messages, *history_messages]
        if context_engine_compression_enabled(get_config):
            return messages, None
        model_window = resolve_model_context_window()
        budget = effective_token_budget(model_window, LLM_MAX_TOKENS)
        request_id = (getattr(session, "request_id", "") or "") if session else ""
        model_name = getattr(self._config, "model_name", "") or ""
        return shrink_messages_for_context_window(
            system_messages=system_messages,
            history_messages=history_messages,
            tools=tools,
            budget_tokens=budget,
            model_window=model_window,
            session_id=session_id or "",
            request_id=request_id,
            model_name=model_name,
        )

    async def _call_llm(
        self,
        messages: List,
        tools: Optional[List[ToolInfo]] = None,
        session: Optional[Session] = None,
        chunk_threshold: int = 10
    ) -> AssistantMessage:
        """Call LLM with messages and optional tools (streaming if session provided)

        Args:
            messages: Message list (BaseMessage or dict)
            tools: Optional tool definitions (List[ToolInfo])
            session: Optional Session for streaming output
            chunk_threshold: Number of chunks to accumulate before sending (default: 10)

        Returns:
            AssistantMessage from LLM
        """
        llm = self._get_llm()

        # If session provided, use streaming mode for real-time output
        if session is not None:
            return await self._call_llm_stream(
                llm, messages, tools, session, chunk_threshold
            )
        else:
            # Non-streaming mode for backward compatibility
            return await llm.invoke(
                model=self._config.model_name,
                messages=messages,
                tools=tools,
                max_tokens=LLM_MAX_TOKENS,
            )

    async def _call_llm_stream(
        self,
        llm: Model,
        messages: List,
        tools: Optional[List[ToolInfo]],
        session: Session,
        chunk_threshold: int
    ) -> AssistantMessage:
        """Stream LLM invocation and send partial answers when content exceeds threshold

        Args:
            llm: Model instance
            messages: LLM input messages
            tools: Available tools
            session: Session context for streaming output
            chunk_threshold: Number of chunks to accumulate before sending

        Returns:
            AssistantMessage: Accumulated complete message from all chunks
        """
        accumulated_chunk = None
        chunk_count = 0
        last_sent_length = 0  # Track last sent content length

        try:
            async for chunk in llm.stream(
                messages,
                tools=tools,
                model=self._config.model_name,
                max_tokens=LLM_MAX_TOKENS,
            ):
                # Accumulate chunks using AssistantMessageChunk's __add__ method
                if accumulated_chunk is None:
                    accumulated_chunk = chunk
                else:
                    accumulated_chunk = accumulated_chunk + chunk

                # Stream output for reasoning content (skip if stopped due to repeat)
                if chunk.reasoning_content and not self._stop_reasoning_output:
                    stream_output = OutputSchema(
                        type="llm_reasoning",
                        index=chunk_count,
                        payload={
                            "output": chunk.reasoning_content,
                            "result_type": "answer"
                        }
                    )
                    await session.write_stream(stream_output)
                    chunk_count += 1

                # Check if accumulated content exceeds threshold
                if accumulated_chunk is not None and accumulated_chunk.content:
                    current_length = len(accumulated_chunk.content)
                    # Send partial answer only when threshold exceeded
                    if current_length - last_sent_length >= STREAM_CHARACTER_THRESHOLD:
                        # Send new content since last send
                        new_content = accumulated_chunk.content[last_sent_length:]
                        if new_content:
                            await session.write_stream(
                                OutputSchema(
                                    type="answer",
                                    index=chunk_count,
                                    payload={
                                        "output": {
                                            "output": new_content,
                                            "result_type": "answer",
                                            "partial": True,  # Mark as partial response
                                        },
                                        "result_type": "answer",
                                    },
                                )
                            )
                            chunk_count += 1
                            last_sent_length = current_length

            # Send any remaining content that didn't reach threshold
            if accumulated_chunk is not None and accumulated_chunk.content:
                current_length = len(accumulated_chunk.content)
                if current_length > last_sent_length:
                    remaining_content = accumulated_chunk.content[last_sent_length:]
                    if remaining_content:
                        await session.write_stream(
                            OutputSchema(
                                type="answer",
                                index=chunk_count,
                                payload={
                                    "output": {
                                        "output": remaining_content,
                                        "result_type": "answer",
                                        "partial": True,  # Mark as partial response
                                    },
                                    "result_type": "answer",
                                },
                            )
                        )
                        chunk_count += 1

            # Check for empty response
            if accumulated_chunk is None:
                raise ValueError("LLM returned empty response")

            # Convert accumulated chunk to AssistantMessage
            return AssistantMessage(
                role=accumulated_chunk.role or "assistant",
                content=accumulated_chunk.content or "",
                tool_calls=accumulated_chunk.tool_calls or [],
                usage_metadata=getattr(accumulated_chunk, 'usage_metadata', None),
                finish_reason=getattr(accumulated_chunk, 'finish_reason', None) or "stop",
                parser_content=getattr(accumulated_chunk, 'parser_content', None),
                reasoning_content=getattr(accumulated_chunk, 'reasoning_content', None),
            )

        except Exception as e:
            logger.error(f"Failed to stream LLM output: {e}")
            raise

    def pause(self) -> None:
        """Pause all running tasks (blocks at next checkpoint)."""
        for event in self._pause_events.values():
            event.clear()

    def resume(self) -> None:
        """Resume all paused tasks."""
        for event in self._pause_events.values():
            event.set()

    def set_evolution_service(self, service: Any) -> None:
        """Set the EvolutionService instance for online evolution."""
        self._evolution_service = service
        logger.info("[ReActAgent] evolution service set")

    async def invoke(
        self,
        inputs: Any,
        session: Optional[Session] = None,
        *,
        _pause_event: Optional[asyncio.Event] = None,
    ) -> Dict[str, Any]:
        """Custom ReAct loop implementation, replacing parent invoke().

        Same logic as openjiuwen ReActAgent.invoke(), additionally writes
        todo.updated OutputSchema after todo tool calls.
        """
        # Parse inputs
        if isinstance(inputs, dict):
            user_input = inputs.get("query")
            session_id = inputs.get("conversation_id", "")
            if user_input is None:
                raise ValueError("Input dict must contain 'query'")
        elif isinstance(inputs, str):
            user_input = inputs
            session_id = ""
        else:
            raise ValueError("Input must be dict with 'query' or str")

        self._current_session_id = session_id or None
        # Reset reasoning loop repeater counter for each new conversation
        self._last_reasoning_content = None
        self._reasoning_repeat_count = 0
        self._stop_reasoning_output = False
        # Token usage accumulator across ReAct iterations
        total_input_tokens = 0
        total_output_tokens = 0
        total_total_tokens = 0

        stripped = user_input.strip()
        stripped = EvolutionService.extract_user_content(stripped)
        # Intercept slash commands (skip ReAct reasoning loop to save tokens)
        if stripped.startswith(_CMD_EVOLVE):
            if self._evolution_service is None:
                return {"output": "演进功能未启用。", "result_type": "error"}
            messages = await self._get_session_messages(session)
            return await self._evolution_service.handle_evolve_command(stripped, session, messages)
        if stripped.startswith(_CMD_SOLIDIFY):
            if self._evolution_service is None:
                return {"output": "演进功能未启用。", "result_type": "error"}
            return self._evolution_service.handle_solidify_command(stripped)

        # Skill deactivation: if consecutive no-tool invokes reached threshold, clear skill
        if self._active_skill and self._no_tool_invoke_count >= 2:
            logger.info(
                "[ReActAgent] Skill compliance: deactivating '%s' after %d consecutive no-tool invokes",
                self._active_skill, self._no_tool_invoke_count,
            )
            self._active_skill = None
            self._active_skill_content = None
            self._skill_tool_count = 0
            self._last_declared_step = None
            self._skip_warned = False
            self._pending_skip_warning = None
            self._no_tool_invoke_count = 0
            self._skill_bash_commands = []

        # Initialize context
        context = await self._init_context(session)
        await context.add_messages(UserMessage(content=user_input))

        # Build request-scoped system messages once before loop.
        system_messages = self._build_system_messages(
            session_id,
            system_prompt_append=inputs.get("system_prompt_append") if isinstance(inputs, dict) else None,
        )

        tools = _deduplicate_tools_by_name(
            await self.ability_manager.list_tool_info()
        )

        # Validate and fix incomplete context before entering ReAct loop
        await self._fix_incomplete_tool_context(context)

        # ReAct loop
        for iteration in range(self._config.max_iterations):
            # Pause checkpoint: block here if paused until resume
            if _pause_event is not None:
                await _pause_event.wait()

            logger.info(
                "session %s, ReAct iteration %d/%d",
                session_id,
                iteration + 1,
                self._config.max_iterations,
            )

            context_window = await context.get_context_window(
                system_messages=[],
                tools=tools if tools else None,
            )

            history_messages = context_window.get_messages()
            history_snapshot = list(history_messages)
            # Filter out SystemMessage from history to avoid "System message must be at the beginning" error
            history_messages = [m for m in history_messages if not isinstance(m, SystemMessage)]
            messages, _cw_err = self._apply_pre_llm_context_window_budget(
                system_messages,
                history_messages,
                context_window,
                session_id,
                session,
            )
            if _cw_err is not None:
                return _cw_err

            compression_to_show = []
            uncompressed = []
            for message in messages:
                if isinstance(message, OffloadMixin):
                    original_message = await context.reloader_tool().invoke(
                        inputs={
                            "offload_handle": message.offload_handle,
                            "offload_type": message.offload_type
                        }
                    )
                    compression_to_show.append((message, original_message))
                else:
                    uncompressed.append(message)
            await self._emit_context_compression(session, compression_to_show, uncompressed)

            try:
                ai_message = await self._call_llm(
                    messages,
                    context_window.get_tools() or None,
                    session,  # Pass session for streaming
                )
                # Accumulate token usage
                if hasattr(ai_message, 'usage_metadata') and ai_message.usage_metadata:
                    um = ai_message.usage_metadata
                    total_input_tokens += getattr(um, 'input_tokens', 0) or 0
                    total_output_tokens += getattr(um, 'output_tokens', 0) or 0
                    total_total_tokens += getattr(um, 'total_tokens', 0) or 0
                # 修复 tool_calls 中的 JSON 格式
                if hasattr(ai_message, "tool_calls") and ai_message.tool_calls:
                    ai_message.tool_calls = self._fix_tool_calls_arguments(ai_message.tool_calls)
            except Exception as e:
                logger.error(f"[JiuwenClaw] 尝试修复上下文")
                await self._fix_incomplete_tool_context(context)
                context_window = await context.get_context_window(
                    system_messages=[],
                    tools=tools if tools else None,
                )
                history_messages = context_window.get_messages()
                history_snapshot = list(history_messages)
                # Filter out SystemMessage from history to avoid "System message must be at the beginning" error
                history_messages = [m for m in history_messages if not isinstance(m, SystemMessage)]
                messages, _cw_err2 = self._apply_pre_llm_context_window_budget(
                    system_messages,
                    history_messages,
                    context_window,
                    session_id,
                    session,
                )
                if _cw_err2 is not None:
                    return _cw_err2
                ai_message = await self._call_llm(
                    messages,
                    context_window.get_tools() or None,
                    session,  # Pass session for streaming
                )
                # Accumulate token usage (retry path)
                if hasattr(ai_message, 'usage_metadata') and ai_message.usage_metadata:
                    um = ai_message.usage_metadata
                    total_input_tokens += getattr(um, 'input_tokens', 0) or 0
                    total_output_tokens += getattr(um, 'output_tokens', 0) or 0
                    total_total_tokens += getattr(um, 'total_tokens', 0) or 0
                # 修复 tool_calls 中的 JSON 格式
                if hasattr(ai_message, "tool_calls") and ai_message.tool_calls:
                    ai_message.tool_calls = self._fix_tool_calls_arguments(ai_message.tool_calls)

            # ---- 复读机检测 ----
            # 检测 reasoning_content 是否重复，无论是否有 tool_calls
            has_tool_calls = bool(ai_message.tool_calls)
            reasoning = getattr(ai_message, 'reasoning_content', None) or ''
            if reasoning:
                if reasoning == self._last_reasoning_content:
                    # reasoning 相同，累加计数
                    self._reasoning_repeat_count += 1
                    # 有 tool_calls 时，停止 reasoning 输出但不终止任务
                    if has_tool_calls and self._reasoning_repeat_count >= 3:
                        self._stop_reasoning_output = True
                        logger.warning(
                            "[ReActAgent] Reasoning repeat detected: same reasoning_content %d times with tool_calls, stopping reasoning output",
                            self._reasoning_repeat_count,
                        )
                else:
                    # reasoning 不同，重置计数
                    self._last_reasoning_content = reasoning
                    self._reasoning_repeat_count = 0
                    self._stop_reasoning_output = False

            if not has_tool_calls and self._reasoning_repeat_count >= 3:
                logger.warning(
                    "[ReActAgent] Reasoning loop detected: same reasoning_content %d times with no tool calls, terminating",
                    self._reasoning_repeat_count,
                )
                self._last_reasoning_content = None
                self._reasoning_repeat_count = 0
                usage = None
                if total_input_tokens or total_output_tokens:
                    usage = {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "total_tokens": total_total_tokens,
                    }
                # 返回 answer 而非 error，保留 LLM 已输出内容，附加循环终止提示
                return {
                    "output": f"{ai_message.content or ''}\n\n[系统提示] 检测到思考循环，已自动终止。请尝试提供更明确的指令或简化任务复杂度。",
                    "result_type": "answer",
                    "usage": usage,
                }

            # Pause checkpoint: after LLM returns, before tool execution
            if _pause_event is not None:
                await _pause_event.wait()

            # ---- 步骤跳跃拦截：每个 iteration 都检测 ----
            skip_correction = self._check_step_skip(ai_message.content or "")
            if skip_correction:
                ai_msg_for_context = AssistantMessage(
                    content=ai_message.content,
                    tool_calls=ai_message.tool_calls,
                )
                await context.add_messages(ai_msg_for_context)
                if ai_message.tool_calls:
                    from openjiuwen.core.foundation.llm import ToolMessage as _ToolMsg
                    for tc in ai_message.tool_calls:
                        await context.add_messages(_ToolMsg(
                            content=skip_correction,
                            tool_call_id=getattr(tc, "id", ""),
                        ))
                else:
                    await context.add_messages(UserMessage(content=skip_correction))
                continue  # re-prompt LLM

            if ai_message.tool_calls:
                # Tool calls present — skill is still in use, reset no-tool counter
                self._no_tool_invoke_count = 0

                # Emit tool_call event
                if session is not None:
                    for tc in ai_message.tool_calls:
                        await self._emit_tool_call(session, tc)

                # ---- 权限检查：在执行工具前逐一检查权限 ----
                allowed_tool_calls, denied_results = await check_tool_permissions(
                    ai_message.tool_calls,
                    channel_id=getattr(session, "channel_id", "web") if session else "web",
                    session_id=session_id or None,
                    session=session,
                    request_approval_callback=self._request_permission_approval,
                )

                # Add assistant message to context before tool execution
                ai_msg_for_context = AssistantMessage(
                    content=ai_message.content,
                    tool_calls=ai_message.tool_calls,
                )
                await context.add_messages(ai_msg_for_context)

                tool_messages_added = False
                try:
                    # 先把被拒绝的工具调用写入 ToolMessage
                    from openjiuwen.core.foundation.llm import ToolMessage as _ToolMsg
                    for tc, deny_msg in denied_results:
                        tool_call_id = getattr(tc, "id", "")
                        await context.add_messages(_ToolMsg(
                            content=deny_msg,
                            tool_call_id=tool_call_id,
                        ))
                        if session is not None:
                            await self._emit_tool_result(session, tc, deny_msg)

                    # ---- 技能模式下禁止批量 todo_complete ----
                    if self._active_skill and allowed_tool_calls:
                        complete_indices = [
                            i for i, tc in enumerate(allowed_tool_calls)
                            if getattr(tc, "name", "") == "todo_complete"
                        ]
                        if len(complete_indices) > 1:
                            # 只保留第一个 todo_complete，其余拦截
                            blocked = set(complete_indices[1:])
                            lang = get_config().get("preferred_language", "zh")
                            if lang == "zh":
                                block_msg = (
                                    "[拦截] 技能执行中每次只能完成一个 todo 项。"
                                    "请先完成当前项并确认结果，再完成下一项。"
                                )
                            else:
                                block_msg = (
                                    "[Blocked] Only one todo_complete per turn during skill execution. "
                                    "Complete the current item and verify before moving to the next."
                                )
                            for idx in blocked:
                                tc = allowed_tool_calls[idx]
                                tool_call_id = getattr(tc, "id", "")
                                await context.add_messages(_ToolMsg(
                                    content=block_msg,
                                    tool_call_id=tool_call_id,
                                ))
                                if session is not None:
                                    await self._emit_tool_result(session, tc, block_msg)
                            allowed_tool_calls = [
                                tc for i, tc in enumerate(allowed_tool_calls)
                                if i not in blocked
                            ]

                    # 执行被允许的工具调用
                    if allowed_tool_calls:
                        # Set session context for subagent tools to access
                        set_subagent_parent_session(session)
                        results = await self.ability_manager.execute(
                            allowed_tool_calls, session
                        )
                        # Clear session context after execution
                        set_subagent_parent_session(None)

                        for i, (_result, tool_msg) in enumerate(results):
                            tc = allowed_tool_calls[i] if i < len(allowed_tool_calls) else None
                            if tc is not None:
                                tool_msg = self._maybe_inject_body_experience(tc, tool_msg)
                                self._maybe_track_active_skill(tc, tool_msg)
                                self._maybe_inject_skill_compliance(tool_msg, getattr(tc, "name", ""))
                                self._detect_script_failure(tc, tool_msg)
                                self._truncate_tool_message(tool_msg, tc.name)
                            await context.add_messages(tool_msg)
                            if session is not None:
                                await self._emit_tool_result(session, tc, _result)
                    
                    tool_messages_added = True

                    # Detect if todo tool was called, emit todo.updated if so
                    todo_called = any(
                        tc.name in _TODO_TOOL_NAMES for tc in ai_message.tool_calls
                    )
                    if todo_called and session is not None and session_id:
                        await self._emit_todo_updated(session, session_id)
                except (Exception, asyncio.CancelledError):
                    # Clear session context on exception
                    set_subagent_parent_session(None)
                    # On exception or cancellation, add placeholder tool messages to keep context valid
                    if not tool_messages_added:
                        from openjiuwen.core.foundation.llm import ToolMessage
                        for tc in ai_message.tool_calls:
                            tool_call_id = getattr(tc, "id", "")
                            error_msg = f"Tool execution interrupted or failed: {tc.name}"
                            await context.add_messages(ToolMessage(
                                content=error_msg,
                                tool_call_id=tool_call_id
                            ))
                    raise
            else:
                # No tool calls: final answer. Increment no-tool counter;
                # skill will be deactivated if this happens 2 times consecutively.
                if self._active_skill:
                    self._no_tool_invoke_count += 1

                ai_msg_for_context = AssistantMessage(
                    content=ai_message.content,
                    tool_calls=ai_message.tool_calls,
                )
                await context.add_messages(ai_msg_for_context)

                # Store auto-scan context for stream() to handle
                if (
                    self._evolution_service is not None
                    and self._evolution_service.auto_scan
                    and history_snapshot
                ):
                    self._pending_auto_evolution_history = list(history_snapshot)

                usage = None
                if total_input_tokens or total_output_tokens:
                    usage = {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "total_tokens": total_total_tokens,
                    }
                return {
                    "output": ai_message.content,
                    "result_type": "answer",
                    "_streamed": session is not None,
                    "usage": usage,
                }

        usage = None
        if total_input_tokens or total_output_tokens:
            usage = {
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "total_tokens": total_total_tokens,
            }
        return {
            "output": "Max iterations reached without completion",
            "result_type": "error",
            "usage": usage,
        }

    async def stream(
        self,
        inputs: Any,
        session: Optional[Session] = None,
        stream_modes: Optional[List[StreamMode]] = None,
    ) -> AsyncIterator[Any]:
        """Override stream to support todo.updated events in ReAct loop.

        Args:
            inputs: {"query": "...", "conversation_id": "..."} or str.
            session: Session object for streaming pipeline.
            stream_modes: Stream output modes (optional).

        Yields:
            OutputSchema objects.
        """
        if session is not None:
            await session.pre_run()

        # Create independent pause event for this stream call (new tasks unaffected by previous pauses)
        task_key = f"stream_{id(asyncio.current_task())}"
        pause_event = asyncio.Event()
        pause_event.set()  # Initially set to running state
        self._pause_events[task_key] = pause_event

        async def stream_process() -> None:
            try:
                self._pending_auto_evolution_history = None
                final_result = await self.invoke(inputs, session, _pause_event=pause_event)
                # Extract usage for injection into final OutputSchema
                _usage = final_result.get("usage") if isinstance(final_result, dict) else None

                if session is not None:
                    # Extract content and check if it was already streamed
                    output_content = ""
                    was_streamed = False

                    if isinstance(final_result, dict):
                        output_content = final_result.get("output", "")
                        if isinstance(output_content, dict):
                            output_content = output_content.get("output", "")
                        was_streamed = final_result.get("_streamed", False)

                    if was_streamed:
                        # Content was already streamed via _call_llm_stream
                        # Send final answer marker only (with usage if available)
                        payload = {
                            "output": {
                                "output": "",
                                "result_type": "answer",
                                "streamed": True,
                            },
                            "result_type": "answer",
                        }
                        if _usage:
                            payload["usage"] = _usage
                        await session.write_stream(
                            OutputSchema(
                                type="answer",
                                index=0,
                                payload=payload,
                            )
                        )
                    elif output_content and len(output_content) > ANSWER_CHUNK_SIZE:
                        # Short content that wasn't streamed: split into chunks and send
                        chunks = _chunk_text(output_content, ANSWER_CHUNK_SIZE)
                        for i, chunk in enumerate(chunks):
                            if i == 0:
                                # First chunk: send as answer type (with usage)
                                first_payload = {
                                    "output": {
                                        "output": chunk,
                                        "result_type": "answer",
                                        "chunked": True,
                                        "chunk_index": i,
                                        "total_chunks": len(chunks),
                                    },
                                    "result_type": "answer",
                                }
                                if _usage:
                                    first_payload["usage"] = _usage
                                await session.write_stream(
                                    OutputSchema(
                                        type="answer",
                                        index=0,
                                        payload=first_payload,
                                    )
                                )
                            else:
                                # Subsequent chunks: send as content_chunk
                                await session.write_stream(
                                    OutputSchema(
                                        type="content_chunk",
                                        index=0,
                                        payload={"content": chunk},
                                    )
                                )
                    else:
                        # Short content: send as single answer
                        await session.write_stream(
                            OutputSchema(
                                type="answer",
                                index=0,
                                payload={
                                    "output": final_result,
                                    "result_type": "answer",
                                },
                            )
                        )

                # Handle auto-scan evolution after answer
                history = self._pending_auto_evolution_history

                # If no auto evolution, send processing_complete directly
                if history is None and self._evolution_service is not None and session is not None:
                    await session.write_stream(
                        OutputSchema(
                            type="processing_complete",
                            index=0,
                            payload={},
                        )
                    )

                if history is not None and self._evolution_service is not None and session is not None:
                    # Signal frontend that main processing is done before evolution starts,
                    # so new user input is treated as a normal submit (not interrupt).
                    await session.write_stream(
                        OutputSchema(
                            type="processing_complete",
                            index=0,
                            payload={},
                        )
                    )
                    try:
                        await self._evolution_service.run_auto_evolution(session, history)
                    except Exception as e:
                        logger.warning("[ReActAgent] auto evolution error: %s", e)
                self._pending_auto_evolution_history = None
            except asyncio.CancelledError:
                logger.info("stream_process cancelled")
            except Exception as e:
                logger.exception("stream error: %s", e)
                await session.write_stream(
                            OutputSchema(
                                type="answer",
                                index=0,
                                payload={
                                    "output": str(e),
                                    "result_type": "error",
                                },
                            )
                        )
            finally:
                if session is not None:
                    await self.context_engine.save_contexts(session)
                    await session.post_run()

        task = asyncio.create_task(stream_process())
        self._stream_tasks.add(task)

        try:
            if session is not None:
                async for result in session.stream_iterator():
                    yield result

            await task
        finally:
            self._stream_tasks.discard(task)
            self._pause_events.pop(task_key, None)

    async def _request_permission_approval(
        self,
        session: Session,
        tool_call: Any,
        result: Any,
    ) -> str:
        """Request user approval for a tool call via chat.ask_user_question.

        Returns:
            "allow_once" | "allow_always" | "deny"
            Timeout auto-returns "deny".
        """
        import json as _json

        request_id = f"perm_approve_{uuid.uuid4().hex[:8]}"
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        self._pending_approvals[request_id] = future

        tool_name = getattr(tool_call, "name", "")
        tool_args = getattr(tool_call, "arguments", {})
        if isinstance(tool_args, str):
            try:
                tool_args = _json.loads(tool_args)
            except Exception:
                tool_args = {}

        #risk = assess_command_risk_static(tool_name, tool_args)
        risk = await assess_command_risk_with_llm(
            self._get_llm(), self._config.model_name, tool_name, tool_args
        )

        args_preview = ""
        try:
            raw = _json.dumps(tool_args, ensure_ascii=False, indent=2)
            args_preview = raw[:500] if len(raw) > 500 else raw
        except Exception:
            args_preview = str(tool_args)[:500]

        always_allow_hint = ""
        #shell_injection_warning = ""
        if tool_name == "mcp_exec_command":
            cmd = tool_args.get("command", tool_args.get("cmd", "")) if isinstance(tool_args, dict) else ""
            if cmd:
                # import re as _re
                # _ops_re = _re.compile(r'[;&|`<>]|\$[({]|\r?\n')
                # if _ops_re.search(str(cmd)):
                #     shell_injection_warning = (
                #         "\n\n> **⚠ 安全警告：** 该命令包含 shell 操作符"
                #         "（如 `&&` `;` `|` 等），可能存在命令注入风险，请仔细核查\n"
                #     )
                always_allow_hint = (
                    f"\n\n> 选择「总是允许」将自动放行 `{cmd}` 命令"
                )
        elif tool_name:
            always_allow_hint = f"\n\n> 选择「总是允许」将自动放行所有 `{tool_name}` 调用"

        question_text = (
            f"**工具 `{tool_name}` 需要授权才能执行**\n\n"
            f"**安全风险评估：** {risk['icon']} **{risk['level']}风险**\n\n"
            f"> {risk['explanation']}\n\n"
        )
        #question_text += shell_injection_warning
        if args_preview and args_preview != "{}":
            question_text += f"参数：\n```json\n{args_preview}\n```\n"
        question_text += f"\n匹配规则：`{result.matched_rule or 'N/A'}`"
        question_text += always_allow_hint

        meta: dict = {
            "tool_name": tool_name,
            "tool_args": tool_args,
        }
        if result.matched_rule and "external_directory" in result.matched_rule:
            meta["external_paths"] = getattr(result, "external_paths", None) or []
        self._pending_permission_meta[request_id] = meta

        try:
            await session.write_stream(
                OutputSchema(
                    type="chat.ask_user_question",
                    index=0,
                    payload={
                        "request_id": request_id,
                        "questions": [
                            {
                                "question": question_text,
                                "header": "权限审批",
                                "options": [
                                    {"label": "本次允许", "description": "仅本次授权执行"},
                                    {"label": "总是允许", "description": "记住该规则，以后自动放行"},
                                    {"label": "拒绝", "description": "拒绝执行此工具"},
                                ],
                                "multi_select": False,
                            }
                        ],
                    },
                )
            )
        except Exception:
            logger.debug("_request_permission_approval: popup send failed", exc_info=True)
            self._pending_approvals.pop(request_id, None)
            self._pending_permission_meta.pop(request_id, None)
            return "deny"

        try:
            return await asyncio.wait_for(future, timeout=_PERMISSION_APPROVAL_TIMEOUT)
        except asyncio.TimeoutError:
            logger.info(
                "[ReActAgent] Permission approval timeout (tool=%s, id=%s), auto-rejecting",
                tool_name, request_id,
            )
            return "deny"
        finally:
            self._pending_approvals.pop(request_id, None)
            self._pending_permission_meta.pop(request_id, None)

    async def _emit_tool_call(self, session: Session, tool_call: Any) -> None:
        """Emit tool_call OutputSchema, notify frontend of tool call start."""
        try:
            await session.write_stream(
                OutputSchema(
                    type="tool_call",
                    index=0,
                    payload={
                        "tool_call": {
                            "name": getattr(tool_call, "name", ""),
                            "arguments": getattr(tool_call, "arguments", {}),
                            "tool_call_id": getattr(tool_call, "id", ""),
                        }
                    },
                )
            )
        except Exception:
            logger.debug("tool_call emit failed", exc_info=True)

    async def _emit_tool_result(self, session: Session, tool_call: Any, result: Any) -> None:
        """Emit tool_result OutputSchema, notify frontend of tool execution result."""
        try:
            # todo 工具结果待优化
            await session.write_stream(
                OutputSchema(
                    type="tool_result",
                    index=0,
                    payload={
                        "tool_result": {
                            "tool_name": getattr(tool_call, "name", "") if tool_call else "",
                            "tool_call_id": getattr(tool_call, "id", "") if tool_call else "",
                            "result": str(result)[:1000] if result is not None else "",
                        }
                    },
                )
            )
            await session.write_stream(
                OutputSchema(
                    type="thinking",
                    index=0,
                    payload={},
                )
            )
        except Exception:
            logger.debug("tool_result emit failed", exc_info=True)

    async def _emit_todo_updated(self, session: Session, session_id: str) -> None:
        """Read current todo list and emit todo.updated OutputSchema."""
        try:
            from datetime import datetime, timezone

            todo_toolkit = TodoToolkit(session_id=session_id)
            tasks = todo_toolkit._load_tasks()

            # Map backend TodoTask fields to frontend TodoItem format
            status_mapping = {
                "waiting": "pending",
                "running": "in_progress",
                "completed": "completed",
                "cancelled": "pending",
            }

            now = datetime.now(timezone.utc).isoformat()

            todos = []
            for t in tasks:
                todos.append({
                    "id": str(t.idx),
                    "content": t.tasks,
                    "activeForm": t.tasks,
                    "status": status_mapping.get(t.status.value, "pending"),
                    "createdAt": now,
                    "updatedAt": now,
                })

            await session.write_stream(
                OutputSchema(
                    type="todo.updated",
                    index=0,
                    payload={"todos": todos},
                )
            )
        except Exception:
            logger.debug("todo.updated emit failed", exc_info=True)

    async def _emit_context_compression(self, session: Session, compression_to_show, uncompressed) -> None:
        """Emit current context compression content."""
        try:
            try:
                encoding = tiktoken.get_encoding("cl100k_base")
                tokens_compressed = 0
                tokens_full = 0
                token_uncompressed = 0
                for message in uncompressed:
                    token_uncompressed += len(encoding.encode(message.content))

                for c, o in compression_to_show:
                    tokens_compressed += len(encoding.encode(c.content))
                    tokens_full += len(encoding.encode(o))
                pre_compression = tokens_full + token_uncompressed
                post_compression = tokens_compressed + token_uncompressed
                rate = (1 - post_compression / pre_compression) * 100
            except Exception:
                tokens_compressed = 0
                tokens_full = 0
                token_uncompressed = 0
                for message in uncompressed:
                    token_uncompressed += len(message.content)

                for c, o in compression_to_show:
                    tokens_compressed += len(c.content)
                    tokens_full += len(o)

                pre_compression = tokens_full + token_uncompressed
                post_compression = tokens_compressed + token_uncompressed
                rate = (1 - post_compression / pre_compression) * 100

            await session.write_stream(
                OutputSchema(
                    type="context.compressed",
                    index=0,
                    payload={
                        "rate": rate,
                        "before_compressed": pre_compression,
                        "after_compressed": post_compression,
                    },
                )
            )
        except Exception:
            logger.debug("context_compression emit failed", exc_info=True)

    async def _fix_incomplete_tool_context(self, context: Any) -> None:
        """Validate and fix incomplete context messages before entering ReAct loop.

        If an assistant message with tool_calls exists without corresponding tool messages,
        add placeholder tool messages to keep context valid for OpenAI API.
        """
        from openjiuwen.core.foundation.llm import ToolMessage

        try:
            messages = context.get_messages()
            len_messages = len(messages)
            messages = context.pop_messages(size=len_messages)
            tool_message_cache = {}
            tool_id_cache = []  # 与assistant一致
            for i in range(len_messages):
                if isinstance(messages[i], AssistantMessage):
                    if not tool_id_cache:
                        await context.add_messages(messages[i])
                        tool_calls = getattr(messages[i], "tool_calls", None)
                        if tool_calls:
                            for tc in tool_calls:
                                tool_id_cache.append({
                                    "tool_call_id": getattr(tc, "id", ""),
                                    "tool_name": getattr(tc, "name", ""),
                                })
                    else:
                        logger.info("Fixed incomplete tool context with placeholder messages")
                        for tc in tool_id_cache:
                            tool_name = tc["tool_name"]
                            tool_call_id = tc["tool_call_id"]
                            if tool_call_id in tool_message_cache:
                                await context.add_messages(tool_message_cache[tool_call_id])
                            else:
                                await context.add_messages(ToolMessage(
                                    content=f"[工具执行被中断] 工具 {tool_name} 执行过程中被用户打断，没有执行结果。",
                                    tool_call_id=tool_call_id
                                ))
                        tool_id_cache = []
                elif isinstance(messages[i], ToolMessage):
                    if not tool_id_cache:
                        tool_message_cache[messages[i].tool_call_id] = messages[i]
                        continue
                    if messages[i].tool_call_id == tool_id_cache[0]["tool_call_id"]:
                        await context.add_messages(messages[i])
                        tool_id_cache.pop(0)
                    else:
                        tool_message_cache[messages[i].tool_call_id] = messages[i]
                        continue
                else:
                    logger.info("Fixed incomplete tool context with placeholder messages")
                    for tc in tool_id_cache:
                        tool_name = tc["tool_name"]
                        tool_call_id = tc["tool_call_id"]
                        if tool_call_id in tool_message_cache:
                            await context.add_messages(tool_message_cache[tool_call_id])
                        else:
                            await context.add_messages(ToolMessage(
                                content=f"[工具执行被中断] 工具 {tool_name} 执行过程中被用户打断，没有执行结果。",
                                tool_call_id=tool_call_id
                            ))
                    tool_id_cache = []
                    await context.add_messages(messages[i])
        except Exception as e:
            logger.warning("Failed to fix incomplete tool context: %s", e)

    def resolve_evolution_approval(self, request_id: str, answers: list) -> bool:
        """解析用户审批：权限审批由本 agent 处理，演进审批委托 EvolutionService."""
        if request_id.startswith("perm_approve_"):
            return self._resolve_permission_approval(request_id, answers)
        if self._evolution_service is not None:
            return self._evolution_service.resolve_approval(request_id, answers)
        return False

    def _resolve_permission_approval(self, request_id: str, answers: list) -> bool:
        """解析权限审批（总是允许/本次允许/拒绝）并 resolve Future."""
        future = self._pending_approvals.get(request_id)
        if future is None or future.done():
            return False
        selected = (
            answers[0].get("selected_options", [])
            if answers and isinstance(answers[0], dict)
            else []
        )
        if "总是允许" in selected:
            meta = self._pending_permission_meta.get(request_id, {})
            if meta:
                external_paths = meta.get("external_paths") or []
                if external_paths:
                    persist_external_directory_allow(external_paths)
                else:
                    persist_permission_allow_rule(
                        meta.get("tool_name", ""),
                        meta.get("tool_args", {}),
                    )
            future.set_result("allow_always")
            logger.info("[ReActAgent] Permission approval: request_id=%s decision=allow_always", request_id)
        elif "本次允许" in selected:
            future.set_result("allow_once")
            logger.info("[ReActAgent] Permission approval: request_id=%s decision=allow_once", request_id)
        else:
            future.set_result("deny")
            logger.info("[ReActAgent] Permission approval: request_id=%s decision=deny", request_id)
        return True

    def _get_skill_messages(self) -> List[SystemMessage]:
        """Build Skill summary SystemMessage list.

        For each skill, its description is listed, and any pending description
        experiences are appended directly after it.  Body experiences are NOT
        included here (they are solidified into SKILL.md).
        """
        prompt_parts: List[str] = []

        if self._skill_util is not None and self._skill_util.has_skill():
            skill_info = self._skill_util.get_skill_prompt()
            lines = skill_info.split("\n\n")[-1].strip().split("\n")
            skill_lines = [line for line in lines[1:-1] if line.strip()]

            if skill_lines:
                header = (
                    "# Skills\n"
                    "You are equipped with a set of skills that include instructions may help you "
                    "with current task. Before attempting any task, load the relevant skill document "
                    "using skill_initial_load and follow its workflow.\n\n"
                    "Here are the skills available:\n"
                )
                augmented: List[str] = []
                for line in skill_lines:
                    aug_line = f"- {line}"
                    if self._evolution_service is not None:
                        m = re.search(r"Skill name:\s*(\S+?);", line)
                        if m:
                            skill_name = m.group(1)
                            desc_text = self._evolution_service.store.format_desc_experience_text(skill_name)
                            if desc_text:
                                aug_line += f"\n  Skill description patch: {desc_text}"
                    augmented.append(aug_line)
                prompt_parts.append(header + "\n".join(augmented))

        if not prompt_parts:
            return []

        return [SystemMessage(content="\n\n".join(prompt_parts))]

    def _get_truncate_length(self, tool_name: str) -> int:
        """Get truncate_length for a tool from its ToolCard properties.

        Returns the tool-specific truncate_length if set, otherwise DEFAULT_TRUNCATE_LENGTH.
        """
        try:
            tool_card = self.ability_manager.get(tool_name)
            if tool_card is not None and hasattr(tool_card, "properties"):
                truncate_length = tool_card.properties.get("truncate_length")
                if truncate_length is not None:
                    return int(truncate_length)
        except Exception:
            pass
        return DEFAULT_TRUNCATE_LENGTH

    def _truncate_tool_message(self, tool_msg: Any, tool_name: str) -> None:
        """Truncate tool_msg.content based on the tool's registered truncate_length.

        If content length exceeds truncate_length, it is truncated in place and a suffix is appended.
        """
        content = getattr(tool_msg, "content", None)
        if not content or not isinstance(content, str):
            return
        truncate_length = self._get_truncate_length(tool_name)
        if len(content) <= truncate_length:
            return
        tool_msg.content = (
            content[:truncate_length]
            + f"\n\n[...truncated: {len(content) - truncate_length} chars omitted]"
        )
    _STEP_DECL_RE = re.compile(r'\[(?:当前步骤|[Cc]urrent\s*[Ss]tep)[：:]\s*(.+?)\]')
    _STAGE_NUM_RE = re.compile(r'[Ss]tage\s*(\d+)|阶段\s*(\d+)|[Ss]tep\s*(\d+)')

    def _check_step_skip(self, ai_content: str) -> Optional[str]:
        """Detect step-skipping with soft-then-hard enforcement.

        - Missing step declaration: never blocks, leaves it to compliance reminder.
        - Step skip first time: warns (stored in _pending_skip_warning), does NOT block.
        - Step skip after warning: blocks (returns correction message).

        Returns a correction message to block execution, or None to proceed.
        """
        if not self._active_skill or not ai_content:
            return None

        m = self._STEP_DECL_RE.search(ai_content)
        if not m:
            # No step declaration — don't block, compliance reminder will nudge
            return None

        decl = m.group(1)
        nm = self._STAGE_NUM_RE.search(decl)
        if not nm:
            return None

        current = int(next(g for g in nm.groups() if g is not None))
        lang = get_config().get("preferred_language", "zh")

        if self._last_declared_step is not None:
            gap = current - self._last_declared_step
            if gap > 1:
                skipped = ", ".join(
                    f"Stage {self._last_declared_step + i}"
                    for i in range(1, gap)
                )
                if not self._skip_warned:
                    # First skip: warn only, don't block, DON'T update _last_declared_step
                    # Agent must go back to the skipped step to prove correction
                    self._skip_warned = True
                    if lang == "zh":
                        self._pending_skip_warning = (
                            f"⚠️ 你从 Stage {self._last_declared_step} "
                            f"跳到了 Stage {current}，跳过了 {skipped}。"
                            f"请确认 SKILL.md 是否允许跳过这些步骤。"
                            f"如果不允许，请立即回退执行被跳过的步骤。"
                        )
                    else:
                        self._pending_skip_warning = (
                            f"⚠️ You jumped from Stage {self._last_declared_step} "
                            f"to Stage {current}, skipping {skipped}. "
                            f"Verify SKILL.md allows skipping these. "
                            f"If not, go back and execute them now."
                        )
                    logger.warning(
                        "[ReActAgent] Skill compliance: step skip warned "
                        "%s -> %s (skipped %s)",
                        self._last_declared_step, current, skipped,
                    )
                    return None  # don't block
                else:
                    # Already warned, still skipping — block
                    logger.warning(
                        "[ReActAgent] Skill compliance: step skip blocked "
                        "(post-warning) %s -> %s",
                        self._last_declared_step, current,
                    )
                    if lang == "zh":
                        return (
                            f"[步骤跳跃拦截] 已警告过但你仍然跳过了 {skipped}。\n"
                            f"请重新阅读 SKILL.md，从被跳过的步骤开始执行。"
                        )
                    return (
                        f"[Step skip blocked] You were warned but still skipped {skipped}.\n"
                        f"Re-read SKILL.md and execute the skipped stages."
                    )

        # Normal progression — reset warning state
        self._skip_warned = False
        self._pending_skip_warning = None
        self._last_declared_step = current
        return None

    def _maybe_inject_body_experience(self, tc: Any, tool_msg: Any) -> Any:
        """Append body-experience text when the agent loads a skill via skill_initial_load."""
        if self._evolution_service is None:
            return tool_msg
        if getattr(tc, "name", "") != "skill_initial_load":
            return tool_msg

        try:
            import json as _json
            args = fix_json_arguments(tc.arguments)
            skill_name = args.get("skill_name", "")
            if not skill_name:
                return tool_msg
        except Exception:
            return tool_msg
        body_text = self._evolution_service.store.format_body_experience_text(skill_name)
        if not body_text:
            return tool_msg

        original = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)
        tool_msg.content = original + body_text
        logger.info("[ReActAgent] injected body experience for skill=%s", skill_name)
        return tool_msg

    def _maybe_track_active_skill(self, tc: Any, tool_msg: Any) -> None:
        """When the agent reads a SKILL.md via skill_initial_load or loads a skill via MCP load_skill, mark that skill as active."""
        tool_name = getattr(tc, "name", "")

        # Path 1: skill_initial_load reading a SKILL.md
        if tool_name == "skill_initial_load":
            try:
                args = fix_json_arguments(tc.arguments)
                skill_name = args.get("skill_name", "")
            except Exception:
                return
            if skill_name:
                content = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)
                self._activate_skill(skill_name, content, tool_msg)
            return

        # Path 2: MCP office_claw_load_skill (returns JSON with skillMarkdown)
        if tool_name.endswith("load_skill"):
            raw = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)
            try:
                import json as _json
                # tool_msg.content is str(dict) — Python repr with single quotes.
                # Try JSON first, fall back to ast.literal_eval.
                try:
                    payload = _json.loads(raw)
                except (ValueError, TypeError):
                    import ast
                    payload = ast.literal_eval(raw)
                # The MCP callback wraps the result in {"result": "<json-string>"}
                if isinstance(payload, dict) and "result" in payload and isinstance(payload["result"], str):
                    payload = _json.loads(payload["result"])
                skill_name = payload.get("name", "")
                skill_md = payload.get("skillMarkdown", "")
                if skill_name and skill_md:
                    self._activate_skill(skill_name, skill_md, tool_msg)
            except Exception:
                return

    def _activate_skill(self, skill_name: str, skill_content: str, tool_msg: Any) -> None:
        """Common activation logic for skill tracking."""
        self._active_skill = skill_name
        self._active_skill_content = skill_content
        self._skill_tool_count = 0
        self._last_declared_step = None
        self._skip_warned = False
        self._pending_skip_warning = None
        self._skill_bash_commands = _parse_skill_bash_commands(skill_content)
        logger.info(
            "[ReActAgent] Skill compliance: now tracking '%s' (%d bash commands)",
            self._active_skill, len(self._skill_bash_commands),
        )

        # Inject directive to create step-level todos
        lang = get_config().get("preferred_language", "zh")
        original = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)
        if lang == "zh":
            directive = (
                "\n\n[技能文档已加载] 如果你要执行此技能，请先调用 todo_create 为文档中定义的每个步骤创建 todo 项。"
                "如果只是查阅信息则无需创建。\n"
                "⚠️ Skill 脚本执行原则：SKILL.md 中定义的脚本必须按原样执行，"
                "禁止自行编写代码替代其功能。脚本失败时应修复执行环境（如安装依赖）后重试原脚本。"
            )
        else:
            directive = (
                "\n\n[Skill document loaded] If you intend to execute this skill, "
                "call todo_create first with one todo item per step. "
                "If you are only reading for reference, no action needed.\n"
                "Script execution principle: Scripts defined in SKILL.md must be executed as specified. "
                "Do NOT write your own code to replace their functionality. "
                "On script failure, fix the environment (e.g., install dependencies) and retry the original script."
            )
        tool_msg.content = original + directive

    def _get_todo_summary(self) -> dict:
        """Read current todo state and return a structured summary."""
        if not self._current_session_id:
            return {"state": "no_session"}
        try:
            from jiuwenclaw.agentserver.tools.todo_toolkits import TaskStatus
            toolkit = TodoToolkit(session_id=self._current_session_id)
            tasks = toolkit._load_tasks()
        except Exception:
            return {"state": "error"}

        if not tasks:
            return {"state": "no_todos"}

        completed = [t for t in tasks if t.status == TaskStatus.COMPLETED]
        waiting = [t for t in tasks if t.status != TaskStatus.COMPLETED]
        next_task = waiting[0] if waiting else None

        return {
            "state": "all_done" if not waiting else "in_progress",
            "total": len(tasks),
            "completed_count": len(completed),
            "next_task_name": next_task.tasks if next_task else None,
        }

    def _maybe_inject_skill_compliance(self, tool_msg: Any, tool_name: str = "") -> None:
        """有活跃 skill 时，根据 todo 实际状态注入针对性提醒。"""
        if not self._active_skill:
            return
        # Skip when agent is managing todos — avoid noise
        if tool_name in _TODO_TOOL_NAMES:
            return

        self._skill_tool_count += 1
        lang = get_config().get("preferred_language", "zh")
        content = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)

        summary = self._get_todo_summary()
        state = summary.get("state", "error")

        if state == "no_todos":
            if lang == "zh":
                suffix = (
                    f"\n\n[技能 {self._active_skill}] "
                    f"尚未创建 todo 列表。请立即调用 todo_create 为 SKILL.md 中的每个步骤创建 todo 项。"
                )
            else:
                suffix = (
                    f"\n\n[Skill {self._active_skill}] "
                    f"No todo list found. Call todo_create now with one item per step in SKILL.md."
                )
        elif state == "in_progress":
            total = summary["total"]
            done = summary["completed_count"]
            next_name = summary.get("next_task_name", "?")
            if lang == "zh":
                suffix = (
                    f"\n\n[技能 {self._active_skill} · 进度: {done}/{total}]\n"
                    f"当前待办: '{next_name}'\n"
                    f"开始执行前，必须先用 todo_insert 将其拆解为原子级子任务"
                    f"——每个 todo 项应对应单一、可独立验证的操作，不可再拆才算合格。\n"
                    f"⚠️ 只执行当前 todo 项，禁止为了效率而合并或批量执行多个步骤。\n"
                    f"⚠️ SKILL.md 中定义的选项、参数、标签必须原样使用，禁止自行增删改。"
                )
            else:
                suffix = (
                    f"\n\n[Skill {self._active_skill} · Progress: {done}/{total}]\n"
                    f"Current todo: '{next_name}'\n"
                    f"Before starting, use todo_insert to break it into atomic sub-tasks"
                    f"—each todo should be a single, independently verifiable action.\n"
                    f"⚠️ Only execute the current todo item. Do NOT batch or merge multiple steps for efficiency.\n"
                    f"⚠️ Options, parameters, and labels in SKILL.md must be used verbatim."
                )
        elif state == "all_done":
            if lang == "zh":
                suffix = (
                    f"\n\n[技能 {self._active_skill}] 所有 {summary['total']} 个 todo 项已完成。"
                )
            else:
                suffix = (
                    f"\n\n[Skill {self._active_skill}] All {summary['total']} todo items completed."
                )
        else:
            suffix = ""

        # Append pending skip warning if any
        if self._pending_skip_warning:
            suffix += f"\n{self._pending_skip_warning}"
            self._pending_skip_warning = None

        tool_msg.content = content + suffix

    def _fix_tool_calls_arguments(self, tool_calls: List[Any]) -> List[Any]:
        """修复 tool_calls 中每个 tool_call 的 arguments 字段。

        当 LLM 返回的 tool_calls.function.arguments 格式不正确时（如缺少引号），
        尝试修复后再解析，确保后续流程能正常处理。

        Args:
            tool_calls: ToolCall 对象列表

        Returns:
            修复后的 ToolCall 对象列表（原对象会被修改）
        """
        if not tool_calls:
            return tool_calls

        for tc in tool_calls:
            if hasattr(tc, "arguments") and isinstance(tc.arguments, str):
                # 尝试修复 JSON
                fixed_args = fix_json_arguments(tc.arguments)
                # 如果修复成功且结果是字典，尝试将其转换回 JSON 字符串
                # 保持与原始格式一致
                if isinstance(fixed_args, dict):
                    import json as _json
                    try:
                        tc.arguments = _json.dumps(fixed_args, ensure_ascii=False)
                    except Exception:
                        # 序列化失败，保持原样
                        pass
        return tool_calls

    _FAILURE_INDICATORS_RE = re.compile(
        r'"exit_code"\s*:\s*[1-9]'
        r'|ModuleNotFoundError|No module named|ImportError'
        r'|not (?:found|installed)|library is missing'
        r'|\[ERROR\]',
        re.IGNORECASE,
    )
    _PY_SCRIPT_RE = re.compile(r'([\w][\w.-]*\.py)\b')

    def _detect_script_failure(self, tc: Any, tool_msg: Any) -> None:
        """When mcp_exec_command running a SKILL.md script fails, inject recovery guidance."""
        if not self._active_skill or not self._skill_bash_commands:
            return
        if getattr(tc, "name", "") != "mcp_exec_command":
            return

        content = tool_msg.content if isinstance(tool_msg.content, str) else str(tool_msg.content)
        if not self._FAILURE_INDICATORS_RE.search(content):
            return

        # Extract the executed command
        try:
            args = fix_json_arguments(tc.arguments)
            command: str = args.get("command", "")
        except Exception:
            return

        # Check if the command matches a SKILL.md bash command by .py filename
        matching_cmd = None
        for cmd in self._skill_bash_commands:
            cmd_scripts = self._PY_SCRIPT_RE.findall(cmd)
            if any(s in command for s in cmd_scripts):
                matching_cmd = cmd
                break

        if not matching_cmd:
            return

        lang = get_config().get("preferred_language", "zh")
        if lang == "zh":
            recovery = (
                f"\n\n[脚本执行失败 · 恢复指引]\n"
                f"SKILL.md 指定的脚本执行失败。请严格按以下步骤恢复：\n"
                f"1. 分析上方错误信息，判断失败原因（缺少依赖/路径错误/其他）\n"
                f"2. 使用 mcp_exec_command 修复问题（如 pip install 缺失的库）\n"
                f"3. 使用 mcp_exec_command 重新执行原始命令：\n"
                f"   {matching_cmd}\n"
                f"⚠️ 禁止使用 execute_python_code 自行编写代码替代该脚本。"
            )
        else:
            recovery = (
                f"\n\n[Script Failure · Recovery Guide]\n"
                f"A SKILL.md-designated script failed. Follow these steps:\n"
                f"1. Analyze the error above to determine the cause\n"
                f"2. Fix the issue via mcp_exec_command (e.g., pip install missing library)\n"
                f"3. Re-execute the original command via mcp_exec_command:\n"
                f"   {matching_cmd}\n"
                f"Do NOT use execute_python_code to rewrite the script's logic."
            )

        tool_msg.content = content + recovery
        logger.info(
            "[ReActAgent] Skill compliance: script failure detected, injected recovery for '%s'",
            matching_cmd,
        )

    async def _get_session_messages(self, session: Optional[Any]) -> List[Any]:
        """Get raw historical message list from session.

        Returns unprocessed BaseMessage objects.
        """
        if session is None:
            return []
        try:
            context = await self._init_context(session)
            context_window = await context.get_context_window(system_messages=[], tools=None)
            return list(context_window.get_messages()) if hasattr(context_window, "get_messages") else []
        except Exception as exc:
            logger.warning("Failed to get session messages: %s", exc)
            return []

    def _build_system_messages(
        self,
        session_id: str,
        *,
        system_prompt_append: Optional[str] = None,
    ) -> List[SystemMessage]:
        """Build system messages: prompt_template + workspace + memory + skill summary.

        Order:
          1. prompt_template
          2. workspace_prompt
          3. memory_prompt
          4. skill_prompt + evolution summary
        """
        # 1. base system messages
        base: List[SystemMessage] = [
            SystemMessage(role=msg["role"], content=msg["content"])
            for msg in (self._config.prompt_template or [])
            if msg.get("role") == "system"
        ]

        if not base:
            return []

        # Build append content
        content_parts: List[str] = []

        if isinstance(system_prompt_append, str):
            trimmed = system_prompt_append.strip()
            if trimmed:
                content_parts.append(trimmed)

        # 4. skill_prompt + evolution summary
        skill_msgs = self._get_skill_messages()
        if skill_msgs:
            content_parts.extend(m.content for m in skill_msgs if m.content)

        # Merge all content into the last system message
        merged_content = "\n\n".join([base[-1].content or ""] + content_parts)
        merged = SystemMessage(role=base[-1].role, content=merged_content)
        return [*base[:-1], merged] if len(base) > 1 else [merged]
