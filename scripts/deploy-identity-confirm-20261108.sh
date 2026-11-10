#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-identity-confirm-20261108
api=/opt/adhome-console-api
target="$api/server.mjs"
backup="$release/backup"

test "$(id -u)" = 0
test -f "$release/server.mjs"
node --check "$release/server.mjs"
(cd "$release" && sha256sum -c server.sha256)
install -d -m 750 "$backup"
if [[ ! -f "$backup/server.mjs" ]]; then cp -p "$target" "$backup/server.mjs"; fi
rollback() {
  echo 'Readiness failed; restoring previous API.' >&2
  install -o adhome_app -g adhome_app -m 640 "$backup/server.mjs" "$target"
  systemctl restart adhome-console-api || true
}
trap rollback ERR
install -o adhome_app -g adhome_app -m 640 "$release/server.mjs" "$target"
node --check "$target"
systemctl restart adhome-console-api
ready=false
for attempt in {1..30}; do
  if systemctl is-active --quiet adhome-console-api && curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
test "$(sha256sum "$target" | cut -d ' ' -f 1)" = "$(cut -d ' ' -f 1 "$release/server.sha256")"
trap - ERR
echo 'Identity PDF API deployed; checksum and readiness verified.'
