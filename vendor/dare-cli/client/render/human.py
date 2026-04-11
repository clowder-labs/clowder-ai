"""Human-readable stdout renderer."""

from __future__ import annotations

import logging
from typing import Any

from client.session import ExecutionMode


class HumanRenderer:
    """Console renderer for interactive and one-shot modes."""

    def __init__(self, *, width: int = 72) -> None:
        self._width = width

    def header(self, title: str) -> None:
        rule = "=" * self._width
        logging.info(f"\n{rule}\n{title}\n{rule}\n")

    def message(self, text: str) -> None:
        logging.info(text)

    def info(self, text: str) -> None:
        logging.info(f"[INFO] {text}")

    def warn(self, text: str) -> None:
        logging.info(f"[WARN] {text}")

    def ok(self, text: str) -> None:
        logging.info(f"[OK] {text}")

    def error(self, text: str) -> None:
        logging.info(f"[ERR] {text}")

    def show_mode(self, mode: ExecutionMode) -> None:
        self.info(f"mode={mode.value}")

    def show_plan(self, plan: Any) -> None:
        self.header("PLAN PREVIEW")
        logging.info(f"Goal: {plan.plan_description}\n")
        if not getattr(plan, "steps", None):
            logging.info("(no steps)")
            return
        for index, step in enumerate(plan.steps, 1):
            title = step.description or step.capability_id
            logging.info(f"{index}. {title}")
            logging.info(f"   evidence: {step.capability_id}")
            params = getattr(step, "params", None)
            if params:
                logging.info(f"   params: {params}")

    def show_json(self, payload: Any) -> None:
        logging.info(payload)
