from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.routing import APIRoute
from sqlalchemy.orm import sessionmaker

from homeinventory.api import router
from homeinventory.config import Settings
from homeinventory.db import create_db_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    """App factory; run with `uvicorn --factory homeinventory.main:create_app`."""
    settings = settings or Settings()
    engine = create_db_engine(settings.db_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
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
    app.include_router(router)
    return app


def _route_name(route: APIRoute) -> str:
    return route.name
