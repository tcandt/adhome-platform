import http from 'node:http';
import crypto from 'node:crypto';
import { assertSecurityConfiguration } from './authRbac';
import { createApiAndDynamicSeoMiddleware, ensurePostgreSqlSeeded, getPrismaClient } from './publicApiPlugin';
import { pruneConsoleAuditHistory } from './auditRetention';
import { executeHunonicBackgroundSync } from './hunonicSyncWorker';
import { decryptSecret } from './cryptoVault';
import { formatTransferContent, DEFAULT_TRANSFER_SYNTAX } from './transferContentFormatter';
import { buildSettlementWorkspacePayload, syncLegacyInvoicesForPeriod } from './settlementCenterApi';
export { buildSettlementWorkspacePayload, syncLegacyInvoicesForPeriod };

const host = process.env.ADHOME_API_HOST || '127.0.0.1';
const port = Number(process.env.ADHOME_API_PORT || 8082);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ADHOME_API_PORT');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

assertSecurityConfiguration();
await ensurePostgreSqlSeeded();
const middleware = createApiAndDynamicSeoMiddleware({ isDev: false });
const internalKey = process.env.ADHOME_ZALO_BOT_ADMIN_API_KEY || '';
function toAsciiAccountName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function buildRoomCodeCandidates(input: string): string[] {
  const clean = (input || '').trim().toUpperCase();
  const set = new Set<string>();
  if (!clean) return [];
  set.add(clean);
  const stripped = clean.replace(/^(?:LK|TOA|TÒA|P)[-.\s]*/i, '');
  if (stripped) {
    set.add(stripped);
    set.add(`P${stripped}`);
    set.add(`LK${stripped}`);
  }

  const target = stripped || clean;
  // e.g. 25.01, 25-01, P25-01, 25.1, P25.1, 25_01
  const sepMatch = target.match(/^(\d+)[-._](\d+)$/);
  if (sepMatch) {
    const bld = sepMatch[1];
    const roomNum = parseInt(sepMatch[2], 10);
    const roomPad = roomNum < 10 ? `0${roomNum}` : `${roomNum}`;
    set.add(`P${bld}-${roomPad}`);
    set.add(`P${bld}.${roomPad}`);
    set.add(`P${bld}-${roomNum}`);
    set.add(`P${bld}.${roomNum}`);
    set.add(`LK${bld}-${roomPad}`);
    set.add(`LK${bld}.${roomPad}`);
    set.add(`LK${bld}${roomPad}`);
    set.add(`${bld}-${roomPad}`);
    set.add(`${bld}.${roomPad}`);
    set.add(`${bld}${roomPad}`);
    set.add(`${bld}-${roomNum}`);
  }

  // e.g. 2501 (4 digits) or 251 (3 digits)
  const numMatch = target.match(/^(\d{3,4})$/);
  if (numMatch) {
    const digits = numMatch[1];
    const bld = digits.slice(0, 2);
    const roomNum = parseInt(digits.slice(2), 10);
    if (bld) {
      const roomPad = roomNum < 10 ? `0${roomNum}` : `${roomNum}`;
      set.add(`P${bld}-${roomPad}`);
      set.add(`P${bld}.${roomPad}`);
      set.add(`P${bld}-${roomNum}`);
      set.add(`P${bld}.${roomNum}`);
      set.add(`LK${bld}-${roomPad}`);
      set.add(`LK${bld}.${roomPad}`);
      set.add(`LK${bld}${roomPad}`);
      set.add(`${bld}-${roomPad}`);
      set.add(`${bld}.${roomPad}`);
      set.add(`${bld}${roomPad}`);
      set.add(`${bld}-${roomNum}`);
    }
  }

  return Array.from(set);
}

const fallbackPaymentAccount = {
  bank: process.env.ADHOME_PAYMENT_FALLBACK_BANK?.trim() || 'BIDV',
  accountNumber: process.env.ADHOME_PAYMENT_FALLBACK_ACCOUNT?.trim() || '96247LK31',
  accountName: toAsciiAccountName(process.env.ADHOME_PAYMENT_FALLBACK_HOLDER?.trim() || 'HKD NGUYEN DUC TINH'),
  providerId: process.env.ADHOME_PAYMENT_FALLBACK_PROVIDER?.trim().toUpperCase() || 'SEPAY',
};
const authorized = (value: string) => {
  const supplied = Buffer.from(value.replace(/^Bearer /, ''));
  const expected = Buffer.from(internalKey);
  return expected.length > 0 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
async function internalBotApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/internal/zalo-bot/')) return false;
  if (!authorized(String(req.headers.authorization || ''))) { json(res, 401, { error: 'unauthorized' }); return true; }
  const prisma = getPrismaClient();
  const contractMatch = url.pathname.match(/^\/internal\/zalo-bot\/contracts\/([A-Za-z0-9-]{1,80})\/([A-Za-z0-9-]{1,80})$/);
  if (contractMatch && req.method === 'GET') {
    const contract = await prisma.contract.findFirst({ where: { id: contractMatch[2], orgId: contractMatch[1] },
      include: { invoices: { where: { status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' } } } });
    if (!contract) json(res, 404, { error: 'contract_not_found' });
    else {
      const invoice = contract.status === 'DRAFT'
        ? contract.invoices.find(i => (i.policySnapshot as any)?.type === 'FIRST_COMBINED_INVOICE')
        : contract.invoices[0];
      json(res, 200, { tenantId: contract.tenantId, invoiceId: invoice?.id || null,
        invoiceOutstandingVnd: invoice ? Number(invoice.totalAmountVnd - invoice.paidAmountVnd) : null,
        invoiceStatus: invoice?.status || null });
    }
    return true;
  }
  if (url.pathname === '/internal/zalo-bot/registration-lookup' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { json(res, 413, { error: 'too_large' }); return true; } }
    let body: any;
    try { body = JSON.parse(raw); } catch { json(res, 400, { error: 'invalid_json' }); return true; }
    const orgId = String(body.orgId || '');
    const roomCode = String(body.roomCode || '');
    const rawPhones: string[] = Array.isArray(body.phones) && body.phones.length
      ? body.phones
      : [body.phone];
    const validPhones = Array.from(new Set(rawPhones.map(p => String(p || '').trim()))).filter(p => /^0\d{9}$/.test(p));
    const contractCode = String(body.contractCode || '');
    if (!/^[A-Za-z0-9-]{1,80}$/.test(orgId) || !roomCode || roomCode.length > 64 || !validPhones.length) { json(res, 400, { error: 'invalid_query' }); return true; }
    const searchPhones = new Set<string>();
    for (const p of validPhones) {
      searchPhones.add(p);
      searchPhones.add(`+84${p.slice(1)}`);
      searchPhones.add(`84${p.slice(1)}`);
    }
    const searchPhoneList = Array.from(searchPhones);

    const roomCandidates = buildRoomCodeCandidates(roomCode);
    const contracts = await prisma.contract.findMany({
      where: {
        orgId,
        room: {
          code: { in: roomCandidates, mode: 'insensitive' },
        },
        OR: [
          { tenant: { normalizedPhone: { in: validPhones }, isActive: true } },
          { occupants: { some: { phone: { in: searchPhoneList }, isActive: true } } },
        ],
        ...(contractCode ? { contractCode: { equals: contractCode, mode: 'insensitive' } } : {}),
        status: { in: ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXTENDED'] },
      },
      include: {
        tenant: true,
        room: { include: { building: true } },
        invoices: { where: { status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 5,
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const matches = contracts.filter((c) => c.status === 'DRAFT' || (c.startDate <= today && c.endDate >= today));
    if (matches.length !== 1) {
      json(res, 200, { status: matches.length ? 'AMBIGUOUS' : 'NO_MATCH' });
      return true;
    }
    const contract = matches[0];
    if (contract.room.rentalModel === 'SHARED_ROOM' && !contractCode) {
      if (contracts.length > 1) {
        json(res, 200, { status: 'AMBIGUOUS' });
        return true;
      }
    }
    if (contract.room.rentalModel !== 'SHARED_ROOM') {
      const representatives = await prisma.contract.count({
        where: { id: contract.id, tenantId: contract.tenantId, rentalModel: 'ENTIRE_ROOM' },
      });
      if (representatives !== 1) {
        json(res, 200, { status: 'NO_MATCH' });
        return true;
      }
    }
    await prisma.tenant.update({
      where: { id: contract.tenantId },
      data: { notificationChannel: 'ZALO_BOT' },
    }).catch(() => {});
    const invoice = contract.invoices.find(i => i.totalAmountVnd > i.paidAmountVnd);
    const paymentConnections = await prisma.paymentProviderConnection.findMany({
      where: { orgId, environment: 'LIVE', status: 'VERIFIED', isEnabled: true,
        OR: [{ buildingId: contract.room.buildingId }, { buildingId: null }], accounts: { some: {} } },
      include: { accounts: { orderBy: [{ bankCode: 'asc' }, { accountNumber: 'asc' }] } },
      orderBy: { updatedAt: 'desc' },
    });
    const paymentConnection = paymentConnections.find(connection => connection.buildingId === contract.room.buildingId)
      || paymentConnections.find(connection => connection.buildingId === null)
      || paymentConnections[0];
    const allAccounts = paymentConnection?.accounts || [];
    const bldCodeClean = (contract.room.building?.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const landlordRaw = (contract.room.building?.landlord || {}) as Record<string, unknown>;
    const landlordNameClean = toAsciiAccountName(String(landlordRaw.fullName || landlordRaw.accountName || ''));

    // Match appropriate gateway receiving account by building code or landlord identity
    const paymentAccount = allAccounts.find(acc => {
      const accNum = acc.accountNumber.toUpperCase();
      const accName = toAsciiAccountName(acc.accountName);
      return (
        (bldCodeClean && (accNum.includes(bldCodeClean) || accNum.includes(bldCodeClean.slice(-4)))) ||
        (landlordNameClean && (accName.includes(landlordNameClean) || landlordNameClean.includes(accName)))
      );
    }) || allAccounts[0] || null;

    // Strict rule: STK sent to tenants MUST be the integrated gateway account (SePay), never landlord personal account
    const accountNumber = paymentAccount?.accountNumber || fallbackPaymentAccount.accountNumber;
    const bank = paymentAccount?.bankCode || fallbackPaymentAccount.bank;
    const accountName = toAsciiAccountName(paymentAccount?.accountName || fallbackPaymentAccount.accountName);
    const invoiceAmount = invoice ? Number(invoice.totalAmountVnd - invoice.paidAmountVnd) : 0;
    const periodLabel = invoice ? `${invoice.periodKey.slice(5, 7)}/${invoice.periodKey.slice(0, 4)}` : '';
    let transferSyntax = DEFAULT_TRANSFER_SYNTAX;
    if (paymentConnection?.credentialsEncrypted) {
      const plaintext = decryptSecret(paymentConnection.credentialsEncrypted);
      if (plaintext) {
        try {
          const creds = JSON.parse(plaintext);
          if (typeof creds.transferSyntax === 'string' && creds.transferSyntax.trim()) {
            transferSyntax = creds.transferSyntax.trim();
          }
        } catch {}
      }
    }
    const transferContent = invoice ? formatTransferContent(transferSyntax, {
      roomCode: contract.room.code,
      buildingCode: contract.room.building?.code,
      tenantName: contract.tenant.fullName,
      periodKey: invoice.periodKey,
      invoiceCode: invoice.invoiceCode,
    }) : '';
    const snapshot = (invoice?.policySnapshot || {}) as Record<string, any>;
    const depositDue = snapshot.type === 'FIRST_COMBINED_INVOICE' ? Number(snapshot.financialSummary?.additionalDepositDue || 0) : 0;
    const invoiceItems = invoice ? [
      depositDue > 0 ? { label: 'Tiền cọc HĐ', amountVnd: depositDue } : null,
      Number(invoice.roomRentVnd) > 0 ? { label: `Tiền phòng tháng ${periodLabel}`, amountVnd: Number(invoice.roomRentVnd) } : null,
      Number(invoice.electricVnd) > 0 ? { label: 'Tiền điện', amountVnd: Number(invoice.electricVnd) } : null,
      Number(invoice.waterVnd) > 0 ? { label: 'Tiền nước', amountVnd: Number(invoice.waterVnd) } : null,
      Number(invoice.serviceFeeVnd) > 0 ? { label: 'Phí dịch vụ', amountVnd: Number(invoice.serviceFeeVnd) } : null,
      snapshot.type !== 'FIRST_COMBINED_INVOICE' && Number(invoice.adjustmentVnd) !== 0 ? { label: 'Điều chỉnh', amountVnd: Number(invoice.adjustmentVnd) } : null,
    ].filter(Boolean) : [];
    const paymentProviderId = paymentConnection?.providerId || fallbackPaymentAccount.providerId;
    const qrTemplate = paymentProviderId === 'SEPAY' ? 'compact' : 'compact2';
    const qrHolder = accountName.replace(/\s+/g, '+');
    const qrUrl = invoice && accountNumber && bank
      ? `https://vietqr.app/img?bank=${encodeURIComponent(bank)}&acc=${encodeURIComponent(accountNumber)}&template=${qrTemplate}&amount=${invoiceAmount}&des=${encodeURIComponent(transferContent)}&showinfo=true&holder=${qrHolder}`
      : null;
    json(res, 200, { status: 'MATCHED', tenantId: contract.tenantId, roomCode: contract.room.code,
      invoice: invoice ? { id: invoice.id, invoiceCode: invoice.invoiceCode, dueDate: invoice.dueDate,
        tenantName: contract.tenant.fullName, periodLabel, items: invoiceItems, amountVnd: invoiceAmount,
        accountNumber, bank, accountName, paymentProviderId, transferContent, qrUrl } : null });
    return true;
  }
  if (url.pathname === '/internal/zalo-bot/tenant-exists' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { json(res, 413, { error: 'too_large' }); return true; } }
    let body: any;
    try { body = JSON.parse(raw); } catch { json(res, 400, { error: 'invalid_json' }); return true; }
    const orgId = String(body.orgId || '').trim();
    const tenantId = String(body.tenantId || '').trim();
    if (!orgId || !tenantId) { json(res, 422, { error: 'invalid_tenant_lookup' }); return true; }
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, orgId }, select: { id: true } });
    json(res, 200, { exists: Boolean(tenant) });
    return true;
  }
  if (url.pathname === '/internal/zalo-bot/link-tenant' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { json(res, 413, { error: 'too_large' }); return true; } }
    let body: any;
    try { body = JSON.parse(raw); } catch { json(res, 400, { error: 'invalid_json' }); return true; }
    const orgId = String(body.orgId || '').trim();
    const tenantId = String(body.tenantId || '').trim();
    const channel = String(body.channel || 'ZALO_BOT').trim();
    if (!orgId || !tenantId) { json(res, 422, { error: 'invalid_payload' }); return true; }
    await prisma.tenant.updateMany({
      where: { id: tenantId, orgId },
      data: { notificationChannel: channel },
    });
    json(res, 200, { ok: true });
    return true;
  }
  if (url.pathname === '/internal/zalo-bot/notification-candidates' && req.method === 'GET') {
    const orgId = url.searchParams.get('orgId') || '';
    if (!/^[A-Za-z0-9-]{1,80}$/.test(orgId)) { json(res, 400, { error: 'invalid_org' }); return true; }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const previousMonth = new Date(`${today}T00:00:00Z`); previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    const sincePeriod = previousMonth.toISOString().slice(0, 7);
    const [invoices, contracts, paymentTransactions] = await Promise.all([
      prisma.invoice.findMany({ where: { orgId, periodKey: { gte: sincePeriod }, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        contract: { status: { in: ['ACTIVE', 'EXPIRING', 'EXTENDED'] } } }, include: { room: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.contract.findMany({ where: { orgId, status: { in: ['ACTIVE', 'EXPIRING', 'EXTENDED'] }, endDate: { gte: today, lte: new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10) } },
        include: { room: true }, take: 100 }),
      prisma.paymentTransaction.findMany({
        where: { orgId, verifiedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        include: { invoice: { include: { room: { include: { building: true } }, tenant: true } } },
        orderBy: { verifiedAt: 'desc' },
        take: 50,
      }),
    ]);
    json(res, 200, { invoices: invoices.filter(i => i.totalAmountVnd > i.paidAmountVnd && (i.policySnapshot as any)?.type !== 'FIRST_COMBINED_INVOICE')
      .map(i => ({ id: i.id, tenantId: i.tenantId, roomCode: i.room.code, invoiceCode: i.invoiceCode, period: i.periodKey,
        dueDate: i.dueDate, amountVnd: Number(i.totalAmountVnd - i.paidAmountVnd), electricVnd: Number(i.electricVnd), waterVnd: Number(i.waterVnd) })),
      expiring: contracts.map(c => ({ id: c.id, tenantId: c.tenantId, roomCode: c.room.code, endDate: c.endDate })),
      payments: paymentTransactions.map(pt => ({
        id: pt.id,
        externalTxId: pt.externalTxId,
        referenceText: pt.referenceText || '',
        amountVnd: Number(pt.amountVnd),
        payerName: pt.payerName || pt.invoice?.tenant?.fullName || 'Khách thuê',
        providerId: pt.providerId,
        invoiceId: pt.invoiceId,
        invoiceCode: pt.invoice?.invoiceCode || '',
        roomCode: pt.invoice?.room?.code || '',
        buildingName: pt.invoice?.room?.building?.name || pt.invoice?.room?.building?.code || '',
        tenantId: pt.invoice?.tenantId || '',
        totalAmountVnd: pt.invoice ? Number(pt.invoice.totalAmountVnd) : 0,
        paidAmountVnd: pt.invoice ? Number(pt.invoice.paidAmountVnd) : 0,
        remainingVnd: pt.invoice ? Math.max(0, Number(pt.invoice.totalAmountVnd - pt.invoice.paidAmountVnd)) : 0,
        invoiceStatus: pt.invoice?.status || 'PAID',
        verifiedAt: pt.verifiedAt,
      })),
    });
    return true;
  }
  json(res, 404, { error: 'not_found' }); return true;
}
const server = http.createServer((req, res) => {
  void Promise.resolve(internalBotApi(req, res).then(handled => handled ? undefined : middleware(req, res, () => {
    if (!res.headersSent) {
      res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, errorCode: 'NOT_FOUND' }));
    }
  }))).catch((error) => {
    console.error('API request failed', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, errorCode: 'INTERNAL_ERROR' }));
    } else res.destroy();
  });
});
server.listen(port, host, () => console.log(`AdHome API listening on ${host}:${port}`));
const auditPrune = () => void pruneConsoleAuditHistory(getPrismaClient()).catch(error => console.error('Audit retention failed', error));
auditPrune();
setInterval(auditPrune, 24 * 60 * 60 * 1000).unref();

const runningCronJobs = new Set<string>();
function hunonicIntervalMinutes(expression: string): number | null {
  let match = expression.match(/^\*\/(\d+) \* \* \* \*$/);
  if (match) {
    const minutes = Number(match[1]);
    return minutes >= 1 && minutes <= 59 ? minutes : null;
  }
  if (expression === '0 * * * *') return 60;
  match = expression.match(/^0 \*\/(\d+) \* \* \*$/);
  if (match) {
    const hours = Number(match[1]);
    return hours >= 1 && hours <= 23 ? hours * 60 : null;
  }
  if (expression === '0 0 * * *') return 1440;
  return null;
}
async function runHunonicCronJobs() {
  const prisma = getPrismaClient();
  const jobs = await prisma.cronJobConfig.findMany({ where: { jobKey: 'HUNONIC_HOURLY_SYNC', isEnabled: true } });
  const now = Date.now();
  for (const job of jobs) {
    const intervalMinutes = hunonicIntervalMinutes(job.cronExpression);
    if (!intervalMinutes || runningCronJobs.has(job.id)) continue;
    if (job.lastRunAt && now - job.lastRunAt.getTime() < intervalMinutes * 60_000) continue;
    runningCronJobs.add(job.id);
    await prisma.cronJobConfig.update({ where: { id: job.id }, data: { lastRunAt: new Date(), lastRunStatus: 'RUNNING' } });
    void executeHunonicBackgroundSync({ prisma, orgId: job.orgId, triggerType: 'CRON_HOURLY' })
      .then(() => prisma.cronJobConfig.update({ where: { id: job.id }, data: { lastRunStatus: 'SUCCESS', successCount: { increment: 1 }, lastError: null } }))
      .catch(error => prisma.cronJobConfig.update({ where: { id: job.id }, data: { lastRunStatus: 'FAILED', failureCount: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Đồng bộ Hunonic thất bại.' } }))
      .catch(error => console.error('Hunonic cron status update failed', error))
      .finally(() => runningCronJobs.delete(job.id));
  }
}
async function runBillingCutoffCronJobs() {
  const prisma = getPrismaClient();
  const jobs = await prisma.cronJobConfig.findMany({ where: { jobKey: 'BILLING_PERIOD_CUTOFF', isEnabled: true } });
  const now = Date.now();
  for (const job of jobs) {
    if (runningCronJobs.has(job.id)) continue;
    // Check interval - at least 60 minutes between runs
    if (job.lastRunAt && now - job.lastRunAt.getTime() < 60 * 60_000) continue;
    runningCronJobs.add(job.id);
    await prisma.cronJobConfig.update({ where: { id: job.id }, data: { lastRunAt: new Date(), lastRunStatus: 'RUNNING' } });
    const currentPeriodKey = new Date().toISOString().slice(0, 7);
    const buildings = await prisma.building.findMany({ where: { orgId: job.orgId }, select: { id: true } });
    const scopedBuildingIds = buildings.map((b: any) => b.id);
    void buildSettlementWorkspacePayload({ prisma, orgId: job.orgId, scopedBuildingIds, periodKey: currentPeriodKey })
      .then(async (result) => {
        const compiledCount = result.rows.filter((r: any) => !r.isVacant && !r.cronSkip).length;
        await prisma.cronJobConfig.update({
          where: { id: job.id },
          data: {
            lastRunStatus: 'SUCCESS',
            successCount: { increment: 1 },
            lastError: null,
          },
        });
        console.log(`[Cron BILLING_PERIOD_CUTOFF] Tự động tổng hợp kỳ ${currentPeriodKey} thành công: ${compiledCount} phòng có hợp đồng.`);
        const [year, month] = currentPeriodKey.split('-');
        const adminMessage = `🔔 [AdHome] ĐÃ TỔNG HỢP KỲ HÓA ĐƠN THÁNG ${month}/${year} XONG!\n• Tổng số phòng: ${compiledCount} phòng có hợp đồng.\n• Trạng thái: Đã tự động chốt hóa đơn tháng cũ làm nháp.\n👉 Kính mời Quản trị viên kiểm tra và phát hành hóa đơn cho từng phòng/khách hàng tại: https://console.adhome.vn`;
        try {
          const zaloAdminKey = process.env.ADHOME_ZALO_BOT_ADMIN_API_KEY || '';
          await fetch(`http://127.0.0.1:8081/internal/zalo-bot/${encodeURIComponent(job.orgId)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${zaloAdminKey}`,
            },
            body: JSON.stringify({
              action: 'notify_admin',
              message: adminMessage,
              eventKey: `admin:cron-compiled:${job.orgId}:${currentPeriodKey}:${Date.now()}`,
            }),
            signal: AbortSignal.timeout(10000),
          });
          console.log(`[Cron BILLING_PERIOD_CUTOFF] Đã gửi thông báo tổng hợp kỳ ${currentPeriodKey} tới nhóm Admin Zalo.`);
        } catch (notifyErr: any) {
          console.warn('[Cron BILLING_PERIOD_CUTOFF] Gửi thông báo Zalo nhóm Admin thất bại:', notifyErr?.message || notifyErr);
        }
      })
      .catch((error) =>
        prisma.cronJobConfig.update({
          where: { id: job.id },
          data: {
            lastRunStatus: 'FAILED',
            failureCount: { increment: 1 },
            lastError: error instanceof Error ? error.message.slice(0, 500) : 'Tự động tổng hợp kỳ thất bại.',
          },
        })
      )
      .finally(() => runningCronJobs.delete(job.id));
  }
}
const cronMasterTick = () => {
  void runHunonicCronJobs().catch(error => console.error('Hunonic cron scheduler failed', error));
  void runBillingCutoffCronJobs().catch(error => console.error('Billing cutoff cron scheduler failed', error));
};
cronMasterTick();
setInterval(cronMasterTick, 60_000).unref();
