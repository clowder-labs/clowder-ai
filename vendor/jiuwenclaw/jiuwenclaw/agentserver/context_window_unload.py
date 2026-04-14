# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Pre-LLM context window budget: trim oldest conversation rounds only (no tools schema changes)."""

from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import tiktoken

from jiuwenclaw.logging.app_logger import logger

from openjiuwen.core.foundation.llm import UserMessage

_TOKEN_ENCODER = None

# When MODEL_CONTEXT_WINDOW is unset or invalid, log once and use this for prompt-side budget.
_DEFAULT_MODEL_CONTEXT_WINDOW = 128_000
_missing_mcw_warned = False
_invalid_mcw_warned = False


def _encoding():
    global _TOKEN_ENCODER
    if _TOKEN_ENCODER is None:
        try:
            _TOKEN_ENCODER = tiktoken.get_encoding("cl100k_base")
        except Exception:
            _TOKEN_ENCODER = None
    return _TOKEN_ENCODER


def context_engine_compression_enabled(config_getter) -> bool:
    """True when openjiuwen MessageOffloader/DialogueCompressor path is active — mutual exclusion with unload."""
    try:
        cfg = config_getter() if callable(config_getter) else config_getter
        react = (cfg or {}).get("react") or {}
        ctx = react.get("context_engine_config") or {}
        return bool(ctx.get("enabled", False))
    except Exception:
        return False


def resolve_model_context_window() -> int:
    """Read MODEL_CONTEXT_WINDOW from env; if unset or invalid, warn once and return 128000."""
    global _missing_mcw_warned, _invalid_mcw_warned
    raw = (os.getenv("MODEL_CONTEXT_WINDOW") or "").strip()
    if not raw:
        if not _missing_mcw_warned:
            _missing_mcw_warned = True
            logger.warning(
                "[AgentServer] MODEL_CONTEXT_WINDOW is not set; using default %s "
                "for pre-LLM context budget.",
                _DEFAULT_MODEL_CONTEXT_WINDOW,
            )
        return _DEFAULT_MODEL_CONTEXT_WINDOW
    try:
        v = int(raw, 10)
        if v > 0:
            return v
    except ValueError:
        pass
    if not _invalid_mcw_warned:
        _invalid_mcw_warned = True
        logger.warning(
            "[AgentServer] MODEL_CONTEXT_WINDOW=%r is invalid; using default %s "
            "for pre-LLM context budget.",
            raw,
            _DEFAULT_MODEL_CONTEXT_WINDOW,
        )
    return _DEFAULT_MODEL_CONTEXT_WINDOW


def _message_blob(msg: Any) -> str:
    role = getattr(msg, "role", "") or ""
    parts: List[str] = [role]
    content = getattr(msg, "content", None)
    if isinstance(content, str):
        parts.append(content)
    elif content is not None:
        parts.append(str(content))
    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls:
        parts.append(json.dumps(tool_calls, ensure_ascii=False, default=str))
    tci = getattr(msg, "tool_call_id", None)
    if tci:
        parts.append(str(tci))
    return "\n".join(parts)


def estimate_messages_tokens(messages: List[Any]) -> int:
    enc = _encoding()
    text = "\n\n".join(_message_blob(m) for m in messages)
    if enc is not None:
        return len(enc.encode(text))
    return max(1, len(text) // 4)


def estimate_tools_tokens(tools: Optional[List[Any]]) -> int:
    if not tools:
        return 0
    enc = _encoding()
    blobs: List[str] = []
    for t in tools:
        if hasattr(t, "model_dump"):
            blobs.append(json.dumps(t.model_dump(), ensure_ascii=False, default=str))
        else:
            blobs.append(str(t))
    text = "\n".join(blobs)
    if enc is not None:
        return len(enc.encode(text))
    return max(1, len(text) // 4)


def _round_ranges(history: List[Any]) -> List[Tuple[int, int]]:
    """Each range is [start, end] inclusive; rounds start at each UserMessage."""
    n = len(history)
    if n == 0:
        return []
    user_idx = [i for i, m in enumerate(history) if isinstance(m, UserMessage)]
    if not user_idx:
        return [(0, n - 1)]
    ranges: List[Tuple[int, int]] = []
    for j, start in enumerate(user_idx):
        end = user_idx[j + 1] - 1 if j + 1 < len(user_idx) else n - 1
        ranges.append((start, end))
    return ranges


def _remove_oldest_rounds(history: List[Any], num_rounds: int) -> List[Any]:
    if num_rounds <= 0:
        return list(history)
    ranges = _round_ranges(history)
    if num_rounds >= len(ranges):
        num_rounds = len(ranges) - 1
    if num_rounds <= 0:
        return list(history)
    drop_ranges = ranges[:num_rounds]
    drop_idx = set()
    for a, b in drop_ranges:
        for i in range(a, b + 1):
            drop_idx.add(i)
    return [m for i, m in enumerate(history) if i not in drop_idx]


def effective_token_budget(model_window: int, max_output_tokens: int, reserve: int = 1024) -> int:
    """Prompt-side budget: context window minus reserved output and safety slack."""
    return max(0, int(model_window) - int(max_output_tokens) - int(reserve))


def build_context_window_error_payload(
    *,
    estimated_tokens: int,
    budget_tokens: int,
    model_window: int,
    model_name: str,
    remaining_rounds: int,
    tool_count: int,
    rounds_removed_total: int,
    reason: str,
) -> Dict[str, Any]:
    core = (
        "未裁剪 tools / 仅裁剪对话历史，仍超过上下文窗口。"
        f" 估 token={estimated_tokens}, 预算上限={budget_tokens}, MODEL_CONTEXT_WINDOW={model_window}, "
        f"MODEL_NAME={model_name or '(unset)'}, 剩余对话轮数={remaining_rounds}, tools 数量={tool_count}（未裁剪）, "
        f"累计已删轮数={rounds_removed_total}。根因: {reason}"
    )
    return {
        "output": core,
        "result_type": "error",
        "_context_window_exceeded": True,
    }


def shrink_messages_for_context_window(
    *,
    system_messages: List[Any],
    history_messages: List[Any],
    tools: Optional[List[Any]],
    budget_tokens: int,
    model_window: int,
    session_id: str,
    request_id: str,
    model_name: str,
) -> Tuple[List[Any], Optional[Dict[str, Any]]]:
    """
    Returns (messages_for_llm, error_dict_or_none).
    Only mutates a copy of history; system_messages unchanged.
    """
    hist = list(history_messages)
    audit_rounds_removed = 0
    while True:
        messages = [*system_messages, *hist]
        est = estimate_messages_tokens(messages) + estimate_tools_tokens(tools)
        if est <= budget_tokens:
            if audit_rounds_removed > 0:
                logger.info(
                    "[AgentServer] context_window_unload_audit session_id=%s request_id=%s "
                    "model_context_window=%s rounds_removed_total=%s est_tokens_after=%s budget=%s",
                    session_id,
                    request_id,
                    model_window,
                    audit_rounds_removed,
                    est,
                    budget_tokens,
                )
            return messages, None

        ranges = _round_ranges(hist)
        n = len(ranges)
        if n == 0:
            reason = "基线超窗：无对话轮次可删，system+tools 已超过预算。"
            logger.error(
                "[AgentServer] context_window_exceeded session_id=%s request_id=%s %s "
                "est=%s budget=%s model_context_window=%s tool_count=%s",
                session_id,
                request_id,
                reason,
                est,
                budget_tokens,
                model_window,
                len(tools or []),
            )
            return messages, build_context_window_error_payload(
                estimated_tokens=est,
                budget_tokens=budget_tokens,
                model_window=model_window,
                model_name=model_name,
                remaining_rounds=0,
                tool_count=len(tools or []),
                rounds_removed_total=audit_rounds_removed,
                reason=reason,
            )

        drop_rounds = min(max(1, math.ceil(n * 0.10)), n - 1)
        if drop_rounds <= 0:
            if n == 1:
                reason = (
                    "单轮极长：仅剩 1 轮对话且无法继续按轮删除；或未裁剪 tools 导致仍超窗。"
                    " 也可能为基线超窗（system+tools+预留已超过 MODEL_CONTEXT_WINDOW）。"
                )
            else:
                reason = "无法计算有效删轮数但仍超窗。"
            logger.error(
                "[AgentServer] context_window_exceeded session_id=%s request_id=%s %s "
                "est=%s budget=%s model_context_window=%s rounds=%s tool_count=%s rounds_removed_total=%s",
                session_id,
                request_id,
                reason,
                est,
                budget_tokens,
                model_window,
                n,
                len(tools or []),
                audit_rounds_removed,
            )
            return messages, build_context_window_error_payload(
                estimated_tokens=est,
                budget_tokens=budget_tokens,
                model_window=model_window,
                model_name=model_name,
                remaining_rounds=n,
                tool_count=len(tools or []),
                rounds_removed_total=audit_rounds_removed,
                reason=reason,
            )

        before_rounds = n
        hist = _remove_oldest_rounds(hist, drop_rounds)
        audit_rounds_removed += drop_rounds
        after_rounds = len(_round_ranges(hist))
        messages_after = [*system_messages, *hist]
        est_after = estimate_messages_tokens(messages_after) + estimate_tools_tokens(tools)
        logger.info(
            "[AgentServer] context_window_unload_audit session_id=%s request_id=%s "
            "model_context_window=%s step_removed_rounds=%s rounds_before=%s rounds_after=%s "
            "est_tokens_before=%s est_tokens_after=%s budget=%s",
            session_id,
            request_id,
            model_window,
            drop_rounds,
            before_rounds,
            after_rounds,
            est,
            est_after,
            budget_tokens,
        )
