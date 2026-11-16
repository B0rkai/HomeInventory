"""Web push: tells the other user's devices what happened.

The server sends what happened, not the words: the service worker (web/src/sw.ts) turns
it into Hungarian text, so every user-facing string stays in the web client.
"""

import base64
import json
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from homeinventory.models import Chore, Item, Location, PushSubscription, Request, RequestKind

log = logging.getLogger(__name__)

# How long a push service keeps a message for a phone that's offline.
TTL_SECONDS = 24 * 60 * 60

# "fetched": a buy request done while another place had lots of it, so it was brought
# from there rather than bought.
Event = Literal["reported", "claimed", "done", "fetched", "refilled", "due"]


@dataclass(frozen=True)
class Message:
    event: Event
    kind: Literal["buy", "chore"]
    name: str
    variant: str | None
    # The place's own name; unset for a chore of the whole house.
    place: str | None
    # For a buy request: how short it is.
    level: str | None
    # Who did it; unset when a scheduled chore fell due.
    actor: str | None
    # Messages with the same tag replace each other on the phone.
    tag: str
    # The page a tap opens.
    url: str = "/#/todo"


def message_for(
    session: Session,
    request: Request,
    event: Event,
    actor: str | None,
    level: str | None = None,
) -> Message:
    """What to tell about a request."""
    place = request.location_id and session.get_one(Location, request.location_id).name
    if request.kind == RequestKind.BUY:
        item = session.get_one(Item, request.item_id)
        return Message(
            event=event,
            kind="buy",
            name=item.name,
            variant=item.variant,
            place=place,
            level=level,
            actor=actor,
            tag=f"buy-{item.id}",
        )
    chore = session.get_one(Chore, request.chore_id)
    return Message(
        event=event,
        kind="chore",
        name=chore.name,
        variant=None,
        place=place,
        level=None,
        actor=actor,
        tag=f"chore-{chore.id}",
    )


Subscription = tuple[int, dict]
# Sends one message to one device; raises WebPushException on failure.
Sender = Callable[[dict, str, Vapid02, dict], None]


def send_web_push(subscription: dict, data: str, vapid: Vapid02, claims: dict) -> None:
    webpush(
        subscription,
        data=data,
        vapid_private_key=vapid,
        # webpush adds "aud" to the claims it's given, so each send gets its own copy.
        vapid_claims=dict(claims),
        ttl=TTL_SECONDS,
        timeout=10,
    )


class Notifier:
    """Sends messages to every device of the users who didn't cause them, off the request."""

    def __init__(
        self,
        key_path: Path,
        subject: str,
        sessions: sessionmaker[Session],
        sender: Sender = send_web_push,
        run: Callable[..., object] | None = None,
    ) -> None:
        self._key_path = key_path
        self._subject = subject
        self._sessions = sessions
        self.sender = sender
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="push")
        # How a delivery runs; tests run it on the spot.
        self.run = run or self._executor.submit
        self._vapid: Vapid02 | None = None

    @property
    def vapid(self) -> Vapid02:
        """The server's VAPID key pair, made on first use and kept in the data directory."""
        if self._vapid is None:
            if self._key_path.exists():
                self._vapid = Vapid02.from_file(str(self._key_path))
            else:
                vapid = Vapid02()
                vapid.generate_keys()
                self._key_path.parent.mkdir(parents=True, exist_ok=True)
                vapid.save_key(str(self._key_path))
                self._key_path.chmod(0o600)
                self._vapid = vapid
        return self._vapid

    @property
    def public_key(self) -> str:
        """The key browsers subscribe with (applicationServerKey), base64url."""
        raw = self.vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    def send(self, session: Session, actor_id: int | None, message: Message) -> None:
        """Queues a message for every device except the actor's."""
        query = select(PushSubscription)
        if actor_id is not None:
            query = query.where(PushSubscription.user_id != actor_id)
        targets = [
            (s.id, {"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}})
            for s in session.scalars(query)
        ]
        if targets:
            self.run(self._deliver, targets, json.dumps(asdict(message), ensure_ascii=False))

    def _deliver(self, targets: list[Subscription], data: str) -> None:
        gone = []
        for id, subscription in targets:
            try:
                self.sender(subscription, data, self.vapid, {"sub": self._subject})
            except WebPushException as error:
                status = error.response.status_code if error.response is not None else None
                # The device unsubscribed or the subscription expired.
                if status in (404, 410):
                    gone.append(id)
                else:
                    log.warning("Push to subscription %s failed: %s", id, error)
            except Exception:
                log.exception("Push to subscription %s failed", id)
        if gone:
            with self._sessions() as session:
                session.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
                session.commit()

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
