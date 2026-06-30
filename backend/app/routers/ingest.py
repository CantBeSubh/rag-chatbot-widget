import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from ..core.chunker import chunk_text
from ..core.config import settings
from ..core.database import supabase
from ..core.embedder import embed
from ..core.extractors import extract_text
from ..core.limiter import limiter
from ..core.vector_store import create_collection_if_not_exists, upsert
from ..dependencies import get_current_tenant_id
from ..worker.tasks import ingest_url_task

router = APIRouter(prefix="/ingest", tags=["ingestion"])


class IngestURLRequest(BaseModel):
    url: str
    max_pages: int = 50


@router.post("/file")
@limiter.limit("10/minute")
async def ingest_file(
    request: Request,  # noqa: ARG001
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_current_tenant_id),
):
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    source = (
        schema.table("sources")
        .insert(
            {
                "tenant_id": tenant_id,
                "type": "file",
                "filename": file.filename,
                "status": "processing",
            }
        )
        .execute()
    )
    source_id = source.data[0]["id"]

    try:
        file_bytes = await file.read()
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            text = extract_text(tmp_path, file.filename)
        finally:
            os.unlink(tmp_path)

        chunks = chunk_text(text)
        vectors = embed(chunks)

        collection_name = f"tenant_{tenant_id.replace('-', '')}"
        metadata = [
            {
                "text": chunk,
                "source_id": source_id,
                "filename": file.filename,
                "chunk_index": i,
            }
            for i, chunk in enumerate(chunks)
        ]

        create_collection_if_not_exists(collection_name)
        upsert(collection_name, vectors, metadata)

        schema.table("sources").update(
            {"status": "done", "chunk_count": len(chunks)}
        ).eq("id", source_id).execute()

        return {"source_id": source_id, "chunks_ingested": len(chunks)}

    except Exception as e:
        schema.table("sources").update({"status": "error", "error_message": str(e)}).eq(
            "id", source_id
        ).execute()
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/url")
@limiter.limit("10/minute")
async def ingest_url(
    request: Request,  # noqa: ARG001
    body: IngestURLRequest,
    tenant_id: str = Depends(get_current_tenant_id),
):
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    source = (
        schema.table("sources")
        .insert(
            {
                "tenant_id": tenant_id,
                "type": "url",
                "url": body.url,
                "status": "queued",
            }
        )
        .execute()
    )
    source_id = source.data[0]["id"]

    ingest_url_task.delay(
        source_id=source_id,
        tenant_id=tenant_id,
        url=body.url,
        max_pages=body.max_pages,
    )

    return {
        "source_id": source_id,
        "status": "queued",
        "message": f"Crawl queued. Poll GET /sources/{source_id} for status.",
    }
