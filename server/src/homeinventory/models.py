from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, String, TypeDecorator
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NICKNAME_MAX_LENGTH = 40


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
