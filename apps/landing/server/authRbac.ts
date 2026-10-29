import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type ConsoleRole = 'ADMIN' | 'MANAGER' | 'VIEWER';

export type ConsolePermission =
  | 'rooms.publish.write'
  | 'rooms.read'
  | 'leads.read';

export interface ConsoleTokenClaims {
  sub: string;
  email: string;
  orgId: string;
  role: ConsoleRole;
  permissions: ConsolePermission[];
  buildingScopes: string[];
  iat: number;
  exp: number;
}

const DEFAULT_CONSOLE_SECRET =
  process.env.ADHOME_CONSOLE_JWT_SECRET ||
  'adhome-v2-console-hmac-secret-daklak-2026';

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
  secret: string = DEFAULT_CONSOLE_SECRET
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullClaims: ConsoleTokenClaims = {
    ...payload,
    iat: payload.iat ?? nowSec,
    exp: payload.exp ?? nowSec + 3600,
  };
  const headerB64 = base64UrlEncode(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
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
  secret: string = DEFAULT_CONSOLE_SECRET
): { ok: true; claims: ConsoleTokenClaims } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'MALFORMED_TOKEN' };
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );

  const actualBuf = Buffer.from(sigB64, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (
    actualBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(actualBuf, expectedBuf)
  ) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const claims = JSON.parse(base64UrlDecode(payloadB64)) as ConsoleTokenClaims;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp < nowSec) {
      return { ok: false, reason: 'TOKEN_EXPIRED' };
    }
    if (!claims.sub || !claims.orgId || !claims.role) {
      return { ok: false, reason: 'MISSING_CLAIMS' };
    }
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }
}

export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

export function authorizeRoomPublishAccess(
  claims: ConsoleTokenClaims,
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
  // 1. Role & Permission check
  const hasRole = claims.role === 'ADMIN' || claims.role === 'MANAGER';
  const hasPermission =
    Array.isArray(claims.permissions) &&
    claims.permissions.includes('rooms.publish.write');

  if (!hasRole || !hasPermission) {
    return {
      allowed: false,
      status: 403,
      errorCode: 'INSUFFICIENT_PERMISSION',
      message:
        'Tài khoản không có quyền cập nhật dữ liệu phòng công khai (yêu cầu quyền rooms.publish.write).',
    };
  }

  // 2. Tenant / Organization Isolation (Multi-tenant boundary)
  if (claims.orgId !== targetRoom.orgId) {
    return {
      allowed: false,
      status: 403,
      errorCode: 'CROSS_TENANT_FORBIDDEN',
      message:
        'Truy cập bị từ chối: Không được phép chỉnh sửa phòng thuộc tổ chức (Organization/Tenant) khác.',
    };
  }

  // 3. Building Scope Isolation for MANAGER role
  if (claims.role === 'MANAGER') {
    const scopes = Array.isArray(claims.buildingScopes)
      ? claims.buildingScopes
      : [];
    const hasBuildingScope =
      scopes.includes('*') ||
      scopes.includes(targetRoom.buildingId) ||
      scopes.includes(targetRoom.buildingCode);

    if (!hasBuildingScope) {
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
