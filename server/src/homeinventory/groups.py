"""Item groups and their subgroups: what sorts the catalogue, a place's page and the
shopping list. Edited on the admin pages."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, announce_changes, conflict, get_or_404
from homeinventory.cooking_lines import settle
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import Item, ItemGroup, User
from homeinventory.schemas import GroupCreate, GroupOut, GroupUpdate

router = APIRouter(dependencies=[Depends(current_user), Depends(announce_changes)])


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _siblings(session: Session, parent_id: int | None) -> list[ItemGroup]:
    return list(
        session.scalars(
            select(ItemGroup)
            .where(ItemGroup.parent_id == parent_id)  # IS NULL for None
            .order_by(ItemGroup.position, ItemGroup.id)
        )
    )


def _check_name(siblings: list[ItemGroup], name: str, own_id: int | None = None) -> None:
    folded = name.casefold()
    if any(s.name.casefold() == folded and s.id != own_id for s in siblings):
        raise conflict("A group with this name already exists here")


def _parent(session: Session, parent_id: int) -> ItemGroup:
    """A subgroup's group: it must be a group itself, two levels and no deeper."""
    parent = session.get(ItemGroup, parent_id)
    if parent is None:
        raise _unprocessable("No such group")
    if parent.parent_id is not None:
        raise _unprocessable("Groups nest only one deep")
    return parent


def _icons(icons: list[str]) -> list[str]:
    # Each once, in the order sent.
    return list(dict.fromkeys(icons))


def check_group(session: Session, group_id: int | None) -> None:
    """Refuses an item's group that doesn't exist."""
    if group_id is not None and session.get(ItemGroup, group_id) is None:
        raise _unprocessable("No such group")


@router.get("/groups")
def list_groups(session: Session = Depends(get_session)) -> list[GroupOut]:
    """Every group and subgroup, ordered by parent, then position; the client nests them."""
    groups = session.scalars(
        select(ItemGroup).order_by(ItemGroup.parent_id, ItemGroup.position, ItemGroup.id)
    )
    return [GroupOut.model_validate(group) for group in groups]


@router.post("/groups", status_code=status.HTTP_201_CREATED)
def create_group(
    new: GroupCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> GroupOut:
    """Adds a group (with a colour) or a subgroup (wearing its group's), last of its
    siblings."""
    if new.parent_id is not None:
        _parent(session, new.parent_id)
        hue = None
    elif new.hue is None:
        raise _unprocessable("A group needs a colour")
    else:
        hue = new.hue
    siblings = _siblings(session, new.parent_id)
    _check_name(siblings, new.name)
    group = ItemGroup(
        name=new.name,
        parent_id=new.parent_id,
        hue=hue,
        icons=_icons(new.icons),
        keeps_days=new.keeps_days,
        position=max((s.position for s in siblings), default=-1) + 1,
    )
    session.add(group)
    session.flush()
    # Items following their icon may land in it, and keep as it says.
    settle(session, user)
    session.commit()
    return GroupOut.model_validate(group)


@router.patch("/groups/{group_id}")
def update_group(
    group_id: int,
    update: GroupUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> GroupOut:
    """Renames a group, changes its colour, icons or shelf life, moves it among its
    siblings, or moves a subgroup to another group. A group stays a group and a subgroup a
    subgroup. Fresh food planned for a cooking is dated again."""
    group = get_or_404(session, ItemGroup, group_id)
    if "parent_id" in update.model_fields_set and update.parent_id != group.parent_id:
        if group.parent_id is None or update.parent_id is None:
            raise _unprocessable("Only a subgroup moves, to another group")
        _parent(session, update.parent_id)
        _check_name(_siblings(session, update.parent_id), update.name or group.name)
        left = [s for s in _siblings(session, group.parent_id) if s.id != group.id]
        for position, sibling in enumerate(left):
            sibling.position = position
        group.position = len(_siblings(session, update.parent_id))
        group.parent_id = update.parent_id
    siblings = _siblings(session, group.parent_id)
    if update.name is not None:
        _check_name(siblings, update.name, own_id=group.id)
        group.name = update.name
    if update.hue is not None:
        if group.parent_id is not None:
            raise _unprocessable("A subgroup wears its group's colour")
        group.hue = update.hue
    if update.icons is not None:
        group.icons = _icons(update.icons)
    if "keeps_days" in update.model_fields_set:
        group.keeps_days = update.keeps_days
    if update.position is not None:
        siblings.remove(group)
        siblings.insert(update.position, group)
        for position, sibling in enumerate(siblings):
            sibling.position = position
    session.flush()
    settle(session, user)
    session.commit()
    return GroupOut.model_validate(group)


@router.delete("/groups/{group_id}", **NO_CONTENT)
def delete_group(
    group_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> None:
    """Deletes a subgroup, its items moving up to its group; a group only once it has no
    subgroups and no items."""
    group = get_or_404(session, ItemGroup, group_id)
    if group.parent_id is None:
        if session.scalar(select(ItemGroup.id).where(ItemGroup.parent_id == group.id).limit(1)):
            raise conflict("Delete or move this group's subgroups first")
        if session.scalar(select(Item.id).where(Item.group_id == group.id).limit(1)):
            raise conflict("Move this group's items to another group first")
    else:
        session.execute(
            update(Item).where(Item.group_id == group.id).values(group_id=group.parent_id)
        )
    parent_id = group.parent_id
    session.delete(group)
    session.flush()
    for position, sibling in enumerate(_siblings(session, parent_id)):
        sibling.position = position
    settle(session, user)
    session.commit()
