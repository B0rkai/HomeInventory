from pathlib import Path

from homeinventory.openapi import openapi_json

WEB_SCHEMA = Path(__file__).parents[2] / "web" / "openapi.json"


def test_web_client_schema_is_current() -> None:
    # The web client is generated from this file; regenerate it after API changes:
    # cd web && npm run generate-api
    assert WEB_SCHEMA.read_text() == openapi_json()
