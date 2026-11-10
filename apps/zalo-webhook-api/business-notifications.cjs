const { defaults, renderTemplate } = require('./message-templates.cjs');
const money = value => Number(value || 0).toLocaleString('vi-VN');

async function queueBusinessNotifications(pool, config, fetchImpl = fetch) {
  const key = process.env.ZALO_BOT_ADMIN_API_KEY;
  if (!key) throw new Error('internal_lookup_unconfigured');
  const origin = process.env.ADHOME_CONSOLE_INTERNAL_ORIGIN || 'http://127.0.0.1:8082';
  const response = await fetchImpl(`${origin}/internal/zalo-bot/notification-candidates?orgId=${encodeURIComponent(config.org_id)}`, {
    headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`notification_lookup_failed_${response.status}`);
  const candidates = await response.json();
  const templates = { ...defaults, ...(config.message_templates || {}) };
  const links = await pool.query('SELECT tenant_id, chat_id FROM zalo_bot_resident_links WHERE bot_id = $1', [config.bot_id]);
  const chatByTenant = new Map(links.rows.map(row => [row.tenant_id, row.chat_id]));
  for (const row of candidates.invoices || []) {
    const chatId = chatByTenant.get(row.tenantId);
    if (!chatId) continue;
    const fields = { roomCode: row.roomCode, period: row.period, invoiceCode: row.invoiceCode,
      amount: money(row.amountVnd), dueDate: row.dueDate,
      electricAmount: money(row.electricVnd), waterAmount: money(row.waterVnd) };
    const events = [
      ['RENT_NOTICE', templates.RENT_NOTICE],
      ...(Number(row.electricVnd) || Number(row.waterVnd) ? [['METER_NOTICE', templates.METER_NOTICE]] : []),
    ];
    for (const [eventType, template] of events) await pool.query(
      `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_key) DO NOTHING`,
      [config.bot_id, chatId, row.tenantId, `${eventType.toLowerCase()}:${config.bot_id}:${row.id}`,
        eventType, renderTemplate(template, fields)],
    );
  }
  for (const row of candidates.expiring || []) {
    const chatId = chatByTenant.get(row.tenantId);
    if (!chatId) continue;
    await pool.query(
      `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message)
       VALUES ($1,$2,$3,$4,'CONTRACT_EXPIRING',$5) ON CONFLICT (event_key) DO NOTHING`,
      [config.bot_id, chatId, row.tenantId, `contract-expiring:${config.bot_id}:${row.id}:${row.endDate}`,
        renderTemplate(templates.CONTRACT_EXPIRING, { roomCode: row.roomCode, endDate: row.endDate })],
    );
  }
  return { invoices: candidates.invoices?.length || 0, expiring: candidates.expiring?.length || 0 };
}

module.exports = { queueBusinessNotifications };
