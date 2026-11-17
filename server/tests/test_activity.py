from test_requests import BELA, add_chore, set_level


def log(api, limit: int = 50) -> list[tuple]:
    """The log, newest first, as (user, action, name, variant, place, level)."""
    return [
        (e["user_name"], e["action"], e["name"], e["variant"], e["location_id"], e["level"])
        for e in api("GET", f"/activity?limit={limit}").json()
    ]


def test_levels_and_buying_are_logged(api, house) -> None:
    pantry, sugar = house["pantry"], house["sugar"]
    set_level(api, pantry, sugar, "low")
    [request] = api("GET", "/requests").json()
    assert api("POST", f"/requests/{request['id']}/claim", headers=BELA).status_code == 200
    assert api("POST", f"/requests/{request['id']}/done", headers=BELA).status_code == 200
    assert log(api) == [
        ("Bela Kovacs", "done", "Cukor", None, pantry, None),
        ("Bela Kovacs", "claimed", "Cukor", None, pantry, None),
        ("Anna Kovacs", "level", "Cukor", None, pantry, "low"),
    ]


def test_fetching_from_lots_is_logged_as_such(api, house) -> None:
    set_level(api, house["pantry"], house["paper"], "lots")
    set_level(api, house["wc"], house["paper"], "out")
    [request] = api("GET", "/requests").json()
    api("POST", f"/requests/{request['id']}/done")
    assert log(api, 1) == [("Anna Kovacs", "fetched", "WC-papír", None, house["wc"], None)]


def test_unclaim_remind_cancel_list_and_remove_are_logged(api, house) -> None:
    pantry, sugar = house["pantry"], house["sugar"]
    set_level(api, pantry, sugar, "out")
    [request] = api("GET", "/requests").json()
    path = f"/requests/{request['id']}"
    api("POST", f"{path}/claim", headers=BELA)
    api("POST", f"{path}/remind")
    api("POST", f"{path}/unclaim", headers=BELA)
    api("POST", f"{path}/cancel")
    assert api("POST", f"/locations/{pantry}/stock/{sugar}/request").status_code == 201
    # Already listed: nothing new happened.
    assert api("POST", f"/locations/{pantry}/stock/{sugar}/request").status_code == 200
    api("DELETE", f"/locations/{pantry}/stock/{sugar}")
    assert [entry[:2] for entry in log(api)] == [
        ("Anna Kovacs", "removed"),
        ("Anna Kovacs", "listed"),
        ("Anna Kovacs", "cancelled"),
        ("Bela Kovacs", "unclaimed"),
        ("Anna Kovacs", "reminded"),
        ("Bela Kovacs", "claimed"),
        ("Anna Kovacs", "level"),
    ]


def test_a_failed_change_logs_nothing(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    [request] = api("GET", "/requests").json()
    api("POST", f"/requests/{request['id']}/claim")
    assert api("POST", f"/requests/{request['id']}/claim", headers=BELA).status_code == 409
    assert len(log(api)) == 2


def test_chores_are_logged_and_keep_their_name_once_gone(api, house) -> None:
    chore = add_chore(api, house["wc"])
    assert api("POST", f"/chores/{chore}/requests").status_code == 201
    assert api("POST", f"/chores/{chore}/requests").status_code == 200
    api("POST", f"/chores/{chore}/done", headers=BELA)
    one_off = api("POST", "/chores", {"location_id": None, "name": "Szerelő", "one_off": True})
    [request] = api("GET", "/requests").json()
    api("POST", f"/requests/{request['id']}/done")
    assert log(api) == [
        ("Anna Kovacs", "done", "Szerelő", None, None, None),
        ("Anna Kovacs", "reported", "Szerelő", None, None, None),
        ("Bela Kovacs", "done", "Kuka ürítése", None, house["wc"], None),
        ("Anna Kovacs", "reported", "Kuka ürítése", None, house["wc"], None),
    ]
    entries = api("GET", "/activity").json()
    # The one-off is deleted once done: its entries lose the link, not the name.
    assert entries[0]["chore_id"] is None
    assert entries[0]["kind"] == "chore"
    assert entries[2]["chore_id"] == chore
    assert one_off.json()["one_off"]


def test_deleting_an_item_unlinks_its_entries(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "plenty")
    api("DELETE", f"/items/{house['sugar']}")
    [entry] = api("GET", "/activity").json()
    assert entry["item_id"] is None
    assert entry["name"] == "Cukor"


def test_limit(api, house) -> None:
    for level in ("low", "plenty", "lots"):
        set_level(api, house["pantry"], house["sugar"], level)
    assert [entry[5] for entry in log(api, 2)] == ["lots", "plenty"]
    assert api("GET", "/activity?limit=0").status_code == 422
