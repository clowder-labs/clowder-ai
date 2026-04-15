# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest
import yaml

_JIUWENCLAW_DIR = Path(__file__).resolve().parents[1]
_AGENTSERVER_DIR = _JIUWENCLAW_DIR / "agentserver"

if "jiuwenclaw.agentserver" not in sys.modules:
    agentserver_pkg = types.ModuleType("jiuwenclaw.agentserver")
    agentserver_pkg.__path__ = [str(_AGENTSERVER_DIR)]
    sys.modules["jiuwenclaw.agentserver"] = agentserver_pkg

from jiuwenclaw.agentserver.permissions.core import PermissionEngine, set_permission_engine
from jiuwenclaw.agentserver.permissions.models import PermissionLevel
from jiuwenclaw.agentserver.permissions.patterns import (
    persist_permission_allow_rule,
    split_compound_command,
)


def test_split_compound_command_handles_windows_connectors_and_quotes():
    command = 'echo "a && b" && dir; echo done & whoami || echo fail'

    parts = split_compound_command(command)

    assert parts == [
        'echo "a && b"',
        "dir",
        "echo done",
        "whoami",
        "echo fail",
    ]


@pytest.mark.asyncio
async def test_exec_command_permission_aggregates_subcommands():
    engine = PermissionEngine(
        {
            "enabled": True,
            "defaults": {"*": "ask"},
            "tools": {
                "mcp_exec_command": {
                    "*": "ask",
                    "patterns": {
                        "rm *": "deny",
                        "echo *": "allow",
                    },
                }
            },
        }
    )

    result = await engine.check_permission(
        "mcp_exec_command",
        {"command": 'rm aaa || echo "hello"'},
    )

    assert result.permission == PermissionLevel.DENY
    assert result.matched_rule == "tools.mcp_exec_command.patterns['rm *']"


@pytest.mark.asyncio
async def test_exec_command_allow_matches_redirection_without_extra_ask():
    engine = PermissionEngine(
        {
            "enabled": True,
            "defaults": {"*": "ask"},
            "tools": {
                "mcp_exec_command": {
                    "*": "ask",
                    "patterns": {
                        "echo *": "allow",
                    },
                }
            },
        }
    )

    result = await engine.check_permission(
        "mcp_exec_command",
        {"command": "echo hello > a.txt"},
    )

    assert result.permission == PermissionLevel.ALLOW
    assert result.matched_rule == "tools.mcp_exec_command.patterns['echo *']"


@pytest.mark.asyncio
async def test_run_command_permission_aggregates_subcommands():
    engine = PermissionEngine(
        {
            "enabled": True,
            "defaults": {"*": "ask"},
            "tools": {
                "run_command": {
                    "*": "ask",
                    "patterns": {
                        "rm *": "deny",
                        "echo *": "allow",
                    },
                }
            },
        }
    )

    result = await engine.check_permission(
        "run_command",
        {"bash_command": 'rm aaa || echo "hello"'},
    )

    assert result.permission == PermissionLevel.DENY
    assert result.matched_rule == "tools.run_command.patterns['rm *']"


@pytest.mark.asyncio
async def test_run_command_allow_matches_redirection_without_extra_ask():
    engine = PermissionEngine(
        {
            "enabled": True,
            "defaults": {"*": "ask"},
            "tools": {
                "run_command": {
                    "*": "ask",
                    "patterns": {
                        "echo *": "allow",
                    },
                }
            },
        }
    )

    result = await engine.check_permission(
        "run_command",
        {"bash_command": "echo hello > a.txt"},
    )

    assert result.permission == PermissionLevel.ALLOW
    assert result.matched_rule == "tools.run_command.patterns['echo *']"


def test_persist_permission_allow_rule_upgrades_ask_and_adds_subcommand_pattern(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
permissions:
  enabled: true
  defaults:
    "*": "ask"
  tools:
    mcp_exec_command:
      "*": "ask"
      patterns:
        "rm *": "ask"
""".strip()
        + "\n",
        encoding="utf-8",
    )

    import jiuwenclaw.config as config_module

    monkeypatch.setattr(config_module, "_CONFIG_YAML_PATH", config_path)
    set_permission_engine(PermissionEngine({}))

    persist_permission_allow_rule(
        "mcp_exec_command",
        {"command": 'rm aaa || echo "hello"'},
        ["rm *"],
        ['echo "hello"'],
    )

    updated = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    patterns = updated["permissions"]["tools"]["mcp_exec_command"]["patterns"]

    assert patterns["rm *"] == "allow"
    assert patterns["echo *"] == "allow"


def test_persist_permission_allow_rule_prefers_upgrading_existing_ask_pattern(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
permissions:
  enabled: true
  defaults:
    "*": "ask"
  tools:
    mcp_exec_command:
      "*": "ask"
      patterns:
        "git status *": "ask"
""".strip()
        + "\n",
        encoding="utf-8",
    )

    import jiuwenclaw.config as config_module

    monkeypatch.setattr(config_module, "_CONFIG_YAML_PATH", config_path)
    set_permission_engine(PermissionEngine({}))

    persist_permission_allow_rule(
        "mcp_exec_command",
        {"command": "git status foo"},
        ["git status *"],
        [],
    )

    updated = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    patterns = updated["permissions"]["tools"]["mcp_exec_command"]["patterns"]

    assert patterns["git status *"] == "allow"
    assert "git *" not in patterns
    assert "git status foo *" not in patterns


def test_persist_permission_allow_rule_falls_back_to_generated_command_pattern_when_no_ask_pattern(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
permissions:
  enabled: true
  defaults:
    "*": "ask"
  tools:
    mcp_exec_command:
      "*": "ask"
      patterns: {}
""".strip()
        + "\n",
        encoding="utf-8",
    )

    import jiuwenclaw.config as config_module

    monkeypatch.setattr(config_module, "_CONFIG_YAML_PATH", config_path)
    set_permission_engine(PermissionEngine({}))

    persist_permission_allow_rule(
        "mcp_exec_command",
        {"command": "git status foo"},
        [],
        ["git status foo"],
    )

    updated = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    patterns = updated["permissions"]["tools"]["mcp_exec_command"]["patterns"]

    assert patterns["git *"] == "allow"


def test_persist_permission_allow_rule_preserves_quotes_for_executable_path_head(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
permissions:
  enabled: true
  defaults:
    "*": "ask"
  tools:
    mcp_exec_command:
      "*": "ask"
      patterns: {}
""".strip()
        + "\n",
        encoding="utf-8",
    )

    import jiuwenclaw.config as config_module

    monkeypatch.setattr(config_module, "_CONFIG_YAML_PATH", config_path)
    set_permission_engine(PermissionEngine({}))

    persist_permission_allow_rule(
        "mcp_exec_command",
        {"command": '"C:/Program Files/Git/bin/git.exe" status'},
        [],
        ['"C:/Program Files/Git/bin/git.exe" status'],
    )

    updated = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    patterns = updated["permissions"]["tools"]["mcp_exec_command"]["patterns"]

    assert patterns['"C:/Program Files/Git/bin/git.exe" *'] == "allow"


def test_persist_permission_allow_rule_supports_run_command(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
permissions:
  enabled: true
  defaults:
    "*": "ask"
  tools:
    run_command:
      "*": "ask"
      patterns:
        "rm *": "ask"
""".strip()
        + "\n",
        encoding="utf-8",
    )

    import jiuwenclaw.config as config_module

    monkeypatch.setattr(config_module, "_CONFIG_YAML_PATH", config_path)
    set_permission_engine(PermissionEngine({}))

    persist_permission_allow_rule(
        "run_command",
        {"bash_command": 'rm aaa || echo "hello"'},
        ["rm *"],
        ['echo "hello"'],
    )

    updated = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    patterns = updated["permissions"]["tools"]["run_command"]["patterns"]

    assert patterns["rm *"] == "allow"
    assert patterns["echo *"] == "allow"
