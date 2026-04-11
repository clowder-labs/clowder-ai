#!/usr/bin/env python
# coding: utf-8
# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""CLI entrypoint for Playwright browser runtime."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import traceback
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SRC_ROOT = _HERE.parent
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))

from playwright_runtime import REPO_ROOT  # noqa: F401

# Inject browser-move client subclasses before openjiuwen's ToolMgr is used,
# so that our retry/timeout/reconnect logic is active without modifying openjiuwen.
import openjiuwen.core.runner.resources_manager.tool_manager as _tool_mgr_mod
from playwright_runtime.clients.stdio_client import BrowserMoveStdioClient
from playwright_runtime.clients.streamable_http_client import BrowserMoveStreamableHttpClient

_tool_mgr_mod.StdioClient = BrowserMoveStdioClient
_tool_mgr_mod.StreamableHttpClient = BrowserMoveStreamableHttpClient

from openjiuwen.core.runner import Runner
from playwright_runtime.config import (
    BrowserRunGuardrails,
    build_playwright_mcp_config,
    resolve_model_settings,
)
from playwright_runtime.runtime import BrowserAgentRuntime

GUARDRAIL_MAX_STEPS = 20
GUARDRAIL_MAX_FAILURES = 2
GUARDRAIL_RETRY_ONCE = True

logger = logging.getLogger(__name__)

async def main() -> None:
    provider, api_key, api_base = resolve_model_settings()
    model_name = (os.getenv("MODEL_NAME") or "anthropic/claude-sonnet-4").strip()
    if not api_key:
        raise RuntimeError("Missing API key. Set API_KEY (or OPENROUTER_API_KEY / OPENAI_API_KEY / DASHSCOPE_API_KEY).")

    guardrails = BrowserRunGuardrails(
        max_steps=GUARDRAIL_MAX_STEPS,
        max_failures=GUARDRAIL_MAX_FAILURES,
        timeout_s=int(os.getenv("BROWSER_TIMEOUT_S", "180")),
        retry_once=GUARDRAIL_RETRY_ONCE,
    )
    mcp_cfg = build_playwright_mcp_config()

    runtime = BrowserAgentRuntime(
        provider=provider,
        api_key=api_key,
        api_base=api_base,
        model_name=model_name,
        mcp_cfg=mcp_cfg,
        guardrails=guardrails,
    )

    initial_query = (os.getenv("AGENT_QUERY") or "").strip()
    session_id = (os.getenv("AGENT_SESSION_ID") or "").strip() or "demo-browser-session"

    try:
        await runtime.ensure_started()
        mcp_tools = await Runner.resource_mgr.get_mcp_tool_infos(server_id=mcp_cfg.server_id) or []

        logger.info("=" * 72)
        logger.info("Playwright Browser Runtime")
        logger.info("=" * 72)
        logger.info(f"Model provider: {provider}")
        logger.info(f"Model: {model_name}")
        logger.info(f"MCP command: {mcp_cfg.params.get('command')}")
        logger.info(f"MCP args: {mcp_cfg.params.get('args')}")
        logger.info(f"Discovered browser tools: {len(mcp_tools)}")
        for item in mcp_tools:
            logger.info(f"  - {getattr(item, 'name', 'unknown')}")
        logger.info("=" * 72)
        logger.info(f"Session: {session_id}")
        logger.info("Continuous mode: enter a task and press Enter.")
        logger.info("Type 'exit' or 'quit' to stop.\n")

        query = initial_query
        while True:
            if not query:
                query = input("query> ").strip()
            if not query:
                continue
            if query.lower() in {"exit", "quit"}:
                break

            answer = await runtime.handle_request(query=query, session_id=session_id)
            logger.info("Result:")
            logger.info(json.dumps(answer, ensure_ascii=False, indent=2))
            logger.info("")
            query = ""
    except Exception as exc:
        logger.info("Runtime error:")
        logger.info(str(exc))
        traceback.print_exc()
        raise
    except KeyboardInterrupt:
        logger.info("\nInterrupted by user.")
    finally:
        await runtime.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
