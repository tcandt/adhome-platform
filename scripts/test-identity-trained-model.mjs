import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.env.ADHOME_MODEL_FIXTURES || '.training/identity-corners');
const annotations = Object.assign({}, ...await Promise.all(['expectations-base.json', 'expectations-new.json'].map(async file => JSON.parse(await readFile(resolve(root, file), 'utf8')))));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190');
  for (const group of ['A', 'B', 'N']) {
    for (const file of (await readdir(resolve(root, 'images', group))).filter(file => /\.jpg$/i.test(file))) {
      const id = `${group}${parseInt(file)}`;
      const expected = annotations[id];
      assert.ok(expected, `Missing annotations: ${id}`);
      const result = await page.evaluate(async data => {
        const scanner = await import('/src/shared/ui/identityDocumentScan.ts');
        const image = new Image(); image.src = `data:image/jpeg;base64,${data}`; await image.decode();
        const scale = Math.min(1, 2600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = await scanner.detectIdentityDocument(canvas, { debug: true });
        return { automatic: result.automatic, corners: result.corners, modelPredicted: result.debug.modelPredicted, modelCorners: result.debug.modelCorners, method: result.debug.candidates[0]?.method };
      }, (await readFile(resolve(root, 'images', group, file))).toString('base64'));
      assert.equal(result.modelPredicted, true, `${id}: trained ONNX model must run, not silently fall back`);
      const errors = points => points.map((p, i) => Math.hypot(p.x - expected.corners[i][0], p.y - expected.corners[i][1]));
      const modelErrors = errors(result.modelCorners);
      assert.ok(Math.max(...modelErrors) < 0.05, `${id}: model corner error ${Math.max(...modelErrors)}`);
      if (result.automatic) {
        const cropErrors = errors(result.corners);
        assert.ok(Math.max(...cropErrors) < 0.045 && cropErrors.reduce((sum, error) => sum + error, 0) / 4 < 0.025, `${id}: accepted crop must match annotated outer corners`);
      }
      results.push({ id, ...result });
      console.log(`PASS ${id}: ONNX inference verified; ${result.automatic ? 'automatic crop geometry verified' : 'manual review required'}`);
    }
  }
  assert.equal(results.length, 30);
  await mkdir('.artifacts/identity-scan', { recursive: true });
  await writeFile('.artifacts/identity-scan/trained-model-results.json', JSON.stringify(results, null, 2));
  console.log(`PASS trained model on ${results.length} annotated photos; ${results.filter(result => result.automatic).length} automatic crops verified.`);
} finally { await browser.close(); }
