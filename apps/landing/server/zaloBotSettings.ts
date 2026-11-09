import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { actorHasPermission, isBuildingAllowedForActor, type AuthoritativeConsoleActor } from './authRbac';

type Helpers = { sendJson: (res: ServerResponse, status: number, body: any) => unknown; readJsonBody: (req: IncomingMessage) => Promise<any> };

export async function handleZaloBotSettings(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient, actor: AuthoritativeConsoleActor, helpers: Helpers): Promise<boolean> {
  const statusMatch = pathname.match(/^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/zalo-bot-status$/);
  if (pathname !== '/api/v1/console/v2/settings/zalo-bot' && !statusMatch) return false;
  res.setHeader('Cache-Control', 'no-store');
  if (!actorHasPermission(actor, statusMatch ? 'contracts.manage' : 'settings.manage')) {
    helpers.sendJson(res, 403, { ok: false, message: 'Không có quyền quản lý Zalo Bot.' });
    return true;
  }
  const apiKey = process.env.ADHOME_ZALO_BOT_ADMIN_API_KEY;
  if (!apiKey) {
    helpers.sendJson(res, 503, { ok: false, message: 'Máy chủ chưa cấu hình kênh quản trị Zalo Bot.' });
    return true;
  }
  if (statusMatch) {
    if (req.method !== 'GET') { helpers.sendJson(res, 405, { ok: false, message: 'Phương thức không được hỗ trợ.' }); return true; }
    const contract = await prisma.contract.findFirst({ where: { id: decodeURIComponent(statusMatch[1]), orgId: actor.orgId }, include: { room: { include: { building: true } } } });
    if (!contract || !isBuildingAllowedForActor(actor, contract.buildingId, contract.room.building.code)) { helpers.sendJson(res, 404, { ok: false, message: 'Không tìm thấy hợp đồng.' }); return true; }
    try {
      const target = `https://api.adhome.vn/internal/zalo-bot/${encodeURIComponent(actor.orgId)}/contracts/${encodeURIComponent(contract.id)}/status`;
      const response = await fetch(target, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      helpers.sendJson(res, response.status, { ok: response.ok, ...result });
    } catch { helpers.sendJson(res, 503, { ok: false, message: 'Không kiểm tra được trạng thái Zalo Bot.' }); }
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    helpers.sendJson(res, 405, { ok: false, message: 'Phương thức không được hỗ trợ.' });
    return true;
  }
  const body = req.method === 'POST' ? await helpers.readJsonBody(req) : undefined;
  const target = `https://api.adhome.vn/internal/zalo-bot/${encodeURIComponent(actor.orgId)}`;
  try {
    const response = await fetch(target, { method: req.method, headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (response.ok && req.method === 'POST') {
      await prisma.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, entityType: 'ZALO_BOT', entityId: actor.orgId, action: body?.action === 'setup' ? 'GENERATE_GROUP_SETUP' : 'CONFIGURE_BOT', summary: body?.action === 'setup' ? 'Tạo mã kết nối nhóm quản trị' : 'Cập nhật kết nối Zalo Bot' } });
    }
    helpers.sendJson(res, response.status, { ok: response.ok, ...result });
  } catch {
    helpers.sendJson(res, 503, { ok: false, message: 'Không kết nối được dịch vụ Zalo Bot.' });
  }
  return true;
}
