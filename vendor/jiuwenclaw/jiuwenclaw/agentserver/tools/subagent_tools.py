# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Subagent tools - spawn_subagent and spawn_parallel_subagents."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from openjiuwen.core.foundation.tool.tool import tool
from openjiuwen.core.session.agent import Session

from jiuwenclaw.agentserver.tools.subagent_executor import (
    SubagentExecutor,
    get_subagent_parent_session,
)
from jiuwenclaw.agentserver.tools.subagent_models import (
    SubagentConfig,
    SubagentTaskSpec,
)
from jiuwenclaw.utils import logger

_executor: SubagentExecutor | None = None


def init_subagent_tools(
    parent_agent: Any,
    skill_base_dir: Path,
    default_role_prompts: dict[str, str] | None = None,
) -> None:
    """
    Initialize the subagent executor.

    Args:
        parent_agent: Parent agent instance (JiuClawReActAgent)
        skill_base_dir: Root path of skills directory
        default_role_prompts: Default role prompts when Skill doesn't define
    """
    global _executor
    _executor = SubagentExecutor(
        parent_agent=parent_agent,
        skill_base_dir=skill_base_dir,
        default_role_prompts=default_role_prompts,
    )
    logger.info("[Subagent] Executor initialized")


def register_skill_subagent_config(skill_name: str, config: SubagentConfig) -> None:
    """
    Register a Skill's subagent configuration.

    Args:
        skill_name: Name of the skill
        config: SubagentConfig from Skill frontmatter
    """
    if _executor is None:
        logger.warning("[Subagent] Executor not initialized, cannot register skill config")
        return
    _executor.register_skill_config(skill_name, config)
    logger.info(f"[Subagent] Registered skill config for: {skill_name}")


@tool
async def spawn_subagent(
    objective: str,
    role_id: str = "MainAgent",
    prompt: str = "",
    skill_path: str | None = None,
    workspace_dir: str | None = None,
    timeout_seconds: float = 300.0,
    system_prompt: str | None = None,
) -> dict[str, Any]:
    """
    Spawn a subagent to execute a task, blocking until result is returned.

    The subagent has full Agent capabilities: multi-round reasoning, tool calls, skill loading.
    Streaming events are forwarded to the parent session with 'subagent.' prefix.

    Args:
        objective: Task objective description
        role_id: Role ID to use (default: MainAgent)
        prompt: Execution prompt (optional)
        skill_path: Sub-skill path, relative to skills directory (optional)
        workspace_dir: Working directory (optional)
        timeout_seconds: Timeout in seconds (default: 300)
        system_prompt: Override role's system prompt (optional)

    Returns:
        {"success": bool, "task_id": str, "result": str, "error": str}
    """
    if _executor is None:
        return {"success": False, "error": "Subagent tools not initialized"}

    # Get parent session from context (set by JiuClawReActAgent before tool execution)
    parent_session: Session | None = get_subagent_parent_session()

    task = SubagentTaskSpec(
        role_id=role_id,
        objective=objective,
        prompt=prompt,
        skill_path=skill_path,
        workspace_dir=workspace_dir,
        timeout_seconds=timeout_seconds,
        system_prompt=system_prompt,
    )
    result = await _executor.execute(task, parent_session=parent_session)
    return result.model_dump()


@tool
async def spawn_parallel_subagents(
    tasks: list[dict[str, Any]],
    max_concurrent: int = 3,
) -> dict[str, Any]:
    """
    Spawn multiple subagents in parallel to execute tasks.

    Streaming events are forwarded to the parent session with 'subagent.' prefix.
    Each subagent's events are tagged with its unique subagent_id.

    Args:
        tasks: Task list, each item is a dict with:
            - objective: str (required)
            - role_id: str (default: MainAgent)
            - prompt: str (optional)
            - skill_path: str (optional)
            - workspace_dir: str (optional)
            - system_prompt: str (optional)
        max_concurrent: Maximum concurrent subagents (default: 3)

    Returns:
        {
            "results": [result1, result2, ...],
            "success_count": int,
            "failed_count": int
        }
    """
    if _executor is None:
        return {"success": False, "error": "Subagent tools not initialized"}

    # Get parent session from context (set by JiuClawReActAgent before tool execution)
    parent_session: Session | None = get_subagent_parent_session()

    task_specs = [SubagentTaskSpec(**t) for t in tasks]
    results = await _executor.execute_parallel(task_specs, max_concurrent, parent_session=parent_session)

    success_count = sum(1 for r in results if r.success)
    return {
        "results": [r.model_dump() for r in results],
        "success_count": success_count,
        "failed_count": len(results) - success_count,
    }