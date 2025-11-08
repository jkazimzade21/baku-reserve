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


class ArrivalIntent(BaseModel):
    status: Literal["idle", "requested", "queued", "approved", "rejected", "cancelled"] = "idle"
    lead_minutes: int | None = None
    prep_scope: Literal["starters", "mains", "full"] | None = None
    eta_source: Literal["user", "prediction", "location"] | None = None
    deposit_amount: int | None = None
    deposit_currency: str | None = "AZN"
    deposit_status: Literal["unpaid", "authorized", "captured", "refunded"] = "unpaid"
    last_signal: datetime | None = None
    share_location: bool = False
    notes: str | None = None
    auto_charge: bool = False
    predicted_eta_minutes: int | None = None
    confirmed_eta_minutes: int | None = None
    last_location: dict[str, float] | None = None


class ArrivalIntentRequest(BaseModel):
    lead_minutes: int = Field(ge=5, le=90)
    prep_scope: Literal["starters", "mains", "full"] = "full"
    share_location: bool = False
    eta_source: Literal["user", "prediction", "location"] = "user"
    auto_charge: bool = True
    notes: str | None = None


class ArrivalIntentDecision(BaseModel):
    action: Literal["approve", "queue", "reject", "cancel"]
    notes: str | None = None


class ArrivalLocationPing(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ArrivalEtaConfirmation(BaseModel):
    eta_minutes: int = Field(ge=1, le=240)


class UserBase(BaseModel):
    name: str
    email: str
    phone: str


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: str
    verified_email: bool = False
    verified_phone: bool = False
    created_at: datetime
    updated_at: datetime


class OtpRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)


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
    arrival_intent: ArrivalIntent | None = None
