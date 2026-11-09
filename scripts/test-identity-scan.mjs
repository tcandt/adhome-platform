import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.env.ADHOME_SCAN_PHOTOS || 'C:/Users/TINH-NGUYEN/.codex/codex-remote-attachments';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190');
  await page.evaluate(async () => { window.scanModule = await import('/src/shared/ui/identityDocumentScan.ts'); });
  const negative = await page.evaluate(async () => {
    const results = [];
    for (const kind of ['blank', 'blue-card-without-print', 'white-paper', 'skin-color']) {
      const c = document.createElement('canvas'); c.width = 900; c.height = 650;
      const x = c.getContext('2d'); x.fillStyle = '#333'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = kind === 'blue-card-without-print' ? '#b1dce0' : kind === 'skin-color' ? '#bd896c' : '#eee';
      x.fillRect(130, 120, 640, 405);
      if (kind === 'white-paper' || kind === 'skin-color') {
        x.fillStyle = '#222'; for (let y = 180; y < 470; y += 32) x.fillRect(170, y, 500, 7);
      }
      const result = await window.scanModule.detectIdentityDocument(c);
      results.push({ kind, automatic: result.automatic });
    }
    const original = document.createElement('canvas'); original.width = 900; original.height = 600;
    const x = original.getContext('2d'); x.fillStyle = '#123'; x.fillRect(0, 0, 900, 600);
    const corners = [{ x: .12, y: .18 }, { x: .88, y: .12 }, { x: .85, y: .86 }, { x: .15, y: .88 }];
    x.fillStyle = '#ddd'; x.beginPath(); corners.forEach((p,i)=>x[i?'lineTo':'moveTo'](p.x*900,p.y*600)); x.closePath(); x.fill();
    for (const [i, p] of corners.entries()) {
      x.fillStyle = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'][i]; x.fillRect(p.x * 900 - 25, p.y * 600 - 25, 50, 50);
    }
    const warped = await window.scanModule.flattenIdentityDocument(original, corners);
    const region = await window.scanModule.identityDocumentCropRegion(original, corners);
    const w = warped.getContext('2d');
    const padding = region.padding;
    const pixels = [[padding + 4, padding + 4], [warped.width - padding - 5, padding + 4], [warped.width - padding - 5, warped.height - padding - 5], [padding + 4, warped.height - padding - 5]]
      .map(([x, y]) => [...w.getImageData(x, y, 1, 1).data].slice(0, 3));
    let invalidRejected = false;
    try { await window.scanModule.flattenIdentityDocument(original, [corners[0], corners[2], corners[1], corners[3]]); }
    catch { invalidRejected = true; }
    const background = [[warped.width/2,1],[warped.width-2,warped.height/2],[warped.width/2,warped.height-2],[1,warped.height/2]]
      .map(([x,y])=>[...w.getImageData(Math.floor(x),Math.floor(y),1,1).data].slice(0,3));
    const fullFrame = await window.scanModule.identityDocumentCropRegion(original, [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
    const clipped = await window.scanModule.identityDocumentCropRegion(original, [{x:0,y:.1},{x:.8,y:.1},{x:.8,y:.9},{x:0,y:.9}]);
    return { results, padding, requestedPadding:region.requestedPadding, cardShortSide:Math.min(region.cardWidth,region.cardHeight),
      aspect:region.cardWidth/region.cardHeight, pixels, background, invalidRejected, fullFramePadding:fullFrame.padding, clippedPadding:clipped.padding,
      expanded:region.samplingCorners, corners };
  });
  assert.ok(negative.results.every(r => !r.automatic), 'blank and non-document rectangles must never auto-queue');
  assert.ok(Math.abs(negative.aspect - 1.586) < .01);
  assert.equal(negative.padding, Math.max(24, Math.round(negative.cardShortSide * .08)), 'source sampling expands by 8% of the card short side when space is available');
  assert.equal(negative.padding,negative.requestedPadding);
  assert.equal(negative.fullFramePadding,0,'full-frame image has no pixels to expand into');
  assert.equal(negative.clippedPadding,0,'clipped edge cannot be padded with invented pixels');
  assert.ok(negative.expanded.every((p,i)=>Math.hypot(p.x-negative.corners[i].x,p.y-negative.corners[i].y)>.01),'all four sampling corners expand before cropping');
  for(const pixel of negative.background)assert.deepEqual(pixel,[17,34,51],'all four margins retain actual dark source background, not a white canvas border');
  for (const [i, expected] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]].entries()) {
    assert.ok(expected.every((value, channel) => Math.abs(value - negative.pixels[i][channel]) < 5), 'perspective warp preserves all four independently colored corners');
  }
  assert.equal(negative.invalidRejected, true);
  console.log('PASS source padding on all four sides, frame-bound limits, perspective corner mapping, ID-1 ratio, negative controls and crossed-corner rejection');

  const expectations = JSON.parse(await readFile('.artifacts/identity-scan/expectations.json', 'utf8'));
  let accepted = 0, count = 0;
  for (const [id, folder, number] of [
    ['A2', '01a1a1c7-6f60-79f0-be4f-718345902c22/DA52F6AE-26D2-4ECE-92BC-AF5F3DB98C6D', 2],
    ['A4', '01a1a1c7-6f60-79f0-be4f-718345902c22/DA52F6AE-26D2-4ECE-92BC-AF5F3DB98C6D', 4],
    ['B3', '01a1a051-cee0-7753-8be6-0b3489213e3b/59C3B04C-FECB-410B-B1DD-5E336CFA1D60', 3],
  ]) {
    const base64 = (await readFile(join(root, folder, `${number}-Ảnh-${number}.jpg`))).toString('base64');
    for (const variant of ['rotate-90', 'rotate-180', 'rotate-270', 'dim', 'small']) {
      const result = await page.evaluate(async ({ base64, variant, corners }) => {
        const img = new Image(); img.src = `data:image/jpeg;base64,${base64}`; await img.decode();
        const limit = variant === 'small' ? 720 : 1800, scale = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.round(img.naturalWidth * scale), height = Math.round(img.naturalHeight * scale);
        const turn = variant.startsWith('rotate-') ? Number(variant.split('-')[1]) / 90 : 0;
        const c = document.createElement('canvas'); c.width = turn % 2 ? height : width; c.height = turn % 2 ? width : height;
        const x = c.getContext('2d');
        if (turn === 1) { x.translate(c.width, 0); x.rotate(Math.PI / 2); }
        if (turn === 2) { x.translate(c.width, c.height); x.rotate(Math.PI); }
        if (turn === 3) { x.translate(0, c.height); x.rotate(-Math.PI / 2); }
        x.filter = variant === 'dim' ? 'brightness(0.62)' : 'none'; x.drawImage(img, 0, 0, width, height);
        const expected = corners.map(([x, y]) => turn === 1 ? [1 - y, x] : turn === 2 ? [1 - x, 1 - y] : turn === 3 ? [y, 1 - x] : [x, y]);
        const result = await window.scanModule.detectIdentityDocument(c);
        const error = result.corners ? Math.min(...[0, 1, 2, 3].map(start => result.corners.reduce((sum, p, i) => {
          const q = expected[(i + start) % 4]; return sum + Math.hypot(p.x - q[0], p.y - q[1]);
        }, 0) / 4)) : null;
        return { automatic: result.automatic, error };
      }, { base64, variant, corners: expectations[id].corners });
      count++; if (result.automatic) { accepted++; assert.ok(result.error < .035, `${id} ${variant}: accepted crop must preserve outer corners (${result.error})`); }
      console.log(`PASS ${id} ${variant}: ${result.automatic ? 'automatic, annotated corners verified' : 'requests clearer photo'}`);
    }
  }
  assert.ok(accepted >= 9, 'most readable variants remain automatic');
  console.log(`PASS ${accepted}/${count} variants automatically accepted; every accepted variant matches independently annotated geometry.`);
} finally { await browser.close(); }
