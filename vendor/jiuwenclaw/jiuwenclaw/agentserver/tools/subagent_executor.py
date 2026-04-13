# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Subagent executor - Creates sub-agents with full ReActAgent capabilities."""

from __future__ import annotations

import asyncio
import uuid
from contextvars import ContextVar
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional, Union

from openjiuwen.core.session.agent import Session
from openjiuwen.core.session.stream.base import OutputSchema
from openjiuwen.core.single_agent import AgentCard, ReActAgentConfig

from jiuwenclaw.agentserver.tools.subagent_models import (
    SubagentConfig,
    SubagentResult,
    SubagentRoleDefinition,
    SubagentTaskSpec,
)
from jiuwenclaw.utils import get_agent_root_dir, logger

if TYPE_CHECKING:
    from jiuwenclaw.agentserver.react_agent import JiuClawReActAgent


# Context variable to pass parent session from tool execution to executor
_subagent_parent_session: ContextVar[Optional[Session]] = ContextVar("subagent_parent_session", default=None)


def set_subagent_parent_session(session: Optional[Session]) -> None:
    """Set the parent session context for subagent execution."""
    _subagent_parent_session.set(session)


def get_subagent_parent_session() -> Optional[Session]:
    """Get the parent session from context."""
    return _subagent_parent_session.get()


class SubagentSessionProxy:
    """
    Session proxy that forwards execution events to parent session.

    Forward tool calls and thinking process, suppress user-facing messages.
    Subagent's tool execution is shown alongside main Agent's spawn_subagent call info.
    """

    # Event types to forward (tool execution + thinking process)
    FORWARD_TYPES = {"tool_call", "tool_result", "thinking", "llm_reasoning"}
    # Event types to suppress (user-facing messages only)
    SUPPRESS_TYPES = {"answer", "complete", "start"}

    def __init__(
        self,
        parent_session: Session,
        subagent_id: str,
        role_id: str,
    ) -> None:
        self._parent = parent_session
        self._subagent_id = subagent_id
        self._role_id = role_id
        self._session_id = f"{parent_session.get_session_id()}_{subagent_id}"

    async def write_stream(self, data: Union[dict, OutputSchema]) -> None:
        """Forward tool execution events, suppress user-facing messages."""
        event_type = None
        output_data = None

        if isinstance(data, OutputSchema):
            event_type = data.type
            output_data = data
        elif isinstance(data, dict):
            event_type = data.get("type", "unknown")
            output_data = OutputSchema(
                type=event_type,
                index=data.get("index", 0),
                payload=data.get("payload", {}),
            )

        # Only forward tool execution events
        if event_type in self.FORWARD_TYPES:
            await self._parent.write_stream(output_data)
        elif event_type in self.SUPPRESS_TYPES:
            logger.debug(f"[SubagentSession] Suppressed event: {event_type}")
        else:
            # Unknown event type - forward by default for debugging
            logger.debug(f"[SubagentSession] Forwarding unknown event: {event_type}")
            await self._parent.write_stream(output_data)

    def get_session_id(self) -> str:
        """Return composite session ID."""
        return self._session_id

    def get_env(self, key: str, default: Any = None) -> Any:
        """Proxy to parent session."""
        return self._parent.get_env(key, default)

    def get_envs(self) -> dict:
        """Proxy to parent session."""
        return self._parent.get_envs()

    def update_state(self, data: dict) -> None:
        """Proxy to parent session."""
        return self._parent.update_state(data)

    def get_state(self, key: Union[str, list, dict] = None) -> Any:
        """Proxy to parent session."""
        return self._parent.get_state(key)

    async def write_custom_stream(self, data: dict) -> None:
        """Forward custom stream (typically not user-facing, pass through)."""
        await self._parent.write_custom_stream(data)

    def __getattr__(self, name: str) -> Any:
        """Fallback: proxy any other attributes to parent session."""
        return getattr(self._parent, name)


class SubagentExecutor:
    """
    Enhanced subagent executor - Creates sub-agents with full ReActAgent capabilities.

    Supported features:
    - Read role definitions and system_prompt from Skill frontmatter
    - Create independent ReActAgent instances
    - Load specified sub-skills from SKILL.md
    - Configure tool sets (inherit from parent or restrict subset)
    - Multi-round reasoning until task completion
    - Dynamic role prompt generation for undefined roles
    """

    def __init__(
        self,
        parent_agent: JiuClawReActAgent,
        skill_base_dir: Path,
        default_role_prompts: dict[str, str] | None = None,
    ) -> None:
        """
        Initialize the subagent executor.

        Args:
            parent_agent: Parent agent instance (for inheriting config)
            skill_base_dir: Root path of skills directory
            default_role_prompts: Default role prompts (used when Skill doesn't define)
        """
        self._parent_agent = parent_agent
        self._skill_base_dir = skill_base_dir
        self._default_role_prompts = default_role_prompts or {}
        self._skill_configs: dict[str, SubagentConfig] = {}

    def register_skill_config(self, skill_name: str, config: SubagentConfig) -> None:
        """Register a Skill's subagent configuration."""
        self._skill_configs[skill_name] = config

    def get_role_definition(
        self,
        role_id: str,
        skill_name: str | None = None,
    ) -> SubagentRoleDefinition | None:
        """
        Get role definition.

        Lookup order:
        1. Specified Skill's roles definition
        2. Default role prompts
        3. Return None (triggers dynamic role generation)
        """
        # 1. Look in specified Skill's config
        if skill_name and skill_name in self._skill_configs:
            skill_config = self._skill_configs[skill_name]
            if role_id in skill_config.roles:
                return skill_config.roles[role_id]

        # 2. Look in all registered Skill configs
        for config in self._skill_configs.values():
            if role_id in config.roles:
                return config.roles[role_id]

        # 3. Look in default role prompts
        if role_id in self._default_role_prompts:
            return SubagentRoleDefinition(
                name=role_id,
                system_prompt=self._default_role_prompts[role_id],
            )

        # 4. Return None to trigger dynamic role generation
        return None

    def _generate_dynamic_role_prompt(self, role_id: str) -> str:
        """
        Generate dynamic role prompt based on role name.

        Triggered when: User specifies a role that's not predefined in
        Skill frontmatter or default roles.
        Examples: "Java架构师", "数据分析师", etc.

        Args:
            role_id: User-specified role name

        Returns:
            Generated role prompt
        """
        return f"""You are a {role_id}.

Act with expertise and professionalism in this domain. Your responsibilities include:
- Applying domain-specific knowledge and best practices
- Providing structured, well-reasoned analysis and recommendations
- Executing tasks with the precision expected of an expert in this field

Approach each task methodically and deliver high-quality results."""

    async def execute(
        self,
        task: SubagentTaskSpec,
        skill_name: str | None = None,
        parent_session: Session | None = None,
    ) -> SubagentResult:
        """
        Execute a single subagent task (blocking, waits for result).

        Creates an independent sub-ReActAgent instance, loads skill, executes multi-round reasoning.

        Args:
            task: Task specification
            skill_name: Optional skill name for role lookup
            parent_session: Optional parent session for streaming events (obtained from context if not provided)
        """
        # Get parent session from context if not provided
        if parent_session is None:
            parent_session = get_subagent_parent_session()

        try:
            # 1. Get role definition
            role_def = self.get_role_definition(task.role_id, skill_name)

            # 2. Determine system_prompt (priority: call param > role def > dynamic generation)
            if task.system_prompt:
                # Highest priority: explicitly specified by caller
                system_prompt = task.system_prompt
            elif role_def and role_def.system_prompt:
                # Second priority: role definition (Skill frontmatter or default)
                system_prompt = role_def.system_prompt
            else:
                # Lowest priority: dynamic role prompt generation
                system_prompt = self._generate_dynamic_role_prompt(task.role_id)
                logger.info(f"[Subagent] Generated dynamic role prompt for: {task.role_id}")

            # 3. Determine skill_path
            skill_path = task.skill_path
            if skill_path is None and role_def and role_def.skill_path:
                skill_path = role_def.skill_path

            # 4. Create subagent instance
            subagent = self._create_subagent(task, system_prompt)

            # 5. Load sub-skill (if specified)
            if skill_path:
                skill_full_path = self._skill_base_dir / skill_path
                if skill_full_path.exists():
                    await subagent.register_skill(str(skill_full_path))
                else:
                    logger.warning(f"[Subagent] Skill path not found: {skill_full_path}")

            # 6. Set workspace (inherit from parent agent if not specified)
            # Priority: task param > parent agent's workspace > default agent root
            workspace_dir = task.workspace_dir
            if workspace_dir is None:
                parent_workspace = getattr(self._parent_agent, '_workspace_dir', None)
                if parent_workspace:
                    workspace_dir = str(parent_workspace)
                    logger.debug(f"[Subagent] Inherited workspace from parent: {workspace_dir}")
            if workspace_dir is None:
                workspace_dir = str(get_agent_root_dir())
            subagent.set_workspace(workspace_dir, task.role_id)

            # 7. Build full prompt
            full_prompt = task.objective
            if task.prompt:
                full_prompt = f"{task.objective}\n\n{task.prompt}"

            # 8. Create session proxy for streaming tool events (if parent session available)
            session_proxy: SubagentSessionProxy | None = None
            if parent_session is not None:
                session_proxy = SubagentSessionProxy(
                    parent_session=parent_session,
                    subagent_id=task.task_id,
                    role_id=task.role_id,
                )
            logger.info(f"[Subagent] Starting execution, task_id={task.task_id}, role_id={task.role_id}")

            # 9. Execute task (multi-round reasoning)
            session_id = task.session_id or f"subagent_{task.task_id}"
            invoke_inputs = {"query": full_prompt, "conversation_id": session_id}

            # Pass session proxy to subagent.invoke() for streaming tool events
            response = await subagent.invoke(
                inputs=invoke_inputs,
                session=session_proxy,  # Pass proxy session for streaming tool events
            )

            logger.info(f"[Subagent] Execution completed, task_id={task.task_id}")

            # 11. Extract result and usage
            result_text = ""
            subagent_usage = None
            if isinstance(response, dict):
                result_text = response.get("output", "")
                if isinstance(result_text, dict):
                    result_text = result_text.get("output", str(result_text))
                subagent_usage = response.get("usage")
            elif hasattr(response, "content"):
                result_text = response.content
            elif hasattr(response, "text"):
                result_text = response.text
            else:
                result_text = str(response)

            if subagent_usage:
                logger.info(f"[Subagent] task_id={task.task_id} usage: {subagent_usage}")

            return SubagentResult(
                success=True,
                task_id=task.task_id,
                role_id=task.role_id,
                result=result_text,
                usage=subagent_usage,
            )

        except asyncio.TimeoutError:
            logger.warning(f"[Subagent] Timeout after {task.timeout_seconds} seconds, task_id={task.task_id}")
            return SubagentResult(
                success=False,
                task_id=task.task_id,
                role_id=task.role_id,
                error=f"Timeout after {task.timeout_seconds} seconds",
            )
        except Exception as e:
            logger.exception(f"[Subagent] Execution failed: {e}")
            return SubagentResult(
                success=False,
                task_id=task.task_id,
                role_id=task.role_id,
                error=str(e),
            )

    def _create_subagent(
        self,
        task: SubagentTaskSpec,
        system_prompt: str,
    ) -> "JiuClawReActAgent":
        """Create subagent instance with inherited tools."""
        from openjiuwen.core.runner import Runner
        from openjiuwen.core.sys_operation import (
            LocalWorkConfig,
            OperationMode,
            SysOperationCard,
        )
        from jiuwenclaw.agentserver.react_agent import JiuClawReActAgent

        card = AgentCard(
            name=f"subagent_{task.role_id}",
            id=task.task_id,
        )

        subagent = JiuClawReActAgent(card=card)

        # Build config with custom system prompt
        config = self._build_subagent_config(task, system_prompt)

        if not config.sys_operation_id:
            try:
                # Inherit workspace from parent agent if not specified
                workspace_dir = task.workspace_dir
                if workspace_dir is None:
                    parent_workspace = getattr(self._parent_agent, '_workspace_dir', None)
                    if parent_workspace:
                        workspace_dir = str(parent_workspace)
                if workspace_dir is None:
                    workspace_dir = str(get_agent_root_dir())
                sysop_card = SysOperationCard(
                    mode=OperationMode.LOCAL,
                    work_config=LocalWorkConfig(work_dir=workspace_dir),
                )
                Runner.resource_mgr.add_sys_operation(sysop_card)
                config.sys_operation_id = sysop_card.id
            except Exception as exc:
                logger.warning("[Subagent] Failed to create SysOperation for subagent: %s", exc)

        subagent.configure(config)

        # Inherit tools from parent agent
        self._inherit_tools(subagent)

        return subagent

    def _inherit_tools(self, subagent: "JiuClawReActAgent") -> None:
        """Inherit all tools from parent agent's ability_manager, excluding subagent and todo tools."""
        # Tools that should NOT be inherited
        # - spawn_subagent: prevent recursive subagent spawning
        # - todo_*: todo list is parent agent's task tracking, not for subagents
        EXCLUDED_TOOLS = {
            "spawn_subagent",
            "todo_create",
            "todo_complete",
            "todo_insert",
            "todo_remove",
            "todo_list",
        }

        try:
            # Get parent's tools
            parent_tools = self._parent_agent.ability_manager.list()
            if not parent_tools:
                logger.debug("[Subagent] Parent agent has no tools to inherit")
                return

            # Add all tools to subagent's ability_manager, excluding subagent tools
            inherited_count = 0
            for tool in parent_tools:
                try:
                    # Get tool name
                    tool_name = getattr(tool, 'name', None)
                    if hasattr(tool, 'card') and hasattr(tool.card, 'name'):
                        tool_name = tool.card.name

                    # Skip excluded tools to prevent recursive subagent spawning
                    if tool_name in EXCLUDED_TOOLS:
                        logger.debug(f"[Subagent] Skipping excluded tool: {tool_name}")
                        continue

                    if hasattr(tool, 'card'):
                        subagent.ability_manager.add(tool.card)
                    else:
                        subagent.ability_manager.add(tool)
                    inherited_count += 1
                except Exception as e:
                    logger.debug(f"[Subagent] Failed to inherit tool {getattr(tool, 'name', 'unknown')}: {e}")

            logger.info(f"[Subagent] Inherited {inherited_count} tools from parent agent (excluded {len(EXCLUDED_TOOLS)} subagent tools)")
        except Exception as e:
            logger.warning(f"[Subagent] Failed to inherit tools: {e}")

    def _build_subagent_config(
        self,
        task: SubagentTaskSpec,
        system_prompt: str,
    ) -> ReActAgentConfig:
        """
        Build subagent configuration by inheriting from parent agent.

        Copies parent's ReActAgentConfig model settings, excludes context processors,
        and sets custom prompt_template.
        """
        # Get parent agent's config
        parent_config = self._parent_agent._config
        if parent_config is None:
            # Fallback: create default config if parent has no config
            logger.warning("[Subagent] Parent agent has no _config, using defaults")
            return ReActAgentConfig(
                prompt_template=[{"role": "system", "content": system_prompt}],
                max_iterations=10,
            )

        # Build new config inheriting from parent, excluding problematic fields
        new_config = ReActAgentConfig(
            # Model settings
            model_name=parent_config.model_name,
            model_provider=parent_config.model_provider,
            api_key=parent_config.api_key,
            api_base=parent_config.api_base,
            model_client_config=parent_config.model_client_config,
            model_config_obj=parent_config.model_config_obj,
            # Runtime settings
            max_iterations=parent_config.max_iterations,
            mem_scope_id=parent_config.mem_scope_id,
            sys_operation_id=parent_config.sys_operation_id,
            # Context engine (reuse parent's config)
            context_engine_config=parent_config.context_engine_config,
            # Subagent's own prompt
            prompt_template=[{"role": "system", "content": system_prompt}],
            # Exclude context processors - subagents don't need offloading/compression
            context_processors=[],
        )

        return new_config

    async def execute_parallel(
        self,
        tasks: list[SubagentTaskSpec],
        max_concurrent: int = 3,
        skill_name: str | None = None,
        parent_session: Session | None = None,
    ) -> list[SubagentResult]:
        """Execute multiple subagent tasks in parallel.

        Args:
            tasks: List of task specifications
            max_concurrent: Maximum concurrent subagents
            skill_name: Optional skill name for role lookup
            parent_session: Optional parent session for streaming (obtained from context if not provided)
        """
        # Get parent session from context if not provided
        if parent_session is None:
            parent_session = get_subagent_parent_session()

        semaphore = asyncio.Semaphore(max_concurrent)

        async def _run_with_limit(task: SubagentTaskSpec) -> SubagentResult:
            async with semaphore:
                return await self.execute(task, skill_name, parent_session)

        results = await asyncio.gather(*[
            _run_with_limit(task) for task in tasks
        ])
        return list(results)