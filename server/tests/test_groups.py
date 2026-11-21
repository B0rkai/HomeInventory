import json
from pathlib import Path

import homeinventory


def add_group(api, name: str, parent_id: int | None = None, **fields) -> dict:
    body = {"name": name, "parent_id": parent_id, **fields}
    if parent_id is None:
        body.setdefault("hue", "food")
    response = api("POST", "/groups", body)
    assert response.status_code == 201, response.text
    return response.json()


def names(api) -> list[tuple[str, int | None, int]]:
    return [(g["name"], g["parent_id"], g["position"]) for g in api("GET", "/groups").json()]


def test_groups_and_subgroups(api) -> None:
    food = add_group(api, "Élelmiszer")
    drink = add_group(api, "Ital", hue="drink")
    spice = add_group(api, "Fűszer", food["id"], icons=["salt", "pepper", "salt"])
    assert spice == {
        "id": spice["id"],
        "parent_id": food["id"],
        "name": "Fűszer",
        "position": 0,
        # A subgroup wears its group's colour.
        "hue": None,
        "icons": ["salt", "pepper"],
        "keeps_days": None,
    }
    add_group(api, "Pékáru", food["id"])
    assert names(api) == [
        ("Élelmiszer", None, 0),
        ("Ital", None, 1),
        ("Fűszer", food["id"], 0),
        ("Pékáru", food["id"], 1),
    ]
    assert drink["hue"] == "drink"


def test_a_group_needs_a_colour_and_nests_one_deep(api) -> None:
    assert api("POST", "/groups", {"name": "Élelmiszer"}).status_code == 422
    food = add_group(api, "Élelmiszer")
    spice = add_group(api, "Fűszer", food["id"])
    deeper = api("POST", "/groups", {"name": "Bors", "parent_id": spice["id"]})
    assert deeper.status_code == 422
    assert api("POST", "/groups", {"name": "X", "parent_id": 99}).status_code == 422


def test_names_are_unique_among_siblings_ignoring_case(api) -> None:
    food = add_group(api, "Élelmiszer")
    clean = add_group(api, "Takarítás", hue="clean")
    add_group(api, "Egyéb", food["id"])
    assert api("POST", "/groups", {"name": "éLELMISZER", "hue": "food"}).status_code == 409
    assert api("POST", "/groups", {"name": "EGYÉB", "parent_id": food["id"]}).status_code == 409
    # Under another group it's fine.
    add_group(api, "Egyéb", clean["id"])


def test_update_renames_recolours_and_reorders(api) -> None:
    food = add_group(api, "Élelmiszer")
    a = add_group(api, "A", food["id"])
    add_group(api, "B", food["id"])
    c = add_group(api, "C", food["id"])
    response = api("PATCH", f"/groups/{c['id']}", {"name": "Cé", "position": 0, "icons": []})
    assert response.json()["name"] == "Cé"
    assert [n for n, *_ in names(api)][1:] == ["Cé", "A", "B"]
    assert api("PATCH", f"/groups/{food['id']}", {"hue": "home"}).json()["hue"] == "home"
    assert api("PATCH", f"/groups/{a['id']}", {"hue": "home"}).status_code == 422
    assert api("PATCH", f"/groups/{a['id']}", {"name": "b"}).status_code == 409


def test_a_subgroup_moves_to_another_group(api) -> None:
    food = add_group(api, "Élelmiszer")
    home = add_group(api, "Háztartás", hue="home")
    add_group(api, "Pet", home["id"])
    pet_food = add_group(api, "Állateledel", food["id"])
    other = add_group(api, "Egyéb", food["id"])
    moved = api("PATCH", f"/groups/{pet_food['id']}", {"parent_id": home["id"]}).json()
    assert (moved["parent_id"], moved["position"]) == (home["id"], 1)
    # The siblings it left close up.
    assert next(g for g in api("GET", "/groups").json() if g["id"] == other["id"])["position"] == 0
    # A group stays a group, a subgroup a subgroup.
    assert api("PATCH", f"/groups/{home['id']}", {"parent_id": food["id"]}).status_code == 422
    assert api("PATCH", f"/groups/{other['id']}", {"parent_id": None}).status_code == 422


def test_deleting_a_subgroup_moves_its_items_up(api) -> None:
    food = add_group(api, "Élelmiszer")
    spice = add_group(api, "Fűszer", food["id"])
    salt = api("POST", "/items", {"name": "Só", "group_id": spice["id"]}).json()["id"]
    assert api("DELETE", f"/groups/{spice['id']}").status_code == 204
    assert api("GET", "/items").json()[0]["id"] == salt
    assert api("GET", "/items").json()[0]["group_id"] == food["id"]
    assert names(api) == [("Élelmiszer", None, 0)]


def test_a_group_goes_only_once_empty(api) -> None:
    food = add_group(api, "Élelmiszer")
    spice = add_group(api, "Fűszer", food["id"])
    assert api("DELETE", f"/groups/{food['id']}").status_code == 409
    api("DELETE", f"/groups/{spice['id']}")
    milk = api("POST", "/items", {"name": "Tej", "group_id": food["id"]}).json()["id"]
    assert api("DELETE", f"/groups/{food['id']}").status_code == 409
    api("PATCH", f"/items/{milk}", {"group_id": None})
    assert api("DELETE", f"/groups/{food['id']}").status_code == 204


def test_the_seed_file_is_well_formed() -> None:
    seed = Path(homeinventory.__file__).parent / "seed" / "groups.json"
    groups = json.loads(seed.read_text(encoding="utf-8"))
    hues = {"food", "drink", "clean", "body", "home"}
    assert {group["hue"] for group in groups} <= hues
    for group in groups:
        subgroups = [sub["name"].casefold() for sub in group.get("subgroups", [])]
        assert len(subgroups) == len(set(subgroups))
    assert len({group["name"].casefold() for group in groups}) == len(groups)
