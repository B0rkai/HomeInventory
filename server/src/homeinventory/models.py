from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    MetaData,
    String,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NICKNAME_MAX_LENGTH = 40
NAME_MAX_LENGTH = 60
CATEGORY_MAX_LENGTH = 40
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
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Item(Base):
    """A supply in the catalogue: "Cukor", "WC-papír"."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unique ignoring case; the API checks it, since SQLite's NOCASE only folds ASCII.
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Groups the shopping list ("Tejtermék", "Tisztítószer"); optional.
    category: Mapped[str | None] = mapped_column(String(CATEGORY_MAX_LENGTH))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Level(StrEnum):
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
    level: Mapped[Level] = mapped_column(
        Enum(
            Level,
            name="level",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda levels: [level.value for level in levels],
        )
    )
    updated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    updated_by: Mapped[User] = relationship(lazy="joined")

    @property
    def updated_by_name(self) -> str:
        return self.updated_by.display_name
