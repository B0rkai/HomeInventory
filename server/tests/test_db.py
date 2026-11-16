from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import StatementError

from homeinventory.config import Settings
from homeinventory.db import create_db_engine
from homeinventory.models import Base, User

SERVER_DIR = Path(__file__).parents[1]


def test_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_every_connection_has_wal_and_foreign_keys(app: FastAPI) -> None:
    with app.state.engine.connect() as connection:
        assert connection.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_times_round_trip_as_utc(app: FastAPI) -> None:
    created = datetime(2026, 11, 16, 18, 30, tzinfo=timezone(timedelta(hours=1)))
    with app.state.sessionmaker() as session:
        session.add(User(login="anna@example.com", name="Anna", created_at=created))
        session.commit()
    with app.state.sessionmaker() as session:
        user = session.scalars(select(User)).one()
    assert user.created_at == created
    assert user.created_at.tzinfo == UTC
    assert user.created_at.hour == 17


def test_naive_times_are_refused(app: FastAPI) -> None:
    with app.state.sessionmaker() as session:
        session.add(User(login="anna@example.com", name="Anna", created_at=datetime(2026, 1, 1)))
        with pytest.raises(StatementError, match="naive datetime"):
            session.commit()


def test_migrations_match_models(settings: Settings) -> None:
    config = Config(SERVER_DIR / "alembic.ini")
    config.attributes["db_path"] = settings.db_path
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")

    engine = create_db_engine(settings.db_path)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert diff == []

    command.downgrade(config, "base")
