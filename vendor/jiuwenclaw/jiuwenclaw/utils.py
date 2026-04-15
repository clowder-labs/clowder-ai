# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Path management for JiuWenClaw.

Runtime layout（根目录见 ``runtime_paths.USER_WORKSPACE_DIR``：默认 ``~/.jiuwenclaw``；若设置环境变量
``JIUWENCLAW_DATA_DIR`` 则为该路径本身，须为可直接使用的绝对路径，由宿主负责拼出 ``…/.jiuwenclaw`` 等布局）:
- <workspace>/config/config.yaml
- <workspace>/config/.env
- <workspace>/agent/home
- <workspace>/agent/memory
- <workspace>/agent/skills
- <workspace>/agent/sessions
- <workspace>/agent/workspace（运行时文件与 agent-data.json）
- <workspace>/.checkpoint
- <workspace>/.logs

内置模板位于包内 ``jiuwenclaw/resources/``（含 ``agent/`` 下 HEARTBEAT_ZH/EN、PRINCIPLE、TONE 等，以及 ``skills_state.json``）。
"""

import importlib.util
import json
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Literal, Optional
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap
from jiuwenclaw.logging.app_logger import logger
from jiuwenclaw.runtime_paths import USER_WORKSPACE_DIR



# Cache for resolved paths
_config_dir: Path | None = None
_workspace_dir: Path | None = None
_root_dir: Path | None = None
_is_package: bool | None = None
_initialized: bool = False


def _split_env_list(raw: str, sep: str) -> list[str]:
    return [part.strip() for part in raw.split(sep) if part.strip()]


def get_shared_agent_skills_dirs() -> list[Path]:
    raw = (os.getenv("JIUWENCLAW_SHARED_SKILLS_DIRS") or "").strip()
    if not raw:
        return []

    dirs: list[Path] = []
    seen: set[str] = set()
    for part in _split_env_list(raw, os.pathsep):
        path = Path(part).expanduser().resolve()
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        dirs.append(path)
    return dirs


def get_disabled_agent_skill_names() -> set[str]:
    raw = (os.getenv("JIUWENCLAW_DISABLED_SKILLS") or "").strip()
    if not raw:
        return set()
    return {part for part in _split_env_list(raw, ",") if part}


def get_agent_skill_source_dirs() -> list[Path]:
    dirs: list[Path] = []
    seen: set[str] = set()
    agent_skill_dirs = [get_agent_skills_dir()]
    if get_shared_agent_skills_dirs():
        agent_skill_dirs = get_shared_agent_skills_dirs()
    for path in agent_skill_dirs:
        resolved = path.expanduser().resolve()
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        dirs.append(resolved)
    return dirs


def get_agent_registered_skill_dirs() -> list[Path]:
    if get_shared_agent_skills_dirs():
        return get_shared_agent_skills_dirs()
    return [get_agent_skills_dir()]


def _iter_skill_dirs(base_dir: Path) -> list[Path]:
    if not base_dir.exists():
        return []
    try:
        return sorted(
            [
                child
                for child in base_dir.iterdir()
                if child.is_dir() and not child.name.startswith("_") and (child / "SKILL.md").is_file()
            ],
            key=lambda item: item.name,
        )
    except Exception:
        return []


def _detect_installation_mode() -> bool:
    """Detect if running from a package installation (whl) or PyInstaller bundle."""
    global _is_package
    if _is_package is not None:
        return _is_package

    # PyInstaller 打包后使用用户工作区路径
    if getattr(sys, "frozen", False):
        _is_package = True
        return True

    # Check if module is in site-packages
    module_file = Path(__file__).resolve()

    # Check if module file is in any site-packages directory
    for path in sys.path:
        site_packages = Path(path)
        if "site-packages" in str(site_packages) and site_packages in module_file.parents:
            _is_package = True
            return True

    _is_package = False
    return False


def _find_source_root() -> Path:
    """Find the repository root in development mode (contains jiuwenclaw/ package)."""
    current = Path(__file__).resolve().parent.parent
    jw_pkg = current / "jiuwenclaw"
    if (jw_pkg / "resources" / "agent").exists():
        return current
    parent = current.parent
    jw_pkg2 = parent / "jiuwenclaw"
    if (jw_pkg2 / "resources" / "agent").exists():
        return parent
    return current


def _find_package_root() -> Path | None:
    """Best-effort detection of the jiuwenclaw package root.

    In package mode (whl), __file__ is at site-packages/jiuwenclaw/paths.py,
    so parent is site-packages/jiuwenclaw/.
    In editable / source mode, __file__ is at <project>/jiuwenclaw/paths.py,
    so parent is <project>/jiuwenclaw/.
    """
    current = Path(__file__).resolve().parent
    return current


def _resolve_preferred_language(
    config_yaml_dest: Path, explicit: Optional[str]
) -> str:
    """确定初始化使用的语言：显式参数优先，否则读已复制的 config，默认 zh。"""
    if explicit is not None:
        lang = str(explicit).strip().lower()
        return lang if lang in ("zh", "en") else "zh"
    if config_yaml_dest.exists():
        try:
            rt = YAML()
            with open(config_yaml_dest, "r", encoding="utf-8") as f:
                data = rt.load(f) or {}
            lang = str(data.get("preferred_language") or "zh").strip().lower()
            if lang in ("zh", "en"):
                return lang
        except Exception as e:
            logger.error(f"Failed to load config.yaml: {e}")
    return "zh"


def prompt_preferred_language() -> Optional[Literal["zh", "en"]]:
    """交互询问语言偏好。仅接受明确选项；空输入、不在列表或取消用语 → 返回 None（调用方应终止 init）。"""
    print()
    print("[jiuwenclaw-init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("[jiuwenclaw-init]  请选择默认语言 / Choose your default language")
    print("[jiuwenclaw-init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("[jiuwenclaw-init]   [1] 中文（简体）")
    print("[jiuwenclaw-init]       → config: preferred_language: zh")
    print("[jiuwenclaw-init]       → 复制 PRINCIPLE_ZH.md / TONE_ZH.md 为 home/PRINCIPLE.md、TONE.md")
    print("[jiuwenclaw-init]   ────────────────────────────────────────────")
    print("[jiuwenclaw-init]   [2] English")
    print("[jiuwenclaw-init]       → config: preferred_language: en")
    print("[jiuwenclaw-init]       → copy PRINCIPLE_EN.md / TONE_EN.md → home/PRINCIPLE.md, TONE.md")
    print("[jiuwenclaw-init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("[jiuwenclaw-init]  须明确选择：1 / 2 / zh / en（无默认语言）")
    print("[jiuwenclaw-init]  取消：no / n / q / cancel / 取消")
    print("[jiuwenclaw-init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    raw = input(
        "[jiuwenclaw-init] 请输入选项 (1, 2, zh, en) 或 no 取消: "
    ).strip().lower()
    if raw in ("no", "n", "q", "quit", "cancel", "取消"):
        return None
    if raw in ("1", "zh", "中文", "chinese"):
        return "zh"
    if raw in ("2", "en", "english", "e", "英文"):
        return "en"
    print("[jiuwenclaw-init] 无效选项；未选择有效语言，初始化已取消（与拒绝 yes/no 相同）。")
    return None


def _deep_merge_from_source(source, user):
    """将 source（源码模板）中的新增字段合并到 user（用户配置）。

    规则（以源码模板的 key 顺序为准，确保新增字段插入在正确位置）：
    - source 有、user 没有 → 新增到源码中该 key 所在的位置
    - 两边都有且都是 dict/CommentedMap → 递归合并
    - 两边都有但类型不同或 user 有值 → 保留 user 的值

    返回值类型与 source 一致（保持 ruamel CommentedMap 的顺序）。
    """
    result = CommentedMap()
    src_keys = list(source.keys())
    user_keys = [k for k in user.keys() if k not in src_keys]  # 用户独有但源码已删的 key

    for key in src_keys:
        src_val = source[key]
        if key not in user:
            # 新增字段：按源码位置插入
            result[key] = src_val
        elif isinstance(src_val, dict) and isinstance(user[key], dict):
            # 两边都是 dict → 递归
            merged_sub = _deep_merge_from_source(src_val, user[key])
            result[key] = merged_sub
        else:
            # 保留用户值
            result[key] = user[key]

    # 用户独有 key（源码没有的），追加到末尾
    for key in user_keys:
        result[key] = user[key]

    return result


def _merge_config_from_source(src: Path, dest: Path) -> None:
    """将源码 config.yaml 的新增字段同步到用户 config.yaml（不覆盖用户值）。"""
    try:
        rt = YAML()
        rt.preserve_quotes = True
        rt.default_flow_style = False
        rt.indent(mapping=2, sequence=4, offset=2)
        rt.width = 4096

        with open(src, "r", encoding="utf-8") as f:
            src_data = rt.load(f)
        with open(dest, "r", encoding="utf-8") as f:
            user_data = rt.load(f)

        if src_data is None or user_data is None:
            return

        merged = _deep_merge_from_source(src_data, user_data)

        with open(dest, "w", encoding="utf-8") as f:
            rt.dump(merged, f)
    except Exception as e:
        # 合并失败不影响正常启动，记录日志即可
        logging.getLogger(__name__).warning(
            "Failed to merge config from source %s -> %s: %s", src, dest, e
        )


def update_config():
    package_root = _find_package_root()
    if not package_root:
        raise RuntimeError("package root not found")

    USER_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

    # ----- config: copy config.yaml -----
    resources_dir = package_root / "resources"
    config_yaml_src_candidates = [
        resources_dir / "config.yaml",
        package_root / "config" / "config.yaml",
    ]

    config_yaml_src = next((p for p in config_yaml_src_candidates if p.exists()), None)

    if not config_yaml_src:
        raise RuntimeError(
            "config.yaml template not found; tried: "
            + ", ".join(str(p) for p in config_yaml_src_candidates)
        )

    config_dest_dir = USER_WORKSPACE_DIR / "config"
    config_dest_dir.mkdir(parents=True, exist_ok=True)
    config_yaml_dest = config_dest_dir / "config.yaml"
    # 将源码 config.yaml 的新增字段合并到用户 config.yaml，保留用户已有值
    _merge_config_from_source(config_yaml_src, config_yaml_dest)


def prepare_workspace(overwrite: bool = True, preferred_language: Optional[str] = None):
    package_root = _find_package_root()
    if not package_root:
        raise RuntimeError("package root not found")

    USER_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

    # ----- config: copy config.yaml -----
    resources_dir = package_root / "resources"
    config_yaml_src_candidates = [
        resources_dir / "config.yaml",
        package_root / "config" / "config.yaml",
    ]

    config_yaml_src = next((p for p in config_yaml_src_candidates if p.exists()), None)

    if not config_yaml_src:
        raise RuntimeError(
            "config.yaml template not found; tried: "
            + ", ".join(str(p) for p in config_yaml_src_candidates)
        )

    config_dest_dir = USER_WORKSPACE_DIR / "config"
    config_dest_dir.mkdir(parents=True, exist_ok=True)
    config_yaml_dest = config_dest_dir / "config.yaml"

    if overwrite or not config_yaml_dest.exists():
        shutil.copy2(config_yaml_src, config_yaml_dest)

    resolved_lang = _resolve_preferred_language(config_yaml_dest, preferred_language)

    # ----- 内置模板根目录：<package>/resources（含 agent/、skills_state.json）-----
    template_root = resources_dir
    template_agent_dir = template_root / "agent"
    if not template_agent_dir.is_dir():
        raise RuntimeError(f"resources template missing agent dir: {template_agent_dir}")

    # ----- .env: copy from template to config/.env -----
    env_template_src_candidates = [
        resources_dir / ".env.template",
        package_root / ".env.template",
    ]
    env_template_src = next((p for p in env_template_src_candidates if p.exists()), None)
    if not env_template_src:
        raise RuntimeError(
            "env template source not found; tried: "
            + ", ".join(str(p) for p in env_template_src_candidates)
        )
    env_dest = USER_WORKSPACE_DIR / "config" / ".env"
    if overwrite or not env_dest.exists():
        shutil.copy2(env_template_src, env_dest)

    # ----- copy runtime dirs (new layout) -----
    agent_root = USER_WORKSPACE_DIR / "agent"
    agent_home = agent_root / "home"
    agent_skills = agent_root / "skills"
    agent_memory = agent_root / "memory"
    agent_sessions = agent_root / "sessions"
    (USER_WORKSPACE_DIR / ".checkpoint").mkdir(parents=True, exist_ok=True)
    (USER_WORKSPACE_DIR / ".logs").mkdir(parents=True, exist_ok=True)

    template_agent_workspace = template_agent_dir / "workspace"
    template_agent_memory = template_agent_dir / "memory"
    template_agent_skills = template_agent_dir / "skills"

    agent_workspace = agent_root / "workspace"

    def _copy_dir(src_dir: Path, dst_dir: Path) -> None:
        if not src_dir.exists():
            return
        if overwrite and dst_dir.exists():
            shutil.rmtree(dst_dir)
        dst_dir.parent.mkdir(parents=True, exist_ok=True)
        if not dst_dir.exists():
            shutil.copytree(src_dir, dst_dir)
        else:
            shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)

    # agent/workspace 可不在仓库中（agent-data.json 由运行时生成）；无模板子目录时建空目录
    if template_agent_workspace.exists():
        _copy_dir(template_agent_workspace, agent_workspace)
    else:
        if overwrite and agent_workspace.exists():
            shutil.rmtree(agent_workspace)
        agent_workspace.mkdir(parents=True, exist_ok=True)
    _copy_dir(template_agent_memory, agent_memory)
    if not get_shared_agent_skills_dirs():
        _copy_dir(template_agent_skills, agent_skills)

    # home: 按语言将 PRINCIPLE/TONE/HEARTBEAT 模板复制为无后缀的 .md
    if overwrite and agent_home.exists():
        shutil.rmtree(agent_home)
    agent_home.mkdir(parents=True, exist_ok=True)
    suffix = "_ZH" if resolved_lang == "zh" else "_EN"
    _principle_src = template_agent_dir / f"PRINCIPLE{suffix}.md"
    _tone_src = template_agent_dir / f"TONE{suffix}.md"
    _heartbeat_src = template_agent_dir / f"HEARTBEAT{suffix}.md"
    if _principle_src.exists():
        shutil.copy2(_principle_src, agent_home / "PRINCIPLE.md")
    if _tone_src.exists():
        shutil.copy2(_tone_src, agent_home / "TONE.md")
    if _heartbeat_src.exists():
        shutil.copy2(_heartbeat_src, agent_home / "HEARTBEAT.md")

    # skills state: shipped under resources/
    skills_state_src = template_root / "skills_state.json"
    if skills_state_src.exists():
        agent_skills.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skills_state_src, agent_skills / "skills_state.json")

    # sessions is runtime-only (template may not include it)
    agent_sessions.mkdir(parents=True, exist_ok=True)

    # 与 home 模板语言一致，写回顶层 preferred_language
    from jiuwenclaw.config import set_preferred_language_in_config_file

    set_preferred_language_in_config_file(config_yaml_dest, resolved_lang)


def init_user_workspace(overwrite: bool = True) -> Path | Literal["cancelled"]:
    """Initialize ~/.jiuwenclaw from package or source resources.

    资源布局:
    - 模板配置:   <package_root>/resources/config.yaml
    - .env 模板: <package_root>/resources/.env.template
    - 数据模板:   <package_root>/resources/agent（含 HEARTBEAT_ZH/EN 等）、skills_state.json

    上述内容会被复制到:
    - ~/.jiuwenclaw/config/config.yaml（含 preferred_language）
    - ~/.jiuwenclaw/config/.env
    - ~/.jiuwenclaw/agent/...（home 下 PRINCIPLE.md / TONE.md / HEARTBEAT.md 由所选语言决定）

    交互式 init 会先询问语言；首次启动 app 时非交互 prepare_workspace 则沿用模板 config 中的语言。
    """
    if USER_WORKSPACE_DIR.exists():
        # Warn user about data loss and ask for confirmation
        print("[jiuwenclaw-init] WARNING: This will delete all historical configuration and memory information.")
        print("[jiuwenclaw-init] This action cannot be undone.")
        confirmation = input("[jiuwenclaw-init] Do you want to confirm reinitialization? (yes/no): ").strip().lower()

        if confirmation not in ("yes", "y"):
            print("[jiuwenclaw-init] Initialization cancelled. Exiting.")
            return "cancelled"

    lang = prompt_preferred_language()
    if lang is None:
        print("[jiuwenclaw-init] Initialization cancelled. Exiting.")
        return "cancelled"
    print(f"[jiuwenclaw-init] 将使用语言 / Language: {lang}")
    prepare_workspace(overwrite, preferred_language=lang)

    return USER_WORKSPACE_DIR


def _resolve_paths() -> None:
    """Resolve and cache all paths."""
    global _initialized, _config_dir, _workspace_dir, _root_dir

    if _initialized:
        return

    # 优先使用已初始化的用户工作区 (~/.jiuwenclaw)，
    # 保证源码运行与安装包运行后的读写路径完全一致。
    user_config_dir = USER_WORKSPACE_DIR / "config"
    user_workspace_dir = USER_WORKSPACE_DIR / "agent" / "workspace"
    if user_config_dir.exists():
        _root_dir = USER_WORKSPACE_DIR
        _config_dir = user_config_dir
        _workspace_dir = user_workspace_dir
    else:
        # 尚未初始化 ~/.jiuwenclaw：从包内 resources 直读配置，工作区指向包内 agent/workspace
        package_root = _find_package_root()
        if package_root and (package_root / "resources" / "config.yaml").exists():
            res = package_root / "resources"
            _root_dir = package_root.parent
            _config_dir = res
            _workspace_dir = res / "agent" / "workspace"
            _workspace_dir.mkdir(parents=True, exist_ok=True)
        else:
            source_root = _find_source_root()
            pkg = source_root / "jiuwenclaw"
            res = pkg / "resources"
            _root_dir = source_root
            _config_dir = res if (res / "config.yaml").exists() else source_root / "config"
            _workspace_dir = res / "agent" / "workspace"
            _workspace_dir.mkdir(parents=True, exist_ok=True)

    _initialized = True


def get_config_dir() -> Path:
    """Get the config directory path."""
    _resolve_paths()
    return _config_dir


def get_workspace_dir() -> Path:
    """Get the workspace directory path."""
    _resolve_paths()
    return _workspace_dir


def get_root_dir() -> Path:
    """Get the root directory path."""
    _resolve_paths()
    return _root_dir


def get_agent_workspace_dir() -> Path:
    """Get the agent workspace directory path."""
    return USER_WORKSPACE_DIR / "agent" / "workspace"


def get_project_workspace_dir() -> Path:
    project_dir = (os.getenv("JIUWENCLAW_PROJECT_DIR") or "").strip()
    if project_dir:
        return Path(project_dir).resolve()
    return get_workspace_dir()


def get_agent_root_dir() -> Path:
    return USER_WORKSPACE_DIR / "agent"


def get_agent_home_dir() -> Path:
    return get_agent_root_dir() / "home"


def get_agent_memory_dir() -> Path:
    return get_agent_root_dir() / "memory"


def get_agent_skills_dir() -> Path:
    return get_agent_root_dir() / "skills"


def get_agent_tools_dir() -> Path:
    return get_agent_root_dir() / "tools"


def get_agent_sessions_dir() -> Path:
    return get_agent_root_dir() / "sessions"


def get_checkpoint_dir() -> Path:
    return USER_WORKSPACE_DIR / ".checkpoint"


def get_xy_tmp_dir() -> Path:
    xy_tmp_dir = USER_WORKSPACE_DIR / "tmp" / "xiaoyi"
    xy_tmp_dir.mkdir(parents=True, exist_ok=True)
    return xy_tmp_dir


def get_env_file() -> Path:
    return get_config_dir() / ".env"


def get_config_file() -> Path:
    """Get the config.yaml file path."""
    return get_config_dir() / "config.yaml"


def is_package_installation() -> bool:
    """Check if running from package installation."""
    return _detect_installation_mode()


_TOOL_ARGS_LOG_MAX_DEFAULT = 480


def _truncate_tool_args_log_fragment(text: str, *, full_detail: bool) -> str:
    if full_detail or len(text) <= _TOOL_ARGS_LOG_MAX_DEFAULT:
        return text
    return text[:_TOOL_ARGS_LOG_MAX_DEFAULT] + "..."


def _log_tool_args_repair_stage(
    *,
    stage: str,
    before_raw: str,
    outcome: Literal["success", "failed"],
    after_dict: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    """Log one fallback attempt for tool arguments JSON (truncated unless DEBUG)."""
    full_detail = logger.isEnabledFor(logging.DEBUG)
    before_shown = _truncate_tool_args_log_fragment(before_raw, full_detail=full_detail)
    if outcome == "success":
        after_raw = (
            json.dumps(after_dict, ensure_ascii=False)
            if isinstance(after_dict, dict)
            else ""
        )
        after_shown = _truncate_tool_args_log_fragment(after_raw, full_detail=full_detail)
        logger.info(
            "[fix_json_arguments] stage=%s outcome=success before=%s after=%s",
            stage,
            before_shown,
            after_shown,
        )
    else:
        err_shown = _truncate_tool_args_log_fragment(error or "", full_detail=full_detail)
        logger.warning(
            "[fix_json_arguments] stage=%s outcome=failed before=%s error=%s",
            stage,
            before_shown,
            err_shown,
        )


def _fix_missing_quotes(json_str: str) -> str:
    """尝试修复 JSON 字符串中缺失的引号。

    常见修复场景：
    1. 缺少字符串结尾的引号: {"query": hello} -> {"query": "hello"}
    2. 缺少键的引号（部分情况）: {query: "hello"} -> {"query": "hello"}
    3. 路径值缺少引号: {"path": D:/work/code/file.txt} -> {"path": "D:/work/code/file.txt"}

    Args:
        json_str: 可能格式不正确的 JSON 字符串

    Returns:
        修复后的 JSON 字符串，如果无法修复则返回原字符串
    """
    import re

    # 去除前后空白
    s = json_str.strip()

    # 模式 1: 修复 Windows 路径 (如 D:/path/to/file) 或 C:/path
    # 直接匹配 ": D:/..." 或 ": C:/..." 模式并添加引号
    s = re.sub(
        r':\s+([A-Za-z]:/[^\{\[]*?)(?=\s*[,\}\]])',
        lambda m: f': "{m.group(1)}"',
        s
    )

    # 模式 2: 修复缺少右引号的字符串值（非路径）
    # 匹配 ": value" 格式，其中 value 是未加引号的字符串
    # 排除已加引号、保留字、路径（已在模式1处理）
    s = re.sub(
        r':\s+(?!"|true|false|null|\d+|{|\[|:|"|[A-Za-z]:/)([^\s,\}\[\]""]+?)(?=\s*[,}\]])',
        lambda m: f': "{m.group(1)}"',
        s
    )

    # 模式 3: 修复键的引号（如 {key: value} -> {"key": value}）
    # 匹配 {key: 但 key 没有被引号包围
    s = re.sub(
        r'{\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:',
        r'{"\1":',
        s
    )

    return s


def fix_json_arguments(arguments: str | dict) -> str | dict:
    """尝试修复并解析工具调用的参数 JSON。

    当 LLM 返回的 tool_calls.function.arguments 格式不正确时（如缺少引号），
    尝试修复后再解析。

    Args:
        arguments: 工具参数，可以是字符串或已解析的字典

    Returns:
        解析后的参数字典，如果解析失败则返回空字典
    """
    # 如果已经是字典，直接返回
    if not isinstance(arguments, str):
        return arguments

    # 去除前后空白
    s = arguments.strip()

    if not s:
        return {}

    # 第一次尝试：直接解析（成功则不记兜底日志）
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    full_detail = logger.isEnabledFor(logging.DEBUG)

    # 第二次尝试：json-repair
    try:
        import json_repair

        repaired = json_repair.loads(s)
    except Exception as exc:
        _log_tool_args_repair_stage(
            stage="json_repair",
            before_raw=s,
            outcome="failed",
            error=str(exc),
        )
    else:
        if isinstance(repaired, dict):
            _log_tool_args_repair_stage(
                stage="json_repair",
                before_raw=s,
                outcome="success",
                after_dict=repaired,
            )
            return repaired
        _log_tool_args_repair_stage(
            stage="json_repair",
            before_raw=s,
            outcome="failed",
            error=f"repaired_not_object:{type(repaired).__name__}",
        )

    # 第三次尝试：规则修复后解析
    fixed = _fix_missing_quotes(s)
    if fixed != s:
        try:
            result = json.loads(fixed)
        except json.JSONDecodeError as exc:
            _log_tool_args_repair_stage(
                stage="rule_fix",
                before_raw=s,
                outcome="failed",
                error=str(exc),
            )
        else:
            _log_tool_args_repair_stage(
                stage="rule_fix",
                before_raw=s,
                outcome="success",
                after_dict=result,
            )
            return result
    else:
        _log_tool_args_repair_stage(
            stage="rule_fix",
            before_raw=s,
            outcome="failed",
            error="no_structural_change_from_rules",
        )

    before_final = _truncate_tool_args_log_fragment(s, full_detail=full_detail)
    logger.warning(
        "[fix_json_arguments] outcome=failed_all_stages before=%s error=all_repair_attempts_exhausted",
        before_final,
    )
    return {}