"""What the admin pages need beyond the phone app: moving places, assigning, people and
devices, paging the log."""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from homeinventory import admin
from homeinventory.config import Settings

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}
ADMIN_PORT = 8200


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None, data_dir=tmp_path, database_path=None, dev_user=None, admin_port=ADMIN_PORT
    )


@pytest.fixture
def lan(app: FastAPI, client: TestClient) -> TestClient:
    """Logged in as Admin on the LAN port."""
    with Session(app.state.engine) as session:
        admin.set_password(session, "a long password")
    lan = TestClient(app, base_url=f"http://192.168.1.100:{ADMIN_PORT}")
    assert lan.post("/api/v1/admin/login", json={"password": "a long password"}).status_code == 200
    return lan


def ids_by_name(api) -> dict[str, dict]:
    return {location["name"]: location for location in api("GET", "/locations").json()}


# Moving a place under another


@pytest.fixture
def tree(api) -> dict[str, int]:
    def post(name: str, parent: int | None = None) -> int:
        return api("POST", "/locations", {"name": name, "parent_id": parent}).json()["id"]

    ground = post("Földszint")
    cellar = post("Pince")
    kitchen = post("Konyha", ground)
    return {
        "ground": ground,
        "cellar": cellar,
        "kitchen": kitchen,
        "pantry": post("Spájz", kitchen),
        "hall": post("Előszoba", ground),
        "storage": post("Kamra", cellar),
    }


def test_move_a_room_to_another_floor(api, tree) -> None:
    response = api("PATCH", f"/locations/{tree['kitchen']}", {"parent_id": tree["cellar"]})
    assert response.status_code == 200, response.text
    places = ids_by_name(api)
    assert places["Konyha"]["parent_id"] == tree["cellar"]
    # Last among its new siblings; what's inside it went along; the old ones close up.
    assert places["Konyha"]["position"] == 1
    assert places["Spájz"]["parent_id"] == tree["kitchen"]
    assert places["Előszoba"]["position"] == 0


def test_move_to_a_position_among_the_new_siblings(api, tree) -> None:
    body = {"parent_id": tree["cellar"], "position": 0}
    api("PATCH", f"/locations/{tree['hall']}", body)
    places = ids_by_name(api)
    assert (places["Előszoba"]["position"], places["Kamra"]["position"]) == (0, 1)


def test_a_room_can_become_a_floor(api, tree) -> None:
    api("PATCH", f"/locations/{tree['hall']}", {"parent_id": None})
    places = ids_by_name(api)
    assert places["Előszoba"]["parent_id"] is None
    assert places["Előszoba"]["position"] == 2


def test_not_inside_itself(api, tree) -> None:
    for into in ("kitchen", "pantry"):
        body = {"parent_id": tree[into]}
        assert api("PATCH", f"/locations/{tree['kitchen']}", body).status_code == 422


def test_not_too_deep(api, tree) -> None:
    # The kitchen holds the pantry: under the storage it would be four deep.
    body = {"parent_id": tree["storage"]}
    assert api("PATCH", f"/locations/{tree['kitchen']}", body).status_code == 422
    assert api("PATCH", f"/locations/{tree['hall']}", body).status_code == 200


def test_not_next_to_one_of_the_same_name(api, tree) -> None:
    api("POST", "/locations", {"name": "konyha", "parent_id": tree["cellar"]})
    body = {"parent_id": tree["cellar"]}
    assert api("PATCH", f"/locations/{tree['kitchen']}", body).status_code == 409
    # Renamed on the way, it fits.
    body["name"] = "Nyári konyha"
    assert api("PATCH", f"/locations/{tree['kitchen']}", body).status_code == 200


# Assigning


@pytest.fixture
def people(api) -> dict[str, int]:
    return {
        "anna": api("GET", "/users/me", headers=ANNA).json()["id"],
        "bela": api("GET", "/users/me", headers=BELA).json()["id"],
    }


@pytest.fixture
def sugar_out(api, house) -> int:
    api("PUT", f"/locations/{house['pantry']}/stock/{house['sugar']}", {"level": "out"})
    [request] = api("GET", "/requests").json()
    return request["id"]


def phones(api) -> None:
    for headers, phone in ((ANNA, "anna"), (BELA, "bela")):
        body = {
            "endpoint": f"https://push.example.com/{phone}",
            "keys": {"p256dh": "k", "auth": "a"},
        }
        assert api("PUT", "/push/subscriptions", body, headers).status_code == 204


def test_assign_a_request(api, lan, people, sugar_out, pushes) -> None:
    phones(api)
    pushes.clear()
    response = lan.post(f"/api/v1/requests/{sugar_out}/assign", json={"user_id": people["bela"]})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "claimed"
    assert response.json()["claimed_by_name"] == "Bela Kovacs"
    # Only the one it was given to hears.
    [(endpoint, message)] = pushes
    assert endpoint == "https://push.example.com/bela"
    assert (message["event"], message["actor"]) == ("assigned", "Admin")
    [entry, *_] = api("GET", "/activity").json()
    assert (entry["action"], entry["user_name"], entry["assignee_name"]) == (
        "assigned",
        "Admin",
        "Bela Kovacs",
    )


def test_assign_over_a_claim(api, people, sugar_out) -> None:
    api("POST", f"/requests/{sugar_out}/claim", headers=ANNA)
    api("POST", f"/requests/{sugar_out}/assign", {"user_id": people["bela"]})
    [request] = api("GET", "/requests").json()
    assert request["claimed_by_name"] == "Bela Kovacs"
    # Bela can hand it back like his own claim.
    assert api("POST", f"/requests/{sugar_out}/unclaim", headers=BELA).status_code == 200


def test_assigning_to_oneself_tells_nobody(api, people, sugar_out, pushes) -> None:
    phones(api)
    pushes.clear()
    api("POST", f"/requests/{sugar_out}/assign", {"user_id": people["anna"]})
    assert pushes == []


def test_assign_only_to_a_person(api, lan, people, sugar_out) -> None:
    admin_id = lan.get("/api/v1/users/me").json()["id"]
    for user_id in (admin_id, 999):
        body = {"user_id": user_id}
        assert api("POST", f"/requests/{sugar_out}/assign", body).status_code == 422


def test_assign_only_what_is_still_to_do(api, people, sugar_out) -> None:
    api("POST", f"/requests/{sugar_out}/done")
    body = {"user_id": people["bela"]}
    assert api("POST", f"/requests/{sugar_out}/assign", body).status_code == 409


# Done for someone: Admin hands work out, so what's done was done by a person


def test_mark_bought_for_someone(api, lan, people, house, sugar_out, pushes) -> None:
    phones(api)
    pushes.clear()
    body = {"by": people["bela"]}
    response = lan.post(f"/api/v1/requests/{sugar_out}/done", json=body)
    assert response.status_code == 200, response.text
    [stock] = api("GET", "/stock").json()
    assert (stock["level"], stock["updated_by_name"]) == ("plenty", "Bela Kovacs")
    [entry, *_] = api("GET", "/activity").json()
    assert (entry["action"], entry["user_name"]) == ("done", "Bela Kovacs")
    # Bela did it, so only Anna hears; Admin hears nothing anyway.
    assert [(endpoint, message["actor"]) for endpoint, message in pushes] == [
        ("https://push.example.com/anna", "Bela Kovacs")
    ]


def test_mark_a_chore_done_for_someone(api, lan, people, house) -> None:
    chore = api("POST", "/chores", {"location_id": house["wc"], "name": "Takarítás"}).json()
    response = lan.post(f"/api/v1/chores/{chore['id']}/done", json={"by": people["anna"]})
    assert response.status_code == 200, response.text
    assert response.json()["last_done_by_name"] == "Anna Kovacs"


def test_keep_a_line_bought_by_someone(api, lan, people, house) -> None:
    line = api("POST", "/requests", {"name": "Elem"}).json()
    body = {"location_id": house["pantry"], "name": "Elem", "by": people["bela"]}
    assert lan.post(f"/api/v1/requests/{line['id']}/keep", json=body).status_code == 200
    [entry, *_] = api("GET", "/activity").json()
    assert entry["user_name"] == "Bela Kovacs"


def test_marked_only_for_a_person(api, lan, house, sugar_out) -> None:
    admin_id = lan.get("/api/v1/users/me").json()["id"]
    chore = api("POST", "/chores", {"location_id": house["wc"], "name": "Takarítás"}).json()
    for user_id in (admin_id, 999):
        body = {"by": user_id}
        assert lan.post(f"/api/v1/requests/{sugar_out}/done", json=body).status_code == 422
        assert lan.post(f"/api/v1/chores/{chore['id']}/done", json=body).status_code == 422
    # Nothing was marked.
    assert api("GET", "/requests").json()[0]["status"] == "open"


def test_done_without_a_body_is_still_ones_own(api, house, sugar_out) -> None:
    api("POST", f"/requests/{sugar_out}/done")
    [stock] = api("GET", "/stock").json()
    assert stock["updated_by_name"] == "Anna Kovacs"


# People and devices


def test_list_people_without_admin(api, lan, people) -> None:
    names = [person["name"] for person in api("GET", "/users").json()]
    assert names == ["Anna Kovacs", "Bela Kovacs"]


def test_set_someones_nickname(api, lan, people) -> None:
    response = lan.patch(f"/api/v1/users/{people['bela']}", json={"nickname": "Béla"})
    assert response.json()["display_name"] == "Béla"
    assert api("GET", "/users/me", headers=BELA).json()["nickname"] == "Béla"


def test_list_and_delete_devices(api, people) -> None:
    body = {"endpoint": "https://push.example.com/old", "keys": {"p256dh": "k", "auth": "a"}}
    headers = {**BELA, "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/140"}
    api("PUT", "/push/subscriptions", body, headers)
    [device] = api("GET", "/push/subscriptions").json()
    assert device["user_name"] == "Bela Kovacs"
    assert "Android 14" in device["user_agent"]
    assert device["seen_at"] is not None
    assert api("DELETE", f"/push/subscriptions/{device['id']}").status_code == 204
    assert api("GET", "/push/subscriptions").json() == []
    assert api("DELETE", f"/push/subscriptions/{device['id']}").status_code == 404


# The log, page by page


def test_activity_pages(api, house) -> None:
    for level in ("low", "plenty", "out", "lots"):
        api("PUT", f"/locations/{house['pantry']}/stock/{house['sugar']}", {"level": level})
    first = api("GET", "/activity?limit=2").json()
    older = api("GET", f"/activity?limit=2&before_id={first[-1]['id']}").json()
    assert [e["level"] for e in first + older] == ["lots", "out", "plenty", "low"]
