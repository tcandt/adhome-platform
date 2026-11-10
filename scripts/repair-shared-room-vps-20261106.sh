#!/usr/bin/env bash
set -euo pipefail
release=/home/tcandt/adhome-shared-room-20261106
api=/opt/adhome-console-api
bot=/opt/adhome-api
backup="$release/backup"

rollback() {
  echo 'Repair failed; restoring previous API, schema, and bot.' >&2
  cp -p "$backup/server.mjs" "$api/server.mjs"
  cp -p "$backup/schema.prisma" "$api/prisma/schema.prisma"
  cp -p "$backup/registration.cjs" "$bot/registration.cjs"
  cp -p "$backup/zalo-bot.cjs" "$bot/zalo-bot.cjs"
  runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma" || true
  systemctl restart adhome-console-api adhome-zalo-webhook || true
}
trap rollback ERR

sql_copy=/tmp/adhome-shared-room-listing-20261106.sql
install -m 644 "$release/shared-room-listing.sql" "$sql_copy"
set -a
source /etc/adhome-console-api.env
set +a
db_name=$(python3 -c 'import os, urllib.parse; u=urllib.parse.urlsplit(os.environ["DATABASE_URL"]); h=u.query and urllib.parse.parse_qs(u.query).get("host", [u.hostname])[0] or u.hostname; assert h in ("localhost", "127.0.0.1", "/var/run/postgresql"), "Database is not local"; print(urllib.parse.unquote(u.path.lstrip("/")))')
if [[ ! "$db_name" =~ ^[A-Za-z0-9_-]+$ ]]; then echo 'Invalid database name.' >&2; exit 1; fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -f "$sql_copy"
rm -f "$sql_copy"
install -o adhome_app -g adhome_app -m 644 "$release/schema.prisma" "$api/prisma/schema.prisma"
runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma"
install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$api/server.mjs"
install -o adhome_app -g adhome_app -m 640 "$release/registration.cjs" "$bot/registration.cjs"
install -o adhome_app -g adhome_app -m 640 "$release/zalo-bot.cjs" "$bot/zalo-bot.cjs"
systemctl restart adhome-console-api adhome-zalo-webhook
ready=false
for attempt in {1..20}; do
  if curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Console API remains unhealthy.' >&2; exit 1; fi
systemctl is-active --quiet adhome-zalo-webhook
trap - ERR
echo 'Shared room migration, API, and Zalo Bot deployed and healthy.'
