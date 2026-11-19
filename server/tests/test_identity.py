from fastapi.testclient import TestClient

from homeinventory.identity import decode_header_value


def tailscale(login: str, name: str) -> dict[str, str]:
    return {"Tailscale-User-Login": login, "Tailscale-User-Name": name}


def test_no_identity_is_401(client: TestClient) -> None:
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401


def test_first_request_creates_user(client: TestClient) -> None:
    response = client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna"))
    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "login": "anna@example.com",
        "name": "Anna",
        "nickname": None,
        "display_name": "Anna",
        "admin": False,
    }


def test_same_login_is_same_user(client: TestClient) -> None:
    first = client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna"))
    other = client.get("/api/v1/users/me", headers=tailscale("bela@example.com", "Bela"))
    again = client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna"))
    assert first.json()["id"] == again.json()["id"] != other.json()["id"]


def test_name_follows_tailscale(client: TestClient) -> None:
    client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna"))
    response = client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna K"))
    assert response.json()["name"] == "Anna K"


def test_mime_encoded_name_is_decoded(client: TestClient) -> None:
    response = client.get(
        "/api/v1/users/me", headers=tailscale("akos@example.com", "=?utf-8?q?=C3=81kos?=")
    )
    assert response.json()["name"] == "Ákos"


def test_missing_name_falls_back_to_login(client: TestClient) -> None:
    response = client.get("/api/v1/users/me", headers={"Tailscale-User-Login": "anna@example.com"})
    assert response.json()["name"] == "anna@example.com"


def test_dev_user_stands_in_for_headers(client: TestClient) -> None:
    client.app.state.settings.dev_user = "dev@example.com"
    response = client.get("/api/v1/users/me")
    assert response.json()["login"] == "dev@example.com"
    assert response.json()["name"] == "dev"


def test_headers_win_over_dev_user(client: TestClient) -> None:
    client.app.state.settings.dev_user = "dev@example.com"
    response = client.get("/api/v1/users/me", headers=tailscale("anna@example.com", "Anna"))
    assert response.json()["login"] == "anna@example.com"


def test_decode_header_value_leaves_plain_text() -> None:
    assert decode_header_value("Anna Kovács") == "Anna Kovács"
