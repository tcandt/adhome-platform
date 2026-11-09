import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { degrees, PDFDocument } from 'pdf-lib';
import { actorHasPermission, isBuildingAllowedForActor } from './authRbac';

export const buildingDocumentKinds = ['TITLE_FRONT', 'TITLE_BACK', 'BUSINESS_REGISTRATION', 'SALE_CERTIFICATE'] as const;
export const identityDocumentKinds = ['ID_FRONT', 'ID_BACK'] as const;
export type PrivateDocument = { id: string; kind: string; name: string; mimeType: string; size: number; pages: number; sha256: string };
const root = () => path.resolve(process.env.ADH_PRIVATE_DOCUMENT_DIR || 'uploads/private-documents');
const chunkBytes = 512 * 1024;
export const maxPrivateDocumentBytes = 25 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, statusCode = 422): never => { throw Object.assign(new Error(message), { statusCode }); };
const scopeKey = (orgId: string, entityId: string) => crypto.createHash('sha256').update(`${orgId}\0${entityId}`).digest('hex');
const scopeDir = (orgId: string, entityId: string) => path.join(root(), scopeKey(orgId, entityId));
const filePath = (orgId: string, entityId: string, id: string) => path.join(scopeDir(orgId, entityId), `${id}.bin`);

// The existing durable rental-document audit stream also preserves attachment versions and removal history.
export async function listPrivateDocuments(db: any, orgId: string, entityId: string): Promise<PrivateDocument[]> {
  const events = await db.consoleAuditLog.findMany({ where: { orgId, entityType: 'RENTAL_DOCUMENT', entityId,
    action: { in: ['UPLOAD_PRIVATE_DOCUMENT', 'REMOVE_PRIVATE_DOCUMENT'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const removed = new Set(events.filter((e: any) => e.action === 'REMOVE_PRIVATE_DOCUMENT').map((e: any) => e.metadata?.id));
  return events.filter((e: any) => e.action === 'UPLOAD_PRIVATE_DOCUMENT' && uuid.test(e.metadata?.id || '') && !removed.has(e.metadata.id)).map((e: any) => e.metadata);
}

async function verifiedDocumentBytes(orgId: string, entityId: string, doc: PrivateDocument) {
  const bytes = await fs.readFile(filePath(orgId, entityId, doc.id));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== doc.sha256) fail(`Tệp ${doc.name} không còn nguyên vẹn. Vui lòng tải lại.`, 409);
  return bytes;
}

export async function appendIdentityDocuments(pdf: PDFDocument, orgId: string, entityId: string, documents: PrivateDocument[]) {
  const ordered = identityDocumentKinds.flatMap(kind => documents.filter(doc => doc.kind === kind));
  const pageWidth = 595.28, pageHeight = 841.89, maxWidth = 425.2, gap = 32, slotHeight = 300;
  for (let index = 0; index < ordered.length; index += 2) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    for (let side = 0; side < 2 && index + side < ordered.length; side++) {
      const document = ordered[index + side];
      if (!['image/png', 'image/jpeg'].includes(document.mimeType)) fail('CCCD cần ảnh mặt trước hoặc mặt sau.');
      const bytes = await verifiedDocumentBytes(orgId, entityId, document);
      const image = document.mimeType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const portrait = image.height > image.width;
      const scale = Math.min(maxWidth / (portrait ? image.height : image.width), slotHeight / (portrait ? image.width : image.height));
      const width = image.width * scale, height = image.height * scale;
      const displayedWidth = portrait ? height : width, displayedHeight = portrait ? width : height;
      const centerY = pageHeight / 2 + (side === 0 ? 1 : -1) * (slotHeight + gap) / 2;
      const left = (pageWidth - displayedWidth) / 2, bottom = centerY - displayedHeight / 2;
      page.drawImage(image, { x: portrait ? left + displayedWidth : left, y: bottom, width, height, rotate: degrees(portrait ? 90 : 0) });
    }
  }
}

export async function appendPrivateDocument(pdf: PDFDocument, orgId: string, entityId: string, doc: PrivateDocument) {
  const bytes = await verifiedDocumentBytes(orgId, entityId, doc);
  if (doc.mimeType === 'application/pdf') {
    const source = await PDFDocument.load(bytes);
    for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
  } else {
    const image = doc.mimeType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([595.28, 841.89]);
    const fit = image.scaleToFit(555.28, 801.89);
    page.drawImage(image, { x: (595.28 - fit.width) / 2, y: (841.89 - fit.height) / 2, ...fit });
  }
}

async function jsonBody(req: any) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 8192) fail('Thông tin tệp không hợp lệ.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return fail('Thông tin tệp không hợp lệ.'); }
}

export async function handlePrivateDocuments(req: any, res: any, pathname: string, db: any, actor: any, helpers: any): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/(buildings|contracts)\/([A-Za-z0-9-]{1,100})\/(documents|identity-documents)(?:\/([0-9a-f-]{36})(?:\/(chunks|complete))?)?$/);
  if (!match) return false;
  const { sendJson } = helpers;
  const [entityType, entityId, section, documentId, operation] = match.slice(1);
  let workingFile: string | undefined;
  try {
    const buildingScope = entityType === 'buildings';
    if (section !== (buildingScope ? 'documents' : 'identity-documents')) fail('Không tìm thấy tài liệu.', 404);
    const permission = buildingScope ? 'buildings.manage' : 'contracts.manage';
    if (!actorHasPermission(actor, permission)) fail('Không có quyền truy cập hồ sơ này.', 403);
    const entity = buildingScope
      ? await db.building.findFirst({ where: { id: entityId, orgId: actor.orgId } })
      : await db.contract.findFirst({ where: { id: entityId, orgId: actor.orgId }, include: { room: { include: { building: true } } } });
    const building = buildingScope ? entity : entity?.room?.building;
    if (!entity || !building || !isBuildingAllowedForActor(actor, building.id, building.code)) fail('Không tìm thấy hồ sơ trong phạm vi phụ trách.', 404);
    const log = (action: string, metadata: any) => ({ orgId: actor.orgId, buildingId: building.id, actorId: actor.id,
      actorEmail: actor.email, actorRole: actor.role, entityType: 'RENTAL_DOCUMENT', entityId, action,
      summary: action === 'UPLOAD_PRIVATE_DOCUMENT' ? 'Bổ sung tài liệu hồ sơ thuê' : 'Gỡ tài liệu khỏi hồ sơ thuê', metadata });
    const dir = scopeDir(actor.orgId, entityId);
    const reply = (status: number, data: any) => sendJson(res, status, data);
    if (req.method === 'GET' && !documentId) {
      reply(200, { ok: true, documents: await listPrivateDocuments(db, actor.orgId, entityId) }); return true;
    }
    if (req.method === 'POST' && !documentId) {
      const body = await jsonBody(req);
      const kinds: readonly string[] = buildingScope ? buildingDocumentKinds : identityDocumentKinds;
      if (!kinds.includes(body.kind) || !['application/pdf', 'image/jpeg', 'image/png'].includes(body.mimeType)
        || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > maxPrivateDocumentBytes || typeof body.name !== 'string' || body.name.length > 255) {
        fail(body.size > maxPrivateDocumentBytes ? 'Tệp không được vượt quá 25 MB.' : 'Chọn tệp ảnh JPEG, PNG hoặc PDF hợp lệ.');
      }
      if (!buildingScope && body.mimeType === 'application/pdf') fail('CCCD cần ảnh chụp mặt trước hoặc mặt sau.');
      const id = crypto.randomUUID();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${id}.upload.json`), JSON.stringify({ ...body, id, orgId: actor.orgId, entityId, createdAt: Date.now() }), { flag: 'wx' });
      reply(201, { ok: true, uploadId: id, chunkBytes }); return true;
    }
    if (!documentId || !uuid.test(documentId)) fail('Không tìm thấy tài liệu.', 404);
    if (operation) {
      let session: any;
      try { session = JSON.parse(await fs.readFile(path.join(dir, `${documentId}.upload.json`), 'utf8')); }
      catch { fail('Phiên tải tệp không tồn tại. Hãy chọn lại tệp.', 404); }
      if (session.orgId !== actor.orgId || session.entityId !== entityId) fail('Không tìm thấy phiên tải tệp.', 404);
      if (req.method === 'PUT' && operation === 'chunks') {
        const part = Number(new URL(req.url, 'http://localhost').searchParams.get('part'));
        const parts = Math.ceil(session.size / chunkBytes);
        if (!Number.isSafeInteger(part) || part < 0 || part >= parts) fail('Phần tải tệp không hợp lệ.');
        const destination = path.join(dir, `${documentId}.${part}.part`);
        workingFile = `${destination}.${crypto.randomUUID()}.tmp`;
        const handle = await fs.open(workingFile, 'wx'); let size = 0;
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > chunkBytes) fail('Phần truyền dữ liệu quá lớn. Hãy thử lại.');
            await handle.writeFile(chunk);
          }
        } finally { await handle.close(); }
        if (size !== Math.min(chunkBytes, session.size - part * chunkBytes)) fail('Phần tải tệp chưa đầy đủ. Hãy thử lại.');
        await fs.rename(workingFile, destination); workingFile = undefined;
        reply(200, { ok: true, part, size }); return true;
      }
      if (req.method === 'POST' && operation === 'complete') {
        const existing = (await listPrivateDocuments(db, actor.orgId, entityId)).find(d => d.id === documentId);
        if (existing) { reply(200, { ok: true, document: existing }); return true; }
        workingFile = path.join(dir, `${documentId}.${crypto.randomUUID()}.assembling`);
        const output = await fs.open(workingFile, 'wx'); let size = 0; const hash = crypto.createHash('sha256');
        try {
          for (let part = 0; part < Math.ceil(session.size / chunkBytes); part++) {
            const partFile = path.join(dir, `${documentId}.${part}.part`);
            const stat = await fs.stat(partFile).catch(() => fail('Tệp chưa được tải đầy đủ. Vui lòng thử lại.', 409));
            if (stat.size !== Math.min(chunkBytes, session.size - part * chunkBytes)) fail('Tệp chưa được tải đầy đủ.', 409);
            for await (const bytes of createReadStream(partFile)) { await output.writeFile(bytes); size += bytes.length; hash.update(bytes); }
          }
        } finally { await output.close(); }
        if (size !== session.size) fail('Tệp chưa được tải đầy đủ.', 409);
        let pages = 1;
        try {
          const bytes = await fs.readFile(workingFile);
          if (session.mimeType === 'application/pdf') {
            if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error();
            pages = (await PDFDocument.load(bytes)).getPageCount(); if (!pages) throw new Error();
          } else {
            const verifier = await PDFDocument.create();
            if (session.mimeType === 'image/png') await verifier.embedPng(bytes); else await verifier.embedJpg(bytes);
          }
        } catch { fail('Tệp ảnh/PDF bị lỗi hoặc PDF có mật khẩu. Vui lòng chọn tệp có thể mở được.'); }
        const document: PrivateDocument = { id: documentId, kind: session.kind, name: session.name, mimeType: session.mimeType, size, pages, sha256: hash.digest('hex') };
        await fs.rename(workingFile, filePath(actor.orgId, entityId, documentId)); workingFile = undefined;
        await db.$transaction(async (tx: any) => {
          if (buildingScope) await tx.$executeRaw`SELECT id FROM buildings WHERE id = ${entityId} AND org_id = ${actor.orgId} FOR UPDATE`;
          else await tx.$executeRaw`SELECT id FROM contracts WHERE id = ${entityId} AND org_id = ${actor.orgId} FOR UPDATE`;
          if ((await listPrivateDocuments(tx, actor.orgId, entityId)).some(d => d.id === documentId)) return;
          if (!buildingScope) {
            for (const old of (await listPrivateDocuments(tx, actor.orgId, entityId)).filter(d => d.kind === document.kind)) {
              await tx.consoleAuditLog.create({ data: log('REMOVE_PRIVATE_DOCUMENT', { id: old.id }) });
            }
          }
          await tx.consoleAuditLog.create({ data: log('UPLOAD_PRIVATE_DOCUMENT', document) });
        });
        // Keep the manifest briefly so a lost completion response can be retried idempotently.
        for (let part = 0; part < Math.ceil(session.size / chunkBytes); part++) await fs.rm(path.join(dir, `${documentId}.${part}.part`), { force: true });
        reply(201, { ok: true, document }); return true;
      }
      fail('Phương thức không được hỗ trợ.', 405);
    }
    const document = (await listPrivateDocuments(db, actor.orgId, entityId)).find(d => d.id === documentId);
    if (!document) fail('Không tìm thấy tài liệu.', 404);
    if (req.method === 'GET') {
      const filename = filePath(actor.orgId, entityId, documentId);
      const stat = await fs.stat(filename).catch(() => fail('Tệp không còn trên máy chủ.', 404));
      res.statusCode = 200;
      res.setHeader('Content-Type', document.mimeType); res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `inline; filename="document.${document.mimeType === 'application/pdf' ? 'pdf' : document.mimeType === 'image/png' ? 'png' : 'jpg'}"; filename*=UTF-8''${encodeURIComponent(document.name)}`);
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      await pipeline(createReadStream(filename), res); return true;
    }
    if (req.method === 'DELETE') {
      await db.consoleAuditLog.create({ data: log('REMOVE_PRIVATE_DOCUMENT', { id: document.id }) });
      reply(200, { ok: true, documents: await listPrivateDocuments(db, actor.orgId, entityId) }); return true;
    }
    fail('Phương thức không được hỗ trợ.', 405);
  } catch (error: any) {
    if (workingFile) await fs.rm(workingFile, { force: true }).catch(() => {});
    if (!res.headersSent) sendJson(res, Number(error.statusCode) || 500, { ok: false, message: error.statusCode ? error.message : 'Không thể lưu hoặc mở tài liệu. Vui lòng thử lại.' });
    else res.destroy();
    return true;
  }
}
