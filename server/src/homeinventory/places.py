"""Locations, the item catalogue and stock levels."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import LOCATION_MAX_DEPTH, Item, Location, Stock, User, utcnow
from homeinventory.schemas import (
    ItemCreate,
    ItemOut,
    ItemUpdate,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    StockOut,
    StockSet,
)

# Every route needs an identity, even the read-only ones: the app is for its users only.
router = APIRouter(dependencies=[Depends(current_user)])

NO_CONTENT = {"status_code": status.HTTP_204_NO_CONTENT, "response_class": Response}


def _get(session: Session, model, id: int):
    row = session.get(model, id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return row


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail)


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
        raise _conflict("A location with this name already exists here")


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
        parent = _get(session, Location, new.parent_id)
        if _depth(session, parent) >= LOCATION_MAX_DEPTH:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Locations nest at most three deep"
            )
    siblings = _siblings(session, new.parent_id)
    _check_location_name(siblings, new.name)
    location = Location(
        name=new.name,
        parent_id=new.parent_id,
        position=max((s.position for s in siblings), default=-1) + 1,
    )
    session.add(location)
    session.commit()
    return LocationOut.model_validate(location)


@router.patch("/locations/{location_id}")
def update_location(
    location_id: int, update: LocationUpdate, session: Session = Depends(get_session)
) -> LocationOut:
    """Renames a location or moves it among its siblings."""
    location = _get(session, Location, location_id)
    siblings = _siblings(session, location.parent_id)
    if update.name is not None:
        _check_location_name(siblings, update.name, own_id=location.id)
        location.name = update.name
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
    location = _get(session, Location, location_id)
    if session.scalar(select(Location.id).where(Location.parent_id == location.id).limit(1)):
        raise _conflict("Delete the locations inside this one first")
    session.delete(location)
    session.commit()


# Items


def _check_item_name(session: Session, name: str, own_id: int | None = None) -> None:
    folded = name.casefold()
    if any(
        item.name.casefold() == folded and item.id != own_id
        for item in session.scalars(select(Item))
    ):
        raise _conflict("An item with this name already exists")


@router.get("/items")
def list_items(session: Session = Depends(get_session)) -> list[ItemOut]:
    return [ItemOut.model_validate(item) for item in session.scalars(select(Item))]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(new: ItemCreate, session: Session = Depends(get_session)) -> ItemOut:
    _check_item_name(session, new.name)
    item = Item(name=new.name, category=new.category)
    session.add(item)
    session.commit()
    return ItemOut.model_validate(item)


@router.patch("/items/{item_id}")
def update_item(
    item_id: int, update: ItemUpdate, session: Session = Depends(get_session)
) -> ItemOut:
    item = _get(session, Item, item_id)
    if update.name is not None:
        _check_item_name(session, update.name, own_id=item.id)
        item.name = update.name
    if "category" in update.model_fields_set:
        item.category = update.category
    session.commit()
    return ItemOut.model_validate(item)


@router.delete("/items/{item_id}", **NO_CONTENT)
def delete_item(item_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes an item and its stock rows in every location."""
    session.delete(_get(session, Item, item_id))
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
) -> StockOut:
    """Sets an item's level in a location, adding the item there if it isn't kept there yet."""
    _get(session, Location, location_id)
    _get(session, Item, item_id)
    values = {"level": new.level, "updated_by_id": user.id, "updated_at": utcnow()}
    # One statement, so two people setting the same level at once can't collide.
    session.execute(
        insert(Stock)
        .values(item_id=item_id, location_id=location_id, **values)
        .on_conflict_do_update(index_elements=[Stock.item_id, Stock.location_id], set_=values)
    )
    session.commit()
    stock = session.scalars(
        select(Stock)
        .where(Stock.item_id == item_id, Stock.location_id == location_id)
        .execution_options(populate_existing=True)
    ).one()
    return StockOut.model_validate(stock)


@router.delete("/locations/{location_id}/stock/{item_id}", **NO_CONTENT)
def remove_stock(location_id: int, item_id: int, session: Session = Depends(get_session)) -> None:
    """Stops keeping an item in a location."""
    stock = session.scalar(
        select(Stock).where(Stock.item_id == item_id, Stock.location_id == location_id)
    )
    if stock is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock not found")
    session.delete(stock)
    session.commit()
