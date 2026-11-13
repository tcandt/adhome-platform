const crypto = require('node:crypto');
const { parseRegistration } = require('./registration.cjs');
const { defaults, renderTemplate } = require('./message-templates.cjs');

const API_BASE = 'https://bot-api.zaloplatforms.com';

function normalizeUpdate(body) {
  const message = body?.message || body?.data?.message || body?.event?.message;
  const chat = message?.chat || {};
  const chatId = String(chat.id ?? message?.chat_id ?? '').trim();
  const userId = String(message?.from?.id ?? message?.sender?.id ?? '').trim();
  const updateId = String(body?.update_id ?? body?.updateId ?? message?.message_id ?? message?.msg_id ?? '').trim();
  const rawType = String(chat.type || chat.chat_type || chat.chatType || '').toLowerCase();
  const chatType = rawType.includes('group') ? 'group' : rawType === 'private' || rawType === 'user' ? 'private' : 'unknown';
  return { chatId, userId, updateId, text: String(message?.text || '').trim(), chatType };
}

function validSecret(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function resultMessage(status) {
  switch (status) {
    case 'VERIFIED': return 'AdHome đã xác minh đăng ký nhận thông báo cho phòng của bạn.';
    case 'ALREADY_VERIFIED': return 'Tài khoản này đã đăng ký nhận thông báo cho hồ sơ cư dân đó.';
    case 'CONFLICT': return 'Hồ sơ này đã liên kết với tài khoản khác hoặc tài khoản này đã đăng ký hồ sơ khác. Vui lòng liên hệ AdHome.';
    case 'INVALID_FORMAT': return 'Cú pháp: DANGKY <mã phòng> <số điện thoại> [mã hợp đồng ghép].';
    case 'UNAVAILABLE': return 'Hệ thống tạm thời chưa thể xác minh. Vui lòng thử lại sau.';
    default: return 'AdHome chưa tìm thấy hồ sơ hợp lệ khớp thông tin đã cung cấp. Vui lòng kiểm tra lại hoặc liên hệ quản lý.';
  }
}

async function lookupContract(orgId, input) {
  const key = process.env.ZALO_BOT_ADMIN_API_KEY;
  if (!key) throw new Error('internal_lookup_unconfigured');
  const response = await fetch(`${process.env.ADHOME_CONSOLE_INTERNAL_ORIGIN || 'http://127.0.0.1:8082'}/internal/zalo-bot/registration-lookup`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orgId, ...input }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`internal_lookup_failed_${response.status}`);
  return response.json();
}

async function tenantExists(orgId, tenantId) {
  const key = process.env.ZALO_BOT_ADMIN_API_KEY;
  if (!key) throw new Error('internal_lookup_unconfigured');
  const response = await fetch(`${process.env.ADHOME_CONSOLE_INTERNAL_ORIGIN || 'http://127.0.0.1:8082'}/internal/zalo-bot/tenant-exists`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orgId, tenantId }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`internal_tenant_lookup_failed_${response.status}`);
  return Boolean((await response.json()).exists);
}

async function register(client, botId, orgId, update, inboxId, lookup, exists) {
  const input = parseRegistration(update.text);
  let status = input ? 'UNAVAILABLE' : 'INVALID_FORMAT';
  let tenantId = null;
  let roomCode = null;
  let invoice = null;
  if (input) {
    const match = await lookup(orgId, input);
    status = match.status;
    if (status === 'MATCHED') {
      tenantId = match.tenantId;
      roomCode = match.roomCode;
      invoice = match.invoice;
      const linked = await client.query(
        'SELECT id, tenant_id, chat_id, user_id FROM zalo_bot_resident_links WHERE bot_id = $1 AND (chat_id = $2 OR tenant_id = $3 OR user_id = $4) FOR UPDATE',
        [botId, update.chatId, tenantId, update.userId],
      );
      const exact = linked.rows.some(row => row.chat_id === update.chatId && row.tenant_id === tenantId);
      if (exact) status = 'ALREADY_VERIFIED';
      else {
        const conflicts = [];
        for (const row of linked.rows) {
          if (await exists(orgId, row.tenant_id)) conflicts.push(row);
          else await client.query('DELETE FROM zalo_bot_resident_links WHERE id = $1 AND bot_id = $2', [row.id, botId]);
        }
        if (conflicts.length) status = 'CONFLICT';
        else {
          const inserted = await client.query(
            'INSERT INTO zalo_bot_resident_links (bot_id, chat_id, user_id, tenant_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
            [botId, update.chatId, update.userId, tenantId],
          );
          status = inserted.rowCount ? 'VERIFIED' : 'CONFLICT';
        }
      }
    }
  }
  const config = await client.query('SELECT message_templates FROM zalo_bot_configs WHERE bot_id = $1', [botId]);
  const templates = { ...defaults, ...(config.rows[0]?.message_templates || {}) };
  await client.query(
    'INSERT INTO zalo_bot_registration_attempts (inbox_id, status, tenant_id) VALUES ($1,$2,$3)',
    [inboxId, status, tenantId],
  );
  await client.query(
    'INSERT INTO zalo_bot_reply_outbox (inbox_id, bot_id, chat_id, message) VALUES ($1,$2,$3,$4)',
    [inboxId, botId, update.chatId, status === 'VERIFIED' ? renderTemplate(templates.REGISTRATION_SUCCESS, { roomCode }) : resultMessage(status)],
  );
  if (tenantId && ['VERIFIED', 'ALREADY_VERIFIED'].includes(status)) {
    const row = invoice;
    if (row) await client.query(
      `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message, media_url, media_caption)
       VALUES ($1,$2,$3,$4,'INVOICE_ISSUED',$5,$6,$7) ON CONFLICT (event_key) DO NOTHING`,
      [botId, update.chatId, tenantId, `invoice-payment-v9:${botId}:${row.id}`,
        renderTemplate(templates.INVOICE_ISSUED, { roomCode, invoiceCode: row.invoiceCode,
          amount: Number(row.amountVnd).toLocaleString('vi-VN'), dueDate: row.dueDate }),
        row.qrUrl || null,
        row.qrUrl ? [`Hóa đơn cho: ${roomCode} · ${row.tenantName}`,
          ...(row.items || []).map(item => `- ${item.label}: ${Number(item.amountVnd).toLocaleString('vi-VN')}đ`),
          `Tổng thanh toán: ${Number(row.amountVnd).toLocaleString('vi-VN')}đ`, '',
          `${row.accountNumber} / ${row.bank}`, row.accountName, `Nội dung: ${row.transferContent}`].join('\n') : null],
    );
  }
  return status;
}

async function receiveBotUpdate(pool, botId, body, orgId, lookup = lookupContract, exists = tenantExists) {
  const update = normalizeUpdate(body);
  if (!update.updateId || !update.chatId || !update.userId || body?.event_name !== 'message.text.received') return { status: 'ignored' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO zalo_bot_inbox (bot_id, update_id, chat_id, user_id, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (bot_id, update_id) DO NOTHING RETURNING id`,
      [botId, update.updateId, update.chatId, update.userId, JSON.stringify(body)],
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { status: 'duplicate' };
    }
    let registration = null;
    let authorizedGroup = false;
    if (update.chatType === 'group') {
      await client.query(
        `INSERT INTO zalo_bot_group_candidates (bot_id, chat_id, last_sender_id) VALUES ($1,$2,$3)
         ON CONFLICT (bot_id, chat_id) DO UPDATE SET last_sender_id = EXCLUDED.last_sender_id, last_seen_at = now()`,
        [botId, update.chatId, update.userId],
      );
      const requestedCode = update.text.match(/(?:^|\s)\/setadmin(?:@\S+)?\s+(\S+)\s*$/i)?.[1];
      let authorized = false;
      if (requestedCode) {
        const config = await client.query('SELECT setup_code_hash, setup_expires_at FROM zalo_bot_configs WHERE bot_id = $1 AND is_enabled = true', [botId]);
        const saved = config.rows[0];
        const expected = saved?.setup_code_hash || '';
        const actual = crypto.createHash('sha256').update(requestedCode).digest('hex');
        authorized = Boolean(saved?.setup_expires_at && new Date(saved.setup_expires_at).getTime() > Date.now() && validSecret(actual, expected));
      }
      if (authorized) {
        authorizedGroup = true;
        await client.query(
          `INSERT INTO zalo_bot_admin_groups (bot_id, chat_id, connected_by) VALUES ($1,$2,$3)
           ON CONFLICT (bot_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, connected_by = EXCLUDED.connected_by, connected_at = now()`,
          [botId, update.chatId, update.userId],
        );
        await client.query(
          `INSERT INTO zalo_bot_admin_outbox (bot_id, chat_id, event_key, event_type, message)
           VALUES ($1,$2,$3,'GROUP_CONNECTED',$4) ON CONFLICT (event_key) DO NOTHING`,
          [botId, update.chatId, `group-connected:${botId}:${update.updateId}`, 'AdHome đã kết nối nhóm quản trị này để nhận thông báo.'],
        );
        await client.query('UPDATE zalo_bot_configs SET setup_code_hash = NULL, setup_expires_at = NULL WHERE bot_id = $1', [botId]);
      }
    } else if (update.chatType === 'private' && /^DANGKY(?:\s|$)/i.test(update.text)) {
      registration = await register(client, botId, orgId, update, inserted.rows[0].id, lookup, exists);
    }
    await client.query('COMMIT');
    return { status: 'received', ...(registration ? { registration } : {}), ...(authorizedGroup ? { groupConnected: true } : {}) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function botApi(token, method, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok || body?.ok === false || body?.success === false || body?.error_code) {
    throw new Error(`Zalo Bot ${method} failed (${response.status})`);
  }
  return body;
}

let sending = false;
async function sendPendingReplies(pool, token, fetchImpl = fetch) {
  if (!token) return 0;
  if (sending) return 0;
  sending = true;
  try {
  const pending = await pool.query(
    `SELECT id, chat_id, message FROM zalo_bot_reply_outbox
     WHERE delivery_status = 'PENDING' AND bot_id = $1 ORDER BY id LIMIT 10`,
    [token.split(':')[0]],
  );
  let sent = 0;
  for (const row of pending.rows) {
    try {
      const result = await botApi(token, 'sendMessage', { chat_id: row.chat_id, text: row.message }, fetchImpl);
      await pool.query(
        `UPDATE zalo_bot_reply_outbox SET delivery_status = 'SENT', sent_at = now(), provider_message_id = $2
         WHERE id = $1 AND delivery_status = 'PENDING'`,
        [row.id, String(result?.result?.message_id || '')],
      );
      sent++;
    } catch (error) {
      console.error('Zalo Bot reply failed:', error.message);
      break;
    }
  }
  return sent;
  } finally {
    sending = false;
  }
}

async function sendPendingAdminMessages(pool, token, fetchImpl = fetch) {
  if (!token) return 0;
  const pending = await pool.query(
    `SELECT id, chat_id, message FROM zalo_bot_admin_outbox
     WHERE delivery_status = 'PENDING' AND bot_id = $1 ORDER BY id LIMIT 10`,
    [token.split(':')[0]],
  );
  let sent = 0;
  for (const row of pending.rows) {
    try {
      const result = await botApi(token, 'sendMessage', { chat_id: row.chat_id, text: row.message }, fetchImpl);
      await pool.query(
        `UPDATE zalo_bot_admin_outbox SET delivery_status = 'SENT', sent_at = now(), provider_message_id = $2
         WHERE id = $1 AND delivery_status = 'PENDING'`,
        [row.id, String(result?.result?.message_id || '')],
      );
      sent++;
    } catch (error) {
      console.error('Zalo Bot admin message failed:', error.message);
      break;
    }
  }
  return sent;
}

const sendingResidents = new Set();
async function sendPendingResidentMessages(pool, token, fetchImpl = fetch) {
  if (!token) return 0;
  const botId = token.split(':')[0];
  if (sendingResidents.has(botId)) return 0;
  sendingResidents.add(botId);
  try {
  const pending = await pool.query(`SELECT id, chat_id, message, media_url, media_caption FROM zalo_bot_resident_outbox
    WHERE delivery_status = 'PENDING' AND bot_id = $1 ORDER BY id LIMIT 10`, [token.split(':')[0]]);
  let sent = 0;
  for (const row of pending.rows) {
    try {
      const result = row.media_url
        ? await botApi(token, 'sendPhoto', { chat_id: row.chat_id, photo: row.media_url, caption: row.media_caption || row.message }, fetchImpl)
        : await botApi(token, 'sendMessage', { chat_id: row.chat_id, text: row.message }, fetchImpl);
      await pool.query(`UPDATE zalo_bot_resident_outbox SET delivery_status = 'SENT', sent_at = now(), provider_message_id = $2
        WHERE id = $1 AND delivery_status = 'PENDING'`, [row.id, String(result?.result?.message_id || '')]);
      sent++;
    } catch (error) { console.error('Zalo Bot resident message failed:', error.message); break; }
  }
  return sent;
  } finally { sendingResidents.delete(botId); }
}

module.exports = { normalizeUpdate, validSecret, receiveBotUpdate, sendPendingReplies, sendPendingAdminMessages, sendPendingResidentMessages, botApi };
