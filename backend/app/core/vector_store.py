from pymilvus import MilvusClient

from .config import settings

VECTOR_DIM = 768  # must match embedder.py output dim

client = MilvusClient(uri=settings.ZILLIZ_URI, token=settings.ZILLIZ_TOKEN)


def create_collection_if_not_exists(collection_name: str) -> None:
    if not client.has_collection(collection_name):
        client.create_collection(
            collection_name=collection_name,
            dimension=VECTOR_DIM,
            metric_type="COSINE",
            auto_id=True,
        )


def upsert(
    collection_name: str, vectors: list[list[float]], metadata: list[dict]
) -> None:
    data = [
        {"vector": vec, **meta} for vec, meta in zip(vectors, metadata, strict=True)
    ]
    client.insert(collection_name=collection_name, data=data)


def vector_search(
    collection_name: str, query_vector: list[float], top_k: int = 5
) -> list[dict]:
    results = client.search(
        collection_name=collection_name,
        data=[query_vector],
        limit=top_k,
        output_fields=["text", "source_id", "filename", "chunk_index"],
    )
    return results[0]
