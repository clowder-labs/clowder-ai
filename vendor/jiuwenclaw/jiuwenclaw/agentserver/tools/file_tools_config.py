# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""File tools configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from jiuwenclaw.utils import get_workspace_dir


@dataclass
class FileToolsConfig:
    allow_any_path: bool = False
    allowed_dirs: List[str] = field(default_factory=list)
    max_file_size: int = 262144          # 256 KB
    max_output_chars: int = 100000        # 100K chars
    allow_hidden_files: bool = False


def _get_file_tools_config() -> FileToolsConfig:
    """从环境变量读取 file_tools 配置，返回带默认值的 config 对象。

    支持的 env 变量：
      FILE_TOOLS_ALLOW_ANY_PATH=0|1
      FILE_TOOLS_ALLOWED_DIRS=/path/a:/path/b
      FILE_TOOLS_MAX_FILE_SIZE=262144
      FILE_TOOLS_MAX_OUTPUT_CHARS=100000
      FILE_TOOLS_ALLOW_HIDDEN_FILES=0|1
    """
    return FileToolsConfig(
        allow_any_path=_env_bool("FILE_TOOLS_ALLOW_ANY_PATH", False),
        allowed_dirs=_env_list("FILE_TOOLS_ALLOWED_DIRS"),
        max_file_size=_env_int("FILE_TOOLS_MAX_FILE_SIZE", 262144),
        max_output_chars=_env_int("FILE_TOOLS_MAX_OUTPUT_CHARS", 100000),
        allow_hidden_files=_env_bool("FILE_TOOLS_ALLOW_HIDDEN_FILES", False),
    )


def _env_bool(key: str, default: bool) -> bool:
    val = os.environ.get(key, "").strip().lower()
    if val in ("1", "true", "yes"):
        return True
    if val in ("0", "false", "no", ""):
        return False
    return default


def _env_int(key: str, default: int) -> int:
    val = os.environ.get(key, "").strip()
    try:
        return max(1, int(val))
    except ValueError:
        return default


def _env_list(key: str) -> List[str]:
    val = os.environ.get(key, "").strip()
    if not val:
        return []
    return [p.strip() for p in val.split(":") if p.strip()]


# 模块级缓存，进程生命周期内只读一次
_config: FileToolsConfig | None = None


def get_file_tools_config() -> FileToolsConfig:
    global _config
    if _config is None:
        _config = _get_file_tools_config()
    return _config
