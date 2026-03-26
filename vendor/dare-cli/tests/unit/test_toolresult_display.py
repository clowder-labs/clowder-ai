"""Regression tests for ToolResult display normalization.

Ensures ToolResult objects are never exposed as raw Python repr
in chat messages (fixes: PR #52).
"""

from __future__ import annotations

import pytest

from dare_framework.agent._internal.output_normalizer import (
    extract_text_payload,
    normalize_run_output,
)
from dare_framework.tool.types import ToolResult


class TestToolResultNeverLeaksRepr:
    """No normalize path should produce 'ToolResult(' in output text."""

    @staticmethod
    def _assert_no_repr_leak(text: str | None) -> None:
        if text is not None:
            assert "ToolResult(" not in text, f"ToolResult repr leaked: {text!r}"

    def test_command_stdout(self) -> None:
        tr = ToolResult(
            success=True,
            output={"stdout": "       9\n", "stderr": "", "exit_code": 0},
        )
        text = normalize_run_output(tr.output)
        self._assert_no_repr_leak(text)
        assert text is not None
        assert "9" in text

    def test_content_field(self) -> None:
        tr = ToolResult(success=True, output={"content": "Hello world"})
        text = normalize_run_output(tr.output)
        assert text == "Hello world"

    def test_plain_string_output(self) -> None:
        tr = ToolResult(success=True, output="Done!")
        text = normalize_run_output(tr.output)
        assert text == "Done!"

    def test_empty_stdout_with_stderr(self) -> None:
        tr = ToolResult(
            success=True,
            output={"stdout": "", "stderr": "error msg", "exit_code": 1},
        )
        text = normalize_run_output(tr.output)
        self._assert_no_repr_leak(text)
        # Should fallback to JSON, not repr
        assert text is not None

    def test_empty_dict_output(self) -> None:
        tr = ToolResult(success=True, output={})
        text = normalize_run_output(tr.output)
        self._assert_no_repr_leak(text)

    def test_none_output(self) -> None:
        tr = ToolResult(success=True, output=None)
        text = normalize_run_output(tr.output)
        assert text is None

    def test_nested_toolresult(self) -> None:
        """Pathological case: ToolResult wrapping another ToolResult."""
        inner = ToolResult(success=False, output="inner text")
        outer = ToolResult(success=True, output=inner)
        text = normalize_run_output(outer.output)
        self._assert_no_repr_leak(text)
        assert text == "inner text"

    def test_extract_text_payload_with_toolresult(self) -> None:
        """extract_text_payload should recurse into ToolResult.output."""
        tr = ToolResult(success=True, output={"content": "extracted"})
        text = extract_text_payload(tr)
        self._assert_no_repr_leak(text)
        assert text == "extracted"


class TestOuterPayloadToolResult:
    """Test runtime-shaped dicts where ToolResult is nested in a 'result' field.

    This covers the real execute_engine path where tool_result dicts contain
    a 'result' key holding a ToolResult object (codex review round 2).
    """

    @staticmethod
    def _assert_no_repr_leak(text: str | None) -> None:
        if text is not None:
            assert "ToolResult(" not in text, f"ToolResult repr leaked: {text!r}"

    def test_stderr_only_outer_payload(self) -> None:
        """Outer dict with empty stdout, stderr content, and ToolResult in result."""
        outer = {
            "success": True,
            "output": {"stdout": "", "stderr": "some error", "exit_code": 1},
            "result": ToolResult(
                success=True,
                output={"stdout": "", "stderr": "some error", "exit_code": 1},
            ),
        }
        text = normalize_run_output(outer)
        self._assert_no_repr_leak(text)
        assert text is not None

    def test_nontext_output_outer_payload(self) -> None:
        """Outer dict with non-text output structure and ToolResult in result."""
        outer = {
            "success": True,
            "output": {"files": ["a.txt", "b.txt"]},
            "result": ToolResult(
                success=True, output={"files": ["a.txt", "b.txt"]}
            ),
        }
        text = normalize_run_output(outer)
        self._assert_no_repr_leak(text)
        assert text is not None

    def test_toolresult_serialized_via_json_default(self) -> None:
        """ToolResult in dict should be serialized via _json_default, not repr."""
        outer = {
            "result": ToolResult(success=True, output="hello"),
        }
        text = normalize_run_output(outer)
        self._assert_no_repr_leak(text)
        assert text is not None
        assert "hello" in text


class TestBuildReplyEnvelopeToolResult:
    """Test _build_reply_envelope handles ToolResult correctly."""

    def test_toolresult_produces_readable_text(self) -> None:
        from dare_framework.transport._internal.default_channel import (
            _build_reply_envelope,
        )

        tr = ToolResult(
            success=True,
            output={"stdout": "hello\n", "stderr": "", "exit_code": 0},
        )
        envelope = _build_reply_envelope(
            reply_to=None, kind="message", target="test", ok=True, result=tr
        )
        text = envelope.payload.text
        assert "ToolResult(" not in text
        assert "hello" in text

    def test_dict_result_still_works(self) -> None:
        from dare_framework.transport._internal.default_channel import (
            _build_reply_envelope,
        )

        result = {"output": "some output"}
        envelope = _build_reply_envelope(
            reply_to=None, kind="message", target="test", ok=True, result=result
        )
        assert envelope.payload.text == "some output"

    def test_string_result_still_works(self) -> None:
        from dare_framework.transport._internal.default_channel import (
            _build_reply_envelope,
        )

        envelope = _build_reply_envelope(
            reply_to=None, kind="message", target="test", ok=True, result="plain text"
        )
        assert envelope.payload.text == "plain text"
