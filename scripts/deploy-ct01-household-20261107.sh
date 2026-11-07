#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-ct01-household-20261107
target=/opt/adhome-console-api/server.mjs
backup="$release/server.before.mjs"

sudo cp -p "$target" "$backup"
rollback() {
  sudo cp -p "$backup" "$target"
  sudo systemctl restart adhome-console-api || true
}
trap rollback ERR

sudo install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$target"
node --check "$target"
sudo systemctl restart adhome-console-api
sudo systemctl is-active --quiet adhome-console-api

ready=false
for attempt in {1..20}; do
  if curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'Console API readiness check failed.' >&2
  exit 1
fi

trap - ERR
echo 'CT01 household API deployed and healthy.'
