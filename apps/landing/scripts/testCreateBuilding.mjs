import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../server/consoleBusinessApi.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
).outputText;

async function createBuilding(body, { role = 'ADMIN', duplicate = false } = {}) {
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: name => {
      if (name === 'node:crypto') return require(name);
      if (name === './authRbac') return { actorHasPermission: actor => actor.role === 'ADMIN' };
      if (['@prisma/client', './cryptoVault', './hunonicAdapter', './hunonicSyncWorker'].includes(name)) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const writes = [];
  const floors = [];
  const prisma = {
    publicRoomListing: { updateMany: async () => ({}), findMany: async () => [] },
    organization: { findMany: async () => [] },
    building: {
      findUnique: async () => duplicate ? { id: 'existing' } : null,
      count: async () => 0,
      create: async ({ data }) => { writes.push(data); return data; },
    },
    floor: { create: async ({ data }) => { floors.push(data); return data; } },
    consoleAuditLog: { create: async () => ({}) },
    $transaction: async action => action(prisma),
  };
  let payload;
  const response = { statusCode: 0, setHeader() {}, end(json) { payload = JSON.parse(json); } };
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = 'POST';
  const url = new URL('http://localhost/api/v1/console/v2/buildings');
  await exports.handleConsoleV2Api(request, response, url.pathname, url, prisma,
    { id: 'test-admin', email: 'admin@example.test', orgId: 'org-test', role }, '127.0.0.1', {});
  return { status: response.statusCode, payload, writes, floors };
}

test('code alone creates a building with the same display name and empty address', async () => {
  const result = await createBuilding({ code: '  lk-24  ', initialFloorsCount: 4 });
  assert.equal(result.status, 201);
  assert.equal(result.payload.building.code, 'LK-24');
  assert.equal(result.payload.building.name, 'LK-24');
  for (const field of ['streetAddress', 'ward', 'province']) assert.equal(result.payload.building[field], '');
  assert.equal(result.payload.building.managerName, null);
  assert.equal(result.payload.building.managerPhone, null);
  assert.deepEqual(result.floors.map(floor => floor.floorNumber), [1, 2, 3, 4]);
});

test('blank display name falls back to normalized code; supplied name and address are preserved', async () => {
  const fallback = await createBuilding({ code: 'LK.24', name: '   ', streetAddress: '' });
  assert.equal(fallback.status, 201);
  assert.equal(fallback.payload.building.name, 'LK24');
  const named = await createBuilding({ code: 'LK-24', name: '  AdHome Sapphire  ', streetAddress: '  24 Ân Phú  ' });
  assert.equal(named.status, 201);
  assert.equal(named.payload.building.name, 'AdHome Sapphire');
  assert.equal(named.payload.building.streetAddress, '24 Ân Phú');
});

test('invalid and duplicate codes remain rejected', async () => {
  for (const code of ['', '   ', '...']) {
    const result = await createBuilding({ code });
    assert.equal(result.status, 422);
    assert.equal(result.writes.length, 0);
  }
  const duplicate = await createBuilding({ code: 'LK-24' }, { duplicate: true });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.writes.length, 0);
});

test('creation still requires building management permission', async () => {
  const result = await createBuilding({ code: 'LK-24' }, { role: 'MANAGER' });
  assert.equal(result.status, 403);
  assert.equal(result.writes.length, 0);
});
