from __future__ import annotations

import hashlib
import logging
import time
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Dict, Iterable

import sentry_sdk

from .concierge_tags import (
    CANONICAL_LOCATION_TAGS,
    CANONICAL_VIBE_TAGS,
    CUISINE_SYNONYMS,
    NEGATIVE_SYNONYMS,
    NEIGHBORHOOD_TO_LOCATION,
    canonicalize_cuisines,
    canonicalize_locations,
    canonicalize_negatives,
    canonicalize_vibes,
    derive_restaurant_cuisines,
    derive_restaurant_locations,
    derive_restaurant_tags,
    prompt_keywords,
    restaurant_price_bucket,
)
from .embeddings import EmbeddingUnavailable, build_restaurant_vectors, cosine, embed, get_vector
from .llm_intent import IntentUnavailable, parse_intent
from .schemas import ConciergeIntent, ConciergeRequest, ConciergeResponse, RestaurantListItem
from .scoring import RestaurantFeatures, hybrid_score
from .serializers import restaurant_to_list_item
from .settings import settings
from .storage import DB

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30 * 60
CACHE_MAX_ENTRIES = 128
CANDIDATE_POOL = 12

PRICE_KEYWORDS = {
    "budget": [
        "cheap",
        "budget",
        "value",
        "student",
        "affordable",
        "inexpensive",
        "wallet friendly",
        "low key",
        "casual",
    ],
    "mid": [
        "mid",
        "weekday",
        "lunch",
        "moderate",
        "not too expensive",
        "reasonable",
    ],
    "upper": [
        "nice",
        "date",
        "special",
        "celebration",
        "romantic",
        "treat",
    ],
    "luxury": [
        "luxury",
        "splurge",
        "fine dining",
        "tasting",
        "upscale",
        "premium",
        "expensive",
        "high-end",
    ],
}

TIME_KEYWORDS = {
    "breakfast": ["breakfast", "morning"],
    "brunch": ["brunch", "sunday"],
    "lunch": ["lunch", "noon"],
    "dinner": ["dinner", "supper", "evening"],
    "late_night": ["late night", "after hours", "midnight"],
}

BUDGET_REGEX = re.compile(
    r"(under|below|less than|upto|up to|not more than|max|maximum)?\s*(\d{2,4})\s*(?:₼|azn|manat|pp|per person)?",
    re.IGNORECASE,
)

PRICE_CUES = re.compile(r"\b(azn|manat|price|budget|₼)\b", re.IGNORECASE)


@dataclass
class CachedPayload:
    restaurant_ids: list[str]
    reasons_by_id: dict[str, list[str]]


class PromptCache:
    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._store: OrderedDict[str, tuple[float, CachedPayload]] = OrderedDict()

    def get(self, key: str) -> CachedPayload | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: CachedPayload) -> None:
        expires_at = time.time() + self._ttl
        self._store[key] = (expires_at, value)
        self._store.move_to_end(key)
        while len(self._store) > self._max:
            self._store.popitem(last=False)


def _prompt_digest(prompt: str) -> str:
    return hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()[:12]


class ConciergeService:
    def __init__(self) -> None:
        self._weights = settings.parsed_concierge_weights
        self._list_items: Dict[str, RestaurantListItem] = {}
        self._features: Dict[str, RestaurantFeatures] = {}
        self._records: Dict[str, dict] = {}
        self._cache = PromptCache(CACHE_TTL_SECONDS, CACHE_MAX_ENTRIES)
        self._unique_cuisines: set[str] = set()
        self._vibe_keywords = self._flatten_mapping(CANONICAL_VIBE_TAGS)
        self._location_keywords = self._flatten_mapping(CANONICAL_LOCATION_TAGS)
        self._cuisine_keywords = self._flatten_mapping(CUISINE_SYNONYMS)
        self._negative_keywords = self._flatten_mapping(NEGATIVE_SYNONYMS)
        self._neighborhood_lookup = {
            token.replace("_", " "): tag for token, tag in NEIGHBORHOOD_TO_LOCATION.items()
        }
        self._load_restaurants()
        self._precompute_vectors()

    def _load_restaurants(self) -> None:
        self._list_items.clear()
        self._features.clear()
        self._records.clear()
        self._unique_cuisines.clear()
        for record in DB.restaurants.values():
            summary = restaurant_to_list_item(record, request=None)
            summary_item = RestaurantListItem(**summary)
            rid = str(summary_item.id)
            self._records[rid] = record
            self._list_items[rid] = summary_item
            tags = derive_restaurant_tags(record)
            cuisines = derive_restaurant_cuisines(record)
            locations = derive_restaurant_locations(record)
            price_bucket = restaurant_price_bucket(record.get("price_level"))
            for cuisine_name in record.get("cuisine") or []:
                if isinstance(cuisine_name, str):
                    self._unique_cuisines.add(cuisine_name.lower())
            features = RestaurantFeatures(
                restaurant_id=rid,
                slug=record.get("slug"),
                name=record.get("name"),
                tags=tags,
                cuisines=cuisines,
                locations=locations,
                price_bucket=price_bucket,
                short_description=record.get("short_description"),
                search_blob=" ".join(
                    filter(
                        None,
                        [
                            record.get("name"),
                            record.get("short_description"),
                            " ".join(record.get("tags") or []),
                            " ".join(record.get("cuisine") or []),
                            record.get("neighborhood"),
                            record.get("address"),
                        ],
                    )
                ),
            )
            self._features[rid] = features

    def _precompute_vectors(self) -> None:
        try:
            build_restaurant_vectors(self._list_items.values())
        except EmbeddingUnavailable as exc:
            logger.warning("Concierge embeddings unavailable: %s", exc)

    def recommend(self, payload: ConciergeRequest, request, mode_override: str | None) -> ConciergeResponse:
        prompt = payload.prompt.strip()
        limit = max(1, min(12, payload.limit or 4))
        if not prompt:
            return ConciergeResponse(results=[], match_reason={})
        mode = self._resolve_mode(mode_override, request, prompt)
        cache_key = self._cache_key(prompt, limit, payload.lang, mode)
        cached = self._cache.get(cache_key)
        if cached:
            return self._render_cached(cached, request)

        if mode == "local":
            response, cache_payload = self._local_fallback(payload, limit, request)
        else:
            try:
                response, cache_payload = self._ai_recommend(payload, limit, request, mode)
            except (IntentUnavailable, EmbeddingUnavailable, RuntimeError) as exc:
                logger.warning("Concierge AI fallback due to %s", exc)
                response, cache_payload = self._local_fallback(payload, limit, request)
        self._cache.set(cache_key, cache_payload)
        return response

    def _render_cached(self, payload: CachedPayload, request) -> ConciergeResponse:
        results: list[RestaurantListItem] = []
        reason_map: Dict[str, list[str]] = {}
        for rid in payload.restaurant_ids:
            record = self._records.get(rid) or DB.get_restaurant(rid)
            if not record:
                continue
            item = RestaurantListItem(**restaurant_to_list_item(record, request))
            results.append(item)
            key = (item.slug or str(item.id)).lower()
            reason_map[key] = payload.reasons_by_id.get(rid, [])
        return ConciergeResponse(results=results, match_reason=reason_map)

    def _resolve_mode(self, override: str | None, request, prompt: str) -> str:
        base = (override or settings.CONCIERGE_MODE or "local").strip().lower()
        if base == "ab":
            seed = self._ab_seed(request, prompt)
            bucket = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % 2
            return "ai" if bucket == 0 else "local"
        if base in {"ai", "local"}:
            return base
        return "local"

    def _ab_seed(self, request, prompt: str) -> str:
        for header in ("x-concierge-session", "x-device-id", "x-user-id"):
            value = request.headers.get(header) if request else None
            if value:
                return value
        client_host = getattr(getattr(request, "client", None), "host", None)
        if client_host:
            return client_host
        return _prompt_digest(prompt)

    def _cache_key(self, prompt: str, limit: int, lang: str | None, mode: str) -> str:
        digest = _prompt_digest(prompt)
        return f"{mode}:{limit}:{lang or 'auto'}:{digest}"

    def _ai_recommend(self, payload: ConciergeRequest, limit: int, request, mode: str) -> tuple[ConciergeResponse, CachedPayload]:
        prompt = payload.prompt.strip()
        prompt_fp = _prompt_digest(prompt)
        with sentry_sdk.configure_scope() as scope:
            scope.set_tag("feature_flag.concierge_mode", mode)
            scope.set_extra("concierge_prompt_fp", prompt_fp)
        sentry_sdk.add_breadcrumb(
            category="concierge",
            message="assignment",
            data={"mode": mode, "prompt_fp": prompt_fp},
        )

        with sentry_sdk.start_span(op="concierge.intent", description="llm_intent"):
            intent = parse_intent(prompt, payload.lang)

        with sentry_sdk.start_span(op="concierge.embed", description="query_embedding"):
            query_vector = embed(prompt)

        similarities = self._similarities(query_vector)
        if not similarities:
            raise EmbeddingUnavailable("No restaurant vectors available")

        prompt_terms = prompt_keywords(prompt)
        candidates = []
        with sentry_sdk.start_span(op="concierge.score", description="hybrid_scoring"):
            for rid, emb_sim in similarities[:CANDIDATE_POOL]:
                features = self._features.get(rid)
                item = self._list_items.get(rid)
                if not features or not item:
                    continue
                score, reasons = hybrid_score(intent, features, emb_sim, self._weights, prompt_terms)
                candidates.append((score, reasons, item))

        ai_floor = settings.AI_SCORE_FLOOR or 0.0
        candidates.sort(key=lambda item: (-item[0], str(item[2].slug or item[2].id)))
        filtered = [(score, reasons, item) for score, reasons, item in candidates if score >= ai_floor]
        if not filtered:
            raise RuntimeError("No candidates cleared AI floor")

        with sentry_sdk.start_span(op="concierge.serialize", description="response_build"):
            results = []
            reason_map: Dict[str, list[str]] = {}
            reasons_by_id: Dict[str, list[str]] = {}
            selected_ids: list[str] = []
            for score, reasons, item in filtered[:limit]:
                record = self._records.get(str(item.id))
                if record:
                    response_item = RestaurantListItem(**restaurant_to_list_item(record, request))
                else:
                    response_item = item
                results.append(response_item)
                key = (response_item.slug or str(response_item.id)).lower()
                chips = self._format_reasons(reasons)
                reason_map[key] = chips
                rid = str(response_item.id)
                reasons_by_id[rid] = chips
                selected_ids.append(rid)
        response = ConciergeResponse(results=results, match_reason=reason_map)
        cache_payload = CachedPayload(restaurant_ids=selected_ids, reasons_by_id=reasons_by_id)
        return response, cache_payload

    def _format_reasons(self, reasons: Iterable[str]) -> list[str]:
        chips: list[str] = []
        for raw in reasons:
            label = raw.replace("_", " ").strip()
            if label in {"budget", "mid", "upper", "luxury"}:
                label = {"budget": "$", "mid": "$$", "upper": "$$$", "luxury": "$$$$"}[label]
            else:
                label = label.title()
            if label and label not in chips:
                chips.append(label)
            if len(chips) == 4:
                break
        return chips

    def _similarities(self, query_vector) -> list[tuple[str, float]]:
        sims: list[tuple[str, float]] = []
        for rid in self._list_items.keys():
            vector = get_vector(rid)
            if vector is None:
                continue
            sims.append((rid, cosine(query_vector, vector)))
        sims.sort(key=lambda item: item[1], reverse=True)
        return sims

    def _local_fallback(self, payload: ConciergeRequest, limit: int, request) -> tuple[ConciergeResponse, CachedPayload]:
        prompt = payload.prompt.strip()
        intent = self._simple_intent(prompt)
        prompt_terms = prompt_keywords(prompt)
        scored: list[tuple[float, list[str], RestaurantListItem]] = []
        for rid, features in self._features.items():
            item = self._records.get(rid)
            summary = self._list_items.get(rid)
            if not item or not summary:
                continue
            sim = self._lexical_similarity(prompt_terms, features)
            score, reasons = hybrid_score(intent, features, sim, self._weights, prompt_terms)
            scored.append((score, reasons, summary))

        scored.sort(key=lambda entry: (-entry[0], entry[2].slug or str(entry[2].id)))
        floor = max(settings.AI_SCORE_FLOOR or 0.0, 0.05)
        filtered = [entry for entry in scored if entry[0] >= floor]
        if not filtered:
            filtered = scored[:limit]

        results: list[RestaurantListItem] = []
        reason_map: Dict[str, list[str]] = {}
        reasons_by_id: Dict[str, list[str]] = {}
        ids: list[str] = []
        for score, reasons, summary in filtered[:limit]:
            record = self._records.get(str(summary.id))
            if record:
                summary_obj = RestaurantListItem(**restaurant_to_list_item(record, request))
            else:
                summary_obj = summary
            results.append(summary_obj)
            key = (summary_obj.slug or str(summary_obj.id)).lower()
            chips = self._format_reasons(reasons)
            reason_map[key] = chips
            rid = str(summary_obj.id)
            reasons_by_id[rid] = chips
            ids.append(rid)
        response = ConciergeResponse(results=results, match_reason=reason_map)
        cache_payload = CachedPayload(restaurant_ids=ids, reasons_by_id=reasons_by_id)
        return response, cache_payload

    @staticmethod
    def _flatten_mapping(mapping: Dict[str, dict]) -> list[tuple[str, set[str]]]:
        table: list[tuple[str, set[str]]] = []
        for canonical, localized in mapping.items():
            synonyms: set[str] = set()
            synonyms.add(canonical.replace("_", " "))
            synonyms.add(canonical)
            for values in localized.values():
                for value in values:
                    if value:
                        synonyms.add(value.lower())
            table.append((canonical, {syn.strip() for syn in synonyms if syn.strip()}))
        return table

    def _simple_intent(self, prompt: str) -> ConciergeIntent:
        lowered = prompt.lower()
        vibe_hits = self._match_keywords(lowered, self._vibe_keywords)
        location_hits = self._match_keywords(lowered, self._location_keywords)
        for token, tag in self._neighborhood_lookup.items():
            if token and token in lowered:
                location_hits.append(tag)
        cuisine_hits = self._match_keywords(lowered, self._cuisine_keywords)
        for cuisine in self._unique_cuisines:
            if cuisine and cuisine in lowered:
                cuisine_hits.append(cuisine)
        negative_hits = self._match_keywords(lowered, self._negative_keywords)
        price_bucket = self._detect_price_bucket(lowered)
        time_context = self._detect_time_slots(lowered)
        intent = ConciergeIntent(
            lang=self._detect_lang(prompt),
            vibe_tags=canonicalize_vibes(vibe_hits),
            cuisine_tags=canonicalize_cuisines(cuisine_hits),
            location_tags=canonicalize_locations(location_hits),
            price_bucket=price_bucket,
            time_context=time_context,
            amenities=[],
            negatives=canonicalize_negatives(negative_hits),
            budget_azn=None,
        )
        return intent

    @staticmethod
    def _match_keywords(prompt_lower: str, table: list[tuple[str, set[str]]]) -> list[str]:
        hits: list[str] = []
        for canonical, keywords in table:
            if any(keyword in prompt_lower for keyword in keywords):
                hits.append(canonical)
        return hits

    def _detect_price_bucket(self, prompt_lower: str) -> str:
        for match in BUDGET_REGEX.finditer(prompt_lower):
            value = match.group(2)
            if value and value.isdigit():
                bucket = self._bucket_from_value(int(value))
                if bucket:
                    return bucket
        if PRICE_CUES.search(prompt_lower):
            numbers = re.findall(r"(\d{2,4})", prompt_lower)
            for number in numbers:
                try:
                    bucket = self._bucket_from_value(int(number))
                except ValueError:
                    continue
                else:
                    return bucket
        for bucket, keywords in PRICE_KEYWORDS.items():
            if any(keyword in prompt_lower for keyword in keywords):
                if bucket == "budget":
                    return "budget"
                if bucket == "mid":
                    return "mid"
                if bucket == "upper":
                    return "upper"
                return "luxury"
        return "mid"

    @staticmethod
    def _bucket_from_value(value: int) -> str:
        if value <= 40:
            return "budget"
        if value <= 70:
            return "mid"
        if value <= 110:
            return "upper"
        return "luxury"

    def _detect_time_slots(self, prompt_lower: str) -> list[str]:
        hits: list[str] = []
        for slot, keywords in TIME_KEYWORDS.items():
            if any(keyword in prompt_lower for keyword in keywords):
                hits.append(slot)
        return hits

    @staticmethod
    def _detect_lang(prompt: str) -> str:
        lowered = prompt.lower()
        if re.search(r"[əığöüşç]", lowered):
            return "az"
        if re.search(r"[\u0400-\u04FF]", prompt):
            return "ru"
        return "en"

    def _lexical_similarity(self, prompt_terms: set[str], features: RestaurantFeatures) -> float:
        if not prompt_terms:
            return 0.0
        doc_terms = prompt_keywords(features.search_blob or features.name or "")
        if not doc_terms:
            return 0.0
        overlap = len(prompt_terms & doc_terms)
        if overlap == 0:
            return 0.0
        return overlap / max(1.0, (len(prompt_terms) * len(doc_terms)) ** 0.5)


concierge_service = ConciergeService()
