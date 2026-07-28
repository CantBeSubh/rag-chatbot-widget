# Fallback Model Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded single-Ollama call in `backend/app/core/rag.py` with a fallback chain — Groq → Cerebras → OpenRouter → Google AI Studio → Ollama — that only advances to the next provider on a rate-limit/quota error.

**Architecture:** Four cloud providers become `ChatOpenAI` instances pointed at their OpenAI-compatible endpoints (new `langchain-openai` dependency); Ollama keeps using the existing `OllamaLLM`. Two small loop functions (`_invoke_with_fallback` for `answer()`, `_astream_with_fallback` for `answer_stream()`) take the provider list as a parameter (not a module global) so they're testable with fake providers, with no network calls and no real API keys.

**Tech Stack:** Python 3.11, FastAPI, LangChain (`langchain-openai`, `langchain-ollama`), `openai` SDK (already a transitive dependency, provides `RateLimitError`), pytest, uv.

## Global Constraints

- Only `openai.RateLimitError` (HTTP 429) triggers fallback to the next provider. Any other exception propagates immediately — no fallback.
- No cross-request state (no Redis cooldown). Every request starts the chain again from Groq.
- Chain order is fixed and global, not per-tenant: Groq → Cerebras → OpenRouter → Google AI Studio → Ollama. Ollama is always present and always last.
- A cloud provider is skipped entirely (not added to the chain) if its API key setting is the empty string `""`.
- Add/remove Python deps with `uv add` / `uv remove` from `backend/` (per project CLAUDE.md) — never hand-edit `uv.lock`.
- Check import correctness with `cd backend && uv run python -c "import app.main"` (per project CLAUDE.md) — never manually prepend `app/` to `sys.path`.
- Do not run `uv run pytest` / `make test` without asking the user first (per project CLAUDE.md). `ruff check` / `ruff format --check` may be run freely.
- Async generator tests use `asyncio.run(...)` inside plain `def test_...()` functions — this codebase has no `pytest-asyncio` dependency and no other async test exists; don't introduce one for this feature.

---

### Task 1: Swap the dead HuggingFace path for `langchain-openai`; add fallback-chain config

**Files:**
- Modify: `backend/pyproject.toml` (via `uv remove` / `uv add`, not hand-edited)
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `Settings.GROQ_API_KEY`, `Settings.LANGCHAIN_GROQ_MODEL`, `Settings.CEREBRAS_API_KEY`, `Settings.LANGCHAIN_CEREBRAS_MODEL`, `Settings.OPENROUTER_API_KEY`, `Settings.LANGCHAIN_OPENROUTER_MODEL`, `Settings.GOOGLE_API_KEY`, `Settings.LANGCHAIN_GOOGLE_MODEL` — all `str`, all default `""` except the four `LANGCHAIN_*_MODEL` fields which default to a real free-tier model name. `Settings.HF_TOKEN` and `Settings.LANGCHAIN_HUGGINGFACE_MODEL` are removed (confirmed unused outside `config.py`/`rag.py`).

- [ ] **Step 1: Remove the unused HuggingFace dependency**

```bash
cd backend && uv remove langchain-huggingface
```

- [ ] **Step 2: Add the OpenAI-compatible LangChain integration**

```bash
cd backend && uv add langchain-openai
```

- [ ] **Step 3: Update `backend/app/core/config.py`**

Replace:

```python
    HF_TOKEN: str = ""
    LANGCHAIN_HUGGINGFACE_MODEL: str = "zai-org/GLM-5.2"
```

with:

```python
    GROQ_API_KEY: str = ""
    LANGCHAIN_GROQ_MODEL: str = "llama-3.3-70b-versatile"

    CEREBRAS_API_KEY: str = ""
    LANGCHAIN_CEREBRAS_MODEL: str = "gpt-oss-120b"

    OPENROUTER_API_KEY: str = ""
    LANGCHAIN_OPENROUTER_MODEL: str = "openai/gpt-oss-20b:free"

    GOOGLE_API_KEY: str = ""
    LANGCHAIN_GOOGLE_MODEL: str = "gemini-2.5-flash-lite"
```

The full `Settings` class body should read:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SCHEMA: str = "public"

    ZILLIZ_URI: str = ""
    ZILLIZ_TOKEN: str = ""
    DEFAULT_COLLECTION_NAME: str = "tenant_default"

    REDIS_URL: str = "redis://admin:admin@localhost:6379"

    LANGCHAIN_OLLAMA_BASE_URL: str = "http://localhost:11434"
    LANGCHAIN_OLLAMA_MODEL: str = "llama3.1:8b"

    GROQ_API_KEY: str = ""
    LANGCHAIN_GROQ_MODEL: str = "llama-3.3-70b-versatile"

    CEREBRAS_API_KEY: str = ""
    LANGCHAIN_CEREBRAS_MODEL: str = "gpt-oss-120b"

    OPENROUTER_API_KEY: str = ""
    LANGCHAIN_OPENROUTER_MODEL: str = "openai/gpt-oss-20b:free"

    GOOGLE_API_KEY: str = ""
    LANGCHAIN_GOOGLE_MODEL: str = "gemini-2.5-flash-lite"

    SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
```

- [ ] **Step 4: Update `backend/.env.example`**

Replace:

```
# Hugging Face (used when ENVIRONMENT is not "development")
HUGGINGFACEHUB_API_TOKEN=
LANGCHAIN_HUGGINGFACE_MODEL=zai-org/GLM-5.2
```

with:

```
# Fallback chain (tried in this order before Ollama): Groq -> Cerebras -> OpenRouter -> Google AI Studio
# Leave a key blank to skip that provider in the chain.
GROQ_API_KEY=
LANGCHAIN_GROQ_MODEL=llama-3.3-70b-versatile

CEREBRAS_API_KEY=
LANGCHAIN_CEREBRAS_MODEL=gpt-oss-120b

OPENROUTER_API_KEY=
LANGCHAIN_OPENROUTER_MODEL=openai/gpt-oss-20b:free

GOOGLE_API_KEY=
LANGCHAIN_GOOGLE_MODEL=gemini-2.5-flash-lite
```

Also update the comment above the Ollama block from `# Ollama` to `# Ollama (final fallback — always available, no API key needed)`.

- [ ] **Step 5: Verify imports still resolve**

Run: `cd backend && uv run python -c "import app.main"`
Expected: no output, exit code 0. (This is the project's documented way to catch import errors the way `fastapi dev` would hit them — do not manually prepend `app/` to `sys.path`.)

- [ ] **Step 6: Lint**

Run: `cd backend && uv run ruff check app/core/config.py`
Expected: `All checks passed!`

- [ ] **Step 7: Commit**

```bash
cd backend && git add pyproject.toml uv.lock app/core/config.py .env.example
git commit -m "chore: swap dead HuggingFace config for fallback-chain provider settings"
```

---

### Task 2: Provider chain builder + per-provider bind helper

**Files:**
- Modify: `backend/app/core/rag.py:1-49` (imports, module-level `llm`, `_text`, `_bound_llm`)
- Test: `backend/tests/core/test_rag.py`

**Interfaces:**
- Consumes: `Settings` fields from Task 1 (`settings.GROQ_API_KEY`, etc.), `settings.LANGCHAIN_OLLAMA_MODEL`, `settings.LANGCHAIN_OLLAMA_BASE_URL`.
- Produces:
  - `llm: OllamaLLM` — unchanged module global, same construction as today.
  - `_build_providers() -> list[tuple[str, Any]]` — ordered `(provider_name, model_instance)` pairs; skips a cloud provider whose API key setting is `""`; always ends with `("ollama", llm)`.
  - `_PROVIDERS: list[tuple[str, Any]]` — module-level result of `_build_providers()`, called once at import (mirrors today's eager `llm = OllamaLLM(...)`).
  - `_bind(name: str, model, temperature: float, max_tokens: int)` — returns a bound runnable; `name == "ollama"` uses `options={"temperature":..., "num_predict":...}`, every other name uses top-level `temperature=`/`max_tokens=` kwargs.
  - `_text(chunk) -> str` — unchanged, still used by later tasks.
  - `_bound_llm` is deleted (replaced by `_bind`).

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/core/test_rag.py` (new imports at top, alongside the existing ones):

```python
from app.core.config import settings
from app.core.rag import (
    _DEFAULT_INSTRUCTIONS,
    _bind,
    _build_prompt,
    _build_providers,
)


class _FakeModel:
    """Mimics a LangChain chat model: .bind(**kwargs) returns a runnable with .invoke()/.astream()."""

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v`
Expected: `FAIL` — `ImportError: cannot import name '_bind' from 'app.core.rag'` (and `_build_providers` likewise not yet defined).

(This requires asking the user before running per the project's pytest rule — surface the command and expected failure, get their go-ahead to run it.)

- [ ] **Step 3: Replace the top of `backend/app/core/rag.py`**

Replace lines 1-27 (imports through the `if True or ...` / `else` block) with:

```python
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from langchain_ollama import OllamaLLM
from langchain_openai import ChatOpenAI

from .config import settings
from .embedder import embed
from .logging import get_logger
from .vector_store import vector_search

logger = get_logger()

llm = OllamaLLM(
    model=settings.LANGCHAIN_OLLAMA_MODEL,
    temperature=0.1,
    base_url=settings.LANGCHAIN_OLLAMA_BASE_URL,
    num_ctx=8192,
)


def _build_providers() -> list[tuple[str, Any]]:
    """Ordered fallback chain: configured cloud providers, then Ollama last."""
    providers: list[tuple[str, Any]] = []
    if settings.GROQ_API_KEY:
        providers.append(
            (
                "groq",
                ChatOpenAI(
                    base_url="https://api.groq.com/openai/v1",
                    api_key=settings.GROQ_API_KEY,
                    model=settings.LANGCHAIN_GROQ_MODEL,
                ),
            )
        )
    if settings.CEREBRAS_API_KEY:
        providers.append(
            (
                "cerebras",
                ChatOpenAI(
                    base_url="https://api.cerebras.ai/v1",
                    api_key=settings.CEREBRAS_API_KEY,
                    model=settings.LANGCHAIN_CEREBRAS_MODEL,
                ),
            )
        )
    if settings.OPENROUTER_API_KEY:
        providers.append(
            (
                "openrouter",
                ChatOpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=settings.OPENROUTER_API_KEY,
                    model=settings.LANGCHAIN_OPENROUTER_MODEL,
                ),
            )
        )
    if settings.GOOGLE_API_KEY:
        providers.append(
            (
                "google",
                ChatOpenAI(
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                    api_key=settings.GOOGLE_API_KEY,
                    model=settings.LANGCHAIN_GOOGLE_MODEL,
                ),
            )
        )
    providers.append(("ollama", llm))
    return providers


_PROVIDERS = _build_providers()
```

- [ ] **Step 4: Replace `_bound_llm` with `_bind`**

Replace (current lines 45-49):

```python
def _bound_llm(temperature: float, max_tokens: int):
    """Return a per-call RunnableBinding without mutating the global llm."""
    if settings.ENVIRONMENT == "development":
        return llm.bind(options={"temperature": temperature, "num_predict": max_tokens})
    return llm.bind(options={"temperature": temperature, "num_predict": max_tokens})
```

with:

```python
def _bind(name: str, model, temperature: float, max_tokens: int):
    """Return a per-call RunnableBinding without mutating the shared provider instance."""
    if name == "ollama":
        return model.bind(options={"temperature": temperature, "num_predict": max_tokens})
    return model.bind(temperature=temperature, max_tokens=max_tokens)
```

`_text()` directly below is unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v`
Expected: `PASS` (all tests, including the pre-existing `_build_prompt`/`_DEFAULT_INSTRUCTIONS` ones).

Note: `answer()` and `answer_stream()` still reference the now-deleted `_bound_llm` at this point in the plan — that's fixed in Tasks 3 and 4. `rag.py` will not fully import-clean until Task 3 replaces those call sites; if you need a green `ruff check`/import check before Task 3, that's expected to fail here and is resolved by the next task.

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/core/rag.py tests/core/test_rag.py
git commit -m "feat: add provider chain builder and per-provider bind helper"
```

---

### Task 3: Sync fallback loop, wired into `answer()`

**Files:**
- Modify: `backend/app/core/rag.py` (add `_invoke_with_fallback`; update `answer()`)
- Test: `backend/tests/core/test_rag.py`

**Interfaces:**
- Consumes: `_bind` and `_PROVIDERS` from Task 2; `_text` (unchanged, from original file).
- Produces: `_invoke_with_fallback(providers: list[tuple[str, Any]], temperature: float, max_tokens: int, prompt: str) -> tuple[str, str]` — returns `(provider_name, response_text)`. Raises the last `RateLimitError` if literally every provider in the list raised one (unreachable in production since Ollama never raises `RateLimitError`, but the function must have a defined return path). `answer()`'s returned dict gains a `"model_used": str` key.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/core/test_rag.py` (add `httpx` and `RateLimitError` to imports, add `_invoke_with_fallback` to the `app.core.rag` import):

```python
import httpx
from openai import RateLimitError

from app.core.rag import (
    _DEFAULT_INSTRUCTIONS,
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


def test_invoke_with_fallback_falls_back_on_rate_limit():
    groq = _FakeModel(error=_rate_limit_error())
    ollama = _FakeModel(response="final answer")
    providers = [("groq", groq), ("ollama", ollama)]

    name, response = _invoke_with_fallback(providers, 0.1, 1024, "prompt")

    assert name == "ollama"
    assert response == "final answer"


def test_invoke_with_fallback_propagates_non_rate_limit_error():
    groq = _FakeModel(error=ValueError("boom"))
    ollama = _FakeModel(response="never reached")
    providers = [("groq", groq), ("ollama", ollama)]

    with pytest.raises(ValueError, match="boom"):
        _invoke_with_fallback(providers, 0.1, 1024, "prompt")
```

Add `import pytest` at the top of the test file if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v` (ask user first)
Expected: `FAIL` — `ImportError: cannot import name '_invoke_with_fallback' from 'app.core.rag'`.

- [ ] **Step 3: Add `_invoke_with_fallback` to `rag.py`**

Add directly below `_bind` (and above `_build_prompt`):

```python
def _invoke_with_fallback(
    providers: list[tuple[str, Any]], temperature: float, max_tokens: int, prompt: str
) -> tuple[str, str]:
    """Try each provider in order; only a rate-limit error advances to the next one."""
    last_error: RateLimitError | None = None
    for name, model in providers:
        try:
            bound = _bind(name, model, temperature, max_tokens)
            return name, _text(bound.invoke(prompt))
        except RateLimitError as e:
            logger.warning("provider_rate_limited", provider=name)
            last_error = e
            continue
    raise last_error if last_error else RuntimeError("no LLM providers configured")
```

Add `from openai import RateLimitError` to the imports at the top of `rag.py` (alphabetically before `from .config import settings` per isort — actual position: after `from langchain_openai import ChatOpenAI` and before the blank line, since `openai` sorts as a third-party package like `langchain_openai`).

- [ ] **Step 4: Update `answer()` to use the fallback loop**

Replace (current lines 112, 117-124 relative to the pre-Task-1 file — i.e. the `response = _text(...)` line and the returned dict):

```python
    response = _text(_bound_llm(temperature, max_tokens).invoke(prompt))
    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
    }
```

with:

```python
    model_used, response = _invoke_with_fallback(_PROVIDERS, temperature, max_tokens, prompt)
    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
        "model_used": model_used,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v` (ask user first)
Expected: `PASS` — all tests including Task 2's.

- [ ] **Step 6: Lint**

Run: `cd backend && uv run ruff check app/core/rag.py tests/core/test_rag.py`
Expected: `All checks passed!`

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/core/rag.py tests/core/test_rag.py
git commit -m "feat: fall back to next provider on rate limit in answer()"
```

---

### Task 4: Streaming fallback loop, wired into `answer_stream()`

**Files:**
- Modify: `backend/app/core/rag.py` (add `_astream_with_fallback`; update `answer_stream()`)
- Test: `backend/tests/core/test_rag.py`

**Interfaces:**
- Consumes: `_bind`, `_PROVIDERS`, `_text`, `RateLimitError` from Tasks 2-3.
- Produces: `_astream_with_fallback(providers: list[tuple[str, Any]], temperature: float, max_tokens: int, prompt: str) -> AsyncIterator[tuple[str, str]]` — yields `(provider_name, token)` pairs. Falls back to the next provider only if `RateLimitError` fires before any token has been yielded for the current provider; if it fires after streaming has started, it propagates instead of switching providers mid-answer. `answer_stream()`'s final `"done"` event gains a `"model_used": str` key.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/core/test_rag.py` (add `asyncio` to imports, add `_astream_with_fallback` to the `app.core.rag` import):

```python
import asyncio

from app.core.rag import (
    _DEFAULT_INSTRUCTIONS,
    _astream_with_fallback,
    _bind,
    _build_prompt,
    _build_providers,
    _invoke_with_fallback,
)


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
    providers = [("groq", groq)]

    async def _collect():
        return [
            chunk
            async for chunk in _astream_with_fallback(providers, 0.1, 1024, "prompt")
        ]

    with pytest.raises(RateLimitError):
        asyncio.run(_collect())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v` (ask user first)
Expected: `FAIL` — `ImportError: cannot import name '_astream_with_fallback' from 'app.core.rag'`.

- [ ] **Step 3: Add `_astream_with_fallback` to `rag.py`**

Add directly below `_invoke_with_fallback`:

```python
async def _astream_with_fallback(
    providers: list[tuple[str, Any]], temperature: float, max_tokens: int, prompt: str
) -> AsyncIterator[tuple[str, str]]:
    """Yield (provider_name, token) pairs. Falls back only before the first
    token of a given provider; a rate limit after streaming has started
    propagates instead of switching providers mid-answer."""
    last_error: RateLimitError | None = None
    for name, model in providers:
        bound = _bind(name, model, temperature, max_tokens)
        started = False
        try:
            async for chunk in bound.astream(prompt):
                started = True
                yield name, _text(chunk)
            return
        except RateLimitError as e:
            if started:
                raise
            logger.warning("provider_rate_limited", provider=name)
            last_error = e
            continue
    raise last_error if last_error else RuntimeError("no LLM providers configured")
```

- [ ] **Step 4: Update `answer_stream()` to use the fallback loop**

Replace (the current streaming body, from `full_answer = ""` to the end of the function):

```python
    full_answer = ""
    async for chunk in _bound_llm(temperature, max_tokens).astream(prompt):
        token = _text(chunk)
        full_answer += token
        yield {"data": json.dumps({"type": "token", "content": token})}

    latency_ms = int((time.time() - start) * 1000)
    yield {
        "data": json.dumps(
            {
                "type": "done",
                "answer": full_answer,
                "sources": build_sources(retrieved),
                "latency_ms": latency_ms,
            }
        )
    }
```

with:

```python
    full_answer = ""
    model_used = ""
    async for name, token in _astream_with_fallback(
        _PROVIDERS, temperature, max_tokens, prompt
    ):
        model_used = name
        full_answer += token
        yield {"data": json.dumps({"type": "token", "content": token})}

    latency_ms = int((time.time() - start) * 1000)
    yield {
        "data": json.dumps(
            {
                "type": "done",
                "answer": full_answer,
                "sources": build_sources(retrieved),
                "latency_ms": latency_ms,
                "model_used": model_used,
            }
        )
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_rag.py -v` (ask user first)
Expected: `PASS` — all tests in the file.

- [ ] **Step 6: Full backend lint and import check**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run python -c "import app.main"`
Expected: `All checks passed!` twice, then no output (exit 0) from the import check.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/core/rag.py tests/core/test_rag.py
git commit -m "feat: fall back to next provider on rate limit in answer_stream()"
```

---

## After implementation

- Update `docs/dev-log.md` with a note on the fallback chain (per project CLAUDE.md — keep it updated as work happens).
- The `.env` file (real, gitignored) needs at least one of `GROQ_API_KEY` / `CEREBRAS_API_KEY` / `OPENROUTER_API_KEY` / `GOOGLE_API_KEY` set to actually exercise the cloud path in manual testing — with none set, the chain degrades to Ollama-only, which is today's behavior and still correct.
