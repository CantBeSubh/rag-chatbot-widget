import time

from langchain_ollama import OllamaLLM

from .embedder import embed
from .vector_store import vector_search

llm = OllamaLLM(model="llama3.1:8b", temperature=0.1)

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


def answer(question: str, collection_name: str, top_k: int = 5) -> dict:
    start = time.time()

    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = (
        SYSTEM_PROMPT.format(context=context) + f"\n\nQuestion: {question}\nAnswer:"
    )
    response = llm.invoke(prompt)

    sources = [
        {
            "source_id": r["entity"].get("source_id"),
            "filename": r["entity"].get("filename"),
            "chunk_index": r["entity"].get("chunk_index"),
            "score": round(r["distance"], 3),
        }
        for r in retrieved
    ]

    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": sources,
        "latency_ms": latency_ms,
    }
