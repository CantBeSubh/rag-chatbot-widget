from fastapi import APIRouter, Depends, Query

from ..core.config import settings
from ..core.database import supabase
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("")
async def get_logs(
    tenant_id: str = Depends(get_current_tenant_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    unanswered_only: bool = Query(False),
    date_from: str = Query(None),
    date_to: str = Query(None),
) -> dict:
    query = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("chat_logs")
        .select("*", count="exact")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .range((page - 1) * per_page, page * per_page - 1)
    )

    if unanswered_only:
        query = query.ilike("answer", "%don't have information%")
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)

    result = query.execute()
    total = result.count or 0

    return {
        "logs": result.data,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page),
    }
