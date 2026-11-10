import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/landlord-tests');
await build({ entryPoints: ['apps/landing/server/buildingLandlord.ts', 'apps/landing/server/consoleBusinessApi.ts'], outdir: out, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { normalizeBuildingLandlord, resolveBuildingLandlord, readBuildingLandlords, writeBuildingLandlord } = require(resolve(out, 'buildingLandlord.js'));
const { handleConsoleV2Api } = require(resolve(out, 'consoleBusinessApi.js'));
const owner = { fullName: 'CHU NHA KIEM THU', birthDate: '1985-07-21', address: 'DIA CHI KIEM THU', idNumber: '000000000001', phone: '0900000001', accountNumber: '00123456789', bank: 'BANK QA', accountName: 'CHU TAI KHOAN' };
assert.equal(normalizeBuildingLandlord({ fullName: '  QA  ' }).fullName, 'QA');
for (const bad of [null, [], { fullName: 123 }, { idNumber: '123' }, { birthDate: '1985-02-30' }, { address: 'a'.repeat(501) }]) assert.throws(() => normalizeBuildingLandlord(bad));
assert.equal(resolveBuildingLandlord({ landlord: owner }, { fullName: 'legacy' }).fullName, owner.fullName);
assert.equal(resolveBuildingLandlord({ landlord: owner }, {}, { fullName: 'SAVED', phone: '' }).fullName, 'SAVED');
assert.equal(resolveBuildingLandlord({ landlord: owner }, {}, { phone: '' }).phone, owner.phone);
assert.equal(resolveBuildingLandlord({ landlord: owner }, {}, { birthDate: '' }).birthDate, owner.birthDate);
assert.equal(resolveBuildingLandlord({ landlord: {} }, { fullName: 'legacy' }).fullName, 'legacy');
let stored = null, logs = [];
const prisma = {
  publicRoomListing: { updateMany: async () => ({}), findMany: async () => [] },
  organization: { findMany: async () => [] },
  building: {
    findUnique: async ({ where }) => where.id === stored?.id ? stored : null,
    count: async () => 0,
    create: async ({ data }) => (stored = { ...data, electricRateVnd: null, waterRateVnd: null, waterBillingMethod: null }),
    update: async ({ data }) => Object.assign(stored, data),
  },
  consoleAuditLog: { create: async ({ data }) => { logs.push(data); return data; } },
  $queryRaw: async (_, orgId, ids) => stored?.orgId === orgId && ids.includes(stored.id) ? [{ id: stored.id, landlord_profile: stored.landlord || {} }] : [],
  $executeRaw: async (_, json, orgId, id) => { assert.equal(stored.orgId, orgId); assert.equal(stored.id, id); stored.landlord = JSON.parse(json); return 1; },
  $transaction: async fn => { const backup = structuredClone(stored); try { return await fn(prisma); } catch (error) { stored = backup; throw error; } },
};
const admin = { id: 'qa', orgId: 'org-qa', email: 'qa@example.test', role: 'ADMIN', permissions: [], buildingScopes: ['*'] };
async function call(method, body, actor = admin, id = '') {
  let data;
  const res = { statusCode: 200, setHeader() {}, end(value) { data = JSON.parse(value); } };
  const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method;
  const url = new URL(`http://localhost/api/v1/console/v2/buildings${id ? `/${id}` : ''}`);
  await handleConsoleV2Api(req, res, url.pathname, url, prisma, actor, '127.0.0.1', {});
  return { status: res.statusCode, data };
}
let result = await call('POST', { code: 'QA', initialFloorsCount: 0, landlord: owner });
assert.equal(result.status, 201, JSON.stringify(result.data)); assert.deepEqual(stored.landlord, owner);
const id = stored.id;
result = await call('PATCH', { landlord: { phone: '0900000002', bank: '' } }, admin, id);
assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(stored.landlord.phone, '0900000002'); assert.equal(stored.landlord.bank, ''); assert.equal(stored.landlord.fullName, owner.fullName);
const expected = structuredClone(stored.landlord);
assert.equal((await call('PATCH', { name: 'QA UPDATED' }, admin, id)).status, 200); assert.deepEqual(stored.landlord, expected);
assert.deepEqual((await readBuildingLandlords(prisma, admin.orgId, [id])).get(id), expected);
assert.equal((await readBuildingLandlords(prisma, 'other-org', [id])).size, 0);
assert.equal((await call('PATCH', { landlord: { idNumber: 'bad' } }, admin, id)).status, 422); assert.deepEqual(stored.landlord, expected);
assert.equal((await call('PATCH', { landlord: owner }, { ...admin, orgId: 'other-org' }, id)).status, 404);
assert.equal((await call('PATCH', { landlord: owner }, { ...admin, role: 'STAFF' }, id)).status, 403);
assert.equal((await call('POST', { code: 'BAD', landlord: { idNumber: 'bad' } })).status, 422);
assert.ok(logs.some(log => log.action === 'CREATE_BUILDING') && logs.some(log => log.action === 'UPDATE_BUILDING'));
console.log('PASS actual create/update handlers: persistence, partial update, explicit clear, omitted fields, validation, organization isolation and permissions');

if (process.argv.includes('--database')) {
  const { PrismaClient } = require('@prisma/client');
  const { loadEnv } = await import(pathToFileURL(require.resolve('vite')).href);
  const env = loadEnv('development', resolve('apps/landing'), '');
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public' } } });
  const rollback = new Error('QA_ROLLBACK');
  try {
    const org = await db.organization.findFirst({ select: { id: true } }); assert.ok(org);
    await assert.rejects(db.$transaction(async tx => {
      const fixtureId = `qa-landlord-${Date.now()}`;
      await tx.building.create({ data: { id: fixtureId, orgId: org.id, code: fixtureId, name: 'QA TEMPORARY', streetAddress: '', ward: '', province: '' } });
      await writeBuildingLandlord(tx, org.id, fixtureId, owner);
      assert.deepEqual((await readBuildingLandlords(tx, org.id, [fixtureId])).get(fixtureId), owner);
      assert.equal((await readBuildingLandlords(tx, `${org.id}-other`, [fixtureId])).size, 0);
      throw rollback;
    }), error => error === rollback);
    console.log('PASS PostgreSQL: new column, parameterized write/read and organization filtering; temporary fixture rolled back');
  } finally { await db.$disconnect(); }
}
