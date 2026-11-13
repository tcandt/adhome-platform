const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUpdate, validSecret, receiveBotUpdate, sendPendingReplies, sendPendingResidentMessages } = require('./zalo-bot.cjs');
const { queueBusinessNotifications } = require('./business-notifications.cjs');
const { parseRegistration } = require('./registration.cjs');

test('shared registration keeps its individual contract code', () => {
  assert.deepEqual(parseRegistration('DANGKY P24.01 0567867889 GHEP-02'), {
    roomCode: 'P24.01', phone: '0567867889', contractCode: 'GHEP-02',
  });
  assert.deepEqual(parseRegistration('DANGKY P24.01 0567867889'), {
    roomCode: 'P24.01', phone: '0567867889',
  });
});

test('accepts a private text update and rejects group messages', () => {
  assert.deepEqual(normalizeUpdate({ event_name: 'message.text.received', message: { message_id: 'm1', chat: { id: 2, chat_type: 'PRIVATE' }, from: { id: 3 }, text: 'DANGKY P24.01 0567867889' } }), {
    chatId: '2', userId: '3', updateId: 'm1', text: 'DANGKY P24.01 0567867889', chatType: 'private',
  });
  assert.equal(validSecret('same', 'same'), true);
  assert.equal(validSecret('other', 'same'), false);
});

test('stores one registration attempt using the authoritative lookup', async () => {
  const calls = [];
  let inboxStored = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO zalo_bot_inbox')) {
        if (inboxStored) return { rowCount: 0, rows: [] };
        inboxStored = true;
        return { rowCount: 1, rows: [{ id: 7 }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const event = { event_name: 'message.text.received', message: { message_id: 'm1', chat: { id: 2, chat_type: 'PRIVATE' }, from: { id: 3 }, text: 'DANGKY P24.01 0567867889' } };
  const lookup = async (orgId, input) => { assert.equal(orgId, 'org-one'); assert.deepEqual(input, { roomCode: 'P24.01', phone: '0567867889' }); return { status: 'NO_MATCH' }; };
  assert.deepEqual(await receiveBotUpdate(pool, 'bot', event, 'org-one', lookup), { status: 'received', registration: 'NO_MATCH' });
  assert.deepEqual(await receiveBotUpdate(pool, 'bot', event, 'org-one', lookup), { status: 'duplicate' });
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_resident_links')).length, 0);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_reply_outbox')).length, 1);
});

test('verified draft registration queues one initial invoice and sends only after provider success', async () => {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO zalo_bot_inbox')) return { rowCount: 1, rows: [{ id: 11 }] };
    if (sql.includes('SELECT id, tenant_id, chat_id')) return { rowCount: 0, rows: [] };
    if (sql.includes('INSERT INTO zalo_bot_resident_links')) return { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('SELECT message_templates')) return { rowCount: 1, rows: [{ message_templates: {} }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const pool = { async connect() { return client; } };
  const event = { event_name: 'message.text.received', message: { message_id: 'm2', chat: { id: 22, chat_type: 'PRIVATE' }, from: { id: 33 }, text: 'DANGKY P24.01 0567867889' } };
  const lookup = async () => ({ status: 'MATCHED', tenantId: 'tenant-1', roomCode: 'P24.01', invoice: { id: 'invoice-1', invoiceCode: 'INV-1', tenantName: 'NGUYEN DUC TINH', amountVnd: 1000000, dueDate: '2026-11-10', items: [{ label: 'Tiền phòng tháng 11/2026', amountVnd: 1000000 }], accountNumber: '96247LK31', bank: 'BIDV', accountName: 'HO KINH DOANH NGUYEN DUC TINH', paymentProviderId: 'SEPAY', transferContent: 'P24.01NGUYENDUCTINH11-2026', qrUrl: 'https://vietqr.app/img?bank=BIDV&acc=96247LK31&template=compact&amount=1000000&des=P24.01NGUYENDUCTINH11-2026' } });
  assert.equal((await receiveBotUpdate(pool, 'bot', event, 'org-one', lookup)).registration, 'VERIFIED');
  const invoiceInsert = calls.find(call => call.sql.includes('INSERT INTO zalo_bot_resident_outbox'));
  assert.ok(invoiceInsert);
  assert.match(invoiceInsert.params[5], /^https:\/\/vietqr\.app\/img/);
  assert.match(invoiceInsert.params[6], /Hóa đơn cho: P24\.01 · NGUYEN DUC TINH[\s\S]*Tiền phòng tháng 11\/2026: 1\.000\.000đ[\s\S]*96247LK31 \/ BIDV[\s\S]*HO KINH DOANH NGUYEN DUC TINH[\s\S]*Nội dung: P24\.01NGUYENDUCTINH11-2026/);
  const outbox = { async query(sql, params) {
    if (sql.includes('SELECT id, chat_id')) return { rows: [{ id: 1, chat_id: '22', message: 'Hóa đơn', media_url: 'https://vietqr.app/qr.png', media_caption: 'BIDV · 96247LK31\nNội dung: INV-1' }] };
    calls.push({ sql, params }); return { rowCount: 1 };
  } };
  const rejected = async () => ({ ok: false, status: 500, async json() { return { ok: false }; } });
  assert.equal(await sendPendingResidentMessages(outbox, 'bot:token', rejected), 0);
  assert.equal(calls.filter(call => call.sql.includes("delivery_status = 'SENT'")).length, 0);
  const accepted = async (url, options) => { assert.match(url, /sendPhoto$/); const body = JSON.parse(options.body); assert.equal(body.photo, 'https://vietqr.app/qr.png'); assert.equal(body.caption, 'BIDV · 96247LK31\nNội dung: INV-1'); return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 9 } }; } }; };
  assert.equal(await sendPendingResidentMessages(outbox, 'bot:token', accepted), 1);
});

function registrationHarness(linkedRows) {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO zalo_bot_inbox')) return { rowCount: 1, rows: [{ id: 21 }] };
    if (sql.includes('SELECT id, tenant_id, chat_id')) return { rowCount: linkedRows.length, rows: linkedRows };
    if (sql.includes('INSERT INTO zalo_bot_resident_links')) return { rowCount: 1, rows: [{ id: 22 }] };
    if (sql.includes('SELECT message_templates')) return { rowCount: 1, rows: [{ message_templates: {} }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  return { calls, pool: { async connect() { return client; } } };
}

const registrationEvent = messageId => ({
  event_name: 'message.text.received',
  message: { message_id: messageId, chat: { id: 22, chat_type: 'PRIVATE' }, from: { id: 33 }, text: 'DANGKY P24.01 0567867889' },
});
const matchedTenant = async () => ({ status: 'MATCHED', tenantId: 'tenant-new', roomCode: 'P24.01', invoice: null });

test('removes an orphaned resident link before registering the replacement tenant', async () => {
  const { calls, pool } = registrationHarness([{ id: 9, tenant_id: 'tenant-deleted', chat_id: '22', user_id: '33' }]);
  const exists = async (orgId, tenantId) => { assert.equal(orgId, 'org-one'); assert.equal(tenantId, 'tenant-deleted'); return false; };
  const result = await receiveBotUpdate(pool, 'bot', registrationEvent('orphan-link'), 'org-one', matchedTenant, exists);
  assert.equal(result.registration, 'VERIFIED');
  assert.deepEqual(calls.find(call => call.sql.includes('DELETE FROM zalo_bot_resident_links')).params, [9, 'bot']);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_resident_links')).length, 1);
});

test('keeps a resident link whose tenant still exists and reports a conflict', async () => {
  const { calls, pool } = registrationHarness([{ id: 10, tenant_id: 'tenant-active', chat_id: '22', user_id: '33' }]);
  const result = await receiveBotUpdate(pool, 'bot', registrationEvent('active-link'), 'org-one', matchedTenant, async () => true);
  assert.equal(result.registration, 'CONFLICT');
  assert.equal(calls.filter(call => call.sql.includes('DELETE FROM zalo_bot_resident_links')).length, 0);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_resident_links')).length, 0);
});

test('accepts an exact resident link without checking or deleting other links', async () => {
  const { calls, pool } = registrationHarness([
    { id: 11, tenant_id: 'tenant-new', chat_id: '22', user_id: '33' },
    { id: 12, tenant_id: 'tenant-other', chat_id: 'other-chat', user_id: '33' },
  ]);
  let existenceChecks = 0;
  const result = await receiveBotUpdate(pool, 'bot', registrationEvent('exact-link'), 'org-one', matchedTenant, async () => { existenceChecks += 1; return false; });
  assert.equal(result.registration, 'ALREADY_VERIFIED');
  assert.equal(existenceChecks, 0);
  assert.equal(calls.filter(call => call.sql.includes('DELETE FROM zalo_bot_resident_links')).length, 0);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_resident_links')).length, 0);
});

test('business reminders are queued from issued invoices and expiring contracts', async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('SELECT tenant_id, chat_id')) return { rows: [{ tenant_id: 'tenant1', chat_id: 'chat1' }] };
    return { rowCount: 1 };
  } };
  const previous = process.env.ZALO_BOT_ADMIN_API_KEY;
  process.env.ZALO_BOT_ADMIN_API_KEY = 'test-key';
  try { await queueBusinessNotifications(pool, { bot_id: 'bot', org_id: 'org', message_templates: {} }, async () => ({ ok: true, async json() { return {
    invoices: [{ id: 'i1', invoiceCode: 'INV-1', period: '2026-11', dueDate: '2026-11-10', amountVnd: 1000000, electricVnd: 200000, waterVnd: 50000, roomCode: 'P1', tenantId: 'tenant1' }],
    expiring: [{ id: 'c1', endDate: '2026-11-20', roomCode: 'P1', tenantId: 'tenant1' }],
  }; } })); } finally { if (previous === undefined) delete process.env.ZALO_BOT_ADMIN_API_KEY; else process.env.ZALO_BOT_ADMIN_API_KEY = previous; }
  const queued = calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_resident_outbox'));
  assert.equal(queued.length, 3);
  assert.deepEqual(queued.slice(0, 2).map(call => call.params[4]), ['RENT_NOTICE', 'METER_NOTICE']);
  assert.match(queued[1].params[5], /điện 200\.000đ, nước 50\.000đ/);
});

test('marks a reply sent only after provider success', async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('SELECT id, chat_id')) return { rows: [{ id: 1, chat_id: '1234567890123', message: 'Test' }] };
    return { rowCount: 1 };
  } };
  const fetchImpl = async (_url, request) => {
    assert.deepEqual(JSON.parse(request.body), { chat_id: '1234567890123', text: 'Test' });
    return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 9 } }; } };
  };
  assert.equal(await sendPendingReplies(pool, 'fake-token', fetchImpl), 1);
  assert.deepEqual(calls.at(-1).params, [1, '9']);
});

test('captures group id but binds only with the setup code', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO zalo_bot_inbox')) return { rowCount: 1, rows: [{ id: 8 }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const event = { event_name: 'message.text.received', message: { message_id: 'g1', chat: { id: 77, chat_type: 'GROUP' }, from: { id: 3 }, text: '/setadmin wrong' } };
  await receiveBotUpdate(pool, 'bot', event);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_group_candidates')).length, 1);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_admin_groups')).length, 0);
  event.message.message_id = 'g2';
  event.message.text = '@Bot AdHome /setadmin right';
  client.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO zalo_bot_inbox')) return { rowCount: 1, rows: [{ id: 8 }] };
    if (sql.includes('SELECT setup_code_hash')) return { rowCount: 1, rows: [{ setup_code_hash: require('node:crypto').createHash('sha256').update('right').digest('hex'), setup_expires_at: new Date(Date.now() + 60000) }] };
    return { rowCount: 1, rows: [] };
  };
  const result = await receiveBotUpdate(pool, 'bot', event);
  assert.equal(result.groupConnected, true);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO zalo_bot_admin_groups')).length, 1);
});
