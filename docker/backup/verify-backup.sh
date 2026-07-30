#!/bin/sh
set -eu

latest_dump="$(ls -1t /backups/linkgov-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$latest_dump" ]; then
  echo "No database backup was found."
  exit 4
fi

prefix="${latest_dump%.dump}"
manifest="${prefix}.sha256"
assets="${prefix}-assets.tar.gz"

test -s "$manifest"
test -s "$assets"
sha256sum --check --status "$manifest"
pg_restore --list "$latest_dump" >/dev/null
tar -tzf "$assets" >/dev/null

echo "Latest backup archives and checksums are valid."
