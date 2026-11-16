from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

# Vite puts content-hashed bundles under assets/; everything else (index.html, sw.js,
# the manifest, icons) keeps its name across releases and must be revalidated.
IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE = "no-cache"


def add_web_client(app: FastAPI, web_dir: Path) -> None:
    """Serve the built web client; unknown page paths get index.html (client routing)."""
    root = web_dir.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def web_client(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404)
        file = (root / path).resolve()
        if path and file.is_relative_to(root) and file.is_file():
            cache = IMMUTABLE if path.startswith("assets/") else REVALIDATE
            return FileResponse(file, headers={"Cache-Control": cache})
        if "." in path.rsplit("/", 1)[-1]:
            # A missing file, not a page: don't answer it with HTML.
            raise HTTPException(404)
        return FileResponse(index, headers={"Cache-Control": REVALIDATE})
