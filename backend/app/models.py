from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal
from datetime import datetime

# --- Tables & floorplan (string IDs so our demo IDs work) ---
class Table(BaseModel):
    id: str
    name: Optional[str] = None
    capacity: int = 2

class Area(BaseModel):
    id: str
    name: Optional[str] = None
    tables: List[Table] = Field(default_factory=list)

# --- Restaurant list/detail ---
class RestaurantListItem(BaseModel):
    id: str
    name: str
    cuisine: List[str] = Field(default_factory=list)
    city: str
    cover_photo: Optional[str] = None

class Restaurant(BaseModel):
    id: str
    name: str
    cuisine: List[str] = Field(default_factory=list)
    city: str = "Baku"
    address: Optional[str] = None
    phone: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    areas: List[Area] = Field(default_factory=list)

# --- Reservations ---
class ReservationCreate(BaseModel):
    restaurant_id: str
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: Optional[str] = None
    table_id: Optional[str] = None

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
    guest_phone: Optional[str] = None
    table_id: Optional[str] = None
    status: Literal["booked", "cancelled"] = "booked"
