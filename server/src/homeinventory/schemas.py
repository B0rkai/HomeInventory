from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from homeinventory.models import (
    ICON_MAX_LENGTH,
    NAME_MAX_LENGTH,
    NICKNAME_MAX_LENGTH,
    VARIANT_MAX_LENGTH,
    Action,
    Category,
    Level,
    RequestKind,
    RequestStatus,
)


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
    # The Admin user of the LAN admin pages, not a person.
    admin: bool


class AdminLogin(BaseModel):
    password: str = Field(max_length=200)


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


Variant = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=VARIANT_MAX_LENGTH)] | None,
    AfterValidator(_blank_to_none),
]

# An icon name from the web client's set. Null: let the client guess from the name; empty: no icon.
Icon = Annotated[str, StringConstraints(strip_whitespace=True, max_length=ICON_MAX_LENGTH)] | None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    position: int
    icon: str | None


class LocationCreate(BaseModel):
    name: Name
    # Unset for a floor.
    parent_id: int | None = None
    icon: Icon = None


class LocationUpdate(BaseModel):
    # Only the fields sent change.
    name: Name | None = None
    icon: Icon = None
    # The new index among its siblings; past the end means last.
    position: int | None = Field(default=None, ge=0)
    # Sent: moves it (and what's inside it) under another location, null to be a floor;
    # last among its new siblings unless `position` says otherwise.
    parent_id: int | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    variant: str | None
    category: Category | None
    icon: str | None
    # Running low puts it on the shopping list.
    restock: bool
    # Any variant will do: shared by every item of the same name.
    any_variant: bool


class ItemCreate(BaseModel):
    name: Name
    variant: Variant = None
    # Unset: taken from the icon.
    category: Category | None = None
    icon: Icon = None
    restock: bool = True


class ItemUpdate(BaseModel):
    # Only the fields sent change; send a blank or null variant, or a null category, to
    # clear it.
    name: Name | None = None
    variant: Variant = None
    category: Category | None = None
    icon: Icon = None
    restock: bool | None = None
    # Applies to every item of the same name.
    any_variant: bool | None = None


class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: int
    location_id: int
    level: Level
    updated_by_name: str
    updated_at: datetime


class StockSet(BaseModel):
    level: Level


class StockMove(BaseModel):
    """Items kept in one place, to be kept in another instead."""

    item_ids: list[int] = Field(min_length=1, max_length=500)
    from_location_id: int
    to_location_id: int


class ChoreOut(BaseModel):
    id: int
    # Unset for a chore of the whole house.
    location_id: int | None
    name: str
    icon: str | None
    # When it was last done and by whom; unset if never.
    last_done_at: datetime | None
    last_done_by_name: str | None
    # Repeats every so many days after it's done, or on these weekdays (Monday = 0).
    repeat_days: int | None
    repeat_weekdays: list[int]
    # When it falls due next; if that's past, it has an open request. Unset if it
    # doesn't repeat.
    next_due_at: datetime | None
    # A to-do for once: it goes when it's done.
    one_off: bool


class ChoreCreate(BaseModel):
    # Unset for a chore of the whole house.
    location_id: int | None = None
    name: Name
    icon: Icon = None
    # A to-do for once: reported right away, gone once done or cancelled.
    one_off: bool = False


Weekday = Annotated[int, Field(ge=0, le=6)]


class ChoreUpdate(BaseModel):
    # Only the fields sent change. Setting one schedule clears the other; sending both as
    # null stops the chore repeating.
    name: Name | None = None
    icon: Icon = None
    repeat_days: Annotated[int, Field(ge=1, le=365)] | None = None
    repeat_weekdays: Annotated[list[Weekday], Field(min_length=1, max_length=7)] | None = None

    @model_validator(mode="after")
    def one_schedule(self) -> "ChoreUpdate":
        if self.repeat_days is not None and self.repeat_weekdays is not None:
            raise ValueError("Set repeat_days or repeat_weekdays, not both")
        return self


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: RequestKind
    # Set for a buy request of an item.
    item_id: int | None
    # Set for a buy request written in by hand, with no item behind it.
    name: str | None
    # Set for a chore request.
    chore_id: int | None
    # Unset for a chore of the whole house.
    location_id: int | None
    status: RequestStatus
    # Unset when a scheduled chore fell due by itself.
    created_by_id: int | None
    created_by_name: str | None
    created_at: datetime
    claimed_by_id: int | None
    claimed_by_name: str | None
    claimed_at: datetime | None
    # The latest nudge to whoever claimed it, and who sent it.
    reminded_by_name: str | None
    reminded_at: datetime | None


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: datetime
    # Unset if the user is gone.
    user_name: str | None
    action: Action
    kind: RequestKind
    # Unset once the item or chore is deleted; the name is as it was.
    item_id: int | None
    chore_id: int | None
    name: str
    variant: str | None
    location_id: int | None
    # Where it went, for "moved".
    to_location_id: int | None
    # Who it was given to, for "assigned".
    assignee_name: str | None
    level: Level | None


class RequestCreate(BaseModel):
    """Something to buy that isn't kept track of, written on the shopping list."""

    name: Name


class RequestDone(BaseModel):
    # For an item where any variant will do: the variant bought, if not the one asked for.
    item_id: int | None = None


class RequestKeep(BaseModel):
    """Something written on the shopping list, bought and kept from now on: as this item
    (an existing one of the same name and variant, or a new one) in this place."""

    location_id: int
    name: Name
    variant: Variant = None
    # Whether running low puts it on the list again; off, since what's written on the
    # list by hand is mostly bought now and then.
    restock: bool = False


class RequestAssign(BaseModel):
    """Whom to give a request to: claimed for them."""

    user_id: int


class PushSubscriptionOut(BaseModel):
    """A device that gets notifications, for the admin pages."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    user_agent: str | None
    created_at: datetime
    # Unset until the app starts on it again.
    seen_at: datetime | None


class PushKey(BaseModel):
    # base64url, for PushManager.subscribe's applicationServerKey.
    public_key: str


class PushKeys(BaseModel):
    p256dh: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    auth: Annotated[str, StringConstraints(min_length=1, max_length=100)]


class PushSubscriptionIn(BaseModel):
    """A browser's PushSubscription, as its toJSON() gives it."""

    endpoint: Annotated[str, StringConstraints(pattern=r"^https://", max_length=1000)]
    keys: PushKeys
