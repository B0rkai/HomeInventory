import pytest
from fastapi.testclient import TestClient

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}


def set_nickname(client: TestClient, nickname: str | None):
    return client.patch("/api/v1/users/me", headers=ANNA, json={"nickname": nickname})


def test_set_nickname(client: TestClient) -> None:
    response = set_nickname(client, "Anni")
    assert response.status_code == 200
    assert response.json()["nickname"] == "Anni"
    assert response.json()["display_name"] == "Anni"
    me = client.get("/api/v1/users/me", headers=ANNA).json()
    assert (me["nickname"], me["display_name"]) == ("Anni", "Anni")


def test_display_name_falls_back_to_full_name(client: TestClient) -> None:
    me = client.get("/api/v1/users/me", headers=ANNA).json()
    assert (me["nickname"], me["display_name"]) == (None, "Anna Kovacs")


def test_nickname_is_trimmed(client: TestClient) -> None:
    assert set_nickname(client, "  Anni  ").json()["nickname"] == "Anni"


def test_nickname_keeps_accents(client: TestClient) -> None:
    assert set_nickname(client, "Ákoska").json()["nickname"] == "Ákoska"


@pytest.mark.parametrize("cleared", [None, "", "   "])
def test_blank_nickname_clears_it(client: TestClient, cleared: str | None) -> None:
    set_nickname(client, "Anni")
    response = set_nickname(client, cleared)
    assert response.json()["nickname"] is None
    assert response.json()["display_name"] == "Anna Kovacs"


def test_nickname_too_long_is_422(client: TestClient) -> None:
    assert set_nickname(client, "x" * 41).status_code == 422
    assert set_nickname(client, "x" * 40).status_code == 200


def test_nickname_survives_name_change(client: TestClient) -> None:
    set_nickname(client, "Anni")
    renamed = {**ANNA, "Tailscale-User-Name": "Anna Szabo"}
    me = client.get("/api/v1/users/me", headers=renamed).json()
    assert (me["name"], me["display_name"]) == ("Anna Szabo", "Anni")


def test_set_nickname_needs_identity(client: TestClient) -> None:
    response = client.patch("/api/v1/users/me", json={"nickname": "Anni"})
    assert response.status_code == 401
