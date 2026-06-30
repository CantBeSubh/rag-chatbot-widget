import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..core.config import settings
from ..core.database import supabase
from ..core.limiter import limiter
from ..core.rag import answer, answer_stream
from ..dependencies import get_widget_config

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str


@router.post("")
@limiter.limit("60/minute")
async def chat(
    request: Request,  # noqa: ARG001
    body: ChatRequest,
    widget_config: Annotated[dict, Depends(get_widget_config)],
):

    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    result = answer(body.question, collection_name)
    supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
        {
            "tenant_id": tenant_id,
            "question": body.question,
            "answer": result["answer"],
            "sources_cited": result["sources"],
            "latency_ms": result["latency_ms"],
        }
    ).execute()

    return result


@router.post("/stream")
@limiter.limit("60/minute")
async def chat_stream(
    request: Request,  # noqa: ARG001
    body: ChatRequest,
    widget_config: Annotated[dict, Depends(get_widget_config)],
):
    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"

    async def event_generator():
        answer_text = ""
        sources: list[dict] = []
        latency_ms = 0

        async for event in answer_stream(body.question, collection_name):
            payload = json.loads(event["data"])
            if payload["type"] == "done":
                answer_text = payload["answer"]
                sources = payload["sources"]
                latency_ms = payload["latency_ms"]
            yield event

        supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
            {
                "tenant_id": tenant_id,
                "question": body.question,
                "answer": answer_text,
                "sources_cited": sources,
                "latency_ms": latency_ms,
            }
        ).execute()

    return EventSourceResponse(event_generator())
