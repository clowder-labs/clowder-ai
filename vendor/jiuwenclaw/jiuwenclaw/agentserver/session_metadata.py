# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

from __future__ import annotations

import json
import os
from pathlib import Path

from jiuwenclaw.utils import get_agent_sessions_dir, logger

_METADATA_FILENAME = "metadata.json"


def _is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def _safe_session_subdir(session_id: str) -> Path | None:
    stripped = (session_id or "").strip()
    if not stripped or stripped in {".", ".."}:
        return None
    if ".." in stripped or "/" in stripped or "\\" in stripped:
        return None

    base = get_agent_sessions_dir().resolve()
    target = (base / stripped).resolve()
    if target == base or not _is_relative_to(target, base):
        return None
    return target


def load_project_dir(session_id: str) -> str | None:
    session_dir = _safe_session_subdir(session_id)
    if session_dir is None:
        return None

    metadata_path = session_dir / _METADATA_FILENAME
    if not metadata_path.is_file():
        return None

    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        project_dir = payload.get("project_dir")
        if not isinstance(project_dir, str) or not project_dir.strip():
            logger.warning(
                "[JiuWenClaw] Invalid session metadata project_dir for session_id=%s path=%s",
                session_id,
                metadata_path,
            )
            return None
        return str(Path(project_dir.strip()).resolve())
    except (OSError, TypeError, ValueError) as exc:
        logger.warning(
            "[JiuWenClaw] Failed to load session metadata for session_id=%s path=%s: %s",
            session_id,
            metadata_path,
            exc,
        )
        return None


def save_project_dir(session_id: str, resolved: str) -> None:
    session_dir = _safe_session_subdir(session_id)
    if session_dir is None:
        return

    metadata_path = session_dir / _METADATA_FILENAME
    tmp_path = session_dir / f".{_METADATA_FILENAME}.{os.getpid()}.tmp"

    try:
        raw_project_dir = (resolved or "").strip()
        if not raw_project_dir:
            logger.warning(
                "[JiuWenClaw] Refusing to save empty project_dir for session_id=%s path=%s",
                session_id,
                metadata_path,
            )
            return
        project_dir = str(Path(raw_project_dir).resolve())
        session_dir.mkdir(parents=True, exist_ok=True)
        data = json.dumps({"project_dir": project_dir}, ensure_ascii=False, indent=2) + "\n"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_path, metadata_path)
    except OSError as exc:
        logger.warning(
            "[JiuWenClaw] Failed to save session metadata for session_id=%s path=%s: %s",
            session_id,
            metadata_path,
            exc,
        )
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
