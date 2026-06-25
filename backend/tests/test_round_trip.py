import uuid

import pytest

from app.core.embedder import embed
from app.core.vector_store import (
    client,
    create_collection_if_not_exists,
    upsert,
    vector_search,
)


@pytest.fixture
def collection_name():
    name = f"test_round_trip_{uuid.uuid4().hex[:8]}"
    yield name
    if client.has_collection(name):
        client.drop_collection(name)


def test_search_for_vector_database_returns_zilliz_sentence_as_top_hit(
    collection_name,
):
    sentences = [
        "FastAPI is a modern web framework for building APIs with Python.",
        "Zilliz Cloud is a managed vector database service.",
        "The quick brown fox jumps over the lazy dog.",
        "Machine learning models convert text into numerical vectors.",
        "Redis is an in-memory data store used as a cache or message broker.",
    ]
    vectors = embed(sentences)
    metadata = [
        {"text": s, "source_id": "test", "filename": "test.txt", "chunk_index": i}
        for i, s in enumerate(sentences)
    ]

    create_collection_if_not_exists(collection_name)
    upsert(collection_name, vectors, metadata)

    query_vector = embed(["What is a vector database?"])[0]
    results = vector_search(collection_name, query_vector, top_k=2)

    assert (
        results[0]["entity"]["text"]
        == "Zilliz Cloud is a managed vector database service."
    )


def test_search_returns_url_field_for_url_sourced_chunks(collection_name):
    sentences = ["Source URL field check."]
    vectors = embed(sentences)
    metadata = [
        {
            "text": sentences[0],
            "source_id": "test",
            "url": "https://example.com/page",
            "page_title": "Example Page",
            "chunk_index": 0,
        }
    ]

    create_collection_if_not_exists(collection_name)
    upsert(collection_name, vectors, metadata)

    query_vector = embed(["Source URL field check."])[0]
    results = vector_search(collection_name, query_vector, top_k=1)

    assert results[0]["entity"]["url"] == "https://example.com/page"
