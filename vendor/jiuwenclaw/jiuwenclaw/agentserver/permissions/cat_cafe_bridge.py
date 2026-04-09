"""Cat-Cafe Approval Center Bridge (审批中心桥接)

将 jiuwenclaw 本地权限系统接入 Cat-Cafe 中心审批。
当中心 API 不可用时回退到本地审批弹窗。
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Environment variables set by Cat-Cafe when spawning agent
_ENV_API_URL = "CAT_CAFE_API_URL"
_ENV_INVOCATION_ID = "CAT_CAFE_INVOCATION_ID"
_ENV_CALLBACK_TOKEN = "CAT_CAFE_CALLBACK_TOKEN"


def get_callback_config() -> Optional[dict]:
    """Get Cat-Cafe callback configuration from environment."""
    api_url = os.environ.get(_ENV_API_URL)
    invocation_id = os.environ.get(_ENV_INVOCATION_ID)
    callback_token = os.environ.get(_ENV_CALLBACK_TOKEN)
    if not all([api_url, invocation_id, callback_token]):
        return None
    return {
        "api_url": api_url,
        "invocation_id": invocation_id,
        "callback_token": callback_token,
    }


def _get_api_url() -> str:
    """Get API URL from env or default."""
    return os.environ.get(_ENV_API_URL) or os.environ.get(
        "CAT_CAFE_API_URL_BASE", "http://localhost:3004"
    )


async def request_central_approval(
    tool_name: str,
    tool_args: dict,
    reason: str,
    risk_assessment: Optional[dict] = None,
    context: Optional[str] = None,
    *,
    invocation_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    user_id: Optional[str] = None,
    cat_id: Optional[str] = None,
) -> Optional[dict]:
    """Request approval from central Cat-Cafe Approval Center.

    Two modes:
    1. Callback mode (env vars set) — uses invocationId + callbackToken
    2. Direct mode (sidecar) — uses X-Cat-Cafe-User header + test-request endpoint

    Returns:
        None if central API not available
        {"status": "granted"} if pre-approved
        {"status": "denied", "reason": "..."} if denied
        {"status": "suspended", "approvalRequestId": "...",
         "expectedWaitMs": N} if pending
    """
    config = get_callback_config()

    # Mode 1: Callback credentials available — use callback endpoint
    if config:
        try:
            import aiohttp

            payload: dict[str, Any] = {
                "invocationId": config["invocation_id"],
                "callbackToken": config["callback_token"],
                "toolName": tool_name,
                "toolArgs": tool_args,
                "reason": reason,
            }
            if risk_assessment:
                payload["riskAssessment"] = risk_assessment
            if context:
                payload["context"] = context

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{config['api_url']}/api/callbacks/request-tool-execution",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    logger.warning(
                        "Central approval callback failed: %d", resp.status,
                    )
        except Exception:
            logger.debug(
                "Central approval callback unavailable",
                exc_info=True,
            )

    # Mode 2: Sidecar mode — use direct API with user header
    api_url = _get_api_url()
    uid = user_id or os.environ.get("CAT_CAFE_USER_ID", "default-user")
    cid = cat_id or os.environ.get("CAT_CAFE_CAT_ID", "assistant")
    tid = thread_id or os.environ.get("CAT_CAFE_THREAD_ID", "")
    iid = invocation_id or os.environ.get(_ENV_INVOCATION_ID, f"sidecar-{os.getpid()}")

    try:
        import aiohttp

        payload = {
            "invocationId": iid,
            "catId": cid,
            "threadId": tid,
            "toolName": tool_name,
            "toolArgs": tool_args,
            "reason": reason,
        }
        if risk_assessment:
            payload["riskAssessment"] = risk_assessment
        if context:
            payload["context"] = context

        headers = {
            "Content-Type": "application/json",
            "X-Cat-Cafe-User": uid,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{api_url}/api/approval/test-request",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                logger.warning(
                    "Central approval direct request failed: %d", resp.status,
                )
                return None
    except Exception:
        logger.debug(
            "Central approval unavailable, falling back to local",
            exc_info=True,
        )
        return None


async def poll_approval_status(
    approval_request_id: str,
    timeout_seconds: int = 300,
    poll_interval: float = 2.0,
) -> str:
    """Poll central API for approval status.

    Returns: "allow_once" | "allow_always" | "deny"
    """
    config = get_callback_config()
    if not config:
        return "deny"

    import aiohttp

    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout_seconds

    while loop.time() < deadline:
        try:
            async with aiohttp.ClientSession() as session:
                params = {
                    "invocationId": config["invocation_id"],
                    "callbackToken": config["callback_token"],
                    "requestId": approval_request_id,
                }
                async with session.get(
                    f"{config['api_url']}/api/callbacks/check-execution-status",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("status") == "approved":
                            return "allow_once"
                        elif data.get("status") == "denied":
                            return "deny"
                        # Still pending — keep polling
        except Exception:
            logger.debug("Poll failed, retrying", exc_info=True)

        await asyncio.sleep(poll_interval)

    # Timeout
    return "deny"


async def sync_central_policies() -> Optional[list]:
    """Fetch tool policies from central API for local PermissionEngine bootstrap.

    Returns list of policy dicts or None if unavailable.
    """
    config = get_callback_config()
    if not config:
        return None

    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{config['api_url']}/api/approval/policies",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("policies", [])
    except Exception:
        logger.debug("Policy sync failed", exc_info=True)
    return None
