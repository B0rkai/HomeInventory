"""Cookings: a recipe planned for a day, and what that puts on the shopping list
(`cooking_lines.py`), until it's cooked and what's left is recorded.

Cancelling one deletes it; the lines it put on go with it, except the ones someone is
buying already. Planning, moving and cancelling tell the other (`notify.py`).
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, announce_changes, conflict, get_notifier, get_or_404
from homeinventory.cooking_lines import bought_for, list_missing, planned, settle
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import Cooking, Item, Location, Recipe, RecipeKind, User, utcnow
from homeinventory.notify import Notifier, cooking_message
from homeinventory.places import apply_level, tell_level
from homeinventory.requests import household_timezone
from homeinventory.schemas import CookingCreate, CookingDone, CookingOut, CookingUpdate

router = APIRouter(dependencies=[Depends(current_user), Depends(announce_changes)])

# What a side dish goes with.
TAKES_SIDE = (RecipeKind.MAIN, RecipeKind.MENU)


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _out(session: Session, cooking: Cooking) -> CookingOut:
    out = CookingOut.model_validate(cooking)
    out.bought_item_ids = sorted(bought_for(session, cooking.id))
    return out


def _check_day(day: date, tz: ZoneInfo) -> None:
    if day < datetime.now(tz).date():
        raise _unprocessable("A cooking is planned for today or later")


def _side(session: Session, recipe: Recipe, side_id: int | None) -> Recipe | None:
    if side_id is None:
        return None
    side = session.get(Recipe, side_id)
    if side is None or side.kind != RecipeKind.SIDE:
        raise _unprocessable("No such side dish")
    if recipe.kind not in TAKES_SIDE:
        raise _unprocessable("Only a main course takes a side dish")
    return side


def _cook(session: Session, cook_id: int | None) -> User | None:
    """Who cooks: a person, never Admin."""
    if cook_id is None:
        return None
    cook = session.get(User, cook_id)
    if cook is None or cook.admin:
        raise _unprocessable("No such person")
    return cook


def _planned(session: Session, cooking_id: int) -> Cooking:
    cooking = get_or_404(session, Cooking, cooking_id)
    if cooking.done_at is not None:
        raise conflict("It's cooked already")
    return cooking


@router.get("/cookings")
def list_cookings(session: Session = Depends(get_session)) -> list[CookingOut]:
    """The cookings not cooked yet, earliest first; past days' too."""
    return [_out(session, cooking) for cooking in planned(session)]


@router.post("/cookings", status_code=status.HTTP_201_CREATED)
def create_cooking(
    new: CookingCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
) -> CookingOut:
    """Plans a recipe for a day: what it needs and the house lacks goes on the list."""
    recipe = session.get(Recipe, new.recipe_id)
    if recipe is None:
        raise _unprocessable("No such recipe")
    _check_day(new.day, tz)
    cooking = Cooking(
        recipe=recipe,
        side=_side(session, recipe, new.side_id),
        day=new.day,
        cook=_cook(session, new.cook_id),
        created_by_id=user.id,
    )
    session.add(cooking)
    session.flush()
    list_missing(session, cooking, user)
    settle(session, user)
    session.commit()
    notifier.send(session, user.id, cooking_message(cooking, "planned", user.display_name))
    return _out(session, cooking)


@router.patch("/cookings/{cooking_id}")
def update_cooking(
    cooking_id: int,
    update: CookingUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    tz: ZoneInfo = Depends(household_timezone),
    notifier: Notifier = Depends(get_notifier),
) -> CookingOut:
    """Moves a cooking to another day, changes its side dish or who cooks it. Its lines
    follow: the earliest cooking lacking an item is the one its line is due for."""
    cooking = _planned(session, cooking_id)
    sent = update.model_fields_set
    moved = update.day is not None and update.day != cooking.day
    if moved:
        _check_day(update.day, tz)
        cooking.day = update.day
    if "side_id" in sent:
        cooking.side = _side(session, cooking.recipe, update.side_id)
    if "cook_id" in sent:
        cooking.cook = _cook(session, update.cook_id)
    session.flush()
    if moved or "side_id" in sent:
        list_missing(session, cooking, user)
        settle(session, user)
    session.commit()
    if moved:
        notifier.send(session, user.id, cooking_message(cooking, "moved", user.display_name))
    return _out(session, cooking)


@router.delete("/cookings/{cooking_id}", **NO_CONTENT)
def delete_cooking(
    cooking_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> None:
    """Cancels a planned cooking: the lines only it needed go, unless someone's buying them
    already (they're told, with the other)."""
    cooking = _planned(session, cooking_id)
    message = cooking_message(cooking, "dropped", user.display_name)
    session.delete(cooking)
    session.flush()
    settle(session, user)
    session.commit()
    notifier.send(session, user.id, message)


@router.post("/cookings/{cooking_id}/done")
def complete_cooking(
    cooking_id: int,
    done: CookingDone,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> CookingOut:
    """Marks a cooking cooked, with what's left: the levels sent are set (the list follows,
    as on a place's page). Lines still waiting for it go, unless someone's buying them."""
    cooking = _planned(session, cooking_id)
    cooking.done_at = utcnow()
    session.flush()
    applied = []
    for left in done.levels:
        get_or_404(session, Location, left.location_id)
        item = get_or_404(session, Item, left.item_id)
        applied.append((item, left, apply_level(session, user, item, left.location_id, left.level)))
    settle(session, user)
    session.commit()
    for item, left, (opened, refilled) in applied:
        tell_level(session, notifier, user, item, left.location_id, left.level, opened, refilled)
    return _out(session, cooking)
