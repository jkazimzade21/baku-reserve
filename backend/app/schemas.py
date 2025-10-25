from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal, Tuple
from datetime import datetime
from uuid import UUID, uuid4

class Table(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    capacity: int
    position: Tuple[int, int] | None = None
    shape: Literal["circle", "rect"] = "circle"

class Area(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    tables: List[Table] = Field(default_factory=list)

class Restaurant(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    cuisine: List[str] = Field(default_factory=list)
    city: str = "Baku"
    address: Optional[str] = None
    phone: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    cover_photo: Optional[str] = None
    short_description: Optional[str] = None
    neighborhood: Optional[str] = None
    price_level: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    highlights: List[str] = Field(default_factory=list)
    deposit_policy: Optional[str] = None
    map_images: List[str] = Field(default_factory=list)
    areas: List[Area] = Field(default_factory=list)

class RestaurantListItem(BaseModel):
    id: UUID
    name: str
    cuisine: List[str]
    city: str
    cover_photo: Optional[str] = None
    short_description: Optional[str] = None
    price_level: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

class ReservationCreate(BaseModel):
    restaurant_id: UUID
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: Optional[str] = None
    table_id: Optional[UUID] = None

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
    guest_phone: Optional[str] = None
    table_id: Optional[UUID] = None
    status: Literal["booked", "cancelled"] = "booked"
