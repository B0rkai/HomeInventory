from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    MetaData,
    String,
    TypeDecorator,
    UniqueConstraint,
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
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    @property
    def display_name(self) -> str:
        return self.nickname or self.name


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
    # Unset: the client guesses one from the name. Empty: no icon.
    icon: Mapped[str | None] = mapped_column(String(ICON_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


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
    """Something to buy (an item running low somewhere) or a chore to do, until it's done."""

    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'buy' AND item_id IS NOT NULL AND chore_id IS NULL"
            " AND location_id IS NOT NULL)"
            " OR (kind = 'chore' AND chore_id IS NOT NULL AND item_id IS NULL)",
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
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[RequestKind] = mapped_column(str_enum(RequestKind, "kind"))
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"))
    chore_id: Mapped[int | None] = mapped_column(ForeignKey("chores.id", ondelete="CASCADE"))
    # Where it's needed; a chore's own location, unset for a chore of the whole house.
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
