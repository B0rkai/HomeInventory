import pytest

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}


def set_level(api, location: int, item: int, level: str, headers=ANNA) -> None:
    response = api("PUT", f"/locations/{location}/stock/{item}", {"level": level}, headers)
    assert response.status_code == 200, response.text


def move(api, items: list[int], source: int, target: int, headers=ANNA):
    body = {"item_ids": items, "from_location_id": source, "to_location_id": target}
    return api("POST", "/stock/move", body, headers)


def stock(api) -> dict[tuple[int, int], dict]:
    return {(r["item_id"], r["location_id"]): r for r in api("GET", "/stock").json()}


def active(api) -> list[dict]:
    return api("GET", "/requests").json()


def test_move_takes_the_level_along(api, house) -> None:
    pantry, wc, sugar = house["pantry"], house["wc"], house["sugar"]
    set_level(api, pantry, sugar, "lots", BELA)
    response = move(api, [sugar], pantry, wc)
    assert response.status_code == 200, response.text
    [row] = response.json()
    assert (row["location_id"], row["level"]) == (wc, "lots")
    # Who set the level stays: moving it isn't a new reading.
    assert row["updated_by_name"] == "Bela Kovacs"
    assert set(stock(api)) == {(sugar, wc)}
    [entry, *_] = api("GET", "/activity").json()
    assert entry["action"] == "moved"
    assert (entry["location_id"], entry["to_location_id"]) == (pantry, wc)
    assert entry["user_name"] == "Anna Kovacs"


def test_move_several(api, house) -> None:
    pantry, wc = house["pantry"], house["wc"]
    set_level(api, pantry, house["sugar"], "plenty")
    set_level(api, pantry, house["paper"], "low")
    assert len(move(api, [house["sugar"], house["paper"]], pantry, wc).json()) == 2
    assert set(stock(api)) == {(house["sugar"], wc), (house["paper"], wc)}


def test_a_request_moves_along_claim_and_all(api, house) -> None:
    pantry, wc, sugar = house["pantry"], house["wc"], house["sugar"]
    set_level(api, pantry, sugar, "out")
    [request] = active(api)
    api("POST", f"/requests/{request['id']}/claim", headers=BELA)
    move(api, [sugar], pantry, wc)
    [moved] = active(api)
    assert moved["id"] == request["id"]
    assert moved["location_id"] == wc
    assert moved["claimed_by_name"] == "Bela Kovacs"


def test_merging_keeps_the_fuller_level(api, house) -> None:
    pantry, wc, sugar = house["pantry"], house["wc"], house["sugar"]
    set_level(api, pantry, sugar, "lots")
    set_level(api, wc, sugar, "low")
    move(api, [sugar], pantry, wc)
    assert stock(api)[(sugar, wc)]["level"] == "lots"
    assert len(stock(api)) == 1
    # Full now: the merge filled it, so off the list (cancelled, nobody bought it).
    assert active(api) == []


def test_merging_two_short_rows_keeps_one_request(api, house) -> None:
    pantry, wc, sugar = house["pantry"], house["wc"], house["sugar"]
    set_level(api, pantry, sugar, "out")
    set_level(api, wc, sugar, "low")
    there, here = sorted(active(api), key=lambda r: r["location_id"] != wc)
    # A claim wins over a request nobody has taken.
    api("POST", f"/requests/{here['id']}/claim", headers=BELA)
    move(api, [sugar], pantry, wc)
    [kept] = active(api)
    assert kept["id"] == here["id"]
    assert kept["location_id"] == wc
    assert stock(api)[(sugar, wc)]["level"] == "low"


def test_merging_short_into_short_opens_none_twice(api, house) -> None:
    pantry, wc, sugar = house["pantry"], house["wc"], house["sugar"]
    set_level(api, pantry, sugar, "out")
    set_level(api, wc, sugar, "low")
    first = {r["location_id"]: r["id"] for r in active(api)}
    move(api, [sugar], pantry, wc)
    [kept] = active(api)
    assert kept["id"] == first[wc]


def test_a_short_row_moved_on_its_own_stays_listed(api, house) -> None:
    pantry, wc, paper = house["pantry"], house["wc"], house["paper"]
    set_level(api, pantry, paper, "plenty")
    # Not restocked, but put on the list by hand: that stays.
    api("PATCH", f"/items/{paper}", {"restock": False})
    api("POST", f"/locations/{pantry}/stock/{paper}/request")
    move(api, [paper], pantry, wc)
    [listed] = active(api)
    assert listed["location_id"] == wc


def test_move_is_all_or_nothing(api, house) -> None:
    pantry, wc = house["pantry"], house["wc"]
    set_level(api, pantry, house["sugar"], "plenty")
    # The paper isn't kept in the pantry.
    response = move(api, [house["sugar"], house["paper"]], pantry, wc)
    assert response.status_code == 404
    assert set(stock(api)) == {(house["sugar"], pantry)}
    assert all(entry["action"] != "moved" for entry in api("GET", "/activity").json())


@pytest.mark.parametrize("where", ["same", "missing"])
def test_move_needs_two_places(api, house, where: str) -> None:
    pantry, sugar = house["pantry"], house["sugar"]
    set_level(api, pantry, sugar, "plenty")
    target = pantry if where == "same" else 999
    assert move(api, [sugar], pantry, target).status_code == (422 if where == "same" else 404)


def test_moving_one_variant_where_any_will_do(api, house) -> None:
    pantry, wc = house["pantry"], house["wc"]
    ids = {}
    for variant in ("kenyér", "zsemle"):
        ids[variant] = api("POST", "/items", {"name": "Pékáru", "variant": variant}).json()["id"]
        set_level(api, pantry, ids[variant], "out")
    api("PATCH", f"/items/{ids['kenyér']}", {"any_variant": True})
    [request] = active(api)
    move(api, [request["item_id"]], pantry, wc)
    # Each place is short of the bread it keeps now: one line each.
    lines = {(r["location_id"], r["item_id"]) for r in active(api)}
    left = ids["zsemle"] if request["item_id"] == ids["kenyér"] else ids["kenyér"]
    assert lines == {(wc, request["item_id"]), (pantry, left)}
