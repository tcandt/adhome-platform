import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { actorHasPermission, isBuildingAllowedForActor, type AuthoritativeConsoleActor } from './authRbac';

type ProofMeta = { id: string; mimeType: string; size: number; originalName: string };
const root = path.resolve(process.env.ADH_PAYMENT_PROOF_DIR || 'uploads/payment-proofs');
const maxBytes = 8 * 1024 * 1024;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const proofPath = (transactionId: string, proof: ProofMeta) => path.join(root, transactionId, `${proof.id}.${extensions[proof.mimeType]}`);
const validProof = (value: unknown): value is ProofMeta => !!value && typeof value === 'object' &&
  /^[0-9a-f-]{36}$/.test(String((value as any).id || '')) && !!extensions[String((value as any).mimeType || '')] &&
  Number.isSafeInteger(Number((value as any).size)) && typeof (value as any).originalName === 'string';
const validImage = (buffer: Buffer, mimeType: string) => mimeType === 'image/jpeg'
  ? buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
  : mimeType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  : mimeType === 'image/webp' ? buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' : false;
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

export async function paymentProofMap(prisma: PrismaClient, orgId: string, transactionIds: string[]) {
  if (!transactionIds.length) return new Map<string, ProofMeta>();
  const logs = await prisma.consoleAuditLog.findMany({ where: { orgId, entityType: 'PAYMENT_TRANSACTION', entityId: { in: transactionIds }, action: 'ADD_PAYMENT_PROOF' }, orderBy: { createdAt: 'desc' } });
  const result = new Map<string, ProofMeta>();
  for (const log of logs) {
    const proof = (log.metadata as any)?.proof;
    if (!result.has(log.entityId) && validProof(proof)) result.set(log.entityId, proof);
  }
  return result;
}

export async function handlePaymentProof(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient, actor: AuthoritativeConsoleActor): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/payment-transactions\/([A-Za-z0-9-]{1,80})\/proof$/);
  if (!match) return false;
  const transaction = await prisma.paymentTransaction.findFirst({ where: { id: match[1], orgId: actor.orgId }, include: { invoice: { include: { building: { select: { code: true } } } } } });
  if (!transaction?.invoice || !isBuildingAllowedForActor(actor, transaction.invoice.buildingId, transaction.invoice.building.code)) { send(res, 404, { ok: false, message: 'Không tìm thấy giao dịch.' }); return true; }
  const proofs = await paymentProofMap(prisma, actor.orgId, [transaction.id]);
  const existing = proofs.get(transaction.id);
  if (req.method === 'GET') {
    if (!actorHasPermission(actor, 'finance.read') && !actorHasPermission(actor, 'finance.write')) { send(res, 403, { ok: false, message: 'Không có quyền xem chứng từ.' }); return true; }
    if (!existing) { send(res, 404, { ok: false, message: 'Giao dịch chưa có chứng từ.' }); return true; }
    try {
      const body = await fs.readFile(proofPath(transaction.id, existing));
      res.writeHead(200, { 'Content-Type': existing.mimeType, 'Content-Length': body.length, 'Content-Disposition': `inline; filename="${existing.originalName.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
      res.end(body);
    } catch { send(res, 404, { ok: false, message: 'Không tìm thấy tệp chứng từ.' }); }
    return true;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Phương thức không được hỗ trợ.' }); return true; }
  if (!actorHasPermission(actor, 'finance.write')) { send(res, 403, { ok: false, message: 'Không có quyền lưu chứng từ.' }); return true; }
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
  if (!extensions[mimeType]) { send(res, 415, { ok: false, message: 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.' }); return true; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) { send(res, 413, { ok: false, message: 'Ảnh chứng từ vượt quá 8 MB.' }); return true; } chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (!validImage(bytes, mimeType)) { send(res, 422, { ok: false, message: 'Tệp ảnh chứng từ không hợp lệ.' }); return true; }
  let originalName = String(req.headers['x-file-name'] || 'chung-tu');
  try { originalName = decodeURIComponent(originalName); } catch { originalName = 'chung-tu'; }
  const proof: ProofMeta = { id: crypto.randomUUID(), mimeType, size, originalName: originalName.slice(0, 160) };
  const filename = proofPath(transaction.id, proof);
  try {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, bytes, { flag: 'wx' });
    await prisma.consoleAuditLog.create({ data: { orgId: actor.orgId, buildingId: transaction.invoice.buildingId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, entityType: 'PAYMENT_TRANSACTION', entityId: transaction.id, action: 'ADD_PAYMENT_PROOF', summary: `Lưu chứng từ giao dịch ${transaction.externalTxId}`, metadata: { proof } } });
    if (existing) await fs.rm(proofPath(transaction.id, existing), { force: true });
    send(res, 201, { ok: true, proofUrl: `/api/v1/console/v2/payment-transactions/${transaction.id}/proof` });
  } catch {
    await fs.rm(filename, { force: true });
    send(res, 500, { ok: false, message: 'Không lưu được ảnh chứng từ. Vui lòng thử lại.' });
  }
  return true;
}
