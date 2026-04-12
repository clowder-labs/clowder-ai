# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Per-session AgentServer worker process.

Spawned by AgentProcessManager, each worker hosts a dedicated JiuWenClaw
instance serving a single session on its own WebSocket port.

Usage: python -m jiuwenclaw.agent_worker --port PORT
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys


def _bootstrap() -> None:
    """Module-level initialization matching app.py top-level side effects."""
    from jiuwenclaw.utils import USER_WORKSPACE_DIR, prepare_workspace, update_config

    _config_file = USER_WORKSPACE_DIR / "config" / "config.yaml"
    if not _config_file.exists():
        prepare_workspace(overwrite=False)
    else:
        update_config()

    from openjiuwen.core.common.logging import LogManager

    for _logger in LogManager.get_all_loggers().values():
        _logger.set_level(logging.CRITICAL)

    from openjiuwen.core.foundation.llm.model_clients.openai_model_client import (
        OpenAIModelClient,
    )
    from jiuwenclaw.jiuwen_core_patch import PatchOpenAIModelClient

    OpenAIModelClient._create_async_openai_client = (
        PatchOpenAIModelClient._create_async_openai_client
    )
    OpenAIModelClient._parse_stream_chunk = PatchOpenAIModelClient._parse_stream_chunk
    OpenAIModelClient._build_request_params = (
        PatchOpenAIModelClient._build_request_params
    )

    from dotenv import load_dotenv
    from jiuwenclaw.utils import get_env_file

    load_dotenv(dotenv_path=get_env_file())


async def _run_worker(port: int) -> None:
    from jiuwenclaw.agentserver.interface import JiuWenClaw
    from jiuwenclaw.agentserver.agent_ws_server import AgentWebSocketServer
    from jiuwenclaw.utils import logger

    logger.info("[AgentWorker] Starting on port %s pid=%s", port, os.getpid())

    agent = JiuWenClaw()
    await agent.create_instance()
    logger.info("[AgentWorker] Agent instance created")

    server = AgentWebSocketServer.get_instance(
        agent=agent,
        host="127.0.0.1",
        port=port,
        ping_interval=20.0,
        ping_timeout=20.0,
    )
    await server.start()
    logger.info("[AgentWorker] Ready on port %s", port)

    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await server.stop()
        logger.info("[AgentWorker] Stopped on port %s", port)


def main() -> None:
    parser = argparse.ArgumentParser(description="Per-session AgentServer worker")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    _bootstrap()

    from jiuwenclaw.utils import logger

    logger.info("[AgentWorker] process bootstrap pid=%s", os.getpid())
    try:
        asyncio.run(_run_worker(args.port))
    except KeyboardInterrupt:
        pass
    except Exception:
        logger.critical("[AgentWorker] fatal error pid=%s", os.getpid(), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
