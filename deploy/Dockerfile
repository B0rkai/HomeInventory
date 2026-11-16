# The live app: one image, the API serving the built web client.
# Build from the repo root: docker build -f deploy/Dockerfile .

FROM node:26-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv PATH=/app/.venv/bin:$PATH
WORKDIR /app/server
# Dependencies first, so code changes don't reinstall them.
COPY server/pyproject.toml server/uv.lock server/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/ ./
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist /app/web

ENV DATA_DIR=/data WEB_DIR=/app/web
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/api/v1/health')"
# Migrate, then a single worker: SQLite has one writer, and live updates live in memory.
# Open live-update streams never end by themselves, so shutdown stops waiting after 5 s.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn --factory homeinventory.main:create_app --host 0.0.0.0 --port 8100 --proxy-headers --forwarded-allow-ips=* --timeout-graceful-shutdown 5"]
