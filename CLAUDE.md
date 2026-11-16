# CLAUDE.md

Orientation for Claude Code in this repo. Every session loads this file whole,
so keep it short: state each rule once and point to a doc for the detail.
When a decision below changes, update this file in the same change.

- `docs/features.md`: features, data model, milestones and later ideas. Read
  it before designing a feature or touching the schema.
- `docs/dev-setup.md`: one-time setup of the dev environment on
  borkai-server (toolchain, GitHub access, Tailscale, Remote Control).

## What this project is

**HomeInventory** (shown to its users as **Spájz**): a self-hosted app that keeps a three-floor house's
supplies and small chores coordinated between its two users (husband and
wife). Anyone can report "out of sugar", "upstairs bin is full" or "guest WC
low on toilet paper" in seconds from a phone; the other gets notified, either
one claims the job ("I'm buying milk") so nobody does it twice, and both can
check what the pantry and basement have or lack while at the shop.

It is **not** an asset catalogue: photos, warranties, manuals and purchase
records are out of scope.

## Status

Milestones 1 (skeleton, live deployment) and 2 (places and stock) done:
locations, items and stock levels with their API (`places.py`) and the web
pages for them (home tree, place page, item catalogue; hash routes in
`web/src/route.ts`, shared data in `web/src/house.ts`). Next: milestone 3
(requests and the shopping list, `docs/features.md`). Anything marked *(planned)* describes intended
setup, not code that exists yet.

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
  OpenAPI schema (`@hey-api/openapi-ts` into `web/src/api/`, committed);
  don't hand-write DTOs. A server test fails until `web/openapi.json` is
  regenerated after an API change. TypeScript stays on 6.x: the generator
  needs its JavaScript API, which TypeScript 7 dropped.
  `vite-plugin-pwa` with our own service worker (`web/src/sw.ts`).
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
- **Live app**: Docker Compose from its own checkout (`~/homeinventory-live`)
  with its own data directory (`~/.local/share/homeinventory`), built from a
  pushed commit by `deploy/deploy.sh`, never served from the dev checkout.
  Deploy only when the user asks: it is what both of them use day to day.
- **Dev servers** bind to `127.0.0.1`: Uvicorn for the API, Vite for the
  web client (proxying `/api` to Uvicorn). Vite is exposed on `:8443` of the
  server's name, so the dev build opens on a phone with real Tailscale
  identity, push and camera. Its `server.allowedHosts` must include the
  `*.ts.net` names. Both run as systemd user services
  (`homeinventory-dev-api`, `homeinventory-dev-web`, see
  `deploy/dev/README.md`) and reload on code changes: check or restart them,
  don't start a second copy.
- **Ports** (checked against the torrent box's ports and `tailscale serve
  status`): dev API `127.0.0.1:8000`, dev Vite `127.0.0.1:5173`, dev HTTPS
  `:8443`, live app `127.0.0.1:8100`. The server's tailnet name is
  `borkai-server.tail61796b.ts.net`; its `:443` is the torrent box's start
  page. The live app's own name is the Tailscale Service `svc:spajz`
  (`spajz.tail61796b.ts.net`; borkai-server is tagged `tag:server`, which
  the tailnet policy auto-approves to host it).
- Because borkai-server is a tagged device, requests made **from the server
  itself** through either name carry no user identity and get `401`. Test
  identity with real headers against `127.0.0.1` (e.g. a headless browser
  with `extraHTTPHeaders`), or from a phone.
- Git pushes go out as the **B0rkai-Claude** GitHub account.

## Repository layout

```
server/      FastAPI app (src/homeinventory/...), alembic/, tests/
web/         Vite + React + TS PWA
deploy/      Dockerfile, docker-compose.yml, deploy.sh, backup.sh + timer (README.md);
             dev/: systemd user units for the dev servers
docs/        features.md and other design notes
```

The app is built by `create_app(settings)` in `server/src/homeinventory/main.py`;
the engine, sessionmaker and settings live on `app.state`. Tests build their
own app on a temporary database (`server/tests/conftest.py`).

## Commands

Run server commands from `server/`; the dev database is `server/data/`.

```bash
# server
cd server && uv sync
uv run alembic upgrade head
uv run uvicorn --factory homeinventory.main:create_app --host 127.0.0.1 --port 8000 --reload
uv run pytest
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "..."  # review the output before committing

# web
cd web && npm install
npm run dev             # 127.0.0.1:5173, proxies /api to the dev API
npm run build && npm run lint
npm run generate-api    # after any API change: re-exports openapi.json, regenerates src/api

# phone access to the dev build (once; persists across reboots)
tailscale serve --bg --https=8443 http://127.0.0.1:5173

# live (only when asked): deploys origin/main, see deploy/README.md
deploy/deploy.sh
```

## Deployment

- Target: **`borkai-server`**, Ubuntu Server (latest release), already on
  the tailnet (it also runs the torrent box and the dev environment above).
- Docker Compose from `deploy/` (details in `deploy/README.md`): one
  container running as the server's user; the API serves the built web
  client (`WEB_DIR`) and migrates the database on start. The SQLite file
  lives in a bind-mounted data directory on the host, never inside the image.
- `tailscale serve` publishes the live app as the Tailscale Service
  `svc:spajz` and the dev Vite server on 8443 (ports above). MagicDNS and
  HTTPS certificates are enabled in the tailnet admin console.
- Backups: `deploy/backup.sh` (daily user timer, and before every deploy)
  takes SQLite's online backup to `/mnt/storage/backups/homeinventory`
  (another disk), never a plain file copy of a live database.

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
- UI language: **Hungarian only**, every user-facing text in
  `web/src/strings.ts` (no hard-coded strings in components). Code, comments,
  commits, docs and API error details stay in English. "HomeInventory" is the
  dev name (repo, code, services); users only ever see "Spájz".
- Every server change comes with tests; API tests run against a temporary
  SQLite database, never the real one.
- Times are stored as UTC; the client formats them for display.
