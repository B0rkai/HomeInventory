"""Chores, and requests: something to buy or do, from open through claimed to done.

Buy requests come from stock levels (see `places.set_stock`); chore requests are
reported by hand, or open by themselves when a scheduled chore falls due (checked every
minute and whenever chores or requests are listed, see `schedule.py`). Every state change
is one conditional UPDATE, so when both users tap at once exactly one wins and the other
gets 409. Reporting, claiming and finishing tell the other user (`notify.py`).
"""

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Response, status
from fastapi import Request as HTTPRequest
from sqlalchemy import and_, case, func, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.activity import record, record_request
from homeinventory.common import (
    NO_CONTENT,
    announce_changes,
    conflict,
    get_live,
    get_notifier,
    get_or_404,
)
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.live import LiveUpdates
from homeinventory.models import (
    ACTIVE,
    ACTIVE_WHERE,
    Action,
    Chore,
    Level,
    Location,
    Request,
    RequestKind,
    RequestStatus,
    Stock,
    User,
    UTCDateTime,
    utcnow,
)
from homeinventory.notify import Notifier, message_for
from homeinventory.schedule import History, due_at
from homeinventory.schemas import ChoreCreate, ChoreOut, ChoreUpdate, RequestOut

router = APIRouter(dependencies=[Depends(current_user), Depends(announce_changes)])

CLOSED = (RequestStatus.DONE, RequestStatus.CANCELLED)


def household_timezone(request: HTTPRequest) -> ZoneInfo:
    return ZoneInfo(request.app.state.settings.timezone)


# Buy requests, driven by stock levels


def open_buy_request(session: Session, item_id: int, location_id: int, user: User) -> bool:
    """Opens a request to buy an item for a location, unless one is already open or claimed.
    Whether it opened one."""
    inserted = session.execute(
        insert(Request)
        .values(
            kind=RequestKind.BUY,
            item_id=item_id,
            location_id=location_id,
            status=RequestStatus.OPEN,
            created_by_id=user.id,
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(
            index_elements=[Request.item_id, Request.location_id], index_where=ACTIVE_WHERE
        )
    )
    return bool(inserted.rowcount)


def close_buy_requests(
    session: Session, item_id: int, location_id: int, user: User, closed: RequestStatus
) -> list[int]:
    """Marks the active request to buy an item for a location done or cancelled; the ids."""
    result = session.execute(
        update(Request)
        .where(
            Request.kind == RequestKind.BUY,
            Request.item_id == item_id,
            Request.location_id == location_id,
            Request.status.in_(ACTIVE),
        )
        .values(status=closed, closed_by_id=user.id, closed_at=utcnow())
        .returning(Request.id)
    )
    return list(result.scalars())


# Chores


def _check_chore_name(
    session: Session, location_id: int | None, name: str, own_id: int | None = None
) -> None:
    folded = name.casefold()
    if any(
        chore.name.casefold() == folded and chore.id != own_id
        for chore in session.scalars(select(Chore).where(Chore.location_id == location_id))
    ):
        raise conflict("This location (or the house) already has a chore with this name")


def _last_done(session: Session, chore_ids: list[int]) -> dict[int, Request]:
    """Each chore's latest done request, by chore id."""
    latest = (
        select(Request.chore_id, func.max(Request.closed_at).label("closed_at"))
        .where(Request.chore_id.in_(chore_ids), Request.status == RequestStatus.DONE)
        .group_by(Request.chore_id)
        .subquery()
    )
    requests = session.scalars(
        select(Request).join(
            latest,
            and_(Request.chore_id == latest.c.chore_id, Request.closed_at == latest.c.closed_at),
        )
    )
    return {request.chore_id: request for request in requests if request.chore_id}


def _histories(session: Session, chore_ids: list[int]) -> dict[int, tuple[History, bool]]:
    """Each chore's request history, and whether it has an open or claimed request."""
    rows = session.execute(
        select(
            Request.chore_id,
            func.max(Request.created_at),
            func.max(case((Request.status.in_(CLOSED), Request.closed_at))),
            func.max(case((Request.status.in_(ACTIVE), 1), else_=0)),
        )
        .where(Request.chore_id.in_(chore_ids))
        .group_by(Request.chore_id)
    )
    return {
        chore_id: (History(last_created=_utc(created), last_closed=_utc(closed)), bool(active))
        for chore_id, created, closed, active in rows
    }


def _utc(value: datetime | str | None) -> datetime | None:
    """An aggregate's time: SQLite hands it back untyped, as naive UTC text."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return UTCDateTime().process_result_value(value, None)


def _due_at(chore: Chore, history: History, now: datetime, tz: ZoneInfo) -> datetime | None:
    due = due_at(
        repeat_days=chore.repeat_days,
        weekdays=chore.weekdays,
        scheduled_at=chore.scheduled_at,
        history=history,
        now=now,
        tz=tz,
    )
    # The API speaks UTC; the client shows local time.
    return due and due.astimezone(UTC)


def check_due_chores(
    session: Session, notifier: Notifier, live: LiveUpdates, now: datetime, tz: ZoneInfo
) -> None:
    """Opens a request for every scheduled chore that has fallen due since it was dealt
    with, and tells everyone."""
    opened = []
    chores = list(session.scalars(select(Chore).where(Chore.scheduled_at.is_not(None))))
    histories = _histories(session, [chore.id for chore in chores])
    for chore in chores:
        history, active = histories.get(chore.id, (History(), False))
        due = _due_at(chore, history, now, tz)
        if active or due is None or due > now:
            continue
        inserted = session.execute(
            insert(Request)
            .values(
                kind=RequestKind.CHORE,
                chore_id=chore.id,
                location_id=chore.location_id,
                status=RequestStatus.OPEN,
                created_by_id=None,
                created_at=due,
            )
            .on_conflict_do_nothing(index_elements=[Request.chore_id], index_where=ACTIVE_WHERE)
            .returning(Request.id)
        )
        opened.extend(inserted.scalars())
    session.commit()
    for id in opened:
        notifier.send(
            session, None, message_for(session, session.get_one(Request, id), "due", None)
        )
    if opened:
        live.publish(None)


def _chore_outs(session: Session, chores: list[Chore], tz: ZoneInfo) -> list[ChoreOut]:
    ids = [chore.id for chore in chores]
    last = _last_done(session, ids)
    histories = _histories(session, ids)
    now = utcnow()
    outs = []
    for chore in chores:
        done = last.get(chore.id)
        history = histories.get(chore.id, (History(), False))[0]
        outs.append(
            ChoreOut(
                id=chore.id,
                location_id=chore.location_id,
                name=chore.name,
                icon=chore.icon,
                last_done_at=done and done.closed_at,
                last_done_by_name=done and done.closed_by and done.closed_by.display_name,
                repeat_days=chore.repeat_days,
                repeat_weekdays=sorted(chore.weekdays),
                next_due_at=_due_at(chore, history, now, tz),
                one_off=chore.one_off,
            )
        )
    return outs


@router.get("/chores")
def list_chores(
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
    live: LiveUpdates = Depends(get_live),
) -> list[ChoreOut]:
    check_due_chores(session, notifier, live, utcnow(), tz)
    chores = session.scalars(select(Chore).order_by(Chore.location_id, Chore.id))
    return _chore_outs(session, list(chores), tz)


@router.post("/chores", status_code=status.HTTP_201_CREATED)
def create_chore(
    new: ChoreCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
) -> ChoreOut:
    """Adds a lasting chore to a place (or the house), or a one-off to-do, which is
    reported at once."""
    if new.location_id is not None:
        get_or_404(session, Location, new.location_id)
    # One-off to-dos may share a name: they come and go.
    if not new.one_off:
        _check_chore_name(session, new.location_id, new.name)
    chore = Chore(location_id=new.location_id, name=new.name, icon=new.icon, one_off=new.one_off)
    session.add(chore)
    session.flush()
    if chore.one_off:
        request = Request(
            kind=RequestKind.CHORE,
            chore_id=chore.id,
            location_id=chore.location_id,
            status=RequestStatus.OPEN,
            created_by_id=user.id,
            created_at=utcnow(),
        )
        session.add(request)
        record(session, user, Action.REPORTED, chore=chore, location_id=chore.location_id)
    session.commit()
    if chore.one_off:
        notifier.send(
            session, user.id, message_for(session, request, "reported", user.display_name)
        )
    return _chore_outs(session, [chore], tz)[0]


def _drop_if_one_off(session: Session, request: Request) -> None:
    """A one-off to-do goes, with its request, once it's done or cancelled."""
    if request.chore_id is None:
        return
    chore = session.get_one(Chore, request.chore_id)
    if chore.one_off:
        session.delete(chore)
        session.commit()


@router.patch("/chores/{chore_id}")
def update_chore(
    chore_id: int,
    update: ChoreUpdate,
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
) -> ChoreOut:
    chore = get_or_404(session, Chore, chore_id)
    if update.name is not None:
        _check_chore_name(session, chore.location_id, update.name, own_id=chore.id)
        chore.name = update.name
    if "icon" in update.model_fields_set:
        chore.icon = update.icon
    if {"repeat_days", "repeat_weekdays"} & update.model_fields_set:
        chore.repeat_days = update.repeat_days
        chore.repeat_weekdays = (
            sum(1 << day for day in set(update.repeat_weekdays)) if update.repeat_weekdays else None
        )
        repeats = chore.repeat_days is not None or chore.repeat_weekdays is not None
        chore.scheduled_at = utcnow() if repeats else None
    session.commit()
    return _chore_outs(session, [chore], tz)[0]


@router.delete("/chores/{chore_id}", **NO_CONTENT)
def delete_chore(chore_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes a chore and its requests."""
    session.delete(get_or_404(session, Chore, chore_id))
    session.commit()


@router.post("/chores/{chore_id}/requests", status_code=status.HTTP_201_CREATED)
def report_chore(
    chore_id: int,
    response: Response,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> RequestOut:
    """Reports that a chore needs doing; if it's already reported, returns that request (200)."""
    chore = get_or_404(session, Chore, chore_id)
    inserted = session.execute(
        insert(Request)
        .values(
            kind=RequestKind.CHORE,
            chore_id=chore.id,
            location_id=chore.location_id,
            status=RequestStatus.OPEN,
            created_by_id=user.id,
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(index_elements=[Request.chore_id], index_where=ACTIVE_WHERE)
    )
    if inserted.rowcount:
        record(session, user, Action.REPORTED, chore=chore, location_id=chore.location_id)
    session.commit()
    request = session.scalars(
        select(Request).where(Request.chore_id == chore.id, Request.status.in_(ACTIVE))
    ).one()
    if inserted.rowcount:
        notifier.send(
            session, user.id, message_for(session, request, "reported", user.display_name)
        )
    else:
        response.status_code = status.HTTP_200_OK
    return RequestOut.model_validate(request)


@router.post("/chores/{chore_id}/done")
def complete_chore(
    chore_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
) -> ChoreOut:
    """Records a chore as done just now: its open or claimed request if it has one (and
    tells the other), else a request that's done from the start (nobody needs telling)."""
    chore = get_or_404(session, Chore, chore_id)
    now = utcnow()
    closed = {"status": RequestStatus.DONE, "closed_by_id": user.id, "closed_at": now}
    finished = session.execute(
        update(Request)
        .where(Request.chore_id == chore.id, Request.status.in_(ACTIVE))
        .values(**closed)
        .returning(Request.id)
    )
    finished_ids = list(finished.scalars())
    if not finished_ids:
        session.add(
            Request(
                kind=RequestKind.CHORE,
                chore_id=chore.id,
                location_id=chore.location_id,
                created_by_id=user.id,
                created_at=now,
                **closed,
            )
        )
    record(session, user, Action.DONE, chore=chore, location_id=chore.location_id)
    session.commit()
    for id in finished_ids:
        request = session.get_one(Request, id)
        notifier.send(session, user.id, message_for(session, request, "done", user.display_name))
    out = _chore_outs(session, [chore], tz)[0]
    if chore.one_off:
        session.delete(chore)
        session.commit()
    return out


# Requests


@router.get("/requests")
def list_requests(
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
    live: LiveUpdates = Depends(get_live),
) -> list[RequestOut]:
    """The open and claimed requests, oldest first, scheduled chores that fell due included."""
    check_due_chores(session, notifier, live, utcnow(), tz)
    requests = session.scalars(
        select(Request).where(Request.status.in_(ACTIVE)).order_by(Request.id)
    )
    return [RequestOut.model_validate(request) for request in requests]


def _transition(
    session: Session,
    request_id: int,
    *conditions,
    logged: tuple[User, Action] | None = None,
    **values,
) -> Request:
    """Changes a request if it's still in the expected state; 409 if someone got there first.
    Logs it as `logged` (who, what) unless the caller does."""
    changed = session.execute(
        update(Request).where(Request.id == request_id, *conditions).values(**values)
    )
    if not changed.rowcount:
        get_or_404(session, Request, request_id)
        raise conflict("The request has changed in the meantime")
    request = session.scalars(
        select(Request).where(Request.id == request_id).execution_options(populate_existing=True)
    ).one()
    if logged:
        record_request(session, *logged, request)
    session.commit()
    return request


@router.post("/requests/{request_id}/claim")
def claim_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> RequestOut:
    """Says "I'm on it". Only an open request can be claimed."""
    request = _transition(
        session,
        request_id,
        Request.status == RequestStatus.OPEN,
        logged=(user, Action.CLAIMED),
        status=RequestStatus.CLAIMED,
        claimed_by_id=user.id,
        claimed_at=utcnow(),
        # A nudge was about an earlier claim.
        reminded_by_id=None,
        reminded_at=None,
    )
    notifier.send(session, user.id, message_for(session, request, "claimed", user.display_name))
    return RequestOut.model_validate(request)


@router.post("/requests/{request_id}/unclaim")
def unclaim_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> RequestOut:
    """Takes back one's own claim, opening the request again."""
    request = _transition(
        session,
        request_id,
        Request.status == RequestStatus.CLAIMED,
        Request.claimed_by_id == user.id,
        logged=(user, Action.UNCLAIMED),
        status=RequestStatus.OPEN,
        claimed_by_id=None,
        claimed_at=None,
        reminded_by_id=None,
        reminded_at=None,
    )
    return RequestOut.model_validate(request)


@router.post("/requests/{request_id}/done")
def complete_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> RequestOut:
    """Marks a request done, whoever claimed it; a bought item's level goes back to plenty."""
    request = _transition(
        session,
        request_id,
        Request.status.in_(ACTIVE),
        status=RequestStatus.DONE,
        closed_by_id=user.id,
        closed_at=utcnow(),
    )
    event = "done"
    action = Action.DONE
    if request.kind == RequestKind.BUY:
        # Another place stocked up on it: it was fetched from there, not bought. That
        # place's level stays; nobody books every roll carried upstairs.
        if session.scalar(
            select(Stock.id).where(
                Stock.item_id == request.item_id,
                Stock.location_id != request.location_id,
                Stock.level == Level.LOTS,
            )
        ):
            event, action = "fetched", Action.FETCHED
        session.execute(
            update(Stock)
            .where(Stock.item_id == request.item_id, Stock.location_id == request.location_id)
            .values(level=Level.PLENTY, updated_by_id=user.id, updated_at=utcnow())
        )
    record_request(session, user, action, request)
    session.commit()
    notifier.send(session, user.id, message_for(session, request, event, user.display_name))
    out = RequestOut.model_validate(request)
    _drop_if_one_off(session, request)
    return out


@router.post("/requests/{request_id}/remind")
def remind_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
) -> RequestOut:
    """Asks whoever claimed a request when it'll be done: a push to their devices. Only
    someone else's claim, and once a (local) day; 409 otherwise."""
    now = utcnow()
    today = datetime.combine(now.astimezone(tz).date(), time(), tz)
    request = _transition(
        session,
        request_id,
        Request.status == RequestStatus.CLAIMED,
        Request.claimed_by_id != user.id,
        (Request.reminded_at.is_(None)) | (Request.reminded_at < today),
        logged=(user, Action.REMINDED),
        reminded_by_id=user.id,
        reminded_at=now,
    )
    notifier.send(
        session,
        user.id,
        message_for(session, request, "reminder", user.display_name),
        to_user_id=request.claimed_by_id,
    )
    return RequestOut.model_validate(request)


@router.post("/requests/{request_id}/cancel")
def cancel_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> RequestOut:
    """Drops a request that's no longer needed; a buy request leaves the level as it is."""
    request = _transition(
        session,
        request_id,
        Request.status.in_(ACTIVE),
        logged=(user, Action.CANCELLED),
        status=RequestStatus.CANCELLED,
        closed_by_id=user.id,
        closed_at=utcnow(),
    )
    out = RequestOut.model_validate(request)
    _drop_if_one_off(session, request)
    return out
