from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# --- Tables & floorplan (string IDs so our demo IDs work) ---
class Table(BaseModel):
    id: str
    name: str | None = None
    capacity: int = 2


class Area(BaseModel):
    id: str
    name: str | None = None
    tables: list[Table] = Field(default_factory=list)


# --- Restaurant list/detail ---
class RestaurantListItem(BaseModel):
    id: str
    name: str
    cuisine: list[str] = Field(default_factory=list)
    city: str
    slug: str | None = None
    cover_photo: str | None = None


class Restaurant(BaseModel):
    id: str
    name: str
    slug: str | None = None
    cuisine: list[str] = Field(default_factory=list)
    city: str = "Baku"
    address: str | None = None
    phone: str | None = None
    photos: list[str] = Field(default_factory=list)
    areas: list[Area] = Field(default_factory=list)


# --- Reservations ---
class ReservationCreate(BaseModel):
    restaurant_id: str
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: str | None = None

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


class Reservation(BaseModel):
    id: str
    restaurant_id: str
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: str | None = None
    status: Literal["booked", "cancelled"] = "booked"
