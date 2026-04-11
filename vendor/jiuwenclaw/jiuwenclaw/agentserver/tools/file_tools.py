# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""File read/write/edit tools for JiuwenClaw agent.

Uses openjiuwen @tool decorator style.
"""

from __future__ import annotations

import asyncio
import fnmatch
import os
import tempfile
from pathlib import Path
from typing import Literal, NamedTuple

from openjiuwen.core.foundation.tool import LocalFunction, Tool, ToolCard

from jiuwenclaw.utils import get_workspace_dir

from .file_tools_config import get_file_tools_config


# ---------------------------------------------------------------------------
# Binary extension blacklist
# ---------------------------------------------------------------------------

_BINARY_EXTENSIONS = frozenset(
    ext.lower()
    for ext in (
        ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
        ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
        ".mp3", ".mp4", ".avi", ".mkv", ".wav", ".flac", ".aac", ".ogg",
        ".db", ".sqlite", ".sqlite3", ".mdb", ".accdb",
        ".class", ".pyc", ".pyo", ".o", ".obj", ".ko",
        ".iso", ".img", ".dmg", ".vhd", ".vmdk",
    )
)


def _has_binary_extension(path: str) -> bool:
    ext = os.path.splitext(path)[1].lower()
    return ext in _BINARY_EXTENSIONS


# ---------------------------------------------------------------------------
# Path validation
# ---------------------------------------------------------------------------

def _is_path_allowed(file_path: str) -> tuple[bool, str]:
    """检查 file_path 是否在允许范围内。

    Returns:
        (True, "")  -- 允许
        (False, msg) -- 拒绝，返回错误消息
    """
    cfg = get_file_tools_config()
    p = Path(file_path)

    # 隐藏文件检查
    if not cfg.allow_hidden_files and p.name.startswith("."):
        return False, f"PERMISSION_DENIED: hidden files are not allowed ({file_path})"

    # 全开放
    if cfg.allow_any_path:
        return True, ""

    # 工作区检查
    workspace = get_workspace_dir()
    try:
        p.resolve().relative_to(workspace.resolve())
        return True, ""
    except ValueError:
        pass

    # 额外允许的目录
    for allowed in cfg.allowed_dirs:
        allowed_path = Path(allowed)
        if allowed_path.is_dir():
            try:
                p.resolve().relative_to(allowed_path.resolve())
                return True, ""
            except ValueError:
                pass
        if fnmatch.fnmatch(str(p.resolve()), allowed):
            return True, ""

    return False, (
        f"PERMISSION_DENIED: {file_path} is outside the allowed directory scope. "
        f"Configure file_tools.allow_any_path=true or file_tools.allowed_dirs to expand access."
    )


# ---------------------------------------------------------------------------
# Encoding detection
# ---------------------------------------------------------------------------

class FileMetadata(NamedTuple):
    encoding: str
    line_endings: Literal["CRLF", "LF"]
    size: int


def _detect_encoding_and_line_endings(file_path: str) -> FileMetadata:
    """读取文件头检测编码和换行符。"""
    size = os.path.getsize(file_path)

    if size == 0:
        return FileMetadata(encoding="utf-8", line_endings="LF", size=0)

    with open(file_path, "rb") as f:
        head = f.read(4096)

    # BOM detection
    if head[:2] == b"\xff\xfe":
        encoding = "utf-16-le"
    elif head[:3] == b"\xef\xbb\xbf":
        encoding = "utf-8"
    else:
        encoding = "utf-8"

    # Line endings detection
    text = head.decode(encoding, errors="replace")
    crlf = text.count("\r\n")
    lf_only = text.count("\n") - crlf
    line_endings = "CRLF" if crlf > lf_only else "LF"

    return FileMetadata(encoding=encoding, line_endings=line_endings, size=size)


def _is_binary_content(file_path: str) -> bool:
    """检查文件头是否包含 NULL 字节。"""
    try:
        with open(file_path, "rb") as f:
            head = f.read(8192)
        return b"\x00" in head
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Tool schemas
# ---------------------------------------------------------------------------

FILE_READ_PARAMS = {
    "type": "object",
    "properties": {
        "file_path": {"type": "string", "description": "目标文件绝对路径"},
    },
    "required": ["file_path"],
}

FILE_WRITE_PARAMS = {
    "type": "object",
    "properties": {
        "file_path": {"type": "string", "description": "目标文件绝对路径"},
        "content": {"type": "string", "description": "写入内容"},
        "encoding": {"type": "string", "description": "编码，默认 utf-8", "default": "utf-8"},
    },
    "required": ["file_path", "content"],
}

FILE_EDIT_PARAMS = {
    "type": "object",
    "properties": {
        "file_path": {"type": "string", "description": "目标文件绝对路径"},
        "old_string": {"type": "string", "description": "待替换的字符串"},
        "new_string": {"type": "string", "description": "替换后的字符串"},
        "replace_all": {"type": "boolean", "description": "替换所有匹配项，默认 false", "default": False},
    },
    "required": ["file_path", "old_string", "new_string"],
}

FILE_READ_DESC = (
    "读取指定路径的文件内容。仅限文本文件，二进制文件会被拒绝。"
    "文件过大时（超过 max_file_size）报错。"
)
FILE_WRITE_DESC = (
    "创建或覆盖文件。自动创建父目录。换行符与原文件保持一致。原子写入保证数据安全。"
)
FILE_EDIT_DESC = (
    "替换文件中的指定字符串。replace_all=true 时替换所有匹配项。"
    "保留原文件编码和换行符。"
)


# ---------------------------------------------------------------------------
# Toolkit
# ---------------------------------------------------------------------------

class FileToolkit:
    """Toolkit providing file_read, file_write, file_edit tools."""

    def get_tools(self) -> list[Tool]:
        return [
            LocalFunction(
                card=ToolCard(
                    id="file_read",
                    name="file_read",
                    description=FILE_READ_DESC,
                    input_params=FILE_READ_PARAMS,
                    properties={"truncate_length": 50000},
                ),
                func=self._file_read,
            ),
            LocalFunction(
                card=ToolCard(
                    id="file_write",
                    name="file_write",
                    description=FILE_WRITE_DESC,
                    input_params=FILE_WRITE_PARAMS,
                ),
                func=self._file_write,
            ),
            LocalFunction(
                card=ToolCard(
                    id="file_edit",
                    name="file_edit",
                    description=FILE_EDIT_DESC,
                    input_params=FILE_EDIT_PARAMS,
                ),
                func=self._file_edit,
            ),
        ]

    async def _file_read(self, file_path: str) -> str:

        def _read() -> str:
            cfg = get_file_tools_config()

            # 1. 路径检查
            ok, msg = _is_path_allowed(file_path)
            if not ok:
                return f"[ERROR] {msg}"

            p = Path(file_path)

            # 2. 文件存在性
            if not p.exists():
                return f"[ERROR] FILE_NOT_FOUND: {file_path}"

            # 3. 二进制扩展名检查
            if _has_binary_extension(file_path):
                return f"[ERROR] FILE_IS_BINARY: binary files are not supported ({file_path})"

            # 4. NULL 字节内容检查
            if _is_binary_content(file_path):
                return f"[ERROR] FILE_IS_BINARY: file content appears to be binary ({file_path})"

            # 5. 编码检测
            meta = _detect_encoding_and_line_endings(file_path)

            # 6. UTF-16 不支持
            if meta.encoding.startswith("utf-16"):
                return (
                    f"[ERROR] ENCODING_UNSUPPORTED: UTF-16 encoding is not supported. "
                    f"File: {file_path}"
                )

            # 7. 大小检查
            if meta.size > cfg.max_file_size:
                return (
                    f"[ERROR] FILE_TOO_LARGE: file size {meta.size} bytes exceeds "
                    f"max_file_size {cfg.max_file_size} bytes. File: {file_path}"
                )

            # 8. 读取内容
            try:
                raw_content = p.read_text(encoding=meta.encoding, errors="replace")
                # 归一化换行符
                content = raw_content.replace("\r\n", "\n")
            except OSError as e:
                return f"[ERROR] READ_ERROR: {e}"

            return f"<path>{file_path}</path>\n<file-content>\n{content}\n</file-content>"

        return await asyncio.to_thread(_read)

    async def _file_write(self, file_path: str, content: str, encoding: str = "utf-8") -> str:

        def _write() -> str:
            cfg = get_file_tools_config()

            # 1. 路径检查
            ok, msg = _is_path_allowed(file_path)
            if not ok:
                return f"[ERROR] {msg}"

            p = Path(file_path)

            # 2. 内容大小检查
            content_bytes = content.encode("utf-8")
            if len(content_bytes) > cfg.max_file_size:
                return (
                    f"[ERROR] CONTENT_TOO_LARGE: content size {len(content_bytes)} bytes "
                    f"exceeds max_file_size {cfg.max_file_size} bytes"
                )

            # 3. 检测原文件换行符（若存在）
            original_endings = "LF"
            original_encoding = encoding
            if p.exists():
                try:
                    meta = _detect_encoding_and_line_endings(file_path)
                    original_endings = meta.line_endings
                    original_encoding = meta.encoding
                except OSError:
                    pass

            # 4. 换行符转换
            if original_endings == "CRLF":
                content_to_write = content.replace("\r\n", "\n").replace("\n", "\r\n")
            else:
                content_to_write = content.replace("\r\n", "\n")

            # 5. 创建父目录
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                return f"[ERROR] DIRECTORY_NOT_FOUND: cannot create parent directory: {e}"

            # 6. 原子写入：先写临时文件再 rename
            tmp_path = None
            try:
                dir_fd, tmp_path_str = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
                os.close(dir_fd)
                tmp_path = Path(tmp_path_str)

                write_encoding = original_encoding if not original_encoding.startswith("utf-16") else "utf-8"
                # Write in binary mode to avoid Windows text-mode newline translation
                with open(tmp_path, "wb") as f:
                    f.write(content_to_write.encode(write_encoding))
                tmp_path.replace(p)
            except OSError as e:
                if tmp_path and tmp_path.exists():
                    try:
                        tmp_path.unlink()
                    except OSError:
                        pass
                return f"[ERROR] WRITE_ERROR: {e}"

            return f"[OK] file_write: {file_path} ({len(content)} chars)"

        return await asyncio.to_thread(_write)

    async def _file_edit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> str:

        def _edit() -> str:
            # 1. 路径检查
            ok, msg = _is_path_allowed(file_path)
            if not ok:
                return f"[ERROR] {msg}"

            p = Path(file_path)

            # 2. 文件存在性
            if not p.exists():
                return f"[ERROR] FILE_NOT_FOUND: {file_path}"

            # 3. 二进制检查
            if _has_binary_extension(file_path):
                return f"[ERROR] FILE_IS_BINARY: binary files are not supported ({file_path})"
            if _is_binary_content(file_path):
                return f"[ERROR] FILE_IS_BINARY: file content appears to be binary ({file_path})"

            # 4. no-change 检查
            if old_string == new_string:
                return "[ERROR] NO_CHANGE: old_string and new_string are identical."

            # 5. 读取文件（归一化换行符后）
            try:
                meta = _detect_encoding_and_line_endings(file_path)
                if meta.encoding.startswith("utf-16"):
                    return f"[ERROR] ENCODING_UNSUPPORTED: UTF-16 encoding not supported ({file_path})"
                raw_content = p.read_text(encoding=meta.encoding, errors="replace")
                original_content = raw_content.replace("\r\n", "\n")
            except OSError as e:
                return f"[ERROR] READ_ERROR: {e}"

            # 6. 查找匹配
            if old_string not in original_content:
                return f"[ERROR] OLD_STRING_NOT_FOUND: old_string not found in file ({file_path})"

            # 7. 多匹配检查
            count = original_content.count(old_string)
            if count > 1 and not replace_all:
                return (
                    f"[ERROR] MULTIPLE_MATCHES: found {count} occurrences of old_string, "
                    f"but replace_all is False. Set replace_all=True to replace all, "
                    f"or provide more context in old_string to match only one occurrence."
                )

            # 8. 执行替换
            if replace_all:
                updated_content = original_content.replace(old_string, new_string)
            else:
                updated_content = original_content.replace(old_string, new_string, 1)

            # 9. 写回（保持原编码和换行符）
            if meta.line_endings == "CRLF":
                updated_content = updated_content.replace("\r\n", "\n").replace("\n", "\r\n")

            try:
                write_encoding = meta.encoding if not meta.encoding.startswith("utf-16") else "utf-8"
                p.write_text(updated_content, encoding=write_encoding)
            except OSError as e:
                return f"[ERROR] WRITE_ERROR: {e}"

            action = "replaced all" if replace_all else "replaced 1"
            return f"[OK] file_edit: {action} in {file_path} ({count} occurrence(s))"

        return await asyncio.to_thread(_edit)
