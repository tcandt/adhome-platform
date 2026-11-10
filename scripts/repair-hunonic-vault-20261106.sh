#!/usr/bin/env bash
set -euo pipefail

env_file=/etc/adhome-console-api.env
service=adhome-console-api.service

if [[ $(id -u) -ne 0 ]]; then
  echo 'Run this script with sudo.' >&2
  exit 1
fi
if [[ ! -f $env_file ]]; then
  echo 'Console API environment file is missing.' >&2
  exit 1
fi

existing=$(sed -n 's/^ADHOME_CREDENTIALS_ENCRYPTION_KEY=//p' "$env_file" | tail -n 1)
if [[ -n $existing ]]; then
  if (( ${#existing} < 32 )); then
    echo 'An encryption key exists but is too short. Stopped to avoid replacing a key that may protect existing credentials.' >&2
    exit 1
  fi
  echo 'A valid encryption key is already configured; checking the running service.'
else
  if grep -q '^ADHOME_CREDENTIALS_ENCRYPTION_KEY=' "$env_file"; then
    echo 'An empty encryption key entry exists. Stopped for manual review.' >&2
    exit 1
  fi
  backup="${env_file}.before-vault-$(date +%Y%m%d-%H%M%S)"
  cp -p "$env_file" "$backup"
  chmod 600 "$backup"
  printf '\nADHOME_CREDENTIALS_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 48)" >> "$env_file"
  echo 'Generated a persistent encryption key in the Console API environment file.'
fi

systemctl restart "$service"
if ! systemctl is-active --quiet "$service"; then
  echo 'Console API failed to start.' >&2
  exit 1
fi
pid=$(systemctl show "$service" -p MainPID --value)
if [[ ! $pid =~ ^[1-9][0-9]*$ ]] || ! grep -zq '^ADHOME_CREDENTIALS_ENCRYPTION_KEY=.' "/proc/$pid/environ"; then
  echo 'Console API is active but the encryption key did not reach its process.' >&2
  exit 1
fi
echo 'Console API is active and received the encryption key.'
