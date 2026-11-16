# Live deployment on borkai-server

The live app (users see it as **Spájz**) is one Docker container: the API, which also
serves the built web client. Phones reach it as the Tailscale Service `svc:spajz`,
`https://spajz.tail61796b.ts.net`. The dev servers are separate; see `dev/README.md`.

| What | Where |
|---|---|
| Live checkout (built from GitHub, detached at the deployed commit) | `~/homeinventory-live` |
| Database | `~/.local/share/homeinventory/homeinventory.db` |
| Backups (other disk) | `/mnt/storage/backups/homeinventory/` |
| Container port | `127.0.0.1:8100` |

## Deploy

Only pushed commits deploy. From any checkout:

```bash
deploy/deploy.sh            # origin/main
deploy/deploy.sh <ref>      # e.g. a tag, or an older commit to roll back to
```

It checks out the commit in `~/homeinventory-live`, builds the image, backs the
database up (`...-pre-deploy.db`), starts the new container, which migrates the
database on start, and waits for it to report healthy.

Rolling back code is `deploy/deploy.sh <older commit>`; rolling back a migration
also needs the matching pre-deploy backup restored (below), since migrations
only go forward here.

## First-time setup (done once)

```bash
mkdir -p /mnt/storage/backups/homeinventory
deploy/deploy.sh
tailscale serve --service=svc:spajz --https=443 http://127.0.0.1:8100
systemctl --user link ~/homeinventory-live/deploy/homeinventory-backup.{service,timer}
systemctl --user enable --now homeinventory-backup.timer
```

The container restarts on its own after a reboot (`restart: unless-stopped`).

## Backups

Daily at 03:40 (and before every deploy) `backup.sh` takes an online SQLite backup,
checks its integrity and keeps the newest 60. By hand: `deploy/backup.sh`.

Restore (stops the app for a moment):

```bash
cd ~/homeinventory-live
docker compose -f deploy/docker-compose.yml stop
cp /mnt/storage/backups/homeinventory/<backup>.db ~/.local/share/homeinventory/homeinventory.db
rm -f ~/.local/share/homeinventory/homeinventory.db-{wal,shm}
deploy/deploy.sh <commit that matches the backup's schema>
```

## Look around

```bash
docker compose -f ~/homeinventory-live/deploy/docker-compose.yml ps
docker compose -f ~/homeinventory-live/deploy/docker-compose.yml logs -f
git -C ~/homeinventory-live log -1 --oneline     # the deployed commit
systemctl --user list-timers homeinventory-backup.timer
```
