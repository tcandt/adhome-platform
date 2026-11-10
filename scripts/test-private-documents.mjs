import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/rental-tests/privateDocuments.cjs');
await build({ entryPoints: ['apps/landing/server/rentalDocuments.ts'], outfile: out, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const rental = require(out);
const handlerOut = resolve('apps/landing/node_modules/.cache/rental-tests/privateDocumentApi.cjs');
await build({ entryPoints: ['apps/landing/server/privateDocuments.ts'], outfile: handlerOut, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handlePrivateDocuments, listPrivateDocuments } = require(handlerOut);
const { PDFDocument, PDFName, rgb } = require('pdf-lib');
const sharp = require(resolve('node_modules/.pnpm/sharp@0.34.4/node_modules/sharp'));
const directory = await mkdtemp(join(tmpdir(), 'adhome-doc-test-')); process.env.ADH_PRIVATE_DOCUMENT_DIR = directory;
const building = { id: 'b1', code: 'QA', orgId: 'o1' };
const contract = { id: 'c1', orgId: 'o1', room: { building } };
const admin = { orgId: 'o1', id: 'qa', email: 'qa@example.test', role: 'ADMIN', permissions: [], buildingScopes: ['*'] };
const events = [];
const db = {
  building: { findFirst: async ({ where }) => where.id === building.id && where.orgId === building.orgId ? building : null },
  contract: { findFirst: async ({ where }) => where.id === contract.id && where.orgId === contract.orgId ? contract : null },
  consoleAuditLog: {
    findMany: async ({ where }) => events.filter(e => e.orgId === where.orgId && e.entityId === where.entityId && where.action.in.includes(e.action)),
    create: async ({ data }) => { events.push(structuredClone(data)); return data; },
  },
  $executeRaw: async () => 1,
  $transaction: async callback => callback(db),
};
const sendJson = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  const actor = req.headers['x-test-org'] ? { ...admin, orgId: req.headers['x-test-org'] } : req.headers['x-test-role'] ? { ...admin, role: 'MANAGER', permissions: ['contracts.manage'], buildingScopes: ['other'] } : admin;
  const handled = await handlePrivateDocuments(req, res, new URL(req.url, 'http://localhost').pathname, db, actor, { sendJson });
  if (!handled) sendJson(res, 404, { ok: false });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const buildingUrl = '/api/v1/console/v2/buildings/b1/documents';
const contractUrl = '/api/v1/console/v2/contracts/c1/identity-documents';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function call(url, method = 'GET', body, headers = {}) {
  const response = await fetch(origin + url, { method, headers: { ...(body && !(body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? Buffer.isBuffer(body) ? body : JSON.stringify(body) : undefined });
  return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()), headers: response.headers };
}
async function pdf(widths) { const p = await PDFDocument.create(); for (const width of widths) { const page = p.addPage([width, 400]); page.drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: rgb(.1, .4, .8) }); } return Buffer.from(await p.save()); }
async function upload(base, kind, bytes, mimeType = 'application/pdf', testIncomplete = false) {
  const session = await call(base, 'POST', { kind, size: bytes.length, name: `${kind}.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`, mimeType });
  assert.equal(session.status, 201, JSON.stringify(session.data));
  const { uploadId, chunkBytes } = session.data;
  if (testIncomplete) { const incomplete = await call(`${base}/${uploadId}/complete`, 'POST'); assert.equal(incomplete.status, 409); assert.equal((await call(base)).data.documents.some(d => d.id === uploadId), false); }
  for (let part = 0; part < Math.ceil(bytes.length / chunkBytes); part++) {
    const result = await call(`${base}/${uploadId}/chunks?part=${part}`, 'PUT', bytes.subarray(part * chunkBytes, (part + 1) * chunkBytes)); assert.equal(result.status, 200, JSON.stringify(result.data));
  }
  const complete = await call(`${base}/${uploadId}/complete`, 'POST'); assert.equal(complete.status, 201, JSON.stringify(complete.data));
  const retry = await call(`${base}/${uploadId}/complete`, 'POST'); assert.equal(retry.status, 200);
  assert.equal((await call(base)).data.documents.filter(d => d.id === uploadId).length, 1);
  return complete.data.document;
}
try {
  assert.equal((await call(buildingUrl, 'GET', undefined, { 'x-test-org': 'other' })).status, 404);
  assert.equal((await call(contractUrl, 'GET', undefined, { 'x-test-role': 'MANAGER' })).status, 404);
  assert.equal((await call(buildingUrl, 'POST', { kind: 'OTHER', name: 'bad', mimeType: 'text/html', size: 8 })).status, 422);
  const identityImage = async (side, color) => sharp(Buffer.from(`<svg width="600" height="378" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="12" y="12" width="576" height="354" rx="14" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="40">${side}</text></svg>`)).png().toBuffer();
  await upload(contractUrl, 'ID_FRONT', await identityImage('FRONT', '#b4dccb'), 'image/png');
  await upload(contractUrl, 'ID_BACK', await identityImage('BACK', '#b6d2ed'), 'image/png');
  const frontPdf = await pdf([311, 312]);
  const padded = Buffer.concat([frontPdf, Buffer.alloc(25 * 1024 * 1024 - frontPdf.length, 32)]);
  await upload(buildingUrl, 'TITLE_FRONT', padded, 'application/pdf', true);
  await upload(buildingUrl, 'TITLE_BACK', await pdf([321, 322]));
  await upload(buildingUrl, 'BUSINESS_REGISTRATION', await pdf([331, 332, 333]));
  let attachments = await rental.residenceAttachments(db, 'o1', 'b1', 'c1'); assert.deepEqual(attachments.missing, []);
  const sale = await upload(buildingUrl, 'SALE_CERTIFICATE', await pdf([341, 342]));
  attachments = await rental.residenceAttachments(db, 'o1', 'b1', 'c1');
  const result = await rental.compileResidencePages({ orgId: 'o1', buildingId: 'b1', contractId: 'c1', ...attachments, declarations: [await pdf([211, 212])], lease: await pdf([221, 222]) });
  const combined = await PDFDocument.load(result);
  assert.deepEqual(combined.getPages().map(p => Math.round(p.getWidth() * 100) / 100), [595.28, 211, 212, 221, 222, 311, 312, 321, 322, 331, 332, 333, 341, 342]);
  const firstImages = combined.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
  assert.equal(firstImages.keys().length, 2, 'both identity images are embedded on the first page');
  await mkdir('.artifacts/private-documents', { recursive: true }); await writeFile('.artifacts/private-documents/ordered-fixture.pdf', result);
  const reversed = await rental.compileResidencePages({ orgId: 'o1', buildingId: 'b1', contractId: 'c1', ...attachments, identity: [...attachments.identity].reverse(), declarations: [], lease: await pdf([221]), building: [] });
  assert.equal((await PDFDocument.load(reversed)).getPageCount(), 2, 'input order cannot split the two CCCD images across pages');
  await writeFile('.artifacts/private-documents/identity-reversed-fixture.pdf', reversed);
  await upload(contractUrl, 'ID_BACK', await sharp(await identityImage('BACK', '#b6d2ed')).rotate(90).png().toBuffer(), 'image/png');
  attachments = await rental.residenceAttachments(db, 'o1', 'b1', 'c1');
  const portraitParts = { orgId: 'o1', buildingId: 'b1', contractId: 'c1', ...attachments, declarations: [], lease: await pdf([221]), building: [] };
  const portrait = await rental.compileResidencePages(portraitParts);
  assert.equal((await PDFDocument.load(portrait)).getPageCount(), 2);
  await writeFile('.artifacts/private-documents/identity-portrait-fixture.pdf', portrait);
  const identityPath = join(directory, createHash('sha256').update('o1\0c1').digest('hex'), `${attachments.identity.find(d => d.kind === 'ID_FRONT').id}.bin`);
  const intact = await readFile(identityPath);
  await writeFile(identityPath, Buffer.from('corrupted-private-document'));
  try { await assert.rejects(rental.compileResidencePages(portraitParts), error => error.statusCode === 409, 'paired identity page retains file integrity checks'); }
  finally { await writeFile(identityPath, intact); }
  await call(`${buildingUrl}/${sale.id}`, 'DELETE');
  assert.equal((await listPrivateDocuments(db, 'o1', 'b1')).some(d => d.id === sale.id), false);
  const firstIdentity = attachments.identity.find(d => d.kind === 'ID_FRONT');
  const replacement = await upload(contractUrl, 'ID_FRONT', png, 'image/png');
  assert.equal((await listPrivateDocuments(db, 'o1', 'c1')).filter(d => d.kind === 'ID_FRONT').length, 1);
  assert.equal((await call(`${contractUrl}/${firstIdentity.id}`)).status, 404);
  const file = await call(`${contractUrl}/${replacement.id}`); assert.equal(file.status, 200); assert.deepEqual(file.data, png); assert.equal(file.headers.get('cache-control'), 'private, no-store');
  const invalid = await call(buildingUrl, 'POST', { kind: 'TITLE_FRONT', name: 'bad.pdf', mimeType: 'application/pdf', size: 8 });
  await call(`${buildingUrl}/${invalid.data.uploadId}/chunks?part=0`, 'PUT', Buffer.from('notapdf!'));
  assert.equal((await call(`${buildingUrl}/${invalid.data.uploadId}/complete`, 'POST')).status, 422);
  const removed = await call(`${contractUrl}/${replacement.id}`, 'DELETE'); assert.equal(removed.status, 200);
  assert.ok((await rental.residenceAttachments(db, 'o1', 'b1', 'c1')).missing.includes('CCCD mặt trước'));
  const oversized = await call(buildingUrl, 'POST', { kind: 'TITLE_FRONT', name: 'too-large.pdf', mimeType: 'application/pdf', size: 25 * 1024 * 1024 + 1 });
  assert.equal(oversized.status, 422); assert.match(oversized.data.message, /25 MB/);
  console.log('PASS exact 25MB upload, retry/readback, access scopes, replacement/removal, both CCCD images on one A4 page and exact 14-page dossier order');
} finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
