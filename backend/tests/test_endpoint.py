from backend.app.concierge_service import CachedPayload, concierge_service
from backend.app.llm_intent import IntentUnavailable
from backend.app.schemas import ConciergeResponse, RestaurantListItem
from backend.app.serializers import restaurant_to_list_item
from backend.app.settings import settings
from backend.app.storage import DB


def test_concierge_endpoint_returns_ai_payload(monkeypatch, client):
    original_mode = settings.CONCIERGE_MODE
    settings.CONCIERGE_MODE = "ai"

    record = next(iter(DB.restaurants.values()))
    restaurant = RestaurantListItem(**restaurant_to_list_item(record, request=None))

    def fake_ai(payload, limit, request, mode):  # noqa: ANN001
        response = ConciergeResponse(
            results=[RestaurantListItem(**restaurant_to_list_item(record, request))],
            match_reason={(restaurant.slug or str(restaurant.id)).lower(): ["Romantic", "$$$"]},
        )
        cached = CachedPayload(
            restaurant_ids=[str(restaurant.id)],
            reasons_by_id={str(restaurant.id): ["Romantic", "$$$"]},
        )
        return response, cached

    monkeypatch.setattr(concierge_service, "_ai_recommend", fake_ai)

    try:
        res = client.post("/concierge/recommendations", json={"prompt": "Weekend date night", "limit": 2})
    finally:
        settings.CONCIERGE_MODE = original_mode
    assert res.status_code == 200
    body = res.json()
    assert "results" in body
    assert isinstance(body["results"], list)
    assert body["results"][0]["name"] == restaurant.name
    key = (restaurant.slug or str(restaurant.id)).lower()
    assert body["match_reason"][key] == ["Romantic", "$$$"]


def test_concierge_endpoint_falls_back_when_ai_unavailable(monkeypatch, client):
    original_mode = settings.CONCIERGE_MODE
    settings.CONCIERGE_MODE = "ai"

    def boom(*args, **kwargs):  # noqa: ANN001, ANN002
        raise IntentUnavailable("llm offline")

    monkeypatch.setattr(concierge_service, "_ai_recommend", boom)

    try:
        res = client.post("/concierge/recommendations", json={"prompt": "Cozy brunch", "limit": 2})
    finally:
        settings.CONCIERGE_MODE = original_mode
    assert res.status_code == 200
    body = res.json()
    assert len(body["results"]) == 2
    assert all("name" in item for item in body["results"])


def test_concierge_validation_rejects_short_prompt(client):
    res = client.post("/concierge/recommendations", json={"prompt": "ok", "limit": 1})
    assert res.status_code == 422
