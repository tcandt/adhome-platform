#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-room-album-20261106
api=/opt/adhome-console-api
backup="$release/backup"
mkdir -p "$backup"
cp -p "$api/server.mjs" "$backup/server.mjs"
cp -p "$api/prisma/schema.prisma" "$backup/schema.prisma"

rollback() {
  echo 'Room album API failed; restoring previous server and Prisma Client.' >&2
  cp -p "$backup/server.mjs" "$api/server.mjs"
  cp -p "$backup/schema.prisma" "$api/prisma/schema.prisma"
  runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma" || true
  systemctl restart adhome-console-api || true
}
trap rollback ERR

node --check "$release/server.mjs"
sql_copy=/tmp/adhome-room-album-20261106.sql
install -m 644 "$release/room-album.sql" "$sql_copy"
set -a
source /etc/adhome-console-api.env
set +a
db_name=$(python3 -c 'import os, urllib.parse; u=urllib.parse.urlsplit(os.environ["DATABASE_URL"]); h=urllib.parse.parse_qs(u.query).get("host", [u.hostname])[0]; assert h in ("localhost", "127.0.0.1", "/var/run/postgresql"), "Database is not local"; print(urllib.parse.unquote(u.path.lstrip("/")))')
if [[ ! "$db_name" =~ ^[A-Za-z0-9_-]+$ ]]; then echo 'Invalid database name.' >&2; exit 1; fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -f "$sql_copy"
rm -f "$sql_copy"
install -d -o adhome_app -g adhome_app -m 750 "$api/uploads/room-images"
install -o adhome_app -g adhome_app -m 644 "$release/schema.prisma" "$api/prisma/schema.prisma"
runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma"
install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$api/server.mjs"
systemctl restart adhome-console-api
ready=false
for attempt in {1..20}; do
  if systemctl is-active --quiet adhome-console-api && curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Console API readiness check failed.' >&2; exit 1; fi
trap - ERR
echo 'Room album API and database deployed and healthy.'
