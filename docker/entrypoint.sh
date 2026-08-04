#!/bin/sh
set -eu

umask 027

export HOST=127.0.0.1
export PORT=3000
export OPENLIST_UPSTREAM="${OPENLIST_UPSTREAM:-http://openlist:5244}"
export OPENLIST_API_URL="${OPENLIST_API_URL:-${OPENLIST_UPSTREAM}}"
export THUMBNAIL_CACHE_DIR="${THUMBNAIL_CACHE_DIR:-/var/cache/openlist-drive/thumbnails}"
export CUSTOMIZATION_DATA_DIR="${CUSTOMIZATION_DATA_DIR:-/var/lib/openlist-drive/customization}"

mkdir -p \
  "${THUMBNAIL_CACHE_DIR}" \
  "${CUSTOMIZATION_DATA_DIR}" \
  /tmp/openlist-drive-nginx/client \
  /tmp/openlist-drive-nginx/fastcgi \
  /tmp/openlist-drive-nginx/proxy \
  /tmp/openlist-drive-nginx/scgi \
  /tmp/openlist-drive-nginx/uwsgi

for data_dir in "${THUMBNAIL_CACHE_DIR}" "${CUSTOMIZATION_DATA_DIR}"; do
  if ! test -w "${data_dir}"; then
    echo "[entrypoint] ${data_dir} must be writable by container UID 1000." >&2
    exit 1
  fi
done

node /app/docker/render-nginx.mjs

exec node /app/docker/launcher.mjs
