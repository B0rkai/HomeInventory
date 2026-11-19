"""Substitutes: what a recipe can use instead of an item, named like ingredients."""


def post_item(api, name: str, variant: str | None = None) -> dict:
    return api("POST", "/items", {"name": name, "variant": variant}).json()


def test_an_item_gets_substitutes_by_name(api) -> None:
    butter = post_item(api, "Vaj")
    assert butter["substitute_ids"] == []
    marg = post_item(api, "Margarin", "sütő")
    body = {"substitutes": [{"name": "margarin", "variant": "SÜTŐ"}, {"name": "Olaj"}]}
    response = api("PATCH", f"/items/{butter['id']}", body)
    assert response.status_code == 200, response.text
    items = {item["id"]: item for item in api("GET", "/items").json()}
    first, second = response.json()["substitute_ids"]
    # A known one, whatever its case; a new one joins the catalogue kept nowhere.
    assert first == marg["id"]
    assert (items[second]["name"], items[second]["restock"]) == ("Olaj", False)
    # Both ways.
    assert items[marg["id"]]["substitute_ids"] == [butter["id"]]
    assert items[second]["substitute_ids"] == [butter["id"]]


def test_substitutes_are_replaced_and_left_alone(api) -> None:
    butter = post_item(api, "Vaj")
    api("PATCH", f"/items/{butter['id']}", {"substitutes": [{"name": "Margarin"}]})
    # Another change leaves them.
    renamed = api("PATCH", f"/items/{butter['id']}", {"name": "Teavaj"}).json()
    assert len(renamed["substitute_ids"]) == 1
    cleared = api("PATCH", f"/items/{butter['id']}", {"substitutes": []}).json()
    assert cleared["substitute_ids"] == []
    assert all(item["substitute_ids"] == [] for item in api("GET", "/items").json())


def test_taken_off_from_the_other_side(api) -> None:
    butter = post_item(api, "Vaj")
    api("PATCH", f"/items/{butter['id']}", {"substitutes": [{"name": "Margarin"}]})
    marg = next(item for item in api("GET", "/items").json() if item["name"] == "Margarin")
    api("PATCH", f"/items/{marg['id']}", {"substitutes": [{"name": "Olaj"}]})
    items = {item["name"]: item for item in api("GET", "/items").json()}
    assert items["Vaj"]["substitute_ids"] == []
    assert items["Olaj"]["substitute_ids"] == [marg["id"]]


def test_not_itself_and_each_once(api) -> None:
    butter = post_item(api, "Vaj")
    itself = {"substitutes": [{"name": "vaj"}]}
    assert api("PATCH", f"/items/{butter['id']}", itself).status_code == 422
    twice = {"substitutes": [{"name": "Margarin"}, {"name": "MARGARIN"}]}
    assert len(api("PATCH", f"/items/{butter['id']}", twice).json()["substitute_ids"]) == 1


def test_a_deleted_substitute_leaves(api) -> None:
    butter = post_item(api, "Vaj")
    marg = post_item(api, "Margarin")
    api("PATCH", f"/items/{butter['id']}", {"substitutes": [{"name": "Margarin"}]})
    assert api("DELETE", f"/items/{marg['id']}").status_code == 204
    (left,) = api("GET", "/items").json()
    assert left["substitute_ids"] == []
