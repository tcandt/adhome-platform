import crypto from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decryptSecret, encryptSecret } from './cryptoVault';
import { actorHasPermission } from './authRbac';

const BASE = '/api/v1/console/v2/settings/data';
const backupDirectory = () => process.env.ADHOME_DATA_BACKUP_DIR || path.join(process.cwd(), 'data', 'backups');
const businessModels = [
  'building', 'floor', 'publicRoomListing', 'tenant', 'consoleRoom', 'roomReservation', 'contract',
  'roomOccupant', 'deposit', 'electricMeter', 'meterReading', 'billingPeriod', 'invoice',
  'paymentTransaction', 'ledgerEntry', 'leadInquiry', 'roomAuditLog', 'rentalDocumentAudit', 'seoSyncJob', 'idempotencyRecord',
] as const;
const deleteOrder = [...businessModels].reverse();
const customerModels = [
  'roomReservation', 'contract', 'roomOccupant', 'deposit', 'billingPeriod', 'invoice',
  'paymentTransaction', 'ledgerEntry', 'leadInquiry', 'roomAuditLog', 'rentalDocumentAudit', 'idempotencyRecord',
] as const;
const MAX_BACKUP_BYTES = 40 * 1024 * 1024;

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};
const parseJson = async (req: any) => {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 64 * 1024) throw Object.assign(new Error('Yêu cầu quá lớn.'), { statusCode: 413 });
  }
  return raw ? JSON.parse(raw) : {};
};
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const safeId = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) ? value : null;
const backupName = (createdAt: string) => `Sao lưu ${new Date(createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

async function modelRows(prisma: any, model: string, orgId: string) {
  if (model === 'rentalDocumentAudit') return prisma.consoleAuditLog.findMany({ where: { orgId, entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE' } });
  if (model === 'meterReading') {
    const meters = await prisma.electricMeter.findMany({ where: { orgId }, select: { id: true } });
    return meters.length ? prisma.meterReading.findMany({ where: { meterId: { in: meters.map((item: any) => item.id) } } }) : [];
  }
  return prisma[model].findMany({ where: { orgId } });
}

async function snapshot(prisma: any, orgId: string) {
  const data: Record<string, any[]> = {};
  for (const model of businessModels) data[model] = await modelRows(prisma, model, orgId);
  return { format: 'adhome-business-v1', orgId, generatedAt: new Date().toISOString(), data };
}

async function saveSnapshot(prisma: any, orgId: string, actorEmail: string) {
  const data = await prisma.$transaction((tx: any) => snapshot(tx, orgId), { isolationLevel: 'RepeatableRead', timeout: 120000 });
  const plain = JSON.stringify(data, (_key, value) => typeof value === 'bigint' ? { $bigint: String(value) } : value);
  if (Buffer.byteLength(plain) > MAX_BACKUP_BYTES) throw Object.assign(new Error('Dữ liệu vượt giới hạn sao lưu 40 MB.'), { statusCode: 413 });
  const id = crypto.randomUUID();
  const record = { id, orgId, name: backupName(data.generatedAt), createdAt: data.generatedAt, createdBy: actorEmail,
    counts: Object.fromEntries(businessModels.map(model => [model, data.data[model].length])), digest: digest(plain), encrypted: encryptSecret(plain) };
  await mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
  const serialized = JSON.stringify(record);
  await writeFile(path.join(backupDirectory(), `${id}.json`), serialized, { flag: 'wx', mode: 0o600 });
  return { id, name: record.name, sizeBytes: Buffer.byteLength(serialized), createdAt: record.createdAt, createdBy: actorEmail, counts: record.counts, digest: record.digest };
}

async function readBackup(id: string, orgId: string) {
  const record = JSON.parse(await readFile(path.join(backupDirectory(), `${id}.json`), 'utf8'));
  if (record.orgId !== orgId) throw Object.assign(new Error('Không tìm thấy bản sao lưu.'), { statusCode: 404 });
  const plain = decryptSecret(record.encrypted);
  if (!plain || digest(plain) !== record.digest) throw Object.assign(new Error('Bản sao lưu không hợp lệ hoặc không giải mã được.'), { statusCode: 422 });
  const content = JSON.parse(plain, (_key, value) => value && typeof value === 'object' && '$bigint' in value ? BigInt(value.$bigint) : value);
  if (content.format !== 'adhome-business-v1' || content.orgId !== orgId ||
      businessModels.some(model => !Array.isArray(content.data?.[model]) || content.data[model].some((row: any) => model !== 'meterReading' && row.orgId !== orgId))) {
    throw Object.assign(new Error('Bản sao lưu không thuộc tổ chức hoặc sai định dạng.'), { statusCode: 422 });
  }
  const meterIds = new Set(content.data.electricMeter.map((row: any) => row.id));
  if (content.data.meterReading.some((row: any) => !meterIds.has(row.meterId))) throw Object.assign(new Error('Bản sao lưu chứa chỉ số công tơ ngoài phạm vi.'), { statusCode: 422 });
  return { record, content };
}

async function counts(prisma: any, orgId: string) {
  const result: Record<string, number> = {};
  for (const model of businessModels) result[model] = (await modelRows(prisma, model, orgId)).length;
  return result;
}

async function ensureNoSettingsReferences(prisma: any, orgId: string) {
  const bound = await prisma.paymentProviderConnection.count({ where: { orgId, buildingId: { not: null } } });
  if (bound) throw Object.assign(new Error('Có kết nối thanh toán gắn với tòa nhà. Gỡ phạm vi tòa nhà trong Cài đặt trước khi thay thế hoặc xóa tòa nhà.'), { statusCode: 409 });
}

async function clearBusiness(tx: any, orgId: string, scope: 'CUSTOMERS' | 'BUILDINGS') {
  const selected = scope === 'BUILDINGS' ? deleteOrder : [...customerModels].reverse();
  for (const model of selected) {
    if (model === 'meterReading') {
      const meters = await tx.electricMeter.findMany({ where: { orgId }, select: { id: true } });
      if (meters.length) await tx.meterReading.deleteMany({ where: { meterId: { in: meters.map((item: any) => item.id) } } });
    } else if (model === 'rentalDocumentAudit') await tx.consoleAuditLog.deleteMany({ where: { orgId, entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE' } });
    else await tx[model].deleteMany({ where: { orgId } });
  }
  if (scope === 'CUSTOMERS') {
    await tx.tenant.deleteMany({ where: { orgId } });
    await tx.consoleRoom.updateMany({ where: { orgId }, data: { occupancyStatus: 'AVAILABLE' } });
    await tx.publicRoomListing.updateMany({ where: { orgId }, data: { status: 'AVAILABLE', currentTenantName: null, currentTenantPhone: null } });
  }
}

export async function handleDataManagement(req: any, res: any, pathname: string, prisma: any, actor: any): Promise<boolean> {
  if (!pathname.startsWith(BASE)) return false;
  if (!actorHasPermission(actor, 'settings.manage') || actor.role !== 'ADMIN') {
    json(res, 403, { ok: false, message: 'Chỉ quản trị viên được quản lý dữ liệu.' }); return true;
  }
  try {
    if (req.method === 'GET' && pathname === `${BASE}/backups`) {
      await mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
      const files = (await readdir(backupDirectory())).filter(name => /^[0-9a-f-]{36}\.json$/.test(name));
      const items = [];
      for (const name of files) {
        const filePath = path.join(backupDirectory(), name);
        const row = JSON.parse(await readFile(filePath, 'utf8'));
        if (row.orgId === actor.orgId) items.push({ id: row.id, name: typeof row.name === 'string' && row.name.trim() ? row.name : backupName(row.createdAt), sizeBytes: (await stat(filePath)).size, createdAt: row.createdAt, createdBy: row.createdBy, counts: row.counts, digest: row.digest });
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      json(res, 200, { ok: true, backups: items }); return true;
    }
    if (req.method === 'GET' && pathname === `${BASE}/summary`) {
      json(res, 200, { ok: true, counts: await counts(prisma, actor.orgId) }); return true;
    }
    if (req.method === 'POST' && pathname === `${BASE}/backup`) {
      const saved = await saveSnapshot(prisma, actor.orgId, actor.email);
      await prisma.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        entityType: 'DATA_BACKUP', entityId: saved.id, action: 'CREATE_DATA_BACKUP', summary: 'Tạo bản sao lưu dữ liệu nghiệp vụ', metadata: { digest: saved.digest } } });
      json(res, 201, { ok: true, backup: saved }); return true;
    }
    if (req.method === 'POST' && pathname === `${BASE}/backups/import`) {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
        if (raw.length > MAX_BACKUP_BYTES * 2 + 65536) throw Object.assign(new Error('File sao lưu quá lớn.'), { statusCode: 413 });
      }
      const incoming = JSON.parse(raw);
      if (incoming.orgId !== actor.orgId || !safeId(incoming.id) || typeof incoming.digest !== 'string') throw Object.assign(new Error('File sao lưu không thuộc tổ chức này.'), { statusCode: 422 });
      const plain = decryptSecret(incoming.encrypted);
      if (!plain || digest(plain) !== incoming.digest) throw Object.assign(new Error('File sao lưu bị hỏng hoặc không giải mã được trên máy chủ này.'), { statusCode: 422 });
      const content = JSON.parse(plain);
      if (content.format !== 'adhome-business-v1' || content.orgId !== actor.orgId ||
          businessModels.some(model => !Array.isArray(content.data?.[model]))) throw Object.assign(new Error('Nội dung sao lưu không hợp lệ.'), { statusCode: 422 });
      const id = crypto.randomUUID();
      await mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
      const createdAt = new Date().toISOString();
      await writeFile(path.join(backupDirectory(), `${id}.json`), JSON.stringify({ ...incoming, id, name: backupName(createdAt), createdAt, createdBy: actor.email }), { flag: 'wx', mode: 0o600 });
      json(res, 201, { ok: true, backupId: id }); return true;
    }
    if (req.method === 'POST' && pathname === `${BASE}/backups/delete`) {
      const body = await parseJson(req);
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some(id => !safeId(id)) || new Set(ids).size !== ids.length) {
        throw Object.assign(new Error('Chọn từ 1 đến 100 bản sao lưu hợp lệ.'), { statusCode: 422 });
      }
      if (body.confirmation !== 'XOA BAN SAO LUU') throw Object.assign(new Error('Nhập đúng câu xác nhận xóa bản sao lưu.'), { statusCode: 422 });
      const files = await Promise.all(ids.map(async id => {
        const filePath = path.join(backupDirectory(), `${id}.json`);
        let record: any;
        try { record = JSON.parse(await readFile(filePath, 'utf8')); }
        catch { throw Object.assign(new Error('Có bản sao lưu không còn tồn tại. Hãy tải lại danh sách.'), { statusCode: 404 }); }
        if (record.orgId !== actor.orgId || record.id !== id) throw Object.assign(new Error('Có bản sao lưu không thuộc tổ chức này.'), { statusCode: 404 });
        return { id, filePath };
      }));
      const results = await Promise.allSettled(files.map(file => unlink(file.filePath)));
      const deletedIds = files.filter((_file, index) => results[index].status === 'fulfilled').map(file => file.id);
      const failedIds = files.filter((_file, index) => results[index].status === 'rejected').map(file => file.id);
      if (deletedIds.length) await prisma.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        entityType: 'DATA_BACKUP', entityId: deletedIds[0], action: 'DELETE_DATA_BACKUP', summary: `Xóa ${deletedIds.length} bản sao lưu`, metadata: { deletedIds } } });
      json(res, 200, { ok: true, deletedIds, failedIds }); return true;
    }
    const download = pathname.match(/^\/api\/v1\/console\/v2\/settings\/data\/backups\/([^/]+)\/download$/);
    if (req.method === 'GET' && download) {
      const id = safeId(download[1]);
      if (!id) throw Object.assign(new Error('Mã bản sao lưu không hợp lệ.'), { statusCode: 422 });
      await readBackup(id, actor.orgId);
      const file = await readFile(path.join(backupDirectory(), `${id}.json`));
      res.statusCode = 200; res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="adhome-backup-${id}.json"`);
      res.setHeader('Cache-Control', 'private, no-store'); res.end(file); return true;
    }
    if (req.method === 'POST' && pathname === `${BASE}/preview`) {
      const body = await parseJson(req);
      if (body.action === 'RESTORE') {
        const id = safeId(body.backupId);
        if (!id) throw Object.assign(new Error('Chọn bản sao lưu.'), { statusCode: 422 });
        const { record } = await readBackup(id, actor.orgId);
        json(res, 200, { ok: true, action: 'RESTORE', counts: record.counts, digest: record.digest, current: await counts(prisma, actor.orgId) }); return true;
      }
      if (body.action === 'DELETE' && ['CUSTOMERS', 'BUILDINGS'].includes(body.scope)) {
        const current = await counts(prisma, actor.orgId);
        const affected = body.scope === 'BUILDINGS' ? current : Object.fromEntries(['tenant', ...customerModels].map(model => [model, current[model] || 0]));
        json(res, 200, { ok: true, action: 'DELETE', scope: body.scope, counts: affected,
          confirmation: body.scope === 'BUILDINGS' ? 'XOA TOA NHA' : 'XOA KHACH HANG' }); return true;
      }
      throw Object.assign(new Error('Phạm vi dữ liệu không hợp lệ.'), { statusCode: 422 });
    }
    if (req.method === 'POST' && pathname === `${BASE}/restore`) {
      const body = await parseJson(req);
      const id = safeId(body.backupId);
      if (!id || body.confirmation !== 'PHUC HOI DU LIEU') throw Object.assign(new Error('Nhập đúng câu xác nhận phục hồi.'), { statusCode: 422 });
      const { record, content } = await readBackup(id, actor.orgId);
      if (body.digest !== record.digest) throw Object.assign(new Error('Bản sao lưu đã thay đổi. Hãy xem trước lại.'), { statusCode: 409 });
      const paymentScopes = await prisma.paymentProviderConnection.findMany({ where: { orgId: actor.orgId, buildingId: { not: null } }, select: { id: true, buildingId: true } });
      const restoredBuildingIds = new Set(content.data.building.map((row: any) => row.id));
      if (paymentScopes.some((row: any) => !restoredBuildingIds.has(row.buildingId))) throw Object.assign(new Error('Bản sao lưu thiếu tòa nhà đang được tích hợp thanh toán sử dụng. Không thể giữ nguyên Cài đặt.'), { statusCode: 409 });
      const rollback = await saveSnapshot(prisma, actor.orgId, actor.email);
      await prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('adhome-data-management'), hashtext(${actor.orgId}))::text`;
        if (paymentScopes.length) await tx.paymentProviderConnection.updateMany({ where: { id: { in: paymentScopes.map((row: any) => row.id) } }, data: { buildingId: null } });
        await clearBusiness(tx, actor.orgId, 'BUILDINGS');
        for (const model of businessModels) {
          const rows = content.data[model].map((row: any) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && /At$/.test(key) && !Number.isNaN(Date.parse(value)) ? new Date(value) : value])));
          if (rows.length) await (model === 'rentalDocumentAudit' ? tx.consoleAuditLog : tx[model]).createMany({ data: rows });
        }
        for (const row of paymentScopes) await tx.paymentProviderConnection.update({ where: { id: row.id }, data: { buildingId: row.buildingId } });
        await tx.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
          entityType: 'DATA_BACKUP', entityId: id, action: 'RESTORE_BUSINESS_DATA', summary: 'Phục hồi dữ liệu nghiệp vụ; giữ nguyên Cài đặt', metadata: { rollbackBackupId: rollback.id, digest: record.digest } } });
      }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 });
      json(res, 200, { ok: true, rollbackBackupId: rollback.id }); return true;
    }
    if (req.method === 'POST' && pathname === `${BASE}/delete`) {
      const body = await parseJson(req);
      const scope = body.scope;
      if (scope !== 'CUSTOMERS' && scope !== 'BUILDINGS') throw Object.assign(new Error('Chọn loại dữ liệu cần xóa.'), { statusCode: 422 });
      if (body.confirmation !== (scope === 'BUILDINGS' ? 'XOA TOA NHA' : 'XOA KHACH HANG')) throw Object.assign(new Error('Nhập đúng câu xác nhận xóa.'), { statusCode: 422 });
      if (scope === 'BUILDINGS') await ensureNoSettingsReferences(prisma, actor.orgId);
      const rollback = await saveSnapshot(prisma, actor.orgId, actor.email);
      await prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('adhome-data-management'), hashtext(${actor.orgId}))::text`;
        await clearBusiness(tx, actor.orgId, scope);
        await tx.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
          entityType: 'DATA_BACKUP', entityId: rollback.id, action: 'DELETE_BUSINESS_DATA', summary: `Xóa dữ liệu nghiệp vụ: ${scope}`,
          metadata: { scope, rollbackBackupId: rollback.id } } });
      }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 });
      json(res, 200, { ok: true, rollbackBackupId: rollback.id }); return true;
    }
    json(res, 404, { ok: false, message: 'Không tìm thấy thao tác quản lý dữ liệu.' }); return true;
  } catch (error: any) {
    json(res, error.statusCode || 500, { ok: false, message: error.statusCode ? error.message : 'Không thể quản lý dữ liệu. Chưa có thay đổi nào được xác nhận.' }); return true;
  }
}
