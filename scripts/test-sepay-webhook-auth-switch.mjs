import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const directory = await mkdtemp(resolve(tmpdir(), 'adhome-sepay-switch-'));
process.env.ADHOME_CREDENTIALS_ENCRYPTION_KEY = 'test-only-sepay-switch-key-longer-than-32-characters';
try {
  await build({ entryPoints: ['apps/landing/server/paymentIntegrationApi.ts', 'apps/landing/server/cryptoVault.ts'], outdir: directory, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
  const { handlePaymentIntegrations } = require(resolve(directory, 'paymentIntegrationApi.js'));
  const { encryptSecret, decryptSecret } = require(resolve(directory, 'cryptoVault.js'));
  const existing = { id: 'connection-1', orgId: 'org-test', providerId: 'SEPAY', name: 'SePay test', environment: 'LIVE', version: 1, webhookAuth: 'HMAC_SHA256', credentialsEncrypted: encryptSecret(JSON.stringify({ apiToken: 'read-token', webhookSecret: 'hmac-secret' })) };
  let updated;
  const tx = {
    paymentProviderConnection: { updateMany: async ({ data }) => { updated = data; return { count: 1 }; } },
    paymentReceivingAccount: { deleteMany: async () => ({ count: 0 }) },
    consoleAuditLog: { create: async () => ({}) },
  };
  const prisma = { paymentProviderConnection: { findFirst: async () => existing }, $transaction: async callback => callback(tx) };
  const actor = { id: 'admin', orgId: 'org-test', email: 'admin@example.test', role: 'ADMIN', permissions: ['settings.manage'], buildingScopes: ['*'] };
  async function save(credentials) {
    let reply;
    await handlePaymentIntegrations({ method: 'PATCH' }, { setHeader() {} }, '/api/v1/console/v2/settings/payment-connections/connection-1', prisma, actor, {
      readJsonBody: async () => ({ providerId: 'SEPAY', version: 1, name: 'SePay test', environment: 'LIVE', buildingId: '', webhookAuth: 'API_KEY', credentials, accounts: [] }),
      sendJson: (_res, status, body) => { reply = { status, ...body }; },
    });
    return reply;
  }
  const rejected = await save({});
  assert.equal(rejected.status, 422);
  assert.equal(rejected.errorCode, 'WEBHOOK_KEY_REQUIRED');
  assert.equal(updated, undefined);
  const accepted = await save({ webhookSecret: 'separate-api-key' });
  assert.equal(accepted.status, 200);
  assert.equal(updated.webhookAuth, 'API_KEY');
  assert.equal(JSON.parse(decryptSecret(updated.credentialsEncrypted)).webhookSecret, 'separate-api-key');
  console.log('PASS SePay auth switch requires the new method-specific webhook key');
} finally { await rm(directory, { recursive: true, force: true }); }
