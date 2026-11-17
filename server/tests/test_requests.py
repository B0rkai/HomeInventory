from datetime import UTC, datetime, timedelta

import pytest

from homeinventory import requests

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}


def set_level(api, location: int, item: int, level: str, headers=ANNA) -> None:
    response = api("PUT", f"/locations/{location}/stock/{item}", {"level": level}, headers)
    assert response.status_code == 200, response.text


def active(api) -> list[dict]:
    return api("GET", "/requests").json()


def level_of(api, location: int, item: int) -> str:
    rows = api("GET", "/stock").json()
    return next(r["level"] for r in rows if r["location_id"] == location and r["item_id"] == item)


def add_chore(api, location: int, name: str = "Kuka ürítése") -> int:
    response = api("POST", "/chores", {"location_id": location, "name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


# Buy requests from stock levels


@pytest.mark.parametrize("level", ["low", "out"])
def test_running_low_opens_a_buy_request(api, house, level: str) -> None:
    set_level(api, house["pantry"], house["sugar"], level)
    [request] = active(api)
    assert request["kind"] == "buy"
    assert request["item_id"] == house["sugar"]
    assert request["location_id"] == house["pantry"]
    assert request["chore_id"] is None
    assert request["status"] == "open"
    assert request["created_by_name"] == "Anna Kovacs"
    assert request["claimed_by_id"] is None


@pytest.mark.parametrize("level", ["plenty", "lots"])
def test_plenty_opens_nothing(api, house, level: str) -> None:
    set_level(api, house["pantry"], house["sugar"], level)
    assert active(api) == []


def test_reporting_again_keeps_one_request(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "low")
    set_level(api, house["pantry"], house["sugar"], "out", BELA)
    [request] = active(api)
    assert request["created_by_name"] == "Anna Kovacs"


def test_each_place_has_its_own_request(api, house) -> None:
    set_level(api, house["pantry"], house["paper"], "low")
    set_level(api, house["wc"], house["paper"], "out")
    assert {r["location_id"] for r in active(api)} == {house["pantry"], house["wc"]}


def test_filling_up_closes_the_request(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    set_level(api, house["pantry"], house["sugar"], "plenty", BELA)
    assert active(api) == []


def test_running_low_after_done_opens_a_new_request(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    first = active(api)[0]["id"]
    set_level(api, house["pantry"], house["sugar"], "lots")
    set_level(api, house["pantry"], house["sugar"], "low")
    [request] = active(api)
    assert request["id"] != first


def test_removing_stock_cancels_its_request(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    assert api("DELETE", f"/locations/{house['pantry']}/stock/{house['sugar']}").status_code == 204
    assert active(api) == []


def test_deleting_the_item_deletes_its_requests(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    assert api("DELETE", f"/items/{house['sugar']}").status_code == 204
    assert active(api) == []


# Claiming


def test_claim_shows_who(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    id = active(api)[0]["id"]
    claimed = api("POST", f"/requests/{id}/claim", headers=BELA).json()
    assert claimed["status"] == "claimed"
    assert claimed["claimed_by_name"] == "Bela Kovacs"
    assert claimed["claimed_at"] is not None
    assert active(api) == [claimed]


def test_second_claim_loses(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    id = active(api)[0]["id"]
    assert api("POST", f"/requests/{id}/claim").status_code == 200
    assert api("POST", f"/requests/{id}/claim", headers=BELA).status_code == 409
    assert active(api)[0]["claimed_by_name"] == "Anna Kovacs"


def test_unclaim_reopens(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim")
    reopened = api("POST", f"/requests/{id}/unclaim").json()
    assert reopened["status"] == "open"
    assert reopened["claimed_by_id"] is None


def test_only_the_claimer_can_unclaim(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim")
    assert api("POST", f"/requests/{id}/unclaim", headers=BELA).status_code == 409


def test_level_change_keeps_the_claim(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "low")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim", headers=BELA)
    set_level(api, house["pantry"], house["sugar"], "out")
    [request] = active(api)
    assert request["claimed_by_name"] == "Bela Kovacs"


# Done and cancelled


def test_done_refills_the_stock(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim")
    done = api("POST", f"/requests/{id}/done", headers=BELA).json()
    assert done["status"] == "done"
    assert active(api) == []
    assert level_of(api, house["pantry"], house["sugar"]) == "plenty"


def test_open_request_can_be_done_without_a_claim(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "low")
    id = active(api)[0]["id"]
    assert api("POST", f"/requests/{id}/done").json()["status"] == "done"


def test_cancel_leaves_the_level(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "low")
    id = active(api)[0]["id"]
    assert api("POST", f"/requests/{id}/cancel").json()["status"] == "cancelled"
    assert active(api) == []
    assert level_of(api, house["pantry"], house["sugar"]) == "low"


@pytest.mark.parametrize("action", ["claim", "unclaim", "done", "cancel"])
def test_closed_requests_dont_change(api, house, action: str) -> None:
    set_level(api, house["pantry"], house["sugar"], "low")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/done")
    assert api("POST", f"/requests/{id}/{action}").status_code == 409


@pytest.mark.parametrize("action", ["claim", "unclaim", "done", "cancel"])
def test_unknown_request_is_404(api, action: str) -> None:
    assert api("POST", f"/requests/999/{action}").status_code == 404


# Chores


def test_chores_belong_to_a_place(api, house) -> None:
    id = add_chore(api, house["wc"])
    assert api("GET", "/chores").json() == [
        {
            "id": id,
            "location_id": house["wc"],
            "name": "Kuka ürítése",
            "icon": None,
            "last_done_at": None,
            "last_done_by_name": None,
            "repeat_days": None,
            "repeat_weekdays": [],
            "next_due_at": None,
            "one_off": False,
        }
    ]


def test_chore_names_are_unique_per_place_ignoring_case(api, house) -> None:
    add_chore(api, house["wc"], "Kuka ürítése")
    clash = api("POST", "/chores", {"location_id": house["wc"], "name": "KUKA ÜRÍTÉSE"})
    assert clash.status_code == 409
    add_chore(api, house["pantry"], "Kuka ürítése")


def test_chore_needs_a_place(api) -> None:
    assert api("POST", "/chores", {"location_id": 999, "name": "Kuka"}).status_code == 404


def test_rename_a_chore_and_set_its_icon(api, house) -> None:
    id = add_chore(api, house["wc"])
    renamed = api("PATCH", f"/chores/{id}", {"name": "Szemetes", "icon": "trash"}).json()
    assert (renamed["name"], renamed["icon"]) == ("Szemetes", "trash")
    assert api("PATCH", f"/chores/{id}", {"icon": None}).json()["icon"] is None


def test_report_a_chore(api, house) -> None:
    chore = add_chore(api, house["wc"])
    response = api("POST", f"/chores/{chore}/requests")
    assert response.status_code == 201
    request = response.json()
    assert request["kind"] == "chore"
    assert request["chore_id"] == chore
    assert request["location_id"] == house["wc"]
    assert request["item_id"] is None
    assert active(api) == [request]


def test_reporting_a_chore_twice_returns_the_first(api, house) -> None:
    chore = add_chore(api, house["wc"])
    first = api("POST", f"/chores/{chore}/requests").json()
    again = api("POST", f"/chores/{chore}/requests", headers=BELA)
    assert again.status_code == 200
    assert again.json() == first


def test_chore_can_be_reported_again_once_done(api, house) -> None:
    chore = add_chore(api, house["wc"])
    first = api("POST", f"/chores/{chore}/requests").json()
    api("POST", f"/requests/{first['id']}/done")
    assert api("POST", f"/chores/{chore}/requests").status_code == 201


def test_report_unknown_chore_is_404(api) -> None:
    assert api("POST", "/chores/999/requests").status_code == 404


def test_deleting_a_chore_deletes_its_requests(api, house) -> None:
    chore = add_chore(api, house["wc"])
    api("POST", f"/chores/{chore}/requests")
    assert api("DELETE", f"/chores/{chore}").status_code == 204
    assert api("GET", "/chores").json() == []
    assert active(api) == []


def test_deleting_a_place_deletes_its_chores_and_requests(api, house) -> None:
    chore = add_chore(api, house["wc"])
    api("POST", f"/chores/{chore}/requests")
    set_level(api, house["wc"], house["paper"], "out")
    assert api("DELETE", f"/locations/{house['wc']}").status_code == 204
    assert api("GET", "/chores").json() == []
    assert active(api) == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/chores"),
        ("POST", "/chores/1/requests"),
        ("GET", "/requests"),
        ("POST", "/requests/1/claim"),
    ],
)
def test_requests_need_identity(api, method: str, path: str) -> None:
    assert api(method, path, headers={}).status_code == 401


def chore_of(api, id: int) -> dict:
    return next(chore for chore in api("GET", "/chores").json() if chore["id"] == id)


def test_new_chore_was_never_done(api, house) -> None:
    chore = chore_of(api, add_chore(api, house["wc"]))
    assert (chore["last_done_at"], chore["last_done_by_name"]) == (None, None)


def test_chore_done_without_a_report(api, house) -> None:
    chore = add_chore(api, house["wc"])
    response = api("POST", f"/chores/{chore}/done", headers=BELA)
    assert response.status_code == 200
    assert response.json()["last_done_by_name"] == "Bela Kovacs"
    assert response.json()["last_done_at"] is not None
    assert active(api) == []
    # It can be reported again later.
    assert api("POST", f"/chores/{chore}/requests").status_code == 201


def test_chore_done_closes_its_report(api, house) -> None:
    chore = add_chore(api, house["wc"])
    api("POST", f"/chores/{chore}/requests")
    api("POST", f"/chores/{chore}/done", headers=BELA)
    assert active(api) == []
    assert chore_of(api, chore)["last_done_by_name"] == "Bela Kovacs"


def test_last_done_is_the_latest(api, house) -> None:
    chore = add_chore(api, house["wc"])
    api("POST", f"/chores/{chore}/done")
    request = api("POST", f"/chores/{chore}/requests").json()
    api("POST", f"/requests/{request['id']}/done", headers=BELA)
    other = add_chore(api, house["pantry"], "Felmosás")
    assert chore_of(api, chore)["last_done_by_name"] == "Bela Kovacs"
    assert chore_of(api, other)["last_done_at"] is None


def test_cancelled_doesnt_count_as_done(api, house) -> None:
    chore = add_chore(api, house["wc"])
    request = api("POST", f"/chores/{chore}/requests").json()
    api("POST", f"/requests/{request['id']}/cancel")
    assert chore_of(api, chore)["last_done_at"] is None


def test_done_unknown_chore_is_404(api) -> None:
    assert api("POST", "/chores/999/done").status_code == 404


# Scheduled chores


@pytest.fixture
def clock(monkeypatch):
    """Sets the server's time; starts on Monday 16 November 2026, 12:00 in Budapest."""
    now = [datetime(2026, 11, 16, 11, tzinfo=UTC)]
    monkeypatch.setattr(requests, "utcnow", lambda: now[0])

    def advance(**delta) -> None:
        now[0] += timedelta(**delta)

    return advance


def schedule(api, chore: int, **fields) -> dict:
    response = api("PATCH", f"/chores/{chore}", fields)
    assert response.status_code == 200, response.text
    return response.json()


def test_weekly_schedule(api, house, clock) -> None:
    chore = schedule(api, add_chore(api, house["wc"]), repeat_weekdays=[3, 1, 1])
    assert chore["repeat_weekdays"] == [1, 3]
    assert chore["repeat_days"] is None
    # Tuesday midnight in Budapest.
    assert chore["next_due_at"] == "2026-11-16T23:00:00Z"


def test_every_n_days_schedule(api, house, clock) -> None:
    chore = schedule(api, add_chore(api, house["wc"]), repeat_days=3)
    assert chore["repeat_days"] == 3
    assert chore["repeat_weekdays"] == []
    assert chore["next_due_at"] == "2026-11-18T23:00:00Z"


def test_one_schedule_replaces_the_other(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    chore = schedule(api, id, repeat_days=7)
    assert (chore["repeat_days"], chore["repeat_weekdays"]) == (7, [])


def test_stop_repeating(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_days=7)
    chore = schedule(api, id, repeat_days=None, repeat_weekdays=None)
    assert (chore["repeat_days"], chore["next_due_at"]) == (None, None)


def test_renaming_keeps_the_schedule(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_days=7)
    assert schedule(api, id, name="Kuka")["repeat_days"] == 7


@pytest.mark.parametrize(
    "fields",
    [
        {"repeat_days": 3, "repeat_weekdays": [1]},
        {"repeat_days": 0},
        {"repeat_weekdays": []},
        {"repeat_weekdays": [7]},
    ],
)
def test_bad_schedules_are_422(api, house, fields: dict) -> None:
    id = add_chore(api, house["wc"])
    assert api("PATCH", f"/chores/{id}", fields).status_code == 422


def test_falling_due_opens_a_request(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    assert active(api) == []
    clock(days=1)
    [request] = active(api)
    assert request["chore_id"] == id
    assert request["status"] == "open"
    assert (request["created_by_id"], request["created_by_name"]) == (None, None)
    assert request["created_at"] == "2026-11-16T23:00:00Z"


def test_due_chore_opens_once(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    clock(days=1)
    first = active(api)
    api("GET", "/chores")
    assert active(api) == first


def test_done_waits_for_the_next_time(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    clock(days=1)
    api("POST", f"/chores/{id}/done")
    assert active(api) == []
    assert chore_of(api, id)["next_due_at"] == "2026-11-23T23:00:00Z"
    clock(days=7)
    assert len(active(api)) == 1


def test_done_early_still_falls_due(api, house, clock) -> None:
    # Doing it on Monday doesn't stand for Tuesday's.
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    api("POST", f"/chores/{id}/done")
    clock(days=1)
    assert len(active(api)) == 1


def test_cancelled_occurrence_is_skipped(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_weekdays=[1])
    clock(days=1)
    api("POST", f"/requests/{active(api)[0]['id']}/cancel")
    assert active(api) == []


def test_every_n_days_counts_from_done(api, house, clock) -> None:
    id = add_chore(api, house["wc"])
    schedule(api, id, repeat_days=3)
    clock(days=3)
    request = active(api)[0]
    clock(days=2)
    api("POST", f"/requests/{request['id']}/done")
    # Done on Saturday the 21st: due again on Tuesday the 24th.
    assert chore_of(api, id)["next_due_at"] == "2026-11-23T23:00:00Z"
    assert active(api) == []


# Chores of the whole house


def add_house_chore(api, name: str = "Porszívózás") -> int:
    response = api("POST", "/chores", {"name": name})
    assert response.status_code == 201, response.text
    assert response.json()["location_id"] is None
    return response.json()["id"]


def test_house_chore_has_no_place(api, house) -> None:
    id = add_house_chore(api)
    assert chore_of(api, id)["location_id"] is None


def test_house_chore_names_are_unique_ignoring_case(api, house) -> None:
    add_house_chore(api, "Porszívózás")
    assert api("POST", "/chores", {"name": "PORSZÍVÓZÁS"}).status_code == 409
    # A place may have one of the same name.
    add_chore(api, house["wc"], "Porszívózás")


def test_report_and_finish_a_house_chore(api, house) -> None:
    id = add_house_chore(api)
    request = api("POST", f"/chores/{id}/requests").json()
    assert (request["location_id"], request["chore_id"]) == (None, id)
    api("POST", f"/requests/{request['id']}/claim", headers=BELA)
    assert api("POST", f"/requests/{request['id']}/done").status_code == 200
    assert chore_of(api, id)["last_done_by_name"] == "Anna Kovacs"


def test_house_chore_can_repeat(api, house, clock) -> None:
    id = add_house_chore(api)
    schedule(api, id, repeat_days=1)
    clock(days=1)
    [request] = active(api)
    assert (request["chore_id"], request["location_id"]) == (id, None)


def test_deleting_places_leaves_house_chores(api, house) -> None:
    id = add_house_chore(api)
    api("DELETE", f"/locations/{house['wc']}")
    assert chore_of(api, id)["name"] == "Porszívózás"


# Items not kept stocked


def no_restock(api, item: int) -> None:
    response = api("PATCH", f"/items/{item}", {"restock": False})
    assert response.status_code == 200 and response.json()["restock"] is False


def test_items_are_restocked_by_default(api, house) -> None:
    assert all(item["restock"] for item in api("GET", "/items").json())


@pytest.mark.parametrize("level", ["low", "out"])
def test_running_out_of_what_isnt_restocked_opens_nothing(api, house, level: str) -> None:
    no_restock(api, house["sugar"])
    set_level(api, house["pantry"], house["sugar"], level)
    assert active(api) == []
    assert level_of(api, house["pantry"], house["sugar"]) == level


def test_turning_restock_off_cancels_its_requests(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "out")
    set_level(api, house["pantry"], house["paper"], "out")
    no_restock(api, house["sugar"])
    assert [r["item_id"] for r in active(api)] == [house["paper"]]


def test_turning_restock_on_lists_what_is_short(api, house) -> None:
    no_restock(api, house["sugar"])
    set_level(api, house["pantry"], house["sugar"], "low")
    set_level(api, house["wc"], house["sugar"], "plenty")
    api("PATCH", f"/items/{house['sugar']}", {"restock": True})
    assert [(r["item_id"], r["location_id"]) for r in active(api)] == [
        (house["sugar"], house["pantry"])
    ]


def test_put_on_the_list_by_hand(api, house) -> None:
    no_restock(api, house["sugar"])
    set_level(api, house["pantry"], house["sugar"], "plenty")
    path = f"/locations/{house['pantry']}/stock/{house['sugar']}/request"
    response = api("POST", path)
    assert response.status_code == 201
    assert response.json()["item_id"] == house["sugar"]
    again = api("POST", path, headers=BELA)
    assert (again.status_code, again.json()["id"]) == (200, response.json()["id"])
    # Bought: done, and the level says so.
    api("POST", f"/requests/{response.json()['id']}/done")
    assert active(api) == []
    assert level_of(api, house["pantry"], house["sugar"]) == "plenty"


def test_put_on_the_list_needs_the_item_kept_there(api, house) -> None:
    path = f"/locations/{house['pantry']}/stock/{house['sugar']}/request"
    assert api("POST", path).status_code == 404


# One-off to-dos


def add_one_off(api, name: str = "Szerelő hívása", location: int | None = None) -> dict:
    response = api("POST", "/chores", {"name": name, "location_id": location, "one_off": True})
    assert response.status_code == 201, response.text
    return response.json()


def test_one_off_is_reported_at_once(api, house) -> None:
    chore = add_one_off(api)
    assert chore["one_off"] is True
    [request] = active(api)
    assert (request["chore_id"], request["status"], request["location_id"]) == (
        chore["id"],
        "open",
        None,
    )
    assert request["created_by_name"] == "Anna Kovacs"


@pytest.mark.parametrize("action", ["done", "cancel"])
def test_one_off_goes_when_closed(api, house, action: str) -> None:
    chore = add_one_off(api, location=house["wc"])
    request = active(api)[0]
    api("POST", f"/requests/{request['id']}/claim", headers=BELA)
    response = api("POST", f"/requests/{request['id']}/{action}", headers=BELA)
    assert response.status_code == 200
    assert active(api) == []
    assert all(c["id"] != chore["id"] for c in api("GET", "/chores").json())


def test_one_off_done_on_the_spot_goes(api, house) -> None:
    chore = add_one_off(api)
    assert api("POST", f"/chores/{chore['id']}/done").status_code == 200
    assert api("GET", "/chores").json() == []
    assert active(api) == []


def test_one_offs_may_share_a_name(api, house) -> None:
    add_one_off(api, "Bevásárlás")
    add_one_off(api, "Bevásárlás")
    assert len(active(api)) == 2


def test_one_off_tells_the_other(api, house, pushes) -> None:
    api(
        "PUT",
        "/push/subscriptions",
        {"endpoint": "https://p/b", "keys": {"p256dh": "k", "auth": "a"}},
        BELA,
    )
    add_one_off(api, "Szerelő hívása")
    [(to, message)] = pushes
    assert (to, message["event"], message["kind"], message["name"]) == (
        "https://p/b",
        "reported",
        "chore",
        "Szerelő hívása",
    )


def test_lasting_chores_stay_when_done(api, house) -> None:
    id = add_chore(api, house["wc"])
    request = api("POST", f"/chores/{id}/requests").json()
    api("POST", f"/requests/{request['id']}/done")
    assert chore_of(api, id)["one_off"] is False


# Written on the shopping list by hand


def test_writing_on_the_list(api, house) -> None:
    response = api("POST", "/requests", {"name": "  Elem  "})
    assert response.status_code == 201, response.text
    request = response.json()
    assert request["kind"] == "buy"
    assert request["name"] == "Elem"
    assert request["item_id"] is None
    assert request["location_id"] is None
    assert request["status"] == "open"
    assert request["created_by_name"] == "Anna Kovacs"
    # The same thing twice is two lines: nothing to tell them apart by.
    assert api("POST", "/requests", {"name": "Elem"}).status_code == 201
    assert [r["name"] for r in active(api)] == ["Elem", "Elem"]


def test_a_written_line_needs_a_name(api) -> None:
    assert api("POST", "/requests", {"name": "   "}).status_code == 422


def test_a_written_line_is_claimed_and_done_like_any(api, house) -> None:
    set_level(api, house["pantry"], house["sugar"], "plenty")
    request = api("POST", "/requests", {"name": "Elem"}).json()
    path = f"/requests/{request['id']}"
    assert api("POST", f"{path}/claim", headers=BELA).json()["claimed_by_name"] == "Bela Kovacs"
    assert api("POST", f"{path}/done", headers=BELA).json()["status"] == "done"
    assert active(api) == []
    # No stock behind it.
    assert level_of(api, house["pantry"], house["sugar"]) == "plenty"
    entries = api("GET", "/activity").json()
    assert [(e["action"], e["kind"], e["name"], e["item_id"]) for e in entries[:3]] == [
        ("done", "buy", "Elem", None),
        ("claimed", "buy", "Elem", None),
        ("listed", "buy", "Elem", None),
    ]


def keep(api, request_id: int, json: dict, headers=ANNA):
    return api("POST", f"/requests/{request_id}/keep", json, headers)


def test_keeping_a_written_line_makes_an_item_in_the_place(api, house) -> None:
    request = api("POST", "/requests", {"name": "Elem"}).json()
    response = keep(
        api, request["id"], {"location_id": house["pantry"], "name": "Elem", "variant": "AA"}, BELA
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "done"
    [item] = [i for i in api("GET", "/items").json() if i["name"] == "Elem"]
    assert item["variant"] == "AA"
    assert item["restock"] is False
    assert level_of(api, house["pantry"], item["id"]) == "plenty"
    assert active(api) == []
    [entry] = api("GET", "/activity?limit=1").json()
    assert (entry["user_name"], entry["action"], entry["name"]) == ("Bela Kovacs", "done", "Elem")


def test_keeping_finds_the_item_by_name_and_keeps_its_settings(api, house) -> None:
    request = api("POST", "/requests", {"name": "cukor"}).json()
    response = keep(api, request["id"], {"location_id": house["wc"], "name": "CUKOR"})
    assert response.status_code == 200, response.text
    assert [i["name"] for i in api("GET", "/items").json()].count("Cukor") == 1
    assert level_of(api, house["wc"], house["sugar"]) == "plenty"
    # Restocked, as it was.
    assert next(i for i in api("GET", "/items").json() if i["id"] == house["sugar"])["restock"]


def test_keeping_is_all_or_nothing(api, house) -> None:
    request = api("POST", "/requests", {"name": "Elem"}).json()
    api("POST", f"/requests/{request['id']}/cancel")
    response = keep(api, request["id"], {"location_id": house["pantry"], "name": "Elem"})
    assert response.status_code == 409
    assert [i for i in api("GET", "/items").json() if i["name"] == "Elem"] == []
    # Only a written line can be kept this way.
    set_level(api, house["pantry"], house["sugar"], "low")
    [bought] = active(api)
    assert keep(api, bought["id"], {"location_id": house["pantry"], "name": "X"}).status_code == 409
    assert keep(api, 999, {"location_id": house["pantry"], "name": "X"}).status_code == 404
    other = api("POST", "/requests", {"name": "Elem"}).json()
    assert keep(api, other["id"], {"location_id": 999, "name": "Elem"}).status_code == 404
