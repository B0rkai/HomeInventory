"""Devices subscribing to notifications, and the live update stream."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, get_live, get_notifier
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.live import LiveUpdates
from homeinventory.models import PushSubscription, User, utcnow
from homeinventory.notify import Notifier
from homeinventory.schemas import PushKey, PushSubscriptionIn

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("/push/key")
def get_push_key(notifier: Notifier = Depends(get_notifier)) -> PushKey:
    """The server's public key, for subscribing a device."""
    return PushKey(public_key=notifier.public_key)


@router.put("/push/subscriptions", **NO_CONTENT)
def subscribe(
    new: PushSubscriptionIn,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> None:
    """Sends this user's notifications to a device; sending one again refreshes it."""
    values = {"user_id": user.id, "p256dh": new.keys.p256dh, "auth": new.keys.auth}
    session.execute(
        insert(PushSubscription)
        .values(endpoint=new.endpoint, created_at=utcnow(), **values)
        .on_conflict_do_update(index_elements=[PushSubscription.endpoint], set_=values)
    )
    session.commit()


@router.delete("/push/subscriptions", **NO_CONTENT)
def unsubscribe(endpoint: str, session: Session = Depends(get_session)) -> None:
    """Stops notifications to a device (given by its endpoint); unknown ones are fine."""
    session.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))
    session.commit()


@router.get("/events", response_class=StreamingResponse)
async def stream_events(request: Request, live: LiveUpdates = Depends(get_live)):
    """Server-Sent Events: `{"by": <user id or null>}` whenever the house changes."""
    return StreamingResponse(
        live.stream(request.is_disconnected),
        media_type="text/event-stream",
        # No caching or proxy buffering: each event goes out as it happens.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
