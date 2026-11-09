import assert from 'node:assert/strict';
import worker from './index.mjs';

const origin = 'https://console-api.adhome.vn';
const path = '/api/v1/webhooks/payments/sepay/00000000-0000-0000-0000-000000000001';
const env = { CONSOLE_API_ORIGIN: origin, ASSETS: { fetch: () => new Response('asset') } };
const originalFetch = globalThis.fetch;
try {
  const payload = JSON.stringify({ id: 1, transferAmount: 100000 });
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), method: options.method, signature: options.headers.get('x-sepay-signature'), body: await new Response(options.body).text() };
    return Response.json({ success: true });
  };
  const response = await worker.fetch(new Request(`https://console.adhome.vn${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sepay-signature': 'sha256=test' }, body: payload }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(forwarded, { url: `${origin}${path}`, method: 'POST', signature: 'sha256=test', body: payload });
  assert.equal((await worker.fetch(new Request(`https://console.adhome.vn${path}`), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://console.adhome.vn/api/v1/webhooks/other'), env)).status, 404);
  console.log('PASS console worker proxies exact signed payment webhook POSTs');
  const assetEnv = { ...env, ASSETS: { fetch: request => new URL(request.url).pathname.endsWith('/current.js')
    ? new Response('export default 1', { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' } })
    : new Response('<!doctype html><title>SPA</title>', { headers: { 'Content-Type': 'text/html' } }) } };
  const currentAsset = await worker.fetch(new Request('https://console.adhome.vn/assets/current.js'), assetEnv);
  assert.equal(currentAsset.status, 200); assert.equal(await currentAsset.text(), 'export default 1');
  assert.match(currentAsset.headers.get('cache-control'), /immutable/);
  for (const method of ['GET', 'HEAD']) for (const path of ['/assets/missing.js', '/models/missing.onnx', '/models/missing.onnx.data']) {
    const missing = await worker.fetch(new Request(`https://console.adhome.vn${path}`, { method }), assetEnv);
    assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type'), /text\/plain/);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.equal(await missing.text(), method === 'HEAD' ? '' : 'Asset not found');
  }
  const app = await worker.fetch(new Request('https://console.adhome.vn/buildings'), assetEnv);
  assert.match(app.headers.get('cache-control'), /no-store/);
  assert.equal(app.headers.get('cdn-cache-control'), 'no-store');
  assert.match(await app.text(), /SPA/);
  const versionedApp = await worker.fetch(new Request('https://console.adhome.vn/'), { ...assetEnv, WORKER_VERSION: { id: 'release-test' } });
  assert.equal(versionedApp.headers.get('x-console-version'), 'release-test');
  assert.equal(app.headers.get('x-console-version'), null);
  console.log('PASS console worker preserves real assets/cache and SPA routes, rejects HTML fallbacks for missing assets');
} finally { globalThis.fetch = originalFetch; }
