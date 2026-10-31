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
} from './hunonicAdapter';

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
        message: err.message || 'Lỗi xử lý nghiệp vụ.',
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
        return sendJson(res, existing.responseStatus, existing.responseBody);
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
            return sendJson(res, polled.responseStatus, polled.responseBody);
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
            message: err.message,
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
      message: err.message || 'Lỗi xử lý nghiệp vụ.',
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
          occupants: { where: { isActive: true } },
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.tenant.findMany({
        where: { orgId: actor.orgId, isActive: true },
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
        r.electricRateVnd ??
        r.building.electricRateVnd ??
        org?.defaultElectricRateVnd ??
        3800;

      const resv = activeReservationByRoomId.get(r.id);

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
        availableFrom: r.availableFrom,
        waterBillingMethod: r.waterBillingMethod,
        waterRateVnd: r.waterRateVnd,
        electricRateVnd: r.electricRateVnd,
        effectiveWaterMethod,
        effectiveWaterRateVnd,
        effectiveElectricRateVnd,
        isPublishedToLanding: r.isPublishedToLanding,
        publicSlug: r.publicSlug,
        internalNotes: r.internalNotes || '',
        meterStatus: r.electricMeter?.connectionStatus || 'UNCONFIGURED',
        meterLastSyncedAt: r.electricMeter?.lastSyncedAt?.toISOString() || null,
        occupants: ((r as any).occupants || []).map((occ: any) => ({
          id: occ.id,
          fullName: occ.fullName,
          phone: occ.phone,
          idNumber: occ.idNumber,
          relationToPrimary: occ.relationToPrimary,
          residenceRegStatus: occ.residenceRegStatus,
          moveInDate: occ.moveInDate,
          moveOutDate: occ.moveOutDate,
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
    const name = String(body.name || '').trim();
    const rawCode = String(body.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
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

    if (!name || !rawCode || !streetAddress || !ward || !province) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message:
          'Vui lòng điền đầy đủ Tên tòa nhà, Mã tòa nhà, Địa chỉ, Phường/Xã và Tỉnh/Thành.',
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
          status: 'ACTIVE',
          isActive: true,
          description,
          managerName,
          managerPhone,
          displayOrder: currentCount + 1,
        },
      });

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

      return bld;
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
      const nextName =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : existing.name;
      const nextCode =
        typeof body.code === 'string' && body.code.trim()
          ? body.code
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9-]/g, '')
          : existing.code;
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
        const bld = await tx.building.update({
          where: { id: existing.id },
          data: {
            name: nextName,
            code: nextCode,
            streetAddress:
              typeof body.streetAddress === 'string' && body.streetAddress.trim()
                ? body.streetAddress.trim()
                : existing.streetAddress,
            ward:
              typeof body.ward === 'string' && body.ward.trim()
                ? body.ward.trim()
                : existing.ward,
            province:
              typeof body.province === 'string' && body.province.trim()
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

        return bld;
      });

      if (seoJobId) {
        await deps.executeSeoSyncJobWithRetry(seoJobId);
      }

      return sendJson(res, 200, { ok: true, building: updated });
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
        .replace(/[^A-Z0-9-]/g, '');
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
              images: [
                {
                  url: '/images/rooms/lk01-101-main.webp',
                  alt: item.title,
                  caption: item.title,
                },
              ] as Prisma.InputJsonValue,
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
              .replace(/[^A-Z0-9-]/g, '')
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
      const nextElectricRate =
        body.electricRateVnd === null
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
                images: [
                  {
                    url: '/images/rooms/lk01-101-main.webp',
                    alt: nextTitle,
                    caption: nextTitle,
                  },
                ] as Prisma.InputJsonValue,
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
            furnishedLevel: nextFurnished,
            amenities: nextAmenities as Prisma.InputJsonValue,
            availableFrom: nextAvailableFrom,
            waterBillingMethod: nextWaterMethod,
            waterRateVnd: nextWaterRate,
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

      if (!fullName) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Vui lòng nhập họ và tên người lưu trú.',
        });
      }

      // Check active contract on room to link if any
      const activeContract = await prisma.contract.findFirst({
        where: { roomId: rm.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
      });

      const occ = await prisma.roomOccupant.create({
        data: {
          orgId: actor.orgId,
          roomId: rm.id,
          contractId: activeContract?.id || null,
          tenantId: body.tenantId ? String(body.tenantId) : null,
          fullName,
          phone,
          idNumber,
          dateOfBirth,
          gender,
          residenceRegStatus,
          relationToPrimary,
          moveInDate,
          notes,
          isActive: true,
        },
      });

      await prisma.consoleAuditLog.create({
        data: {
          orgId: actor.orgId,
          buildingId: rm.buildingId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          entityType: 'OCCUPANT',
          entityId: occ.id,
          action: 'ADD_OCCUPANT',
          summary: `Thêm người lưu trú ${fullName} vào phòng ${rm.code} (${rm.building.code})`,
          metadata: { clientIp, roomId: rm.id, relationToPrimary },
        },
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
      const body = await readJsonBody(req).catch(() => ({}));
      const moveOutDate =
        typeof body?.moveOutDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.moveOutDate)
          ? body.moveOutDate
          : getTodayIsoVn();

      const softDeleted = await prisma.roomOccupant.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          moveOutDate,
        },
      });

      await prisma.consoleAuditLog.create({
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
          metadata: { clientIp, moveOutDate, hardDelete: false },
        },
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
            createdAt: c.createdAt.toISOString(),
          };
        }),
      });
    }

    if (moduleKey === 'settlements') {
      const [periods, meters, cronJobs, hunonic] = await Promise.all([
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
      ]);

      return sendJson(res, 200, {
        ok: true,
        module: moduleKey,
        activePeriod,
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
          include: { invoice: true },
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
          payerName: t.payerName,
          referenceText: t.referenceText,
          reconcileState: t.reconcileState,
          invoiceCode: t.invoice?.invoiceCode || null,
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

        const existingActive = await tx.contract.count({
          where: {
            roomId: rm.id,
            status: { in: ['DRAFT', ...ACTIVE_CONTRACT_STATUSES] },
          },
        });
        if (existingActive > 0) {
          const err: any = new Error(`Phòng ${rm.code} đang có hợp đồng hiệu lực hoặc chờ bàn giao.`);
          err.code = 'ROOM_ALREADY_HAS_CONTRACT';
          err.statusCode = 409;
          throw err;
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

        // Generate First Combined Invoice
        const initialInvoiceCode = `HD-INV-${rm.building.code}-${rm.code}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`;
        const additionalDepositDue = isDepositPaid ? 0 : depositVnd;
        const totalFirstDue = monthlyRentVnd + additionalDepositDue;

        await tx.invoice.create({
          data: {
            orgId: actor.orgId,
            buildingId: rm.buildingId,
            roomId: rm.id,
            contractId: ct.id,
            tenantId: tenant.id,
            invoiceCode: initialInvoiceCode,
            periodKey: getCurrentVnPeriodKey(),
            dueDate: startDate,
            roomRentVnd: BigInt(monthlyRentVnd),
            adjustmentVnd: BigInt(additionalDepositDue),
            totalAmountVnd: BigInt(totalFirstDue),
            status: totalFirstDue === 0 ? 'PAID' : 'ISSUED',
            paidAmountVnd: totalFirstDue === 0 ? BigInt(totalFirstDue) : BigInt(0),
            policySnapshot: {
              type: 'FIRST_COMBINED_INVOICE',
              breakdown: [
                { label: 'Tiền thuê chu kỳ đầu', amountVnd: monthlyRentVnd },
                { label: 'Tiền cọc hợp đồng yêu cầu', amountVnd: depositVnd },
                ...(isDepositPaid
                  ? [{ label: 'Tiền cọc hợp đồng đã thu riêng', amountVnd: -depositVnd }]
                  : []),
              ],
              financialSummary: {
                monthlyRentVnd,
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
          data: { occupancyStatus: 'RESERVED' },
        });
        if (rm.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: rm.publicListingId },
            data: {
              status: 'RESERVED',
              currentTenantName: null,
              currentTenantPhone: null,
            },
          });
        }
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            currentRoomId: rm.id,
            primaryBuildingId: rm.buildingId,
          },
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
    if (isMeteredRoom && (handoverMeterKwh === null || handoverMeterKwh === undefined || isNaN(handoverMeterKwh))) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'MISSING_INITIAL_METER_READING',
        message: 'Phòng tính điện theo công tơ, bắt buộc phải có chỉ số điện đầu kỳ hợp lệ (>= 0) khi bàn giao.',
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

        // If meter reading provided and meter exists, record baseline reading
        if (handoverMeterKwh !== null && ct.room.electricMeter) {
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
              currentTenantName: handoverTo || ct.tenant.fullName,
              currentTenantPhone: ct.tenant.phone,
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
            summary: `Bàn giao phòng ${ct.room.code} cho hợp đồng ${ct.contractCode} (Giao: ${handoverBy}, Nhận: ${handoverTo}, Điện: ${handoverMeterKwh ?? 'N/A'} kWh, Nước: ${handoverWaterM3 ?? 'N/A'} m³)`,
            metadata: {
              clientIp,
              handoverBy,
              handoverTo,
              notes: handoverNotes,
              handoverMeterKwh,
              handoverWaterM3,
              moveInDate,
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

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${rm.id} FOR UPDATE`;

        const activeContracts = await tx.contract.count({
          where: { roomId: rm.id, status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
        });
        if (activeContracts > 0) {
          const err: any = new Error(
            `Phòng ${rm.code} đang có hợp đồng thuê hoạt động, không thể giữ chỗ.`
          );
          err.statusCode = 409;
          throw err;
        }

        const existingResv = await tx.roomReservation.count({
          where: { roomId: rm.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        });
        if (existingResv > 0) {
          const err: any = new Error(`Phòng ${rm.code} đang có phiếu giữ chỗ hoạt động.`);
          err.statusCode = 409;
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

      return sendJson(res, 201, {
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

          let pendingDep = currentResv.deposits.find((d) => d.paymentStatus === 'PENDING');
          const amountToConfirm = pendingDep ? Number(pendingDep.amountVnd) : Number(resv.holdAmountVnd);

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
    const refundAmountVnd = Math.max(0, Math.trunc(Number(body.refundAmountVnd) || 0));
    const deductionAmountVnd = Math.max(0, Math.trunc(Number(body.deductionAmountVnd) || 0));
    const forfeitAmountVnd = Math.max(0, Math.trunc(Number(body.forfeitAmountVnd) || 0));
    const forfeit = Boolean(body.forfeit);

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
    if (resv.status !== 'CONFIRMED' && resv.status !== 'PENDING') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVALID_STATUS',
        message: `Không thể hủy phiếu giữ chỗ đang ở trạng thái ${resv.status}.`,
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'RESERVATION_CANCEL',
      req.headers['idempotency-key'],
      { resvId, refundAmountVnd, deductionAmountVnd, forfeitAmountVnd, forfeit, reason },
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
            (d) => (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED') && d.paymentStatus === 'PAID'
          );
          const freshAvailPaid = paidDeposits.reduce((sum, d) => {
            const avail = Math.max(
              0,
              Number(d.paidAmountVnd || 0) -
                Number(d.refundedVnd || 0) -
                Number(d.deductedAmountVnd || 0) -
                Number(d.forfeitedAmountVnd || 0) -
                Number(d.transferredAmountVnd || 0)
            );
            return sum + avail;
          }, 0);

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
            if (d.paymentStatus === 'PAID' && (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED')) {
              const availDep = Math.max(
                0,
                Number(d.paidAmountVnd || 0) -
                  Number(d.refundedVnd || 0) -
                  Number(d.deductedAmountVnd || 0) -
                  Number(d.forfeitedAmountVnd || 0) -
                  Number(d.transferredAmountVnd || 0)
              );
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

              const nextRefunded = Number(d.refundedVnd || 0) + allocRefund;
              const nextDeducted = Number(d.deductedAmountVnd || 0) + allocDeduction;
              const nextForfeited = Number(d.forfeitedAmountVnd || 0) + allocForfeit;

              const totalUsed = nextRefunded + nextDeducted + nextForfeited + Number(d.transferredAmountVnd || 0);
              const isFullyAllocated = totalUsed >= Number(d.paidAmountVnd || 0);

              const nextStatus = isFullyAllocated
                ? (nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED')
                : 'PARTIALLY_REFUNDED';
              const nextPaymentStatus = isFullyAllocated
                ? (nextRefunded > 0 ? 'REFUNDED' : 'FORFEITED')
                : 'PARTIALLY_PAID';

              await tx.deposit.update({
                where: { id: d.id },
                data: {
                  status: nextStatus,
                  paymentStatus: nextPaymentStatus,
                  refundedVnd: BigInt(nextRefunded),
                  deductedAmountVnd: BigInt(nextDeducted),
                  forfeitedAmountVnd: BigInt(nextForfeited),
                  notes: d.notes
                    ? `${d.notes} | Phân bổ hủy: Hoàn ${allocRefund.toLocaleString('vi-VN')}đ, Khấu trừ ${allocDeduction.toLocaleString('vi-VN')}đ, Tịch thu ${allocForfeit.toLocaleString('vi-VN')}đ`
                    : `Phân bổ hủy: Hoàn ${allocRefund.toLocaleString('vi-VN')}đ, Khấu trừ ${allocDeduction.toLocaleString('vi-VN')}đ, Tịch thu ${allocForfeit.toLocaleString('vi-VN')}đ`,
                },
              });
            } else if (d.paymentStatus !== 'PAID') {
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
          if (targetRefund > 0) {
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

          if (targetDeduction > 0) {
            await tx.ledgerEntry.create({
              data: {
                orgId: actor.orgId,
                buildingId: currentResv.buildingId,
                periodKey: getCurrentVnPeriodKey(),
                entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                  .randomBytes(2)
                  .toString('hex')
                  .toUpperCase()}`,
                entryType: 'INCOME',
                category: 'Khấu trừ tiền cọc giữ chỗ',
                amountVnd: BigInt(targetDeduction),
                description: `Khấu trừ cọc giữ chỗ ${currentResv.reservationCode} của khách ${currentResv.customerName}`,
                recordedBy: actor.email,
              },
            });
          }

          if (targetForfeit > 0) {
            await tx.ledgerEntry.create({
              data: {
                orgId: actor.orgId,
                buildingId: currentResv.buildingId,
                periodKey: getCurrentVnPeriodKey(),
                entryCode: `PT-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                  .randomBytes(2)
                  .toString('hex')
                  .toUpperCase()}`,
                entryType: 'INCOME',
                category: 'Thu phạt hủy hợp đồng/giữ chỗ',
                amountVnd: BigInt(targetForfeit),
                description: `Thu phạt hủy cọc giữ chỗ ${currentResv.reservationCode} của khách ${currentResv.customerName}`,
                recordedBy: actor.email,
              },
            });
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
              metadata: { clientIp, refundAmountVnd: targetRefund, deductionAmountVnd: targetDeduction, forfeitAmountVnd: targetForfeit },
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

    // P0-02: Check building scope permission for actor
    if (!isBuildingAllowedForActor(actor, resv.room.buildingId, resv.room.building?.code)) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_BUILDING_SCOPE',
        message: 'Tài khoản không có quyền thao tác trên tòa nhà chứa phiếu giữ chỗ này.',
      });
    }
    if (resv.status !== 'CONFIRMED' && resv.status !== 'PENDING') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'INVALID_STATUS',
        message: `Phiếu giữ chỗ đang ở trạng thái ${resv.status}, không thể chuyển đổi.`,
      });
    }

    const startDate = String(body.startDate || resv.expectedMoveIn || getTodayIsoVn()).trim();
    const endDate = String(body.endDate || '').trim();
    const monthlyRentVnd = Math.trunc(
      Number(body.monthlyRentVnd || resv.room.listPriceVnd || 4500000)
    );
    const requiredDepositVnd = Math.trunc(Number(body.depositVnd ?? monthlyRentVnd));
    const occupantsCount = Math.max(1, Math.min(12, Math.trunc(Number(body.occupantsCount || 1))));
    const rentalModel = ['ENTIRE_ROOM', 'SHARED_ROOM'].includes(String(body.rentalModel || ''))
      ? String(body.rentalModel)
      : 'ENTIRE_ROOM';
    const surplusAction = String(body.surplusAction || 'RENT_CREDIT'); // RENT_CREDIT | REFUND
    if (surplusAction === 'REFUND' && !actorHasPermission(actor, 'finance.write')) {
      return sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền hoàn tiền cọc dôi dư (yêu cầu finance.write).',
      });
    }

    const coOccupants: Array<{
      fullName: string;
      phone?: string;
      idNumber?: string;
      relationToPrimary?: string;
    }> = Array.isArray(body.coOccupants) ? body.coOccupants : [];

    if (!startDate || !endDate || endDate <= startDate) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Vui lòng cung cấp ngày bắt đầu và kết thúc hợp đồng hợp lệ.',
      });
    }

    return handleWithIdempotency(
      prisma,
      actor.orgId,
      'CONVERT_RESERVATION_TO_CONTRACT',
      req.headers['idempotency-key'],
      { resvId, ...body },
      res,
      async () => {
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

        const paidBookingDeposits = lockedDeposits.filter(
          (d) =>
            (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED') &&
            d.paymentStatus !== 'TRANSFERRED' &&
            d.transferredToDepositId === null
        );

        const B = paidBookingDeposits.reduce((sum, d) => {
          const actualAvail = Math.max(
            0,
            Number(d.paidAmountVnd || 0) - Number(d.refundedVnd || 0) - Number(d.deductedAmountVnd || 0)
          );
          return sum + actualAvail;
        }, 0);

        const C = requiredDepositVnd;
        const R = monthlyRentVnd;

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

        // Create Contract (DRAFT status, room RESERVED)
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
            electricRateVnd: resv.room.electricRateVnd || 3800,
            waterBillingMethod: resv.room.waterBillingMethod || 'PER_M3',
            waterRateVnd: resv.room.waterRateVnd || 15000,
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
            idNumber: finalTenantRecord.idNumber,
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
                relationToPrimary: occ.relationToPrimary || 'ROOMMATE',
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
          const bdAvail = Math.max(
            0,
            Number(bd.paidAmountVnd || 0) -
              Number(bd.refundedVnd || 0) -
              Number(bd.deductedAmountVnd || 0) -
              Number(bd.forfeitedAmountVnd || 0)
          );
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
        if (surplusDepositVnd > 0 && surplusAction === 'REFUND') {
          await tx.ledgerEntry.create({
            data: {
              orgId: actor.orgId,
              buildingId: resv.buildingId,
              periodKey: getCurrentVnPeriodKey(),
              entryCode: `PC-${getCurrentVnPeriodKey().replace('-', '')}-${crypto
                .randomBytes(2)
                .toString('hex')
                .toUpperCase()}`,
              entryType: 'EXPENSE',
              category: 'Hoàn tiền cọc dôi dư',
              amountVnd: BigInt(surplusDepositVnd),
              description: `Hoàn tiền cọc giữ chỗ dôi dư ${surplusDepositVnd.toLocaleString('vi-VN')}đ khi lập hợp đồng ${ct.contractCode}`,
              recordedBy: actor.email,
            },
          });
        }

        // P0-03: First Combined Invoice line items MUST sum exactly to totalInitialInvoiceDue
        const invoiceBreakdown: Array<{ label: string; amountVnd: number }> = [
          { label: 'Tiền thuê chu kỳ đầu (R)', amountVnd: monthlyRentVnd },
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
            periodKey: startDate.slice(0, 7) || getCurrentVnPeriodKey(),
            dueDate: startDate,
            roomRentVnd: BigInt(monthlyRentVnd),
            adjustmentVnd: BigInt(additionalDepositDue - appliedRentCreditVnd),
            totalAmountVnd: BigInt(totalInitialInvoiceDue),
            status: totalInitialInvoiceDue === 0 ? 'PAID' : 'ISSUED',
            paidAmountVnd: totalInitialInvoiceDue === 0 ? BigInt(totalInitialInvoiceDue) : BigInt(0),
            policySnapshot: {
              type: 'FIRST_COMBINED_INVOICE',
              breakdown: invoiceBreakdown,
              deferredCredits: remainingSurplusCreditVnd > 0 ? [
                { label: 'Tín dụng tiền thuê bảo lưu cho kỳ sau', amountVnd: remainingSurplusCreditVnd }
              ] : [],
              billingSchedule: {
                issuedAt: new Date().toISOString(),
                servicePeriodStart: startDate,
                servicePeriodEnd: computeServiceCycleEndIso(startDate),
                periodKey: startDate.slice(0, 7) || getCurrentVnPeriodKey(),
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
          data: { occupancyStatus: 'RESERVED' },
        });
        if (resv.room.publicListingId) {
          await tx.publicRoomListing.update({
            where: { id: resv.room.publicListingId },
            data: {
              status: 'RESERVED',
              currentTenantName: null,
              currentTenantPhone: null,
            },
          });
        }
        await tx.tenant.update({
          where: { id: finalTenantId },
          data: { currentRoomId: resv.roomId, primaryBuildingId: resv.buildingId },
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

        return {
          contract: ct,
          invoice,
          contractDeposit: newContractDeposit,
          advanceRentDeposit,
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
    const refundAmountVnd = Math.max(0, Math.trunc(Number(body.refundAmountVnd) || 0));
    const deductionAmountVnd = Math.max(0, Math.trunc(Number(body.deductionAmountVnd) || 0));
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

    // P0.5: Transferred deposit guard (cannot refund from source record)
    if (
      dep.status === 'APPLIED_TO_CONTRACT' ||
      dep.paymentStatus === 'TRANSFERRED' ||
      dep.transferredToDepositId !== null
    ) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'DEPOSIT_ALREADY_TRANSFERRED',
        message:
          'Khoản cọc đã được chuyển sang hợp đồng khác, không thể hoàn trực tiếp từ bản ghi nguồn.',
      });
    }

    // P0.1: Strictly calculate available refund from paidAmountVnd - zero fallback to amountVnd
    const effectivePaid = Math.max(0, Number(dep.paidAmountVnd || 0));
    if (effectivePaid <= 0 || dep.paymentStatus === 'PENDING') {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'DEPOSIT_NOT_COLLECTED',
        message:
          'Khoản cọc chưa được thu tiền thực tế, không thể thực hiện hoàn tiền.',
      });
    }

    const totalAvailable = Math.max(
      0,
      effectivePaid - Number(dep.refundedVnd || 0) - Number(dep.deductedAmountVnd || 0)
    );
    if (refundAmountVnd + deductionAmountVnd > totalAvailable) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'EXCEEDS_DEPOSIT_BALANCE',
        message: `Tổng số tiền hoàn (${refundAmountVnd.toLocaleString(
          'vi-VN'
        )}đ) và khấu trừ (${deductionAmountVnd.toLocaleString(
          'vi-VN'
        )}đ) vượt quá số dư cọc khả dụng (${totalAvailable.toLocaleString('vi-VN')}đ).`,
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
            if (currentEffectivePaid <= 0 || currentDep.paymentStatus === 'PENDING') {
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
                Number(currentDep.deductedAmountVnd || 0)
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

      await tx.consoleRoom.update({
        where: { id: ct.roomId },
        data: { occupancyStatus: roomNextStatus },
      });
      if (ct.room.publicListingId) {
        await tx.publicRoomListing.update({
          where: { id: ct.room.publicListingId },
          data: { status: roomNextStatus === 'MAINTENANCE' ? 'MAINTENANCE' : 'AVAILABLE' },
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

    const allowMock =
      process.env.HUNONIC_ALLOW_MOCK === 'true' ||
      process.env.HUNONIC_MOCK_MODE === 'true' ||
      process.env.NODE_ENV === 'test';

    const conn = await prisma.integrationConnection.findUnique({
      where: { orgId_providerId: { orgId: actor.orgId, providerId: 'HUNONIC' } },
    });

    let decryptedSecret = '';
    if (conn?.credentialsJson && typeof conn.credentialsJson === 'object') {
      const enc = (conn.credentialsJson as Record<string, unknown>).encryptedSecret;
      decryptedSecret = decryptSecret(enc) || '';
    }

    if (!decryptedSecret || !conn?.isEnabled) {
      if (!allowMock) {
        return sendJson(res, 422, {
          ok: false,
          errorCode: 'HUNONIC_CREDENTIALS_REQUIRED',
          message:
            'Chưa cấu hình tài khoản kết nối Hunonic Cloud hoặc kết nối chưa được kích hoạt trong Cài đặt.',
        });
      }
    }

    const phone = decryptedSecret.includes(':')
      ? decryptedSecret.split(':')[0]
      : decryptedSecret || (allowMock ? '0901234567' : '');
    const password = decryptedSecret.includes(':')
      ? decryptedSecret.split(':')[1]
      : undefined;

    if (!phone && !allowMock) {
      return sendJson(res, 422, {
        ok: false,
        errorCode: 'HUNONIC_CREDENTIALS_INVALID',
        message: 'Số điện thoại tài khoản Hunonic Cloud không hợp lệ.',
      });
    }

    const hunonicClient = new HunonicCloudClient();
    let authToken = '';
    let isMockSession = false;
    try {
      const loginRes = await hunonicClient.login(phone, password);
      authToken = loginRes.token;
      isMockSession = authToken.startsWith('mock_hunonic_token_');
    } catch (err: any) {
      if (!allowMock) {
        return sendJson(res, 502, {
          ok: false,
          errorCode: 'HUNONIC_AUTH_FAILED',
          message: `Đăng nhập Hunonic Cloud thất bại: ${err?.message || 'Không thể xác thực'}.`,
        });
      }
      authToken = 'mock_hunonic_token_sandbox';
      isMockSession = true;
    }

    const meters = await prisma.electricMeter.findMany({
      where: {
        orgId: actor.orgId,
        room: { buildingId: { in: bldIds } },
      },
      include: { room: { include: { building: true } } },
    });

    const currentPeriod = getCurrentVnPeriodKey();
    const results = [];
    let offlineCount = 0;
    let staleCount = 0;
    let syncedCount = 0;
    let unmappedCount = 0;
    let anomalousCount = 0;

    for (const m of meters) {
      const hasMappedDevice = Boolean(m.hunonicDeviceId && m.hunonicDeviceId.trim());
      if (!hasMappedDevice && !allowMock) {
        unmappedCount++;
        results.push({
          meterId: m.id,
          roomCode: m.room.code,
          deviceId: null,
          status: 'UNCONFIGURED',
          message: 'Phòng chưa được ánh xạ mã công tơ Hunonic (hunonicDeviceId)',
          validation: { isValid: false, warning: 'Chưa liên kết thiết bị công tơ' },
        });
        continue;
      }

      const deviceId =
        m.hunonicDeviceId || (allowMock ? `MOCK-${m.room.building.code}-${m.room.code}` : '');
      if (!deviceId) continue;

      let telemetry;
      try {
        telemetry = await hunonicClient.fetchDeviceTelemetry(
          authToken,
          deviceId,
          m.cumulativeKwh || 120.0
        );
      } catch (err: any) {
        offlineCount++;
        results.push({
          meterId: m.id,
          roomCode: m.room.code,
          deviceId,
          status: 'OFFLINE',
          error: err?.message || 'Không thể đọc dữ liệu thiết bị',
        });
        continue;
      }

      if (telemetry.status === 'OFFLINE') offlineCount++;
      if (telemetry.status === 'STALE') staleCount++;
      if (telemetry.status === 'ONLINE') syncedCount++;

      const validation = validateKwhReading(m.cumulativeKwh, telemetry.cumulativeKwh);
      const isAnomalous = !validation.isValid;
      if (isAnomalous) anomalousCount++;

      // Distinguish reading sources: MOCK vs HUNONIC_VERIFIED vs FLAGGED_ANOMALOUS
      const readingSource = isAnomalous
        ? 'FLAGGED_ANOMALOUS'
        : isMockSession
        ? 'MOCK'
        : 'HUNONIC_VERIFIED';

      await prisma.$transaction(async (tx) => {
        // Only update meter cumulativeKwh if telemetry is valid!
        // Anomalous readings are quarantined and never contaminate billable consumption.
        await tx.electricMeter.update({
          where: { id: m.id },
          data: {
            hunonicDeviceId: m.hunonicDeviceId || (allowMock ? deviceId : null),
            connectionStatus: isAnomalous ? 'WARNING' : telemetry.status,
            instantPowerW: telemetry.instantPowerW,
            ...(validation.isValid ? { cumulativeKwh: telemetry.cumulativeKwh } : {}),
            lastSyncedAt: new Date(),
          },
        });

        await tx.meterReading.create({
          data: {
            meterId: m.id,
            periodKey: currentPeriod,
            readingKwh: telemetry.cumulativeKwh,
            source: readingSource,
            overrideReason: validation.warning || null,
          },
        });
      });

      results.push({
        meterId: m.id,
        roomCode: m.room.code,
        deviceId,
        status: telemetry.status,
        source: readingSource,
        instantPowerW: telemetry.instantPowerW,
        cumulativeKwh: telemetry.cumulativeKwh,
        isValid: validation.isValid,
        validation,
      });
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'INTEGRATION',
        entityId: conn?.id || actor.orgId,
        action: 'HUNONIC_SYNC_METERS',
        summary: `Đồng bộ Hunonic cho ${meters.length} công tơ: ${syncedCount} online, ${offlineCount} offline, ${staleCount} stale, ${anomalousCount} bất thường, ${unmappedCount} chưa map`,
        metadata: {
          clientIp,
          isMockSession,
          syncedCount,
          offlineCount,
          staleCount,
          anomalousCount,
          unmappedCount,
        },
      },
    });

    return sendJson(res, 200, {
      ok: true,
      isMockSession,
      syncedCount,
      offlineCount,
      staleCount,
      anomalousCount,
      unmappedCount,
      totalMeters: meters.length,
      meters: results,
    });

    await prisma.consoleAuditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'INTEGRATION',
        entityId: conn?.id || actor.orgId,
        action: 'HUNONIC_SYNC_METERS',
        summary: `Đồng bộ Hunonic cho ${meters.length} công tơ: ${syncedCount} online, ${offlineCount} offline, ${staleCount} stale`,
        metadata: { clientIp, total: meters.length, syncedCount, offlineCount, staleCount },
      },
    });

    return sendJson(res, 200, {
      ok: true,
      totalMeters: meters.length,
      syncedCount,
      offlineCount,
      staleCount,
      periodKey: currentPeriod,
      results,
    });
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

    if (method === 'GET' && pathname === '/api/v1/console/v2/settings') {
      const [
        org,
        buildings,
        integrations,
        notificationChannels,
        cronJobs,
        consoleAudits,
        loginAudits,
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
        prisma.consoleAuditLog.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 40,
        }),
        prisma.consoleLoginAudit.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 25,
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
        auditLogs: consoleAudits.map((a) => ({
          id: a.id,
          actorEmail: a.actorEmail,
          actorRole: a.actorRole,
          entityType: a.entityType,
          action: a.action,
          summary: a.summary,
          createdAt: a.createdAt.toISOString(),
        })),
        loginAudits: loginAudits.map((l) => ({
          id: l.id,
          emailAttempted: l.emailAttempted,
          outcome: l.outcome,
          clientIp: l.clientIp,
          createdAt: l.createdAt.toISOString(),
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

        const cronExpression =
          typeof body.cronExpression === 'string' && body.cronExpression.trim()
            ? body.cronExpression.trim()
            : existing.cronExpression;
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

        return sendJson(res, 200, { ok: true });
      }
    }
  }

  return sendJson(res, 404, {
    ok: false,
    errorCode: 'NOT_FOUND',
    message: 'Console V2 API endpoint not found.',
  });
}

