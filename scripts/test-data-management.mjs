import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';

const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const directory = await mkdtemp(resolve(tmpdir(), 'adhome-data-test-'));
process.env.ADHOME_DATA_BACKUP_DIR = directory;
process.env.ADHOME_CREDENTIALS_ENCRYPTION_KEY = 'test-only-data-management-key-longer-than-32-chars';
await build({ entryPoints: ['apps/landing/server/dataManagementApi.ts'], outdir: directory, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handleDataManagement } = require(resolve(directory, 'dataManagementApi.js'));
const models = ['building','floor','publicRoomListing','tenant','consoleRoom','roomReservation','contract','roomOccupant','deposit','electricMeter','meterReading','billingPeriod','invoice','paymentTransaction','ledgerEntry','leadInquiry','roomAuditLog','seoSyncJob','idempotencyRecord'];
let data = Object.fromEntries(models.map(model => [model, []]));
data.building.push({ id: 'b1', orgId: 'org-1', code: 'B1', name: 'Tòa thử' });
data.tenant.push({ id: 't1', orgId: 'org-1', fullName: 'Khách thử' });
data.consoleRoom.push({ id: 'r1', orgId: 'org-1', buildingId: 'b1', occupancyStatus: 'OCCUPIED' });
data.contract.push({ id: 'c1', orgId: 'org-1', buildingId: 'b1', roomId: 'r1', tenantId: 't1' });
data.invoice.push({ id: 'i1', orgId: 'org-1', contractId: 'c1', totalAmountVnd: 1234567n });
const settings = [{ id: 's1', orgId: 'org-1', providerId: 'HUNONIC' }];
const logs = [];
let rentalDocuments = [{ id: 'doc1', orgId: 'org-1', entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE', metadata: { tenant: { fullName: 'Khách thử' } } }];
const match = (row, where) => Object.entries(where || {}).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
const delegate = model => ({
  findMany: async ({ where } = {}) => data[model].filter(row => match(row, where)),
  createMany: async ({ data: rows }) => { data[model].push(...rows); return { count: rows.length }; },
  deleteMany: async ({ where }) => { const before = data[model].length; data[model] = data[model].filter(row => !match(row, where)); return { count: before - data[model].length }; },
  updateMany: async ({ where, data: values }) => { const rows = data[model].filter(row => match(row, where)); rows.forEach(row => Object.assign(row, values)); return { count: rows.length }; },
});
const prisma = Object.fromEntries(models.map(model => [model, delegate(model)]));
let boundConnectionCount = 0;
prisma.paymentProviderConnection = { count: async () => boundConnectionCount, findMany: async () => [], updateMany: async () => ({ count: 0 }), update: async () => ({}) };
prisma.consoleAuditLog = { create: async ({ data: row }) => { logs.push(row); return row; },
  findMany: async ({ where }) => rentalDocuments.filter(row => match(row, where)),
  deleteMany: async ({ where }) => { const before = rentalDocuments.length; rentalDocuments = rentalDocuments.filter(row => !match(row, where)); return { count: before - rentalDocuments.length }; },
  createMany: async ({ data: rows }) => { rentalDocuments.push(...rows); return { count: rows.length }; } };
prisma.$queryRaw = async () => [{ pg_advisory_xact_lock: null }];
prisma.$transaction = async (run) => { const before = structuredClone(data); const priorDocuments = structuredClone(rentalDocuments); try { return await run(prisma); } catch (error) { data = before; rentalDocuments = priorDocuments; throw error; } };
const actor = { id: 'admin', orgId: 'org-1', email: 'admin@example.test', role: 'ADMIN', permissions: [] };
async function call(path, body, who = actor) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = body === undefined ? 'GET' : 'POST';
  let result;
  const res = { statusCode: 200, setHeader() {}, end(text) { result = JSON.parse(text); } };
  await handleDataManagement(req, res, `/api/v1/console/v2/settings/data${path}`, prisma, who);
  return { status: res.statusCode, data: result };
}
try {
  assert.equal((await call('/summary', undefined, { ...actor, role: 'MANAGER', permissions: ['settings.manage'] })).status, 403);
  assert.equal((await call('/summary')).data.counts.tenant, 1);
  assert.equal((await call('/backup', {})).status, 201);
  const saved = (await call('/backups')).data.backups[0];
  assert.ok(saved.name.startsWith('Sao lưu '));
  assert.ok(saved.sizeBytes > 0);
  const encrypted = JSON.parse(await readFile(resolve(directory, `${saved.id}.json`), 'utf8'));
  assert.ok(encrypted.encrypted.ciphertext);
  assert.ok(!JSON.stringify(encrypted).includes('Khách thử'));
  assert.equal((await call('/backups/import', encrypted)).status, 201);
  assert.equal((await call('/backups/import', { ...encrypted, orgId: 'foreign-org' })).status, 422);
  assert.equal((await call('/delete', { scope: 'CUSTOMERS', confirmation: 'wrong' })).status, 422);
  assert.equal((await call('/delete', { scope: 'CUSTOMERS', confirmation: 'XOA KHACH HANG' })).status, 200);
  assert.equal(data.tenant.length, 0); assert.equal(data.building.length, 1); assert.equal(data.consoleRoom[0].occupancyStatus, 'AVAILABLE');
  assert.equal(rentalDocuments.length, 0);
  assert.equal(settings.length, 1);
  assert.equal((await call('/restore', { backupId: saved.id, digest: saved.digest, confirmation: 'PHUC HOI DU LIEU' })).status, 200);
  assert.equal(data.tenant[0].fullName, 'Khách thử'); assert.equal(data.invoice[0].totalAmountVnd, 1234567n);
  assert.equal(rentalDocuments[0].metadata.tenant.fullName, 'Khách thử');
  assert.equal(settings.length, 1);
  boundConnectionCount = 1;
  assert.equal((await call('/delete', { scope: 'BUILDINGS', confirmation: 'XOA TOA NHA' })).status, 409);
  assert.equal(data.building.length, 1);
  boundConnectionCount = 0;
  assert.equal((await call('/delete', { scope: 'BUILDINGS', confirmation: 'XOA TOA NHA' })).status, 200);
  assert.equal(data.building.length, 0); assert.equal(settings.length, 1);
  assert.equal((await call('/restore', { backupId: saved.id, digest: saved.digest, confirmation: 'PHUC HOI DU LIEU' })).status, 200);
  assert.equal(data.building.length, 1);
  assert.ok(logs.some(log => log.action === 'RESTORE_BUSINESS_DATA'));
  assert.equal((await call('/backups', undefined, { ...actor, orgId: 'org-2' })).data.backups.length, 0);
  assert.equal((await call('/backups/delete', { ids: [saved.id], confirmation: 'wrong' })).status, 422);
  assert.equal((await call('/backups/delete', { ids: [saved.id], confirmation: 'XOA BAN SAO LUU' }, { ...actor, orgId: 'org-2' })).status, 404);
  const backupIds = (await call('/backups')).data.backups.map(row => row.id);
  const deleted = await call('/backups/delete', { ids: backupIds, confirmation: 'XOA BAN SAO LUU' });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data.failedIds, []);
  assert.equal(deleted.data.deletedIds.length, backupIds.length);
  assert.equal((await call('/backups')).data.backups.length, 0);
  assert.ok(logs.some(log => log.action === 'DELETE_DATA_BACKUP'));
  console.log('PASS data management: encrypted backup, confirmation, customer reset, restore, backup list/delete and settings isolation');
} finally { await rm(directory, { recursive: true, force: true }); }
