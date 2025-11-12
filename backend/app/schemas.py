from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

from .validators import (
    normalize_display_name,
    normalize_note,
    normalize_phone,
    normalize_prep_items,
)


class Table(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    capacity: int
    position: tuple[int, int] | None = None
    shape: Literal["circle", "rect"] = "circle"


class Area(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    tables: list[Table] = Field(default_factory=list)


class Restaurant(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    slug: str | None = None
    cuisine: list[str] = Field(default_factory=list)
    city: str = "Baku"
    address: str | None = None
    phone: str | None = None
    photos: list[str] = Field(default_factory=list)
    cover_photo: str | None = None
    short_description: str | None = None
    neighborhood: str | None = None
    price_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    map_images: list[str] = Field(default_factory=list)
    latitude: float | None = None
    longitude: float | None = None
    directions_url: str | None = None
    menu_url: str | None = None
    instagram: str | None = None
    whatsapp: str | None = None
    average_spend: str | None = None
    dress_code: str | None = None
    experiences: list[str] = Field(default_factory=list)
    areas: list[Area] = Field(default_factory=list)


class RestaurantListItem(BaseModel):
    id: UUID
    name: str
    slug: str | None = None
    cuisine: list[str]
    city: str
    neighborhood: str | None = None
    address: str | None = None
    cover_photo: str | None = None
    short_description: str | None = None
    price_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    average_spend: str | None = None


class BudgetPreference(BaseModel):
    max_pp: float | None = Field(default=None, ge=0)


class ConciergeIntent(BaseModel):
    lang: Literal["en", "az", "ru"] = "en"
    vibe_tags: list[str] = Field(default_factory=list)
    cuisine_tags: list[str] = Field(default_factory=list)
    location_tags: list[str] = Field(default_factory=list)
    price_bucket: Literal["budget", "mid", "upper", "luxury"] = "mid"
    time_context: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    negatives: list[str] = Field(default_factory=list)
    budget_azn: BudgetPreference | None = None


class ConciergeRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=600)
    lang: Literal["en", "az", "ru"] | None = None
    limit: int | None = Field(default=4, ge=1, le=12)


class ConciergeResponse(BaseModel):
    results: list[RestaurantListItem]
    match_reason: dict[str, list[str]] = Field(default_factory=dict)
    mode: Literal["local", "ai", "ab"] | None = None


class ConciergeQuery(BaseModel):
    """Legacy concierge payload used for the local fallback engine."""

    prompt: str = Field(min_length=3, max_length=500)
    limit: int = Field(default=4, ge=1, le=8)
    locale: str | None = Field(default=None, max_length=8)


class ReservationCreate(BaseModel):
    restaurant_id: UUID
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: UUID | None = None

    @field_validator("party_size")
    @classmethod
    def _party_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("party_size must be >= 1")
        return v

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: datetime, info):
        start = info.data.get("start")
        if isinstance(start, datetime) and v <= start:
            raise ValueError("end must be after start")
        return v

    @field_validator("guest_name")
    @classmethod
    def _guest_name(cls, value: str) -> str:
        return normalize_display_name(value, field="guest_name")

    @field_validator("guest_phone")
    @classmethod
    def _guest_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class Reservation(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    restaurant_id: UUID
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: UUID | None = None
    status: Literal["booked", "cancelled"] = "booked"

    @field_validator("guest_name")
    @classmethod
    def _res_guest_name(cls, value: str) -> str:
        return normalize_display_name(value, field="guest_name")

    @field_validator("guest_phone")
    @classmethod
    def _res_guest_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class PreorderRequest(BaseModel):
    minutes_away: int = Field(ge=5, le=60)
    scope: Literal["starters", "full"] = "starters"
    items: list[str] | None = None

    @property
    def normalized_items(self) -> list[str] | None:
        return self.items

    @field_validator("items", mode="before")
    @classmethod
    def _items(cls, value):  # type: ignore[override]
        return normalize_prep_items(value)


class PreorderConfirmRequest(PreorderRequest):
    pass


class PreorderQuoteResponse(BaseModel):
    policy: str
    recommended_prep_minutes: int
