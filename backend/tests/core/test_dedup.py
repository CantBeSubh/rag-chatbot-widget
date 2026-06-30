import uuid

import pytest

from app.core.config import settings
from app.core.database import supabase
from app.core.dedup import compute_hash, filter_new_chunks

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)


@pytest.fixture
def tenant_and_source():
    tenant = (
        _SCHEMA.table("tenants")
        .insert({"user_id": str(uuid.uuid4())})
        .execute()
        .data[0]
    )  # noqa: E501
    source = (
        _SCHEMA.table("sources")
        .insert(
            {"tenant_id": tenant["id"], "type": "url", "url": "https://example.com"}
        )
        .execute()
        .data[0]
    )
    yield tenant["id"], source["id"]
    _SCHEMA.table("chunk_hashes").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("sources").delete().eq("id", source["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_compute_hash_is_deterministic_and_distinguishes_text():
    assert compute_hash("hello") == compute_hash("hello")
    assert compute_hash("hello") != compute_hash("world")


def test_filter_new_chunks_empty_input_returns_empty_list(tenant_and_source):
    tenant_id, source_id = tenant_and_source

    assert filter_new_chunks([], tenant_id, source_id) == []


def test_filter_new_chunks_returns_all_indices_when_none_exist(tenant_and_source):
    tenant_id, source_id = tenant_and_source

    new_indices = filter_new_chunks(["alpha chunk", "beta chunk"], tenant_id, source_id)

    assert new_indices == [0, 1]


def test_filter_new_chunks_excludes_hashes_seen_in_a_previous_call(tenant_and_source):
    tenant_id, source_id = tenant_and_source
    chunks = ["alpha chunk", "beta chunk"]
    filter_new_chunks(chunks, tenant_id, source_id)

    new_indices = filter_new_chunks(chunks, tenant_id, source_id)

    assert new_indices == []


def test_filter_new_chunks_keeps_only_unseen_chunks_on_partial_overlap(
    tenant_and_source,
):
    tenant_id, source_id = tenant_and_source
    filter_new_chunks(["alpha chunk"], tenant_id, source_id)

    new_indices = filter_new_chunks(
        ["alpha chunk", "gamma chunk"], tenant_id, source_id
    )

    assert new_indices == [1]


def test_filter_new_chunks_handles_duplicate_text_within_same_batch(tenant_and_source):
    tenant_id, source_id = tenant_and_source
    chunks = ["repeated nav chunk", "unique body text", "repeated nav chunk"]

    new_indices = filter_new_chunks(chunks, tenant_id, source_id)

    assert new_indices == [0, 1, 2]
