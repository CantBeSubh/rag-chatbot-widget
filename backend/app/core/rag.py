import json
import time
from collections.abc import AsyncIterator

from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_ollama import OllamaLLM

from .config import settings
from .embedder import embed
from .vector_store import vector_search

if settings.ENVIRONMENT == "development":
    llm = OllamaLLM(
        model=settings.LANGCHAIN_OLLAMA_MODEL,
        temperature=0.1,
        base_url=settings.LANGCHAIN_OLLAMA_BASE_URL,
        num_ctx=8192,
    )
else:
    llm = ChatHuggingFace(
        llm=HuggingFaceEndpoint(
            repo_id=settings.LANGCHAIN_HUGGINGFACE_MODEL,
            task="text-generation",
            provider="auto",
            huggingfacehub_api_token=settings.HF_TOKEN,
        )
    )

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
    ChatHuggingFace yields message objects with a `.content` attribute."""
    return chunk.content if hasattr(chunk, "content") else chunk


def _bound_llm(temperature: float, max_tokens: int):
    """Return a per-call RunnableBinding without mutating the global llm."""
    if settings.ENVIRONMENT == "development":
        return llm.bind(temperature=temperature, num_predict=max_tokens)
    return llm.bind(temperature=temperature, max_tokens=max_tokens)


def _build_prompt(instructions: str, context: str, question: str) -> str:
    return f"{instructions}\n\nContext:\n{context}\n\nQuestion: {question}\nAnswer:"


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
    question: str,
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> dict:
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question)
    response = _text(_bound_llm(temperature, max_tokens).invoke(prompt))
    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
    }


async def answer_stream(
    question: str,
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> AsyncIterator[dict]:
    """Yield SSE events: one per token, then a final "done" event."""
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question)

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
