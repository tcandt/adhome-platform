import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { loadAdhomeEnv } from '../server/envLoader.js';
import { hashPassword } from '../server/passwordHash.ts';
import {
  PROD_ADMIN_ID,
  provisionProductionAdmin,
} from './provisionProductionAdmin.mjs';

loadAdhomeEnv();

const LANDING_URL = process.env.RC1_BASE_URL || 'http://127.0.0.1:8081';
const CONSOLE_URL = process.env.CONSOLE_BASE_URL || 'http://127.0.0.1:5174';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';
const EVIDENCE_DIR = path.join(process.cwd(), 'docs', 'evidence', 'console-v2');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
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

async function launchHeadlessBrowser(port) {
  const exe = findBrowserExecutable();
  const profileDir = path.join(
    process.cwd(),
    `.chrome-profile-c2-${port}-${Date.now()}`
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
  for (let i = 0; i < 45; i++) {
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
    try {
      proc.kill();
    } catch {
      // ignore
    }
    throw new Error(`Failed to connect to headless Chrome on port ${port}`);
  }

  const cdp = new CdpClient(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const cleanup = async () => {
    cdp.close();
    try {
      proc.kill();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 400));
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore Windows transient lock
    }
  };

  return { cdp, cleanup };
}

async function setViewport(cdp, { width, height, mobile = false }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await new Promise((r) => setTimeout(r, 250));
}

async function waitForSelector(cdp, selector, maxTries = 40, intervalMs = 150) {
  for (let i = 0; i < maxTries; i++) {
    const found = await cdp.eval(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function setControlledInput(cdp, selector, value) {
  await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Input not found: ' + ${JSON.stringify(selector)});
    el.focus();
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(String(value))});
    else el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function setControlledSelect(cdp, selector, value) {
  await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Select not found: ' + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(String(value))});
    else el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

function rawHttpGetWithHost(baseUrl, requestPath, hostHeader) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port) || 80,
        path: requestPath,
        method: 'GET',
        headers: { Host: hostHeader },
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode || 0,
          location: res.headers.location || null,
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function killProcessTreeWindows(proc) {
  if (!proc || !proc.pid) return Promise.resolve();
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    killer.on('close', () => resolve());
    killer.on('error', () => resolve());
  });
}

async function waitForHttp200(url, maxTries = 45) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export function evaluateConsoleV2Gate(report) {
  const issues = [];
  if (!report.landingFreezeRegression?.pass) {
    issues.push('Landing RC1 freeze regression check failed.');
  }
  if (!report.phaseC1_shellRedesign?.loginAndSession?.pass) {
    issues.push('Phase C1 unified login & HttpOnly session check failed.');
  }
  if (!report.phaseC1_shellRedesign?.responsiveHeader3Zone?.pass) {
    issues.push('Phase C1 responsive 3-zone header / zero-overflow check failed.');
  }
  if (!report.phaseC1_shellRedesign?.brandLogoSvg?.pass) {
    issues.push('Phase C1 BrandLogo SVG check failed.');
  }
  if (!report.phaseC1_shellRedesign?.official10ModuleSidebar?.pass) {
    issues.push('Phase C1 official 10-module Animate UI sidebar check failed.');
  }
  if (!report.phaseC1_shellRedesign?.breadcrumbsPeriodAndSettings8Tabs?.pass) {
    issues.push('Phase C1 2nd-level breadcrumbs, dynamic period toolbar, or 8-tab settings check failed.');
  }
  if (!report.phaseC1_shellRedesign?.notificationsSearchAndTheme?.pass) {
    issues.push('Phase C1 real notifications badge, Ctrl+K search, or Dark/Light theme check failed.');
  }
  if (!report.phaseC1_shellRedesign?.mobileConsoleDrawerAndCards?.pass) {
    issues.push('Phase C1 mobile console (<1024px) Sheet drawer & touch cards check failed.');
  }
  if (!report.phaseC2_postgresFoundation?.uiCrudAndCrossSessionPersistence?.pass) {
    issues.push('Phase C2 PostgreSQL CRUD & Browser Session B cross-session persistence check failed.');
  }
  if (!report.phaseC2_postgresFoundation?.publicSyncAndZeroPii?.pass) {
    issues.push('Phase C2 atomic public room sync or Zero-PII isolation check failed.');
  }
  if (!report.phaseC2_postgresFoundation?.safeDeleteAndManagerRbac?.pass) {
    issues.push('Phase C2 Safe Delete dependency guard or Manager RBAC scoping check failed.');
  }
  if (!report.phaseC2_postgresFoundation?.cleanDatabaseTeardown?.pass) {
    issues.push('Phase C2 primary-key test data cleanup check failed.');
  }

  return {
    passed: issues.length === 0,
    // Per Section XV.2 & XV.3: Local workstation verification MUST report LOCAL_GATE_PASSED, never PRODUCTION_READY
    verdict: issues.length === 0 ? 'LOCAL_GATE_PASSED' : 'LOCAL_GATE_FAILED',
    issues,
  };
}

async function runVerification() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Snapshot original production admin row so we restore exact passwordHash & sessionVersion in finally
  const originalAdminSnapshot = await prisma.consoleActor.findUnique({
    where: { id: PROD_ADMIN_ID },
  });

  // Ephemeral test password (never printed or written to disk/JSON)
  const ephemeralAdminPassword = `AdHome@C2Gate!${crypto.randomBytes(6).toString('hex')}`;
  await provisionProductionAdmin({
    email: 'admin@adhome.vn',
    newPassword: ephemeralAdminPassword,
    forceActivate: true,
  });

  // Clean up any leftover E2EC2 test artifacts from aborted runs if present
  const staleBld = await prisma.building.findFirst({ where: { code: 'E2EC2' } });
  if (staleBld) {
    await prisma.tenant.deleteMany({ where: { primaryBuildingId: staleBld.id } });
    await prisma.consoleRoom.deleteMany({ where: { buildingId: staleBld.id } });
    await prisma.publicRoomListing.deleteMany({ where: { buildingId: staleBld.id } });
    await prisma.floor.deleteMany({ where: { buildingId: staleBld.id } });
    await prisma.building.delete({ where: { id: staleBld.id } });
  }
  await prisma.consoleActor.deleteMany({
    where: { email: 'manager.c2.test@adhome.vn' },
  });

  let landingProc = null;
  let consoleProc = null;
  let browserA = null;
  let browserB = null;

  const createdLeadIds = [];
  let createdManagerId = null;
  let createdBuildingId = null;
  let createdRoomId = null;
  let createdTenantId = null;

  const report = {
    verifiedAt: new Date().toISOString(),
    environmentTier: 'LOCAL_WORKSTATION_POSTGRESQL_18',
    productionReadyClaimed: false,
    productionPendingItems: [
      'External public DNS & TLS cutover for https://adhome.vn and https://console.adhome.vn',
      'Phase C3–C6 full financial FSMs (invoice lock/settlement batching) & live third-party provider adapters (SePay/payOS/Tingee, Zalo/Telegram, Hunonic)',
    ],
    landingFreezeRegression: {},
    phaseC1_shellRedesign: {
      loginAndSession: {},
      responsiveHeader3Zone: {},
      brandLogoSvg: {},
      official10ModuleSidebar: {},
      breadcrumbsPeriodAndSettings8Tabs: {},
      notificationsSearchAndTheme: {},
      mobileConsoleDrawerAndCards: {},
    },
    phaseC2_postgresFoundation: {
      uiCrudAndCrossSessionPersistence: {},
      publicSyncAndZeroPii: {},
      safeDeleteAndManagerRbac: {},
      cleanDatabaseTeardown: {},
    },
    screenshots: [],
    overallVerdict: 'PENDING',
  };

  const saveShot = async (cdp, filename) => {
    await cdp.eval(`(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return Promise.all(imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((res) => {
          img.addEventListener('load', () => res(), { once: true });
          img.addEventListener('error', () => res(), { once: true });
          setTimeout(res, 2000);
        });
      }));
    })()`);
    const p1 = path.join(EVIDENCE_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    await cdp.screenshot([p1, p2]);
    report.screenshots.push(filename);
    console.log(`  [Screenshot] ${filename}`);
  };

  try {
    console.log('\n[1/5] Starting Landing (8081) & Console V2 (5174) preview servers...');
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    landingProc = spawn(
      'pnpm',
      ['--filter', '@adhome/landing', 'preview', '--host', '127.0.0.1', '--port', '8081'],
      {
        cwd: repoRoot,
        shell: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ADHOME_CONSOLE_LOGIN_ENABLED: 'true',
        },
      }
    );
    consoleProc = spawn(
      'pnpm',
      ['--filter', '@adhome/console', 'preview', '--host', '127.0.0.1', '--port', '5174'],
      {
        cwd: repoRoot,
        shell: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ADHOME_API_TARGET: LANDING_URL,
        },
      }
    );

    const [landingUp, consoleUp] = await Promise.all([
      waitForHttp200(`${LANDING_URL}/`),
      waitForHttp200(`${CONSOLE_URL}/login`),
    ]);
    if (!landingUp || !consoleUp) {
      throw new Error(
        `Preview servers failed to start (landingUp=${landingUp}, consoleUp=${consoleUp})`
      );
    }

    // =========================================================================
    // SUITE 1: LANDING RC1 FREEZE REGRESSION & PUBLIC LEAD INQUIRY
    // =========================================================================
    console.log('[2/5] Auditing Landing RC1 feature freeze, 301 redirects & Zero-PII...');
    const [homeRes, catalogRes, robotsRes, sitemapRes, pubRoomsRes] =
      await Promise.all([
        fetch(`${LANDING_URL}/`),
        fetch(`${LANDING_URL}/phong-trong`),
        fetch(`${LANDING_URL}/robots.txt`),
        fetch(`${LANDING_URL}/sitemap.xml`),
        fetch(`${LANDING_URL}/api/v1/public/rooms`),
      ]);
    const homeHtml = await homeRes.text();
    const robotsTxt = await robotsRes.text();
    const sitemapXml = await sitemapRes.text();
    const pubRoomsJson = await pubRoomsRes.json();
    const pubRoomsRaw = JSON.stringify(pubRoomsJson);

    const legacyLanding301 = await rawHttpGetWithHost(
      LANDING_URL,
      '/',
      'adhome.ductinh.one'
    );
    const legacyConsole301 = await rawHttpGetWithHost(
      CONSOLE_URL,
      '/login',
      'console-adhome.ductinh.one'
    );

    const leadRes = await fetch(`${LANDING_URL}/api/v1/public/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 180) + 10}`,
      },
      body: JSON.stringify({
        fullName: 'Nguyễn Kiểm Thử Freeze RC1',
        phone: '0909887766',
        privacyConsent: true,
        note: 'Kiểm tra hồi quy đóng băng Landing RC1',
      }),
    });
    const leadBody = await leadRes.json();
    if (leadBody?.id) {
      createdLeadIds.push(leadBody.id);
    }
    const persistedLead = leadBody?.id
      ? await prisma.leadInquiry.findUnique({ where: { id: leadBody.id } })
      : null;

    report.landingFreezeRegression = {
      home200AndCanonical:
        homeRes.status === 200 && homeHtml.includes('https://adhome.vn'),
      catalog200: catalogRes.status === 200,
      robotsAndSitemapCanonical:
        robotsRes.status === 200 &&
        robotsTxt.includes('https://adhome.vn/sitemap.xml') &&
        sitemapRes.status === 200 &&
        sitemapXml.includes('https://adhome.vn/'),
      legacyLanding301ToAdhomeVn:
        legacyLanding301.status === 301 &&
        legacyLanding301.location === 'https://adhome.vn/',
      legacyConsole301ToConsoleAdhomeVn:
        legacyConsole301.status === 301 &&
        legacyConsole301.location === 'https://console.adhome.vn/login',
      publicRoomsApi200AndNonEmpty:
        pubRoomsRes.status === 200 &&
        Array.isArray(pubRoomsJson.rooms || pubRoomsJson.items) &&
        (pubRoomsJson.rooms || pubRoomsJson.items).length >= 1,
      publicRoomsZeroPiiFields:
        !pubRoomsRaw.includes('currentTenantName') &&
        !pubRoomsRaw.includes('currentTenantPhone') &&
        !pubRoomsRaw.includes('idNumber') &&
        !pubRoomsRaw.includes('internalNotes'),
      leadInquiryPersistedAndRefMatched: Boolean(
        leadRes.status === 201 &&
          persistedLead &&
          /^ADH-\d{4}-[A-Z0-9]{4,}$/.test(leadBody.referenceCode || '') &&
          persistedLead.referenceCode === leadBody.referenceCode
      ),
    };
    report.landingFreezeRegression.pass = Object.values(
      report.landingFreezeRegression
    ).every((v) => v === true);

    // =========================================================================
    // SUITE 2: CONSOLE V2 PHASE C1 SHELL REDESIGN (Browser Session A)
    // =========================================================================
    console.log('[3/5] Auditing Console V2 Phase C1 Shell Redesign in Browser Session A...');
    browserA = await launchHeadlessBrowser(9351);
    const cdpA = browserA.cdp;

    await setViewport(cdpA, { width: 1440, height: 900, mobile: false });
    await cdpA.send('Network.clearBrowserCookies');
    await cdpA.send('Page.navigate', { url: `${CONSOLE_URL}/` });
    await waitForSelector(cdpA, '[data-testid="console-login-email"]');

    const loginScreenAudit = await cdpA.eval(`(() => {
      const emailEl = document.querySelector('[data-testid="console-login-email"]');
      const heading = document.querySelector('[data-testid="console-login-heading"]')?.textContent?.trim() || '';
      const bodyText = document.body.innerText || '';
      return {
        pathname: window.location.pathname,
        emailDefaultEmpty: emailEl ? emailEl.value === '' : false,
        heading,
        zeroRoleTabs:
          !bodyText.includes('Admin (Toàn quyền)') &&
          !bodyText.includes('Manager (Quản lý tòa)'),
      };
    })()`);

    await setControlledInput(cdpA, '[data-testid="console-login-email"]', 'admin@adhome.vn');
    await setControlledInput(cdpA, '[data-testid="console-login-password"]', 'WrongPassword#2026!');
    await cdpA.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);
    const wrongPwErrorShown = await waitForSelector(
      cdpA,
      '[data-testid="console-login-error"]',
      25,
      120
    );

    // Authentic Admin login
    await setControlledInput(
      cdpA,
      '[data-testid="console-login-password"]',
      ephemeralAdminPassword
    );
    await cdpA.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);
    const desktopHeaderReady = await waitForSelector(
      cdpA,
      '[data-testid="console-desktop-header"]',
      45,
      150
    );
    await new Promise((r) => setTimeout(r, 400));

    const cookiesA = await cdpA.send('Network.getCookies');
    const sessionCookieA = (cookiesA.cookies || []).find(
      (c) => c.name === 'adhome_console_session'
    );
    const rawJwtInLocalStorage = await cdpA.eval(
      `localStorage.getItem('adhome_console_token')`
    );

    report.phaseC1_shellRedesign.loginAndSession = {
      redirectedToLoginWhenUnauth: loginScreenAudit.pathname === '/login',
      emailDefaultEmpty: loginScreenAudit.emailDefaultEmpty,
      zeroRoleTabsOnLogin: loginScreenAudit.zeroRoleTabs,
      wrongPassword401FeedbackShown: wrongPwErrorShown,
      authenticatedShellReached: desktopHeaderReady,
      httpOnlyCookieIssued: Boolean(sessionCookieA && sessionCookieA.httpOnly),
      zeroJwtInLocalStorage: rawJwtInLocalStorage === null,
    };
    report.phaseC1_shellRedesign.loginAndSession.pass = Object.values(
      report.phaseC1_shellRedesign.loginAndSession
    ).every((v) => v === true);

    // Responsive 3-zone header & zero-overflow audit across 1024, 1280, 1440, 1920
    const breakpoints = [
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];
    const breakpointResults = [];
    for (const bp of breakpoints) {
      await setViewport(cdpA, { width: bp.width, height: bp.height, mobile: false });
      const metrics = await cdpA.eval(`(() => {
        const hdr = document.querySelector('[data-testid="console-desktop-header"]');
        if (!hdr) return null;
        const hRect = hdr.getBoundingClientRect();
        const z1 = hdr.children[0]?.getBoundingClientRect();
        const z2 = hdr.children[1]?.getBoundingClientRect();
        const z3 = hdr.children[2]?.getBoundingClientRect();
        const hdrText = hdr.innerText || '';
        return {
          viewportWidth: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          zeroHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          headerHeight: Math.round(hRect.height),
          headerHeightInSpec: hRect.height >= 60 && hRect.height <= 65,
          zonesNonOverlapping: Boolean(
            z1 && z2 && z3 &&
            z1.right <= z2.left + 1 &&
            z2.right <= z3.left + 1 &&
            z3.right <= window.innerWidth + 1
          ),
          noHardcodedPeriodInHeader: !hdrText.includes('Kỳ T10/2026'),
          noMobilePreviewBtnInHeader: !hdrText.includes('Bản Mobile'),
          noProBadgeInHeader: !/\\bPRO\\b/.test(hdrText),
        };
      })()`);
      breakpointResults.push({ breakpoint: `${bp.width}x${bp.height}`, ...metrics });
      if (bp.width === 1024) {
        await saveShot(cdpA, 'console_v2_1024_overview.png');
      } else if (bp.width === 1280) {
        await saveShot(cdpA, 'console_v2_1280_overview.png');
      } else if (bp.width === 1440) {
        await saveShot(cdpA, 'console_v2_1440_overview_light.png');
      }
    }

    // Restore 1440x900 for subsequent desktop checks
    await setViewport(cdpA, { width: 1440, height: 900, mobile: false });

    report.phaseC1_shellRedesign.responsiveHeader3Zone = {
      breakpoints: breakpointResults,
      allBreakpointsPass: breakpointResults.every(
        (b) =>
          b.zeroHorizontalOverflow &&
          b.headerHeightInSpec &&
          b.zonesNonOverlapping &&
          b.noHardcodedPeriodInHeader &&
          b.noMobilePreviewBtnInHeader &&
          b.noProBadgeInHeader
      ),
    };
    report.phaseC1_shellRedesign.responsiveHeader3Zone.pass =
      report.phaseC1_shellRedesign.responsiveHeader3Zone.allBreakpointsPass;

    // BrandLogo SVG & Official 10-Module Sidebar + Animate UI Collapse/Expand
    const sidebarExpandedAudit = await cdpA.eval(`(() => {
      const sidebar = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const sRect = sidebar?.getBoundingClientRect();
      const logoImg = document.querySelector('[data-testid="brand-logo-horizontal"] img');
      const lRect = logoImg?.getBoundingClientRect();
      const groups = Array.from(document.querySelectorAll('[data-sidebar="group-label"]')).map(
        (el) => el.textContent?.trim() || ''
      );
      const items = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]')).map(
        (el) => el.querySelector('span')?.textContent?.trim() || el.textContent?.trim() || ''
      );
      return {
        sidebarWidth: Math.round(sRect?.width || 0),
        logoLoaded: Boolean(logoImg && logoImg.complete && logoImg.naturalWidth > 0),
        logoWidth: Math.round(lRect?.width || 0),
        logoHeight: Math.round(lRect?.height || 0),
        groups,
        items,
      };
    })()`);

    // Collapse Sidebar via SidebarTrigger
    await cdpA.eval(`document.querySelector('[data-testid="console-sidebar-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 350));
    const sidebarCollapsedAudit = await cdpA.eval(`(() => {
      const sidebar = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const sRect = sidebar?.getBoundingClientRect();
      const iconImg = document.querySelector('[data-testid="brand-logo-icon"] img') ||
        document.querySelector('[data-testid="brand-logo-icon-img"]') ||
        document.querySelector('[data-testid="brand-logo-icon"]');
      const iRect = iconImg?.getBoundingClientRect();
      return {
        state: sidebar?.getAttribute('data-state'),
        sidebarWidth: Math.round(sRect?.width || 0),
        iconLoaded: Boolean(iconImg && (iconImg.complete || iconImg.naturalWidth > 0 || iconImg.tagName === 'IMG')),
        iconWidth: Math.round(iRect?.width || 0),
        iconHeight: Math.round(iRect?.height || 0),
      };
    })()`);
    await saveShot(cdpA, 'console_v2_1440_sidebar_collapsed.png');

    // Expand Sidebar via Ctrl+B keyboard shortcut
    await cdpA.eval(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 350));
    const expandedAfterCtrlB = await cdpA.eval(
      `document.querySelector('[data-testid="console-desktop-sidebar"]')?.getAttribute('data-state')`
    );

    // Toggle via SidebarRail under prefers-reduced-motion: reduce
    await cdpA.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await cdpA.eval(`document.querySelector('[data-testid="console-sidebar-rail"]')?.click()`);
    await new Promise((r) => setTimeout(r, 180));
    const collapsedViaRail = await cdpA.eval(
      `document.querySelector('[data-testid="console-desktop-sidebar"]')?.getAttribute('data-state') === 'collapsed'`
    );
    await cdpA.eval(`document.querySelector('[data-testid="console-sidebar-rail"]')?.click()`);
    await new Promise((r) => setTimeout(r, 180));
    await cdpA.send('Emulation.setEmulatedMedia', { features: [] });

    const expectedGroups = [
      'VẬN HÀNH CỐT LÕI',
      'TÀI CHÍNH VÀ TỔNG HỢP',
      'HỆ THỐNG',
    ];
    const expectedModules = [
      'Tổng quan',
      'Tòa nhà & phòng',
      'Đặt cọc & giữ chỗ',
      'Hợp đồng',
      'Tổng hợp & Cron',
      'Hóa đơn',
      'Thanh toán và đối soát',
      'Thu chi và sổ quỹ',
      'Báo cáo doanh thu',
      'Cài đặt & Thiết lập',
    ];

    report.phaseC1_shellRedesign.brandLogoSvg = {
      expandedHorizontalLogoLoaded: sidebarExpandedAudit.logoLoaded,
      expandedLogoDimensions: `${sidebarExpandedAudit.logoWidth}x${sidebarExpandedAudit.logoHeight}`,
      collapsedIconLogoLoaded: sidebarCollapsedAudit.iconLoaded,
      collapsedIconDimensions: `${sidebarCollapsedAudit.iconWidth}x${sidebarCollapsedAudit.iconHeight}`,
      pass:
        sidebarExpandedAudit.logoLoaded &&
        sidebarExpandedAudit.logoWidth >= 100 &&
        sidebarExpandedAudit.logoHeight >= 24 &&
        sidebarCollapsedAudit.iconLoaded &&
        sidebarCollapsedAudit.iconWidth >= 28 &&
        sidebarCollapsedAudit.iconHeight >= 28,
    };

    report.phaseC1_shellRedesign.official10ModuleSidebar = {
      groupCount: sidebarExpandedAudit.groups.length,
      groupsMatchSpec:
        JSON.stringify(sidebarExpandedAudit.groups.map((g) => g.toUpperCase())) ===
        JSON.stringify(expectedGroups),
      moduleCount: sidebarExpandedAudit.items.length,
      modulesMatchExact10Spec:
        JSON.stringify(sidebarExpandedAudit.items) ===
        JSON.stringify(expectedModules),
      tenantsNotTopLevelSidebarItem:
        !sidebarExpandedAudit.items.includes('Khách thuê'),
      expandedWidthPx: sidebarExpandedAudit.sidebarWidth,
      collapsedWidthPx: sidebarCollapsedAudit.sidebarWidth,
      collapseViaTriggerWorks:
        sidebarCollapsedAudit.state === 'collapsed' &&
        sidebarCollapsedAudit.sidebarWidth >= 68 &&
        sidebarCollapsedAudit.sidebarWidth <= 76,
      expandViaCtrlBWorks: expandedAfterCtrlB === 'expanded',
      railToggleWithReducedMotionWorks: collapsedViaRail,
    };
    report.phaseC1_shellRedesign.official10ModuleSidebar.pass =
      report.phaseC1_shellRedesign.official10ModuleSidebar.groupsMatchSpec &&
      report.phaseC1_shellRedesign.official10ModuleSidebar.modulesMatchExact10Spec &&
      report.phaseC1_shellRedesign.official10ModuleSidebar.tenantsNotTopLevelSidebarItem &&
      report.phaseC1_shellRedesign.official10ModuleSidebar.collapseViaTriggerWorks &&
      report.phaseC1_shellRedesign.official10ModuleSidebar.expandViaCtrlBWorks &&
      report.phaseC1_shellRedesign.official10ModuleSidebar.railToggleWithReducedMotionWorks;

    // 2nd-level Breadcrumbs, Dynamic Period Toolbar & 8-Tab Settings Audit
    await cdpA.eval(`document.querySelector('[data-testid="console-nav-buildings"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-buildings-workspace"]');
    const buildingsRootTitle = await cdpA.eval(
      `document.querySelector('[data-testid="console-header-title"]')?.textContent?.trim()`
    );

    await cdpA.eval(`document.querySelector('[data-testid="subtab-buildings-tenants"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-tenants-directory"]');
    const tenantsBreadcrumbTitle = await cdpA.eval(
      `document.querySelector('[data-testid="console-header-title"]')?.textContent?.trim()`
    );

    // Financial module Period Toolbar check (Invoices)
    await cdpA.eval(`document.querySelector('[data-testid="console-nav-invoices"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-module-workspace-invoices"]');
    const invoicesPeriodToolbarPresent = await cdpA.eval(
      `Boolean(document.querySelector('[data-testid="module-period-toolbar"]') && document.querySelector('[data-testid="input-module-period"]'))`
    );
    await saveShot(cdpA, 'console_v2_1440_invoices_period_toolbar.png');

    // Settings 8-tab audit + Building Scope Selector hidden on Settings
    await cdpA.eval(`document.querySelector('[data-testid="console-nav-settings"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-settings-workspace"]');
    const buildingScopeHiddenOnSettings = await cdpA.eval(
      `document.querySelector('[data-testid="console-building-scope-selector"]') === null`
    );

    const settingsTabIds = [
      'organization',
      'staff',
      'tariffs',
      'notifications',
      'payments',
      'hunonic',
      'cron',
      'audit',
    ];
    const visitedSettingsTabs = [];
    let waterMethodsVerified = false;
    let notifications4ChannelsVerified = false;
    let payments3ProvidersVerified = false;
    let hunonicHonestUnconfiguredVerified = false;
    let cronTimezoneVerified = false;

    for (const tabId of settingsTabIds) {
      await cdpA.eval(
        `document.querySelector(${JSON.stringify(`[data-testid="settings-tab-${tabId}"]`)})?.click()`
      );
      await new Promise((r) => setTimeout(r, 220));
      const crumb = await cdpA.eval(
        `document.querySelector('[data-testid="console-header-title"]')?.textContent?.trim() || ''`
      );
      visitedSettingsTabs.push({ tabId, breadcrumb: crumb });

      if (tabId === 'tariffs') {
        waterMethodsVerified = await cdpA.eval(`(() => {
          const sel = document.querySelector('[data-testid="select-default-water-method"]');
          if (!sel) return false;
          const vals = Array.from(sel.options).map((o) => o.value);
          return vals.includes('PER_M3') && vals.includes('PER_PERSON') && vals.includes('FIXED_PER_ROOM');
        })()`);
        await saveShot(cdpA, 'console_v2_1440_settings_tariffs.png');
      } else if (tabId === 'notifications') {
        notifications4ChannelsVerified = await cdpA.eval(`(() => {
          return ['ZALO_OA', 'ZALO_BOT', 'TELEGRAM_BOT', 'FACEBOOK_MESSENGER'].every((k) =>
            Boolean(
              document.querySelector('[data-testid="notification-channel-card-' + k + '"]') ||
              document.querySelector('[data-channel-type="' + k + '"]') ||
              document.querySelector('[data-channel-key="' + k + '"]')
            )
          );
        })()`);
      } else if (tabId === 'payments') {
        payments3ProvidersVerified = await cdpA.eval(`(() => {
          return ['SEPAY', 'PAYOS', 'TINGEE'].every((k) =>
            Boolean(document.querySelector('[data-testid="payment-provider-card-' + k + '"]'))
          );
        })()`);
      } else if (tabId === 'hunonic') {
        hunonicHonestUnconfiguredVerified = await cdpA.eval(`(() => {
          const card = document.querySelector('[data-testid="hunonic-settings-card"]');
          const txt = card?.innerText || '';
          return Boolean(card) && !txt.includes('Hunonic Online') && (txt.includes('UNCONFIGURED') || txt.includes('Chưa cấu hình'));
        })()`);
        await saveShot(cdpA, 'console_v2_1440_settings_hunonic.png');
      } else if (tabId === 'cron') {
        cronTimezoneVerified = await cdpA.eval(
          `(document.querySelector('[data-testid="console-settings-workspace"]')?.innerText || '').includes('Asia/Ho_Chi_Minh')`
        );
      }
    }

    report.phaseC1_shellRedesign.breadcrumbsPeriodAndSettings8Tabs = {
      buildingsRootTitleIsModuleLabel: buildingsRootTitle === 'Tòa nhà & phòng',
      tenantsSubTabShows2ndLevelBreadcrumb: tenantsBreadcrumbTitle === 'Khách thuê',
      financialModuleHasDynamicPeriodToolbar: invoicesPeriodToolbarPresent,
      buildingScopeSelectorHiddenOnSettings: buildingScopeHiddenOnSettings,
      settings8TabsRendered: visitedSettingsTabs.length === 8 && visitedSettingsTabs.every((t) => t.breadcrumb.length > 0),
      water3BillingMethodsSupported: waterMethodsVerified,
      notification4ChannelsRendered: notifications4ChannelsVerified,
      payment3ProvidersRendered: payments3ProvidersVerified,
      hunonicTruthfulUnconfiguredState: hunonicHonestUnconfiguredVerified,
      cronTimezoneAsiaHoChiMinh: cronTimezoneVerified,
    };
    report.phaseC1_shellRedesign.breadcrumbsPeriodAndSettings8Tabs.pass =
      Object.values(
        report.phaseC1_shellRedesign.breadcrumbsPeriodAndSettings8Tabs
      ).every((v) => v === true);

    // Notifications Unread Badge (>0 -> mark all read -> absent from DOM), Global Search (Ctrl+K), Dark/Light Theme
    await cdpA.eval(`document.querySelector('[data-testid="console-nav-overview"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-overview-portfolio-summary"]');

    const unreadBadgeVisibleWhenGreaterThanZero = await cdpA.eval(`(() => {
      const b = document.querySelector('[data-testid="console-notifications-unread-badge"]');
      return Boolean(b && Number(b.textContent?.trim() || '0') > 0);
    })()`);

    await cdpA.eval(`document.querySelector('[data-testid="console-notifications-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-notifications-popover"]');
    await cdpA.eval(`document.querySelector('[data-testid="console-notifications-mark-all-read"]')?.click()`);
    let unreadBadgeRemovedWhenZero = false;
    for (let i = 0; i < 30; i++) {
      unreadBadgeRemovedWhenZero = await cdpA.eval(
        `document.querySelector('[data-testid="console-notifications-unread-badge"]') === null`
      );
      if (unreadBadgeRemovedWhenZero) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    // Close notifications popover
    await cdpA.eval(`document.querySelector('[data-testid="console-notifications-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 150));

    // Global Search Ctrl+K open & Escape close
    await cdpA.eval(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    })()`);
    const searchModalOpened = await waitForSelector(
      cdpA,
      '[data-testid="console-global-search-modal"]',
      20,
      100
    );
    await cdpA.eval(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const searchModalClosedOnEsc = await cdpA.eval(
      `document.querySelector('[data-testid="console-global-search-modal"]') === null`
    );

    // Dark Mode toggle via User Avatar Menu
    await cdpA.eval(`document.querySelector('[data-testid="console-user-menu-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-user-menu-popover"]');
    await cdpA.eval(`document.querySelector('[data-testid="console-theme-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 250));
    const darkClassApplied = await cdpA.eval(
      `document.documentElement.classList.contains('dark')`
    );
    // Close user menu before Dark screenshot
    await cdpA.eval(`document.querySelector('[data-testid="console-user-menu-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 150));
    await saveShot(cdpA, 'console_v2_1440_overview_dark.png');

    // Switch back to Light Mode
    await cdpA.eval(`document.querySelector('[data-testid="console-user-menu-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-user-menu-popover"]');
    await cdpA.eval(`document.querySelector('[data-testid="console-theme-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 200));
    const lightClassRestored = await cdpA.eval(
      `!document.documentElement.classList.contains('dark')`
    );
    await cdpA.eval(`document.querySelector('[data-testid="console-user-menu-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 150));

    report.phaseC1_shellRedesign.notificationsSearchAndTheme = {
      unreadBadgeVisibleWhenGreaterThanZero,
      unreadBadgeCompletelyAbsentWhenZero: unreadBadgeRemovedWhenZero,
      ctrlKOpensGlobalSearch: searchModalOpened,
      escapeClosesGlobalSearch: searchModalClosedOnEsc,
      darkThemeAppliedCleanly: darkClassApplied,
      lightThemeRestoredCleanly: lightClassRestored,
    };
    report.phaseC1_shellRedesign.notificationsSearchAndTheme.pass =
      Object.values(
        report.phaseC1_shellRedesign.notificationsSearchAndTheme
      ).every((v) => v === true);

    // =========================================================================
    // SUITE 3: PHASE C2 POSTGRESQL CRUD, MOBILE CARDS & CROSS-SESSION PERSISTENCE
    // =========================================================================
    console.log('[4/5] Executing Phase C2 PostgreSQL UI CRUD (Building, Floor, Room, Tenant) & Cross-Session Session B test...');

    await cdpA.eval(`document.querySelector('[data-testid="console-nav-buildings"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-buildings-workspace"]');
    await cdpA.eval(`document.querySelector('[data-testid="subtab-buildings-rooms"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="btn-open-create-building"]');

    // 1. Create Building E2EC2 via real UI Modal
    await cdpA.eval(`document.querySelector('[data-testid="btn-open-create-building"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="modal-create-building"]');
    await setControlledInput(cdpA, '[data-testid="input-building-code"]', 'E2EC2');
    await setControlledInput(cdpA, '[data-testid="input-building-name"]', 'Tòa nhà Kiểm thử C2');
    await setControlledInput(cdpA, '[data-testid="input-building-address"]', '99 Nguyễn Cơ Thạch');
    await setControlledInput(cdpA, '[data-testid="input-building-initial-floors"]', '1');
    await cdpA.eval(`document.querySelector('[data-testid="submit-create-building"]')?.click()`);
    const buildingCreatedInUi = await waitForSelector(
      cdpA,
      '[data-testid="building-board-E2EC2"]',
      40,
      150
    );

    const dbBuilding = await prisma.building.findFirst({ where: { code: 'E2EC2' } });
    createdBuildingId = dbBuilding?.id || null;

    // 2. Create Floor 2 in E2EC2 via real UI Modal
    await cdpA.eval(`document.querySelector('[data-testid="btn-add-floor-to-E2EC2"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="modal-create-floor"]');
    await setControlledInput(cdpA, '[data-testid="input-floor-number"]', '2');
    await setControlledInput(cdpA, '[data-testid="input-floor-name"]', 'Tầng 2');
    await cdpA.eval(`document.querySelector('[data-testid="submit-create-floor"]')?.click()`);
    const floorCreatedInUi = await waitForSelector(
      cdpA,
      '[data-testid="floor-section-E2EC2-2"]',
      40,
      150
    );

    // 3. Create Room E2E-101 in E2EC2 (published to Landing) via real UI Modal
    await cdpA.eval(`document.querySelector('[data-testid="btn-add-room-to-E2EC2"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="modal-create-room"]');
    await setControlledInput(cdpA, '[data-testid="input-room-code"]', 'E2E-101');
    await setControlledInput(
      cdpA,
      '[data-testid="input-room-title"]',
      'Studio Kiểm thử C2-101'
    );
    await setControlledInput(cdpA, '[data-testid="input-room-area"]', '30');
    await setControlledInput(cdpA, '[data-testid="input-room-price"]', '5200000');
    await cdpA.eval(`(() => {
      const cb = document.querySelector('[data-testid="checkbox-room-publish-landing"]');
      if (cb && !cb.checked) cb.click();
    })()`);
    await cdpA.eval(`document.querySelector('[data-testid="submit-create-room"]')?.click()`);
    const roomCreatedInUi = await waitForSelector(
      cdpA,
      '[data-testid="room-card-E2EC2-E2E-101"]',
      45,
      150
    );
    await saveShot(cdpA, 'console_v2_1440_buildings_rooms.png');

    const dbRoom = createdBuildingId
      ? await prisma.consoleRoom.findFirst({
          where: { buildingId: createdBuildingId, code: 'E2E-101' },
        })
      : null;
    createdRoomId = dbRoom?.id || null;

    // 4. Create Tenant inside "Tòa nhà & phòng -> Khách thuê" assigned to E2E-101
    await cdpA.eval(`document.querySelector('[data-testid="subtab-buildings-tenants"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="btn-open-create-tenant"]');
    await cdpA.eval(`document.querySelector('[data-testid="btn-open-create-tenant"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="modal-tenant-form"]');
    await setControlledInput(cdpA, '[data-testid="input-tenant-name"]', 'Trần Minh Kiểm Thử');
    await setControlledInput(cdpA, '[data-testid="input-tenant-phone"]', '0918223344');
    await setControlledInput(cdpA, '[data-testid="input-tenant-idnumber"]', '066099112233');
    if (createdBuildingId) {
      await setControlledSelect(
        cdpA,
        '[data-testid="select-tenant-building"]',
        createdBuildingId
      );
      await new Promise((r) => setTimeout(r, 150));
    }
    if (createdRoomId) {
      await setControlledSelect(
        cdpA,
        '[data-testid="select-tenant-room"]',
        createdRoomId
      );
      await new Promise((r) => setTimeout(r, 150));
    }
    await cdpA.eval(`document.querySelector('[data-testid="submit-tenant-form"]')?.click()`);
    const tenantCreatedInUi = await waitForSelector(
      cdpA,
      '[data-testid="tenant-row-0918223344"]',
      40,
      150
    );
    await saveShot(cdpA, 'console_v2_1440_buildings_tenants.png');

    const dbTenant = await prisma.tenant.findFirst({
      where: { phone: '0918223344' },
    });
    createdTenantId = dbTenant?.id || null;

    // Mobile Console (<1024px) Sheet Drawer + Touch Cards Audit at 390x844
    await setViewport(cdpA, { width: 390, height: 844, mobile: true });
    const mobileShellReady = await waitForSelector(
      cdpA,
      '[data-testid="console-mobile-shell"]',
      30,
      150
    );

    // Navigate to Overview on Mobile first
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-menu-trigger"]')?.click()`);
    const drawerOpened1 = await waitForSelector(
      cdpA,
      '[data-testid="console-mobile-drawer"]',
      20,
      100
    );
    const mobileDrawerItemCount = await cdpA.eval(
      `document.querySelectorAll('[data-testid^="console-mobile-nav-"]').length`
    );
    await saveShot(cdpA, 'console_v2_390x844_drawer.png');

    // Test closing Mobile Drawer via Escape
    await cdpA.eval(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    const drawerClosedViaEsc = await cdpA.eval(
      `document.querySelector('[data-testid="console-mobile-drawer"]') === null`
    );

    // Re-open and test closing via Backdrop click
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-menu-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-mobile-drawer"]', 20, 100);
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-drawer-backdrop"]')?.click()`);
    await new Promise((r) => setTimeout(r, 300));
    const drawerClosedViaBackdrop = await cdpA.eval(
      `document.querySelector('[data-testid="console-mobile-drawer"]') === null`
    );

    // Navigate to Overview via Mobile Drawer and screenshot
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-menu-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-mobile-nav-overview"]');
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-nav-overview"]')?.click()`);
    await new Promise((r) => setTimeout(r, 300));
    const mobileOverviewNoOverflow = await cdpA.eval(
      `document.documentElement.scrollWidth <= window.innerWidth`
    );
    await saveShot(cdpA, 'console_v2_390x844_overview.png');

    // Navigate to Buildings & Tenant Touch Cards on Mobile
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-menu-trigger"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-mobile-nav-buildings"]');
    await cdpA.eval(`document.querySelector('[data-testid="console-mobile-nav-buildings"]')?.click()`);
    await waitForSelector(cdpA, '[data-testid="console-buildings-workspace"]');
    await cdpA.eval(`document.querySelector('[data-testid="subtab-buildings-rooms"]')?.click()`);
    await new Promise((r) => setTimeout(r, 250));
    await saveShot(cdpA, 'console_v2_390x844_buildings_cards.png');

    await cdpA.eval(`document.querySelector('[data-testid="subtab-buildings-tenants"]')?.click()`);
    const mobileTenantCardsVisible = await waitForSelector(
      cdpA,
      '[data-testid="tenant-card-0918223344"]',
      25,
      150
    );
    const mobileTenantsAudit = await cdpA.eval(`(() => {
      const cards = document.querySelector('[data-testid="tenants-mobile-cards"]');
      const tableContainer = document.querySelector('[data-testid="tenants-desktop-table-container"]') ||
        document.querySelector('[data-testid="tenants-desktop-table"]')?.closest('.hidden');
      const table = document.querySelector('[data-testid="tenants-desktop-table"]');
      const cStyle = cards ? window.getComputedStyle(cards) : null;
      const tStyle = tableContainer ? window.getComputedStyle(tableContainer) : null;
      return {
        cardsDisplayed: Boolean(cStyle && cStyle.display !== 'none'),
        desktopTableHiddenOnMobile: Boolean(
          (tStyle && tStyle.display === 'none') ||
          (table && table.offsetParent === null)
        ),
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      };
    })()`);
    await saveShot(cdpA, 'console_v2_390x844_tenants_cards.png');

    report.phaseC1_shellRedesign.mobileConsoleDrawerAndCards = {
      mobileShellRenderedAt390: mobileShellReady,
      mobileDrawerOpenedWith10Modules: drawerOpened1 && mobileDrawerItemCount === 10,
      drawerClosedViaEscape: drawerClosedViaEsc,
      drawerClosedViaBackdropClick: drawerClosedViaBackdrop,
      mobileOverviewZeroOverflow: mobileOverviewNoOverflow,
      mobileTenantCardsDisplayed:
        mobileTenantCardsVisible && mobileTenantsAudit.cardsDisplayed,
      desktopTableHiddenOnMobile: mobileTenantsAudit.desktopTableHiddenOnMobile,
      mobileTenantsZeroOverflow: mobileTenantsAudit.noHorizontalOverflow,
    };
    report.phaseC1_shellRedesign.mobileConsoleDrawerAndCards.pass =
      Object.values(
        report.phaseC1_shellRedesign.mobileConsoleDrawerAndCards
      ).every((v) => v === true);

    // 5. Launch completely separate Browser Session B (port 9352, isolated user-data-dir)
    browserB = await launchHeadlessBrowser(9352);
    const cdpB = browserB.cdp;
    await setViewport(cdpB, { width: 1440, height: 900, mobile: false });
    await cdpB.send('Page.navigate', { url: `${CONSOLE_URL}/login` });
    await waitForSelector(cdpB, '[data-testid="console-login-email"]');

    await setControlledInput(cdpB, '[data-testid="console-login-email"]', 'admin@adhome.vn');
    await setControlledInput(
      cdpB,
      '[data-testid="console-login-password"]',
      ephemeralAdminPassword
    );
    await cdpB.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);
    await waitForSelector(cdpB, '[data-testid="console-desktop-header"]', 45, 150);

    await cdpB.eval(`document.querySelector('[data-testid="console-nav-buildings"]')?.click()`);
    const sessionBBuildingFound = await waitForSelector(
      cdpB,
      '[data-testid="building-board-E2EC2"]',
      40,
      150
    );
    const sessionBRoomCardText = await cdpB.eval(
      `document.querySelector('[data-testid="room-card-E2EC2-E2E-101"]')?.innerText || ''`
    );

    await cdpB.eval(`document.querySelector('[data-testid="subtab-buildings-tenants"]')?.click()`);
    const sessionBTenantFound = await waitForSelector(
      cdpB,
      '[data-testid="tenant-row-0918223344"]',
      35,
      150
    );

    // Hard reload Session B and verify persistence holds
    await cdpB.send('Page.reload', { ignoreCache: true });
    await waitForSelector(cdpB, '[data-testid="console-desktop-header"]', 45, 150);
    await cdpB.eval(`document.querySelector('[data-testid="console-nav-buildings"]')?.click()`);
    const persistedAfterHardReload = await waitForSelector(
      cdpB,
      '[data-testid="room-card-E2EC2-E2E-101"]',
      40,
      150
    );

    report.phaseC2_postgresFoundation.uiCrudAndCrossSessionPersistence = {
      buildingCreatedViaUiAndDb: Boolean(buildingCreatedInUi && createdBuildingId),
      floorCreatedViaUiAndDb: floorCreatedInUi,
      roomCreatedViaUiAndDb: Boolean(roomCreatedInUi && createdRoomId),
      tenantCreatedViaUiAndDb: Boolean(tenantCreatedInUi && createdTenantId),
      sessionBSeesBuildingImmediately: sessionBBuildingFound,
      sessionBSeesRoomOccupiedAndWebBadges:
        (sessionBRoomCardText.includes('Đang thuê') || sessionBRoomCardText.includes('Đang ở')) &&
        sessionBRoomCardText.includes('Web'),
      sessionBSeesTenantImmediately: sessionBTenantFound,
      persistedAcrossHardReloadInSessionB: persistedAfterHardReload,
    };
    report.phaseC2_postgresFoundation.uiCrudAndCrossSessionPersistence.pass =
      Object.values(
        report.phaseC2_postgresFoundation.uiCrudAndCrossSessionPersistence
      ).every((v) => v === true);

    // 6. Verify Atomic Public Room Sync & Zero-PII Isolation on /api/v1/public/rooms
    const pubAfterSyncRes = await fetch(`${LANDING_URL}/api/v1/public/rooms`);
    const pubAfterSyncJson = await pubAfterSyncRes.json();
    const pubAfterSyncRaw = JSON.stringify(pubAfterSyncJson);
    const syncedPublicRoom = (pubAfterSyncJson.rooms || pubAfterSyncJson.items || []).find(
      (r) => r.roomCode === 'E2E-101' && r.buildingCode === 'E2EC2'
    );

    report.phaseC2_postgresFoundation.publicSyncAndZeroPii = {
      publishedRoomVisibleOnPublicApi: Boolean(syncedPublicRoom),
      publishedRoomExactIntegerPriceVnd: syncedPublicRoom?.price === 5200000,
      publishedRoomOccupancyReflectedWithoutPii:
        syncedPublicRoom?.status === 'OCCUPIED',
      zeroTenantNameInPublicPayload:
        !pubAfterSyncRaw.includes('Trần Minh Kiểm Thử'),
      zeroTenantPhoneInPublicPayload: !pubAfterSyncRaw.includes('0918223344'),
      zeroTenantIdNumberInPublicPayload: !pubAfterSyncRaw.includes('066099112233'),
    };
    report.phaseC2_postgresFoundation.publicSyncAndZeroPii.pass = Object.values(
      report.phaseC2_postgresFoundation.publicSyncAndZeroPii
    ).every((v) => v === true);

    // 7. Safe Delete Guard & Manager RBAC Scoping Verification
    console.log('[5/5] Verifying Safe Delete dependency guard, Manager RBAC scoping & clean primary-key teardown...');
    const adminApiLogin = await fetch(`${LANDING_URL}/api/v1/console/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@adhome.vn',
        password: ephemeralAdminPassword,
      }),
    }).then((r) => r.json());
    const adminToken = adminApiLogin.token;

    const roomDeleteCheckRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/rooms/${createdRoomId}/delete-check`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const roomDeleteCheckBody = await roomDeleteCheckRes.json();

    const blockedRoomDeleteRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/rooms/${createdRoomId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const blockedBuildingDeleteRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/buildings/${createdBuildingId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    // Provision temporary Manager scoped ONLY to an existing non-E2EC2 building
    const otherBuilding = await prisma.building.findFirst({
      where: {
        orgId: 'org-adhome-anphu',
        isActive: true,
        id: { not: createdBuildingId || '' },
      },
      orderBy: { code: 'asc' },
    });
    const managerPassword = `AdHome@MgrC2!${crypto.randomBytes(5).toString('hex')}`;
    const managerHash = await hashPassword(managerPassword);
    const tempManager = await prisma.consoleActor.create({
      data: {
        id: `usr-mgr-c2-${crypto.randomBytes(3).toString('hex')}`,
        orgId: 'org-adhome-anphu',
        email: 'manager.c2.test@adhome.vn',
        displayName: 'Quản lý Tòa Kiểm thử C2',
        role: 'MANAGER',
        permissions: [
          'overview.read',
          'rooms.read',
          'rooms.manage',
          'tenants.manage',
          'deposits.manage',
          'contracts.manage',
          'settlements.manage',
          'invoices.manage',
          'payments.manage',
          'reports.read',
          'leads.read',
        ],
        buildingScopes: otherBuilding ? [otherBuilding.id] : [],
        isActive: true,
        sessionVersion: 1,
        passwordHash: managerHash,
        passwordUpdatedAt: new Date(),
      },
    });
    createdManagerId = tempManager.id;

    // Log out Session B Admin and log in as Manager
    await cdpB.eval(`document.querySelector('[data-testid="console-user-menu-trigger"]')?.click()`);
    await waitForSelector(cdpB, '[data-testid="console-logout-button"]');
    await cdpB.eval(`document.querySelector('[data-testid="console-logout-button"]')?.click()`);
    await waitForSelector(cdpB, '[data-testid="console-login-email"]');

    await setControlledInput(
      cdpB,
      '[data-testid="console-login-email"]',
      'manager.c2.test@adhome.vn'
    );
    await setControlledInput(
      cdpB,
      '[data-testid="console-login-password"]',
      managerPassword
    );
    await cdpB.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);
    await waitForSelector(cdpB, '[data-testid="console-desktop-header"]', 45, 150);
    await new Promise((r) => setTimeout(r, 350));

    const managerUiAudit = await cdpB.eval(`(() => {
      const items = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]')).map(
        (el) => el.querySelector('span')?.textContent?.trim() || ''
      );
      const roleBadge = document.querySelector('[data-testid="console-actor-role-badge"]')?.textContent?.trim() || '';
      const bodyText = document.body.innerText || '';
      return {
        roleBadge,
        visibleModuleCount: items.length,
        financeHidden: !items.includes('Thu chi và sổ quỹ'),
        settingsHidden: !items.includes('Cài đặt & Thiết lập'),
        unassignedBuildingHiddenFromDom: !bodyText.includes('E2EC2'),
      };
    })()`);
    await saveShot(cdpB, 'console_v2_1440_manager_scoped.png');

    const mgrLoginRes = await fetch(`${LANDING_URL}/api/v1/console/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager.c2.test@adhome.vn',
        password: managerPassword,
      }),
    }).then((r) => r.json());
    const mgrToken = mgrLoginRes.token;

    const [mgrSettingsRes, mgrFinanceRes, mgrUnassignedMutRes] =
      await Promise.all([
        fetch(`${LANDING_URL}/api/v1/console/v2/settings`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
        }),
        fetch(`${LANDING_URL}/api/v1/console/v2/module-data?module=finance`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
        }),
        fetch(`${LANDING_URL}/api/v1/console/v2/buildings/${createdBuildingId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${mgrToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Unauthorized Rename' }),
        }),
      ]);

    report.phaseC2_postgresFoundation.safeDeleteAndManagerRbac = {
      deleteCheckBlocksOccupiedRoom:
        roomDeleteCheckRes.status === 200 &&
        roomDeleteCheckBody.canHardDelete === false,
      deleteOccupiedRoomBlocked409: blockedRoomDeleteRes.status === 409,
      deleteOccupiedBuildingBlocked409: blockedBuildingDeleteRes.status === 409,
      managerRoleBadgeDerivedFromDb:
        managerUiAudit.roleBadge.toUpperCase() === 'MANAGER',
      managerSidebarScopedTo8PermittedModules:
        managerUiAudit.visibleModuleCount === 8 &&
        managerUiAudit.financeHidden &&
        managerUiAudit.settingsHidden,
      managerCannotSeeUnassignedBuildingInDom:
        managerUiAudit.unassignedBuildingHiddenFromDom,
      managerSettingsApiForbidden403: mgrSettingsRes.status === 403,
      managerFinanceApiForbidden403: mgrFinanceRes.status === 403,
      managerUnassignedBuildingMutationForbidden403:
        mgrUnassignedMutRes.status === 403,
    };
    report.phaseC2_postgresFoundation.safeDeleteAndManagerRbac.pass =
      Object.values(
        report.phaseC2_postgresFoundation.safeDeleteAndManagerRbac
      ).every((v) => v === true);

    // 8. Clean Primary-Key Teardown via Real APIs & Prisma exact IDs
    const delTenantRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/tenants/${createdTenantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const delRoomRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/rooms/${createdRoomId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const delBuildingRes = await fetch(
      `${LANDING_URL}/api/v1/console/v2/buildings/${createdBuildingId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (createdBuildingId || createdRoomId || createdTenantId) {
      const entityIds = [
        createdBuildingId,
        createdRoomId,
        createdTenantId,
      ].filter(Boolean);
      await prisma.consoleAuditLog.deleteMany({
        where: {
          OR: [
            { entityId: { in: entityIds } },
            ...(createdBuildingId ? [{ buildingId: createdBuildingId }] : []),
          ],
        },
      });
      await prisma.seoSyncJob.deleteMany({
        where: {
          roomSlug: { contains: 'e2ec2' },
        },
      });
    }

    if (createdManagerId) {
      await prisma.consoleActor.delete({ where: { id: createdManagerId } });
      createdManagerId = null;
    }
    if (createdLeadIds.length > 0) {
      await prisma.consoleNotificationRead.deleteMany({
        where: {
          notificationKey: { in: createdLeadIds.map((id) => `lead:${id}`) },
        },
      });
      await prisma.leadInquiry.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
      createdLeadIds.length = 0;
    }

    const [remBld, remRm, remTen] = await Promise.all([
      prisma.building.count({ where: { code: 'E2EC2' } }),
      prisma.consoleRoom.count({ where: { code: 'E2E-101' } }),
      prisma.tenant.count({ where: { phone: '0918223344' } }),
    ]);

    createdTenantId = null;
    createdRoomId = null;
    createdBuildingId = null;

    report.phaseC2_postgresFoundation.cleanDatabaseTeardown = {
      deleteTenant200: delTenantRes.status === 200,
      deleteRoomAfterUnassign200: delRoomRes.status === 200,
      deleteBuildingAfterEmpty200: delBuildingRes.status === 200,
      zeroResidualTestEntitiesInPostgres:
        remBld === 0 && remRm === 0 && remTen === 0,
    };
    report.phaseC2_postgresFoundation.cleanDatabaseTeardown.pass = Object.values(
      report.phaseC2_postgresFoundation.cleanDatabaseTeardown
    ).every((v) => v === true);

    const gate = evaluateConsoleV2Gate(report);
    report.overallVerdict = gate.verdict;
    report.qualityGatePassed = gate.passed;
    report.qualityGateIssues = gate.issues;

    const jsonOutput = JSON.stringify(report, null, 2);
    const evidenceJsonPath = path.join(
      EVIDENCE_DIR,
      'console_v2_c1_c2_verification.json'
    );
    const artifactJsonPath = path.join(
      ARTIFACT_DIR,
      'console_v2_c1_c2_verification.json'
    );
    fs.writeFileSync(evidenceJsonPath, jsonOutput, 'utf-8');
    fs.writeFileSync(artifactJsonPath, jsonOutput, 'utf-8');

    console.log('\n============================================================');
    console.log(`  CONSOLE V2 C1/C2 GATE VERDICT: ${report.overallVerdict}`);
    console.log(`  Evidence JSON: ${evidenceJsonPath}`);
    console.log(`  Artifact JSON: ${artifactJsonPath}`);
    console.log('============================================================\n');

    return report;
  } finally {
    if (browserB) await browserB.cleanup();
    if (browserA) await browserA.cleanup();
    await killProcessTreeWindows(consoleProc);
    await killProcessTreeWindows(landingProc);

    // Defensive cleanup if an unexpected exception interrupted before step 8
    try {
      if (createdTenantId) {
        await prisma.tenant.deleteMany({ where: { id: createdTenantId } });
      }
      if (createdRoomId) {
        const r = await prisma.consoleRoom.findUnique({ where: { id: createdRoomId } });
        await prisma.consoleRoom.deleteMany({ where: { id: createdRoomId } });
        if (r?.publicListingId) {
          await prisma.publicRoomListing.deleteMany({ where: { id: r.publicListingId } });
        }
      }
      if (createdBuildingId) {
        await prisma.floor.deleteMany({ where: { buildingId: createdBuildingId } });
        await prisma.building.deleteMany({ where: { id: createdBuildingId } });
      }
      if (createdManagerId) {
        await prisma.consoleActor.deleteMany({ where: { id: createdManagerId } });
      }
      if (createdLeadIds.length > 0) {
        await prisma.consoleNotificationRead.deleteMany({
          where: {
            notificationKey: { in: createdLeadIds.map((id) => `lead:${id}`) },
          },
        });
        await prisma.leadInquiry.deleteMany({
          where: { id: { in: createdLeadIds } },
        });
      }
      if (originalAdminSnapshot) {
        await prisma.consoleActor.update({
          where: { id: PROD_ADMIN_ID },
          data: {
            email: originalAdminSnapshot.email,
            isActive: originalAdminSnapshot.isActive,
            passwordHash: originalAdminSnapshot.passwordHash,
            passwordUpdatedAt: originalAdminSnapshot.passwordUpdatedAt,
            sessionVersion: originalAdminSnapshot.sessionVersion,
          },
        });
      }
    } catch (cleanupErr) {
      console.error('[Cleanup Warning]', cleanupErr);
    }

    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith('verifyConsoleV2C1C2.mjs')) {
  runVerification()
    .then((res) => {
      if (!res.qualityGatePassed) {
        console.error('Quality Gate FAILED:', res.qualityGateIssues);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during Console V2 C1/C2 verification:', err);
      process.exit(1);
    });
}

