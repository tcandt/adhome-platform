import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.ADHOME_SHARP_MODULE || 'sharp');
const root = process.env.ADHOME_SCAN_PHOTOS || 'C:/Users/TINH-NGUYEN/.codex/codex-remote-attachments';
const defaultGroups = [
  ['A', '01a1a1c7-6f60-79f0-be4f-718345902c22/DA52F6AE-26D2-4ECE-92BC-AF5F3DB98C6D'],
  ['B', '01a1a051-cee0-7753-8be6-0b3489213e3b/59C3B04C-FECB-410B-B1DD-5E336CFA1D60'],
];
const groups = process.env.ADHOME_SCAN_FOLDERS ? JSON.parse(process.env.ADHOME_SCAN_FOLDERS) : defaultGroups;
const requested = process.env.ADHOME_SCAN_CASES?.split(',');
const expectations = process.env.ADHOME_SCAN_EXPECTATIONS ? JSON.parse(await readFile(process.env.ADHOME_SCAN_EXPECTATIONS, 'utf8')) : null;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('.artifacts/identity-scan/results', { recursive: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190');
  await page.evaluate(async () => { window.scanModule = await import('/src/shared/ui/identityDocumentScan.ts'); });
  for (const [group, folder] of groups) {
    for (const file of (await readdir(join(root, folder))).filter(n => /\.jpg$/i.test(n)).sort((a, b) => parseInt(a) - parseInt(b))) {
      const id = `${group}${parseInt(file)}`;
      if (requested && !requested.includes(id)) continue;
      const base64 = (await readFile(join(root, folder, file))).toString('base64');
      const result = await page.evaluate(async ({ id, base64, processDebug }) => {
        const img = new Image(); img.src = `data:image/jpeg;base64,${base64}`; await img.decode();
        const scale = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
        const start = performance.now();
        const detection = window.scanModule.detectIdentityDocument ? await window.scanModule.detectIdentityDocument(c, { debug: processDebug }) : { corners: await window.scanModule.detectDocumentCorners(c) };
        const elapsedMs = Math.round(performance.now() - start);
        let flattened = null;
        if (detection.corners) {
          const card = await window.scanModule.flattenIdentityDocument(c, detection.corners, detection.rotation || 0);
          flattened = card.toDataURL('image/png').split(',')[1];
          ctx.strokeStyle = '#ff1717'; ctx.lineWidth = Math.max(3, c.width / 250); ctx.beginPath();
          for (const [index, point] of detection.corners.entries()) { ctx[index ? 'lineTo' : 'moveTo'](point.x * c.width, point.y * c.height); }
          ctx.closePath(); ctx.stroke();
        }
        const out = document.createElement('canvas'); out.width = 300; out.height = 270; const x = out.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, out.width, out.height);
        const ratio = Math.min(300 / c.width, 245 / c.height); x.drawImage(c, (300 - c.width * ratio) / 2, 24, c.width * ratio, c.height * ratio);
        x.fillStyle = '#000'; x.font = '14px Arial'; x.fillText(`${id} ${detection.confidence?.toFixed(2) || ''} ${elapsedMs}ms`, 5, 17);
        return { id, corners: detection.corners, confidence: detection.confidence, automatic: detection.automatic, rotation: detection.rotation, width: c.width, height: c.height, elapsedMs,
          thumbnail: out.toDataURL('image/png').split(',')[1], flattened, ...(detection.debug ? { debug: detection.debug } : {}) };
      }, { id, base64, processDebug: process.env.ADHOME_SCAN_DEBUG === '1' });
      await writeFile(`.artifacts/identity-scan/results/${id}.png`, Buffer.from(result.thumbnail, 'base64'));
      if (result.flattened) await writeFile(`.artifacts/identity-scan/results/${id}-flat.png`, Buffer.from(result.flattened, 'base64'));
      delete result.thumbnail; delete result.flattened; results.push(result); console.log(JSON.stringify(result));
      const expected = expectations?.[id];
      if (expected) {
        assert.equal(result.automatic, expected.automatic, `${id}: automatic acceptance must match the independently reviewed photo`);
        if (result.automatic) {
          const errors = result.corners.map((p, i) => Math.hypot(p.x - expected.corners[i][0], p.y - expected.corners[i][1]));
          assert.ok(Math.max(...errors) < 0.045 && errors.reduce((s, n) => s + n, 0) / 4 < 0.025, `${id}: automatic crop must match annotated outer corners`);
        }
      }
    }
  }
} finally { await browser.close(); }
await writeFile('.artifacts/identity-scan/results/results.json', JSON.stringify(results, null, 2));
const tiles = await Promise.all(results.map(async (r, i) => {
  const annotated = await sharp(await readFile(`.artifacts/identity-scan/results/${r.id}.png`)).resize(300, 270, { fit: 'contain', background: '#ddd' }).png().toBuffer();
  const flattened = await sharp(await readFile(`.artifacts/identity-scan/results/${r.id}-flat.png`)).resize(300, 270, { fit: 'contain', background: '#fff' }).png().toBuffer();
  return [{ input: annotated, left: (i % 3) * 600, top: Math.floor(i / 3) * 270 }, { input: flattened, left: (i % 3) * 600 + 300, top: Math.floor(i / 3) * 270 }];
}));
await sharp({ create: { width: 1800, height: Math.ceil(results.length / 3) * 270, channels: 3, background: '#ddd' } }).composite(tiles.flat()).png().toFile('.artifacts/identity-scan/results/contact.png');
console.log(`Automatic ${results.filter(r => r.automatic).length}/${results.length}; uncertain ${results.filter(r => !r.automatic).length}. ${expectations ? 'Annotated corner accuracy verified.' : 'Detection count alone does not verify accuracy.'} Identity text is never logged.`);
