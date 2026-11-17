"""Locations, the item catalogue and stock levels."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.activity import record
from homeinventory.common import NO_CONTENT, announce_changes, conflict, get_notifier, get_or_404
from homeinventory.db import get_session
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
from homeinventory.requests import close_buy_requests, open_buy_request
from homeinventory.schemas import (
    ItemCreate,
    ItemOut,
    ItemUpdate,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    RequestOut,
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
    """Renames a location, changes its icon or moves it among its siblings."""
    location = get_or_404(session, Location, location_id)
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


@router.delete("/locations/{location_id}", **NO_CONTENT)
def delete_location(location_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes a location and its stock rows; refuses while it has child locations."""
    location = get_or_404(session, Location, location_id)
    if session.scalar(select(Location.id).where(Location.parent_id == location.id).limit(1)):
        raise conflict("Delete the locations inside this one first")
    session.delete(location)
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


@router.get("/items")
def list_items(session: Session = Depends(get_session)) -> list[ItemOut]:
    return [ItemOut.model_validate(item) for item in session.scalars(select(Item))]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(new: ItemCreate, session: Session = Depends(get_session)) -> ItemOut:
    _check_item_name(session, new.name, new.variant)
    item = Item(name=new.name, variant=new.variant, category=new.category, icon=new.icon)
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
    turning it on puts it on wherever it's already low or out."""
    item = get_or_404(session, Item, item_id)
    name = item.name if update.name is None else update.name
    variant = update.variant if "variant" in update.model_fields_set else item.variant
    _check_item_name(session, name, variant, own_id=item.id)
    item.name, item.variant = name, variant
    if "category" in update.model_fields_set:
        item.category = update.category
    if "icon" in update.model_fields_set:
        item.icon = update.icon
    opened = []
    if update.restock is not None and update.restock != item.restock:
        item.restock = update.restock
        short = session.scalars(
            select(Stock).where(Stock.item_id == item.id, Stock.level.in_((Level.LOW, Level.OUT)))
        )
        for stock in short:
            if not item.restock:
                close_buy_requests(
                    session, item.id, stock.location_id, user, RequestStatus.CANCELLED
                )
            elif open_buy_request(session, item.id, stock.location_id, user):
                opened.append(stock)
    session.commit()
    for stock in opened:
        _announce_opened(session, notifier, user, item.id, stock.location_id, stock.level)
    return ItemOut.model_validate(item)


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
    values = {"level": new.level, "updated_by_id": user.id, "updated_at": utcnow()}
    # One statement, so two people setting the same level at once can't collide.
    session.execute(
        insert(Stock)
        .values(item_id=item_id, location_id=location_id, **values)
        .on_conflict_do_update(index_elements=[Stock.item_id, Stock.location_id], set_=values)
    )
    record(session, user, Action.LEVEL, item=item, location_id=location_id, level=new.level)
    # Running low is a report: it puts the item on the shopping list. Filling it up again
    # takes it off, whoever did it.
    opened, refilled = False, []
    if new.level in (Level.LOW, Level.OUT):
        # An item that isn't kept stocked just records that there's none (or little).
        if item.restock:
            opened = open_buy_request(session, item_id, location_id, user)
    else:
        refilled = close_buy_requests(session, item_id, location_id, user, RequestStatus.DONE)
    session.commit()
    if opened:
        _announce_opened(session, notifier, user, item_id, location_id, new.level)
    for id in refilled:
        request = session.get_one(Request, id)
        notifier.send(
            session, user.id, message_for(session, request, "refilled", user.display_name)
        )
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
        _announce_opened(session, notifier, user, item_id, location_id, stock.level)
    else:
        response.status_code = status.HTTP_200_OK
    return RequestOut.model_validate(_active_request(session, item_id, location_id))


def _active_request(session: Session, item_id: int, location_id: int) -> Request:
    return session.scalars(
        select(Request).where(
            Request.item_id == item_id,
            Request.location_id == location_id,
            Request.status.in_(ACTIVE),
        )
    ).one()


def _announce_opened(
    session: Session,
    notifier: Notifier,
    user: User,
    item_id: int,
    location_id: int,
    level: Level,
) -> None:
    request = _active_request(session, item_id, location_id)
    notifier.send(
        session, user.id, message_for(session, request, "reported", user.display_name, level)
    )


@router.delete("/locations/{location_id}/stock/{item_id}", **NO_CONTENT)
def remove_stock(
    location_id: int,
    item_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> None:
    """Stops keeping an item in a location, cancelling its request to buy it there."""
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
    session.commit()
