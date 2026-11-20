from datetime import date, datetime
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
    AMOUNT_MAX_LENGTH,
    GROUP_ICONS_MAX,
    ICON_MAX_LENGTH,
    LINK_MAX_LENGTH,
    NAME_MAX_LENGTH,
    NICKNAME_MAX_LENGTH,
    NOTE_MAX_LENGTH,
    VARIANT_MAX_LENGTH,
    Action,
    Hue,
    Level,
    RecipeKind,
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

# A family of items any of which will do; blank or null for none.
Family = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=NAME_MAX_LENGTH)] | None,
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


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Unset for a group; a subgroup's group.
    parent_id: int | None
    name: str
    position: int
    # A group's tile colour; none for a subgroup (it wears its group's).
    hue: Hue | None
    # The icons that suggest it for an item with no group chosen.
    icons: list[str]


IconName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=ICON_MAX_LENGTH)
]
GroupIcons = Annotated[list[IconName], Field(max_length=GROUP_ICONS_MAX)]


class GroupCreate(BaseModel):
    name: Name
    # A subgroup's group; unset for a group, which then needs a colour.
    parent_id: int | None = None
    hue: Hue | None = None
    icons: GroupIcons = []


class GroupUpdate(BaseModel):
    # Only the fields sent change.
    name: Name | None = None
    # A group's colour.
    hue: Hue | None = None
    icons: GroupIcons | None = None
    # The new index among its siblings; past the end means last.
    position: int | None = Field(default=None, ge=0)
    # A subgroup's group: sent, it moves there, last unless `position` says otherwise.
    parent_id: int | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    variant: str | None
    # Its group or subgroup; unset: taken from the icon.
    group_id: int | None
    icon: str | None
    # Running low puts it on the shopping list.
    restock: bool
    # Any member of this family will do instead ("Pékáru"); the item's own.
    family: str | None
    # Its family is named after it: any of its variants will do.
    any_variant: bool
    # What a recipe can use instead.
    substitute_ids: list[int]


class ItemCreate(BaseModel):
    name: Name
    variant: Variant = None
    # Unset: taken from the icon.
    group_id: int | None = None
    icon: Icon = None
    restock: bool = True


# More than anything has; a bound on what one request can add to the catalogue.
SUBSTITUTES_MAX = 10


class ItemRef(BaseModel):
    """An item by name and variant; made (kept nowhere) if the catalogue hasn't one."""

    name: Name
    variant: Variant = None


class ItemUpdate(BaseModel):
    # Only the fields sent change; send a blank or null variant, or a null group, to
    # clear it.
    name: Name | None = None
    variant: Variant = None
    group_id: int | None = None
    icon: Icon = None
    restock: bool | None = None
    # On: every item of the same name joins the family named after it; off: those in it
    # leave it.
    any_variant: bool | None = None
    # This item's alone; null takes it out of one.
    family: Family = None
    # Replaces them all.
    substitutes: list[ItemRef] | None = Field(default=None, max_length=SUBSTITUTES_MAX)


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
    # The planned cooking it's for, if any: needed before its day. A buy request of an item
    # with no place is only for that.
    cooking_id: int | None


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
    # Who did it, when it's marked for them (the admin pages); unset: whoever marks it.
    by: int | None = None


class ChoreDone(BaseModel):
    # Who did it, when it's marked for them (the admin pages); unset: whoever marks it.
    by: int | None = None


class RequestKeep(BaseModel):
    """Something written on the shopping list, bought and kept from now on: as this item
    (an existing one of the same name and variant, or a new one) in this place."""

    location_id: int
    name: Name
    variant: Variant = None
    # Whether running low puts it on the list again; off, since what's written on the
    # list by hand is mostly bought now and then.
    restock: bool = False
    # Who bought it, when it's marked for them (the admin pages); unset: whoever marks it.
    by: int | None = None


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


# Recipes


def _optional_text(max_length: int):
    return Annotated[
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=max_length)] | None,
        AfterValidator(_blank_to_none),
    ]


def _web_link(value: str | None) -> str | None:
    if value is not None and not value.lower().startswith(("http://", "https://")):
        raise ValueError("A link starts with http:// or https://")
    return value


Amount = _optional_text(AMOUNT_MAX_LENGTH)
Note = _optional_text(NOTE_MAX_LENGTH)
Link = Annotated[_optional_text(LINK_MAX_LENGTH), AfterValidator(_web_link)]

# More than any dish takes; a bound on what one request can add to the catalogue.
INGREDIENTS_MAX = 60


class IngredientIn(BaseModel):
    """An ingredient by name: the catalogue item of this name and variant, made (kept
    nowhere) if there's none. `any_variant`: any variant of the name will do, the variant
    is left out. `recipe`: the name is a recipe's, taken whole (a part, "Nokedli"); it has
    no variant."""

    name: Name
    variant: Variant = None
    any_variant: bool = False
    recipe: bool = False
    amount: Amount = None
    optional: bool = False

    @model_validator(mode="after")
    def part_has_no_variant(self) -> "IngredientIn":
        if self.recipe and (self.variant or self.any_variant):
            raise ValueError("A recipe has no variants")
        return self


class IngredientOut(BaseModel):
    """An item (`item_id`) or another recipe (`part_id`), never both."""

    model_config = ConfigDict(from_attributes=True)

    item_id: int | None
    part_id: int | None
    any_variant: bool
    amount: str | None
    optional: bool


class RecipeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str | None
    kind: RecipeKind
    note: str | None
    link: str | None
    ingredients: list[IngredientOut]


class RecipeCreate(BaseModel):
    name: Name
    icon: Icon = None
    kind: RecipeKind = RecipeKind.MAIN
    note: Note = None
    link: Link = None
    ingredients: list[IngredientIn] = Field(default=[], max_length=INGREDIENTS_MAX)


class RecipeUpdate(BaseModel):
    # Only the fields sent change; `ingredients`, sent, replaces them all.
    name: Name | None = None
    icon: Icon = None
    kind: RecipeKind | None = None
    note: Note = None
    link: Link = None
    ingredients: list[IngredientIn] | None = Field(default=None, max_length=INGREDIENTS_MAX)


# Cookings: recipes planned for a day


class CookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipe_id: int
    side_id: int | None
    day: date
    cook_id: int | None
    cook_name: str | None
    created_by_name: str | None
    done_at: datetime | None
    # What was bought for it that's kept nowhere: it counts as at home for this cooking.
    bought_item_ids: list[int] = []


class CookingCreate(BaseModel):
    recipe_id: int
    # A side dish, for a main course (or a menu naming none).
    side_id: int | None = None
    # Today or later, the household's day.
    day: date
    cook_id: int | None = None


class CookingUpdate(BaseModel):
    # Only the fields sent change: a new day moves it; `side_id` or `cook_id` sent as null
    # takes the side dish or the cook off.
    day: date | None = None
    side_id: int | None = None
    cook_id: int | None = None


class LevelLeft(BaseModel):
    """What's left of an item in a place after cooking."""

    item_id: int
    location_id: int
    level: Level


class CookingDone(BaseModel):
    # Only the levels that changed need sending.
    levels: list[LevelLeft] = Field(default=[], max_length=200)
