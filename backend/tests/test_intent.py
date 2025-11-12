import json
from types import SimpleNamespace

import pytest
from backend.app import llm_intent
from backend.app.llm_intent import parse_intent
from backend.app.settings import settings


class DummyResponse:
    def __init__(self, payload):
        self.choices = [SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]


class DummyClient:
    def __init__(self, payload):
        self.payload = payload
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=lambda **_: DummyResponse(self.payload))
        )


@pytest.fixture(autouse=True)
def reset_intent(monkeypatch):
    settings.OPENAI_API_KEY = "test-key"
    monkeypatch.setattr(llm_intent, "_client", None)
    monkeypatch.setattr(llm_intent, "_failure_count", 0)
    monkeypatch.setattr(llm_intent, "_disabled_until", 0.0)


def test_parse_intent_normalizes_azerbaijani_prompt(monkeypatch):
    payload = {
        "lang": "az",
        "vibe_tags": ["Romantik", "ROOFTOP"],
        "cuisine_tags": ["Azerbaycan mətbəxi"],
        "location_tags": ["Içərişəhər"],
        "price_bucket": "upper",
        "time_context": ["dinner"],
        "amenities": ["canlı musiqi"],
        "negatives": ["səs-küy olmasın"],
    }
    dummy = DummyClient(payload)
    monkeypatch.setattr(llm_intent, "_get_client", lambda: dummy)

    intent = parse_intent("Romantik görüş üçün dam terası istəyirəm", "az")

    assert intent.lang == "az"
    assert intent.vibe_tags == ["romantic", "rooftop"]
    assert intent.cuisine_tags == ["azerbaijani"]
    assert intent.location_tags == ["old_city"]
    assert intent.amenities == ["live_music"]
    assert intent.negatives == ["no_loud_music"]


def test_parse_intent_normalizes_russian_negatives(monkeypatch):
    payload = {
        "lang": "ru",
        "vibe_tags": ["семейный"],
        "cuisine_tags": ["seafood"],
        "location_tags": ["Port Baku"],
        "price_bucket": "mid",
        "time_context": ["dinner"],
        "amenities": [],
        "negatives": ["без громкой музыки"],
    }
    dummy = DummyClient(payload)
    monkeypatch.setattr(llm_intent, "_get_client", lambda: dummy)

    intent = parse_intent("Нужен семейный ужин у моря без громкой музыки", "ru")

    assert intent.lang == "ru"
    assert intent.vibe_tags == ["family_friendly"]
    assert intent.location_tags == ["port_baku"]
    assert intent.negatives == ["no_loud_music"]
