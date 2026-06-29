import time

from ..core.chunker import chunk_text
from ..core.config import settings
from ..core.crawler import crawl_site_sync
from ..core.database import supabase
from ..core.dedup import filter_new_chunks
from ..core.embedder import embed
from ..core.vector_store import create_collection_if_not_exists, upsert
from .celery_app import celery_app


@celery_app.task(bind=True)
def add(self, x: int, y: int) -> int:  # noqa: ARG001
    time.sleep(2)
    return x + y


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # Wait 60s before retrying on transient failures
    autoretry_for=(Exception,),
    retry_backoff=True,  # Exponential backoff: 60s, 120s, 240s
    retry_jitter=True,
)
def ingest_url_task(
    self, source_id: str, tenant_id: str, url: str, max_pages: int = 50
) -> None:
    """Background task: crawl a URL, chunk, dedup, embed, upsert to Zilliz."""
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    try:
        schema.table("sources").update({"status": "crawling"}).eq(
            "id", source_id
        ).execute()

        pages = crawl_site_sync(url, max_pages=max_pages)
        if not pages:
            schema.table("sources").update(
                {
                    "status": "error",
                    "error_message": (
                        "Crawler returned no pages. Check that the URL is accessible."
                    ),
                }
            ).eq("id", source_id).execute()
            return

        schema.table("sources").update({"status": "processing"}).eq(
            "id", source_id
        ).execute()

        all_chunks: list[str] = []
        chunk_metadata: list[dict] = []
        for page in pages:
            for i, chunk in enumerate(chunk_text(page["text"])):
                all_chunks.append(chunk)
                chunk_metadata.append(
                    {"url": page["url"], "page_title": page["title"], "chunk_index": i}
                )

        new_indices = filter_new_chunks(all_chunks, tenant_id, source_id)
        if not new_indices:
            schema.table("sources").update({"status": "done", "chunk_count": 0}).eq(
                "id", source_id
            ).execute()
            return  # All chunks already indexed (re-crawl of unchanged content)

        new_chunks = [all_chunks[i] for i in new_indices]
        new_metadata = [chunk_metadata[i] for i in new_indices]

        vectors = embed(new_chunks)

        collection_name = f"tenant_{tenant_id.replace('-', '')}"
        create_collection_if_not_exists(collection_name)

        zilliz_metadata = [
            {
                "text": chunk,
                "source_id": source_id,
                "url": meta["url"],
                "page_title": meta["page_title"],
                "chunk_index": meta["chunk_index"],
            }
            for chunk, meta in zip(new_chunks, new_metadata, strict=True)
        ]
        upsert(collection_name, vectors, zilliz_metadata)

        schema.table("sources").update(
            {"status": "done", "chunk_count": len(new_chunks)}
        ).eq("id", source_id).execute()

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            schema.table("sources").update(
                {"status": "error", "error_message": str(exc)[:500]}
            ).eq("id", source_id).execute()
        raise exc
