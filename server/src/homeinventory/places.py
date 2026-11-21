"""Locations, the item catalogue and stock levels."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.activity import record
from homeinventory.common import NO_CONTENT, announce_changes, conflict, get_notifier, get_or_404
from homeinventory.cooking_lines import level_changed, settle
from homeinventory.db import get_session
from homeinventory.groups import check_group
from homeinventory.identity import current_user
from homeinventory.models import (
    ACTIVE,
    LOCATION_MAX_DEPTH,
    Action,
    Item,
    Level,
    Location,
    Request,
    RequestStatus,
    Stock,
    User,
    utcnow,
)
from homeinventory.notify import Notifier, message_for
from homeinventory.requests import (
    SHORT,
    close_buy_requests,
    group_of,
    interchangeable,
    merge_variant_requests,
    open_buy_request,
    sync_variants_at,
    variants_of,
)
from homeinventory.schemas import (
    ItemCreate,
    ItemOut,
    ItemUpdate,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    RequestOut,
    StockMove,
    StockOut,
    StockSet,
)

# Every route needs an identity, even the read-only ones: the app is for its users only.
router = APIRouter(dependencies=[Depends(current_user), Depends(announce_changes)])

# Locations


def _siblings(session: Session, parent_id: int | None) -> list[Location]:
    return list(
        session.scalars(
            select(Location)
            .where(Location.parent_id == parent_id)  # IS NULL for None
            .order_by(Location.position, Location.id)
        )
    )


def _check_location_name(siblings: list[Location], name: str, own_id: int | None = None) -> None:
    folded = name.casefold()
    if any(s.name.casefold() == folded and s.id != own_id for s in siblings):
        raise conflict("A location with this name already exists here")


def _depth(session: Session, location: Location) -> int:
    depth = 1
    while location.parent_id is not None:
        location = session.get_one(Location, location.parent_id)
        depth += 1
    return depth


@router.get("/locations")
def list_locations(session: Session = Depends(get_session)) -> list[LocationOut]:
    """Every location, ordered by parent, then position; the client builds the tree."""
    locations = session.scalars(
        select(Location).order_by(Location.parent_id, Location.position, Location.id)
    )
    return [LocationOut.model_validate(location) for location in locations]


@router.post("/locations", status_code=status.HTTP_201_CREATED)
def create_location(new: LocationCreate, session: Session = Depends(get_session)) -> LocationOut:
    """Adds a location as the last of its siblings."""
    if new.parent_id is not None:
        parent = get_or_404(session, Location, new.parent_id)
        if _depth(session, parent) >= LOCATION_MAX_DEPTH:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Locations nest at most three deep"
            )
    siblings = _siblings(session, new.parent_id)
    _check_location_name(siblings, new.name)
    location = Location(
        name=new.name,
        parent_id=new.parent_id,
        icon=new.icon,
        position=max((s.position for s in siblings), default=-1) + 1,
    )
    session.add(location)
    session.commit()
    return LocationOut.model_validate(location)


@router.patch("/locations/{location_id}")
def update_location(
    location_id: int, update: LocationUpdate, session: Session = Depends(get_session)
) -> LocationOut:
    """Renames a location, changes its icon, moves it among its siblings or under
    another location (what's inside it going along)."""
    location = get_or_404(session, Location, location_id)
    moving = "parent_id" in update.model_fields_set and update.parent_id != location.parent_id
    if moving:
        _move_location(session, location, update.parent_id, update.name or location.name)
    siblings = _siblings(session, location.parent_id)
    if update.name is not None:
        _check_location_name(siblings, update.name, own_id=location.id)
        location.name = update.name
    if "icon" in update.model_fields_set:
        location.icon = update.icon
    if update.position is not None:
        siblings.remove(location)
        siblings.insert(update.position, location)
        for position, sibling in enumerate(siblings):
            sibling.position = position
    session.commit()
    return LocationOut.model_validate(location)


def _height(session: Session, location: Location) -> int:
    """How many levels deep it and what's inside it go: 1 with nothing inside."""
    children = _siblings(session, location.id)
    return 1 + max((_height(session, child) for child in children), default=0)


def _move_location(session: Session, location: Location, parent_id: int | None, name: str) -> None:
    """Puts a location last under another one (or among the floors), its siblings on both
    sides renumbered."""
    depth = 0
    if parent_id is not None:
        parent = get_or_404(session, Location, parent_id)
        ancestor: Location | None = parent
        while ancestor is not None:
            if ancestor.id == location.id:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "A location can't go inside itself"
                )
            ancestor = ancestor.parent_id and session.get_one(Location, ancestor.parent_id)
        depth = _depth(session, parent)
    if depth + _height(session, location) > LOCATION_MAX_DEPTH:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Locations nest at most three deep"
        )
    joined = _siblings(session, parent_id)
    _check_location_name(joined, name, own_id=location.id)
    left = [s for s in _siblings(session, location.parent_id) if s.id != location.id]
    for position, sibling in enumerate(left):
        sibling.position = position
    location.parent_id = parent_id
    location.position = len(joined)


@router.delete("/locations/{location_id}", **NO_CONTENT)
def delete_location(location_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes a location and its stock rows; refuses while it has child locations. An item
    kept nowhere else stops being restocked."""
    location = get_or_404(session, Location, location_id)
    if session.scalar(select(Location.id).where(Location.parent_id == location.id).limit(1)):
        raise conflict("Delete the locations inside this one first")
    kept_here = list(session.scalars(select(Stock.item_id).where(Stock.location_id == location.id)))
    session.delete(location)
    session.flush()
    _stop_restocking_if_kept_nowhere(session, kept_here)
    session.commit()


# Items


def _check_item_name(
    session: Session, name: str, variant: str | None, own_id: int | None = None
) -> None:
    def key(name: str, variant: str | None) -> tuple[str, str | None]:
        return name.casefold(), variant and variant.casefold()

    wanted = key(name, variant)
    if any(
        key(item.name, item.variant) == wanted and item.id != own_id
        for item in session.scalars(select(Item))
    ):
        raise conflict("An item with this name and variant already exists")


def find_or_make_item(
    session: Session,
    items: list[Item],
    name: str,
    variant: str | None,
    any_variant: bool = False,
) -> Item:
    """The catalogue item of this name and variant, from `items` (the whole catalogue); a
    new one, added to `items`, if there's none. For any variant, the name's item without a
    variant, else its first variant."""
    folded = name.casefold()
    same_name = sorted(
        (item for item in items if item.name.casefold() == folded),
        key=lambda item: (item.variant is not None, (item.variant or "").casefold()),
    )
    if any_variant and same_name:
        return same_name[0]
    variant = None if any_variant else variant
    for item in same_name:
        if (item.variant or "").casefold() == (variant or "").casefold():
            return item
    # Kept nowhere, so not restocked (as an item taken off its last place).
    item = Item(name=same_name[0].name if same_name else name, variant=variant)
    item.restock = False
    item.family = _name_family(same_name)
    session.add(item)
    session.flush()
    items.append(item)
    return item


def _name_family(same_name: list[Item]) -> str | None:
    """The family named after these variants' name, if they're in it: any of them will do."""
    return next((other.family for other in same_name if other.any_variant), None)


@router.get("/items")
def list_items(session: Session = Depends(get_session)) -> list[ItemOut]:
    return [ItemOut.model_validate(item) for item in session.scalars(select(Item))]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(new: ItemCreate, session: Session = Depends(get_session)) -> ItemOut:
    _check_item_name(session, new.name, new.variant)
    check_group(session, new.group_id)
    item = Item(
        name=new.name,
        variant=new.variant,
        group_id=new.group_id,
        icon=new.icon,
        restock=new.restock,
    )
    # Where any variant will do, a new one will too.
    item.family = _name_family(variants_of(session, item))
    session.add(item)
    session.commit()
    return ItemOut.model_validate(item)


@router.patch("/items/{item_id}")
def update_item(
    item_id: int,
    update: ItemUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> ItemOut:
    """Renames or regroups an item. Turning `restock` off takes it off the shopping list;
    turning it on puts it on wherever it's already low or out. `family` is the item's own;
    `any_variant` puts every item of the same name into the family named after it (or, off,
    takes them out of it). Renamed, an item leaves the family of its old name and joins its
    new name's. A family is spelled as it already is."""
    item = get_or_404(session, Item, item_id)
    # What would do instead of it so far: the members left behind are listed anew.
    before = group_of(session, item)
    name = item.name if update.name is None else update.name
    variant = update.variant if "variant" in update.model_fields_set else item.variant
    _check_item_name(session, name, variant, own_id=item.id)
    renamed = name.casefold() != item.name.casefold()
    # The items whose family changes.
    changed: list[Item] = []

    def set_family(other: Item, family: str | None) -> None:
        if other.family != family:
            other.family = family
            if other not in changed:
                changed.append(other)

    if renamed:
        # Where any of its old name's variants would do, it leaves that family; where any of
        # the new name's will, it joins theirs.
        was_any = item.any_variant
        item.name, item.variant = name, variant
        joined = _name_family([other for other in variants_of(session, item) if other is not item])
        if was_any or joined:
            set_family(item, joined)
    item.name, item.variant = name, variant
    if "group_id" in update.model_fields_set:
        check_group(session, update.group_id)
        item.group_id = update.group_id
    if "icon" in update.model_fields_set:
        item.icon = update.icon
    # Days of its own and "any time" exclude each other: the one sent wins.
    if "keeps_days" in update.model_fields_set:
        item.keeps_days = update.keeps_days
        if update.keeps_days is not None:
            item.keeps_any_time = False
    if update.keeps_any_time is not None:
        item.keeps_any_time = update.keeps_any_time
        if update.keeps_any_time:
            item.keeps_days = None
    if update.substitutes is not None:
        catalogue = list(session.scalars(select(Item)))
        substitutes = [
            find_or_make_item(session, catalogue, ref.name, ref.variant)
            for ref in update.substitutes
        ]
        if item in substitutes:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "An item can't stand in for itself"
            )
        # Each once, in the order sent; both ways (vaj for margarin too).
        wanted = list(dict.fromkeys(substitutes))
        for other in catalogue:
            if other in wanted and item not in other.substitutes:
                other.substitutes.append(item)
            elif other not in wanted and item in other.substitutes:
                other.substitutes.remove(item)
        item.substitutes = wanted
    group = variants_of(session, item)
    if update.any_variant is not None:
        for other in group:
            if update.any_variant:
                set_family(other, _family_spelling(session, item.name))
            elif other.any_variant:
                set_family(other, None)
    if "family" in update.model_fields_set:
        set_family(item, _family_spelling(session, update.family))
    regrouped = bool(changed)
    restocked = update.restock is not None and update.restock != item.restock
    if restocked:
        item.restock = update.restock
    opened: list[tuple[int, int, Level]] = []
    if interchangeable(item) and (regrouped or restocked):
        # One line per place where the whole group is short.
        if not item.restock:
            for location_id in _places_of(session, [item.id]):
                close_buy_requests(session, item.id, location_id, user, RequestStatus.CANCELLED)
        members = group_of(session, item)
        merge_variant_requests(session, members, user)
        for location_id in _places_of(session, [other.id for other in members]):
            if sync_variants_at(
                session, members, location_id, user, prefer=item, closed=RequestStatus.CANCELLED
            )[0]:
                opened.append((item.id, location_id, Level.OUT))
    elif regrouped or restocked:
        # Each item on its own again (or restocked or not): as its levels say.
        for other in [other for other in changed if not interchangeable(other)] or [item]:
            short = session.scalars(
                select(Stock).where(Stock.item_id == other.id, Stock.level.in_(SHORT))
            )
            for stock in short:
                if not other.restock:
                    close_buy_requests(
                        session, other.id, stock.location_id, user, RequestStatus.CANCELLED
                    )
                elif open_buy_request(session, other.id, stock.location_id, user):
                    opened.append((other.id, stock.location_id, stock.level))
    # Its group or shelf life may date its lines for cookings differently.
    settle(session, user)
    # The family it left: still one line wherever all of the rest are short.
    left = [other for other in before if other not in group_of(session, item)]
    if left and interchangeable(left[0]):
        members = group_of(session, left[0])
        merge_variant_requests(session, members, user)
        for location_id in _places_of(session, [other.id for other in members]):
            if sync_variants_at(
                session, members, location_id, user, closed=RequestStatus.CANCELLED
            )[0]:
                opened.append((members[0].id, location_id, Level.OUT))
    session.commit()
    for item_id, location_id, level in opened:
        _announce_opened(session, notifier, user, [item_id], location_id, level)
    return ItemOut.model_validate(item)


def _family_spelling(session: Session, family: str | None) -> str | None:
    """A family as the catalogue already spells it, whatever the case it's typed in."""
    if family is None:
        return None
    folded = family.casefold()
    return next(
        (
            known
            for known in session.scalars(select(Item.family).where(Item.family.is_not(None)))
            if known.casefold() == folded
        ),
        family,
    )


def _places_of(session: Session, item_ids: list[int]) -> set[int]:
    return set(session.scalars(select(Stock.location_id).where(Stock.item_id.in_(item_ids))))


@router.delete("/items/{item_id}", **NO_CONTENT)
def delete_item(item_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes an item and its stock rows in every location."""
    session.delete(get_or_404(session, Item, item_id))
    session.commit()


# Stock


@router.get("/stock")
def list_stock(session: Session = Depends(get_session)) -> list[StockOut]:
    """Every stock row in the house; small enough to send whole."""
    return [StockOut.model_validate(stock) for stock in session.scalars(select(Stock))]


def apply_level(
    session: Session, user: User, item: Item, location_id: int, level: Level
) -> tuple[bool, list[int]]:
    """Sets an item's level in a place (keeping it there if it wasn't) and logs it; the
    list follows. Whether it opened a request, and the ones it closed; the caller commits
    and then tells (`tell_level`)."""
    values = {"level": level, "updated_by_id": user.id, "updated_at": utcnow()}
    # One statement, so two people setting the same level at once can't collide.
    session.execute(
        insert(Stock)
        .values(item_id=item.id, location_id=location_id, **values)
        .on_conflict_do_update(index_elements=[Stock.item_id, Stock.location_id], set_=values)
    )
    record(session, user, Action.LEVEL, item=item, location_id=location_id, level=level)
    # Running low is a report: it puts the item on the shopping list. Filling it up again
    # takes it off, whoever did it.
    opened, refilled = False, []
    group = group_of(session, item)
    if interchangeable(item):
        # Short only once every variant (or family member) is, wherever it's kept.
        opened, refilled = sync_variants_at(session, group, location_id, user, prefer=item)
    elif level in SHORT:
        # An item that isn't kept stocked just records that there's none (or little).
        if item.restock:
            opened = open_buy_request(session, item.id, location_id, user)
    else:
        refilled = close_buy_requests(session, item.id, location_id, user, RequestStatus.DONE)
    # A planned cooking may lack it now, or not any more.
    level_changed(session, user, [other.id for other in group])
    return opened, refilled


def tell_level(
    session: Session,
    notifier: Notifier,
    user: User,
    item: Item,
    location_id: int,
    level: Level,
    opened: bool,
    refilled: list[int],
) -> None:
    """Tells the other what `apply_level` did to the list, once it's committed."""
    if opened:
        _announce_opened(
            session, notifier, user, [i.id for i in group_of(session, item)], location_id, level
        )
    # A family taken off at several places is still one line: told once.
    for id in refilled[:1] if interchangeable(item) else refilled:
        request = session.get_one(Request, id)
        notifier.send(
            session, user.id, message_for(session, request, "refilled", user.display_name)
        )


@router.put("/locations/{location_id}/stock/{item_id}")
def set_stock(
    location_id: int,
    item_id: int,
    new: StockSet,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> StockOut:
    """Sets an item's level in a location, adding the item there if it isn't kept there yet."""
    get_or_404(session, Location, location_id)
    item = get_or_404(session, Item, item_id)
    opened, refilled = apply_level(session, user, item, location_id, new.level)
    session.commit()
    tell_level(session, notifier, user, item, location_id, new.level, opened, refilled)
    stock = session.scalars(
        select(Stock)
        .where(Stock.item_id == item_id, Stock.location_id == location_id)
        .execution_options(populate_existing=True)
    ).one()
    return StockOut.model_validate(stock)


@router.post(
    "/locations/{location_id}/stock/{item_id}/request", status_code=status.HTTP_201_CREATED
)
def request_stock(
    location_id: int,
    item_id: int,
    response: Response,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> RequestOut:
    """Puts an item kept here on the shopping list by hand, whatever its level: for what
    isn't kept stocked, bought now and then. If it's already on, returns that (200)."""
    stock = session.scalar(
        select(Stock).where(Stock.item_id == item_id, Stock.location_id == location_id)
    )
    if stock is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock not found")
    opened = open_buy_request(session, item_id, location_id, user)
    if opened:
        record(
            session,
            user,
            Action.LISTED,
            item=session.get_one(Item, item_id),
            location_id=location_id,
        )
    session.commit()
    if opened:
        _announce_opened(session, notifier, user, [item_id], location_id, stock.level)
    else:
        response.status_code = status.HTTP_200_OK
    return RequestOut.model_validate(_active_request(session, [item_id], location_id))


def _active_request(session: Session, item_ids: list[int], location_id: int) -> Request:
    """The newest active request to buy one of these items (variants) for a place."""
    return session.scalars(
        select(Request)
        .where(
            Request.item_id.in_(item_ids),
            Request.location_id == location_id,
            Request.status.in_(ACTIVE),
        )
        .order_by(Request.id.desc())
    ).first()


def _announce_opened(
    session: Session,
    notifier: Notifier,
    user: User,
    item_ids: list[int],
    location_id: int,
    level: Level,
) -> None:
    request = _active_request(session, item_ids, location_id)
    notifier.send(
        session, user.id, message_for(session, request, "reported", user.display_name, level)
    )


# Fuller first, for keeping the fuller of two rows merged by a move.
FULLNESS = {Level.LOTS: 3, Level.PLENTY: 2, Level.LOW: 1, Level.OUT: 0}


@router.post("/stock/move")
def move_stock(
    move: StockMove,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> list[StockOut]:
    """Moves items from one place to another, as when they get put away elsewhere: the
    level goes along, and so does a request to buy one there, claim and all. Where the
    other place keeps the item already, the two merge, the fuller level kept. All or
    nothing. The moved rows, as they end up."""
    if move.from_location_id == move.to_location_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Same place")
    get_or_404(session, Location, move.from_location_id)
    get_or_404(session, Location, move.to_location_id)
    source, target = move.from_location_id, move.to_location_id
    item_ids = list(dict.fromkeys(move.item_ids))
    groups: dict[int, list[Item]] = {}
    for item_id in item_ids:
        item = get_or_404(session, Item, item_id)
        moving = session.scalar(
            select(Stock).where(Stock.item_id == item_id, Stock.location_id == source)
        )
        if moving is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock not found")
        there = session.scalar(
            select(Stock).where(Stock.item_id == item_id, Stock.location_id == target)
        )
        asked = _active_request(session, [item_id], source)
        if there is None:
            moving.location_id = target
            level = moving.level
        else:
            if FULLNESS[moving.level] > FULLNESS[there.level]:
                there.level = moving.level
                there.updated_by_id = moving.updated_by_id
                there.updated_at = moving.updated_at
            level = there.level
            session.delete(moving)
        if asked:
            waiting = _active_request(session, [item_id], target)
            # One active request per item and place: a claim beats an open one.
            if waiting and not (asked.claimed_by_id and not waiting.claimed_by_id):
                asked, waiting = waiting, asked
            if waiting:
                waiting.status = RequestStatus.CANCELLED
                waiting.closed_by_id = user.id
                waiting.closed_at = utcnow()
                session.flush()
            asked.location_id = target
        session.flush()
        if interchangeable(item):
            members = group_of(session, item)
            groups[members[0].id] = members
        elif level in SHORT:
            if item.restock:
                open_buy_request(session, item_id, target, user)
        elif item.restock:
            # Merged into a full row: the move filled it up, nobody bought anything.
            close_buy_requests(session, item_id, target, user, RequestStatus.CANCELLED)
        record(session, user, Action.MOVED, item=item, location_id=source, to_location_id=target)
    for group in groups.values():
        merge_variant_requests(session, group, user)
        for location_id in (source, target):
            sync_variants_at(session, group, location_id, user, closed=RequestStatus.CANCELLED)
    session.commit()
    return [
        StockOut.model_validate(row)
        for row in session.scalars(
            select(Stock)
            .where(Stock.item_id.in_(item_ids), Stock.location_id == target)
            .execution_options(populate_existing=True)
        )
    ]


@router.delete("/locations/{location_id}/stock/{item_id}", **NO_CONTENT)
def remove_stock(
    location_id: int,
    item_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    notifier: Notifier = Depends(get_notifier),
) -> None:
    """Stops keeping an item in a location, cancelling its request to buy it there. Taken
    off its last place, it stops being restocked. Where any variant will do, the others
    kept there may now all be short."""
    stock = session.scalar(
        select(Stock).where(Stock.item_id == item_id, Stock.location_id == location_id)
    )
    if stock is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock not found")
    close_buy_requests(session, item_id, location_id, user, RequestStatus.CANCELLED)
    record(
        session, user, Action.REMOVED, item=session.get_one(Item, item_id), location_id=location_id
    )
    session.delete(stock)
    session.flush()
    _stop_restocking_if_kept_nowhere(session, [item_id])
    item = session.get_one(Item, item_id)
    group = group_of(session, item)
    opened = interchangeable(item) and sync_variants_at(session, group, location_id, user)[0]
    session.commit()
    if opened:
        _announce_opened(
            session, notifier, user, [other.id for other in group], location_id, Level.OUT
        )


def _stop_restocking_if_kept_nowhere(session: Session, item_ids: list[int]) -> None:
    """An item taken off its last place isn't kept any more: not restocked either, until
    someone turns it back on."""
    kept = set(session.scalars(select(Stock.item_id).where(Stock.item_id.in_(item_ids))))
    for item_id in set(item_ids) - kept:
        session.get_one(Item, item_id).restock = False
