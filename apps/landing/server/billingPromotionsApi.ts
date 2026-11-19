import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { actorHasPermission, type AuthoritativeConsoleActor } from './authRbac';

export interface BillingPromotion {
  id: string;
  orgId: string;
  buildingId?: string | null;
  campaignName: string;
  periodKey: string;
  scopeType: 'ALL_ROOMS' | 'SELECTED_ROOMS' | 'ALL_EXCEPT_ROOMS';
  targetRoomCodes: string[];
  discountElectricVnd?: number;
  discountWaterVnd?: number;
  discountRoomVnd?: number;
  discountRoomPercent?: number;
  freeAllUtilities?: boolean;
  status: 'ACTIVE' | 'PAUSED';
  createdAt: string;
}

export async function getActiveBillingPromotions(
  prisma: PrismaClient,
  orgId: string,
  periodKey?: string
): Promise<BillingPromotion[]> {
  try {
    const logs = await prisma.consoleAuditLog.findMany({
      where: {
        orgId,
        entityType: 'BILLING_PROMOTION',
        action: { in: ['CREATE_PROMOTION', 'UPDATE_PROMOTION'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const deletedLogs = await prisma.consoleAuditLog.findMany({
      where: {
        orgId,
        entityType: 'BILLING_PROMOTION',
        action: 'DELETE_PROMOTION',
      },
      select: { entityId: true },
    });
    const deletedIds = new Set(deletedLogs.map((d) => d.entityId));

    const map = new Map<string, BillingPromotion>();
    for (const log of logs) {
      if (deletedIds.has(log.entityId)) continue;
      if (!map.has(log.entityId)) {
        const promo = (log.metadata as any)?.promotion as BillingPromotion;
        if (promo) {
          if (!periodKey || promo.periodKey === periodKey) {
            map.set(log.entityId, promo);
          }
        }
      }
    }
    return Array.from(map.values());
  } catch (err) {
    console.error('[BillingPromotions] Error fetching promotions:', err);
    return [];
  }
}

export function evaluateRoomPromotionDiscounts(params: {
  promotions: BillingPromotion[];
  roomCode: string;
  roomRentVnd: number;
  electricVnd: number;
  waterVnd: number;
}): Array<{
  id: string;
  code: string;
  name: string;
  category: 'DISCOUNT';
  quantity: number;
  unitPriceVnd: number;
  amountVnd: number;
  reason: string;
}> {
  const { promotions, roomCode, roomRentVnd, electricVnd, waterVnd } = params;
  const items: Array<{
    id: string;
    code: string;
    name: string;
    category: 'DISCOUNT';
    quantity: number;
    unitPriceVnd: number;
    amountVnd: number;
    reason: string;
  }> = [];

  for (const promo of promotions) {
    if (promo.status === 'PAUSED') continue;

    // Check scope match
    let matches = false;
    const targetCodes = (promo.targetRoomCodes || []).map((c) => String(c).trim().toUpperCase());
    const normalizedRoom = String(roomCode || '').trim().toUpperCase();

    if (promo.scopeType === 'ALL_ROOMS') {
      matches = true;
    } else if (promo.scopeType === 'SELECTED_ROOMS') {
      matches = targetCodes.includes(normalizedRoom);
    } else if (promo.scopeType === 'ALL_EXCEPT_ROOMS') {
      matches = !targetCodes.includes(normalizedRoom);
    }

    if (!matches) continue;

    // 1. Utilities Discounts
    if (promo.freeAllUtilities) {
      if (electricVnd > 0) {
        items.push({
          id: `promo-${promo.id}-elec`,
          code: 'PROMO_FREE_ELEC',
          name: `[KM] ${promo.campaignName} — Miễn phí 100% điện`,
          category: 'DISCOUNT',
          quantity: 1,
          unitPriceVnd: -electricVnd,
          amountVnd: -electricVnd,
          reason: 'Miễn phí 100% tiền điện',
        });
      }
      if (waterVnd > 0) {
        items.push({
          id: `promo-${promo.id}-water`,
          code: 'PROMO_FREE_WATER',
          name: `[KM] ${promo.campaignName} — Miễn phí 100% nước`,
          category: 'DISCOUNT',
          quantity: 1,
          unitPriceVnd: -waterVnd,
          amountVnd: -waterVnd,
          reason: 'Miễn phí 100% tiền nước',
        });
      }
    } else {
      if (promo.discountElectricVnd && promo.discountElectricVnd > 0 && electricVnd > 0) {
        const discount = Math.min(electricVnd, promo.discountElectricVnd);
        items.push({
          id: `promo-${promo.id}-elec`,
          code: 'PROMO_DISC_ELEC',
          name: `[KM] ${promo.campaignName} — Giảm trừ tiền điện`,
          category: 'DISCOUNT',
          quantity: 1,
          unitPriceVnd: -discount,
          amountVnd: -discount,
          reason: `Giảm ${discount.toLocaleString('vi-VN')} đ tiền điện`,
        });
      }
      if (promo.discountWaterVnd && promo.discountWaterVnd > 0 && waterVnd > 0) {
        const discount = Math.min(waterVnd, promo.discountWaterVnd);
        items.push({
          id: `promo-${promo.id}-water`,
          code: 'PROMO_DISC_WATER',
          name: `[KM] ${promo.campaignName} — Giảm trừ tiền nước`,
          category: 'DISCOUNT',
          quantity: 1,
          unitPriceVnd: -discount,
          amountVnd: -discount,
          reason: `Giảm ${discount.toLocaleString('vi-VN')} đ tiền nước`,
        });
      }
    }

    // 2. Room Rent Discounts
    if (promo.discountRoomVnd && promo.discountRoomVnd > 0 && roomRentVnd > 0) {
      const discount = Math.min(roomRentVnd, promo.discountRoomVnd);
      items.push({
        id: `promo-${promo.id}-rent`,
        code: 'PROMO_DISC_RENT',
        name: `[KM] ${promo.campaignName} — Giảm trừ tiền phòng`,
        category: 'DISCOUNT',
        quantity: 1,
        unitPriceVnd: -discount,
        amountVnd: -discount,
        reason: `Giảm ${discount.toLocaleString('vi-VN')} đ tiền phòng`,
      });
    } else if (promo.discountRoomPercent && promo.discountRoomPercent > 0 && roomRentVnd > 0) {
      const discount = Math.round((roomRentVnd * promo.discountRoomPercent) / 100);
      items.push({
        id: `promo-${promo.id}-rent`,
        code: 'PROMO_DISC_RENT_PCT',
        name: `[KM] ${promo.campaignName} — Giảm ${promo.discountRoomPercent}% tiền phòng`,
        category: 'DISCOUNT',
        quantity: 1,
        unitPriceVnd: -discount,
        amountVnd: -discount,
        reason: `Giảm ${promo.discountRoomPercent}% tiền phòng`,
      });
    }
  }

  return items;
}

export async function handleBillingPromotions(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  prisma: PrismaClient,
  actor: AuthoritativeConsoleActor,
  helpers: {
    sendJson: (res: ServerResponse, status: number, data: unknown) => void;
    readJsonBody: (req: IncomingMessage) => Promise<any>;
  }
): Promise<boolean> {
  const { sendJson, readJsonBody } = helpers;

  // 1. GET /api/v1/console/v2/promotions
  if (req.method === 'GET' && pathname === '/api/v1/console/v2/promotions') {
    if (!actorHasPermission(actor, 'settlements.read')) {
      sendJson(res, 403, { ok: false, message: 'Không có quyền xem khuyến mãi.' });
      return true;
    }
    const url = new URL(req.url || '', 'http://127.0.0.1');
    const periodKey = url.searchParams.get('periodKey') || undefined;
    const promotions = await getActiveBillingPromotions(prisma, actor.orgId, periodKey);
    sendJson(res, 200, { ok: true, promotions });
    return true;
  }

  // 2. POST /api/v1/console/v2/promotions
  if (req.method === 'POST' && pathname === '/api/v1/console/v2/promotions') {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      sendJson(res, 403, { ok: false, message: 'Không có quyền cấu hình khuyến mãi.' });
      return true;
    }
    const body = await readJsonBody(req);
    const campaignName = String(body.campaignName || '').trim();
    const periodKey = String(body.periodKey || '').trim();
    if (!campaignName || !/^\d{4}-\d{2}$/.test(periodKey)) {
      sendJson(res, 400, { ok: false, message: 'Tên chiến dịch và kỳ áp dụng (YYYY-MM) là bắt buộc.' });
      return true;
    }

    const scopeType = ['ALL_ROOMS', 'SELECTED_ROOMS', 'ALL_EXCEPT_ROOMS'].includes(body.scopeType)
      ? body.scopeType
      : 'ALL_ROOMS';

    const targetRoomCodes = Array.isArray(body.targetRoomCodes)
      ? body.targetRoomCodes.map((c: any) => String(c).trim()).filter(Boolean)
      : [];

    const promoId = String(body.id || crypto.randomUUID());
    const promotion: BillingPromotion = {
      id: promoId,
      orgId: actor.orgId,
      buildingId: body.buildingId || null,
      campaignName,
      periodKey,
      scopeType,
      targetRoomCodes,
      discountElectricVnd: Number(body.discountElectricVnd) || undefined,
      discountWaterVnd: Number(body.discountWaterVnd) || undefined,
      discountRoomVnd: Number(body.discountRoomVnd) || undefined,
      discountRoomPercent: Number(body.discountRoomPercent) || undefined,
      freeAllUtilities: Boolean(body.freeAllUtilities),
      status: body.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    await prisma.consoleAuditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PROMOTION',
        entityId: promoId,
        action: 'CREATE_PROMOTION',
        summary: `Tạo đợt khuyến mãi: ${campaignName} (${periodKey})`,
        metadata: { promotion },
      },
    });

    sendJson(res, 201, { ok: true, promotion });
    return true;
  }

  // 3. DELETE /api/v1/console/v2/promotions/:id
  const deleteMatch = pathname.match(/^\/api\/v1\/console\/v2\/promotions\/([A-Za-z0-9-]{1,80})$/);
  if (req.method === 'DELETE' && deleteMatch) {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      sendJson(res, 403, { ok: false, message: 'Không có quyền xóa khuyến mãi.' });
      return true;
    }
    const promoId = deleteMatch[1];
    await prisma.consoleAuditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PROMOTION',
        entityId: promoId,
        action: 'DELETE_PROMOTION',
        summary: `Xóa đợt khuyến mãi ${promoId}`,
      },
    });

    sendJson(res, 200, { ok: true, deletedId: promoId });
    return true;
  }

  return false;
}
