import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Plugin } from 'vite';
import { ROOMS_PUBLIC_SEED } from '../src/data/roomsSeed';
import type { RoomListing } from '../src/types/room';
import { loadAdhomeEnv } from './envLoader.js';
import {
  assertSecurityConfiguration,
  authorizeRoomPublishAccess,
  checkRateLimit,
  extractBearerToken,
  verifyAndResolveConsoleActor,
} from './authRbac';
import {
  renderDynamicRobotsTxt,
  renderDynamicSeoRouteFromDb,
  renderDynamicSitemapXml,
  syncPrerenderedSeoFiles,
} from './seoPrerenderer';

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
  interactionTarget?: string;
  userAgent?: string;
  recordedAt: string;
}

const rumSamplesBuffer: RumSample[] = [];

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

    // 2. Seed Authoritative Console Actors in PostgreSQL (Only in non-production development environments)
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      // Production Safeguard: Deactivate any sample development actors if present in DB
      await prisma.consoleActor.updateMany({
        where: {
          id: {
            in: [
              'usr-admin-01',
              'usr-mgr-lk01',
              'usr-viewer-01',
              'usr-other-org-01',
            ],
          },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    } else if (process.env.ALLOW_SAMPLE_ACTORS !== 'false') {
      const actorsToSeed = [
        {
          id: 'usr-admin-01',
          email: 'admin@adhome.vn',
          orgId: DEFAULT_ORG_ID,
          role: 'ADMIN',
          permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
          buildingScopes: ['*'],
          sessionVersion: 1,
          isActive: true,
        },
        {
          id: 'usr-mgr-lk01',
          email: 'manager.lk01@adhome.vn',
          orgId: DEFAULT_ORG_ID,
          role: 'MANAGER',
          permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
          buildingScopes: ['BLD-LK01-31', 'BLD-LK01-32'],
          sessionVersion: 1,
          isActive: true,
        },
        {
          id: 'usr-viewer-01',
          email: 'viewer@adhome.vn',
          orgId: DEFAULT_ORG_ID,
          role: 'VIEWER',
          permissions: ['rooms.read'],
          buildingScopes: ['*'],
          sessionVersion: 1,
          isActive: true,
        },
        {
          id: 'usr-other-org-01',
          email: 'admin@other-tenant.vn',
          orgId: EMPTY_SAAS_ORG_ID,
          role: 'ADMIN',
          permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
          buildingScopes: ['*'],
          sessionVersion: 1,
          isActive: true,
        },
      ];

      for (const actor of actorsToSeed) {
        await prisma.consoleActor.upsert({
          where: { id: actor.id },
          update: {
            orgId: actor.orgId,
            role: actor.role,
            permissions: actor.permissions as Prisma.InputJsonValue,
            buildingScopes: actor.buildingScopes as Prisma.InputJsonValue,
            isActive: actor.isActive,
          },
          create: {
            id: actor.id,
            email: actor.email,
            orgId: actor.orgId,
            role: actor.role,
            permissions: actor.permissions as Prisma.InputJsonValue,
            buildingScopes: actor.buildingScopes as Prisma.InputJsonValue,
            sessionVersion: actor.sessionVersion,
            isActive: actor.isActive,
          },
        });
      }
    }

    const roomCount = await prisma.publicRoomListing.count();
    if (roomCount > 0) return;

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
      const hasTenant = r.status === 'COMING_SOON' || r.status === 'OCCUPIED';
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
        status: { in: ['AVAILABLE', 'COMING_SOON'] },
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

        const sample: RumSample = {
          id: `rum-${crypto.randomUUID()}`,
          metricName,
          value: Math.round(value * 100) / 100,
          rating:
            body.rating === 'poor' || body.rating === 'needs-improvement'
              ? body.rating
              : 'good',
          route: String(body.route || '/').slice(0, 120),
          interactionTarget: body.interactionTarget
            ? String(body.interactionTarget).slice(0, 120)
            : undefined,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 160),
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

    if (pathname === '/api/v1/public/rum/summary' && req.method === 'GET') {
      const grouped: Record<
        string,
        {
          count: number;
          p50: number;
          p75: number;
          p95: number;
          max: number;
        }
      > = {};

      for (const name of ['INP', 'LCP', 'CLS', 'LONG_TASK', 'TBT']) {
        const vals = rumSamplesBuffer
          .filter((s) => s.metricName === name)
          .map((s) => s.value)
          .sort((a, b) => a - b);
        grouped[name] = {
          count: vals.length,
          p50: percentile(vals, 50),
          p75: percentile(vals, 75),
          p95: percentile(vals, 95),
          max: vals.length > 0 ? vals[vals.length - 1] : 0,
        };
      }

      return sendJson(res, 200, {
        ok: true,
        totalSamples: rumSamplesBuffer.length,
        metrics: grouped,
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
          status: { in: ['AVAILABLE', 'COMING_SOON'] },
        },
        select: PUBLIC_ROOM_SELECT,
      });

      if (!row) {
        // Check if slug was renamed (in previousSlugs) so API consumers also know canonical slug
        const renamedRow = await prisma.publicRoomListing.findFirst({
          where: {
            isPublic: true,
            status: { in: ['AVAILABLE', 'COMING_SOON'] },
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
    // A2. SECURITY & CLIENT CONTEXT INSPECTION (/api/v1/public/security/context)
    // =========================================================================
    if (pathname === '/api/v1/public/security/context' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        clientIp: getClientIp(req),
        trustProxyEnabled: isTrustProxyEnabled(),
        trustedProxiesConfigured: Array.from(getTrustedProxies()),
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
    //    Requires signed Bearer Token + Revocation/Session Check +
    //    PostgreSQL-authoritative RBAC Permission + Tenant & Building Scope
    // =========================================================================
    if (pathname.startsWith('/api/v1/console/')) {
      const clientIp = getClientIp(req);
      const rl = checkRateLimit(`console-api:${clientIp}`, 60, 60_000);
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

      const resolved = await verifyAndResolveConsoleActor(rawToken, prisma);
      if (!resolved.ok) {
        return sendJson(res, resolved.status, {
          ok: false,
          errorCode: 'UNAUTHORIZED',
          reason: resolved.reason,
          message: resolved.message,
        });
      }

      const { actor } = resolved;

      // 0. POST /api/v1/console/auth/revoke (Token Revocation & Session Invalidation)
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

      // 2. GET /api/v1/console/inquiries (Authenticated Lead List scoped by orgId)
      if (req.method === 'GET' && pathname === '/api/v1/console/inquiries') {
        if (
          !actor.permissions.includes('leads.read') &&
          !actor.permissions.includes('rooms.publish.write')
        ) {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền truy cập danh sách yêu cầu liên hệ.',
          });
        }

        const inquiries = await prisma.leadInquiry.findMany({
          where: { orgId: actor.orgId },
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
        if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
          return sendJson(res, 403, {
            ok: false,
            errorCode: 'INSUFFICIENT_PERMISSION',
            message: 'Không có quyền xem nhật ký audit.',
          });
        }

        const logs = await prisma.roomAuditLog.findMany({
          where: { orgId: actor.orgId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        return sendJson(res, 200, {
          ok: true,
          count: logs.length,
          logs,
        });
      }

      // 4. GET /api/v1/console/seo-sync-jobs (Outbox Queue Inspection)
      if (
        req.method === 'GET' &&
        pathname === '/api/v1/console/seo-sync-jobs'
      ) {
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
