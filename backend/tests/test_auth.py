from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.accounts import ACCOUNTS

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_accounts():
    ACCOUNTS.reset()
    yield
    ACCOUNTS.reset()


def test_signup_request_and_login_flow():
    signup_payload = {
        "name": "Test Guest",
        "email": "guest@example.com",
        "phone": "+994501112233",
    }
    signup = client.post("/auth/signup", json=signup_payload)
    assert signup.status_code == 200
    body = signup.json()
    assert body["user"]["email"] == signup_payload["email"].lower()
    otp = body["otp"]
    assert len(otp) == 6

    login = client.post("/auth/login", json={"email": signup_payload["email"], "otp": otp})
    assert login.status_code == 200
    login_body = login.json()
    assert "token" in login_body
    assert login_body["user"]["verified_email"] is True

    reissue = client.post("/auth/request_otp", json={"email": signup_payload["email"]})
    assert reissue.status_code == 200
    new_otp = reissue.json()["otp"]
    assert new_otp != otp
