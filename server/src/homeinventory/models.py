from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    MetaData,
    String,
    TypeDecorator,
    UniqueConstraint,
    false,
    text,
    true,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NICKNAME_MAX_LENGTH = 40
NAME_MAX_LENGTH = 60
VARIANT_MAX_LENGTH = 40
# An icon's name in the web client's set (e.g. "toilet-paper").
ICON_MAX_LENGTH = 32
# Floor -> room -> spot.
LOCATION_MAX_DEPTH = 3


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """A timezone-aware UTC datetime. SQLite has no time zones, so it stores naive UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime; use an aware one (e.g. utcnow())")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=UTC)


class Base(DeclarativeBase):
    # Named constraints, so Alembic's batch mode can alter them on SQLite.
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Tailscale login, e.g. someone@gmail.com.
    login: Mapped[str] = mapped_column(String(255), unique=True)
    # Full name from Tailscale, kept in sync on every request.
    name: Mapped[str] = mapped_column(String(255))
    # What the app calls them ("Ákos"); chosen by the user, unset until then.
    nickname: Mapped[str | None] = mapped_column(String(NICKNAME_MAX_LENGTH))
    # Only the Admin user has one (scrypt, see admin.py): it logs in on the LAN port.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    @property
    def display_name(self) -> str:
        return self.nickname or self.name

    @property
    def admin(self) -> bool:
        return self.login == ADMIN_LOGIN


# The Admin user's login; a Tailscale login is an email address, so never this.
ADMIN_LOGIN = "admin"


class AdminSession(Base):
    """A browser logged in as Admin on the LAN port, by its cookie."""

    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    # SHA-256 of the cookie's token, so the database alone can't log anyone in.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Sessions not used for a while expire (admin.SESSION_DAYS).
    used_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Location(Base):
    """A place in the house: a tree of floor -> room -> spot."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    # A location with children can't be deleted (the API refuses), so no cascade here.
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), index=True)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Order among its siblings, 0 first: floors read bottom-up or top-down, not by name.
    position: Mapped[int] = mapped_column(default=0)
    # Unset: the client guesses one from the name. Empty: no icon.
    icon: Mapped[str | None] = mapped_column(String(ICON_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


def str_enum(enum: type[StrEnum], name: str) -> Enum:
    """Stores an enum's values as text, with a CHECK constraint (named ck_<table>_<name>)."""
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        values_callable=lambda members: [member.value for member in members],
    )


class Category(StrEnum):
    """A fixed set of item groups, one per icon colour in the web client."""

    FOOD = "food"
    DRINK = "drink"
    CLEAN = "clean"
    BODY = "body"
    HOME = "home"


class Item(Base):
    """A supply in the catalogue: "Cukor", "WC-papír", or a variant: "Konzerv" + "kukorica"."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unique with the variant, ignoring case; the API checks it, since SQLite's NOCASE
    # only folds ASCII.
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Tells apart kinds kept of the same item ("35 l", "60 l"); items sharing a name
    # are shown as one group. Unset for an item with no variants.
    variant: Mapped[str | None] = mapped_column(String(VARIANT_MAX_LENGTH))
    # Groups the catalogue and the shopping list. Unset: the client takes it from the
    # item's icon, whose colour already says the same.
    category: Mapped[Category | None] = mapped_column(str_enum(Category, "category"))
    # Kept stocked: running low puts it on the shopping list. Off for what's only bought
    # now and then (ice cream, salmon): its level still says whether there's any.
    restock: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Any of its variants will do ("Pékáru": kenyér or zsemle): a place is short of it only
    # once every variant kept there is low or out, and then it's one line on the list.
    # Shared by all the items of the same name; the API keeps them alike.
    any_variant: Mapped[bool] = mapped_column(default=False, server_default=false())
    # A group of different items any of which will do ("Pékáru": Kenyér, Zsemle, Kifli), as
    # `any_variant` is for the variants of one: short only once every member kept in a place
    # is, one line on the list. Shared by the items of the same name; the API keeps them
    # alike, and one spelling per group.
    family: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH))
    # Unset: the client guesses one from the name. Empty: no icon.
    icon: Mapped[str | None] = mapped_column(String(ICON_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    # What a recipe can use instead of it ("Vaj": "Margarin · sütő"); always both ways, the
    # API keeps the pair.
    substitutes: Mapped[list["Item"]] = relationship(
        secondary="item_substitutes",
        primaryjoin="Item.id == ItemSubstitute.item_id",
        secondaryjoin="Item.id == ItemSubstitute.substitute_id",
        order_by="Item.id",
        lazy="selectin",
    )

    @property
    def substitute_ids(self) -> list[int]:
        return [item.id for item in self.substitutes]


class ItemSubstitute(Base):
    """An item a recipe can use when the one it names isn't at home, one row each way. Only
    recipes look at it: the item still goes on the shopping list as it would."""

    __tablename__ = "item_substitutes"
    __table_args__ = (CheckConstraint("item_id != substitute_id", name="not_itself"),)

    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    substitute_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Level(StrEnum):
    # Stocked up for weeks, e.g. a 20-pack of toilet paper in the basement.
    LOTS = "lots"
    PLENTY = "plenty"
    LOW = "low"
    OUT = "out"


class Stock(Base):
    """How much of an item a location has. A row means the item is kept there."""

    __tablename__ = "stock"
    __table_args__ = (UniqueConstraint("item_id", "location_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"))
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[Level] = mapped_column(str_enum(Level, "level"))
    updated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    updated_by: Mapped[User] = relationship(lazy="joined")

    @property
    def updated_by_name(self) -> str:
        return self.updated_by.display_name


class Chore(Base):
    """A job that comes up at a place and is reported when it does: "Kuka ürítése"."""

    __tablename__ = "chores"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unset for a chore of the whole house ("Porszívózás").
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    # Unique within its location, ignoring case (checked by the API).
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Unset: the client guesses one from the name. Empty: no icon.
    icon: Mapped[str | None] = mapped_column(String(ICON_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # A repeating chore falls due by itself (schedule.py): every so many days after it was
    # last done, or on these weekdays (a bit per day, Monday = 1). At most one is set.
    repeat_days: Mapped[int | None]
    repeat_weekdays: Mapped[int | None]
    # When the schedule was last changed; occurrences before it don't count.
    scheduled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # A to-do for once ("Hívd fel a szerelőt"): reported as it's made, and gone, with its
    # request, once that's done or cancelled. Not listed among a place's chores.
    one_off: Mapped[bool] = mapped_column(default=False, server_default=false())

    @property
    def weekdays(self) -> frozenset[int]:
        """The repeat weekdays, Monday = 0."""
        bits = self.repeat_weekdays or 0
        return frozenset(day for day in range(7) if bits & (1 << day))


class RequestKind(StrEnum):
    BUY = "buy"
    CHORE = "chore"


class RequestStatus(StrEnum):
    OPEN = "open"
    # Someone said they're on it.
    CLAIMED = "claimed"
    DONE = "done"
    CANCELLED = "cancelled"


ACTIVE = (RequestStatus.OPEN, RequestStatus.CLAIMED)
# The partial unique indexes' condition. ON CONFLICT must repeat it word for word, so
# it's text rather than a bound expression.
ACTIVE_WHERE = text("status IN ('open', 'claimed')")


class Request(Base):
    """Something to buy (an item running low somewhere, or anything written on the shopping
    list) or a chore to do, until it's done."""

    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'buy' AND chore_id IS NULL AND ("
            "(item_id IS NOT NULL AND name IS NULL)"
            " OR (item_id IS NULL AND location_id IS NULL AND name IS NOT NULL)))"
            " OR (kind = 'chore' AND chore_id IS NOT NULL AND item_id IS NULL AND name IS NULL"
            " AND cooking_id IS NULL)",
            name="target",
        ),
        # At most one active request per item and place, or per chore: reporting twice
        # finds the first one.
        Index(
            "uq_requests_active_buy",
            "item_id",
            "location_id",
            unique=True,
            sqlite_where=ACTIVE_WHERE,
        ),
        Index("uq_requests_active_chore", "chore_id", unique=True, sqlite_where=ACTIVE_WHERE),
        # And one per item kept nowhere, bought for a cooking.
        Index(
            "uq_requests_active_placeless",
            "item_id",
            unique=True,
            sqlite_where=text(
                "status IN ('open', 'claimed') AND item_id IS NOT NULL AND location_id IS NULL"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[RequestKind] = mapped_column(str_enum(RequestKind, "kind"))
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"))
    chore_id: Mapped[int | None] = mapped_column(ForeignKey("chores.id", ondelete="CASCADE"))
    # Something to buy that isn't kept track of ("Elem", "Szülinapi gyertya"), written on the
    # shopping list as it is: no item, no place.
    name: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH))
    # Where it's needed; a chore's own location, unset for a chore of the whole house, or
    # for an item kept nowhere, bought for a cooking.
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[RequestStatus] = mapped_column(str_enum(RequestStatus, "status"))
    # Unset when a scheduled chore fell due by itself.
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    claimed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    claimed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Who marked it done or cancelled it, and when.
    closed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # The latest "when will it be done?" nudge to whoever claimed it; once a day at most.
    reminded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reminded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # The earliest planned cooking it's needed for, if any: it's due before that day.
    cooking_id: Mapped[int | None] = mapped_column(
        ForeignKey("cookings.id", ondelete="SET NULL"), index=True
    )
    # Put on for a cooking (not a shortage, nor by hand): it goes again once no planned
    # cooking needs it, unless someone's buying it.
    for_cooking: Mapped[bool] = mapped_column(default=False, server_default=false())

    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id], lazy="joined")
    claimed_by: Mapped[User | None] = relationship(foreign_keys=[claimed_by_id], lazy="joined")
    closed_by: Mapped[User | None] = relationship(foreign_keys=[closed_by_id], lazy="joined")
    reminded_by: Mapped[User | None] = relationship(foreign_keys=[reminded_by_id], lazy="joined")

    @property
    def created_by_name(self) -> str | None:
        return self.created_by and self.created_by.display_name

    @property
    def claimed_by_name(self) -> str | None:
        return self.claimed_by and self.claimed_by.display_name

    @property
    def reminded_by_name(self) -> str | None:
        return self.reminded_by and self.reminded_by.display_name


class PushSubscription(Base):
    """A device (a browser on a phone) that gets its user's notifications."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The push service's URL for this device; a device signing in as the other user
    # takes it over.
    endpoint: Mapped[str] = mapped_column(String(1000), unique=True)
    # The device's keys for encrypting the messages (base64url).
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # The browser's User-Agent, to tell devices apart in the admin pages.
    user_agent: Mapped[str | None] = mapped_column(String(300))
    # The app sends it again on every start: a device not seen for long is likely gone.
    seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(lazy="joined")

    @property
    def user_name(self) -> str:
        return self.user.display_name


# Recipes (the meal planner)

AMOUNT_MAX_LENGTH = 40
NOTE_MAX_LENGTH = 2000
LINK_MAX_LENGTH = 500


class RecipeKind(StrEnum):
    """What a recipe is on the table: what goes with it when it's planned."""

    # A main course: a side dish can go with it (Rántott hús).
    MAIN = "main"
    # A dish on its own: nothing goes with it (Rakott krumpli, főzelék).
    WHOLE = "whole"
    SOUP = "soup"
    # Goes with a main course (Krumplipüré, Nokedli).
    SIDE = "side"
    DESSERT = "dessert"
    # A favourite combination: its ingredients are the recipes it serves (a soup, a main
    # course and its side dish, a dessert).
    MENU = "menu"
    # Only a part of other recipes (Besamel, Panír).
    BASE = "base"


class Recipe(Base):
    """A dish the household cooks: what it takes, for planning a cooking of it."""

    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unique ignoring case (checked by the API).
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Unset: the client guesses one from the name. Empty: no icon.
    icon: Mapped[str | None] = mapped_column(String(ICON_MAX_LENGTH))
    kind: Mapped[RecipeKind] = mapped_column(
        str_enum(RecipeKind, "kind"), default=RecipeKind.MAIN, server_default=RecipeKind.MAIN
    )
    note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    # Where the recipe is written down in full (a web page).
    link: Mapped[str | None] = mapped_column(String(LINK_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        foreign_keys="RecipeIngredient.recipe_id",
        order_by="RecipeIngredient.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class RecipeIngredient(Base):
    """What a recipe takes: a catalogue item, or any variant of its name ("Konzerv", any),
    or another recipe (a part: "Nokedli" in "Paprikás csirke"), with what that one takes.
    No quantity the app counts: levels say whether there's enough, `amount` is a note for
    the cook."""

    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        UniqueConstraint("recipe_id", "item_id"),
        # Part first: it is also the index for finding what takes a recipe.
        UniqueConstraint("part_id", "recipe_id"),
        CheckConstraint("(item_id IS NULL) != (part_id IS NULL)", name="item_or_part"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    # An item deleted from the catalogue leaves the recipes it was in.
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), index=True
    )
    # So does a recipe deleted. Never the recipe itself, nor one that takes it (the API
    # checks).
    part_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))

    part: Mapped[Recipe | None] = relationship(foreign_keys=[part_id], lazy="selectin")
    # Any variant of the item's name will do.
    any_variant: Mapped[bool] = mapped_column(default=False, server_default=false())
    # "50 dkg", "2 fej": for the cook, the app doesn't count it.
    amount: Mapped[str | None] = mapped_column(String(AMOUNT_MAX_LENGTH))
    # Garnish and the like: used if there is some, never listed or warned about.
    optional: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Order within the recipe.
    position: Mapped[int] = mapped_column(default=0)


class Cooking(Base):
    """A recipe planned for a day (its side dish with it), until it's cooked. What it needs
    and the house lacks is on the shopping list (requests point at it); cancelling one
    deletes it."""

    __tablename__ = "cookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    # A main course's side dish (or a menu's that names none), picked when planned.
    side_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"))
    # The household's local day; no meal, no time.
    day: Mapped[date] = mapped_column(Date)
    # Who cooks it, once someone says so.
    cook_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Set once it's cooked; a cooked one is history, no longer planned.
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    recipe: Mapped[Recipe] = relationship(foreign_keys=[recipe_id], lazy="joined")
    side: Mapped[Recipe | None] = relationship(foreign_keys=[side_id], lazy="joined")
    cook: Mapped[User | None] = relationship(foreign_keys=[cook_id], lazy="joined")
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id], lazy="joined")

    @property
    def cook_name(self) -> str | None:
        return self.cook and self.cook.display_name

    @property
    def created_by_name(self) -> str | None:
        return self.created_by and self.created_by.display_name


class Action(StrEnum):
    """What someone did, as the activity log records it."""

    # Set an item's level in a place; adding the item there included.
    LEVEL = "level"
    # Stopped keeping an item in a place.
    REMOVED = "removed"
    # Put an item on the shopping list by hand.
    LISTED = "listed"
    # Reported a chore, or added a one-off to-do.
    REPORTED = "reported"
    CLAIMED = "claimed"
    UNCLAIMED = "unclaimed"
    # Bought an item, or did a chore.
    DONE = "done"
    # Brought an item over from a place that has lots of it.
    FETCHED = "fetched"
    CANCELLED = "cancelled"
    # Asked whoever claimed a request when it'll be done.
    REMINDED = "reminded"
    # Moved an item from one place to another, its level along.
    MOVED = "moved"
    # Claimed a request for someone else (the admin pages).
    ASSIGNED = "assigned"


class Activity(Base):
    """One entry in the activity log: who did what, to which item or chore, where."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[Action] = mapped_column(str_enum(Action, "action"))
    # Whether it was about an item or a chore, even once that's deleted.
    kind: Mapped[RequestKind] = mapped_column(str_enum(RequestKind, "kind"))
    # One of these two. The links go when the thing is deleted (a one-off to-do is, once
    # done); the name stays, as it was.
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"))
    chore_id: Mapped[int | None] = mapped_column(ForeignKey("chores.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    variant: Mapped[str | None] = mapped_column(String(VARIANT_MAX_LENGTH))
    # Unset for a chore of the whole house, or once the place is deleted.
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    # Where it went, for MOVED (location_id is where from).
    to_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL")
    )
    # Who it was given to, for ASSIGNED.
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # The level set, for LEVEL.
    level: Mapped[Level | None] = mapped_column(str_enum(Level, "level"))

    user: Mapped[User | None] = relationship(lazy="joined", foreign_keys=[user_id])
    assignee: Mapped[User | None] = relationship(lazy="joined", foreign_keys=[assignee_id])

    @property
    def user_name(self) -> str | None:
        return self.user and self.user.display_name

    @property
    def assignee_name(self) -> str | None:
        return self.assignee and self.assignee.display_name
