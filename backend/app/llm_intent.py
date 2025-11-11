from __future__ import annotations

import json
import logging
import time
from hashlib import sha256
from typing import Optional

from openai import OpenAI
from openai._exceptions import OpenAIError
from pydantic import ValidationError

from .concierge_tags import (
    canonicalize_amenities,
    canonicalize_cuisines,
    canonicalize_locations,
    canonicalize_negatives,
    canonicalize_vibes,
)
from .schemas import ConciergeIntent
from .settings import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 2.0
MAX_FAILURES = 3
COOLDOWN_SECONDS = 300.0  # 5 minutes

_client: OpenAI | None = None
_failure_count = 0
_disabled_until = 0.0


class IntentUnavailable(RuntimeError):
    """Raised when the intent parser cannot be used."""


def _now() -> float:
    return time.monotonic()


def _prompt_fingerprint(prompt: str) -> str:
    return sha256(prompt.encode("utf-8")).hexdigest()[:10]


def _normalize_lang(lang: Optional[str]) -> str | None:
    if not lang:
        return None
    lowered = lang.strip().lower()
    if lowered in ("en", "english"):
        return "en"
    if lowered in ("az", "aze", "az-az"):
        return "az"
    if lowered in ("ru", "rus", "ru-ru"):
        return "ru"
    return None


def _detect_lang(prompt: str) -> str:
    lowered = prompt.lower()
    if any(ch in lowered for ch in "əığöüşç"):
        return "az"
    if any("\u0400" <= ch <= "\u04FF" for ch in prompt):
        return "ru"
    return "en"


def _get_client() -> OpenAI:
    global _client
    if not settings.OPENAI_API_KEY:
        raise IntentUnavailable("OPENAI_API_KEY not configured")
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def _circuit_open() -> bool:
    return _failure_count >= MAX_FAILURES and _disabled_until > _now()


def _register_failure(exc: Exception | None = None) -> None:
    global _failure_count, _disabled_until
    _failure_count += 1
    if _failure_count >= MAX_FAILURES:
        _disabled_until = _now() + COOLDOWN_SECONDS
    if exc:
        logger.warning("LLM intent failure (%s/%s)", _failure_count, MAX_FAILURES, exc_info=exc)


def _register_success() -> None:
    global _failure_count, _disabled_until
    _failure_count = 0
    _disabled_until = 0.0


SYSTEM_PROMPT = (
    "You are a multilingual dining concierge for Baku. "
    "Return structured JSON only. No prose. Map preferences to canonical tags."
)

CANONICAL_GUIDE = (
    "Vibe tags: romantic, family_friendly, rooftop, garden, live_music, skyline, waterfront, mixology, brunch, "
    "breakfast, late_night, shisha, wine_cellar, seafood, steakhouse, sushi, cozy, fine_dining, trendy, group_friendly, heritage. "
    "Location tags: old_city, fountain_square, port_baku, seaside, flame_towers, bayil, yasamal, city_center. "
    "Negatives: no_loud_music, no_smoking, not_spicy, no_shisha. "
    "Price bucket: budget | mid | upper | luxury."
)

FEW_SHOT_EXAMPLES = [
    (
        "PROMPT (en): Romantic dinner near Flame Towers, rooftop or skyline vibes, no loud music please, budget 120 AZN per person",
        {
            "lang": "en",
            "vibe_tags": ["romantic", "rooftop", "skyline"],
            "cuisine_tags": [],
            "location_tags": ["flame_towers"],
            "price_bucket": "upper",
            "time_context": ["dinner"],
            "amenities": ["live_music"],
            "negatives": ["no_loud_music"],
            "budget_azn": {"max_pp": 120},
        },
    ),
    (
        "PROMPT (az): Ailəvi rahat brunch üçün Fountain Square ətrafında sakit, şişəsiz məkan axtarıram",
        {
            "lang": "az",
            "vibe_tags": ["family_friendly", "cozy", "brunch"],
            "cuisine_tags": [],
            "location_tags": ["fountain_square"],
            "price_bucket": "mid",
            "time_context": ["brunch"],
            "amenities": [],
            "negatives": ["no_shisha"],
        },
    ),
    (
        "PROMPT (ru): Хочу роскошный ужин у моря в Port Baku, без кальяна и слишком громкой музыки",
        {
            "lang": "ru",
            "vibe_tags": ["fine_dining", "waterfront"],
            "cuisine_tags": [],
            "location_tags": ["port_baku"],
            "price_bucket": "luxury",
            "time_context": ["dinner"],
            "amenities": [],
            "negatives": ["no_shisha", "no_loud_music"],
        },
    ),
    (
        "PROMPT (en): Need a sushi-focused spot with late night hours around Port Baku",
        {
            "lang": "en",
            "vibe_tags": ["late_night"],
            "cuisine_tags": ["sushi"],
            "location_tags": ["port_baku"],
            "price_bucket": "upper",
            "time_context": ["late_night"],
            "amenities": [],
            "negatives": [],
        },
    ),
    (
        "PROMPT (az): Şəhər mərkəzində iş yeməyi üçün sakit, fine dining, şərab kolleksiyası olan məkan",
        {
            "lang": "az",
            "vibe_tags": ["fine_dining", "cozy"],
            "cuisine_tags": [],
            "location_tags": ["city_center"],
            "price_bucket": "upper",
            "time_context": ["lunch"],
            "amenities": ["wine_cellar"],
            "negatives": ["no_loud_music"],
        },
    ),
    (
        "PROMPT (ru): Ищу семейный ресторан азербайджанской кухни в Ичеришехере, бюджет до 60 AZN",
        {
            "lang": "ru",
            "vibe_tags": ["family_friendly", "heritage"],
            "cuisine_tags": ["azerbaijani"],
            "location_tags": ["old_city"],
            "price_bucket": "mid",
            "time_context": ["dinner"],
            "amenities": [],
            "negatives": [],
            "budget_azn": {"max_pp": 60},
        },
    ),
]


def _few_shot_messages() -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for user_prompt, response in FEW_SHOT_EXAMPLES:
        messages.append({"role": "user", "content": user_prompt})
        messages.append({"role": "assistant", "content": json.dumps(response, ensure_ascii=False)})
    return messages


def parse_intent(prompt: str, lang_hint: Optional[str]) -> ConciergeIntent:
    if not prompt.strip():
        raise IntentUnavailable("Empty prompt")
    if _circuit_open():
        raise IntentUnavailable("Intent parser cooling down")

    normalized_hint = _normalize_lang(lang_hint) or _detect_lang(prompt)
    client = _get_client()
    digest = _prompt_fingerprint(prompt)
    try:
        response = client.chat.completions.create(
            model=settings.CONCIERGE_GPT_MODEL,
            temperature=0,
            max_tokens=450,
            timeout=TIMEOUT_SECONDS,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": CANONICAL_GUIDE},
                * _few_shot_messages(),
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "lang_hint": normalized_hint,
                            "prompt": prompt.strip(),
                            "instructions": "Respond with valid JSON only, matching the schema.",
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        )
    except OpenAIError as exc:
        _register_failure(exc)
        raise IntentUnavailable("LLM call failed") from exc

    content = response.choices[0].message.content if response.choices else None
    if not content:
        _register_failure()
        raise IntentUnavailable("Empty LLM response")

    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning("Intent JSON decode failed (%s): %s", digest, content)
        _register_failure(exc)
        raise IntentUnavailable("Invalid intent JSON") from exc

    bucket = str(payload.get("price_bucket") or "").strip().lower()
    if bucket not in {"budget", "mid", "upper", "luxury"}:
        payload["price_bucket"] = "mid"

    try:
        intent_model = ConciergeIntent.model_validate(payload)
    except ValidationError as exc:
        logger.warning("Intent validation failed (%s): %s", digest, payload)
        _register_failure(exc)
        raise IntentUnavailable("Invalid intent format") from exc

    lang_value = _normalize_lang(intent_model.lang) or normalized_hint or "en"
    canonical_intent = intent_model.model_copy(
        update={
            "lang": lang_value,
            "vibe_tags": canonicalize_vibes(intent_model.vibe_tags, lang_value),
            "cuisine_tags": canonicalize_cuisines(intent_model.cuisine_tags, lang_value),
            "location_tags": canonicalize_locations(intent_model.location_tags, lang_value),
            "amenities": canonicalize_amenities(intent_model.amenities, lang_value),
            "negatives": canonicalize_negatives(intent_model.negatives, lang_value),
        }
    )
    _register_success()
    logger.debug("Intent parsed %s -> %s", digest, canonical_intent.model_dump(exclude_none=True))
    return canonical_intent
