"""Rotate the Zalo Bot webhook secret on the server without exposing it."""

import json
import os
import pathlib
import secrets
import urllib.request

ENV_FILE = pathlib.Path('/etc/adhome-zalo-webhook.env')
WEBHOOK_URL = 'https://api.adhome.vn/api/v1/zalo-bot/webhook'


def main():
    lines = ENV_FILE.read_text().splitlines()
    config = dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))
    token = config['ZALO_BOT_TOKEN']
    new_secret = secrets.token_urlsafe(32)
    updated = [line for line in lines if not line.startswith('ZALO_BOT_WEBHOOK_SECRET=')]
    updated.append(f'ZALO_BOT_WEBHOOK_SECRET={new_secret}')
    temporary = ENV_FILE.with_name(ENV_FILE.name + '.new')
    with temporary.open('w') as output:
        output.write('\n'.join(updated) + '\n')
    os.chmod(temporary, 0o600)
    os.replace(temporary, ENV_FILE)
    payload = json.dumps({'url': WEBHOOK_URL, 'secret_token': new_secret}).encode()
    request = urllib.request.Request(
        f'https://bot-api.zaloplatforms.com/bot{token}/setWebhook',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    print(json.dumps({
        'saved': True,
        'provider_ok': result.get('ok'),
        'url': result.get('result', {}).get('url'),
        'verification': result.get('result', {}).get('verification', {}).get('outcome'),
    }))


if __name__ == '__main__':
    main()
