import asyncio

import httpx
import pytest
from openai import RateLimitError

from app.core.config import settings
from app.core.rag import (
    _DEFAULT_INSTRUCTIONS,
    _astream_with_fallback,
    _bind,
    _build_prompt,
    _build_providers,
    _invoke_with_fallback,
)


def _rate_limit_error() -> RateLimitError:
    response = httpx.Response(
        status_code=429, request=httpx.Request("POST", "https://example.com")
    )
    return RateLimitError("rate limited", response=response, body=None)


class _FakeModel:
    """Mimics a LangChain chat model: .bind(**kwargs) returns a runnable with
    .invoke()/.astream()."""

    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.bind_kwargs = None

    def bind(self, **kwargs):
        self.bind_kwargs = kwargs
        return self

    def invoke(self, _prompt):
        if self.error is not None:
            raise self.error
        return self.response

    async def astream(self, _prompt):
        if self.error is not None:
            raise self.error
        for token in self.response:
            yield token


def test_bind_ollama_uses_options_kwarg():
    model = _FakeModel()
    _bind("ollama", model, 0.2, 500)
    assert model.bind_kwargs == {"options": {"temperature": 0.2, "num_predict": 500}}


def test_bind_cloud_provider_uses_top_level_kwargs():
    model = _FakeModel()
    _bind("groq", model, 0.2, 500)
    assert model.bind_kwargs == {"temperature": 0.2, "max_tokens": 500}


def test_build_providers_skips_provider_with_empty_api_key(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "")

    providers = _build_providers()

    assert [name for name, _ in providers] == ["ollama"]


def test_build_providers_includes_configured_cloud_provider(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key")
    monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "")

    providers = _build_providers()

    assert [name for name, _ in providers] == ["groq", "ollama"]


def test_build_providers_orders_full_chain_when_all_cloud_keys_set(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key")
    monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "fake-key")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "fake-key")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "fake-key")

    providers = _build_providers()

    assert [name for name, _ in providers] == [
        "groq",
        "cerebras",
        "openrouter",
        "google",
        "ollama",
    ]


def test_build_prompt_starts_with_instructions():
    prompt = _build_prompt("Be concise.", "Some context.", "What is X?")
    assert prompt.startswith("Be concise.")


def test_build_prompt_contains_context_block():
    prompt = _build_prompt("Instructions.", "My source text.", "Question?")
    assert "Context:\nMy source text." in prompt


def test_build_prompt_contains_question():
    prompt = _build_prompt("Instructions.", "Context.", "My question?")
    assert "Question: My question?" in prompt


def test_build_prompt_ends_with_answer_label():
    prompt = _build_prompt("Instructions.", "Context.", "Question?")
    assert prompt.strip().endswith("Answer:")


def test_default_instructions_has_no_context_placeholder():
    # instructions-only: the {context} block is appended by _build_prompt, not stored
    assert "{context}" not in _DEFAULT_INSTRUCTIONS


def test_default_instructions_mentions_context():
    assert "context" in _DEFAULT_INSTRUCTIONS.lower()


def test_invoke_with_fallback_falls_back_on_rate_limit():
    groq = _FakeModel(error=_rate_limit_error())
    ollama = _FakeModel(response="final answer")
    providers = [("groq", groq), ("ollama", ollama)]

    name, response = _invoke_with_fallback(providers, 0.1, 1024, "prompt")

    assert name == "ollama"
    assert response == "final answer"


def test_invoke_with_fallback_falls_back_through_all_cloud_providers_to_ollama():
    groq = _FakeModel(error=_rate_limit_error())
    cerebras = _FakeModel(error=_rate_limit_error())
    openrouter = _FakeModel(error=_rate_limit_error())
    ollama = _FakeModel(response="final answer")
    providers = [
        ("groq", groq),
        ("cerebras", cerebras),
        ("openrouter", openrouter),
        ("ollama", ollama),
    ]

    name, response = _invoke_with_fallback(providers, 0.1, 1024, "prompt")

    assert name == "ollama"
    assert response == "final answer"


def test_invoke_with_fallback_propagates_non_rate_limit_error():
    groq = _FakeModel(error=ValueError("boom"))
    ollama = _FakeModel(response="never reached")
    providers = [("groq", groq), ("ollama", ollama)]

    with pytest.raises(ValueError, match="boom"):
        _invoke_with_fallback(providers, 0.1, 1024, "prompt")


def test_astream_with_fallback_falls_back_before_first_token():
    groq = _FakeModel(error=_rate_limit_error())
    ollama = _FakeModel(response=["hel", "lo"])
    providers = [("groq", groq), ("ollama", ollama)]

    async def _collect():
        return [
            chunk
            async for chunk in _astream_with_fallback(providers, 0.1, 1024, "prompt")
        ]

    tokens = asyncio.run(_collect())

    assert tokens == [("ollama", "hel"), ("ollama", "lo")]


def test_astream_with_fallback_propagates_rate_limit_after_first_token():
    class _PartialStreamModel(_FakeModel):
        async def astream(self, _prompt):
            yield "partial"
            raise self.error

    groq = _PartialStreamModel(error=_rate_limit_error())
    ollama = _FakeModel(response=["should", "never", "run"])
    providers = [("groq", groq), ("ollama", ollama)]

    async def _collect():
        return [
            chunk
            async for chunk in _astream_with_fallback(providers, 0.1, 1024, "prompt")
        ]

    with pytest.raises(RateLimitError):
        asyncio.run(_collect())
