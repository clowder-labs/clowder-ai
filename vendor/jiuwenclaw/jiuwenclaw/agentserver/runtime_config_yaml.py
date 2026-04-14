# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

"""Runtime config.yaml patch (params.config_yaml): prune/merge + cross-process lock + atomic write."""

from __future__ import annotations

import copy
import os
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any


def deep_merge_dict(dst: dict[str, Any], src: dict[str, Any]) -> None:
    for key, val in src.items():
        if key in dst and isinstance(dst[key], dict) and isinstance(val, dict):
            deep_merge_dict(dst[key], val)
        else:
            dst[key] = val


def prune_to_base(patch: Any, base: Any, prefix: str = "") -> tuple[dict[str, Any], list[str]]:
    """Keep only keys/paths that exist in base; return (pruned_dict, dropped_dot_paths)."""
    dropped: list[str] = []
    if not isinstance(patch, dict):
        if prefix:
            dropped.append(prefix)
        return {}, dropped
    if not isinstance(base, dict):
        for k in patch:
            dropped.append(f"{prefix}.{k}" if prefix else str(k))
        return {}, dropped

    pruned: dict[str, Any] = {}
    for key, val in patch.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if key not in base:
            dropped.append(path)
            continue
        bval = base[key]
        if isinstance(bval, dict) and isinstance(val, dict):
            sub, sub_d = prune_to_base(val, bval, path)
            pruned[key] = sub
            dropped.extend(sub_d)
        else:
            pruned[key] = val
    return pruned, dropped


def merge_pruned_into_base(base: dict[str, Any], pruned: dict[str, Any]) -> dict[str, Any]:
    """Return a deep copy of base with pruned merged in."""
    merged = copy.deepcopy(base)
    deep_merge_dict(merged, pruned)
    return merged


# ---------- config.get (params.config_paths) — 点分子树，无 PyYAML 依赖 ----------


_MISSING = object()


def _value_at_dot_path(root: Any, path: str) -> Any:
    """Navigate dot-separated path; return value or _MISSING if any segment missing."""
    if not isinstance(root, dict):
        return _MISSING
    cur: Any = root
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return _MISSING
        cur = cur[part]
    return cur


def normalize_and_validate_config_paths(raw: list[Any]) -> tuple[list[str] | None, str | None]:
    """Validate §10–§11.1: non-empty array of non-empty strings; forbid root aliases.

    Forbidden (listed for auditors): ``""``, ``"."``, ``"*"``, whitespace-only strings,
    and any path containing an empty segment (e.g. ``a..b`` or leading/trailing ``.``).
    """
    if not isinstance(raw, list) or len(raw) == 0:
        return None, "params.config_paths must be a non-empty array"
    forbidden_root = {"", ".", "*"}
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            return None, "each config_paths entry must be a non-empty string"
        s = item.strip()
        if not s or s in forbidden_root:
            return None, (
                "invalid config_paths entry: empty, whitespace-only, "
                'or forbidden root alias (".", "*")'
            )
        parts = s.split(".")
        if any(not p for p in parts):
            return None, "invalid config_paths entry: empty path segment"
        if s not in seen:
            seen.add(s)
            out.append(s)
    if not out:
        return None, "params.config_paths must contain at least one valid path after deduplication"
    return out, None


def build_config_subtrees_payload(root: Any, paths: list[str]) -> tuple[dict[str, Any] | None, list[str]]:
    """§11.3: all paths must exist. Returns (trees, missing_paths); trees is None if any missing."""
    if not isinstance(root, dict):
        root = {}
    missing: list[str] = []
    for path in paths:
        if _value_at_dot_path(root, path) is _MISSING:
            missing.append(path)
    if missing:
        return None, missing
    trees: dict[str, Any] = {}
    for path in paths:
        trees[path] = copy.deepcopy(_value_at_dot_path(root, path))
    return trees, []


# ---------- 锁 + 落盘 ----------


class ConfigYamlLockTimeoutError(TimeoutError):
    """Exclusive lock on config.yaml.lock could not be acquired in time."""


def _atomic_write_yaml(target: Path, data: dict[str, Any]) -> None:
    import yaml

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp")
    text = yaml.safe_dump(
        data,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    )
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, target)


@contextmanager
def _exclusive_lock_file(lock_path: Path, *, timeout_sec: float = 30.0, poll_sec: float = 0.05):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout_sec

    if sys.platform == "win32":
        import msvcrt

        fh = open(lock_path, "a+b")
        try:
            fh.seek(0, os.SEEK_END)
            if fh.tell() == 0:
                fh.write(b"\0")
                fh.flush()
            fh.seek(0)
            while True:
                try:
                    msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        fh.close()
                        raise ConfigYamlLockTimeoutError(
                            f"config yaml lock timeout: {lock_path}"
                        ) from None
                    time.sleep(poll_sec)
            yield
        finally:
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
            fh.close()
    else:
        import fcntl

        fh = open(lock_path, "a+")
        try:
            while True:
                try:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        fh.close()
                        raise ConfigYamlLockTimeoutError(
                            f"config yaml lock timeout: {lock_path}"
                        ) from None
                    time.sleep(poll_sec)
            yield
        finally:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            fh.close()


def apply_config_yaml_patch(
    patch: dict[str, Any],
    *,
    config_path: Path | None = None,
    lock_timeout_sec: float = 30.0,
) -> dict[str, Any]:
    """
    Read get_config_file(), prune patch to base shape, merge, atomic write.
    Blocking; call from asyncio.to_thread under async handlers.
    """
    import yaml
    from jiuwenclaw.utils import get_config_file
    from jiuwenclaw.logging.app_logger import logger

    path = config_path or get_config_file()
    lock_path = path.parent / "config.yaml.lock"

    with _exclusive_lock_file(lock_path, timeout_sec=lock_timeout_sec):
        if path.is_file():
            with open(path, encoding="utf-8") as f:
                base_raw = yaml.safe_load(f)
        else:
            base_raw = {}
        base: dict[str, Any] = base_raw if isinstance(base_raw, dict) else {}

        pruned, dropped = prune_to_base(patch, base)
        for p in dropped:
            logger.warning("[config_yaml] dropped field not in current config: %s", p)

        merged = merge_pruned_into_base(base, pruned)
        _atomic_write_yaml(path, merged)

    return {
        "updated_top_level_keys": list(pruned.keys()),
        "dropped_paths": dropped,
        "yaml_written": True,
    }
