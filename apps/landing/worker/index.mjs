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
    if (url.pathname === '/api/v1/public/boot-report') {
      if (request.method !== 'POST') return failure('Method not allowed', 405);
      if (request.headers.get('origin') !== url.origin) return failure('Forbidden', 403);
      // Bound both streamed bodies and logged fields from this unauthenticated endpoint.
      if (!request.body) return failure('Invalid report', 400);
      const reader = request.body.getReader();
      let length = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1024) { await reader.cancel(); return failure('Report too large', 413); }
        chunks.push(value);
      }
      try {
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const report = JSON.parse(new TextDecoder().decode(bytes));
        const kinds = ['resource', 'runtime', 'render', 'timeout'];
        if (!kinds.includes(report.kind)) return failure('Invalid report', 400);
        const safe = value => String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 60);
        console.warn('landing_boot_failure', JSON.stringify({
          kind: report.kind, release: safe(report.release), errorName: safe(report.errorName),
          asset: /^\/assets\/[a-zA-Z0-9_.-]+\.js$/.test(report.asset || '') ? report.asset : '',
          device: /iPhone|iPad/.test(request.headers.get('user-agent') || '') ? 'ios' : 'other',
        }));
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      } catch { return failure('Invalid report', 400); }
    }
    if (url.pathname.startsWith('/assets/')) {
      const asset = await env.ASSETS.fetch(request);
      // SPA fallback is valid for pages, never for missing versioned bundles.
      if ((asset.headers.get('Content-Type') || '').includes('text/html')) {
        return new Response('Asset not found', {
          status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        });
      }
      return asset;
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const methods = url.pathname.startsWith('/api/v1/public/room-images/') ? ['GET'] : PUBLIC_ROUTES.get(url.pathname);
    if (!methods) return failure('Not found', 404);
    if (!methods.includes(request.method)) return new Response(null, {
      status: 405, headers: { Allow: methods.join(', '), 'Cache-Control': 'no-store' },
    });
    const upstreamOrigin = url.pathname === '/api/v1/public/rooms' || url.pathname.startsWith('/api/v1/public/room-images/')
      ? env.PUBLIC_ROOMS_API_ORIGIN || env.PUBLIC_API_ORIGIN
      : env.PUBLIC_API_ORIGIN;
    if (!upstreamOrigin) return failure('Dịch vụ đang được kết nối. Vui lòng liên hệ 05678.67889 hoặc admin@adhome.vn.');
    let origin;
    try { origin = new URL(upstreamOrigin); } catch { return failure('API configuration unavailable'); }
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
