from __future__ import annotations

import logging
from hashlib import sha256
from threading import Lock
from typing import Dict, Iterable

import numpy as np
from openai import OpenAI
from openai._exceptions import OpenAIError

from .schemas import RestaurantListItem
from .settings import settings

logger = logging.getLogger(__name__)

_client: OpenAI | None = None
_vectors: Dict[str, np.ndarray] = {}
_vector_norms: Dict[str, float] = {}
_corpus_hash: Dict[str, str] = {}
_lock = Lock()


class EmbeddingUnavailable(RuntimeError):
    pass


def _get_client() -> OpenAI:
    global _client
    if not settings.OPENAI_API_KEY:
        raise EmbeddingUnavailable("OPENAI_API_KEY not configured")
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def embed(text: str) -> np.ndarray:
    client = _get_client()
    try:
        response = client.embeddings.create(
            model=settings.CONCIERGE_EMBED_MODEL,
            input=[text[:2000]],
        )
    except OpenAIError as exc:
        raise EmbeddingUnavailable("Embedding call failed") from exc
    vector = response.data[0].embedding
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


def build_restaurant_vectors(restaurants: Iterable[RestaurantListItem]) -> Dict[str, np.ndarray]:
    client = _get_client()
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
        try:
            response = client.embeddings.create(
                model=settings.CONCIERGE_EMBED_MODEL,
                input=texts,
            )
        except OpenAIError as exc:
            logger.warning("Embedding batch failed: %s", exc)
            raise EmbeddingUnavailable("Failed to build restaurant vectors") from exc
        data = response.data
        with _lock:
            for (rid, corpus, digest), item in zip(batch, data):
                vec = np.array(item.embedding, dtype=np.float32)
                _vectors[rid] = vec
                _vector_norms[rid] = float(np.linalg.norm(vec) or 1.0)
                _corpus_hash[rid] = digest
                updated[rid] = vec
    return dict(_vectors)


def get_vector(restaurant_id: str) -> np.ndarray | None:
    with _lock:
        return _vectors.get(str(restaurant_id))


def get_vectors() -> Dict[str, np.ndarray]:
    with _lock:
        return dict(_vectors)


def vector_norm(restaurant_id: str) -> float:
    with _lock:
        return _vector_norms.get(str(restaurant_id), 1.0)
