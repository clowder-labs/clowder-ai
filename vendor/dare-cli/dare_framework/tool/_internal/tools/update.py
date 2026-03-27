"""Compatibility update tool implementation."""

from __future__ import annotations

from typing import Any, TypedDict

from dare_framework.infra.ids import generate_id
from dare_framework.tool._internal.file_utils import (
    atomic_write,
    relative_to_root,
    resolve_path,
    resolve_workspace_roots,
)
from dare_framework.tool._internal.tools._file_tool_compat import get_max_bytes, read_text_file
from dare_framework.tool._internal.util.__tool_schema_util import (
    infer_input_schema_from_execute,
    infer_output_schema_from_execute,
)
from dare_framework.tool.errors import ToolError
from dare_framework.tool.kernel import ITool
from dare_framework.tool.types import CapabilityKind, Evidence, RunContext, ToolResult, ToolType


class UpdateTool(ITool):
    """Apply exact string replacement updates to a file."""

    @property
    def name(self) -> str:
        return "update"

    @property
    def description(self) -> str:
        return "Replace an exact string in a file using file_path, old_string, new_string, and expected_line."

    @property
    def input_schema(self) -> dict[str, Any]:
        return infer_input_schema_from_execute(type(self).execute)

    @property
    def output_schema(self) -> dict[str, Any]:
        return infer_output_schema_from_execute(type(self).execute) or {}

    @property
    def risk_level(self) -> str:
        return "non_idempotent_effect"

    @property
    def tool_type(self) -> ToolType:
        return ToolType.ATOMIC

    @property
    def requires_approval(self) -> bool:
        return True

    @property
    def timeout_seconds(self) -> int:
        return 10

    @property
    def produces_assertions(self) -> list[dict[str, Any]]:
        return [{"type": "file_modified", "produces": {"path": "*"}}]

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
        old_string: str,
        new_string: str,
        expected_line: int | None = None,
        replace_all: bool = False,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ToolResult[UpdateOutput]:
        """Perform an exact string replacement in a file.

        Args:
            run_context: Runtime invocation context.
            file_path: File path relative to the workspace root.
            old_string: Exact text to replace.
            new_string: Replacement text.
            expected_line: Required 1-indexed starting line for non-global replacement.
            replace_all: Replace every exact occurrence when true.
            description: Optional human-readable description of the change.
            metadata: Optional future-facing metadata payload.

        Returns:
            Update metadata including replacement count and written path.
        """
        del metadata
        try:
            expected_line = _coerce_optional_int(expected_line, "expected_line")
            if not old_string:
                raise ToolError(code="INVALID_OLD_STRING", message="old_string must not be empty", retryable=False)
            if old_string == new_string:
                raise ToolError(code="IDENTICAL_STRINGS", message="old_string and new_string must differ", retryable=False)
            if not replace_all and expected_line is None:
                raise ToolError(code="EXPECTED_LINE_REQUIRED", message="expected_line is required unless replace_all is true", retryable=False)
            if expected_line is not None and expected_line < 1:
                raise ToolError(code="INVALID_LINE", message="expected_line must be >= 1", retryable=False)

            roots = resolve_workspace_roots(run_context)
            abs_path, root = resolve_path(file_path, roots)
            max_bytes = get_max_bytes(run_context, "update", "write", "write_file")
            stat_result, original_content = read_text_file(abs_path, encoding="utf-8", max_bytes=max_bytes)

            occurrences = _find_occurrences(original_content, old_string)
            if not occurrences:
                raise ToolError(code="OLD_STRING_NOT_FOUND", message="old_string not found in file", retryable=False)

            if replace_all:
                new_content = original_content.replace(old_string, new_string)
                replacements = len(occurrences)
                actual_line = _line_number_for_index(original_content, occurrences[0])
            else:
                if len(occurrences) > 1:
                    raise ToolError(
                        code="AMBIGUOUS_MATCH",
                        message=f"old_string appears {len(occurrences)} times; use replace_all or narrow the match",
                        retryable=False,
                    )
                match_index = occurrences[0]
                actual_line = _line_number_for_index(original_content, match_index)
                if actual_line != expected_line:
                    raise ToolError(
                        code="LINE_MISMATCH",
                        message=f"old_string starts at line {actual_line}, not {expected_line}",
                        retryable=False,
                    )
                new_content = (
                    original_content[:match_index]
                    + new_string
                    + original_content[match_index + len(old_string):]
                )
                replacements = 1

            encoded = new_content.encode("utf-8")
            if len(encoded) > max_bytes:
                raise ToolError(code="FILE_TOO_LARGE", message="result exceeds max_bytes", retryable=False)

            atomic_write(abs_path, encoded, mode=stat_result.st_mode)

            rel_path = relative_to_root(abs_path, root)
            summary = f"Updated {rel_path} ({replacements} replacement"
            if replacements != 1:
                summary += "s"
            summary += ")"
            if description:
                summary += f"\n{description}"

            return ToolResult(
                success=True,
                output={
                    "content": summary,
                    "path": rel_path,
                    "replacements": replacements,
                    "line": actual_line,
                },
                evidence=[
                    Evidence(
                        evidence_id=generate_id("evidence"),
                        kind="file_edit",
                        payload={"path": rel_path, "replacements": replacements},
                    )
                ],
            )
        except ToolError as exc:
            return _error_result(exc)


def _find_occurrences(content: str, needle: str) -> list[int]:
    matches: list[int] = []
    start = 0
    while True:
        index = content.find(needle, start)
        if index == -1:
            return matches
        matches.append(index)
        start = index + len(needle)


def _line_number_for_index(content: str, index: int) -> int:
    return content.count("\n", 0, index) + 1


def _coerce_optional_int(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ToolError(
            code="INVALID_LINE",
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


class UpdateOutput(TypedDict):
    content: str
    path: str
    replacements: int
    line: int
