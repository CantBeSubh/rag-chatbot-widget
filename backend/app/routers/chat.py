from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import supabase
from ..core.rag import answer
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str


@router.post("")
async def chat(request: ChatRequest, tenant_id: str = Depends(get_current_tenant_id)):
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    result = answer(request.question, collection_name)
    supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
        {
            "tenant_id": tenant_id,
            "question": request.question,
            "answer": result["answer"],
            "sources_cited": result["sources"],
            "latency_ms": result["latency_ms"],
        }
    ).execute()

    return result
