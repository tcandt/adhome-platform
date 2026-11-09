import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const base = process.env.ADHOME_UI_URL || 'https://console.adhome.vn';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const localHtml = await readFile('apps/console/dist/index.html', 'utf8');
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  const assets = await page.evaluate(html => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return [...document.querySelectorAll('script[src],link[rel="stylesheet"]')]
      .map(el => el.getAttribute('src') || el.getAttribute('href')).filter(path => path.startsWith('/assets/'));
  }, localHtml);
  const remoteAssets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(elements => elements.map(el => el.getAttribute('src') || el.getAttribute('href')));
  for (const asset of assets) assert.ok(remoteAssets.includes(asset), `production entrypoint must reference tested asset ${asset}`);
  const runtimeAssets = (await readdir('apps/console/dist/assets')).filter(name => /^(?:ort\.wasm\.bundle.*\.js|ort-wasm-simd-threaded.*\.wasm)$/.test(name));
  const detectorAssets = (await readdir('apps/console/dist/assets')).filter(name => /^identityCornerModelV2-.+\.js$/.test(name));
  assert.ok(runtimeAssets.length >= 2, 'ONNX JavaScript and WASM must be packaged');
  assert.ok(detectorAssets.length, 'the V2 detector chunk must be packaged');
  for (const asset of [...assets, '/assets/opencv-CFWAkvrC.js', '/assets/zxing_reader-BCjuyud6.wasm', ...runtimeAssets.map(name => `/assets/${name}`), ...detectorAssets.map(name => `/assets/${name}`), '/models/identity-corners-v2.onnx']) {
    const remote = await fetch(new URL(asset, base)); assert.equal(remote.status, 200);
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest(Buffer.from(await remote.arrayBuffer())), digest(await readFile(`apps/console/dist${asset}`)), `SHA256 matches tested build: ${asset}`);
    assert.match(remote.headers.get('content-type') || '', asset.endsWith('.wasm') ? /application\/wasm/ : asset.endsWith('.css') ? /text\/css/ : asset.startsWith('/models/') ? /octet-stream/ : /javascript/);
    console.log(`PASS production checksum/MIME ${asset}`);
  }
  for (const path of ['/assets/missing-identity-release.js', '/models/missing-identity-release.onnx']) {
    const missing = await fetch(new URL(path, base));
    assert.equal(missing.status, 404); await missing.arrayBuffer();
  }
  const inference = await page.evaluate(async runtimeAssets => {
    const ort = await import(`/assets/${runtimeAssets.find(name => name.endsWith('.js'))}`);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: `/assets/${runtimeAssets.find(name => name.endsWith('.wasm'))}` };
    const session = await ort.InferenceSession.create('/models/identity-corners-v2.onnx', { executionProviders: ['wasm'] });
    try {
      const result = await session.run({ image: new ort.Tensor('float32', new Float32Array(3 * 320 * 320), [1, 3, 320, 320]) });
      return { dimensions: result.heatmaps.dims, presenceDimensions: result.presence.dims, finite: Array.from(result.heatmaps.data).every(Number.isFinite) };
    } finally { await session.release(); }
  }, runtimeAssets);
  assert.deepEqual(inference.dimensions, [1, 4, 80, 80]); assert.deepEqual(inference.presenceDimensions, [1, 1]); assert.equal(inference.finite, true);
  console.log('PASS ONNX V2 inference with shipped semantic-corner model and WASM');
  const auth = await fetch(new URL('/api/v1/console/auth/me', base));
  assert.equal(auth.status, 401);
  console.log('PASS public Console entrypoint and unauthenticated API boundary');
} finally { await browser.close(); }
