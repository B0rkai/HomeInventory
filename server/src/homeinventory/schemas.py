from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from homeinventory.models import CATEGORY_MAX_LENGTH, NAME_MAX_LENGTH, NICKNAME_MAX_LENGTH, Level


class Health(BaseModel):
    status: Literal["ok"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    name: str
    nickname: str | None
    # The nickname if set, else the full name: what the UI shows.
    display_name: str


def _blank_to_none(value: str | None) -> str | None:
    return value or None


Nickname = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=NICKNAME_MAX_LENGTH)] | None,
    AfterValidator(_blank_to_none),
]


class UserUpdate(BaseModel):
    # Blank or null clears it.
    nickname: Nickname


Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH)
]

Category = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=CATEGORY_MAX_LENGTH)] | None,
    AfterValidator(_blank_to_none),
]


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    position: int


class LocationCreate(BaseModel):
    name: Name
    # Unset for a floor.
    parent_id: int | None = None


class LocationUpdate(BaseModel):
    name: Name | None = None
    # The new index among its siblings; past the end means last.
    position: int | None = Field(default=None, ge=0)


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str | None


class ItemCreate(BaseModel):
    name: Name
    category: Category = None


class ItemUpdate(BaseModel):
    # Only the fields sent change; send a blank or null category to clear it.
    name: Name | None = None
    category: Category = None


class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: int
    location_id: int
    level: Level
    updated_by_name: str
    updated_at: datetime


class StockSet(BaseModel):
    level: Level
