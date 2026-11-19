"""Recipes: ingredients named, new names added to the catalogue kept nowhere."""

import pytest

BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}


@pytest.fixture
def items(api) -> dict[str, int]:
    def post(name: str, variant: str | None = None) -> int:
        return api("POST", "/items", {"name": name, "variant": variant}).json()["id"]

    return {
        "onion": post("Hagyma"),
        "corn": post("Konzerv", "kukorica"),
        "peas": post("Konzerv", "borsó"),
    }


def lecso(**fields) -> dict:
    return {
        "name": "Lecsó",
        "ingredients": [
            {"name": "hagyma", "amount": "2 fej"},
            {"name": "Paprika", "amount": "1 kg"},
            {"name": "Petrezselyem", "optional": True},
        ],
        **fields,
    }


def items_by_id(api) -> dict[int, dict]:
    return {item["id"]: item for item in api("GET", "/items").json()}


def test_add_a_recipe(api, items) -> None:
    body = lecso(note="Kolbásszal is jó.", link="https://example.com/lecso")
    response = api("POST", "/recipes", body)
    assert response.status_code == 201, response.text
    recipe = response.json()
    assert (recipe["name"], recipe["note"], recipe["link"]) == (
        "Lecsó",
        "Kolbásszal is jó.",
        "https://example.com/lecso",
    )
    onion, pepper, parsley = recipe["ingredients"]
    # A known name, whatever its case, is that item.
    assert onion["item_id"] == items["onion"]
    assert (onion["amount"], onion["optional"]) == ("2 fej", False)
    assert parsley["optional"] is True
    assert api("GET", "/recipes").json() == [recipe]


def test_new_ingredients_join_the_catalogue_kept_nowhere(api, items) -> None:
    recipe = api("POST", "/recipes", lecso()).json()
    pepper = items_by_id(api)[recipe["ingredients"][1]["item_id"]]
    assert (pepper["name"], pepper["variant"]) == ("Paprika", None)
    # Not kept anywhere, so not restocked: nothing goes on the list for it by itself.
    assert pepper["restock"] is False
    assert api("GET", "/stock").json() == []


def test_a_variant_or_any_variant(api, items) -> None:
    body = {
        "name": "Rakott",
        "ingredients": [
            {"name": "Konzerv", "variant": "Borsó"},
            {"name": "Konzerv", "any_variant": True},
        ],
    }
    # The same item twice: borsó, and the name's first variant for any.
    assert api("POST", "/recipes", body).status_code == 422
    body["ingredients"][0] = {"name": "Hagyma"}
    peas, canned = api("POST", "/recipes", body).json()["ingredients"]
    assert canned["any_variant"] is True
    assert items_by_id(api)[canned["item_id"]]["name"] == "Konzerv"


def test_a_new_variant_of_a_known_name(api, items) -> None:
    body = {"name": "Saláta", "ingredients": [{"name": "konzerv", "variant": "bab"}]}
    [bean] = api("POST", "/recipes", body).json()["ingredients"]
    item = items_by_id(api)[bean["item_id"]]
    # It takes the group's spelling.
    assert (item["name"], item["variant"]) == ("Konzerv", "bab")


def test_names_are_unique(api) -> None:
    api("POST", "/recipes", lecso())
    assert api("POST", "/recipes", lecso(name="LECSÓ")).status_code == 409


def test_a_link_is_a_web_address(api) -> None:
    assert api("POST", "/recipes", lecso(link="javascript:alert(1)")).status_code == 422
    blank = api("POST", "/recipes", lecso(link="  ", note=""))
    assert (blank.json()["link"], blank.json()["note"]) == (None, None)


def test_update_a_recipe(api, items) -> None:
    recipe = api("POST", "/recipes", lecso(note="Régi")).json()
    path = f"/recipes/{recipe['id']}"
    # Only the fields sent change.
    changed = api("PATCH", path, {"name": "Lecsó tojással"}).json()
    assert (changed["name"], changed["note"], len(changed["ingredients"])) == (
        "Lecsó tojással",
        "Régi",
        3,
    )
    # Ingredients sent replace them all, in their order; the same item again is fine.
    body = {"ingredients": [{"name": "Tojás"}, {"name": "Hagyma", "amount": "1 fej"}], "note": None}
    changed = api("PATCH", path, body).json()
    assert [i["amount"] for i in changed["ingredients"]] == [None, "1 fej"]
    assert changed["ingredients"][1]["item_id"] == items["onion"]
    assert changed["note"] is None


def test_rename_onto_another(api) -> None:
    api("POST", "/recipes", lecso())
    other = api("POST", "/recipes", {"name": "Pörkölt"}).json()
    assert api("PATCH", f"/recipes/{other['id']}", {"name": "lecsó"}).status_code == 409


def test_delete_a_recipe(api, items) -> None:
    recipe = api("POST", "/recipes", lecso()).json()
    assert api("DELETE", f"/recipes/{recipe['id']}").status_code == 204
    assert api("GET", "/recipes").json() == []
    # Its items stay in the catalogue.
    assert any(item["name"] == "Paprika" for item in api("GET", "/items").json())


def test_a_deleted_item_leaves_the_recipe(api, items) -> None:
    api("POST", "/recipes", lecso())
    assert api("DELETE", f"/items/{items['onion']}").status_code == 204
    [recipe] = api("GET", "/recipes").json()
    assert [i["item_id"] for i in recipe["ingredients"]] != []
    assert items["onion"] not in [i["item_id"] for i in recipe["ingredients"]]


def test_both_see_the_recipes(api) -> None:
    api("POST", "/recipes", lecso())
    assert [r["name"] for r in api("GET", "/recipes", headers=BELA).json()] == ["Lecsó"]


def test_a_recipe_takes_another(api) -> None:
    nokedli = api("POST", "/recipes", {"name": "Nokedli", "ingredients": [{"name": "Liszt"}]})
    body = {
        "name": "Paprikás csirke",
        "ingredients": [
            {"name": "Csirkecomb", "amount": "1 kg"},
            {"name": "nokedli", "recipe": True, "amount": "egy adag"},
        ],
    }
    response = api("POST", "/recipes", body)
    assert response.status_code == 201, response.text
    meat, part = response.json()["ingredients"]
    assert meat["part_id"] is None and meat["item_id"] is not None
    # Found by name, whatever its case; no item is made for it.
    assert (part["part_id"], part["item_id"], part["amount"]) == (
        nokedli.json()["id"],
        None,
        "egy adag",
    )
    assert sorted(item["name"] for item in api("GET", "/items").json()) == ["Csirkecomb", "Liszt"]


def test_a_part_must_exist_and_has_no_variant(api) -> None:
    missing = {"name": "Lasagne", "ingredients": [{"name": "Besamel", "recipe": True}]}
    assert api("POST", "/recipes", missing).status_code == 422
    assert api("GET", "/recipes").json() == []
    api("POST", "/recipes", {"name": "Besamel"})
    variant = {"name": "Besamel", "variant": "light", "recipe": True}
    assert api("POST", "/recipes", {**missing, "ingredients": [variant]}).status_code == 422


def test_a_part_listed_twice(api) -> None:
    api("POST", "/recipes", {"name": "Nokedli"})
    twice = [{"name": "Nokedli", "recipe": True}, {"name": "NOKEDLI", "recipe": True}]
    response = api("POST", "/recipes", {"name": "Pörkölt", "ingredients": twice})
    assert response.status_code == 422


def test_no_recipe_takes_itself(api) -> None:
    sauce = api("POST", "/recipes", {"name": "Paradicsomszósz"}).json()
    lasagne = api(
        "POST",
        "/recipes",
        {"name": "Lasagne", "ingredients": [{"name": "Paradicsomszósz", "recipe": True}]},
    ).json()
    itself = {"ingredients": [{"name": "paradicsomszósz", "recipe": True}]}
    assert api("PATCH", f"/recipes/{sauce['id']}", itself).status_code == 422
    # Nor through another: the sauce taking the lasagne, which takes the sauce.
    loop = {"ingredients": [{"name": "Lasagne", "recipe": True}]}
    assert api("PATCH", f"/recipes/{sauce['id']}", loop).status_code == 422
    assert api("GET", "/recipes").json()[0]["ingredients"] == []
    assert len(lasagne["ingredients"]) == 1


def test_a_deleted_part_leaves_the_recipes_taking_it(api) -> None:
    nokedli = api("POST", "/recipes", {"name": "Nokedli"}).json()
    body = {
        "name": "Pörkölt",
        "ingredients": [{"name": "Hagyma"}, {"name": "Nokedli", "recipe": True}],
    }
    stew = api("POST", "/recipes", body).json()
    assert api("DELETE", f"/recipes/{nokedli['id']}").status_code == 204
    (left,) = api("GET", "/recipes").json()
    assert left["id"] == stew["id"]
    assert [i["part_id"] for i in left["ingredients"]] == [None]


def test_a_recipe_is_a_main_course_unless_told(api) -> None:
    schnitzel = api("POST", "/recipes", {"name": "Rántott hús"}).json()
    assert schnitzel["kind"] == "main"
    mash = api("POST", "/recipes", {"name": "Krumplipüré", "kind": "side"}).json()
    assert mash["kind"] == "side"
    changed = api("PATCH", f"/recipes/{schnitzel['id']}", {"kind": "whole"}).json()
    assert changed["kind"] == "whole"
    # Sending other fields leaves it.
    renamed = api("PATCH", f"/recipes/{schnitzel['id']}", {"name": "Bécsi szelet"}).json()
    assert renamed["kind"] == "whole"
    assert api("POST", "/recipes", {"name": "Leves", "kind": "starter"}).status_code == 422


def test_a_menu_serves_recipes_but_is_none(api) -> None:
    for name, kind in [("Húsleves", "soup"), ("Rántott hús", "main"), ("Krumplipüré", "side")]:
        api("POST", "/recipes", {"name": name, "kind": kind})
    parts = [{"name": name, "recipe": True} for name in ("Húsleves", "Rántott hús", "Krumplipüré")]
    sunday = api("POST", "/recipes", {"name": "Vasárnapi", "kind": "menu", "ingredients": parts})
    assert sunday.status_code == 201, sunday.text
    assert len(sunday.json()["ingredients"]) == 3
    # A menu isn't an ingredient of anything, nor becomes one while it's taken.
    in_menu = {"name": "Kettő", "ingredients": [{"name": "Vasárnapi", "recipe": True}]}
    assert api("POST", "/recipes", in_menu).status_code == 422
    soup = next(r for r in api("GET", "/recipes").json() if r["name"] == "Húsleves")
    assert api("PATCH", f"/recipes/{soup['id']}", {"kind": "menu"}).status_code == 422
