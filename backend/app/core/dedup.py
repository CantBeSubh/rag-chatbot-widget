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

    # Batch lookups to stay within PostgREST's URL length limit (~8KB).
    # SHA-256 hashes are 64 chars each; 100 per request is safely under the limit.
    BATCH = 100
    existing_hashes: set[str] = set()
    for i in range(0, len(hashes), BATCH):
        batch = hashes[i : i + BATCH]
        result = (
            schema.table("chunk_hashes")
            .select("hash")
            .eq("tenant_id", tenant_id)
            .in_("hash", batch)
            .execute()
        )
        existing_hashes.update(row["hash"] for row in result.data)

    # Deduplicate within the batch too — same hash appearing on multiple pages
    # (e.g. nav/footer boilerplate, locale variants) must only be indexed once.
    seen: set[str] = set()
    new_indices: list[int] = []
    rows = []
    for i, h in enumerate(hashes):
        if h in existing_hashes or h in seen:
            continue
        seen.add(h)
        new_indices.append(i)
        rows.append({"hash": h, "tenant_id": tenant_id, "source_id": source_id})

    if rows:
        schema.table("chunk_hashes").upsert(
            rows, on_conflict="hash,tenant_id", ignore_duplicates=True
        ).execute()

    return new_indices
