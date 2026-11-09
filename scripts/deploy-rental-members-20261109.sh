#!/usr/bin/env bash
set -euo pipefail
release=/home/tcandt/adhome-rental-members-20261109
api=/opt/adhome-console-api
test "$(id -u)" = 0
cd "$release"
sha256sum -c server.sha256
node --check server.mjs
install -d -m 750 backup
if [[ ! -f backup/server.mjs ]]; then cp -p "$api/server.mjs" backup/server.mjs; fi
if [[ ! -d "$api/node_modules/@xmldom/xmldom" ]]; then
  install -d -m 755 "$api/node_modules/@xmldom"
  tar -xzf xmldom-xmldom-0.9.12.tgz -C "$api/node_modules/@xmldom"
  mv "$api/node_modules/@xmldom/package" "$api/node_modules/@xmldom/xmldom"
fi
node -e "const {createRequire}=require('module');const r=createRequire('$api/package.json');if(!r('@xmldom/xmldom').DOMParser)process.exit(1)"
rollback() {
  install -o adhome_app -g adhome_app -m 640 backup/server.mjs "$api/server.mjs"
  systemctl restart adhome-console-api
}
trap rollback ERR
install -o adhome_app -g adhome_app -m 640 server.mjs "$api/server.mjs"
systemctl restart adhome-console-api
ready=false
for attempt in {1..30}; do
  if systemctl is-active --quiet adhome-console-api && curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
test "$(sha256sum "$api/server.mjs" | cut -d ' ' -f 1)" = "$(cut -d ' ' -f 1 server.sha256)"
trap - ERR
echo 'Rental members API deployed; checksum and readiness verified.'
