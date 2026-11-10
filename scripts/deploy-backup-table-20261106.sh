#!/usr/bin/env bash
set -euo pipefail
release=/home/tcandt/adhome-backup-table-20261106
api=/opt/adhome-console-api
backup="$release/server.previous.mjs"

node --check "$release/server.mjs"
cp -p "$api/server.mjs" "$backup"
rollback() {
  echo 'API update failed; restoring the previous server.' >&2
  cp -p "$backup" "$api/server.mjs"
  systemctl restart adhome-console-api || true
}
trap rollback ERR
install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$api/server.mjs"
systemctl restart adhome-console-api
ready=false
for attempt in {1..20}; do
  if systemctl is-active --quiet adhome-console-api && curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ $ready != true ]]; then echo 'Console API readiness check failed.' >&2; exit 1; fi
trap - ERR
echo 'Backup table API deployed and healthy.'
