"""Helpers the API routers share."""

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from homeinventory.identity import current_user
from homeinventory.live import LiveUpdates
from homeinventory.models import User
from homeinventory.notify import Notifier

NO_CONTENT = {"status_code": status.HTTP_204_NO_CONTENT, "response_class": Response}


def get_or_404(session: Session, model, id: int):
    row = session.get(model, id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return row


def conflict(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail)


def get_notifier(request: Request) -> Notifier:
    return request.app.state.notifier


def get_live(request: Request) -> LiveUpdates:
    return request.app.state.live


def announce_changes(
    request: Request,
    user: User = Depends(current_user),
    live: LiveUpdates = Depends(get_live),
) -> Iterator[None]:
    """After a change goes through, tells open pages to fetch the house again."""
    yield
    # A failed change raises out of the yield instead, and nothing is announced.
    if request.method not in ("GET", "HEAD"):
        live.publish(user.id)
