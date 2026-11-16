from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from homeinventory.config import Settings
from homeinventory.main import create_app
from homeinventory.models import Base


@pytest.fixture
def web_client(tmp_path: Path, settings: Settings) -> TestClient:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Spájz</title>")
    (dist / "sw.js").write_text("// sw")
    (dist / "assets" / "index-abc123.js").write_text("// app")
    (tmp_path / "secret.txt").write_text("outside the web dir")
    app = create_app(settings.model_copy(update={"web_dir": dist}))
    Base.metadata.create_all(app.state.engine)
    return TestClient(app)


def test_index_is_served_and_revalidated(web_client: TestClient) -> None:
    response = web_client.get("/")
    assert response.status_code == 200
    assert "Spájz" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_cached_forever(web_client: TestClient) -> None:
    response = web_client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]


def test_service_worker_is_revalidated(web_client: TestClient) -> None:
    assert web_client.get("/sw.js").headers["cache-control"] == "no-cache"


def test_page_paths_fall_back_to_index(web_client: TestClient) -> None:
    response = web_client.get("/places/kitchen")
    assert response.status_code == 200
    assert "Spájz" in response.text


def test_missing_files_are_404_not_html(web_client: TestClient) -> None:
    assert web_client.get("/assets/gone-123.js").status_code == 404


def test_api_still_wins_and_unknown_api_paths_are_json_404(web_client: TestClient) -> None:
    assert web_client.get("/api/v1/health").json() == {"status": "ok"}
    response = web_client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"


def test_no_escape_from_the_web_dir(web_client: TestClient) -> None:
    response = web_client.get("/..%2Fsecret.txt")
    assert "outside the web dir" not in response.text


def test_not_served_without_web_dir(client: TestClient) -> None:
    assert client.get("/").status_code == 404
