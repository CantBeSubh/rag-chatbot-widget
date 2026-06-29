from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200_when_all_deps_ok():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        schema = mock_supa.schema.return_value
        table = schema.table.return_value
        select = table.select.return_value
        limit = select.limit.return_value
        limit.execute.return_value = mock_result

        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["supabase"] == "ok"
    assert body["checks"]["redis"] == "ok"
    assert body["checks"]["zilliz"] == "ok"
    assert "ts" in body


def test_health_returns_degraded_when_supabase_fails():
    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        mock_supa.schema.side_effect = Exception("connection refused")
        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["supabase"].startswith("error:")
    assert body["checks"]["redis"] == "ok"
    assert body["checks"]["zilliz"] == "ok"


def test_health_returns_degraded_when_redis_fails():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        schema = mock_supa.schema.return_value
        table = schema.table.return_value
        select = table.select.return_value
        limit = select.limit.return_value
        limit.execute.return_value = mock_result

        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.side_effect = Exception("redis down")

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["redis"].startswith("error:")


def test_health_returns_degraded_when_zilliz_fails():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        schema = mock_supa.schema.return_value
        table = schema.table.return_value
        select = table.select.return_value
        limit = select.limit.return_value
        limit.execute.return_value = mock_result

        mock_zilliz.list_collections.side_effect = Exception("zilliz unreachable")
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["zilliz"].startswith("error:")
