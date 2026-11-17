import asyncio
import base64
import threading
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from pywebpush import WebPushException
from requests import Response

from homeinventory import requests
from homeinventory.live import LiveUpdates

ANNA = {"Tailscale-User-Login": "anna@example.com", "Tailscale-User-Name": "Anna Kovacs"}
BELA = {"Tailscale-User-Login": "bela@example.com", "Tailscale-User-Name": "Bela Kovacs"}
ANNAS_PHONE = "https://push.example.com/anna"
BELAS_PHONE = "https://push.example.com/bela"


def subscribe(api, endpoint: str, headers) -> None:
    body = {"endpoint": endpoint, "keys": {"p256dh": "key", "auth": "secret"}}
    assert api("PUT", "/push/subscriptions", body, headers).status_code == 204


@pytest.fixture
def phones(api) -> None:
    subscribe(api, ANNAS_PHONE, ANNA)
    subscribe(api, BELAS_PHONE, BELA)


@pytest.fixture
def house(api) -> dict[str, int]:
    def post(path: str, json: dict) -> int:
        response = api("POST", path, json)
        assert response.status_code == 201, response.text
        return response.json()["id"]

    return {
        "pantry": post("/locations", {"name": "Spájz"}),
        "beans": post("/items", {"name": "Konzerv", "variant": "bab"}),
        "chore": post("/chores", {"name": "Porszívózás"}),
    }


def set_level(api, house, level: str, headers=ANNA) -> None:
    path = f"/locations/{house['pantry']}/stock/{house['beans']}"
    assert api("PUT", path, {"level": level}, headers).status_code == 200


def active(api) -> list[dict]:
    return api("GET", "/requests").json()


# Keys and subscriptions


def test_public_key_is_a_p256_point_and_stays(api, settings) -> None:
    key = api("GET", "/push/key").json()["public_key"]
    raw = base64.urlsafe_b64decode(key + "=" * (-len(key) % 4))
    assert len(raw) == 65 and raw[0] == 4
    assert api("GET", "/push/key").json()["public_key"] == key
    assert settings.vapid_key_path.stat().st_mode & 0o777 == 0o600


def test_key_survives_a_restart(api, settings, app: FastAPI) -> None:
    key = api("GET", "/push/key").json()["public_key"]
    from homeinventory.notify import Notifier

    again = Notifier(settings.vapid_key_path, settings.vapid_subject, app.state.sessionmaker)
    assert again.public_key == key


def test_subscription_needs_https(api) -> None:
    body = {"endpoint": "http://push.example.com/x", "keys": {"p256dh": "k", "auth": "a"}}
    assert api("PUT", "/push/subscriptions", body).status_code == 422


def test_unsubscribe(api, house, phones, pushes) -> None:
    response = api("DELETE", f"/push/subscriptions?endpoint={BELAS_PHONE}")
    assert response.status_code == 204
    set_level(api, house, "out")
    assert pushes == []


def test_a_device_follows_who_signs_in(api, house, pushes) -> None:
    subscribe(api, BELAS_PHONE, BELA)
    # The same phone, now signed in as Anna: her own changes don't reach it.
    subscribe(api, BELAS_PHONE, ANNA)
    set_level(api, house, "out")
    assert pushes == []


# What gets sent


def test_running_out_tells_the_other(api, house, phones, pushes) -> None:
    set_level(api, house, "out")
    assert pushes == [
        (
            BELAS_PHONE,
            {
                "event": "reported",
                "kind": "buy",
                "name": "Konzerv",
                "variant": "bab",
                "place": "Spájz",
                "level": "out",
                "actor": "Anna Kovacs",
                "tag": f"buy-{house['beans']}",
                "url": "/#/todo",
            },
        )
    ]


def test_reporting_again_sends_nothing(api, house, phones, pushes) -> None:
    set_level(api, house, "low")
    set_level(api, house, "out")
    assert len(pushes) == 1


def test_claim_and_done_tell_the_reporter(api, house, phones, pushes) -> None:
    set_level(api, house, "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim", headers=BELA)
    api("POST", f"/requests/{id}/done", headers=BELA)
    assert [(to, m["event"], m["actor"]) for to, m in pushes[1:]] == [
        (ANNAS_PHONE, "claimed", "Bela Kovacs"),
        (ANNAS_PHONE, "done", "Bela Kovacs"),
    ]


def test_refilling_tells_the_other(api, house, phones, pushes) -> None:
    set_level(api, house, "out")
    set_level(api, house, "plenty", BELA)
    assert [(to, m["event"]) for to, m in pushes[1:]] == [(ANNAS_PHONE, "refilled")]


def test_cancel_and_unclaim_send_nothing(api, house, phones, pushes) -> None:
    set_level(api, house, "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim", headers=BELA)
    api("POST", f"/requests/{id}/unclaim", headers=BELA)
    api("POST", f"/requests/{id}/cancel", headers=BELA)
    assert [m["event"] for _, m in pushes] == ["reported", "claimed"]


def test_reporting_a_house_chore(api, house, phones, pushes) -> None:
    api("POST", f"/chores/{house['chore']}/requests", headers=BELA)
    [(to, message)] = pushes
    assert to == ANNAS_PHONE
    assert (message["event"], message["kind"], message["place"]) == ("reported", "chore", None)
    assert message["tag"] == f"chore-{house['chore']}"


def test_chore_done_on_the_spot_sends_nothing(api, house, phones, pushes) -> None:
    api("POST", f"/chores/{house['chore']}/done")
    assert pushes == []


def test_chore_done_after_a_report_tells_the_reporter(api, house, phones, pushes) -> None:
    api("POST", f"/chores/{house['chore']}/requests", headers=BELA)
    api("POST", f"/chores/{house['chore']}/done")
    assert [(to, m["event"]) for to, m in pushes[1:]] == [(BELAS_PHONE, "done")]


def test_due_chore_tells_everyone(api, house, phones, pushes, monkeypatch) -> None:
    now = datetime(2026, 11, 16, 11, tzinfo=UTC)
    monkeypatch.setattr(requests, "utcnow", lambda: now)
    api("PATCH", f"/chores/{house['chore']}", {"repeat_days": 1})
    monkeypatch.setattr(requests, "utcnow", lambda: now + timedelta(days=1))
    active(api)
    active(api)
    assert sorted((to, m["event"], m["actor"]) for to, m in pushes) == [
        (ANNAS_PHONE, "due", None),
        (BELAS_PHONE, "due", None),
    ]


def test_expired_subscription_is_dropped(api, app, house, phones, pushes) -> None:
    def gone(subscription, data, vapid, claims) -> None:
        response = Response()
        response.status_code = 410
        raise WebPushException("Gone", response=response)

    app.state.notifier.sender = gone
    set_level(api, house, "out")
    app.state.notifier.sender = lambda subscription, *_: pushes.append(subscription["endpoint"])
    api("POST", f"/requests/{active(api)[0]['id']}/claim", headers=BELA)
    # Bela's phone is gone; Anna's still gets the claim.
    assert pushes == [ANNAS_PHONE]


def test_a_failing_push_doesnt_fail_the_change(api, app, house, phones) -> None:
    def broken(*_) -> None:
        raise ConnectionError("push service down")

    app.state.notifier.sender = broken
    set_level(api, house, "out")
    assert len(active(api)) == 1


# Live updates


@pytest.fixture
def published(app: FastAPI, monkeypatch) -> list:
    sent: list = []
    monkeypatch.setattr(app.state.live, "publish", sent.append)
    return sent


def test_changes_are_announced_with_who_made_them(api, house, published) -> None:
    published.clear()
    set_level(api, house, "out", BELA)
    bela = api("GET", "/users/me", headers=BELA).json()["id"]
    assert published == [bela]


def test_reads_and_failed_changes_announce_nothing(api, house, published) -> None:
    published.clear()
    api("GET", "/stock")
    api("POST", "/locations", {"name": "Spájz"})  # 409
    api("POST", "/requests/999/claim")  # 404
    assert published == []


def test_due_chore_is_announced(api, house, published, monkeypatch) -> None:
    now = datetime(2026, 11, 16, 11, tzinfo=UTC)
    monkeypatch.setattr(requests, "utcnow", lambda: now)
    api("PATCH", f"/chores/{house['chore']}", {"repeat_days": 1})
    published.clear()
    monkeypatch.setattr(requests, "utcnow", lambda: now + timedelta(days=1))
    active(api)
    assert published == [None]


def test_events_need_identity(api) -> None:
    assert api("GET", "/events", headers={}).status_code == 401


def test_live_updates_reach_listeners_from_other_threads() -> None:
    async def scenario() -> list[str]:
        live = LiveUpdates()
        live.attach(asyncio.get_running_loop())

        async def connected() -> bool:
            return False

        stream = live.stream(connected)
        received = [await anext(stream)]
        threading.Thread(target=live.publish, args=(7,)).start()
        received.append(await anext(stream))
        await stream.aclose()
        assert live.listeners == 0
        return received

    assert asyncio.run(scenario()) == ["retry: 3000\n\n", 'data: {"by": 7}\n\n']


def test_done_with_lots_elsewhere_is_fetched(api, house, phones, pushes) -> None:
    basement = api("POST", "/locations", {"name": "Pince"}).json()["id"]
    api("PUT", f"/locations/{basement}/stock/{house['beans']}", {"level": "lots"})
    set_level(api, house, "out")
    api("POST", f"/requests/{active(api)[0]['id']}/done", headers=BELA)
    assert [(to, m["event"]) for to, m in pushes[1:]] == [(ANNAS_PHONE, "fetched")]
    # The basement keeps its lots; the pantry is filled.
    levels = {r["location_id"]: r["level"] for r in api("GET", "/stock").json()}
    assert levels == {basement: "lots", house["pantry"]: "plenty"}


# Reminders


@pytest.fixture
def claimed_by_bela(api, house) -> int:
    set_level(api, house, "out")
    id = active(api)[0]["id"]
    api("POST", f"/requests/{id}/claim", headers=BELA)
    return id


def test_remind_whoever_claimed_it(api, claimed_by_bela, phones, pushes) -> None:
    pushes.clear()
    response = api("POST", f"/requests/{claimed_by_bela}/remind")
    assert response.status_code == 200
    assert response.json()["reminded_by_name"] == "Anna Kovacs"
    assert response.json()["reminded_at"] is not None
    [(to, message)] = pushes
    assert (to, message["event"], message["actor"]) == (BELAS_PHONE, "reminder", "Anna Kovacs")


def test_remind_once_a_day(api, claimed_by_bela, phones, pushes, monkeypatch) -> None:
    now = datetime(2026, 11, 17, 21, tzinfo=UTC)  # 22:00 in Budapest
    monkeypatch.setattr(requests, "utcnow", lambda: now)
    assert api("POST", f"/requests/{claimed_by_bela}/remind").status_code == 200
    monkeypatch.setattr(requests, "utcnow", lambda: now + timedelta(hours=1, minutes=30))
    # 23:30, the same day.
    assert api("POST", f"/requests/{claimed_by_bela}/remind").status_code == 409
    monkeypatch.setattr(requests, "utcnow", lambda: now + timedelta(hours=2, minutes=30))
    # Past midnight: a new day.
    assert api("POST", f"/requests/{claimed_by_bela}/remind").status_code == 200


def test_no_reminding_oneself(api, claimed_by_bela) -> None:
    assert api("POST", f"/requests/{claimed_by_bela}/remind", headers=BELA).status_code == 409


def test_no_reminding_an_open_request(api, house) -> None:
    set_level(api, house, "out")
    assert api("POST", f"/requests/{active(api)[0]['id']}/remind").status_code == 409


def test_remind_unknown_request_is_404(api) -> None:
    assert api("POST", "/requests/999/remind").status_code == 404


def test_a_new_claim_starts_without_a_reminder(api, claimed_by_bela) -> None:
    api("POST", f"/requests/{claimed_by_bela}/remind")
    api("POST", f"/requests/{claimed_by_bela}/unclaim", headers=BELA)
    claimed = api("POST", f"/requests/{claimed_by_bela}/claim", headers=BELA).json()
    assert (claimed["reminded_at"], claimed["reminded_by_name"]) == (None, None)
    assert api("POST", f"/requests/{claimed_by_bela}/remind").status_code == 200


def test_writing_on_the_list_tells_the_other(api, phones, pushes) -> None:
    request = api("POST", "/requests", {"name": "Elem"}).json()
    api("POST", f"/requests/{request['id']}/done", headers=BELA)
    assert pushes == [
        (
            BELAS_PHONE,
            {
                "event": "reported",
                "kind": "buy",
                "name": "Elem",
                "variant": None,
                "place": None,
                "level": None,
                "actor": "Anna Kovacs",
                "tag": f"list-{request['id']}",
                "url": "/#/todo",
            },
        ),
        (ANNAS_PHONE, pushes[1][1] | {"event": "done", "actor": "Bela Kovacs"}),
    ]
