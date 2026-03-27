"""Compatibility write tool implementation."""

from __future__ import annotations

from typing import Any, TypedDict

from dare_framework.infra.ids import generate_id
from dare_framework.tool._internal.file_utils import (
    atomic_write,
    relative_to_root,
    resolve_path,
    resolve_workspace_roots,
)
from dare_framework.tool._internal.tools._file_tool_compat import detect_language, get_max_bytes
from dare_framework.tool._internal.util.__tool_schema_util import (
    infer_input_schema_from_execute,
    infer_output_schema_from_execute,
)
from dare_framework.tool.errors import ToolError
from dare_framework.tool.kernel import ITool
from dare_framework.tool.types import CapabilityKind, Evidence, RunContext, ToolResult, ToolType


class WriteTool(ITool):
    """Write code or text content to a file."""

    @property
    def name(self) -> str:
        return "write"

    @property
    def description(self) -> str:
        return "Write exact file contents to a workspace file using file_path and code_content."

    @property
    def input_schema(self) -> dict[str, Any]:
        return infer_input_schema_from_execute(type(self).execute)

    @property
    def output_schema(self) -> dict[str, Any]:
        return infer_output_schema_from_execute(type(self).execute) or {}

    @property
    def risk_level(self) -> str:
        return "idempotent_write"

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
        code_content: str,
        description: str | None = None,
        language: str | None = None,
    ) -> ToolResult[WriteOutput]:
        """Write exact text content to a file.

        Args:
            run_context: Runtime invocation context.
            file_path: File path relative to the workspace root.
            code_content: Full content to write into the file.
            description: Optional human-readable description of the write.
            language: Optional language label for the written content.

        Returns:
            Write metadata including path, bytes written, and creation status.
        """
        try:
            if not isinstance(code_content, str):
                raise ToolError(code="INVALID_CONTENT", message="code_content must be a string", retryable=False)

            roots = resolve_workspace_roots(run_context)
            abs_path, root = resolve_path(file_path, roots)
            if abs_path.exists() and abs_path.is_dir():
                raise ToolError(code="INVALID_PATH", message="path is a directory", retryable=False)

            max_bytes = get_max_bytes(run_context, "write", "write_file")
            payload = code_content.encode("utf-8")
            if len(payload) > max_bytes:
                raise ToolError(code="CONTENT_TOO_LARGE", message="content exceeds max_bytes", retryable=False)

            abs_path.parent.mkdir(parents=True, exist_ok=True)
            created = not abs_path.exists()
            mode = None
            if abs_path.exists():
                try:
                    mode = abs_path.stat().st_mode
                except OSError:
                    mode = None

            atomic_write(abs_path, payload, mode=mode)

            rel_path = relative_to_root(abs_path, root)
            resolved_language = language or detect_language(abs_path)
            lines_written = len(code_content.splitlines())
            summary = f"Wrote {rel_path} ({lines_written} lines)"
            if description:
                summary += f"\n{description}"

            return ToolResult(
                success=True,
                output={
                    "content": summary,
                    "path": rel_path,
                    "bytes_written": len(payload),
                    "created": created,
                    "language": resolved_language,
                },
                evidence=[
                    Evidence(
                        evidence_id=generate_id("evidence"),
                        kind="file_write",
                        payload={"path": rel_path},
                    )
                ],
            )
        except ToolError as exc:
            return _error_result(exc)


def _error_result(error: ToolError) -> ToolResult:
    return ToolResult(
        success=False,
        output={"code": error.code},
        error=error.message,
        evidence=[],
    )


class WriteOutput(TypedDict):
    content: str
    path: str
    bytes_written: int
    created: bool
    language: str
