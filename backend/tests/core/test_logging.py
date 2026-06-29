import io
import json
from unittest.mock import patch

from app.core.logging import configure_logging, get_logger


def test_configure_logging_outputs_json():
    """configure_logging() must produce JSON-parseable output on logger.info()."""
    configure_logging()
    logger = get_logger()

    buf = io.StringIO()
    with patch("sys.stdout", buf):
        logger.info("test_event", tenant_id="abc", count=3)

    output = buf.getvalue().strip()
    # structlog JSONRenderer writes one JSON object per line
    record = json.loads(output)
    assert record["event"] == "test_event"
    assert record["tenant_id"] == "abc"
    assert record["count"] == 3
    assert record["level"] == "info"
    assert "timestamp" in record


def test_get_logger_returns_bound_logger():
    configure_logging()
    logger = get_logger()
    assert hasattr(logger, "info")
    assert hasattr(logger, "warning")
    assert hasattr(logger, "error")
