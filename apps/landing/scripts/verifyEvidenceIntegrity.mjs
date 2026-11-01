import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve('d:\\AdHome-Platform');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'console-v2', 'BASE-01', 'e3d4fb7');
const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const MANIFEST_PATH = path.join(EVIDENCE_DIR, 'screenshots-manifest.json');
const OUTPUT_PATH = path.join(EVIDENCE_DIR, 'evidence-integrity-test.json');

const SOURCE_COMMIT = '43c2c74';

function parsePngDimensions(buf) {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — BASE-01-FIX-01 Evidence Integrity Verifier');
  console.log(`Commit: ${SOURCE_COMMIT} | Target Dir: ${SCREENSHOTS_DIR}`);
  console.log('=================================================================\n');

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found at: ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const manifestMap = new Map(manifest.map((item) => [item.filename, item]));

  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  const results = [];

  for (const filename of files) {
    const fullPath = path.join(SCREENSHOTS_DIR, filename);
    const buf = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const byteSize = buf.length;
    const dims = parsePngDimensions(buf);

    const manifestEntry = manifestMap.get(filename);
    const cssViewport = manifestEntry?.viewport || 'unknown';
    const [cssW, cssH] = cssViewport.split('x').map(Number);
    const deviceScaleFactor = 2; // CDP setDeviceMetricsOverride deviceScaleFactor = 2

    const expectedWidth = cssW * deviceScaleFactor;
    const expectedHeight = cssH * deviceScaleFactor;

    const pixelDimensionsValid = dims
      ? dims.width === expectedWidth && dims.height === expectedHeight
      : false;

    const shaMatches = manifestEntry ? manifestEntry.sha256.toLowerCase() === sha256.toLowerCase() : false;
    const sizeMatches = manifestEntry ? manifestEntry.sizeBytes === byteSize : false;

    results.push({
      filename,
      byteSize,
      cssViewport,
      screenshotPixels: dims ? `${dims.width}x${dims.height}` : 'unknown',
      deviceScaleFactor,
      sha256,
      manifestSha256: manifestEntry?.sha256 || null,
      shaMatches,
      sizeMatches,
      pixelDimensionsValid,
      sourceCommit: SOURCE_COMMIT,
    });
  }

  const allShaMatch = results.every((r) => r.shaMatches);
  const allPixelsValid = results.every((r) => r.pixelDimensionsValid);
  const allSizesMatch = results.every((r) => r.sizeMatches);

  const report = {
    verifiedAt: new Date().toISOString(),
    sourceCommit: SOURCE_COMMIT,
    targetDirectory: 'docs/evidence/console-v2/BASE-01/e3d4fb7/screenshots',
    totalScreenshots: results.length,
    allShaMatch,
    allSizesMatch,
    allPixelsValid,
    integrityStatus: allShaMatch && allSizesMatch && allPixelsValid ? 'PASS' : 'FAIL',
    explanation: 'Đối chiếu trực tiếp byte gốc của 5 file PNG trong Git repository với manifest.json. Không sử dụng tệp ảnh đã qua xử lý nén/downscale từ giao diện chat bên ngoài.',
    details: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('--- KẾT QUẢ ĐỐI CHIẾU BYTE GỐC TRONG REPO ---');
  results.forEach((r) => {
    console.log(`File: ${r.filename}`);
    console.log(`  Bytes: ${r.byteSize} (Manifest: ${r.sizeMatches ? 'MATCH' : 'MISMATCH'})`);
    console.log(`  Viewport CSS: ${r.cssViewport} | DPR: ${r.deviceScaleFactor} | Pixels PNG: ${r.screenshotPixels} (${r.pixelDimensionsValid ? 'VALID' : 'INVALID'})`);
    console.log(`  SHA-256: ${r.sha256}`);
    console.log(`  SHA Match: ${r.shaMatches ? 'MATCH (100% Khớp)' : 'MISMATCH'}\n`);
  });

  console.log(`>>> TRẠNG THÁI KIỂM TOÁN TÍNH NGUYÊN BẢN: ${report.integrityStatus} <<<`);

  if (!allShaMatch || !allPixelsValid) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Lỗi kiểm toán tính nguyên bản:', err);
  process.exit(1);
});

