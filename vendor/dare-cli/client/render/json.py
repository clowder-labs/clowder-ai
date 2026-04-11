"""JSON renderer used in non-interactive automation flows."""

from __future__ import annotations

import json
import logging
from typing import Any


class JsonRenderer:
    """Write structured output only."""

    def emit(self, payload: Any) -> None:
        logging.info(json.dumps(payload, ensure_ascii=False))
