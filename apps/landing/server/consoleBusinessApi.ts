import { availableDeposit, allocateInitialReceipt, vnd } from './rentalFinance';
import { handleRentalWorkflow, saveRentalProfile } from './rentalWorkflowApi';
import { personOccupancy } from './rentalPeople';
import { validateDocumentProfile } from './rentalDocuments';
import { handleDataManagement } from './dataManagementApi';
import { handleContractDocuments } from './contractDocumentsApi';
import { handlePrivateDocuments } from './privateDocuments';
import { handlePaymentIntegrations } from './paymentIntegrationApi';
import { handleZaloBotSettings } from './zaloBotSettings';
import { splitSharedCharge, sharedWaterCharge } from './sharedRoomBilling';
import { handleConsoleRoomImages, publicRoomImages, roomImages } from './roomImagesApi';
import { handlePaymentProof, paymentProofMap } from './paymentProofApi';
import { normalizeBuildingLandlord, readBuildingLandlords, writeBuildingLandlord } from './buildingLandlord';
import { readHunonicHistory } from "./hunonicHistory";
import { buildSettlementWorkspacePayload, handleSettlementCenterApi } from './settlementCenterApi';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  actorHasPermission,
  isBuildingAllowedForActor,
  type AuthoritativeConsoleActor,
} from './authRbac';
import {
  encryptSecret,
  decryptSecret,
  maskSecretHint,
} from './cryptoVault';
import {
  HunonicCloudClient,
  validateKwhReading,
  calculateWaterBill,
  type WaterBillingMethod,
  type HunonicJsonSnapshot,
  readJsonSnapshot,
  exportAtomicJsonSnapshot,
  cacheHunonicInventory,
  isHunonicInventoryForAccount,
} from './hunonicAdapter';
import { executeHunonicBackgroundSync } from './hunonicSyncWorker';
import { readHunonicCredentials } from './hunonicCredentials';
import { serializeHunonicInventory } from './hunonicInventory';

export interface ConsoleBusinessApiDeps {
  executeSeoSyncJobWithRetry: (
    jobId: string,
    simulateFailFirstAttempt?: boolean
  ) => Promise<{
    jobId: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
}

const VALID_WATER_METHODS = new Set([
  'PER_M3',
  'PER_PERSON',
  'FIXED_PER_ROOM',
]);

const VALID_OCCUPANCY_STATUSES = new Set([
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'MAINTENANCE',
  'ARCHIVED',
]);

const VALID_FURNISHED_LEVELS = new Set(['FULL', 'BASIC', 'UNFURNISHED']);

export const ACTIVE_CONTRACT_STATUSES = [
  'ACTIVE',
  'EXPIRING',
  'EXTENDED',
] as const;
export type ActiveContractStatus = (typeof ACTIVE_CONTRACT_STATUSES)[number];

export function isActiveContract(status: string | null | undefined): boolean {
  return (
    typeof status === 'string' &&
    (ACTIVE_CONTRACT_STATUSES as readonly string[]).includes(status)
  );
}

export interface FirstPeriodRentCalc {
  policy: 'CALENDAR_PRORATE' | 'ANNIVERSARY_CYCLE' | 'FULL_FIRST_MONTH' | 'CUSTOM_FIRST_CYCLE';
  daysInMonth: number;
  billedDays: number;
  periodKey: string;
  periodStartDate: string;
  periodEndDate: string;
  monthlyRentVnd: number;
  rentFirstPeriodVnd: number;
  formula: string;
}

/**
 * Calculates first billing period rent supporting CALENDAR_PRORATE, ANNIVERSARY_CYCLE, and FULL_FIRST_MONTH.
 * Example (E2E-09): Start Nov 23, 2026 -> 8 / 30 days of Nov -> 4.500.000 * 8 / 30 = 1.200.000 VND
 */
export function calculateFirstPeriodRent(
  policy: string | undefined,
  startDate: string,
  monthlyRentVnd: number,
  customFirstPeriodVnd?: number
): FirstPeriodRentCalc {
  const [y, m, d] = startDate.split('-').map(Number);
  const periodKey = `${y}-${String(m).padStart(2, '0')}`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const validPolicy = (['CALENDAR_PRORATE', 'ANNIVERSARY_CYCLE', 'FULL_FIRST_MONTH', 'CUSTOM_FIRST_CYCLE'].includes(String(policy))
    ? policy
    : 'CALENDAR_PRORATE') as FirstPeriodRentCalc['policy'];

  if (validPolicy === 'CUSTOM_FIRST_CYCLE' && customFirstPeriodVnd !== undefined && customFirstPeriodVnd >= 0) {
    const periodEndDate = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return {
      policy: 'CUSTOM_FIRST_CYCLE',
      daysInMonth,
      billedDays: Math.max(1, daysInMonth - d + 1),
      periodKey,
      periodStartDate: startDate,
      periodEndDate,
      monthlyRentVnd,
      rentFirstPeriodVnd: Math.trunc(customFirstPeriodVnd),
      formula: `Tùy chỉnh phê duyệt: ${Math.trunc(customFirstPeriodVnd).toLocaleString('vi-VN')} đ`,
    };
  }

  if (validPolicy === 'ANNIVERSARY_CYCLE') {
    const target = new Date(y, m, d);
    target.setDate(target.getDate() - 1);
    const endIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    return {
      policy: 'ANNIVERSARY_CYCLE',
      daysInMonth,
      billedDays: daysInMonth,
      periodKey,
      periodStartDate: startDate,
      periodEndDate: endIso,
      monthlyRentVnd,
      rentFirstPeriodVnd: monthlyRentVnd,
      formula: `Chu kỳ tròn tháng (${startDate} → ${endIso}): ${monthlyRentVnd.toLocaleString('vi-VN')} đ`,
    };
  }

  if (validPolicy === 'FULL_FIRST_MONTH') {
    const endIso = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return {
      policy: 'FULL_FIRST_MONTH',
      daysInMonth,
      billedDays: daysInMonth,
      periodKey,
      periodStartDate: startDate,
      periodEndDate: endIso,
      monthlyRentVnd,
      rentFirstPeriodVnd: monthlyRentVnd,
      formula: `Trọn tháng dương lịch ${periodKey}: ${monthlyRentVnd.toLocaleString('vi-VN')} đ`,
    };
  }

  // Default: CALENDAR_PRORATE
  const billedDays = daysInMonth - d + 1; // inclusive of start date to month end
  const rentFirstPeriodVnd =
    billedDays === daysInMonth
      ? monthlyRentVnd
      : Math.round((monthlyRentVnd * billedDays) / daysInMonth);
  const periodEndDate = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  return {
    policy: 'CALENDAR_PRORATE',
    daysInMonth,
    billedDays,
    periodKey,
    periodStartDate: startDate,
    periodEndDate,
    monthlyRentVnd,
    rentFirstPeriodVnd,
    formula:
      billedDays === daysInMonth
        ? `Trọn tháng (${billedDays}/${daysInMonth} ngày): ${monthlyRentVnd.toLocaleString('vi-VN')} đ`
        : `${monthlyRentVnd.toLocaleString('vi-VN')} đ × (${billedDays}/${daysInMonth} ngày: ${startDate} → ${periodEndDate}) = ${rentFirstPeriodVnd.toLocaleString('vi-VN')} đ`,
  };
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
  );
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 128 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getCurrentVnPeriodKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '10';
  return `${y}-${m}`;
}

function getCurrentVnDateIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getTodayIsoVn(): string {
  return getCurrentVnDateIso();
}

function computeSupplementaryContractEndDate(startDate: string, durationMonths: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || ![6, 12].includes(durationMonths)) return '';
  const [year, month, day] = startDate.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate.toISOString().slice(0, 10);
}

function formatIsoToDdMmYyyy(isoDate?: string | null): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Đang cập nhật';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function normalizeVnPhone(raw: string): string {
  const cleaned = raw.replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) {
    return '0' + cleaned.slice(3);
  }
  return cleaned;
}

function isValidVnPhone(raw: string): boolean {
  const norm = normalizeVnPhone(raw);
  return /^0(3|5|7|8|9)[0-9]{8}$/.test(norm);
}

function toSafeVndNumber(val: bigint | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'bigint' ? Number(val) : Math.trunc(val);
}

function computeServiceCycleEndIso(startDateIso: string): string {
  try {
    const [y, m, d] = startDateIso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  } catch {
    return startDateIso;
  }
}

async function handleWithIdempotency(
  prisma: PrismaClient,
  orgId: string,
  action: string,
  keyHeader: string | string[] | undefined,
  requestPayload: any,
  res: any,
  fn: () => Promise<{ status: number; body: any }>
): Promise<void> {
  const rawKey = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) {
    try {
      const result = await fn();
      return sendJson(res, result.status, result.body);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      return sendJson(res, statusCode, {
        ok: false,
        errorCode: err.errorCode || 'INTERNAL_ERROR',
        message: statusCode < 500 ? err.message || 'Kiểm tra lại thông tin.' : 'Không thể lưu giao dịch. Vui lòng thử lại hoặc liên hệ quản lý.',
      });
    }
  }

  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(requestPayload || {}))
    .digest('hex');

  // Try atomic insert with status = PROCESSING
  let isClaimed = false;
  try {
    await prisma.idempotencyRecord.create({
      data: {
        orgId,
        action,
        idempotencyKey: key,
        requestHash,
        status: 'PROCESSING',
      },
    });
    isClaimed = true;
  } catch {
    // Unique violation - already claimed or processed
    isClaimed = false;
  }

  if (!isClaimed) {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        orgId_action_idempotencyKey: {
          orgId,
          action,
          idempotencyKey: key,
        },
      },
    });

    if (existing) {
      // 1. Check request fingerprint mismatch
      if (existing.requestHash && existing.requestHash !== requestHash) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
          message: 'Idempotency-Key đã được sử dụng trước đó cho một yêu cầu có nội dung khác.',
        });
      }

      // 2. If already SUCCEEDED, replay saved response
      if (existing.status === 'SUCCEEDED' && existing.responseStatus) {
        res.setHeader('x-idempotent-replay', 'true');
        const bodyObj =
          typeof existing.responseBody === 'object' && existing.responseBody !== null
            ? { ...existing.responseBody, replay: true }
            : existing.responseBody;
        return sendJson(res, existing.responseStatus, bodyObj);
      }

      // 3. If currently PROCESSING, wait briefly for concurrent execution
      if (existing.status === 'PROCESSING') {
        const pollStart = Date.now();
        while (Date.now() - pollStart < 3000) {
          await new Promise((r) => setTimeout(r, 120));
          const polled = await prisma.idempotencyRecord.findUnique({
            where: {
              orgId_action_idempotencyKey: {
                orgId,
                action,
                idempotencyKey: key,
              },
            },
          });
          if (polled && polled.status === 'SUCCEEDED' && polled.responseStatus) {
            res.setHeader('x-idempotent-replay', 'true');
            const bodyObj =
              typeof polled.responseBody === 'object' && polled.responseBody !== null
                ? { ...polled.responseBody, replay: true }
                : polled.responseBody;
            return sendJson(res, polled.responseStatus, bodyObj);
          }
          if (polled && polled.status === 'FAILED') {
            break;
          }
        }
        return sendJson(res, 409, {
          ok: false,
          errorCode: 'CONCURRENT_REQUEST_IN_PROGRESS',
          message: 'Yêu cầu với Idempotency-Key này đang được xử lý bởi một tác vụ khác. Vui lòng thử lại sau giây lát.',
        });
      }

      // 4. If FAILED, reclaim for retry
      try {
        await prisma.idempotencyRecord.update({
          where: {
            orgId_action_idempotencyKey: {
              orgId,
              action,
              idempotencyKey: key,
            },
          },
          data: {
            status: 'PROCESSING',
            requestHash,
            responseStatus: null,
            responseBody: Prisma.DbNull,
          },
        });
        isClaimed = true;
      } catch {
        return sendJson(res, 409, {
          ok: false,
          errorCode: 'CONCURRENT_REQUEST_IN_PROGRESS',
          message: 'Xung đột khóa đồng thời khi thử lại yêu cầu.',
        });
      }
    }
  }

  // Execute business logic under atomic claim
  try {
    const result = await fn();
    try {
      await prisma.idempotencyRecord.update({
        where: {
          orgId_action_idempotencyKey: {
            orgId,
            action,
            idempotencyKey: key,
          },
        },
        data: {
          status: 'SUCCEEDED',
          responseStatus: result.status,
          responseBody: result.body,
        },
      });
    } catch {
      // Invariant preserved
    }
    return sendJson(res, result.status, result.body);
  } catch (err: any) {
    try {
      await prisma.idempotencyRecord.update({
        where: {
          orgId_action_idempotencyKey: {
            orgId,
            action,
            idempotencyKey: key,
          },
        },
        data: {
          status: 'FAILED',
          responseStatus: err.statusCode || 500,
          responseBody: {
            ok: false,
            errorCode: err.errorCode || 'INTERNAL_ERROR',
            message: err.statusCode && err.statusCode < 500 ? err.message : 'Không thể lưu giao dịch. Vui lòng thử lại hoặc liên hệ quản lý.',
          },
        },
      });
    } catch {
      // Invariant preserved
    }
    const statusCode = err.statusCode || 500;
    return sendJson(res, statusCode, {
      ok: false,
      errorCode: err.errorCode || 'INTERNAL_ERROR',
      message: statusCode < 500 ? err.message || 'Kiểm tra lại thông tin.' : 'Không thể lưu giao dịch. Vui lòng thử lại hoặc liên hệ quản lý.',
    });
  }
}

function slugifyVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function parseMaxOccupantsNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.min(12, Math.trunc(raw)));
  }
  const str = String(raw || '');
  const matches = str.match(/\d+/g);
  if (!matches || matches.length === 0) return 2;
  const last = Number(matches[matches.length - 1]);
  return Number.isFinite(last) && last > 0 ? Math.min(12, last) : 2;
}

function mapFurnishedLabel(level: string): string {
  if (level === 'FULL') return 'Full nội thất';
  if (level === 'BASIC') return 'Nội thất cơ bản';
  return 'Phòng trống cơ bản';
}

function mapOccupancyToPublicStatus(occupancyStatus: string): string {
  if (occupancyStatus === 'AVAILABLE') return 'AVAILABLE';
  if (occupancyStatus === 'RESERVED') return 'RESERVED';
  return 'OCCUPIED';
}

const DEFAULT_INTEGRATION_DEFS = [
  {
    providerId: 'HUNONIC',
    category: 'METERING',
    displayName: 'Đồng hồ điện thông minh Hunonic',
    capabilities: [
      'REMOTE_KWH_SYNC',
      'INSTANT_POWER_W',
      'CUMULATIVE_KWH',
      'PROVIDER_COST_REF',
    ],
  },
  {
    providerId: 'SEPAY',
    category: 'PAYMENT',
    displayName: 'SePay (Biến động số dư & VietQR)',
    capabilities: ['VIETQR_DYNAMIC', 'BANK_WEBHOOK', 'AUTO_RECONCILE'],
  },
  {
    providerId: 'PAYOS',
    category: 'PAYMENT',
    displayName: 'payOS (Link thanh toán & VietQR)',
    capabilities: [
      'PAYMENT_LINK',
      'VIETQR_DYNAMIC',
      'SIGNED_WEBHOOK',
      'PAYMENT_CANCEL',
    ],
  },
  {
    providerId: 'TINGEE',
    category: 'PAYMENT',
    displayName: 'Tingee (Open Banking & Loa thông báo)',
    capabilities: ['VIETQR_DYNAMIC', 'SIGNED_WEBHOOK', 'SOUND_BOX_NOTIFY'],
  },
] as const;

const DEFAULT_NOTIFICATION_DEFS = [
  {
    channelType: 'ZALO_OA',
    displayName: 'Zalo Official Account / ZBS',
    subscribedEvents: ['INVOICE_ISSUED', 'PAYMENT_CONFIRMED', 'INVOICE_OVERDUE'],
  },
  {
    channelType: 'ZALO_BOT',
    displayName: 'Zalo Bot vận hành nội bộ',
    subscribedEvents: ['NEW_LEAD_INQUIRY', 'PAYMENT_CONFIRMED'],
  },
  {
    channelType: 'TELEGRAM_BOT',
    displayName: 'Telegram Bot cảnh báo kỹ thuật & đối soát',
    subscribedEvents: [
      'NEW_LEAD_INQUIRY',
      'HUNONIC_METER_STALE',
      'PAYMENT_UNMATCHED',
    ],
  },
  {
    channelType: 'FACEBOOK_MESSENGER',
    displayName: 'Facebook Page / Messenger Send API',
    subscribedEvents: ['NEW_LEAD_INQUIRY'],
  },
] as const;

const DEFAULT_CRON_DEFS = [
  {
    jobKey: 'HUNONIC_HOURLY_SYNC',
    displayName: 'Đồng bộ chỉ số công tơ Hunonic định kỳ',
    cronExpression: '0 * * * *',
  },
  {
    jobKey: 'HUNONIC_STALE_CHECK',
    displayName: 'Kiểm tra công tơ mất kết nối / dữ liệu cũ',
    cronExpression: '15 */2 * * *',
  },
  {
    jobKey: 'BILLING_PERIOD_CUTOFF',
    displayName: 'Chốt chỉ số cuối kỳ & khởi tạo bảng tổng hợp nháp',
    cronExpression: '0 6 1 * *',
  },
  {
    jobKey: 'INVOICE_REMINDER_DUE',
    displayName: 'Gửi nhắc thanh toán hóa đơn trước ngày đến hạn',
    cronExpression: '0 8 * * *',
  },
  {
    jobKey: 'INVOICE_OVERDUE_SCAN',
    displayName: 'Quét hóa đơn quá hạn & kích hoạt nhắc nợ',
    cronExpression: '30 8 * * *',
  },
  {
    jobKey: 'CONTRACT_EXPIRY_SCAN',
    displayName: 'Cảnh báo hợp đồng sắp hết hạn (30 / 15 / 7 ngày)',
    cronExpression: '0 9 * * *',
  },
  {
    jobKey: 'RESERVATION_HOLD_EXPIRE',
    displayName: 'Tự động giải phóng phiếu giữ chỗ quá thời hạn',
    cronExpression: '*/30 * * * *',
  },
  {
    jobKey: 'PAYMENT_RECONCILE_SWEEP',
    displayName: 'Đối soát lại giao dịch cổng thanh toán chờ khớp',
    cronExpression: '*/15 * * * *',
  },
  {
    jobKey: 'SEO_SITEMAP_AUDIT',
    displayName: 'Kiểm tra đồng bộ phòng công khai Landing & Sitemap',
    cronExpression: '0 3 * * *',
  },
] as const;

let bootstrapPromise: Promise<void> | null = null;

/**
 * Idempotently ensures Console V2 relational foundation is synced with existing
 * PostgreSQL organizations, buildings, floors, and public room listings.
 * Never fabricates fake business revenue, fake tenants, or fake online IoT status.
 */
export async function ensureConsoleV2Bootstrap(
  prisma: PrismaClient
): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // 1. Scrub any legacy PII columns from public_room_listings so public tables never retain tenant PII
    await prisma.publicRoomListing.updateMany({
      where: {
        OR: [
          { currentTenantName: { not: null } },
          { currentTenantPhone: { not: null } },
        ],
      },
      data: {
        currentTenantName: null,
        currentTenantPhone: null,
      },
    });

    // 2. Backfill ConsoleRoom + ElectricMeter(UNCONFIGURED) for every existing PublicRoomListing
    const publicRooms = await prisma.publicRoomListing.findMany({
      orderBy: { displayOrder: 'asc' },
    });

    for (const pub of publicRooms) {
      let floorId = pub.floorId;
      if (!floorId) {
        const candidateFloorId = `FLR-${pub.buildingCode}-0${pub.floorNumber}`;
        const floor = await prisma.floor.upsert({
          where: {
            buildingId_floorNumber: {
              buildingId: pub.buildingId,
              floorNumber: pub.floorNumber,
            },
          },
          update: {},
          create: {
            id: candidateFloorId,
            orgId: pub.orgId,
            buildingId: pub.buildingId,
            floorNumber: pub.floorNumber,
            name: pub.floorName || `Tầng ${pub.floorNumber}`,
          },
        });
        floorId = floor.id;
        await prisma.publicRoomListing.update({
          where: { id: pub.id },
          data: { floorId },
        });
      }

      const existingConsoleRoom = await prisma.consoleRoom.findFirst({
        where: {
          OR: [
            { publicListingId: pub.id },
            { buildingId: pub.buildingId, code: pub.roomCode },
          ],
        },
      });

      const mappedOccupancy =
        pub.status === 'AVAILABLE'
          ? 'AVAILABLE'
          : pub.status === 'RESERVED'
          ? 'RESERVED'
          : 'OCCUPIED';

      const consoleRoom = existingConsoleRoom
        ? await prisma.consoleRoom.update({
            where: { id: existingConsoleRoom.id },
            data: {
              publicListingId: pub.id,
              publicSlug: pub.slug,
              isPublishedToLanding: pub.isPublic,
            },
          })
        : await prisma.consoleRoom.create({
            data: {
              orgId: pub.orgId,
              buildingId: pub.buildingId,
              floorId,
              publicListingId: pub.id,
              code: pub.roomCode,
              title: pub.shortTitle || pub.title,
              roomType: pub.roomType,
              area: pub.area,
              listPriceVnd: BigInt(pub.price),
              depositMonths: pub.depositMonths,
              maxOccupants: parseMaxOccupantsNumber(pub.maxOccupants),
              rentalModel: pub.rentalModel || 'ENTIRE_ROOM',
              occupancyStatus: mappedOccupancy,
              furnishedLevel: VALID_FURNISHED_LEVELS.has(pub.furnishedLevel)
                ? pub.furnishedLevel
                : 'FULL',
              amenities: (pub.amenities ?? []) as Prisma.InputJsonValue,
              media: (pub.images ?? []) as Prisma.InputJsonValue,
              availableFrom: pub.availableFrom,
              isPublishedToLanding: pub.isPublic,
              publicSlug: pub.slug,
              displayOrder: pub.displayOrder,
            },
          });

      await prisma.electricMeter.upsert({
        where: { roomId: consoleRoom.id },
        update: {},
        create: {
          orgId: pub.orgId,
          roomId: consoleRoom.id,
          connectionStatus: 'UNCONFIGURED',
        },
      });
    }

    // 3. Seed honest UNCONFIGURED integration, notification & cron records per organization
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      for (const integ of DEFAULT_INTEGRATION_DEFS) {
        await prisma.integrationConnection.upsert({
          where: {
            orgId_providerId: {
              orgId: org.id,
              providerId: integ.providerId,
            },
          },
          update: {
            capabilities: [...integ.capabilities] as Prisma.InputJsonValue,
          },
          create: {
            orgId: org.id,
            providerId: integ.providerId,
            category: integ.category,
            displayName: integ.displayName,
            isEnabled: false,
            status: 'UNCONFIGURED',
            capabilities: [...integ.capabilities] as Prisma.InputJsonValue,
          },
        });
      }

      for (const ch of DEFAULT_NOTIFICATION_DEFS) {
        await prisma.notificationChannelConfig.upsert({
          where: {
            orgId_channelType: {
              orgId: org.id,
              channelType: ch.channelType,
            },
          },
          update: {},
          create: {
            orgId: org.id,
            channelType: ch.channelType,
            displayName: ch.displayName,
            isEnabled: false,
            status: 'UNCONFIGURED',
            subscribedEvents: [
              ...ch.subscribedEvents,
            ] as Prisma.InputJsonValue,
          },
        });
      }

      for (const job of DEFAULT_CRON_DEFS) {
        await prisma.cronJobConfig.upsert({
          where: {
            orgId_jobKey: {
              orgId: org.id,
              jobKey: job.jobKey,
            },
          },
          update: {},
          create: {
            orgId: org.id,
            jobKey: job.jobKey,
            displayName: job.displayName,
            cronExpression: job.cronExpression,
            timezone: 'Asia/Ho_Chi_Minh',
            isEnabled: false,
            lastRunStatus: 'NEVER_RUN',
          },
        });
      }
    }
  })().catch((err) => {
    bootstrapPromise = null;
    throw err;
  });

  return bootstrapPromise;
}

async function resolveScopedBuildings(
  prisma: PrismaClient,
  actor: AuthoritativeConsoleActor,
  requestedBuildingsParam: string | null,
  includeArchived: boolean = true
) {
  const allOrgBuildings = await prisma.building.findMany({
    where: {
      orgId: actor.orgId,
      ...(includeArchived ? {} : { isActive: true }),
    },
    include: {
      floors: {
        orderBy: { floorNumber: 'asc' },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const authorizedBuildings = allOrgBuildings.filter((b) =>
    isBuildingAllowedForActor(actor, b.id, b.code)
  );
  const authorizedIdSet = new Set(authorizedBuildings.map((b) => b.id));

  if (!requestedBuildingsParam || !requestedBuildingsParam.trim()) {
    return {
      authorizedBuildings,
      selectedBuildingIds: authorizedBuildings
        .filter((b) => b.status !== 'ARCHIVED')
        .map((b) => b.id),
      forbiddenRequestedIds: [] as string[],
    };
  }

  const rawIds = requestedBuildingsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawIds.includes('ALL') || rawIds.includes('*')) {
    return {
      authorizedBuildings,
      selectedBuildingIds: authorizedBuildings
        .filter((b) => b.status !== 'ARCHIVED')
        .map((b) => b.id),
      forbiddenRequestedIds: [] as string[],
    };
  }

  const forbiddenRequestedIds = rawIds.filter((id) => !authorizedIdSet.has(id));
  const selectedBuildingIds = rawIds.filter((id) => authorizedIdSet.has(id));

  return {
    authorizedBuildings,
    selectedBuildingIds,
    forbiddenRequestedIds,
  };
}

export async function handleConsoleV2Api(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  urlObj: URL,
  prisma: PrismaClient,
  actor: AuthoritativeConsoleActor,
  clientIp: string,
  deps: ConsoleBusinessApiDeps
): Promise<void> {
  await ensureConsoleV2Bootstrap(prisma);

  const method = req.method || 'GET';
  if (await handlePrivateDocuments(req, res, pathname, prisma, actor, { sendJson })) return;
  if (await handleConsoleRoomImages(req, res, pathname, prisma, actor)) return;
  if (await handlePaymentProof(req, res, pathname, prisma, actor)) return;
  if (await handleZaloBotSettings(req, res, pathname, prisma, actor, { sendJson, readJsonBody })) return;
  if (await handlePaymentIntegrations(req, res, pathname, prisma, actor, { sendJson, readJsonBody })) return;
  if (await handleContractDocuments(req, res, pathname, prisma, actor, { sendJson, readJsonBody })) return;
  if (await handleRentalWorkflow(req, res, pathname, prisma, actor, { sendJson, readJsonBody, calculateFirstPeriodRent, handleWithIdempotency })) return;
  if (await handleDataManagement(req, res, pathname, prisma, actor)) return;
  const periodParam = urlObj.searchParams.get('period');
  const activePeriod =
    periodParam && /^\d{4}-\d{2}$/.test(periodParam)
      ? periodParam
      : getCurrentVnPeriodKey();
  const buildingsParam = urlObj.searchParams.get('buildings');

  // ===========================================================================
  // 1. GET /api/v1/console/v2/bootstrap
  // ===========================================================================
  if (method === 'GET' && pathname === '/api/v1/console/v2/bootstrap') {
    if (
      !actorHasPermission(actor, 'overview.read') &&
      !actorHasPermission(actor, 'rooms.read')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền truy cập dữ liệu vận hành Console.',
      });
    }

    const {
      authorizedBuildings,
      selectedBuildingIds,
      forbiddenRequestedIds,
    } = await resolveScopedBuildings(prisma, actor, buildingsParam, true);

    if (forbiddenRequestedIds.length > 0 && selectedBuildingIds.length === 0) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập tòa nhà ngoài phạm vi được phân công.',
      });
    }

    const authorizedBuildingIds = authorizedBuildings.map((b) => b.id);
    const effectiveBuildingIds =
      selectedBuildingIds.length > 0 ? selectedBuildingIds : [];

    const [
      org,
      allAuthorizedRooms,
      allOrgTenants,
      activeContracts,
      activeReservations,
      periodInvoices,
      allUnpaidInvoices,
      periodLedger,
      hunonicConn,
      rawLeads,
      readNotifications,
    ] = await Promise.all([
      prisma.organization.findUnique({ where: { id: actor.orgId } }),
      prisma.consoleRoom.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: authorizedBuildingIds },
        },
        include: {
          floor: true,
          building: true,
          electricMeter: true,
          occupants: { where: { OR: [{ isActive: true }, { occupancyStatus: 'SCHEDULED', contract: { status: { in: ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXTENDED'] } } }] } },
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.tenant.findMany({
        where: { orgId: actor.orgId, isActive: true },
        include: {
          occupants: {
            include: {
              room: { include: { building: true } },
              contract: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contract.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: authorizedBuildingIds },
          status: { in: [...ACTIVE_CONTRACT_STATUSES] },
        },
        include: { tenant: true },
      }),
      prisma.roomReservation.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: authorizedBuildingIds },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
      prisma.invoice.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: effectiveBuildingIds },
          periodKey: activePeriod,
          status: { not: 'VOID' },
        },
      }),
      prisma.invoice.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: authorizedBuildingIds },
          status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          orgId: actor.orgId,
          periodKey: activePeriod,
          ...(effectiveBuildingIds.length > 0
            ? {
                OR: [
                  { buildingId: { in: effectiveBuildingIds } },
                  ...(actor.role === 'ADMIN' ? [{ buildingId: null }] : []),
                ],
              }
            : { buildingId: '__NONE__' }),
        },
      }),
      prisma.integrationConnection.findUnique({
        where: {
          orgId_providerId: {
            orgId: actor.orgId,
            providerId: 'HUNONIC',
          },
        },
      }),
      prisma.leadInquiry.findMany({
        where: { orgId: actor.orgId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.consoleNotificationRead.findMany({
        where: { actorId: actor.id },
      }),
    ]);

    const authorizedRoomMap = new Map(allAuthorizedRooms.map((r) => [r.id, r]));
    const authorizedRoomCodeSet = new Set(
      allAuthorizedRooms.map((r) => r.code)
    );
    const authorizedBuildingSet = new Set(authorizedBuildingIds);
    const effectiveBuildingSet = new Set(effectiveBuildingIds);

    const contractByRoomId = new Map(
      activeContracts.map((c) => [c.roomId, c])
    );
    const contractByTenantId = new Map(
      activeContracts.map((c) => [c.tenantId, c])
    );
    const tenantByRoomId = new Map<string, (typeof allOrgTenants)[number]>();
    for (const t of allOrgTenants) {
      if (t.currentRoomId && !tenantByRoomId.has(t.currentRoomId)) {
        tenantByRoomId.set(t.currentRoomId, t);
      }
    }

    const unpaidByRoomId = new Map<
      string,
      { count: number; amountVnd: number }
    >();
    for (const inv of allUnpaidInvoices) {
      const due = Math.max(
        0,
        toSafeVndNumber(inv.totalAmountVnd) -
          toSafeVndNumber(inv.paidAmountVnd)
      );
      const prev = unpaidByRoomId.get(inv.roomId) || { count: 0, amountVnd: 0 };
      unpaidByRoomId.set(inv.roomId, {
        count: prev.count + 1,
        amountVnd: prev.amountVnd + due,
      });
    }

    // Filter tenants strictly within authorized scope
    const scopedTenants = allOrgTenants
      .filter((t) => {
        if (actor.role === 'ADMIN') return true;
        if (t.primaryBuildingId && authorizedBuildingSet.has(t.primaryBuildingId)) {
          return true;
        }
        if (t.currentRoomId) {
          const rm = authorizedRoomMap.get(t.currentRoomId);
          if (rm && authorizedBuildingSet.has(rm.buildingId)) return true;
        }
        return false;
      })
      .filter((t) => {
        if (effectiveBuildingSet.size === authorizedBuildingSet.size) return true;
        const rm = t.currentRoomId ? authorizedRoomMap.get(t.currentRoomId) : null;
        const bId = rm?.buildingId || t.primaryBuildingId;
        return bId ? effectiveBuildingSet.has(bId) : actor.role === 'ADMIN';
      });

    const canReadLandlord = actorHasPermission(actor, 'buildings.manage') || actorHasPermission(actor, 'contracts.manage');
    const buildingLandlords = canReadLandlord ? await readBuildingLandlords(prisma, actor.orgId, authorizedBuildingIds) : new Map();
    const buildingsDto = authorizedBuildings.map((b) => {
      const bRooms = allAuthorizedRooms.filter(
        (r) => r.buildingId === b.id && r.occupancyStatus !== 'ARCHIVED'
      );
      const bContracts = activeContracts.filter((c) => c.buildingId === b.id);
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        streetAddress: b.streetAddress,
        ward: b.ward,
        province: b.province,
        buildingType: b.buildingType,
        status: b.status,
        isActive: b.isActive,
        description: b.description || '',
        managerName: b.managerName || '',
        managerPhone: b.managerPhone || '',
        landlord: canReadLandlord ? buildingLandlords.get(b.id) || {} : undefined,
        electricRateVnd:
          b.electricRateVnd ?? org?.defaultElectricRateVnd ?? 3800,
        waterBillingMethod:
          b.waterBillingMethod ?? org?.defaultWaterMethod ?? 'PER_M3',
        waterRateVnd: b.waterRateVnd ?? org?.defaultWaterRateVnd ?? 15000,
        floors: b.floors.map((f) => ({
          id: f.id,
          buildingId: f.buildingId,
          floorNumber: f.floorNumber,
          name: f.name,
          roomCount: bRooms.filter((r) => r.floorId === f.id).length,
        })),
        stats: {
          floorsCount: b.floors.length,
          totalRooms: bRooms.length,
          availableRooms: bRooms.filter((r) => r.occupancyStatus === 'AVAILABLE')
            .length,
          reservedRooms: bRooms.filter((r) => r.occupancyStatus === 'RESERVED')
            .length,
          occupiedRooms: bRooms.filter((r) => r.occupancyStatus === 'OCCUPIED')
            .length,
          maintenanceRooms: bRooms.filter(
            (r) => r.occupancyStatus === 'MAINTENANCE'
          ).length,
          publishedRooms: bRooms.filter((r) => r.isPublishedToLanding).length,
          contractedMonthlyVnd: bContracts.reduce(
            (sum, c) => sum + toSafeVndNumber(c.monthlyRentVnd),
            0
          ),
        },
      };
    });

    const filteredRooms = allAuthorizedRooms.filter(
      (r) =>
        effectiveBuildingSet.has(r.buildingId) &&
        r.occupancyStatus !== 'ARCHIVED'
    );

    const activeReservationByRoomId = new Map(
      activeReservations.map((res) => [res.roomId, res])
    );

    const latestHunonicSnapshot = await readJsonSnapshot(actor.orgId);
    const cloudDevices = isHunonicInventoryForAccount(latestHunonicSnapshot, readHunonicCredentials(hunonicConn?.credentialsJson).phone) ? latestHunonicSnapshot!.devices || [] : [];
    const cloudById = new Map(cloudDevices.map(device => [device.id, device]));
    const roomsDto = filteredRooms.map((r) => {
      const contract = contractByRoomId.get(r.id);
      const tenant = contract?.tenant || tenantByRoomId.get(r.id) || null;
      const unpaid = unpaidByRoomId.get(r.id) || { count: 0, amountVnd: 0 };
      const effectiveWaterMethod =
        r.waterBillingMethod ||
        r.building.waterBillingMethod ||
        org?.defaultWaterMethod ||
        'PER_M3';
      const effectiveWaterRateVnd =
        r.waterRateVnd ??
        r.building.waterRateVnd ??
        org?.defaultWaterRateVnd ??
        15000;
      const effectiveElectricRateVnd =
        (r.electricBillingMode === 'HUNONIC_AUTO' && r.electricMeter?.tariffVerifiedAt && r.electricMeter.tariffMode === 'custom' ? r.electricMeter.tariffRateVnd : null) ??
        r.electricRateVnd ??
        r.building.electricRateVnd ??
        org?.defaultElectricRateVnd ??
        3800;

      const resv = activeReservationByRoomId.get(r.id);
      const cloudMeter = r.electricMeter?.hunonicDeviceId ? cloudById.get(r.electricMeter.hunonicDeviceId) : undefined;

      return {
        id: r.id,
        buildingId: r.buildingId,
        buildingCode: r.building.code,
        buildingName: r.building.name,
        floorId: r.floorId,
        floorNumber: r.floor.floorNumber,
        floorName: r.floor.name,
        code: r.code,
        title: r.title,
        roomType: r.roomType,
        rentalModel: r.rentalModel || 'ENTIRE_ROOM',
        totalBeds: r.totalBeds || 1,
        area: r.area,
        listPriceVnd: toSafeVndNumber(r.listPriceVnd),
        depositMonths: r.depositMonths,
        maxOccupants: r.maxOccupants,
        occupancyStatus: r.occupancyStatus,
        furnishedLevel: r.furnishedLevel,
        amenities: Array.isArray(r.amenities) ? (r.amenities as string[]) : [],
        images: roomImages(r.images),
        availableFrom: r.availableFrom,
        waterBillingMethod: r.waterBillingMethod,
        waterRateVnd: r.waterRateVnd,
        electricBillingMode: (r as any).electricBillingMode || 'HUNONIC_AUTO',
        electricRateVnd: r.electricRateVnd,
        effectiveWaterMethod,
        effectiveWaterRateVnd,
        effectiveElectricRateVnd,
        isPublishedToLanding: r.isPublishedToLanding,
        publicSlug: r.publicSlug,
        internalNotes: r.internalNotes || '',
        meterStatus: cloudMeter?.connectionStatus || 'UNCONFIGURED',
        meterLastSyncedAt: r.electricMeter?.lastSyncedAt?.toISOString() || null,
        electricMeter: r.electricMeter
          ? {
              id: r.electricMeter.id,
              hunonicDeviceId: r.electricMeter.hunonicDeviceId,
              meterSerial: r.electricMeter.meterSerial,
              deviceName: cloudMeter?.name || null,
              providerDeviceId: cloudMeter?.providerDeviceId || null,
              monthReportedKwh: cloudMeter?.monthReportedKwh ?? null,
              reportedMonth: cloudMeter?.reportedMonth || null,
              providerReportedAt: cloudMeter?.providerReportedAt || null,
              meterMode: (r.electricMeter as any).meterMode || 'HUNONIC_AUTO',
              meterType: (r.electricMeter as any).meterType || 'ROOM',
              tariffMode: (r.electricMeter as any).tariffMode || 'custom',
              tariffRateVnd: (r.electricMeter as any).tariffRateVnd || 3800,
              tariffVerifiedAt: (r.electricMeter as any).tariffVerifiedAt?.toISOString() || null,
              readingBasis: (r.electricMeter as any).readingBasis || 'CUMULATIVE',
              connectionStatus: r.electricMeter.connectionStatus,
              cumulativeKwh: cloudMeter?.cumulativeKwh ?? null,
              instantPowerW: cloudMeter?.instantPowerW ?? null,
              lastSyncedAt: r.electricMeter.lastSyncedAt?.toISOString() || null,
            }
          : null,
        occupants: ((r as any).occupants || []).map((occ: any) => ({
          id: occ.id,
          tenantId: occ.tenantId,
          contractId: occ.contractId,
          fullName: occ.fullName,
          phone: occ.phone,
          idNumber: occ.idNumber,
          relationToPrimary: occ.relationToPrimary,
          residenceRegStatus: occ.residenceRegStatus,
          moveInDate: occ.moveInDate,
          moveOutDate: occ.moveOutDate,
          occupancyStatus: occ.occupancyStatus,
          isActive: occ.isActive,
        })),
        activeReservation: resv
          ? {
              id: resv.id,
              reservationCode: resv.reservationCode,
              customerName: resv.customerName,
              customerPhone: resv.customerPhone,
              holdAmountVnd: toSafeVndNumber(resv.holdAmountVnd),
              status: resv.status,
              holdUntil: resv.holdUntil?.toISOString() || null,
              expectedMoveIn: resv.expectedMoveIn,
            }
          : null,
        currentTenant: tenant
          ? {
              id: tenant.id,
              fullName: tenant.fullName,
              phone: tenant.phone,
              residenceRegStatus: tenant.residenceRegStatus,
            }
          : null,
        activeContract: contract
          ? {
              id: contract.id,
              contractCode: contract.contractCode,
              startDate: contract.startDate,
              endDate: contract.endDate,
              monthlyRentVnd: toSafeVndNumber(contract.monthlyRentVnd),
              status: contract.status,
            }
          : null,
        activeContracts: activeContracts.filter(item => item.roomId === r.id).map(item => ({ id: item.id, contractCode: item.contractCode, tenantId: item.tenantId, tenantName: item.tenant.fullName, status: item.status })),
        unpaidInvoicesCount: unpaid.count,
        unpaidAmountVnd: unpaid.amountVnd,
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    const tenantsDto = scopedTenants.map((t) => {
      const rm = t.currentRoomId ? authorizedRoomMap.get(t.currentRoomId) : null;
      const bld = authorizedBuildings.find(
        (b) => b.id === (rm?.buildingId || t.primaryBuildingId)
      );
      const contract = contractByTenantId.get(t.id) || null;
      return {
        id: t.id,
        fullName: t.fullName,
        phone: t.phone,
        email: t.email || '',
        idNumber: t.idNumber || '',
        residenceRegStatus: t.residenceRegStatus,
        emergencyContact: t.emergencyContact || '',
        notes: t.notes || '',
        primaryBuildingId: bld?.id || t.primaryBuildingId || null,
        buildingCode: bld?.code || null,
        buildingName: bld?.name || null,
        currentRoomId: rm?.id || null,
        currentRoomCode: rm?.code || null,
        activeContractCode: contract?.contractCode || null,
        activeContractEndDate: contract?.endDate || null,
        monthlyRentVnd: contract ? toSafeVndNumber(contract.monthlyRentVnd) : null,
        occupancyHistory: t.occupants.map((occupancy) => {
          let secondaryContract: any = {};
          try { secondaryContract = JSON.parse(occupancy.notes || '{}')?.secondaryContract || {}; } catch { secondaryContract = {}; }
          return {
            id: occupancy.id,
            roomId: occupancy.roomId,
            roomCode: occupancy.room.code,
            buildingId: occupancy.room.buildingId,
            buildingCode: occupancy.room.building.code,
            contractId: occupancy.contractId,
            contractCode: occupancy.contract?.contractCode || secondaryContract.legalContractCode || null,
            relationToPrimary: occupancy.relationToPrimary,
            moveInDate: occupancy.moveInDate,
            moveOutDate: occupancy.moveOutDate,
            occupancyStatus: occupancy.occupancyStatus,
            isActive: occupancy.isActive,
            moveOutReason: secondaryContract.moveOutReason || null,
          };
        }),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    // Scoped leads
    const scopedLeads = rawLeads.filter((inq) => {
      if (actor.role === 'ADMIN' && effectiveBuildingSet.size === authorizedBuildingSet.size) {
        return true;
      }
      if (inq.roomCode && authorizedRoomCodeSet.has(inq.roomCode)) {
        const matched = allAuthorizedRooms.find((r) => r.code === inq.roomCode);
        return matched ? effectiveBuildingSet.has(matched.buildingId) : false;
      }
      return actor.role === 'ADMIN';
    });

    // Real Notifications derived from PostgreSQL state minus ConsoleNotificationRead
    const readKeySet = new Set(readNotifications.map((n) => n.notificationKey));
    const notificationItems: Array<{
      key: string;
      category: 'LEAD' | 'INVOICE' | 'CONTRACT';
      title: string;
      description: string;
      targetModule: string;
      createdAt: string;
      isRead: boolean;
    }> = [];

    for (const lead of scopedLeads.filter((l) => l.status === 'NEW').slice(0, 8)) {
      const key = `lead:${lead.id}`;
      notificationItems.push({
        key,
        category: 'LEAD',
        title: `Yêu cầu xem phòng mới (${lead.referenceCode})`,
        description: `${lead.fullName} · ${lead.phone}${
          lead.roomCode ? ` · Phòng ${lead.roomCode}` : ''
        }`,
        targetModule: 'deposits',
        createdAt: lead.createdAt.toISOString(),
        isRead: readKeySet.has(key),
      });
    }

    for (const inv of allUnpaidInvoices
      .filter(
        (i) =>
          i.status === 'OVERDUE' && effectiveBuildingSet.has(i.buildingId)
      )
      .slice(0, 6)) {
      const key = `invoice-overdue:${inv.id}`;
      notificationItems.push({
        key,
        category: 'INVOICE',
        title: `Hóa đơn quá hạn ${inv.invoiceCode}`,
        description: `Kỳ ${inv.periodKey} · Hạn ${inv.dueDate}`,
        targetModule: 'invoices',
        createdAt: inv.updatedAt.toISOString(),
        isRead: readKeySet.has(key),
      });
    }

    for (const ct of activeContracts
      .filter(
        (c) =>
          c.status === 'EXPIRING' && effectiveBuildingSet.has(c.buildingId)
      )
      .slice(0, 6)) {
      const key = `contract-expiring:${ct.id}`;
      notificationItems.push({
        key,
        category: 'CONTRACT',
        title: `Hợp đồng sắp hết hạn ${ct.contractCode}`,
        description: `${ct.tenant.fullName} · Hết hạn ${ct.endDate}`,
        targetModule: 'contracts',
        createdAt: ct.updatedAt.toISOString(),
        isRead: readKeySet.has(key),
      });
    }

    const unreadCount = notificationItems.filter((n) => !n.isRead).length;

    const filteredContracts = activeContracts.filter((c) =>
      effectiveBuildingSet.has(c.buildingId)
    );
    const filteredReservations = activeReservations.filter((r) =>
      effectiveBuildingSet.has(r.buildingId)
    );
    const filteredUnpaidInvoices = allUnpaidInvoices.filter((i) =>
      effectiveBuildingSet.has(i.buildingId)
    );

    const totalRooms = roomsDto.length;
    const occupiedRooms = roomsDto.filter(
      (r) => r.occupancyStatus === 'OCCUPIED'
    ).length;
    const availableRooms = roomsDto.filter(
      (r) => r.occupancyStatus === 'AVAILABLE'
    ).length;
    const reservedRooms = roomsDto.filter(
      (r) => r.occupancyStatus === 'RESERVED'
    ).length;
    const maintenanceRooms = roomsDto.filter(
      (r) => r.occupancyStatus === 'MAINTENANCE'
    ).length;

    const occupancyRatePercent =
      totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 1000) / 10 : 0;

    const contractedMonthlyRentVnd = filteredContracts.reduce(
      (sum, c) => sum + toSafeVndNumber(c.monthlyRentVnd),
      0
    );
    const occupiedListValueVnd = roomsDto
      .filter((r) => r.occupancyStatus === 'OCCUPIED')
      .reduce((sum, r) => sum + r.listPriceVnd, 0);

    const periodInvoicedVnd = periodInvoices.reduce(
      (sum, i) => sum + toSafeVndNumber(i.totalAmountVnd),
      0
    );
    const periodCollectedVnd = periodInvoices.reduce(
      (sum, i) => sum + toSafeVndNumber(i.paidAmountVnd),
      0
    );
    const periodReceivableVnd = Math.max(
      0,
      periodInvoicedVnd - periodCollectedVnd
    );

    const periodIncomeVnd = actorHasPermission(actor, 'finance.read')
      ? periodLedger
          .filter((l) => l.entryType === 'INCOME')
          .reduce((sum, l) => sum + toSafeVndNumber(l.amountVnd), 0)
      : 0;
    const periodExpenseVnd = actorHasPermission(actor, 'finance.read')
      ? periodLedger
          .filter((l) => l.entryType === 'EXPENSE')
          .reduce((sum, l) => sum + toSafeVndNumber(l.amountVnd), 0)
      : 0;

    const hunonicOnlineMeters = roomsDto.filter(
      (r) => r.meterStatus === 'ONLINE'
    ).length;

    return sendJson(res, 200, {
      ok: true,
      activePeriod,
      syncedAt: new Date().toISOString(),
      organization: org
        ? {
            id: org.id,
            slug: org.slug,
            name: org.name,
            hotline: org.hotline,
            contactEmail: org.contactEmail,
            addressSummary: org.addressSummary,
            timezone: org.timezone,
            defaultElectricRateVnd: org.defaultElectricRateVnd,
            defaultWaterMethod: org.defaultWaterMethod,
            defaultWaterRateVnd: org.defaultWaterRateVnd,
            defaultDepositMonths: org.defaultDepositMonths,
            catalogVersion: org.catalogVersion,
          }
        : null,
      actorScope: {
        role: actor.role,
        buildingScopes: actor.buildingScopes,
        capabilities: actor.capabilities,
      },
      selectedBuildingIds: effectiveBuildingIds,
      buildings: buildingsDto,
      rooms: roomsDto,
      tenants: tenantsDto,
      kpis: {
        buildingsCount: buildingsDto.filter((b) =>
          effectiveBuildingSet.has(b.id)
        ).length,
        floorsCount: buildingsDto
          .filter((b) => effectiveBuildingSet.has(b.id))
          .reduce((sum, b) => sum + b.floors.length, 0),
        totalRooms,
        availableRooms,
        reservedRooms,
        occupiedRooms,
        maintenanceRooms,
        publishedLandingRooms: roomsDto.filter((r) => r.isPublishedToLanding)
          .length,
        occupancyRatePercent,
        tenantsCount: tenantsDto.length,
        activeContractsCount: filteredContracts.length,
        expiringContractsCount: filteredContracts.filter(
          (c) => c.status === 'EXPIRING'
        ).length,
        activeReservationsCount: filteredReservations.length,
        contractedMonthlyRentVnd,
        occupiedListValueVnd,
        periodInvoicedVnd,
        periodCollectedVnd,
        periodReceivableVnd,
        overdueInvoicesCount: filteredUnpaidInvoices.filter(
          (i) => i.status === 'OVERDUE'
        ).length,
        unpaidInvoicesCount: filteredUnpaidInvoices.length,
        periodIncomeVnd,
        periodExpenseVnd,
        periodNetCashflowVnd: periodIncomeVnd - periodExpenseVnd,
        hunonicStatus: hunonicConn?.status || 'UNCONFIGURED',
        hunonicOnlineMeters,
        hunonicTotalMeters: totalRooms,
        newLeadsCount: scopedLeads.filter((l) => l.status === 'NEW').length,
      },
      recentLeads: scopedLeads.slice(0, 10).map((l) => ({
        id: l.id,
        referenceCode: l.referenceCode,
        fullName: l.fullName,
        phone: l.phone,
        inquiryType: l.inquiryType,
        roomCode: l.roomCode,
        roomTitle: l.roomTitle,
        preferredMoveInDateDisplay: l.preferredMoveInDateDisplay,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
      notifications: {
        unreadCount,
        items: notificationItems,
      },
      moduleCounts: {
        buildings: buildingsDto.filter((b) => b.status !== 'ARCHIVED').length,
        rooms: allAuthorizedRooms.filter((r) => r.occupancyStatus !== 'ARCHIVED')
          .length,
        tenants: tenantsDto.length,
        deposits: filteredReservations.length,
        contracts: filteredContracts.length,
        invoicesUnpaid: filteredUnpaidInvoices.length,
      },
    });
  }

  // ===========================================================================
  // 2. POST /api/v1/console/v2/notifications/mark-read
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/notifications/mark-read') {
    const body = await readJsonBody(req);
    const keys = Array.isArray(body.keys)
      ? body.keys
          .map((k) => String(k || '').trim())
          .filter((k) => k.length > 0 && k.length <= 160)
      : [];

    for (const key of keys) {
      await prisma.consoleNotificationRead.upsert({
        where: {
          actorId_notificationKey: {
            actorId: actor.id,
            notificationKey: key,
          },
        },
        update: { readAt: new Date() },
        create: {
          actorId: actor.id,
          notificationKey: key,
        },
      });
    }

    return sendJson(res, 200, {
      ok: true,
      markedCount: keys.length,
    });
  }

  // ===========================================================================
  // 3. BUILDINGS CRUD (/api/v1/console/v2/buildings*)
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/buildings') {
    if (!actorHasPermission(actor, 'buildings.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Chỉ Quản trị viên được phép khởi tạo tòa nhà mới.',
      });
    }

    const body = await readJsonBody(req);
    const rawCode = String(body.code || '')
      .trim()
      .toUpperCase();
    const name = String(body.name || '').trim() || rawCode;
    const streetAddress = String(body.streetAddress || '').trim();
    const ward = String(body.ward || '').trim();
    const province = String(body.province || '').trim();
    const buildingType = String(body.buildingType || 'SERVICED_APARTMENT').trim();
    const description = String(body.description || '').trim() || null;
    const managerName = String(body.managerName || '').trim() || null;
    const managerPhone = String(body.managerPhone || '').trim() || null;
    const initialFloorsCount = Math.max(
      0,
      Math.min(20, Math.trunc(Number(body.initialFloorsCount ?? 0) || 0))
    );

    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(rawCode)) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message:
          'Vui lòng nhập mã tòa nhà hợp lệ.',
      });
    }

    const existing = await prisma.building.findUnique({
      where: {
        orgId_code: {
          orgId: actor.orgId,
          code: rawCode,
        },
      },
    });
    if (existing) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'BUILDING_CODE_EXISTS',
        message: `Mã tòa nhà "${rawCode}" đã tồn tại trong tổ chức.`,
      });
    }

    let landlord: Record<string, string> = {};
    try { if (body.landlord !== undefined) landlord = normalizeBuildingLandlord(body.landlord); }
    catch (error: any) { return sendJson(res, 422, { ok: false, message: error.message }); }
    const bldId = `bld-${rawCode.toLowerCase()}-${crypto
      .randomBytes(2)
      .toString('hex')}`;
    const currentCount = await prisma.building.count({
      where: { orgId: actor.orgId },
    });

    const created = await prisma.$transaction(async (tx) => {
      const bld = await tx.building.create({
        data: {
          id: bldId,
          orgId: actor.orgId,
          code: rawCode,
          name,
          streetAddress,
          ward,
          province,
          buildingType,
          status: body.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
          isActive: body.status !== 'ARCHIVED',
          description,
          managerName,
          managerPhone,
          displayOrder: currentCount + 1,
        },
      });

      if (body.landlord !== undefined) await writeBuildingLandlord(tx, actor.orgId, bld.id, landlord);

      for (let i = 1; i <= initialFloorsCount; i++) {
        await tx.floor.create({
          data: {
            id: `FLR-${rawCode}-${String(i).padStart(2, '0')}-${crypto
              .randomBytes(2)
              .toString('hex')}`,
            orgId: actor.orgId,
            buildingId: bld.id,
            floorNumber: i,
            name: `Tầng ${i}`,
          },
        });
      }

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: bld.id,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'BUILDING',
          entityId: bld.id,
          action: 'CREATE_BUILDING',
          summary: `Khởi tạo tòa nhà ${bld.name} (${bld.code}) với ${initialFloorsCount} tầng`,
          metadata: { clientIp, initialFloorsCount },
        },
      });

      return { ...bld, landlord };
    });

    return sendJson(res, 201, {
      ok: true,
      building: created,
    });
  }

  // GET /api/v1/console/v2/buildings/:id/delete-check
  const bldDeleteCheckMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/buildings\/([^/]+)\/delete-check$/
  );
  if (method === 'GET' && bldDeleteCheckMatch) {
    const buildingId = decodeURIComponent(bldDeleteCheckMatch[1]);
    const bld = await prisma.building.findUnique({ where: { id: buildingId } });
    if (!bld || bld.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'BUILDING_NOT_FOUND',
        message: 'Không tìm thấy tòa nhà.',
      });
    }
    if (!isBuildingAllowedForActor(actor, bld.id, bld.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập tòa nhà này.',
      });
    }

    const [
      occupiedRooms,
      totalRooms,
      activeContracts,
      activeReservations,
      unpaidInvoices,
    ] = await Promise.all([
      prisma.consoleRoom.count({
        where: { buildingId: bld.id, occupancyStatus: 'OCCUPIED' },
      }),
      prisma.consoleRoom.count({ where: { buildingId: bld.id } }),
      prisma.contract.count({
        where: { buildingId: bld.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
      }),
      prisma.roomReservation.count({
        where: { buildingId: bld.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      }),
      prisma.invoice.count({
        where: {
          buildingId: bld.id,
          status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        },
      }),
    ]);

    const blockingReasons: string[] = [];
    if (occupiedRooms > 0) {
      blockingReasons.push(`Còn ${occupiedRooms} phòng đang có khách lưu trú`);
    }
    if (activeContracts > 0) {
      blockingReasons.push(`Còn ${activeContracts} hợp đồng đang hiệu lực`);
    }
    if (activeReservations > 0) {
      blockingReasons.push(`Còn ${activeReservations} phiếu đặt cọc / giữ chỗ`);
    }
    if (unpaidInvoices > 0) {
      blockingReasons.push(`Còn ${unpaidInvoices} hóa đơn chưa tất toán`);
    }

    return sendJson(res, 200, {
      ok: true,
      canHardDelete:
        blockingReasons.length === 0 &&
        actorHasPermission(actor, 'buildings.manage'),
      canArchive: actorHasPermission(actor, 'buildings.manage'),
      totalRooms,
      blockingReasons,
    });
  }

  // PATCH or DELETE /api/v1/console/v2/buildings/:id
  const bldIdMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/buildings\/([^/]+)$/
  );
  if (bldIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!actorHasPermission(actor, 'buildings.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Chỉ Quản trị viên có quyền chỉnh sửa hoặc xóa tòa nhà.',
      });
    }

    const buildingId = decodeURIComponent(bldIdMatch[1]);
    const existing = await prisma.building.findUnique({
      where: { id: buildingId },
    });
    if (!existing || existing.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'BUILDING_NOT_FOUND',
        message: 'Không tìm thấy tòa nhà trong tổ chức.',
      });
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      try { if (body.landlord !== undefined) normalizeBuildingLandlord(body.landlord); }
      catch (error: any) { return sendJson(res, 422, { ok: false, message: error.message }); }
      if (body.floorsCount !== undefined &&
        (typeof body.floorsCount !== 'number' || !Number.isInteger(body.floorsCount) || body.floorsCount < 0 || body.floorsCount > 103)) {
        return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Số tầng phải là số nguyên từ 0 đến 103.' });
      }
      const nextName =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : existing.name;
      const nextCode =
        typeof body.code === 'string' && body.code.trim()
          ? body.code
              .trim()
              .toUpperCase()
          : existing.code;
      if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(nextCode)) {
        return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Mã tòa nhà chỉ gồm chữ không dấu, số, dấu chấm và gạch ngang.' });
      }
      const nextStatus =
        body.status === 'ARCHIVED' || body.status === 'ACTIVE'
          ? body.status
          : existing.status;

      if (nextCode !== existing.code) {
        const dup = await prisma.building.findUnique({
          where: { orgId_code: { orgId: actor.orgId, code: nextCode } },
        });
        if (dup) {
          return sendJson(res, 409, {
            ok: false,
            errorCode: 'BUILDING_CODE_EXISTS',
            message: `Mã tòa nhà "${nextCode}" đã tồn tại.`,
          });
        }
      }

      const nextWaterMethod =
        body.waterBillingMethod === null
          ? null
          : typeof body.waterBillingMethod === 'string' &&
            VALID_WATER_METHODS.has(body.waterBillingMethod)
          ? body.waterBillingMethod
          : existing.waterBillingMethod;

      let seoJobId: string | null = null;
      const updated = await prisma.$transaction(async (tx) => {
        if (body.floorsCount !== undefined) {
          const floors = await tx.floor.findMany({
            where: { buildingId: existing.id },
            orderBy: { floorNumber: 'desc' },
            include: { _count: { select: { rooms: true } } },
          });
          const target = body.floorsCount as number;
          if (target < floors.length) {
            const removed = floors.slice(0, floors.length - target);
            const occupied = removed.filter(floor => floor._count.rooms > 0);
            if (occupied.length) {
              return { ok: false as const, message: `Không thể giảm số tầng: ${occupied.map(floor => floor.name).join(', ')} đang có phòng. Vui lòng chuyển hoặc xóa phòng trước.` };
            }
            await tx.floor.deleteMany({ where: { id: { in: removed.map(floor => floor.id) }, buildingId: existing.id } });
          } else if (target > floors.length) {
            const used = new Set(floors.map(floor => floor.floorNumber));
            const available = Array.from({ length: 99 }, (_, i) => i + 1).filter(number => !used.has(number));
            const needed = target - floors.length;
            if (needed > available.length) {
              return { ok: false as const, message: 'Không còn số tầng khả dụng trong khoảng 1 đến 99.' };
            }
            await tx.floor.createMany({ data: available.slice(0, needed).map(number => ({
              id: `FLR-${existing.id}-${number}-${crypto.randomBytes(4).toString('hex')}`,
              orgId: actor.orgId,
              buildingId: existing.id,
              floorNumber: number,
              name: `Tầng ${number}`,
            })) });
          }
        }
        const bld = await tx.building.update({
          where: { id: existing.id },
          data: {
            name: nextName,
            code: nextCode,
            streetAddress:
              typeof body.streetAddress === 'string'
                ? body.streetAddress.trim()
                : existing.streetAddress,
            ward:
              typeof body.ward === 'string'
                ? body.ward.trim()
                : existing.ward,
            province:
              typeof body.province === 'string'
                ? body.province.trim()
                : existing.province,
            buildingType:
              typeof body.buildingType === 'string' && body.buildingType.trim()
                ? body.buildingType.trim()
                : existing.buildingType,
            status: nextStatus,
            isActive: nextStatus === 'ACTIVE',
            description:
              typeof body.description === 'string'
                ? body.description.trim() || null
                : existing.description,
            managerName:
              typeof body.managerName === 'string'
                ? body.managerName.trim() || null
                : existing.managerName,
            managerPhone:
              typeof body.managerPhone === 'string'
                ? body.managerPhone.trim() || null
                : existing.managerPhone,
            electricRateVnd:
              body.electricRateVnd === null
                ? null
                : typeof body.electricRateVnd === 'number' &&
                  body.electricRateVnd >= 0
                ? Math.trunc(body.electricRateVnd)
                : existing.electricRateVnd,
            waterBillingMethod: nextWaterMethod,
            waterRateVnd:
              body.waterRateVnd === null
                ? null
                : typeof body.waterRateVnd === 'number' && body.waterRateVnd >= 0
                ? Math.trunc(body.waterRateVnd)
                : existing.waterRateVnd,
          },
        });

        const landlords = await readBuildingLandlords(tx, actor.orgId, [existing.id]);
        const landlord = body.landlord === undefined ? landlords.get(existing.id) || {} : normalizeBuildingLandlord(body.landlord, landlords.get(existing.id));
        if (body.landlord !== undefined) await writeBuildingLandlord(tx, actor.orgId, existing.id, landlord);

        if (nextStatus === 'ARCHIVED') {
          await tx.consoleRoom.updateMany({
            where: { buildingId: bld.id },
            data: { isPublishedToLanding: false },
          });
          await tx.publicRoomListing.updateMany({
            where: { buildingId: bld.id },
            data: { isPublic: false },
          });
          await tx.organization.update({
            where: { id: actor.orgId },
            data: { catalogVersion: { increment: 1 } },
          });
          const job = await tx.seoSyncJob.create({
            data: {
              orgId: actor.orgId,
              roomId: bld.id,
              roomSlug: `building-archive-${bld.code.toLowerCase()}`,
              triggerAction: 'CONSOLE_BUILDING_ARCHIVE',
              status: 'PENDING',
            },
          });
          seoJobId = job.id;
        }

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: bld.id,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'BUILDING',
            entityId: bld.id,
            action:
              nextStatus === 'ARCHIVED' ? 'ARCHIVE_BUILDING' : 'UPDATE_BUILDING',
            summary: `Cập nhật tòa nhà ${bld.name} (${bld.code}) · trạng thái ${bld.status}`,
            metadata: { clientIp },
          },
        });

        return { ok: true as const, building: { ...bld, landlord } };
      });

      if (!updated.ok) {
        return sendJson(res, 409, { ok: false, errorCode: 'FLOOR_COUNT_CONFLICT', message: updated.message });
      }
      if (seoJobId) {
        await deps.executeSeoSyncJobWithRetry(seoJobId);
      }

      return sendJson(res, 200, { ok: true, building: updated.building });
    }

    // DELETE Building
    const [occupiedRooms, activeContracts, activeReservations, unpaidInvoices] =
      await Promise.all([
        prisma.consoleRoom.count({
          where: { buildingId: existing.id, occupancyStatus: 'OCCUPIED' },
        }),
        prisma.contract.count({
          where: {
            buildingId: existing.id,
            status: { in: [...ACTIVE_CONTRACT_STATUSES] },
          },
        }),
        prisma.roomReservation.count({
          where: {
            buildingId: existing.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        prisma.invoice.count({
          where: {
            buildingId: existing.id,
            status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
          },
        }),
      ]);

    if (
      occupiedRooms > 0 ||
      activeContracts > 0 ||
      activeReservations > 0 ||
      unpaidInvoices > 0
    ) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'DELETE_BLOCKED_BY_DEPENDENCIES',
        message:
          'Không thể xóa vĩnh viễn tòa nhà đang có khách lưu trú, hợp đồng, đặt cọc hoặc hóa đơn chưa tất toán. Vui lòng sử dụng chế độ Lưu trữ (Archive).',
      });
    }

    let seoJobId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const pubCount = await tx.publicRoomListing.count({
        where: { buildingId: existing.id, isPublic: true },
      });
      await tx.consoleRoom.deleteMany({ where: { buildingId: existing.id } });
      await tx.publicRoomListing.deleteMany({
        where: { buildingId: existing.id },
      });
      await tx.floor.deleteMany({ where: { buildingId: existing.id } });
      await tx.building.delete({ where: { id: existing.id } });

      if (pubCount > 0) {
        await tx.organization.update({
          where: { id: actor.orgId },
          data: { catalogVersion: { increment: 1 } },
        });
        const job = await tx.seoSyncJob.create({
          data: {
            orgId: actor.orgId,
            roomId: existing.id,
            roomSlug: `building-delete-${existing.code.toLowerCase()}`,
            triggerAction: 'CONSOLE_BUILDING_DELETE',
            status: 'PENDING',
          },
        });
        seoJobId = job.id;
      }

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'BUILDING',
          entityId: existing.id,
          action: 'DELETE_BUILDING',
          summary: `Xóa tòa nhà ${existing.name} (${existing.code})`,
          metadata: { clientIp },
        },
      });
    });

    if (seoJobId) {
      await deps.executeSeoSyncJobWithRetry(seoJobId);
    }

    return sendJson(res, 200, { ok: true, deletedId: existing.id });
  }

  // ===========================================================================
  // 4. FLOORS CRUD (/api/v1/console/v2/floors*)
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/floors') {
    if (
      !actorHasPermission(actor, 'rooms.manage') &&
      !actorHasPermission(actor, 'buildings.manage')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thêm tầng.',
      });
    }

    const body = await readJsonBody(req);
    const buildingId = String(body.buildingId || '').trim();
    const floorNumber = Math.trunc(Number(body.floorNumber));
    const name =
      String(body.name || '').trim() ||
      (floorNumber === 0 ? 'Tầng trệt' : `Tầng ${floorNumber}`);

    const bld = await prisma.building.findUnique({ where: { id: buildingId } });
    if (!bld || bld.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'BUILDING_NOT_FOUND',
        message: 'Không tìm thấy tòa nhà.',
      });
    }
    if (!isBuildingAllowedForActor(actor, bld.id, bld.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền thao tác trên tòa nhà ngoài phạm vi phụ trách.',
      });
    }
    if (!Number.isInteger(floorNumber) || floorNumber < -3 || floorNumber > 99) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Số tầng phải là số nguyên từ -3 đến 99.',
      });
    }

    const existingFloor = await prisma.floor.findUnique({
      where: {
        buildingId_floorNumber: {
          buildingId: bld.id,
          floorNumber,
        },
      },
    });
    if (existingFloor) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'FLOOR_EXISTS',
        message: `Tầng số ${floorNumber} đã tồn tại trong tòa nhà ${bld.code}.`,
      });
    }

    const floorId = `FLR-${bld.code}-${String(floorNumber).padStart(
      2,
      '0'
    )}-${crypto.randomBytes(2).toString('hex')}`;

    const created = await prisma.$transaction(async (tx) => {
      const flr = await tx.floor.create({
        data: {
          id: floorId,
          orgId: actor.orgId,
          buildingId: bld.id,
          floorNumber,
          name,
        },
      });
      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: bld.id,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'FLOOR',
          entityId: flr.id,
          action: 'CREATE_FLOOR',
          summary: `Thêm ${flr.name} vào tòa nhà ${bld.code}`,
          metadata: { clientIp, floorNumber },
        },
      });
      return flr;
    });

    return sendJson(res, 201, { ok: true, floor: created });
  }

  const flrDeleteMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/floors\/([^/]+)$/
  );
  if (method === 'DELETE' && flrDeleteMatch) {
    if (
      !actorHasPermission(actor, 'rooms.manage') &&
      !actorHasPermission(actor, 'buildings.manage')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền xóa tầng.',
      });
    }

    const floorId = decodeURIComponent(flrDeleteMatch[1]);
    const flr = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { building: true },
    });
    if (!flr || flr.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'FLOOR_NOT_FOUND',
        message: 'Không tìm thấy tầng.',
      });
    }
    if (!isBuildingAllowedForActor(actor, flr.buildingId, flr.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền xóa tầng thuộc tòa nhà ngoài phạm vi phụ trách.',
      });
    }

    const roomCount = await prisma.consoleRoom.count({
      where: { floorId: flr.id },
    });
    if (roomCount > 0) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'FLOOR_NOT_EMPTY',
        message: `Không thể xóa ${flr.name} khi đang có ${roomCount} phòng trên tầng này.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.floor.delete({ where: { id: flr.id } });
      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: flr.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'FLOOR',
          entityId: flr.id,
          action: 'DELETE_FLOOR',
          summary: `Xóa ${flr.name} khỏi tòa nhà ${flr.building.code}`,
          metadata: { clientIp },
        },
      });
    });

    return sendJson(res, 200, { ok: true, deletedId: flr.id });
  }

  // ===========================================================================
  // 5. ROOMS CRUD & LANDING PUBLISH SYNC (/api/v1/console/v2/rooms*)
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/rooms') {
    if (!actorHasPermission(actor, 'rooms.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền tạo phòng.',
      });
    }

    const body = await readJsonBody(req);
    const items = Array.isArray(body.rooms) ? body.rooms : [body];
    if (items.length === 0 || items.length > 50) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Số lượng phòng tạo mỗi lần phải từ 1 đến 50.',
      });
    }

    const firstBuildingId = String(
      (items[0] as Record<string, unknown>).buildingId || ''
    ).trim();
    const bld = await prisma.building.findUnique({
      where: { id: firstBuildingId },
      include: { floors: true },
    });
    if (!bld || bld.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'BUILDING_NOT_FOUND',
        message: 'Không tìm thấy tòa nhà.',
      });
    }
    if (!isBuildingAllowedForActor(actor, bld.id, bld.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền tạo phòng cho tòa nhà ngoài phạm vi phụ trách.',
      });
    }

    const floorMap = new Map(bld.floors.map((f) => [f.id, f]));
    const todayIso = getCurrentVnDateIso();
    const currentRoomCount = await prisma.consoleRoom.count({
      where: { orgId: actor.orgId },
    });

    const normalizedInputs: Array<{
      floorId: string;
      floorNumber: number;
      floorName: string;
      code: string;
      title: string;
      roomType: string;
      area: number;
      listPriceVnd: number;
      depositMonths: number;
      maxOccupants: number;
      occupancyStatus: string;
      furnishedLevel: string;
      amenities: string[];
      isPublishedToLanding: boolean;
      internalNotes: string | null;
    }> = [];

    const seenBatchCodes = new Set<string>();

    for (const raw of items as Array<Record<string, unknown>>) {
      const floorId = String(raw.floorId || '').trim();
      const flr = floorMap.get(floorId);
      if (!flr) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'FLOOR_NOT_FOUND',
          message: 'Tầng được chọn không thuộc tòa nhà này.',
        });
      }

      const code = String(raw.code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9.-]/g, '');
      const area = Number(raw.area);
      const listPriceVnd = Math.trunc(Number(raw.listPriceVnd ?? raw.price));
      const depositMonths = Math.max(
        0,
        Math.min(12, Math.trunc(Number(raw.depositMonths ?? 1)))
      );
      const maxOccupants = Math.max(
        1,
        Math.min(12, Math.trunc(Number(raw.maxOccupants ?? 2)))
      );
      const roomType = String(raw.roomType || 'Studio').trim();
      const occupancyStatus = VALID_OCCUPANCY_STATUSES.has(
        String(raw.occupancyStatus || 'AVAILABLE')
      )
        ? String(raw.occupancyStatus || 'AVAILABLE')
        : 'AVAILABLE';
      const furnishedLevel = VALID_FURNISHED_LEVELS.has(
        String(raw.furnishedLevel || 'FULL')
      )
        ? String(raw.furnishedLevel || 'FULL')
        : 'FULL';
      const isPublishedToLanding = Boolean(raw.isPublishedToLanding);

      if (
        isPublishedToLanding &&
        !actorHasPermission(actor, 'rooms.publish.write')
      ) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Tài khoản không có quyền xuất bản phòng ra Landing Page.',
        });
      }

      if (
        !code ||
        !Number.isFinite(area) ||
        area <= 0 ||
        !Number.isInteger(listPriceVnd) ||
        listPriceVnd < 500_000 ||
        listPriceVnd > 500_000_000
      ) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message:
            'Mã phòng, diện tích (> 0m²) và giá niêm yết nguyên VND (500.000đ – 500.000.000đ) là bắt buộc.',
        });
      }

      if (seenBatchCodes.has(code)) {
        return sendJson(res, 409, {
          ok: false,
          errorCode: 'DUPLICATE_ROOM_CODE',
          message: `Mã phòng "${code}" bị trùng trong danh sách khởi tạo.`,
        });
      }
      seenBatchCodes.add(code);

      normalizedInputs.push({
        floorId: flr.id,
        floorNumber: flr.floorNumber,
        floorName: flr.name,
        code,
        title:
          String(raw.title || '').trim() ||
          `Phòng ${roomType} ${code} — ${bld.name}`,
        roomType,
        area,
        listPriceVnd,
        depositMonths,
        maxOccupants,
        occupancyStatus,
        furnishedLevel,
        amenities: Array.isArray(raw.amenities)
          ? raw.amenities.map((a) => String(a).trim()).filter(Boolean)
          : ['Máy lạnh Inverter', 'Wifi tốc độ cao', 'Khóa vân tay'],
        isPublishedToLanding,
        internalNotes:
          typeof raw.internalNotes === 'string' && raw.internalNotes.trim()
            ? raw.internalNotes.trim()
            : null,
      });
    }

    const existingCodes = await prisma.consoleRoom.findMany({
      where: {
        buildingId: bld.id,
        code: { in: Array.from(seenBatchCodes) },
      },
      select: { code: true },
    });
    if (existingCodes.length > 0) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'ROOM_CODE_EXISTS',
        message: `Mã phòng "${existingCodes[0].code}" đã tồn tại trong tòa nhà ${bld.code}.`,
      });
    }

    let seoJobId: string | null = null;
    const createdRooms = await prisma.$transaction(async (tx) => {
      const results = [];
      let orderOffset = currentRoomCount;
      let anyPublished = false;

      for (const item of normalizedInputs) {
        orderOffset += 1;
        let publicListingId: string | null = null;
        let publicSlug: string | null = null;

        if (item.isPublishedToLanding) {
          anyPublished = true;
          publicSlug = `${slugifyVietnamese(
            `${bld.code}-${item.code}-${item.roomType}`
          )}-${crypto.randomBytes(2).toString('hex')}`;
          const pub = await tx.publicRoomListing.create({
            data: {
              id: `pub-${crypto.randomUUID().slice(0, 12)}`,
              orgId: actor.orgId,
              buildingId: bld.id,
              floorId: item.floorId,
              slug: publicSlug,
              previousSlugs: [],
              roomCode: item.code,
              shortTitle: item.title,
              title: item.title,
              roomType: item.roomType,
              rentalModel: item.rentalModel || 'ENTIRE_ROOM',
              buildingCode: bld.code,
              buildingName: bld.name,
              buildingAddress: `${bld.streetAddress}, ${bld.ward}, ${bld.province}`,
              floorNumber: item.floorNumber,
              floorName: item.floorName,
              area: item.area,
              price: item.listPriceVnd,
              currency: 'VND',
              depositMonths: item.depositMonths,
              maxOccupants: `Tối đa ${item.maxOccupants} người`,
              status: mapOccupancyToPublicStatus(item.occupancyStatus),
              availableFrom: todayIso,
              availableFromLabel:
                item.occupancyStatus === 'AVAILABLE'
                  ? 'Đang trống'
                  : `Dự kiến ${formatIsoToDdMmYyyy(todayIso)}`,
              shortDescription: `${item.title} diện tích ${item.area}m² tại ${bld.name}.`,
              detailedDescription: `${item.title} tại ${bld.streetAddress}, ${bld.ward}, ${bld.province}. Diện tích ${item.area}m², ${mapFurnishedLabel(
                item.furnishedLevel
              ).toLowerCase()}.`,
              amenities: item.amenities as Prisma.InputJsonValue,
              furnishedLevel: item.furnishedLevel,
              furnishedLabel: mapFurnishedLabel(item.furnishedLevel),
              images: [] as Prisma.InputJsonValue,
              serviceFees: {
                electricity: 'Theo đồng hồ riêng từng phòng',
                water: 'Theo quy định tòa nhà',
                wifi: 'Trang bị Wifi theo tầng',
                parking: 'Khu vực để xe tầng trệt',
              } as Prisma.InputJsonValue,
              featured: false,
              displayOrder: orderOffset,
              isPublic: true,
              sourceVerified: true,
              currentTenantName: null,
              currentTenantPhone: null,
              internalNotes: null,
            },
          });
          publicListingId = pub.id;
        }

        const rm = await tx.consoleRoom.create({
          data: {
            orgId: actor.orgId,
            buildingId: bld.id,
            floorId: item.floorId,
            publicListingId,
            code: item.code,
            title: item.title,
            roomType: item.roomType,
            area: item.area,
            listPriceVnd: BigInt(item.listPriceVnd),
            depositMonths: item.depositMonths,
            maxOccupants: item.maxOccupants,
            occupancyStatus: item.occupancyStatus,
            furnishedLevel: item.furnishedLevel,
            amenities: item.amenities as Prisma.InputJsonValue,
            availableFrom: todayIso,
            isPublishedToLanding: item.isPublishedToLanding,
            publicSlug,
            internalNotes: item.internalNotes,
            displayOrder: orderOffset,
          },
        });

        await tx.electricMeter.create({
          data: {
            orgId: actor.orgId,
            roomId: rm.id,
            connectionStatus: 'UNCONFIGURED',
          },
        });

        results.push(rm);
      }

      if (anyPublished) {
        await tx.organization.update({
          where: { id: actor.orgId },
          data: { catalogVersion: { increment: 1 } },
        });
        const job = await tx.seoSyncJob.create({
          data: {
            orgId: actor.orgId,
            roomId: results[0].id,
            roomSlug: results[0].publicSlug || results[0].code.toLowerCase(),
            triggerAction: 'CONSOLE_V2_ROOM_CREATE_PUBLISH',
            status: 'PENDING',
          },
        });
        seoJobId = job.id;
      }

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: bld.id,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'ROOM',
          entityId: results[0].id,
          action: results.length > 1 ? 'BATCH_CREATE_ROOMS' : 'CREATE_ROOM',
          summary: `Tạo ${results.length} phòng tại tòa nhà ${bld.code}: ${results
            .map((r) => r.code)
            .join(', ')}`,
          metadata: { clientIp, count: results.length },
        },
      });

      return results;
    });

    if (seoJobId) {
      await deps.executeSeoSyncJobWithRetry(seoJobId);
    }

    return sendJson(res, 201, {
      ok: true,
      count: createdRooms.length,
      rooms: createdRooms.map((r) => ({
        ...r,
        listPriceVnd: toSafeVndNumber(r.listPriceVnd),
      })),
    });
  }

  // GET /api/v1/console/v2/rooms/:id/delete-check
  const roomDeleteCheckMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/rooms\/([^/]+)\/delete-check$/
  );
  if (method === 'GET' && roomDeleteCheckMatch) {
    const roomId = decodeURIComponent(roomDeleteCheckMatch[1]);
    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true },
    });
    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng.',
      });
    }
    if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập phòng này.',
      });
    }

    const [activeContracts, activeReservations, unpaidInvoices] =
      await Promise.all([
        prisma.contract.count({
          where: { roomId: rm.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
        }),
        prisma.roomReservation.count({
          where: { roomId: rm.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        }),
        prisma.invoice.count({
          where: {
            roomId: rm.id,
            status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
          },
        }),
      ]);

    const blockingReasons: string[] = [];
    if (rm.occupancyStatus === 'OCCUPIED') {
      blockingReasons.push('Phòng đang có khách lưu trú');
    }
    if (activeContracts > 0) {
      blockingReasons.push(`Có ${activeContracts} hợp đồng đang hiệu lực`);
    }
    if (activeReservations > 0) {
      blockingReasons.push(`Có ${activeReservations} phiếu đặt cọc / giữ chỗ`);
    }
    if (unpaidInvoices > 0) {
      blockingReasons.push(`Có ${unpaidInvoices} hóa đơn chưa tất toán`);
    }

    return sendJson(res, 200, {
      ok: true,
      canHardDelete:
        blockingReasons.length === 0 &&
        actorHasPermission(actor, 'rooms.manage'),
      blockingReasons,
    });
  }

  // PATCH or DELETE /api/v1/console/v2/rooms/:id
  const roomIdMatch = pathname.match(/^\/api\/v1\/console\/v2\/rooms\/([^/]+)$/);
  if (roomIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!actorHasPermission(actor, 'rooms.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền cập nhật hoặc xóa phòng.',
      });
    }

    const roomId = decodeURIComponent(roomIdMatch[1]);
    const existing = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true, floor: true },
    });
    if (!existing || existing.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng.',
      });
    }
    if (
      !isBuildingAllowedForActor(
        actor,
        existing.buildingId,
        existing.building.code
      )
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền thao tác phòng ngoài tòa nhà được phân công.',
      });
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const nextCode =
        typeof body.code === 'string' && body.code.trim()
          ? body.code
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9.-]/g, '')
          : existing.code;

      if (nextCode !== existing.code) {
        const dup = await prisma.consoleRoom.findUnique({
          where: {
            buildingId_code: {
              buildingId: existing.buildingId,
              code: nextCode,
            },
          },
        });
        if (dup) {
          return sendJson(res, 409, {
            ok: false,
            errorCode: 'ROOM_CODE_EXISTS',
            message: `Mã phòng "${nextCode}" đã tồn tại trong tòa nhà ${existing.building.code}.`,
          });
        }
      }

      const rawPrice =
        body.listPriceVnd !== undefined ? body.listPriceVnd : body.price;
      const nextPriceVnd =
        rawPrice !== undefined
          ? Math.trunc(Number(rawPrice))
          : toSafeVndNumber(existing.listPriceVnd);

      if (
        !Number.isInteger(nextPriceVnd) ||
        nextPriceVnd < 500_000 ||
        nextPriceVnd > 500_000_000
      ) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Giá niêm yết phải là số nguyên từ 500.000đ đến 500.000.000đ.',
        });
      }

      const nextArea =
        body.area !== undefined ? Number(body.area) : existing.area;
      if (!Number.isFinite(nextArea) || nextArea <= 0) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Diện tích phòng phải lớn hơn 0m².',
        });
      }

      const nextOccupancy =
        typeof body.occupancyStatus === 'string' &&
        VALID_OCCUPANCY_STATUSES.has(body.occupancyStatus)
          ? body.occupancyStatus
          : existing.occupancyStatus;
      const nextRentalModel = body.rentalModel === undefined ? existing.rentalModel : String(body.rentalModel);
      if (!['ENTIRE_ROOM', 'SHARED_ROOM'].includes(nextRentalModel)) return sendJson(res, 422, { ok: false, message: 'Dạng phòng không hợp lệ.' });
      if (nextRentalModel !== existing.rentalModel && await prisma.contract.count({ where: { roomId: existing.id, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] }, rentalModel: { not: nextRentalModel } } })) return sendJson(res, 409, { ok: false, message: 'Không thể đổi dạng phòng khi hợp đồng hiện tại thuộc dạng khác.' });

      const nextPublished =
        typeof body.isPublishedToLanding === 'boolean'
          ? body.isPublishedToLanding
          : existing.isPublishedToLanding;

      if (
        nextPublished !== existing.isPublishedToLanding &&
        !actorHasPermission(actor, 'rooms.publish.write')
      ) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Tài khoản không có quyền thay đổi trạng thái xuất bản Landing.',
        });
      }

      const nextTitle =
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim()
          : existing.title;
      const nextRoomType =
        typeof body.roomType === 'string' && body.roomType.trim()
          ? body.roomType.trim()
          : existing.roomType;
      const nextFurnished =
        typeof body.furnishedLevel === 'string' &&
        VALID_FURNISHED_LEVELS.has(body.furnishedLevel)
          ? body.furnishedLevel
          : existing.furnishedLevel;
      const nextDepositMonths =
        body.depositMonths !== undefined
          ? Math.max(0, Math.min(12, Math.trunc(Number(body.depositMonths))))
          : existing.depositMonths;
      const nextMaxOccupants =
        body.maxOccupants !== undefined
          ? Math.max(1, Math.min(12, Math.trunc(Number(body.maxOccupants))))
          : existing.maxOccupants;
      const nextAvailableFrom =
        typeof body.availableFrom === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.availableFrom)
          ? body.availableFrom
          : existing.availableFrom;
      const nextWaterMethod =
        body.waterBillingMethod === null
          ? null
          : typeof body.waterBillingMethod === 'string' &&
            VALID_WATER_METHODS.has(body.waterBillingMethod)
          ? body.waterBillingMethod
          : existing.waterBillingMethod;
      const nextWaterRate =
        body.waterRateVnd === null
          ? null
          : typeof body.waterRateVnd === 'number' && body.waterRateVnd >= 0
          ? Math.trunc(body.waterRateVnd)
          : existing.waterRateVnd;
      const nextElectricBillingMode =
        typeof body.electricBillingMode === 'string' &&
        (body.electricBillingMode === 'MANUAL' || body.electricBillingMode === 'HUNONIC_AUTO')
          ? body.electricBillingMode
          : (existing as any).electricBillingMode || 'HUNONIC_AUTO';
      const nextElectricRate =
        nextElectricBillingMode === 'HUNONIC_AUTO'
          ? null
          : body.electricRateVnd === null
          ? null
          : typeof body.electricRateVnd === 'number' && body.electricRateVnd >= 0
          ? Math.trunc(body.electricRateVnd)
          : existing.electricRateVnd;
      const nextAmenities = Array.isArray(body.amenities)
        ? body.amenities.map((a) => String(a).trim()).filter(Boolean)
        : Array.isArray(existing.amenities)
        ? (existing.amenities as string[])
        : [];
      const nextInternalNotes =
        typeof body.internalNotes === 'string'
          ? body.internalNotes.trim() || null
          : existing.internalNotes;

      let seoJobId: string | null = null;
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${existing.id} FOR UPDATE`;
        if (nextRentalModel !== existing.rentalModel) {
          const conflicting = await tx.contract.count({ where: { roomId: existing.id, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] }, rentalModel: { not: nextRentalModel } } });
          if (conflicting) return null;
        }
        let publicListingId = existing.publicListingId;
        let publicSlug = existing.publicSlug;

        if (nextPublished || publicListingId) {
          const publicStatus = mapOccupancyToPublicStatus(nextOccupancy);
          if (publicListingId) {
            const pub = await tx.publicRoomListing.update({
              where: { id: publicListingId },
              data: {
                roomCode: nextCode,
                shortTitle: nextTitle,
                title: nextTitle,
                roomType: nextRoomType,
                rentalModel: nextRentalModel,
                area: nextArea,
                price: nextPriceVnd,
                depositMonths: nextDepositMonths,
                maxOccupants: `Tối đa ${nextMaxOccupants} người`,
                status: publicStatus,
                availableFrom: nextAvailableFrom,
                availableFromLabel:
                  publicStatus === 'AVAILABLE'
                    ? 'Đang trống'
                    : `Dự kiến sau ${formatIsoToDdMmYyyy(nextAvailableFrom)}`,
                furnishedLevel: nextFurnished,
                furnishedLabel: mapFurnishedLabel(nextFurnished),
                amenities: nextAmenities as Prisma.InputJsonValue,
                isPublic: nextPublished,
                currentTenantName: null,
                currentTenantPhone: null,
                internalNotes: null,
              },
            });
            publicSlug = pub.slug;
          } else if (nextPublished) {
            publicSlug = `${slugifyVietnamese(
              `${existing.building.code}-${nextCode}-${nextRoomType}`
            )}-${crypto.randomBytes(2).toString('hex')}`;
            const pub = await tx.publicRoomListing.create({
              data: {
                id: `pub-${crypto.randomUUID().slice(0, 12)}`,
                orgId: actor.orgId,
                buildingId: existing.buildingId,
                floorId: existing.floorId,
                slug: publicSlug,
                previousSlugs: [],
                roomCode: nextCode,
                shortTitle: nextTitle,
                title: nextTitle,
                roomType: nextRoomType,
                buildingCode: existing.building.code,
                rentalModel: nextRentalModel,
                buildingName: existing.building.name,
                buildingAddress: `${existing.building.streetAddress}, ${existing.building.ward}, ${existing.building.province}`,
                floorNumber: existing.floor.floorNumber,
                floorName: existing.floor.name,
                area: nextArea,
                price: nextPriceVnd,
                currency: 'VND',
                depositMonths: nextDepositMonths,
                maxOccupants: `Tối đa ${nextMaxOccupants} người`,
                status: publicStatus,
                availableFrom: nextAvailableFrom,
                availableFromLabel:
                  publicStatus === 'AVAILABLE'
                    ? 'Đang trống'
                    : `Dự kiến sau ${formatIsoToDdMmYyyy(nextAvailableFrom)}`,
                shortDescription: `${nextTitle} diện tích ${nextArea}m² tại ${existing.building.name}.`,
                detailedDescription: `${nextTitle} tại ${existing.building.streetAddress}, ${existing.building.ward}, ${existing.building.province}.`,
                amenities: nextAmenities as Prisma.InputJsonValue,
                furnishedLevel: nextFurnished,
                furnishedLabel: mapFurnishedLabel(nextFurnished),
                images: publicRoomImages(existing.id, existing.images) as Prisma.InputJsonValue,
                serviceFees: {
                  electricity: 'Theo đồng hồ riêng từng phòng',
                  water: 'Theo quy định tòa nhà',
                  wifi: 'Trang bị Wifi theo tầng',
                  parking: 'Khu vực để xe tầng trệt',
                } as Prisma.InputJsonValue,
                featured: false,
                displayOrder: existing.displayOrder,
                isPublic: true,
                sourceVerified: true,
                currentTenantName: null,
                currentTenantPhone: null,
                internalNotes: null,
              },
            });
            publicListingId = pub.id;
          }

          await tx.organization.update({
            where: { id: actor.orgId },
            data: { catalogVersion: { increment: 1 } },
          });
          const job = await tx.seoSyncJob.create({
            data: {
              orgId: actor.orgId,
              roomId: publicListingId || existing.id,
              roomSlug: publicSlug || nextCode.toLowerCase(),
              triggerAction: 'CONSOLE_V2_ROOM_UPDATE',
              status: 'PENDING',
            },
          });
          seoJobId = job.id;
        }

        const rm = await tx.consoleRoom.update({
          where: { id: existing.id },
          data: {
            code: nextCode,
            title: nextTitle,
            roomType: nextRoomType,
            area: nextArea,
            listPriceVnd: BigInt(nextPriceVnd),
            depositMonths: nextDepositMonths,
            maxOccupants: nextMaxOccupants,
            occupancyStatus: nextOccupancy,
            rentalModel: nextRentalModel,
            furnishedLevel: nextFurnished,
            amenities: nextAmenities as Prisma.InputJsonValue,
            availableFrom: nextAvailableFrom,
            waterBillingMethod: nextWaterMethod,
            waterRateVnd: nextWaterRate,
            electricBillingMode: nextElectricBillingMode,
            electricRateVnd: nextElectricRate,
            isPublishedToLanding: nextPublished,
            publicListingId,
            publicSlug,
            internalNotes: nextInternalNotes,
          },
        });

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: existing.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'ROOM',
            entityId: rm.id,
            action: 'UPDATE_ROOM',
            summary: `Cập nhật phòng ${rm.code} (${existing.building.code}) · trạng thái ${rm.occupancyStatus}`,
            metadata: {
              clientIp,
              isPublishedToLanding: nextPublished,
              listPriceVnd: nextPriceVnd,
            },
          },
        });

        return rm;
      });
      if (!updated) return sendJson(res, 409, { ok: false, message: 'Không thể đổi dạng phòng khi hợp đồng hiện tại thuộc dạng khác.' });

      if (seoJobId) {
        await deps.executeSeoSyncJobWithRetry(seoJobId);
      }

      return sendJson(res, 200, {
        ok: true,
        room: {
          ...updated,
          listPriceVnd: toSafeVndNumber(updated.listPriceVnd),
        },
      });
    }

    // DELETE Room
    const [activeContracts, activeReservations, unpaidInvoices] =
      await Promise.all([
        prisma.contract.count({
          where: { roomId: existing.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
        }),
        prisma.roomReservation.count({
          where: {
            roomId: existing.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        prisma.invoice.count({
          where: {
            roomId: existing.id,
            status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
          },
        }),
      ]);

    if (
      existing.occupancyStatus === 'OCCUPIED' ||
      activeContracts > 0 ||
      activeReservations > 0 ||
      unpaidInvoices > 0
    ) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'DELETE_BLOCKED_BY_DEPENDENCIES',
        message:
          'Không thể xóa phòng đang có khách thuê, hợp đồng hiệu lực, đặt cọc hoặc hóa đơn chưa thanh toán.',
      });
    }

    let seoJobId: string | null = null;
    await prisma.$transaction(async (tx) => {
      await tx.tenant.updateMany({
        where: { currentRoomId: existing.id },
        data: { currentRoomId: null },
      });
      await tx.consoleRoom.delete({ where: { id: existing.id } });
      if (existing.publicListingId) {
        await tx.publicRoomListing.deleteMany({
          where: { id: existing.publicListingId },
        });
        await tx.organization.update({
          where: { id: actor.orgId },
          data: { catalogVersion: { increment: 1 } },
        });
        const job = await tx.seoSyncJob.create({
          data: {
            orgId: actor.orgId,
            roomId: existing.id,
            roomSlug: existing.publicSlug || existing.code.toLowerCase(),
            triggerAction: 'CONSOLE_V2_ROOM_DELETE',
            status: 'PENDING',
          },
        });
        seoJobId = job.id;
      }

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: existing.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'ROOM',
          entityId: existing.id,
          action: 'DELETE_ROOM',
          summary: `Xóa phòng ${existing.code} khỏi tòa nhà ${existing.building.code}`,
          metadata: { clientIp },
        },
      });
    });

    if (seoJobId) {
      await deps.executeSeoSyncJobWithRetry(seoJobId);
    }

    return sendJson(res, 200, { ok: true, deletedId: existing.id });
  }

  // ===========================================================================
  // 5B. ROOM OCCUPANTS (/api/v1/console/v2/rooms/:id/occupants, /api/v1/console/v2/occupants/:id)
  // ===========================================================================
  const roomOccupantsMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/rooms\/([^/]+)\/occupants$/
  );
  if (roomOccupantsMatch) {
    const roomId = decodeURIComponent(roomOccupantsMatch[1]);
    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true },
    });
    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Phòng không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập phòng ngoài phạm vi phân công.',
      });
    }

    if (method === 'GET') {
      const occupants = await prisma.roomOccupant.findMany({
        where: { roomId: rm.id, orgId: actor.orgId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      });
      return sendJson(res, 200, {
        ok: true,
        occupants: occupants.map((occ) => ({
          id: occ.id,
          roomId: occ.roomId,
          contractId: occ.contractId,
          tenantId: occ.tenantId,
          fullName: occ.fullName,
          phone: occ.phone,
          idNumber: occ.idNumber,
          dateOfBirth: occ.dateOfBirth,
          gender: occ.gender,
          residenceRegStatus: occ.residenceRegStatus,
          relationToPrimary: occ.relationToPrimary,
          moveInDate: occ.moveInDate,
          moveOutDate: occ.moveOutDate,
          notes: occ.notes,
          isActive: occ.isActive,
          createdAt: occ.createdAt.toISOString(),
        })),
      });
    }

    if (method === 'POST') {
      if (!actorHasPermission(actor, 'tenants.manage') && !actorHasPermission(actor, 'contracts.manage')) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Không có quyền thêm người lưu trú.',
        });
      }

      const body = await readJsonBody(req);
      const fullName = String(body.fullName || '').trim();
      const phone = String(body.phone || '').trim() || null;
      const idNumber = String(body.idNumber || '').trim() || null;
      const dateOfBirth = String(body.dateOfBirth || '').trim() || null;
      const gender = String(body.gender || '').trim() || null;
      const relationToPrimary = ['PRIMARY', 'FAMILY', 'ROOMMATE', 'OTHER'].includes(
        String(body.relationToPrimary || '')
      )
        ? String(body.relationToPrimary)
        : 'ROOMMATE';
      const residenceRegStatus = ['PENDING', 'REGISTERED', 'EXPIRED'].includes(
        String(body.residenceRegStatus || '')
      )
        ? String(body.residenceRegStatus)
        : 'PENDING';
      const moveInDate =
        typeof body.moveInDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.moveInDate)
          ? body.moveInDate
          : getTodayIsoVn();
      const notes = String(body.notes || '').trim() || null;
      let secondaryContract: any = {};
      try { secondaryContract = JSON.parse(notes || '{}')?.secondaryContract || {}; } catch { secondaryContract = {}; }

      if (!fullName) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Vui lòng nhập họ và tên người lưu trú.',
        });
      }
      if (!phone || !/^0\d{8,10}$/.test(phone.replace(/\D/g, ''))) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Số điện thoại không hợp lệ.' });
      if (!idNumber || !/^\d{12}$/.test(idNumber)) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'CCCD phải gồm đúng 12 số để lập CT01.' });
      if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !gender) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Nhập đầy đủ ngày sinh và giới tính.' });
      if (!String(secondaryContract.address || '').trim()) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Nhập địa chỉ thường trú theo CCCD.' });
      if (relationToPrimary === 'FAMILY' && (!String(secondaryContract.householdHeadOccupantId || '').trim() || !String(secondaryContract.relationship || '').trim())) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Chọn người đại diện hộ và nhập mối quan hệ.' });
      if (relationToPrimary === 'OTHER') {
        const supplementaryStartDate = String(secondaryContract.startDate || '');
        const supplementaryDurationMonths = Number(secondaryContract.durationMonths);
        const expectedEndDate = computeSupplementaryContractEndDate(supplementaryStartDate, supplementaryDurationMonths);
        const monthlyRentVnd = Number(secondaryContract.monthlyRentVnd);
        const depositVnd = Number(secondaryContract.depositVnd);
        if (!expectedEndDate || String(secondaryContract.endDate || '') !== expectedEndDate || moveInDate !== supplementaryStartDate) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Ngày vào ở, thời hạn thuê hoặc ngày kết thúc hợp đồng phụ không hợp lệ.' });
        if (!Number.isSafeInteger(monthlyRentVnd) || monthlyRentVnd < 500_000 || !Number.isSafeInteger(depositVnd) || depositVnd < 0) return sendJson(res, 422, { ok: false, errorCode: 'VALIDATION_ERROR', message: 'Tiền thuê hoặc tiền cọc bổ sung không hợp lệ.' });
      }
      if (rm.rentalModel === 'SHARED_ROOM') return sendJson(res, 409, { ok: false, errorCode: 'SHARED_ROOM_CONTRACT_REQUIRED', message: 'Khách ở ghép phải có hợp đồng riêng. Hãy dùng Thêm khách thuê.' });
      if (relationToPrimary === 'ROOMMATE' || relationToPrimary === 'PRIMARY') return sendJson(res, 409, { ok: false, errorCode: 'WHOLE_ROOM_OCCUPANT_ONLY', message: 'Phòng nguyên căn chỉ thêm đại diện hợp đồng phụ hoặc thành viên cùng hộ.' });

      // Check active contract on room to link if any
      const activeContract = await prisma.contract.findFirst({
        where: { roomId: rm.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
      });

      if (!activeContract) return sendJson(res, 409, { ok: false, message: 'Phòng chưa có hợp đồng đại diện.' });
      if (relationToPrimary === 'FAMILY') {
        const householdHead = await prisma.roomOccupant.findFirst({
          where: { id: String(secondaryContract.householdHeadOccupantId), roomId: rm.id, orgId: actor.orgId, isActive: true },
        });
        if (!householdHead) return sendJson(res, 409, { ok: false, message: 'Người đại diện hộ không còn ở trong phòng. Hãy chọn lại.' });
      }
      const occupiedCount = await prisma.roomOccupant.count({ where: { roomId: rm.id, isActive: true } });
      if (occupiedCount >= rm.maxOccupants) return sendJson(res, 409, { ok: false, message: 'Phòng đã đủ số người tối đa.' });
      const occ = await prisma.$transaction(async (tx) => {
        const normalizedPhone = normalizeVnPhone(phone);
        const requestedTenantId = body.tenantId ? String(body.tenantId) : '';
        const existingTenant = requestedTenantId
          ? await tx.tenant.findFirst({ where: { id: requestedTenantId, orgId: actor.orgId } })
          : await tx.tenant.findFirst({
              where: {
                orgId: actor.orgId,
                OR: [{ idNumber }, { normalizedPhone }],
              },
              orderBy: { updatedAt: 'desc' },
            });
        const tenant = existingTenant
          ? await tx.tenant.update({
              where: { id: existingTenant.id },
              data: {
                fullName,
                phone: normalizedPhone,
                normalizedPhone,
                idNumber,
                primaryBuildingId: rm.buildingId,
                currentRoomId: rm.id,
                residenceRegStatus,
                isActive: true,
              },
            })
          : await tx.tenant.create({
              data: {
                orgId: actor.orgId,
                primaryBuildingId: rm.buildingId,
                currentRoomId: rm.id,
                fullName,
                phone: normalizedPhone,
                normalizedPhone,
                idNumber,
                residenceRegStatus,
              },
            });
        const createdOccupant = await tx.roomOccupant.create({
          data: {
            orgId: actor.orgId,
            roomId: rm.id,
            contractId: activeContract.id,
            tenantId: tenant.id,
            fullName,
            phone: normalizedPhone,
            idNumber,
            dateOfBirth,
            gender,
            residenceRegStatus,
            relationToPrimary,
            moveInDate,
            occupancyStatus: 'ACTIVE',
            notes,
            isActive: true,
          },
        });
        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: rm.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'OCCUPANT',
            entityId: createdOccupant.id,
            action: 'ADD_OCCUPANT',
            summary: `Thêm người lưu trú ${fullName} vào phòng ${rm.code} (${rm.building.code})`,
            metadata: { clientIp, roomId: rm.id, tenantId: tenant.id, relationToPrimary },
          },
        });
        return createdOccupant;
      });

      return sendJson(res, 201, { ok: true, occupant: occ });
    }
  }

  const occupantItemMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/occupants\/([^/]+)$/
  );
  if (occupantItemMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!actorHasPermission(actor, 'tenants.manage') && !actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền cập nhật người lưu trú.',
      });
    }

    const occId = decodeURIComponent(occupantItemMatch[1]);
    const existing = await prisma.roomOccupant.findUnique({
      where: { id: occId },
      include: { room: { include: { building: true } } },
    });
    if (!existing || existing.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'OCCUPANT_NOT_FOUND',
        message: 'Không tìm thấy thông tin người lưu trú.',
      });
    }

    if (!isBuildingAllowedForActor(actor, existing.room.buildingId, existing.room.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền chỉnh sửa người lưu trú ngoài tòa nhà phụ trách.',
      });
    }

    if (method === 'DELETE') {
      if (existing.room.rentalModel === 'SHARED_ROOM' && existing.contractId) return sendJson(res, 409, { ok: false, message: 'Khách ghép có hợp đồng riêng; hãy thanh lý hợp đồng để trả chỗ.' });
      const body: Record<string, unknown> = await readJsonBody(req).catch(() => ({}));
      const moveOutDate =
        typeof body?.moveOutDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.moveOutDate)
          ? body.moveOutDate
          : getTodayIsoVn();

      const moveOutReason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'REMOVED_FROM_ROOM';
      let existingNotes: any = {};
      try { existingNotes = JSON.parse(existing.notes || '{}'); } catch { existingNotes = {}; }
      const softDeleted = await prisma.$transaction(async (tx) => {
        const updatedOccupant = await tx.roomOccupant.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            occupancyStatus: 'MOVED_OUT',
            moveOutDate,
            notes: JSON.stringify({ ...existingNotes, secondaryContract: { ...(existingNotes.secondaryContract || {}), moveOutReason } }),
          },
        });
        if (existing.tenantId) {
          const otherActiveOccupancy = await tx.roomOccupant.findFirst({
            where: { tenantId: existing.tenantId, isActive: true, id: { not: existing.id } },
            orderBy: { createdAt: 'desc' },
          });
          await tx.tenant.update({
            where: { id: existing.tenantId },
            data: {
              currentRoomId: otherActiveOccupancy?.roomId || null,
              primaryBuildingId: otherActiveOccupancy ? undefined : existing.room.buildingId,
              isActive: true,
            },
          });
        }
        await tx.consoleAuditLog.create({
          data: {
          orgId: actor.orgId,
          buildingId: existing.room?.buildingId || null,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'OCCUPANT',
          entityId: existing.id,
          action: 'DEACTIVATE_OCCUPANT',
          summary: `Đánh dấu chuyển đi cho cư dân ${existing.fullName} (Phòng ${existing.room?.code || existing.roomId})`,
          metadata: { clientIp, moveOutDate, moveOutReason, tenantId: existing.tenantId, hardDelete: false, retentionYears: 3 },
          },
        });
        return updatedOccupant;
      });

      return sendJson(res, 200, {
        ok: true,
        deletedId: existing.id,
        softDeleted: true,
        occupant: softDeleted,
      });
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      if (existing.room.rentalModel === 'SHARED_ROOM' && existing.contractId && (body.isActive === false || body.moveOutDate || body.relationToPrimary)) return sendJson(res, 409, { ok: false, message: 'Khách ghép có hợp đồng riêng; hãy điều chỉnh hoặc thanh lý hợp đồng.' });
      const dataToUpdate: any = {};
      if (typeof body.fullName === 'string' && body.fullName.trim()) dataToUpdate.fullName = body.fullName.trim();
      if (typeof body.phone === 'string') dataToUpdate.phone = body.phone.trim() || null;
      if (typeof body.idNumber === 'string') dataToUpdate.idNumber = body.idNumber.trim() || null;
      if (typeof body.dateOfBirth === 'string') dataToUpdate.dateOfBirth = body.dateOfBirth.trim() || null;
      if (typeof body.gender === 'string') dataToUpdate.gender = body.gender.trim() || null;
      if (typeof body.residenceRegStatus === 'string' && ['PENDING', 'REGISTERED', 'EXPIRED'].includes(body.residenceRegStatus)) {
        dataToUpdate.residenceRegStatus = body.residenceRegStatus;
      }
      if (typeof body.relationToPrimary === 'string' && ['PRIMARY', 'FAMILY', 'ROOMMATE', 'OTHER'].includes(body.relationToPrimary)) {
        dataToUpdate.relationToPrimary = body.relationToPrimary;
      }
      if (typeof body.moveOutDate === 'string') {
        dataToUpdate.moveOutDate = body.moveOutDate.trim() || null;
      }
      if (typeof body.isActive === 'boolean') {
        dataToUpdate.isActive = body.isActive;
      }
      if (typeof body.notes === 'string') {
        dataToUpdate.notes = body.notes.trim() || null;
      }

      const updated = await prisma.roomOccupant.update({
        where: { id: existing.id },
        data: dataToUpdate,
      });

      return sendJson(res, 200, { ok: true, occupant: updated });
    }
  }

  // ===========================================================================
  // 6. TENANTS CRUD (/api/v1/console/v2/tenants*) — Inside "Tòa nhà & phòng"
  // ===========================================================================
  if (method === 'GET' && pathname === '/api/v1/console/v2/tenants') {
    if (!actorHasPermission(actor, 'tenants.manage') && !actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền tìm kiếm hồ sơ khách thuê.',
      });
    }

    if (urlObj.searchParams.get('checkDuplicates') === '1') {
      const phone = normalizeVnPhone(String(urlObj.searchParams.get('phone') || '').trim());
      const idNumber = String(urlObj.searchParams.get('idNumber') || '').trim();
      const excludeId = String(urlObj.searchParams.get('excludeId') || '').trim();
      const where = { orgId: actor.orgId, ...(excludeId ? { id: { not: excludeId } } : {}) };
      const [phoneMatch, idMatch] = await Promise.all([
        phone ? prisma.tenant.findFirst({ where: { ...where, normalizedPhone: phone }, select: { id: true } }) : null,
        idNumber ? prisma.tenant.findFirst({ where: { ...where, idNumber }, select: { id: true } }) : null,
      ]);
      return sendJson(res, 200, { ok: true, duplicatePhone: !!phoneMatch, duplicateIdNumber: !!idMatch });
    }
    const { authorizedBuildings } = await resolveScopedBuildings(prisma, actor, null, true);
    const authorizedBuildingIds = authorizedBuildings.map((b) => b.id);
    const q = String(urlObj.searchParams.get('q') || '').trim().toLowerCase();

    let whereClause: any = {
      orgId: actor.orgId,
      isActive: true,
      OR: [
        { primaryBuildingId: null },
        { primaryBuildingId: { in: authorizedBuildingIds } },
      ],
    };

    if (q) {
      const normQ = normalizeVnPhone(q);
      whereClause = {
        ...whereClause,
        AND: [
          {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { normalizedPhone: { contains: normQ || q } },
              { idNumber: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      };
    }

    const tenants = await prisma.tenant.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return sendJson(res, 200, {
      ok: true,
      tenants: tenants.map((t) => ({
        id: t.id,
        fullName: t.fullName,
        phone: t.phone,
        normalizedPhone: t.normalizedPhone,
        email: t.email,
        idNumber: t.idNumber,
        residenceRegStatus: t.residenceRegStatus,
        emergencyContact: t.emergencyContact,
        primaryBuildingId: t.primaryBuildingId,
        currentRoomId: t.currentRoomId,
        notes: t.notes,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  }

  if (method === 'POST' && pathname === '/api/v1/console/v2/tenants') {
    if (!actorHasPermission(actor, 'tenants.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền quản lý hồ sơ khách thuê.',
      });
    }

    const body = await readJsonBody(req);
    const fullName = String(body.fullName || '').trim();
    const rawPhone = String(body.phone || '').trim();
    if (!fullName || !isValidVnPhone(rawPhone)) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message:
          'Vui lòng nhập họ tên khách thuê và số điện thoại di động Việt Nam hợp lệ (10 số).',
      });
    }

    const normalizedPhone = normalizeVnPhone(rawPhone);
    const email = String(body.email || '').trim() || null;
    const idNumber = String(body.idNumber || '').trim() || null;
    const residenceRegStatus = ['PENDING', 'REGISTERED', 'EXPIRED'].includes(
      String(body.residenceRegStatus || '')
    )
      ? String(body.residenceRegStatus)
      : 'PENDING';
    const emergencyContact =
      String(body.emergencyContact || '').trim() || null;
    const notes = String(body.notes || '').trim() || null;

    let targetRoom: {
      id: string;
      code: string;
      buildingId: string;
      buildingCode: string;
      publicListingId: string | null;
    } | null = null;

    if (typeof body.currentRoomId === 'string' && body.currentRoomId.trim()) {
      const rm = await prisma.consoleRoom.findUnique({
        where: { id: body.currentRoomId.trim() },
        include: { building: true },
      });
      if (!rm || rm.orgId !== actor.orgId) {
        return sendJson(res, 404, {
          ok: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy phòng được chọn.',
        });
      }
      if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'FORBIDDEN_BUILDING_SCOPE',
          message: 'Không có quyền gán khách vào phòng ngoài phạm vi phụ trách.',
        });
      }
      targetRoom = {
        id: rm.id,
        code: rm.code,
        buildingId: rm.buildingId,
        buildingCode: rm.building.code,
        publicListingId: rm.publicListingId,
      };
    }

    let primaryBuildingId =
      targetRoom?.buildingId ||
      (typeof body.primaryBuildingId === 'string' &&
      body.primaryBuildingId.trim()
        ? body.primaryBuildingId.trim()
        : null);

    if (primaryBuildingId) {
      const bld = await prisma.building.findUnique({
        where: { id: primaryBuildingId },
      });
      if (!bld || bld.orgId !== actor.orgId) {
        return sendJson(res, 404, {
          ok: false,
          errorCode: 'BUILDING_NOT_FOUND',
          message: 'Tòa nhà của khách thuê không tồn tại.',
        });
      }
      if (!isBuildingAllowedForActor(actor, bld.id, bld.code)) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'FORBIDDEN_BUILDING_SCOPE',
          message: 'Không có quyền thêm khách thuê ngoài tòa nhà phụ trách.',
        });
      }
    } else if (actor.role !== 'ADMIN') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'BUILDING_REQUIRED',
        message: 'Quản lý tòa nhà cần chọn tòa nhà hoặc phòng cho hồ sơ khách thuê.',
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          orgId: actor.orgId,
          primaryBuildingId,
          currentRoomId: targetRoom?.id || null,
          fullName,
          phone: normalizedPhone,
          normalizedPhone,
          email,
          idNumber,
          residenceRegStatus,
          emergencyContact,
          notes,
        },
      });

      // Note: Tenant creation is purely Customer Profile CRM registration and NEVER alters room occupancy status.

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: primaryBuildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'TENANT',
          entityId: tenant.id,
          action: 'CREATE_TENANT',
          summary: `Thêm hồ sơ khách thuê ${tenant.fullName}${
            targetRoom ? ` · Phòng ${targetRoom.code}` : ''
          }`,
          metadata: { clientIp, roomId: targetRoom?.id || null },
        },
      });

      return tenant;
    });

    return sendJson(res, 201, { ok: true, tenant: created });
  }

  const tenantIdMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/tenants\/([^/]+)$/
  );
  if (tenantIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!actorHasPermission(actor, 'tenants.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền cập nhật hoặc xóa hồ sơ khách thuê.',
      });
    }

    const tenantId = decodeURIComponent(tenantIdMatch[1]);
    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing || existing.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'TENANT_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ khách thuê.',
      });
    }

    if (
      existing.primaryBuildingId &&
      !isBuildingAllowedForActor(actor, existing.primaryBuildingId, null)
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền thao tác khách thuê ngoài tòa nhà phụ trách.',
      });
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const nextName =
        typeof body.fullName === 'string' && body.fullName.trim()
          ? body.fullName.trim()
          : existing.fullName;
      const nextRawPhone =
        typeof body.phone === 'string' && body.phone.trim()
          ? body.phone.trim()
          : existing.phone;
      if (!isValidVnPhone(nextRawPhone)) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Số điện thoại di động Việt Nam không hợp lệ.',
        });
      }
      const nextPhone = normalizeVnPhone(nextRawPhone);

      let nextRoomId = existing.currentRoomId;
      let nextBuildingId = existing.primaryBuildingId;

      if (body.currentRoomId === null || body.currentRoomId === '') {
        nextRoomId = null;
      } else if (
        typeof body.currentRoomId === 'string' &&
        body.currentRoomId.trim() !== existing.currentRoomId
      ) {
        const rm = await prisma.consoleRoom.findUnique({
          where: { id: body.currentRoomId.trim() },
          include: { building: true },
        });
        if (!rm || rm.orgId !== actor.orgId) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'ROOM_NOT_FOUND',
            message: 'Phòng được chọn không tồn tại.',
          });
        }
        if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'FORBIDDEN_BUILDING_SCOPE',
            message: 'Không có quyền chuyển khách sang tòa nhà ngoài phạm vi.',
          });
        }
        nextRoomId = rm.id;
        nextBuildingId = rm.buildingId;
      }

      if (
        typeof body.primaryBuildingId === 'string' &&
        body.primaryBuildingId.trim() &&
        !nextRoomId
      ) {
        nextBuildingId = body.primaryBuildingId.trim();
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Customer profile updates do not directly mutate room operational occupancy status
        const t = await tx.tenant.update({
          where: { id: existing.id },
          data: {
            fullName: nextName,
            phone: nextPhone,
            normalizedPhone: nextPhone,
            primaryBuildingId: nextBuildingId,
            currentRoomId: nextRoomId,
            email:
              typeof body.email === 'string'
                ? body.email.trim() || null
                : existing.email,
            idNumber:
              typeof body.idNumber === 'string'
                ? body.idNumber.trim() || null
                : existing.idNumber,
            residenceRegStatus:
              typeof body.residenceRegStatus === 'string' &&
              ['PENDING', 'REGISTERED', 'EXPIRED'].includes(
                body.residenceRegStatus
              )
                ? body.residenceRegStatus
                : existing.residenceRegStatus,
            emergencyContact:
              typeof body.emergencyContact === 'string'
                ? body.emergencyContact.trim() || null
                : existing.emergencyContact,
            notes:
              typeof body.notes === 'string'
                ? body.notes.trim() || null
                : existing.notes,
          },
        });

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: nextBuildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'TENANT',
            entityId: t.id,
            action: 'UPDATE_TENANT',
            summary: `Cập nhật hồ sơ khách thuê ${t.fullName}`,
            metadata: { clientIp },
          },
        });

        return t;
      });

      return sendJson(res, 200, { ok: true, tenant: updated });
    }

    // DELETE Tenant
    const activeCt = await prisma.contract.count({
      where: {
        tenantId: existing.id,
        status: { in: [...ACTIVE_CONTRACT_STATUSES] },
      },
    });
    if (activeCt > 0) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'TENANT_HAS_ACTIVE_CONTRACT',
        message:
          'Không thể xóa khách thuê đang đứng tên hợp đồng hiệu lực. Vui lòng thanh lý hợp đồng trước.',
      });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.currentRoomId) {
        const remaining = await tx.tenant.count({
          where: {
            currentRoomId: existing.currentRoomId,
            id: { not: existing.id },
            isActive: true,
          },
        });
        if (remaining === 0) {
          const oldRm = await tx.consoleRoom.update({
            where: { id: existing.currentRoomId },
            data: { occupancyStatus: 'AVAILABLE' },
          });
          if (oldRm.publicListingId) {
            await tx.publicRoomListing.update({
              where: { id: oldRm.publicListingId },
              data: { status: 'AVAILABLE' },
            });
          }
        }
      }

      await tx.tenant.delete({ where: { id: existing.id } });
      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: existing.primaryBuildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'TENANT',
          entityId: existing.id,
          action: 'DELETE_TENANT',
          summary: `Xóa hồ sơ khách thuê ${existing.fullName}`,
          metadata: { clientIp },
        },
      });
    });

    return sendJson(res, 200, { ok: true, deletedId: existing.id });
  }

// ===========================================================================
  // 6B. HISTORICAL IMPORT & OCCUPANCY SOURCE OF TRUTH (C4-IMPORT-01/02 & C4-OCC-01)
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/import/tenants/preview') {
    if (!actorHasPermission(actor, 'contracts.manage') && !actorHasPermission(actor, 'tenants.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền nhập dữ liệu khách thuê lịch sử.',
      });
    }

    const body = await readJsonBody(req);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'EMPTY_BATCH',
        message: 'Danh sách dữ liệu nhập trống. Vui lòng cung cấp ít nhất 1 dòng.',
      });
    }

    const { authorizedBuildings } = await resolveScopedBuildings(prisma, actor, null, true);
    const authorizedBuildingIds = new Set(authorizedBuildings.map((b) => b.id));

    let totalOpeningDepositVnd = 0;
    let totalOpeningDebtVnd = 0;
    let totalOpeningCreditVnd = 0;
    let roomsToOccupyCount = 0;
    const roomOccupiedSet = new Set<string>();

    const rowsEvaluated: any[] = [];
    let validCount = 0;
    let warningCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] || {};
      const errors: string[] = [];
      const warnings: string[] = [];

      // 1. Resolve room
      let room: any = null;
      if (item.roomId) {
        room = await prisma.consoleRoom.findUnique({
          where: { id: String(item.roomId).trim() },
          include: { building: true, contracts: { where: { status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } } } },
        });
      } else if (item.roomCode) {
        const roomCode = String(item.roomCode).trim().toUpperCase();
        const foundRooms = await prisma.consoleRoom.findMany({
          where: {
            orgId: actor.orgId,
            code: { equals: roomCode, mode: 'insensitive' },
            buildingId: item.buildingId ? String(item.buildingId).trim() : undefined,
          },
          include: { building: true, contracts: { where: { status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } } } },
        });
        if (foundRooms.length === 1) {
          room = foundRooms[0];
        } else if (foundRooms.length > 1) {
          errors.push(`Mã phòng ${roomCode} trùng lặp giữa nhiều tòa nhà. Vui lòng chọn buildingId cụ thể.`);
        }
      }

      if (!room || room.orgId !== actor.orgId) {
        errors.push('Không tìm thấy thông tin phòng trên hệ thống.');
      } else if (!authorizedBuildingIds.has(room.buildingId)) {
        errors.push(`Không có quyền truy cập tòa nhà ${room.building?.name || room.buildingId}.`);
      } else {
        const model = item.rentalModel === 'SHARED_ROOM' ? 'SHARED_ROOM' : item.rentalModel === 'ENTIRE_ROOM' ? 'ENTIRE_ROOM' : room.rentalModel;
        const people = 1 + (Array.isArray(item.occupants) ? item.occupants.length : 0);
        if (model === 'SHARED_ROOM' && people !== 1) errors.push('Mỗi khách ghép phải có hợp đồng riêng.');
        if (room.contracts?.length && (model !== 'SHARED_ROOM' || room.rentalModel !== 'SHARED_ROOM' || room.contracts.some((contract: any) => contract.rentalModel !== 'SHARED_ROOM'))) errors.push('Phòng đang có hợp đồng không tương thích với dạng thuê mới.');
        if ((room.contracts || []).reduce((sum: number, contract: any) => sum + contract.occupantsCount, 0) + people > room.maxOccupants) errors.push('Số người vượt sức chứa phòng.');
      }

      // 2. Validate tenant
      const fullName = String(item.tenantName || item.fullName || '').trim();
      const rawPhone = String(item.tenantPhone || item.phone || '').trim();
      if (!fullName) {
        errors.push('Họ tên khách thuê không được để trống.');
      }
      if (!rawPhone || !isValidVnPhone(rawPhone)) {
        errors.push('Số điện thoại không hợp lệ (yêu cầu số di động Việt Nam 10 chữ số).');
      }
      const normalizedPhone = normalizeVnPhone(rawPhone);

      // 3. Validate dates
      const startDate = String(item.startDate || '').trim();
      const endDate = String(item.endDate || '').trim();
      const paidThrough = String(item.paidThrough || item.startDate || '').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        errors.push('Ngày bắt đầu hợp đồng không hợp lệ (YYYY-MM-DD).');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        errors.push('Ngày kết thúc hợp đồng không hợp lệ (YYYY-MM-DD).');
      }
      if (startDate && endDate && startDate > endDate) {
        errors.push('Ngày bắt đầu hợp đồng phải nhỏ hơn hoặc bằng ngày kết thúc.');
      }
      if (paidThrough && !/^\d{4}-\d{2}-\d{2}$/.test(paidThrough)) {
        errors.push('Ngày đã thu tiền đến (paidThrough) không hợp lệ (YYYY-MM-DD).');
      }

      // 4. Financial fields
      const monthlyRentVnd = Math.max(0, Number(item.monthlyRentVnd || 0));
      const depositVnd = Math.max(0, Number(item.depositVnd || 0));
      const depositPaid = item.depositPaid !== false;
      const openingDebtVnd = Math.max(0, Number(item.openingDebtVnd || 0));
      const openingCreditVnd = Math.max(0, Number(item.openingCreditVnd || 0));

      if (monthlyRentVnd <= 0) {
        warnings.push('Tiền phòng tháng bằng 0 đ (cần kiểm tra lại biểu giá).');
      }

      const status = errors.length > 0 ? 'INVALID' : warnings.length > 0 ? 'WARNING' : 'VALID';
      if (status === 'INVALID') invalidCount++;
      else if (status === 'WARNING') {
        warningCount++;
        validCount++;
      } else {
        validCount++;
      }

      if (status !== 'INVALID') {
        if (depositPaid && depositVnd > 0) {
          totalOpeningDepositVnd += depositVnd;
        }
        totalOpeningDebtVnd += openingDebtVnd;
        totalOpeningCreditVnd += openingCreditVnd;
        if (room && !roomOccupiedSet.has(room.id)) {
          roomOccupiedSet.add(room.id);
          roomsToOccupyCount++;
        }
      }

      rowsEvaluated.push({
        rowIndex: i + 1,
        status,
        errors,
        warnings,
        room: room ? { id: room.id, code: room.code, buildingName: room.building?.name, currentOccupancy: room.occupancyStatus } : null,
        tenant: { fullName, phone: rawPhone, normalizedPhone, idNumber: item.idNumber || item.tenantIdNumber || null },
        contract: {
          contractCode: item.contractCode || `IMP-${room?.code || 'RM'}-${i + 1}`,
          startDate,
          endDate,
          paidThrough,
          monthlyRentVnd,
          depositVnd,
          depositPaid,
          openingDebtVnd,
          openingCreditVnd,
        },
      });
    }

    return sendJson(res, 200, {
      ok: true,
      preview: {
        totalRows: rawItems.length,
        validRows: validCount,
        warningRows: warningCount,
        invalidRows: invalidCount,
        totalOpeningDepositVnd,
        totalOpeningDebtVnd,
        totalOpeningCreditVnd,
        roomsToOccupyCount,
        reconciliationNotes:
          'Khoản cọc lịch sử được ghi nhận nghĩa vụ HELD, KHÔNG ghi nhận dòng tiền thu mới (CASH_IN) vào sổ cái hiện tại. Hóa đơn đầu tiên của hệ thống sẽ chỉ phát sinh từ ngày sau paidThrough.',
        rows: rowsEvaluated,
      },
    });
  }

  if (method === 'POST' && pathname === '/api/v1/console/v2/import/tenants') {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền nhập và chuyển giao hợp đồng khách thuê.',
      });
    }

    const keyHeader = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const body = await readJsonBody(req);
    const rawBatchKey = typeof body.batchKey === 'string' && body.batchKey.trim()
      ? body.batchKey.trim()
      : (typeof keyHeader === 'string' ? keyHeader.trim() : '');
    const batchKey = rawBatchKey || `IMP-BATCH-${Date.now()}`;

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'EMPTY_BATCH',
        message: 'Danh sách dữ liệu nhập trống.',
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'IMPORT_HISTORICAL_TENANT_BATCH',
      batchKey,
      { batchKey, itemsCount: rawItems.length, itemsHash: crypto.createHash('sha256').update(JSON.stringify(rawItems)).digest('hex') },
      res,
      async () => {
        const { authorizedBuildings } = await resolveScopedBuildings(prisma, actor, null, true);
        const authorizedBuildingIds = new Set(authorizedBuildings.map((b) => b.id));

        return await prisma.$transaction(async (tx) => {
          let totalOpeningDepositVnd = 0;
          let totalRoomsOccupied = 0;
          let tenantsCreated = 0;
          let contractsCreated = 0;
          const importedResults: any[] = [];

          for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i] || {};

            // Resolve room
            let room: any = null;
            if (item.roomId) {
              room = await tx.consoleRoom.findUnique({
                where: { id: String(item.roomId).trim() },
                include: { building: true },
              });
            } else if (item.roomCode) {
              const roomCode = String(item.roomCode).trim().toUpperCase();
              const found = await tx.consoleRoom.findMany({
                where: {
                  orgId: actor.orgId,
                  code: { equals: roomCode, mode: 'insensitive' },
                  buildingId: item.buildingId ? String(item.buildingId).trim() : undefined,
                },
                include: { building: true },
              });
              if (found.length === 1) room = found[0];
            }

            if (!room || room.orgId !== actor.orgId || !authorizedBuildingIds.has(room.buildingId)) {
              continue;
            }
            await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${room.id} FOR UPDATE`;
            const importModel = item.rentalModel === 'SHARED_ROOM' ? 'SHARED_ROOM' : item.rentalModel === 'ENTIRE_ROOM' ? 'ENTIRE_ROOM' : room.rentalModel;
            const importPeople = 1 + (Array.isArray(item.occupants) ? item.occupants.length : 0);
            const currentContracts = await tx.contract.findMany({ where: { roomId: room.id, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } }, select: { rentalModel: true, occupantsCount: true } });
            if (importModel === 'SHARED_ROOM' && importPeople !== 1 || currentContracts.length && (importModel !== 'SHARED_ROOM' || room.rentalModel !== 'SHARED_ROOM' || currentContracts.some(contract => contract.rentalModel !== 'SHARED_ROOM')) || currentContracts.reduce((sum, contract) => sum + contract.occupantsCount, 0) + importPeople > room.maxOccupants) {
              importedResults.push({ roomCode: room.code, skipped: true, reason: 'ROOM_MODEL_OR_CAPACITY_CONFLICT' }); continue;
            }

            const fullName = String(item.tenantName || item.fullName || '').trim();
            const rawPhone = String(item.tenantPhone || item.phone || '').trim();
            const normalizedPhone = normalizeVnPhone(rawPhone);
            const idNumber = String(item.idNumber || item.tenantIdNumber || '').trim() || null;
            const startDate = String(item.startDate || '').trim();
            const endDate = String(item.endDate || '').trim();
            const paidThrough = String(item.paidThrough || item.startDate || '').trim();
            const monthlyRentVnd = Math.max(0, Number(item.monthlyRentVnd || 0));
            const depositVnd = Math.max(0, Number(item.depositVnd || 0));
            const depositPaid = item.depositPaid !== false;
            const contractCode = String(item.contractCode || `HD-IMP-${room.code}-${Date.now().toString().slice(-4)}-${i + 1}`).trim();

            // Check if contract with this contractCode already exists in org
            const existingContract = await tx.contract.findFirst({
              where: { orgId: actor.orgId, contractCode },
            });
            if (existingContract) {
              importedResults.push({ contractId: existingContract.id, contractCode, skipped: true, reason: 'ALREADY_EXISTS' });
              continue;
            }

            // Upsert Tenant (E2E-16 duplicate tenant prevention)
            let tenant = await tx.tenant.findFirst({
              where: { orgId: actor.orgId, normalizedPhone },
            });
            if (tenant) {
              tenant = await tx.tenant.update({
                where: { id: tenant.id },
                data: {
                  fullName: fullName || tenant.fullName,
                  idNumber: idNumber || tenant.idNumber,
                  currentRoomId: room.id,
                  primaryBuildingId: room.buildingId,
                },
              });
            } else {
              tenant = await tx.tenant.create({
                data: {
                  orgId: actor.orgId,
                  primaryBuildingId: room.buildingId,
                  currentRoomId: room.id,
                  fullName,
                  phone: rawPhone,
                  normalizedPhone,
                  idNumber,
                  residenceRegStatus: 'REGISTERED',
                  notes: `Imported from legacy paper records (Batch: ${batchKey})`,
                },
              });
              tenantsCreated++;
            }

            // Create Contract
            const contract = await tx.contract.create({
              data: {
                orgId: actor.orgId,
                buildingId: room.buildingId,
                roomId: room.id,
                tenantId: tenant.id,
                contractCode,
                rentalModel: importModel,
                startDate,
                endDate,
                signedAt: new Date(startDate),
                moveInDate: startDate,
                monthlyRentVnd: BigInt(monthlyRentVnd),
                depositVnd: BigInt(depositVnd),
                occupantsCount: 1 + (Array.isArray(item.occupants) ? item.occupants.length : 0),
                electricRateVnd: item.electricRateVnd || room.electricRateVnd || 3800,
                waterBillingMethod: item.waterBillingMethod || room.waterBillingMethod || 'PER_M3',
                waterRateVnd: item.waterRateVnd || room.waterRateVnd || 15000,
                handoverMeterKwh: item.handoverMeterKwh !== undefined ? Number(item.handoverMeterKwh) : null,
                handoverWaterM3: item.handoverWaterM3 !== undefined ? Number(item.handoverWaterM3) : null,
                status: 'ACTIVE',
                notes: `Imported from paper ledger (Batch: ${batchKey}). paidThrough: ${paidThrough}`,
              },
            });
            contractsCreated++;

            // Create Deposit: HELD, PAID (CRITICAL: ZERO CASH_IN LEDGER ENTRY GENERATED)
            if (depositVnd > 0) {
              await tx.deposit.create({
                data: {
                  orgId: actor.orgId,
                  contractId: contract.id,
                  depositType: 'CONTRACT',
                  amountVnd: BigInt(depositVnd),
                  paidAmountVnd: depositPaid ? BigInt(depositVnd) : BigInt(0),
                  paymentStatus: depositPaid ? 'PAID' : 'PENDING',
                  status: 'HELD',
                  receivedAt: depositPaid ? new Date(startDate) : null,
                  paymentMethod: 'OPENING_BALANCE',
                  notes: `OPENING_DEPOSIT - Existing deposit migrated from paper records. paidThrough: ${paidThrough}`,
                },
              });
              if (depositPaid) {
                totalOpeningDepositVnd += depositVnd;
              }
            }

            // Update ConsoleRoom occupancyStatus
            await tx.consoleRoom.update({
              where: { id: room.id },
              data: { occupancyStatus: 'OCCUPIED', rentalModel: importModel },
            });
            if (room.publicListingId) await tx.publicRoomListing.update({ where: { id: room.publicListingId }, data: { status: 'OCCUPIED', rentalModel: importModel, currentTenantName: importModel === 'SHARED_ROOM' ? null : fullName, currentTenantPhone: importModel === 'SHARED_ROOM' ? null : rawPhone } });
            if (currentContracts.length === 0) totalRoomsOccupied++;

            // Create primary RoomOccupant
            await tx.roomOccupant.create({
              data: {
                orgId: actor.orgId,
                roomId: room.id,
                contractId: contract.id,
                tenantId: tenant.id,
                fullName: tenant.fullName,
                phone: tenant.phone,
                idNumber: tenant.idNumber,
                relationToPrimary: 'PRIMARY',
                moveInDate: startDate,
                occupancyStatus: 'ACTIVE',
                isActive: true,
                residenceRegStatus: 'REGISTERED',
              },
            });

            // Create secondary RoomOccupants if provided
            if (Array.isArray(item.occupants)) {
              for (const occ of item.occupants) {
                if (occ && occ.fullName) {
                  await tx.roomOccupant.create({
                    data: {
                      orgId: actor.orgId,
                      roomId: room.id,
                      contractId: contract.id,
                      fullName: String(occ.fullName).trim(),
                      phone: occ.phone ? String(occ.phone).trim() : null,
                      idNumber: occ.idNumber ? String(occ.idNumber).trim() : null,
                      relationToPrimary: occ.relationToPrimary || 'ROOMMATE',
                      moveInDate: startDate,
                      occupancyStatus: 'ACTIVE',
                      isActive: true,
                      residenceRegStatus: 'REGISTERED',
                    },
                  });
                }
              }
            }

            // Audit log for individual import
            await tx.consoleAuditLog.create({
              data: {
                orgId: actor.orgId,
                buildingId: room.buildingId,
                actorId: actor.id,
                actorEmail: actor.email,
                actorRole: actor.role,
                entityType: 'CONTRACT',
                entityId: contract.id,
                action: 'IMPORT_HISTORICAL_TENANT',
                summary: `Nhập khách đang thuê từ sổ cũ: ${tenant.fullName} - Phòng ${room.code} (HĐ: ${contractCode})`,
                metadata: {
                  clientIp,
                  batchKey,
                  roomId: room.id,
                  roomCode: room.code,
                  paidThrough,
                  depositVnd,
                  monthlyRentVnd,
                },
              },
            });

            importedResults.push({
              contractId: contract.id,
              contractCode,
              tenantId: tenant.id,
              tenantName: tenant.fullName,
              roomCode: room.code,
              status: 'IMPORTED',
            });
          }

          // Batch Audit Log
          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'SYSTEM',
              entityId: batchKey,
              action: 'IMPORT_HISTORICAL_TENANT_BATCH',
              summary: `Hoàn tất nhập lô dữ liệu sổ cũ ${batchKey} (${importedResults.length} hợp đồng, ${totalOpeningDepositVnd.toLocaleString('vi-VN')} đ cọc đầu kỳ)`,
              metadata: {
                clientIp,
                batchKey,
                importedCount: importedResults.length,
                totalOpeningDepositVnd,
                totalRoomsOccupied,
                tenantsCreated,
                contractsCreated,
              },
            },
          });

          return {
            status: 200,
            body: {
              ok: true,
              batchKey,
              importedCount: importedResults.length,
              summary: {
                totalOpeningDepositVnd,
                totalRoomsOccupied,
                tenantsCreated,
                contractsCreated,
                financialPolicy: 'ZERO_CURRENT_PERIOD_CASH_IN_PRESERVED',
                reconciliationNotes: 'Khoản cọc lịch sử được chuyển thành nghĩa vụ HELD. Không phát sinh dòng tiền thu mới (CASH_IN) vào sổ cái hiện tại.',
              },
              results: importedResults,
            },
          };
        });
      }
    );
  }

  if (method === 'GET' && pathname === '/api/v1/console/v2/occupancy') {
    const { authorizedBuildings, selectedBuildingIds, forbiddenRequestedIds } =
      await resolveScopedBuildings(prisma, actor, buildingsParam, false);

    if (forbiddenRequestedIds.length > 0 && selectedBuildingIds.length === 0) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập tòa nhà ngoài phạm vi phân công.',
      });
    }

    const bldIds = selectedBuildingIds;

    const rooms = await prisma.consoleRoom.findMany({
      where: { orgId: actor.orgId, buildingId: { in: bldIds } },
      include: {
        building: true,
        contracts: {
          where: { status: 'ACTIVE' },
          include: { tenant: true, deposits: true },
        },
        occupants: {
          where: { isActive: true },
        },
      },
      orderBy: [{ building: { code: 'asc' } }, { displayOrder: 'asc' }, { code: 'asc' }],
    });

    let totalRooms = rooms.length;
    let occupiedRooms = 0;
    let availableRooms = 0;
    let reservedRooms = 0;
    let maintenanceRooms = 0;
    let totalOccupants = 0;

    const roomDetails = rooms.map((r) => {
      const activeContract = r.contracts[0] || null;
      const activeOccupants = r.occupants || [];
      totalOccupants += activeOccupants.length;

      if (r.occupancyStatus === 'OCCUPIED') occupiedRooms++;
      else if (r.occupancyStatus === 'AVAILABLE') availableRooms++;
      else if (r.occupancyStatus === 'RESERVED') reservedRooms++;
      else if (r.occupancyStatus === 'MAINTENANCE') maintenanceRooms++;

      const isConsistent =
        r.occupancyStatus === 'OCCUPIED'
          ? activeContract !== null && activeOccupants.length > 0
          : activeContract === null;

      return {
        roomId: r.id,
        roomCode: r.code,
        roomTitle: r.title,
        buildingId: r.buildingId,
        buildingName: r.building.name,
        buildingCode: r.building.code,
        rentalModel: r.rentalModel,
        occupancyStatus: r.occupancyStatus,
        maxOccupants: r.maxOccupants,
        totalBeds: r.totalBeds,
        occupantsCount: activeOccupants.length,
        isConsistent,
        primaryTenant: activeContract?.tenant
          ? {
              id: activeContract.tenant.id,
              fullName: activeContract.tenant.fullName,
              phone: activeContract.tenant.phone,
              idNumber: activeContract.tenant.idNumber,
            }
          : null,
        activeContract: activeContract
          ? {
              id: activeContract.id,
              contractCode: activeContract.contractCode,
              startDate: activeContract.startDate,
              endDate: activeContract.endDate,
              monthlyRentVnd: toSafeVndNumber(activeContract.monthlyRentVnd),
              depositVnd: toSafeVndNumber(activeContract.depositVnd),
              status: activeContract.status,
              notes: activeContract.notes,
            }
          : null,
        occupants: activeOccupants.map((occ) => ({
          id: occ.id,
          fullName: occ.fullName,
          phone: occ.phone,
          relationToPrimary: occ.relationToPrimary,
          residenceRegStatus: occ.residenceRegStatus,
          isActive: occ.isActive,
        })),
      };
    });

    const occupancyRatePercent =
      totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 1000) / 10 : 0;

    return sendJson(res, 200, {
      ok: true,
      summary: {
        totalRooms,
        occupiedRooms,
        availableRooms,
        reservedRooms,
        maintenanceRooms,
        occupancyRatePercent,
        totalOccupants,
      },
      rooms: roomDetails,
    });
  }

  // ===========================================================================
  // 7. OPERATIONAL MODULE DATA & RECORD CREATION (/api/v1/console/v2/module-data)
  // ===========================================================================
  if (method === 'GET' && pathname === '/api/v1/console/v2/module-data') {
    const moduleKey = String(urlObj.searchParams.get('module') || '').trim();
    const {
      authorizedBuildings,
      selectedBuildingIds,
      forbiddenRequestedIds,
    } = await resolveScopedBuildings(prisma, actor, buildingsParam, false);

    if (forbiddenRequestedIds.length > 0 && selectedBuildingIds.length === 0) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền truy cập tòa nhà ngoài phạm vi phân công.',
      });
    }

    if (moduleKey === 'finance' && !actorHasPermission(actor, 'finance.read')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message:
          'Tài khoản không có quyền truy cập Thu chi và sổ quỹ (finance.read).',
      });
    }

    if (moduleKey === 'reports' && !actorHasPermission(actor, 'reports.read')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền xem Báo cáo doanh thu.',
      });
    }

    const bldIds = selectedBuildingIds;

    if (moduleKey === 'deposits') {
      const [reservations, deposits] = await Promise.all([
        prisma.roomReservation.findMany({
          where: { orgId: actor.orgId, buildingId: { in: bldIds } },
          include: { room: true, building: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.deposit.findMany({
          where: { orgId: actor.orgId },
          include: { reservation: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const allowedResIds = new Set(reservations.map((r) => r.id));
      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        reservations: reservations.map((r) => ({
          id: r.id,
          reservationCode: r.reservationCode,
          buildingCode: r.building.code,
          roomCode: r.room.code,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          holdAmountVnd: toSafeVndNumber(r.holdAmountVnd),
          status: r.status,
          expectedMoveIn: r.expectedMoveIn,
          createdAt: r.createdAt.toISOString(),
        })),
        deposits: deposits
          .filter((d) => !d.reservationId || allowedResIds.has(d.reservationId))
          .map((d) => ({
            id: d.id,
            reservationId: d.reservationId,
            contractId: d.contractId,
            depositType: d.depositType,
            amountVnd: toSafeVndNumber(d.amountVnd),
            paidAmountVnd: toSafeVndNumber(d.paidAmountVnd),
            refundedVnd: toSafeVndNumber(d.refundedVnd),
            deductedAmountVnd: toSafeVndNumber(d.deductedAmountVnd),
            forfeitedAmountVnd: toSafeVndNumber(d.forfeitedAmountVnd),
            transferredAmountVnd: toSafeVndNumber(d.transferredAmountVnd),
            paymentStatus: d.paymentStatus,
            paymentMethod: d.paymentMethod,
            receivedAt: d.receivedAt?.toISOString() || null,
            transferredToDepositId: d.transferredToDepositId,
            status: d.status,
            notes: d.notes,
            createdAt: d.createdAt.toISOString(),
          })),
      });
    }

    if (moduleKey === 'contracts') {
      const contracts = await prisma.contract.findMany({
        where: { orgId: actor.orgId, buildingId: { in: bldIds } },
        include: { room: true, building: true, tenant: true, occupants: true, deposits: true },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        contracts: contracts.map((c) => {
          const collectedDepositVnd = c.deposits.reduce((sum, d) => {
            return sum + Number(d.paidAmountVnd || 0);
          }, 0);
          const reqDeposit = toSafeVndNumber(c.depositVnd);
          const remDeposit = Math.max(0, reqDeposit - collectedDepositVnd);
          return {
            id: c.id,
            contractCode: c.contractCode,
            buildingId: c.buildingId,
            buildingCode: c.building.code,
            roomId: c.roomId,
            roomCode: c.room.code,
            tenantId: c.tenantId,
            tenantName: c.tenant.fullName,
            tenantPhone: c.tenant.phone,
            rentalModel: c.rentalModel,
            startDate: c.startDate,
            endDate: c.endDate,
            signedAt: c.signedAt?.toISOString() || null,
            moveInDate: c.moveInDate,
            handoverMeterKwh: c.handoverMeterKwh,
            handoverWaterM3: c.handoverWaterM3,
            monthlyRentVnd: toSafeVndNumber(c.monthlyRentVnd),
            depositVnd: reqDeposit,
            collectedDepositVnd,
            remainingDepositVnd: remDeposit,
            occupantsCount: c.occupantsCount,
            occupants: c.occupants.map((occ) => ({
              id: occ.id,
              fullName: occ.fullName,
              phone: occ.phone,
              relationToPrimary: occ.relationToPrimary,
              residenceRegStatus: occ.residenceRegStatus,
              isActive: occ.isActive,
              occupancyStatus: (occ as any).occupancyStatus || (occ.isActive ? 'ACTIVE' : 'SCHEDULED'),
            })),
            electricRateVnd: c.electricRateVnd,
            waterBillingMethod: c.waterBillingMethod,
            waterRateVnd: c.waterRateVnd,
            status: c.status,
            notes: c.notes,
            createdAt: c.createdAt.toISOString(),
          };
        }),
      });
    }

    if (moduleKey === 'settlements') {
      const [periods, meters, cronJobs, hunonic, syncJobs, settlementWorkspace] = await Promise.all([
        prisma.billingPeriod.findMany({
          where: {
            orgId: actor.orgId,
            buildingId: { in: bldIds },
            periodKey: activePeriod,
          },
          include: { building: true },
        }),
        prisma.electricMeter.findMany({
          where: {
            orgId: actor.orgId,
            room: { buildingId: { in: bldIds } },
          },
          include: { room: { include: { building: true } } },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.cronJobConfig.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.integrationConnection.findUnique({
          where: {
            orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' },
          },
        }),
        prisma.integrationSyncJob.findMany({
          where: { orgId: actor.orgId, providerId: 'HUNONIC' },
          orderBy: { startedAt: 'desc' },
          take: 6,
        }),
        buildSettlementWorkspacePayload({
          prisma,
          orgId: actor.orgId,
          scopedBuildingIds: bldIds,
          periodKey: activePeriod,
        }),
      ]);

      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        ...settlementWorkspace,
        hunonicStatus: hunonic?.status || 'UNCONFIGURED',
        billingPeriods: authorizedBuildings
          .filter((b) => bldIds.includes(b.id))
          .map((b) => {
            const found = periods.find((p) => p.buildingId === b.id);
            return {
              buildingId: b.id,
              buildingCode: b.code,
              buildingName: b.name,
              periodKey: activePeriod,
              status: found?.status || 'DRAFT',
              exceptionCount: found?.exceptionCount || 0,
              lockedAt: found?.lockedAt?.toISOString() || null,
            };
          }),
        syncJobs: syncJobs.map((j) => ({
          id: j.id,
          jobType: j.jobType,
          status: j.status,
          totalItems: j.totalItems,
          syncedItems: j.syncedItems,
          failedItems: j.failedItems,
          startedAt: j.startedAt.toISOString(),
          completedAt: j.completedAt?.toISOString() || null,
        })),
        meters: meters.map((m) => ({
          id: m.id,
          buildingCode: m.room.building.code,
          roomCode: m.room.code,
          meterSerial: m.meterSerial,
          hunonicDeviceId: m.hunonicDeviceId,
          connectionStatus: m.connectionStatus,
          instantPowerW: m.instantPowerW,
          cumulativeKwh: m.cumulativeKwh,
          monthReportedKwh: m.monthReportedKwh,
          lastSyncedAt: m.lastSyncedAt?.toISOString() || null,
        })),
        cronJobs: cronJobs.map((j) => ({
          id: j.id,
          jobKey: j.jobKey,
          displayName: j.displayName,
          cronExpression: j.cronExpression,
          timezone: j.timezone,
          isEnabled: j.isEnabled,
          lastRunStatus: j.lastRunStatus,
          lastRunAt: j.lastRunAt?.toISOString() || null,
        })),
      });
    }

    if (moduleKey === 'invoices') {
      const invoices = await prisma.invoice.findMany({
        where: {
          orgId: actor.orgId,
          buildingId: { in: bldIds },
          periodKey: activePeriod,
        },
        include: { room: true, building: true, tenant: true },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        invoices: invoices.map((i) => ({
          id: i.id,
          invoiceCode: i.invoiceCode,
          buildingCode: i.building.code,
          roomCode: i.room.code,
          tenantName: i.tenant?.fullName || null,
          periodKey: i.periodKey,
          dueDate: i.dueDate,
          roomRentVnd: toSafeVndNumber(i.roomRentVnd),
          electricVnd: toSafeVndNumber(i.electricVnd),
          waterVnd: toSafeVndNumber(i.waterVnd),
          serviceFeeVnd: toSafeVndNumber(i.serviceFeeVnd),
          adjustmentVnd: toSafeVndNumber(i.adjustmentVnd),
          totalAmountVnd: toSafeVndNumber(i.totalAmountVnd),
          paidAmountVnd: toSafeVndNumber(i.paidAmountVnd),
          status: i.status,
          createdAt: i.createdAt.toISOString(),
        })),
      });
    }

    if (moduleKey === 'payments') {
      const [transactions, paymentProviders] = await Promise.all([
        prisma.paymentTransaction.findMany({
          where: {
            orgId: actor.orgId,
            periodKey: activePeriod,
            ...(bldIds.length > 0
              ? {
                  OR: [
                    { buildingId: { in: bldIds } },
                    ...(actor.role === 'ADMIN' ? [{ buildingId: null }] : []),
                  ],
                }
              : { buildingId: '__NONE__' }),
          },
          include: { invoice: { include: { room: true, building: true, tenant: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.integrationConnection.findMany({
          where: { orgId: actor.orgId, category: 'PAYMENT' },
          orderBy: { providerId: 'asc' },
        }),
      ]);

      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        providers: paymentProviders.map((p) => ({
          providerId: p.providerId,
          displayName: p.displayName,
          isEnabled: p.isEnabled,
          status: p.status,
          capabilities: Array.isArray(p.capabilities)
            ? (p.capabilities as string[])
            : [],
        })),
        transactions: transactions.map((t) => ({
          id: t.id,
          providerId: t.providerId,
          externalTxId: t.externalTxId,
          amountVnd: toSafeVndNumber(t.amountVnd),
          payerName: t.payerName || t.invoice?.tenant?.fullName || null,
          referenceText: t.referenceText,
          reconcileState: t.reconcileState,
          invoiceId: t.invoiceId || null,
          invoiceCode: t.invoice?.invoiceCode || null,
          buildingCode: t.invoice?.building?.code || null,
          roomCode: t.invoice?.room?.code || null,
          tenantName: t.invoice?.tenant?.fullName || null,
          verifiedAt: t.verifiedAt.toISOString(),
        })),
      });
    }

    if (moduleKey === 'finance') {
      const entries = await prisma.ledgerEntry.findMany({
        where: {
          orgId: actor.orgId,
          periodKey: activePeriod,
          ...(bldIds.length > 0
            ? {
                OR: [
                  { buildingId: { in: bldIds } },
                  ...(actor.role === 'ADMIN' ? [{ buildingId: null }] : []),
                ],
              }
            : { buildingId: '__NONE__' }),
        },
        orderBy: { occurredAt: 'desc' },
      });
      const totalIncomeVnd = entries
        .filter((e) => e.entryType === 'INCOME')
        .reduce((sum, e) => sum + toSafeVndNumber(e.amountVnd), 0);
      const totalExpenseVnd = entries
        .filter((e) => e.entryType === 'EXPENSE')
        .reduce((sum, e) => sum + toSafeVndNumber(e.amountVnd), 0);

      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        summary: {
          totalIncomeVnd,
          totalExpenseVnd,
          netCashflowVnd: totalIncomeVnd - totalExpenseVnd,
        },
        entries: entries.map((e) => ({
          id: e.id,
          entryCode: e.entryCode,
          buildingId: e.buildingId,
          periodKey: e.periodKey,
          entryType: e.entryType,
          category: e.category,
          amountVnd: toSafeVndNumber(e.amountVnd),
          description: e.description,
          recordedBy: e.recordedBy,
          occurredAt: e.occurredAt.toISOString(),
        })),
      });
    }

    if (moduleKey === 'reports') {
      const [rooms, contracts, invoices] = await Promise.all([
        prisma.consoleRoom.findMany({
          where: {
            orgId: actor.orgId,
            buildingId: { in: bldIds },
            occupancyStatus: { not: 'ARCHIVED' },
          },
        }),
        prisma.contract.findMany({
          where: {
            orgId: actor.orgId,
            buildingId: { in: bldIds },
            status: { in: [...ACTIVE_CONTRACT_STATUSES] },
          },
        }),
        prisma.invoice.findMany({
          where: {
            orgId: actor.orgId,
            buildingId: { in: bldIds },
            periodKey: activePeriod,
            status: { not: 'VOID' },
          },
        }),
      ]);

      const breakdown = authorizedBuildings
        .filter((b) => bldIds.includes(b.id))
        .map((b) => {
          const bRooms = rooms.filter((r) => r.buildingId === b.id);
          const bOccupied = bRooms.filter(
            (r) => r.occupancyStatus === 'OCCUPIED'
          ).length;
          const bContracts = contracts.filter((c) => c.buildingId === b.id);
          const bInvoices = invoices.filter((i) => i.buildingId === b.id);
          const invoicedVnd = bInvoices.reduce(
            (sum, i) => sum + toSafeVndNumber(i.totalAmountVnd),
            0
          );
          const collectedVnd = bInvoices.reduce(
            (sum, i) => sum + toSafeVndNumber(i.paidAmountVnd),
            0
          );
          return {
            buildingId: b.id,
            buildingCode: b.code,
            buildingName: b.name,
            totalRooms: bRooms.length,
            occupiedRooms: bOccupied,
            occupancyRatePercent:
              bRooms.length > 0
                ? Math.round((bOccupied / bRooms.length) * 1000) / 10
                : 0,
            contractedRentVnd: bContracts.reduce(
              (sum, c) => sum + toSafeVndNumber(c.monthlyRentVnd),
              0
            ),
            invoicedVnd,
            collectedVnd,
            receivableVnd: Math.max(0, invoicedVnd - collectedVnd),
          };
        });

      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
        breakdown,
      });
    }

    return sendJson(res, 400, {
      ok: false,
      errorCode: 'UNKNOWN_MODULE',
      message: 'Module dữ liệu không hợp lệ.',
    });
  }

  // POST /api/v1/console/v2/contracts (Real PostgreSQL Contract Creation)
  if (method === 'POST' && pathname === '/api/v1/console/v2/contracts') {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền tạo hợp đồng.',
      });
    }

    const body = await readJsonBody(req);
    const roomId = String(body.roomId || '').trim();
    const tenantId = String(body.tenantId || '').trim();
    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();
    const monthlyRentVnd = Math.trunc(Number(body.monthlyRentVnd));
    const depositVnd = Math.trunc(Number(body.depositVnd ?? monthlyRentVnd));
    const occupantsCount = Math.max(
      1,
      Math.min(12, Math.trunc(Number(body.occupantsCount ?? 1)))
    );
    const rentalModel = ['ENTIRE_ROOM', 'SHARED_ROOM'].includes(String(body.rentalModel || ''))
      ? String(body.rentalModel)
      : 'ENTIRE_ROOM';
    const coOccupants: Array<{
      fullName: string;
      phone?: string;
      idNumber?: string;
      relationToPrimary?: string;
    }> = Array.isArray(body.coOccupants) ? body.coOccupants : [];
    if (rentalModel === 'SHARED_ROOM' && (occupantsCount !== 1 || coOccupants.length)) return sendJson(res, 422, { ok: false, message: 'Mỗi khách ghép phải có hợp đồng riêng và một người đứng tên.' });

    if (
      !roomId ||
      !tenantId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      endDate <= startDate ||
      !Number.isInteger(monthlyRentVnd) ||
      monthlyRentVnd < 500_000
    ) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message:
          'Vui lòng chọn phòng, khách thuê, thời hạn hợp đồng hợp lệ và tiền thuê nguyên VND (>= 500.000đ).',
      });
    }

    const [rm, tenant, org] = await Promise.all([
      prisma.consoleRoom.findUnique({
        where: { id: roomId },
        include: { building: true },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.organization.findUnique({ where: { id: actor.orgId } }),
    ]);

    if (!rm || rm.orgId !== actor.orgId || !tenant || tenant.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng hoặc khách thuê không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền lập hợp đồng ngoài tòa nhà phụ trách.',
      });
    }

    const contractCode = `HD-${rm.building.code}-${rm.code}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;

    const waterMethod =
      (typeof body.waterBillingMethod === 'string' &&
      VALID_WATER_METHODS.has(body.waterBillingMethod)
        ? body.waterBillingMethod
        : null) ||
      rm.waterBillingMethod ||
      rm.building.waterBillingMethod ||
      org?.defaultWaterMethod ||
      'PER_M3';
    const waterRateVnd = Math.trunc(
      Number(
        body.waterRateVnd ??
          rm.waterRateVnd ??
          rm.building.waterRateVnd ??
          org?.defaultWaterRateVnd ??
          15000
      )
    );
    const electricRateVnd = Math.trunc(
      Number(
        body.electricRateVnd ??
          rm.electricRateVnd ??
          rm.building.electricRateVnd ??
          org?.defaultElectricRateVnd ??
          3800
      )
    );

    const isDepositPaid = Boolean(body.isDepositPaid);
    if (isDepositPaid && !actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền xác nhận thu tiền cọc (yêu cầu finance.write).',
      });
    }
    const depositPaymentMethod = isDepositPaid ? String(body.depositPaymentMethod || 'CASH').trim() : null;

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Concurrency Row-Level Lock on room row
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${rm.id} FOR UPDATE`;

        const existingContracts = await tx.contract.findMany({
          where: {
            roomId: rm.id,
            status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] },
          },
        });
        if (existingContracts.length && (rm.rentalModel !== 'SHARED_ROOM' || rentalModel !== 'SHARED_ROOM' || existingContracts.some(contract => contract.rentalModel !== 'SHARED_ROOM'))) {
          const err: any = new Error(`Phòng ${rm.code} đang có hợp đồng hiệu lực hoặc chờ bàn giao.`);
          err.code = 'ROOM_ALREADY_HAS_CONTRACT';
          err.statusCode = 409;
          throw err;
        }
        if (existingContracts.reduce((sum, contract) => sum + contract.occupantsCount, 0) + occupantsCount > rm.maxOccupants) {
          const err: any = new Error('Phòng ghép đã hết chỗ.');
          err.code = 'ROOM_CAPACITY_EXCEEDED'; err.statusCode = 409; throw err;
        }
        if (existingContracts.some(contract => contract.tenantId === tenant.id)) {
          const err: any = new Error('Khách đã có hợp đồng tại phòng này.');
          err.code = 'TENANT_ALREADY_CONTRACTED'; err.statusCode = 409; throw err;
        }
        if (rentalModel === 'SHARED_ROOM' && coOccupants.length) {
          const err: any = new Error('Mỗi khách ghép phải có hợp đồng riêng.'); err.code = 'SHARED_CONTRACT_PER_PERSON'; err.statusCode = 409; throw err;
        }

        // Check if room is currently held by an active reservation (P0 Room Conflict)
        const activeResv = await tx.roomReservation.findFirst({
          where: {
            roomId: rm.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });
        if (activeResv && (!body.reservationId || activeResv.id !== String(body.reservationId))) {
          const err: any = new Error(
            `Phòng ${rm.code} hiện đang có phiếu giữ chỗ hoạt động (${activeResv.reservationCode}). Không thể tạo hợp đồng trực tiếp.`
          );
          err.code = 'ROOM_CURRENTLY_RESERVED';
          err.statusCode = 409;
          throw err;
        }

        const ct = await tx.contract.create({
          data: {
            orgId: actor.orgId,
            buildingId: rm.buildingId,
            roomId: rm.id,
            tenantId: tenant.id,
            reservationId: body.reservationId ? String(body.reservationId) : null,
            contractCode,
            rentalModel,
            startDate,
            endDate,
            signedAt: new Date(),
            moveInDate: null,
            monthlyRentVnd: BigInt(monthlyRentVnd),
            depositVnd: BigInt(Math.max(0, depositVnd)),
            occupantsCount,
            electricRateVnd,
            waterBillingMethod: waterMethod,
            waterRateVnd,
            handoverMeterKwh: null,
            handoverWaterM3: null,
            status: 'DRAFT',
          },
        });

        // Primary occupant created in DRAFT contract; room is RESERVED until formal handover

        // Create primary occupant (P1-01: SCHEDULED until formal handover)
        await tx.roomOccupant.create({
          data: {
            orgId: actor.orgId,
            roomId: rm.id,
            contractId: ct.id,
            tenantId: tenant.id,
            fullName: tenant.fullName,
            phone: tenant.phone,
            idNumber: tenant.idNumber,
            relationToPrimary: 'PRIMARY',
            residenceRegStatus: tenant.residenceRegStatus || 'PENDING',
            moveInDate: startDate,
            isActive: false,
            occupancyStatus: 'SCHEDULED',
          },
        });

        // Create co-occupants if provided
        for (const occ of coOccupants) {
          if (occ && occ.fullName && occ.fullName.trim()) {
            await tx.roomOccupant.create({
              data: {
                orgId: actor.orgId,
                roomId: rm.id,
                contractId: ct.id,
                fullName: occ.fullName.trim(),
                phone: occ.phone?.trim() || null,
                idNumber: occ.idNumber?.trim() || null,
                dateOfBirth: (occ as any).birthDate || null,
                gender: (occ as any).gender || null,
                relationToPrimary: occ.relationToPrimary || 'ROOMMATE',
                residenceRegStatus: 'PENDING',
                moveInDate: startDate,
                isActive: false,
                occupancyStatus: 'SCHEDULED',
              },
            });
          }
        }

        let dep = null;
        if (depositVnd > 0) {
          dep = await tx.deposit.create({
            data: {
              orgId: actor.orgId,
              contractId: ct.id,
              depositType: 'CONTRACT',
              amountVnd: BigInt(depositVnd),
              paidAmountVnd: isDepositPaid ? BigInt(depositVnd) : BigInt(0),
              paymentStatus: isDepositPaid ? 'PAID' : 'PENDING',
              receivedAt: isDepositPaid ? new Date() : null,
              paymentMethod: depositPaymentMethod,
              status: 'HELD',
              notes: `Tiền cọc hợp đồng ${contractCode} (${isDepositPaid ? 'Đã thu tiền' : 'Chưa thu tiền'})`,
            },
          });

          if (isDepositPaid) {
            await tx.ledgerEntry.create({
              data: {
                orgId: actor.orgId,
                buildingId: rm.buildingId,
                periodKey: getCurrentVnPeriodKey(),
                entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                  .randomBytes(2)
                  .toString('hex')
                  .toUpperCase()}`,
                entryType: 'INCOME',
                category: 'Cọc hợp đồng',
                amountVnd: BigInt(depositVnd),
                description: `Thu tiền cọc hợp đồng ${contractCode} - ${tenant.fullName}`,
                recordedBy: actor.email,
              },
            });
          }
        }

        // Generate First Combined Invoice with Prorate Engine (C4-BILL-01 & C4-BILL-02)
        const firstRentCalc = calculateFirstPeriodRent(
          String(body.firstPeriodBillingPolicy || 'CALENDAR_PRORATE'),
          startDate,
          monthlyRentVnd,
          body.customFirstPeriodVnd !== undefined ? Number(body.customFirstPeriodVnd) : undefined
        );
        const rentFirstPeriodVnd = firstRentCalc.rentFirstPeriodVnd;

        const initialInvoiceCode = `HD-INV-${rm.building.code}-${rm.code}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`;
        const additionalDepositDue = isDepositPaid ? 0 : depositVnd;
        const totalFirstDue = rentFirstPeriodVnd + additionalDepositDue;

        await tx.invoice.create({
          data: {
            orgId: actor.orgId,
            buildingId: rm.buildingId,
            roomId: rm.id,
            contractId: ct.id,
            tenantId: tenant.id,
            invoiceCode: initialInvoiceCode,
            periodKey: firstRentCalc.periodKey,
            dueDate: startDate,
            roomRentVnd: BigInt(rentFirstPeriodVnd),
            adjustmentVnd: BigInt(additionalDepositDue),
            totalAmountVnd: BigInt(totalFirstDue),
            status: totalFirstDue === 0 ? 'PAID' : 'ISSUED',
            paidAmountVnd: totalFirstDue === 0 ? BigInt(totalFirstDue) : BigInt(0),
            policySnapshot: {
              type: 'FIRST_COMBINED_INVOICE',
              billingPolicy: firstRentCalc.policy,
              daysInMonth: firstRentCalc.daysInMonth,
              billedDays: firstRentCalc.billedDays,
              periodStartDate: firstRentCalc.periodStartDate,
              periodEndDate: firstRentCalc.periodEndDate,
              formula: firstRentCalc.formula,
              breakdown: [
                {
                  label: `Tiền thuê chu kỳ đầu (${firstRentCalc.billedDays}/${firstRentCalc.daysInMonth} ngày: ${firstRentCalc.periodStartDate} → ${firstRentCalc.periodEndDate})`,
                  amountVnd: rentFirstPeriodVnd,
                },
                { label: 'Tiền cọc hợp đồng yêu cầu', amountVnd: depositVnd },
                ...(isDepositPaid
                  ? [{ label: 'Tiền cọc hợp đồng đã thu riêng', amountVnd: -depositVnd }]
                  : []),
              ],
              financialSummary: {
                monthlyRentVnd,
                rentFirstPeriodVnd,
                depositVnd,
                isDepositPaid,
                additionalDepositDue,
                totalFirstDue,
              },
            },
          },
        });

        await tx.consoleRoom.update({
          where: { id: rm.id },
          data: { occupancyStatus: existingContracts.some(contract => contract.status !== 'DRAFT') ? 'OCCUPIED' : 'RESERVED', rentalModel },
        });
        if (rm.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: rm.publicListingId },
            data: {
              status: existingContracts.some(contract => contract.status !== 'DRAFT') ? 'OCCUPIED' : 'RESERVED',
              rentalModel,
              currentTenantName: null,
              currentTenantPhone: null,
            },
          });
        }
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { primaryBuildingId: rm.buildingId },
        });

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: rm.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'CONTRACT',
            entityId: ct.id,
            action: 'CREATE_CONTRACT',
            summary: `Ký hợp đồng ${ct.contractCode} cho ${tenant.fullName} · Phòng ${rm.code}`,
            metadata: { clientIp, monthlyRentVnd, depositVnd, rentalModel },
          },
        });

        return ct;
      });

      return sendJson(res, 201, {
        ok: true,
        contract: {
          ...created,
          monthlyRentVnd: toSafeVndNumber(created.monthlyRentVnd),
          depositVnd: toSafeVndNumber(created.depositVnd),
        },
      });
    } catch (err: any) {
      if (err?.code === 'ROOM_ALREADY_HAS_CONTRACT' || err?.code === 'ROOM_CURRENTLY_RESERVED' || err?.statusCode === 409) {
        return sendJson(res, 409, {
          ok: false,
          errorCode: err.code || 'ROOM_ALREADY_HAS_CONTRACT',
          message: err.message || `Phòng ${rm.code} đang có hợp đồng hiệu lực hoặc đang giữ chỗ.`,
        });
      }
      throw err;
    }
  }

  // POST /api/v1/console/v2/contracts/:id/handover
  const contractHandoverMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/handover$/
  );
  if (method === 'POST' && contractHandoverMatch) {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thực hiện bàn giao phòng.',
      });
    }

    const contractId = decodeURIComponent(contractHandoverMatch[1]);
    const body = await readJsonBody(req);
    const ct = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { room: { include: { building: true, electricMeter: true } }, tenant: true },
    });
    if (!ct || ct.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'CONTRACT_NOT_FOUND',
        message: 'Hợp đồng không tồn tại.',
      });
    }
    if (!isBuildingAllowedForActor(actor, ct.buildingId, ct.room.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền bàn giao phòng ngoài tòa nhà phụ trách.',
      });
    }

    // Check if contract is already ACTIVE (Idempotency)
    if (ct.status === 'ACTIVE') {
      return sendJson(res, 200, {
        ok: true,
        alreadyActive: true,
        contract: {
          ...ct,
          monthlyRentVnd: toSafeVndNumber(ct.monthlyRentVnd),
          depositVnd: toSafeVndNumber(ct.depositVnd),
        },
      });
    }

    // Must strictly be in DRAFT status
    if (ct.status !== 'DRAFT') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVALID_CONTRACT_STATUS',
        message: `Hợp đồng đang ở trạng thái "${ct.status}", chỉ có thể bàn giao hợp đồng đang ở trạng thái Chờ bàn giao (DRAFT).`,
      });
    }

    // C4-HAND-01: Check Deposit Collection Policy before Handover
    const depositSummary = await prisma.deposit.aggregate({
      where: {
        contractId: ct.id,
        depositType: 'CONTRACT',
        status: { in: ['HELD', 'PAID'] },
      },
      _sum: {
        paidAmountVnd: true,
      },
    });
    const paidDepositTotal = Number(depositSummary._sum.paidAmountVnd || 0);
    const requiredDeposit = Number(ct.depositVnd || 0);
    const isDepositFullyPaid = paidDepositTotal >= requiredDeposit;

    const allowPartialWithApproval = Boolean(
      body.allowPartialDepositWithApproval || body.overrideDepositRequirement
    );

    if (!isDepositFullyPaid && requiredDeposit > 0) {
      if (!allowPartialWithApproval) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'UNPAID_DEPOSIT_REQUIRED',
          message: `Hợp đồng chưa thu đủ tiền cọc (${requiredDeposit.toLocaleString('vi-VN')} đ, đã ghi nhận: ${paidDepositTotal.toLocaleString('vi-VN')} đ). Bắt buộc phải thu cọc trước khi bàn giao, hoặc yêu cầu phê duyệt từ Quản lý (ALLOW_PARTIAL_WITH_APPROVAL).`,
          requiredDepositVnd: requiredDeposit,
          paidDepositVnd: paidDepositTotal,
          outstandingDepositVnd: requiredDeposit - paidDepositTotal,
        });
      }

      // Check permission for partial deposit handover approval
      const canApproveOverride =
        actor.role === 'ADMIN';
      if (!canApproveOverride) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION_OVERRIDE',
          message: 'Chỉ Quản trị viên (ADMIN) được phê duyệt bàn giao khi còn nợ cọc.',
        });
      }

      const overrideReason = String(body.depositOverrideReason || body.overrideReason || '').trim();
      if (!overrideReason) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'OVERRIDE_REASON_REQUIRED',
          message: 'Bắt buộc nhập lý do phê duyệt bàn giao phòng khi chưa thu đủ tiền cọc.',
        });
      }
    }

    const handoverMeterKwh =
      body.handoverMeterKwh !== undefined && body.handoverMeterKwh !== null && !isNaN(Number(body.handoverMeterKwh))
        ? Number(body.handoverMeterKwh)
        : null;
    const handoverWaterM3 =
      body.handoverWaterM3 !== undefined && body.handoverWaterM3 !== null && !isNaN(Number(body.handoverWaterM3))
        ? Number(body.handoverWaterM3)
        : null;

    const isMeteredRoom = Boolean(
      ct.room.electricMeter ||
      (ct.room.electricRateVnd && ct.room.electricRateVnd > 0)
    );
    if (ct.room.rentalModel !== 'SHARED_ROOM' && isMeteredRoom && (handoverMeterKwh === null || handoverMeterKwh === undefined || isNaN(handoverMeterKwh))) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'MISSING_INITIAL_METER_READING',
        message: 'Phòng tính điện theo công tơ, bắt buộc phải có chỉ số điện đầu kỳ hợp lệ (>= 0) khi bàn giao.',
      });
    }

    const isWaterMetered = ct.waterBillingMethod === 'PER_M3' || ct.room.waterBillingMethod === 'PER_M3';
    if (ct.room.rentalModel !== 'SHARED_ROOM' && isWaterMetered && (handoverWaterM3 === null || handoverWaterM3 === undefined || isNaN(handoverWaterM3))) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'MISSING_INITIAL_WATER_READING',
        message: 'Phòng tính nước theo đồng hồ (PER_M3), bắt buộc phải có chỉ số nước đầu kỳ hợp lệ (>= 0) khi bàn giao.',
      });
    }

    if (handoverMeterKwh !== null && handoverMeterKwh < 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Chỉ số điện bàn giao không hợp lệ (phải >= 0).',
      });
    }
    if (handoverWaterM3 !== null && handoverWaterM3 < 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Chỉ số nước bàn giao không hợp lệ (phải >= 0).',
      });
    }

    const moveInDate =
      typeof body.moveInDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.moveInDate)
        ? body.moveInDate
        : getTodayIsoVn();

    const handoverBy = String(body.handoverBy || actor.email).trim();
    const handoverTo = String(body.handoverTo || ct.tenant.fullName).trim();
    const handoverNotes = typeof body.notes === 'string' ? body.notes.trim() : null;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Concurrency row-level locks
        await tx.$executeRaw`SELECT id FROM "contracts" WHERE id = ${ct.id} FOR UPDATE`;
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${ct.roomId} FOR UPDATE`;

        const freshCt = await tx.contract.findUnique({
          where: { id: ct.id },
          include: { room: { include: { electricMeter: true } } },
        });
        if (!freshCt || freshCt.orgId !== actor.orgId) {
          throw new Error('CONTRACT_NOT_FOUND');
        }
        if (freshCt.status === 'ACTIVE') {
          return freshCt; // idempotent in tx
        }
        if (freshCt.status !== 'DRAFT') {
          const err: any = new Error(
            `Hợp đồng ở trạng thái "${freshCt.status}", không thể thực hiện bàn giao.`
          );
          err.errorCode = 'INVALID_CONTRACT_STATUS';
          err.statusCode = 422;
          throw err;
        }

        const lockedDeposit = await tx.deposit.findMany({ where: { contractId: ct.id, depositType: 'CONTRACT' } });
        const actualDeposit = lockedDeposit.reduce((sum, d) => sum + availableDeposit(d), 0);
        if (actualDeposit < Number(freshCt.depositVnd) && (!allowPartialWithApproval || actor.role !== 'ADMIN' || !String(body.depositOverrideReason || body.overrideReason || '').trim())) {
          throw Object.assign(new Error('Tiền cọc đã thay đổi hoặc chưa đủ. Hãy tải lại trước khi bàn giao.'), { statusCode: 422 });
        }
        const c = await tx.contract.update({
          where: { id: ct.id },
          data: {
            handoverMeterKwh,
            handoverWaterM3,
            moveInDate,
            status: 'ACTIVE',
          },
        });

        // Activate occupants upon formal handover (P1-01)
        await tx.roomOccupant.updateMany({
          where: { contractId: ct.id },
          data: {
            isActive: true,
            occupancyStatus: 'ACTIVE',
            moveInDate,
          },
        });
        await tx.tenant.update({ where: { id: ct.tenantId }, data: { currentRoomId: ct.roomId, primaryBuildingId: ct.buildingId } });

        // If meter reading provided and meter exists, record baseline reading
        if (ct.room.rentalModel !== 'SHARED_ROOM' && handoverMeterKwh !== null && ct.room.electricMeter) {
          await tx.meterReading.create({
            data: {
              meterId: ct.room.electricMeter.id,
              periodKey: getCurrentVnPeriodKey(),
              readingKwh: handoverMeterKwh,
              source: 'MANUAL_OVERRIDE',
              recordedByActor: actor.email,
              overrideReason: `Bàn giao phòng hợp đồng ${ct.contractCode} (Giao: ${handoverBy}, Nhận: ${handoverTo})`,
            },
          });
        }

        await tx.consoleRoom.update({
          where: { id: ct.roomId },
          data: { occupancyStatus: 'OCCUPIED' },
        });
        if (ct.room.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: ct.room.publicListingId },
            data: {
              status: 'OCCUPIED',
              currentTenantName: ct.room.rentalModel === 'SHARED_ROOM' ? null : handoverTo || ct.tenant.fullName,
              currentTenantPhone: ct.room.rentalModel === 'SHARED_ROOM' ? null : ct.tenant.phone,
            },
          });
        }

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: ct.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'CONTRACT',
            entityId: ct.id,
            action: 'HANDOVER_ROOM',
            summary: `Bàn giao phòng ${ct.room.code} cho hợp đồng ${ct.contractCode} (Giao: ${handoverBy}, Nhận: ${handoverTo}, Điện: ${handoverMeterKwh ?? 'N/A'} kWh, Nước: ${handoverWaterM3 ?? 'N/A'} m³)${!isDepositFullyPaid && requiredDeposit > 0 ? ` [DUYỆT NỢ CỌC: thiếu ${(requiredDeposit - paidDepositTotal).toLocaleString('vi-VN')}đ, Lý do: ${body.depositOverrideReason || body.overrideReason}]` : ''}`,
            metadata: {
              clientIp,
              handoverBy,
              handoverTo,
              notes: handoverNotes,
              handoverMeterKwh,
              handoverWaterM3,
              moveInDate,
              depositCompliance: {
                requiredDeposit,
                paidDepositTotal,
                isDepositFullyPaid,
                allowPartialWithApproval,
                overrideReason: !isDepositFullyPaid ? String(body.depositOverrideReason || body.overrideReason || '') : null,
                approvedBy: !isDepositFullyPaid ? actor.email : null,
              },
            },
          },
        });

        return c;
      });

      return sendJson(res, 200, {
        ok: true,
        contract: {
          ...updated,
          monthlyRentVnd: toSafeVndNumber(updated.monthlyRentVnd),
          depositVnd: toSafeVndNumber(updated.depositVnd),
        },
      });
    } catch (err: any) {
      if (err.statusCode) {
        return sendJson(res, err.statusCode, {
          ok: false,
          errorCode: err.errorCode || 'HANDOVER_FAILED',
          message: err.message,
        });
      }
      throw err;
    }
  }

  // ===========================================================================
  // C3A: RESERVATIONS, DEPOSITS & CONTRACT LIFECYCLE STATE MACHINES
  // ===========================================================================

  // POST /api/v1/console/v2/reservations (Create Room Reservation & Hold Deposit)
  if (method === 'POST' && pathname === '/api/v1/console/v2/reservations') {
    if (!actorHasPermission(actor, 'contracts.manage') && !actorHasPermission(actor, 'tenants.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền tạo phiếu giữ chỗ phòng.',
      });
    }

    const body = await readJsonBody(req);
    const roomId = String(body.roomId || '').trim();
    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const holdAmountVnd = Math.max(0, Math.trunc(Number(body.holdAmountVnd) || 0));
    const expectedMoveIn =
      typeof body.expectedMoveIn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expectedMoveIn)
        ? body.expectedMoveIn
        : null;
    const holdDays = Math.max(1, Math.min(30, Math.trunc(Number(body.holdDays) || 7)));
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    const paymentConfirmed = Boolean(body.paymentConfirmed);
    const paymentMethod = String(body.paymentMethod || 'BANK_TRANSFER').trim();

    if (paymentConfirmed && holdAmountVnd > 0 && !actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền xác nhận thu tiền cọc giữ chỗ (yêu cầu finance.write).',
      });
    }

    if (!roomId || !customerName || !customerPhone) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng điền đủ thông tin phòng, tên khách hàng và số điện thoại.',
      });
    }

    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true },
    });
    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền lập phiếu giữ chỗ ngoài tòa nhà phụ trách.',
      });
    }

    const reservationCode = `GC-${rm.building.code}-${rm.code}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;
    const holdUntil = new Date(Date.now() + holdDays * 86400000);

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'CREATE_RESERVATION',
      req.headers['idempotency-key'] || (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined),
      { roomId, customerName, customerPhone, holdAmountVnd, expectedMoveIn, holdDays, paymentConfirmed, paymentMethod },
      res,
      async () => {
        try {
          const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${rm.id} FOR UPDATE`;

            const freshRoom = await tx.consoleRoom.findUnique({
              where: { id: rm.id },
            });
            if (!freshRoom || freshRoom.orgId !== actor.orgId) {
              const err: any = new Error('Phòng không tồn tại trong tổ chức.');
              err.statusCode = 404;
              throw err;
            }

            const activeContracts = await tx.contract.count({
              where: { roomId: rm.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
            });
            if (activeContracts > 0) {
              const err: any = new Error(
                `Phòng ${rm.code} đang có hợp đồng thuê hoạt động, không thể giữ chỗ.`
              );
              err.statusCode = 409;
              err.errorCode = 'ROOM_CONFLICT';
              throw err;
            }

            const existingResv = await tx.roomReservation.count({
              where: { roomId: rm.id, status: { in: ['PENDING', 'CONFIRMED'] } },
            });
            if (existingResv > 0) {
              const err: any = new Error(`Phòng ${rm.code} đang có phiếu giữ chỗ hoạt động.`);
              err.statusCode = 409;
              err.errorCode = 'ROOM_CONFLICT';
              throw err;
            }

            const resv = await tx.roomReservation.create({
              data: {
                orgId: actor.orgId,
                buildingId: rm.buildingId,
                roomId: rm.id,
                reservationCode,
                customerName,
                customerPhone,
                holdAmountVnd: BigInt(holdAmountVnd),
                status: paymentConfirmed && holdAmountVnd > 0 ? 'CONFIRMED' : 'PENDING',
                holdUntil,
                expectedMoveIn,
                notes,
              },
            });

            let dep = null;
            if (holdAmountVnd > 0) {
              dep = await tx.deposit.create({
                data: {
                  orgId: actor.orgId,
                  reservationId: resv.id,
                  depositType: 'BOOKING',
                  amountVnd: BigInt(holdAmountVnd),
                  paidAmountVnd: paymentConfirmed ? BigInt(holdAmountVnd) : BigInt(0),
                  paymentStatus: paymentConfirmed ? 'PAID' : 'PENDING',
                  paymentMethod: paymentConfirmed ? paymentMethod : null,
                  receivedAt: paymentConfirmed ? new Date() : null,
                  status: 'HELD',
                  notes: `Tiền cọc giữ chỗ ${resv.reservationCode}`,
                },
              });

              // Only create INCOME ledger entry if payment is actually confirmed as received!
              if (paymentConfirmed) {
                await tx.ledgerEntry.create({
                  data: {
                    orgId: actor.orgId,
                    buildingId: rm.buildingId,
                    periodKey: getCurrentVnPeriodKey(),
                    entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                      .randomBytes(2)
                      .toString('hex')
                      .toUpperCase()}`,
                    entryType: 'INCOME',
                    category: 'Cọc giữ chỗ',
                    amountVnd: BigInt(holdAmountVnd),
                    description: `Thu tiền cọc giữ chỗ ${resv.reservationCode} - ${customerName}`,
                    recordedBy: actor.email,
                  },
                });

                if (['SEPAY_QR', 'PAYOS_QR', 'BANK_TRANSFER'].includes(paymentMethod)) {
                  await tx.paymentTransaction.create({
                    data: {
                      orgId: actor.orgId,
                      buildingId: rm.buildingId,
                      providerId: paymentMethod.includes('SEPAY') ? 'SEPAY' : paymentMethod.includes('PAYOS') ? 'PAYOS' : 'MANUAL_TRANSFER',
                      externalTxId: `TX-RESV-${resv.reservationCode}-${Date.now()}`,
                      idempotencyKey: `pay-resv-${resv.id}`,
                      amountVnd: BigInt(holdAmountVnd),
                      payerName: customerName,
                      referenceText: `Cọc giữ chỗ ${resv.reservationCode}`,
                      reconcileState: 'MATCHED',
                      periodKey: getCurrentVnPeriodKey(),
                    },
                  });
                }
              }
            }

            await tx.consoleRoom.update({
              where: { id: rm.id },
              data: { occupancyStatus: 'RESERVED' },
            });
            if (rm.publicListingId) {
              await tx.publicRoomListing.update({
                where: { id: rm.publicListingId },
                data: { status: 'RESERVED' },
              });
            }

            await tx.consoleAuditLog.create({
              data: {
                orgId: actor.orgId,
                buildingId: rm.buildingId,
                actorId: actor.id,
                actorEmail: actor.email,
                actorRole: actor.role,
                entityType: 'RESERVATION',
                entityId: resv.id,
                action: 'CREATE_RESERVATION',
                summary: `Tạo phiếu giữ chỗ ${resv.reservationCode} cho khách ${customerName} · Phòng ${rm.code} (${paymentConfirmed ? 'Đã thu cọc' : 'Chờ nộp cọc'})`,
                metadata: { clientIp, holdAmountVnd, paymentConfirmed },
              },
            });

            return { resv, dep };
          });

          return {
            status: 201,
            body: {
              ok: true,
              reservation: {
                ...result.resv,
                holdAmountVnd: toSafeVndNumber(result.resv.holdAmountVnd),
              },
              deposit: result.dep
                ? {
                    ...result.dep,
                    amountVnd: toSafeVndNumber(result.dep.amountVnd),
                    paidAmountVnd: toSafeVndNumber(result.dep.paidAmountVnd),
                    refundedVnd: toSafeVndNumber(result.dep.refundedVnd),
                  }
                : null,
            },
          };
        } catch (err: any) {
          if (err?.statusCode === 409) {
            return {
              status: 409,
              body: {
                ok: false,
                errorCode: 'ROOM_CONFLICT',
                message: err.message,
              },
            };
          }
          throw err;
        }
      }
    );
  }

  // POST /api/v1/console/v2/reservations/:id/confirm-payment
  const resvConfirmPayMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/reservations\/([^/]+)\/confirm-payment$/
  );
  if (method === 'POST' && resvConfirmPayMatch) {
    if (!actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền xác nhận thu tiền cọc giữ chỗ (yêu cầu finance.write).',
      });
    }

    const resvId = decodeURIComponent(resvConfirmPayMatch[1]);
    const body = await readJsonBody(req);
    const paymentMethod = String(body.paymentMethod || 'BANK_TRANSFER').trim();

    const resv = await prisma.roomReservation.findUnique({
      where: { id: resvId },
      include: { room: { include: { building: true } }, deposits: true },
    });
    if (!resv || resv.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phiếu giữ chỗ không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, resv.buildingId, resv.room.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền xử lý giữ chỗ ngoài tòa nhà phụ trách.',
      });
    }

    // P0-03: Strict state machine guard - cannot confirm cancelled/converted/expired holds
    if (resv.status === 'CANCELLED' || resv.status === 'CONVERTED' || resv.status === 'EXPIRED') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVALID_RESERVATION_STATUS',
        message: `Phiếu giữ chỗ đang ở trạng thái ${resv.status}, không thể xác nhận thanh toán.`,
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'RESERVATION_CONFIRM_PAYMENT',
      req.headers['idempotency-key'],
      { resvId, paymentMethod },
      res,
      async () => {
        const updated = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM "room_reservations" WHERE id = ${resv.id} FOR UPDATE`;

          const currentResv = await tx.roomReservation.findUnique({
            where: { id: resv.id },
            include: { deposits: true },
          });
          if (!currentResv || currentResv.orgId !== actor.orgId) {
            throw new Error('NOT_FOUND');
          }

          if (currentResv.status === 'CANCELLED' || currentResv.status === 'CONVERTED' || currentResv.status === 'EXPIRED') {
            const err: any = new Error(`Phiếu giữ chỗ đang ở trạng thái ${currentResv.status}, không thể xác nhận thanh toán.`);
            err.statusCode = 422;
            err.errorCode = 'INVALID_RESERVATION_STATUS';
            throw err;
          }

          // Check if already confirmed with deposit marked PAID (Idempotent call)
          const existingPaidDep = currentResv.deposits.find(
            (d) => d.depositType === 'BOOKING' && d.paymentStatus === 'PAID'
          );
          if (currentResv.status === 'CONFIRMED' && existingPaidDep) {
            return { updatedResv: currentResv, pendingDep: existingPaidDep, alreadyConfirmed: true };
          }

          let pendingDep = currentResv.deposits.find((d) => d.depositType === 'BOOKING' && ['PENDING', 'PARTIALLY_PAID'].includes(d.paymentStatus));
          const amountToConfirm = pendingDep ? Math.max(0, Number(pendingDep.amountVnd) - Number(pendingDep.paidAmountVnd)) : Number(resv.holdAmountVnd);

          if (!pendingDep && amountToConfirm > 0) {
            pendingDep = await tx.deposit.create({
              data: {
                orgId: actor.orgId,
                reservationId: resv.id,
                depositType: 'BOOKING',
                amountVnd: BigInt(amountToConfirm),
                paidAmountVnd: BigInt(amountToConfirm),
                paymentStatus: 'PAID',
                paymentMethod,
                receivedAt: new Date(),
                status: 'HELD',
                notes: `Tiền cọc giữ chỗ ${resv.reservationCode}`,
              },
            });
          } else if (pendingDep) {
            pendingDep = await tx.deposit.update({
              where: { id: pendingDep.id },
              data: {
                paidAmountVnd: pendingDep.amountVnd,
                paymentStatus: 'PAID',
                paymentMethod,
                receivedAt: new Date(),
              },
            });
          }

          if (amountToConfirm > 0) {
            await tx.ledgerEntry.create({
              data: {
                orgId: actor.orgId,
                buildingId: resv.buildingId,
                periodKey: getCurrentVnPeriodKey(),
                entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                  .randomBytes(2)
                  .toString('hex')
                  .toUpperCase()}`,
                entryType: 'INCOME',
                category: 'Cọc giữ chỗ',
                amountVnd: BigInt(amountToConfirm),
                description: `Xác nhận thu tiền cọc giữ chỗ ${resv.reservationCode} - ${resv.customerName}`,
                recordedBy: actor.email,
              },
            });

            if (['SEPAY_QR', 'PAYOS_QR', 'BANK_TRANSFER'].includes(paymentMethod)) {
              await tx.paymentTransaction.create({
                data: {
                  orgId: actor.orgId,
                  buildingId: resv.buildingId,
                  providerId: paymentMethod.includes('SEPAY') ? 'SEPAY' : paymentMethod.includes('PAYOS') ? 'PAYOS' : 'MANUAL_TRANSFER',
                  externalTxId: `TX-CONFIRM-${resv.reservationCode}-${Date.now()}`,
                  idempotencyKey: `pay-confirm-${resv.id}`,
                  amountVnd: BigInt(amountToConfirm),
                  payerName: resv.customerName,
                  referenceText: `Xác nhận thu cọc giữ chỗ ${resv.reservationCode}`,
                  reconcileState: 'MATCHED',
                  periodKey: getCurrentVnPeriodKey(),
                },
              });
            }
          }

          const updatedResv = await tx.roomReservation.update({
            where: { id: resv.id },
            data: { status: 'CONFIRMED' },
          });

          await tx.consoleRoom.update({
            where: { id: resv.roomId },
            data: { occupancyStatus: 'RESERVED' },
          });

          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              buildingId: resv.buildingId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'RESERVATION',
              entityId: resv.id,
              action: 'CONFIRM_RESERVATION_PAYMENT',
              summary: `Xác nhận đã nhận ${amountToConfirm.toLocaleString('vi-VN')}đ cọc giữ chỗ ${resv.reservationCode}`,
              metadata: { clientIp, paymentMethod, amountToConfirm },
            },
          });

          return { updatedResv, pendingDep, alreadyConfirmed: false };
        });

        return {
          status: 200,
          body: {
            ok: true,
            reservation: {
              ...updated.updatedResv,
              holdAmountVnd: toSafeVndNumber(updated.updatedResv.holdAmountVnd),
            },
            deposit: updated.pendingDep
              ? {
                  ...updated.pendingDep,
                  amountVnd: toSafeVndNumber(updated.pendingDep.amountVnd),
                  paidAmountVnd: toSafeVndNumber(updated.pendingDep.paidAmountVnd),
                  refundedVnd: toSafeVndNumber(updated.pendingDep.refundedVnd),
                }
              : null,
          },
        };
      }
    );
  }

  // POST /api/v1/console/v2/reservations/:id/cancel
  const resvCancelMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/reservations\/([^/]+)\/cancel$/
  );
  if (method === 'POST' && resvCancelMatch) {
    if (!actorHasPermission(actor, 'contracts.manage') && !actorHasPermission(actor, 'tenants.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền hủy phiếu giữ chỗ.',
      });
    }

    const resvId = decodeURIComponent(resvCancelMatch[1]);
    const body = await readJsonBody(req);
    const reason = String(body.reason || 'Khách hủy giữ chỗ').trim();
    const refundAmountVnd = vnd(body.refundAmountVnd ?? 0);
    const deductionAmountVnd = vnd(body.deductionAmountVnd ?? 0);
    const forfeitAmountVnd = Math.max(0, Math.trunc(Number(body.forfeitAmountVnd) || 0));
    const forfeit = Boolean(body.forfeit);
    const refundPending = body.refundPending === true;
    for (const n of [body.refundAmountVnd ?? 0, body.deductionAmountVnd ?? 0, body.forfeitAmountVnd ?? 0]) vnd(n);
    if (!reason) return sendJson(res, 422, { ok: false, message: 'Nhập lý do hủy cọc.' });

    // P0-07: Financial permission check - any money movement requires finance.write
    const touchesMoney = refundAmountVnd > 0 || deductionAmountVnd > 0 || forfeitAmountVnd > 0 || forfeit;
    if (touchesMoney && !actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền thực hiện nghiệp vụ tài chính khi hủy giữ chỗ (yêu cầu finance.write).',
      });
    }

    const resv = await prisma.roomReservation.findUnique({
      where: { id: resvId },
      include: { room: { include: { building: true } }, deposits: true },
    });
    if (!resv || resv.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phiếu giữ chỗ không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, resv.buildingId, resv.room.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền xử lý giữ chỗ ngoài tòa nhà phụ trách.',
      });
    }
    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'RESERVATION_CANCEL',
      req.headers['idempotency-key'],
      { resvId, refundAmountVnd, deductionAmountVnd, forfeitAmountVnd, forfeit, reason, refundPending },
      res,
      async () => {
        const updated = await prisma.$transaction(async (tx) => {
          // P0-05: Lock reservation, room, and deposits under transaction
          await tx.$executeRaw`SELECT id FROM "room_reservations" WHERE id = ${resv.id} FOR UPDATE`;
          await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${resv.roomId} FOR UPDATE`;
          await tx.$executeRaw`SELECT id FROM "deposits" WHERE reservation_id = ${resv.id} ORDER BY id ASC FOR UPDATE`;

          const currentResv = await tx.roomReservation.findUnique({
            where: { id: resv.id },
            include: { room: true },
          });
          if (!currentResv || currentResv.orgId !== actor.orgId) {
            const err: any = new Error('Phiếu giữ chỗ không tồn tại trong tổ chức.');
            err.statusCode = 404;
            err.errorCode = 'ENTITY_NOT_FOUND';
            throw err;
          }
          if (currentResv.status !== 'CONFIRMED' && currentResv.status !== 'PENDING') {
            const err: any = new Error(`Không thể hủy phiếu giữ chỗ đang ở trạng thái ${currentResv.status}.`);
            err.statusCode = 422;
            err.errorCode = 'INVALID_STATUS';
            throw err;
          }

          // P0-05: Re-fetch deposits and re-compute fresh available balance under row lock
          const freshDeposits = await tx.deposit.findMany({
            where: { reservationId: resv.id },
            orderBy: { id: 'asc' },
          });

          const paidDeposits = freshDeposits.filter(
            (d) => d.depositType === 'BOOKING' && availableDeposit(d) > 0
          );
          const freshAvailPaid = paidDeposits.reduce((sum, d) => sum + availableDeposit(d), 0);

          let targetRefund = refundAmountVnd;
          let targetDeduction = deductionAmountVnd;
          let targetForfeit = forfeitAmountVnd;

          if (freshAvailPaid > 0) {
            if (forfeit && targetRefund === 0 && targetDeduction === 0 && targetForfeit === 0) {
              targetForfeit = freshAvailPaid;
            } else {
              // Enforce strict conservation equation: Refund + Deduction + Forfeit == freshAvailPaid
              if (targetRefund + targetDeduction + targetForfeit !== freshAvailPaid) {
                const err: any = new Error(
                  `Tổng số tiền hoàn lại (${targetRefund.toLocaleString('vi-VN')}đ) + chi phí khấu trừ (${targetDeduction.toLocaleString('vi-VN')}đ) + phạt hủy (${targetForfeit.toLocaleString('vi-VN')}đ) phải bằng chính xác tổng tiền cọc khả dụng (${freshAvailPaid.toLocaleString('vi-VN')}đ).`
                );
                err.statusCode = 422;
                err.errorCode = 'INVALID_CANCELLATION_ALLOCATION';
                throw err;
              }
            }
          } else {
            if (targetRefund > 0 || targetDeduction > 0 || targetForfeit > 0) {
              const err: any = new Error('Phiếu giữ chỗ không có số dư cọc khả dụng để phân bổ.');
              err.statusCode = 422;
              err.errorCode = 'INVALID_CANCELLATION_ALLOCATION';
              throw err;
            }
          }

          const nextNotes = currentResv.notes ? `${currentResv.notes} | [HỦY]: ${reason}` : `[HỦY]: ${reason}`;
          const cancelledResv = await tx.roomReservation.update({
            where: { id: currentResv.id },
            data: { status: 'CANCELLED', notes: nextNotes },
          });

          const activeContracts = await tx.contract.count({
            where: { roomId: currentResv.roomId, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } },
          });
          if (activeContracts === 0) {
            await tx.consoleRoom.update({
              where: { id: currentResv.roomId },
              data: { occupancyStatus: 'AVAILABLE' },
            });
            if (resv.room.publicListingId) {
              await tx.publicRoomListing.update({
                where: { id: resv.room.publicListingId },
                data: { status: 'AVAILABLE' },
              });
            }
          }

          // P0-01 & P0-06: Incremental waterfall bucket allocation per deposit
          let remRefund = targetRefund;
          let remDeduction = targetDeduction;
          let remForfeit = targetForfeit;

          for (const d of freshDeposits) {
            if (d.depositType === 'BOOKING' && availableDeposit(d) > 0) {
              const availDep = availableDeposit(d);
              if (availDep <= 0) continue;

              let depCap = availDep;

              // 1. Allocate refund
              const allocRefund = Math.min(remRefund, depCap);
              remRefund -= allocRefund;
              depCap -= allocRefund;

              // 2. Allocate deduction
              const allocDeduction = Math.min(remDeduction, depCap);
              remDeduction -= allocDeduction;
              depCap -= allocDeduction;

              // 3. Allocate forfeit
              const allocForfeit = Math.min(remForfeit, depCap);
              remForfeit -= allocForfeit;
              depCap -= allocForfeit;

              const nextRefunded = Number(d.refundedVnd || 0) + (refundPending ? 0 : allocRefund);
              const nextDeducted = Number(d.deductedAmountVnd || 0) + allocDeduction;
              const nextForfeited = Number(d.forfeitedAmountVnd || 0) + allocForfeit;

              const nextTransferred = Number(d.transferredAmountVnd || 0) + (refundPending ? allocRefund : 0);
              const totalUsed = nextRefunded + nextDeducted + nextForfeited + nextTransferred;
              const isFullyAllocated = totalUsed >= Number(d.paidAmountVnd || 0);

              const nextStatus = isFullyAllocated
                ? (nextTransferred > 0 ? 'APPLIED_TO_REFUND' : nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED')
                : 'PARTIALLY_REFUNDED';
              const nextPaymentStatus = isFullyAllocated
                ? (nextTransferred > 0 ? 'TRANSFERRED' : nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED')
                : 'PARTIALLY_PAID';

              await tx.deposit.update({
                where: { id: d.id },
                data: {
                  status: nextStatus,
                  paymentStatus: nextPaymentStatus,
                  refundedVnd: BigInt(nextRefunded),
                  transferredAmountVnd: BigInt(nextTransferred),
                  deductedAmountVnd: BigInt(nextDeducted),
                  forfeitedAmountVnd: BigInt(nextForfeited),
                  notes: d.notes
                    ? `${d.notes} | Phân bổ hủy: Hoàn ${allocRefund.toLocaleString('vi-VN')}đ, Khấu trừ ${allocDeduction.toLocaleString('vi-VN')}đ, Tịch thu ${allocForfeit.toLocaleString('vi-VN')}đ`
                    : `Phân bổ hủy: Hoàn ${allocRefund.toLocaleString('vi-VN')}đ, Khấu trừ ${allocDeduction.toLocaleString('vi-VN')}đ, Tịch thu ${allocForfeit.toLocaleString('vi-VN')}đ`,
                },
              });
            } else if (d.depositType === 'BOOKING' && Number(d.paidAmountVnd) === 0) {
              await tx.deposit.update({
                where: { id: d.id },
                data: {
                  status: 'FORFEITED',
                  paymentStatus: 'FORFEITED',
                  notes: d.notes ? `${d.notes} | Hủy cọc chưa nộp` : 'Hủy cọc chưa nộp',
                },
              });
            }
          }

          if (remRefund !== 0 || remDeduction !== 0 || remForfeit !== 0) {
            const err: any = new Error(
              `Lỗi phân bổ tiền hủy cọc: Còn dư Hoàn ${remRefund}đ, Khấu trừ ${remDeduction}đ, Phạt ${remForfeit}đ.`
            );
            err.statusCode = 422;
            err.errorCode = 'ALLOCATION_INCOMPLETE';
            throw err;
          }

          // P0-01: Create Ledger entries ONCE for the entire cancellation transaction
          if (targetRefund > 0 && !refundPending) {
            await tx.ledgerEntry.create({
              data: {
                orgId: actor.orgId,
                buildingId: currentResv.buildingId,
                periodKey: getCurrentVnPeriodKey(),
                entryCode: `PC-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                  .randomBytes(2)
                  .toString('hex')
                  .toUpperCase()}`,
                entryType: 'EXPENSE',
                category: 'Hoàn tiền cọc',
                amountVnd: BigInt(targetRefund),
                description: `Hoàn cọc giữ chỗ ${currentResv.reservationCode} cho khách ${currentResv.customerName}`,
                recordedBy: actor.email,
              },
            });
          }

          if (refundPending && targetRefund > 0) {
            await tx.deposit.create({ data: { orgId: actor.orgId, reservationId: currentResv.id,
              depositType: 'CANCELLATION_REFUND', amountVnd: BigInt(targetRefund), paidAmountVnd: BigInt(targetRefund),
              paymentStatus: 'PENDING', status: 'PENDING_REFUND', notes: `Chờ hoàn phiếu ${currentResv.reservationCode}: ${reason}` } });
          }
          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentResv.buildingId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'RESERVATION',
              entityId: currentResv.id,
              action: 'CANCEL_RESERVATION',
              summary: `Hủy phiếu giữ chỗ ${currentResv.reservationCode} (Lý do: ${reason})`,
              metadata: { clientIp, refundAmountVnd: targetRefund, deductionAmountVnd: targetDeduction, forfeitAmountVnd: targetForfeit, refundPending },
            },
          });

          return cancelledResv;
        });

        return {
          status: 200,
          body: {
            ok: true,
            reservation: {
              ...updated,
              holdAmountVnd: toSafeVndNumber(updated.holdAmountVnd),
            },
          },
        };
      }
    );
  }

  // POST /api/v1/console/v2/reservations/:id/convert-to-contract
  const resvConvertMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/reservations\/([^/]+)\/convert-to-contract$/
  );
  if (method === 'POST' && resvConvertMatch) {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền chuyển đổi giữ chỗ sang hợp đồng.',
      });
    }

    const resvId = decodeURIComponent(resvConvertMatch[1]);
    const body = await readJsonBody(req);

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'CONVERT_RESERVATION_TO_CONTRACT',
      req.headers['idempotency-key'],
      { resvId, ...body },
      res,
      async () => {
        const resv = await prisma.roomReservation.findUnique({
          where: { id: resvId },
          include: { room: { include: { building: true } }, deposits: true },
        });
        if (!resv || resv.orgId !== actor.orgId) {
          const err: any = new Error('Phiếu giữ chỗ không tồn tại trong tổ chức.');
          err.statusCode = 404;
          err.errorCode = 'ENTITY_NOT_FOUND';
          throw err;
        }

        // P0-02: Check building scope permission for actor
        if (!isBuildingAllowedForActor(actor, resv.room.buildingId, resv.room.building?.code)) {
          const err: any = new Error('Tài khoản không có quyền thao tác trên tòa nhà chứa phiếu giữ chỗ này.');
          err.statusCode = 403;
          err.errorCode = 'FORBIDDEN_BUILDING_SCOPE';
          throw err;
        }
        if (resv.status !== 'CONFIRMED' && resv.status !== 'PENDING') {
          const err: any = new Error(`Phiếu giữ chỗ đang ở trạng thái ${resv.status}, không thể chuyển đổi.`);
          err.statusCode = 422;
          err.errorCode = 'INVALID_STATUS';
          throw err;
        }

        const org = await prisma.organization.findUnique({ where: { id: actor.orgId } });
        const startDate = String(body.startDate || resv.expectedMoveIn || getTodayIsoVn()).trim();
        const endDate = String(body.endDate || '').trim();
        const monthlyRentVnd = Math.trunc(
          Number(body.monthlyRentVnd || resv.room.listPriceVnd || 4500000)
        );
        const requiredDepositVnd = Math.trunc(Number(body.depositVnd ?? monthlyRentVnd));
        const conversionMembers = body.documentProfile ? validateDocumentProfile(body.documentProfile).members
          : Array.isArray(body.coOccupants) ? body.coOccupants : [];
        if (conversionMembers.length > 20 || conversionMembers.some((p: any) => !String(p?.fullName || '').trim())) {
          throw Object.assign(new Error('Nhập họ tên của tất cả người cùng ở.'), { statusCode: 422 });
        }
        const occupantsCount = 1 + conversionMembers.length;
        const rentalModel = ['ENTIRE_ROOM', 'SHARED_ROOM'].includes(String(body.rentalModel || ''))
          ? String(body.rentalModel)
          : 'ENTIRE_ROOM';
        if (rentalModel === 'SHARED_ROOM' && occupantsCount !== 1) throw Object.assign(new Error('Mỗi khách ghép phải có hợp đồng riêng.'), { statusCode: 409 });
        const surplusAction = String(body.surplusAction || 'RENT_CREDIT'); // RENT_CREDIT | REFUND
        if (surplusAction === 'REFUND' && !actorHasPermission(actor, 'finance.write')) {
          const err: any = new Error('Tài khoản không có quyền hoàn tiền cọc dôi dư (yêu cầu finance.write).');
          err.statusCode = 403;
          err.errorCode = 'INSUFFICIENT_PERMISSION';
          throw err;
        }

        const coOccupants: Array<{
          fullName: string;
          phone?: string;
          idNumber?: string;
          relationToPrimary?: string;
        }> = conversionMembers;

        if (!startDate || !endDate || endDate <= startDate) {
          const err: any = new Error('Vui lòng cung cấp ngày bắt đầu và kết thúc hợp đồng hợp lệ.');
          err.statusCode = 422;
          err.errorCode = 'VALIDATION_ERROR';
          throw err;
        }

        const result = await prisma.$transaction(async (tx) => {
          // P0-05: Concurrency row-level locks on reservation, room, and deposits
          await tx.$executeRaw`SELECT id FROM "room_reservations" WHERE id = ${resv.id} FOR UPDATE`;
          await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${resv.roomId} FOR UPDATE`;
          await tx.$executeRaw`SELECT id FROM "deposits" WHERE reservation_id = ${resv.id} ORDER BY id ASC FOR UPDATE`;

          // P0-05: Re-verify reservation under row lock
          const currentResv = await tx.roomReservation.findUnique({
            where: { id: resv.id },
            include: { room: { include: { building: true } } },
          });
          if (!currentResv || currentResv.orgId !== actor.orgId) {
            const err: any = new Error('Phiếu giữ chỗ không tồn tại trong tổ chức.');
            err.statusCode = 404;
            err.errorCode = 'ENTITY_NOT_FOUND';
            throw err;
          }
          if (currentResv.status !== 'CONFIRMED' && currentResv.status !== 'PENDING') {
            const err: any = new Error(`Phiếu giữ chỗ đang ở trạng thái ${currentResv.status}, không thể chuyển đổi.`);
            err.statusCode = 422;
            err.errorCode = 'INVALID_STATUS';
            throw err;
          }

          const activeContracts = await tx.contract.count({
            where: { roomId: resv.roomId, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } },
          });
          if (activeContracts > 0) {
            const err: any = new Error(`Phòng ${resv.room.code} đang có hợp đồng hoạt động hoặc chờ bàn giao.`);
            err.statusCode = 409;
            err.errorCode = 'ROOM_CONFLICT';
            throw err;
          }

          // LOG-01: Ensure tenant is resolved/created inside transaction with deduplication
          let finalTenantId = String(body.tenantId || currentResv.tenantId || '').trim();
          let finalTenantRecord: any = null;
          if (finalTenantId) {
            finalTenantRecord = await tx.tenant.findFirst({
              where: { id: finalTenantId, orgId: actor.orgId },
            });
            if (!finalTenantRecord) {
              const err: any = new Error('Khách hàng không tồn tại trong tổ chức.');
              err.statusCode = 404;
              err.errorCode = 'TENANT_NOT_FOUND';
              throw err;
            }
          }
          if (!finalTenantRecord) {
            const normPhone = normalizeVnPhone(currentResv.customerPhone);
            finalTenantRecord = await tx.tenant.findFirst({
              where: { orgId: actor.orgId, normalizedPhone: normPhone },
            });
            if (!finalTenantRecord) {
              finalTenantRecord = await tx.tenant.create({
                data: {
                  orgId: actor.orgId,
                  fullName: currentResv.customerName,
                  phone: normPhone,
                  normalizedPhone: normPhone,
                  primaryBuildingId: currentResv.buildingId,
                },
              });
            }
            finalTenantId = finalTenantRecord.id;
          }

        // P0-04 & P0-06: Read fresh locked deposits and calculate B strictly from paidAmountVnd - refundedVnd - deductedAmountVnd
        const lockedDeposits = await tx.deposit.findMany({
          where: { reservationId: resv.id },
          orderBy: { id: 'asc' },
        });

        const paidBookingDeposits = lockedDeposits.filter(d => d.depositType === 'BOOKING' && availableDeposit(d) > 0);
        const B = paidBookingDeposits.reduce((sum, d) => sum + availableDeposit(d), 0);
        if (body.expectedBookingBalance !== undefined && Number(body.expectedBookingBalance) !== B) {
          throw Object.assign(new Error('Số dư cọc đã thay đổi. Vui lòng xem lại quyết toán.'), { statusCode: 409 });
        }
        vnd(requiredDepositVnd, 'Cọc hợp đồng');
        if (!Number.isSafeInteger(monthlyRentVnd) || monthlyRentVnd < 500000 || !['RENT_CREDIT', 'REFUND'].includes(surplusAction)) throw Object.assign(new Error('Giá thuê hoặc phương án xử lý dư không hợp lệ.'), { statusCode: 422 });
        const C = requiredDepositVnd;
        // Calculate first period rent with Prorate Engine (C4-BILL-01 & C4-BILL-02)
        const firstRentCalc = calculateFirstPeriodRent(
          String(body.firstPeriodBillingPolicy || 'CALENDAR_PRORATE'),
          startDate,
          monthlyRentVnd,
          body.customFirstPeriodVnd !== undefined ? Number(body.customFirstPeriodVnd) : undefined
        );
        const R = firstRentCalc.rentFirstPeriodVnd;

        // Apply transfer math
        let transferredDepositVnd = 0;
        let surplusDepositVnd = 0;
        let additionalDepositDue = 0;
        let appliedRentCreditVnd = 0;
        let remainingSurplusCreditVnd = 0;
        let firstCycleRentDue = R;

        if (B <= C) {
          transferredDepositVnd = B;
          additionalDepositDue = C - B;
          surplusDepositVnd = 0;
        } else {
          transferredDepositVnd = C;
          surplusDepositVnd = B - C;
          additionalDepositDue = 0;
          if (surplusAction === 'RENT_CREDIT') {
            appliedRentCreditVnd = Math.min(surplusDepositVnd, R);
            remainingSurplusCreditVnd = Math.max(0, surplusDepositVnd - R);
            firstCycleRentDue = R - appliedRentCreditVnd;
          }
        }

        const totalInitialInvoiceDue = firstCycleRentDue + additionalDepositDue;

        const contractCode = `HD-${currentResv.room.building.code}-${currentResv.room.code}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`;

        if (coOccupants.length + 1 > currentResv.room.maxOccupants) throw Object.assign(new Error('Số người vượt sức chứa phòng.'), { statusCode: 422 });
        // Create Contract (DRAFT status, room RESERVED) with proper rate inheritance (C4-HUN-02)
        const ct = await tx.contract.create({
          data: {
            orgId: actor.orgId,
            buildingId: resv.buildingId,
            roomId: resv.roomId,
            tenantId: finalTenantId,
            reservationId: resv.id,
            contractCode,
            rentalModel,
            startDate,
            endDate,
            signedAt: new Date(),
            moveInDate: null,
            monthlyRentVnd: BigInt(monthlyRentVnd),
            depositVnd: BigInt(Math.max(0, C)),
            occupantsCount,
            electricRateVnd:
              resv.room.electricBillingMode === 'HUNONIC_AUTO'
                ? 0
                : (resv.room.electricRateVnd ?? resv.room.building?.electricRateVnd ?? org?.defaultElectricRateVnd ?? 3800),
            waterBillingMethod:
              resv.room.waterBillingMethod || resv.room.building?.waterBillingMethod || org?.defaultWaterMethod || 'PER_M3',
            waterRateVnd:
              resv.room.waterRateVnd ?? resv.room.building?.waterRateVnd ?? org?.defaultWaterRateVnd ?? 15000,
            handoverMeterKwh: null,
            handoverWaterM3: null,
            status: 'DRAFT',
          },
        });

        // P1-01: Create primary occupant with SCHEDULED status (active upon handover)
        await tx.roomOccupant.create({
          data: {
            orgId: actor.orgId,
            roomId: resv.roomId,
            contractId: ct.id,
            tenantId: finalTenantId,
            fullName: finalTenantRecord.fullName,
            phone: finalTenantRecord.phone,
            idNumber: (body.documentProfile as any)?.tenant?.idNumber || finalTenantRecord.idNumber,
            dateOfBirth: (body.documentProfile as any)?.tenant?.birthDate || null,
            gender: (body.documentProfile as any)?.tenant?.gender || null,
            relationToPrimary: 'PRIMARY',
            residenceRegStatus: finalTenantRecord.residenceRegStatus || 'PENDING',
            moveInDate: startDate,
            isActive: false,
            occupancyStatus: 'SCHEDULED',
          },
        });

        // Create co-occupants if provided (P1-01)
        for (const occ of coOccupants) {
          if (occ && occ.fullName && occ.fullName.trim()) {
            await tx.roomOccupant.create({
              data: {
                orgId: actor.orgId,
                roomId: resv.roomId,
                contractId: ct.id,
                fullName: occ.fullName.trim(),
                phone: occ.phone?.trim() || null,
                idNumber: occ.idNumber?.trim() || null,
                dateOfBirth: (occ as any).birthDate || (occ as any).dateOfBirth || null,
                gender: (occ as any).gender || null,
                ...personOccupancy(occ, (body.documentProfile as any)?.tenant || { fullName: finalTenantRecord.fullName }),
                residenceRegStatus: 'PENDING',
                moveInDate: startDate,
                isActive: false,
                occupancyStatus: 'SCHEDULED',
              },
            });
          }
        }

        // Create new Contract Deposit row (Tracks full required contract deposit C and transferred B)
        let newContractDeposit = null;
        if (C > 0) {
          const depPaymentStatus =
            transferredDepositVnd >= C
              ? 'PAID'
              : transferredDepositVnd > 0
              ? 'PARTIALLY_PAID'
              : 'PENDING';

          newContractDeposit = await tx.deposit.create({
            data: {
              orgId: actor.orgId,
              contractId: ct.id,
              depositType: 'CONTRACT',
              amountVnd: BigInt(C),
              paidAmountVnd: BigInt(transferredDepositVnd),
              deductedAmountVnd: BigInt(0),
              paymentStatus: depPaymentStatus,
              receivedAt: transferredDepositVnd > 0 ? new Date() : null,
              paymentMethod: transferredDepositVnd > 0 ? 'TRANSFER_FROM_BOOKING' : null,
              status: 'HELD',
              notes: `Cọc hợp đồng ${C.toLocaleString('vi-VN')}đ (Đã chuyển ${transferredDepositVnd.toLocaleString('vi-VN')}đ từ giữ chỗ ${resv.reservationCode}${additionalDepositDue > 0 ? `, còn phải thu ${additionalDepositDue.toLocaleString('vi-VN')}đ` : ''})`,
            },
          });
        }

        // If remainingSurplusCreditVnd > 0, store in an ADVANCE_RENT deposit row so surplus is never lost
        let advanceRentDeposit = null;
        if (remainingSurplusCreditVnd > 0 && surplusAction === 'RENT_CREDIT') {
          advanceRentDeposit = await tx.deposit.create({
            data: {
              orgId: actor.orgId,
              contractId: ct.id,
              depositType: 'ADVANCE_RENT',
              amountVnd: BigInt(remainingSurplusCreditVnd),
              paidAmountVnd: BigInt(remainingSurplusCreditVnd),
              deductedAmountVnd: BigInt(0),
              paymentStatus: 'PAID',
              receivedAt: new Date(),
              paymentMethod: 'TRANSFER_FROM_BOOKING',
              status: 'HELD',
              notes: `Tín dụng tiền thuê trả trước chu kỳ sau (dôi dư từ cọc giữ chỗ ${resv.reservationCode})`,
            },
          });
        }

        // Update original booking deposits without altering amountVnd!
        for (const bd of paidBookingDeposits) {
          const bdAvail = availableDeposit(bd);
          await tx.deposit.update({
            where: { id: bd.id },
            data: {
              status: 'APPLIED_TO_CONTRACT',
              paymentStatus: 'TRANSFERRED',
              transferredAmountVnd: BigInt(bdAvail),
              transferredToDepositId: newContractDeposit?.id || null,
              notes: bd.notes
                ? `${bd.notes} | Đã chuyển sang hợp đồng ${ct.contractCode}`
                : `Đã chuyển sang hợp đồng ${ct.contractCode}`,
            },
          });
        }

        // If surplus refund requested
        let surplusRefundDeposit = null;
        if (surplusDepositVnd > 0 && surplusAction === 'REFUND') {
          // Rule E2E-07: "Refund pending khác cash-out completed (không tự động ghi sổ completed cash-out)"
          // Do NOT create completed cash-out LedgerEntry EXPENSE here!
          // Instead, create a pending refund obligation deposit for finance to disburse later.
          surplusRefundDeposit = await tx.deposit.create({
            data: {
              orgId: actor.orgId,
              contractId: ct.id,
              reservationId: resv.id,
              depositType: 'SURPLUS_REFUND',
              amountVnd: BigInt(surplusDepositVnd),
              paidAmountVnd: BigInt(surplusDepositVnd),
              refundedVnd: BigInt(0),
              deductedAmountVnd: BigInt(0),
              forfeitedAmountVnd: BigInt(0),
              paymentStatus: 'PENDING',
              status: 'PENDING_REFUND',
              notes: `Chờ chi trả hoàn cọc giữ chỗ dôi dư ${surplusDepositVnd.toLocaleString('vi-VN')}đ khi lập hợp đồng ${ct.contractCode}`,
            },
          });
        }

        // P0-03: First Combined Invoice line items MUST sum exactly to totalInitialInvoiceDue (C4-BILL-01)
        const invoiceBreakdown: Array<{ label: string; amountVnd: number }> = [
          {
            label: `Tiền thuê chu kỳ đầu (${firstRentCalc.billedDays}/${firstRentCalc.daysInMonth} ngày: ${firstRentCalc.periodStartDate} → ${firstRentCalc.periodEndDate})`,
            amountVnd: R,
          },
        ];
        if (additionalDepositDue > 0) {
          invoiceBreakdown.push({ label: 'Tiền cọc hợp đồng còn phải thu thêm', amountVnd: additionalDepositDue });
        }
        if (appliedRentCreditVnd > 0) {
          invoiceBreakdown.push({ label: 'Khấu trừ tiền cọc giữ chỗ dôi dư vào tiền phòng kỳ 1', amountVnd: -appliedRentCreditVnd });
        }

        const breakdownSum = invoiceBreakdown.reduce((sum, item) => sum + item.amountVnd, 0);
        if (breakdownSum !== totalInitialInvoiceDue) {
          const err: any = new Error(
            `Invoice breakdown sum (${breakdownSum}) does not match total amount (${totalInitialInvoiceDue})`
          );
          err.statusCode = 422;
          throw err;
        }

        const initialInvoiceCode = `HD-INV-${resv.room.building.code}-${resv.room.code}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`;

        // P0-07: Clearly distinguish issuedAt, servicePeriod, and dueDate
        const invoice = await tx.invoice.create({
          data: {
            orgId: actor.orgId,
            buildingId: resv.buildingId,
            roomId: resv.roomId,
            contractId: ct.id,
            tenantId: finalTenantId,
            invoiceCode: initialInvoiceCode,
            periodKey: firstRentCalc.periodKey,
            dueDate: startDate,
            roomRentVnd: BigInt(R),
            adjustmentVnd: BigInt(additionalDepositDue - appliedRentCreditVnd),
            totalAmountVnd: BigInt(totalInitialInvoiceDue),
            status: totalInitialInvoiceDue === 0 ? 'PAID' : 'ISSUED',
            paidAmountVnd: totalInitialInvoiceDue === 0 ? BigInt(totalInitialInvoiceDue) : BigInt(0),
            policySnapshot: {
              type: 'FIRST_COMBINED_INVOICE',
              billingPolicy: firstRentCalc.policy,
              daysInMonth: firstRentCalc.daysInMonth,
              billedDays: firstRentCalc.billedDays,
              periodStartDate: firstRentCalc.periodStartDate,
              periodEndDate: firstRentCalc.periodEndDate,
              formula: firstRentCalc.formula,
              breakdown: invoiceBreakdown,
              deferredCredits: remainingSurplusCreditVnd > 0 ? [
                { label: 'Tín dụng tiền thuê bảo lưu cho kỳ sau', amountVnd: remainingSurplusCreditVnd }
              ] : [],
              billingSchedule: {
                issuedAt: new Date().toISOString(),
                servicePeriodStart: firstRentCalc.periodStartDate,
                servicePeriodEnd: firstRentCalc.periodEndDate,
                periodKey: firstRentCalc.periodKey,
                dueDate: startDate,
              },
              financialSummary: {
                bookingDepositB: B,
                contractDepositRequiredC: C,
                transferredDepositVnd,
                additionalDepositDue,
                surplusDepositVnd,
                appliedRentCreditVnd,
                remainingSurplusCreditVnd,
                firstCycleRentDue,
                totalInitialInvoiceDue,
              },
            },
          },
        });

        await tx.roomReservation.update({
          where: { id: resv.id },
          data: { status: 'CONVERTED' },
        });

        await tx.consoleRoom.update({
          where: { id: resv.roomId },
          data: { occupancyStatus: 'RESERVED', rentalModel },
        });
        if (resv.room.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: resv.room.publicListingId },
            data: {
              status: 'RESERVED',
              rentalModel,
              currentTenantName: null,
              currentTenantPhone: null,
            },
          });
        }
        await tx.tenant.update({
          where: { id: finalTenantId },
          data: { primaryBuildingId: resv.buildingId },
        });

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: resv.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'CONTRACT',
            entityId: ct.id,
            action: 'CONVERT_RESERVATION_TO_CONTRACT',
            summary: `Chuyển đổi giữ chỗ ${resv.reservationCode} thành hợp đồng ${ct.contractCode} (Chuyển cọc: ${transferredDepositVnd}đ, Còn thu: ${totalInitialInvoiceDue}đ)`,
            metadata: {
              clientIp,
              reservationCode: resv.reservationCode,
              transferredDepositVnd,
              additionalDepositDue,
              totalInitialInvoiceDue,
            },
          },
        });

        await saveRentalProfile(tx, actor, currentResv.room, ct.id, body.documentProfile);
        return {
          contract: ct,
          invoice,
          contractDeposit: newContractDeposit,
          advanceRentDeposit,
          surplusRefundDeposit,
          transferredDepositVnd,
          additionalDepositDue,
          surplusDepositVnd,
          appliedRentCreditVnd,
          remainingSurplusCreditVnd,
          additionalDueVnd: totalInitialInvoiceDue,
        };
      });

      return {
        status: 201,
        body: {
          ok: true,
          contract: {
            ...result.contract,
            monthlyRentVnd: toSafeVndNumber(result.contract.monthlyRentVnd),
            depositVnd: toSafeVndNumber(result.contract.depositVnd),
          },
          contractDeposit: result.contractDeposit
            ? {
                ...result.contractDeposit,
                amountVnd: toSafeVndNumber(result.contractDeposit.amountVnd),
                paidAmountVnd: toSafeVndNumber(result.contractDeposit.paidAmountVnd),
                refundedVnd: toSafeVndNumber(result.contractDeposit.refundedVnd),
                deductedAmountVnd: toSafeVndNumber(result.contractDeposit.deductedAmountVnd),
                forfeitedAmountVnd: toSafeVndNumber(result.contractDeposit.forfeitedAmountVnd),
                transferredAmountVnd: toSafeVndNumber(result.contractDeposit.transferredAmountVnd),
              }
            : null,
          advanceRentDeposit: result.advanceRentDeposit
            ? {
                ...result.advanceRentDeposit,
                amountVnd: toSafeVndNumber(result.advanceRentDeposit.amountVnd),
                paidAmountVnd: toSafeVndNumber(result.advanceRentDeposit.paidAmountVnd),
              }
            : null,
          surplusRefundDeposit: result.surplusRefundDeposit
            ? {
                ...result.surplusRefundDeposit,
                amountVnd: toSafeVndNumber(result.surplusRefundDeposit.amountVnd),
                paidAmountVnd: toSafeVndNumber(result.surplusRefundDeposit.paidAmountVnd),
                refundedVnd: toSafeVndNumber(result.surplusRefundDeposit.refundedVnd),
                deductedAmountVnd: toSafeVndNumber(result.surplusRefundDeposit.deductedAmountVnd),
              }
            : null,
          invoice: {
            id: result.invoice.id,
            invoiceCode: result.invoice.invoiceCode,
            totalAmountVnd: toSafeVndNumber(result.invoice.totalAmountVnd),
            status: result.invoice.status,
          },
          transferredDepositVnd: result.transferredDepositVnd,
          additionalDepositDue: result.additionalDepositDue,
          surplusDepositVnd: result.surplusDepositVnd,
          appliedRentCreditVnd: result.appliedRentCreditVnd,
          remainingSurplusCreditVnd: result.remainingSurplusCreditVnd,
          additionalDueVnd: result.additionalDueVnd,
        },
      };
    }
  );
}

  // POST /api/v1/console/v2/deposits/:id/refund (Deposit Refund / Partial Refund / Deduct)
  const depositRefundMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/deposits\/([^/]+)\/refund$/
  );
  if (method === 'POST' && depositRefundMatch) {
    if (!actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền hoàn tiền cọc (yêu cầu finance.write).',
      });
    }

    const depId = decodeURIComponent(depositRefundMatch[1]);
    const body = await readJsonBody(req);
    const refundAmountVnd = vnd(body.refundAmountVnd ?? 0);
    const deductionAmountVnd = vnd(body.deductionAmountVnd ?? 0);
    const deductionReason = String(body.deductionReason || '').trim();

    // P0-01: Deduction reason is mandatory if deductionAmountVnd > 0
    if (deductionAmountVnd > 0 && !deductionReason) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp lý do khấu trừ khi có phát sinh chi phí khấu trừ hoặc bồi thường cọc.',
      });
    }

    const dep = await prisma.deposit.findUnique({
      where: { id: depId },
      include: {
        contract: { include: { room: { include: { building: true } } } },
        reservation: { include: { room: { include: { building: true } } } },
      },
    });
    if (!dep || dep.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Khoản cọc không tồn tại trong tổ chức.',
      });
    }

    // P0-02: Check building scope permission for actor on deposit refund
    const buildingId = dep.contract?.buildingId || dep.reservation?.buildingId || null;
    const buildingCode = dep.contract?.room?.building?.code || dep.reservation?.room?.building?.code || null;
    if (buildingId && !isBuildingAllowedForActor(actor, buildingId, buildingCode)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Tài khoản không có quyền tài chính trên tòa nhà của khoản cọc này.',
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'DEPOSIT_REFUND',
      req.headers['idempotency-key'],
      { depId, refundAmountVnd, deductionAmountVnd, deductionReason },
      res,
      async () => {
        try {
          const updated = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT id FROM "deposits" WHERE id = ${dep.id} FOR UPDATE`;
            const currentDep = await tx.deposit.findUnique({ where: { id: dep.id } });
            if (!currentDep || currentDep.orgId !== actor.orgId) {
              const err: any = new Error('Khoản cọc không tồn tại trong tổ chức.');
              err.statusCode = 404;
              err.errorCode = 'ENTITY_NOT_FOUND';
              throw err;
            }

            if (
              currentDep.status === 'APPLIED_TO_CONTRACT' ||
              currentDep.paymentStatus === 'TRANSFERRED' ||
              currentDep.transferredToDepositId !== null
            ) {
              const err: any = new Error(
                'Khoản cọc đã được chuyển sang hợp đồng khác, không thể hoàn trực tiếp từ bản ghi nguồn.'
              );
              err.statusCode = 422;
              err.errorCode = 'DEPOSIT_ALREADY_TRANSFERRED';
              throw err;
            }

            const currentEffectivePaid = Math.max(0, Number(currentDep.paidAmountVnd || 0));
            if (currentEffectivePaid <= 0 || (currentDep.paymentStatus === 'PENDING' && currentDep.status !== 'PENDING_REFUND')) {
              const err: any = new Error('Khoản cọc chưa được thu tiền thực tế, không thể thực hiện hoàn tiền.');
              err.statusCode = 422;
              err.errorCode = 'DEPOSIT_NOT_COLLECTED';
              throw err;
            }

            // P0-01: Available balance subtracts BOTH refundedVnd AND deductedAmountVnd
            const currentAvail = Math.max(
              0,
              currentEffectivePaid -
                Number(currentDep.refundedVnd || 0) -
                Number(currentDep.deductedAmountVnd || 0) - Number(currentDep.forfeitedAmountVnd || 0) - Number(currentDep.transferredAmountVnd || 0)
            );
            if (refundAmountVnd + deductionAmountVnd > currentAvail) {
              const err: any = new Error(
                `Số tiền hoàn và khấu trừ vượt quá số dư cọc khả dụng (${currentAvail.toLocaleString('vi-VN')}đ).`
              );
              err.statusCode = 422;
              err.errorCode = 'EXCEEDS_DEPOSIT_BALANCE';
              throw err;
            }

            const nextRefunded = Number(currentDep.refundedVnd || 0) + refundAmountVnd;
            const nextDeducted = Number(currentDep.deductedAmountVnd || 0) + deductionAmountVnd;
            const isFull = nextRefunded + nextDeducted >= currentEffectivePaid;
            const nextStatus = isFull ? (nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED') : 'PARTIALLY_REFUNDED';
            const nextPaymentStatus = isFull
              ? (nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED')
              : (nextRefunded + nextDeducted > 0 ? 'PARTIALLY_REFUNDED' : currentDep.paymentStatus);

            const noteParts = [dep.notes || ''];
            if (refundAmountVnd > 0)
              noteParts.push(`Hoàn cọc: ${refundAmountVnd.toLocaleString('vi-VN')}đ`);
            if (deductionAmountVnd > 0)
              noteParts.push(`Khấu trừ: ${deductionAmountVnd.toLocaleString('vi-VN')}đ (${deductionReason})`);

            const updatedDep = await tx.deposit.update({
              where: { id: dep.id },
              data: {
                status: nextStatus,
                paymentStatus: nextPaymentStatus,
                refundedVnd: BigInt(nextRefunded),
                deductedAmountVnd: BigInt(nextDeducted),
                notes: noteParts.filter(Boolean).join(' | '),
              },
            });

            if (refundAmountVnd > 0) {
              await tx.ledgerEntry.create({
                data: {
                  orgId: actor.orgId,
                  buildingId,
                  periodKey: getCurrentVnPeriodKey(),
                  entryCode: `PC-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                    .randomBytes(2)
                    .toString('hex')
                    .toUpperCase()}`,
                  entryType: 'EXPENSE',
                  category: 'Hoàn tiền cọc',
                  amountVnd: BigInt(refundAmountVnd),
                  description: `Hoàn tiền cọc ${
                    dep.contract?.contractCode || dep.reservation?.reservationCode || ''
                  }`,
                  recordedBy: actor.email,
                },
              });
            }

            if (deductionAmountVnd > 0) {
              await tx.ledgerEntry.create({
                data: {
                  orgId: actor.orgId,
                  buildingId,
                  periodKey: getCurrentVnPeriodKey(),
                  entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                    .randomBytes(2)
                    .toString('hex')
                    .toUpperCase()}`,
                  entryType: 'INCOME',
                  category: 'Khấu trừ tiền cọc',
                  amountVnd: BigInt(deductionAmountVnd),
                  description: `Khấu trừ cọc ${
                    dep.contract?.contractCode || dep.reservation?.reservationCode || ''
                  }: ${deductionReason}`,
                  recordedBy: actor.email,
                },
              });
            }

            await tx.consoleAuditLog.create({
              data: {
                orgId: actor.orgId,
                buildingId,
                actorId: actor.id,
                actorEmail: actor.email,
                actorRole: actor.role,
                entityType: 'DEPOSIT',
                entityId: dep.id,
                action: 'REFUND_DEPOSIT',
                summary: `Xử lý hoàn cọc ${refundAmountVnd.toLocaleString(
                  'vi-VN'
                )}đ, khấu trừ ${deductionAmountVnd.toLocaleString('vi-VN')}đ (${deductionReason || 'Không ghi lý do'})`,
                metadata: { clientIp, refundAmountVnd, deductionAmountVnd, deductionReason },
              },
            });

            return updatedDep;
          });

          return {
            status: 200,
            body: {
              ok: true,
              deposit: {
                ...updated,
                amountVnd: toSafeVndNumber(updated.amountVnd),
                paidAmountVnd: toSafeVndNumber(updated.paidAmountVnd),
                refundedVnd: toSafeVndNumber(updated.refundedVnd),
                deductedAmountVnd: toSafeVndNumber(updated.deductedAmountVnd),
              },
            },
          };
        } catch (err: any) {
          if (err.statusCode) {
            return {
              status: err.statusCode,
              body: {
                ok: false,
                errorCode: err.errorCode || 'REFUND_FAILED',
                message: err.message,
              },
            };
          }
          throw err;
        }
      }
    );
  }

  // POST /api/v1/console/v2/invoices/:id/pay (Record Invoice Payment / Reconciliation)
  const invoicePayMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/invoices\/([^/]+)\/pay$/
  );
  if (method === 'POST' && invoicePayMatch) {
    if (!actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền thu tiền hóa đơn (yêu cầu finance.write).',
      });
    }

    const invoiceId = decodeURIComponent(invoicePayMatch[1]);
    const body = await readJsonBody(req);
    const amountVnd = Math.max(0, Math.trunc(Number(body.amountVnd) || 0));
    const providerId = String(body.providerId || 'MANUAL_CASH').trim();
    const rawExternalTxId = typeof body.externalTxId === 'string' ? body.externalTxId.trim() : '';
    const payerName = typeof body.payerName === 'string' ? body.payerName.trim() : null;
    const referenceText = typeof body.referenceText === 'string' ? body.referenceText.trim() : null;
    const initialElectric = body.handoverMeterKwh === '' || body.handoverMeterKwh == null ? null : Number(body.handoverMeterKwh);
    const initialWater = body.handoverWaterM3 === '' || body.handoverWaterM3 == null ? null : Number(body.handoverWaterM3);
    const clientSpecifiedKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const idKey = (req.headers['idempotency-key'] as string) || clientSpecifiedKey || `pay-${invoiceId}-${rawExternalTxId || crypto.randomUUID()}`;

    if (amountVnd <= 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Số tiền thanh toán phải lớn hơn 0.',
      });
    }

    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { building: true, room: true, tenant: true },
    });
    if (!inv || inv.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Hóa đơn không tồn tại trong tổ chức.',
      });
    }

    if (!isBuildingAllowedForActor(actor, inv.buildingId, inv.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền xử lý hóa đơn ngoài tòa nhà phụ trách.',
      });
    }

    if (inv.status === 'VOID') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVOICE_VOIDED',
        message: 'Hóa đơn đã bị hủy (VOID), không thể thu tiền.',
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'INVOICE_PAY',
      idKey,
      { invoiceId, amountVnd, providerId, externalTxId: rawExternalTxId || null, initialElectric, initialWater },
      res,
      async () => {
        const externalTxId = rawExternalTxId || `TX-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const result = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM "invoices" WHERE id = ${inv.id} FOR UPDATE`;

          const currentInv = await tx.invoice.findUnique({
            where: { id: inv.id },
            include: { building: true, room: true, tenant: true },
          });
          if (!currentInv || currentInv.orgId !== actor.orgId) {
            const err: any = new Error('Hóa đơn không tồn tại.');
            err.statusCode = 404;
            throw err;
          }

          const existingTx = await tx.paymentTransaction.findUnique({
            where: { idempotencyKey: idKey },
          });
          if (existingTx) {
            return { invoice: currentInv, transaction: existingTx, replay: true };
          }

          const currentTotal = Number(currentInv.totalAmountVnd);
          const currentPaid = Number(currentInv.paidAmountVnd);
          const remainingDue = Math.max(0, currentTotal - currentPaid);

          let reconcileState = 'MATCHED';
          if (amountVnd < remainingDue) {
            reconcileState = 'PARTIAL_MATCH';
          } else if (amountVnd > remainingDue) {
            reconcileState = 'OVERPAID';
          } else {
            reconcileState = 'MATCHED';
          }

          const nextPaid = currentPaid + amountVnd;
          const nextStatus = nextPaid >= currentTotal ? 'PAID' : 'PARTIAL';

          const updatedInv = await tx.invoice.update({
            where: { id: currentInv.id },
            data: {
              paidAmountVnd: BigInt(nextPaid),
              status: nextStatus,
            },
          });

          await allocateInitialReceipt(tx, currentInv, nextPaid);

          let handedOver = false;
          if (nextStatus === 'PAID' && currentInv.contractId && (currentInv.policySnapshot as any)?.type === 'FIRST_COMBINED_INVOICE') {
            await tx.$executeRaw`SELECT id FROM "contracts" WHERE id = ${currentInv.contractId} FOR UPDATE`;
            const contract = await tx.contract.findUnique({ where: { id: currentInv.contractId },
              include: { room: { include: { electricMeter: true } }, tenant: true } });
            if (contract?.status === 'DRAFT') {
              const deposits = await tx.deposit.findMany({ where: { contractId: contract.id, depositType: 'CONTRACT' } });
              if (deposits.reduce((sum, deposit) => sum + availableDeposit(deposit), 0) < Number(contract.depositVnd)) {
                throw Object.assign(new Error('Hóa đơn đã đủ nhưng cọc hợp đồng chưa đủ để bàn giao. Kiểm tra lại phân bổ tiền.'), { statusCode: 422, errorCode: 'UNPAID_DEPOSIT_REQUIRED' });
              }
              const electricRequired = contract.room.electricBillingMode !== 'HUNONIC_AUTO' && Boolean(contract.room.electricMeter || (contract.room.electricRateVnd && contract.room.electricRateVnd > 0));
              const waterRequired = contract.waterBillingMethod === 'PER_M3' || contract.room.waterBillingMethod === 'PER_M3';
              if ((contract.room.rentalModel !== 'SHARED_ROOM' && electricRequired && initialElectric === null) || (contract.room.rentalModel !== 'SHARED_ROOM' && waterRequired && initialWater === null) ||
                  (initialElectric !== null && (!Number.isFinite(initialElectric) || initialElectric < 0)) ||
                  (initialWater !== null && (!Number.isFinite(initialWater) || initialWater < 0))) {
                throw Object.assign(new Error('Nhập chỉ số điện và nước đầu kỳ hợp lệ trước khi thu đủ hóa đơn để bàn giao tự động.'), { statusCode: 422, errorCode: 'MISSING_INITIAL_METER_READING' });
              }
              const moveInDate = getTodayIsoVn();
              await tx.contract.update({ where: { id: contract.id }, data: { status: 'ACTIVE', moveInDate,
                handoverMeterKwh: initialElectric, handoverWaterM3: initialWater } });
              await tx.roomOccupant.updateMany({ where: { contractId: contract.id }, data: { isActive: true, occupancyStatus: 'ACTIVE', moveInDate } });
              await tx.tenant.update({ where: { id: contract.tenantId }, data: { currentRoomId: contract.roomId, primaryBuildingId: contract.buildingId } });
              if (contract.room.rentalModel !== 'SHARED_ROOM' && initialElectric !== null && contract.room.electricMeter) await tx.meterReading.create({ data: {
                meterId: contract.room.electricMeter.id, periodKey: getCurrentVnPeriodKey(), readingKwh: initialElectric,
                source: 'MANUAL_OVERRIDE', recordedByActor: actor.email,
                overrideReason: `Bàn giao tự động sau thanh toán hóa đơn ${currentInv.invoiceCode}` } });
              await tx.consoleRoom.update({ where: { id: contract.roomId }, data: { occupancyStatus: 'OCCUPIED' } });
              if (contract.room.publicListingId) await tx.publicRoomListing.update({ where: { id: contract.room.publicListingId }, data: {
                status: 'OCCUPIED', currentTenantName: contract.room.rentalModel === 'SHARED_ROOM' ? null : contract.tenant.fullName, currentTenantPhone: contract.room.rentalModel === 'SHARED_ROOM' ? null : contract.tenant.phone } });
              await tx.consoleAuditLog.create({ data: { orgId: actor.orgId, buildingId: contract.buildingId,
                actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, entityType: 'CONTRACT', entityId: contract.id,
                action: 'HANDOVER_ROOM', summary: `Tự động bàn giao phòng ${contract.room.code} sau khi thu đủ hóa đơn ${currentInv.invoiceCode}`,
                metadata: { clientIp, invoiceId: currentInv.id, initialElectric, initialWater, moveInDate } } });
              handedOver = true;
            }
          }

          const paymentTx = await tx.paymentTransaction.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentInv.buildingId,
              invoiceId: currentInv.id,
              providerId,
              externalTxId,
              idempotencyKey: idKey,
              amountVnd: BigInt(amountVnd),
              payerName: payerName || currentInv.tenant?.fullName || null,
              referenceText: referenceText || `Thanh toán hóa đơn ${currentInv.invoiceCode}`,
              reconcileState,
              periodKey: currentInv.periodKey,
              verifiedAt: new Date(),
            },
          });

          await tx.ledgerEntry.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentInv.buildingId,
              periodKey: currentInv.periodKey,
              entryCode: `PT-${currentInv.periodKey.replace('-', '')}-${crypto
                .randomBytes(2)
                .toString('hex')
                .toUpperCase()}`,
              entryType: 'INCOME',
              category: 'Thu tiền hóa đơn phòng',
              amountVnd: BigInt(amountVnd),
              description: `Thu tiền hóa đơn ${currentInv.invoiceCode} phòng ${currentInv.room.code} qua ${providerId} (${reconcileState})`,
              recordedBy: actor.email,
            },
          });

          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentInv.buildingId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'INVOICE',
              entityId: currentInv.id,
              action: 'RECORD_INVOICE_PAYMENT',
              summary: `Thu ${amountVnd.toLocaleString('vi-VN')}đ cho hóa đơn ${currentInv.invoiceCode} qua ${providerId} · Đối soát: ${reconcileState}`,
              metadata: { clientIp, amountVnd, providerId, externalTxId, reconcileState },
            },
          });

          return { invoice: updatedInv, transaction: paymentTx, replay: false, handedOver };
        });

        return {
          status: 200,
          body: {
            ok: true,
            invoice: {
              ...result.invoice,
              totalAmountVnd: toSafeVndNumber(result.invoice.totalAmountVnd),
              paidAmountVnd: toSafeVndNumber(result.invoice.paidAmountVnd),
              roomRentVnd: toSafeVndNumber(result.invoice.roomRentVnd),
              electricVnd: toSafeVndNumber(result.invoice.electricVnd),
              waterVnd: toSafeVndNumber(result.invoice.waterVnd),
              serviceFeeVnd: toSafeVndNumber(result.invoice.serviceFeeVnd),
            },
            transaction: {
              ...result.transaction,
              amountVnd: toSafeVndNumber(result.transaction.amountVnd),
            },
            reconcileState: result.transaction.reconcileState,
            replay: result.replay,
            handedOver: result.handedOver || false,
          },
        };
      }
    );
  }

  // POST /api/v1/console/v2/payments/reconcile (Reconcile / Webhook Import Payment)
  if (method === 'POST' && pathname === '/api/v1/console/v2/payments/reconcile') {
    if (!actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền đối soát thanh toán (yêu cầu finance.write).',
      });
    }

    const body = await readJsonBody(req);
    const invoiceCode = String(body.invoiceCode || '').trim();
    const invoiceId = String(body.invoiceId || '').trim();
    const amountVnd = Math.max(0, Math.trunc(Number(body.amountVnd) || 0));
    const providerId = String(body.providerId || 'SEPAY').trim();
    const externalTxId = String(body.externalTxId || `TX-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`).trim();
    const referenceText = typeof body.referenceText === 'string' ? body.referenceText.trim() : null;
    const payerName = typeof body.payerName === 'string' ? body.payerName.trim() : null;
    const clientKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const idKey = (req.headers['idempotency-key'] as string) || clientKey || `reconcile-${externalTxId}`;

    if (!invoiceCode && !invoiceId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp invoiceCode hoặc invoiceId để đối soát.',
      });
    }
    if (amountVnd <= 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Số tiền đối soát phải lớn hơn 0.',
      });
    }

    const targetInvoice = await prisma.invoice.findFirst({
      where: {
        orgId: actor.orgId,
        ...(invoiceId ? { id: invoiceId } : { invoiceCode }),
      },
      include: { building: true, room: true, tenant: true },
    });
    if (!targetInvoice) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'INVOICE_NOT_FOUND',
        message: `Không tìm thấy hóa đơn ${invoiceCode || invoiceId} trong tổ chức.`,
      });
    }

    if (!isBuildingAllowedForActor(actor, targetInvoice.buildingId, targetInvoice.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền đối soát hóa đơn ngoài tòa nhà phụ trách.',
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'PAYMENT_RECONCILE',
      idKey,
      { invoiceId: targetInvoice.id, amountVnd, providerId, externalTxId },
      res,
      async () => {
        const result = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM "invoices" WHERE id = ${targetInvoice.id} FOR UPDATE`;

          const currentInv = await tx.invoice.findUnique({
            where: { id: targetInvoice.id },
            include: { building: true, room: true, tenant: true },
          });
          if (!currentInv) throw new Error('Invoice not found');

          const existingTx = await tx.paymentTransaction.findUnique({
            where: { idempotencyKey: idKey },
          });
          if (existingTx) {
            return { invoice: currentInv, transaction: existingTx, replay: true };
          }

          const currentTotal = Number(currentInv.totalAmountVnd);
          const currentPaid = Number(currentInv.paidAmountVnd);
          const remainingDue = Math.max(0, currentTotal - currentPaid);

          let reconcileState = 'MATCHED';
          if (amountVnd < remainingDue) {
            reconcileState = 'PARTIAL_MATCH';
          } else if (amountVnd > remainingDue) {
            reconcileState = 'OVERPAID';
          } else {
            reconcileState = 'MATCHED';
          }

          const nextPaid = currentPaid + amountVnd;
          const nextStatus = nextPaid >= currentTotal ? 'PAID' : 'PARTIAL';

          const updatedInv = await tx.invoice.update({
            where: { id: currentInv.id },
            data: {
              paidAmountVnd: BigInt(nextPaid),
              status: nextStatus,
            },
          });

          await allocateInitialReceipt(tx, currentInv, nextPaid);

          const paymentTx = await tx.paymentTransaction.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentInv.buildingId,
              invoiceId: currentInv.id,
              providerId,
              externalTxId,
              idempotencyKey: idKey,
              amountVnd: BigInt(amountVnd),
              payerName: payerName || currentInv.tenant?.fullName || null,
              referenceText: referenceText || `Đối soát tự động ${currentInv.invoiceCode}`,
              reconcileState,
              periodKey: currentInv.periodKey,
              verifiedAt: new Date(),
            },
          });

          await tx.ledgerEntry.create({
            data: {
              orgId: actor.orgId,
              buildingId: currentInv.buildingId,
              periodKey: currentInv.periodKey,
              entryCode: `PT-${currentInv.periodKey.replace('-', '')}-${crypto
                .randomBytes(2)
                .toString('hex')
                .toUpperCase()}`,
              entryType: 'INCOME',
              category: 'Thu tiền hóa đơn phòng',
              amountVnd: BigInt(amountVnd),
              description: `Thu tiền hóa đơn ${currentInv.invoiceCode} phòng ${currentInv.room.code} qua ${providerId} (${reconcileState})`,
              recordedBy: actor.email,
            },
          });

          return { invoice: updatedInv, transaction: paymentTx, replay: false };
        });

        return {
          status: 200,
          body: {
            ok: true,
            invoice: {
              ...result.invoice,
              totalAmountVnd: toSafeVndNumber(result.invoice.totalAmountVnd),
              paidAmountVnd: toSafeVndNumber(result.invoice.paidAmountVnd),
            },
            transaction: {
              ...result.transaction,
              amountVnd: toSafeVndNumber(result.transaction.amountVnd),
            },
            reconcileState: result.transaction.reconcileState,
            replay: result.replay,
          },
        };
      }
    );
  }

  // GET /api/v1/console/v2/invoices/:id
  const invoiceGetMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/invoices\/([^/]+)$/
  );
  if (method === 'GET' && invoiceGetMatch) {
    const invoiceId = decodeURIComponent(invoiceGetMatch[1]);
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        building: true,
        room: { include: { electricMeter: true } },
        tenant: true,
        payments: { orderBy: { verifiedAt: 'desc' } },
      },
    });
    if (!inv || inv.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Hóa đơn không tồn tại trong tổ chức.',
      });
    }

    const [initialContract, paymentConnections] = await Promise.all([
      inv.contractId && (inv.policySnapshot as any)?.type === 'FIRST_COMBINED_INVOICE'
        ? prisma.contract.findFirst({ where: { id: inv.contractId, orgId: actor.orgId }, select: { status: true, waterBillingMethod: true } })
        : null,
      prisma.paymentProviderConnection.findMany({
        where: {
          orgId: actor.orgId,
          providerId: 'SEPAY',
          environment: 'LIVE',
          isEnabled: true,
          status: 'VERIFIED',
          OR: [{ buildingId: inv.buildingId }, { buildingId: null }],
          accounts: { some: {} },
        },
        include: { accounts: { orderBy: [{ bankCode: 'asc' }, { accountNumber: 'asc' }], take: 1 } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const paymentConnection = paymentConnections.find(connection => connection.buildingId === inv.buildingId)
      || paymentConnections.find(connection => connection.buildingId === null);
    const paymentAccount = paymentConnection?.accounts[0] || null;
    const remainingAmountVnd = Math.max(0, toSafeVndNumber(inv.totalAmountVnd) - toSafeVndNumber(inv.paidAmountVnd));
    const transferContent = inv.invoiceCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 50).toUpperCase();
    const qrUrl = paymentAccount && remainingAmountVnd > 0
      ? `https://vietqr.app/img?bank=${encodeURIComponent(paymentAccount.bankCode)}&acc=${encodeURIComponent(paymentAccount.accountNumber)}&template=compact&amount=${remainingAmountVnd}&des=${encodeURIComponent(transferContent)}&showinfo=true&holder=${encodeURIComponent(paymentAccount.accountName).replace(/%20/g, '+')}`
      : null;
    const proofs = await paymentProofMap(prisma, actor.orgId, inv.payments.map(payment => payment.id));
    return sendJson(res, 200, {
      ok: true,
      automaticHandover: initialContract?.status === 'DRAFT' ? {
        electricRequired: inv.room.electricBillingMode !== 'HUNONIC_AUTO' && Boolean(inv.room.electricMeter || (inv.room.electricRateVnd && inv.room.electricRateVnd > 0)),
        waterRequired: initialContract.waterBillingMethod === 'PER_M3' || inv.room.waterBillingMethod === 'PER_M3',
      } : null,
      vietQr: paymentAccount ? {
        providerId: paymentConnection?.providerId || 'SEPAY',
        bankCode: paymentAccount.bankCode,
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        transferContent,
        amountVnd: remainingAmountVnd,
        qrUrl,
      } : null,
      invoice: {
        ...inv,
        totalAmountVnd: toSafeVndNumber(inv.totalAmountVnd),
        paidAmountVnd: toSafeVndNumber(inv.paidAmountVnd),
        roomRentVnd: toSafeVndNumber(inv.roomRentVnd),
        electricVnd: toSafeVndNumber(inv.electricVnd),
        waterVnd: toSafeVndNumber(inv.waterVnd),
        serviceFeeVnd: toSafeVndNumber(inv.serviceFeeVnd),
        payments: inv.payments.map((p) => ({
          ...p,
          amountVnd: toSafeVndNumber(p.amountVnd),
          proofUrl: proofs.has(p.id) ? `/api/v1/console/v2/payment-transactions/${p.id}/proof` : null,
        })),
      },
    });
  }

  // POST /api/v1/console/v2/contracts/:id/extend (Extend Contract)
  const contractExtendMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/extend$/
  );
  if (method === 'POST' && contractExtendMatch) {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền gia hạn hợp đồng.',
      });
    }

    const ctId = decodeURIComponent(contractExtendMatch[1]);
    const body = await readJsonBody(req);
    const newEndDate = String(body.newEndDate || '').trim();
    const newMonthlyRentVnd = body.newMonthlyRentVnd
      ? Math.trunc(Number(body.newMonthlyRentVnd))
      : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    if (!newEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp ngày kết thúc gia hạn hợp lệ (YYYY-MM-DD).',
      });
    }

    const ct = await prisma.contract.findUnique({
      where: { id: ctId },
      include: { room: { include: { building: true } } },
    });
    if (!ct || ct.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Hợp đồng không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, ct.buildingId, ct.room.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền gia hạn hợp đồng ngoài tòa nhà phụ trách.',
      });
    }
    if (newEndDate <= ct.endDate) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVALID_EXTENSION_DATE',
        message: `Ngày gia hạn mới (${newEndDate}) phải lớn hơn ngày kết thúc hiện tại (${ct.endDate}).`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedCt = await tx.contract.update({
        where: { id: ct.id },
        data: {
          endDate: newEndDate,
          status: 'EXTENDED',
          ...(newMonthlyRentVnd && newMonthlyRentVnd >= 500_000
            ? { monthlyRentVnd: BigInt(newMonthlyRentVnd) }
            : {}),
          notes: notes ? (ct.notes ? `${ct.notes} | ${notes}` : notes) : ct.notes,
        },
      });

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: ct.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'CONTRACT',
          entityId: ct.id,
          action: 'EXTEND_CONTRACT',
          summary: `Gia hạn hợp đồng ${ct.contractCode} đến ${newEndDate}`,
          metadata: { clientIp, previousEndDate: ct.endDate, newEndDate, newMonthlyRentVnd },
        },
      });

      return updatedCt;
    });

    return sendJson(res, 200, {
      ok: true,
      contract: {
        ...updated,
        monthlyRentVnd: toSafeVndNumber(updated.monthlyRentVnd),
        depositVnd: toSafeVndNumber(updated.depositVnd),
      },
    });
  }

  // POST /api/v1/console/v2/contracts/:id/transfer-room (Transfer Room)
  const contractTransferMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/transfer-room$/
  );
  if (method === 'POST' && contractTransferMatch) {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền chuyển phòng hợp đồng.',
      });
    }

    const ctId = decodeURIComponent(contractTransferMatch[1]);
    const body = await readJsonBody(req);
    const newRoomId = String(body.newRoomId || '').trim();
    const newMonthlyRentVnd = body.newMonthlyRentVnd
      ? Math.trunc(Number(body.newMonthlyRentVnd))
      : null;

    if (!newRoomId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng chọn phòng đích để chuyển.',
      });
    }

    const ct = await prisma.contract.findUnique({
      where: { id: ctId },
      include: { room: true },
    });
    if (!ct || ct.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Hợp đồng không tồn tại trong tổ chức.',
      });
    }

    const newRoom = await prisma.consoleRoom.findUnique({
      where: { id: newRoomId },
      include: { building: true },
    });
    if (!newRoom || newRoom.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng đích không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, newRoom.buildingId, newRoom.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền chuyển khách sang tòa nhà ngoài phụ trách.',
      });
    }

    if (newRoom.id === ct.roomId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'SAME_ROOM',
        message: 'Phòng đích trùng với phòng hiện tại.',
      });
    }
    if (ct.rentalModel !== newRoom.rentalModel) return sendJson(res, 409, { ok: false, message: 'Dạng phòng đích không phù hợp với hợp đồng.' });

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Row locks ordered to avoid deadlocks
        const roomIds = [ct.roomId, newRoom.id].sort();
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id IN (${roomIds[0]}, ${roomIds[1]}) ORDER BY id FOR UPDATE`;

        const activeInNewRoom = await tx.contract.count({
          where: { roomId: newRoom.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
        });
        if (activeInNewRoom > 0) {
          const err: any = new Error(`Phòng ${newRoom.code} đang có hợp đồng thuê hoạt động.`);
          err.statusCode = 409;
          throw err;
        }
        const remainingInOldRoom = await tx.contract.count({ where: { roomId: ct.roomId, id: { not: ct.id }, status: { in: [...ACTIVE_CONTRACT_STATUSES] } } });
        if (remainingInOldRoom > 0) {
          const err: any = new Error('Phòng ghép còn hợp đồng khác; chưa hỗ trợ chuyển riêng một hợp đồng sang phòng khác.'); err.statusCode = 409; throw err;
        }

        // Release old room
        await tx.consoleRoom.update({
          where: { id: ct.roomId },
          data: { occupancyStatus: 'AVAILABLE' },
        });
        if (ct.room.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: ct.room.publicListingId },
            data: { status: 'AVAILABLE' },
          });
        }

        // Occupy new room
        await tx.consoleRoom.update({
          where: { id: newRoom.id },
          data: { occupancyStatus: 'OCCUPIED' },
        });
        if (newRoom.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: newRoom.publicListingId },
            data: { status: 'OCCUPIED' },
          });
        }

        const updatedCt = await tx.contract.update({
          where: { id: ct.id },
          data: {
            roomId: newRoom.id,
            buildingId: newRoom.buildingId,
            ...(newMonthlyRentVnd && newMonthlyRentVnd >= 500_000
              ? { monthlyRentVnd: BigInt(newMonthlyRentVnd) }
              : {}),
            notes: ct.notes
              ? `${ct.notes} | Chuyển từ phòng ${ct.room.code} sang ${newRoom.code}`
              : `Chuyển từ phòng ${ct.room.code} sang ${newRoom.code}`,
          },
        });

        await tx.tenant.update({
          where: { id: ct.tenantId },
          data: {
            currentRoomId: newRoom.id,
            primaryBuildingId: newRoom.buildingId,
          },
        });

        await tx.consoleAuditLog.create({
          data: {
            orgId: actor.orgId,
            buildingId: newRoom.buildingId,
            actorId: actor.id,
            actorEmail: actor.email,
            actorRole: actor.role,
            entityType: 'CONTRACT',
            entityId: ct.id,
            action: 'TRANSFER_ROOM_CONTRACT',
            summary: `Chuyển phòng hợp đồng ${ct.contractCode} từ ${ct.room.code} sang ${newRoom.code}`,
            metadata: { clientIp, fromRoomId: ct.roomId, toRoomId: newRoom.id },
          },
        });

        return updatedCt;
      });

      return sendJson(res, 200, {
        ok: true,
        contract: {
          ...updated,
          monthlyRentVnd: toSafeVndNumber(updated.monthlyRentVnd),
          depositVnd: toSafeVndNumber(updated.depositVnd),
        },
      });
    } catch (err: any) {
      if (err?.statusCode === 409) {
        return sendJson(res, 409, {
          ok: false,
          errorCode: 'ROOM_CONFLICT',
          message: err.message,
        });
      }
      throw err;
    }
  }

  // POST /api/v1/console/v2/contracts/:id/terminate (Terminate Contract)
  const contractTerminateMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/terminate$/
  );
  if (method === 'POST' && contractTerminateMatch) {
    if (!actorHasPermission(actor, 'contracts.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thanh lý hợp đồng.',
      });
    }

    const ctId = decodeURIComponent(contractTerminateMatch[1]);
    const body = await readJsonBody(req);
    const reason = String(body.reason || 'Thanh lý kết thúc thời hạn thuê').trim();
    const roomNextStatus = body.roomNextStatus === 'MAINTENANCE' ? 'MAINTENANCE' : 'AVAILABLE';

    const ct = await prisma.contract.findUnique({
      where: { id: ctId },
      include: { room: { include: { building: true } } },
    });
    if (!ct || ct.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Hợp đồng không tồn tại trong tổ chức.',
      });
    }

    if (!isBuildingAllowedForActor(actor, ct.buildingId, ct.room.building?.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Tài khoản không có quyền thao tác trên tòa nhà chứa hợp đồng này.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${ct.roomId} FOR UPDATE`;

      const terminatedCt = await tx.contract.update({
        where: { id: ct.id },
        data: {
          status: 'TERMINATED',
          notes: ct.notes ? `${ct.notes} | [THANH LÝ]: ${reason}` : `[THANH LÝ]: ${reason}`,
        },
      });
      const remainingContracts = await tx.contract.count({ where: { roomId: ct.roomId, id: { not: ct.id }, status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] } } });
      const effectiveRoomStatus = remainingContracts ? 'OCCUPIED' : roomNextStatus;

      await tx.consoleRoom.update({
        where: { id: ct.roomId },
        data: { occupancyStatus: effectiveRoomStatus },
      });
      if (ct.room.publicListingId) {
        await tx.publicRoomListing.update({
          where: { id: ct.room.publicListingId },
          data: { status: effectiveRoomStatus === 'MAINTENANCE' ? 'MAINTENANCE' : effectiveRoomStatus },
        });
      }

      await tx.roomOccupant.updateMany({
        where: { contractId: ct.id, isActive: true },
        data: {
          isActive: false,
          occupancyStatus: 'MOVED_OUT',
        },
      });

      await tx.tenant.update({
        where: { id: ct.tenantId },
        data: { currentRoomId: null },
      });

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: ct.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'CONTRACT',
          entityId: ct.id,
          action: 'TERMINATE_CONTRACT',
          summary: `Thanh lý hợp đồng ${ct.contractCode} (Lý do: ${reason})`,
          metadata: { clientIp, reason, roomNextStatus },
        },
      });

      return terminatedCt;
    });

    return sendJson(res, 200, {
      ok: true,
      contract: {
        ...updated,
        monthlyRentVnd: toSafeVndNumber(updated.monthlyRentVnd),
        depositVnd: toSafeVndNumber(updated.depositVnd),
      },
    });
  }

  // ===========================================================================
  // C3B: HUNONIC CLOUD METERING & WATER BILLING ADAPTER
  // ===========================================================================

  // POST /api/v1/console/v2/hunonic/sync
  if (method === 'POST' && pathname === '/api/v1/console/v2/hunonic/sync') {
    if (
      !actorHasPermission(actor, 'settlements.manage') &&
      !actorHasPermission(actor, 'settings.manage')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thực hiện đồng bộ chỉ số điện.',
      });
    }

    const hunonicScoped = await resolveScopedBuildings(
      prisma,
      actor,
      buildingsParam,
      false
    );
    const bldIds = hunonicScoped.selectedBuildingIds;

    try {
      const snapshot = await executeHunonicBackgroundSync({ prisma, orgId: actor.orgId, actorId: actor.id, buildingIds: bldIds });
      return sendJson(res, 200, {
        ok: snapshot.status !== 'ERROR', isMockSession: false,
        syncedCount: snapshot.summary.syncedMeters, totalMeters: snapshot.summary.totalMeters,
        offlineCount: snapshot.meters.filter(meter => meter.reading.quality === 'OFFLINE').length,
        staleCount: snapshot.meters.filter(meter => meter.reading.quality === 'STALE').length,
        anomalousCount: snapshot.meters.filter(meter => meter.reading.quality === 'SUSPICIOUS').length,
        unmappedCount: snapshot.meters.filter(meter => meter.reading.quality === 'MISSING').length,
        message: snapshot.status === 'ERROR' ? 'Chưa lấy được chỉ số từ công tơ đã gán.' : 'Đã cập nhật dữ liệu Hunonic.',
        meters: snapshot.meters,
      });
    } catch { return sendJson(res, 502, { ok: false, message: 'Không thể đồng bộ dữ liệu Hunonic. Kiểm tra kết nối và lịch sử đồng bộ.' }); }
  }

  // ===========================================================================
  // C3.2: HUNONIC ARCHITECTURE & ATOMIC JSON SNAPSHOT INTERNAL APIS (HUN-01..05)
  // ===========================================================================

  // GET /api/v1/console/integrations/hunonic/snapshot (HUN-03 & HUN-04)
  // Console strictly reads persisted atomic JSON snapshot via Internal API. Zero direct Hunonic calls during page load!
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/snapshot') {
    const cachedSnapshot = await readJsonSnapshot(actor.orgId);
    const config = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const verified = isHunonicInventoryForAccount(cachedSnapshot, readHunonicCredentials(config?.credentialsJson).phone);
    return sendJson(res, 200, { ok: true, snapshot: verified ? cachedSnapshot : null, cached: verified });
  }

  // GET /api/v1/console/integrations/hunonic/meters
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/meters') {
    const meters = await prisma.electricMeter.findMany({
      where: { orgId: actor.orgId },
      include: {
        room: {
          select: {
            id: true,
            code: true,
            buildingId: true,
            building: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const snapshot = await readJsonSnapshot(actor.orgId);
    const config = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const verified = isHunonicInventoryForAccount(snapshot, readHunonicCredentials(config?.credentialsJson).phone);
    return sendJson(res, 200, { ok: true, meters: serializeHunonicInventory(verified ? snapshot!.devices : undefined, meters, verified ? snapshot!.inventoryFetchedAt || null : null), syncedAt: verified ? snapshot!.inventoryFetchedAt : null });
  }

  // Explicit refresh only: discover real cloud devices without inventing readings.
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/devices') {
    if (!actorHasPermission(actor, 'settings.manage')) return sendJson(res, 403, { ok: false, message: 'Không có quyền tải thiết bị Hunonic.' });
    const connection = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const credentials = readHunonicCredentials(connection?.credentialsJson);
    if (!connection?.isEnabled || !credentials.phone || !credentials.password) return sendJson(res, 422, { ok: false, message: 'Lưu kết nối Hunonic trước khi tải thiết bị.' });
    try {
      const client = new HunonicCloudClient();
      const session = await client.login(credentials.phone, credentials.password);
      if (session.token.startsWith('mock_hunonic_token_')) return sendJson(res, 422, { ok: false, message: 'Không thể tải thiết bị thực từ chế độ thử nghiệm.' });
      const devices = await client.listElectricMeters(session.token);
      const mapped = await prisma.electricMeter.findMany({ where: { orgId: actor.orgId }, include: { room: { select: { id: true, code: true, buildingId: true } } } });
      const snapshot = await cacheHunonicInventory(actor.orgId, devices, credentials.phone);
      return sendJson(res, 200, { ok: true, meters: serializeHunonicInventory(devices, mapped, snapshot.inventoryFetchedAt || null), syncedAt: snapshot.inventoryFetchedAt });
    } catch { return sendJson(res, 502, { ok: false, message: 'Không thể tải thiết bị từ Hunonic. Kiểm tra lại kết nối.' }); }
  }

  // POST /api/v1/console/integrations/hunonic/sync-jobs (Background Sync Worker trigger - HUN-03)
  if (method === 'POST' && pathname === '/api/v1/console/integrations/hunonic/sync-jobs') {
    if (
      !actorHasPermission(actor, 'settlements.manage') &&
      !actorHasPermission(actor, 'settings.manage')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền khởi chạy tiến trình đồng bộ công tơ.',
      });
    }

    // Trigger async worker in background without blocking the HTTP request!
    const jobId = `sync_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    executeHunonicBackgroundSync({
      jobId,
      prisma,
      orgId: actor.orgId,
      actorId: actor.id,
      triggerType: 'MANUAL_JOB',
    }).catch((err) => {
      console.error('[HunonicWorker] Error executing background sync:', err);
    });

    return sendJson(res, 202, {
      ok: true,
      message: 'Tiến trình đồng bộ công tơ Hunonic nền đã được khởi tạo.',
      status: 'RUNNING',
      jobId,
    });
  }

  // GET /api/v1/console/integrations/hunonic/sync-jobs
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/sync-jobs') {
    const syncJobs = await prisma.integrationSyncJob.findMany({
      where: { orgId: actor.orgId, providerId: 'HUNONIC' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const connection = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const history = actorHasPermission(actor, 'settings.manage') ? await readHunonicHistory(actor.orgId, readHunonicCredentials(connection?.credentialsJson).phone) : null;
    return sendJson(res, 200, { ok: true, syncJobs, history });
  }

  // GET /api/v1/console/integrations/hunonic/tariff (read current provider configuration + audit history)
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/tariff') {
    if (!actorHasPermission(actor, 'settings.manage')) return sendJson(res, 403, { ok: false, message: 'Chỉ Quản trị viên được phép đọc biểu giá Hunonic.' });
    const connection = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const credentials = readHunonicCredentials(connection?.credentialsJson);
    if (!connection?.isEnabled || !credentials.phone || !credentials.password) return sendJson(res, 422, { ok: false, message: 'Chưa có kết nối Hunonic đã lưu.' });
    try {
      const client = new HunonicCloudClient();
      const session = await client.login(credentials.phone, credentials.password);
      if (session.token.startsWith('mock_hunonic_token_')) return sendJson(res, 422, { ok: false, message: 'Không thể đọc biểu giá thực trong chế độ thử nghiệm.' });
      const [devices, mapped, history] = await Promise.all([
        client.listElectricMeters(session.token),
        prisma.electricMeter.findMany({ where: { orgId: actor.orgId, hunonicDeviceId: { not: null } }, select: { id: true, hunonicDeviceId: true, tariffMode: true, tariffRateVnd: true, tariffVerifiedAt: true } }),
        prisma.consoleAuditLog.findMany({ where: { orgId: actor.orgId, action: 'UPDATE_HUNONIC_TARIFF' }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, actorEmail: true, summary: true, metadata: true, createdAt: true } }),
      ]);
      const byRootId = new Map(mapped.map(meter => [meter.hunonicDeviceId, meter]));
      const tariffs: Array<Record<string, unknown>> = [];
      const verifiedAt = new Date();
      for (let offset = 0; offset < devices.length; offset += 5) {
        const batch = devices.slice(offset, offset + 5);
        const results = await Promise.all(batch.map(async device => {
          const saved = byRootId.get(device.id);
          try {
            const groups = await client.fetchElectricityRateGroups(session.token, device.id);
            const mode = device.electricityGroupId === '2' ? 'residential' : device.electricityGroupId === '1' ? 'custom' : null;
            const selectedGroup = mode ? groups.find(group => group.id === (mode === 'custom' ? '1' : '2')) : null;
            const price = selectedGroup?.rates.find(rate => typeof rate.price === 'number' && Number.isFinite(rate.price))?.price ?? null;
            if (!mode || price === null) return { rootId: device.id, mode, rateVnd: price, verifiedAt: null, error: 'Hunonic chưa trả về đầy đủ nhóm giá đang áp dụng.' };
            if (saved) await prisma.electricMeter.update({ where: { id: saved.id }, data: { tariffMode: mode, tariffRateVnd: price, tariffVerifiedAt: verifiedAt } });
            return { rootId: device.id, mode, rateVnd: price, verifiedAt: verifiedAt.toISOString(), error: null };
          } catch (error) {
            return { rootId: device.id, mode: saved?.tariffMode || null, rateVnd: saved?.tariffRateVnd ?? null, verifiedAt: saved?.tariffVerifiedAt?.toISOString() || null, error: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[Hunonic]').slice(0, 180) : 'Không đọc được biểu giá.' };
          }
        }));
        tariffs.push(...results);
      }
      return sendJson(res, 200, { ok: true, tariffs, loadedAt: verifiedAt.toISOString(), history });
    } catch (error) {
      return sendJson(res, 502, { ok: false, message: 'Không thể tải cấu hình biểu giá từ Hunonic.', detail: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[Hunonic]').slice(0, 240) : undefined });
    }
  }

  // POST /api/v1/console/integrations/hunonic/tariff (HUN-02 Tab 3: Read/Write/Verify Tariff)
  if (method === 'POST' && pathname === '/api/v1/console/integrations/hunonic/tariff') {
    if (!actorHasPermission(actor, 'settings.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Chỉ Quản trị viên được phép cấu hình biểu giá Hunonic.',
      });
    }

    const body = await readJsonBody(req);
    const mode = body.mode === 'residential' ? 'residential' : 'custom';
    const customRateVnd = Number(body.customRateVnd);
    if (mode === 'custom' && (!Number.isSafeInteger(customRateVnd) || customRateVnd < 0)) return sendJson(res, 422, { ok: false, message: 'Đơn giá phải là số nguyên không âm.' });

    const client = new HunonicCloudClient();
    const rootId = typeof body.rootId === 'string' ? body.rootId.trim() : '';
    if (!rootId || rootId.startsWith('MOCK-')) return sendJson(res, 422, { ok: false, message: 'Chọn mã thiết bị Hunonic thực để cập nhật biểu giá.' });
    const connection = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const credentials = readHunonicCredentials(connection?.credentialsJson);
    if (!connection?.isEnabled || !credentials.phone || !credentials.password) return sendJson(res, 422, { ok: false, message: 'Chưa có kết nối Hunonic đã lưu.' });
    let result;
    try {
      const session = await client.login(credentials.phone, credentials.password);
      if (session.token.startsWith('mock_hunonic_token_')) return sendJson(res, 422, { ok: false, message: 'Không thể xác minh biểu giá thực trong chế độ thử nghiệm.' });
      result = await client.applyElectricityRate(session.token, rootId, mode, customRateVnd, { phone: credentials.phone, password: credentials.password });
    } catch (error) { return sendJson(res, 502, { ok: false, errorCode: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'HUNONIC_TARIFF_VERIFY_FAILED', message: 'Không thể xác minh biểu giá với Hunonic.', detail: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[Hunonic]').slice(0, 300) : 'Hunonic chưa xác nhận thay đổi.' }); }

    // Persist verified tariff to ElectricMeter records
    await prisma.electricMeter.updateMany({
      where: { orgId: actor.orgId, hunonicDeviceId: rootId },
      data: {
        tariffMode: result.mode,
        tariffRateVnd: result.verifiedRateVnd,
        tariffVerifiedAt: result.verifiedAt,
      },
    });

    const previousSnapshot = await readJsonSnapshot(actor.orgId);
    if (previousSnapshot?.inventorySource === 'HUNONIC_V2') {
      await exportAtomicJsonSnapshot({ ...previousSnapshot, meters: previousSnapshot.meters.map(meter => meter.hunonicDeviceId === rootId
        ? { ...meter, tariff: { mode: result.mode, verifiedRateVnd: result.verifiedRateVnd, verifiedAt: result.verifiedAt.toISOString() } } : meter) });
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'INTEGRATION',
        entityId: 'HUNONIC_TARIFF',
        action: 'UPDATE_HUNONIC_TARIFF',
        summary: `Cập nhật và xác minh biểu giá Hunonic: mode=${mode}, rate=${result.verifiedRateVnd} đ/kWh`,
        metadata: { clientIp, rootId, mode, rateVnd: result.verifiedRateVnd },
      },
    });

    return sendJson(res, 200, {
      ok: true,
      verifiedTariff: {
        mode: result.mode,
        verifiedRateVnd: result.verifiedRateVnd,
        verifiedAt: result.verifiedAt,
        effectiveFrom: body.effectiveFrom || 'IMMEDIATE',
        retroactivePolicy: 'ZERO_RETROACTIVE_PRESERVED',
      },
    });
  }

  // POST /api/v1/console/integrations/hunonic/assign (Map device to room)
  if (method === 'POST' && pathname === '/api/v1/console/integrations/hunonic/assign') {
    if (!actorHasPermission(actor, 'settings.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền gán thiết bị công tơ.',
      });
    }

    const body = await readJsonBody(req);
    const roomId = String(body.roomId || '').trim();
    const hunonicDeviceId = String(body.hunonicDeviceId || '').trim();
    const meterType = String(body.meterType || 'ROOM').trim();

    // Empty selection removes only this exact mapping; preserve historical readings.
    if (!roomId && hunonicDeviceId) {
      const existing = await prisma.electricMeter.findFirst({ where: { orgId: actor.orgId, hunonicDeviceId }, include: { room: true } });
      if (!existing) return sendJson(res, 200, { ok: true, unassigned: true });
      if (!isBuildingAllowedForActor(actor, existing.room.buildingId)) return sendJson(res, 403, { ok: false, message: 'Không có quyền bỏ gán thiết bị ngoài phạm vi tòa nhà.' });
      const previousRoomId = String(body.previousRoomId || '').trim();
      if (!previousRoomId || existing.roomId !== previousRoomId) return sendJson(res, 409, { ok: false, message: 'Phòng gán đã thay đổi. Vui lòng làm mới danh sách.' });
      await prisma.electricMeter.updateMany({
        where: { id: existing.id, orgId: actor.orgId, hunonicDeviceId, roomId: previousRoomId },
        data: { hunonicDeviceId: null, connectionStatus: 'UNCONFIGURED', instantPowerW: null, cumulativeKwh: null, monthReportedKwh: null, providerEstVnd: null, lastSyncedAt: null, tariffVerifiedAt: null },
      });
      return sendJson(res, 200, { ok: true, unassigned: true });
    }

    if (!roomId || !hunonicDeviceId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp mã phòng (roomId) và ID thiết bị Hunonic.',
      });
    }

    const assignedConnection = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    if (!assignedConnection?.isEnabled || assignedConnection.status !== 'VERIFIED') return sendJson(res, 422, { ok: false, message: 'Xác minh lại kết nối Hunonic trước khi gán thiết bị.' });
    const assignCredentials = readHunonicCredentials(assignedConnection.credentialsJson);
    let cloudDevice;
    try {
      const client = new HunonicCloudClient();
      const session = await client.login(assignCredentials.phone, assignCredentials.password);
      const devices = await client.listElectricMeters(session.token);
      cloudDevice = devices.find(device => device.id === hunonicDeviceId);
      await cacheHunonicInventory(actor.orgId, devices, assignCredentials.phone);
    } catch { return sendJson(res, 502, { ok: false, message: 'Không thể xác minh thiết bị hiện tại với Hunonic; chưa thay đổi phòng gán.' }); }
    if (!cloudDevice) return sendJson(res, 422, { ok: false, message: 'Mã thiết bị không có trong danh sách Hunonic hiện tại.' });
    const room = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { electricMeter: true },
    });
    if (!room || room.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng.',
      });
    }

    if (!isBuildingAllowedForActor(actor, room.buildingId)) return sendJson(res, 403, { ok: false, message: 'Không có quyền gán thiết bị ngoài phạm vi tòa nhà.' });
    if (room.electricMeter?.hunonicDeviceId && room.electricMeter.hunonicDeviceId !== hunonicDeviceId) return sendJson(res, 409, { ok: false, message: 'Phòng đã có công tơ khác. Dùng thao tác thay công tơ để giữ đúng chỉ số.' });
    // Check if hunonicDeviceId is already assigned to another room
    const dup = await prisma.electricMeter.findFirst({
      where: {
        orgId: actor.orgId,
        hunonicDeviceId,
        roomId: { not: roomId },
      },
    });
    if (dup) {
      return sendJson(res, 409, {
        ok: false,
        errorCode: 'DEVICE_ALREADY_ASSIGNED',
        message: `Thiết bị ${hunonicDeviceId} đã được gán cho một phòng khác trong hệ thống.`,
      });
    }

    let meter = room.electricMeter;
    if (meter) {
      meter = await prisma.electricMeter.update({
        where: { id: meter.id },
        data: {
          hunonicDeviceId,
          meterType,
          meterMode: 'HUNONIC_AUTO',
          connectionStatus: 'UNCONFIGURED',
        },
      });
    } else {
      meter = await prisma.electricMeter.create({
        data: {
          orgId: actor.orgId,
          roomId: room.id,
          meterSerial: `MTR-${room.code}`,
          hunonicDeviceId,
          meterType,
          meterMode: 'HUNONIC_AUTO',
          connectionStatus: 'UNCONFIGURED',
          cumulativeKwh: null,
        },
      });
    }

    return sendJson(res, 200, { ok: true, meter });
  }

  // Safe connection metadata; credentials never leave the server.
  if (method === 'GET' && pathname === '/api/v1/console/integrations/hunonic/config') {
    if (!actorHasPermission(actor, 'settings.manage') && !actorHasPermission(actor, 'settlements.manage')) {
      return sendJson(res, 403, { ok: false, message: 'Không có quyền xem cấu hình Hunonic.' });
    }
    const conn = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    const credentials = readHunonicCredentials(conn?.credentialsJson);
    const marker = (conn?.credentialsJson as any)?.verification;
    const verified = marker?.protocol === 'hunonic-mobile-v2' && marker.phone === credentials.phone;
    return sendJson(res, 200, { ok: true, connection: { phone: credentials.phone, hasPassword: Boolean(credentials.password), isEnabled: Boolean(conn?.isEnabled), status: conn?.status === 'VERIFIED' && !verified ? 'UNCONFIGURED' : conn?.status || 'UNCONFIGURED', lastTestedAt: conn?.lastTestedAt, lastError: conn?.lastError } });
  }

  if (method === 'POST' && pathname === '/api/v1/console/integrations/hunonic/test') {
    if (!actorHasPermission(actor, 'settings.manage')) return sendJson(res, 403, { ok: false, message: 'Chỉ quản trị viên được cấu hình kết nối Hunonic.' });
    const body = await readJsonBody(req);
    const conn = await prisma.integrationConnection.findUnique({ where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } } });
    if (body.isEnabled === false) {
      if (conn) await prisma.integrationConnection.update({ where: { id: conn.id }, data: { isEnabled: false, status: 'DISABLED' } });
      return sendJson(res, 200, { ok: true, verified: false, message: 'Đã tắt tích hợp Hunonic.' });
    }
    const stored = readHunonicCredentials(conn?.credentialsJson);
    const phone = typeof body.phone === 'string' ? body.phone.trim() : stored.phone;
    // Reusing a password for a different account is never implicit.
    const password = typeof body.password === 'string' && body.password.length ? body.password : phone === stored.phone ? stored.password : undefined;
    if (!phone || !password) return sendJson(res, 422, { ok: false, errorCode: 'HUNONIC_CREDENTIALS_REQUIRED', message: 'Nhập tài khoản và mật khẩu Hunonic để kết nối.' });
    let encryptedSecret;
    try { encryptedSecret = encryptSecret(JSON.stringify({ phone, password })); }
    catch { return sendJson(res, 503, { ok: false, errorCode: 'CREDENTIALS_VAULT_UNAVAILABLE', message: 'Máy chủ chưa cấu hình khóa mã hóa tài khoản tích hợp.' }); }
    try {
      const login = await new HunonicCloudClient().login(phone, password);
      if (login.token.startsWith('mock_hunonic_token_')) return sendJson(res, 200, { ok: true, verified: false, message: 'Đây là chế độ thử nghiệm; chưa xác minh kết nối Hunonic thực tế.' });
      const devices = await new HunonicCloudClient().listElectricMeters(login.token);
      await cacheHunonicInventory(actor.orgId, devices, phone);
      const verifiedAt = new Date();
      const values = { isEnabled: true, status: 'VERIFIED', accountLabel: phone, credentialsJson: { phone, encryptedSecret, verification: { protocol: 'hunonic-mobile-v2', phone, verifiedAt: verifiedAt.toISOString() } } as unknown as Prisma.InputJsonValue, secretHint: 'Đã lưu mật khẩu', lastTestedAt: verifiedAt, lastError: null };
      await prisma.integrationConnection.upsert({
        where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } },
        update: values,
        create: { orgId: actor.orgId, providerId: 'HUNONIC', category: 'METERING', displayName: 'Đồng hồ điện thông minh Hunonic', ...values },
      });
      await prisma.consoleAuditLog.create({ data: { orgId: actor.orgId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, entityType: 'INTEGRATION', entityId: 'HUNONIC', action: 'VERIFY_HUNONIC_CONNECTION', summary: 'Xác minh và lưu kết nối Hunonic', metadata: { clientIp } } });
      return sendJson(res, 200, { ok: true, verified: true, lastTestedAt: verifiedAt, deviceCount: devices.length, message: `Đã xác minh tài khoản và tải ${devices.length} công tơ từ Hunonic.` });
    } catch {
      if (conn) await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: 'ERROR', lastError: 'Không thể xác thực với Hunonic.', lastTestedAt: new Date() } });
      return sendJson(res, 502, { ok: false, errorCode: 'HUNONIC_CONNECTION_ERROR', message: 'Không thể xác thực với Hunonic. Kiểm tra tài khoản, mật khẩu hoặc kết nối mạng máy chủ.' });
    }
  }

  // POST /api/v1/console/v2/meters/:roomId/manual-reading
  const meterReadingMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/meters\/([^/]+)\/manual-reading$/
  );
  if (method === 'POST' && meterReadingMatch) {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền cập nhật chỉ số điện thủ công.',
      });
    }

    const roomId = decodeURIComponent(meterReadingMatch[1]);
    const body = await readJsonBody(req);
    const readingKwh = Number(body.readingKwh);
    const overrideReason = String(body.overrideReason || '').trim();
    const periodKey =
      typeof body.periodKey === 'string' && /^\d{4}-\d{2}$/.test(body.periodKey)
        ? body.periodKey
        : getCurrentVnPeriodKey();

    if (isNaN(readingKwh) || readingKwh < 0 || !overrideReason) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng nhập chỉ số điện (>= 0 kWh) và lý do can thiệp/ghi tay.',
      });
    }

    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true, electricMeter: true },
    });
    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng không tồn tại trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, rm.buildingId, rm.building.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền ghi chỉ số cho phòng ngoài tòa nhà phụ trách.',
      });
    }

    // Guard against locked period (C4-CLOSE-01)
    const bp = await prisma.billingPeriod.findUnique({
      where: {
        orgId_buildingId_periodKey: {
          orgId: actor.orgId,
          buildingId: rm.buildingId,
          periodKey,
        },
      },
    });
    if (bp && bp.status === 'LOCKED') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'PERIOD_ALREADY_LOCKED',
        message: `Kỳ quyết toán ${periodKey} của tòa nhà đã được khóa sổ (LOCKED). Không thể can thiệp hoặc ghi đè chỉ số thủ công.`,
      });
    }

    let meter = rm.electricMeter;
    if (!meter) {
      meter = await prisma.electricMeter.create({
        data: {
          orgId: actor.orgId,
          roomId: rm.id,
          meterSerial: `MTR-${rm.code}`,
          connectionStatus: 'ONLINE',
          cumulativeKwh: readingKwh,
        },
      });
    }

    const validation = validateKwhReading(meter.cumulativeKwh, readingKwh);

    const updated = await prisma.$transaction(async (tx) => {
      const mr = await tx.meterReading.create({
        data: {
          meterId: meter!.id,
          periodKey,
          readingKwh,
          source: 'MANUAL_APPROVED',
          recordedByActor: actor.email,
          overrideReason,
        },
      });

      const updatedMeter = await tx.electricMeter.update({
        where: { id: meter!.id },
        data: {
          cumulativeKwh: readingKwh,
          lastSyncedAt: new Date(),
        },
      });

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: rm.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'METER_READING',
          entityId: mr.id,
          action: 'MANUAL_METER_OVERRIDE',
          summary: `Ghi chỉ số tay phòng ${rm.code}: ${readingKwh} kWh (Lý do: ${overrideReason})`,
          metadata: {
            clientIp,
            readingKwh,
            overrideReason,
            periodKey,
            previousKwh: meter!.cumulativeKwh,
          },
        },
      });

      return { meter: updatedMeter, reading: mr };
    });

    return sendJson(res, 200, {
      ok: true,
      meter: updated.meter,
      reading: updated.reading,
      validation,
    });
  }

  // POST /api/v1/console/v2/meters/:roomId/replace
  const meterReplaceMatch = pathname.match(
    /^\/api\/v1\/console\/v2\/meters\/([^/]+)\/replace$/
  );
  if (method === 'POST' && meterReplaceMatch) {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thay thế công tơ điện.',
      });
    }

    const roomId = decodeURIComponent(meterReplaceMatch[1]);
    const body = await readJsonBody(req);
    const newMeterSerial = String(body.newMeterSerial || '').trim();
    const newHunonicDeviceId = String(body.newHunonicDeviceId || '').trim();
    const initialKwh = Math.max(0, Number(body.initialKwh || 0));
    const reason = String(body.reason || 'Thay công tơ định kỳ/hỏng hóc').trim();

    if (!newMeterSerial || !reason) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp số serial công tơ mới và lý do thay thế.',
      });
    }

    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true, electricMeter: true },
    });
    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng không tồn tại trong tổ chức.',
      });
    }

    // Guard against locked period (C4-CLOSE-01)
    const currentPeriodKey = getCurrentVnPeriodKey();
    const bpReplace = await prisma.billingPeriod.findUnique({
      where: {
        orgId_buildingId_periodKey: {
          orgId: actor.orgId,
          buildingId: rm.buildingId,
          periodKey: currentPeriodKey,
        },
      },
    });
    if (bpReplace && bpReplace.status === 'LOCKED') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'PERIOD_ALREADY_LOCKED',
        message: `Kỳ quyết toán ${currentPeriodKey} của tòa nhà đã được khóa sổ (LOCKED). Không thể thay thế công tơ trong kỳ đã khóa.`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let meter = rm.electricMeter;
      const previousSerial = meter?.meterSerial || 'CHƯA_CÓ';
      const previousKwh = meter?.cumulativeKwh || 0;

      if (!meter) {
        meter = await tx.electricMeter.create({
          data: {
            orgId: actor.orgId,
            roomId: rm.id,
            meterSerial: newMeterSerial,
            hunonicDeviceId: newHunonicDeviceId || null,
            connectionStatus: 'ONLINE',
            cumulativeKwh: initialKwh,
          },
        });
      } else {
        meter = await tx.electricMeter.update({
          where: { id: meter.id },
          data: {
            meterSerial: newMeterSerial,
            hunonicDeviceId: newHunonicDeviceId || null,
            connectionStatus: 'ONLINE',
            cumulativeKwh: initialKwh,
            lastSyncedAt: new Date(),
          },
        });
      }

      const mr = await tx.meterReading.create({
        data: {
          meterId: meter.id,
          periodKey: getCurrentVnPeriodKey(),
          readingKwh: initialKwh,
          source: 'MANUAL_APPROVED',
          recordedByActor: actor.email,
          overrideReason: `[THAY CÔNG TƠ] Cũ: ${previousSerial} (${previousKwh} kWh) -> Mới: ${newMeterSerial} (${initialKwh} kWh). Lý do: ${reason}`,
        },
      });

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: rm.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'ELECTRIC_METER',
          entityId: meter.id,
          action: 'REPLACE_ELECTRIC_METER',
          summary: `Thay công tơ phòng ${rm.code}: ${previousSerial} -> ${newMeterSerial}`,
          metadata: {
            clientIp,
            previousSerial,
            newMeterSerial,
            previousKwh,
            initialKwh,
            reason,
          },
        },
      });

      return { meter, reading: mr };
    });

    return sendJson(res, 200, { ok: true, ...updated });
  }

  // ===========================================================================
  // POST /api/v1/console/v2/settlements/month-close (C4-CLOSE-01 Month-Close Invoice Freeze)
  // ===========================================================================
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/month-close') {
    if (
      !actorHasPermission(actor, 'settlements.manage') &&
      !actorHasPermission(actor, 'finance.write')
    ) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền thực hiện khóa sổ kỳ quyết toán.',
      });
    }

    const body = await readJsonBody(req);
    const buildingId = String(body.buildingId || '').trim();
    const periodKey =
      typeof body.periodKey === 'string' && /^\d{4}-\d{2}$/.test(body.periodKey)
        ? body.periodKey
        : getCurrentVnPeriodKey();
    const notes = String(body.notes || 'Khóa sổ định kỳ tháng (C4-CLOSE-01)').trim();

    if (!buildingId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Mã tòa nhà (buildingId) là bắt buộc.',
      });
    }

    const bld = await prisma.building.findUnique({
      where: { id: buildingId },
    });
    if (!bld || bld.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'BUILDING_NOT_FOUND',
        message: 'Không tìm thấy tòa nhà trong tổ chức.',
      });
    }
    if (!isBuildingAllowedForActor(actor, bld.id, bld.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền thao tác trên tòa nhà ngoài phạm vi phụ trách.',
      });
    }

    // Check if BillingPeriod is already locked
    const existingPeriod = await prisma.billingPeriod.findUnique({
      where: {
        orgId_buildingId_periodKey: {
          orgId: actor.orgId,
          buildingId: bld.id,
          periodKey,
        },
      },
    });

    if (existingPeriod && existingPeriod.status === 'LOCKED') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'PERIOD_ALREADY_LOCKED',
        message: `Kỳ quyết toán ${periodKey} của tòa nhà ${bld.code} đã được khóa sổ (LOCKED). Không thể thực hiện khóa sổ lại.`,
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: actor.orgId },
    });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert BillingPeriod to LOCKED
      const bp = await tx.billingPeriod.upsert({
        where: {
          orgId_buildingId_periodKey: {
            orgId: actor.orgId,
            buildingId: bld.id,
            periodKey,
          },
        },
        create: {
          orgId: actor.orgId,
          buildingId: bld.id,
          periodKey,
          status: 'LOCKED',
          lockedAt: new Date(),
          lockedByActorId: actor.id,
          notes,
        },
        update: {
          status: 'LOCKED',
          lockedAt: new Date(),
          lockedByActorId: actor.id,
          notes,
        },
      });

      // 2. Query occupied rooms with active contracts
      const rooms = await tx.consoleRoom.findMany({
        where: { buildingId: bld.id, orgId: actor.orgId },
        include: {
          contracts: {
            where: { status: 'ACTIVE' },
            include: { tenant: true },
            orderBy: { createdAt: 'desc' },
          },
          electricMeter: true,
          occupants: { where: { isActive: true } },
        },
      });

      let totalInvoicesFrozen = 0;
      let totalBilledVnd = 0;

      for (const rm of rooms) {
        if (!rm.contracts.length) continue;
        const shared = rm.rentalModel === 'SHARED_ROOM';
        const contracts = shared ? rm.contracts : rm.contracts.slice(0, 1);
        const weights = contracts.map(contract => rm.occupants.filter(occupant => occupant.contractId === contract.id).length);
        if (shared && weights.some(count => count === 0)) throw Object.assign(new Error('Phòng ghép có hợp đồng không có người ở; cần kiểm tra trước khi khóa sổ.'), { statusCode: 409 });
        const electricShares = shared ? splitSharedCharge((() => { const meter = rm.electricMeter; return meter ? Math.trunc((meter.monthReportedKwh ?? 0) * (meter.tariffRateVnd || 3800)) : 0; })(), weights) : [];
        for (const [index, ct] of contracts.entries()) {
        const rentVnd = toSafeVndNumber(ct.monthlyRentVnd);
        const occupantsCount = shared ? weights[index] : Math.max(1, rm.occupants.length);

        // Calculate Electric
        let electricVnd = 0;
        const meter = rm.electricMeter;
        if (meter && !shared) {
          const rate = meter.tariffRateVnd || 3800;
          electricVnd = Math.trunc((meter.monthReportedKwh ?? 0) * rate);
        }
        if (shared) electricVnd = electricShares[index];

        // Calculate Water
        const waterMethod =
          ct.waterBillingMethod || rm.waterBillingMethod || bld.waterBillingMethod || org?.defaultWaterMethod || 'PER_M3';
        const waterRate =
          ct.waterRateVnd ?? rm.waterRateVnd ?? bld.waterRateVnd ?? org?.defaultWaterRateVnd ?? 15000;
        let waterVnd = 0;
        if (waterMethod === 'PER_PERSON') {
          waterVnd = occupantsCount * waterRate;
        } else if (waterMethod === 'FIXED_PER_ROOM' || waterMethod === 'FIXED_ROOM') {
          waterVnd = waterRate;
        } else {
          waterVnd = 5 * waterRate;
        }
        if (shared) waterVnd = sharedWaterCharge(waterMethod, waterRate, occupantsCount, index, weights);

        const roomTotal = rentVnd + electricVnd + waterVnd;
        totalBilledVnd += roomTotal;
        totalInvoicesFrozen++;

        const invoiceCode = `INV-${periodKey.replace('-', '')}-${rm.code}${shared ? `-${ct.contractCode}` : ''}`;

        // Upsert Invoice with frozen policySnapshot
        const existingInvoice = await tx.invoice.findUnique({ where: { orgId_invoiceCode: { orgId: actor.orgId, invoiceCode } } });
        if (existingInvoice && (existingInvoice.status === 'PAID' || existingInvoice.status === 'PARTIAL' || existingInvoice.paidAmountVnd > 0n)) throw Object.assign(new Error(`Hóa đơn ${invoiceCode} đã thu tiền; không thể ghi đè khi khóa sổ.`), { statusCode: 409 });
        await tx.invoice.upsert({
          where: {
            orgId_invoiceCode: {
              orgId: actor.orgId,
              invoiceCode,
            },
          },
          create: {
            orgId: actor.orgId,
            buildingId: bld.id,
            roomId: rm.id,
            contractId: ct.id,
            tenantId: ct.tenantId,
            billingPeriodId: bp.id,
            invoiceCode,
            periodKey,
            dueDate: `${periodKey}-05`,
            roomRentVnd: BigInt(rentVnd),
            electricVnd: BigInt(electricVnd),
            waterVnd: BigInt(waterVnd),
            totalAmountVnd: BigInt(roomTotal),
            status: 'ISSUED',
            policySnapshot: {
              isFrozen: true,
              frozenAt: new Date().toISOString(),
              lockedBy: actor.email,
              roomRentVnd: rentVnd,
              electricVnd,
              waterVnd,
              waterBillingMethod: waterMethod,
              occupantsCount,
              totalAmountVnd: roomTotal,
              immutable: true,
            },
          },
          update: {
            billingPeriodId: bp.id,
            roomRentVnd: BigInt(rentVnd),
            electricVnd: BigInt(electricVnd),
            waterVnd: BigInt(waterVnd),
            totalAmountVnd: BigInt(roomTotal),
            status: 'ISSUED',
            policySnapshot: {
              isFrozen: true,
              frozenAt: new Date().toISOString(),
              lockedBy: actor.email,
              roomRentVnd: rentVnd,
              electricVnd,
              waterVnd,
              waterBillingMethod: waterMethod,
              occupantsCount,
              totalAmountVnd: roomTotal,
              immutable: true,
            },
          },
        });
        }
      }

      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: bld.id,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'BILLING_PERIOD',
          entityId: bp.id,
          action: 'MONTH_CLOSE_LOCK',
          summary: `Khóa sổ kỳ ${periodKey} tòa nhà ${bld.code}: Đóng băng ${totalInvoicesFrozen} hóa đơn, tổng ${totalBilledVnd.toLocaleString('vi-VN')} đ`,
          metadata: {
            clientIp,
            periodKey,
            totalInvoicesFrozen,
            totalBilledVnd,
            policySnapshotStatus: 'FROZEN_IMMUTABLE',
          },
        },
      });

      return {
        billingPeriod: {
          id: bp.id,
          buildingId: bld.id,
          buildingCode: bld.code,
          periodKey: bp.periodKey,
          status: bp.status,
          lockedAt: bp.lockedAt,
          notes: bp.notes,
        },
        summary: {
          totalInvoicesFrozen,
          totalBilledVnd,
          policySnapshotStatus: 'FROZEN_IMMUTABLE',
        },
      };
    });

    return sendJson(res, 200, {
      ok: true,
      ...result,
    });
  }

  // POST /api/v1/console/v2/settlements/calculate-water
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/calculate-water') {
    const body = await readJsonBody(req);
    const roomId = String(body.roomId || '').trim();
    if (!roomId) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Mã phòng (roomId) là bắt buộc.',
      });
    }

    const rm = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: {
        building: true,
        contracts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!rm || rm.orgId !== actor.orgId) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'ENTITY_NOT_FOUND',
        message: 'Phòng không tồn tại.',
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: actor.orgId },
    });

    const activeContract = rm.contracts[0];
    const waterMethod: string =
      activeContract?.waterBillingMethod ||
      rm.waterBillingMethod ||
      rm.building.waterBillingMethod ||
      org?.defaultWaterMethod ||
      'PER_M3';

    const rateVnd: number =
      typeof body.customRateVnd === 'number' && body.customRateVnd >= 0
        ? Math.trunc(body.customRateVnd)
        : (activeContract?.waterRateVnd ??
          rm.waterRateVnd ??
          rm.building.waterRateVnd ??
          org?.defaultWaterRateVnd ??
          15000);

    let amountVnd = 0;
    let occupantsCount = 0;
    let consumptionM3 = 0;
    let breakdown = '';

    if (waterMethod === 'PER_PERSON') {
      occupantsCount = await prisma.roomOccupant.count({
        where: { roomId: rm.id, isActive: true },
      });
      if (occupantsCount === 0 && rm.occupancyStatus === 'OCCUPIED') {
        occupantsCount = 1;
      }
      amountVnd = occupantsCount * rateVnd;
      breakdown = `${occupantsCount} người × ${rateVnd.toLocaleString('vi-VN')} đ/người = ${amountVnd.toLocaleString('vi-VN')} đ`;
    } else if (waterMethod === 'PER_M3') {
      const startM3 = Number(body.startM3 || 0);
      const endM3 = Number(body.endM3 || 0);
      consumptionM3 = Math.max(0, endM3 - startM3);
      amountVnd = Math.round(consumptionM3 * rateVnd);
      breakdown = `${consumptionM3} m³ (${startM3} -> ${endM3}) × ${rateVnd.toLocaleString('vi-VN')} đ/m³ = ${amountVnd.toLocaleString('vi-VN')} đ`;
    } else {
      amountVnd = rateVnd;
      breakdown = `Khoán cố định phòng: ${amountVnd.toLocaleString('vi-VN')} đ/tháng`;
    }

    return sendJson(res, 200, {
      ok: true,
      data: {
        roomId: rm.id,
        roomCode: rm.code,
        method: waterMethod,
        rateVnd,
        occupantsCount,
        consumptionM3,
        amountVnd,
        breakdown,
      },
    });
  }

  // POST /api/v1/console/v2/ledger (Real PostgreSQL Cashbook Entry)
  if (method === 'POST' && pathname === '/api/v1/console/v2/ledger') {
    if (!actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền ghi sổ quỹ (yêu cầu quyền finance.write).',
      });
    }

    const body = await readJsonBody(req);
    const entryType =
      body.entryType === 'EXPENSE' ? 'EXPENSE' : 'INCOME';
    const category = String(body.category || 'Vận hành').trim();
    const description = String(body.description || '').trim();
    const amountVnd = Math.trunc(Number(body.amountVnd));
    const periodKey =
      typeof body.periodKey === 'string' && /^\d{4}-\d{2}$/.test(body.periodKey)
        ? body.periodKey
        : getCurrentVnPeriodKey();
    const buildingId =
      typeof body.buildingId === 'string' && body.buildingId.trim()
        ? body.buildingId.trim()
        : null;

    if (!description || !Number.isInteger(amountVnd) || amountVnd <= 0) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Nội dung thu/chi và số tiền nguyên VND (> 0đ) là bắt buộc.',
      });
    }

    if (buildingId && !isBuildingAllowedForActor(actor, buildingId, null)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Không có quyền ghi sổ quỹ cho tòa nhà ngoài phạm vi.',
      });
    }

    const entryCode = `${entryType === 'INCOME' ? 'PT' : 'PC'}-${periodKey.replace(
      '-',
      ''
    )}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const created = await prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.create({
        data: {
          orgId: actor.orgId,
          buildingId,
          periodKey,
          entryCode,
          entryType,
          category,
          amountVnd: BigInt(amountVnd),
          description,
          recordedBy: actor.email,
        },
      });
      await tx.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'LEDGER',
          entityId: entry.id,
          action: 'CREATE_LEDGER_ENTRY',
          summary: `Ghi phiếu ${entry.entryCode}: ${description}`,
          metadata: { clientIp, entryType, amountVnd },
        },
      });
      return entry;
    });

    return sendJson(res, 201, {
      ok: true,
      entry: {
        ...created,
        amountVnd: toSafeVndNumber(created.amountVnd),
      },
    });
  }

  // ===========================================================================
  // 8. SETTINGS & INTEGRATION HUB (/api/v1/console/v2/settings*) — 8 Tabs
  // ===========================================================================
  if (
    pathname === '/api/v1/console/v2/settings' ||
    pathname.startsWith('/api/v1/console/v2/settings/')
  ) {
    if (!actorHasPermission(actor, 'settings.manage')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message:
          'Chỉ Quản trị viên được phép truy cập và cấu hình Cài đặt & Thiết lập hệ thống.',
      });
    }

    const auditPageMatch = pathname.match(/^\/api\/v1\/console\/v2\/settings\/(business-logs|login-logs)$/);
    if (method === 'GET' && auditPageMatch) {
      const page = Number(urlObj.searchParams.get('page') || '1');
      if (!Number.isInteger(page) || page < 1 || page > 30) return sendJson(res, 422, { ok: false, message: 'Trang nhật ký phải từ 1 đến 30.' });
      const model = auditPageMatch[1] === 'business-logs' ? prisma.consoleAuditLog : prisma.consoleLoginAudit;
      const where = auditPageMatch[1] === 'business-logs'
        ? { orgId: actor.orgId, entityType: { not: 'RENTAL_DOCUMENT' } }
        : { orgId: actor.orgId };
      const [total, rows] = await Promise.all([
        model.count({ where }),
        model.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
      ]);
      const items = auditPageMatch[1] === 'business-logs'
        ? rows.map((row: any) => ({ id: row.id, actorEmail: row.actorEmail, actorRole: row.actorRole, entityType: row.entityType, action: row.action, summary: row.summary, createdAt: row.createdAt.toISOString() }))
        : rows.map((row: any) => ({ id: row.id, emailAttempted: row.emailAttempted, outcome: row.outcome, clientIp: row.clientIp, createdAt: row.createdAt.toISOString() }));
      return sendJson(res, 200, { ok: true, items, page, pageSize: 20, pageCount: Math.max(1, Math.min(30, Math.ceil(total / 20))), total: Math.min(total, 600) });
    }

    if (method === 'GET' && pathname === '/api/v1/console/v2/settings') {
      const [
        org,
        buildings,
        integrations,
        notificationChannels,
        cronJobs,
      ] = await Promise.all([
        prisma.organization.findUnique({ where: { id: actor.orgId } }),
        prisma.building.findMany({
          where: { orgId: actor.orgId },
          orderBy: { displayOrder: 'asc' },
        }),
        prisma.integrationConnection.findMany({
          where: { orgId: actor.orgId },
          orderBy: { providerId: 'asc' },
        }),
        prisma.notificationChannelConfig.findMany({
          where: { orgId: actor.orgId },
          orderBy: { channelType: 'asc' },
        }),
        prisma.cronJobConfig.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      return sendJson(res, 200, {
        ok: true,
        organization: org
          ? {
              id: org.id,
              slug: org.slug,
              name: org.name,
              hotline: org.hotline,
              contactEmail: org.contactEmail,
              addressSummary: org.addressSummary,
              timezone: org.timezone,
              defaultElectricRateVnd: org.defaultElectricRateVnd,
              defaultWaterMethod: org.defaultWaterMethod,
              defaultWaterRateVnd: org.defaultWaterRateVnd,
              defaultDepositMonths: org.defaultDepositMonths,
            }
          : null,
        buildingTariffs: buildings.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          status: b.status,
          electricRateVnd: b.electricRateVnd,
          waterBillingMethod: b.waterBillingMethod,
          waterRateVnd: b.waterRateVnd,
        })),
        integrations: integrations.map((c) => ({
          id: c.id,
          providerId: c.providerId,
          category: c.category,
          displayName: c.displayName,
          isEnabled: c.isEnabled,
          status: c.status,
          accountLabel: c.accountLabel || '',
          buildingScopeId: c.buildingScopeId,
          hasCredentials: Boolean(c.secretHint),
          secretHint: c.secretHint || null,
          capabilities: Array.isArray(c.capabilities)
            ? (c.capabilities as string[])
            : [],
          apiVersion: c.apiVersion,
          lastTestedAt: c.lastTestedAt?.toISOString() || null,
          lastSyncedAt: c.lastSyncedAt?.toISOString() || null,
          lastError: c.lastError,
        })),
        notificationChannels: notificationChannels.map((n) => ({
          id: n.id,
          channelType: n.channelType,
          displayName: n.displayName,
          isEnabled: n.isEnabled,
          status: n.status,
          targetLabel: n.targetLabel || '',
          hasCredentials: Boolean(n.secretHint),
          secretHint: n.secretHint || null,
          subscribedEvents: Array.isArray(n.subscribedEvents)
            ? (n.subscribedEvents as string[])
            : [],
          retryMaxAttempts: n.retryMaxAttempts,
          lastTestedAt: n.lastTestedAt?.toISOString() || null,
          lastError: n.lastError,
        })),
        cronJobs: cronJobs.map((j) => ({
          id: j.id,
          jobKey: j.jobKey,
          displayName: j.displayName,
          cronExpression: j.cronExpression,
          timezone: j.timezone,
          isEnabled: j.isEnabled,
          lastRunStatus: j.lastRunStatus,
          lastRunAt: j.lastRunAt?.toISOString() || null,
          successCount: j.successCount,
          failureCount: j.failureCount,
          lastError: j.lastError,
        })),
      });
    }

    const sectionMatch = pathname.match(
      /^\/api\/v1\/console\/v2\/settings\/([a-z-]+)$/
    );
    if (method === 'PATCH' && sectionMatch) {
      const section = sectionMatch[1];
      const body = await readJsonBody(req);

      if (section === 'organization') {
        const name = String(body.name || '').trim();
        const hotline = String(body.hotline || '').trim();
        const contactEmail = String(body.contactEmail || '').trim();
        const addressSummary = String(body.addressSummary || '').trim();
        if (!name || !hotline || !addressSummary) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'Tên tổ chức, hotline và địa chỉ không được để trống.',
          });
        }

        const updated = await prisma.$transaction(async (tx) => {
          const o = await tx.organization.update({
            where: { id: actor.orgId },
            data: {
              name,
              hotline,
              contactEmail: contactEmail || 'contact@adhome.vn',
              addressSummary,
            },
          });
          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'ORGANIZATION',
              entityId: o.id,
              action: 'UPDATE_ORG_SETTINGS',
              summary: `Cập nhật thông tin tổ chức ${o.name}`,
              metadata: { clientIp },
            },
          });
          return o;
        });

        return sendJson(res, 200, { ok: true, organization: updated });
      }

      if (section === 'tariffs') {
        const defaultElectricRateVnd = Math.trunc(
          Number(body.defaultElectricRateVnd)
        );
        const defaultWaterMethod = String(body.defaultWaterMethod || 'PER_M3');
        const defaultWaterRateVnd = Math.trunc(
          Number(body.defaultWaterRateVnd)
        );
        const defaultDepositMonths = Math.max(
          0,
          Math.min(12, Math.trunc(Number(body.defaultDepositMonths ?? 1)))
        );

        if (
          !VALID_WATER_METHODS.has(defaultWaterMethod) ||
          !Number.isInteger(defaultElectricRateVnd) ||
          defaultElectricRateVnd < 0 ||
          !Number.isInteger(defaultWaterRateVnd) ||
          defaultWaterRateVnd < 0
        ) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Đơn giá điện, phương thức tính nước (PER_M3 | PER_PERSON | FIXED_PER_ROOM) và đơn giá nước nguyên VND không hợp lệ.',
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.organization.update({
            where: { id: actor.orgId },
            data: {
              defaultElectricRateVnd,
              defaultWaterMethod,
              defaultWaterRateVnd,
              defaultDepositMonths,
            },
          });

          if (Array.isArray(body.buildingOverrides)) {
            for (const item of body.buildingOverrides as Array<
              Record<string, unknown>
            >) {
              const bId = String(item.buildingId || '').trim();
              if (!bId) continue;
              const bld = await tx.building.findUnique({ where: { id: bId } });
              if (!bld || bld.orgId !== actor.orgId) continue;
              await tx.building.update({
                where: { id: bld.id },
                data: {
                  electricRateVnd:
                    item.electricRateVnd === null || item.electricRateVnd === ''
                      ? null
                      : Math.max(0, Math.trunc(Number(item.electricRateVnd))),
                  waterBillingMethod:
                    item.waterBillingMethod === null ||
                    item.waterBillingMethod === ''
                      ? null
                      : VALID_WATER_METHODS.has(String(item.waterBillingMethod))
                      ? String(item.waterBillingMethod)
                      : bld.waterBillingMethod,
                  waterRateVnd:
                    item.waterRateVnd === null || item.waterRateVnd === ''
                      ? null
                      : Math.max(0, Math.trunc(Number(item.waterRateVnd))),
                },
              });
            }
          }

          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'TARIFF_POLICY',
              entityId: actor.orgId,
              action: 'UPDATE_TARIFF_POLICY',
              summary: `Cập nhật biểu giá mặc định: Điện ${defaultElectricRateVnd}đ/kWh · Nước ${defaultWaterMethod} (${defaultWaterRateVnd}đ)`,
              metadata: { clientIp },
            },
          });
        });

        return sendJson(res, 200, { ok: true });
      }

      if (section === 'integration') {
        const providerId = String(body.providerId || '')
          .trim()
          .toUpperCase();
        if (providerId === 'HUNONIC') {
          return sendJson(res, 409, {
            ok: false,
            errorCode: 'HUNONIC_VERIFICATION_REQUIRED',
            message: 'Kết nối Hunonic cần xác minh qua mục Đồng hồ Hunonic.',
          });
        }
        const existing = await prisma.integrationConnection.findUnique({
          where: {
            orgId_providerId: {
              orgId: actor.orgId,
              providerId,
            },
          },
        });
        if (!existing) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'PROVIDER_NOT_FOUND',
            message: 'Không tìm thấy nhà cung cấp tích hợp.',
          });
        }

        const accountLabel =
          typeof body.accountLabel === 'string'
            ? body.accountLabel.trim() || null
            : existing.accountLabel;
        const rawSecret =
          typeof body.secretToken === 'string' ? body.secretToken.trim() : '';
        const nextSecretHint = rawSecret
          ? maskSecretHint(rawSecret)
          : existing.secretHint;
        const requestedEnabled =
          typeof body.isEnabled === 'boolean'
            ? body.isEnabled
            : existing.isEnabled;

        if (requestedEnabled && !nextSecretHint) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'CREDENTIALS_REQUIRED',
            message: `Không thể bật kết nối ${existing.displayName} khi chưa cấu hình khóa xác thực (API Key / Secret).`,
          });
        }

        // Honest integration state: saving credentials puts status in DISABLED or UNCONFIGURED (pending real live adapter verification in C4/C5), NEVER fakes VERIFIED!
        const nextStatus = !nextSecretHint
          ? 'UNCONFIGURED'
          : requestedEnabled
          ? 'DISABLED'
          : 'DISABLED';

        await prisma.$transaction(async (tx) => {
          await tx.integrationConnection.update({
            where: { id: existing.id },
            data: {
              accountLabel,
              isEnabled: requestedEnabled,
              status: nextStatus,
              ...(rawSecret
                ? {
                    credentialsJson: {
                      updatedAt: new Date().toISOString(),
                      encryptedSecret: encryptSecret(rawSecret),
                    } as unknown as Prisma.InputJsonValue,
                    secretHint: nextSecretHint,
                  }
                : {}),
            },
          });

          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'INTEGRATION',
              entityId: existing.id,
              action: 'UPDATE_INTEGRATION_CONFIG',
              summary: `Cập nhật cấu hình tích hợp ${existing.displayName} (${providerId})`,
              metadata: { clientIp, providerId, isEnabled: requestedEnabled },
            },
          });
        });

        return sendJson(res, 200, { ok: true });
      }

      if (section === 'notification-channel') {
        const channelType = String(body.channelType || '')
          .trim()
          .toUpperCase();
        const existing = await prisma.notificationChannelConfig.findUnique({
          where: {
            orgId_channelType: {
              orgId: actor.orgId,
              channelType,
            },
          },
        });
        if (!existing) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'CHANNEL_NOT_FOUND',
            message: 'Không tìm thấy kênh thông báo.',
          });
        }

        const targetLabel =
          typeof body.targetLabel === 'string'
            ? body.targetLabel.trim() || null
            : existing.targetLabel;
        const rawSecret =
          typeof body.secretToken === 'string' ? body.secretToken.trim() : '';
        const nextSecretHint = rawSecret
          ? maskSecretHint(rawSecret)
          : existing.secretHint;
        const requestedEnabled =
          typeof body.isEnabled === 'boolean'
            ? body.isEnabled
            : existing.isEnabled;

        if (requestedEnabled && !nextSecretHint) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'CREDENTIALS_REQUIRED',
            message: `Không thể bật kênh ${existing.displayName} khi chưa cấu hình Token / Secret.`,
          });
        }

        const subscribedEvents = Array.isArray(body.subscribedEvents)
          ? body.subscribedEvents.map((e) => String(e).trim()).filter(Boolean)
          : (existing.subscribedEvents as string[]);

        await prisma.$transaction(async (tx) => {
          await tx.notificationChannelConfig.update({
            where: { id: existing.id },
            data: {
              targetLabel,
              isEnabled: requestedEnabled,
              status: !nextSecretHint ? 'UNCONFIGURED' : 'DISABLED',
              subscribedEvents: subscribedEvents as Prisma.InputJsonValue,
              ...(rawSecret
                ? {
                    credentialsJson: {
                      updatedAt: new Date().toISOString(),
                      encryptedSecret: encryptSecret(rawSecret),
                    } as unknown as Prisma.InputJsonValue,
                    secretHint: nextSecretHint,
                  }
                : {}),
            },
          });

          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'NOTIFICATION_CHANNEL',
              entityId: existing.id,
              action: 'UPDATE_NOTIFICATION_CHANNEL',
              summary: `Cập nhật cấu hình kênh thông báo ${existing.displayName}`,
              metadata: { clientIp, channelType, isEnabled: requestedEnabled },
            },
          });
        });

        return sendJson(res, 200, { ok: true });
      }

      if (section === 'cron') {
        const jobKey = String(body.jobKey || '').trim();
        const existing = await prisma.cronJobConfig.findUnique({
          where: {
            orgId_jobKey: {
              orgId: actor.orgId,
              jobKey,
            },
          },
        });
        if (!existing) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'CRON_JOB_NOT_FOUND',
            message: 'Không tìm thấy tác vụ tự động.',
          });
        }

        let cronExpression =
          typeof body.cronExpression === 'string' && body.cronExpression.trim()
            ? body.cronExpression.trim()
            : existing.cronExpression;
        if (existing.jobKey === 'HUNONIC_HOURLY_SYNC' && body.intervalMinutes !== undefined) {
          const minutes = Math.trunc(Number(body.intervalMinutes));
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || (minutes > 59 && minutes !== 1440 && minutes % 60 !== 0)) {
            return sendJson(res, 422, { ok: false, errorCode: 'INVALID_INTERVAL', message: 'Lịch Hunonic hỗ trợ 1-59 phút, theo giờ tròn hoặc 1440 phút.' });
          }
          cronExpression = minutes < 60
            ? `*/${minutes} * * * *`
            : minutes === 1440
              ? '0 0 * * *'
              : `0 */${minutes / 60} * * *`;
        }
        const isEnabled =
          typeof body.isEnabled === 'boolean'
            ? body.isEnabled
            : existing.isEnabled;

        await prisma.$transaction(async (tx) => {
          await tx.cronJobConfig.update({
            where: { id: existing.id },
            data: { cronExpression, isEnabled },
          });
          await tx.consoleAuditLog.create({
            data: {
              orgId: actor.orgId,
              actorId: actor.id,
              actorEmail: actor.email,
              actorRole: actor.role,
              entityType: 'CRON_JOB',
              entityId: existing.id,
              action: 'UPDATE_CRON_JOB',
              summary: `Cập nhật lịch tự động ${existing.displayName} (${cronExpression})`,
              metadata: { clientIp, jobKey, isEnabled },
            },
          });
        });

        return sendJson(res, 200, { ok: true, cronJob: { ...existing, cronExpression, isEnabled } });
      }
    }
  }

  if (pathname.startsWith('/api/v1/console/v2/settlements/')) {
    const allBuildings = await prisma.building.findMany({
      where: { orgId: actor.orgId, status: { not: 'ARCHIVED' } },
      select: { id: true, code: true },
    });
    const scopedBuildingIds = allBuildings
      .filter((b) => isBuildingAllowedForActor(actor, b.id, b.code))
      .map((b) => b.id);

    const handledSettlement = await handleSettlementCenterApi({
      req,
      res,
      pathname,
      urlObj,
      prisma,
      actor,
      scopedBuildingIds,
      readJsonBody,
      sendJson,
    });
    if (handledSettlement) return true;
  }

  return sendJson(res, 404, {
    ok: false,
    errorCode: 'NOT_FOUND',
    message: 'Console V2 API endpoint not found.',
  });
}

