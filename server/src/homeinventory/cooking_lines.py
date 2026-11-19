"""What planned cookings put on the shopping list (docs/features.md, the meal planner).

A cooking needs its recipe's items, its parts' and its side dish's too, but not the
optional ones. One that isn't at home (nor anything to use instead, nor bought for it
already) goes on the list: where it's kept, as that place's line, else as a line with no
place. A line points at the earliest planned cooking still lacking its item, so it's due
before that day. Nothing about it is stored that the plan doesn't say, so every change to
a cooking, or to a level, settles the lines it touched again.
"""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from homeinventory.models import (
    ACTIVE,
    Cooking,
    Item,
    Level,
    Recipe,
    Request,
    RequestKind,
    RequestStatus,
    Stock,
    User,
    utcnow,
)

AT_HOME = (Level.PLENTY, Level.LOTS)
# Fuller is more; out first is the place to buy it for.
FULLNESS = {Level.OUT: 0, Level.LOW: 1, Level.PLENTY: 2, Level.LOTS: 3}


def _flat(recipe: Recipe, optional: bool, seen: set[int], out: dict[tuple[int, bool], bool]):
    """Adds the recipe's items, its parts' included, to `out`: (item, any variant) to
    whether it's optional everywhere so far."""
    # The API refuses loops; this guards against one anyway.
    if recipe.id in seen:
        return
    seen.add(recipe.id)
    for ingredient in recipe.ingredients:
        if ingredient.part is not None:
            _flat(ingredient.part, optional or ingredient.optional, seen, out)
        elif ingredient.item_id is not None:
            key = (ingredient.item_id, ingredient.any_variant)
            out[key] = out.get(key, True) and (optional or ingredient.optional)
    seen.discard(recipe.id)


def needed(cooking: Cooking) -> list[tuple[int, bool]]:
    """The items the cooking can't do without, each once: (item id, any variant will do)."""
    out: dict[tuple[int, bool], bool] = {}
    for recipe in (cooking.recipe, cooking.side):
        if recipe is not None:
            _flat(recipe, False, set(), out)
    return [key for key, optional in out.items() if not optional]


class House:
    """The catalogue and the best level of each item anywhere, read once."""

    def __init__(self, session: Session) -> None:
        self.items = {item.id: item for item in session.scalars(select(Item))}
        self.rows = list(session.scalars(select(Stock)))
        self.best: dict[int, Level] = {}
        for row in self.rows:
            best = self.best.get(row.item_id)
            if best is None or FULLNESS[row.level] > FULLNESS[best]:
                self.best[row.item_id] = row.level

    def items_of(self, item_id: int, any_variant: bool) -> list[int]:
        """The item, or every variant of its name."""
        item = self.items[item_id]
        if not any_variant:
            return [item_id]
        folded = item.name.casefold()
        return [id for id, other in self.items.items() if other.name.casefold() == folded]

    def at_home(self, ids: Iterable[int]) -> bool:
        return any(self.best.get(id) in AT_HOME for id in ids)

    def covered(self, ids: list[int]) -> bool:
        """At home, or something a recipe can use instead is."""
        substitutes = {s.id for id in ids for s in self.items[id].substitutes} - set(ids)
        return self.at_home(ids) or self.at_home(substitutes)


def planned(session: Session) -> list[Cooking]:
    """The cookings not cooked yet, earliest first."""
    return list(
        session.scalars(
            select(Cooking).where(Cooking.done_at.is_(None)).order_by(Cooking.day, Cooking.id)
        )
    )


def bought_for(session: Session, cooking_id: int) -> set[int]:
    """The items bought for a cooking on lines of its own."""
    return set(
        session.scalars(
            select(Request.item_id).where(
                Request.cooking_id == cooking_id,
                Request.status == RequestStatus.DONE,
                Request.item_id.is_not(None),
            )
        )
    )


def lacking(session: Session, house: House, cooking: Cooking) -> list[tuple[int, list[int]]]:
    """What the cooking needs and hasn't got: (the item named, the items that would do)."""
    bought = bought_for(session, cooking.id)
    out = []
    for item_id, any_variant in needed(cooking):
        ids = house.items_of(item_id, any_variant)
        if not (house.covered(ids) or bought & set(ids)):
            out.append((item_id, ids))
    return out


def list_missing(
    session: Session, cooking: Cooking, user: User, only: set[int] | None = None
) -> None:
    """Puts what the cooking lacks on the list, unless a line for it is on already (that
    one is settled to point here). `only`: just these items."""
    house = House(session)
    for item_id, ids in lacking(session, house, cooking):
        if only is not None and not only & set(ids):
            continue
        if session.scalar(
            select(Request.id)
            .where(
                Request.kind == RequestKind.BUY,
                Request.item_id.in_(ids),
                Request.status.in_(ACTIVE),
            )
            .limit(1)
        ):
            continue
        # Kept somewhere (and low or out there, or it'd be at home): that place's line.
        rows = sorted(
            (row for row in house.rows if row.item_id in ids), key=lambda r: FULLNESS[r.level]
        )
        session.add(
            Request(
                kind=RequestKind.BUY,
                item_id=rows[0].item_id if rows else item_id,
                location_id=rows[0].location_id if rows else None,
                status=RequestStatus.OPEN,
                created_by_id=user.id,
                created_at=utcnow(),
                cooking_id=cooking.id,
                for_cooking=True,
            )
        )
    session.flush()


def settle(session: Session, user: User) -> list[Request]:
    """Points each active line of an item at the earliest planned cooking lacking it. A line
    put on for a cooking that none lacks now goes, unless someone's buying it: those are
    returned, for telling them."""
    house = House(session)
    lacks = [
        (cooking, {id for _, ids in lacking(session, house, cooking) for id in ids})
        for cooking in planned(session)
    ]
    left = []
    requests = session.scalars(
        select(Request).where(
            Request.kind == RequestKind.BUY,
            Request.item_id.is_not(None),
            Request.status.in_(ACTIVE),
        )
    )
    for request in requests:
        first = next((cooking for cooking, ids in lacks if request.item_id in ids), None)
        request.cooking_id = first and first.id
        if first is not None or not request.for_cooking:
            continue
        if request.status == RequestStatus.CLAIMED:
            left.append(request)
            continue
        request.status = RequestStatus.CANCELLED
        request.closed_by_id = user.id
        request.closed_at = utcnow()
    session.flush()
    return left


def level_changed(session: Session, user: User, item_ids: list[int]) -> None:
    """An item's level changed: a cooking may lack it now, or not any more."""
    house = House(session)
    wanted = set(item_ids)
    for cooking in planned(session):
        if any(wanted & set(ids) for _, ids in lacking(session, house, cooking)):
            list_missing(session, cooking, user, only=wanted)
    settle(session, user)


def recipes_changed(session: Session, user: User) -> None:
    """What recipes take changed: the planned cookings' lines follow."""
    for cooking in planned(session):
        list_missing(session, cooking, user)
    settle(session, user)
