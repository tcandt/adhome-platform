const failure = (message, status = 503) => Response.json(
  { error: message }, { status, headers: { 'Cache-Control': 'no-store' } },
);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const paymentWebhook = /^\/api\/v1\/webhooks\/payments\/(sepay|payos|momo|zalopay|tingee)\/[a-fA-F0-9-]{32,36}$/.test(url.pathname);
    if (!url.pathname.startsWith('/api/v1/console/') && !paymentWebhook) return failure('Not found', 404);
    if (paymentWebhook && request.method !== 'POST') return failure('POST required', 405);
    let origin;
    try { origin = new URL(env.CONSOLE_API_ORIGIN); } catch {
      return failure('API quản trị chưa được kết nối.');
    }
    if (origin.protocol !== 'https:' || origin.origin === url.origin || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
      return failure('API configuration unavailable');
    }
    const headers = new Headers(request.headers);
    headers.delete('host');
    try {
      const upstream = await fetch(new URL(url.pathname + url.search, origin), {
        method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual', signal: AbortSignal.timeout(30000),
        cf: { resolveOverride: 'console-api-origin.adhome.vn' },
      });
      const response = new Response(upstream.body, upstream);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch { return failure('API quản trị tạm thời không khả dụng.'); }
  },
};
