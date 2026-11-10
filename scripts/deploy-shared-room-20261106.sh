#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-shared-room-20261106
api=/opt/adhome-console-api
bot=/opt/adhome-api
backup="$release/backup"
mkdir -p "$backup"
cp -p "$api/server.mjs" "$backup/server.mjs"
cp -p "$api/prisma/schema.prisma" "$backup/schema.prisma"
cp -p "$bot/registration.cjs" "$backup/registration.cjs"
cp -p "$bot/zalo-bot.cjs" "$backup/zalo-bot.cjs"

rollback() {
  echo 'Deployment failed; restoring application files and Prisma Client.' >&2
  cp -p "$backup/server.mjs" "$api/server.mjs"
  cp -p "$backup/schema.prisma" "$api/prisma/schema.prisma"
  cp -p "$backup/registration.cjs" "$bot/registration.cjs"
  cp -p "$backup/zalo-bot.cjs" "$bot/zalo-bot.cjs"
  runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma" || true
  systemctl restart adhome-console-api adhome-zalo-webhook || true
}
trap rollback ERR

node --check "$release/server.mjs"
node --check "$release/registration.cjs"
node --check "$release/zalo-bot.cjs"
sql_copy=/tmp/adhome-shared-room-listing-20261106.sql
install -m 644 "$release/shared-room-listing.sql" "$sql_copy"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d adhome_prod -f "$sql_copy"
rm -f "$sql_copy"
install -o adhome_app -g adhome_app -m 644 "$release/schema.prisma" "$api/prisma/schema.prisma"
runuser -u adhome_app -- "$api/node_modules/.bin/prisma" generate --schema "$api/prisma/schema.prisma"
install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$api/server.mjs"
install -o adhome_app -g adhome_app -m 640 "$release/registration.cjs" "$bot/registration.cjs"
install -o adhome_app -g adhome_app -m 640 "$release/zalo-bot.cjs" "$bot/zalo-bot.cjs"
systemctl restart adhome-console-api adhome-zalo-webhook
systemctl is-active --quiet adhome-console-api
systemctl is-active --quiet adhome-zalo-webhook
ready=false
for attempt in {1..20}; do
  if curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1 && curl -fsS --max-time 3 'http://127.0.0.1:8081/healthz' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Readiness check failed.' >&2; exit 1; fi
trap - ERR
echo 'Shared room API, database, and Zalo Bot deployed and healthy.'
