const PUBLIC_ROUTES = new Map([
  ['/api/v1/public/rooms', ['GET', 'HEAD']],
  ['/api/v1/public/inquiries', ['POST']],
  ['/api/v1/public/rum', ['POST']],
]);

const failure = (message, status = 503) => Response.json(
  { error: message }, { status, headers: { 'Cache-Control': 'no-store' } },
);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const methods = PUBLIC_ROUTES.get(url.pathname);
    if (!methods) return failure('Not found', 404);
    if (!methods.includes(request.method)) return new Response(null, {
      status: 405, headers: { Allow: methods.join(', '), 'Cache-Control': 'no-store' },
    });
    if (!env.PUBLIC_API_ORIGIN) return failure('Dịch vụ đang được kết nối. Vui lòng liên hệ 05678.67889 hoặc admin@adhome.vn.');
    let origin;
    try { origin = new URL(env.PUBLIC_API_ORIGIN); } catch { return failure('API configuration unavailable'); }
    if (origin.protocol !== 'https:' || origin.origin === url.origin || origin.pathname !== '/' || origin.username || origin.password) {
      return failure('API configuration unavailable');
    }
    const headers = new Headers(request.headers);
    headers.delete('host');
    // Public endpoints never forward console authentication or session cookies.
    headers.delete('authorization');
    headers.delete('cookie');
    try {
      const upstream = await fetch(new URL(url.pathname + url.search, origin), {
        method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual', signal: AbortSignal.timeout(10000),
      });
      const response = new Response(upstream.body, upstream);
      response.headers.delete('set-cookie');
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch { return failure('Hệ thống dữ liệu tạm thời chưa kết nối. Vui lòng liên hệ 05678.67889.'); }
  },
};
