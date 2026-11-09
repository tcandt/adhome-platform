import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const manifest = JSON.parse(await readFile(process.env.ADHOME_CORNER_MANIFEST || '.training/identity-v2/manifest.json', 'utf8'));
const output = resolve(process.env.ADHOME_CORNER_OUTPUT || '.artifacts/identity-v2/browser-final');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const variants = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190');
  await page.evaluate(async () => { window.cornerScanner = await import('/src/shared/ui/identityDocumentScan.ts'); });
  for (const row of manifest) {
    const base64 = (await readFile(row.path)).toString('base64');
    const versions = process.env.ADHOME_COMPARE_BASELINE === '1' ? [1, 2] : [2];
    const outputs = {};
    for (const version of versions) {
      outputs[version] = await page.evaluate(async ({ base64, version }) => {
        const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode();
        const scale = Math.min(1, 2600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const start = performance.now();
        const detection = await window.cornerScanner.detectIdentityDocument(canvas, { debug: true, modelVersion: version });
        let flat = null;
        if (detection.corners) {
          const crop = await window.cornerScanner.flattenIdentityDocument(canvas, detection.corners, detection.rotation);
          flat = crop.toDataURL('image/jpeg', .94).split(',')[1];
          ctx.strokeStyle = '#ed233d'; ctx.lineWidth = Math.max(3, canvas.width / 300); ctx.beginPath();
          detection.corners.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * canvas.width, p.y * canvas.height)); ctx.closePath(); ctx.stroke();
        }
        return { corners: detection.corners, automatic: detection.automatic, rotation: detection.rotation, debug: detection.debug, elapsedMs: Math.round(performance.now() - start),
          marked: canvas.toDataURL('image/jpeg', .88).split(',')[1], flat };
      }, { base64, version });
      const r = outputs[version];
      await writeFile(join(output, `${row.id}-v${version}-marked.jpg`), Buffer.from(r.marked, 'base64'));
      if (r.flat) await writeFile(join(output, `${row.id}-v${version}-flat.jpg`), Buffer.from(r.flat, 'base64'));
      delete r.marked; delete r.flat;
      if (row.positive && r.corners) {
        const target = row.corners.map((_, i) => row.corners[(i + (row.uprightStart || 0)) % 4]);
        const errors = [0, 1, 2, 3].map(shift => r.corners.map((p, i) => Math.hypot(p.x - target[(i + shift) % 4][0], p.y - target[(i + shift) % 4][1]))).sort((a, b) => a.reduce((s, x) => s + x, 0) - b.reduce((s, x) => s + x, 0))[0];
        r.mean = errors.reduce((sum, error) => sum + error, 0) / 4; r.max = Math.max(...errors);
        r.geometryPass = r.mean < .02 && r.max < .04;
        const semantic = r.corners.map((_, i) => r.corners[(i + r.rotation) % 4]);
        r.semanticMax = Math.max(...semantic.map((p, i) => Math.hypot(p.x - target[i][0], p.y - target[i][1])));
        r.uprightPass = r.semanticMax < .05;
      } else { r.geometryPass = false; r.uprightPass = false; }
    }
    assert.equal(outputs[2].debug.modelPredicted, true, `${row.id}: model must run`);
    results.push({ id: row.id, positive: row.positive, split: row.split, source: row.path, outputs });
    console.log(`${row.id} V2 ${outputs[2].automatic ? 'AUTO' : 'REVIEW'} geometry=${outputs[2].geometryPass} upright=${outputs[2].uprightPass}`);
    if (row.positive && process.env.ADHOME_CORNER_VARIANTS === '1') for (const variant of ['rotate90', 'rotate180', 'rotate270', 'dim', 'small']) {
      const r = await page.evaluate(async ({ base64, variant, target }) => {
        const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode();
        const turn = variant.startsWith('rotate') ? Number(variant.slice(6)) / 90 : 0;
        const limit = variant === 'small' ? 720 : 1800, scale = Math.min(1, limit / Math.max(image.width, image.height));
        const w = Math.round(image.width * scale), h = Math.round(image.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = turn % 2 ? h : w; canvas.height = turn % 2 ? w : h;
        const ctx = canvas.getContext('2d');
        if (turn === 1) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
        if (turn === 2) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
        if (turn === 3) { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); }
        ctx.filter = variant === 'dim' ? 'brightness(.62)' : 'none'; ctx.drawImage(image, 0, 0, w, h);
        const expected = target.map(([x,y]) => turn === 1 ? [1-y,x] : turn === 2 ? [1-x,1-y] : turn === 3 ? [y,1-x] : [x,y]);
        const result = await window.cornerScanner.detectIdentityDocument(canvas, { modelVersion: 2 });
        const error = result.corners ? Math.max(...result.corners.map((p,i)=>Math.hypot(p.x-expected[i][0],p.y-expected[i][1]))) : null;
        return { automatic: result.automatic, max: error, uprightPass: error !== null && error < .05 };
      }, { base64, variant, target: row.corners.map((_, i) => row.corners[(i + (row.uprightStart || 0)) % 4]) });
      variants.push({ id: row.id, variant, ...r });
    }
  }
  const negatives = await page.evaluate(async () => {
    const result = [];
    for (const kind of ['blank', 'blue-card-without-print', 'white-paper', 'skin-color']) {
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 650;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#333'; ctx.fillRect(0,0,900,650);
      ctx.fillStyle = kind === 'blue-card-without-print' ? '#b1dce0' : kind === 'skin-color' ? '#bd896c' : '#eee'; ctx.fillRect(130,120,640,405);
      if (kind === 'white-paper' || kind === 'skin-color') { ctx.fillStyle = '#222'; for (let y=180;y<470;y+=32)ctx.fillRect(170,y,500,7); }
      const detection = await window.cornerScanner.detectIdentityDocument(canvas, { modelVersion: 2 }); result.push({ kind, automatic: detection.automatic });
    }
    return result;
  });
  const summarize = version => {
    const positives = results.filter(r => r.positive), negatives = results.filter(r => !r.positive);
    return { positive: positives.length, geometryPass: positives.filter(r=>r.outputs[version]?.geometryPass).length, uprightPass: positives.filter(r=>r.outputs[version]?.uprightPass).length,
      automaticPositive: positives.filter(r=>r.outputs[version]?.automatic).length, falsePositive: negatives.filter(r=>r.outputs[version]?.automatic).length,
      acceptedWrongGeometry: positives.filter(r=>r.outputs[version]?.automatic&&!r.outputs[version]?.geometryPass).map(r=>r.id) };
  };
  const summary = { tested: results.length, modelSha256: createHash('sha256').update(await readFile('apps/console/public/models/identity-corners-v2.onnx')).digest('hex'),
    v2: summarize(2), ...(versionsAvailable(results,1) ? {v1:summarize(1)} : {}), negatives,
    variants: { total: variants.length, automatic: variants.filter(r=>r.automatic).length, uprightPass: variants.filter(r=>r.uprightPass).length, acceptedFailures: variants.filter(r=>r.automatic&&!r.uprightPass) } };
  await writeFile(join(output, 'results.json'), JSON.stringify({ summary, results, variants }, null, 2));
  console.log(JSON.stringify(summary));
  assert.ok(negatives.every(r=>!r.automatic), 'unrelated rectangles must not be accepted');
  assert.equal(summary.v2.falsePositive,0,'non-CCCD examples must not be accepted');
  assert.equal(summary.v2.geometryPass,summary.v2.positive,'all reviewed CCCD geometry must match annotations');
  assert.equal(summary.v2.uprightPass,summary.v2.positive,'semantic corners must preserve reading orientation');
  assert.equal(summary.variants.acceptedFailures.length,0,'accepted variants must preserve annotated corners and orientation');
} finally { await browser.close(); }

function versionsAvailable(results,version) { return results.every(r=>r.outputs[version]); }
