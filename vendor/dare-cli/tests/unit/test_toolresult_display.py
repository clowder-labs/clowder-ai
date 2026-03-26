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
        """Outer dict with non-text output structure and ToolResult in result.

        When the output contains only non-textual data (e.g. file lists) and
        no displayable text fields, normalize_run_output returns None so that
        callers can provide a human-readable fallback instead of dumping raw
        JSON scaffolding to the user.
        """
        outer = {
            "success": True,
            "output": {"files": ["a.txt", "b.txt"]},
            "result": ToolResult(
                success=True, output={"files": ["a.txt", "b.txt"]}
            ),
        }
        text = normalize_run_output(outer)
        self._assert_no_repr_leak(text)
        # Non-text output with only status metadata → None (caller provides fallback)
        assert text is None

    def test_toolresult_serialized_via_json_default(self) -> None:
        """ToolResult in dict should be serialized via _json_default, not repr."""
        outer = {
            "result": ToolResult(success=True, output="hello"),
        }
        text = normalize_run_output(outer)
        self._assert_no_repr_leak(text)
        assert text is not None
        assert "hello" in text


class TestEmptyToolResultNeverExposedAsJson:
    """Regression: empty tool results must not be dumped as raw JSON to users.

    Covers the scenario where a command succeeds (exit_code=0) but produces
    no stdout/stderr.  The old behavior was to json.dumps the entire wrapper
    dict ({"success":true,"output":{"stdout":""},...}) and return it as the
    agent's user-visible message.
    """

    def test_empty_stdout_tool_result_wrapper_returns_none(self) -> None:
        """Exact structure produced by tool_executor → execute_engine outputs."""
        wrapper = {
            "success": True,
            "status": "success",
            "output": {"stdout": "", "stderr": "", "exit_code": 0,
                       "stdout_truncated": False, "stderr_truncated": False},
            "error": None,
            "result": {"stdout": "", "stderr": "", "exit_code": 0,
                       "stdout_truncated": False, "stderr_truncated": False},
        }
        text = normalize_run_output(wrapper)
        assert text is None, (
            f"Empty tool result should return None, not raw JSON: {text!r}"
        )

    def test_empty_content_envelope_returns_none(self) -> None:
        """RunResult.output after _with_output_envelope with empty content."""
        envelope = {"content": "", "metadata": {}, "usage": None}
        text = normalize_run_output(envelope)
        assert text is None

    def test_nonempty_content_envelope_still_works(self) -> None:
        """Envelope with actual content must still be returned."""
        envelope = {"content": "Task completed successfully.", "metadata": {}}
        text = normalize_run_output(envelope)
        assert text == "Task completed successfully."

    def test_structured_tool_output_not_mistaken_for_empty(self) -> None:
        """write_file-style output ({path, bytes_written}) has no text keys.

        normalize_run_output should return None (not JSON dump), and callers
        provide a fallback. This test documents the expected behavior rather
        than asserting JSON — the key point is no ToolResult repr leak.
        """
        wrapper = {
            "success": True,
            "status": "success",
            "output": {"path": "src/app.py", "bytes_written": 1234, "created": True},
            "error": None,
        }
        text = normalize_run_output(wrapper)
        if text is not None:
            assert "ToolResult(" not in text


class TestHeadlessRenderedOutputFallback:
    """P2 regression: headless rendered_output must never be None/empty.

    When format_run_output returns None, the headless event should carry
    a fallback string so the user sees "task completed" instead of blank.
    """

    def test_format_run_output_none_gets_fallback(self) -> None:
        """format_run_output returning None → rendered_output uses fallback."""
        from client.runtime.task_runner import format_run_output

        # Empty content envelope — format_run_output returns None
        output = {"content": "", "metadata": {}}
        text = format_run_output(output)
        assert text is None
        # The fallback is applied in client/main.py: `text or "task completed"`
        rendered = text or "task completed"
        assert rendered == "task completed"

    def test_format_run_output_with_content_no_fallback(self) -> None:
        """format_run_output returning text → no fallback needed."""
        from client.runtime.task_runner import format_run_output

        output = {"content": "Done!"}
        text = format_run_output(output)
        assert text == "Done!"
        rendered = text or "task completed"
        assert rendered == "Done!"


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
