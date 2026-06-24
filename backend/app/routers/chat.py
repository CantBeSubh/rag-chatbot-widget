import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..core.config import settings
from ..core.database import supabase
from ..core.rag import answer, answer_stream
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


@router.post("/stream")
async def chat_stream(
    request: ChatRequest, tenant_id: str = Depends(get_current_tenant_id)
):
    collection_name = f"tenant_{tenant_id.replace('-', '')}"

    async def event_generator():
        answer_text = ""
        sources: list[dict] = []
        latency_ms = 0

        async for event in answer_stream(request.question, collection_name):
            payload = json.loads(event["data"])
            if payload["type"] == "done":
                answer_text = payload["answer"]
                sources = payload["sources"]
                latency_ms = payload["latency_ms"]
            yield event

        supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
            {
                "tenant_id": tenant_id,
                "question": request.question,
                "answer": answer_text,
                "sources_cited": sources,
                "latency_ms": latency_ms,
            }
        ).execute()

    return EventSourceResponse(event_generator())
