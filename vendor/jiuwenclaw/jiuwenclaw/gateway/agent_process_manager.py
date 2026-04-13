# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Per-session AgentServer process manager.

AgentProcessManager spawns a dedicated worker process (agent_worker.py)
for each session_id on a dynamically allocated port, and connects a
WebSocketAgentServerClient to it.
"""

from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import sys
from dataclasses import dataclass

from jiuwenclaw.gateway.agent_client import WebSocketAgentServerClient
from jiuwenclaw.logging.app_logger import logger


def _find_free_port() -> int:
    """Find an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class _WorkerInfo:
    process: subprocess.Popen[bytes]
    port: int
    client: WebSocketAgentServerClient
    session_id: str


class AgentProcessManager:
    """Spawn and manage per-session AgentServer worker processes."""

    def __init__(self) -> None:
        self._workers: dict[str, _WorkerInfo] = {}
        self._lock = asyncio.Lock()

    async def ensure_worker(
        self, session_id: str,
    ) -> WebSocketAgentServerClient:
        """Return a connected client for *session_id*, spawning a worker if needed."""
        async with self._lock:
            worker = self._workers.get(session_id)
            if worker is not None and worker.process.poll() is None:
                return worker.client
            if worker is not None:
                logger.warning(
                    "[ProcessManager] Worker for session %s died (exit=%s), respawning",
                    session_id,
                    worker.process.returncode,
                )
                await self._cleanup_worker_unlocked(session_id)
            return await self._spawn_worker_unlocked(session_id)

    async def _spawn_worker_unlocked(
        self, session_id: str,
    ) -> WebSocketAgentServerClient:
        port = _find_free_port()
        logger.info(
            "[ProcessManager] Spawning worker session=%s port=%s",
            session_id,
            port,
        )
        env = os.environ.copy()
        process = subprocess.Popen(
            [sys.executable, "-m", "jiuwenclaw.agent_worker", "--port", str(port)],
            env=env,
        )

        client = WebSocketAgentServerClient(
            ping_interval=20.0, ping_timeout=20.0,
        )
        uri = f"ws://127.0.0.1:{port}"
        max_wait_seconds = 180
        connected = False
        for attempt in range(max_wait_seconds):
            await asyncio.sleep(1.0)
            if process.poll() is not None:
                raise RuntimeError(
                    f"Worker for session {session_id} exited during startup "
                    f"(exit={process.returncode})"
                )
            try:
                await client.connect(uri)
                if client.server_ready:
                    connected = True
                    break
                await client.disconnect()
            except Exception:
                if attempt == max_wait_seconds - 1:
                    process.kill()
                    raise

        if not connected:
            process.kill()
            raise RuntimeError(
                f"Worker for session {session_id} not ready after {max_wait_seconds}s"
            )

        self._workers[session_id] = _WorkerInfo(
            process=process,
            port=port,
            client=client,
            session_id=session_id,
        )
        logger.info(
            "[ProcessManager] Worker ready session=%s port=%s pid=%s",
            session_id,
            port,
            process.pid,
        )
        return client

    async def _cleanup_worker_unlocked(self, session_id: str) -> None:
        worker = self._workers.pop(session_id, None)
        if worker is None:
            return
        try:
            await worker.client.disconnect()
        except Exception:
            pass
        if worker.process.poll() is None:
            worker.process.terminate()
            try:
                worker.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker.process.kill()
        logger.info("[ProcessManager] Worker cleaned up session=%s", session_id)

    async def stop_worker(self, session_id: str) -> None:
        """Stop a single session's worker."""
        async with self._lock:
            await self._cleanup_worker_unlocked(session_id)

    async def stop_all(self) -> None:
        """Terminate all worker processes."""
        async with self._lock:
            for sid in list(self._workers):
                await self._cleanup_worker_unlocked(sid)
        logger.info("[ProcessManager] All workers stopped")

    @property
    def active_sessions(self) -> list[str]:
        return list(self._workers.keys())
