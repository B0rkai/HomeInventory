#!/usr/bin/env bash
# Deploy a pushed commit as the live app.
# Usage: deploy/deploy.sh [ref]     (default origin/main; any ref that is on GitHub)
#
# The live app is built from its own checkout (~/homeinventory-live), never the dev one,
# and keeps its database outside it (~/.local/share/homeinventory). The database is
# backed up before the new version starts, since that may migrate it.
set -euo pipefail

LIVE_DIR=${HOMEINVENTORY_LIVE_DIR:-$HOME/homeinventory-live}
REPO=https://github.com/B0rkai/HomeInventory.git
export HOMEINVENTORY_DATA=${HOMEINVENTORY_DATA:-$HOME/.local/share/homeinventory}
# The server's address on the home LAN, for the admin pages (it must stay put: a DHCP
# reservation in the router). Docker can't start the container without it.
export HOMEINVENTORY_LAN_ADDRESS=${HOMEINVENTORY_LAN_ADDRESS:-192.168.1.100}
HOMEINVENTORY_UID=$(id -u)
HOMEINVENTORY_GID=$(id -g)
export HOMEINVENTORY_UID HOMEINVENTORY_GID

ref=${1:-origin/main}

[ -d "$LIVE_DIR/.git" ] || git clone -q "$REPO" "$LIVE_DIR"
git -C "$LIVE_DIR" fetch -q --prune origin
commit=$(git -C "$LIVE_DIR" rev-parse --verify "$ref^{commit}")
if [ -z "$(git -C "$LIVE_DIR" branch -r --contains "$commit")" ]; then
    echo "$ref ($commit) is not on GitHub; push it first" >&2
    exit 1
fi
git -C "$LIVE_DIR" checkout -q --detach "$commit"
echo "deploying $(git -C "$LIVE_DIR" log -1 --format='%h %s')"

docker build -q -f "$LIVE_DIR/deploy/Dockerfile" -t homeinventory:live \
    --label "org.opencontainers.image.revision=$commit" "$LIVE_DIR" >/dev/null

mkdir -p "$HOMEINVENTORY_DATA"
if [ -f "$HOMEINVENTORY_DATA/homeinventory.db" ]; then
    "$LIVE_DIR/deploy/backup.sh" pre-deploy >/dev/null
fi

docker compose -f "$LIVE_DIR/deploy/docker-compose.yml" up -d --remove-orphans --quiet-pull

container=$(docker compose -f "$LIVE_DIR/deploy/docker-compose.yml" ps -q app)
for _ in $(seq 60); do
    case $(docker inspect -f '{{.State.Health.Status}}' "$container") in
        healthy) echo "live: $(git -C "$LIVE_DIR" log -1 --format='%h %s')"; exit 0 ;;
        unhealthy) break ;;
    esac
    sleep 1
done
echo "the new version did not become healthy; logs:" >&2
docker logs --tail 30 "$container" >&2
exit 1
