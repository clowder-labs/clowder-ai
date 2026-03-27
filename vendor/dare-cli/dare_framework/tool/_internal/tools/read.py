"""Compatibility read tool implementation."""

from __future__ import annotations

from typing import Any, TypedDict

from dare_framework.infra.ids import generate_id
from dare_framework.tool._internal.file_utils import relative_to_root, resolve_path, resolve_workspace_roots
from dare_framework.tool._internal.tools._file_tool_compat import get_max_bytes, read_text_file
from dare_framework.tool._internal.util.__tool_schema_util import (
    infer_input_schema_from_execute,
    infer_output_schema_from_execute,
)
from dare_framework.tool.errors import ToolError
from dare_framework.tool.kernel import ITool
from dare_framework.tool.types import CapabilityKind, Evidence, RunContext, ToolResult, ToolType


class ReadTool(ITool):
    """Read source files with line-numbered output and optional query filtering."""

    @property
    def name(self) -> str:
        return "read"

    @property
    def description(self) -> str:
        return "Read a file with optional line ranges, context lines, and query-based extraction."

    @property
    def input_schema(self) -> dict[str, Any]:
        return infer_input_schema_from_execute(type(self).execute)

    @property
    def output_schema(self) -> dict[str, Any]:
        return infer_output_schema_from_execute(type(self).execute) or {}

    @property
    def risk_level(self) -> str:
        return "read_only"

    @property
    def tool_type(self) -> ToolType:
        return ToolType.ATOMIC

    @property
    def requires_approval(self) -> bool:
        return False

    @property
    def timeout_seconds(self) -> int:
        return 10

    @property
    def produces_assertions(self) -> list[dict[str, Any]]:
        return [{"type": "file_content", "produces": {"path": "*"}}]

    @property
    def is_work_unit(self) -> bool:
        return False

    @property
    def capability_kind(self) -> CapabilityKind:
        return CapabilityKind.TOOL

    async def execute(
        self,
        *,
        run_context: RunContext[Any],
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
        query: str | None = None,
        encoding: str = "utf-8",
    ) -> ToolResult[ReadOutput]:
        """Read file content with precise line control.

        Args:
            run_context: Runtime invocation context.
            file_path: File path relative to the workspace root.
            start_line: Optional 1-indexed inclusive start line.
            end_line: Optional 1-indexed inclusive end line.
            context_lines: Extra lines to include before and after the selection.
            query: Optional substring query used to extract matching line blocks.
            encoding: Text encoding used for decoding file content.

        Returns:
            Line-numbered file content and selection metadata.
        """
        try:
            context_lines = _coerce_optional_int(context_lines, "context_lines") or 0
            if context_lines < 0:
                raise ToolError(
                    code="INVALID_LINE_RANGE",
                    message="context_lines must be >= 0",
                    retryable=False,
                )

            roots = resolve_workspace_roots(run_context)
            abs_path, root = resolve_path(file_path, roots)
            max_bytes = get_max_bytes(run_context, "read", "read_file")
            _, content = read_text_file(abs_path, encoding=encoding, max_bytes=max_bytes)
            lines = content.splitlines()
            line_count = len(lines)

            mode = "full_file"
            selected_start = 1 if line_count else 0
            selected_end = line_count
            selected_lines = lines
            query_matched = False

            rendered = ""

            if start_line is not None or end_line is not None:
                mode = "line_based"
                start_line = 1 if start_line is None else _coerce_optional_int(start_line, "start_line")
                end_line = line_count if end_line is None else _coerce_optional_int(end_line, "end_line")
                if start_line < 1 or end_line < 1:
                    raise ToolError(
                        code="INVALID_LINE_RANGE",
                        message="start_line and end_line must be >= 1",
                        retryable=False,
                    )
                if end_line < start_line:
                    raise ToolError(
                        code="INVALID_LINE_RANGE",
                        message="end_line must be >= start_line",
                        retryable=False,
                    )
                if line_count and start_line > line_count:
                    raise ToolError(
                        code="LINE_RANGE_OUT_OF_BOUNDS",
                        message="start_line out of range",
                        retryable=False,
                    )
                selected_start = max(1, start_line - context_lines) if line_count else 0
                selected_end = min(line_count, end_line + context_lines)
                start_index = max(0, selected_start - 1)
                selected_lines = lines[start_index:selected_end]
                rendered = _render_numbered_lines(selected_lines, selected_start)
            elif query:
                mode = "query_based"
                blocks = _query_blocks(lines, query=query, context_lines=context_lines)
                if blocks:
                    query_matched = True
                    selected_start = blocks[0][0]
                    selected_end = blocks[-1][1]
                    rendered = _render_query_blocks(lines, blocks)
                else:
                    selected_start = 0
                    selected_end = 0
                    selected_lines = []
                    rendered = ""
            else:
                rendered = _render_numbered_lines(selected_lines, selected_start)

            rel_path = relative_to_root(abs_path, root)
            if mode == "query_based" and not query_matched:
                rendered = f"No matches for query {query!r} in {rel_path}"

            return ToolResult(
                success=True,
                output={
                    "content": rendered,
                    "path": rel_path,
                    "line_count": line_count,
                    "mode": mode,
                    "selected_start_line": selected_start,
                    "selected_end_line": selected_end,
                },
                evidence=[
                    Evidence(
                        evidence_id=generate_id("evidence"),
                        kind="file_read",
                        payload={"path": rel_path},
                    )
                ],
            )
        except ToolError as exc:
            return _error_result(exc)


def _query_blocks(lines: list[str], *, query: str, context_lines: int) -> list[tuple[int, int]]:
    needle = query.casefold()
    blocks: list[tuple[int, int]] = []
    for index, line in enumerate(lines, start=1):
        if needle in line.casefold():
            start = max(1, index - context_lines)
            end = min(len(lines), index + context_lines)
            if blocks and start <= blocks[-1][1] + 1:
                prev_start, prev_end = blocks[-1]
                blocks[-1] = (prev_start, max(prev_end, end))
            else:
                blocks.append((start, end))
    return blocks


def _render_query_blocks(lines: list[str], blocks: list[tuple[int, int]]) -> str:
    rendered: list[str] = []
    for block_index, (start, end) in enumerate(blocks):
        if block_index > 0:
            rendered.append("...")
        rendered.extend(
            f"{line_number:>6}: {lines[line_number - 1]}"
            for line_number in range(start, end + 1)
        )
    return "\n".join(rendered)


def _render_numbered_lines(lines: list[str], start_line: int) -> str:
    if not lines:
        return ""
    return "\n".join(f"{line_number:>6}: {line}" for line_number, line in enumerate(lines, start=start_line))


def _coerce_optional_int(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ToolError(
            code="INVALID_LINE_RANGE",
            message=f"{field_name} must be an integer",
            retryable=False,
        ) from exc


def _error_result(error: ToolError) -> ToolResult:
    return ToolResult(
        success=False,
        output={"code": error.code},
        error=error.message,
        evidence=[],
    )


class ReadOutput(TypedDict):
    content: str
    path: str
    line_count: int
    mode: str
    selected_start_line: int
    selected_end_line: int
