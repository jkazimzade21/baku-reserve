from __future__ import annotations

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_geocode_prefers_gomap(monkeypatch):
    from backend.app import maps

    def fake_gomap(query: str, limit: int = 5, language: str | None = None):
        return [
            {
                "id": "gomap-1",
                "name": "Flame Towers",
                "place_name": "Flame Towers, Baku",
                "latitude": 40.3707,
                "longitude": 49.8352,
                "provider": "gomap",
            }
        ]

    monkeypatch.setattr(maps, "gomap_search", fake_gomap)

    resp = client.get("/maps/geocode", params={"query": "Flame"})
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["provider"] == "gomap"
    assert data[0]["name"] == "Flame Towers"


def test_geocode_handles_empty(monkeypatch):
    from backend.app import maps

    monkeypatch.setattr(maps, "gomap_search", lambda query, limit=5, language=None: [])

    resp = client.get("/maps/geocode", params={"query": "Unknown"})
    assert resp.status_code == 200
    assert resp.json() == []
