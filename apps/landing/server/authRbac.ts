import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { loadAdhomeEnv } from './envLoader.js';

loadAdhomeEnv();

export type ConsoleRole = 'ADMIN' | 'MANAGER' | 'VIEWER';

export type ConsolePermission =
  | 'overview.read'
  | 'buildings.manage'
  | 'rooms.read'
  | 'rooms.manage'
  | 'rooms.publish.write'
  | 'tenants.manage'
  | 'deposits.manage'
  | 'deposits.refund'
  | 'contracts.manage'
  | 'settlements.manage'
  | 'invoices.manage'
  | 'payments.manage'
  | 'finance.read'
  | 'reports.read'
  | 'settings.manage'
  | 'accounts.manage'
  | 'leads.read'
  | 'system.admin';

export const ALL_CONSOLE_PERMISSIONS: readonly ConsolePermission[] = [
  'overview.read',
  'buildings.manage',
  'rooms.read',
  'rooms.manage',
  'rooms.publish.write',
  'tenants.manage',
  'deposits.manage',
  'deposits.refund',
  'contracts.manage',
  'settlements.manage',
  'invoices.manage',
  'payments.manage',
  'finance.read',
  'reports.read',
  'settings.manage',
  'accounts.manage',
  'leads.read',
  'system.admin',
] as const;

export const DEFAULT_MANAGER_PERMISSIONS: readonly ConsolePermission[] = [
  'overview.read',
  'rooms.read',
  'rooms.manage',
  'rooms.publish.write',
  'tenants.manage',
  'deposits.manage',
  'contracts.manage',
  'settlements.manage',
  'invoices.manage',
  'payments.manage',
  'reports.read',
  'leads.read',
] as const;

export interface ConsoleCapabilities {
  canViewOverview: boolean;
  canManageBuildings: boolean;
  canManageRooms: boolean;
  canManageTenants: boolean;
  canManageContracts: boolean;
  canManageDeposits: boolean;
  canRefundDeposits: boolean;
  canManageSettlements: boolean;
  canManageInvoices: boolean;
  canManagePayments: boolean;
  canAccessFinance: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canManageRoles: boolean;
}

export interface ConsoleTokenClaims {
  jti?: string;
  sub: string;
  email: string;
  orgId?: string;
  role?: ConsoleRole;
  permissions?: ConsolePermission[];
  buildingScopes?: string[];
  sessionVersion?: number;
  iat: number;
  exp: number;
}

export interface AuthoritativeConsoleActor {
  id: string;
  sub: string;
  email: string;
  displayName: string | null;
  orgId: string;
  role: ConsoleRole;
  permissions: ConsolePermission[];
  buildingScopes: string[];
  capabilities: ConsoleCapabilities;
  sessionVersion: number;
  jti: string;
  kid: string;
}

export const CONSOLE_SESSION_COOKIE_NAME = 'adhome_console_session';
export const CONSOLE_CSRF_HEADER_VALUE = 'AdHome-Console';

export const ACTIVE_KEY_ID = 'k4-2026-10';
export const PREVIOUS_KEY_ID = 'k3-2026-10';

export function normalizeSingleBuildingScope(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed === '*') return '*';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bld-')) return lower;
  if (/^lk\d{2}-\d{2}$/i.test(trimmed)) return `bld-${lower}`;
  return lower;
}

export function normalizeBuildingScopes(rawScopes: unknown): string[] {
  if (!Array.isArray(rawScopes)) return [];
  const normalized = rawScopes
    .map((item) => normalizeSingleBuildingScope(String(item ?? '')))
    .filter(Boolean);
  if (normalized.includes('*')) return ['*'];
  return Array.from(new Set(normalized));
}

export function resolveConsoleCapabilities(
  role: ConsoleRole,
  permissions: readonly string[]
): ConsoleCapabilities {
  if (role === 'ADMIN') {
    return {
      canViewOverview: true,
      canManageBuildings: true,
      canManageRooms: true,
      canManageTenants: true,
      canManageContracts: true,
      canManageDeposits: true,
      canRefundDeposits: true,
      canManageSettlements: true,
      canManageInvoices: true,
      canManagePayments: true,
      canAccessFinance: true,
      canViewReports: true,
      canManageSettings: true,
      canManageRoles: true,
    };
  }

  const perms = new Set(permissions);
  return {
    canViewOverview: perms.has('overview.read') || perms.has('rooms.read'),
    canManageBuildings: perms.has('buildings.manage'),
    canManageRooms: perms.has('rooms.manage') || perms.has('rooms.publish.write'),
    canManageTenants: perms.has('tenants.manage'),
    canManageContracts: perms.has('contracts.manage'),
    canManageDeposits: perms.has('deposits.manage'),
    canRefundDeposits: perms.has('deposits.refund'),
    canManageSettlements: perms.has('settlements.manage'),
    canManageInvoices: perms.has('invoices.manage'),
    canManagePayments: perms.has('payments.manage'),
    canAccessFinance: perms.has('finance.read'),
    canViewReports: perms.has('reports.read'),
    canManageSettings: perms.has('settings.manage'),
    canManageRoles: false, // Strictly ADMIN-only
  };
}

export function isBuildingAllowedForActor(
  actor: Pick<AuthoritativeConsoleActor, 'role' | 'buildingScopes'>,
  buildingId?: string | null,
  buildingCode?: string | null
): boolean {
  if (actor.role === 'ADMIN') return true;
  const scopes = normalizeBuildingScopes(actor.buildingScopes);
  if (scopes.length === 0) return false;
  if (scopes.includes('*')) return true;

  const candidateId = buildingId ? normalizeSingleBuildingScope(buildingId) : '';
  const candidateCode = buildingCode ? normalizeSingleBuildingScope(buildingCode) : '';

  if (candidateId && scopes.includes(candidateId)) return true;
  if (candidateCode && scopes.includes(candidateCode)) return true;
  return false;
}

export function actorHasPermission(
  actor: Pick<AuthoritativeConsoleActor, 'role' | 'permissions'>,
  permission: ConsolePermission
): boolean {
  if (actor.role === 'ADMIN') return true;
  return Array.isArray(actor.permissions) && actor.permissions.includes(permission);
}

export function getConsoleSecretKeyring(): Record<string, string> {
  loadAdhomeEnv();

  const activeSecret = process.env.ADHOME_CONSOLE_JWT_SECRET;
  const prevSecret = process.env.ADHOME_CONSOLE_JWT_SECRET_PREV;

  if (!activeSecret || activeSecret.trim().length < 32) {
    throw new Error(
      'FATAL SECURITY CONFIGURATION: ADHOME_CONSOLE_JWT_SECRET environment variable is missing or shorter than 32 characters. Server refuses to boot with insecure credentials. Hardcoded fallback secrets are strictly forbidden.'
    );
  }

  const keyring: Record<string, string> = {
    [ACTIVE_KEY_ID]: activeSecret.trim(),
  };

  if (prevSecret && prevSecret.trim().length >= 32) {
    keyring[PREVIOUS_KEY_ID] = prevSecret.trim();
  }

  return keyring;
}

/**
 * Explicit Boot-Time Security Assertion
 * Fails fast before the server starts accepting requests or boots Vite.
 */
export function assertSecurityConfiguration(): {
  activeKeyId: string;
  hasPreviousKey: boolean;
  initializedAt: string;
} {
  const keyring = getConsoleSecretKeyring();
  if (!keyring[ACTIVE_KEY_ID] || keyring[ACTIVE_KEY_ID].length < 32) {
    throw new Error(
      `FATAL SECURITY CONFIGURATION: Active key ID '${ACTIVE_KEY_ID}' is missing or shorter than 32 characters.`
    );
  }

  return {
    activeKeyId: ACTIVE_KEY_ID,
    hasPreviousKey: Boolean(keyring[PREVIOUS_KEY_ID]),
    initializedAt: new Date().toISOString(),
  };
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export function signConsoleToken(
  payload: Omit<ConsoleTokenClaims, 'iat' | 'exp'> & {
    iat?: number;
    exp?: number;
  },
  secretOrOptions?:
    | string
    | {
        secret?: string;
        kid?: string;
      }
): string {
  const keyring = getConsoleSecretKeyring();
  const nowSec = Math.floor(Date.now() / 1000);
  const kid =
    typeof secretOrOptions === 'object' && secretOrOptions?.kid
      ? secretOrOptions.kid
      : ACTIVE_KEY_ID;
  const secret =
    typeof secretOrOptions === 'string'
      ? secretOrOptions
      : secretOrOptions?.secret ||
        keyring[kid] ||
        keyring[ACTIVE_KEY_ID];

  if (!secret) {
    throw new Error(`FATAL: No signing secret found for key ID '${kid}'.`);
  }

  const fullClaims: ConsoleTokenClaims = {
    jti: payload.jti || `jti-${crypto.randomUUID()}`,
    ...payload,
    sessionVersion: payload.sessionVersion ?? 1,
    iat: payload.iat ?? nowSec,
    exp: payload.exp ?? nowSec + 3600,
  };
  const headerB64 = base64UrlEncode(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid })
  );
  const payloadB64 = base64UrlEncode(JSON.stringify(fullClaims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );
  return `${signingInput}.${signature}`;
}

export function verifyConsoleToken(
  token: string,
  explicitSecret?: string
):
  | { ok: true; claims: ConsoleTokenClaims; kid: string }
  | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'MALFORMED_TOKEN' };
  }
  const [headerB64, payloadB64, sigB64] = parts;
  let headerObj: { alg?: string; typ?: string; kid?: string } = {};
  try {
    headerObj = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    return { ok: false, reason: 'MALFORMED_HEADER' };
  }

  const keyring = getConsoleSecretKeyring();
  const signingInput = `${headerB64}.${payloadB64}`;
  const candidateSecrets: Array<{ kid: string; secret: string }> = explicitSecret
    ? [{ kid: headerObj.kid || 'explicit', secret: explicitSecret }]
    : headerObj.kid && keyring[headerObj.kid]
    ? [{ kid: headerObj.kid, secret: keyring[headerObj.kid] }]
    : Object.entries(keyring).map(([k, s]) => ({
        kid: k,
        secret: s,
      }));

  let matchedKid: string | null = null;
  const actualBuf = Buffer.from(sigB64, 'utf-8');

  for (const candidate of candidateSecrets) {
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', candidate.secret)
        .update(signingInput)
        .digest()
    );
    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    if (
      actualBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(actualBuf, expectedBuf)
    ) {
      matchedKid = candidate.kid;
      break;
    }
  }

  if (!matchedKid) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const claims = JSON.parse(
      base64UrlDecode(payloadB64)
    ) as ConsoleTokenClaims;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp < nowSec) {
      return { ok: false, reason: 'TOKEN_EXPIRED' };
    }
    if (!claims.sub) {
      return { ok: false, reason: 'MISSING_CLAIMS' };
    }
    return { ok: true, claims, kid: matchedKid };
  } catch {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }
}

/**
 * Verifies token signature + expiration, checks token revocation (`RevokedToken`)
 * and session version (`ConsoleActor.sessionVersion`), and resolves `orgId`,
 * `role`, `permissions`, `buildingScopes`, and `capabilities` strictly from
 * PostgreSQL so client-supplied self-declared claims in the token payload are
 * NEVER trusted.
 */
export async function verifyAndResolveConsoleActor(
  token: string,
  prisma: PrismaClient
): Promise<
  | { ok: true; actor: AuthoritativeConsoleActor }
  | { ok: false; status: 401 | 403; reason: string; message: string }
> {
  const verified = verifyConsoleToken(token);
  if (!verified.ok) {
    return {
      ok: false,
      status: 401,
      reason: verified.reason,
      message: 'Token xác thực không hợp lệ hoặc đã hết hạn.',
    };
  }

  const { claims, kid } = verified;
  const jti = claims.jti || `legacy-${claims.sub}-${claims.iat}`;

  // 1. Check JTI revocation table in PostgreSQL
  const revoked = await prisma.revokedToken.findUnique({
    where: { jti },
  });
  if (revoked) {
    return {
      ok: false,
      status: 401,
      reason: 'TOKEN_REVOKED',
      message: 'Token đã bị thu hồi (Revoked). Vui lòng đăng nhập lại.',
    };
  }

  // 2. Load authoritative actor record from PostgreSQL ConsoleActor table
  const dbActor = await prisma.consoleActor.findUnique({
    where: { id: claims.sub },
  });

  if (!dbActor || !dbActor.isActive) {
    return {
      ok: false,
      status: 401,
      reason: 'ACTOR_INACTIVE_OR_NOT_FOUND',
      message:
        'Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa trên hệ thống.',
    };
  }

  // 3. Verify sessionVersion for instant all-device session invalidation
  const tokenSessionVersion = claims.sessionVersion ?? 1;
  if (tokenSessionVersion < dbActor.sessionVersion) {
    return {
      ok: false,
      status: 401,
      reason: 'SESSION_INVALIDATED',
      message:
        'Phiên đăng nhập đã hết hiệu lực do thay đổi quyền hoặc thu hồi phiên.',
    };
  }

  const dbRole = dbActor.role as ConsoleRole;
  const dbPermissions = Array.isArray(dbActor.permissions)
    ? (dbActor.permissions as ConsolePermission[])
    : [];
  const dbBuildingScopes =
    dbRole === 'ADMIN'
      ? ['*']
      : normalizeBuildingScopes(dbActor.buildingScopes);
  const capabilities = resolveConsoleCapabilities(dbRole, dbPermissions);

  return {
    ok: true,
    actor: {
      id: dbActor.id,
      sub: dbActor.id,
      email: dbActor.email,
      displayName: dbActor.displayName ?? null,
      orgId: dbActor.orgId,
      role: dbRole,
      permissions: dbPermissions,
      buildingScopes: dbBuildingScopes,
      capabilities,
      sessionVersion: dbActor.sessionVersion,
      jti,
      kid,
    },
  };
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

export function extractConsoleCredentials(req: IncomingMessage):
  | { token: string; source: 'bearer' | 'cookie' }
  | { token: null; csrfRejected?: boolean } {
  const bearer = extractBearerToken(req);
  if (bearer) {
    return { token: bearer, source: 'bearer' };
  }

  const cookies = parseCookieHeader(req.headers['cookie']);
  const cookieToken = cookies[CONSOLE_SESSION_COOKIE_NAME];
  if (!cookieToken) {
    return { token: null };
  }

  const method = (req.method || 'GET').toUpperCase();
  const isMutation =
    method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (isMutation) {
    const csrfHeader = req.headers['x-requested-with'];
    if (csrfHeader !== CONSOLE_CSRF_HEADER_VALUE) {
      return { token: null, csrfRejected: true };
    }
  }

  return { token: cookieToken, source: 'cookie' };
}

export function buildConsoleSessionCookieHeader(
  token: string,
  maxAgeSec: number,
  isHttps: boolean
): string {
  const parts = [
    `${CONSOLE_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearConsoleSessionCookieHeader(isHttps: boolean): string {
  const parts = [
    `${CONSOLE_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function authorizeRoomPublishAccess(
  actor: Pick<
    AuthoritativeConsoleActor,
    'role' | 'permissions' | 'orgId' | 'buildingScopes'
  >,
  targetRoom: { orgId: string; buildingId: string; buildingCode: string }
):
  | { allowed: true }
  | {
      allowed: false;
      status: 403;
      errorCode:
        | 'INSUFFICIENT_PERMISSION'
        | 'CROSS_TENANT_FORBIDDEN'
        | 'BUILDING_SCOPE_FORBIDDEN';
      message: string;
    } {
  // 1. Role & Permission check (strictly from DB-resolved actor)
  const hasRole = actor.role === 'ADMIN' || actor.role === 'MANAGER';
  const hasPermission =
    actor.role === 'ADMIN' ||
    (Array.isArray(actor.permissions) &&
      (actor.permissions.includes('rooms.publish.write') ||
        actor.permissions.includes('rooms.manage')));

  if (!hasRole || !hasPermission) {
    return {
      allowed: false,
      status: 403,
      errorCode: 'INSUFFICIENT_PERMISSION',
      message:
        'Tài khoản không có quyền cập nhật dữ liệu phòng công khai (yêu cầu quyền rooms.publish.write được cấp trên hệ thống).',
    };
  }

  // 2. Tenant / Organization Isolation (Multi-tenant boundary)
  if (actor.orgId !== targetRoom.orgId) {
    return {
      allowed: false,
      status: 403,
      errorCode: 'CROSS_TENANT_FORBIDDEN',
      message:
        'Truy cập bị từ chối: Không được phép chỉnh sửa phòng thuộc tổ chức (Organization/Tenant) khác.',
    };
  }

  // 3. Building Scope Isolation for MANAGER role
  if (actor.role === 'MANAGER') {
    const allowed = isBuildingAllowedForActor(
      actor,
      targetRoom.buildingId,
      targetRoom.buildingCode
    );
    if (!allowed) {
      return {
        allowed: false,
        status: 403,
        errorCode: 'BUILDING_SCOPE_FORBIDDEN',
        message: `Quản lý tòa nhà không có quyền cập nhật phòng thuộc tòa ${targetRoom.buildingCode} (${targetRoom.buildingId}).`,
      };
    }
  }

  return { allowed: true };
}

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitWindow>();

export function checkRateLimit(
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || now >= current.resetAt) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function resetRateLimitBuckets(): void {
  rateLimitBuckets.clear();
}
