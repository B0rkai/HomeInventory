# Dev servers as systemd user services

The dev API and the dev web client run as systemd user services on borkai-server,
straight from the dev checkout (`~/HomeInventory`), so they survive reboots and
pick up code changes on their own (Uvicorn `--reload`, Vite hot reload). They
need no root: the user's lingering is on, so user services start at boot.

## Install (once)

```bash
cd ~/HomeInventory
systemctl --user link "$PWD"/deploy/dev/homeinventory-dev-*.service
systemctl --user enable --now homeinventory-dev-api homeinventory-dev-web
tailscale serve --bg --https=8443 http://127.0.0.1:5173
```

`link` points systemd at the files in the repo, so a `git pull` that changes a
unit only needs `systemctl --user daemon-reload` and a restart.

## Day to day

```bash
systemctl --user status homeinventory-dev-api homeinventory-dev-web
systemctl --user restart homeinventory-dev-api   # e.g. after `uv sync` or a new migration
journalctl --user -u homeinventory-dev-api -f     # logs
```

The API service runs `alembic upgrade head` before it starts, so restarting it
applies new migrations to the dev database.
