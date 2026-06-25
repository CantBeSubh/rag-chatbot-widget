import uuid

import pytest

from app.core.embedder import embed
from app.core.vector_store import (
    client,
    create_collection_if_not_exists,
    delete_by_source,
    upsert,
)


@pytest.fixture
def collection_name():
    name = f"test_connectivity_{uuid.uuid4().hex[:8]}"
    yield name
    if client.has_collection(name):
        client.drop_collection(name)


def test_create_collection_if_not_exists_creates_collection(collection_name):
    create_collection_if_not_exists(collection_name)

    assert client.has_collection(collection_name)


def test_create_collection_if_not_exists_is_idempotent(collection_name):
    create_collection_if_not_exists(collection_name)
    create_collection_if_not_exists(collection_name)

    assert client.has_collection(collection_name)


@pytest.fixture
def temp_collection():
    name = f"test_delete_{uuid.uuid4().hex[:8]}"
    create_collection_if_not_exists(name)
    yield name
    if client.has_collection(name):
        client.drop_collection(name)


def test_delete_by_source_removes_only_matching_vectors(temp_collection):
    source_a = str(uuid.uuid4())
    source_b = str(uuid.uuid4())

    vecs = embed(["chunk for A", "chunk for B"])
    upsert(
        temp_collection,
        vecs,
        [
            {
                "text": "chunk for A",
                "source_id": source_a,
                "url": "http://a.com",
                "chunk_index": 0,
            },
            {
                "text": "chunk for B",
                "source_id": source_b,
                "url": "http://b.com",
                "chunk_index": 0,
            },
        ],
    )

    delete_by_source(temp_collection, source_a)

    results = client.search(
        collection_name=temp_collection,
        data=[vecs[0]],
        limit=10,
        output_fields=["source_id"],
        consistency_level="Strong",
    )[0]
    source_ids_remaining = [r["entity"]["source_id"] for r in results]
    assert source_a not in source_ids_remaining
    assert source_b in source_ids_remaining


def test_delete_by_source_is_noop_when_collection_missing():
    delete_by_source("nonexistent_collection_xyz", str(uuid.uuid4()))
