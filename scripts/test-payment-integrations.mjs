import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadAdhomeEnv } from '../apps/landing/server/envLoader.js';

loadAdhomeEnv();
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Integration test only runs against local PostgreSQL');
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/payment-integration-tests');
await mkdir(out, { recursive: true });
await build({ entryPoints: ['apps/landing/server/paymentIntegrationApi.ts', 'apps/landing/server/paymentProviderRegistry.ts'], outdir: out, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handlePaymentIntegrations, validateReceivingAccounts } = require(resolve(out, 'paymentIntegrationApi.js'));
const { testPaymentProvider } = require(resolve(out, 'paymentProviderRegistry.js'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const orgId = `integration-test-${crypto.randomUUID()}`;
const actor = { id: 'integration-test-admin', email: 'integration@example.test', role: 'ADMIN', orgId, permissions: ['settings.manage'], buildingScopes: ['*'] };
const base = '/api/v1/console/v2/settings/payment-connections';
const oldFetch = globalThis.fetch;
let providerFailure = false;
let race;
let httpStatus = 200;
globalThis.fetch = async (url, options) => {
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.redirect, 'error');
  assert.ok(!String(url).includes('test-secret'));
  if (race) { const action = race; race = null; await action(); }
  if (providerFailure) throw new Error('upstream leaked test-secret');
  if (httpStatus !== 200) return Response.json({ message: 'test-secret' }, { status: httpStatus });
  if (String(url).startsWith('https://my.sepay.vn/')) { assert.equal(options.headers.Authorization, 'Bearer test-secret-token'); return Response.json({ status: 200, messages: { success: true }, bankaccounts: [] }); }
  assert.equal(options.headers['x-client-id'], 'test-client');
  return Response.json({ code: '00', data: { id: 'known-link' } });
};
async function call(method, path = '', body = {}, who = actor, database = db) {
  let response;
  const headers = {};
  const handled = await handlePaymentIntegrations({ method }, { setHeader: (k, v) => { headers[k] = v; } }, base + path, database, who, {
    readJsonBody: async () => body,
    sendJson: (_res, status, data) => { response = { status, ...data, headers }; },
  });
  assert.ok(handled);
  return response;
}
try {
  await db.organization.create({ data: { id: orgId, slug: orgId, name: 'Integration test', hotline: '000', addressSummary: 'test' } });
  const payload = { creationId: crypto.randomUUID(), providerId: 'SEPAY', name: 'Hai ngân hàng', environment: 'LIVE', buildingId: null, credentials: { apiToken: 'test-secret-token' }, accounts: [ { bankCode: 'VCB', accountNumber: '001', accountName: 'TEST A' }, { bankCode: 'MB', accountNumber: '002', accountName: 'TEST B' } ] };
  assert.equal((await call('GET', '', {}, { ...actor, role: 'STAFF', permissions: [] })).status, 403);
  assert.throws(() => validateReceivingAccounts([...payload.accounts, payload.accounts[0]]), /trùng/);
  assert.throws(() => validateReceivingAccounts([{ bankCode: 'VCB', accountNumber: 'bad value', accountName: 'TEST' }]), /ký tự/);
  assert.throws(() => validateReceivingAccounts(Array(51).fill(payload.accounts[0])), /50/);
  const created = await call('POST', '', payload); assert.equal(created.status, 201);
  const id = created.id;
  const replay = await call('POST', '', payload); assert.equal(replay.id, id); assert.equal(replay.replay, true);
  assert.equal((await call('POST', '', { ...payload, name: 'Khác nội dung' })).status, 409);
  const second = await call('POST', '', { ...payload, creationId: crypto.randomUUID(), name: 'Kết nối SePay thứ hai' }); assert.equal(second.status, 201);
  const rollbackId = crypto.randomUUID();
  const failAudit = { $transaction: callback => db.$transaction(tx => callback({ ...tx, consoleAuditLog: { create: async () => { throw new Error('Injected audit failure'); } } })) };
  assert.equal((await call('POST', '', { ...payload, creationId: rollbackId }, actor, failAudit)).status, 500);
  assert.equal(await db.paymentProviderConnection.count({ where: { id: rollbackId } }), 0, 'Failed audit rolls back connection and accounts');
  const get = async () => (await call('GET')).connections.find(c => c.id === id);
  let connection = await get();
  assert.equal(connection.accounts.length, 2); assert.equal(connection.isEnabled, false); assert.equal(connection.status, 'UNCONFIGURED');
  const list = await call('GET');
  assert.equal(list.providers.length, 5); assert.equal(list.connections.length, 2);
  assert.ok(!JSON.stringify(list).includes('test-secret')); assert.ok(!JSON.stringify(list).includes('credentialsEncrypted')); assert.equal(list.headers['Cache-Control'], 'no-store');
  const stored = await db.paymentProviderConnection.findUnique({ where: { id } });
  assert.ok(!JSON.stringify(stored.credentialsEncrypted).includes('test-secret'));
  assert.equal((await call('POST', `/${id}/enabled`, { version: connection.version, isEnabled: true })).status, 422);
  assert.equal((await call('PATCH', `/${id}`, { ...payload, version: 100 })).status, 409);
  assert.equal((await call('PATCH', `/${id}`, { ...payload, version: 1 }, { ...actor, orgId: 'another-org' })).status, 404);
  assert.equal((await call('POST', '', { ...payload, buildingId: 'another-building' })).status, 403);
  assert.equal((await call('POST', '', { ...payload, credentials: { apiToken: 'a', unsupported: 'b' } })).status, 422);
  assert.equal((await call('POST', `/${id}/test`, { version: connection.version })).ok, true);
  connection = await get(); assert.equal(connection.status, 'VERIFIED'); assert.equal(connection.verificationScope, 'BANK_ACCOUNT_READ');
  assert.equal((await call('POST', `/${id}/enabled`, { version: connection.version, isEnabled: true })).ok, true);
  connection = await get(); assert.equal(connection.isEnabled, true);
  assert.equal((await call('PATCH', `/${id}`, { ...payload, version: connection.version, credentials: {}, accounts: [payload.accounts[0]] })).ok, true);
  connection = await get(); assert.equal(connection.isEnabled, false); assert.equal(connection.status, 'UNCONFIGURED'); assert.equal(connection.accounts.length, 1);
  providerFailure = true;
  const failed = await call('POST', `/${id}/test`, { version: connection.version });
  assert.equal(failed.status, 502); assert.ok(!JSON.stringify(failed).includes('test-secret'));
  connection = await get(); assert.equal(connection.status, 'ERROR'); assert.equal(connection.isEnabled, false);
  providerFailure = false;
  await call('PATCH', `/${id}`, { ...payload, version: connection.version, credentials: {} });
  connection = await get();
  race = async () => { assert.equal((await call('PATCH', `/${id}`, { ...payload, version: connection.version, credentials: { apiToken: 'new-test-secret-token' } })).ok, true); };
  const raced = await call('POST', `/${id}/test`, { version: connection.version }); assert.equal(raced.status, 409);
  connection = await get(); assert.equal(connection.status, 'UNCONFIGURED');
  const payos = await call('POST', '', { ...payload, creationId: crypto.randomUUID(), providerId: 'PAYOS', credentials: { clientId: 'test-client', apiKey: 'test-secret-api', checksumKey: 'test-secret-checksum' } });
  assert.equal(payos.status, 201);
  assert.equal((await call('POST', `/${payos.id}/test`, { version: 1, reference: 'https://evil.example' })).status, 422);
  assert.equal((await call('POST', `/${payos.id}/test`, { version: 1, reference: 'known-link' })).ok, true);
  const momo = await call('POST', '', { ...payload, creationId: crypto.randomUUID(), providerId: 'MOMO', environment: 'SANDBOX', credentials: { partnerCode: 'p', accessKey: 'test-secret-access', secretKey: 'test-secret-key' } });
  assert.equal(momo.status, 201); assert.equal((await call('POST', `/${momo.id}/test`, { version: 1 })).errorCode, 'NOT_SUPPORTED');
  for (const status of [401, 429, 500]) { httpStatus = status; await assert.rejects(() => testPaymentProvider('SEPAY', 'LIVE', payload.credentials, ''), e => !e.message.includes('test-secret') && e.code === 'PROVIDER_REJECTED'); }
  httpStatus = 200;
  const logs = await db.consoleAuditLog.findMany({ where: { orgId } });
  assert.ok(logs.length >= 10); assert.ok(!JSON.stringify(logs).includes('test-secret'));
  assert.equal(await db.paymentTransaction.count({ where: { orgId } }), 0, 'Connectivity checks never create receipts');
  console.log('PASS: local PostgreSQL CRUD, multi-connection/provider, multi-bank, RBAC, tenant isolation, vault redaction, validation, version conflicts, key rotation race, enable guards, provider failures, payOS/SePay probes, audit and zero receipts.');
} finally {
  globalThis.fetch = oldFetch;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
}
