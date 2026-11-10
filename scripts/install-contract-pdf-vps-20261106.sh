#!/usr/bin/env bash
set -euo pipefail

release=/home/tcandt/adhome-contract-docs-20261106
target=/opt/adhome-console-api/server/rental-templates
install -d -o adhome_app -g adhome_app -m 755 "$target"
for file in CT01.docx HD-COC-GIU-PHONG.docx HOP_DONG_1PN.docx HOP_DONG_2PN.docx; do
  install -o adhome_app -g adhome_app -m 644 "$release/templates/$file" "$target/$file"
done

if ! command -v soffice >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends libreoffice-writer
fi

smoke=/opt/adhome-console-api/.contract-pdf-smoke
install -d -o adhome_app -g adhome_app -m 700 "$smoke"
cd /opt/adhome-console-api
runuser -u adhome_app -- env HOME="$smoke" XDG_CONFIG_HOME="$smoke/xdg" soffice "-env:UserInstallation=file://$smoke/profile" --headless --convert-to pdf --outdir "$smoke" "$target/HOP_DONG_2PN.docx" >/dev/null
test -s "$smoke/HOP_DONG_2PN.pdf"
head -c 5 "$smoke/HOP_DONG_2PN.pdf" | grep -q '%PDF-'
rm -rf "$smoke"
systemctl restart adhome-console-api
ready=false
for attempt in {1..20}; do
  if systemctl is-active --quiet adhome-console-api && curl -fsS --max-time 3 'http://127.0.0.1:8082/api/v1/public/rooms?orgId=org-adhome-anphu' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Console API readiness check failed.' >&2; exit 1; fi
echo 'Contract templates and PDF converter installed; Console API healthy.'
