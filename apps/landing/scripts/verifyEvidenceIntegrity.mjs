import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const REL_EVIDENCE_DIR = path.join('docs', 'evidence', 'console-v2', 'BASE-01', 'e3d4fb7');
const EVIDENCE_DIR = path.join(REPO_ROOT, REL_EVIDENCE_DIR);
const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const MANIFEST_PATH = path.join(EVIDENCE_DIR, 'screenshots-manifest.json');
const OUTPUT_PATH = path.join(EVIDENCE_DIR, 'evidence-integrity-test.json');

const SOURCE_COMMIT = 'e3d4fb7';
const MIN_SCREENSHOT_BYTES = 25000;

function parsePngDimensions(buf) {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function checkGitTracking(relScreenshotsDir) {
  try {
    const gitDirPosix = relScreenshotsDir.replace(/\\/g, '/');
    const out = execSync(`git ls-tree -r HEAD ${gitDirPosix}`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    const trackedFiles = new Map();
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const blobHash = parts[2];
      const filePath = parts[3];
      if (filePath) {
        trackedFiles.set(path.basename(filePath), blobHash);
      }
    }
    return { ok: true, trackedFiles };
  } catch (err) {
    return { ok: false, error: err.message, trackedFiles: new Map() };
  }
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — BASE-01-FIX-10 Evidence Integrity Verifier');
  console.log(`Commit: ${SOURCE_COMMIT} | Target Dir: ${path.relative(REPO_ROOT, SCREENSHOTS_DIR)}`);
  console.log('=================================================================\n');

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found at: ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const manifestMap = new Map(manifest.map((item) => [item.filename, item]));

  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  const results = [];
  const shaSet = new Set();

  const relScreenshotsDir = path.relative(REPO_ROOT, SCREENSHOTS_DIR);
  const gitTracking = checkGitTracking(relScreenshotsDir);

  for (const filename of files) {
    const fullPath = path.join(SCREENSHOTS_DIR, filename);
    const buf = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    shaSet.add(sha256);
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
    const sizeAboveMin = byteSize >= MIN_SCREENSHOT_BYTES;
    const headGitBlobSha = gitTracking.trackedFiles.get(filename) || null;
    let localGitBlobSha = null;
    try {
      localGitBlobSha = execSync(`git hash-object "${fullPath}"`, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    } catch {}
    const blobShaMatches = localGitBlobSha !== null && localGitBlobSha === headGitBlobSha;
    const gitTracked = headGitBlobSha !== null && blobShaMatches;

    results.push({
      filename,
      byteSize,
      sizeAboveMin,
      cssViewport,
      screenshotPixels: dims ? `${dims.width}x${dims.height}` : 'unknown',
      expectedPixels: `${expectedWidth}x${expectedHeight}`,
      deviceScaleFactor,
      sha256,
      manifestSha256: manifestEntry?.sha256 || null,
      shaMatches,
      sizeMatches,
      pixelDimensionsValid,
      gitTracked,
      headGitBlobSha,
      localGitBlobSha,
      blobShaMatches,
      sourceCommit: SOURCE_COMMIT,
    });
  }

  const allShaMatch = results.length === 5 && results.every((r) => r.shaMatches);
  const allPixelsValid = results.length === 5 && results.every((r) => r.pixelDimensionsValid);
  const allSizesMatch = results.length === 5 && results.every((r) => r.sizeMatches);
  const allAboveMinSize = results.length === 5 && results.every((r) => r.sizeAboveMin);
  const allUnique = shaSet.size === results.length && results.length === 5;
  const allGitTracked = results.length === 5 && results.every((r) => r.gitTracked);
  const allBlobShaMatch = results.length === 5 && results.every((r) => r.blobShaMatches);

  const integrityPass =
    allShaMatch &&
    allSizesMatch &&
    allPixelsValid &&
    allAboveMinSize &&
    allUnique &&
    allGitTracked &&
    allBlobShaMatch;

  const report = {
    verifiedAt: new Date().toISOString(),
    sourceCommit: SOURCE_COMMIT,
    targetDirectory: relScreenshotsDir.replace(/\\/g, '/'),
    totalScreenshots: results.length,
    expectedScreenshots: 5,
    allShaMatch,
    allSizesMatch,
    allPixelsValid,
    allAboveMinSize,
    allUnique,
    allGitTracked,
    allBlobShaMatch,
    integrityStatus: integrityPass ? 'PASS' : 'FAIL',
    explanation:
      'Direct byte-level verification of raw PNG screenshot files in Git repository against manifest.json, pixel DPR=2 dimensions, zero SHA collisions, minimum size (>= 25KB), and local git hash-object matching HEAD blob SHA.',
    details: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('--- REPOSITORY RAW EVIDENCE INTEGRITY REPORT ---');
  results.forEach((r) => {
    console.log(`File: ${r.filename}`);
    console.log(`  Bytes: ${r.byteSize} (Manifest: ${r.sizeMatches ? 'MATCH' : 'MISMATCH'} | Min >=25KB: ${r.sizeAboveMin ? 'YES' : 'NO'})`);
    console.log(`  Viewport CSS: ${r.cssViewport} | DPR: ${r.deviceScaleFactor} | Pixels: ${r.screenshotPixels} (${r.pixelDimensionsValid ? 'VALID' : 'INVALID'})`);
    console.log(`  SHA-256: ${r.sha256}`);
    console.log(`  SHA Match: ${r.shaMatches ? 'MATCH (100% Khớp)' : 'MISMATCH'}`);
    console.log(`  Git Blob: HEAD=${r.headGitBlobSha} | Local=${r.localGitBlobSha} (${r.blobShaMatches ? 'MATCH' : 'TAMPERED'})\n`);
  });

  console.log('Summary Gates:');
  console.log(`  5/5 Files Present & Checked: ${results.length === 5 ? 'PASS' : 'FAIL'}`);
  console.log(`  All SHA-256 Match: ${allShaMatch ? 'PASS' : 'FAIL'}`);
  console.log(`  All Byte Sizes Match: ${allSizesMatch ? 'PASS' : 'FAIL'}`);
  console.log(`  All Pixel Dimensions Valid (DPR=2): ${allPixelsValid ? 'PASS' : 'FAIL'}`);
  console.log(`  All Sizes >= 25,000 Bytes: ${allAboveMinSize ? 'PASS' : 'FAIL'}`);
  console.log(`  Zero Hash Collisions (All 5 Unique): ${allUnique ? 'PASS' : 'FAIL'}`);
  console.log(`  Git Blob Content Verified (Local vs HEAD): ${allBlobShaMatch ? 'PASS' : 'FAIL'}`);
  console.log(`\n>>> GATE_EVIDENCE_INTEGRITY: ${report.integrityStatus} <<<\n`);

  if (!integrityPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in evidence integrity verification:', err);
  process.exit(1);
});
