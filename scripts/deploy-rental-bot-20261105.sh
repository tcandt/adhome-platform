#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-release-20261105
backup="$release/backup"
mkdir -p "$backup/api" "$backup/bot"
cp -p /opt/adhome-console-api/server.mjs "$backup/api/server.mjs"
for file in server.cjs zalo-bot.cjs business-notifications.cjs message-templates.cjs; do
  if [[ -f "/opt/adhome-api/$file" ]]; then cp -p "/opt/adhome-api/$file" "$backup/bot/$file"; fi
done

rollback() {
  echo 'Deployment failed; restoring application files.' >&2
  cp -p "$backup/api/server.mjs" /opt/adhome-console-api/server.mjs
  for file in server.cjs zalo-bot.cjs business-notifications.cjs message-templates.cjs; do
    if [[ -f "$backup/bot/$file" ]]; then cp -p "$backup/bot/$file" "/opt/adhome-api/$file"; fi
  done
  systemctl restart adhome-zalo-webhook adhome-console-api || true
}
trap rollback ERR

schema_copy=/tmp/adhome-zalo-schema-20261105.sql
install -m 644 "$release/bot/schema.sql" "$schema_copy"
runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d adhome_prod -f "$schema_copy" >/dev/null
rm -f "$schema_copy"
install -o adhome_app -g adhome_app -m 640 "$release/api/server.mjs" /opt/adhome-console-api/server.mjs
for file in server.cjs zalo-bot.cjs business-notifications.cjs message-templates.cjs; do
  install -o adhome_app -g adhome_app -m 640 "$release/bot/$file" "/opt/adhome-api/$file"
done
node --check /opt/adhome-console-api/server.mjs
node --check /opt/adhome-api/server.cjs
systemctl restart adhome-zalo-webhook adhome-console-api
sleep 2
systemctl is-active --quiet adhome-zalo-webhook
systemctl is-active --quiet adhome-console-api
curl -fsS http://127.0.0.1:8081/healthz >/dev/null
curl -fsS 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null
trap - ERR
echo 'Deployment complete: database, Zalo Bot and Console API healthy.'
