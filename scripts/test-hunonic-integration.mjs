import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, readdir, unlink } from 'node:fs/promises';

const requireLanding = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(requireLanding.resolve('vite'))('esbuild');
const directory = resolve('apps/landing/node_modules/.cache/adhome-tests');
await mkdir(directory, { recursive: true });
await build({ entryPoints: ['apps/landing/server/consoleBusinessApi.ts', 'apps/landing/server/hunonicAdapter.ts', 'apps/landing/server/hunonicCredentials.ts', 'apps/landing/server/hunonicSyncWorker.ts', 'apps/landing/server/hunonicHistory.ts', 'apps/landing/server/hunonicInventory.ts'], outdir: directory, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
process.env.ADHOME_CREDENTIALS_ENCRYPTION_KEY = 'test-vault-key-for-isolated-unit-tests-only';
process.env.HUNONIC_ALLOW_MOCK = 'false';
process.env.HUNONIC_MOCK_MODE = 'false';
process.env.NODE_ENV = 'development';
process.env.SNAPSHOT_DIRECTORY = resolve(directory, 'snapshots');
const require = createRequire(import.meta.url);
const { handleConsoleV2Api } = require(resolve(directory, 'consoleBusinessApi.js'));
const { HunonicCloudClient } = require(resolve(directory, 'hunonicAdapter.js'));
const { readHunonicHistory, syncHunonicHistory } = require(resolve(directory, 'hunonicHistory.js'));
const { executeHunonicBackgroundSync } = require(resolve(directory, 'hunonicSyncWorker.js'));
const { readHunonicCredentials } = require(resolve(directory, 'hunonicCredentials.js'));
const { normalizeHunonicInventory } = require(resolve(directory, 'hunonicInventory.js'));
function connectivity(state, turn, extra = {}) {
 return normalizeHunonicInventory([{rooms:[{devices:[{root_type:'elmeter',root_id:'CONNECTIVITY-TEST',state,value:JSON.stringify({turn}),...extra}]}]}])[0];
}
assert.equal(connectivity('1', 0, {status:0,timeupdate:'2025-01-01T00:00:00Z'}).connectionStatus, 'ONLINE', 'Cloud online is independent of relay off or old measurement timestamp');
assert.equal(connectivity(2, 1, {status:0}).connectionStatus, 'OFFLINE', 'Cloud offline is independent of relay on');
assert.equal(connectivity(undefined, 1, {status:0}).connectionStatus, 'UNCONFIGURED', 'Missing connectivity cannot be inferred from relay or status');
assert.equal(connectivity(0, 1).online, null, 'Unknown state must not become a fabricated offline flag');
console.log('PASS: Hunonic state 1/2 connectivity, relay independence, unknown state safety');
let failure = false;
let providerRate = 3800;
let emptyCustomRate = false;
let selectedGroupId = "1";
let tariffAcknowledged = true;
let webAvailable = false;
let webPersistsRate = true;
let webWrites = 0;
let calls = 0;
let listFailure = false;
let historyFailure = false;
const historyRequests = [];
const historyWindows = [];
await mkdir(process.env.SNAPSHOT_DIRECTORY, { recursive: true });
for (const name of await readdir(process.env.SNAPSHOT_DIRECTORY)) if (name.startsWith("hunonic_history_")) await unlink(resolve(process.env.SNAPSHOT_DIRECTORY, name));
let name = 'Điện phòng P24.01';
let monthly = 145.29;
let cumulative;
let providerOnline = true;
let reportedAt = new Date().toISOString();
globalThis.fetch = async (url, options) => {
  calls++;
  assert.ok(options.signal instanceof AbortSignal);
  if (String(url).startsWith('https://web.hunonic.com/')) {
    assert.ok(!String(url).includes('unit-web-token'), 'Web bearer must never appear in URLs');
    if (String(url).endsWith('/auth/login')) {
      const body = JSON.parse(options.body);
      assert.equal(body.password, crypto.createHash('md5').update('test:password').digest('hex'));
      return Response.json({status:webAvailable, data:{token:'unit-web-token'}});
    }
    assert.equal(options.headers.Authorization, 'Bearer unit-web-token');
    if (String(url).endsWith('/list-home')) return Response.json({status:true,data:[{id:12}]});
    if (String(url).includes('/listDeviceOfHomeSelect?')) return Response.json({status:true,data:[{rooms:[{devices:[
      {id:'wrong-meter',name,root_type:'elmeter',root_id:'wrong-encrypted-root'},
      {id:'3077229',name:'Different display name',root_type:'elmeter',root_id:'correct-encrypted-root'},
    ]}]}]});
    assert.ok(String(url).endsWith('/add-electricity-rate'));
    const body = JSON.parse(options.body);
    assert.deepEqual(body,{root_id:'correct-encrypted-root',electricity_group_id:'1',price:'3800'});
    webWrites++;
    if(webPersistsRate){emptyCustomRate=false;providerRate=3800;selectedGroupId='1';}
    return Response.json({status:true});
  }
  if (String(url).includes('/user/login')) {
    assert.ok(String(url).includes('/v2/user/login'));
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('password'), crypto.createHash('md5').update('test:password').digest('hex'));
    assert.equal(options.body.get('app_name'), 'hunonic');
    assert.equal(options.body.get('app_role'), '1');
    assert.match(options.body.get('signature'), /^[a-f0-9]{32}$/);
    return new Response(JSON.stringify(failure ? { status: false, data: { token_id: 'old-token' } } : { status: true, data: { token_id: 'unit-test-token' } }), { status: 200 });
  }
  if (String(url).includes('/atmwifi/addElectricityRate')) { assert.ok(options.body instanceof URLSearchParams); return new Response(JSON.stringify({ status: tariffAcknowledged })); }
  if (String(url).includes('/atmwifi/electricityRate')) return new Response(JSON.stringify({ status:true, data: [{ id: '1', electricity_rate: emptyCustomRate ? {} : { price: providerRate } }, {id:'2',electricity_rate:[{price:1901}]}] }));
  if (listFailure) throw new Error('Upstream unavailable');
  if (String(url).includes('/atmwifi/getDataGraph')) { historyRequests.push(options.body.get('time_start')); historyWindows.push([options.body.get('time_start'),options.body.get('time_end')]); if(historyFailure) return new Response(JSON.stringify({status:false})); return new Response(JSON.stringify({status:true,data:{graph_data:[{label:options.body.get('time_end'),value:12.5,value_2:0,solar:0}]}})); }
  return new Response(JSON.stringify({ status: true, data: [{ name: 'Nhà A', rooms: [{ name: 'Phòng Hunonic', devices: [
    { id: '3077229', root_type: 'elmeter', root_id: 'METER-1', name, timecreate: new Date().toISOString().slice(0,10), online: providerOnline, timeupdate: reportedAt,
      root_extra: JSON.stringify({ power_of_month: monthly, current_month: '11', cumulative_kwh: cumulative }), data_extra: { power_current: 0, electricity_group_id: selectedGroupId } },
    { root_type: 'switch', root_id: 'SWITCH-1' }
  ] }] }] }));
};
const client = new HunonicCloudClient();
assert.equal((await client.login('0123456789', 'test:password')).token, 'unit-test-token');
const inventory = await client.listElectricMeters('unit-test-token');
assert.equal(inventory[0].id, 'METER-1'); assert.equal(inventory[0].providerDeviceId, '3077229');
assert.equal(inventory[0].name, name); assert.equal(inventory[0].monthReportedKwh, monthly);
assert.equal(inventory[0].cumulativeKwh, null); assert.equal(inventory[0].instantPowerW, 0);
failure = true;
await assert.rejects(client.login('0123456789', 'test:password'));
failure = false;
assert.equal((await client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800)).verifiedRateVnd, 3800);
tariffAcknowledged = false;
await assert.rejects(client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800), 'Rejected upstream write cannot succeed even if prior rate matches');
tariffAcknowledged = true;
emptyCustomRate = true;
await assert.rejects(client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800), error => error.code === 'HUNONIC_CUSTOM_RATE_EMPTY', 'Positive acknowledgment with empty custom configuration must remain a specific failure');
emptyCustomRate = false;
webAvailable = true;
emptyCustomRate = true;
assert.equal((await client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800, {phone:'0123456789',password:'test:password'})).verifiedRateVnd, 3800, 'Official web fallback creates an absent rate and mobile read-back verifies it');
assert.equal(webWrites,1,'Create fallback writes once and selects the device by provider ID, never display name');
emptyCustomRate = true;
webPersistsRate = false;
await assert.rejects(client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800, {phone:'0123456789',password:'test:password'}), error => error.code === 'HUNONIC_CUSTOM_RATE_EMPTY', 'Even a positive web acknowledgment cannot bypass actual mobile read-back');
webAvailable = false;
webPersistsRate = true;
emptyCustomRate = false;
console.log('PASS: missing tariff creation through official web API; string price; exact device identity; positive web acknowledgment without persistence never succeeds');
selectedGroupId = '2';
await assert.rejects(client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800), 'Existing matching price alone cannot prove the device selected custom tariff');
assert.equal((await client.applyElectricityRate('unit-test-token', 'METER-1', 'residential')).verifiedRateVnd, 1901);
selectedGroupId = '1';
providerRate = 9999;
await assert.rejects(client.applyElectricityRate('unit-test-token', 'METER-1', 'custom', 3800));
const actor = { id: 'unit-admin', orgId: 'unit-org', role: 'ADMIN', email: 'unit@example.test', permissions: [], buildingScopes: ['*'] };
let connection = null;
const room = { id: 'r1', orgId: actor.orgId, buildingId: 'b1', code: 'P2401', listPriceVnd: 4500000n, area: 25, occupancyStatus: 'AVAILABLE', isPublishedToLanding: false, building: { id: 'b1', code: 'B1', orgId: actor.orgId }, amenities: [] };
const created = [];
let mapped = [];
let assignmentLookup = null;
const unassignUpdates = [];
const meterUpdates = [];
const readings = [];
const jobs = [];
const prisma = {
  publicRoomListing: { updateMany: async () => ({}), findMany: async () => [] },
  organization: { findMany: async () => [] },
  building: { findUnique: async () => ({ id: 'b1', orgId: actor.orgId, code: 'B1', name: 'Unit building', floors: [{ id: 'f1', name: 'Tầng 1', floorNumber: 1 }] }) },
  integrationConnection: {
    findUnique: async () => connection,
    upsert: async options => (connection = { id: 'conn', ...options.create, ...options.update }),
    update: async options => (connection = { ...connection, ...options.data }),
    updateMany: async options => { connection = { ...connection, ...options.data }; return { count: 1 }; },
  },
  consoleAuditLog: { create: async () => ({}) },
  consoleRoom: {
    findUnique: async options => options.where.id ? room : null,
    update: async options => ({ ...room, ...options.data }),
    findMany: async () => [], count: async () => 0,
    create: async options => { created.push(options.data.code); return { id: `new-${created.length}`, ...options.data }; },
  },
  electricMeter: { findMany: async () => mapped, upsert: async () => ({}), create: async () => ({}), findFirst: async () => assignmentLookup,
    updateMany: async options => { unassignUpdates.push(options); return { count: 1 }; },
    update: async options => { meterUpdates.push(options.data); return { ...mapped[0], ...options.data }; } },
  meterReading: { findFirst: async () => null, create: async options => { readings.push(options.data); return options.data; } },
  integrationSyncJob: { create: async options => { jobs.push(options.data); return options.data; }, update: async options => { const job = jobs.find(job => job.id === options.where.id); Object.assign(job, options.data); return job; } },
};
prisma.$transaction = async action => action(prisma);
async function call(path, method = 'GET', body, currentActor = actor) {
  let output;
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  request.method = method;
  const response = { statusCode: 0, setHeader() {}, end(text) { output = JSON.parse(text); } };
  const pathname = `/api/v1/console/${path}`;
  await handleConsoleV2Api(request, response, pathname, new URL(`http://unit.test${pathname}`), prisma, currentActor, '127.0.0.1', {});
  return { status: response.statusCode, data: output };
}
const saved = await call('integrations/hunonic/test', 'POST', { phone: '0123456789', password: 'test:password', isEnabled: true });
assert.equal(saved.status, 200); assert.equal(saved.data.verified, true);
assert.ok(!JSON.stringify(connection.credentialsJson).includes('test:password'));
assert.deepEqual(readHunonicCredentials(connection.credentialsJson), { phone: '0123456789', password: 'test:password' });
const config = await call('integrations/hunonic/config');
assert.equal(config.data.connection.hasPassword, true);
assert.equal(config.data.connection.status, 'VERIFIED');
assert.ok(!JSON.stringify(config.data).includes('password') && !JSON.stringify(saved.data).includes('token'));
assert.equal((await call('integrations/hunonic/test', 'POST', { phone: '0123456789', isEnabled: true })).data.verified, true);
assert.equal((await call('integrations/hunonic/test', 'POST', { phone: '0987654321', isEnabled: true })).status, 422);
assert.equal((await call('integrations/hunonic/test', 'POST', { phone: '0123456789', password: 'test:password' }, { ...actor, role: 'MANAGER' })).status, 403);
failure = true;
assert.equal((await call('integrations/hunonic/test', 'POST', { phone: '0123456789', password: 'test:password' })).status, 502);
failure = false;
assert.equal((await call('integrations/hunonic/test', 'POST', { phone: '0123456789', password: 'test:password' })).data.verified, true);
const beforeRead = calls;
let catalogResponse = await call('integrations/hunonic/meters');
assert.equal(calls, beforeRead, 'Opening saved inventory cannot trigger cloud calls');
assert.equal(catalogResponse.data.meters[0].deviceName, name);
assert.equal(catalogResponse.data.meters[0].providerDeviceId, '3077229');
assert.equal((await call('integrations/hunonic/assign', 'POST', { roomId: 'r1', hunonicDeviceId: 'NOT-IN-CATALOG' })).status, 422);
assignmentLookup = { id: 'assigned-1', orgId: actor.orgId, roomId: 'r1', hunonicDeviceId: 'METER-1', room: { buildingId: 'b1' } };
assert.equal((await call('integrations/hunonic/assign', 'POST', { roomId: 'r2', hunonicDeviceId: 'METER-1' })).status, 409, 'A device cannot be assigned twice');
assert.equal((await call('integrations/hunonic/assign', 'POST', { roomId: '', previousRoomId: 'stale-room', hunonicDeviceId: 'METER-1' })).status, 409, 'Stale selection cannot remove another mapping');
const cloudCallsBeforeUnassign = calls;
assert.equal((await call('integrations/hunonic/assign', 'POST', { roomId: '', previousRoomId: 'r1', hunonicDeviceId: 'METER-1' })).status, 200);
assert.equal(calls, cloudCallsBeforeUnassign, 'Unassign works without cloud connection');
assert.equal(unassignUpdates.length, 1);
assert.equal(unassignUpdates[0].data.hunonicDeviceId, null);
assert.equal(unassignUpdates[0].where.roomId, 'r1');
assignmentLookup = null;
mapped = [{ id: 'meter-1', roomId: 'r1', hunonicDeviceId: 'METER-1', room: { id: 'r1', code: 'P24.01', buildingId: 'b1' }, cumulativeKwh: 1000, tariffRateVnd: null, tariffVerifiedAt: null }];
name = 'Tên thiết bị mới sau đồng bộ'; monthly = 0;
let snapshot = await executeHunonicBackgroundSync({ prisma, orgId: actor.orgId });
assert.equal(historyRequests[0], new Date().toISOString().slice(0,10));
const persistedHistory = await readHunonicHistory(actor.orgId, '0123456789');
assert.equal(persistedHistory.devices['METER-1'].points[0].kwh, 12.5);
assert.equal(snapshot.devices[0].name, name); assert.equal(snapshot.devices[0].monthReportedKwh, 0);
assert.equal(snapshot.meters[0].reading.basis, 'MONTHLY_CONSUMPTION');
assert.equal(snapshot.meters[0].reading.quality, 'UNVERIFIED');
assert.equal(readings.length, 0, 'Monthly consumption cannot be recorded as cumulative billing');
assert.ok(!('cumulativeKwh' in meterUpdates.at(-1)), 'Unknown cumulative reading must not overwrite existing reading');
catalogResponse = await call('integrations/hunonic/meters');
assert.equal(catalogResponse.data.meters[0].deviceName, name); assert.equal(catalogResponse.data.meters[0].room.code, 'P24.01');
assert.equal(catalogResponse.data.meters[0].monthReportedKwh, 0);
cumulative = 1030;
snapshot = await executeHunonicBackgroundSync({ prisma, orgId: actor.orgId });
assert.equal(readings.length, 1); assert.equal(readings[0].readingKwh, 1030);
assert.equal(readings[0].recordedAt.toISOString(), reportedAt);
assert.equal(snapshot.meters[0].reading.quality, 'VALID');
providerOnline = undefined; reportedAt = null; cumulative = undefined;
snapshot = await executeHunonicBackgroundSync({ prisma, orgId: actor.orgId });
assert.equal(snapshot.devices[0].connectionStatus, 'UNCONFIGURED');
assert.equal(snapshot.devices[0].providerReportedAt, null);
assert.equal(snapshot.meters[0].reading.measuredAt, null); assert.equal(readings.length, 1);
listFailure = true;
await assert.rejects(executeHunonicBackgroundSync({ prisma, orgId: actor.orgId }));
assert.equal(jobs.at(-1).status, 'FAILED'); assert.equal(readings.length, 1);
listFailure = false;
// Changing accounts never reuses another account's device catalog.
const original = connection.credentialsJson;
connection.credentialsJson = { phone: 'different-account' };
assert.equal((await call('integrations/hunonic/meters')).data.meters[0].deviceName, null);
connection.credentialsJson = original;
for (const code of ['P.2401', 'P-2401', 'P.24-01']) assert.equal((await call('v2/rooms/r1', 'PATCH', { code })).data.room.code, code);
assert.equal((await call('v2/rooms', 'POST', { buildingId: 'b1', floorId: 'f1', code: 'P.24-02', area: 25, listPriceVnd: 4500000 })).status, 201);
assert.deepEqual(created, ['P.24-02']);
console.log('PASS: signed v2 FormData login and token_id parsing; rejected auth never succeeds; real meter discovery; vault persistence and password reuse; no secret/token response; permissions; room create/update preserve dot and hyphen; fresh names/IDs/catalog each sync; no fabricated timestamps/online/readings; monthly cannot enter cumulative billing; failed sync stays failed; account isolation; isolated DB/fetch only');

assert.ok(historyRequests.slice(1).every(start => start > '2000-01-01'), 'Subsequent sync uses 30-day reconciliation');
const storedHistory = await readHunonicHistory(actor.orgId, '0123456789');
assert.equal(storedHistory.devices['METER-1'].points.length, 1, 'Repeated history sync upserts by date');
assert.equal((await readHunonicHistory(actor.orgId, 'other-account')).devices['METER-1'], undefined, 'History isolated per account');
historyFailure = true; listFailure = false; failure = false;
const incompleteHistory = await executeHunonicBackgroundSync({ prisma, orgId: actor.orgId });
assert.notEqual(incompleteHistory.status, 'SUCCESS');
assert.equal((await readHunonicHistory(actor.orgId, '0123456789')).devices['METER-1'].points.length, 1, 'History failure preserves previous records');
console.log('PASS: full initial history, 30-day incremental reconciliation, idempotent day upsert, account isolation, partial failure preserves history');

historyFailure = false;
const olderDevice = { ...inventory[0], createdDate: new Date(Date.now() - 65 * 86400000).toISOString().slice(0,10) };
const windowCountBefore = historyWindows.length;
const chunkHistory = await syncHunonicHistory('isolated-history-chunks', 'test-account', 'unit-test-token', [olderDevice]);
assert.equal(historyWindows.length - windowCountBefore, 3, 'Initial history split into 30-day windows, avoiding upstream downsampling');
for (const [start, end] of historyWindows.slice(windowCountBefore)) assert.ok(Date.parse(end) - Date.parse(start) <= 29 * 86400000);
assert.equal(chunkHistory.devices[olderDevice.id].points.length, 3);
console.log('PASS: full-history ranges chunked to 30 days, retaining provider day precision');
