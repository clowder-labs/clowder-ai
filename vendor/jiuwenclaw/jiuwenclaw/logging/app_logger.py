import logging
import os
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

from jiuwenclaw.runtime_paths import USER_WORKSPACE_DIR

_MASK = "******"
# 匹配常见敏感字段键值对（不要求值必须带引号），用于覆盖:
# - token=abc
# - api_key: sk-xxx
# - authorization = Bearer ...
# 分组说明：
# 1) 敏感键名；2) 分隔符及两侧空白（: 或 =）；3/4) 可选引号（当前替换逻辑未直接使用）
_KV_SENSITIVE_PATTERN = re.compile(
    r'(?i)(?<![A-Za-z0-9])(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|user[_-]?id|userid)(?![A-Za-z0-9])(\s*[:=]\s*)(["\']?)[^,\s"\'\]\}]+(["\']?)'
)
# 匹配“键名包含敏感关键词”且“值被引号包裹”的场景，覆盖:
# - 'CAT_CAFE_CALLBACK_TOKEN': 'xxxx'
# - 'CAT_CAFE_USER_ID': 'CSDN-weixin'
# - "my_private_key"="xxxx"
# 分组说明：
# 1) 完整的 key + 分隔符（含可选引号）
# 2) 值的起始引号（' 或 "）
# 3) 值内容（非贪婪）
# 4) 结束引号（通过 (\2) 强制与起始引号一致）
_NAMED_SENSITIVE_KV_PATTERN = re.compile(
    r'(?i)(["\']?[A-Za-z0-9_.-]*(?:token|secret|password|passwd|pwd|api[_-]?key|authorization|credential|private[_-]?key|user[_-]?id|userid)[A-Za-z0-9_.-]*["\']?\s*[:=]\s*)(["\'])(.*?)(\2)'
)
# 匹配 Authorization Bearer 令牌，保留 "Bearer " 前缀，仅掩码后面的令牌值。
_BEARER_SENSITIVE_PATTERN = re.compile(r"(?i)\b(Bearer\s+)[A-Za-z0-9\-._~+/]+=*")
_SENSITIVE_PATTERNS: list[re.Pattern[str]] = [
    # 匹配 JWT（header.payload.signature 三段式，常见以 eyJ 开头）。
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    # 匹配 OpenAI 风格 key（sk- 前缀）。
    re.compile(r"\bsk-[A-Za-z0-9]{8,}\b"),
    # 匹配 GitHub Personal Access Token（ghp_ 前缀）。
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    # 匹配 GitLab Personal Access Token（glpat- 前缀）。
    re.compile(r"\bglpat-[A-Za-z0-9_-]{20,}\b"),
    # 匹配邮箱地址（避免日志中泄露个人身份信息）。
    re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}\b"),
    # 匹配中国大陆手机号（可带 +86 或 86 前缀，支持空格/短横线分隔）。
    re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)"),
    # 匹配中国身份证号（18 位，最后一位可为 X/x）。
    re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)"),
]


def get_logs_dir() -> Path:
    """Return default logs directory for jiuwenclaw application logs."""
    return USER_WORKSPACE_DIR / ".logs"


def _sanitize_log_text(text: str) -> str:
    if not text:
        return text

    masked = text
    masked = _KV_SENSITIVE_PATTERN.sub(r"\1\2" + _MASK, masked)
    masked = _NAMED_SENSITIVE_KV_PATTERN.sub(r"\1\2" + _MASK + r"\2", masked)
    masked = _BEARER_SENSITIVE_PATTERN.sub(r"\1" + _MASK, masked)
    for pattern in _SENSITIVE_PATTERNS:
        masked = pattern.sub(_MASK, masked)
    return masked


class SensitiveDataFilter(logging.Filter):
    """Mask sensitive data in all log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
            record.msg = _sanitize_log_text(message)
            record.args = ()
        except Exception:
            # Never block logging because of desensitization failure.
            pass
        return True


def setup_logger(log_level: str = "INFO", logs_root: Path | None = None) -> logging.Logger:
    """Setup app logger with console/file handlers and privacy masking."""
    if logs_root is None:
        logs_root = get_logs_dir()
    logs_root.mkdir(parents=True, exist_ok=True)

    logger_app = logging.getLogger("jiuwenclaw.app")
    logger_app.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    logger_app.propagate = False
    for handler in logger_app.handlers[:]:
        handler.close()
        logger_app.removeHandler(handler)

    formatter = logging.Formatter(
        fmt="%(asctime)s.%(msecs)03d [%(process)d] %(levelname)s %(name)s %(filename)s:%(lineno)d: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    privacy_filter = SensitiveDataFilter()
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    stream_handler.addFilter(privacy_filter)

    file_handler = RotatingFileHandler(
        filename=logs_root / "app.log",
        maxBytes=20 * 1024 * 1024,
        backupCount=20,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(privacy_filter)

    logger_app.addHandler(stream_handler)
    logger_app.addHandler(file_handler)
    return logger_app


logger = setup_logger(os.getenv("LOG_LEVEL", "INFO"))
