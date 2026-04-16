# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

from __future__ import annotations

import json
import logging
import sys
import types
from pathlib import Path

import pytest

_JIUWENCLAW_DIR = Path(__file__).resolve().parents[1]
_AGENTSERVER_DIR = _JIUWENCLAW_DIR / "agentserver"

if "jiuwenclaw.agentserver" not in sys.modules:
    agentserver_pkg = types.ModuleType("jiuwenclaw.agentserver")
    agentserver_pkg.__path__ = [str(_AGENTSERVER_DIR)]
    sys.modules["jiuwenclaw.agentserver"] = agentserver_pkg

if "jiuwenclaw.utils" not in sys.modules:
    utils_module = types.ModuleType("jiuwenclaw.utils")
    utils_module.get_agent_sessions_dir = lambda: Path.cwd()
    sys.modules["jiuwenclaw.utils"] = utils_module

if "jiuwenclaw.logging" not in sys.modules:
    logging_pkg = types.ModuleType("jiuwenclaw.logging")
    logging_pkg.__path__ = []
    sys.modules["jiuwenclaw.logging"] = logging_pkg

if "jiuwenclaw.logging.app_logger" not in sys.modules:
    app_logger_module = types.ModuleType("jiuwenclaw.logging.app_logger")
    app_logger_module.logger = logging.getLogger("test-session-history")
    sys.modules["jiuwenclaw.logging.app_logger"] = app_logger_module

from jiuwenclaw.agentserver import session_history


@pytest.mark.parametrize(
    ("raw", "expected_ids"),
    [
        (
            "\n".join(
                [
                    json.dumps(
                        {"id": "req-1:user", "role": "user", "content": "hello", "timestamp": 1.0},
                        ensure_ascii=False,
                    ),
                    json.dumps(
                        {"id": "req-1:assistant", "role": "assistant", "content": "world", "timestamp": 2.0},
                        ensure_ascii=False,
                    ),
                ]
            )
            + "\n",
            ["req-1:user", "req-1:assistant"],
        ),
    ],
)
def test_read_history_records_supports_jsonl(tmp_path: Path, raw: str, expected_ids: list[str]):
    history_path = tmp_path / "history.json"
    history_path.write_text(raw, encoding="utf-8")

    records = session_history.read_history_records(history_path)

    assert [record["id"] for record in records] == expected_ids


def test_read_history_records_ignores_legacy_json_array(tmp_path: Path):
    history_path = tmp_path / "history.json"
    history_path.write_text(
        json.dumps(
            [
                {"id": "req-1:user", "role": "user", "content": "hello", "timestamp": 1.0},
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    records = session_history.read_history_records(history_path)

    assert records == []


def test_write_item_appends_jsonl_record(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    history_path = tmp_path / "history.json"
    history_path.write_text(
        json.dumps(
            {"id": "req-1:user", "role": "user", "content": "hello", "timestamp": 1.0},
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(session_history, "_history_file", lambda _session_id: history_path)

    session_history._write_item(
        "sess_test",
        {"id": "req-1:assistant", "role": "assistant", "content": "world", "timestamp": 2.0},
    )

    raw = history_path.read_text(encoding="utf-8")
    lines = [line for line in raw.splitlines() if line.strip()]

    assert len(lines) == 2
    assert [json.loads(line)["id"] for line in lines] == ["req-1:user", "req-1:assistant"]
