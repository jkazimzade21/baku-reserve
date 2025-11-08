from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from .models import LoginRequest, OtpRequest, User, UserCreate

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_PATH = DATA_DIR / "users.json"


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class AccountStore:
    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self._load()

    # -------- internal helpers --------
    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    def _load(self) -> None:
        if not USERS_PATH.exists():
            self.users = {}
            return
        try:
            payload = json.loads(USERS_PATH.read_text() or "{}")
        except json.JSONDecodeError:
            self.users = {}
            return
        self.users = payload.get("users", {})

    def _save(self) -> None:
        USERS_PATH.write_text(json.dumps({"users": self.users}, ensure_ascii=False, indent=2))

    def _user_from_record(self, record: dict[str, Any]) -> User:
        data = {k: v for k, v in record.items() if k not in {"otp_code", "otp_expires_at"}}
        return User(**data)

    def _get_user_by_email(self, email: str) -> tuple[str, dict[str, Any]]:
        for uid, record in self.users.items():
            if record.get("email") == email:
                return uid, record
        raise HTTPException(404, "User not found")

    def _generate_otp(self) -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def reset(self) -> None:
        self.users = {}
        self.sessions = {}
        if USERS_PATH.exists():
            USERS_PATH.unlink()

    # -------- public API --------
    def create_user(self, payload: UserCreate) -> tuple[User, str]:
        email = self._normalize_email(payload.email)
        otp = self._generate_otp()
        now = datetime.utcnow()
        try:
            user_id, record = self._get_user_by_email(email)
            record.update(
                {
                    "name": payload.name,
                    "phone": payload.phone,
                    "otp_code": otp,
                    "otp_expires_at": _iso(now + timedelta(minutes=10)),
                    "updated_at": _iso(now),
                }
            )
        except HTTPException:
            user_id = str(uuid4())
            record = {
                "id": user_id,
                "name": payload.name,
                "email": email,
                "phone": payload.phone,
                "verified_email": False,
                "verified_phone": False,
                "created_at": _iso(now),
                "updated_at": _iso(now),
                "otp_code": otp,
                "otp_expires_at": _iso(now + timedelta(minutes=10)),
            }
            self.users[user_id] = record
        else:
            self.users[user_id] = record
        self._save()
        return self._user_from_record(record), otp

    def request_otp(self, payload: OtpRequest) -> str:
        email = self._normalize_email(payload.email)
        user_id, record = self._get_user_by_email(email)
        otp = self._generate_otp()
        record["otp_code"] = otp
        record["otp_expires_at"] = _iso(datetime.utcnow() + timedelta(minutes=10))
        record["updated_at"] = _iso(datetime.utcnow())
        self.users[user_id] = record
        self._save()
        return otp

    def verify_login(self, payload: LoginRequest) -> tuple[User, str]:
        email = self._normalize_email(payload.email)
        user_id, record = self._get_user_by_email(email)
        otp = record.get("otp_code")
        expires_at = _parse_iso(record.get("otp_expires_at"))
        if not otp or payload.otp != otp:
            raise HTTPException(401, "Invalid code")
        if expires_at and expires_at < datetime.utcnow():
            raise HTTPException(401, "Code expired")
        record["otp_code"] = None
        record["otp_expires_at"] = None
        record["verified_email"] = True
        record["updated_at"] = _iso(datetime.utcnow())
        self.users[user_id] = record
        self._save()
        token = secrets.token_hex(20)
        self.sessions[token] = {"user_id": user_id, "created_at": _iso(datetime.utcnow())}
        return self._user_from_record(record), token

    def update_user(self, user_id: str, *, name: str | None = None, phone: str | None = None) -> User:
        if user_id not in self.users:
            raise HTTPException(404, "User not found")
        if name:
            self.users[user_id]["name"] = name
        if phone:
            self.users[user_id]["phone"] = phone
        self.users[user_id]["updated_at"] = _iso(datetime.utcnow())
        self._save()
        return self._user_from_record(self.users[user_id])

    def get_user(self, token: str) -> User:
        session = self.sessions.get(token)
        if not session:
            raise HTTPException(401, "Invalid session")
        user_id = session["user_id"]
        record = self.users.get(user_id)
        if not record:
            raise HTTPException(404, "User not found")
        return self._user_from_record(record)

    def list_users(self) -> list[User]:
        return [self._user_from_record(record) for record in self.users.values()]


ACCOUNTS = AccountStore()
