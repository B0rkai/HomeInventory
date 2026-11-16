#!/usr/bin/env bash
# Online backup of the live database: safe while the app runs (never a plain file copy).
# Usage: deploy/backup.sh [label]   e.g. "pre-deploy"; prints the backup's path.
# Keeps the newest $HOMEINVENTORY_BACKUP_KEEP backups (default 60).
set -euo pipefail

DATA=${HOMEINVENTORY_DATA:-$HOME/.local/share/homeinventory}
DEST=${HOMEINVENTORY_BACKUP_DIR:-/mnt/storage/backups/homeinventory}
KEEP=${HOMEINVENTORY_BACKUP_KEEP:-60}

db=$DATA/homeinventory.db
[ -f "$db" ] || { echo "no database at $db" >&2; exit 1; }
mkdir -p "$DEST"

out=$DEST/homeinventory-$(date -u +%Y%m%dT%H%M%SZ)${1:+-$1}.db
sqlite3 "$db" ".backup '$out'"
if [ "$(sqlite3 "$out" 'PRAGMA integrity_check')" != ok ]; then
    echo "backup $out failed its integrity check" >&2
    exit 1
fi

# Newest first; everything past $KEEP goes.
find "$DEST" -maxdepth 1 -name 'homeinventory-*.db' -printf '%T@ %p\n' | sort -rn |
    tail -n +$((KEEP + 1)) | cut -d' ' -f2- | xargs -r rm --
echo "$out"
