"""Cat-Cafe Approval Center Hook for Dare Framework.

Agent-side BEFORE_TOOL hook that delegates tool-execution approval decisions
to the Cat-Cafe central ApprovalManager.  When the central API is unreachable
or returns an unexpected status the hook degrades to ALLOW (fail-open) so that
the local security policy (GovernedToolGateway / SecurityBoundary) remains the
authoritative fallback.

Registration
------------
Add this hook to the DareAgentBuilder when constructing the agent:

    from dare_framework.hook.cat_cafe_approval_hook import CatCafeApprovalHook

    builder.add_hooks(CatCafeApprovalHook())

The hook activates only when *all three* environment variables are set:

  - CAT_CAFE_API_URL          (e.g. http://127.0.0.1:3004)
  - CAT_CAFE_INVOCATION_ID
  - CAT_CAFE_CALLBACK_TOKEN

If any variable is missing the hook returns ALLOW immediately.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Literal, Optional

from dare_framework.hook.kernel import IHook
from dare_framework.hook.types import HookDecision, HookPhase, HookResult
from dare_framework.infra.component import ComponentType

logger = logging.getLogger("dare.hook.cat_cafe_approval")

_ENV_API_URL = "CAT_CAFE_API_URL"
_ENV_INVOCATION_ID = "CAT_CAFE_INVOCATION_ID"
_ENV_CALLBACK_TOKEN = "CAT_CAFE_CALLBACK_TOKEN"

_ALLOW = HookResult(decision=HookDecision.ALLOW)


def get_callback_config() -> Optional[dict[str, str]]:
    """Read Cat-Cafe callback env vars.  Returns *None* when incomplete."""
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


class CatCafeApprovalHook(IHook):
    """Dare BEFORE_TOOL hook bridging to Cat-Cafe central ApprovalManager.

    Lifecycle:
      1. On BEFORE_TOOL the hook calls the central
         ``/api/callbacks/request-tool-execution`` endpoint.
      2. Central returns one of ``granted | denied | suspended``.
      3. The hook maps that to ``ALLOW | BLOCK | ASK`` and, for the
         *suspended* case, annotates the hook payload so that
         ``GovernedToolGateway`` can pick up the approval-request id.

    Any network / parsing error degrades to ALLOW (fail-open).
    """

    # ------------------------------------------------------------------
    # IComponent contract
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "cat_cafe_approval"

    @property
    def component_type(self) -> Literal[ComponentType.HOOK]:
        return ComponentType.HOOK

    # ------------------------------------------------------------------
    # IHook.invoke
    # ------------------------------------------------------------------

    async def invoke(
        self,
        phase: HookPhase,
        *args: Any,
        **kwargs: Any,
    ) -> HookResult:
        """Intercept BEFORE_TOOL; passthrough for all other phases."""
        if phase is not HookPhase.BEFORE_TOOL:
            return _ALLOW

        payload: dict[str, Any] = kwargs.get("payload", {})
        config = get_callback_config()
        if config is None:
            return _ALLOW

        tool_name = payload.get("tool_name", "")
        tool_args = payload.get("arguments", {})

        try:
            data = await self._request_approval(
                config, tool_name, tool_args,
            )
        except Exception:
            logger.debug(
                "Central approval request failed, allowing (fail-open)",
                exc_info=True,
            )
            return _ALLOW

        status = data.get("status", "")

        if status == "granted":
            return _ALLOW

        if status == "denied":
            reason = data.get("reason", "Denied by central approval policy")
            return HookResult(decision=HookDecision.BLOCK, message=reason)

        if status == "suspended":
            # Annotate the mutable payload dict so that downstream
            # GovernedToolGateway / ApprovalInvokeContext can access
            # the central approval-request id.
            payload["requires_approval"] = True
            payload["approval_request_id"] = data.get(
                "approvalRequestId", "",
            )
            payload["central_approval_suspended"] = True
            return HookResult(decision=HookDecision.ASK)

        # Unknown status -- fail-open.
        logger.warning(
            "Unexpected central approval status %r, allowing", status,
        )
        return _ALLOW

    # ------------------------------------------------------------------
    # HTTP helper
    # ------------------------------------------------------------------

    @staticmethod
    async def _request_approval(
        config: dict[str, str],
        tool_name: str,
        tool_args: Any,
    ) -> dict[str, Any]:
        """POST to central approval endpoint and return parsed JSON."""
        import httpx

        request_body = {
            "invocationId": config["invocation_id"],
            "callbackToken": config["callback_token"],
            "toolName": tool_name,
            "toolArgs": tool_args if isinstance(tool_args, dict) else {},
            "reason": f"Dare agent requests {tool_name}",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{config['api_url']}/api/callbacks/request-tool-execution",
                json=request_body,
                timeout=5.0,
            )

        if resp.status_code != 200:
            logger.warning(
                "Central approval check returned HTTP %d", resp.status_code,
            )
            return {}  # caller treats empty dict as unknown -> ALLOW

        return resp.json()  # type: ignore[no-any-return]


__all__ = ["CatCafeApprovalHook", "get_callback_config"]
