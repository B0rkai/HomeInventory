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


def alembic_config(settings: Settings) -> Config:
    config = Config(SERVER_DIR / "alembic.ini")
    config.attributes["db_path"] = settings.db_path
    config.attributes["configure_logger"] = False
    return config


def test_migrations_match_models(settings: Settings) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "head")

    engine = create_db_engine(settings.db_path)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert diff == []

    command.downgrade(config, "base")


def test_migrations_keep_data_across_table_rebuilds(settings: Settings) -> None:
    # Batch mode recreates tables that others reference; the rows must survive.
    config = alembic_config(settings)
    command.upgrade(config, "head")
    engine = create_db_engine(settings.db_path)
    created = "'2026-01-01'"
    with engine.begin() as connection:
        for statement in [
            f"INSERT INTO users (id, login, name, created_at) VALUES (1, 'a', 'A', {created})",
            f"INSERT INTO locations (id, name, position, created_at) VALUES (1, 'P', 0, {created})",
            f"INSERT INTO items (id, name, created_at) VALUES (1, 'C', {created})",
            "INSERT INTO stock (item_id, location_id, level, updated_by_id, updated_at)"
            f" VALUES (1, 1, 'lots', 1, {created})",
        ]:
            connection.execute(text(statement))

    # To before icons and the lots level: rebuilds stock, items and locations.
    command.downgrade(config, "5005493e58f0")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT level FROM stock")).scalars().all() == ["plenty"]
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM locations")).scalar() == 1
        assert connection.execute(text("SELECT count(*) FROM stock")).scalar() == 1
    engine.dispose()


def test_stock_already_short_gets_buy_requests(settings: Settings) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "fe065aff6d6a")
    engine = create_db_engine(settings.db_path)
    created = "'2026-01-01'"
    with engine.begin() as connection:
        for statement in [
            f"INSERT INTO users (id, login, name, created_at) VALUES (1, 'a', 'A', {created})",
            f"INSERT INTO locations (id, name, position, created_at) VALUES (1, 'P', 0, {created})",
            *(
                f"INSERT INTO items (id, name, created_at) VALUES ({id}, 'I{id}', {created})"
                for id in (1, 2, 3)
            ),
            "INSERT INTO stock (item_id, location_id, level, updated_by_id, updated_at) VALUES"
            f" (1, 1, 'out', 1, {created}), (2, 1, 'low', 1, {created}),"
            f" (3, 1, 'plenty', 1, {created})",
        ]:
            connection.execute(text(statement))

    # Adds chores and requests.
    command.upgrade(config, "819b2a994284")
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT item_id, kind, status, created_by_id FROM requests ORDER BY item_id")
        ).all()
    engine.dispose()
    assert rows == [(1, "buy", "open", 1), (2, "buy", "open", 1)]
