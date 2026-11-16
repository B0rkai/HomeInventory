import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.routing import APIRoute
from sqlalchemy.orm import sessionmaker

from homeinventory.api import router
from homeinventory.config import Settings
from homeinventory.db import create_db_engine
from homeinventory.live import LiveUpdates
from homeinventory.models import utcnow
from homeinventory.notify import Notifier
from homeinventory.requests import check_due_chores
from homeinventory.web import add_web_client


def create_app(settings: Settings | None = None) -> FastAPI:
    """App factory; run with `uvicorn --factory homeinventory.main:create_app`."""
    settings = settings or Settings()
    engine = create_db_engine(settings.db_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.live.attach(asyncio.get_running_loop())
        due_checks = asyncio.create_task(_check_due_chores(app))
        yield
        due_checks.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await due_checks
        app.state.notifier.close()
        engine.dispose()

    app = FastAPI(
        title="HomeInventory",
        lifespan=lifespan,
        # Operation ids become the generated client's function names: getCurrentUser, ...
        generate_unique_id_function=_route_name,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker(engine, expire_on_commit=False)
    app.state.live = LiveUpdates()
    app.state.notifier = Notifier(
        settings.vapid_key_path, settings.vapid_subject, app.state.sessionmaker
    )
    app.include_router(router)
    if settings.web_dir:
        add_web_client(app, settings.web_dir)  # after the API, so its routes win
    return app


# Scheduled chores fall due at midnight; this finds them (and sends the push) even when
# nobody has the app open.
DUE_CHECK_SECONDS = 60


async def _check_due_chores(app: FastAPI) -> None:
    tz = ZoneInfo(app.state.settings.timezone)

    def check() -> None:
        with app.state.sessionmaker() as session:
            check_due_chores(session, app.state.notifier, app.state.live, utcnow(), tz)

    while True:
        await asyncio.sleep(DUE_CHECK_SECONDS)
        try:
            await asyncio.to_thread(check)
        except Exception:
            logging.getLogger(__name__).exception("Checking for due chores failed")


def _route_name(route: APIRoute) -> str:
    return route.name
