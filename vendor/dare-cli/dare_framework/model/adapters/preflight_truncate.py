"""Pre-flight token estimation and message truncation for adapters.

Provides a last-resort safety net: before sending a request to the model API,
estimate the total prompt size and drop oldest non-system messages if the
estimate exceeds the model's input limit.  This catches overflows that the
upstream MovingCompressor missed (e.g. tools + system prompt alone near the
limit, leaving almost no room for messages).
"""

from __future__ import annotations

import json
import logging
from typing import Any


def _estimate_payload_tokens(text: str) -> int:
    """CJK-aware rough token estimate for a serialized string.

    CJK chars: ~1.5 tokens each; non-CJK chars: ~0.25 tokens each (4 chars/token).
    """
    cjk = 0
    for ch in text:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or 0xF900 <= cp <= 0xFAFF:
            cjk += 1
    non_cjk = len(text) - cjk
    return int(cjk * 1.5) + max(1, non_cjk // 4)


def preflight_truncate(
    api_params: dict[str, Any],
    max_tokens: int,
    logger: logging.Logger,
) -> list[dict[str, Any]]:
    """Estimate total prompt tokens; drop oldest non-system messages if over budget.

    Returns the (possibly truncated) messages list.
    """
    tools_json = json.dumps(api_params.get("tools", []), ensure_ascii=False)
    tools_tokens = _estimate_payload_tokens(tools_json)
    messages: list[dict[str, Any]] = list(api_params.get("messages", []))
    msg_tokens = _estimate_payload_tokens(json.dumps(messages, ensure_ascii=False))
    total = tools_tokens + msg_tokens

    if total <= max_tokens:
        return messages

    logger.warning(
        "Pre-flight token estimate %d exceeds limit %d "
        "(tools=%d, messages=%d). Truncating oldest messages.",
        total, max_tokens, tools_tokens, msg_tokens,
    )

    system_msgs = [m for m in messages if m.get("role") == "system"]
    non_system = [m for m in messages if m.get("role") != "system"]
    budget_for_msgs = max_tokens - tools_tokens - _estimate_payload_tokens(
        json.dumps(system_msgs, ensure_ascii=False)
    )

    while non_system and _estimate_payload_tokens(
        json.dumps(non_system, ensure_ascii=False)
    ) > budget_for_msgs:
        non_system.pop(0)

    result = system_msgs + non_system
    final_tokens = tools_tokens + _estimate_payload_tokens(
        json.dumps(result, ensure_ascii=False)
    )
    logger.info(
        "Post-truncation: %d tokens (%d messages kept)", final_tokens, len(result),
    )
    return result
