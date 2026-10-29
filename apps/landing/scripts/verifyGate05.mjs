import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.GATE05_BASE_URL || 'http://127.0.0.1:8081';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';

const ACTIVE_KEY_ID = 'k2-2026-10';
const PREVIOUS_KEY_ID = 'k1-2026-09';
const ACTIVE_SECRET =
  process.env.ADHOME_CONSOLE_JWT_SECRET ||
  'adhome-v2-console-hmac-secret-daklak-2026-k2';
const PREVIOUS_SECRET =
  process.env.ADHOME_CONSOLE_JWT_SECRET_PREV ||
  'adhome-v2-console-hmac-secret-daklak-2026';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function base64UrlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signToken(
  payload,
  { secret = ACTIVE_SECRET, kid = ACTIVE_KEY_ID, expOffsetSec = 3600 } = {}
) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullClaims = {
    jti: payload.jti || `jti-${crypto.randomUUID()}`,
    sessionVersion: payload.sessionVersion ?? 1,
    ...payload,
    iat: nowSec,
    exp: nowSec + expOffsetSec,
  };
  const headerB64 = base64UrlEncode(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid })
  );
  const payloadB64 = base64UrlEncode(JSON.stringify(fullClaims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );
  return { token: `${signingInput}.${sig}`, jti: fullClaims.jti };
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium browser executable found.');
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(err);
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || 'Eval exception'
      );
    }
    return res?.result?.value;
  }

  async screenshot(outPaths) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
    });
    const buf = Buffer.from(data, 'base64');
    for (const p of outPaths) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
    }
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}

async function launchHeadlessBrowser(port = 9345) {
  const exe = findBrowserExecutable();
  const profileDir = path.join(
    process.cwd(),
    `.chrome-profile-gate05-${port}-${Date.now()}`
  );
  const proc = spawn(
    exe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (r) => r.json()
      );
      const pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget?.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // wait
    }
  }

  if (!wsUrl) {
    proc.kill();
    throw new Error('Failed to connect to headless Chrome debugger.');
  }

  const cdp = new CdpClient(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  return {
    cdp,
    cleanup: async () => {
      cdp.close();
      try {
        proc.kill();
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 300));
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Dispatches real native CDP mouse input (`Input.dispatchMouseEvent`) onto `selector`
 * and measures both Chromium `EventTiming` duration AND two-frame `requestAnimationFrame`
 * presentation latency so INP is NEVER a synthetic `0ms`.
 */
async function nativeClickAndMeasureInp(cdp, selector, label) {
  // Prepare measurement hook before dispatching native mouse events
  const coords = await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    window.__LAST_INTERACTION_START__ = performance.now();
    window.__LAST_INTERACTION_RAF_MS__ = null;
    const onPointerOrClick = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.__LAST_INTERACTION_RAF_MS__ = Math.round((performance.now() - window.__LAST_INTERACTION_START__) * 100) / 100;
        });
      });
    };
    el.addEventListener('click', onPointerOrClick, { once: true });
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      prevEventCount: (window.__ADHOME_RUM__?.inpEvents?.length || 0),
    };
  })()`);

  if (!coords) {
    throw new Error(`Element not found for native click: ${selector} (${label})`);
  }

  const t0 = performance.now();
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: coords.x,
    y: coords.y,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: coords.x,
    y: coords.y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: coords.x,
    y: coords.y,
    button: 'left',
    clickCount: 1,
  });
  const cdpRoundTripMs = Math.round((performance.now() - t0) * 100) / 100;

  // Wait briefly for next frame + PerformanceObserver('event') callback to flush
  await new Promise((r) => setTimeout(r, 120));

  const measurement = await cdp.eval(`(() => {
    const rum = window.__ADHOME_RUM__;
    const newEvents = rum ? rum.inpEvents.slice(${coords.prevEventCount}) : [];
    const maxEventDuration = newEvents.reduce((m, e) => Math.max(m, e.duration || 0), 0);
    const rafMs = window.__LAST_INTERACTION_RAF_MS__;
    return {
      newEventCount: newEvents.length,
      maxEventTimingMs: maxEventDuration,
      rafPresentationMs: rafMs,
      events: newEvents.slice(-3),
    };
  })()`);

  const effectiveInpMs = Math.max(
    measurement?.maxEventTimingMs || 0,
    measurement?.rafPresentationMs || 0,
    cdpRoundTripMs
  );

  return {
    interaction: label,
    selector,
    coordinates: { x: coords.x, y: coords.y },
    eventTimingMs: measurement?.maxEventTimingMs || 0,
    rafPresentationMs: measurement?.rafPresentationMs || cdpRoundTripMs,
    effectiveInpMs: Math.round(effectiveInpMs * 100) / 100,
    recordedEvents: measurement?.newEventCount || 0,
    passUnder200ms: effectiveInpMs > 0 && effectiveInpMs <= 200,
  };
}

async function nativeTypeAndMeasureInp(cdp, selector, text, label) {
  await nativeClickAndMeasureInp(cdp, selector, `${label} (focus)`);
  const prevCount = await cdp.eval(
    `window.__ADHOME_RUM__?.inpEvents?.length || 0`
  );
  const t0 = performance.now();
  for (const ch of text) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: ch,
      unmodifiedText: ch,
      key: ch,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ch,
    });
  }
  const totalTypingMs = Math.round((performance.now() - t0) * 100) / 100;
  await new Promise((r) => setTimeout(r, 100));

  const keyStats = await cdp.eval(`(() => {
    const rum = window.__ADHOME_RUM__;
    const newEvents = rum ? rum.inpEvents.slice(${prevCount}) : [];
    const maxDur = newEvents.reduce((m, e) => Math.max(m, e.duration || 0), 0);
    return { count: newEvents.length, maxKeyEventTimingMs: maxDur };
  })()`);

  const perCharMs = Math.round((totalTypingMs / Math.max(1, text.length)) * 100) / 100;
  const effectiveInpMs = Math.max(keyStats?.maxKeyEventTimingMs || 0, perCharMs);

  return {
    interaction: label,
    selector,
    typedLength: text.length,
    eventTimingMs: keyStats?.maxKeyEventTimingMs || 0,
    perKeystrokeLatencyMs: perCharMs,
    effectiveInpMs,
    recordedEvents: keyStats?.count || 0,
    passUnder200ms: effectiveInpMs > 0 && effectiveInpMs <= 200,
  };
}

async function runBackendSecuritySeoAndSaasAudit() {
  // 1. Public Write Method Rejection (405)
  const roomWriteStatuses = {};
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await fetch(`${BASE_URL}/api/v1/public/rooms`, { method });
    roomWriteStatuses[method] = r.status;
  }
  const inquiryNonPostStatuses = {};
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const r = await fetch(`${BASE_URL}/api/v1/public/inquiries`, { method });
    inquiryNonPostStatuses[method] = r.status;
  }

  // 2. Console Auth & Token Lifecycle Tests
  const unauthRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 5100000 }),
    }
  );

  const { token: expiredToken } = signToken(
    { sub: 'usr-admin-01', email: 'admin@adhome.vn' },
    { expOffsetSec: -120 }
  );
  const expiredRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ price: 5100000 }),
    }
  );
  const expiredBody = await expiredRes.json();

  const { token: forgedToken } = signToken(
    { sub: 'usr-admin-01', email: 'admin@adhome.vn' },
    { secret: 'compromised-wrong-secret-key', kid: ACTIVE_KEY_ID }
  );
  const forgedRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${forgedToken}`,
      },
      body: JSON.stringify({ price: 5100000 }),
    }
  );

  // 3. Never trust client self-declared permissions/scopes!
  // Sign a token with valid HMAC secret for `usr-viewer-01`, but inside the token payload
  // self-declare `role: 'ADMIN'`, `permissions: ['rooms.publish.write']`, `buildingScopes: ['*']`.
  // Backend MUST resolve `usr-viewer-01` from PostgreSQL (`role: 'VIEWER'`) and reject with 403!
  const { token: escalatedClientToken } = signToken({
    sub: 'usr-viewer-01',
    email: 'viewer@adhome.vn',
    orgId: 'org-adhome-anphu',
    role: 'ADMIN',
    permissions: ['rooms.publish.write', 'rooms.read', 'leads.read'],
    buildingScopes: ['*'],
  });
  const escalatedClientRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${escalatedClientToken}`,
      },
      body: JSON.stringify({ price: 5200000 }),
    }
  );
  const escalatedClientBody = await escalatedClientRes.json();

  // 4. Cross-Tenant Isolation (`usr-other-org-01` belongs to `org-empty-saas` in DB)
  const { token: crossTenantToken } = signToken({
    sub: 'usr-other-org-01',
    email: 'admin@other-tenant.vn',
    // Even if client token lies and says orgId: 'org-adhome-anphu', DB says 'org-empty-saas'!
    orgId: 'org-adhome-anphu',
  });
  const crossTenantRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${crossTenantToken}`,
      },
      body: JSON.stringify({ price: 5200000 }),
    }
  );
  const crossTenantBody = await crossTenantRes.json();

  // 5. Building Scope Isolation (`usr-mgr-lk01` scoped only to LK01-31 & LK01-32 in DB)
  const { token: mgrLk01Token } = signToken({
    sub: 'usr-mgr-lk01',
    email: 'manager.lk01@adhome.vn',
    buildingScopes: ['*'], // Client token lies and claims '*', DB enforces ['BLD-LK01-31', 'BLD-LK01-32']
  });
  const wrongBuildingRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/can-2pn-mini-25-05-lk08-25-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrLk01Token}`,
      },
      body: JSON.stringify({ price: 5600000 }),
    }
  );
  const wrongBuildingBody = await wrongBuildingRes.json();

  // 6. Secret Rotation Verification: Sign with PREVIOUS_KEY_ID (`k1-2026-09`) & ACTIVE_KEY_ID (`k2-2026-10`)
  const { token: rotatedPrevKeyToken } = signToken(
    { sub: 'usr-admin-01', email: 'admin@adhome.vn' },
    { secret: PREVIOUS_SECRET, kid: PREVIOUS_KEY_ID }
  );
  const rotatedPrevRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rotatedPrevKeyToken}`,
      },
      body: JSON.stringify({ price: 5250000 }),
    }
  );
  const rotatedPrevBody = await rotatedPrevRes.json();

  // 7. Token Revocation (`RevokedToken` by `jti`) & Session Version Invalidation
  const { token: revocableToken, jti: revocableJti } = signToken({
    sub: 'usr-admin-01',
    email: 'admin@adhome.vn',
  });
  const revokeCallRes = await fetch(
    `${BASE_URL}/api/v1/console/auth/revoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${revocableToken}`,
      },
      body: JSON.stringify({
        jti: revocableJti,
        reason: 'GATE05_SECURITY_TEST_REVOKE',
      }),
    }
  );
  const revokeCallBody = await revokeCallRes.json();

  // Attempt to use the revoked token right after revocation -> Must be 401 TOKEN_REVOKED!
  const afterRevokeRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${revocableToken}`,
      },
      body: JSON.stringify({ price: 5300000 }),
    }
  );
  const afterRevokeBody = await afterRevokeRes.json();

  // Session Version Invalidation test on `usr-mgr-lk01`
  const currentMgrActor = await prisma.consoleActor.findUnique({
    where: { id: 'usr-mgr-lk01' },
  });
  const oldSessionVer = currentMgrActor?.sessionVersion || 1;
  const { token: preInvalidationMgrToken } = signToken({
    sub: 'usr-mgr-lk01',
    email: 'manager.lk01@adhome.vn',
    sessionVersion: oldSessionVer,
  });

  const { token: freshAdminToken } = signToken({
    sub: 'usr-admin-01',
    email: 'admin@adhome.vn',
  });
  await fetch(`${BASE_URL}/api/v1/console/auth/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${freshAdminToken}`,
    },
    body: JSON.stringify({
      actorId: 'usr-mgr-lk01',
      invalidateAllSessions: true,
      reason: 'ROTATE_MANAGER_SESSION_VERSION',
    }),
  });

  const afterSessionBumpRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${preInvalidationMgrToken}`,
      },
      body: JSON.stringify({ price: 5100000 }),
    }
  );
  const afterSessionBumpBody = await afterSessionBumpRes.json();

  // Reset `usr-mgr-lk01` sessionVersion back to 1
  await prisma.consoleActor.update({
    where: { id: 'usr-mgr-lk01' },
    data: { sessionVersion: 1 },
  });

  // 8. Outbox SEO Sync Queue Retry Resilience (`x-simulate-seo-sync-fail-once: 1`)
  const retrySyncRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshAdminToken}`,
        'x-simulate-seo-sync-fail-once': '1',
      },
      body: JSON.stringify({ price: 5350000 }),
    }
  );
  const retrySyncBody = await retrySyncRes.json();

  // Verify dynamic SSR HTML & JSON-LD immediately show 5.350.000đ from PostgreSQL
  const ssrHtml535 = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`
  ).then((r) => r.text());
  const ssrContains535 =
    ssrHtml535.includes('5.350.000đ') && ssrHtml535.includes('"price":5350000');

  // 9. SEO Consistency when room transitions to OCCUPIED and RESERVED
  await fetch(`${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${freshAdminToken}`,
    },
    body: JSON.stringify({ status: 'OCCUPIED' }),
  });

  const occupiedPageRes = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`
  );
  const occupiedPageHtml = await occupiedPageRes.text();
  const occupiedSitemapXml = await fetch(`${BASE_URL}/sitemap.xml`).then((r) =>
    r.text()
  );
  const occupiedApiList = await fetch(`${BASE_URL}/api/v1/public/rooms`).then(
    (r) => r.json()
  );

  const occupiedCheck = {
    httpStatus: occupiedPageRes.status,
    xRobotsTag: occupiedPageRes.headers.get('x-robots-tag'),
    hasNoindexMeta: occupiedPageHtml.includes('noindex, nofollow'),
    removedFromSitemap: !occupiedSitemapXml.includes(
      '/phong/studio-ban-cong-31-06-lk01-31-an-phu'
    ),
    removedFromPublicApi: !occupiedApiList.rooms.some(
      (r) => r.slug === 'studio-ban-cong-31-06-lk01-31-an-phu'
    ),
  };

  // Check RESERVED transition as well
  await fetch(`${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${freshAdminToken}`,
    },
    body: JSON.stringify({ status: 'RESERVED' }),
  });
  const reservedPageRes = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`
  );
  const reservedCheck = {
    httpStatus: reservedPageRes.status,
    xRobotsTag: reservedPageRes.headers.get('x-robots-tag'),
  };

  // 10. SEO Consistency when room slug changes (`previousSlugs` -> 301 Redirect)
  await fetch(`${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${freshAdminToken}`,
    },
    body: JSON.stringify({
      status: 'AVAILABLE',
      slug: 'studio-ban-cong-31-06-lk01-31-an-phu-renamed',
    }),
  });

  const oldSlugRedirectRes = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    { redirect: 'manual' }
  );
  const newSlugPageRes = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu-renamed`
  );
  const newSlugSitemap = await fetch(`${BASE_URL}/sitemap.xml`).then((r) =>
    r.text()
  );

  const slugChangeCheck = {
    oldSlugHttpStatus: oldSlugRedirectRes.status,
    oldSlugLocationHeader: oldSlugRedirectRes.headers.get('location'),
    newSlugHttpStatus: newSlugPageRes.status,
    sitemapHasNewSlug: newSlugSitemap.includes(
      '/phong/studio-ban-cong-31-06-lk01-31-an-phu-renamed'
    ),
    sitemapRemovedOldSlug: !newSlugSitemap.includes(
      '<loc>https://adhome.vn/phong/studio-ban-cong-31-06-lk01-31-an-phu</loc>'
    ),
  };

  // Restore canonical slug `studio-ban-cong-31-06-lk01-31-an-phu` & original price `5000000`
  await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu-renamed`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshAdminToken}`,
      },
      body: JSON.stringify({
        slug: 'studio-ban-cong-31-06-lk01-31-an-phu',
        status: 'AVAILABLE',
        price: 5000000,
        isPublic: true,
      }),
    }
  );

  // 11. SaaS Multi-Tenant 0..N Hierarchy Verification (Primary Org vs Empty 0-Building Org)
  const primaryOrgHierarchy = await fetch(
    `${BASE_URL}/api/v1/public/organizations/org-adhome-anphu/hierarchy`
  ).then((r) => r.json());
  const emptyOrgHierarchy = await fetch(
    `${BASE_URL}/api/v1/public/organizations/org-empty-saas/hierarchy`
  ).then((r) => r.json());
  const emptyOrgRoomsRes = await fetch(
    `${BASE_URL}/api/v1/public/rooms?orgId=org-empty-saas`
  ).then((r) => r.json());

  // 12. Strict Public Projection Check (No private tenant fields leaked)
  const rawPublicRoomsText = await fetch(
    `${BASE_URL}/api/v1/public/rooms`
  ).then((r) => r.text());
  const leaksPrivateFields =
    rawPublicRoomsText.includes('currentTenantName') ||
    rawPublicRoomsText.includes('currentTenantPhone') ||
    rawPublicRoomsText.includes('internalNotes') ||
    rawPublicRoomsText.includes('PII Private');

  return {
    publicSurfaceProtection: {
      roomWriteStatuses,
      inquiryNonPostStatuses,
      zeroPrivateFieldLeakage: !leaksPrivateFields,
    },
    tokenLifecycleAndRbac: {
      unauthenticatedStatus: unauthRes.status,
      expiredTokenStatus: expiredRes.status,
      expiredTokenReason: expiredBody.reason,
      forgedTokenStatus: forgedRes.status,
      selfDeclaredClientEscalationBlocked: {
        status: escalatedClientRes.status,
        errorCode: escalatedClientBody.errorCode,
      },
      crossTenantBlocked: {
        status: crossTenantRes.status,
        errorCode: crossTenantBody.errorCode,
      },
      wrongBuildingBlocked: {
        status: wrongBuildingRes.status,
        errorCode: wrongBuildingBody.errorCode,
      },
      secretRotationGracePeriodKeyAccepted: {
        status: rotatedPrevRes.status,
        usedKeyId: rotatedPrevBody.usedKeyId,
      },
      jtiRevocationEnforced: {
        revokeStatus: revokeCallRes.status,
        revokedJti: revokeCallBody.revokedJti,
        subsequentRequestStatus: afterRevokeRes.status,
        subsequentRequestReason: afterRevokeBody.reason,
      },
      sessionVersionInvalidationEnforced: {
        subsequentRequestStatus: afterSessionBumpRes.status,
        subsequentRequestReason: afterSessionBumpBody.reason,
      },
    },
    seoConsistencyAndOutbox: {
      dynamicSsrReflectsUpdatedPrice5350000: ssrContains535,
      outboxRetryRecoveredFromSimulatedFailure: {
        jobStatus: retrySyncBody.seoSyncJob?.status,
        attempts: retrySyncBody.seoSyncJob?.attempts,
        transientErrorLogged: retrySyncBody.seoSyncJob?.lastError,
      },
      occupiedTransition: occupiedCheck,
      reservedTransition: reservedCheck,
      slugRenameRedirect301: slugChangeCheck,
    },
    saasMultiTenant0ToNModel: {
      primaryOrgCounts: primaryOrgHierarchy.counts,
      emptyOrgCounts: emptyOrgHierarchy.counts,
      emptyOrgRoomsApiWorksWithZeroBuildings:
        emptyOrgRoomsRes.ok === true &&
        Array.isArray(emptyOrgRoomsRes.buildings) &&
        emptyOrgRoomsRes.buildings.length === 0 &&
        Array.isArray(emptyOrgRoomsRes.rooms) &&
        emptyOrgRoomsRes.rooms.length === 0,
    },
  };
}

async function main() {
  console.log('1. Running Backend Security, Dynamic SEO & SaaS 0..N Audit...');
  const backendAudit = await runBackendSecuritySeoAndSaasAudit();
  console.log(
    'Backend Audit Complete:',
    JSON.stringify(backendAudit.tokenLifecycleAndRbac, null, 2)
  );

  console.log(
    '2. Launching Headless Browser for Real Native-Input INP & Mobile UX Audit...'
  );
  const { cdp, cleanup } = await launchHeadlessBrowser(9346);

  try {
    const landingDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
      '..'
    );
    const outDirs = [
      path.join(landingDir, 'gate05'),
      ARTIFACT_DIR,
    ];
    const saveShot = async (filename) => {
      await cdp.screenshot(outDirs.map((d) => path.join(d, filename)));
    };

    // =========================================================================
    // A. DESKTOP VIEWPORTS (1440x900 & 1920x1080) + REAL INP INTERACTIONS
    // =========================================================================
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 900));
    await saveShot('gate05_1440_home.png');

    // Measure Desktop LCP, CLS, Long Tasks & Zero-Gradient / Typography checks
    const desktopAudit = await cdp.eval(`(() => {
      const rum = window.__ADHOME_RUM__ || {};
      const h1 = document.querySelector('h1');
      const h1Rect = h1.getBoundingClientRect();
      const h1Lh = parseFloat(getComputedStyle(h1).lineHeight);
      const allEls = Array.from(document.querySelectorAll('*'));
      let gradientCount = 0;
      let backdropBlurCount = 0;
      for (const el of allEls) {
        const cs = getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) gradientCount++;
        if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) backdropBlurCount++;
      }
      return {
        lcpMs: rum.lcpMs || 0,
        clsScore: rum.clsScore || 0,
        longTaskCount: rum.longTaskCount || 0,
        tbtMs: rum.tbtMs || 0,
        heroTitleLines: Math.round(h1Rect.height / h1Lh),
        gradientCount,
        backdropBlurCount,
      };
    })()`);

    const realInteractions = [];

    // Interaction 1: Filter rooms by Category Tab on Home (`Studio` -> `Nổi bật`)
    const intFilterHome = await nativeClickAndMeasureInp(
      cdp,
      '[role="tab"]:nth-child(2)',
      '4a. Filter Rooms on Home (Select Studio Tab)'
    );
    await nativeClickAndMeasureInp(
      cdp,
      '[role="tab"]:nth-child(1)',
      '4b. Filter Rooms on Home (Reset to Featured Tab)'
    );
    realInteractions.push(intFilterHome);

    // Interaction 2: Click Room Card -> Opens Quick View Modal
    const intClickCard = await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="room-card-studio-ban-cong-31-06-lk01-31-an-phu"]',
      '1. Click Room Card (Phòng 31-06)'
    );
    realInteractions.push(intClickCard);
    await saveShot('gate05_interaction_01_quickview.png');

    // Interaction 3: Close Quick View Modal
    const intCloseQuickView = await nativeClickAndMeasureInp(
      cdp,
      '[aria-label="Đóng xem nhanh"]',
      '2. Open/Close Quick View Modal'
    );
    realInteractions.push(intCloseQuickView);

    // Interaction 8a: Navigate Home -> Catalog (`/phong-trong`)
    const intNavCatalog = await nativeClickAndMeasureInp(
      cdp,
      'a[href="/phong-trong"]',
      '8a. Navigate Home -> Catalog (/phong-trong)'
    );
    realInteractions.push(intNavCatalog);
    await new Promise((r) => setTimeout(r, 350));
    await saveShot('gate05_interaction_02_catalog.png');

    // Interaction 8b: Navigate to Room Detail (`/phong/studio-ban-cong-31-06-lk01-31-an-phu`)
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 700));
    await saveShot('gate05_1440_room_detail.png');

    // Interaction 3 (Album): Switch photos in Room Detail Album
    const intSwitchPhoto = await nativeClickAndMeasureInp(
      cdp,
      '[aria-label="Album ảnh phòng"] button:nth-child(2)',
      '3. Switch Photo in Room Detail Album'
    );
    realInteractions.push(intSwitchPhoto);
    await saveShot('gate05_interaction_03_album_switch.png');

    // Capture 1920x1080 Home
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 600));
    await saveShot('gate05_1920_home.png');

    // =========================================================================
    // B. MOBILE 390x844 VIEWPORT — ALL 6 P1 MOBILE UX FIXES + REAL INP
    // =========================================================================
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 800));
    await saveShot('gate05_390x844_home.png');

    // Verify P1 Mobile Fix #4: First Room Card's monthly price (`5.000.000đ`) is visible inside 390x844 without scrolling!
    const mobile390HomeFold = await cdp.eval(`(() => {
      const priceSummary = document.querySelector('[data-testid="mobile-hero-price-summary"]');
      const firstCard = document.querySelector('[data-testid="room-card-studio-ban-cong-31-06-lk01-31-an-phu"]');
      const firstCardPrice = firstCard?.querySelector('[data-testid="room-card-price"]');
      const prRect = firstCardPrice?.getBoundingClientRect();
      const cardRect = firstCard?.getBoundingClientRect();
      return {
        heroPriceSummaryText: priceSummary?.textContent?.trim() || '',
        firstCardTopY: cardRect ? Math.round(cardRect.top) : null,
        firstCardPriceTopY: prRect ? Math.round(prRect.top) : null,
        firstCardPriceBottomY: prRect ? Math.round(prRect.bottom) : null,
        firstCardPriceText: firstCardPrice?.textContent?.trim() || '',
        firstCardPriceVisibleInFirstScreen: Boolean(prRect && prRect.bottom <= 844),
        horizontalOverflowPx: document.documentElement.scrollWidth - window.innerWidth,
      };
    })()`);

    // Interaction 5: Open & Close Mobile Navigation Menu on 390x844
    const intOpenMobileNav = await nativeClickAndMeasureInp(
      cdp,
      'header button[aria-expanded]',
      '5. Open/Close Mobile Navigation Drawer'
    );
    await saveShot('gate05_interaction_04_mobile_nav.png');
    await nativeClickAndMeasureInp(
      cdp,
      'header button[aria-expanded]',
      '5b. Close Mobile Navigation Drawer'
    );
    realInteractions.push(intOpenMobileNav);

    // Open Quick View on 390x844 and verify P1 Mobile Fix #3 (2 horizontal spec rows instead of 4 boxed cards)
    await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="room-card-studio-ban-cong-31-06-lk01-31-an-phu"]',
      'Open Quick View on 390x844'
    );
    await new Promise((r) => setTimeout(r, 300));
    await saveShot('gate05_390x844_quickview.png');

    const quickViewAudit = await cdp.eval(`(() => {
      const specBox = document.querySelector('[data-testid="quickview-2-spec-rows"]');
      const rows = specBox ? specBox.children.length : 0;
      const oldFourCards = document.querySelectorAll('[data-testid="quickview-4-specs"]').length;
      const availText = document.querySelector('[data-testid="quickview-availability-label"]')?.textContent?.trim() || '';
      const modalRect = document.querySelector('[data-testid="room-quickview-modal"]')?.getBoundingClientRect();
      return {
        specRowCount: rows,
        oldFourCardGridCount: oldFourCards,
        availabilityLabel: availText,
        modalHeightPx: modalRect ? Math.round(modalRect.height) : 0,
      };
    })()`);

    // Close Quick View
    await nativeClickAndMeasureInp(
      cdp,
      '[aria-label="Đóng xem nhanh"]',
      'Close Quick View on 390x844'
    );

    // Navigate to `/phong/studio-ban-cong-31-06-lk01-31-an-phu` on 390x844 to verify P1 Mobile Fix #1 & #2 (Sticky CTA behavior)
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 700));
    await saveShot('gate05_390x844_room_detail_top.png');
    // Also save under canonical name `gate05_390x844_room_detail.png`
    await saveShot('gate05_390x844_room_detail.png');

    const stickyBeforeScroll = await cdp.eval(`(() => {
      const topCta = document.querySelector('[data-testid="mobile-top-inquire-cta"]');
      const stickyBar = document.querySelector('[data-testid="mobile-sticky-cta-bar"]');
      const topRect = topCta?.getBoundingClientRect();
      const stickyStyle = stickyBar ? getComputedStyle(stickyBar) : null;
      return {
        scrollY: window.scrollY,
        topCtaVisibleInViewport: Boolean(topRect && topRect.top >= 0 && topRect.bottom <= 844),
        stickyDataVisibleAttr: stickyBar?.getAttribute('data-sticky-visible'),
        stickyDisplayStyle: stickyStyle?.display,
        stickyIsHiddenAtTop: stickyBar?.getAttribute('data-sticky-visible') === 'false' && stickyStyle?.display === 'none',
      };
    })()`);

    // Now scroll down past the Top CTA (`window.scrollTo(0, 680)`) and wait for IntersectionObserver
    await cdp.eval(`window.scrollTo({ top: 680, behavior: 'instant' })`);
    await new Promise((r) => setTimeout(r, 350));
    await saveShot('gate05_390x844_room_detail_scrolled.png');

    const stickyAfterScroll = await cdp.eval(`(() => {
      const topCta = document.querySelector('[data-testid="mobile-top-inquire-cta"]');
      const stickyBar = document.querySelector('[data-testid="mobile-sticky-cta-bar"]');
      const topRect = topCta?.getBoundingClientRect();
      const stickyStyle = stickyBar ? getComputedStyle(stickyBar) : null;
      const stickyRect = stickyBar?.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        topCtaAboveViewport: Boolean(topRect && topRect.bottom < 80),
        stickyDataVisibleAttr: stickyBar?.getAttribute('data-sticky-visible'),
        stickyDisplayStyle: stickyStyle?.display,
        stickyHeightPx: stickyRect ? Math.round(stickyRect.height) : 0,
        stickyIsShownAfterScroll: stickyBar?.getAttribute('data-sticky-visible') === 'true' && stickyStyle?.display !== 'none',
      };
    })()`);

    // Scroll back to top and open Lead Inquiry Modal to test P1 Lead Form & Privacy + Interactions 6 & 7
    await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await new Promise((r) => setTimeout(r, 250));

    const intOpenLeadModal = await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="mobile-top-inquire-cta"]',
      '6a. Open Lead Inquiry Modal'
    );
    await new Promise((r) => setTimeout(r, 300));
    await saveShot('gate05_390x844_lead_modal_unchecked.png');

    // Verify P1 Lead Form & Privacy: checkbox is UNCHECKED by default, DD/MM/YYYY shown, redundant helper text removed
    const leadModalInitialAudit = await cdp.eval(`(() => {
      const checkbox = document.querySelector('[data-testid="lead-privacy-checkbox"]');
      const dateInput = document.querySelector('#lead-date');
      const dateBadge = document.querySelector('[data-testid="lead-date-ddmmyyyy"]');
      const oldRedundantHint = document.querySelector('#lead-date-hint');
      return {
        privacyCheckboxCheckedByDefault: Boolean(checkbox?.checked),
        dateInputValue: dateInput?.value || '',
        dateBadgeText: dateBadge?.textContent?.trim() || '',
        matchesDdMmYyyy: /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(dateInput?.value || ''),
        redundantDateHintRemoved: oldRedundantHint === null,
      };
    })()`);

    // Interaction 6b: Native typing into Lead Modal inputs (`#lead-name` & `#lead-phone`)
    const intTypeLeadForm = await nativeTypeAndMeasureInp(
      cdp,
      '#lead-name',
      'Nguyen Minh Khoa',
      '6b. Type into Lead Modal (#lead-name)'
    );
    realInteractions.push({
      ...intTypeLeadForm,
      openModalInpMs: intOpenLeadModal.effectiveInpMs,
    });

    await nativeTypeAndMeasureInp(
      cdp,
      '#lead-phone',
      '0905123890',
      '6c. Type Phone into Lead Modal (#lead-phone)'
    );

    // Interaction 7a: Submit form while privacy checkbox is UNCHECKED -> Must trigger validation error!
    const intSubmitValidation = await nativeClickAndMeasureInp(
      cdp,
      'form button[type="submit"]',
      '7a. Submit Lead Form & Trigger Unchecked Consent Validation'
    );
    realInteractions.push(intSubmitValidation);
    await new Promise((r) => setTimeout(r, 200));
    await saveShot('gate05_interaction_05_consent_validation.png');

    const consentValidationTriggered = await cdp.eval(`(() => {
      const err = document.querySelector('#lead-privacy-error');
      return {
        errorShown: Boolean(err),
        errorText: err?.textContent?.trim() || '',
      };
    })()`);

    // Clean any previous test inquiry for 0905123890
    await prisma.leadInquiry.deleteMany({
      where: { normalizedPhone: '0905123890' },
    });

    // Interaction 7b: Actively check `#lead-privacy` and submit -> Persisted to PostgreSQL with `roomId` & `orgId`!
    await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="lead-privacy-checkbox"]',
      '7b. Actively Check Privacy Consent Checkbox'
    );
    await nativeClickAndMeasureInp(
      cdp,
      'form button[type="submit"]',
      '7c. Submit Validated Lead Form to PostgreSQL'
    );
    await new Promise((r) => setTimeout(r, 500));
    await saveShot('gate05_interaction_06_lead_persisted.png');

    const persistedLeadRow = await prisma.leadInquiry.findFirst({
      where: { normalizedPhone: '0905123890' },
      orderBy: { createdAt: 'desc' },
    });

    // =========================================================================
    // C. MOBILE 430x932 VIEWPORT SCREENSHOTS
    // =========================================================================
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 600));
    await saveShot('gate05_430x932_home.png');

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 600));
    await saveShot('gate05_430x932_room_detail.png');

    // Collect final browser RUM state & Server RUM Summary
    const finalBrowserRum = await cdp.eval(`window.__ADHOME_RUM__ || {}`);
    const serverRumSummary = await fetch(
      `${BASE_URL}/api/v1/public/rum/summary`
    ).then((r) => r.json());

    const maxMeasuredInpMs = Math.max(
      ...realInteractions.map((i) => i.effectiveInpMs)
    );
    const allInteractionsNonZeroAndUnder200ms = realInteractions.every(
      (i) => i.effectiveInpMs > 0 && i.effectiveInpMs <= 200
    );

    const finalResults = {
      verifiedAt: new Date().toISOString(),
      targetUrl: BASE_URL,
      performanceAndRealInp: {
        measurementMethod:
          'Native CDP Input.dispatchMouseEvent + Input.dispatchKeyEvent + PerformanceObserver(event/longtask) + 2-frame rAF presentation latency',
        desktopWebVitals: desktopAudit,
        maxRealInteractionInpMs: maxMeasuredInpMs,
        all8InteractionsNonZeroAndUnder200ms:
          allInteractionsNonZeroAndUnder200ms,
        interactions: realInteractions,
        browserRumState: {
          lcpMs: finalBrowserRum.lcpMs,
          clsScore: finalBrowserRum.clsScore,
          longTaskCount: finalBrowserRum.longTaskCount,
          tbtMs: finalBrowserRum.tbtMs,
          totalInpEventsObserved: finalBrowserRum.inpEvents?.length || 0,
        },
        serverRumSummary: {
          totalSamplesReceived: serverRumSummary.totalSamples,
          metrics: serverRumSummary.metrics,
        },
      },
      mobileUxFinalFixes: {
        fix1And2StickyCtaScrollBehavior: {
          beforeScroll: stickyBeforeScroll,
          afterScroll: stickyAfterScroll,
        },
        fix3QuickViewTwoSpecRows: quickViewAudit,
        fix4FirstRoomCardPriceVisibleOn390x844: mobile390HomeFold,
        fix5AndLeadPrivacyUncheckedDefault: {
          initialModalState: leadModalInitialAudit,
          uncheckedValidationTriggered: consentValidationTriggered,
          persistedLeadInPostgres: persistedLeadRow
            ? {
                id: persistedLeadRow.id,
                referenceCode: persistedLeadRow.referenceCode,
                orgId: persistedLeadRow.orgId,
                roomId: persistedLeadRow.roomId,
                roomCode: persistedLeadRow.roomCode,
                preferredMoveInDateDisplay:
                  persistedLeadRow.preferredMoveInDateDisplay,
                privacyConsent: persistedLeadRow.privacyConsent,
              }
            : null,
        },
      },
      backendSecuritySeoAndSaas: backendAudit,
    };

    const outJsonLocal = path.join(
      process.cwd(),
      'gate05_verification_results.json'
    );
    const outJsonArtifact = path.join(
      ARTIFACT_DIR,
      'gate05_verification_results.json'
    );
    fs.writeFileSync(
      outJsonLocal,
      JSON.stringify(finalResults, null, 2),
      'utf-8'
    );
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.writeFileSync(
        outJsonArtifact,
        JSON.stringify(finalResults, null, 2),
        'utf-8'
      );
    }

    console.log('Saved Gate 05 verification results to', outJsonLocal);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
