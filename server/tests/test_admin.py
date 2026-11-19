from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from homeinventory import admin
from homeinventory.config import Settings
from homeinventory.identity import LOG_IN
from homeinventory.models import AdminSession, utcnow

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}
ADMIN_PORT = 8200
PASSWORD = "correct horse battery"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None, data_dir=tmp_path, database_path=None, dev_user=None, admin_port=ADMIN_PORT
    )


@pytest.fixture
def lan(app: FastAPI, client: TestClient) -> TestClient:
    """A browser on the LAN, on the admin port. (`client` runs the app's lifespan.)"""
    return TestClient(app, base_url=f"http://192.168.1.100:{ADMIN_PORT}")


@pytest.fixture
def password(app: FastAPI) -> str:
    with Session(app.state.engine) as session:
        admin.set_password(session, PASSWORD)
    return PASSWORD


@pytest.fixture
def logged_in(lan: TestClient, password: str) -> TestClient:
    assert lan.post("/api/v1/admin/login", json={"password": password}).status_code == 200
    return lan


@pytest.fixture(autouse=True)
def no_delay(monkeypatch) -> None:
    monkeypatch.setattr(admin, "FAILURE_DELAY", 0)


def test_the_admin_port_ignores_tailscale_headers(lan) -> None:
    # Any device on the LAN could send them.
    response = lan.get("/api/v1/users/me", headers=ANNA)
    assert response.status_code == 401
    assert response.json()["detail"] == LOG_IN


def test_log_in_as_admin(lan, password) -> None:
    assert lan.post("/api/v1/admin/login", json={"password": "wrong one"}).status_code == 401
    response = lan.post("/api/v1/admin/login", json={"password": password})
    assert response.status_code == 200
    assert response.json()["admin"] is True
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    me = lan.get("/api/v1/users/me").json()
    assert me["display_name"] == "Admin"
    assert me["admin"] is True


def test_people_are_not_admin(api) -> None:
    assert api("GET", "/users/me").json()["admin"] is False


def test_no_log_in_on_the_tailnet_port(api, password) -> None:
    assert api("POST", "/admin/login", {"password": password}).status_code == 404


def test_the_tailnet_port_ignores_the_admin_cookie(client, logged_in) -> None:
    client.cookies = logged_in.cookies
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "No Tailscale identity"


def test_no_password_set_no_log_in(lan) -> None:
    assert lan.post("/api/v1/admin/login", json={"password": PASSWORD}).status_code == 401


def test_log_out(logged_in) -> None:
    assert logged_in.post("/api/v1/admin/logout").status_code == 204
    assert logged_in.get("/api/v1/users/me").status_code == 401


def test_a_new_password_logs_everyone_out(app, logged_in) -> None:
    with Session(app.state.engine) as session:
        admin.set_password(session, "another long one")
    assert logged_in.get("/api/v1/users/me").status_code == 401


def test_a_session_long_unused_expires(app, logged_in) -> None:
    with Session(app.state.engine) as session:
        old = utcnow() - timedelta(days=admin.SESSION_DAYS + 1)
        session.execute(update(AdminSession).values(used_at=old))
        session.commit()
    assert logged_in.get("/api/v1/users/me").status_code == 401


def test_too_many_wrong_passwords(lan, password) -> None:
    for _ in range(admin.FAILURES_MAX):
        assert lan.post("/api/v1/admin/login", json={"password": "guess"}).status_code == 401
    # Even the right one waits now.
    response = lan.post("/api/v1/admin/login", json={"password": password})
    assert response.status_code == 429


def test_admin_acts_as_admin_and_both_hear(api, house, logged_in, pushes) -> None:
    for headers, phone in ((ANNA, "anna"), (BELA, "bela")):
        endpoint = f"https://push.example.com/{phone}"
        body = {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}
        assert api("PUT", "/push/subscriptions", body, headers).status_code == 204
    path = f"/api/v1/locations/{house['pantry']}/stock/{house['sugar']}"
    assert logged_in.put(path, json={"level": "out"}).status_code == 200
    assert {endpoint for endpoint, _ in pushes} == {
        "https://push.example.com/anna",
        "https://push.example.com/bela",
    }
    assert {message["actor"] for _, message in pushes} == {"Admin"}
    [entry, *_] = api("GET", "/activity").json()
    assert entry["user_name"] == "Admin"


def test_admin_gets_no_notifications(logged_in) -> None:
    body = {"endpoint": "https://push.example.com/lan", "keys": {"p256dh": "k", "auth": "a"}}
    assert logged_in.put("/api/v1/push/subscriptions", json=body).status_code == 403


def test_set_password_from_the_command_line(app, monkeypatch, lan) -> None:
    typed = iter([PASSWORD, PASSWORD])
    monkeypatch.setattr(admin.getpass, "getpass", lambda _prompt: next(typed))
    monkeypatch.setattr(admin, "Settings", lambda: app.state.settings)
    admin.main()
    assert lan.post("/api/v1/admin/login", json={"password": PASSWORD}).status_code == 200


def test_too_short_a_password(monkeypatch) -> None:
    monkeypatch.setattr(admin.getpass, "getpass", lambda _prompt: "short")
    with pytest.raises(SystemExit):
        admin.main()
