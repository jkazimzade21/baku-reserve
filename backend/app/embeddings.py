from __future__ import annotations

import logging
from collections.abc import Iterable
from hashlib import sha256
from threading import Lock

import numpy as np

from .contracts import RestaurantListItem
from .openai_async import OpenAIUnavailable, close_async_client, post_json
from .settings import settings

logger = logging.getLogger(__name__)

_vectors: dict[str, np.ndarray] = {}
_vector_norms: dict[str, float] = {}
_corpus_hash: dict[str, str] = {}
_lock = Lock()


class EmbeddingUnavailable(RuntimeError):
    pass


async def embed(text: str) -> np.ndarray:
    payload = {
        "model": settings.CONCIERGE_EMBED_MODEL,
        "input": [text[:2000]],
    }
    try:
        response = await post_json(
            "/embeddings",
            payload,
            timeout=settings.OPENAI_TIMEOUT_SECONDS,
        )
    except OpenAIUnavailable as exc:
        raise EmbeddingUnavailable("Embedding call failed") from exc
    vector = response["data"][0]["embedding"]
    return np.array(vector, dtype=np.float32)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _serialize_restaurant(rest: RestaurantListItem) -> str:
    parts = [
        rest.name,
        rest.short_description or "",
        rest.neighborhood or "",
        rest.address or "",
        " ".join(rest.cuisine or []),
        " ".join(rest.tags or []),
        rest.average_spend or "",
    ]
    return " | ".join(part for part in parts if part)


async def build_restaurant_vectors(restaurants: Iterable[RestaurantListItem]) -> dict[str, np.ndarray]:
    payload: list[tuple[str, str, str]] = []
    updated: dict[str, np.ndarray] = {}
    with _lock:
        for rest in restaurants:
            rid = str(rest.id)
            corpus = _serialize_restaurant(rest)
            digest = sha256(corpus.encode("utf-8")).hexdigest()
            if rid in _vectors and _corpus_hash.get(rid) == digest:
                updated[rid] = _vectors[rid]
                continue
            payload.append((rid, corpus, digest))
        if not payload:
            return dict(_vectors)

    for start in range(0, len(payload), 32):
        batch = payload[start : start + 32]
        texts = [text[:2000] for _, text, _ in batch]
        request_payload = {
            "model": settings.CONCIERGE_EMBED_MODEL,
            "input": texts,
        }
        try:
            response = await post_json(
                "/embeddings",
                request_payload,
                timeout=settings.OPENAI_TIMEOUT_SECONDS,
            )
        except OpenAIUnavailable as exc:
            logger.warning("Embedding batch failed: %s", exc)
            raise EmbeddingUnavailable("Failed to build restaurant vectors") from exc
        data = response["data"]
        with _lock:
            for (rid, _corpus, digest), item in zip(batch, data, strict=False):
                vec = np.array(item["embedding"], dtype=np.float32)
                _vectors[rid] = vec
                _vector_norms[rid] = float(np.linalg.norm(vec) or 1.0)
                _corpus_hash[rid] = digest
                updated[rid] = vec
    return dict(_vectors)


def get_vector(restaurant_id: str) -> np.ndarray | None:
    with _lock:
        return _vectors.get(str(restaurant_id))


def get_vectors() -> dict[str, np.ndarray]:
    with _lock:
        return dict(_vectors)


def vector_norm(restaurant_id: str) -> float:
    with _lock:
        return _vector_norms.get(str(restaurant_id), 1.0)


async def close_embeddings_client() -> None:
    await close_async_client()
