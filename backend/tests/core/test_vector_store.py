import uuid

import pytest

from app.core.vector_store import client, create_collection_if_not_exists


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
