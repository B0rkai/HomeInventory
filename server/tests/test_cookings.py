"""Cookings: a recipe planned for a day puts what the house lacks on the list."""

from datetime import date, timedelta

import pytest

BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}
BELAS_PHONE = "https://push.example.com/bela"


def day(offset: int) -> str:
    # The tests run near enough to Budapest's day; a day's margin either way is never used.
    return (date.today() + timedelta(days=offset)).isoformat()


@pytest.fixture
def kitchen(api, house) -> dict[str, int]:
    """Sugar at plenty and milk low in the pantry (restocked: it's on the list), paprika
    there at plenty (not restocked), flour kept nowhere; a recipe taking them all."""
    pantry = house["pantry"]
    milk = api("POST", "/items", {"name": "Tej"}).json()["id"]
    paprika = api("POST", "/items", {"name": "Paprika", "restock": False}).json()["id"]
    for item, level in ((house["sugar"], "plenty"), (milk, "low"), (paprika, "plenty")):
        api("PUT", f"/locations/{pantry}/stock/{item}", {"level": level})
    recipe = api(
        "POST",
        "/recipes",
        {
            "name": "Palacsinta",
            "ingredients": [
                {"name": "Cukor"},
                {"name": "Tej"},
                {"name": "Liszt"},
                {"name": "Paprika"},
                {"name": "Petrezselyem", "optional": True},
            ],
        },
    ).json()
    flour = recipe["ingredients"][2]["item_id"]
    return {
        "pantry": pantry,
        "milk": milk,
        "paprika": paprika,
        "flour": flour,
        "recipe": recipe["id"],
    }


def plan(api, recipe: int, offset: int = 1, **fields) -> dict:
    response = api("POST", "/cookings", {"recipe_id": recipe, "day": day(offset), **fields})
    assert response.status_code == 201, response.text
    return response.json()


def lines(api) -> dict[int, dict]:
    """The active buy lines of items, by item."""
    return {r["item_id"]: r for r in api("GET", "/requests").json() if r["item_id"] is not None}


def test_planning_lists_what_the_house_lacks(api, kitchen) -> None:
    cooking = plan(api, kitchen["recipe"])
    assert api("GET", "/cookings").json() == [cooking]
    listed = lines(api)
    # Milk was on the list already (low): now it's due for the cooking. Flour, kept nowhere,
    # goes on with no place. Sugar and paprika are at home; parsley is only if there's some.
    assert set(listed) == {kitchen["milk"], kitchen["flour"]}
    assert listed[kitchen["milk"]]["location_id"] == kitchen["pantry"]
    assert listed[kitchen["flour"]]["location_id"] is None
    assert {line["cooking_id"] for line in listed.values()} == {cooking["id"]}


def test_a_day_gone_by_is_refused(api, kitchen) -> None:
    response = api("POST", "/cookings", {"recipe_id": kitchen["recipe"], "day": day(-2)})
    assert response.status_code == 422
    assert api("GET", "/cookings").json() == []


def test_a_side_dish_goes_with_a_main_course(api, kitchen) -> None:
    side = api(
        "POST", "/recipes", {"name": "Rizs", "kind": "side", "ingredients": [{"name": "Rizs"}]}
    ).json()
    soup = api("POST", "/recipes", {"name": "Gulyás", "kind": "soup"}).json()
    rice = side["ingredients"][0]["item_id"]
    # Only a side dish, and only with a main course (or a menu).
    assert (
        api(
            "POST",
            "/cookings",
            {"recipe_id": kitchen["recipe"], "day": day(1), "side_id": soup["id"]},
        ).status_code
        == 422
    )
    assert (
        api(
            "POST", "/cookings", {"recipe_id": soup["id"], "day": day(1), "side_id": side["id"]}
        ).status_code
        == 422
    )
    cooking = plan(api, kitchen["recipe"], side_id=side["id"])
    assert lines(api)[rice]["cooking_id"] == cooking["id"]
    # Without it, the rice goes off the list again.
    changed = api("PATCH", f"/cookings/{cooking['id']}", {"side_id": None})
    assert changed.json()["side_id"] is None
    assert rice not in lines(api)


def test_a_line_is_due_for_the_earliest_cooking(api, kitchen) -> None:
    later = plan(api, kitchen["recipe"], offset=5)
    sooner = plan(api, kitchen["recipe"], offset=2)
    flour = kitchen["flour"]
    assert lines(api)[flour]["cooking_id"] == sooner["id"]
    # One line, however many cookings lack it.
    assert sum(r["item_id"] == flour for r in api("GET", "/requests").json()) == 1
    api("PATCH", f"/cookings/{sooner['id']}", {"day": day(7)})
    assert lines(api)[flour]["cooking_id"] == later["id"]
    # Cancelled, the other still needs it.
    assert api("DELETE", f"/cookings/{later['id']}").status_code == 204
    assert lines(api)[flour]["cooking_id"] == sooner["id"]


def test_cancelling_takes_off_only_what_it_put_on(api, kitchen) -> None:
    cooking = plan(api, kitchen["recipe"])
    assert api("DELETE", f"/cookings/{cooking['id']}").status_code == 204
    listed = lines(api)
    # The flour was only for it; the milk is low, it stays, due for nothing now.
    assert set(listed) == {kitchen["milk"]}
    assert listed[kitchen["milk"]]["cooking_id"] is None
    assert api("GET", "/cookings").json() == []


def test_a_claimed_line_stays_and_the_buyer_is_told(api, kitchen, pushes) -> None:
    phone = {"endpoint": BELAS_PHONE, "keys": {"p256dh": "key", "auth": "secret"}}
    assert api("PUT", "/push/subscriptions", phone, BELA).status_code == 204
    cooking = plan(api, kitchen["recipe"])
    assert [message["event"] for _, message in pushes] == ["planned"]
    flour = lines(api)[kitchen["flour"]]
    assert api("POST", f"/requests/{flour['id']}/claim", headers=BELA).status_code == 200
    api("DELETE", f"/cookings/{cooking['id']}")
    assert lines(api)[kitchen["flour"]]["status"] == "claimed"
    endpoint, message = pushes[-1]
    assert (endpoint, message["event"], message["kind"], message["name"]) == (
        BELAS_PHONE,
        "dropped",
        "cooking",
        "Palacsinta",
    )
    assert message["day"] == day(1)


def test_bought_for_the_cooking(api, kitchen) -> None:
    cooking = plan(api, kitchen["recipe"])
    flour = lines(api)[kitchen["flour"]]
    assert api("POST", f"/requests/{flour['id']}/done").status_code == 200
    # Kept nowhere: no level, but the cooking has it.
    assert all(row["item_id"] != kitchen["flour"] for row in api("GET", "/stock").json())
    assert api("GET", "/cookings").json()[0]["bought_item_ids"] == [kitchen["flour"]]
    # Moving it doesn't put it on again.
    api("PATCH", f"/cookings/{cooking['id']}", {"day": day(3)})
    assert kitchen["flour"] not in lines(api)


def test_an_ingredient_running_out_goes_on_the_list(api, kitchen) -> None:
    cooking = plan(api, kitchen["recipe"])
    pantry, paprika = kitchen["pantry"], kitchen["paprika"]
    api("PUT", f"/locations/{pantry}/stock/{paprika}", {"level": "out"})
    # Not restocked, but the cooking lacks it now: on the list for the pantry.
    line = lines(api)[paprika]
    assert (line["location_id"], line["cooking_id"]) == (pantry, cooking["id"])
    api("PUT", f"/locations/{pantry}/stock/{paprika}", {"level": "plenty"})
    assert paprika not in lines(api)


def test_bought_flour_put_away_takes_its_line_off(api, kitchen) -> None:
    plan(api, kitchen["recipe"])
    api("PUT", f"/locations/{kitchen['pantry']}/stock/{kitchen['flour']}", {"level": "lots"})
    assert kitchen["flour"] not in lines(api)


def test_a_substitute_at_home_will_do(api, kitchen) -> None:
    margarine = api("POST", "/items", {"name": "Margarin"}).json()["id"]
    api("PATCH", f"/items/{kitchen['flour']}", {"substitutes": [{"name": "Margarin"}]})
    api("PUT", f"/locations/{kitchen['pantry']}/stock/{margarine}", {"level": "plenty"})
    plan(api, kitchen["recipe"])
    assert kitchen["flour"] not in lines(api)


def test_changing_the_recipe_changes_the_list(api, kitchen) -> None:
    plan(api, kitchen["recipe"])
    recipe = api(
        "PATCH",
        f"/recipes/{kitchen['recipe']}",
        {"ingredients": [{"name": "Tej"}, {"name": "Tojás"}]},
    ).json()
    eggs = recipe["ingredients"][1]["item_id"]
    assert set(lines(api)) == {kitchen["milk"], eggs}


def test_a_part_and_a_menu_count(api, kitchen) -> None:
    api("POST", "/recipes", {"name": "Nokedli", "kind": "side", "ingredients": [{"name": "Tojás"}]})
    menu = api(
        "POST",
        "/recipes",
        {
            "name": "Vasárnap",
            "kind": "menu",
            "ingredients": [
                {"name": "Palacsinta", "recipe": True},
                {"name": "Nokedli", "recipe": True, "optional": True},
            ],
        },
    ).json()
    plan(api, menu["id"])
    # The optional part's items are optional too.
    assert set(lines(api)) == {kitchen["milk"], kitchen["flour"]}


def test_cooked_with_whats_left(api, kitchen) -> None:
    cooking = plan(api, kitchen["recipe"])
    pantry = kitchen["pantry"]
    done = api(
        "POST",
        f"/cookings/{cooking['id']}/done",
        {"levels": [{"item_id": kitchen["paprika"], "location_id": pantry, "level": "low"}]},
    )
    assert done.status_code == 200, done.text
    assert done.json()["done_at"] is not None
    assert api("GET", "/cookings").json() == []
    stock = {row["item_id"]: row["level"] for row in api("GET", "/stock").json()}
    assert stock[kitchen["paprika"]] == "low"
    # The flour line was only for it; the milk is a shortage of its own.
    assert set(lines(api)) == {kitchen["milk"]}
    assert api("POST", f"/cookings/{cooking['id']}/done", {"levels": []}).status_code == 409


def test_who_cooks(api, kitchen) -> None:
    bela = api("GET", "/users/me", headers=BELA).json()["id"]
    cooking = plan(api, kitchen["recipe"], cook_id=bela)
    assert cooking["cook_name"] == "Bela Kovacs"
    cleared = api("PATCH", f"/cookings/{cooking['id']}", {"cook_id": None}).json()
    assert cleared["cook_id"] is None
    assert api("PATCH", f"/cookings/{cooking['id']}", {"cook_id": 999}).status_code == 422


def test_deleting_the_recipe_cancels_its_cookings(api, kitchen) -> None:
    plan(api, kitchen["recipe"])
    assert api("DELETE", f"/recipes/{kitchen['recipe']}").status_code == 204
    assert api("GET", "/cookings").json() == []
    assert set(lines(api)) == {kitchen["milk"]}
