# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Skill loading tools — 加载 skill 信息到 LLM 上下文.

提供两个工具:
- skill_initial_load: 初始加载某个 skill，扫描目录结构 + 读取 SKILL.md 前 5K 字符
- skill_read_content: 按文件路径和偏移继续读取内容（5K 分片）
"""

from __future__ import annotations

import os
from pathlib import Path

from openjiuwen.core.foundation.tool import LocalFunction, Tool, ToolCard

from jiuwenclaw.utils import get_agent_skill_source_dirs, logger

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

_CHUNK_SIZE = 20000  # 每次读取的最大字符数

_SKILL_INITIAL_LOAD_DESC = (
    "初始加载某个 skill 的概览信息。会扫描该 skill 的目录结构，"
    "并读取 SKILL.md 文件的前 5000 字符作为工作说明。"
    "适用于首次了解某个 skill 的功能和使用方式。"
)

_SKILL_INITIAL_LOAD_PARAMS = {
    "type": "object",
    "properties": {
        "skill_name": {
            "type": "string",
            "description": "要加载的 skill 名称，支持多层路径如 a/b",
        },
    },
    "required": ["skill_name"],
}

_SKILL_READ_CONTENT_DESC = (
    "按文件路径和偏移量继续读取 skill 文件内容，每次最多读取 5000 字符。"
    "当 skill_initial_load 提示还有剩余内容时，使用本工具继续读取。"
)

_SKILL_READ_CONTENT_PARAMS = {
    "type": "object",
    "properties": {
        "file_path": {
            "type": "string",
            "description": "要读取的文件绝对路径",
        },
        "offset": {
            "type": "integer",
            "description": "字符偏移位置，默认 0",
            "default": 0,
        },
    },
    "required": ["file_path"],
}


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


def _find_skill_dir(skill_name: str) -> Path | None:
    """在所有 skill 源目录中查找指定名称的 skill 目录。

    支持多层路径，如 "a/b" 表示 base_dir/a/b/SKILL.md。
    """
    parts = skill_name.replace("\\", "/").strip("/").split("/")
    for base_dir in get_agent_skill_source_dirs():
        if not base_dir.exists():
            continue
        candidate = base_dir.joinpath(*parts)
        if candidate.is_dir() and (candidate / "SKILL.md").is_file():
            return candidate
        # 兼容：遍历一级子目录做简单名匹配（单层 skill_name 的快速路径）
        if len(parts) == 1:
            for child in base_dir.iterdir():
                if not child.is_dir() or child.name.startswith("_"):
                    continue
                if child.name == skill_name and (child / "SKILL.md").is_file():
                    return child
    return None


def _build_tree(directory: Path, prefix: str = "", max_depth: int = 3, depth: int = 0) -> str:
    """构建目录树结构的字符串表示。

    Args:
        directory: 目录路径
        prefix: 前缀（用于缩进连接线）
        max_depth: 最大递归深度
        depth: 当前深度
    """
    if depth > max_depth:
        return ""

    lines: list[str] = []
    try:
        entries = sorted(directory.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except PermissionError:
        return prefix + "[permission denied]\n"

    # 跳过 node_modules 和 .git 等大型无关目录
    skip_dirs = {"node_modules", ".git", "__pycache__", ".mypy_cache", ".pytest_cache"}
    entries = [e for e in entries if e.name not in skip_dirs and not e.name.startswith(".")]

    for i, entry in enumerate(entries):
        is_last = i == len(entries) - 1
        connector = "└── " if is_last else "├── "
        child_prefix = "    " if is_last else "│   "

        if entry.is_dir():
            lines.append(f"{prefix}{connector}{entry.name}/")
            subtree = _build_tree(entry, prefix + child_prefix, max_depth, depth + 1)
            if subtree:
                lines.append(subtree)
        else:
            lines.append(f"{prefix}{connector}{entry.name}")

    return "\n".join(lines)


def _read_file_chunk(file_path: str, offset: int = 0, chunk_size: int = _CHUNK_SIZE) -> tuple[str, int, bool]:
    """读取文件的一个分片。

    Returns:
        (content, total_size, has_more)
    """
    p = Path(file_path)
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return f"[ERROR] 无法读取文件: {exc}", 0, False

    total_size = len(text)
    chunk = text[offset : offset + chunk_size]
    has_more = offset + chunk_size < total_size
    return chunk, total_size, has_more


# ---------------------------------------------------------------------------
# Toolkit
# ---------------------------------------------------------------------------


class LoadSkillToolkit:
    """提供 skill_initial_load 和 skill_read_content 两个工具。"""

    def get_tools(self) -> list[Tool]:
        return [
            LocalFunction(
                card=ToolCard(
                    id="skill_initial_load",
                    name="skill_initial_load",
                    description=_SKILL_INITIAL_LOAD_DESC,
                    input_params=_SKILL_INITIAL_LOAD_PARAMS,
                ),
                func=self._skill_initial_load,
            ),
            LocalFunction(
                card=ToolCard(
                    id="skill_read_content",
                    name="skill_read_content",
                    description=_SKILL_READ_CONTENT_DESC,
                    input_params=_SKILL_READ_CONTENT_PARAMS,
                ),
                func=self._skill_read_content,
            ),
        ]

    async def _skill_initial_load(self, skill_name: str) -> str:
        """初始加载 skill：扫描目录结构 + 读取 SKILL.md 前 5K 字符。"""
        # 1. 查找 skill 目录
        skill_dir = _find_skill_dir(skill_name)
        if skill_dir is None:
            available = self._list_available_skill_names()
            available_hint = f"当前可用的 skill 有: {', '.join(available)}" if available else "当前没有已安装的 skill"
            return f"[ERROR] 未找到 skill: {skill_name}。{available_hint}"

        # 2. 构建目录树
        tree = _build_tree(skill_dir)

        # 3. 读取 SKILL.md 前 5K 字符
        skill_md_path = skill_dir / "SKILL.md"
        chunk, total_size, has_more = _read_file_chunk(str(skill_md_path), offset=0)

        # 4. 组装返回信息
        result_parts = [
            f"## {skill_name} skill 概览\n",
            f"### 目录结构\n```\n{skill_dir.name}/\n{tree}\n```\n",
            f"### 工作说明 (SKILL.md)\n{chunk}",
        ]

        if has_more:
            result_parts.append(
                f"\n\n工作说明剩余内容，请在需要时使用 skill_read_content 工具继续读取 SKILL.md"
                f"（文件路径: {skill_md_path}，偏移: {_CHUNK_SIZE}）"
            )

        logger.info("[LoadSkillTools] 初始加载 skill '%s' 成功，SKILL.md 总长 %d 字符", skill_name, total_size)
        return "\n".join(result_parts)

    async def _skill_read_content(self, file_path: str, offset: int = 0) -> str:
        """按文件路径和偏移读取内容。"""
        p = Path(file_path)

        # 安全检查：确保路径在 skill 源目录下
        skill_dirs = get_agent_skill_source_dirs()
        allowed = False
        for sd in skill_dirs:
            try:
                p.resolve().relative_to(sd.resolve())
                allowed = True
                break
            except ValueError:
                pass

        if not allowed:
            return f"[ERROR] 文件路径不在 skill 目录范围内: {file_path}"

        if not p.exists():
            return f"[ERROR] 文件不存在: {file_path}"

        if not p.is_file():
            return f"[ERROR] 路径不是文件: {file_path}"

        chunk, total_size, has_more = _read_file_chunk(file_path, offset)

        result_parts = [
            f"### 文件: {file_path} (偏移: {offset}, 总长: {total_size} 字符)\n",
            chunk,
        ]

        if has_more:
            next_offset = offset + _CHUNK_SIZE
            result_parts.append(
                f"\n\n工作说明剩余内容，请在需要时使用 skill_read_content 工具继续读取 SKILL.md"
                f"（文件路径: {file_path}，偏移: {next_offset}）"
            )

        return "\n".join(result_parts)

    @staticmethod
    def _list_available_skill_names() -> list[str]:
        """列出所有可用的 skill 名称。"""
        names: list[str] = []
        seen: set[str] = set()
        for base_dir in get_agent_skill_source_dirs():
            if not base_dir.exists():
                continue
            try:
                for child in sorted(base_dir.iterdir(), key=lambda x: x.name):
                    if not child.is_dir() or child.name.startswith("_"):
                        continue
                    if child.name in seen:
                        continue
                    if (child / "SKILL.md").is_file():
                        names.append(child.name)
                        seen.add(child.name)
            except Exception:
                continue
        return names
