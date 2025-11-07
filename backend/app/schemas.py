from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


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
    deposit_policy: str | None = None
    map_images: list[str] = Field(default_factory=list)
    latitude: float | None = None
    longitude: float | None = None
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
    cuisine: list[str]
    city: str
    cover_photo: str | None = None
    short_description: str | None = None
    price_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    average_spend: str | None = None
    requires_deposit: bool = False


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
