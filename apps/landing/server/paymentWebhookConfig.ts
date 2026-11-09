import type { IncomingMessage } from 'node:http';

export const webhookPath = (providerId: string, connectionId: string) => `/api/v1/webhooks/payments/${providerId.toLowerCase()}/${connectionId}`;

const officialHosts = new Set(['console.adhome.vn', 'adhome.vn']);
const canonicalOrigin = 'https://console.adhome.vn';

/** Auto-detect only the project's public domains; a forged Host cannot redirect callbacks. */
export function paymentWebhookOrigin(req?: Pick<IncomingMessage, 'headers'>): string {
  const headers = req?.headers || {};
  const candidates = [headers['x-adhome-console-origin'], headers.origin, headers.referer, headers.host ? `https://${headers.host}` : ''];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port && officialHosts.has(url.hostname)) return url.origin;
    } catch { /* Local addresses and unrecognized hosts fall back to the public management domain. */ }
  }
  return canonicalOrigin;
}

export function webhookAddress(providerId: string, connectionId: string, req?: Pick<IncomingMessage, 'headers'>) {
  const path = webhookPath(providerId, connectionId);
  const origin = paymentWebhookOrigin(req);
  return { webhookPath: path, webhookUrl: `${origin}${path}` };
}
