import json
import time
from collections.abc import AsyncIterator
from typing import Any

from langchain_ollama import OllamaLLM
from langchain_openai import ChatOpenAI
from openai import RateLimitError

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

_DEFAULT_INSTRUCTIONS = (
    "You are a helpful assistant. Answer the user's question using ONLY the context "
    "provided below. If the answer is not in the context, say "
    '"I don\'t have information about that in my knowledge base."\n\n'
    "Do not make up information. Always be concise and direct."
)
_DEFAULT_TEMPERATURE = 0.1
_DEFAULT_MAX_TOKENS = 1024


def _text(chunk) -> str:
    """Normalize LLM output across providers: OllamaLLM yields strings,
    chat models yield message objects with a `.content` attribute."""
    return chunk.content if hasattr(chunk, "content") else chunk


def _bind(name: str, model, temperature: float, max_tokens: int):
    """Return a per-call RunnableBinding without mutating the shared provider
    instance."""
    if name == "ollama":
        return model.bind(
            options={"temperature": temperature, "num_predict": max_tokens}
        )
    return model.bind(temperature=temperature, max_tokens=max_tokens)


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


def _build_prompt(
    instructions: str, context: str, question: str, history: str = ""
) -> str:
    history_block = f"Conversation so far:\n{history}\n\n" if history else ""
    return (
        f"{instructions}\n\n{history_block}Context:\n{context}\n\n"
        f"Question: {question}\nAnswer:"
    )


def _format_history(messages: list[dict]) -> str:
    """Render all but the last message as a transcript for prompt context."""
    role_labels = {"user": "User", "assistant": "Assistant"}
    lines = [
        f"{role_labels.get(m['role'], m['role'])}: {m['content']}"
        for m in messages[:-1]
    ]
    return "\n".join(lines)


def build_context(retrieved_chunks: list[dict]) -> str:
    """Format retrieved chunks into a readable context block."""
    parts = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        source = chunk["entity"].get("filename") or chunk["entity"].get(
            "url", "unknown"
        )
        text = chunk["entity"]["text"]
        parts.append(f"[Source {i}: {source}]\n{text}")
    return "\n\n---\n\n".join(parts)


def build_sources(retrieved: list[dict]) -> list[dict]:
    """Format retrieved chunks into the source-citation list returned to clients."""
    return [
        {
            "source_id": r["entity"].get("source_id"),
            "filename": r["entity"].get("filename"),
            "url": r["entity"].get("url"),
            "chunk_index": r["entity"].get("chunk_index"),
            "text": r["entity"].get("text"),
            "score": round(r["distance"], 3),
        }
        for r in retrieved
    ]


def answer(
    messages: list[dict],
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> dict:
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)
    question = messages[-1]["content"]
    history = _format_history(messages)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question, history)
    model_used, response = _invoke_with_fallback(
        _PROVIDERS, temperature, max_tokens, prompt
    )
    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
        "model_used": model_used,
    }


async def answer_stream(
    messages: list[dict],
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> AsyncIterator[dict]:
    """Yield SSE events: one per token, then a final "done" event."""
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)
    question = messages[-1]["content"]
    history = _format_history(messages)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question, history)

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
