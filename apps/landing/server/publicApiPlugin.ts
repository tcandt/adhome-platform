import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Plugin } from 'vite';
import { ROOMS_PUBLIC_SEED } from '../src/data/roomsSeed';
import type { RoomListing } from '../src/types/room';
import { loadAdhomeEnv } from './envLoader.js';
import {
  ALL_CONSOLE_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  actorHasPermission,
  assertSecurityConfiguration,
  authorizeRoomPublishAccess,
  buildClearConsoleSessionCookieHeader,
  buildConsoleSessionCookieHeader,
  checkRateLimit,
  extractConsoleCredentials,
  isBuildingAllowedForActor,
  normalizeBuildingScopes,
  resolveConsoleCapabilities,
  signConsoleToken,
  verifyAndResolveConsoleActor,
} from './authRbac';
import type { ConsolePermission, ConsoleRole } from './authRbac';
import {
  MAX_PASSWORD_LENGTH,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from './passwordHash';
import {
  renderDynamicRobotsTxt,
  renderDynamicSeoRouteFromDb,
  renderDynamicSitemapXml,
  syncPrerenderedSeoFiles,
} from './seoPrerenderer';
import {
  ensureConsoleV2Bootstrap,
  handleConsoleV2Api,
} from './consoleBusinessApi';

loadAdhomeEnv();

const DEFAULT_ORG_ID = 'org-adhome-anphu';
const EMPTY_SAAS_ORG_ID = 'org-empty-saas';

let prismaInstance: PrismaClient | null = null;
let seedPromise: Promise<void> | null = null;

interface RumSample {
  id: string;
  metricName: 'INP' | 'LCP' | 'CLS' | 'LONG_TASK' | 'TBT';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  route: string;
  device: 'desktop' | 'mobile';
  interactionTarget?: string;
  userAgent?: string;
  recordedAt: string;
}

const rumSamplesBuffer: RumSample[] = [];

export function clearRumSamples(): void {
  rumSamplesBuffer.length = 0;
}

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
  floorId: true,
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

    // 1. Seed Primary Organization + Empty SaaS Organization (0..N buildings/floors/rooms proof)
    await prisma.organization.upsert({
      where: { id: DEFAULT_ORG_ID },
      update: {},
      create: {
        id: DEFAULT_ORG_ID,
        slug: 'adhome-anphu',
        name: 'AdHome KĐT Ân Phú',
        hotline: '0905889123',
        addressSummary: 'Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk',
        catalogVersion: 1,
      },
    });

    await prisma.organization.upsert({
      where: { id: EMPTY_SAAS_ORG_ID },
      update: {},
      create: {
        id: EMPTY_SAAS_ORG_ID,
        slug: 'empty-saas-tenant',
        name: 'Tổ chức SaaS Mới (0 Tòa nhà · 0 Tầng · 0 Phòng)',
        hotline: '0905000111',
        addressSummary: 'Đắk Lắk',
        catalogVersion: 1,
      },
    });

    // 2. Production administrators are NEVER created or re-activated at server boot.
    //    They are provisioned explicitly via scripts/provisionProductionAdmin.mjs,
    //    which requires a per-account password and preserves isActive.

    // 2b. Maintain Dev Sample Actors as Deactivated in PostgreSQL (isolated @adhome.internal emails)
    const sampleActorsToSeed = [
      {
        id: 'usr-admin-01',
        email: 'dev.sample.admin@adhome.internal',
        displayName: 'Dev Sample Admin (Deactivated)',
        orgId: DEFAULT_ORG_ID,
        role: 'ADMIN',
        permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
        buildingScopes: ['*'],
        sessionVersion: 1,
        isActive: false,
      },
      {
        id: 'usr-mgr-lk01',
        email: 'dev.sample.mgr@adhome.internal',
        displayName: 'Dev Sample Manager LK01 (Deactivated)',
        orgId: DEFAULT_ORG_ID,
        role: 'MANAGER',
        permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
        buildingScopes: ['bld-lk01-31', 'bld-lk01-32'],
        sessionVersion: 1,
        isActive: false,
      },
      {
        id: 'usr-viewer-01',
        email: 'dev.sample.viewer@adhome.internal',
        displayName: 'Dev Sample Viewer (Deactivated)',
        orgId: DEFAULT_ORG_ID,
        role: 'VIEWER',
        permissions: ['rooms.read'],
        buildingScopes: ['*'],
        sessionVersion: 1,
        isActive: false,
      },
      {
        id: 'usr-other-org-01',
        email: 'dev.sample.other@adhome.internal',
        displayName: 'Dev Sample Other Org (Deactivated)',
        orgId: EMPTY_SAAS_ORG_ID,
        role: 'ADMIN',
        permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
        buildingScopes: ['*'],
        sessionVersion: 1,
        isActive: false,
      },
    ];

    for (const actor of sampleActorsToSeed) {
      await prisma.consoleActor.upsert({
        where: { id: actor.id },
        update: {
          email: actor.email,
          displayName: actor.displayName,
          orgId: actor.orgId,
          role: actor.role,
          permissions: actor.permissions as Prisma.InputJsonValue,
          buildingScopes: actor.buildingScopes as Prisma.InputJsonValue,
          isActive: false, // strictly deactivated for production safety
        },
        create: {
          id: actor.id,
          email: actor.email,
          displayName: actor.displayName,
          orgId: actor.orgId,
          role: actor.role,
          permissions: actor.permissions as Prisma.InputJsonValue,
          buildingScopes: actor.buildingScopes as Prisma.InputJsonValue,
          sessionVersion: actor.sessionVersion,
          isActive: false,
        },
      });
    }

    const roomCount = await prisma.publicRoomListing.count();
    if (roomCount > 0) {
      await ensureConsoleV2Bootstrap(prisma);
      return;
    }

    // 3. Dynamically seed 0..N Buildings and 0..N Floors derived from seed data
    const seenBuildings = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        address: string;
        displayOrder: number;
      }
    >();
    const seenFloors = new Map<
      string,
      {
        id: string;
        buildingId: string;
        floorNumber: number;
        name: string;
      }
    >();

    for (const r of ROOMS_PUBLIC_SEED) {
      if (!seenBuildings.has(r.buildingId)) {
        seenBuildings.set(r.buildingId, {
          id: r.buildingId,
          code: r.buildingCode,
          name: r.buildingName,
          address: r.buildingAddress,
          displayOrder: seenBuildings.size + 1,
        });
      }
      const floorKey = `${r.buildingId}::F${r.floorNumber}`;
      if (!seenFloors.has(floorKey)) {
        seenFloors.set(floorKey, {
          id: `FLR-${r.buildingCode}-0${r.floorNumber}`,
          buildingId: r.buildingId,
          floorNumber: r.floorNumber,
          name: r.floorName,
        });
      }
    }

    for (const bld of seenBuildings.values()) {
      await prisma.building.upsert({
        where: { id: bld.id },
        update: {},
        create: {
          id: bld.id,
          orgId: DEFAULT_ORG_ID,
          code: bld.code,
          name: bld.name,
          streetAddress: bld.address,
          ward: 'Phường Tân An',
          province: 'Đắk Lắk',
          displayOrder: bld.displayOrder,
          isActive: true,
        },
      });
    }

    for (const flr of seenFloors.values()) {
      await prisma.floor.upsert({
        where: { id: flr.id },
        update: {},
        create: {
          id: flr.id,
          orgId: DEFAULT_ORG_ID,
          buildingId: flr.buildingId,
          floorNumber: flr.floorNumber,
          name: flr.name,
        },
      });
    }

    // 4. Seed PublicRoomListings linked to Organization, Building, and Floor
    for (const r of ROOMS_PUBLIC_SEED) {
      const floorId = `FLR-${r.buildingCode}-0${r.floorNumber}`;
      await prisma.publicRoomListing.upsert({
        where: { slug: r.slug },
        update: {},
        create: {
          id: r.id,
          orgId: DEFAULT_ORG_ID,
          slug: r.slug,
          previousSlugs: [],
          roomCode: r.roomCode,
          shortTitle: r.shortTitle,
          title: r.title,
          roomType: r.roomType,
          buildingId: r.buildingId,
          buildingCode: r.buildingCode,
          buildingName: r.buildingName,
          buildingAddress: r.buildingAddress,
          floorId,
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
          currentTenantName: null,
          currentTenantPhone: null,
          internalNotes: null,
        },
      });
    }

    await ensureConsoleV2Bootstrap(prisma);
  })();

  return seedPromise;
}

export async function fetchAllPublicRoomsFromDb(
  orgId: string = DEFAULT_ORG_ID
): Promise<{
  rooms: RoomListing[];
  buildings: Array<{
    id: string;
    code: string;
    name: string;
    address: string;
    floorCount: number;
    roomCount: number;
  }>;
  catalogVersion: number;
  updatedAt: string;
}> {
  await ensurePostgreSqlSeeded();
  const prisma = getPrismaClient();

  const [org, dbBuildings, dbFloors, rows] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.building.findMany({
      where: { orgId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.floor.findMany({
      where: { orgId },
      orderBy: { floorNumber: 'asc' },
    }),
    prisma.publicRoomListing.findMany({
      where: {
        orgId,
        isPublic: true,
      },
      select: PUBLIC_ROOM_SELECT,
      orderBy: { displayOrder: 'asc' },
    }),
  ]);

  const rooms = rows.map(mapDbRowToPublicRoom);
  const latestUpdate =
    rows.reduce((max, r) => {
      const t = r.updatedAt.getTime();
      return t > max ? t : max;
    }, 0) ||
    org?.updatedAt.getTime() ||
    Date.now();

  const buildingsSummary = dbBuildings.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.streetAddress,
    floorCount: dbFloors.filter((f) => f.buildingId === b.id).length,
    roomCount: rooms.filter((r) => r.buildingId === b.id).length,
  }));

  return {
    rooms,
    buildings: buildingsSummary,
    catalogVersion: org?.catalogVersion ?? 1,
    updatedAt: new Date(latestUpdate).toISOString(),
  };
}

/**
 * Outbox Background Worker with automatic retry so static file generation errors
 * never roll back PostgreSQL room updates and recover cleanly on retry.
 */
export async function executeSeoSyncJobWithRetry(
  jobId: string,
  simulateFailFirstAttempt: boolean = false
): Promise<{
  jobId: string;
  status: string;
  attempts: number;
  lastError: string | null;
}> {
  const prisma = getPrismaClient();
  const job = await prisma.seoSyncJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return {
      jobId,
      status: 'NOT_FOUND',
      attempts: 0,
      lastError: 'Job not found',
    };
  }

  let currentAttempts = job.attempts;
  let lastError: string | null = null;

  while (currentAttempts < job.maxAttempts) {
    currentAttempts += 1;
    try {
      if (simulateFailFirstAttempt && currentAttempts === 1) {
        throw new Error(
          'SIMULATED_FS_LOCK_ERROR: Temporary EBUSY on static snapshot write (attempt 1)'
        );
      }

      const { rooms } = await fetchAllPublicRoomsFromDb(job.orgId);
      syncPrerenderedSeoFiles(rooms);

      const updatedJob = await prisma.seoSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'SYNCED',
          attempts: currentAttempts,
          lastError: lastError, // preserve previous transient error if it recovered on retry
          syncedAt: new Date(),
        },
      });

      return {
        jobId: updatedJob.id,
        status: updatedJob.status,
        attempts: updatedJob.attempts,
        lastError: updatedJob.lastError,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await prisma.seoSyncJob.update({
        where: { id: jobId },
        data: {
          status: currentAttempts >= job.maxAttempts ? 'FAILED' : 'PENDING',
          attempts: currentAttempts,
          lastError,
        },
      });
    }
  }

  return {
    jobId,
    status: 'FAILED',
    attempts: currentAttempts,
    lastError,
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
  res.end(
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
  );
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

// =============================================================================
// CONSOLE LOGIN (fail-closed, per-account scrypt verification)
// =============================================================================

const DEV_SAMPLE_ACTOR_IDS = new Set([
  'usr-admin-01',
  'usr-mgr-lk01',
  'usr-viewer-01',
  'usr-other-org-01',
]);

const LOGIN_IP_MAX_ATTEMPTS = 25;
const LOGIN_IP_WINDOW_MS = 10 * 60_000;
const LOGIN_ACCOUNT_MAX_FAILURES = 5;
const LOGIN_ACCOUNT_LOCK_MS = 15 * 60_000;
const LOGIN_EMAIL_REGEX = /^[^\s@]{1,128}@[^\s@]{1,128}\.[^\s@]{2,32}$/;

function isRequestHttps(req: IncomingMessage): boolean {
  const xfProto = req.headers['x-forwarded-proto'];
  if (typeof xfProto === 'string' && xfProto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  const encryptedSocket = req.socket as unknown as { encrypted?: boolean };
  return Boolean(encryptedSocket?.encrypted);
}

const loginFailureBuckets = new Map<string, { failures: number; resetAt: number }>();

export function isConsoleLoginEnabled(): boolean {
  loadAdhomeEnv();
  return process.env.ADHOME_CONSOLE_LOGIN_ENABLED === 'true';
}

function getLoginLock(email: string): { locked: boolean; retryAfterSec: number } {
  const bucket = loginFailureBuckets.get(email);
  const now = Date.now();
  if (!bucket || now >= bucket.resetAt) {
    if (bucket) loginFailureBuckets.delete(email);
    return { locked: false, retryAfterSec: 0 };
  }
  return {
    locked: bucket.failures >= LOGIN_ACCOUNT_MAX_FAILURES,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function recordLoginFailure(email: string): void {
  const now = Date.now();
  const bucket = loginFailureBuckets.get(email);
  if (!bucket || now >= bucket.resetAt) {
    loginFailureBuckets.set(email, { failures: 1, resetAt: now + LOGIN_ACCOUNT_LOCK_MS });
  } else {
    bucket.failures += 1;
  }
}

async function writeLoginAudit(
  prisma: PrismaClient,
  entry: {
    orgId?: string | null;
    actorId?: string | null;
    email: string;
    outcome: string;
    clientIp: string;
    jti?: string | null;
  }
): Promise<void> {
  try {
    await prisma.consoleLoginAudit.create({
      data: {
        orgId: entry.orgId ?? null,
        actorId: entry.actorId ?? null,
        emailAttempted: entry.email.slice(0, 320),
        outcome: entry.outcome,
        clientIp: entry.clientIp.slice(0, 64),
        jti: entry.jti ?? null,
      },
    });
  } catch {
    // Audit failure must never turn into an auth bypass; the decision is already made.
  }
}

const GENERIC_INVALID_CREDENTIALS = {
  ok: false,
  errorCode: 'INVALID_CREDENTIALS',
  message: 'Email hoặc mật khẩu không chính xác.',
} as const;

async function handleConsoleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  prisma: PrismaClient,
  clientIp: string
): Promise<void> {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, errorCode: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST' });
  }

  if (!isConsoleLoginEnabled()) {
    await writeLoginAudit(prisma, { email: '', outcome: 'LOGIN_DISABLED', clientIp });
    return sendJson(res, 503, {
      ok: false,
      errorCode: 'LOGIN_DISABLED',
      message: 'Đăng nhập Console đang tạm khóa trên môi trường này.',
    });
  }

  const ipLimit = checkRateLimit(`console-login-ip:${clientIp}`, LOGIN_IP_MAX_ATTEMPTS, LOGIN_IP_WINDOW_MS);
  if (!ipLimit.allowed) {
    await writeLoginAudit(prisma, { email: '', outcome: 'RATE_LIMITED_IP', clientIp });
    return sendJson(
      res,
      429,
      { ok: false, errorCode: 'RATE_LIMITED', message: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.' },
      { 'Retry-After': String(ipLimit.retryAfterSec) }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    await writeLoginAudit(prisma, { email: '', outcome: 'MALFORMED_REQUEST', clientIp });
    return sendJson(res, 400, { ok: false, errorCode: 'INVALID_JSON', message: 'Dữ liệu đăng nhập không hợp lệ.' });
  }

  const rawEmail = body.email;
  const rawPassword = body.password;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  // Both fields are REQUIRED and must be non-empty strings. No optional-password path exists.
  if (
    !email ||
    !LOGIN_EMAIL_REGEX.test(email) ||
    typeof rawPassword !== 'string' ||
    rawPassword.length === 0 ||
    rawPassword.length > MAX_PASSWORD_LENGTH
  ) {
    await writeLoginAudit(prisma, { email, outcome: 'MALFORMED_CREDENTIALS', clientIp });
    return sendJson(res, 400, {
      ok: false,
      errorCode: 'INVALID_CREDENTIALS_FORMAT',
      message: 'Vui lòng nhập email và mật khẩu hợp lệ.',
    });
  }

  const lock = getLoginLock(email);
  if (lock.locked) {
    await writeLoginAudit(prisma, { email, outcome: 'ACCOUNT_LOCKED', clientIp });
    return sendJson(
      res,
      429,
      {
        ok: false,
        errorCode: 'ACCOUNT_TEMPORARILY_LOCKED',
        message: 'Tài khoản tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau.',
      },
      { 'Retry-After': String(lock.retryAfterSec) }
    );
  }

  const actor = await prisma.consoleActor.findUnique({ where: { email } });

  // verifyPassword always runs the KDF (dummy hash when actor/hash is missing) → uniform timing.
  const passwordValid = await verifyPassword(rawPassword, actor?.passwordHash ?? null);

  if (!actor || !actor.passwordHash || !passwordValid) {
    recordLoginFailure(email);
    await writeLoginAudit(prisma, {
      orgId: actor?.orgId ?? null,
      actorId: actor?.id ?? null,
      email,
      outcome: !actor ? 'UNKNOWN_ACCOUNT' : !actor.passwordHash ? 'NO_PASSWORD_SET' : 'WRONG_PASSWORD',
      clientIp,
    });
    return sendJson(res, 401, GENERIC_INVALID_CREDENTIALS);
  }

  // Account state is only disclosed after the correct password was proven.
  if (!actor.isActive) {
    await writeLoginAudit(prisma, {
      orgId: actor.orgId,
      actorId: actor.id,
      email,
      outcome: 'ACCOUNT_DEACTIVATED',
      clientIp,
    });
    return sendJson(res, 401, {
      ok: false,
      errorCode: 'ACCOUNT_DEACTIVATED',
      message: 'Tài khoản này đã bị vô hiệu hóa.',
    });
  }

  loginFailureBuckets.delete(email);

  const rememberMe = body.rememberMe === true;
  const expiresIn = rememberMe ? 7 * 24 * 3600 : 8 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const dbRole = actor.role as ConsoleRole;
  const dbPermissions = Array.isArray(actor.permissions)
    ? (actor.permissions as ConsolePermission[])
    : [];
  const dbBuildingScopes =
    dbRole === 'ADMIN' ? ['*'] : normalizeBuildingScopes(actor.buildingScopes);
  const capabilities = resolveConsoleCapabilities(dbRole, dbPermissions);

  const org = await prisma.organization.findUnique({ where: { id: actor.orgId } });

  const jti = `jti-${crypto.randomUUID()}`;
  const token = signConsoleToken({
    jti,
    sub: actor.id,
    email: actor.email,
    orgId: actor.orgId,
    role: dbRole,
    permissions: dbPermissions,
    buildingScopes: dbBuildingScopes,
    sessionVersion: actor.sessionVersion,
    iat: nowSec,
    exp: nowSec + expiresIn,
  });

  await writeLoginAudit(prisma, {
    orgId: actor.orgId,
    actorId: actor.id,
    email,
    outcome: 'SUCCESS',
    clientIp,
    jti,
  });

  const cookieHeader = buildConsoleSessionCookieHeader(
    token,
    expiresIn,
    isRequestHttps(req)
  );

  return sendJson(
    res,
    200,
    {
      ok: true,
      token,
      tokenType: 'Bearer',
      sessionTransport: 'httpOnly-cookie+bearer',
      expiresIn,
      actor: {
        id: actor.id,
        displayName:
          actor.displayName ||
          (dbRole === 'ADMIN' ? 'Quản trị viên Hệ thống' : 'Quản lý tòa nhà'),
        email: actor.email,
        role: dbRole,
        orgId: actor.orgId,
        orgName: org?.name || 'AdHome KĐT Ân Phú',
        permissions: dbPermissions,
        buildingScopes: dbBuildingScopes,
        capabilities,
        sessionVersion: actor.sessionVersion,
      },
    },
    { 'Set-Cookie': cookieHeader }
  );
}

export function isTrustProxyEnabled(): boolean {
  loadAdhomeEnv();
  // Strictly require explicit opt-in via TRUST_PROXY=true; NEVER auto-enable via NODE_ENV
  return process.env.TRUST_PROXY === 'true';
}

export function getTrustedProxies(): Set<string> {
  loadAdhomeEnv();
  const configured = process.env.TRUSTED_PROXIES;
  if (configured && configured.trim()) {
    return new Set(
      configured
        .split(',')
        .map((ip) => ip.trim().toLowerCase().replace(/^::ffff:/, ''))
        .filter(Boolean)
    );
  }
  // Default trusted upstream proxies: strictly loopback interfaces
  return new Set(['127.0.0.1', '::1', 'localhost']);
}

export function getClientIp(req: IncomingMessage): string {
  const rawRemote = req.socket?.remoteAddress || '127.0.0.1';
  const normalizedRemote = rawRemote.replace(/^::ffff:/, '').toLowerCase();

  // If TRUST_PROXY is not explicitly enabled with 'true', unconditionally ignore all forwarding headers
  if (!isTrustProxyEnabled()) {
    return rawRemote;
  }

  const trustedProxies = getTrustedProxies();
  const isDirectSocketTrusted =
    trustedProxies.has(normalizedRemote) ||
    normalizedRemote === '127.0.0.1' ||
    normalizedRemote === '::1';

  // Only trust forwarding headers if the immediate TCP socket connects from an explicitly trusted proxy
  if (isDirectSocketTrusted) {
    // Cloudflare CF-Connecting-IP takes precedence when behind Cloudflare proxy
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) {
      return cfIp.trim();
    }
    // Standard X-Forwarded-For: client, proxy1, proxy2
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const firstIp = xff.split(',')[0].trim();
      if (firstIp) return firstIp;
    }
  }

  // Fallback strictly to direct TCP remote socket address
  return rawRemote;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function createApiAndDynamicSeoMiddleware() {
  assertSecurityConfiguration();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const rawUrl = req.url || '';
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // =========================================================================
    // -1. PERMANENT 301 REDIRECT FROM LEGACY *.ductinh.one DOMAINS TO OFFICIAL
    //     adhome.vn & console.adhome.vn DOMAINS
    // =========================================================================
    const rawHostHeader = String(
      req.headers['x-forwarded-host'] || req.headers['host'] || ''
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    const hostWithoutPort = rawHostHeader.replace(/:\d+$/, '');

    if (hostWithoutPort === 'adhome.ductinh.one') {
      const targetLocation = `https://adhome.vn${rawUrl || '/'}`;
      res.statusCode = 301;
      res.setHeader('Location', targetLocation);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.end();
      return;
    }

    if (hostWithoutPort === 'console-adhome.ductinh.one') {
      const targetLocation = `https://console.adhome.vn${rawUrl || '/'}`;
      res.statusCode = 301;
      res.setHeader('Location', targetLocation);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.end();
      return;
    }

    // =========================================================================
    // 0. DYNAMIC SEO ROUTES DIRECTLY FROM POSTGRESQL SOURCE OF TRUTH
    //    (`/`, `/phong-trong`, `/phong/:slug`, `/sitemap.xml`, `/robots.txt`)
    // =========================================================================
    if (
      req.method === 'GET' &&
      (pathname === '/sitemap.xml' || pathname === '/robots.txt')
    ) {
      await ensurePostgreSqlSeeded();
      if (pathname === '/robots.txt') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('X-SEO-Source', 'postgresql-dynamic');
        res.end(renderDynamicRobotsTxt());
        return;
      }

      const { rooms, catalogVersion, updatedAt } =
        await fetchAllPublicRoomsFromDb(DEFAULT_ORG_ID);
      const xml = renderDynamicSitemapXml(rooms, updatedAt);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('ETag', `W/"adhome-sitemap-v${catalogVersion}"`);
      res.setHeader('X-SEO-Source', 'postgresql-dynamic');
      res.end(xml);
      return;
    }

    if (
      req.method === 'GET' &&
      (pathname === '/' ||
        pathname === '/index.html' ||
        pathname === '/phong-trong' ||
        pathname === '/phong-trong/' ||
        pathname.startsWith('/phong/')) &&
      !pathname.endsWith('.js') &&
      !pathname.endsWith('.css') &&
      !pathname.endsWith('.webp') &&
      !pathname.endsWith('.png')
    ) {
      await ensurePostgreSqlSeeded();
      const prisma = getPrismaClient();
      const [{ rooms, catalogVersion }, allRoomsForRedirect] =
        await Promise.all([
          fetchAllPublicRoomsFromDb(DEFAULT_ORG_ID),
          prisma.publicRoomListing.findMany({
            where: { orgId: DEFAULT_ORG_ID },
            select: {
              slug: true,
              status: true,
              isPublic: true,
              previousSlugs: true,
            },
          }),
        ]);

      const redirectCandidates = allRoomsForRedirect.map((r) => ({
        slug: r.slug,
        status: r.status,
        isPublic: r.isPublic,
        previousSlugs: Array.isArray(r.previousSlugs)
          ? (r.previousSlugs as string[])
          : [],
      }));

      const seoResult = renderDynamicSeoRouteFromDb(
        pathname,
        rooms,
        redirectCandidates,
        catalogVersion
      );

      if (seoResult.kind === 'REDIRECT') {
        res.statusCode = seoResult.status;
        res.setHeader('Location', seoResult.location);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('ETag', seoResult.etag);
        res.setHeader('X-SEO-Source', 'postgresql-dynamic-redirect');
        res.end();
        return;
      }

      if (seoResult.kind === 'HTML') {
        const clientNoneMatch = req.headers['if-none-match'];
        if (
          clientNoneMatch &&
          (clientNoneMatch === seoResult.etag ||
            clientNoneMatch.includes(seoResult.etag))
        ) {
          res.statusCode = 304;
          res.setHeader('ETag', seoResult.etag);
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          res.end();
          return;
        }
        res.statusCode = seoResult.status;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('ETag', seoResult.etag);
        res.setHeader('X-Robots-Tag', seoResult.robotsHeader);
        res.setHeader('X-SEO-Source', 'postgresql-dynamic-ssr');
        res.end(seoResult.html);
        return;
      }
    }

    if (
      !rawUrl.startsWith('/api/v1/public/') &&
      !rawUrl.startsWith('/api/v1/console/')
    ) {
      return next();
    }

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
    // A0. REAL USER MONITORING (RUM) ENDPOINTS (/api/v1/public/rum*)
    // =========================================================================
    if (pathname === '/api/v1/public/rum' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const allowedMetrics = ['INP', 'LCP', 'CLS', 'LONG_TASK', 'TBT'];
        const metricName = String(body.metricName || 'INP') as RumSample['metricName'];
        const value = Number(body.value);
        if (!allowedMetrics.includes(metricName) || !Number.isFinite(value) || value < 0) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'Invalid RUM metric payload.',
          });
        }

        const ua = String(req.headers['user-agent'] || '');
        const detectedDevice: 'desktop' | 'mobile' =
          body.device === 'mobile' ||
          body.device === 'desktop'
            ? (body.device as 'desktop' | 'mobile')
            : /Mobile|Android|iPhone|iPad/i.test(ua)
            ? 'mobile'
            : 'desktop';

        const sample: RumSample = {
          id: `rum-${crypto.randomUUID()}`,
          metricName,
          value: Math.round(value * 10000) / 10000,
          rating:
            body.rating === 'poor' || body.rating === 'needs-improvement'
              ? body.rating
              : 'good',
          route: String(body.route || '/').slice(0, 120),
          device: detectedDevice,
          interactionTarget: body.interactionTarget
            ? String(body.interactionTarget).slice(0, 120)
            : undefined,
          userAgent: ua.slice(0, 160),
          recordedAt: new Date().toISOString(),
        };

        rumSamplesBuffer.push(sample);
        if (rumSamplesBuffer.length > 2000) {
          rumSamplesBuffer.shift();
        }

        return sendJson(res, 201, {
          ok: true,
          id: sample.id,
          totalBuffered: rumSamplesBuffer.length,
        });
      } catch {
        return sendJson(res, 400, {
          ok: false,
          errorCode: 'BAD_REQUEST',
          message: 'Invalid JSON body for RUM beacon.',
        });
      }
    }

    if (pathname === '/api/v1/public/rum/reset' && req.method === 'POST') {
      // Strictly restricted to authenticated ADMIN actor (prevents unauthenticated telemetry wiping)
      const creds = extractConsoleCredentials(req);
      if (creds.csrfRejected) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'CSRF_HEADER_REQUIRED',
          message: 'Thiếu header bảo vệ CSRF (X-Requested-With: AdHome-Console).',
        });
      }
      if (!creds.token) {
        return sendJson(res, 401, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          message: 'Chỉ quản trị viên đã xác thực (ADMIN) mới được phép xóa bộ đệm RUM.',
        });
      }
      const resolved = await verifyAndResolveConsoleActor(creds.token, prisma);
      if (!resolved.ok) {
        return sendJson(res, 401, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          reason: resolved.reason,
          message: resolved.message,
        });
      }
      if (resolved.actor.role !== 'ADMIN') {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Chỉ tài khoản vai trò ADMIN mới được phép reset RUM telemetry.',
        });
      }

      clearRumSamples();
      return sendJson(res, 200, {
        ok: true,
        message: 'RUM samples buffer cleared by authorized ADMIN.',
        clearedBy: resolved.actor.id,
        totalBuffered: 0,
      });
    }

    if (pathname === '/api/v1/public/rum/summary' && req.method === 'GET') {
      const computeGroup = (samples: RumSample[]) => {
        const grouped: Record<
          string,
          {
            count: number;
            p50: number;
            p75: number;
            p90: number;
            p95: number;
            max: number;
            avg: number;
          }
        > = {};

        for (const name of ['INP', 'LCP', 'CLS', 'LONG_TASK', 'TBT']) {
          const vals = samples
            .filter((s) => s.metricName === name)
            .map((s) => s.value)
            .sort((a, b) => a - b);
          const sum = vals.reduce((acc, v) => acc + v, 0);
          grouped[name] = {
            count: vals.length,
            p50: percentile(vals, 50),
            p75: percentile(vals, 75),
            p90: percentile(vals, 90),
            p95: percentile(vals, 95),
            max: vals.length > 0 ? vals[vals.length - 1] : 0,
            avg: vals.length > 0 ? Math.round((sum / vals.length) * 100) / 100 : 0,
          };
        }
        return grouped;
      };

      const desktopSamples = rumSamplesBuffer.filter((s) => s.device === 'desktop');
      const mobileSamples = rumSamplesBuffer.filter((s) => s.device === 'mobile');

      const allMetrics = computeGroup(rumSamplesBuffer);
      const desktopMetrics = computeGroup(desktopSamples);
      const mobileMetrics = computeGroup(mobileSamples);

      return sendJson(res, 200, {
        ok: true,
        totalSamples: rumSamplesBuffer.length,
        desktopSamplesCount: desktopSamples.length,
        mobileSamplesCount: mobileSamples.length,
        metrics: allMetrics,
        desktop: desktopMetrics,
        mobile: mobileMetrics,
        recentSamples: rumSamplesBuffer.slice(-25),
      });
    }

    // =========================================================================
    // A1. PUBLIC SAAS ORGANIZATION HIERARCHY (0..N Buildings, 0..N Floors, 0..N Rooms)
    // =========================================================================
    if (
      req.method === 'GET' &&
      pathname.startsWith('/api/v1/public/organizations/')
    ) {
      const orgKey = decodeURIComponent(
        pathname.slice('/api/v1/public/organizations/'.length)
      ).replace(/\/hierarchy$/, '');

      const org = await prisma.organization.findFirst({
        where: {
          OR: [{ id: orgKey }, { slug: orgKey }],
        },
      });

      if (!org) {
        return sendJson(res, 404, {
          ok: false,
          errorCode: 'ORG_NOT_FOUND',
          message: 'Không tìm thấy tổ chức (Organization).',
        });
      }

      const [buildings, floors, roomsData] = await Promise.all([
        prisma.building.findMany({
          where: { orgId: org.id, isActive: true },
          orderBy: { displayOrder: 'asc' },
        }),
        prisma.floor.findMany({
          where: { orgId: org.id },
          orderBy: { floorNumber: 'asc' },
        }),
        fetchAllPublicRoomsFromDb(org.id),
      ]);

      return sendJson(res, 200, {
        ok: true,
        organization: {
          id: org.id,
          slug: org.slug,
          name: org.name,
          regionAddress: org.addressSummary,
          catalogVersion: org.catalogVersion,
        },
        counts: {
          buildings: buildings.length,
          floors: floors.length,
          publicRooms: roomsData.rooms.length,
        },
        buildings: buildings.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          address: b.streetAddress,
          floors: floors
            .filter((f) => f.buildingId === b.id)
            .map((f) => ({
              id: f.id,
              floorNumber: f.floorNumber,
              name: f.name,
              roomCount: roomsData.rooms.filter(
                (r) =>
                  r.buildingId === b.id && r.floorNumber === f.floorNumber
              ).length,
            })),
        })),
        rooms: roomsData.rooms,
      });
    }

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
        const requestedOrgId =
          parsedUrl.searchParams.get('orgId')?.trim() || DEFAULT_ORG_ID;
        const { rooms, buildings, catalogVersion, updatedAt } =
          await fetchAllPublicRoomsFromDb(requestedOrgId);
        return sendJson(res, 200, {
          ok: true,
          orgId: requestedOrgId,
          sourceVerified: true,
          storageEngine: 'postgresql-prisma',
          catalogVersion,
          updatedAt,
          buildings,
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
        },
        select: PUBLIC_ROOM_SELECT,
      });

      if (!row) {
        // Check if slug was renamed (in previousSlugs) so API consumers also know canonical slug
        const renamedRow = await prisma.publicRoomListing.findFirst({
          where: {
            isPublic: true,
          },
          select: { slug: true, previousSlugs: true },
        });
        const matchedRedirect =
          renamedRow &&
          Array.isArray(renamedRow.previousSlugs) &&
          (renamedRow.previousSlugs as string[]).includes(slug)
            ? renamedRow.slug
            : null;

        return sendJson(res, 404, {
          ok: false,
          errorCode: 'ROOM_NOT_FOUND',
          redirectSlug: matchedRedirect,
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
    //    Prisma transaction + @unique dedupeWindowKey constraint + roomId/orgId binding.
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

      // Rate limit check per client IP / session bucket (strictly enforced, no client bypass)
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

        const requestedRoomId = body.roomId ? String(body.roomId).trim() : null;
        const requestedRoomSlug = body.roomSlug
          ? String(body.roomSlug).trim()
          : null;
        const requestedRoomCode = body.roomCode
          ? String(body.roomCode).trim()
          : null;
        const requestedRoomTitle = body.roomTitle
          ? String(body.roomTitle).trim()
          : null;
        const preferredMoveInDate = body.preferredMoveInDate
          ? String(body.preferredMoveInDate).trim()
          : null;
        const note = body.note ? String(body.note).trim().slice(0, 500) : null;
        const privacyConsent = body.privacyConsent === true;

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
              'Vui lòng tích chọn đồng ý để AdHome sử dụng thông tin liên hệ tư vấn phòng trước khi gửi yêu cầu.',
          });
        }

        // Authoritatively resolve room & orgId from PostgreSQL if roomId/roomSlug/roomCode is provided
        const matchedRoom =
          requestedRoomId || requestedRoomSlug || requestedRoomCode
            ? await prisma.publicRoomListing.findFirst({
                where: {
                  OR: [
                    ...(requestedRoomId ? [{ id: requestedRoomId }] : []),
                    ...(requestedRoomSlug ? [{ slug: requestedRoomSlug }] : []),
                    ...(requestedRoomCode
                      ? [{ roomCode: requestedRoomCode }]
                      : []),
                  ],
                },
                select: {
                  id: true,
                  orgId: true,
                  slug: true,
                  roomCode: true,
                  title: true,
                },
              })
            : null;

        // SaaS Multitenancy: authoritatively bind orgId from PostgreSQL room, or default host org.
        // Never allow arbitrary untrusted client-supplied body.orgId to hijack inquiries across tenants!
        const boundOrgId = matchedRoom?.orgId || DEFAULT_ORG_ID;
        const boundRoomId = matchedRoom?.id || requestedRoomId;
        const boundRoomSlug = matchedRoom?.slug || requestedRoomSlug;
        const boundRoomCode = matchedRoom?.roomCode || requestedRoomCode;
        const boundRoomTitle = matchedRoom?.title || requestedRoomTitle;

        const normalizedPhone = normalizeVnPhone(phone);
        // 10-minute deterministic time bucket for database-level @unique constraint
        const tenMinBucket = Math.floor(Date.now() / (10 * 60 * 1000));
        const dedupeWindowKey = `${normalizedPhone}::${
          boundRoomCode || 'GENERAL'
        }::${safeInquiryType}::${tenMinBucket}`;

        try {
          const created = await prisma.$transaction(async (tx) => {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const existing = await tx.leadInquiry.findFirst({
              where: {
                normalizedPhone,
                roomCode: boundRoomCode || null,
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

            const randSuffix = crypto
              .randomBytes(3)
              .toString('hex')
              .toUpperCase();
            const timePart = String(Date.now() % 10000).padStart(4, '0');
            const referenceCode = `ADH-${timePart}-${randSuffix}`;

            return tx.leadInquiry.create({
              data: {
                referenceCode,
                orgId: boundOrgId,
                fullName,
                phone: normalizedPhone,
                normalizedPhone,
                inquiryType: safeInquiryType,
                roomId: boundRoomId,
                roomSlug: boundRoomSlug,
                roomCode: boundRoomCode,
                roomTitle: boundRoomTitle,
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
            orgId: created.orgId,
            roomId: created.roomId,
            roomCode: created.roomCode,
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
                    roomCode: boundRoomCode || null,
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
                boundRoomCode ? `phòng ${boundRoomCode}` : 'nhu cầu này'
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
    //    Requires signed Bearer Token or HttpOnly Session Cookie (+ CSRF header
    //    on mutations) + Revocation/SessionVersion Check + PostgreSQL-authoritative
    //    RBAC Permissions + Tenant & Building Scope enforcement
    // =========================================================================
    if (pathname.startsWith('/api/v1/console/')) {
      const clientIp = getClientIp(req);
      const rl = checkRateLimit(`console-api:${clientIp}`, 240, 60_000);
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

      // 0a. POST /api/v1/console/auth/login
      if (pathname === '/api/v1/console/auth/login') {
        return handleConsoleLogin(req, res, prisma, clientIp);
      }

      const creds = extractConsoleCredentials(req);
      if (creds.csrfRejected) {
        return sendJson(res, 403, {
          ok: false,
          errorCode: 'CSRF_HEADER_REQUIRED',
          message:
            'Thiếu header bảo vệ CSRF (X-Requested-With: AdHome-Console) cho thao tác thay đổi dữ liệu.',
        });
      }
      if (!creds.token) {
        return sendJson(res, 401, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          message:
            'Thiếu thông tin phiên đăng nhập (HttpOnly Session Cookie hoặc Authorization: Bearer <token>).',
        });
      }

      const resolved = await verifyAndResolveConsoleActor(creds.token, prisma);
      if (!resolved.ok) {
        const extraHeaders: Record<string, string> =
          creds.source === 'cookie'
            ? {
                'Set-Cookie': buildClearConsoleSessionCookieHeader(
                  isRequestHttps(req)
                ),
              }
            : {};
        return sendJson(
          res,
          resolved.status,
          {
            ok: false,
            errorCode: 'UNAUTHORIZED',
            reason: resolved.reason,
            message: resolved.message,
          },
          extraHeaders
        );
      }

      const { actor } = resolved;

      // 0a-v2. CONSOLE V2 POSTGRESQL BUSINESS API (/api/v1/console/v2/* and /api/v1/console/integrations/*)
      if (
        pathname.startsWith('/api/v1/console/v2/') ||
        pathname.startsWith('/api/v1/console/integrations/')
      ) {
        return handleConsoleV2Api(
          req,
          res,
          pathname,
          parsedUrl,
          prisma,
          actor,
          clientIp,
          { executeSeoSyncJobWithRetry }
        );
      }

      // 0b. GET /api/v1/console/auth/me (Live Session & Permission Re-verification from PostgreSQL)
      if (req.method === 'GET' && pathname === '/api/v1/console/auth/me') {
        const org = await prisma.organization.findUnique({
          where: { id: actor.orgId },
        });
        return sendJson(res, 200, {
          ok: true,
          actor: {
            id: actor.id,
            displayName:
              actor.displayName ||
              (actor.role === 'ADMIN'
                ? 'Quản trị viên Hệ thống'
                : 'Quản lý tòa nhà'),
            email: actor.email,
            role: actor.role,
            orgId: actor.orgId,
            orgName: org?.name || 'AdHome KĐT Ân Phú',
            permissions: actor.permissions,
            buildingScopes: actor.buildingScopes,
            capabilities: actor.capabilities,
            sessionVersion: actor.sessionVersion,
          },
        });
      }

      // 0c. POST /api/v1/console/auth/logout (Revoke JTI + Clear HttpOnly Cookie)
      if (req.method === 'POST' && pathname === '/api/v1/console/auth/logout') {
        await prisma.revokedToken.upsert({
          where: { jti: actor.jti },
          update: {},
          create: {
            jti: actor.jti,
            actorId: actor.id,
            reason: 'USER_LOGOUT',
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        });
        await writeLoginAudit(prisma, {
          actorId: actor.id,
          email: actor.email,
          outcome: 'LOGOUT',
          clientIp,
          jti: actor.jti,
        });
        return sendJson(
          res,
          200,
          {
            ok: true,
            revokedJti: actor.jti,
            message: 'Đã đăng xuất và hủy phiên làm việc an toàn.',
          },
          {
            'Set-Cookie': buildClearConsoleSessionCookieHeader(
              isRequestHttps(req)
            ),
          }
        );
      }

      // 0d. POST /api/v1/console/rum/reset (ADMIN-only RUM buffer reset)
      if (req.method === 'POST' && pathname === '/api/v1/console/rum/reset') {
        if (actor.role !== 'ADMIN') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Chỉ quản trị viên (ADMIN) mới có quyền reset RUM telemetry.',
          });
        }
        clearRumSamples();
        return sendJson(res, 200, {
          ok: true,
          clearedBy: actor.id,
          totalBuffered: 0,
        });
      }

      // 0e. POST /api/v1/console/auth/revoke (Token Revocation & Session Invalidation)
      if (req.method === 'POST' && pathname === '/api/v1/console/auth/revoke') {
        try {
          const body = await readJsonBody(req);
          const explicitJti =
            typeof body.jti === 'string' && body.jti.trim()
              ? body.jti.trim()
              : null;
          const invalidateAllSessions = body.invalidateAllSessions === true;
          const targetActorId =
            typeof body.actorId === 'string' && body.actorId.trim()
              ? body.actorId.trim()
              : actor.sub;

          // Only ADMIN or the actor themselves can revoke
          if (targetActorId !== actor.sub && actor.role !== 'ADMIN') {
            return sendJson(res, 403, {
              ok: false,
              errorCode: 'INSUFFICIENT_PERMISSION',
              message: 'Không có quyền thu hồi phiên của tài khoản khác.',
            });
          }

          const targetJti =
            explicitJti ||
            (targetActorId === actor.sub && !invalidateAllSessions
              ? actor.jti
              : null);

          if (targetJti) {
            await prisma.revokedToken.upsert({
              where: { jti: targetJti },
              update: {},
              create: {
                jti: targetJti,
                actorId: targetActorId,
                reason: String(body.reason || 'MANUAL_REVOKE'),
                expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
              },
            });
          }

          let nextSessionVersion = actor.sessionVersion;
          if (invalidateAllSessions) {
            const updatedActor = await prisma.consoleActor.update({
              where: { id: targetActorId },
              data: { sessionVersion: { increment: 1 } },
            });
            nextSessionVersion = updatedActor.sessionVersion;
          }

          return sendJson(res, 200, {
            ok: true,
            revokedJti: targetJti,
            actorId: targetActorId,
            sessionVersion: nextSessionVersion,
          });
        } catch (err) {
          return sendJson(res, 400, {
            ok: false,
            errorCode: 'BAD_REQUEST',
            detail: err instanceof Error ? err.message : String(err),
            message: 'Không thể thu hồi token.',
          });
        }
      }

      // 0f. ADMIN-ONLY STAFF ACCOUNT & PERMISSION MANAGEMENT (/api/v1/console/accounts*)
      if (
        pathname === '/api/v1/console/accounts' ||
        pathname.startsWith('/api/v1/console/accounts/')
      ) {
        if (actor.role !== 'ADMIN' || !actorHasPermission(actor, 'accounts.manage')) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message:
              'Chỉ Quản trị viên hệ thống (ADMIN) mới có quyền quản lý tài khoản và phân quyền nhân sự.',
          });
        }

        // GET /api/v1/console/accounts
        if (req.method === 'GET' && pathname === '/api/v1/console/accounts') {
          const [dbActors, orgBuildings] = await Promise.all([
            prisma.consoleActor.findMany({
              where: { orgId: actor.orgId },
              orderBy: { createdAt: 'asc' },
            }),
            prisma.building.findMany({
              where: { orgId: actor.orgId, isActive: true },
              orderBy: { displayOrder: 'asc' },
            }),
          ]);

          const accounts = dbActors
            .filter((a) => !DEV_SAMPLE_ACTOR_IDS.has(a.id))
            .map((a) => {
              const role = a.role as ConsoleRole;
              const perms = Array.isArray(a.permissions)
                ? (a.permissions as ConsolePermission[])
                : [];
              const scopes =
                role === 'ADMIN' ? ['*'] : normalizeBuildingScopes(a.buildingScopes);
              return {
                id: a.id,
                email: a.email,
                displayName:
                  a.displayName ||
                  (role === 'ADMIN' ? 'Quản trị viên Hệ thống' : 'Quản lý tòa nhà'),
                orgId: a.orgId,
                role,
                permissions: perms,
                buildingScopes: scopes,
                capabilities: resolveConsoleCapabilities(role, perms),
                isActive: a.isActive,
                hasPassword: Boolean(a.passwordHash),
                sessionVersion: a.sessionVersion,
                passwordUpdatedAt: a.passwordUpdatedAt?.toISOString() ?? null,
                createdAt: a.createdAt.toISOString(),
                updatedAt: a.updatedAt.toISOString(),
              };
            });

          return sendJson(res, 200, {
            ok: true,
            count: accounts.length,
            availablePermissions: ALL_CONSOLE_PERMISSIONS,
            defaultManagerPermissions: DEFAULT_MANAGER_PERMISSIONS,
            buildings: orgBuildings.map((b) => ({
              id: b.id,
              code: b.code,
              name: b.name,
              address: b.streetAddress,
            })),
            accounts,
          });
        }

        // POST /api/v1/console/accounts (Admin creates a new staff account)
        if (req.method === 'POST' && pathname === '/api/v1/console/accounts') {
          try {
            const body = await readJsonBody(req);
            const email =
              typeof body.email === 'string'
                ? body.email.trim().toLowerCase()
                : '';
            const displayName =
              typeof body.displayName === 'string' && body.displayName.trim()
                ? body.displayName.trim().slice(0, 120)
                : null;
            const role: ConsoleRole =
              body.role === 'ADMIN' ? 'ADMIN' : 'MANAGER';
            const rawPassword =
              typeof body.password === 'string' ? body.password : '';

            if (!email || !LOGIN_EMAIL_REGEX.test(email)) {
              return sendJson(res, 422, {
                ok: false,
                errorCode: 'VALIDATION_ERROR',
                message: 'Địa chỉ email nhân sự không hợp lệ.',
              });
            }

            if (email.endsWith('@adhome.internal')) {
              return sendJson(res, 422, {
                ok: false,
                errorCode: 'VALIDATION_ERROR',
                message: 'Tên miền @adhome.internal chỉ dành riêng cho fixture kiểm thử.',
              });
            }

            const pwCheck = validatePasswordPolicy(rawPassword);
            if (!pwCheck.ok) {
              return sendJson(res, 422, {
                ok: false,
                errorCode: 'WEAK_PASSWORD',
                message: `Mật khẩu không đạt chuẩn bảo mật: ${pwCheck.reason}`,
              });
            }

            const allowedPermSet = new Set<string>(ALL_CONSOLE_PERMISSIONS);
            const requestedPerms = Array.isArray(body.permissions)
              ? body.permissions
                  .map((p) => String(p))
                  .filter((p): p is ConsolePermission => allowedPermSet.has(p))
              : [...DEFAULT_MANAGER_PERMISSIONS];

            const finalPermissions: ConsolePermission[] =
              role === 'ADMIN'
                ? [...ALL_CONSOLE_PERMISSIONS]
                : Array.from(new Set(requestedPerms)).filter(
                    (p) => p !== 'accounts.manage' && p !== 'system.admin'
                  );

            const orgBuildings = await prisma.building.findMany({
              where: { orgId: actor.orgId, isActive: true },
              select: { id: true, code: true },
            });
            const validBuildingIds = new Set(
              orgBuildings.map((b) => b.id.toLowerCase())
            );

            let finalScopes: string[];
            if (role === 'ADMIN') {
              finalScopes = ['*'];
            } else {
              const normalized = normalizeBuildingScopes(body.buildingScopes).filter(
                (s) => s !== '*' && validBuildingIds.has(s)
              );
              if (normalized.length === 0) {
                return sendJson(res, 422, {
                  ok: false,
                  errorCode: 'BUILDING_SCOPE_REQUIRED',
                  message:
                    'Tài khoản Quản lý tòa nhà (MANAGER) bắt buộc phải được phân công ít nhất 1 tòa nhà cụ thể.',
                });
              }
              finalScopes = normalized;
            }

            const existingByEmail = await prisma.consoleActor.findUnique({
              where: { email },
            });
            if (existingByEmail) {
              return sendJson(res, 409, {
                ok: false,
                errorCode: 'EMAIL_ALREADY_EXISTS',
                message: `Email ${email} đã tồn tại trên hệ thống.`,
              });
            }

            const passwordHash = await hashPassword(rawPassword);
            const newId = `usr-staff-${crypto.randomUUID().slice(0, 8)}`;
            const isActive = body.isActive !== false;

            const created = await prisma.consoleActor.create({
              data: {
                id: newId,
                email,
                displayName:
                  displayName ||
                  (role === 'ADMIN' ? 'Quản trị viên' : 'Quản lý tòa nhà'),
                orgId: actor.orgId,
                role,
                permissions: finalPermissions as Prisma.InputJsonValue,
                buildingScopes: finalScopes as Prisma.InputJsonValue,
                sessionVersion: 1,
                isActive,
                passwordHash,
                passwordUpdatedAt: new Date(),
              },
            });

            await writeLoginAudit(prisma, {
              actorId: created.id,
              email: created.email,
              outcome: `ADMIN_CREATED_BY_${actor.id}`,
              clientIp,
            });

            return sendJson(res, 201, {
              ok: true,
              account: {
                id: created.id,
                email: created.email,
                displayName: created.displayName,
                orgId: created.orgId,
                role: created.role,
                permissions: finalPermissions,
                buildingScopes: finalScopes,
                capabilities: resolveConsoleCapabilities(role, finalPermissions),
                isActive: created.isActive,
                hasPassword: true,
                sessionVersion: created.sessionVersion,
                createdAt: created.createdAt.toISOString(),
              },
            });
          } catch (err) {
            return sendJson(res, 400, {
              ok: false,
              errorCode: 'BAD_REQUEST',
              detail: err instanceof Error ? err.message : String(err),
              message: 'Không thể tạo tài khoản nhân sự.',
            });
          }
        }

        // PATCH /api/v1/console/accounts/:id (Admin updates role, permissions, buildingScopes, status, or password -> bumps sessionVersion!)
        if (
          req.method === 'PATCH' &&
          pathname.startsWith('/api/v1/console/accounts/')
        ) {
          const targetId = decodeURIComponent(
            pathname.slice('/api/v1/console/accounts/'.length)
          ).trim();

          if (!targetId || DEV_SAMPLE_ACTOR_IDS.has(targetId)) {
            return sendJson(res, 404, {
              ok: false,
              errorCode: 'ACCOUNT_NOT_FOUND',
              message: 'Không tìm thấy tài khoản nhân sự.',
            });
          }

          const existing = await prisma.consoleActor.findUnique({
            where: { id: targetId },
          });
          if (!existing || existing.orgId !== actor.orgId) {
            return sendJson(res, 404, {
              ok: false,
              errorCode: 'ACCOUNT_NOT_FOUND',
              message: 'Không tìm thấy tài khoản nhân sự thuộc tổ chức này.',
            });
          }

          try {
            const body = await readJsonBody(req);

            if (targetId === actor.id) {
              if (body.isActive === false || (body.role && body.role !== 'ADMIN')) {
                return sendJson(res, 422, {
                  ok: false,
                  errorCode: 'SELF_LOCKOUT_PREVENTED',
                  message:
                    'Không thể tự khóa hoặc tự hạ quyền tài khoản Quản trị viên đang đăng nhập.',
                });
              }
            }

            const nextRole: ConsoleRole =
              body.role === 'ADMIN' || body.role === 'MANAGER'
                ? body.role
                : (existing.role as ConsoleRole);

            const nextDisplayName =
              typeof body.displayName === 'string' && body.displayName.trim()
                ? body.displayName.trim().slice(0, 120)
                : existing.displayName;

            const nextIsActive =
              typeof body.isActive === 'boolean'
                ? body.isActive
                : existing.isActive;

            const allowedPermSet = new Set<string>(ALL_CONSOLE_PERMISSIONS);
            const existingPerms = Array.isArray(existing.permissions)
              ? (existing.permissions as ConsolePermission[])
              : [];

            let nextPermissions: ConsolePermission[];
            if (nextRole === 'ADMIN') {
              nextPermissions = [...ALL_CONSOLE_PERMISSIONS];
            } else if (Array.isArray(body.permissions)) {
              nextPermissions = Array.from(
                new Set(
                  body.permissions
                    .map((p) => String(p))
                    .filter((p): p is ConsolePermission => allowedPermSet.has(p))
                )
              ).filter((p) => p !== 'accounts.manage' && p !== 'system.admin');
            } else {
              nextPermissions = existingPerms.filter(
                (p) => p !== 'accounts.manage' && p !== 'system.admin'
              );
            }

            const orgBuildings = await prisma.building.findMany({
              where: { orgId: actor.orgId, isActive: true },
              select: { id: true },
            });
            const validBuildingIds = new Set(
              orgBuildings.map((b) => b.id.toLowerCase())
            );

            let nextScopes: string[];
            if (nextRole === 'ADMIN') {
              nextScopes = ['*'];
            } else if (Array.isArray(body.buildingScopes)) {
              const normalized = normalizeBuildingScopes(body.buildingScopes).filter(
                (s) => s !== '*' && validBuildingIds.has(s)
              );
              if (normalized.length === 0) {
                return sendJson(res, 422, {
                  ok: false,
                  errorCode: 'BUILDING_SCOPE_REQUIRED',
                  message:
                    'Tài khoản Quản lý tòa nhà (MANAGER) bắt buộc phải có ít nhất 1 tòa nhà được gán.',
                });
              }
              nextScopes = normalized;
            } else {
              nextScopes = normalizeBuildingScopes(existing.buildingScopes).filter(
                (s) => s !== '*' && validBuildingIds.has(s)
              );
            }

            let nextPasswordHash: string | undefined;
            if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
              const pwCheck = validatePasswordPolicy(body.newPassword);
              if (!pwCheck.ok) {
                return sendJson(res, 422, {
                  ok: false,
                  errorCode: 'WEAK_PASSWORD',
                  message: `Mật khẩu mới không đạt chuẩn: ${pwCheck.reason}`,
                });
              }
              nextPasswordHash = await hashPassword(body.newPassword);
            }

            const prevScopes = normalizeBuildingScopes(existing.buildingScopes);
            const securitySensitiveChanged =
              nextRole !== existing.role ||
              nextIsActive !== existing.isActive ||
              Boolean(nextPasswordHash) ||
              body.invalidateSessions === true ||
              JSON.stringify([...nextPermissions].sort()) !==
                JSON.stringify([...existingPerms].sort()) ||
              JSON.stringify([...nextScopes].sort()) !==
                JSON.stringify([...prevScopes].sort());

            const updated = await prisma.consoleActor.update({
              where: { id: targetId },
              data: {
                displayName: nextDisplayName,
                role: nextRole,
                permissions: nextPermissions as Prisma.InputJsonValue,
                buildingScopes: nextScopes as Prisma.InputJsonValue,
                isActive: nextIsActive,
                ...(nextPasswordHash
                  ? {
                      passwordHash: nextPasswordHash,
                      passwordUpdatedAt: new Date(),
                    }
                  : {}),
                ...(securitySensitiveChanged
                  ? { sessionVersion: { increment: 1 } }
                  : {}),
              },
            });

            await writeLoginAudit(prisma, {
              actorId: updated.id,
              email: updated.email,
              outcome: securitySensitiveChanged
                ? `ADMIN_PERMISSIONS_UPDATED_SV${updated.sessionVersion}`
                : 'ADMIN_PROFILE_UPDATED',
              clientIp,
            });

            return sendJson(res, 200, {
              ok: true,
              sessionsInvalidated: securitySensitiveChanged,
              account: {
                id: updated.id,
                email: updated.email,
                displayName: updated.displayName,
                orgId: updated.orgId,
                role: updated.role,
                permissions: nextPermissions,
                buildingScopes: nextScopes,
                capabilities: resolveConsoleCapabilities(nextRole, nextPermissions),
                isActive: updated.isActive,
                hasPassword: Boolean(updated.passwordHash),
                sessionVersion: updated.sessionVersion,
                updatedAt: updated.updatedAt.toISOString(),
              },
            });
          } catch (err) {
            return sendJson(res, 400, {
              ok: false,
              errorCode: 'BAD_REQUEST',
              detail: err instanceof Error ? err.message : String(err),
              message: 'Không thể cập nhật phân quyền tài khoản.',
            });
          }
        }
      }

      // 0g. GET /api/v1/console/portfolio (PostgreSQL Buildings & Rooms strictly scoped to Actor's Building Scopes)
      if (req.method === 'GET' && pathname === '/api/v1/console/portfolio') {
        if (
          !actorHasPermission(actor, 'overview.read') &&
          !actorHasPermission(actor, 'rooms.read')
        ) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Tài khoản không có quyền xem dữ liệu danh mục tòa nhà.',
          });
        }

        const [org, allOrgBuildings, allOrgRooms] = await Promise.all([
          prisma.organization.findUnique({ where: { id: actor.orgId } }),
          prisma.building.findMany({
            where: { orgId: actor.orgId, isActive: true },
            orderBy: { displayOrder: 'asc' },
          }),
          prisma.publicRoomListing.findMany({
            where: { orgId: actor.orgId },
            orderBy: { displayOrder: 'asc' },
          }),
        ]);

        const scopedBuildings = allOrgBuildings.filter((b) =>
          isBuildingAllowedForActor(actor, b.id, b.code)
        );
        const scopedRooms = allOrgRooms.filter((r) =>
          isBuildingAllowedForActor(actor, r.buildingId, r.buildingCode)
        );

        return sendJson(res, 200, {
          ok: true,
          organization: org
            ? {
                id: org.id,
                slug: org.slug,
                name: org.name,
                addressSummary: org.addressSummary,
                catalogVersion: org.catalogVersion,
              }
            : null,
          actorScope: {
            role: actor.role,
            buildingScopes: actor.buildingScopes,
          },
          summary: {
            buildingsCount: scopedBuildings.length,
            roomsCount: scopedRooms.length,
            availableCount: scopedRooms.filter((r) => r.status === 'AVAILABLE')
              .length,
            comingSoonCount: scopedRooms.filter(
              (r) => r.status === 'COMING_SOON'
            ).length,
          },
          buildings: scopedBuildings.map((b) => ({
            id: b.id,
            code: b.code,
            name: b.name,
            address: b.streetAddress,
            ward: b.ward,
            province: b.province,
          })),
          rooms: scopedRooms.map((r) => ({
            id: r.id,
            slug: r.slug,
            roomCode: r.roomCode,
            shortTitle: r.shortTitle,
            roomType: r.roomType,
            buildingId: r.buildingId,
            buildingCode: r.buildingCode,
            buildingName: r.buildingName,
            floorNumber: r.floorNumber,
            area: r.area,
            price: r.price,
            status: r.status,
            isPublic: r.isPublic,
            availableFrom: r.availableFrom,
          })),
        });
      }

      // 0h. GET /api/v1/console/finance/summary (Protected Finance & Cashbook Ledger API)
      if (req.method === 'GET' && pathname === '/api/v1/console/finance/summary') {
        if (!actorHasPermission(actor, 'finance.read')) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message:
              'Tài khoản không được cấp quyền truy cập Sổ quỹ & Tài chính tổng hợp (finance.read).',
          });
        }

        const allOrgRooms = await prisma.publicRoomListing.findMany({
          where: { orgId: actor.orgId },
        });
        const scopedRooms = allOrgRooms.filter((r) =>
          isBuildingAllowedForActor(actor, r.buildingId, r.buildingCode)
        );
        const contractedMonthlyVnd = scopedRooms
          .filter((r) => r.status === 'OCCUPIED' || r.status === 'COMING_SOON')
          .reduce((sum, r) => sum + r.price, 0);

        return sendJson(res, 200, {
          ok: true,
          orgId: actor.orgId,
          scopedRoomsCount: scopedRooms.length,
          contractedMonthlyVnd,
        });
      }

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
        // Strictly using PostgreSQL-resolved `actor` (never trusting self-declared token claims!)
        const authz = authorizeRoomPublishAccess(actor, {
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

          if (
            body.slug !== undefined &&
            (typeof body.slug !== 'string' ||
              !/^[a-z0-9-]{4,100}$/.test(body.slug))
          ) {
            return sendJson(res, 422, {
              ok: false,
              errorCode: 'VALIDATION_ERROR',
              message: 'Slug phòng không hợp lệ.',
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
          const nextSlug =
            typeof body.slug === 'string' && body.slug.trim()
              ? body.slug.trim()
              : targetRoom.slug;

          const existingPrevSlugs = Array.isArray(targetRoom.previousSlugs)
            ? (targetRoom.previousSlugs as string[])
            : [];
          const nextPreviousSlugs =
            nextSlug !== targetRoom.slug
              ? Array.from(
                  new Set([...existingPrevSlugs, targetRoom.slug])
                ).filter((s) => s !== nextSlug)
              : existingPrevSlugs;

          const { updatedRow, auditLog, seoJob, updatedOrg } =
            await prisma.$transaction(async (tx) => {
              const updated = await tx.publicRoomListing.update({
                where: { id: targetRoom.id },
                data: {
                  slug: nextSlug,
                  previousSlugs: nextPreviousSlugs as Prisma.InputJsonValue,
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

              const orgRow = await tx.organization.update({
                where: { id: targetRoom.orgId },
                data: { catalogVersion: { increment: 1 } },
              });

              await tx.consoleRoom.updateMany({
                where: { publicListingId: targetRoom.id },
                data: {
                  listPriceVnd: BigInt(nextPrice),
                  availableFrom: nextAvailableFrom,
                  isPublishedToLanding: nextIsPublic,
                  publicSlug: nextSlug,
                },
              });

              const audit = await tx.roomAuditLog.create({
                data: {
                  actorUserId: actor.sub,
                  actorRole: actor.role,
                  orgId: actor.orgId,
                  buildingId: targetRoom.buildingId,
                  roomId: targetRoom.id,
                  roomSlug: updated.slug,
                  action: 'CONSOLE_ROOM_PUBLISH_UPDATE',
                  changedFields: Object.keys(body),
                  previousValues: {
                    slug: targetRoom.slug,
                    price: targetRoom.price,
                    status: targetRoom.status,
                    availableFrom: targetRoom.availableFrom,
                    isPublic: targetRoom.isPublic,
                  },
                  newValues: {
                    slug: nextSlug,
                    price: nextPrice,
                    status: nextStatus,
                    availableFrom: nextAvailableFrom,
                    isPublic: nextIsPublic,
                  },
                },
              });

              const job = await tx.seoSyncJob.create({
                data: {
                  orgId: targetRoom.orgId,
                  roomId: targetRoom.id,
                  roomSlug: updated.slug,
                  triggerAction: 'CONSOLE_ROOM_PUBLISH_UPDATE',
                  status: 'PENDING',
                  attempts: 0,
                  maxAttempts: 3,
                },
              });

              return {
                updatedRow: updated,
                auditLog: audit,
                seoJob: job,
                updatedOrg: orgRow,
              };
            });

          // Execute Outbox SEO Sync Job with automatic retry (isolated from DB transaction)
          const simulateFailFirst =
            req.headers['x-simulate-seo-sync-fail-once'] === '1';
          const syncJobResult = await executeSeoSyncJobWithRetry(
            seoJob.id,
            simulateFailFirst
          );

          return sendJson(res, 200, {
            ok: true,
            updatedAt: updatedRow.updatedAt.toISOString(),
            catalogVersion: updatedOrg.catalogVersion,
            auditLogId: auditLog.id,
            usedKeyId: actor.kid,
            seoPrerenderSynced: syncJobResult.status === 'SYNCED',
            seoSyncJob: syncJobResult,
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

      // 2. GET /api/v1/console/inquiries (Authenticated Lead List scoped by orgId AND buildingScopes)
      if (req.method === 'GET' && pathname === '/api/v1/console/inquiries') {
        if (
          !actorHasPermission(actor, 'leads.read') &&
          !actorHasPermission(actor, 'rooms.publish.write')
        ) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền truy cập danh sách yêu cầu liên hệ.',
          });
        }

        const rawInquiries = await prisma.leadInquiry.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        let inquiries = rawInquiries;
        if (actor.role !== 'ADMIN' && !actor.buildingScopes.includes('*')) {
          const allowedRooms = await prisma.publicRoomListing.findMany({
            where: { orgId: actor.orgId },
            select: { id: true, roomCode: true, buildingId: true, buildingCode: true },
          });
          const allowedRoomIds = new Set(
            allowedRooms
              .filter((r) => isBuildingAllowedForActor(actor, r.buildingId, r.buildingCode))
              .map((r) => r.id)
          );
          const allowedRoomCodes = new Set(
            allowedRooms
              .filter((r) => isBuildingAllowedForActor(actor, r.buildingId, r.buildingCode))
              .map((r) => r.roomCode)
          );
          inquiries = rawInquiries.filter(
            (inq) =>
              (inq.roomId && allowedRoomIds.has(inq.roomId)) ||
              (inq.roomCode && allowedRoomCodes.has(inq.roomCode))
          );
        }

        return sendJson(res, 200, {
          ok: true,
          count: inquiries.length,
          inquiries,
        });
      }

      // 3. GET /api/v1/console/audit-logs (Authenticated Audit Log scoped by orgId & buildingScopes)
      if (req.method === 'GET' && pathname === '/api/v1/console/audit-logs') {
        if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền xem nhật ký audit.',
          });
        }

        const rawLogs = await prisma.roomAuditLog.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        const logs =
          actor.role === 'ADMIN'
            ? rawLogs
            : rawLogs.filter((l) =>
                isBuildingAllowedForActor(actor, l.buildingId, null)
              );

        return sendJson(res, 200, {
          ok: true,
          count: logs.length,
          logs,
        });
      }

      // 4. GET /api/v1/console/seo-sync-jobs (Outbox Queue Inspection - ADMIN Only)
      if (
        req.method === 'GET' &&
        pathname === '/api/v1/console/seo-sync-jobs'
      ) {
        if (actor.role !== 'ADMIN') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Chỉ quản trị viên hệ thống (ADMIN) mới có quyền kiểm tra hàng đợi SEO Outbox.',
          });
        }

        const jobs = await prisma.seoSyncJob.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        return sendJson(res, 200, {
          ok: true,
          count: jobs.length,
          jobs,
        });
      }

      // 5. GET /api/v1/console/security/context (Authenticated Security Context Inspection - ADMIN Only)
      if (req.method === 'GET' && pathname === '/api/v1/console/security/context') {
        if (actor.role !== 'ADMIN') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Chỉ quản trị viên hệ thống (ADMIN) mới có quyền kiểm tra security context.',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          clientIp,
          trustProxyEnabled: isTrustProxyEnabled(),
          trustedProxiesConfigured: Array.from(getTrustedProxies()),
          callerActorId: actor.id,
          callerRole: actor.role,
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
      // Mandatory boot-time security assertion: fails fast if secret is missing or insecure
      assertSecurityConfiguration();
      await ensurePostgreSqlSeeded();
    },
    configureServer(server) {
      assertSecurityConfiguration();
      server.middlewares.use(createApiAndDynamicSeoMiddleware());
    },
    configurePreviewServer(server) {
      assertSecurityConfiguration();
      server.middlewares.use(createApiAndDynamicSeoMiddleware());
    },
  };
}
