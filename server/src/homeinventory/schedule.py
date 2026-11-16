"""When a scheduled chore falls due.

A chore repeats either on chosen weekdays ("kuka: kedd") or every so many days after it
was last done ("ágynemű: 14 naponta"). Either way it falls due at the household's local
midnight, and falling due opens a request for it, as if someone had reported it.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class History:
    """What has happened to a chore's requests so far."""

    # The latest request's creation, whatever became of it.
    last_created: datetime | None = None
    # When a request was last done or cancelled (cancelling skips an occurrence).
    last_closed: datetime | None = None


def _midnight(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time(), tz)


def due_at(
    *,
    repeat_days: int | None,
    weekdays: frozenset[int],
    scheduled_at: datetime | None,
    history: History,
    now: datetime,
    tz: ZoneInfo,
) -> datetime | None:
    """When the chore falls (or fell) due next; None if it doesn't repeat.

    A time not after `now` means it's due and nothing has dealt with it yet. Weekdays
    count from Monday = 0.
    """
    if scheduled_at is None:
        return None
    if repeat_days:
        base = max(t for t in (scheduled_at, history.last_closed) if t)
        return _midnight(base.astimezone(tz).date() + timedelta(days=repeat_days), tz)
    if not weekdays:
        return None
    today = now.astimezone(tz).date()
    latest = next(
        today - timedelta(days=back)
        for back in range(7)
        if (today - timedelta(days=back)).weekday() in weekdays
    )
    if latest >= scheduled_at.astimezone(tz).date():
        due = _midnight(latest, tz)
        handled = any(t and t >= due for t in (history.last_created, history.last_closed))
        if not handled:
            return due
    return next(
        _midnight(today + timedelta(days=ahead), tz)
        for ahead in range(1, 8)
        if (today + timedelta(days=ahead)).weekday() in weekdays
    )
