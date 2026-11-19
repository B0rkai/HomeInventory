"""The activity log: who did what, newest first.

Every route that changes stock or requests records it here, in the same transaction.
What happens by itself (a scheduled chore falling due) isn't logged.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import Action, Activity, Chore, Item, Level, Request, RequestKind, User
from homeinventory.schemas import ActivityOut

router = APIRouter(dependencies=[Depends(current_user)])

PAGE_MAX = 500


def record(
    session: Session,
    user: User,
    action: Action,
    *,
    item: Item | None = None,
    chore: Chore | None = None,
    name: str | None = None,
    location_id: int | None = None,
    to_location_id: int | None = None,
    assignee: User | None = None,
    level: Level | None = None,
) -> None:
    """Adds an entry about an item, a chore or something to buy by `name`; the caller
    commits."""
    thing = item or chore
    name = thing.name if thing else name
    assert name is not None
    session.add(
        Activity(
            user_id=user.id,
            action=action,
            kind=RequestKind.CHORE if chore else RequestKind.BUY,
            item_id=item and item.id,
            chore_id=chore and chore.id,
            name=name,
            variant=item and item.variant,
            location_id=location_id,
            to_location_id=to_location_id,
            assignee_id=assignee and assignee.id,
            level=level,
        )
    )


def record_request(
    session: Session, user: User, action: Action, request: Request, assignee: User | None = None
) -> None:
    """Adds an entry about what was done to a request; the caller commits."""
    record(
        session,
        user,
        action,
        assignee=assignee,
        item=request.item_id and session.get_one(Item, request.item_id),
        chore=request.chore_id and session.get_one(Chore, request.chore_id),
        name=request.name,
        location_id=request.location_id,
    )


@router.get("/activity")
def list_activity(
    limit: int = Query(50, ge=1, le=PAGE_MAX),
    before_id: int | None = None,
    session: Session = Depends(get_session),
) -> list[ActivityOut]:
    """The latest entries, newest first; older than `before_id` for the next page."""
    query = select(Activity).order_by(Activity.id.desc()).limit(limit)
    if before_id is not None:
        query = query.where(Activity.id < before_id)
    entries = session.scalars(query)
    return [ActivityOut.model_validate(entry) for entry in entries]
