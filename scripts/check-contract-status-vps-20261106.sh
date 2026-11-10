#!/usr/bin/env bash
set -euo pipefail
set -a
source /etc/adhome-console-api.env
set +a
db_name=$(python3 -c 'import os, urllib.parse; print(urllib.parse.unquote(urllib.parse.urlsplit(os.environ["DATABASE_URL"]).path.lstrip("/")))')
if [[ ! "$db_name" =~ ^[A-Za-z0-9_-]+$ ]]; then exit 1; fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -Atc "SELECT status, rental_model FROM contracts WHERE contract_code = 'HD-P.31-01-AADBF3D4' LIMIT 1"
