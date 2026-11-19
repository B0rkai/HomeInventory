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

ENV DATA_DIR=/data WEB_DIR=/app/web ADMIN_PORT=8200
# 8100: the tailnet port, behind `tailscale serve`; 8200: the admin pages, on the LAN.
EXPOSE 8100 8200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/api/v1/health')"
# Migrate, then one process on both ports (serve.py): SQLite has one writer, and live
# updates live in memory.
CMD ["sh", "-c", "alembic upgrade head && exec python -m homeinventory.serve --host 0.0.0.0 --port 8100 --proxy-headers"]
