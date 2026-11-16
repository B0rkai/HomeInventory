# CLAUDE.md

Orientation for Claude Code in this repo. Every session loads this file whole,
so keep it short: state each rule once and point to a doc for the detail.
When a decision below changes, update this file in the same change.

- `docs/features.md`: features, data model, milestones and later ideas. Read
  it before designing a feature or touching the schema.
- `docs/dev-setup.md`: one-time setup of the dev environment on
  borkai-server (toolchain, GitHub access, Tailscale, Remote Control).

## What this project is

**HomeInventory**: a self-hosted app that keeps a three-floor house's
supplies and small chores coordinated between its two users (husband and
wife). Anyone can report "out of sugar", "upstairs bin is full" or "guest WC
low on toilet paper" in seconds from a phone; the other gets notified, either
one claims the job ("I'm buying milk") so nobody does it twice, and both can
check what the pantry and basement have or lack while at the shop.

It is **not** an asset catalogue: photos, warranties, manuals and purchase
records are out of scope.

## Status

Greenfield. Sections marked *(planned)* describe the intended setup, not code
that exists yet. Turn them into real instructions as the code lands.

## Tech stack

- **Server**: Python 3.12+, **FastAPI**, **SQLAlchemy 2.x** (typed ORM),
  **Alembic** migrations, **Pydantic v2** schemas. **uv** for dependencies
  and running. **pytest** for tests, **ruff** for lint and format.
- **Database**: **SQLite**, one file on the server's disk.
  - Turn on WAL mode and foreign keys on every connection (a SQLAlchemy
    `connect` event), never per query.
  - Run a single Uvicorn worker: SQLite has one writer at a time, and the
    live-update fan-out lives in that process's memory.
  - Every schema change is an Alembic migration; never edit the schema by
    hand or call `create_all` outside tests.
  - Claiming a request is one conditional `UPDATE ... WHERE status = 'open'`;
    a zero row count means someone else won. Never read-then-write.
- **Web client**: **React + TypeScript** on **Vite**, an installable
  **PWA**, designed phone-first (Android Chrome is the only target; desktop
  just has to work). Generate the API client and types from the server's
  OpenAPI schema; don't hand-write DTOs.
- **Notifications**: Web Push (VAPID, `pywebpush` on the server, a service
  worker in the client). **Live updates**: Server-Sent Events, so an open
  list refreshes itself.
- **No native mobile app** is planned; build one only if the PWA proves
  insufficient.

## Identity and access

- The app is reachable **only over Tailscale**, through `tailscale serve` on
  borkai-server, which provides HTTPS with a `*.ts.net` certificate (needed
  for the service worker, push and camera). Nothing is exposed to the
  internet.
- Both users have their own Tailscale login. Identity comes from the
  `Tailscale-User-Login` / `Tailscale-User-Name` headers that `tailscale
  serve` adds; the app has no passwords or login screen.
- Those headers are trustworthy only because nothing but `tailscale serve`
  can reach the app: bind it to `127.0.0.1` (in Docker, publish the port as
  `127.0.0.1:<port>:<port>`). Never bind it to `0.0.0.0` on the server.
- A request with no identity header gets `401`, unless a `DEV_USER` setting
  stands in for the header (tests, or running without `tailscale serve` in
  front). `DEV_USER` is never set in the live deployment.

## Development environment

Development happens **on borkai-server itself** (Linux, the same machine
that runs the live app), driven through Claude Code Remote Control. Keep
development and the live app apart:

- **Dev checkout**: `~/HomeInventory`, with its own data directory
  (gitignored, inside the checkout) and its own SQLite file. Never point it
  at the live data directory.
- **Live app**: runs from Docker Compose in a separate directory with its
  own data directory, built from a pushed commit, never served from the dev
  checkout.
- **Dev servers** bind to `127.0.0.1`: Uvicorn for the API, Vite for the
  web client (proxying `/api` to Uvicorn). Vite is exposed on its own
  `tailscale serve` HTTPS port, so the dev build opens on a phone with real
  Tailscale identity, push and camera. Its `server.allowedHosts` must
  include the `*.ts.net` name.
- **Ports** (checked against the torrent box's ports and `tailscale serve
  status`): dev API `127.0.0.1:8000`, dev Vite `127.0.0.1:5173`, dev HTTPS
  `:8443`, live app `127.0.0.1:8100`, live HTTPS `:443`. The tailnet name
  is `borkai-server.tail61796b.ts.net`.
- Git pushes go out as the **B0rkai-Claude** GitHub account.

## Repository layout *(planned)*

```
server/      FastAPI app (src/homeinventory/...), alembic/, tests/
web/         Vite + React + TS PWA
deploy/      docker-compose.yml, tailscale serve notes, backup script
docs/        features.md and other design notes
```

## Commands *(planned)*

```bash
# server
cd server && uv sync
uv run uvicorn homeinventory.main:app --reload   # dev server
uv run pytest
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "..."  # review the output before committing
uv run alembic upgrade head

# web
cd web && npm install
npm run dev
npm run build
npm run generate-api    # regenerate the client from the server's OpenAPI schema
```

## Deployment

- Target: **`borkai-server`**, Ubuntu Server (latest release), already on
  the tailnet (it also runs the torrent box and the dev environment above).
- *(planned)* Docker Compose from `deploy/`: one container; the API serves
  the built web client as static files. The SQLite file lives in a
  bind-mounted data directory on the host, never inside the image.
- `tailscale serve` publishes the live app on HTTPS 443 and the dev Vite
  server on 8443 (ports above). MagicDNS and HTTPS certificates are enabled
  in the tailnet admin console.
- Backups: copy the database with SQLite's online backup (`sqlite3 db
  ".backup ..."` or the Python `backup()` API), never a plain file copy of a
  live database.

## Conventions

- Use `pathlib` for paths and keep LF line endings in the repo (add a
  `.gitattributes` with the first code): development is on Linux, but the
  repo may still be edited from Windows.
- Configuration comes from environment variables (Pydantic Settings): data
  directory, DB path, VAPID keys, `DEV_USER`. No secrets in the repo; commit
  a `.env.example`.
- API: JSON under `/api/v1/...`, plural resource nouns, Pydantic models for
  every request and response.
- UI: every common action (report, claim, mark done) is one or two taps on a
  phone. If a flow needs typing, it needs a reason.
- Every server change comes with tests; API tests run against a temporary
  SQLite database, never the real one.
- Times are stored as UTC; the client formats them for display.
