#!/usr/bin/env bash
set -euo pipefail

node --check /home/tcandt/server.new.mjs
node --check /home/tcandt/zalo-bot.cjs
node --check /home/tcandt/registration.cjs
if [ -f /home/tcandt/business-notifications.cjs ]; then
  node --check /home/tcandt/business-notifications.cjs
  install -o adhome_app -g adhome_app -m 644 /home/tcandt/business-notifications.cjs /opt/adhome-api/business-notifications.cjs
fi

install -o adhome_app -g adhome_app -m 644 /home/tcandt/server.new.mjs /opt/adhome-console-api/server.mjs
install -o adhome_app -g adhome_app -m 644 /home/tcandt/zalo-bot.cjs /opt/adhome-api/zalo-bot.cjs
install -o adhome_app -g adhome_app -m 644 /home/tcandt/registration.cjs /opt/adhome-api/registration.cjs

if [ -f /home/tcandt/CT01.docx ]; then
  install -o adhome_app -g adhome_app -m 640 /home/tcandt/CT01.docx /opt/adhome-console-api/server/rental-templates/CT01.docx
fi
if [ -f /home/tcandt/HOP_DONG_1PN.docx ]; then
  install -o adhome_app -g adhome_app -m 640 /home/tcandt/HOP_DONG_1PN.docx /opt/adhome-console-api/server/rental-templates/HOP_DONG_1PN.docx
fi
if [ -f /home/tcandt/HOP_DONG_2PN.docx ]; then
  install -o adhome_app -g adhome_app -m 640 /home/tcandt/HOP_DONG_2PN.docx /opt/adhome-console-api/server/rental-templates/HOP_DONG_2PN.docx
fi

systemctl restart adhome-console-api.service adhome-zalo-webhook.service
sleep 2

systemctl is-active adhome-console-api.service
systemctl is-active adhome-zalo-webhook.service

echo "DEPLOY_SUCCESS"
