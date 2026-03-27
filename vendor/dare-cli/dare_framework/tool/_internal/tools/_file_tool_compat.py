"""Shared helpers for read/write/update compatibility tools."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dare_framework.tool._internal.file_utils import (
    DEFAULT_MAX_BYTES,
    coerce_int,
    get_tool_config,
)
from dare_framework.tool.errors import ToolError
from dare_framework.tool.types import RunContext


def get_max_bytes(context: RunContext[Any], *tool_names: str) -> int:
    """Resolve max_bytes from the first matching tool config."""
    for tool_name in tool_names:
        tool_config = get_tool_config(context, tool_name)
        if tool_config:
            return coerce_int(tool_config.get("max_bytes"), DEFAULT_MAX_BYTES)
    return DEFAULT_MAX_BYTES


def stat_file(path: Path):
    """Return a stat result for a regular file or raise ToolError."""
    try:
        stat_result = path.stat()
    except FileNotFoundError as exc:
        raise ToolError(code="FILE_NOT_FOUND", message="file not found", retryable=False) from exc
    except PermissionError as exc:
        raise ToolError(code="PERMISSION_DENIED", message="permission denied", retryable=False) from exc
    except OSError as exc:
        raise ToolError(code="READ_FAILED", message=str(exc), retryable=False) from exc
    if not path.is_file():
        raise ToolError(code="INVALID_PATH", message="path is not a file", retryable=False)
    return stat_result


def read_text_file(path: Path, *, encoding: str, max_bytes: int) -> tuple[object, str]:
    """Read a text file after size validation."""
    stat_result = stat_file(path)
    if stat_result.st_size > max_bytes:
        raise ToolError(code="FILE_TOO_LARGE", message="file exceeds max_bytes", retryable=False)
    try:
        content = path.read_text(encoding=encoding)
    except UnicodeDecodeError as exc:
        raise ToolError(code="DECODE_FAILED", message="failed to decode file", retryable=False) from exc
    except OSError as exc:
        raise ToolError(code="READ_FAILED", message=str(exc), retryable=False) from exc
    return stat_result, content


def detect_language(path: Path) -> str:
    """Best-effort language detection from file suffix."""
    suffix = path.suffix.lower()
    return {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".json": "json",
        ".md": "markdown",
        ".sh": "shell",
        ".bash": "shell",
        ".zsh": "shell",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".rb": "ruby",
        ".php": "php",
        ".swift": "swift",
        ".kt": "kotlin",
    }.get(suffix, "text")
