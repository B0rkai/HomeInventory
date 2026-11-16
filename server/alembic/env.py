from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import text

from homeinventory.config import Settings
from homeinventory.db import create_db_engine
from homeinventory.models import Base, UTCDateTime

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    # Migrations store plain DateTime; UTC handling lives in the model type.
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


def run_migrations() -> None:
    # Tests pass a database path; otherwise it comes from the app settings.
    db_path = config.attributes.get("db_path") or Settings().db_path
    engine = create_db_engine(Path(db_path))
    with engine.connect() as connection:
        # Batch mode drops and recreates tables, which fails (or cascades) while other
        # tables reference them. SQLite ignores this pragma inside a transaction, so it
        # goes first; the check below catches any reference the migration broke.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()  # end the autobegun transaction, or Alembic won't commit its own
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite can't ALTER most things; batch mode copies the table
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
            broken = connection.execute(text("PRAGMA foreign_key_check")).all()
            if broken:
                raise RuntimeError(f"migration broke foreign keys: {broken}")
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (--sql) migrations aren't supported; run against a database.")
run_migrations()
