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


def _text(chunk) -> str:
    """Normalize LLM output across providers: OllamaLLM yields plain strings,
    ChatHuggingFace yields message objects with a `.content` attribute."""
    return chunk.content if hasattr(chunk, "content") else chunk


SYSTEM_PROMPT = """
You are a helpful assistant. Answer the user's question using ONLY the context \n
provided below.If the answer is not in the context, say "I don't have information \n
about that in my knowledge base."

Do not make up information. Always be concise and direct.

Context:
{context}"""


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
            "chunk_index": r["entity"].get("chunk_index"),
            "score": round(r["distance"], 3),
        }
        for r in retrieved
    ]


def answer(question: str, collection_name: str, top_k: int = 5) -> dict:
    start = time.time()

    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = (
        SYSTEM_PROMPT.format(context=context) + f"\n\nQuestion: {question}\nAnswer:"
    )
    response = _text(llm.invoke(prompt))

    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
    }


async def answer_stream(
    question: str, collection_name: str, top_k: int = 5
) -> AsyncIterator[dict]:
    """Yield SSE events for the answer: one per token, then a final "done" event.

    Retrieval runs up front, before any tokens are streamed. Uses `astream`
    (not `stream`) so generation doesn't block the event loop.
    """
    start = time.time()

    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = (
        SYSTEM_PROMPT.format(context=context) + f"\n\nQuestion: {question}\nAnswer:"
    )

    full_answer = ""
    async for chunk in llm.astream(prompt):
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
