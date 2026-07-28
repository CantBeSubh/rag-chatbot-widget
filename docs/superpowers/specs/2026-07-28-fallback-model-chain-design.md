# Fallback Model Chain — Design

## Context

`backend/app/core/rag.py` currently hard-forces a single Ollama instance for every
request (`if True or settings.ENVIRONMENT == "development":`), with a dead
`ChatHuggingFace` branch that never executes. There is no resilience against a
provider being unavailable or rate-limited.

## Goal

Try a prioritized chain of free-tier cloud LLM providers before falling back to
the self-hosted Ollama instance as the last resort, so the app can ride on free
API quota (higher-quality/faster models) and only fall back to local compute
when that quota is exhausted.

Provider list and rough free-tier limits taken from
[cheahjs/free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources).

## Chain order

```
Groq → Cerebras → OpenRouter → Google AI Studio → Ollama (final, no further fallback)
```

All four cloud providers expose OpenAI-compatible `/chat/completions` endpoints.
Ollama is always last and always present (no API key required).

## Fallback trigger

Only a **rate-limit / quota-exceeded** error (`openai.RateLimitError`, HTTP 429)
advances to the next provider in the chain. Any other exception (auth failure,
bad model name, network error, 5xx) propagates immediately and does **not**
trigger fallback — this matches the intent of the feature (survive quota
exhaustion, not mask unrelated bugs).

No cooldown/memory of a rate-limited provider is kept (no Redis state). Every
new request starts again from Groq, even if Groq was rate-limited seconds ago.
This is a deliberate simplification (YAGNI) — acceptable cost is one extra
failed call per request during a provider outage.

## Configuration

New settings in `backend/app/core/config.py` (and mirrored in `.env.example`),
following the existing `LANGCHAIN_OLLAMA_*` naming convention:

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

Base URLs are fixed constants in `rag.py`, not env-configurable:

| Provider | Base URL |
|---|---|
| Groq | `https://api.groq.com/openai/v1` |
| Cerebras | `https://api.cerebras.ai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai/` |

A provider whose API key setting is unset (`""`) is skipped entirely when the
chain is built at import time — the system must keep working with only a
subset of keys configured (down to zero cloud keys, i.e. Ollama-only, today's
behavior).

## New dependency

Add `langchain-openai` (`uv add langchain-openai` from `backend/`). Each cloud
provider becomes a `ChatOpenAI(base_url=..., api_key=..., model=...)` instance,
reusing the same `.bind()` / `.invoke()` / `.astream()` interface `rag.py`
already relies on for Ollama. `_text()` needs no changes — `ChatOpenAI` returns
`AIMessage` objects with `.content`, already handled by the existing
`hasattr(chunk, "content")` check.

## Provider chain construction

A module-level list built once at import, mirroring the existing `llm` global:

```python
_PROVIDERS: list[tuple[str, Any]] = []
if settings.GROQ_API_KEY:
    _PROVIDERS.append(("groq", ChatOpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=settings.GROQ_API_KEY,
        model=settings.LANGCHAIN_GROQ_MODEL,
    )))
if settings.CEREBRAS_API_KEY:
    _PROVIDERS.append(("cerebras", ChatOpenAI(
        base_url="https://api.cerebras.ai/v1",
        api_key=settings.CEREBRAS_API_KEY,
        model=settings.LANGCHAIN_CEREBRAS_MODEL,
    )))
if settings.OPENROUTER_API_KEY:
    _PROVIDERS.append(("openrouter", ChatOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.LANGCHAIN_OPENROUTER_MODEL,
    )))
if settings.GOOGLE_API_KEY:
    _PROVIDERS.append(("google", ChatOpenAI(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=settings.GOOGLE_API_KEY,
        model=settings.LANGCHAIN_GOOGLE_MODEL,
    )))
_PROVIDERS.append(("ollama", llm))  # always present, existing OllamaLLM instance
```

`_bound_llm` becomes provider-aware since `ChatOpenAI.bind()` takes
`temperature`/`max_tokens` as top-level kwargs, while `OllamaLLM.bind()` needs
them nested under `options={}`. Special-case on provider name (only Ollama
differs):

```python
def _bind(name: str, model, temperature: float, max_tokens: int):
    if name == "ollama":
        return model.bind(options={"temperature": temperature, "num_predict": max_tokens})
    return model.bind(temperature=temperature, max_tokens=max_tokens)
```

## `answer()` flow

Wrap the existing single `.invoke(prompt)` call in a loop over `_PROVIDERS`,
catching `openai.RateLimitError` and continuing to the next entry; log a
warning with the provider name on each skip. The returned dict gains a
`"model_used"` field (the provider name that actually served the request) —
cheap to add, useful for debugging/observability.

```python
def _invoke_with_fallback(temperature, max_tokens, prompt) -> tuple[str, str]:
    last_error = None
    for name, model in _PROVIDERS:
        try:
            bound = _bind(name, model, temperature, max_tokens)
            return name, _text(bound.invoke(prompt))
        except RateLimitError as e:
            logger.warning("Provider %s rate-limited, falling back", name)
            last_error = e
            continue
    raise last_error
```

(In practice `last_error` only fires if literally every provider including
Ollama raised `RateLimitError`, which shouldn't happen since Ollama never
raises that error class — but the loop structure needs a defined exit.)

## `answer_stream()` flow

Same loop, but streaming is trickier mid-flight. If `RateLimitError` fires
**before any token has been yielded** to the caller, move to the next provider
transparently — the client sees no difference. If it fires **after** tokens
have already been streamed (partial answer already sent over SSE), the error
propagates and ends the stream; we cannot silently restart with a different
provider mid-answer without confusing the client with a spliced response.

```python
async def _astream_with_fallback(temperature, max_tokens, prompt):
    last_error = None
    for name, model in _PROVIDERS:
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
            logger.warning("Provider %s rate-limited, falling back", name)
            last_error = e
            continue
    raise last_error
```

This mid-stream limitation is a known, accepted edge case — free-tier rate
limits are near-universally enforced per-request (before generation starts),
not mid-generation, so this path is expected to be rare in practice.

## Error handling scope

Only `openai.RateLimitError` triggers fallback for the 4 cloud providers.
Ollama has no rate-limit concept and is last in the chain, so any error there
propagates exactly as it does today — no behavior change for the existing
Ollama-only path when zero cloud keys are configured.

## Testing

Unit tests (mocking each provider) covering:

1. Fallback proceeds past a `RateLimitError` to the next provider.
2. A non-rate-limit error propagates without trying the next provider.
3. An unset API key excludes that provider at chain-build time.
4. Streaming: fallback works pre-first-token; a rate-limit after tokens have
   started raises instead of silently switching providers.

Running `uv run pytest` requires asking the user first per project convention
(`CLAUDE.md`); lint/format checks (`ruff check`, `ruff format --check`) can run
freely.

## Out of scope (explicitly deferred)

- Redis-backed cooldown/rate-limit memory across requests.
- Per-tenant configurable provider chain/order (stays global via env vars).
- Recovering from a mid-stream rate-limit by splicing in a second provider.
