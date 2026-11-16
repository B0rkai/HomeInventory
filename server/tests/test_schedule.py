from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from homeinventory.schedule import History, due_at

TZ = ZoneInfo("Europe/Budapest")
TUESDAY = 1
NOTHING_YET = History()


def local(day: int, hour: int = 12) -> datetime:
    # November 2026: the 16th is a Monday.
    return datetime(2026, 11, day, hour, tzinfo=TZ)


def weekly(
    now: datetime, history: History = NOTHING_YET, scheduled_at=None, days=frozenset({TUESDAY})
):
    return due_at(
        repeat_days=None,
        weekdays=frozenset(days),
        scheduled_at=scheduled_at or local(12),
        history=history,
        now=now,
        tz=TZ,
    )


def every(days: int, now: datetime, history: History = NOTHING_YET, scheduled_at=None):
    return due_at(
        repeat_days=days,
        weekdays=frozenset(),
        scheduled_at=scheduled_at or local(12),
        history=history,
        now=now,
        tz=TZ,
    )


def test_no_schedule_is_never_due() -> None:
    assert (
        due_at(
            repeat_days=None,
            weekdays=frozenset(),
            scheduled_at=None,
            history=History(),
            now=local(16),
            tz=TZ,
        )
        is None
    )


def test_weekly_is_due_from_local_midnight() -> None:
    assert weekly(local(17, 0)) == local(17, 0)
    # Before then, the coming Tuesday.
    assert weekly(local(16, 23)) == local(17, 0)


def test_weekly_stays_due_until_dealt_with() -> None:
    assert weekly(local(19)) == local(17, 0)


def test_weekly_done_that_day_waits_for_next_week() -> None:
    assert weekly(local(17, 20), History(last_created=local(17, 8))) == local(24, 0)


def test_weekly_done_the_day_before_still_falls_due() -> None:
    assert weekly(local(17, 1), History(last_closed=local(16, 20))) == local(17, 0)


def test_weekly_ignores_days_before_it_was_scheduled() -> None:
    assert weekly(local(19), scheduled_at=local(18)) == local(24, 0)


def test_weekly_several_days() -> None:
    assert weekly(
        local(18), History(last_created=local(17, 9)), days=frozenset({TUESDAY, 4})
    ) == local(20, 0)


def test_every_n_days_counts_from_when_it_was_scheduled() -> None:
    assert every(3, local(13)) == local(15, 0)


def test_every_n_days_counts_from_last_closed() -> None:
    assert every(7, local(20), History(last_closed=local(16, 23))) == local(23, 0)


def test_midnight_is_local_across_dst() -> None:
    # Summer time ends on 25 October 2026.
    due = every(2, local(16), scheduled_at=datetime(2026, 10, 24, 22, tzinfo=TZ))
    assert due == datetime(2026, 10, 26, tzinfo=TZ)
    assert due.astimezone(UTC).hour == 23


@pytest.mark.parametrize("hour", [0, 23])
def test_utc_inputs_work(hour: int) -> None:
    now = local(17, hour).astimezone(UTC)
    assert weekly(now) == local(17, 0)
