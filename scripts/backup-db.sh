#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/elycubator-$STAMP.db"

mkdir -p backups
docker compose -f compose.prod.yml exec -T app sqlite3 /data/elycubator.db ".backup '/tmp/elycubator-backup.db'"
docker compose -f compose.prod.yml cp app:/tmp/elycubator-backup.db "$OUT" >/dev/null
docker compose -f compose.prod.yml exec -T app rm -f /tmp/elycubator-backup.db
find backups -type f -name 'elycubator-*.db' -mtime +30 -delete
echo "backup written: $OUT"
