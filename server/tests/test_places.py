import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from homeinventory.models import Stock

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}


@pytest.fixture
def api(client: TestClient):
    """Calls /api/v1 as Anna unless told otherwise."""

    def call(method: str, path: str, json=None, headers=ANNA):
        return client.request(method, f"/api/v1{path}", json=json, headers=headers)

    return call


def add_location(api, name: str, parent_id: int | None = None) -> int:
    response = api("POST", "/locations", {"name": name, "parent_id": parent_id})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def add_item(api, name: str, category: str | None = None) -> int:
    response = api("POST", "/items", {"name": name, "category": category})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def names(api, parent_id: int | None) -> list[str]:
    locations = api("GET", "/locations").json()
    return [loc["name"] for loc in locations if loc["parent_id"] == parent_id]


# Locations


def test_locations_form_a_tree(api) -> None:
    ground = add_location(api, "Földszint")
    kitchen = add_location(api, "Konyha", ground)
    add_location(api, "Spájz", kitchen)
    locations = {loc["name"]: loc for loc in api("GET", "/locations").json()}
    assert locations["Földszint"]["parent_id"] is None
    assert locations["Konyha"]["parent_id"] == ground
    assert locations["Spájz"]["parent_id"] == kitchen


def test_locations_nest_at_most_three_deep(api) -> None:
    spot = add_location(api, "Spájz", add_location(api, "Konyha", add_location(api, "Földszint")))
    assert api("POST", "/locations", {"name": "Polc", "parent_id": spot}).status_code == 422


def test_new_locations_go_last(api) -> None:
    for name in ["Pince", "Földszint", "Emelet"]:
        add_location(api, name)
    assert names(api, None) == ["Pince", "Földszint", "Emelet"]


def test_move_location(api) -> None:
    ids = [add_location(api, name) for name in ["Pince", "Földszint", "Emelet"]]
    assert api("PATCH", f"/locations/{ids[2]}", {"position": 0}).status_code == 200
    assert names(api, None) == ["Emelet", "Pince", "Földszint"]
    api("PATCH", f"/locations/{ids[2]}", {"position": 99})
    assert names(api, None) == ["Pince", "Földszint", "Emelet"]


def test_moving_only_reorders_siblings(api) -> None:
    ground = add_location(api, "Földszint")
    upstairs = add_location(api, "Emelet")
    add_location(api, "Konyha", ground)
    bath = add_location(api, "Fürdő", upstairs)
    api("PATCH", f"/locations/{bath}", {"position": 0})
    assert names(api, ground) == ["Konyha"]
    assert names(api, None) == ["Földszint", "Emelet"]


def test_rename_location(api) -> None:
    ground = add_location(api, "Földszint")
    response = api("PATCH", f"/locations/{ground}", {"name": "  Fszt.  "})
    assert response.json()["name"] == "Fszt."


def test_sibling_names_are_unique_ignoring_case(api) -> None:
    ground = add_location(api, "Földszint")
    upstairs = add_location(api, "Emelet")
    add_location(api, "Fürdő", ground)
    response = api("POST", "/locations", {"name": "FÜRDŐ", "parent_id": ground})
    assert response.status_code == 409
    # The same name is fine elsewhere in the tree.
    add_location(api, "Fürdő", upstairs)
    assert api("PATCH", f"/locations/{upstairs}", {"name": "földszint"}).status_code == 409
    # Renaming to its own name (in another case) isn't a clash.
    assert api("PATCH", f"/locations/{upstairs}", {"name": "EMELET"}).status_code == 200


@pytest.mark.parametrize("name", ["", "   ", "x" * 61])
def test_location_name_is_required_and_bounded(api, name: str) -> None:
    assert api("POST", "/locations", {"name": name}).status_code == 422


def test_location_under_missing_parent_is_404(api) -> None:
    assert api("POST", "/locations", {"name": "Konyha", "parent_id": 99}).status_code == 404


def test_delete_location_with_children_is_refused(api) -> None:
    ground = add_location(api, "Földszint")
    kitchen = add_location(api, "Konyha", ground)
    assert api("DELETE", f"/locations/{ground}").status_code == 409
    assert api("DELETE", f"/locations/{kitchen}").status_code == 204
    assert api("DELETE", f"/locations/{ground}").status_code == 204
    assert api("GET", "/locations").json() == []


def test_delete_location_drops_its_stock(api, app) -> None:
    pantry = add_location(api, "Spájz")
    basement = add_location(api, "Pince")
    sugar = add_item(api, "Cukor")
    api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "low"})
    api("PUT", f"/locations/{basement}/stock/{sugar}", {"level": "plenty"})
    assert api("DELETE", f"/locations/{pantry}").status_code == 204
    assert [s["location_id"] for s in api("GET", "/stock").json()] == [basement]
    with app.state.sessionmaker() as session:
        assert len(session.scalars(select(Stock)).all()) == 1


# Items


def test_create_and_list_items(api) -> None:
    add_item(api, "Tej", "Tejtermék")
    add_item(api, "Cukor")
    items = {item["name"]: item["category"] for item in api("GET", "/items").json()}
    assert items == {"Tej": "Tejtermék", "Cukor": None}


def test_item_names_are_unique_ignoring_case(api) -> None:
    add_item(api, "Öblítő")
    assert api("POST", "/items", {"name": "öBLÍTŐ"}).status_code == 409


def test_update_item_only_changes_what_is_sent(api) -> None:
    milk = add_item(api, "Tej", "Tejtermék")
    response = api("PATCH", f"/items/{milk}", {"name": "Zabtej"})
    assert response.json() == {
        "id": milk,
        "name": "Zabtej",
        "variant": None,
        "category": "Tejtermék",
        "icon": None,
    }
    response = api("PATCH", f"/items/{milk}", {"category": "  "})
    assert response.json() == {
        "id": milk,
        "name": "Zabtej",
        "variant": None,
        "category": None,
        "icon": None,
    }


def test_rename_item_to_existing_name_is_409(api) -> None:
    add_item(api, "Tej")
    sugar = add_item(api, "Cukor")
    assert api("PATCH", f"/items/{sugar}", {"name": "TEJ"}).status_code == 409


def test_delete_item_drops_its_stock(api) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    salt = add_item(api, "Só")
    api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "out"})
    api("PUT", f"/locations/{pantry}/stock/{salt}", {"level": "plenty"})
    assert api("DELETE", f"/items/{sugar}").status_code == 204
    assert [s["item_id"] for s in api("GET", "/stock").json()] == [salt]


# Stock


def test_set_stock_adds_then_updates(api) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    first = api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "plenty"}).json()
    assert (first["level"], first["updated_by_name"]) == ("plenty", "Anna Kovacs")
    second = api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "out"}, headers=BELA).json()
    assert (second["level"], second["updated_by_name"]) == ("out", "Bela Kovacs")
    assert second["updated_at"] >= first["updated_at"]
    assert api("GET", "/stock").json() == [second]


def test_stock_shows_the_nickname(api) -> None:
    api("PATCH", "/users/me", {"nickname": "Anni"})
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    stock = api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "low"}).json()
    assert stock["updated_by_name"] == "Anni"


def test_stock_times_are_utc(api) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    stock = api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "low"}).json()
    assert stock["updated_at"].endswith("Z") or stock["updated_at"].endswith("+00:00")


def test_invalid_level_is_422(api) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    response = api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "some"})
    assert response.status_code == 422


@pytest.mark.parametrize("missing", ["location", "item"])
def test_set_stock_needs_existing_location_and_item(api, missing: str) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    path = (
        f"/locations/99/stock/{sugar}" if missing == "location" else f"/locations/{pantry}/stock/99"
    )
    assert api("PUT", path, {"level": "low"}).status_code == 404


def test_remove_stock(api) -> None:
    pantry = add_location(api, "Spájz")
    sugar = add_item(api, "Cukor")
    api("PUT", f"/locations/{pantry}/stock/{sugar}", {"level": "low"})
    assert api("DELETE", f"/locations/{pantry}/stock/{sugar}").status_code == 204
    assert api("GET", "/stock").json() == []
    assert api("DELETE", f"/locations/{pantry}/stock/{sugar}").status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/locations"),
        ("POST", "/locations"),
        ("PATCH", "/locations/1"),
        ("DELETE", "/locations/1"),
        ("GET", "/items"),
        ("POST", "/items"),
        ("GET", "/stock"),
        ("PUT", "/locations/1/stock/1"),
        ("DELETE", "/locations/1/stock/1"),
    ],
)
def test_places_need_identity(api, method: str, path: str) -> None:
    assert api(method, path, {"name": "x", "level": "low"}, headers={}).status_code == 401


# Icons and the lots level


def test_icons_default_to_unset(api) -> None:
    add_location(api, "Konyha")
    add_item(api, "Tej")
    assert api("GET", "/locations").json()[0]["icon"] is None
    assert api("GET", "/items").json()[0]["icon"] is None


def test_set_and_clear_icons(api) -> None:
    kitchen = add_location(api, "Konyha")
    milk = api("POST", "/items", {"name": "Tej", "icon": "milk"}).json()
    assert milk["icon"] == "milk"
    # Empty means "no icon", unlike null, which lets the client guess.
    assert api("PATCH", f"/items/{milk['id']}", {"icon": ""}).json()["icon"] == ""
    assert api("PATCH", f"/items/{milk['id']}", {"name": "Zabtej"}).json()["icon"] == ""
    assert api("PATCH", f"/items/{milk['id']}", {"icon": None}).json()["icon"] is None
    assert (
        api("PATCH", f"/locations/{kitchen}", {"icon": "tools-kitchen-2"}).json()["icon"]
        == "tools-kitchen-2"
    )
    assert (
        api("PATCH", f"/locations/{kitchen}", {"name": "Főző"}).json()["icon"] == "tools-kitchen-2"
    )


def test_icon_names_are_bounded(api) -> None:
    name = "bowl-chopsticks-and-more-letters"  # 32 characters
    assert api("POST", "/items", {"name": "Rizs", "icon": name}).json()["icon"] == name
    assert api("POST", "/items", {"name": "Tészta", "icon": name + "x"}).status_code == 422


def test_lots_level(api) -> None:
    basement = add_location(api, "Alagsor")
    paper = add_item(api, "WC-papír")
    stock = api("PUT", f"/locations/{basement}/stock/{paper}", {"level": "lots"}).json()
    assert stock["level"] == "lots"


# Variants


def add_variant(api, name: str, variant: str):
    return api("POST", "/items", {"name": name, "variant": variant})


def test_variants_share_a_name(api) -> None:
    add_item(api, "Konzerv")
    for variant in ["kukorica", "vörösbab", "borsó"]:
        assert add_variant(api, "Konzerv", variant).status_code == 201
    variants = sorted(
        (item["variant"] or "") for item in api("GET", "/items").json() if item["name"] == "Konzerv"
    )
    assert variants == ["", "borsó", "kukorica", "vörösbab"]


def test_variant_is_unique_per_name_ignoring_case(api) -> None:
    add_variant(api, "Szemeteszsák", "35 l")
    assert add_variant(api, "SZEMETESZSÁK", "35 L").status_code == 409
    assert add_variant(api, "Szemeteszsák", "60 l").status_code == 201
    # The same variant under another name is fine.
    assert add_variant(api, "Mosószer", "35 l").status_code == 201


def test_blank_variant_means_none(api) -> None:
    add_item(api, "Konzerv")
    assert add_variant(api, "Konzerv", "  ").status_code == 409


def test_set_and_clear_a_variant(api) -> None:
    bags = add_item(api, "Szemeteszsák")
    add_variant(api, "Szemeteszsák", "60 l")
    response = api("PATCH", f"/items/{bags}", {"variant": "35 l"})
    assert response.json()["variant"] == "35 l"
    # Renaming keeps the variant; clearing it is a separate, explicit change.
    assert api("PATCH", f"/items/{bags}", {"name": "Kukazsák"}).json()["variant"] == "35 l"
    assert api("PATCH", f"/items/{bags}", {"variant": None}).json()["variant"] is None


def test_variant_change_that_clashes_is_409(api) -> None:
    bags = add_item(api, "Szemeteszsák")
    add_variant(api, "Szemeteszsák", "60 l")
    assert api("PATCH", f"/items/{bags}", {"variant": "60 L"}).status_code == 409


def test_variants_have_their_own_stock(api) -> None:
    pantry = add_location(api, "Spájz")
    corn = add_variant(api, "Konzerv", "kukorica").json()["id"]
    beans = add_variant(api, "Konzerv", "vörösbab").json()["id"]
    api("PUT", f"/locations/{pantry}/stock/{corn}", {"level": "out"})
    api("PUT", f"/locations/{pantry}/stock/{beans}", {"level": "lots"})
    levels = {s["item_id"]: s["level"] for s in api("GET", "/stock").json()}
    assert levels == {corn: "out", beans: "lots"}
