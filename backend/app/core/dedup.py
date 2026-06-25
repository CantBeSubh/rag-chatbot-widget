import hashlib

from .config import settings
from .database import supabase


def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def filter_new_chunks(chunks: list[str], tenant_id: str, source_id: str) -> list[int]:
    """
    Returns indices into `chunks` not already indexed for this tenant, and
    records their hashes in chunk_hashes so a later call (e.g. a re-crawl
    of the same site) treats them as seen.
    """
    if not chunks:
        return []

    schema = supabase.schema(settings.SUPABASE_SCHEMA)
    hashes = [compute_hash(c) for c in chunks]

    existing = (
        schema.table("chunk_hashes")
        .select("hash")
        .eq("tenant_id", tenant_id)
        .in_("hash", hashes)
        .execute()
    )
    existing_hashes = {row["hash"] for row in existing.data}

    new_indices = [i for i, h in enumerate(hashes) if h not in existing_hashes]

    # The same hash can appear more than once in one batch (e.g. a repeated
    # nav/footer chunk across pages) — insert each new hash only once to
    # avoid violating the (hash, tenant_id) primary key.
    seen: set[str] = set()
    rows = []
    for i in new_indices:
        h = hashes[i]
        if h in seen:
            continue
        seen.add(h)
        rows.append({"hash": h, "tenant_id": tenant_id, "source_id": source_id})

    if rows:
        schema.table("chunk_hashes").upsert(
            rows, on_conflict="hash,tenant_id", ignore_duplicates=True
        ).execute()

    return new_indices
