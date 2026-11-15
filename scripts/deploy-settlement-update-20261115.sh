#!/usr/bin/env bash
set -euo pipefail

stage=/home/tcandt/adhome-deploy-20261115
backup="$stage/backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup"
cp -p /opt/adhome-console-api/server.mjs "$backup/server.mjs"

rollback() {
  echo "Encountered error during deployment. Rolling back..."
  cp -p "$backup/server.mjs" /opt/adhome-console-api/server.mjs
  systemctl restart adhome-console-api || true
}
trap rollback ERR

node --check "$stage/server.mjs"
install -o adhome_app -g adhome_app -m 640 "$stage/server.mjs" /opt/adhome-console-api/server.mjs
systemctl restart adhome-console-api
sleep 2
systemctl is-active --quiet adhome-console-api
curl -fsS http://127.0.0.1:8081/healthz >/dev/null
echo 'DEPLOY_VPS_BACKEND_OK'
