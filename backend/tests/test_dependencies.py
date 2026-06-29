import uuid

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.database import supabase
from app.dependencies import get_current_tenant_id

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)


@pytest.fixture
def test_tenant():
    result = _SCHEMA.table("tenants").insert({"user_id": str(uuid.uuid4())}).execute()
    tenant = result.data[0]
    yield tenant
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_get_current_tenant_id_returns_id_for_valid_api_key(test_tenant):
    tenant_id = get_current_tenant_id(f"Bearer {test_tenant['api_key']}")

    assert tenant_id == test_tenant["id"]


def test_get_current_tenant_id_raises_401_for_unknown_api_key():
    with pytest.raises(HTTPException) as exc_info:
        get_current_tenant_id(f"Bearer {uuid.uuid4()}")

    assert exc_info.value.status_code == 401
