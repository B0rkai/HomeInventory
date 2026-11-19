"""Devices subscribing to notifications, and the live update stream."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, get_live, get_notifier, get_or_404
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.live import LiveUpdates
from homeinventory.models import PushSubscription, User, utcnow
from homeinventory.notify import Notifier
from homeinventory.schemas import PushKey, PushSubscriptionIn, PushSubscriptionOut

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("/push/key")
def get_push_key(notifier: Notifier = Depends(get_notifier)) -> PushKey:
    """The server's public key, for subscribing a device."""
    return PushKey(public_key=notifier.public_key)


@router.put("/push/subscriptions", **NO_CONTENT)
def subscribe(
    new: PushSubscriptionIn,
    request: Request,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> None:
    """Sends this user's notifications to a device; sending one again refreshes it."""
    if user.admin:
        # Admin is the LAN pages, not a person: nothing to tell it.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin gets no notifications")
    values = {
        "user_id": user.id,
        "p256dh": new.keys.p256dh,
        "auth": new.keys.auth,
        "user_agent": (request.headers.get("user-agent") or "")[:300] or None,
        "seen_at": utcnow(),
    }
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


@router.get("/push/subscriptions")
def list_subscriptions(session: Session = Depends(get_session)) -> list[PushSubscriptionOut]:
    """Every device that gets notifications, by user, last seen first (admin pages)."""
    rows = session.scalars(
        select(PushSubscription).order_by(
            PushSubscription.user_id, PushSubscription.seen_at.desc().nulls_last()
        )
    )
    return [PushSubscriptionOut.model_validate(row) for row in rows]


@router.delete("/push/subscriptions/{subscription_id}", **NO_CONTENT)
def delete_subscription(subscription_id: int, session: Session = Depends(get_session)) -> None:
    """Stops notifications to a device, say an old phone (admin pages)."""
    session.delete(get_or_404(session, PushSubscription, subscription_id))
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
