"""Chores, and requests: something to buy or do, from open through claimed to done.

Buy requests come from stock levels (see `places.set_stock`); chore requests are
reported by hand. Every state change is one conditional UPDATE, so when both users
tap at once exactly one wins and the other gets 409.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, conflict, get_or_404
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import (
    ACTIVE,
    ACTIVE_WHERE,
    Chore,
    Level,
    Location,
    Request,
    RequestKind,
    RequestStatus,
    Stock,
    User,
    utcnow,
)
from homeinventory.schemas import ChoreCreate, ChoreOut, ChoreUpdate, RequestOut

router = APIRouter(dependencies=[Depends(current_user)])


# Buy requests, driven by stock levels


def open_buy_request(session: Session, item_id: int, location_id: int, user: User) -> None:
    """Opens a request to buy an item for a location, unless one is already open or claimed."""
    session.execute(
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


def close_buy_requests(
    session: Session, item_id: int, location_id: int, user: User, closed: RequestStatus
) -> None:
    """Marks the active request to buy an item for a location done or cancelled."""
    session.execute(
        update(Request)
        .where(
            Request.kind == RequestKind.BUY,
            Request.item_id == item_id,
            Request.location_id == location_id,
            Request.status.in_(ACTIVE),
        )
        .values(status=closed, closed_by_id=user.id, closed_at=utcnow())
    )


# Chores


def _check_chore_name(
    session: Session, location_id: int, name: str, own_id: int | None = None
) -> None:
    folded = name.casefold()
    if any(
        chore.name.casefold() == folded and chore.id != own_id
        for chore in session.scalars(select(Chore).where(Chore.location_id == location_id))
    ):
        raise conflict("This location already has a chore with this name")


@router.get("/chores")
def list_chores(session: Session = Depends(get_session)) -> list[ChoreOut]:
    chores = session.scalars(select(Chore).order_by(Chore.location_id, Chore.id))
    return [ChoreOut.model_validate(chore) for chore in chores]


@router.post("/chores", status_code=status.HTTP_201_CREATED)
def create_chore(new: ChoreCreate, session: Session = Depends(get_session)) -> ChoreOut:
    get_or_404(session, Location, new.location_id)
    _check_chore_name(session, new.location_id, new.name)
    chore = Chore(location_id=new.location_id, name=new.name, icon=new.icon)
    session.add(chore)
    session.commit()
    return ChoreOut.model_validate(chore)


@router.patch("/chores/{chore_id}")
def update_chore(
    chore_id: int, update: ChoreUpdate, session: Session = Depends(get_session)
) -> ChoreOut:
    chore = get_or_404(session, Chore, chore_id)
    if update.name is not None:
        _check_chore_name(session, chore.location_id, update.name, own_id=chore.id)
        chore.name = update.name
    if "icon" in update.model_fields_set:
        chore.icon = update.icon
    session.commit()
    return ChoreOut.model_validate(chore)


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
    session.commit()
    if not inserted.rowcount:
        response.status_code = status.HTTP_200_OK
    request = session.scalars(
        select(Request).where(Request.chore_id == chore.id, Request.status.in_(ACTIVE))
    ).one()
    return RequestOut.model_validate(request)


# Requests


@router.get("/requests")
def list_requests(session: Session = Depends(get_session)) -> list[RequestOut]:
    """The open and claimed requests, oldest first."""
    requests = session.scalars(
        select(Request).where(Request.status.in_(ACTIVE)).order_by(Request.id)
    )
    return [RequestOut.model_validate(request) for request in requests]


def _transition(session: Session, request_id: int, *conditions, **values) -> Request:
    """Changes a request if it's still in the expected state; 409 if someone got there first."""
    changed = session.execute(
        update(Request).where(Request.id == request_id, *conditions).values(**values)
    )
    if not changed.rowcount:
        get_or_404(session, Request, request_id)
        raise conflict("The request has changed in the meantime")
    session.commit()
    request = session.scalars(
        select(Request).where(Request.id == request_id).execution_options(populate_existing=True)
    ).one()
    return request


@router.post("/requests/{request_id}/claim")
def claim_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> RequestOut:
    """Says "I'm on it". Only an open request can be claimed."""
    request = _transition(
        session,
        request_id,
        Request.status == RequestStatus.OPEN,
        status=RequestStatus.CLAIMED,
        claimed_by_id=user.id,
        claimed_at=utcnow(),
    )
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
        status=RequestStatus.OPEN,
        claimed_by_id=None,
        claimed_at=None,
    )
    return RequestOut.model_validate(request)


@router.post("/requests/{request_id}/done")
def complete_request(
    request_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
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
    if request.kind == RequestKind.BUY:
        session.execute(
            update(Stock)
            .where(Stock.item_id == request.item_id, Stock.location_id == request.location_id)
            .values(level=Level.PLENTY, updated_by_id=user.id, updated_at=utcnow())
        )
        session.commit()
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
        status=RequestStatus.CANCELLED,
        closed_by_id=user.id,
        closed_at=utcnow(),
    )
    return RequestOut.model_validate(request)
