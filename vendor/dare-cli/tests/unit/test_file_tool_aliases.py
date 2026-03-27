"""Tests for read/write/update compatibility tools."""

from __future__ import annotations

import asyncio

from dare_framework.config.types import Config
from dare_framework.tool._internal.tools import ReadTool, UpdateTool, WriteTool
from dare_framework.tool.types import RunContext


def _run_context(tmp_path) -> RunContext[None]:
    config = Config.from_dict({"workspace_dir": str(tmp_path)})
    return RunContext(config=config)


def test_write_and_read_tool_roundtrip(tmp_path) -> None:
    run_context = _run_context(tmp_path)

    write_result = asyncio.run(
        WriteTool().execute(
            run_context=run_context,
            file_path="src/example.py",
            code_content="print('hello')\nprint('world')\n",
            description="create sample file",
        )
    )

    assert write_result.success is True
    assert write_result.output["path"] == "src/example.py"

    read_result = asyncio.run(
        ReadTool().execute(
            run_context=run_context,
            file_path="src/example.py",
            start_line=2,
            end_line=2,
        )
    )

    assert read_result.success is True
    assert read_result.output["mode"] == "line_based"
    assert "2: print('world')" in read_result.output["content"]


def test_read_tool_query_mode_returns_matching_block(tmp_path) -> None:
    run_context = _run_context(tmp_path)
    sample = tmp_path / "app.py"
    sample.write_text("alpha\nbeta keyword\ngamma\n", encoding="utf-8")

    result = asyncio.run(
        ReadTool().execute(
            run_context=run_context,
            file_path="app.py",
            query="keyword",
            context_lines=1,
        )
    )

    assert result.success is True
    assert result.output["mode"] == "query_based"
    assert "1: alpha" in result.output["content"]
    assert "2: beta keyword" in result.output["content"]
    assert "3: gamma" in result.output["content"]


def test_update_tool_replaces_exact_match_at_expected_line(tmp_path) -> None:
    run_context = _run_context(tmp_path)
    sample = tmp_path / "demo.txt"
    sample.write_text("one\ntwo\nthree\n", encoding="utf-8")

    result = asyncio.run(
        UpdateTool().execute(
            run_context=run_context,
            file_path="demo.txt",
            old_string="two",
            new_string="TWO",
            expected_line=2,
            description="capitalize line",
        )
    )

    assert result.success is True
    assert result.output["replacements"] == 1
    assert sample.read_text(encoding="utf-8") == "one\nTWO\nthree\n"


def test_update_tool_requires_expected_line_for_single_replace(tmp_path) -> None:
    run_context = _run_context(tmp_path)
    sample = tmp_path / "demo.txt"
    sample.write_text("one\ntwo\nthree\n", encoding="utf-8")

    result = asyncio.run(
        UpdateTool().execute(
            run_context=run_context,
            file_path="demo.txt",
            old_string="two",
            new_string="TWO",
        )
    )

    assert result.success is False
    assert result.output["code"] == "EXPECTED_LINE_REQUIRED"
