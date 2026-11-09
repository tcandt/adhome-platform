import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Prisma, type PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from './cryptoVault';

class WebhookError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const reject = (status: number, message: string): never => { throw new WebhookError(status, message); };
const object = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'Invalid JSON object');
  return value as Record<string, any>;
};
const stringId = (value: unknown, label: string): string => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) reject(400, `Invalid ${label}`);
  if (!['string', 'number'].includes(typeof value) || !String(value).trim() || String(value).length > 200) reject(400, `Invalid ${label}`);
  return String(value);
};
const amount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) reject(400, 'Invalid VND amount');
  return value as number;
};
const textEqual = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
function verifyHex(signature: unknown, expected: string) {
  if (typeof signature !== 'string' || !/^[a-fA-F0-9]+$/.test(signature) || !textEqual(signature.toLowerCase(), expected)) reject(401, 'Invalid signature');
}
const hmac = (algorithm: string, key: string, value: string) => crypto.createHmac(algorithm, key).update(value).digest('hex');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** payOS official signing rules: sorted keys, null/undefined become empty strings. */
export function payosSignedData(data: Record<string, any>): string {
  return Object.keys(data).sort().map(key => {
    let value = data[key];
    if (value === null || value === undefined || value === 'null' || value === 'undefined') value = '';
    else if (Array.isArray(value)) value = JSON.stringify(value.map(item => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item));
    else if (typeof value === 'object') reject(400, 'Unsupported payOS signed value');
    return `${key}=${value}`;
  }).join('&');
}

export function assertWebhookCredentials(provider: string, credentials: Record<string, string>, auth: string) {
  const fields = provider === 'SEPAY' ? ['webhookSecret'] : provider === 'PAYOS' ? ['checksumKey'] : provider === 'MOMO' ? ['partnerCode', 'accessKey', 'secretKey'] : provider === 'ZALOPAY' ? ['appId', 'key2'] : provider === 'TINGEE' ? ['clientId', 'secretKey'] : [];
  if (!fields.length || fields.some(key => !credentials[key])) reject(422, 'Thiếu khóa xác thực webhook của nhà cung cấp. Hãy sửa cấu hình.');
  if (provider === 'SEPAY' && !['HMAC_SHA256', 'API_KEY'].includes(auth)) reject(422, 'Phương thức xác thực webhook SePay không được hỗ trợ.');
}

type Normalized = { eventKey: string; eventType: string; amountVnd: number; identity: string; status: 'RECEIVED' | 'TEST_RECEIVED' };
export function verifyPaymentWebhook(provider: string, credentials: Record<string, string>, auth: string, headers: IncomingMessage['headers'], raw: string, now = Date.now()): Normalized {
  assertWebhookCredentials(provider, credentials, auth);
  let body: Record<string, any>;
  try { body = object(JSON.parse(raw)); } catch (error) { if (error instanceof WebhookError) throw error; return reject(400, 'Invalid JSON'); }
  let key: string; let type: string; let total: number; let identity: unknown[]; let isTest = false;
  if (provider === 'SEPAY') {
    if (auth === 'API_KEY') {
      if (!textEqual(String(headers.authorization || ''), `Apikey ${credentials.webhookSecret}`)) reject(401, 'Invalid webhook API key');
    } else {
      const timestamp = String(headers['x-sepay-timestamp'] || '');
      if (!/^\d{10,11}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) reject(401, 'Expired signature');
      const signature = String(headers['x-sepay-signature'] || '');
      if (!signature.startsWith('sha256=')) reject(401, 'Invalid signature');
      verifyHex(signature.slice(7), hmac('sha256', credentials.webhookSecret, `${timestamp}.${raw}`));
    }
    const id = stringId(body.id, 'transaction id');
    if (!['in', 'out'].includes(body.transferType)) reject(400, 'Invalid transfer type');
    stringId(body.accountNumber, 'account number');
    total = amount(body.transferAmount); type = body.transferType === 'in' ? 'CREDIT' : 'DEBIT';
    isTest = id === '0';
    key = isTest ? `probe:${sha256(raw)}` : `transaction:${id}`;
    identity = [id, type, total, body.accountNumber, body.subAccount || '', body.referenceCode || ''];
  } else if (provider === 'PAYOS') {
    const data = object(body.data);
    verifyHex(body.signature, hmac('sha256', credentials.checksumKey, payosSignedData(data)));
    if (data.currency !== 'VND') reject(400, 'Unsupported currency');
    const order = stringId(data.orderCode, 'order code');
    const link = stringId(data.paymentLinkId, 'payment link id');
    const reference = stringId(data.reference, 'transaction reference');
    total = amount(data.amount);
    // Only fields inside signed data determine payment event semantics.
    type = data.code === '00' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_OTHER';
    key = `payment:${link}:${reference}:${String(data.code)}`;
    identity = [link, order, reference, data.code, total, data.accountNumber || '', data.currency];
  } else if (provider === 'MOMO') {
    const keys = ['amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];
    if (keys.some(key => body[key] === undefined || body[key] === null || !['string', 'number'].includes(typeof body[key]))) reject(400, 'Incomplete IPN v2');
    const signatureInput = `accessKey=${credentials.accessKey}&${keys.map(key => `${key}=${body[key]}`).join('&')}`;
    verifyHex(body.signature, hmac('sha256', credentials.secretKey, signatureInput));
    if (body.partnerCode !== credentials.partnerCode) reject(401, 'Partner mismatch');
    if (!Number.isSafeInteger(body.resultCode)) reject(400, 'Invalid result code');
    const order = stringId(body.orderId, 'order id'); const tx = stringId(body.transId, 'transaction id');
    total = amount(body.amount); type = body.resultCode === 0 ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_OTHER';
    key = `payment:${order}:${tx}:${body.resultCode}`;
    identity = [credentials.partnerCode, order, tx, body.resultCode, total];
  } else if (provider === 'ZALOPAY') {
    if (typeof body.data !== 'string') reject(400, 'Invalid callback data');
    verifyHex(body.mac, hmac('sha256', credentials.key2, body.data));
    if (body.type !== 1) reject(422, 'Only order callback type 1 is supported');
    let data: Record<string, any>;
    try { data = object(JSON.parse(body.data)); } catch { return reject(400, 'Invalid callback data'); }
    if (String(data.app_id) !== credentials.appId) reject(401, 'App mismatch');
    const order = stringId(data.app_trans_id, 'app transaction id'); const tx = stringId(data.zp_trans_id, 'ZaloPay transaction id');
    total = amount(data.amount); type = 'PAYMENT_SUCCEEDED';
    key = `order:${order}:${tx}`; identity = [data.app_id, order, tx, total];
  } else if (provider === 'TINGEE') {
    const timestamp = String(headers['x-request-timestamp'] || '');
    if (!/^\d{17}$/.test(timestamp)) reject(401, 'Invalid timestamp');
    // Official Node example signs JSON.stringify(body), including insertion order.
    verifyHex(headers['x-signature'], hmac('sha512', credentials.secretKey, `${timestamp}:${JSON.stringify(body)}`));
    if (body.clientId !== credentials.clientId) reject(401, 'Client mismatch');
    const tx = stringId(body.transactionCode, 'transaction code');
    if (body.type !== undefined && !['credit', 'debit'].includes(body.type)) reject(400, 'Invalid transaction type');
    total = amount(body.amount); type = body.type === 'debit' ? 'DEBIT' : 'CREDIT';
    key = `transaction:${tx}:${type}`; identity = [body.clientId, tx, type, total, body.accountNumber || '', body.vaAccountNumber || ''];
  } else return reject(404, 'Unsupported provider');
  if (key.length > 450) reject(400, 'Event identifier too long');
  return { eventKey: key, eventType: type, amountVnd: total, identity: sha256(JSON.stringify(identity)), status: isTest ? 'TEST_RECEIVED' : 'RECEIVED' };
}

function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, rejectPromise) => {
    let size = 0; const chunks: Buffer[] = [];
    const finish = (error?: Error) => { req.off('data', data); req.off('end', end); req.off('error', fail); req.off('aborted', aborted); clearTimeout(timer); if (error) { req.once('error', () => {}); req.resume(); rejectPromise(error); } };
    const data = (chunk: Buffer) => { size += chunk.length; if (size > 128 * 1024) finish(new WebhookError(413, 'Payload too large')); else chunks.push(Buffer.from(chunk)); };
    const end = () => { finish(); try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { rejectPromise(new WebhookError(400, 'Invalid UTF-8')); } };
    const fail = () => finish(new WebhookError(400, 'Incomplete request'));
    const aborted = () => finish(new WebhookError(400, 'Request aborted'));
    const timer = setTimeout(() => finish(new WebhookError(408, 'Request timeout')), 10000);
    req.on('data', data); req.on('end', end); req.on('error', fail); req.on('aborted', aborted);
  });
}

function reply(res: ServerResponse, provider: string, status: number, message?: string, duplicate = false) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (status < 300) {
    res.statusCode = provider === 'MOMO' ? 204 : 200;
    return res.end(provider === 'MOMO' ? undefined : JSON.stringify(provider === 'SEPAY' ? { success: true } : provider === 'ZALOPAY' ? { return_code: 1, return_message: 'success' } : provider === 'TINGEE' ? { code: duplicate ? '02' : '00', message: 'Success' } : { success: true }));
  }
  res.statusCode = provider === 'ZALOPAY' ? 200 : status;
  return res.end(JSON.stringify(provider === 'ZALOPAY' ? { return_code: status >= 500 ? 0 : -1, return_message: message } : provider === 'TINGEE' ? { code: status === 401 ? '09' : '99', message } : { success: false, message }));
}

/** Public route, authenticated exclusively by the provider's documented signing scheme. */
export async function handlePaymentWebhook(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/webhooks\/payments\/(sepay|payos|momo|zalopay|tingee)\/([a-fA-F0-9-]{32,36})$/);
  if (!match) return false;
  const provider = match[1].toUpperCase(); const connectionId = match[2];
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); reject(405, 'POST required'); }
    if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) reject(415, 'application/json required');
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') reject(415, 'Unsupported content encoding');
    const raw = await readRaw(req);
    const duplicate = await prisma.$transaction(async tx => {
      // Serialize callbacks with configuration changes; do not accept using a just-revoked key.
      await tx.$queryRaw`SELECT id FROM payment_provider_connections WHERE id = ${connectionId} FOR UPDATE`;
      const connection = await tx.paymentProviderConnection.findFirst({ where: { id: connectionId, providerId: provider } });
      if (!connection) return reject(404, 'Webhook connection not found');
      if (!connection.webhookEnabled) return reject(503, 'Webhook receiver disabled');
      const plaintext = decryptSecret(connection.credentialsEncrypted);
      if (!plaintext) return reject(503, 'Webhook credentials unavailable');
      const credentials = JSON.parse(plaintext);
      const verified = verifyPaymentWebhook(provider, credentials, connection.webhookAuth, req.headers, raw);
      const previous = await tx.paymentWebhookEvent.findUnique({ where: { connectionId_eventKey: { connectionId, eventKey: verified.eventKey } } });
      if (previous && previous.identityHash !== verified.identity) return reject(409, 'Conflicting transaction identity');
      if (!previous) await tx.paymentWebhookEvent.create({ data: { connectionId, eventKey: verified.eventKey, eventType: verified.eventType, identityHash: verified.identity, amountVnd: BigInt(verified.amountVnd), payloadEncrypted: encryptSecret(raw) as unknown as Prisma.InputJsonValue, status: verified.status } });
      await tx.paymentProviderConnection.update({ where: { id: connectionId }, data: { webhookLastReceivedAt: new Date() } });
      return !!previous;
    }, { timeout: 7000, maxWait: 2000 });
    // ACK only after durable commit. Inbox reception does not create a receipt or settle an invoice.
    reply(res, provider, 200, undefined, duplicate);
  } catch (error) {
    reply(res, provider, error instanceof WebhookError ? error.status : 503, error instanceof WebhookError ? error.message : 'Webhook storage temporarily unavailable');
  }
  return true;
}
