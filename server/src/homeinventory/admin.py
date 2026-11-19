"""The Admin user: a password log-in for the admin pages on the LAN port.

Set its password on the server with `python -m homeinventory.admin` (in the live
container: `docker compose exec app python -m homeinventory.admin`).
"""

import base64
import getpass
import hashlib
import hmac
import secrets
import sys
import time
from collections import deque
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from homeinventory.config import Settings
from homeinventory.db import create_db_engine, get_session
from homeinventory.identity import (
    SESSION_COOKIE,
    SESSION_DAYS,
    current_user,
    on_admin_port,
    token_hash,
)
from homeinventory.models import ADMIN_LOGIN, AdminSession, User, utcnow
from homeinventory.schemas import AdminLogin, UserOut

router = APIRouter()

PASSWORD_MIN_LENGTH = 10
# scrypt's cost: about 50 ms and 32 MiB a try.
SCRYPT = {"n": 2**15, "r": 8, "p": 1, "maxmem": 64 * 1024**2}
# Wrong passwords: this many in the window, then no more tries until it passes. Counted
# for the whole port, not per client: behind Docker every client has one address.
FAILURES_MAX = 10
FAILURE_WINDOW = timedelta(minutes=15).total_seconds()
FAILURE_DELAY = 1.0


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    encode = base64.b64encode
    return f"scrypt${encode(salt).decode()}${encode(digest).decode()}"


def check_password(password: str, stored: str) -> bool:
    scheme, salt, digest = stored.split("$")
    assert scheme == "scrypt"
    tried = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), **SCRYPT)
    return hmac.compare_digest(tried, base64.b64decode(digest))


def _failures(request: Request) -> deque[float]:
    state = request.app.state
    if not hasattr(state, "admin_failures"):
        state.admin_failures = deque()
    return state.admin_failures


@router.post("/admin/login")
def log_in(
    login: AdminLogin,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserOut:
    """Logs this browser in as Admin, by a long-lived cookie. Only on the admin port."""
    if not on_admin_port(request):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    failures = _failures(request)
    now = time.monotonic()
    while failures and failures[0] < now - FAILURE_WINDOW:
        failures.popleft()
    if len(failures) >= FAILURES_MAX:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many wrong passwords")
    admin = session.scalar(select(User).where(User.login == ADMIN_LOGIN))
    if not (admin and admin.password_hash and check_password(login.password, admin.password_hash)):
        failures.append(now)
        time.sleep(FAILURE_DELAY)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong password")
    token = secrets.token_urlsafe(32)
    session.add(AdminSession(token_hash=token_hash(token), user_id=admin.id))
    # Sessions long out of use go now.
    session.execute(
        delete(AdminSession).where(AdminSession.used_at < utcnow() - timedelta(days=SESSION_DAYS))
    )
    session.commit()
    # Plain HTTP on the LAN, so not Secure; Strict keeps other sites from using it.
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(timedelta(days=SESSION_DAYS).total_seconds()),
        httponly=True,
        samesite="strict",
    )
    return UserOut.model_validate(admin)


@router.post("/admin/logout", status_code=status.HTTP_204_NO_CONTENT)
def log_out(
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> None:
    """Ends this browser's Admin session."""
    token = request.cookies.get(SESSION_COOKIE)
    if on_admin_port(request) and token:
        session.execute(delete(AdminSession).where(AdminSession.token_hash == token_hash(token)))
        session.commit()
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="strict")


def set_password(session: Session, password: str) -> None:
    """Sets the Admin user's password, making the user if need be, and logs out every
    browser logged in with the old one."""
    admin = session.scalar(select(User).where(User.login == ADMIN_LOGIN))
    if admin is None:
        admin = User(login=ADMIN_LOGIN, name="Admin", nickname="Admin")
        session.add(admin)
    admin.password_hash = hash_password(password)
    session.flush()
    session.execute(delete(AdminSession).where(AdminSession.user_id == admin.id))
    session.commit()


def main() -> None:
    password = getpass.getpass("New Admin password: ")
    if len(password) < PASSWORD_MIN_LENGTH:
        sys.exit(f"Too short: at least {PASSWORD_MIN_LENGTH} characters.")
    if getpass.getpass("Again: ") != password:
        sys.exit("They don't match.")
    engine = create_db_engine(Settings().db_path)
    with Session(engine) as session:
        set_password(session, password)
    print("Admin password set; other Admin sessions logged out.")


if __name__ == "__main__":
    main()
