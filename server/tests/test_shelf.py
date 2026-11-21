"""Shelf life: fresh food planned for a cooking is worth buying only so many days before."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from homeinventory.icons import guess_icon
from homeinventory.models import Request
from homeinventory.requests import check_windows

BELAS_PHONE = "https://push.example.com/bela"
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}
BUDAPEST = ZoneInfo("Europe/Budapest")


def day(offset: int) -> date:
    return date.today() + timedelta(days=offset)


@pytest.mark.parametrize(
    ("name", "icon"),
    [
        # Up to 3 letters a whole word: "só" isn't "sör".
        ("Só", "salt"),
        ("Sör", "beer"),
        # 4 letters start a word; longer ones match anywhere.
        ("Kockacukor", "sugar"),
        ("Csirkemell", "meat"),
        ("WC-papír", "toilet-paper"),
        # An empty icon stops a shorter keyword further down: "borsó" isn't "bors".
        ("Borsó", ""),
        ("Bors", "pepper"),
        ("Valami egészen más", ""),
    ],
)
def test_the_icon_guess_is_the_clients(name: str, icon: str) -> None:
    assert guess_icon(name) == icon


@pytest.fixture
def food(api) -> dict[str, int]:
    """Élelmiszer, with Hús, hal (1 day, by the meat icon) and Fagyasztott (any time)."""
    top = api("POST", "/groups", {"name": "Élelmiszer", "hue": "food"}).json()["id"]
    meat = api(
        "POST",
        "/groups",
        {"name": "Hús, hal", "parent_id": top, "icons": ["meat"], "keeps_days": 1},
    ).json()["id"]
    frozen = api("POST", "/groups", {"name": "Fagyasztott", "parent_id": top}).json()["id"]
    return {"top": top, "meat": meat, "frozen": frozen}


def plan_chicken(api, offset: int) -> dict:
    """Paprikás csirke in `offset` days; the chicken is kept nowhere."""
    recipe = api(
        "POST", "/recipes", {"name": "Paprikás csirke", "ingredients": [{"name": "Csirkemell"}]}
    ).json()
    response = api("POST", "/cookings", {"recipe_id": recipe["id"], "day": str(day(offset))})
    assert response.status_code == 201, response.text
    return recipe


def chicken_line(api) -> dict:
    [line] = [r for r in api("GET", "/requests").json() if r["item_id"] is not None]
    return line


def chicken(api) -> dict:
    return next(i for i in api("GET", "/items").json() if i["name"] == "Csirkemell")


def test_fresh_food_is_bought_no_earlier_than_it_keeps(api, food) -> None:
    plan_chicken(api, 5)
    # Its icon puts it in Hús, hal: one day before.
    assert chicken_line(api)["buy_from"] == str(day(4))


def test_an_items_own_shelf_life_wins(api, food) -> None:
    plan_chicken(api, 5)
    item = chicken(api)
    api("PATCH", f"/items/{item['id']}", {"keeps_days": 3})
    assert chicken_line(api)["buy_from"] == str(day(2))
    # Any time (frozen): no window.
    response = api("PATCH", f"/items/{item['id']}", {"keeps_any_time": True})
    assert (response.json()["keeps_days"], response.json()["keeps_any_time"]) == (None, True)
    assert chicken_line(api)["buy_from"] is None
    # Back to its group's.
    api("PATCH", f"/items/{item['id']}", {"keeps_any_time": False})
    assert chicken_line(api)["buy_from"] == str(day(4))


def test_its_group_decides_when_none_of_its_own(api, food) -> None:
    plan_chicken(api, 5)
    item = chicken(api)
    api("PATCH", f"/items/{item['id']}", {"group_id": food["frozen"]})
    assert chicken_line(api)["buy_from"] is None
    api("PATCH", f"/items/{item['id']}", {"group_id": None})
    # The group's shelf life changes: the line follows.
    api("PATCH", f"/groups/{food['meat']}", {"keeps_days": 2})
    assert chicken_line(api)["buy_from"] == str(day(3))
    api("PATCH", f"/groups/{food['meat']}", {"keeps_days": None})
    assert chicken_line(api)["buy_from"] is None


def test_a_shortage_is_bought_now(api, house, food) -> None:
    """Chicken kept in the pantry, run out: on the list now, whatever a cooking says."""
    item = api("POST", "/items", {"name": "Csirkemell"}).json()["id"]
    api("PUT", f"/locations/{house['pantry']}/stock/{item}", {"level": "out"})
    plan_chicken(api, 5)
    line = chicken_line(api)
    assert (line["for_cooking"], line["buy_from"]) == (False, None)


def test_moving_the_cooking_moves_the_window(api, food) -> None:
    plan_chicken(api, 5)
    [cooking] = api("GET", "/cookings").json()
    api("PATCH", f"/cookings/{cooking['id']}", {"day": str(day(8))})
    assert chicken_line(api)["buy_from"] == str(day(7))


def test_the_morning_a_window_opens_everyone_is_told(app, api, food, pushes) -> None:
    api(
        "PUT",
        "/push/subscriptions",
        {"endpoint": BELAS_PHONE, "keys": {"p256dh": "k", "auth": "a"}},
        BELA,
    )
    plan_chicken(api, 5)
    pushes.clear()
    opens = day(4)
    with app.state.sessionmaker() as session:
        [request] = session.query(Request).filter(Request.item_id.is_not(None)).all()
        request.created_at = datetime(2020, 1, 1, tzinfo=UTC)
        session.commit()

        def at(when: date, hour: int) -> datetime:
            return datetime(when.year, when.month, when.day, hour, tzinfo=BUDAPEST)

        # Not before its day, nor before the morning.
        check_windows(session, app.state.notifier, at(day(3), 9), BUDAPEST)
        check_windows(session, app.state.notifier, at(opens, 6), BUDAPEST)
        assert pushes == []
        check_windows(session, app.state.notifier, at(opens, 7), BUDAPEST)
        check_windows(session, app.state.notifier, at(opens, 9), BUDAPEST)
    [(to, message)] = pushes
    assert (to, message["event"], message["name"], message["day"]) == (
        BELAS_PHONE,
        "window",
        "Csirkemell",
        str(day(5)),
    )


def test_a_line_open_on_its_first_day_isnt_told(app, api, food, pushes) -> None:
    api(
        "PUT",
        "/push/subscriptions",
        {"endpoint": BELAS_PHONE, "keys": {"p256dh": "k", "auth": "a"}},
        BELA,
    )
    plan_chicken(api, 1)
    pushes.clear()
    with app.state.sessionmaker() as session:
        noon = datetime.combine(day(0), datetime.min.time(), BUDAPEST) + timedelta(hours=12)
        check_windows(session, app.state.notifier, noon, BUDAPEST)
    assert pushes == []
