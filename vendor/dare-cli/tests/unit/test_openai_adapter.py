from __future__ import annotations

from dare_framework.model.adapters import openai_adapter as openai_adapter_module
from dare_framework.model.adapters.openai_adapter import OpenAIModelAdapter, _join_stream_text_parts


class DummyChatOpenAI:
    last_kwargs: dict | None = None

    def __init__(self, **kwargs):
        DummyChatOpenAI.last_kwargs = dict(kwargs)


def test_build_client_reads_openai_env_defaults(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://endpoint.example/v1")
    monkeypatch.setattr(openai_adapter_module, "ChatOpenAI", DummyChatOpenAI)

    adapter = OpenAIModelAdapter(model="gpt-5.4")
    adapter._build_client()

    assert DummyChatOpenAI.last_kwargs is not None
    assert DummyChatOpenAI.last_kwargs["api_key"] == "env-openai-key"
    assert DummyChatOpenAI.last_kwargs["base_url"] == "https://endpoint.example/v1"


def test_build_client_enables_streaming_for_custom_endpoint(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.setattr(openai_adapter_module, "ChatOpenAI", DummyChatOpenAI)

    adapter = OpenAIModelAdapter(
        model="gpt-5.4",
        api_key="test-key",
        endpoint="https://endpoint.example/v1",
    )
    adapter._build_client()

    assert DummyChatOpenAI.last_kwargs is not None
    assert DummyChatOpenAI.last_kwargs["streaming"] is True
    assert DummyChatOpenAI.last_kwargs["base_url"] == "https://endpoint.example/v1"


def test_join_stream_text_parts_preserves_continuous_reasoning_text() -> None:
    assert _join_stream_text_parts(["先", "分析", "一下"]) == "先分析一下"
    assert _join_stream_text_parts([]) is None
