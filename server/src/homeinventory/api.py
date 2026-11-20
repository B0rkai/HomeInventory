from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from homeinventory.activity import router as activity_router
from homeinventory.admin import router as admin_router
from homeinventory.common import get_or_404
from homeinventory.cookings import router as cookings_router
from homeinventory.db import get_session
from homeinventory.groups import router as groups_router
from homeinventory.identity import current_user
from homeinventory.models import ADMIN_LOGIN, User
from homeinventory.places import router as places_router
from homeinventory.push import router as push_router
from homeinventory.recipes import router as recipes_router
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


@router.get("/users")
def list_users(
    _: User = Depends(current_user), session: Session = Depends(get_session)
) -> list[UserOut]:
    """The people (not Admin), for assigning and the admin pages."""
    people = session.scalars(select(User).where(User.login != ADMIN_LOGIN).order_by(User.id))
    return [UserOut.model_validate(person) for person in people]


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    update: UserUpdate,
    _: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> UserOut:
    """Sets someone's nickname (admin pages)."""
    person = get_or_404(session, User, user_id)
    person.nickname = update.nickname
    session.commit()
    return UserOut.model_validate(person)


router.include_router(places_router)
router.include_router(groups_router)
router.include_router(requests_router)
router.include_router(push_router)
router.include_router(recipes_router)
router.include_router(cookings_router)
router.include_router(activity_router)
router.include_router(admin_router)
