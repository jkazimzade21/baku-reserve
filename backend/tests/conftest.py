import os
import sys
from pathlib import Path

import pytest
import sentry_sdk
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Disable outbound Sentry / GoMap calls during tests
sentry_sdk.init = lambda *args, **kwargs: None  # type: ignore[assignment]
os.environ["SENTRY_DSN"] = ""
os.environ["GOMAP_GUID"] = ""
test_data_dir = ROOT / "artifacts" / "test-data"
test_data_dir.mkdir(parents=True, exist_ok=True)
os.environ["DATA_DIR"] = str(test_data_dir)

from backend.app.main import app  # noqa: E402
from backend.app.settings import settings  # noqa: E402
from backend.app.storage import DB  # noqa: E402


def _purge_reservations() -> None:
    for record in list(DB.list_reservations()):
        DB.cancel_reservation(record["id"])


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app, base_url="http://api.testserver")


@pytest.fixture(autouse=True)
def clean_reservations() -> None:
    settings.AUTH0_BYPASS = True
    settings.RATE_LIMIT_ENABLED = False
    settings.OPENAI_API_KEY = None
    settings.CONCIERGE_MODE = "local"
    settings.SENTRY_DSN = None
    settings.GOMAP_GUID = None
    os.environ.setdefault("CONCIERGE_MODE", "local")
    os.environ.pop("OPENAI_API_KEY", None)
    limiter = getattr(app.state, "rate_limiter", None)
    if limiter:
        limiter.reset()
    _purge_reservations()
    yield
    _purge_reservations()
