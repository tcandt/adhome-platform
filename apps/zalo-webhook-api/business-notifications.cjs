const { defaults, renderTemplate } = require('./message-templates.cjs');
const money = value => Number(value || 0).toLocaleString('vi-VN');
const formatDate = value => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value || '—');
};

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
  const chatsByTenant = new Map();
  for (const row of links.rows) {
    if (!chatsByTenant.has(row.tenant_id)) chatsByTenant.set(row.tenant_id, []);
    chatsByTenant.get(row.tenant_id).push(row.chat_id);
  }
  for (const row of candidates.invoices || []) {
    const chatIds = chatsByTenant.get(row.tenantId) || [];
    if (!chatIds.length) continue;
    const fields = { roomCode: row.roomCode, period: row.period, invoiceCode: row.invoiceCode,
      amount: money(row.amountVnd), dueDate: formatDate(row.dueDate),
      electricAmount: money(row.electricVnd), waterAmount: money(row.waterVnd) };
    const events = [
      ['RENT_NOTICE', templates.RENT_NOTICE],
      ...(Number(row.electricVnd) || Number(row.waterVnd) ? [['METER_NOTICE', templates.METER_NOTICE]] : []),
    ];
    for (const [eventType, template] of events) {
      for (const chatId of chatIds) {
        await pool.query(
          `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_key) DO NOTHING`,
          [config.bot_id, chatId, row.tenantId, `${eventType.toLowerCase()}:${config.bot_id}:${row.id}:${chatId}`,
            eventType, renderTemplate(template, fields)],
        );
      }
    }
  }
  for (const row of candidates.expiring || []) {
    const chatIds = chatsByTenant.get(row.tenantId) || [];
    for (const chatId of chatIds) {
      await pool.query(
        `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message)
         VALUES ($1,$2,$3,$4,'CONTRACT_EXPIRING',$5) ON CONFLICT (event_key) DO NOTHING`,
        [config.bot_id, chatId, row.tenantId, `contract-expiring:${config.bot_id}:${row.id}:${row.endDate}:${chatId}`,
          renderTemplate(templates.CONTRACT_EXPIRING, { roomCode: row.roomCode, endDate: formatDate(row.endDate) })],
      );
    }
  }
  const adminGroup = (await pool.query('SELECT chat_id FROM zalo_bot_admin_groups WHERE bot_id = $1', [config.bot_id]))?.rows?.[0];
  for (const pt of candidates.payments || []) {
    const isFull = pt.invoiceStatus === 'PAID';
    const statusText = isFull ? 'Đã hoàn tất thanh toán (100%)' : `Thanh toán 1 phần (còn lại: ${money(pt.remainingVnd)}đ)`;
    const channelLabel = pt.providerId === 'SEPAY' ? 'SePay (Chuyển khoản QR)' : 'Tiền mặt tại quầy';

    const residentChatIds = chatsByTenant.get(pt.tenantId) || [];
    for (const residentChatId of residentChatIds) {
      const residentMsg = `✅ AdHome xác nhận thanh toán thành công!\n• Phòng: ${pt.roomCode}\n• Hóa đơn: ${pt.invoiceCode}\n• Số tiền vừa nộp: +${money(pt.amountVnd)}đ\n• Kênh: ${channelLabel}\n• Trạng thái: ${statusText}\nCảm ơn bạn!`;
      await pool.query(
        `INSERT INTO zalo_bot_resident_outbox (bot_id, chat_id, tenant_id, event_key, event_type, message)
         VALUES ($1,$2,$3,$4,'PAYMENT_CONFIRMED',$5) ON CONFLICT (event_key) DO NOTHING`,
        [config.bot_id, residentChatId, pt.tenantId, `payment-confirmed:${config.bot_id}:${pt.id}:${residentChatId}`, residentMsg],
      );
    }

    if (adminGroup?.chat_id) {
      const pid = String(pt.providerId || '').toUpperCase();
      const isCash = pid.includes('CASH') || pid.includes('MANUAL') || pid === 'TIEN_MAT';
      const isElectronic = !isCash;
      const headerIcon = isCash ? '💵' : '💰';
      const providerTag = isCash ? 'TIỀN MẶT' : (pid || 'SEPAY');

      let buildingPrefix = String(pt.buildingName || '').trim();
      if (buildingPrefix && !/^(?:tòa|toà)\s+/i.test(buildingPrefix)) {
        buildingPrefix = `Tòa ${buildingPrefix}`;
      }
      const roomLine = pt.roomCode
        ? (buildingPrefix ? `- ${buildingPrefix} · Phòng ${pt.roomCode}` : `- Phòng ${pt.roomCode}`)
        : (buildingPrefix ? `- ${buildingPrefix} · Phòng: Chưa xác định` : `- Phòng: Chưa xác định`);

      const payerLine = `- Khách nộp: ${pt.payerName || 'Chưa xác định'}`;

      const contentLine = pt.referenceText
        ? `- Nội dung CK: ${pt.referenceText}`
        : (isElectronic ? `- Nội dung CK: (Trống)` : null);

      let invoiceLine = '';
      if (!pt.invoiceCode) {
        invoiceLine = `- Khớp hóa đơn: Chưa khớp hóa đơn (Cần kiểm tra)`;
      } else if (isFull) {
        const fullTag = isCash ? '(Đã thu đủ 100%)' : '(100% PAID)';
        invoiceLine = `- Hóa đơn hoàn tất: ${pt.invoiceCode} ${fullTag}`;
      } else {
        invoiceLine = `- Khớp hóa đơn: ${pt.invoiceCode} (Thanh toán 1 phần)\n- Số dư còn thiếu: ${money(pt.remainingVnd)}đ`;
      }

      const adminMsg = [
        `${headerIcon} [${providerTag}] +${money(pt.amountVnd)}đ`,
        roomLine,
        payerLine,
        contentLine,
        invoiceLine,
      ].filter(Boolean).join('\n');

      await pool.query(
        `INSERT INTO zalo_bot_admin_outbox (bot_id, chat_id, event_key, event_type, message)
         VALUES ($1,$2,$3,'ADMIN_PAYMENT_ALERT',$4) ON CONFLICT (event_key) DO NOTHING`,
        [config.bot_id, adminGroup.chat_id, `admin-payment:${config.bot_id}:${pt.id}`, adminMsg],
      );
    }
  }
  return { invoices: candidates.invoices?.length || 0, expiring: candidates.expiring?.length || 0, payments: candidates.payments?.length || 0 };
}

module.exports = { queueBusinessNotifications };
