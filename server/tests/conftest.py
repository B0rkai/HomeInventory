from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from homeinventory.config import Settings
from homeinventory.main import create_app
from homeinventory.models import Base


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    # Explicit values win over the environment and any .env file.
    return Settings(_env_file=None, data_dir=tmp_path, database_path=None, dev_user=None)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    return app


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client
