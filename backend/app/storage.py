from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import HTTPException
from .models import Reservation, ReservationCreate

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RES_PATH = DATA_DIR / "reservations.json"

def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")

def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)

class Database:
    """
    Demo DB:
      - Restaurants seeded here with stable ids.
      - Reservations persist to app/data/reservations.json
    """
    def __init__(self) -> None:
        # --- restaurants ---
        seed_restaurants: List[Dict[str, Any]] = [
            {
                "id": "fc34a984-0b39-4f0a-afa2-5b677c61f044",
                "name": "SAHiL Bar & Restaurant",
                "cuisine": ["Azerbaijani", "Seafood"],
                "city": "Baku",
                "address": "Seaside Boulevard, Baku",
                "phone": "+994 12 000 00 00",
                "photos": [
                    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Waterfront seafood and grills with a sunset terrace on the Caspian Boulevard.",
                "neighborhood": "Seaside Boulevard",
                "price_level": "AZN 3/4",
                "tags": ["must_book", "waterfront", "seafood", "group_friendly"],
                "highlights": [
                    "Signature Caspian seafood platters and sturgeon pilaf",
                    "Live jazz duos on Friday and Saturday evenings",
                    "Golden hour terrace seating with Caspian sunset views",
                ],
                "deposit_policy": "Card capture of 50 AZN per guest for Friday/Saturday dinner — refundable up to 6 hours before arrival.",
                "map_images": ["https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "a-sahil-main",
                        "name": "Main Hall",
                        "tables": [
                            {
                                "id": "e5c360cf-31df-4276-841e-8cd720b5942c",
                                "name": "T1",
                                "capacity": 2,
                                "position": [18, 32],
                                "shape": "circle",
                            },
                            {
                                "id": "cc67ebfe-9fad-427f-87c1-d591304fcce5",
                                "name": "T2",
                                "capacity": 2,
                                "position": [38, 30],
                                "shape": "circle",
                            },
                            {
                                "id": "40ec9ced-a11f-4009-899c-7b2d4216dea3",
                                "name": "T3",
                                "capacity": 4,
                                "position": [58, 34],
                                "shape": "circle",
                            },
                            {
                                "id": "b79563ac-0f21-4b3a-9b50-c2b6ba2a3b18",
                                "name": "T4",
                                "capacity": 4,
                                "position": [36, 60],
                                "shape": "circle",
                            },
                            {
                                "id": "9e5f3998-67d7-4a81-a816-109aec7bdeec",
                                "name": "T5",
                                "capacity": 6,
                                "position": [60, 64],
                                "shape": "circle",
                            },
                        ],
                    },
                    {
                        "id": "a-sahil-terrace",
                        "name": "Caspian Terrace",
                        "tables": [
                            {
                                "id": "sahil-ter-1",
                                "name": "Terrace 1",
                                "capacity": 4,
                                "position": [22, 38],
                                "shape": "rect",
                            },
                            {
                                "id": "sahil-ter-2",
                                "name": "Terrace 2",
                                "capacity": 6,
                                "position": [52, 42],
                                "shape": "rect",
                            },
                        ],
                    },
                ],
            },
            {
                "id": "e43356ca-448a-4257-a76c-716b9f13937b",
                "name": "Günaydın Steakhouse (Bulvar)",
                "cuisine": ["Steakhouse", "Turkish"],
                "city": "Baku",
                "address": "Bulvar Mall, 20 Niyazi Street, Baku",
                "phone": "+994 12 111 11 11",
                "photos": [
                    "https://images.unsplash.com/photo-1555992336-cbf3fa9adb63?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1543353071-10c8ba85a904?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Dry-aged steaks carved tableside with skyline views over the Bulvar.",
                "neighborhood": "White City",
                "price_level": "AZN 3/4",
                "tags": ["must_book", "steakhouse", "panoramic_view"],
                "highlights": [
                    "Signature 28-day dry-aged ribeye carving",
                    "Open grill theatre kitchen and chef presentations",
                    "Private wine cellar for 10–12 guests",
                ],
                "deposit_policy": "Requires a 75 AZN per person card hold for groups of 5+ on weekends.",
                "map_images": ["https://images.unsplash.com/photo-1490723088640-17f0664e4a88?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "a-gunaydin-main",
                        "name": "Main Dining",
                        "tables": [
                            {
                                "id": "f1e1b8e1-aaaa-4b11-9aaa-111111111111",
                                "name": "Chef's Counter",
                                "capacity": 2,
                                "position": [18, 30],
                                "shape": "rect",
                            },
                            {
                                "id": "f1e1b8e1-bbbb-4b22-9bbb-222222222222",
                                "name": "Center Booth",
                                "capacity": 4,
                                "position": [42, 40],
                                "shape": "rect",
                            },
                            {
                                "id": "f1e1b8e1-cccc-4b33-9ccc-333333333333",
                                "name": "Panorama Table",
                                "capacity": 6,
                                "position": [68, 28],
                                "shape": "circle",
                            },
                        ],
                    },
                    {
                        "id": "a-gunaydin-terrace",
                        "name": "Winter Terrace",
                        "tables": [
                            {
                                "id": "gun-ter-1",
                                "name": "Terrace Booth",
                                "capacity": 4,
                                "position": [30, 60],
                                "shape": "rect",
                            },
                            {
                                "id": "gun-ter-2",
                                "name": "Corner Lounge",
                                "capacity": 6,
                                "position": [60, 62],
                                "shape": "rect",
                            },
                        ],
                    },
                ],
            },
            {
                "id": "7cb45fee-78d6-46cf-a9fd-a8299e47e4fa",
                "name": "Mari Vanna",
                "cuisine": ["Eastern European", "Russian"],
                "city": "Baku",
                "address": "23 Kichik Gala, Old City, Baku",
                "phone": "+994 12 222 22 22",
                "photos": [
                    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Kazakh-Russian dacha comfort food with vintage interiors in the Old City.",
                "neighborhood": "Icherisheher",
                "price_level": "AZN 2/4",
                "tags": ["must_book", "old_city", "home_style"],
                "highlights": [
                    "Signature herring under fur coat and pelmeni",
                    "Gramophone nights with vinyl playlist curation",
                    "Private library room for 12 guests",
                ],
                "deposit_policy": "Preauthorises 30 AZN per guest for peak evenings (Fri/Sat 18:00–22:00).",
                "map_images": ["https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "a-marivanna-main",
                        "name": "Grand Salon",
                        "tables": [
                            {"id": "mvt-1", "name": "Samovar Table", "capacity": 2, "position": [30, 32], "shape": "circle"},
                            {"id": "mvt-2", "name": "Story Corner", "capacity": 4, "position": [52, 36], "shape": "rect"},
                            {"id": "mvt-3", "name": "Family Table", "capacity": 6, "position": [40, 58], "shape": "circle"},
                        ],
                    },
                    {
                        "id": "a-marivanna-balcony",
                        "name": "Balcony",
                        "tables": [
                            {"id": "mvt-4", "name": "Balcony 1", "capacity": 2, "position": [28, 40], "shape": "circle"},
                            {"id": "mvt-5", "name": "Balcony 2", "capacity": 4, "position": [58, 44], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "a60afa9f-6c7f-4c81-9317-e18a52bde3e2",
                "name": "Zafferano – Four Seasons Baku",
                "cuisine": ["Italian", "Fine Dining"],
                "city": "Baku",
                "address": "Four Seasons Hotel, 1 Neftchilar Ave, Baku",
                "phone": "+994 12 404 24 24",
                "photos": [
                    "https://images.unsplash.com/photo-1516684732162-4c3032a2bb22?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Four Seasons' rooftop Italian dining room overlooking the Caspian skyline.",
                "neighborhood": "Neftchilar Avenue",
                "price_level": "AZN 4/4",
                "tags": ["must_book", "hotel_partner", "fine_dining"],
                "highlights": [
                    "Handmade pastas by Chef Luigi Ferraro",
                    "Panoramic Caspian views from the winter garden",
                    "Wine library curated with Italian DOCG selections",
                ],
                "deposit_policy": "Prepaid tasting menus for chef's counter seats; 100 AZN card hold for à la carte.",
                "map_images": ["https://images.unsplash.com/photo-1481931098730-318b6f776db0?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "zafferano-dining",
                        "name": "Winter Garden",
                        "tables": [
                            {"id": "zaf-1", "name": "Garden Table 1", "capacity": 2, "position": [24, 26], "shape": "circle"},
                            {"id": "zaf-2", "name": "Garden Table 2", "capacity": 2, "position": [48, 30], "shape": "circle"},
                            {"id": "zaf-3", "name": "Garden Table 3", "capacity": 4, "position": [70, 36], "shape": "circle"},
                            {"id": "zaf-4", "name": "Chef's Counter", "capacity": 6, "position": [44, 62], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "zafferano-terrace",
                        "name": "Sky Terrace",
                        "tables": [
                            {"id": "zaf-5", "name": "Terrace East", "capacity": 4, "position": [34, 40], "shape": "rect"},
                            {"id": "zaf-6", "name": "Terrace West", "capacity": 6, "position": [64, 48], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "9a5928e1-4d1e-4aa1-90a8-5b0d96d2bd24",
                "name": "Sky Grill – Hilton Baku",
                "cuisine": ["Grill", "Mediterranean"],
                "city": "Baku",
                "address": "Hilton Baku, 14th Floor, 1B Azadlig Ave, Baku",
                "phone": "+994 12 599 00 00",
                "photos": [
                    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Hilton's rooftop grill with retractable roof and dramatic fire pits.",
                "neighborhood": "City Center",
                "price_level": "AZN 3/4",
                "tags": ["rooftop", "skyline", "must_book", "hotel_partner"],
                "highlights": [
                    "Open fire Josper grill with Caspian seafood specials",
                    "Sunset DJ sessions Thursday–Sunday",
                    "Private cabanas for 6–8 with skyline views",
                ],
                "deposit_policy": "Holds 60 AZN per guest for cabanas and lounge pods.",
                "map_images": ["https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "skygrill-main",
                        "name": "Sky Deck",
                        "tables": [
                            {"id": "sky-1", "name": "Deck 1", "capacity": 2, "position": [20, 24], "shape": "circle"},
                            {"id": "sky-2", "name": "Deck 2", "capacity": 2, "position": [44, 28], "shape": "circle"},
                            {"id": "sky-3", "name": "Deck 3", "capacity": 4, "position": [66, 32], "shape": "rect"},
                            {"id": "sky-4", "name": "Fire Pit Lounge", "capacity": 6, "position": [48, 60], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "skygrill-cabanas",
                        "name": "Cabanas",
                        "tables": [
                            {"id": "sky-cab-1", "name": "Cabana 1", "capacity": 6, "position": [30, 40], "shape": "rect"},
                            {"id": "sky-cab-2", "name": "Cabana 2", "capacity": 6, "position": [60, 46], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "5b3a5661-501a-4b4a-9137-5ded41d278f0",
                "name": "360 Bar – Hilton Baku",
                "cuisine": ["Cocktail Bar", "Small Plates"],
                "city": "Baku",
                "address": "24th Floor, Hilton Baku, 1B Azadlig Ave, Baku",
                "phone": "+994 12 599 00 00",
                "photos": [
                    "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1432139175191-58524dae6a55?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Hilton's revolving cocktail bar with 360° views over the Flame Towers.",
                "neighborhood": "City Center",
                "price_level": "AZN 3/4",
                "tags": ["skyline", "late_night", "cocktail_lab", "must_book"],
                "highlights": [
                    "Rotating platform completing a full revolution every hour",
                    "Signature Flame Towers Negroni with smoked citrus",
                    "DJ sets and live saxophone on weekends",
                ],
                "deposit_policy": "Requires prepaid packages for window pods on weekends (150 AZN minimum spend).",
                "map_images": ["https://images.unsplash.com/photo-1527960471264-93200052b879?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "360-ring",
                        "name": "Revolving Ring",
                        "tables": [
                            {"id": "360-1", "name": "Pod 1", "capacity": 2, "position": [18, 30], "shape": "circle"},
                            {"id": "360-2", "name": "Pod 2", "capacity": 2, "position": [36, 20], "shape": "circle"},
                            {"id": "360-3", "name": "Pod 3", "capacity": 4, "position": [58, 24], "shape": "rect"},
                            {"id": "360-4", "name": "Pod 4", "capacity": 4, "position": [76, 34], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "360-lounge",
                        "name": "Inner Lounge",
                        "tables": [
                            {"id": "360-5", "name": "Mixology Lab", "capacity": 6, "position": [32, 60], "shape": "rect"},
                            {"id": "360-6", "name": "DJ Booth Lounge", "capacity": 6, "position": [64, 62], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "1b33d916-3f7b-4f87-a86e-1a2cd6d03f6b",
                "name": "Fireworks Urban Kitchen – JW Marriott Absheron",
                "cuisine": ["Steakhouse", "International"],
                "city": "Baku",
                "address": "JW Marriott Absheron, 674 Azadliq Square, Baku",
                "phone": "+994 12 499 88 88",
                "photos": [
                    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1544748609-81517f04ca22?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=1200&q=80",
                "short_description": "JW Marriott's high-energy grill and smokehouse with rooftop lounge.",
                "neighborhood": "Azadliq Square",
                "price_level": "AZN 3/4",
                "tags": ["hotel_partner", "steakhouse", "must_book", "open_kitchen"],
                "highlights": [
                    "Signature tomahawk served with flame show",
                    "Interactive dessert station with liquid nitrogen",
                    "Rooftop cocktail hour with Caspian sunset views",
                ],
                "deposit_policy": "Card preauthorisation for parties above 6 after 19:00 (60 AZN per guest).",
                "map_images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "fireworks-main",
                        "name": "Chef's Theatre",
                        "tables": [
                            {"id": "fw-1", "name": "Show Kitchen 1", "capacity": 2, "position": [22, 30], "shape": "circle"},
                            {"id": "fw-2", "name": "Show Kitchen 2", "capacity": 4, "position": [44, 32], "shape": "rect"},
                            {"id": "fw-3", "name": "Show Kitchen 3", "capacity": 6, "position": [66, 38], "shape": "rect"},
                            {"id": "fw-4", "name": "Chef's Table", "capacity": 8, "position": [50, 60], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "fireworks-lounge",
                        "name": "Sky Lounge",
                        "tables": [
                            {"id": "fw-5", "name": "Lounge 1", "capacity": 4, "position": [34, 40], "shape": "rect"},
                            {"id": "fw-6", "name": "Lounge 2", "capacity": 6, "position": [62, 46], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "d1e19bf7-4480-4f62-9af3-67aa0733bc34",
                "name": "Pasifico Lounge & Dining",
                "cuisine": ["Nikkei", "Latin American"],
                "city": "Baku",
                "address": "3 Neftchilar Ave, Deniz Mall, Baku",
                "phone": "+994 51 555 66 77",
                "photos": [
                    "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1525286116112-b59af11adad1?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Nikkei plates, cocktail theatre, and DJ-led evenings at Deniz Mall.",
                "neighborhood": "Deniz Mall",
                "price_level": "AZN 3/4",
                "tags": ["late_night", "dj_nights", "must_book"],
                "highlights": [
                    "Sushi and ceviche bar with omakase counter",
                    "Signature Pisco sour menu and fire show desserts",
                    "Resident DJs and percussion sets Thursday–Sunday",
                ],
                "deposit_policy": "Prepaid experience menus for lounge couches; 40 AZN hold for dining room.",
                "map_images": ["https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "pasifico-dining",
                        "name": "Dining Room",
                        "tables": [
                            {"id": "pas-1", "name": "Dining 1", "capacity": 2, "position": [24, 30], "shape": "circle"},
                            {"id": "pas-2", "name": "Dining 2", "capacity": 4, "position": [48, 34], "shape": "rect"},
                            {"id": "pas-3", "name": "Dining 3", "capacity": 6, "position": [70, 38], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "pasifico-lounge",
                        "name": "Lounge Pods",
                        "tables": [
                            {"id": "pas-4", "name": "Pod 1", "capacity": 6, "position": [32, 58], "shape": "rect"},
                            {"id": "pas-5", "name": "Pod 2", "capacity": 8, "position": [62, 60], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "0d5b1081-2447-4e66-9df2-a508a40dc9c4",
                "name": "Chinar",
                "cuisine": ["Pan-Asian", "Lounge"],
                "city": "Baku",
                "address": "Shovkat Alakbarova, Flame Towers District, Baku",
                "phone": "+994 12 404 82 82",
                "photos": [
                    "https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Pan-Asian garden with legendary terrace lounges under ancient plane trees.",
                "neighborhood": "Flame Towers Foothill",
                "price_level": "AZN 3/4",
                "tags": ["garden", "late_night", "must_book", "pan_asian"],
                "highlights": [
                    "Signature Peking duck carved tableside",
                    "Garden terrace with ancient plane trees and shisha lounge",
                    "Weekend 'Chinar Nights' with live percussion and DJs",
                ],
                "deposit_policy": "100 AZN deposit for terrace lounges after 20:00 on weekends.",
                "map_images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "chinar-dining",
                        "name": "Garden Dining",
                        "tables": [
                            {"id": "chi-1", "name": "Lotus Table", "capacity": 2, "position": [24, 28], "shape": "circle"},
                            {"id": "chi-2", "name": "Peony Table", "capacity": 4, "position": [46, 36], "shape": "circle"},
                            {"id": "chi-3", "name": "Bamboo Table", "capacity": 6, "position": [68, 32], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "chinar-terrace",
                        "name": "Terrace Lounges",
                        "tables": [
                            {"id": "chi-4", "name": "Lounge North", "capacity": 6, "position": [30, 58], "shape": "rect"},
                            {"id": "chi-5", "name": "Lounge South", "capacity": 8, "position": [64, 60], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "6b9d8ea4-f350-40f9-9a44-b889213ee1da",
                "name": "Buddha-Bar Baku",
                "cuisine": ["Pan-Asian", "Sushi", "Cocktails"],
                "city": "Baku",
                "address": "Baku Entertainment Center, 340 Neftchilar Ave, Baku",
                "phone": "+994 12 404 82 82",
                "photos": [
                    "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Iconic Buddha-Bar beats with Pan-Asian sharing plates and dramatic interiors.",
                "neighborhood": "Fountain Square",
                "price_level": "AZN 3/4",
                "tags": ["dj_nights", "signature_cocktails", "must_book"],
                "highlights": [
                    "Resident Buddha-Bar global DJ rotation",
                    "Sushi omakase bar and robata grill",
                    "Immersive lighting programmes with projection mapping",
                ],
                "deposit_policy": "Minimum spend contracts for mezzanine lounges (150 AZN per guest).",
                "map_images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "buddha-main",
                        "name": "Main Temple",
                        "tables": [
                            {"id": "bud-1", "name": "Temple Front", "capacity": 2, "position": [22, 28], "shape": "circle"},
                            {"id": "bud-2", "name": "Temple Center", "capacity": 4, "position": [48, 32], "shape": "rect"},
                            {"id": "bud-3", "name": "Temple Rear", "capacity": 6, "position": [72, 36], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "buddha-mezz",
                        "name": "Mezzanine Lounges",
                        "tables": [
                            {"id": "bud-4", "name": "Lounge Lotus", "capacity": 6, "position": [30, 58], "shape": "rect"},
                            {"id": "bud-5", "name": "Lounge Dragon", "capacity": 8, "position": [64, 60], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "4c6120b3-6786-4b0f-9bf6-8afdb9ce59ef",
                "name": "Nakhchivan Restaurant",
                "cuisine": ["Azerbaijani", "Regional"],
                "city": "Baku",
                "address": "33 Khagani Street, Baku",
                "phone": "+994 12 498 12 34",
                "photos": [
                    "https://images.unsplash.com/photo-1481931098730-318b6f776db0?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Regional Azerbaijani classics from Nakhchivan with tandir oven specials.",
                "neighborhood": "Nasimi District",
                "price_level": "AZN 2/4",
                "tags": ["regional cuisine", "family_style", "must_book"],
                "highlights": [
                    "Stone tandir oven for gutab and lamb dishes",
                    "Traditional ashig performances on weekends",
                    "Private karabakh room for larger gatherings",
                ],
                "deposit_policy": "20 AZN per guest deposit for groups 8+ on weekends.",
                "map_images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "nakh-main",
                        "name": "Karabakh Hall",
                        "tables": [
                            {"id": "nak-1", "name": "Karabakh 1", "capacity": 4, "position": [28, 32], "shape": "circle"},
                            {"id": "nak-2", "name": "Karabakh 2", "capacity": 4, "position": [52, 34], "shape": "circle"},
                            {"id": "nak-3", "name": "Karabakh 3", "capacity": 6, "position": [38, 58], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "nakh-private",
                        "name": "Private Room",
                        "tables": [
                            {"id": "nak-4", "name": "Private Table", "capacity": 10, "position": [50, 40], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "f8cb13da-d3a6-4cf6-8fac-d9f4e26882c5",
                "name": "Zakura Bar & Dining",
                "cuisine": ["Japanese", "Izakaya"],
                "city": "Baku",
                "address": "25 Samed Vurgun, Baku",
                "phone": "+994 12 599 79 79",
                "photos": [
                    "https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
                "short_description": "Tokyo-style izakaya with robata grill and weekend DJ sets.",
                "neighborhood": "Nasimi District",
                "price_level": "AZN 2/4",
                "tags": ["sushi", "late_night", "date_spot"],
                "highlights": [
                    "Robata grill with yakitori and wagyu skewers",
                    "Hidden Omakase counter for six guests",
                    "Vinyl-only DJ nights on Saturdays",
                ],
                "deposit_policy": "Card capture (30 AZN per guest) for omakase counter bookings.",
                "map_images": ["https://images.unsplash.com/photo-1516684732162-4c3032a2bb22?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "zakura-main",
                        "name": "Izakaya Floor",
                        "tables": [
                            {"id": "zak-1", "name": "Izakaya 1", "capacity": 2, "position": [24, 32], "shape": "circle"},
                            {"id": "zak-2", "name": "Izakaya 2", "capacity": 4, "position": [48, 36], "shape": "rect"},
                            {"id": "zak-3", "name": "Izakaya 3", "capacity": 4, "position": [68, 32], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "zakura-omakase",
                        "name": "Omakase Counter",
                        "tables": [
                            {"id": "zak-4", "name": "Counter", "capacity": 6, "position": [46, 60], "shape": "rect"},
                        ],
                    },
                ],
            },
            {
                "id": "c5f0d6d3-1bb8-4f63-85ae-5d7403817f34",
                "name": "Kun Aydın Breakfast Club",
                "cuisine": ["Azerbaijani", "Breakfast"],
                "city": "Baku",
                "address": "9 Babek Ave, Baku",
                "phone": "+994 12 555 77 88",
                "photos": [
                    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
                    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
                ],
                "cover_photo": "https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=1200&q=80",
                "short_description": "High-energy weekend breakfast club with lavish brunch boards and live baklava show.",
                "neighborhood": "Babek Avenue",
                "price_level": "AZN 2/4",
                "tags": ["breakfast", "family_style", "must_book"],
                "highlights": [
                    "Endless brunch boards with 40+ farmhouse toppings",
                    "Live baklava and qutab station every weekend",
                    "Kids playroom with supervision during peak brunch hours",
                ],
                "deposit_policy": "25 AZN per adult deposit for Saturday/Sunday brunch seatings.",
                "map_images": ["https://images.unsplash.com/photo-1481931098730-318b6f776db0?auto=format&fit=crop&w=1200&q=80"],
                "areas": [
                    {
                        "id": "kun-main",
                        "name": "Brunch Hall",
                        "tables": [
                            {"id": "kun-1", "name": "Hall 1", "capacity": 4, "position": [22, 30], "shape": "rect"},
                            {"id": "kun-2", "name": "Hall 2", "capacity": 4, "position": [46, 34], "shape": "rect"},
                            {"id": "kun-3", "name": "Hall 3", "capacity": 6, "position": [68, 32], "shape": "rect"},
                        ],
                    },
                    {
                        "id": "kun-family",
                        "name": "Family Corner",
                        "tables": [
                            {"id": "kun-4", "name": "Playroom Table", "capacity": 6, "position": [36, 60], "shape": "rect"},
                            {"id": "kun-5", "name": "Family Booth", "capacity": 8, "position": [64, 58], "shape": "rect"},
                        ],
                    },
                ],
            },
        ]

        self.restaurants: Dict[str, Dict[str, Any]] = {r["id"]: r for r in seed_restaurants}

        self.reservations: Dict[str, Dict[str, Any]] = {}
        self._load()

    # -------- helpers --------
    def _tables_for_restaurant(self, rid: str) -> List[Dict[str, Any]]:
        r = self.restaurants.get(rid)
        tables: List[Dict[str, Any]] = []
        if not r:
            return tables
        for area in (r.get("areas") or []):
            for t in (area.get("tables") or []):
                tables.append(t)
        return tables

    def _table_lookup(self, rid: str) -> Dict[str, Dict[str, Any]]:
        return {str(t["id"]): t for t in self._tables_for_restaurant(rid)}

    @staticmethod
    def _overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
        return not (a_end <= b_start or b_end <= a_start)

    # -------- restaurants --------
    def list_restaurants(self, q: Optional[str] = None) -> List[Dict[str, Any]]:
        items = list(self.restaurants.values())
        if q:
            qlow = q.lower()
            items = [
                r for r in items
                if qlow in r["name"].lower()
                or any(qlow in c.lower() for c in r.get("cuisine", []))
                or qlow in r.get("city", "").lower()
            ]
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "cuisine": r["cuisine"],
                "city": r["city"],
                "cover_photo": r.get("cover_photo") or (r["photos"][0] if r.get("photos") else ""),
            }
            for r in items
        ]

    def get_restaurant(self, rid: str) -> Optional[Dict[str, Any]]:
        return self.restaurants.get(str(rid))

    # -------- reservations --------
    def list_reservations(self) -> List[Dict[str, Any]]:
        return list(self.reservations.values())

    def create_reservation(self, payload: ReservationCreate) -> Reservation:
        rid = str(payload.restaurant_id)

        if payload.party_size < 1:
            raise HTTPException(status_code=422, detail="party_size must be >= 1")
        start = payload.start if isinstance(payload.start, datetime) else _parse_iso(str(payload.start))
        end = payload.end if isinstance(payload.end, datetime) else _parse_iso(str(payload.end))
        if end <= start:
            raise HTTPException(status_code=422, detail="end must be after start")

        if rid not in self.restaurants:
            raise HTTPException(status_code=404, detail="Restaurant not found")

        tables_by_id = self._table_lookup(rid)
        # resolve table
        if payload.table_id:
            tid = str(payload.table_id)
            if tid not in tables_by_id:
                raise HTTPException(status_code=422, detail="table_id does not belong to restaurant")
            if tables_by_id[tid].get("capacity", 1) < payload.party_size:
                raise HTTPException(status_code=422, detail="party_size exceeds table capacity")
            table_id = tid
        else:
            table_id = None
            candidates = sorted(tables_by_id.values(), key=lambda t: t.get("capacity", 2))
            for t in candidates:
                if t.get("capacity", 2) >= payload.party_size:
                    table_id = str(t["id"])
                    break
            if not table_id and candidates:
                table_id = str(candidates[-1]["id"])

        # conflict check (booked only)
        for r in self.reservations.values():
            if str(r["restaurant_id"]) != rid:
                continue
            if r.get("status", "booked") != "booked":
                continue
            if table_id and r.get("table_id") and str(r["table_id"]) != table_id:
                continue
            rs = _parse_iso(r["start"]) if isinstance(r["start"], str) else r["start"]
            re = _parse_iso(r["end"]) if isinstance(r["end"], str) else r["end"]
            if self._overlap(start, end, rs, re):
                raise HTTPException(status_code=409, detail="Selected table/time is already booked")

        new_id = str(uuid4())
        rec = {
            "id": new_id,
            "restaurant_id": rid,
            "table_id": table_id,
            "party_size": payload.party_size,
            "start": _iso(start),
            "end": _iso(end),
            "guest_name": payload.guest_name,
            "guest_phone": payload.guest_phone or "",
            "status": "booked",
        }
        self.reservations[new_id] = rec
        self._save()

        return Reservation(**{**rec, "start": start, "end": end})

    def set_status(self, resid: str, status: str) -> Optional[Dict[str, Any]]:
        if resid not in self.reservations:
            return None
        if status not in ("booked", "cancelled"):
            raise HTTPException(status_code=422, detail="invalid status")
        self.reservations[resid]["status"] = status
        self._save()
        return self.reservations[resid]

    def cancel_reservation(self, resid: str) -> Optional[Dict[str, Any]]:
        # Hard delete (used by existing DELETE route)
        out = self.reservations.pop(str(resid), None)
        if out is not None:
            self._save()
        return out

    # -------- persistence --------
    def _save(self) -> None:
        data = {
            "reservations": [
                {
                    **{k: v for k, v in r.items() if k not in ("start", "end")},
                    "start": r["start"] if isinstance(r["start"], str) else _iso(r["start"]),
                    "end": r["end"] if isinstance(r["end"], str) else _iso(r["end"]),
                }
                for r in self.reservations.values()
            ]
        }
        RES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def _load(self) -> None:
        if not RES_PATH.exists():
            return
        try:
            raw = json.loads(RES_PATH.read_text() or "{}")
        except Exception:
            self.reservations = {}
            return

        cleaned: Dict[str, Dict[str, Any]] = {}
        for r in raw.get("reservations", []):
            try:
                rid = str(r.get("id") or uuid4())
                rest_id = str(r["restaurant_id"])
                start = _parse_iso(str(r["start"]))
                end = _parse_iso(str(r["end"]))
                if end <= start:
                    continue
                party = int(r["party_size"])
                if party < 1:
                    continue
                status = r.get("status", "booked")
                if status not in ("booked", "cancelled"):
                    status = "booked"
                cleaned[rid] = {
                    "id": rid,
                    "restaurant_id": rest_id,
                    "table_id": r.get("table_id"),
                    "party_size": party,
                    "start": _iso(start),
                    "end": _iso(end),
                    "guest_name": str(r.get("guest_name", "")),
                    "guest_phone": str(r.get("guest_phone", "")),
                    "status": status,
                }
            except Exception:
                continue
        self.reservations = cleaned

# Single instance
DB = Database()
