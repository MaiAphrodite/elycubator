#!/bin/sh
set -e

# Railway (and Docker named volumes) mount the volume as root, which would
# leave the unprivileged app user unable to create the SQLite database.
# Fix ownership, then drop privileges.
mkdir -p "$(dirname "${DB_PATH:-/data/elycubator.db}")"
chown -R app:app "$(dirname "${DB_PATH:-/data/elycubator.db}")" 2>/dev/null || true

exec su-exec app /usr/local/bin/elycubator
