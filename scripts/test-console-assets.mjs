import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const base = process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187';
const html = await fetch(base);
assert.equal(html.status, 200);
const htmlCache = html.headers.get('cache-control') || '';
assert.ok(/no-store/.test(htmlCache) || (/max-age=0/.test(htmlCache) && /must-revalidate/.test(htmlCache)), 'HTML must not be served stale after a deployment');
await html.arrayBuffer();
const assets = (await readdir('apps/console/dist/assets')).filter(name => /^(jsQR-.+\.js|zxing_reader-.+\.wasm)$/.test(name));
for (let start = 0; start < assets.length; start += 6) {
  await Promise.all(assets.slice(start, start + 6).map(async file => {
    const response = await fetch(`${base}/assets/${file}`, { signal: AbortSignal.timeout(30000) });
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', file.endsWith('.wasm') ? /application\/wasm/ : /javascript/);
  }));
}
const missing = await fetch(`${base}/assets/does-not-exist-qr.js`);
const missingBody = await missing.text();
assert.equal(missing.status, 404);
assert.doesNotMatch(missing.headers.get('content-type') || '', /html/);
assert.doesNotMatch(missingBody, /<!doctype html|<html/i);
console.log('PASS console assets: fresh/revalidated HTML, current/retained QR JavaScript, local WASM MIME, missing assets return 404 without SPA HTML');
