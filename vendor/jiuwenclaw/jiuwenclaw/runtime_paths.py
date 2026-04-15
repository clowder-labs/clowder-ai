# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Runtime workspace root for jiuwenclaw user data (no imports from other jiuwenclaw modules)."""

import os
from pathlib import Path

# Absolute path to jiuwenclaw user data root (config, agent/, .logs, etc.).
# Hosts should set this explicitly; when unset, default matches standalone installs.
_raw = os.environ.get("JIUWENCLAW_DATA_DIR", "").strip()
USER_WORKSPACE_DIR = Path(_raw).expanduser().resolve() if _raw else Path.home() / ".jiuwenclaw"
