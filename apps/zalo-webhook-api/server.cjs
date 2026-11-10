const http = require('node:http');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { processRegistration } = require('./registration.cjs');
const { queueRegistrationReply } = require('./registration-reply.cjs');
const { getPublicRooms } = require('./public-rooms.cjs');
const { validSecret, receiveBotUpdate, sendPendingReplies, sendPendingAdminMessages, sendPendingResidentMessages } = require('./zalo-bot.cjs');
const { seal, open, digest, randomSecret, randomSetupCode } = require('./bot-config.cjs');
const { defaults, normalizeTemplates } = require('./message-templates.cjs');
const { queueBusinessNotifications } = require('./business-notifications.cjs');

const port = Number(process.env.PORT || 8081);
const appId = process.env.ZALO_APP_ID || '';
const oaId = process.env.ZALO_OA_ID || '';
const secret = process.env.ZALO_OA_SECRET_KEY || '';
const pool = new Pool({ host: '/var/run/postgresql', database: process.env.PGDATABASE || 'adhome_prod', user: process.env.PGUSER || 'adhome_app', max: 5 });

async function configuredBot(botId) {
  const result = await pool.query('SELECT org_id, bot_id, token_ciphertext, webhook_secret_ciphertext, is_enabled FROM zalo_bot_configs WHERE bot_id = $1', [botId]);
  const row = result.rows[0];
  return row?.is_enabled ? { ...row, token: open(row.token_ciphertext), secret: open(row.webhook_secret_ciphertext) } : null;
}

async function flushBotOutboxes() {
  const configs = await pool.query('SELECT org_id, bot_id, token_ciphertext, message_templates FROM zalo_bot_configs WHERE is_enabled = true');
  for (const row of configs.rows) {
    const token = open(row.token_ciphertext);
    await queueBusinessNotifications(pool, row);
    await sendPendingReplies(pool, token);
    await sendPendingResidentMessages(pool, token);
    await sendPendingAdminMessages(pool, token);
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function adminConfig(req, res, orgId) {
  if (!validSecret(req.headers.authorization?.replace(/^Bearer /, ''), process.env.ZALO_BOT_ADMIN_API_KEY || '')) return reply(res, 401, { error: 'unauthorized' });
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(orgId)) return reply(res, 400, { error: 'invalid_org' });
  const existing = (await pool.query('SELECT bot_id, webhook_secret_ciphertext, setup_expires_at, message_templates FROM zalo_bot_configs WHERE org_id = $1', [orgId])).rows[0];
  const group = existing ? (await pool.query('SELECT chat_id, connected_at FROM zalo_bot_admin_groups WHERE bot_id = $1', [existing.bot_id])).rows[0] : null;
  if (req.method === 'GET') return reply(res, 200, { botId: existing?.bot_id || null, groupId: group?.chat_id || null, connectedAt: group?.connected_at || null, setupPending: Boolean(existing?.setup_expires_at && new Date(existing.setup_expires_at) > new Date()), templates: { ...defaults, ...(existing?.message_templates || {}) } });
  if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' });
  let body;
  try { body = await readBody(req); } catch { return reply(res, 400, { error: 'invalid_json' }); }
  if (body?.action === 'setup') {
    if (!existing) return reply(res, 409, { error: 'bot_not_configured' });
    const code = randomSetupCode();
    await pool.query('UPDATE zalo_bot_configs SET setup_code_hash = $2, setup_expires_at = now() + interval \'10 minutes\' WHERE org_id = $1', [orgId, digest(code)]);
    return reply(res, 200, { command: `/setadmin ${code}`, expiresInSeconds: 600 });
  }
  if (body?.action === 'templates') {
    if (!existing) return reply(res, 409, { error: 'bot_not_configured' });
    let templates;
    try { templates = normalizeTemplates(body.templates); } catch { return reply(res, 422, { error: 'invalid_templates' }); }
    await pool.query('UPDATE zalo_bot_configs SET message_templates = $2::jsonb, updated_at = now() WHERE org_id = $1', [orgId, JSON.stringify(templates)]);
    return reply(res, 200, { templates });
  }
  const token = String(body?.token || '').trim();
  if (!/^\d{10,25}:[A-Za-z0-9_-]{30,200}$/.test(token)) return reply(res, 400, { error: 'invalid_token' });
  const newBotId = token.split(':')[0];
  if (existing && existing.bot_id !== newBotId) return reply(res, 409, { error: 'bot_id_change_not_supported' });
  const me = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
  if (!me?.ok || String(me?.result?.id) !== newBotId) return reply(res, 422, { error: 'invalid_bot_token' });
  const webhookSecret = existing?.webhook_secret_ciphertext ? open(existing.webhook_secret_ciphertext) : randomSecret();
  const webhookUrl = 'https://api.adhome.vn/api/v1/zalo-bot/webhook';
  await pool.query(`INSERT INTO zalo_bot_configs (org_id, bot_id, token_ciphertext, webhook_secret_ciphertext, webhook_secret_hash) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (org_id) DO UPDATE SET token_ciphertext = EXCLUDED.token_ciphertext, webhook_secret_ciphertext = EXCLUDED.webhook_secret_ciphertext,
    webhook_secret_hash = EXCLUDED.webhook_secret_hash, updated_at = now(), is_enabled = true`, [orgId, newBotId, seal(token), seal(webhookSecret), digest(webhookSecret)]);
  const registered = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/setWebhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }), signal: AbortSignal.timeout(12000) }).then(r => r.json()).catch(() => null);
  if (!registered?.ok || registered?.result?.ok === false) return reply(res, 502, { error: 'webhook_registration_failed' });
  return reply(res, 200, { botId: newBotId, webhookUrl, webhookRegistered: true });
}

async function adminContractStatus(req, res, orgId, contractId) {
  if (!validSecret(req.headers.authorization?.replace(/^Bearer /, ''), process.env.ZALO_BOT_ADMIN_API_KEY || '')) return reply(res, 401, { error: 'unauthorized' });
  if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' });
  const config = (await pool.query('SELECT bot_id FROM zalo_bot_configs WHERE org_id = $1 AND is_enabled = true', [orgId])).rows[0];
  const contractResponse = await fetch(`${process.env.ADHOME_CONSOLE_INTERNAL_ORIGIN || 'http://127.0.0.1:8082'}/internal/zalo-bot/contracts/${encodeURIComponent(orgId)}/${encodeURIComponent(contractId)}`, {
    headers: { authorization: `Bearer ${process.env.ZALO_BOT_ADMIN_API_KEY}` }, signal: AbortSignal.timeout(10000),
  });
  if (contractResponse.status === 404) return reply(res, 404, { error: 'contract_not_found' });
  if (!contractResponse.ok) return reply(res, 503, { error: 'contract_lookup_unavailable' });
  const contract = await contractResponse.json();
  if (!config) return reply(res, 200, { botConfigured: false, linked: false, invoiceDeliveryStatus: null });
  const link = (await pool.query('SELECT chat_id, verified_at FROM zalo_bot_resident_links WHERE bot_id = $1 AND tenant_id = $2', [config.bot_id, contract.tenantId])).rows[0];
  const registration = link ? (await pool.query(`SELECT delivery_status FROM zalo_bot_reply_outbox WHERE bot_id = $1 AND chat_id = $2
    AND created_at >= $3 ORDER BY created_at ASC LIMIT 1`, [config.bot_id, link.chat_id, link.verified_at])).rows[0] : null;
  const invoice = contract.invoiceId && link ? (await pool.query(`SELECT delivery_status, sent_at FROM zalo_bot_resident_outbox
    WHERE event_key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9) ORDER BY CASE event_key WHEN $1 THEN 0 WHEN $2 THEN 1 WHEN $3 THEN 2 WHEN $4 THEN 3 WHEN $5 THEN 4 WHEN $6 THEN 5 WHEN $7 THEN 6 WHEN $8 THEN 7 ELSE 8 END LIMIT 1`,
    [`invoice-payment-v9:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v8:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v7:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v6:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v5:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v4:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v3:${config.bot_id}:${contract.invoiceId}`, `invoice-payment-v2:${config.bot_id}:${contract.invoiceId}`, `invoice:${config.bot_id}:${contract.invoiceId}`])).rows[0] : null;
  return reply(res, 200, { botConfigured: true, linked: Boolean(link), verifiedAt: link?.verified_at || null,
    registrationDeliveryStatus: registration?.delivery_status || null, invoiceId: contract.invoiceId || null,
    invoiceDeliveryStatus: invoice?.delivery_status || null, invoiceSentAt: invoice?.sent_at || null,
    invoiceOutstandingVnd: contract.invoiceOutstandingVnd ?? null, invoiceStatus: contract.invoiceStatus || null });
}

function reply(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' });
  res.end(payload);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const contractStatusMatch = url.pathname.match(/^\/internal\/zalo-bot\/([a-zA-Z0-9-]{1,80})\/contracts\/([a-zA-Z0-9-]{1,80})\/status$/);
  if (contractStatusMatch) return adminContractStatus(req, res, contractStatusMatch[1], contractStatusMatch[2]);
  const adminMatch = url.pathname.match(/^\/internal\/zalo-bot\/([a-zA-Z0-9-]{1,80})$/);
  if (adminMatch) return adminConfig(req, res, adminMatch[1]);
  const webhookMatch = url.pathname.match(/^\/api\/v1\/zalo-bot\/webhook$/);
  if (webhookMatch) {
    if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' });
    const supplied = String(req.headers['x-bot-api-secret-token'] || '');
    const matching = supplied ? (await pool.query('SELECT bot_id FROM zalo_bot_configs WHERE webhook_secret_hash = $1 AND is_enabled = true', [digest(supplied)])).rows[0] : null;
    const config = matching ? await configuredBot(matching.bot_id) : null;
    if (!config || !validSecret(supplied, config.secret)) return reply(res, 401, { error: 'invalid_secret' });
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return reply(res, 415, { error: 'unsupported_media_type' });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) return reply(res, 413, { error: 'payload_too_large' });
      chunks.push(chunk);
    }
    let event;
    try { event = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return reply(res, 400, { error: 'invalid_json' }); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return reply(res, 400, { error: 'invalid_event' });
    try {
      const result = await receiveBotUpdate(pool, config.bot_id, event, config.org_id);
      setImmediate(() => (async () => {
        await sendPendingReplies(pool, config.token);
        await sendPendingResidentMessages(pool, config.token);
        await sendPendingAdminMessages(pool, config.token);
      })().catch(error => console.error('Zalo Bot outbox failed:', error.message)));
      return reply(res, 200, result);
    } catch (error) {
      console.error('Zalo Bot persistence failed:', error.code || error.message);
      return reply(res, 503, { error: 'storage_unavailable' });
    }
  }
  if (url.pathname === '/api/v1/public/rooms') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { error: 'method_not_allowed' });
    const orgId = url.searchParams.get('orgId') || 'org-adhome-anphu';
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(orgId)) return reply(res, 400, { error: 'invalid_org' });
    try {
      const result = await getPublicRooms(pool, orgId);
      if (!result) return reply(res, 404, { error: 'not_found' });
      if (req.method === 'HEAD') return res.writeHead(200, { 'cache-control': 'no-store' }).end();
      return reply(res, 200, result);
    } catch (error) {
      console.error('Public rooms failed:', error.code || error.message);
      return reply(res, 503, { error: 'storage_unavailable' });
    }
  }
  if (req.method === 'GET' && req.url === '/healthz') {
    try {
      await pool.query('SELECT 1');
      return reply(res, 200, { status: 'ok', database: 'ok', webhookConfigured: Boolean(secret) });
    } catch {
      return reply(res, 503, { status: 'unavailable' });
    }
  }
  if (req.method === 'GET' && req.url === '/api/v1/zalo/webhook') {
    return reply(res, 200, { status: 'ready', webhookConfigured: Boolean(secret) });
  }
  if (req.url !== '/api/v1/zalo/webhook') return reply(res, 404, { error: 'not_found' });
  if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) return reply(res, 413, { error: 'payload_too_large' });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  // Zalo probes the URL before exposing its OA secret. A probe has no event_name.
  // Never acknowledge or store an event until signature verification is active.
  if (!secret) {
    let probe;
    try { probe = raw ? JSON.parse(raw) : {}; } catch { probe = {}; }
    const testForOtherOa = String(probe?.app_id) === appId &&
      String(probe?.recipient?.id || probe?.oa_id) !== oaId &&
      Boolean(req.headers['x-zevent-signature']);
    return (!probe?.event_name || testForOtherOa)
      ? reply(res, 200, { status: 'ready' })
      : reply(res, 503, { error: 'webhook_not_configured' });
  }
  if (!appId || !oaId) return reply(res, 503, { error: 'webhook_not_configured' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return reply(res, 415, { error: 'unsupported_media_type' });
  let event;
  try { event = JSON.parse(raw); } catch { return reply(res, 400, { error: 'invalid_json' }); }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return reply(res, 400, { error: 'invalid_event' });
  if (String(event.app_id) !== appId) return reply(res, 403, { error: 'invalid_app' });
  const eventOa = event.oa_id || (event.event_name === 'user_send_text' ? event.recipient?.id : event.sender?.id);
  if (String(eventOa) !== oaId) return reply(res, 403, { error: 'invalid_oa' });
  const timestamp = String(event.timestamp || '');
  const timestampMs = Number(timestamp);
  if (!/^\d{12,13}$/.test(timestamp) || !Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 300000) {
    return reply(res, 403, { error: 'invalid_timestamp' });
  }
  const supplied = String(req.headers['x-zevent-signature'] || '').replace(/^mac=/i, '').toLowerCase();
  const expected = crypto.createHash('sha256').update(appId + raw + timestamp + secret).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) {
    return reply(res, 401, { error: 'invalid_signature' });
  }
  const eventKey = String(event.message?.msg_id || crypto.createHash('sha256').update(raw).digest('hex'));
  if (event.event_name === 'user_send_text' && !event.sender?.id) return reply(res, 400, { error: 'invalid_sender' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stored = await client.query(
        'INSERT INTO zalo_webhook_inbox (app_id, oa_id, event_key, event_name, sender_id, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (app_id, oa_id, event_key) DO NOTHING RETURNING id',
        [appId, oaId, eventKey, String(event.event_name || ''), String(event.sender?.id || ''), raw],
      );
      if (!stored.rowCount) {
        await client.query('COMMIT');
        return reply(res, 200, { status: 'duplicate' });
      }
      if (event.event_name === 'user_send_text') {
        const registration = await processRegistration(client, {
          inboxId: stored.rows[0].id,
          oaId,
          zaloUid: String(event.sender?.id || ''),
          text: event.message?.text,
        });
        if (registration) {
          await queueRegistrationReply(client, {
            inboxId: stored.rows[0].id,
            oaId,
            zaloUid: String(event.sender.id),
            status: registration,
          });
          await client.query('COMMIT');
          return reply(res, 200, { status: 'received', registration });
        }
      }
      await client.query('COMMIT');
      return reply(res, 200, { status: 'received' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Webhook persistence failed:', error.code || error.message);
    return reply(res, 503, { error: 'storage_unavailable' });
  }
}

const timer = setInterval(() => flushBotOutboxes().catch(error => console.error('Zalo Bot outbox failed:', error.message)), 30000);
timer.unref();

http.createServer((req, res) => {
  handle(req, res).catch(error => {
    console.error('Request failed:', error.code || error.message);
    if (!res.headersSent) reply(res, 500, { error: 'internal_error' });
  });
}).listen(port, '127.0.0.1', () => console.log(`AdHome webhook API listening on 127.0.0.1:${port}`));
