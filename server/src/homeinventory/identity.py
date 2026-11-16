from email.header import decode_header, make_header

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.db import get_session
from homeinventory.models import User

# Added by `tailscale serve`. Trustworthy only because nothing else can reach the app.
LOGIN_HEADER = "Tailscale-User-Login"
NAME_HEADER = "Tailscale-User-Name"


def decode_header_value(value: str) -> str:
    # tailscale serve MIME-encodes (RFC 2047) values that aren't plain ASCII, e.g. "Ákos".
    return str(make_header(decode_header(value)))


def current_user(request: Request, session: Session = Depends(get_session)) -> User:
    """The user making the request, created on their first request."""
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
