import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const CHROME_BIN =
  'C:\\Users\\TINH-NGUYEN\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const PREVIEW_URL = 'http://127.0.0.1:8081';
const ARTIFACT_DIR =
  'C:/Users/TINH-NGUYEN/.gemini/antigravity/brain/28c40a83-4f86-4432-98db-0577f31a9633';
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  '..',
  '..',
  'docs',
  'evidence',
  'landing-gate04'
);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const CONSOLE_SECRET =
  process.env.ADHOME_CONSOLE_JWT_SECRET ||
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function base64UrlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signConsoleToken(payload, secret = CONSOLE_SECRET) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullClaims = {
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

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Eval error: ${
          res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text
        }`
      );
    }
    return res.result?.value;
  }

  async setViewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  }

  async waitFor(predicateExpr, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await this.evaluate(`Boolean(${predicateExpr})`);
        if (ok) return true;
      } catch {
        // ignore transient navigation context errors
      }
      await sleep(120);
    }
    return false;
  }

  async goto(url, waitExpr = 'document.readyState === "complete"') {
    await this.send('Page.navigate', { url });
    await sleep(300);
    await this.waitFor(waitExpr, 8000);
    await sleep(350);
  }

  async pressKey(key, windowsVirtualKeyCode) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    });
    await sleep(60);
  }

  async screenshot(filename) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    const buf = Buffer.from(data, 'base64');
    const evPath = path.join(EVIDENCE_DIR, filename);
    const artPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(evPath, buf);
    fs.writeFileSync(artPath, buf);
    return evPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function launchBrowser() {
  const port = 9450 + Math.floor(Math.random() * 400);
  const tmpProfile = path.join(EVIDENCE_DIR, `.chrome-profile-${port}`);
  fs.mkdirSync(tmpProfile, { recursive: true });
  const proc = spawn(
    CHROME_BIN,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tmpProfile}`,
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const page = pages.find((p) => p.type === 'page') || pages[0];
        if (page?.webSocketDebuggerUrl) {
          const client = new CdpClient(page.webSocketDebuggerUrl);
          await client.connect();
          await client.send('Page.enable');
          await client.send('Runtime.enable');
          await client.send('DOM.enable');
          return { proc, client, tmpProfile };
        }
      }
    } catch {
      // wait
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error('Failed to connect to headless Chrome via CDP');
}

const results = [];
function assertTest(id, name, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ id, name, status, details });
  console.log(`[${status}] ${id} — ${name}${details ? ` (${details})` : ''}`);
  if (!condition) {
    throw new Error(`Test failed: ${id} — ${name}: ${details}`);
  }
}

async function runSecurityAndPersistenceSuite() {
  console.log(
    '\n=== 1. P0 SECURITY, RBAC, TENANT/BUILDING SCOPE & POSTGRESQL AUDIT ==='
  );

  // SEC-01: Unauthenticated PATCH on /api/v1/public/rooms/:slug must be rejected (405)
  const resSec01 = await fetch(
    `${PREVIEW_URL}/api/v1/public/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 1000000 }),
    }
  );
  const bodySec01 = await resSec01.json();
  assertTest(
    'SEC-01',
    'Reject unauthenticated PATCH /api/v1/public/rooms/:slug',
    resSec01.status === 405 && bodySec01.errorCode === 'PUBLIC_WRITE_FORBIDDEN',
    `HTTP ${resSec01.status} (${bodySec01.errorCode})`
  );

  // SEC-02: Unauthenticated POST & DELETE on /api/v1/public/rooms must be rejected (405)
  const resSec02Post = await fetch(`${PREVIEW_URL}/api/v1/public/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'hacked-room' }),
  });
  const resSec02Del = await fetch(
    `${PREVIEW_URL}/api/v1/public/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    { method: 'DELETE' }
  );
  assertTest(
    'SEC-02',
    'Reject POST & DELETE on /api/v1/public/rooms*',
    resSec02Post.status === 405 && resSec02Del.status === 405,
    `POST=${resSec02Post.status}, DELETE=${resSec02Del.status}`
  );

  // SEC-03: Unauthenticated GET /api/v1/public/inquiries must be rejected (405) to protect lead PII
  const resSec03 = await fetch(`${PREVIEW_URL}/api/v1/public/inquiries`);
  assertTest(
    'SEC-03',
    'Reject unauthenticated GET /api/v1/public/inquiries (Protect Lead PII)',
    resSec03.status === 405,
    `HTTP ${resSec03.status}`
  );

  // SEC-04: Unauthenticated PATCH /api/v1/console/rooms/:slug -> 401
  const resSec04 = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const bodySec04 = await resSec04.json();
  assertTest(
    'SEC-04',
    'Reject unauthenticated PATCH /api/v1/console/rooms/:slug with 401',
    resSec04.status === 401 && bodySec04.errorCode === 'UNAUTHORIZED',
    `HTTP ${resSec04.status} (${bodySec04.errorCode})`
  );

  // SEC-05: Invalid signature token -> 401
  const forgedToken = signConsoleToken(
    {
      sub: 'hacker-01',
      email: 'hacker@evil.com',
      orgId: 'org-adhome-anphu',
      role: 'ADMIN',
      permissions: ['rooms.publish.write'],
      buildingScopes: ['*'],
    },
    'wrong-secret-key'
  );
  const resSec05 = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${forgedToken}`,
      },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const bodySec05 = await resSec05.json();
  assertTest(
    'SEC-05',
    'Reject forged Bearer token with invalid HMAC signature (401)',
    resSec05.status === 401 && bodySec05.reason === 'INVALID_SIGNATURE',
    `HTTP ${resSec05.status} (${bodySec05.reason})`
  );

  // SEC-06: Authenticated VIEWER role without rooms.publish.write permission -> 403
  const viewerToken = signConsoleToken({
    sub: 'user-viewer-01',
    email: 'viewer@adhome.vn',
    orgId: 'org-adhome-anphu',
    role: 'VIEWER',
    permissions: ['rooms.read'],
    buildingScopes: ['*'],
  });
  const resSec06 = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const bodySec06 = await resSec06.json();
  assertTest(
    'SEC-06',
    'Reject under-privileged VIEWER role without rooms.publish.write (403)',
    resSec06.status === 403 &&
      bodySec06.errorCode === 'INSUFFICIENT_PERMISSION',
    `HTTP ${resSec06.status} (${bodySec06.errorCode})`
  );

  // SEC-07: Cross-Tenant ADMIN (different orgId) -> 403 CROSS_TENANT_FORBIDDEN
  const otherTenantToken = signConsoleToken({
    sub: 'admin-other-org',
    email: 'admin@other-org.vn',
    orgId: 'org-other-competitor',
    role: 'ADMIN',
    permissions: ['rooms.publish.write'],
    buildingScopes: ['*'],
  });
  const resSec07 = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherTenantToken}`,
      },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const bodySec07 = await resSec07.json();
  assertTest(
    'SEC-07',
    'Reject Cross-Tenant ADMIN attempting to modify AdHome room (403)',
    resSec07.status === 403 && bodySec07.errorCode === 'CROSS_TENANT_FORBIDDEN',
    `HTTP ${resSec07.status} (${bodySec07.errorCode})`
  );

  // SEC-08: Building-Scoped MANAGER attempting to update room in unassigned building -> 403 BUILDING_SCOPE_FORBIDDEN
  const managerLk01Token = signConsoleToken({
    sub: 'mgr-lk01-31',
    email: 'manager.lk01@adhome.vn',
    orgId: 'org-adhome-anphu',
    role: 'MANAGER',
    permissions: ['rooms.publish.write', 'leads.read'],
    buildingScopes: ['bld-lk01-31'], // Only assigned to LK01-31
  });
  // Attempt to update P.25-05 which belongs to bld-lk08-25
  const resSec08 = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/can-2pn-mini-25-05-lk08-25-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerLk01Token}`,
      },
      body: JSON.stringify({ price: 6200000 }),
    }
  );
  const bodySec08 = await resSec08.json();
  assertTest(
    'SEC-08',
    'Reject Manager scoped to LK01-31 attempting to modify LK08-25 room (403)',
    resSec08.status === 403 &&
      bodySec08.errorCode === 'BUILDING_SCOPE_FORBIDDEN',
    `HTTP ${resSec08.status} (${bodySec08.errorCode})`
  );

  // SEC-09: Public Projection PII Leak Audit
  const dbPrivateRows = await prisma.publicRoomListing.findMany({
    where: { currentTenantName: { not: null } },
  });
  const resPublicRooms = await fetch(`${PREVIEW_URL}/api/v1/public/rooms`);
  const bodyPublicRooms = await resPublicRooms.json();
  const rawPublicJson = JSON.stringify(bodyPublicRooms);
  const leakedFields = bodyPublicRooms.rooms.filter(
    (r) =>
      'currentTenantName' in r ||
      'currentTenantPhone' in r ||
      'internalNotes' in r ||
      'orgId' in r
  );
  assertTest(
    'SEC-09',
    'Public API strictly projects public fields and leaks 0 tenant PII fields',
    dbPrivateRows.length >= 4 &&
      leakedFields.length === 0 &&
      !rawPublicJson.includes('PII Private') &&
      !rawPublicJson.includes('0912999888'),
    `DB private rows=${dbPrivateRows.length}, leaked fields in API=${leakedFields.length}`
  );

  // SEC-10: Rate Limiting on POST /api/v1/public/inquiries -> 429 Too Many Requests
  const rateLimitTestKey = `rl-test-${Date.now()}`;
  let got429 = false;
  let retryAfterHeader = null;
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`${PREVIEW_URL}/api/v1/public/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rate-limit-key': rateLimitTestKey,
      },
      body: JSON.stringify({ fullName: 'A' }),
    });
    if (r.status === 429) {
      got429 = true;
      retryAfterHeader = r.headers.get('retry-after');
      break;
    }
  }
  assertTest(
    'SEC-10',
    'Rate limiter blocks burst requests with HTTP 429 + Retry-After header',
    got429 && Number(retryAfterHeader) > 0,
    `got429=${got429}, Retry-After=${retryAfterHeader}s`
  );

  // DB-01: Authorized Console Room Update + Audit Log + Immediate Static SEO HTML Invalidation
  const slug3106 = 'studio-ban-cong-31-06-lk01-31-an-phu';
  const resUpdate = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/${slug3106}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerLk01Token}`,
      },
      body: JSON.stringify({ price: 5150000 }),
    }
  );
  const bodyUpdate = await resUpdate.json();
  const prerendered3106Path = path.join(DIST_DIR, 'phong', slug3106, 'index.html');
  const htmlAfterUpdate = fs.readFileSync(prerendered3106Path, 'utf-8');

  assertTest(
    'DB-01a',
    'Authorized Manager updates LK01-31 room in PostgreSQL + writes AuditLog + syncs SEO HTML',
    resUpdate.status === 200 &&
      bodyUpdate.ok === true &&
      bodyUpdate.room.price === 5150000 &&
      Boolean(bodyUpdate.auditLogId) &&
      bodyUpdate.seoPrerenderSynced === true &&
      htmlAfterUpdate.includes('5.150.000đ') &&
      htmlAfterUpdate.includes('"price":5150000'),
    `status=${resUpdate.status}, price=${bodyUpdate.room?.price}, auditLogId=${bodyUpdate.auditLogId}, seoSynced=${bodyUpdate.seoPrerenderSynced}, detail=${bodyUpdate.detail || ''}`
  );

  // Restore original price 5,000,000 VND
  const resRestore = await fetch(
    `${PREVIEW_URL}/api/v1/console/rooms/${slug3106}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerLk01Token}`,
      },
      body: JSON.stringify({ price: 5000000 }),
    }
  );
  const htmlAfterRestore = fs.readFileSync(prerendered3106Path, 'utf-8');
  assertTest(
    'DB-01b',
    'Restore room price to 5.000.000đ and verify prerendered HTML updates immediately',
    resRestore.status === 200 && htmlAfterRestore.includes('5.000.000đ'),
    'Restored 5.000.000đ in PostgreSQL and dist/phong/:slug/index.html'
  );

  // DB-02: 10-Way Concurrent Lead Submission Race Test (Promise.all)
  const racePhone = `0905${String(Math.floor(100000 + Math.random() * 899999))}`;
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const concurrentPromises = Array.from({ length: 10 }, (_, idx) =>
    fetch(`${PREVIEW_URL}/api/v1/public/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rate-limit-key': `concurrent-worker-${idx}-${Date.now()}`,
      },
      body: JSON.stringify({
        fullName: 'Nguyễn Minh Tuấn (Concurrent Test)',
        phone: racePhone,
        inquiryType: 'VIEW_ROOM',
        roomId: 'rm-31-06',
        roomSlug: slug3106,
        roomCode: 'P.31-06',
        roomTitle: 'Phòng 31-06 · Studio Ban Công',
        preferredMoveInDate: todayIso,
        note: 'Kiểm thử 10 request đồng thời vào PostgreSQL',
        privacyConsent: true,
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }))
  );

  const raceResponses = await Promise.all(concurrentPromises);
  const created201 = raceResponses.filter((r) => r.status === 201);
  const conflict409 = raceResponses.filter((r) => r.status === 409);
  const dbRowsForRacePhone = await prisma.leadInquiry.count({
    where: { normalizedPhone: racePhone },
  });

  assertTest(
    'DB-02',
    '10 concurrent identical POST /api/v1/public/inquiries commit exactly 1 row in PostgreSQL',
    created201.length === 1 &&
      conflict409.length === 9 &&
      dbRowsForRacePhone === 1,
    `201 Created=${created201.length}, 409 Conflict=${conflict409.length}, PostgreSQL rows=${dbRowsForRacePhone}, ref=${created201[0]?.body?.referenceCode}`
  );
}

async function runBrowserUxAndCwvSuite() {
  console.log(
    '\n=== 2. P1 MOBILE UX, DATE UX, ACCESSIBILITY & THROTTLED CORE WEB VITALS ==='
  );
  const { proc, client, tmpProfile } = await launchBrowser();

  try {
    // -------------------------------------------------------------------------
    // A. Desktop 1440x900 & 1920x1080 Screenshots + Room Detail Verification
    // -------------------------------------------------------------------------
    await client.setViewport(1440, 900, false);
    await client.goto(
      PREVIEW_URL,
      'document.querySelectorAll("#phong-dang-trong article").length >= 3'
    );
    await client.screenshot('gate04_1440_home.png');

    await client.goto(
      `${PREVIEW_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
      'Boolean(document.querySelector("[data-testid=\\"desktop-room-availability\\"]"))'
    );
    const desktopAvailText = await client.evaluate(
      `document.querySelector('[data-testid="desktop-room-availability"]')?.textContent?.trim()`
    );
    assertTest(
      'UX-01',
      'Room with past availableFrom date displays "Có thể vào ở ngay" instead of past date',
      desktopAvailText === 'Có thể vào ở ngay',
      `Displayed: "${desktopAvailText}"`
    );
    await client.screenshot('gate04_1440_room_detail.png');

    await client.setViewport(1920, 1080, false);
    await client.goto(
      PREVIEW_URL,
      'document.querySelectorAll("#phong-dang-trong article").length >= 3'
    );
    await client.screenshot('gate04_1920_home.png');

    // -------------------------------------------------------------------------
    // B. Mobile 390x844 & 430x932 Hero Fold, Room Detail & Quick View Verification
    // -------------------------------------------------------------------------
    await client.setViewport(390, 844, true);
    await client.goto(
      PREVIEW_URL,
      'document.querySelectorAll("#phong-dang-trong article").length >= 3'
    );

    const heroMetrics390 = await client.evaluate(`(() => {
      const hero = document.getElementById('trang-chu');
      const availableSection = document.getElementById('phong-dang-trong');
      const headerButtons = Array.from(
        document.querySelectorAll('header a, header button')
      ).filter((el) => el.offsetParent !== null);
      return {
        heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
        availableTop: availableSection
          ? Math.round(availableSection.getBoundingClientRect().top)
          : 9999,
        visibleHeaderControlCount: headerButtons.length,
      };
    })()`);

    assertTest(
      'UX-02',
      'Mobile 390x844 Hero is compact so "Phòng đang trống" appears above the first fold (< 844px) and Header has no duplicate CTA',
      heroMetrics390.availableTop < 760 &&
        heroMetrics390.visibleHeaderControlCount === 2,
      `heroHeight=${heroMetrics390.heroHeight}px, availableSectionTop=${heroMetrics390.availableTop}px (viewport=844px), headerControls=${heroMetrics390.visibleHeaderControlCount}`
    );

    await client.screenshot('gate04_390x844_home.png');

    // Open Quick View on 390x844 and verify concise summary
    await client.evaluate(
      `document.querySelector('#phong-dang-trong article').click()`
    );
    await client.waitFor(
      `Boolean(document.querySelector('[data-testid="room-quickview-modal"]'))`
    );
    await sleep(250);

    const quickViewChecks = await client.evaluate(`(() => {
      const modal = document.querySelector('[data-testid="room-quickview-modal"]');
      const specs = modal?.querySelector('[data-testid="quickview-4-specs"]');
      const specCount = specs ? specs.children.length : 0;
      const availLabel = modal
        ?.querySelector('[data-testid="quickview-availability-label"]')
        ?.textContent?.trim();
      const hasLongServiceFeeTable =
        modal?.textContent?.includes('Điện sinh hoạt') || false;
      return { specCount, availLabel, hasLongServiceFeeTable };
    })()`);

    assertTest(
      'UX-03',
      'Quick View Modal is a concise summary (4 specs, "Có thể vào ở ngay", no long fee tables)',
      quickViewChecks.specCount === 4 &&
        quickViewChecks.availLabel === 'Có thể vào ở ngay' &&
        quickViewChecks.hasLongServiceFeeTable === false,
      JSON.stringify(quickViewChecks)
    );

    await client.screenshot('gate04_390x844_quickview.png');

    // Close Quick View with Escape key
    await client.pressKey('Escape', 27);
    await sleep(250);

    // Navigate to Mobile Room Detail (/phong/studio-ban-cong-31-06-lk01-31-an-phu)
    await client.goto(
      `${PREVIEW_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
      'Boolean(document.querySelector("[data-testid=\\"mobile-room-top-summary\\"]"))'
    );

    const mobileDetailMetrics = await client.evaluate(`(() => {
      const topSummary = document.querySelector(
        '[data-testid="mobile-room-top-summary"]'
      );
      const topCta = document.querySelector(
        '[data-testid="mobile-top-inquire-cta"]'
      );
      const stickyBar = document.querySelector(
        '[data-testid="mobile-sticky-cta-bar"]'
      );
      const availText = document
        .querySelector('[data-testid="mobile-room-availability"]')
        ?.textContent?.trim();
      return {
        topSummaryVisible: Boolean(
          topSummary &&
            window.getComputedStyle(topSummary).display !== 'none' &&
            topSummary.getBoundingClientRect().height > 0
        ),
        topCtaBottomY: topCta
          ? Math.round(topCta.getBoundingClientRect().bottom)
          : 9999,
        stickyBarVisible: Boolean(
          stickyBar &&
            window.getComputedStyle(stickyBar).display !== 'none' &&
            stickyBar.getBoundingClientRect().height > 0
        ),
        availText,
      };
    })()`);

    assertTest(
      'UX-04',
      'Mobile Room Detail places Price, "Có thể vào ở ngay" & Primary CTA immediately below photo album within first screen (< 844px) + Sticky Bottom Bar',
      mobileDetailMetrics.topSummaryVisible &&
        mobileDetailMetrics.topCtaBottomY <= 820 &&
        mobileDetailMetrics.stickyBarVisible &&
        mobileDetailMetrics.availText === 'Có thể vào ở ngay',
      `topCtaBottomY=${mobileDetailMetrics.topCtaBottomY}px, stickyBar=${mobileDetailMetrics.stickyBarVisible}, avail="${mobileDetailMetrics.availText}"`
    );

    await client.screenshot('gate04_390x844_room_detail.png');

    // Open LeadInquiryModal from Mobile Top CTA & verify Vietnamese DD/MM/YYYY date input
    await client.evaluate(
      `document.querySelector('[data-testid="mobile-top-inquire-cta"]').click()`
    );
    await client.waitFor(`Boolean(document.getElementById('lead-date'))`);
    await sleep(250);

    const dateChecks = await client.evaluate(`(() => {
      const input = document.getElementById('lead-date');
      const badge = document.querySelector('[data-testid="lead-date-ddmmyyyy"]');
      return {
        inputValue: input ? input.value : '',
        badgeText: badge ? badge.textContent.trim() : '',
      };
    })()`);

    assertTest(
      'UX-05',
      'LeadInquiryModal date input displays DD/MM/YYYY natively inside input box even under US headless browser locale',
      /^\d{2}\/\d{2}\/\d{4}$/.test(dateChecks.inputValue) &&
        dateChecks.inputValue === dateChecks.badgeText,
      `input.value="${dateChecks.inputValue}", badge="${dateChecks.badgeText}"`
    );

    // Verify keyboard Tab focus trap inside LeadInquiryModal
    for (let i = 0; i < 12; i++) {
      await client.pressKey('Tab', 9);
    }
    const focusStillInsideModal = await client.evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(dialog && dialog.contains(document.activeElement));
    })()`);
    assertTest(
      'A11Y-01',
      'Keyboard Tab focus stays strictly trapped inside open modal',
      focusStillInsideModal === true,
      `focusInsideModal=${focusStillInsideModal}`
    );

    await client.screenshot('gate04_390x844_lead_modal_ddmmyyyy.png');

    // Close modal & capture 430x932 Mobile Home & Room Detail
    await client.pressKey('Escape', 27);
    await sleep(200);
    await client.setViewport(430, 932, true);
    await client.goto(
      PREVIEW_URL,
      'document.querySelectorAll("#phong-dang-trong article").length >= 3'
    );
    await client.screenshot('gate04_430x932_home.png');
    await client.goto(
      `${PREVIEW_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
      'Boolean(document.querySelector("[data-testid=\\"mobile-room-top-summary\\"]"))'
    );
    await client.screenshot('gate04_430x932_room_detail.png');

    // -------------------------------------------------------------------------
    // C. Throttled Core Web Vitals (Mobile 4G + 4x CPU Slowdown via CDP)
    // -------------------------------------------------------------------------
    await client.setViewport(390, 844, true);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 80,
      downloadThroughput: Math.floor((4 * 1024 * 1024) / 8), // 4 Mbps mobile 4G
      uploadThroughput: Math.floor((1.5 * 1024 * 1024) / 8),
      connectionType: 'cellular4g',
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__cwvMetrics = { lcp: 0, cls: 0, inp: 0 };
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            window.__cwvMetrics.lcp = Math.max(window.__cwvMetrics.lcp, entry.startTime);
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__cwvMetrics.cls += entry.value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.duration > window.__cwvMetrics.inp) {
              window.__cwvMetrics.inp = entry.duration;
            }
          }
        }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      `,
    });

    await client.goto(
      PREVIEW_URL,
      'document.querySelectorAll("#phong-dang-trong article").length >= 3'
    );
    // Trigger interactive category tab click under 4x CPU throttling
    await client.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const studioTab = tabs.find(t => t.textContent?.includes('Studio'));
      if (studioTab) studioTab.click();
    })()`);
    await sleep(250);
    await client.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const allTab = tabs.find(t => t.textContent?.includes('Nổi bật'));
      if (allTab) allTab.click();
    })()`);
    await sleep(350);

    const throttledCwv = await client.evaluate(`window.__cwvMetrics`);
    assertTest(
      'CWV-01',
      'Throttled Core Web Vitals (4G + 4x CPU Slowdown) meet production targets (LCP < 2500ms, INP < 200ms, CLS < 0.1)',
      throttledCwv.lcp > 0 &&
        throttledCwv.lcp < 2500 &&
        throttledCwv.inp < 200 &&
        throttledCwv.cls < 0.1,
      `LCP=${Math.round(throttledCwv.lcp)}ms, INP=${Math.round(
        throttledCwv.inp
      )}ms, CLS=${throttledCwv.cls.toFixed(4)}`
    );
  } finally {
    client.close();
    proc.kill();
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

async function main() {
  try {
    await runSecurityAndPersistenceSuite();
    await runBrowserUxAndCwvSuite();

    const summaryPayload = {
      executedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      results,
    };

    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'gate04_verification_results.json'),
      JSON.stringify(summaryPayload, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'gate04_verification_results.json'),
      JSON.stringify(summaryPayload, null, 2),
      'utf-8'
    );
    console.log(
      `\nALL ${results.length}/${results.length} GATE 04 VERIFICATION CHECKS PASSED!`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nGATE 04 VERIFICATION FAILED:', err);
  process.exit(1);
});
