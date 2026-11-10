#!/usr/bin/env bash
set -euo pipefail
set -a
source /etc/adhome-zalo-webhook.env
set +a
code=$(curl -sS -o /tmp/adhome-bot-candidates-20261105.json -w '%{http_code}' \
  -H "Authorization: Bearer $ZALO_BOT_ADMIN_API_KEY" \
  'http://127.0.0.1:8082/internal/zalo-bot/notification-candidates?orgId=org-adhome-anphu')
echo "candidate_http=$code"
if [[ "$code" == 200 ]]; then
  node -e 'const d=require(process.argv[1]); console.log(`candidate_invoices=${d.invoices?.length ?? 0} candidate_expiring=${d.expiring?.length ?? 0}`)' /tmp/adhome-bot-candidates-20261105.json
fi
rm -f /tmp/adhome-bot-candidates-20261105.json
runuser -u postgres -- psql -d adhome_prod -Atc "SELECT count(*) FROM zalo_bot_configs WHERE is_enabled = true" | sed 's/^/enabled_bots=/'
exit $([[ "$code" == 200 ]] && echo 0 || echo 1)
