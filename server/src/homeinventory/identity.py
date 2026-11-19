import hashlib
from datetime import timedelta
from email.header import decode_header, make_header

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.db import get_session
from homeinventory.models import AdminSession, User, utcnow

# Added by `tailscale serve`. Trustworthy only because nothing else can reach the app's
# tailnet port; never read on the admin port.
LOGIN_HEADER = "Tailscale-User-Login"
NAME_HEADER = "Tailscale-User-Name"

# The admin port's session cookie, and how long one lasts unused.
SESSION_COOKIE = "spajz_admin"
SESSION_DAYS = 180
# The 401 detail on the admin port, so the client shows its log-in form.
LOG_IN = "Log in as Admin"


def decode_header_value(value: str) -> str:
    # tailscale serve MIME-encodes (RFC 2047) values that aren't plain ASCII, e.g. "Ákos".
    return str(make_header(decode_header(value)))


def on_admin_port(request: Request) -> bool:
    """Whether the request came in on the admin (LAN) port: by the socket it arrived on,
    which, unlike a header, the client can't choose."""
    port = request.app.state.settings.admin_port
    server = request.scope.get("server")
    return port is not None and server is not None and server[1] == port


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _admin(request: Request, session: Session) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    found = token and session.scalar(
        select(AdminSession).where(AdminSession.token_hash == token_hash(token))
    )
    now = utcnow()
    if not found or found.used_at < now - timedelta(days=SESSION_DAYS):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOG_IN)
    # Sliding: in use, it never runs out. Once a day is enough to keep it so.
    if found.used_at < now - timedelta(days=1):
        found.used_at = now
        session.commit()
    return session.get_one(User, found.user_id)


def current_user(request: Request, session: Session = Depends(get_session)) -> User:
    """The user making the request, created on their first request. On the admin port,
    the logged-in Admin."""
    if on_admin_port(request):
        return _admin(request, session)
    login = request.headers.get(LOGIN_HEADER)
    if login:
        login = decode_header_value(login)
        name = decode_header_value(request.headers.get(NAME_HEADER, "")) or login
    elif request.app.state.settings.dev_user:
        login = request.app.state.settings.dev_user
        name = login.split("@")[0]
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Tailscale identity")

    user = session.scalar(select(User).where(User.login == login))
    if user is None:
        # Two first requests can race; whichever inserts second just finds the row.
        session.execute(
            insert(User)
            .values(login=login, name=name)
            .on_conflict_do_nothing(index_elements=[User.login])
        )
        session.commit()
        user = session.scalars(select(User).where(User.login == login)).one()
    elif user.name != name:
        user.name = name
        session.commit()
    return user
