import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app  # noqa: E402
from backend.app.storage import DB  # noqa: E402
from backend.app.settings import settings  # noqa: E402


def _purge_reservations() -> None:
    for record in list(DB.list_reservations()):
        DB.cancel_reservation(record["id"])


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app, base_url="http://api.testserver")


@pytest.fixture(autouse=True)
def clean_reservations() -> None:
    settings.AUTH0_BYPASS = True
    _purge_reservations()
    yield
    _purge_reservations()
