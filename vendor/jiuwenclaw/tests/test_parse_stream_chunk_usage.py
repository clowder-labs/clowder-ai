"""Tests for _parse_stream_chunk() usage extraction logic.

Verifies that token usage data flows correctly through the stream
chunk parser for all event paths: chat.final, chat.error, empty
content with usage, and chunked deltas.
"""

import sys
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Add jiuwenclaw to path so we can import
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jiuwenclaw.agentserver.interface import JiuWenClaw


@dataclass
class FakeOutputSchema:
    """Minimal OutputSchema mock with type + payload."""

    type: str = ""
    payload: dict = field(default_factory=dict)


class TestParseStreamChunkUsage(unittest.TestCase):
    """Test _parse_stream_chunk static method for usage extraction."""

    parse = staticmethod(JiuWenClaw._parse_stream_chunk)

    def test_chat_final_with_usage_in_payload(self):
        """Usage at payload top level (was_streamed / chunked path)."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {"output": "Hello!", "result_type": "answer"},
                "result_type": "answer",
                "usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.final"
        assert result["content"] == "Hello!"
        assert result["usage"]["input_tokens"] == 100
        assert result["usage"]["output_tokens"] == 50

    def test_chat_final_with_usage_in_output(self):
        """Usage nested in output dict (single-answer path)."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {
                    "output": "World!",
                    "result_type": "answer",
                    "usage": {"input_tokens": 200, "output_tokens": 80, "total_tokens": 280},
                },
                "result_type": "answer",
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.final"
        assert result["usage"]["input_tokens"] == 200

    def test_chat_final_without_usage(self):
        """No usage present — should not have usage key."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {"output": "No tokens", "result_type": "answer"},
                "result_type": "answer",
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.final"
        assert "usage" not in result

    def test_empty_content_with_usage_returns_chat_final(self):
        """Streamed=True final marker: empty content but usage present."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {"output": "", "result_type": "answer", "streamed": True},
                "result_type": "answer",
                "usage": {"input_tokens": 300, "output_tokens": 120, "total_tokens": 420},
            },
        )
        result = self.parse(chunk)
        assert result is not None, "Should NOT return None when usage is present"
        assert result["event_type"] == "chat.final"
        assert result["content"] == ""
        assert result["usage"]["input_tokens"] == 300

    def test_empty_content_without_usage_returns_none(self):
        """Streamed=True without usage — should still return None."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {"output": "", "result_type": "answer", "streamed": True},
                "result_type": "answer",
            },
        )
        result = self.parse(chunk)
        assert result is None

    def test_chat_error_with_usage(self):
        """Error event carries usage if available."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "result_type": "error",
                "output": "Something went wrong",
                "usage": {"input_tokens": 50, "output_tokens": 0, "total_tokens": 50},
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.error"
        assert result["usage"]["input_tokens"] == 50

    def test_chat_error_without_usage(self):
        """Error event without usage should not have usage key."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "result_type": "error",
                "output": "Error occurred",
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.error"
        assert "usage" not in result

    def test_chunked_delta_with_usage(self):
        """Chunked answer carries usage on first chunk."""
        chunk = FakeOutputSchema(
            type="answer",
            payload={
                "output": {
                    "output": "Chunk 1",
                    "result_type": "answer",
                    "chunked": True,
                    "chunk_index": 0,
                    "total_chunks": 2,
                },
                "result_type": "answer",
                "usage": {"input_tokens": 400, "output_tokens": 200, "total_tokens": 600},
            },
        )
        result = self.parse(chunk)
        assert result is not None
        assert result["event_type"] == "chat.delta"
        assert result["usage"]["input_tokens"] == 400


if __name__ == "__main__":
    unittest.main()
