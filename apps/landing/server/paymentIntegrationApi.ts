import type { IncomingMessage, ServerResponse } from 'node:http';
import { Prisma, type PrismaClient } from '@prisma/client';
import { actorHasPermission, isBuildingAllowedForActor, type AuthoritativeConsoleActor } from './authRbac';
import { decryptSecret, encryptSecret } from './cryptoVault';
import { IntegrationError, PAYMENT_PROVIDERS, providerFor, testPaymentProvider } from './paymentProviderRegistry';
import { paymentWebhookOrigin, webhookAddress } from './paymentWebhookConfig';
import { assertWebhookCredentials } from './paymentWebhooks';

type Helpers = { sendJson: (res: ServerResponse, status: number, body: any) => unknown; readJsonBody: (req: IncomingMessage) => Promise<any> };
const safeSelect = { id: true, providerId: true, name: true, environment: true, buildingId: true, isEnabled: true, status: true, credentialFields: true, version: true, lastTestedAt: true, lastTestMessage: true, verificationScope: true, webhookEnabled: true, webhookAuth: true, webhookLastReceivedAt: true, webhookRegisteredAt: true, createdAt: true, updatedAt: true, accounts: { orderBy: [{ bankCode: 'asc' as const }, { accountNumber: 'asc' as const }] }, webhookEvents: { select: { id: true, eventType: true, status: true, receivedAt: true, amountVnd: true }, orderBy: { receivedAt: 'desc' as const }, take: 5 } };
const conflict = () => { throw new IntegrationError('Cấu hình đã thay đổi. Tải lại danh sách trước khi tiếp tục.', 409, 'VERSION_CONFLICT'); };
const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some(c => c.charCodeAt(0) < 32)) throw new IntegrationError(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  return value.trim();
};

export function validateReceivingAccounts(input: unknown) {
  if (!Array.isArray(input) || input.length > 50) throw new IntegrationError('Mỗi kết nối hỗ trợ tối đa 50 tài khoản trong một lần lưu.');
  const seen = new Set<string>();
  return input.map((value: any) => {
    const bankCode = text(value?.bankCode, 'Mã ngân hàng', 20).toUpperCase();
    const accountNumber = text(value?.accountNumber, 'Số tài khoản', 50);
    const accountName = text(value?.accountName, 'Chủ tài khoản', 150);
    if (!/^[A-Z0-9_-]+$/.test(bankCode) || !/^[A-Za-z0-9_-]+$/.test(accountNumber)) throw new IntegrationError('Mã ngân hàng hoặc số tài khoản chứa ký tự không hợp lệ.');
    const key = `${bankCode}:${accountNumber.toUpperCase()}`;
    if (seen.has(key)) throw new IntegrationError('Danh sách có tài khoản ngân hàng trùng lặp.');
    seen.add(key);
    return { bankCode, accountNumber, accountName };
  });
}

export async function handlePaymentIntegrations(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient, actor: AuthoritativeConsoleActor, helpers: Helpers): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/settings\/payment-connections(?:\/([a-zA-Z0-9-]+)(?:\/(test|enabled|webhook|register-webhook))?)?$/);
  if (!match) return false;
  const { sendJson, readJsonBody } = helpers;
  try {
    if (!actorHasPermission(actor, 'settings.manage')) throw new IntegrationError('Không có quyền quản lý tích hợp hệ thống.', 403, 'FORBIDDEN');
    res.setHeader('Cache-Control', 'no-store');
    const id = match[1];
    const action = match[2];
    const method = req.method || 'GET';
    if (method === 'GET' && !id) {
      const [connections, legacy, auditLogs] = await Promise.all([
        prisma.paymentProviderConnection.findMany({ where: { orgId: actor.orgId }, select: safeSelect, orderBy: { createdAt: 'desc' } }),
        prisma.integrationConnection.findMany({ where: { orgId: actor.orgId, category: 'PAYMENT' }, select: { providerId: true, secretHint: true, accountLabel: true } }),
        prisma.consoleAuditLog.findMany({ where: { orgId: actor.orgId, entityType: 'PAYMENT_CONNECTION' }, select: { id: true, actorEmail: true, summary: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);
      sendJson(res, 200, { ok: true, providers: PAYMENT_PROVIDERS, publicWebhookOrigin: paymentWebhookOrigin(req), connections: connections.map(c => ({ ...c, ...webhookAddress(c.providerId, c.id, req), webhookEvents: c.webhookEvents.map(e => ({ ...e, amountVnd: e.amountVnd === null ? null : Number(e.amountVnd) })) })), auditLogs, legacyConfigured: legacy.filter(p => p.secretHint || p.accountLabel).map(p => p.providerId) });
      return true;
    }
    if (!(method === 'POST' && (!id || action)) && !(method === 'PATCH' && id && !action)) throw new IntegrationError('Phương thức không được hỗ trợ.', 405, 'METHOD_NOT_ALLOWED');
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntegrationError('Nội dung yêu cầu không hợp lệ.');
    const existing = id ? await prisma.paymentProviderConnection.findFirst({ where: { id, orgId: actor.orgId } }) : null;
    if (id && !existing) throw new IntegrationError('Không tìm thấy kết nối trong tổ chức.', 404, 'NOT_FOUND');
    if (existing && (!Number.isInteger(body.version) || body.version !== existing.version)) conflict();
    const audit = (tx: Prisma.TransactionClient, entityId: string, actionName: string, summary: string) => tx.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, entityType: 'PAYMENT_CONNECTION', entityId, action: actionName, summary } });
    if ((action === 'webhook' || action === 'register-webhook') && existing) {
      const plaintext = decryptSecret(existing.credentialsEncrypted);
      if (!plaintext) throw new IntegrationError('Không thể mở khóa cấu hình webhook.', 422, 'VAULT_ERROR');
      const credentials = JSON.parse(plaintext);
      const url = webhookAddress(existing.providerId, existing.id, req).webhookUrl;
      if (action === 'webhook') {
        if (typeof body.isEnabled !== 'boolean') throw new IntegrationError('Trạng thái nhận webhook không hợp lệ.');
        if (body.isEnabled) {
          try { assertWebhookCredentials(existing.providerId, credentials, existing.webhookAuth); }
          catch (error) { throw new IntegrationError(error instanceof Error ? error.message : 'Thiếu khóa webhook.'); }
        }
        await prisma.$transaction(async tx => {
          const updated = await tx.paymentProviderConnection.updateMany({ where: { id: existing.id, orgId: actor.orgId, version: existing.version }, data: { webhookEnabled: body.isEnabled, version: { increment: 1 } } });
          if (updated.count !== 1) conflict();
          await audit(tx, existing.id, 'TOGGLE_PAYMENT_WEBHOOK', `${body.isEnabled ? 'Bật' : 'Tắt'} bộ nhận webhook ${existing.providerId}`);
        });
        sendJson(res, 200, { ok: true, message: body.isEnabled ? 'Đã bật nhận webhook. Cấu hình URL và gửi thử từ nhà cung cấp để xác nhận kết nối.' : 'Đã tắt nhận webhook.' }); return true;
      }
      if (existing.providerId !== 'PAYOS') throw new IntegrationError('Nhà cung cấp này cần đăng ký URL theo hướng dẫn trong Settings.');
      if (!url || !existing.webhookEnabled) throw new IntegrationError('Cần bật bộ nhận webhook trước khi đăng ký URL với payOS.');
      if (!credentials.clientId || !credentials.apiKey || !credentials.checksumKey) throw new IntegrationError('Cần đủ Client ID, API Key, Checksum Key của payOS.');
      let registered: any;
      try {
        const response = await fetch('https://api-merchant.payos.vn/confirm-webhook', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', 'x-client-id': credentials.clientId, 'x-api-key': credentials.apiKey }, body: JSON.stringify({ webhookUrl: url }) });
        registered = await response.json();
        if (!response.ok || registered.code !== '00' || registered.data?.webhookUrl !== url) throw new Error('Provider rejected');
      } catch { throw new IntegrationError('payOS chưa xác nhận đăng ký URL. Kiểm tra domain công khai, Checksum Key và trạng thái nhận webhook, rồi thử lại.', 502, 'PROVIDER_REJECTED'); }
      await prisma.$transaction(async tx => {
        const updated = await tx.paymentProviderConnection.updateMany({ where: { id: existing.id, orgId: actor.orgId, version: existing.version, webhookEnabled: true }, data: { webhookRegisteredAt: new Date(), version: { increment: 1 } } });
        if (updated.count !== 1) conflict();
        await audit(tx, existing.id, 'REGISTER_PAYMENT_WEBHOOK', 'payOS xác nhận đăng ký URL webhook của kênh thanh toán');
      });
      sendJson(res, 200, { ok: true, message: 'payOS đã xác nhận đăng ký URL webhook. Xem thời điểm nhận sự kiện để kiểm tra callback có chữ ký.' }); return true;
    }
    if (action === 'test' && existing) {
      const provider = providerFor(existing.providerId);
      if (!provider?.canTest) throw new IntegrationError('Adapter kiểm tra nhà cung cấp này chưa được triển khai.', 422, 'NOT_SUPPORTED');
      // Compare-and-swap after networking: any subsequent save invalidates this result.
      if (existing.lastTestedAt && Date.now() - existing.lastTestedAt.getTime() < 10000) throw new IntegrationError('Chờ ít nhất 10 giây giữa hai lần kiểm tra.', 429, 'RATE_LIMITED');
      const plaintext = decryptSecret(existing.credentialsEncrypted);
      if (!plaintext) throw new IntegrationError('Không thể mở khóa cấu hình. Kiểm tra vault hoặc nhập lại thông tin xác thực.', 422, 'VAULT_ERROR');
      let result: { message: string; scope: string } | null = null;
      let testError: IntegrationError | null = null;
      try { result = await testPaymentProvider(existing.providerId, existing.environment, JSON.parse(plaintext), String(body.reference || '').trim()); }
      catch (error) { if (error instanceof IntegrationError && error.code === 'VALIDATION_ERROR') throw error; testError = error instanceof IntegrationError ? error : new IntegrationError('Không thể kiểm tra kết nối.', 502, 'PROVIDER_UNAVAILABLE'); }
      await prisma.$transaction(async tx => {
        const updated = await tx.paymentProviderConnection.updateMany({ where: { id: existing.id, orgId: actor.orgId, version: existing.version }, data: { version: { increment: 1 }, status: result ? 'VERIFIED' : 'ERROR', isEnabled: false, lastTestedAt: new Date(), lastTestMessage: result?.message || testError!.message, verificationScope: result?.scope || null } });
        if (updated.count !== 1) conflict();
        await audit(tx, existing.id, 'TEST_PAYMENT_CONNECTION', `${existing.providerId}: ${result ? 'Kiểm tra API thành công' : 'Kiểm tra API thất bại'}`);
      });
      sendJson(res, testError?.statusCode || 200, { ok: !testError, message: result?.message || testError!.message, errorCode: testError?.code });
      return true;
    }
    if (action === 'enabled' && existing) {
      if (typeof body.isEnabled !== 'boolean') throw new IntegrationError('Trạng thái kích hoạt không hợp lệ.');
      if (body.isEnabled && (existing.status !== 'VERIFIED' || existing.environment !== 'LIVE' || !providerFor(existing.providerId)?.canTest)) throw new IntegrationError('Phải kiểm tra API thành công ở môi trường LIVE trước khi bật kết nối.');
      await prisma.$transaction(async tx => {
        const updated = await tx.paymentProviderConnection.updateMany({ where: { id: existing.id, orgId: actor.orgId, version: existing.version }, data: { isEnabled: body.isEnabled, version: { increment: 1 } } });
        if (updated.count !== 1) conflict();
        await audit(tx, existing.id, 'TOGGLE_PAYMENT_CONNECTION', `${body.isEnabled ? 'Bật' : 'Tắt'} kết nối ${existing.providerId}`);
      });
      sendJson(res, 200, { ok: true }); return true;
    }
    const providerId = existing?.providerId || String(body.providerId || '').toUpperCase();
    if (existing && body.providerId !== existing.providerId) throw new IntegrationError('Không thể đổi nhà cung cấp của kết nối đã tạo.');
    const provider = providerFor(providerId);
    if (!provider) throw new IntegrationError('Nhà cung cấp không được hỗ trợ.');
    const name = text(body.name, 'Tên kết nối', 120);
    const environment = String(body.environment || 'LIVE');
    if (!(provider.environments as readonly string[]).includes(environment)) throw new IntegrationError('Môi trường không được nhà cung cấp hỗ trợ.');
    const webhookAuth = providerId === 'SEPAY' ? String(body.webhookAuth || existing?.webhookAuth || 'HMAC_SHA256') : providerId === 'TINGEE' ? 'HMAC_SHA512' : 'HMAC_SHA256';
    if (providerId === 'SEPAY' && !['HMAC_SHA256', 'API_KEY'].includes(webhookAuth)) throw new IntegrationError('Phương thức xác thực webhook không hợp lệ.');
    const buildingId = body.buildingId ? text(body.buildingId, 'Tòa nhà', 100) : null;
    if (buildingId) {
      const building = await prisma.building.findFirst({ where: { id: buildingId, orgId: actor.orgId } });
      if (!building || !isBuildingAllowedForActor(actor, building.id, building.code)) throw new IntegrationError('Tòa nhà không thuộc phạm vi được phép.', 403, 'FORBIDDEN');
    }
    const accounts = validateReceivingAccounts(body.accounts);
    let credentials: Record<string, string> = {};
    if (existing) {
      const plaintext = decryptSecret(existing.credentialsEncrypted);
      if (!plaintext) throw new IntegrationError('Không thể mở khóa cấu hình đã lưu. Kiểm tra khóa vault.', 422, 'VAULT_ERROR');
      credentials = JSON.parse(plaintext);
    }
    if (!body.credentials || typeof body.credentials !== 'object' || Array.isArray(body.credentials)) throw new IntegrationError('Thông tin xác thực không hợp lệ.');
    const allowedFields = new Set(provider.fields.map(field => field.key as string));
    for (const [key, value] of Object.entries(body.credentials)) {
      if (!allowedFields.has(key)) throw new IntegrationError('Trường thông tin xác thực không được hỗ trợ.');
      if (value !== '') credentials[key] = text(value, 'Thông tin xác thực', 4096);
    }
    if (providerId === 'SEPAY' && existing?.webhookAuth !== webhookAuth && existing?.credentialsEncrypted && credentials.webhookSecret && !body.credentials.webhookSecret) {
      throw new IntegrationError('Khi đổi phương thức xác thực webhook SePay, cần nhập khóa mới tương ứng.', 422, 'WEBHOOK_KEY_REQUIRED');
    }
    for (const field of provider.fields) if (!field.optional && !credentials[field.key]) throw new IntegrationError(`Cần nhập ${field.label}.`);
    if (providerId === 'SEPAY' && !credentials.apiToken && !credentials.webhookSecret) throw new IntegrationError('Cần khóa webhook hoặc API Token SePay. Hai khóa này phục vụ hai chức năng khác nhau.');
    const encrypted = encryptSecret(JSON.stringify(credentials)) as unknown as Prisma.InputJsonValue;
    // A client-generated creation ID makes retries safe after a lost response.
    const creationId = existing ? null : text(body.creationId, 'Mã yêu cầu tạo kết nối', 80);
    if (creationId && !/^[a-f0-9-]{32,36}$/i.test(creationId)) throw new IntegrationError('Mã yêu cầu tạo kết nối không hợp lệ.');
    const result = await prisma.$transaction(async tx => {
      if (creationId) {
        const previous = await tx.paymentProviderConnection.findUnique({ where: { id: creationId }, include: { accounts: true } });
        if (previous) {
          const previousCredentials = decryptSecret(previous.credentialsEncrypted);
          const accountKeys = (items: { bankCode: string; accountNumber: string; accountName: string }[]) => items.map(a => JSON.stringify([a.bankCode, a.accountNumber, a.accountName])).sort().join('|');
          const sameCredentials = previousCredentials && provider.fields.every(f => JSON.parse(previousCredentials)[f.key] === credentials[f.key]);
          if (previous.orgId !== actor.orgId || previous.providerId !== providerId || previous.name !== name || previous.environment !== environment || previous.buildingId !== buildingId || previous.webhookAuth !== webhookAuth || !sameCredentials || accountKeys(previous.accounts) !== accountKeys(accounts)) throw new IntegrationError('Yêu cầu này đã được lưu với nội dung khác. Tải lại danh sách trước khi tạo kết nối mới.', 409, 'CREATION_CONFLICT');
          return { id: previous.id, replay: true };
        }
      }
      if (!existing && await tx.paymentProviderConnection.count({ where: { orgId: actor.orgId } }) >= 100) throw new IntegrationError('Tổ chức đã đạt giới hạn 100 kết nối.');
      const data = { name, environment, buildingId, credentialsEncrypted: encrypted, credentialFields: provider.fields.filter(field => credentials[field.key]).map(field => field.key), status: 'UNCONFIGURED', isEnabled: false, lastTestedAt: null, lastTestMessage: null, verificationScope: null, webhookAuth, webhookEnabled: false, webhookLastReceivedAt: null, webhookRegisteredAt: null };
      let connectionId: string;
      if (existing) {
        const update = await tx.paymentProviderConnection.updateMany({ where: { id: existing.id, orgId: actor.orgId, version: existing.version }, data: { ...data, version: { increment: 1 } } });
        if (update.count !== 1) conflict();
        connectionId = existing.id;
        await tx.paymentReceivingAccount.deleteMany({ where: { connectionId } });
      } else {
        const created = await tx.paymentProviderConnection.create({ data: { ...data, id: creationId!, orgId: actor.orgId, providerId } });
        connectionId = created.id;
      }
      if (accounts.length) await tx.paymentReceivingAccount.createMany({ data: accounts.map(account => ({ ...account, connectionId })) });
      await audit(tx, connectionId, existing ? 'UPDATE_PAYMENT_CONNECTION' : 'CREATE_PAYMENT_CONNECTION', `${existing ? 'Cập nhật' : 'Thêm'} kết nối ${providerId}, ${accounts.length} tài khoản nhận tiền`);
      return { id: connectionId };
    });
    sendJson(res, existing ? 200 : 201, { ok: true, ...result });
  } catch (error: any) {
    const known = error instanceof IntegrationError;
    const missingSchema = error?.code === 'P2021';
    helpers.sendJson(res, known ? error.statusCode : missingSchema ? 503 : 500, { ok: false, errorCode: known ? error.code : missingSchema ? 'SCHEMA_NOT_READY' : 'INTEGRATION_ERROR', message: known ? error.message : missingSchema ? 'Cơ sở dữ liệu chưa được cập nhật cho Integration Hub. Cần áp dụng integration-hub.sql.' : 'Không thể xử lý cấu hình tích hợp. Vui lòng thử lại hoặc kiểm tra máy chủ.' });
  }
  return true;
}
