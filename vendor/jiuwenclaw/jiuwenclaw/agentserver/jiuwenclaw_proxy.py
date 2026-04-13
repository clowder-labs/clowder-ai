# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""JiuWenClawProxy — drop-in replacement for JiuWenClaw that delegates
each session to a dedicated worker process for complete isolation.

AgentWebSocketServer calls the same methods (process_message,
process_message_stream, etc.) regardless of whether the backend is
JiuWenClaw or JiuWenClawProxy; the proxy transparently routes by
session_id.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

import asyncio

from jiuwenclaw.agentserver.runtime_config_yaml import (
    ConfigYamlLockTimeoutError,
    apply_config_yaml_patch,
    build_config_subtrees_payload,
    normalize_and_validate_config_paths,
)
from jiuwenclaw.gateway.agent_process_manager import AgentProcessManager
from jiuwenclaw.schema.agent import AgentRequest, AgentResponse, AgentResponseChunk
from jiuwenclaw.config import get_config
from jiuwenclaw.logging.app_logger import logger

_HEARTBEAT_CHANNEL_ID = "__heartbeat__"


class JiuWenClawProxy:
    """Routes AgentRequests to per-session worker processes.

    Implements the same duck-typed interface that AgentWebSocketServer
    expects from its ``agent`` argument, so ``app.py`` only needs to
    swap ``JiuWenClaw()`` → ``JiuWenClawProxy()``.
    """

    def __init__(self) -> None:
        self._manager = AgentProcessManager()

    async def create_instance(self, config: dict[str, Any] | None = None) -> None:
        logger.info("[JiuWenClawProxy] create_instance — workers init on demand")

    def reload_agent_config(self) -> None:
        raise RuntimeError(
            "reload_agent_config not supported in per-session process mode"
        )

    # ------ request routing ------

    def _worker_key(self, request: AgentRequest) -> str:
        if request.channel_id == _HEARTBEAT_CHANNEL_ID:
            return "__heartbeat__"
        return request.session_id or "default"

    async def process_message(self, request: AgentRequest) -> AgentResponse:
        client = await self._manager.ensure_worker(self._worker_key(request))
        return await client.send_request(request)

    async def process_message_stream(
        self, request: AgentRequest,
    ) -> AsyncIterator[AgentResponseChunk]:
        client = await self._manager.ensure_worker(self._worker_key(request))
        async for chunk in client.send_request_stream(request):
            yield chunk

    # ------ config (file-only, no worker needed) ------

    async def apply_runtime_config_yaml(
        self, request: AgentRequest,
    ) -> AgentResponse:
        params = request.params if isinstance(request.params, dict) else {}
        patch = params.get("config_yaml")
        if not isinstance(patch, dict):
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=False,
                payload={"error": "params.config_yaml must be an object"},
                metadata=request.metadata,
            )
        if not patch:
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=True,
                payload={"updated_top_level_keys": [], "reloaded": False},
                metadata=request.metadata,
            )
        try:
            meta = await asyncio.to_thread(apply_config_yaml_patch, patch)
        except ConfigYamlLockTimeoutError as exc:
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=False,
                payload={"error": str(exc), "yaml_written": False},
                metadata=request.metadata,
            )
        except OSError as exc:
            logger.exception("[JiuWenClawProxy] config_yaml set failed: %s", exc)
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=False,
                payload={"error": str(exc), "yaml_written": False},
                metadata=request.metadata,
            )
        payload: dict = {
            "updated_top_level_keys": meta.get("updated_top_level_keys", []),
            "reloaded": False,
            "yaml_written": True,
        }
        if meta.get("dropped_paths"):
            payload["dropped_paths"] = meta["dropped_paths"]
        return AgentResponse(
            request_id=request.request_id,
            channel_id=request.channel_id,
            ok=True,
            payload=payload,
            metadata=request.metadata,
        )

    async def get_runtime_config_subtrees(
        self, request: AgentRequest,
    ) -> AgentResponse:
        params = request.params if isinstance(request.params, dict) else {}
        raw_paths = params.get("config_paths")
        norm_paths, err_msg = normalize_and_validate_config_paths(raw_paths)
        if err_msg or norm_paths is None:
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=False,
                payload={
                    "error": err_msg or "params.config_paths must be a non-empty array",
                },
                metadata=request.metadata,
            )
        root = get_config()
        trees, missing = build_config_subtrees_payload(root, norm_paths)
        if missing:
            return AgentResponse(
                request_id=request.request_id,
                channel_id=request.channel_id,
                ok=False,
                payload={
                    "error": "one or more config paths do not exist",
                    "missing_paths": missing,
                },
                metadata=request.metadata,
            )
        return AgentResponse(
            request_id=request.request_id,
            channel_id=request.channel_id,
            ok=True,
            payload={"trees": trees},
            metadata=request.metadata,
        )

    # ------ lifecycle ------

    async def stop_all_workers(self) -> None:
        await self._manager.stop_all()

    async def stop_session_worker(self, session_id: str) -> None:
        await self._manager.stop_worker(session_id)
