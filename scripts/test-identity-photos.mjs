import { createRequire } from 'node:module';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(resolve('apps/console/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const { chromium } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ entryPoints: ['apps/console/src/shared/ui/decodeIdentityQr.ts'], bundle: true, format: 'esm', platform: 'browser', write: false, plugins: [{ name: 'wasm-url', setup(b) { b.onResolve({ filter: /\.wasm\?url$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'inline-wasm' })); b.onLoad({ filter: /.*/, namespace: 'inline-wasm' }, async args => ({ contents: `export default "data:application/wasm;base64,${(await readFile(args.path)).toString('base64')}"`, loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  const page = await browser.newPage();
  await page.route('http://qr.test/**', route => new URL(route.request().url()).pathname === '/decoder.js' ? route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }) : route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>QR verification</title>' }));
  await page.goto('http://qr.test/');
  const folder = process.env.ADHOME_IDENTITY_PHOTOS;
  if (!folder) throw new Error('Set ADHOME_IDENTITY_PHOTOS to the local attachment folder.');
  for (const file of (await readdir(folder)).filter(n => /\.jpg$/i.test(n)).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))) {
    const number = Number(file.split('-')[0]);
    if (process.env.ADHOME_PHOTO_NUMBERS && !process.env.ADHOME_PHOTO_NUMBERS.split(',').includes(String(number))) continue;
    const expected = JSON.parse(process.env.ADHOME_QR_EXPECTED || '{}')[number];
    const input = (await readFile(resolve(folder, file))).toString('base64');
    const result = await page.evaluate(async ({ input, number, expected }) => {
      const img = new Image(); img.src = `data:image/jpeg;base64,${input}`; await img.decode();
      const { decodeIdentityQr } = await import('/decoder.js');
      const start = performance.now();
      try { const data = await decodeIdentityQr(img, img.naturalWidth, img.naturalHeight, true); return { photo: number, decoded: !!data, validIdentity: !!data && /^\d{12}$/.test(data.idNumber), matchesExpectedIdentity: expected && !!data && Object.entries(expected).every(([key, value]) => data[key] === value), elapsedMs: Math.round(performance.now() - start) }; }
      catch { return { photo: number, decoded: false, error: 'Cannot decode a valid identity QR', elapsedMs: Math.round(performance.now() - start) }; }
    }, { input, number, expected });
    results.push(result); console.log(JSON.stringify(result));
    if (expected && result.decoded) assert.equal(result.matchesExpectedIdentity, true, `Photo ${number}: decoded identity must match the independently supplied expectations`);
  }
} finally { await browser.close(); }
await mkdir('.artifacts/rental-workflow/qr', { recursive: true });
await writeFile('.artifacts/rental-workflow/qr/real-photo-results.json', JSON.stringify(results, null, 2));
console.log(`Decoded ${results.filter(r => r.decoded).length}/${results.length} real photos; no identity contents logged or saved.`);
