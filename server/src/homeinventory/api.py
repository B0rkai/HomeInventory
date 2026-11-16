from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import User
from homeinventory.places import router as places_router
from homeinventory.requests import router as requests_router
from homeinventory.schemas import Health, UserOut, UserUpdate

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def get_health(session: Session = Depends(get_session)) -> Health:
    """Liveness check that also touches the database. Needs no identity."""
    session.execute(text("SELECT 1"))
    return Health(status="ok")


@router.get("/users/me")
def get_current_user(user: User = Depends(current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/users/me")
def update_current_user(
    update: UserUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> UserOut:
    user.nickname = update.nickname
    session.commit()
    return UserOut.model_validate(user)


router.include_router(places_router)
router.include_router(requests_router)
