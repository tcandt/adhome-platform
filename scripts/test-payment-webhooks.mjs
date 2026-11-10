import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadAdhomeEnv } from '../apps/landing/server/envLoader.js';

loadAdhomeEnv();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname), 'Only local PostgreSQL');
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/payment-webhook-tests');
await mkdir(out, { recursive: true });
await build({ entryPoints: ['apps/landing/server/paymentWebhooks.ts', 'apps/landing/server/paymentIntegrationApi.ts', 'apps/landing/server/paymentWebhookConfig.ts', 'apps/landing/server/cryptoVault.ts'], outdir: out, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handlePaymentWebhook, verifyPaymentWebhook, payosSignedData } = require(resolve(out, 'paymentWebhooks.js'));
const { handlePaymentIntegrations } = require(resolve(out, 'paymentIntegrationApi.js'));
const { webhookAddress, paymentWebhookOrigin } = require(resolve(out, 'paymentWebhookConfig.js'));
const { encryptSecret, decryptSecret } = require(resolve(out, 'cryptoVault.js'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const hmac = (algorithm, key, text) => crypto.createHmac(algorithm, key).update(text).digest('hex');
const orgId = `webhook-test-${crypto.randomUUID()}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const sepayCredentials = { apiToken: 'outbound-api-secret', webhookSecret: 'separate-callback-secret' };
const sepayBody = { id: 92704, gateway: 'Vietcombank', transactionDate: '2026-11-03 18:00:00', accountNumber: '001234', subAccount: '', code: 'INV001', content: 'Thu tiền phòng', transferType: 'in', transferAmount: 5000000, referenceCode: 'FT-TEST' };
const sepayRaw = JSON.stringify(sepayBody, null, 2);
const sepayHeaders = { 'x-sepay-timestamp': timestamp, 'x-sepay-signature': `sha256=${hmac('sha256', sepayCredentials.webhookSecret, `${timestamp}.${sepayRaw}`)}` };
const payosCredentials = { clientId: 'client', apiKey: 'outbound-key', checksumKey: '1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675' };
// Fixed official payOS documentation vector, independent from local signing implementation.
const payosBody = { code: '00', desc: 'success', success: true, data: { orderCode: 123, amount: 3000, description: 'VQRIO123', accountNumber: '12345678', reference: 'TF230204212323', transactionDateTime: '2023-02-04 18:25:00', currency: 'VND', paymentLinkId: '124c33293c43417ab7879e14c8d9eb18', code: '00', desc: 'Thành công', counterAccountBankId: '', counterAccountBankName: '', counterAccountName: '', counterAccountNumber: '', virtualAccountName: '', virtualAccountNumber: '' }, signature: '412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03' };
const momoCredentials = { partnerCode: 'MOMO-TEST', accessKey: 'access-secret', secretKey: 'signing-secret' };
const momoBody = { amount: 1000, extraData: '', message: 'Successful.', orderId: 'ORDER1', orderInfo: 'Thu tiền', orderType: 'momo_wallet', partnerCode: 'MOMO-TEST', payType: 'qr', requestId: 'REQUEST1', responseTime: 1721720663942, resultCode: 0, transId: 4088878653 };
const momoInput = 'accessKey=access-secret&amount=1000&extraData=&message=Successful.&orderId=ORDER1&orderInfo=Thu tiền&orderType=momo_wallet&partnerCode=MOMO-TEST&payType=qr&requestId=REQUEST1&responseTime=1721720663942&resultCode=0&transId=4088878653';
momoBody.signature = hmac('sha256', momoCredentials.secretKey, momoInput);
const zaloCredentials = { appId: '2638', key1: 'api-secret', key2: 'callback-secret' };
const zaloData = '{"app_id":2638,"app_trans_id":"261103_TEST1","amount":50000,"zp_trans_id":230407000006575,"description":"Thu ti\\u1ec1n"}';
const zaloBody = { data: zaloData, mac: hmac('sha256', zaloCredentials.key2, zaloData), type: 1 };
const tingeeCredentials = { clientId: 'tingee-test', secretKey: 'tingee-secret' };
const tingeeBody = { clientId: 'tingee-test', transactionCode: 'FT-TINGEE-TEST', amount: 250000, content: 'Thu tiền', bank: 'VCB', accountNumber: '001234', vaAccountNumber: '', transactionDate: '20261103180000', type: 'credit' };
const tingeeTimestamp = '20261103180000123';
const tingeeHeaders = { 'x-request-timestamp': tingeeTimestamp, 'x-signature': hmac('sha512', tingeeCredentials.secretKey, `${tingeeTimestamp}:${JSON.stringify(tingeeBody)}`) };
const cases = [
  ['SEPAY', sepayCredentials, 'HMAC_SHA256', sepayRaw, sepayHeaders],
  ['PAYOS', payosCredentials, 'HMAC_SHA256', JSON.stringify(payosBody), {}],
  ['MOMO', momoCredentials, 'HMAC_SHA256', JSON.stringify(momoBody), {}],
  ['ZALOPAY', zaloCredentials, 'HMAC_SHA256', JSON.stringify(zaloBody), {}],
  ['TINGEE', tingeeCredentials, 'HMAC_SHA512', JSON.stringify(tingeeBody), tingeeHeaders],
];
async function receive(connection, raw, headers, method = 'POST', database = db) {
  const req = Readable.from([Buffer.from(raw)]);
  req.method = method; req.headers = { 'content-type': 'application/json', ...headers };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  assert.ok(await handlePaymentWebhook(req, res, `/api/v1/webhooks/payments/${connection.providerId.toLowerCase()}/${connection.id}`, database));
  return { status: res.statusCode, body: res.body, json: res.body ? JSON.parse(res.body) : undefined };
}
const actor = { id: 'test-admin', email: 'test@example.test', role: 'ADMIN', orgId, permissions: ['settings.manage'], buildingScopes: ['*'] };
async function action(connection, route, body, database = db) {
  let reply;
  await handlePaymentIntegrations({ method: 'POST' }, { setHeader() {} }, `/api/v1/console/v2/settings/payment-connections/${connection.id}/${route}`, database, actor, { readJsonBody: async () => body, sendJson: (_res, status, data) => { reply = { status, ...data }; } });
  return reply;
}
const previousFetch = globalThis.fetch;
try {
  assert.equal(webhookAddress('SEPAY', 'id').webhookUrl, 'https://console.adhome.vn/api/v1/webhooks/payments/sepay/id');
  assert.equal(paymentWebhookOrigin({ headers: { 'x-adhome-console-origin': 'https://console.adhome.vn', host: '127.0.0.1:5173' } }), 'https://console.adhome.vn');
  assert.equal(paymentWebhookOrigin({ headers: { host: 'adhome.vn' } }), 'https://adhome.vn');
  assert.equal(paymentWebhookOrigin({ headers: { host: 'evil.example', 'x-adhome-console-origin': 'https://evil.example', 'x-forwarded-host': 'evil.example' } }), 'https://console.adhome.vn');
  assert.equal(paymentWebhookOrigin({ headers: { host: 'localhost:5173' } }), 'https://console.adhome.vn');
  assert.equal(verifyPaymentWebhook('PAYOS', payosCredentials, 'HMAC_SHA256', {}, JSON.stringify(payosBody)).amountVnd, 3000);
  assert.equal(payosSignedData({ b: null, a: 'null', c: [{ b: 2, a: 1 }] }), 'a=&b=&c=[{"a":1,"b":2}]');
  assert.throws(() => verifyPaymentWebhook('SEPAY', sepayCredentials, 'HMAC_SHA256', sepayHeaders, JSON.stringify(sepayBody)), /signature/i, 'SePay signature must cover raw bytes, not reserialized JSON');
  assert.throws(() => verifyPaymentWebhook('SEPAY', sepayCredentials, 'HMAC_SHA256', { ...sepayHeaders, 'x-sepay-timestamp': '1000000000' }, sepayRaw), /Expired/);
  assert.throws(() => verifyPaymentWebhook('SEPAY', sepayCredentials, 'API_KEY', { authorization: 'Apikey outbound-api-secret' }, sepayRaw), /API key/);
  assert.equal(verifyPaymentWebhook('SEPAY', sepayCredentials, 'API_KEY', { authorization: 'Apikey separate-callback-secret' }, sepayRaw).eventType, 'CREDIT');
  const badPayos = structuredClone(payosBody); badPayos.data.amount++;
  assert.throws(() => verifyPaymentWebhook('PAYOS', payosCredentials, 'HMAC_SHA256', {}, JSON.stringify(badPayos)), /signature/i);
  assert.throws(() => verifyPaymentWebhook('ZALOPAY', { ...zaloCredentials, key2: zaloCredentials.key1 }, 'HMAC_SHA256', {}, JSON.stringify(zaloBody)), /signature/i);
  assert.throws(() => verifyPaymentWebhook('TINGEE', { ...tingeeCredentials, clientId: 'other-client' }, 'HMAC_SHA256', tingeeHeaders, JSON.stringify(tingeeBody)), /mismatch/);
  await db.organization.create({ data: { id: orgId, slug: orgId, name: 'Webhook test', hotline: '000', addressSummary: 'test' } });
  for (const [providerId, credentials, webhookAuth, raw, headers] of cases) {
    const connection = await db.paymentProviderConnection.create({ data: { orgId, providerId, name: `${providerId} webhook test`, webhookAuth, webhookEnabled: true, credentialsEncrypted: encryptSecret(JSON.stringify(credentials)), credentialFields: Object.keys(credentials) } });
    // No Console auth or CSRF headers: provider signature is the endpoint authentication.
    const accepted = await receive(connection, raw, headers);
    assert.equal(accepted.status, providerId === 'MOMO' ? 204 : 200, providerId);
    if (providerId === 'SEPAY') assert.deepEqual(accepted.json, { success: true });
    if (providerId === 'SEPAY') {
      const conflictingRaw = JSON.stringify({ ...sepayBody, transferAmount: sepayBody.transferAmount + 1 });
      const conflictingHeaders = { ...headers, 'x-sepay-signature': `sha256=${hmac('sha256', credentials.webhookSecret, `${timestamp}.${conflictingRaw}`)}` };
      assert.equal((await receive(connection, conflictingRaw, conflictingHeaders)).status, 409, 'Same transaction ID with conflicting amount is not ACKed');
    }
    if (providerId === 'MOMO') assert.equal(accepted.body, undefined);
    if (providerId === 'ZALOPAY') assert.equal(accepted.json.return_code, 1);
    if (providerId === 'TINGEE') assert.equal(accepted.json.code, '00');
    if (process.env.ADHOME_WEBHOOK_HTTP_URL) {
      const http = await previousFetch(`${process.env.ADHOME_WEBHOOK_HTTP_URL}/api/v1/webhooks/payments/${providerId.toLowerCase()}/${connection.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw, signal: AbortSignal.timeout(10000) });
      if (http.status !== (providerId === 'MOMO' ? 204 : 200)) assert.fail(`${providerId} public HTTP route: ${http.status} ${await http.text()}`);
      if (providerId !== 'MOMO') assert.deepEqual(await http.json(), providerId === 'TINGEE' ? { code: '02', message: 'Success' } : accepted.json);
    }
    const retries = await Promise.all([receive(connection, raw, headers), receive(connection, raw, headers)]);
    assert.ok(retries.every(r => r.status === (providerId === 'MOMO' ? 204 : 200)));
    assert.equal(await db.paymentWebhookEvent.count({ where: { connectionId: connection.id } }), 1, `${providerId} retries deduplicated atomically`);
    const stored = await db.paymentWebhookEvent.findFirst({ where: { connectionId: connection.id } });
    assert.equal(decryptSecret(stored.payloadEncrypted), raw);
    assert.ok(!JSON.stringify(stored.payloadEncrypted).includes('Thu tiền'));
    assert.equal((await db.paymentProviderConnection.findUnique({ where: { id: connection.id } })).status, 'UNCONFIGURED', 'Webhook receipt never fabricates API verification');
    const bad = await receive(connection, raw.replace(/3000|5000000|250000|50000|1000/, '999999'), headers);
    assert.ok(providerId === 'ZALOPAY' ? bad.json.return_code === -1 : bad.status >= 400, `${providerId} tampered callback rejected`);
    const failStorage = { $transaction: async () => { throw new Error('private database failure'); } };
    const failed = await receive(connection, raw, headers, 'POST', failStorage);
    assert.equal(failed.status, providerId === 'ZALOPAY' ? 200 : 503);
    if (providerId === 'ZALOPAY') assert.equal(failed.json.return_code, 0);
    assert.ok(!failed.body.includes('private database'));
    if (providerId === 'PAYOS') {
      globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api-merchant.payos.vn/confirm-webhook'); assert.equal(options.method, 'POST'); assert.equal(options.headers['x-api-key'], credentials.apiKey); return Response.json({ code: '00', data: { webhookUrl: JSON.parse(options.body).webhookUrl } }); };
      assert.equal((await action(connection, 'register-webhook', { version: connection.version })).ok, true);
      assert.ok((await db.paymentProviderConnection.findUnique({ where: { id: connection.id } })).webhookRegisteredAt);
    }
    await db.paymentProviderConnection.update({ where: { id: connection.id }, data: { webhookEnabled: false } });
    const disabled = await receive(connection, raw, headers);
    assert.equal(disabled.status, providerId === 'ZALOPAY' ? 200 : 503);
    if (providerId === 'ZALOPAY') assert.equal(disabled.json.return_code, 0);
    const latest = await db.paymentProviderConnection.findUnique({ where: { id: connection.id } });
    assert.equal((await action(latest, 'webhook', { version: latest.version, isEnabled: true })).ok, true, `${providerId} webhook can be enabled independently of outbound API verification`);
  }
  const noSecret = await db.paymentProviderConnection.create({ data: { orgId, providerId: 'SEPAY', name: 'API-only connection', credentialsEncrypted: encryptSecret(JSON.stringify({ apiToken: 'outbound-only' })) } });
  let settings;
  await handlePaymentIntegrations({ method: 'GET', headers: { 'x-adhome-console-origin': 'https://console.adhome.vn' } }, { setHeader() {} }, '/api/v1/console/v2/settings/payment-connections', db, actor, { readJsonBody: async () => ({}), sendJson: (_res, status, data) => { assert.equal(status, 200); settings = data; } });
  assert.ok(settings.connections.every(c => c.webhookUrl === `https://console.adhome.vn/api/v1/webhooks/payments/${c.providerId.toLowerCase()}/${c.id}`));
  assert.ok(settings.connections.some(c => c.webhookEvents.length > 0));
  const serializedSettings = JSON.stringify(settings);
  for (const forbidden of ['payloadEncrypted', 'credentialsEncrypted', 'separate-callback-secret', 'tingee-secret']) assert.ok(!serializedSettings.includes(forbidden), 'Settings never serializes webhook secrets/raw inbox');
  assert.equal((await action(noSecret, 'webhook', { version: 1, isEnabled: true })).status, 422);
  const large = await receive(noSecret, 'x'.repeat(128 * 1024 + 1), {}); assert.equal(large.status, 413);
  assert.equal(await db.paymentTransaction.count({ where: { orgId } }), 0, 'Webhook inbox never creates financial receipts');
  console.log('PASS: five provider signatures/ACKs, official payOS vector, SePay raw-body/HMAC/API-Key isolation, stale signature, forged payloads, tenant identifiers, encrypted durable inbox, atomic concurrent deduplication, storage failure ACK safety, independent webhook enable, payOS registration, payload limit and zero receipts.');
} finally {
  globalThis.fetch = previousFetch;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
}
