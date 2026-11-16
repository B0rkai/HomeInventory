"""Print the API's OpenAPI schema; the web client is generated from it.

Usage: uv run python -m homeinventory.openapi > ../web/openapi.json
"""

import json
from pathlib import Path

from homeinventory.config import Settings
from homeinventory.main import create_app


def openapi_json() -> str:
    # An in-memory database, so writing the schema never touches a real one.
    app = create_app(Settings(_env_file=None, database_path=Path(":memory:")))
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    print(openapi_json(), end="")
