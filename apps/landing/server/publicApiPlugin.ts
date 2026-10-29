import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Plugin } from 'vite';
import { ROOMS_PUBLIC_SEED } from '../src/data/roomsSeed';
import type { RoomListing } from '../src/types/room';
import {
  authorizeRoomPublishAccess,
  checkRateLimit,
  extractBearerToken,
  verifyConsoleToken,
} from './authRbac';
import { syncPrerenderedSeoFiles } from './seoPrerenderer';

const DEFAULT_ORG_ID = 'org-adhome-anphu';

let prismaInstance: PrismaClient | null = null;
let seedPromise: Promise<void> | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
        },
      },
    });
  }
  return prismaInstance;
}

/**
 * Strict Public Projection: NEVER selects `currentTenantName`, `currentTenantPhone`,
 * `internalNotes`, or internal `orgId` when serving public endpoints.
 */
const PUBLIC_ROOM_SELECT = {
  id: true,
  slug: true,
  roomCode: true,
  shortTitle: true,
  title: true,
  roomType: true,
  buildingId: true,
  buildingCode: true,
  buildingName: true,
  buildingAddress: true,
  floorNumber: true,
  floorName: true,
  area: true,
  price: true,
  currency: true,
  depositMonths: true,
  maxOccupants: true,
  status: true,
  availableFrom: true,
  availableFromLabel: true,
  shortDescription: true,
  detailedDescription: true,
  amenities: true,
  furnishedLevel: true,
  furnishedLabel: true,
  images: true,
  serviceFees: true,
  featured: true,
  displayOrder: true,
  isPublic: true,
  sourceVerified: true,
  updatedAt: true,
} satisfies Prisma.PublicRoomListingSelect;

type PublicRoomRow = Prisma.PublicRoomListingGetPayload<{
  select: typeof PUBLIC_ROOM_SELECT;
}>;

function mapDbRowToPublicRoom(row: PublicRoomRow): RoomListing {
  return {
    id: row.id,
    slug: row.slug,
    roomCode: row.roomCode,
    shortTitle: row.shortTitle,
    title: row.title,
    roomType: row.roomType as RoomListing['roomType'],
    buildingId: row.buildingId,
    buildingCode: row.buildingCode,
    buildingName: row.buildingName,
    buildingAddress: row.buildingAddress,
    floorNumber: row.floorNumber,
    floorName: row.floorName,
    area: row.area,
    price: row.price,
    currency: 'VND',
    depositMonths: row.depositMonths,
    maxOccupants: row.maxOccupants,
    status: row.status as RoomListing['status'],
    availableFrom: row.availableFrom,
    availableFromLabel: row.availableFromLabel,
    shortDescription: row.shortDescription,
    detailedDescription: row.detailedDescription,
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
    furnishedLevel: row.furnishedLevel as RoomListing['furnishedLevel'],
    furnishedLabel: row.furnishedLabel,
    images: Array.isArray(row.images)
      ? (row.images as unknown as RoomListing['images'])
      : [],
    serviceFees:
      row.serviceFees && typeof row.serviceFees === 'object'
        ? (row.serviceFees as unknown as RoomListing['serviceFees'])
        : {
            electricity: 'Theo đồng hồ riêng từng phòng',
            water: 'Theo đồng hồ riêng từng phòng',
            wifi: 'Trang bị Wifi theo tầng',
            parking: 'Khu vực để xe tầng trệt',
          },
    featured: row.featured,
    displayOrder: row.displayOrder,
    isPublic: row.isPublic,
    sourceVerified: row.sourceVerified,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensurePostgreSqlSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const prisma = getPrismaClient();
    const count = await prisma.publicRoomListing.count();
    if (count > 0) return;

    for (const r of ROOMS_PUBLIC_SEED) {
      const hasTenant = r.status === 'COMING_SOON' || r.status === 'OCCUPIED';
      await prisma.publicRoomListing.upsert({
        where: { slug: r.slug },
        update: {},
        create: {
          id: r.id,
          orgId: DEFAULT_ORG_ID,
          slug: r.slug,
          roomCode: r.roomCode,
          shortTitle: r.shortTitle,
          title: r.title,
          roomType: r.roomType,
          buildingId: r.buildingId,
          buildingCode: r.buildingCode,
          buildingName: r.buildingName,
          buildingAddress: r.buildingAddress,
          floorNumber: r.floorNumber,
          floorName: r.floorName,
          area: r.area,
          price: r.price,
          currency: r.currency,
          depositMonths: r.depositMonths,
          maxOccupants: r.maxOccupants,
          status: r.status,
          availableFrom: r.availableFrom,
          availableFromLabel: r.availableFromLabel,
          shortDescription: r.shortDescription,
          detailedDescription: r.detailedDescription,
          amenities: r.amenities as unknown as Prisma.InputJsonValue,
          furnishedLevel: r.furnishedLevel,
          furnishedLabel: r.furnishedLabel,
          images: r.images as unknown as Prisma.InputJsonValue,
          serviceFees: r.serviceFees as unknown as Prisma.InputJsonValue,
          featured: r.featured,
          displayOrder: r.displayOrder,
          isPublic: r.isPublic,
          sourceVerified: true,
          // Internal private columns populated on occupied/coming-soon rooms
          // to verify strict public projection never leaks tenant PII
          currentTenantName: hasTenant
            ? `Khách thuê nội bộ ${r.roomCode} (PII Private)`
            : null,
          currentTenantPhone: hasTenant ? '0912999888' : null,
          internalNotes: hasTenant
            ? `Hợp đồng nội bộ #HD-${r.roomCode} — Không hiển thị ra Public API`
            : 'Phòng trống đã kiểm tra kỹ thuật',
        },
      });
    }
  })();

  return seedPromise;
}

export async function fetchAllPublicRoomsFromDb(): Promise<{
  rooms: RoomListing[];
  updatedAt: string;
}> {
  await ensurePostgreSqlSeeded();
  const prisma = getPrismaClient();
  const rows = await prisma.publicRoomListing.findMany({
    where: {
      isPublic: true,
      status: { in: ['AVAILABLE', 'COMING_SOON'] },
    },
    select: PUBLIC_ROOM_SELECT,
    orderBy: { displayOrder: 'asc' },
  });

  const rooms = rows.map(mapDbRowToPublicRoom);
  const latestUpdate =
    rows.reduce((max, r) => {
      const t = r.updatedAt.getTime();
      return t > max ? t : max;
    }, 0) || Date.now();

  return {
    rooms,
    updatedAt: new Date(latestUpdate).toISOString(),
  };
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

function isPastDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return true;
  const vnTodayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return isoDate < vnTodayStr;
}

function formatIsoToDdMmYyyy(isoDate?: string): string | undefined {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
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
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 64 * 1024) {
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

function getClientIp(req: IncomingMessage): string {
  const testKey = req.headers['x-rate-limit-key'];
  if (typeof testKey === 'string' && testKey.trim()) {
    return testKey.trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function createApiMiddleware() {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const rawUrl = req.url || '';
    if (
      !rawUrl.startsWith('/api/v1/public/') &&
      !rawUrl.startsWith('/api/v1/console/')
    ) {
      return next();
    }

    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // Simulate API failure when requested for Resilience / Error State E2E testing
    if (
      parsedUrl.searchParams.get('fail') === '1' ||
      req.headers['x-simulate-api-error'] === '1'
    ) {
      return sendJson(res, 503, {
        ok: false,
        errorCode: 'API_ERROR',
        message: 'Public Listings API temporarily unavailable (simulated 503).',
      });
    }

    await ensurePostgreSqlSeeded();
    const prisma = getPrismaClient();

    // =========================================================================
    // A. PUBLIC READ-ONLY ROOM ENDPOINTS (/api/v1/public/rooms*)
    //    Any write method (POST, PATCH, PUT, DELETE) is strictly rejected!
    // =========================================================================
    if (
      pathname === '/api/v1/public/rooms' ||
      pathname.startsWith('/api/v1/public/rooms/')
    ) {
      if (req.method !== 'GET') {
        return sendJson(
          res,
          405,
          {
            ok: false,
            errorCode: 'PUBLIC_WRITE_FORBIDDEN',
            message:
              'Endpoint /api/v1/public/rooms chỉ cho phép truy vấn công khai (GET). Mọi thao tác cập nhật phòng phải đi qua Console API có xác thực (/api/v1/console/rooms/:slug).',
          },
          { Allow: 'GET' }
        );
      }

      // 1. GET /api/v1/public/rooms
      if (pathname === '/api/v1/public/rooms') {
        const { rooms, updatedAt } = await fetchAllPublicRoomsFromDb();
        return sendJson(res, 200, {
          ok: true,
          sourceVerified: true,
          storageEngine: 'postgresql-prisma',
          updatedAt,
          rooms,
        });
      }

      // 2. GET /api/v1/public/rooms/:slug
      const slug = decodeURIComponent(
        pathname.slice('/api/v1/public/rooms/'.length)
      );
      const row = await prisma.publicRoomListing.findFirst({
        where: {
          OR: [{ slug }, { id: slug }],
          isPublic: true,
          status: { in: ['AVAILABLE', 'COMING_SOON'] },
        },
        select: PUBLIC_ROOM_SELECT,
      });

      if (!row) {
        return sendJson(res, 404, {
          ok: false,
          errorCode: 'ROOM_NOT_FOUND',
          message:
            'Không tìm thấy phòng công khai hoặc phòng đã ngừng nhận khách.',
        });
      }

      const room = mapDbRowToPublicRoom(row);
      return sendJson(res, 200, {
        ok: true,
        sourceVerified: true,
        storageEngine: 'postgresql-prisma',
        updatedAt: room.updatedAt,
        room,
      });
    }

    // =========================================================================
    // B. PUBLIC LEAD INQUIRY SUBMISSION (POST /api/v1/public/inquiries)
    //    Strictly POST-only on public surface; persisted in PostgreSQL with
    //    Prisma transaction + @unique dedupeWindowKey constraint.
    // =========================================================================
    if (pathname === '/api/v1/public/inquiries') {
      if (req.method !== 'POST') {
        return sendJson(
          res,
          405,
          {
            ok: false,
            errorCode: 'METHOD_NOT_ALLOWED',
            message:
              'Endpoint công khai /api/v1/public/inquiries chỉ chấp nhận phương thức POST. Để xem danh sách yêu cầu, vui lòng sử dụng Console API có xác thực.',
          },
          { Allow: 'POST' }
        );
      }

      // Rate limit check per client IP / session bucket
      const clientIp = getClientIp(req);
      const rl = checkRateLimit(`public-inquiry:${clientIp}`, 12, 60_000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          {
            ok: false,
            errorCode: 'RATE_LIMITED',
            message:
              'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng đợi ít phút trước khi thử lại.',
          },
          { 'Retry-After': String(rl.retryAfterSec) }
        );
      }

      try {
        const body = await readJsonBody(req);
        const honeypot = String(body.honeypot || '').trim();
        if (honeypot.length > 0) {
          return sendJson(res, 400, {
            ok: false,
            errorCode: 'SPAM_DETECTED',
            message:
              'Yêu cầu bị từ chối do phát hiện dấu hiệu tự động (spam).',
          });
        }

        const fullName = String(body.fullName || '').trim();
        const phone = String(body.phone || '').trim();
        const inquiryType = String(body.inquiryType || 'GENERAL_CONSULT');
        const allowedTypes = [
          'VIEW_ROOM',
          'NOTIFY_COMING_SOON',
          'GENERAL_CONSULT',
        ];
        const safeInquiryType = allowedTypes.includes(inquiryType)
          ? inquiryType
          : 'GENERAL_CONSULT';

        const roomId = body.roomId ? String(body.roomId).trim() : null;
        const roomSlug = body.roomSlug ? String(body.roomSlug).trim() : null;
        const roomCode = body.roomCode ? String(body.roomCode).trim() : null;
        const roomTitle = body.roomTitle ? String(body.roomTitle).trim() : null;
        const preferredMoveInDate = body.preferredMoveInDate
          ? String(body.preferredMoveInDate).trim()
          : null;
        const note = body.note ? String(body.note).trim().slice(0, 500) : null;
        const privacyConsent = Boolean(body.privacyConsent);

        if (fullName.length < 2 || fullName.length > 120) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'Vui lòng nhập họ và tên hợp lệ (từ 2 đến 120 ký tự).',
          });
        }

        if (!isValidVnPhone(phone)) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Số điện thoại không đúng định dạng 10 số tại Việt Nam (ví dụ: 0905889123).',
          });
        }

        if (preferredMoveInDate && isPastDate(preferredMoveInDate)) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Ngày dự kiến xem phòng / chuyển vào không được nằm trong quá khứ.',
          });
        }

        if (!privacyConsent) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Vui lòng xác nhận đồng ý để AdHome sử dụng thông tin liên hệ tư vấn phòng.',
          });
        }

        const normalizedPhone = normalizeVnPhone(phone);
        // 10-minute deterministic time bucket for database-level @unique constraint
        const tenMinBucket = Math.floor(Date.now() / (10 * 60 * 1000));
        const dedupeWindowKey = `${normalizedPhone}::${
          roomCode || 'GENERAL'
        }::${safeInquiryType}::${tenMinBucket}`;

        try {
          const created = await prisma.$transaction(async (tx) => {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const existing = await tx.leadInquiry.findFirst({
              where: {
                normalizedPhone,
                roomCode: roomCode || null,
                inquiryType: safeInquiryType,
                createdAt: { gte: tenMinutesAgo },
              },
              select: { referenceCode: true, createdAt: true },
            });

            if (existing) {
              const dupErr = new Error('DUPLICATE_INQUIRY') as Error & {
                code?: string;
                referenceCode?: string;
              };
              dupErr.code = 'DUPLICATE_INQUIRY';
              dupErr.referenceCode = existing.referenceCode;
              throw dupErr;
            }

            const totalCount = await tx.leadInquiry.count();
            const randSuffix = crypto
              .randomBytes(2)
              .toString('hex')
              .toUpperCase();
            const referenceCode = `ADH-${String(totalCount + 101).padStart(
              4,
              '0'
            )}-${randSuffix}`;

            return tx.leadInquiry.create({
              data: {
                referenceCode,
                orgId: DEFAULT_ORG_ID,
                fullName,
                phone: normalizedPhone,
                normalizedPhone,
                inquiryType: safeInquiryType,
                roomId,
                roomSlug,
                roomCode,
                roomTitle,
                preferredMoveInDate,
                preferredMoveInDateDisplay:
                  formatIsoToDdMmYyyy(preferredMoveInDate || undefined) || null,
                note,
                privacyConsent,
                status: 'NEW',
                dedupeWindowKey,
              },
            });
          });

          return sendJson(res, 201, {
            ok: true,
            id: created.id,
            referenceCode: created.referenceCode,
            status: created.status,
            savedAt: created.createdAt.toISOString(),
          });
        } catch (txErr: unknown) {
          const errObj = txErr as {
            code?: string;
            referenceCode?: string;
          };

          // Handle explicit duplicate check OR PostgreSQL @unique constraint (P2002) under high concurrency
          if (
            errObj?.code === 'DUPLICATE_INQUIRY' ||
            errObj?.code === 'P2002'
          ) {
            const existingRow = await prisma.leadInquiry.findFirst({
              where: {
                OR: [
                  { dedupeWindowKey },
                  {
                    normalizedPhone,
                    roomCode: roomCode || null,
                    inquiryType: safeInquiryType,
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
              select: { referenceCode: true },
            });

            const refCode =
              errObj?.referenceCode ||
              existingRow?.referenceCode ||
              'ADH-EXIST';

            return sendJson(res, 409, {
              ok: false,
              errorCode: 'DUPLICATE_SUBMISSION',
              referenceCode: refCode,
              message: `Yêu cầu của số điện thoại ${normalizedPhone} cho ${
                roomCode ? `phòng ${roomCode}` : 'nhu cầu này'
              } đã được hệ thống ghi nhận trước đó (Mã: ${refCode}). Bộ phận quản lý sẽ sớm liên hệ với bạn.`,
            });
          }

          throw txErr;
        }
      } catch {
        return sendJson(res, 500, {
          ok: false,
          errorCode: 'API_ERROR',
          message: 'Không thể lưu yêu cầu vào hệ thống tại thời điểm này.',
        });
      }
    }

    // =========================================================================
    // C. AUTHENTICATED CONSOLE API (/api/v1/console/*)
    //    Requires signed Bearer Token + RBAC Permission + Tenant & Building Scope
    // =========================================================================
    if (pathname.startsWith('/api/v1/console/')) {
      const clientIp = getClientIp(req);
      const rl = checkRateLimit(`console-api:${clientIp}`, 30, 60_000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          {
            ok: false,
            errorCode: 'RATE_LIMITED',
            message: 'Vượt quá giới hạn tần suất gọi Console API.',
          },
          { 'Retry-After': String(rl.retryAfterSec) }
        );
      }

      const rawToken = extractBearerToken(req);
      if (!rawToken) {
        return sendJson(res, 401, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          message:
            'Thiếu thông tin xác thực (Authorization: Bearer <token>).',
        });
      }

      const verified = verifyConsoleToken(rawToken);
      if (!verified.ok) {
        return sendJson(res, 401, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          reason: verified.reason,
          message: 'Token xác thực không hợp lệ hoặc đã hết hạn.',
        });
      }

      const { claims } = verified;

      // 1. PATCH /api/v1/console/rooms/:slug
      if (
        req.method === 'PATCH' &&
        pathname.startsWith('/api/v1/console/rooms/')
      ) {
        const slug = decodeURIComponent(
          pathname.slice('/api/v1/console/rooms/'.length)
        );

        const targetRoom = await prisma.publicRoomListing.findFirst({
          where: {
            OR: [{ slug }, { id: slug }, { roomCode: slug }],
          },
        });

        if (!targetRoom) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'ROOM_NOT_FOUND',
            message: 'Không tìm thấy phòng trong cơ sở dữ liệu.',
          });
        }

        // Enforce RBAC + Tenant Scope (orgId) + Building Scope (buildingId)
        const authz = authorizeRoomPublishAccess(claims, {
          orgId: targetRoom.orgId,
          buildingId: targetRoom.buildingId,
          buildingCode: targetRoom.buildingCode,
        });

        if (!authz.allowed) {
          return sendJson(res, authz.status, {
            ok: false,
            errorCode: authz.errorCode,
            message: authz.message,
          });
        }

        try {
          const body = await readJsonBody(req);

          // Strict input validation
          if (
            body.price !== undefined &&
            (typeof body.price !== 'number' ||
              !Number.isInteger(body.price) ||
              body.price < 1_000_000 ||
              body.price > 100_000_000)
          ) {
            return sendJson(res, 422, {
              ok: false,
              errorCode: 'VALIDATION_ERROR',
              message:
                'Giá thuê không hợp lệ (phải là số nguyên từ 1.000.000đ đến 100.000.000đ).',
            });
          }

          const allowedStatuses = [
            'AVAILABLE',
            'COMING_SOON',
            'RESERVED',
            'OCCUPIED',
          ];
          if (
            body.status !== undefined &&
            (typeof body.status !== 'string' ||
              !allowedStatuses.includes(body.status))
          ) {
            return sendJson(res, 422, {
              ok: false,
              errorCode: 'VALIDATION_ERROR',
              message: 'Trạng thái phòng không hợp lệ.',
            });
          }

          if (
            body.availableFrom !== undefined &&
            (typeof body.availableFrom !== 'string' ||
              !/^\d{4}-\d{2}-\d{2}$/.test(body.availableFrom))
          ) {
            return sendJson(res, 422, {
              ok: false,
              errorCode: 'VALIDATION_ERROR',
              message: 'Ngày khả dụng phải theo định dạng YYYY-MM-DD.',
            });
          }

          const nextPrice =
            typeof body.price === 'number' ? body.price : targetRoom.price;
          const nextStatus =
            typeof body.status === 'string' ? body.status : targetRoom.status;
          const nextAvailableFrom =
            typeof body.availableFrom === 'string'
              ? body.availableFrom
              : targetRoom.availableFrom;
          const nextAvailableFromLabel =
            typeof body.availableFromLabel === 'string'
              ? body.availableFromLabel
              : nextStatus === 'COMING_SOON'
              ? `Dự kiến sau ${formatIsoToDdMmYyyy(nextAvailableFrom)}`
              : nextStatus === 'AVAILABLE'
              ? 'Đang trống'
              : targetRoom.availableFromLabel;
          const nextImages = Array.isArray(body.images)
            ? (body.images as Prisma.InputJsonValue)
            : (targetRoom.images as Prisma.InputJsonValue);
          const nextIsPublic =
            typeof body.isPublic === 'boolean'
              ? body.isPublic
              : targetRoom.isPublic;

          const { updatedRow, auditLog } = await prisma.$transaction(
            async (tx) => {
              const updated = await tx.publicRoomListing.update({
                where: { id: targetRoom.id },
                data: {
                  price: nextPrice,
                  status: nextStatus,
                  availableFrom: nextAvailableFrom,
                  availableFromLabel: nextAvailableFromLabel,
                  images: nextImages,
                  isPublic: nextIsPublic,
                  sourceVerified: true,
                },
                select: PUBLIC_ROOM_SELECT,
              });

              const audit = await tx.roomAuditLog.create({
                data: {
                  actorUserId: claims.sub,
                  actorRole: claims.role,
                  orgId: claims.orgId,
                  buildingId: targetRoom.buildingId,
                  roomId: targetRoom.id,
                  roomSlug: targetRoom.slug,
                  action: 'CONSOLE_ROOM_PUBLISH_UPDATE',
                  changedFields: Object.keys(body),
                  previousValues: {
                    price: targetRoom.price,
                    status: targetRoom.status,
                    availableFrom: targetRoom.availableFrom,
                    isPublic: targetRoom.isPublic,
                  },
                  newValues: {
                    price: nextPrice,
                    status: nextStatus,
                    availableFrom: nextAvailableFrom,
                    isPublic: nextIsPublic,
                  },
                },
              });

              return { updatedRow: updated, auditLog: audit };
            }
          );

          // Automatically invalidate & re-prerender static SEO HTML files on disk
          const { rooms: allPublicRooms } = await fetchAllPublicRoomsFromDb();
          const seoSync = syncPrerenderedSeoFiles(allPublicRooms);

          return sendJson(res, 200, {
            ok: true,
            updatedAt: updatedRow.updatedAt.toISOString(),
            auditLogId: auditLog.id,
            seoPrerenderSynced: seoSync.synced,
            room: mapDbRowToPublicRoom(updatedRow),
          });
        } catch (err) {
          return sendJson(res, 400, {
            ok: false,
            errorCode: 'BAD_REQUEST',
            detail: err instanceof Error ? err.message : String(err),
            message: 'Dữ liệu cập nhật phòng không hợp lệ.',
          });
        }
      }

      // 2. GET /api/v1/console/inquiries (Authenticated Lead List scoped by orgId)
      if (req.method === 'GET' && pathname === '/api/v1/console/inquiries') {
        if (
          !claims.permissions.includes('leads.read') &&
          !claims.permissions.includes('rooms.publish.write')
        ) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền truy cập danh sách yêu cầu liên hệ.',
          });
        }

        const inquiries = await prisma.leadInquiry.findMany({
          where: { orgId: claims.orgId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        return sendJson(res, 200, {
          ok: true,
          count: inquiries.length,
          inquiries,
        });
      }

      // 3. GET /api/v1/console/audit-logs (Authenticated Audit Log scoped by orgId)
      if (req.method === 'GET' && pathname === '/api/v1/console/audit-logs') {
        if (claims.role !== 'ADMIN' && claims.role !== 'MANAGER') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền xem nhật ký audit.',
          });
        }

        const logs = await prisma.roomAuditLog.findMany({
          where: { orgId: claims.orgId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        return sendJson(res, 200, {
          ok: true,
          count: logs.length,
          logs,
        });
      }

      return sendJson(res, 404, {
        ok: false,
        errorCode: 'NOT_FOUND',
        message: 'Console API endpoint not found.',
      });
    }

    return sendJson(res, 404, {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Public API endpoint not found.',
    });
  };
}

export function adhomePublicApiPlugin(): Plugin {
  return {
    name: 'adhome-public-api-plugin',
    async buildStart() {
      await ensurePostgreSqlSeeded();
    },
    configureServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
  };
}
