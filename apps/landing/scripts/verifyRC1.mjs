import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { runBackupAndRestoreVerification } from './verifyBackupRestoreRC1.mjs';
import { runSustainedLoadTestSuite } from './sustainedLoadTestRC1.mjs';
import { purgeTestLeads } from './purgeTestLeads.mjs';
import { auditAndSanitizeProductionDb } from './auditAndSanitizeProductionDb.mjs';
import { provisionProductionAdmin } from './provisionProductionAdmin.mjs';
import { assertSecurityConfiguration } from '../server/authRbac.ts';
import { loadAdhomeEnv } from '../server/envLoader.js';
import { evaluateQualityGate } from './qualityGateCore.mjs';

loadAdhomeEnv();

const BASE_URL = process.env.RC1_BASE_URL || 'http://127.0.0.1:8081';
const CANONICAL_ORIGIN = 'https://adhome.vn';
const CONSOLE_ORIGIN = 'https://console.adhome.vn';
const CONSOLE_LOGIN_URL = 'https://console.adhome.vn/login';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';
const RC1_OUTPUT_DIR = path.join(process.cwd(), 'docs', 'evidence', 'rc1');

const ACTIVE_KEY_ID = 'k4-2026-10';
const PREVIOUS_KEY_ID = 'k3-2026-10';
const BURNED_OLD_KEY_ID = 'k2-2026-10';

const ACTIVE_SECRET = process.env.ADHOME_CONSOLE_JWT_SECRET;
const PREVIOUS_SECRET = process.env.ADHOME_CONSOLE_JWT_SECRET_PREV;
const BURNED_OLD_SECRET = 'adhome-v2-console-hmac-secret-daklak-2026-k2';

if (!ACTIVE_SECRET || ACTIVE_SECRET.length < 32) {
  throw new Error(
    'FATAL: ADHOME_CONSOLE_JWT_SECRET must be set in environment or .env. Refusing to run with insecure credentials.'
  );
}

export function getBaselinePassReportFixture() {
  return {
    rc01_uiPolish: {
      mobileNavigation: { pass: true },
      leadInquiryModal: { pass: true },
    },
    rc02_canonicalDomain: {
      pass: true,
      legacyDomain301RedirectLanding: true,
      legacyDomain301RedirectConsole: true,
    },
    rc03_backendSecurityAndRbac: {
      pass: true,
      productionAdminLoginApi: true,
      missingPasswordBlocked400: true,
      wrongPasswordBlocked401: true,
      inactiveSampleActorLoginBlocked401: true,
      unauthenticatedRumResetBlocked401: true,
      managerRumResetForbidden403: true,
      consoleDualRoleUiE2ePass: true,
    },
    rc04_sustainedLoadTesting: { pass: true },
    rc05_databaseAndSeo: { pass: true },
    rc06_coreWebVitals: {
      lcpMs: 80,
      clsScore: 0.0,
      maxInpMs: 40,
      pass: true,
      serverRumSummary: {
        metrics: {
          CLS: { count: 10, p50: 0.0, p75: 0.0, p95: 0.0, max: 0.0 },
        },
      },
    },
  };
}

// Dry-run Quality Gate evaluation handler for subprocess-level testing
if (process.argv.includes('--dry-run-gate-only')) {
  const failureArg = process.argv.find((a) => a.startsWith('--simulate-failure='));
  const failureType = failureArg ? failureArg.split('=')[1] : null;
  const fixture = getBaselinePassReportFixture();

  if (failureType === 'cls') {
    fixture.rc06_coreWebVitals.clsScore = 0.25;
  } else if (failureType === 'lcp') {
    fixture.rc06_coreWebVitals.lcpMs = 3200;
  } else if (failureType === 'lcp-zero') {
    fixture.rc06_coreWebVitals.lcpMs = 0;
  } else if (failureType === 'inp') {
    fixture.rc06_coreWebVitals.maxInpMs = 280;
  } else if (failureType === 'admin-login') {
    fixture.rc03_backendSecurityAndRbac.productionAdminLoginApi = false;
  } else if (failureType === 'missing-password-pass') {
    fixture.rc03_backendSecurityAndRbac.missingPasswordBlocked400 = false;
  } else if (failureType === 'wrong-password-pass') {
    fixture.rc03_backendSecurityAndRbac.wrongPasswordBlocked401 = false;
  } else if (failureType === 'seo') {
    fixture.rc02_canonicalDomain.legacyDomain301RedirectLanding = false;
    fixture.rc02_canonicalDomain.pass = false;
  } else if (failureType === 'lead') {
    fixture.rc01_uiPolish.leadInquiryModal.pass = false;
  } else if (failureType === 'server-rum-cls') {
    fixture.rc06_coreWebVitals.serverRumSummary.metrics.CLS.p75 = 0.18;
  } else if (failureType === 'server-rum-cls-max') {
    fixture.rc06_coreWebVitals.serverRumSummary.metrics.CLS.p75 = 0.0;
    fixture.rc06_coreWebVitals.serverRumSummary.metrics.CLS.max = 0.1137;
  } else if (failureType === 'rum-reset-unprotected') {
    fixture.rc03_backendSecurityAndRbac.unauthenticatedRumResetBlocked401 = false;
  } else if (failureType === 'console-dual-role') {
    fixture.rc03_backendSecurityAndRbac.consoleDualRoleUiE2ePass = false;
  }

  const evaluation = evaluateQualityGate(fixture);
  console.log(`[DRY-RUN GATE] verdict=${evaluation.verdict} passed=${evaluation.passed}`);
  if (!evaluation.passed) {
    console.error(`Issues:\n - ${evaluation.issues.join('\n - ')}`);
    process.exit(1);
  }
  console.log('All criteria satisfied in dry run.');
  process.exit(0);
}

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

async function launchHeadlessBrowser(port = 9348) {
  const exe = findBrowserExecutable();
  const profileDir = path.join(
    process.cwd(),
    `.chrome-profile-rc1-${port}-${Date.now()}`
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
  await cdp.send('Network.enable');

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
 * Dispatches native CDP mouse input onto `selector` and waits for PerformanceObserver event entry
 */
async function nativeClickAndMeasureInp(cdp, selector, label) {
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

  // Wait with active poll for PerformanceObserver('event') callback to record entry
  let measurement = null;
  for (let poll = 0; poll < 10; poll++) {
    await new Promise((r) => setTimeout(r, 35));
    measurement = await cdp.eval(`(() => {
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
    if (measurement?.newEventCount > 0) break;
  }

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
  await new Promise((r) => setTimeout(r, 120));

  const keyStats = await cdp.eval(`(() => {
    const rum = window.__ADHOME_RUM__;
    const newEvents = rum ? rum.inpEvents.slice(${prevCount}) : [];
    const maxDur = newEvents.reduce((m, e) => Math.max(m, e.duration || 0), 0);
    return { count: newEvents.length, maxKeyEventTimingMs: maxDur };
  })()`);

  const perCharMs =
    Math.round((totalTypingMs / Math.max(1, text.length)) * 100) / 100;
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

async function setViewportClean(cdp, metrics) {
  // Always navigate to about:blank BEFORE changing device metrics so CDP viewport
  // morphing never triggers synthetic layout-shift entries on a live page.
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await new Promise((r) => setTimeout(r, 150));
  await cdp.send('Emulation.setDeviceMetricsOverride', metrics);
  await new Promise((r) => setTimeout(r, 100));
}

async function probeLivePublicDomains() {
  const targets = [
    { name: 'landing', hostname: 'adhome.vn', url: 'https://adhome.vn/' },
    { name: 'consoleLogin', hostname: 'console.adhome.vn', url: 'https://console.adhome.vn/login' },
  ];
  const results = {};

  for (const t of targets) {
    const entry = {
      url: t.url,
      hostname: t.hostname,
      dnsResolved: false,
      ipv4Addresses: [],
      cnameRecords: [],
      dnsError: null,
      httpsReachable: false,
      httpStatus: null,
      httpsError: null,
    };

    try {
      entry.ipv4Addresses = await dns.resolve4(t.hostname);
      entry.dnsResolved = entry.ipv4Addresses.length > 0;
    } catch (err) {
      entry.dnsError = err?.code || err?.message || String(err);
    }

    try {
      entry.cnameRecords = await dns.resolveCname(t.hostname);
      if (entry.cnameRecords.length > 0) entry.dnsResolved = true;
    } catch {
      // CNAME optional when A record or NXDOMAIN
    }

    if (entry.dnsResolved) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(t.url, {
          method: 'GET',
          redirect: 'manual',
          signal: ctrl.signal,
        });
        entry.httpsReachable = true;
        entry.httpStatus = res.status;
      } catch (err) {
        entry.httpsError = err?.cause?.code || err?.message || String(err);
      } finally {
        clearTimeout(timer);
      }
    } else {
      entry.httpsError = 'SKIPPED_DNS_NOT_PROVISIONED_YET';
    }

    results[t.name] = entry;
  }

  return {
    checkedAt: new Date().toISOString(),
    environmentNote:
      results.landing?.httpsReachable && results.consoleLogin?.httpsReachable
        ? 'PUBLIC_PRODUCTION_DNS_AND_HTTPS_LIVE'
        : 'LOCAL_WORKSTATION_VERIFIED_PENDING_EXTERNAL_DNS_CUTOVER',
    targets: results,
  };
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
        headers: {
          Host: hostHeader,
        },
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

async function runSecuritySeoAndDomainAudit() {
  console.log('\n--- Running Backend Security, RBAC, Domain & SEO Audits ---');

  // 1. Canonical Domain & Links Audits + Legacy Domain 301 Redirect Checks
  console.log('Auditing canonical links, robots.txt, sitemaps, and legacy 301 redirects...');
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  const robotsText = await robotsRes.text();
  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapXml = await sitemapRes.text();

  const legacyLandingRedirectRes = await rawHttpGetWithHost(
    BASE_URL,
    '/phong-trong',
    'adhome.ductinh.one'
  );
  const legacyConsoleRedirectOnApiHostRes = await rawHttpGetWithHost(
    BASE_URL,
    '/login',
    'console-adhome.ductinh.one'
  );

  const domainAudit = {
    robotsSitemapLine: robotsText.includes(
      `Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`
    ),
    sitemapHasZeroOldDomains: !sitemapXml.includes('ductinh.one'),
    sitemapHasCanonicalOrigin: sitemapXml.includes(
      `<loc>${CANONICAL_ORIGIN}/</loc>`
    ),
    sitemapHasCatalogOrigin: sitemapXml.includes(
      `<loc>${CANONICAL_ORIGIN}/phong-trong</loc>`
    ),
    sitemapHasRoomOrigin: sitemapXml.includes(
      `<loc>${CANONICAL_ORIGIN}/phong/studio-ban-cong-31-06-lk01-31-an-phu</loc>`
    ),
    legacyLanding301Status: legacyLandingRedirectRes.status,
    legacyLanding301Location: legacyLandingRedirectRes.location,
    legacyLanding301Pass:
      legacyLandingRedirectRes.status === 301 &&
      legacyLandingRedirectRes.location === 'https://adhome.vn/phong-trong',
    legacyConsole301OnApiHostPass:
      legacyConsoleRedirectOnApiHostRes.status === 301 &&
      legacyConsoleRedirectOnApiHostRes.location === 'https://console.adhome.vn/login',
  };

  // 1b. Boot Security Assertion Verification
  let bootSecurityPass = false;
  let missingSecretThrowsFatal = false;
  try {
    const bootCheck = assertSecurityConfiguration();
    if (bootCheck.activeKeyId === ACTIVE_KEY_ID) {
      bootSecurityPass = true;
    }
  } catch {
    bootSecurityPass = false;
  }

  // Temporarily wipe secret to test fail-fast fatal exception
  const originalSecret = process.env.ADHOME_CONSOLE_JWT_SECRET;
  try {
    process.env.ADHOME_CONSOLE_JWT_SECRET = 'short';
    assertSecurityConfiguration();
  } catch (err) {
    if (err.message.includes('FATAL SECURITY CONFIGURATION')) {
      missingSecretThrowsFatal = true;
    }
  } finally {
    process.env.ADHOME_CONSOLE_JWT_SECRET = originalSecret;
  }

  // 1c. Security Context Protection & Unauthenticated RUM Reset Protection
  const publicContextRes = await fetch(`${BASE_URL}/api/v1/public/security/context`);
  const publicSecurityContextBlocked =
    publicContextRes.status === 404 || publicContextRes.status === 401;

  const unauthConsoleRes = await fetch(`${BASE_URL}/api/v1/console/security/context`);
  const unauthConsoleBlocked = unauthConsoleRes.status === 401;

  // Verify unauthenticated POST /api/v1/public/rum/reset is strictly rejected with 401
  const unauthRumResetRes = await fetch(`${BASE_URL}/api/v1/public/rum/reset`, {
    method: 'POST',
  });
  const unauthenticatedRumResetBlocked401 = unauthRumResetRes.status === 401;

  // 1d-1. Enable Console Login and Provision authentic admin (admin@adhome.vn) with secure scrypt password
  process.env.ADHOME_CONSOLE_LOGIN_ENABLED = 'true';
  const TEST_ADMIN_PASSWORD = 'AdHome@SuperAdmin2026!#Scrypt';
  await provisionProductionAdmin({
    email: 'admin@adhome.vn',
    newPassword: TEST_ADMIN_PASSWORD,
    forceActivate: true,
  });

  // Invalidate any dangling sessions from previous runs
  await auditAndSanitizeProductionDb({ deactivateSampleActors: true, invalidateAllSessions: true });

  // Authenticate using authentic production admin: usr-admin-prod (admin@adhome.vn)
  const prodAdminActor = await prisma.consoleActor.findUnique({
    where: { id: 'usr-admin-prod' },
  });
  const { token: prodAdminToken } = signToken({
    sub: 'usr-admin-prod',
    role: 'ADMIN',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    sessionVersion: prodAdminActor?.sessionVersion ?? 1,
  });

  // Authenticated Admin RUM reset succeeds (200)
  const adminRumResetRes = await fetch(`${BASE_URL}/api/v1/public/rum/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${prodAdminToken}` },
  });
  const adminRumResetAuthorized200 = adminRumResetRes.status === 200;

  const contextRes = await fetch(`${BASE_URL}/api/v1/console/security/context`, {
    headers: {
      Authorization: `Bearer ${prodAdminToken}`,
      'X-Forwarded-For': '203.0.113.195',
      'CF-Connecting-IP': '203.0.113.195',
    },
  });
  const contextData = await contextRes.json();
  const trustProxyConfigValid =
    publicSecurityContextBlocked &&
    unauthConsoleBlocked &&
    contextRes.status === 200 &&
    contextData.ok === true &&
    typeof contextData.clientIp === 'string' &&
    Array.isArray(contextData.trustedProxiesConfigured);

  // 1d-2. Test negative login cases: Missing password (must return 400)
  const missingPwRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@adhome.vn' }),
  });
  const missingPasswordBlocked400 = missingPwRes.status === 400;

  // 1d-3. Test negative login cases: Null password (must return 400)
  const nullPwRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@adhome.vn', password: null }),
  });
  const nullPasswordBlocked400 = nullPwRes.status === 400;

  // 1d-4. Test negative login cases: Empty password (must return 400)
  const emptyPwRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@adhome.vn', password: '' }),
  });
  const emptyPasswordBlocked400 = emptyPwRes.status === 400;

  // 1d-5. Test negative login cases: Wrong password (must return 401)
  const wrongPwRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@adhome.vn', password: 'WrongPassword999!' }),
  });
  const wrongPasswordBlocked401 = wrongPwRes.status === 401;

  // 1d-6. Deactivated sample actor login blocked (401 ACCOUNT_DEACTIVATED)
  const sampleLoginRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev.sample.admin@adhome.internal', password: 'SomePassword123!' }),
  });
  const inactiveSampleActorLoginBlocked401 = sampleLoginRes.status === 401;

  // 1d-7. Authentic Production Admin Login API with scrypt credentials + HttpOnly Set-Cookie
  const prodLoginRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@adhome.vn',
      password: TEST_ADMIN_PASSWORD,
    }),
  });
  const prodLoginSetCookie = prodLoginRes.headers.get('set-cookie') || '';
  const prodLoginBody = await prodLoginRes.json();
  const productionAdminLoginApi =
    prodLoginRes.status === 200 &&
    prodLoginBody.ok === true &&
    typeof prodLoginBody.token === 'string' &&
    prodLoginSetCookie.includes('adhome_console_session=') &&
    prodLoginSetCookie.toLowerCase().includes('httponly') &&
    prodLoginBody.actor?.id === 'usr-admin-prod' &&
    prodLoginBody.actor?.role === 'ADMIN';

  // 1d-8. Verify the issued token from real login is authorized on protected endpoints
  const loginTokenContextRes = await fetch(`${BASE_URL}/api/v1/console/security/context`, {
    headers: { Authorization: `Bearer ${prodLoginBody.token}` },
  });
  const productionAdminTokenAuthorized =
    loginTokenContextRes.status === 200 && contextRes.status === 200;

  // Verify that dev sample actors are deactivated and strictly rejected (401)
  const { token: inactiveSampleToken } = signToken({
    sub: 'usr-admin-01',
    role: 'ADMIN',
    orgId: 'org-adhome-anphu',
    email: 'dev.sample.admin@adhome.internal',
    sessionVersion: 1,
  });
  const inactiveSampleRes = await fetch(`${BASE_URL}/api/v1/console/security/context`, {
    headers: { Authorization: `Bearer ${inactiveSampleToken}` },
  });
  const inactiveSampleActorBlocked401 = inactiveSampleRes.status === 401;

  // 1d-9. Sample Actor Production Audit Verification
  const auditReport = await auditAndSanitizeProductionDb({ deactivateSampleActors: true });
  const sampleActorsAudited =
    auditReport.actors.sampleDevActorsCount === 4 &&
    auditReport.actors.allSampleActorsDeactivated === true &&
    auditReport.actors.genuineActorsCount >= 1 &&
    auditReport.actors.genuineAdminHasPassword === true &&
    auditReport.actors.allActiveGenuineActorsHavePassword === true;

  // 2. Public Write Method Rejection (405 Method Not Allowed)
  const roomWriteStatuses = {};
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await fetch(`${BASE_URL}/api/v1/public/rooms`, { method });
    roomWriteStatuses[method] = r.status;
  }
  const publicRoomsWriteBlocked = Object.values(roomWriteStatuses).every(
    (s) => s === 405
  );

  // 2b. Rate Limiting Enforcement & Client Bypass Immunity Check (HTTP 429)
  // Verify that an external client cannot spam inquiries, and cannot bypass via arbitrary headers
  const rateLimitClientIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  let rateLimitHit429 = false;
  let bypassHeaderIneffective = false;
  const rateLimitCreatedIds = [];

  for (let i = 1; i <= 15; i++) {
    const rlRes = await fetch(`${BASE_URL}/api/v1/public/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': rateLimitClientIp,
        // Attempt arbitrary bypass headers - must be ignored/ineffective!
        'x-rate-limit-key': `malicious-bypass-${i}`,
        'x-load-test-bypass-ratelimit': '1',
      },
      body: JSON.stringify({
        fullName: `Spam Tester ${i}`,
        phone: '0901234567',
        privacyConsent: true,
      }),
    });

    if (rlRes.status === 201) {
      const body = await rlRes.json();
      if (body?.id) rateLimitCreatedIds.push(body.id);
    } else if (rlRes.status === 429) {
      rateLimitHit429 = true;
      const rlBody = await rlRes.json();
      if (rlBody.errorCode === 'RATE_LIMITED') {
        bypassHeaderIneffective = true;
      }
      break;
    }
  }

  // Clean up any lead inquiry created during rate limit check strictly by in-memory primary key ID
  if (rateLimitCreatedIds.length > 0) {
    await prisma.leadInquiry.deleteMany({
      where: { id: { in: rateLimitCreatedIds } },
    });
  }

  // Temporarily activate scoped test actors for RBAC verification
  await prisma.consoleActor.updateMany({
    where: { id: { in: ['usr-viewer-01', 'usr-mgr-lk01'] } },
    data: { isActive: true },
  });

  // Fetch current session versions from PostgreSQL
  const [viewerActor, mgrActor, adminActor] = await Promise.all([
    prisma.consoleActor.findUnique({ where: { id: 'usr-viewer-01' } }),
    prisma.consoleActor.findUnique({ where: { id: 'usr-mgr-lk01' } }),
    prisma.consoleActor.findUnique({ where: { id: 'usr-admin-prod' } }),
  ]);
  const { token: adminToken } = signToken({
    sub: 'usr-admin-prod',
    role: 'ADMIN',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    sessionVersion: adminActor?.sessionVersion ?? 1,
  });

  // 3. Unauthenticated Console Access Rejection (401)
  const unauthRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const unauthBody = await unauthRes.json();

  // 4. Role-Based Access Control: VIEWER Role Rejection (403 FORBIDDEN)
  const { token: viewerToken } = signToken({
    sub: 'usr-viewer-01',
    role: 'VIEWER',
    orgId: 'org-adhome-anphu',
    email: 'viewer@adhome.vn',
    sessionVersion: viewerActor?.sessionVersion ?? 1,
  });
  const viewerRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ price: 5500000 }),
    }
  );
  const viewerBody = await viewerRes.json();

  // 5. Building Scope Authorization: Manager LK01 forbidden on LK08 (403) & forbidden on RUM reset (403)
  const { token: mgrLk01Token } = signToken({
    sub: 'usr-mgr-lk01',
    role: 'BUILDING_MANAGER',
    orgId: 'org-adhome-anphu',
    buildingIds: ['bld-lk01-31', 'bld-lk01-32'],
    email: 'dev.sample.mgr.lk01@adhome.internal',
    sessionVersion: mgrActor?.sessionVersion ?? 1,
  });
  const mgrRumResetRes = await fetch(`${BASE_URL}/api/v1/public/rum/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrLk01Token}` },
  });
  const managerRumResetForbidden403 = mgrRumResetRes.status === 403;

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

  // 6. Secret Rotation: Token signed with PREVIOUS_KEY_ID (`k3-2026-10`) is accepted
  const { token: rotatedPrevKeyToken } = signToken(
    {
      sub: 'usr-admin-prod',
      email: 'admin@adhome.vn',
      sessionVersion: adminActor?.sessionVersion ?? 1,
    },
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
      body: JSON.stringify({ price: 5000000 }),
    }
  );
  const rotatedPrevBody = await rotatedPrevRes.json();

  // 6b. Burned/Revoked Old Key (`k2-2026-10`) must be strictly REJECTED (HTTP 401)
  const { token: burnedOldKeyToken } = signToken(
    {
      sub: 'usr-admin-prod',
      email: 'admin@adhome.vn',
      sessionVersion: adminActor?.sessionVersion ?? 1,
    },
    { secret: BURNED_OLD_SECRET, kid: BURNED_OLD_KEY_ID }
  );
  const burnedOldKeyRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${burnedOldKeyToken}`,
      },
      body: JSON.stringify({ price: 5000000 }),
    }
  );
  const burnedOldKeyBody = await burnedOldKeyRes.json();

  // 7. Token Revocation by JTI
  const { token: revocableToken, jti: revocableJti } = signToken({
    sub: 'usr-admin-prod',
    email: 'admin@adhome.vn',
    sessionVersion: adminActor?.sessionVersion ?? 1,
  });
  const revokeCallRes = await fetch(`${BASE_URL}/api/v1/console/auth/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${revocableToken}`,
    },
    body: JSON.stringify({
      jti: revocableJti,
      reason: 'RC1_SECURITY_REVOKE_TEST',
    }),
  });
  const revokeCallBody = await revokeCallRes.json();

  const afterRevokeRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${revocableToken}`,
      },
      body: JSON.stringify({ price: 5000000 }),
    }
  );
  const afterRevokeBody = await afterRevokeRes.json();

  // 8. Session Version Invalidation
  const currentMgrActor = await prisma.consoleActor.findUnique({
    where: { id: 'usr-mgr-lk01' },
  });
  const prevSessionVersion = currentMgrActor?.sessionVersion ?? 1;

  const { token: preInvalidationToken } = signToken({
    sub: 'usr-mgr-lk01',
    role: 'BUILDING_MANAGER',
    orgId: 'org-adhome-anphu',
    buildingIds: ['bld-lk01-31', 'bld-lk01-32'],
    email: 'manager.lk01@adhome.vn',
    sessionVersion: prevSessionVersion,
  });

  const { token: sessionBumpAdminToken } = signToken({
    sub: 'usr-admin-prod',
    role: 'ADMIN',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    sessionVersion: adminActor?.sessionVersion ?? 1,
  });

  const bumpSessionRes = await fetch(`${BASE_URL}/api/v1/console/auth/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionBumpAdminToken}`,
    },
    body: JSON.stringify({
      actorId: 'usr-mgr-lk01',
      invalidateAllSessions: true,
      reason: 'RC1_SESSION_BUMP_TEST',
    }),
  });
  const bumpSessionBody = await bumpSessionRes.json();

  const rejectedBySessionRes = await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${preInvalidationToken}`,
      },
      body: JSON.stringify({ price: 5000000 }),
    }
  );
  const rejectedBySessionBody = await rejectedBySessionRes.json();

  // Deactivate all dev sample actors immediately to restore strictly secured state
  await prisma.consoleActor.updateMany({
    where: { id: { in: ['usr-viewer-01', 'usr-mgr-lk01', 'usr-admin-01', 'usr-other-org-01'] } },
    data: { isActive: false },
  });

  // 9. Zero Private Data Leakage
  const publicRoomsRes = await fetch(`${BASE_URL}/api/v1/public/rooms`);
  const publicRoomsData = await publicRoomsRes.json();
  const roomsList = publicRoomsData.rooms || [];

  const forbiddenKeys = [
    'currentTenantName',
    'currentTenantPhone',
    'internalNotes',
    'orgId',
  ];
  let leakFound = false;
  for (const rm of roomsList) {
    for (const fk of forbiddenKeys) {
      if (rm[fk] !== undefined) {
        leakFound = true;
        break;
      }
    }
  }

  // 10. Dynamic SSR ETag & 304 Caching
  const ssrRes1 = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`
  );
  const etagHeader = ssrRes1.headers.get('etag');
  const ssrRes2 = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      headers: { 'If-None-Match': etagHeader || '' },
    }
  );

  // 11. 301 Permanent Redirect on Old Slug
  const slugChangeAdminToken = adminToken;
  await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slugChangeAdminToken}`,
      },
      body: JSON.stringify({
        status: 'AVAILABLE',
        slug: 'studio-ban-cong-31-06-lk01-31-an-phu-renamed',
      }),
    }
  );

  const oldSlugRedirectRes = await fetch(
    `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    { redirect: 'manual' }
  );

  // Restore slug back immediately
  await fetch(
    `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu-renamed`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slugChangeAdminToken}`,
      },
      body: JSON.stringify({
        status: 'AVAILABLE',
        slug: 'studio-ban-cong-31-06-lk01-31-an-phu',
      }),
    }
  );

  // 12. 404 + noindex on Occupied / Unpublished Room
  const occupiedRoomRes = await fetch(`${BASE_URL}/phong/phong-da-thue-bi-mat`, {
    redirect: 'manual',
  });
  const occupiedHtml = await occupiedRoomRes.text();

  return {
    domainAudit,
    adminToken,
    bootSecurityPass,
    missingSecretThrowsFatal,
    trustProxyConfigValid,
    sampleActorsAudited,
    inactiveSampleActorBlocked401,
    inactiveSampleActorLoginBlocked401,
    unauthenticatedRumResetBlocked401,
    managerRumResetForbidden403,
    adminRumResetAuthorized200,
    productionAdminTokenAuthorized,
    productionAdminLoginApi,
    productionAdminLoginE2E: productionAdminLoginApi,
    missingPasswordBlocked400,
    nullPasswordBlocked400,
    emptyPasswordBlocked400,
    wrongPasswordBlocked401,
    testAdminPassword: TEST_ADMIN_PASSWORD,
    publicSecurityContextBlocked,
    publicRoomsWriteBlocked,
    rateLimitingEnforced429: rateLimitHit429 && bypassHeaderIneffective,
    unauthenticatedConsoleAccessBlocked: unauthRes.status === 401,
    viewerRoleMutationBlocked:
      viewerRes.status === 403 &&
      (viewerBody.errorCode === 'FORBIDDEN' ||
        viewerBody.errorCode === 'INSUFFICIENT_PERMISSION'),
    buildingScopeEnforced:
      wrongBuildingRes.status === 403 &&
      (wrongBuildingBody.errorCode === 'FORBIDDEN' ||
        wrongBuildingBody.errorCode === 'BUILDING_SCOPE_FORBIDDEN'),
    secretRotationDualKeyAccepted:
      rotatedPrevRes.status === 200 && rotatedPrevBody.ok === true,
    burnedOldKeyRejected401:
      burnedOldKeyRes.status === 401 &&
      (burnedOldKeyBody.errorCode === 'INVALID_SIGNATURE' ||
        burnedOldKeyBody.reason === 'INVALID_SIGNATURE'),
    tokenRevocationByJtiWorks:
      revokeCallRes.status === 200 &&
      afterRevokeRes.status === 401 &&
      (afterRevokeBody.errorCode === 'TOKEN_REVOKED' ||
        afterRevokeBody.reason === 'TOKEN_REVOKED'),
    sessionVersionInvalidationWorks:
      bumpSessionRes.status === 200 &&
      rejectedBySessionRes.status === 401 &&
      (rejectedBySessionBody.errorCode === 'TOKEN_REVOKED' ||
        rejectedBySessionBody.reason === 'SESSION_INVALIDATED'),
    zeroTenantDataLeakage: !leakFound && roomsList.length > 0,
    dynamicSsrEtag304Works:
      ssrRes1.status === 200 &&
      Boolean(etagHeader) &&
      ssrRes2.status === 304,
    oldSlug301RedirectWorks:
      oldSlugRedirectRes.status === 301 &&
      oldSlugRedirectRes.headers
        .get('location')
        ?.includes('/phong/studio-ban-cong-31-06-lk01-31-an-phu-renamed'),
    unpublishedRoom404AndNoindex:
      occupiedRoomRes.status === 404 &&
      occupiedHtml.includes('noindex') &&
      Boolean(occupiedRoomRes.headers.get('x-robots-tag')?.includes('noindex')),
  };
}

export async function runFullRC1Verification() {
  console.log(
    `============================================================\n` +
      `   ADHOME LANDING — RELEASE CANDIDATE 1 (RC1) VERIFICATION  \n` +
      `   Canonical Domain: ${CANONICAL_ORIGIN}                      \n` +
      `   Console Domain:   ${CONSOLE_ORIGIN}                \n` +
      `============================================================`
  );

  fs.mkdirSync(RC1_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  console.log('Ensuring authentic production admin is provisioned and sample actors are deactivated...');
  await provisionProductionAdmin();

  // Step 1: PostgreSQL 18 Native Backup & Restore Test
  const backupRestoreReport = await runBackupAndRestoreVerification();

  // Step 2: Backend Security, RBAC, Domain & SEO Audits
  const securityAndSeoReport = await runSecuritySeoAndDomainAudit();

  // Step 3: Sustained Load Testing Suite (100, 500, 1000 VUs)
  const sustainedLoadReport = await runSustainedLoadTestSuite();

  // Step 4: Headless Chromium Browser Visual Audits, CWV & UI Polish Verification
  console.log('\n--- Launching Headless Browser for UI/CWV & Visual Evidence ---');
  const { cdp, cleanup } = await launchHeadlessBrowser(9349);

  const realInteractions = [];

  const waitForImages = async () => {
    await cdp.eval(`(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 3000);
          });
        })
      );
    })()`);
  };

  const saveShot = async (filename) => {
    await waitForImages();
    const localPath = path.join(RC1_OUTPUT_DIR, filename);
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    await cdp.screenshot([localPath, artifactPath]);
    console.log(`Saved screenshot: ${filename}`);
  };

  try {
    // 0. Unified /login & Dual-Role (Admin + Manager) Console E2E on http://127.0.0.1:5174
    console.log('\n--- Launching Console Preview Server on port 5174 for Dual-Role Console E2E ---');

    // Clean any pre-existing test manager row so Admin provisions it fresh via real UI
    await prisma.consoleActor.deleteMany({
      where: { email: 'manager.lk01@adhome.vn' },
    });

    const consoleProc = spawn('pnpm', ['--filter', 'console', 'preview', '--port', '5174'], {
      shell: true,
      stdio: 'ignore',
    });

    let consoleReady = false;
    for (let i = 0; i < 35; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const cRes = await fetch('http://127.0.0.1:5174/login');
        if (cRes.status === 200) {
          consoleReady = true;
          break;
        }
      } catch {
        // wait
      }
    }

    let legacyConsoleHost301OnPort5174 = false;
    const consoleUiReport = {
      legacyConsoleHost301OnPort5174: false,
      unauthenticatedRedirectedToLoginRoute: false,
      loginScreenRendered: false,
      emptyEmailByDefault: false,
      zeroRoleSelectorTabsOnLogin: false,
      loginHeadingMatchesSpec: false,
      serverDerivedRbacNoticeVisible: false,
      wrongPasswordFeedbackDisplayed: false,
      adminLogin: {
        authenticatedDashboardReached: false,
        pathnameIsRoot: false,
        zeroRawJwtInLocalStorage: false,
        httpOnlySessionCookieSet: false,
        roleBadgeIsAdmin: false,
        scopeSummaryIsAll4Buildings: false,
        overviewShows4Buildings34Rooms: false,
        financeAndSettingsUnlocked: false,
        financeLedgerVisible: false,
        zeroRoleSwitcherInShell: false,
        createdManagerViaSettingsUi: false,
        pass: false,
      },
      logoutFlow: {
        logoutReturnedToLoginRoute: false,
        httpOnlySessionCookieCleared: false,
        pass: false,
      },
      managerLogin: {
        authenticatedDashboardReached: false,
        zeroRawJwtInLocalStorage: false,
        httpOnlySessionCookieSet: false,
        roleBadgeIsManager: false,
        scopeSummaryIs2Buildings: false,
        overviewShows2Buildings14Rooms: false,
        financeAndSettingsLocked: false,
        financeLedgerHidden: false,
        onlyAssignedBuildingsRenderedInDom: false,
        zeroRoleSwitcherInShell: false,
        apiPortfolioScopedTo2Buildings: false,
        apiAllowedBuildingMutation200: false,
        apiUnassignedBuildingMutation403: false,
        apiAccountsEndpointForbidden403: false,
        apiFinanceEndpointForbidden403: false,
        instantLogoutOnAdminScopeChange: false,
        pass: false,
      },
      pass: false,
    };

    try {
      if (consoleReady) {
        console.log('Console preview server ready on 5174. Auditing legacy 301 & Dual-Role UI...');

        const legacyConsole5174 = await rawHttpGetWithHost(
          'http://127.0.0.1:5174',
          '/login',
          'console-adhome.ductinh.one'
        );
        legacyConsoleHost301OnPort5174 =
          legacyConsole5174.status === 301 &&
          legacyConsole5174.location === 'https://console.adhome.vn/login';
        consoleUiReport.legacyConsoleHost301OnPort5174 = legacyConsoleHost301OnPort5174;

        await cdp.send('Network.clearBrowserCookies');
        await setViewportClean(cdp, {
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });

        await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5174/' });
        await new Promise((r) => setTimeout(r, 600));
        await cdp.eval('localStorage.clear(); sessionStorage.clear();');
        await cdp.send('Network.clearBrowserCookies');
        await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5174/' });
        await new Promise((r) => setTimeout(r, 900));

        const setControlledInput = async (selector, value) => {
          await cdp.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return;
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(el, ${JSON.stringify(value)});
            } else {
              el.value = ${JSON.stringify(value)};
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        };

        // Phase A: Audit Unified /login screen
        const loginScreenAudit = await cdp.eval(`(() => {
          const emailEl = document.querySelector('[data-testid="console-login-email"]');
          const headingText = document.querySelector('[data-testid="console-login-heading"]')?.textContent?.trim() || '';
          const rbacNoteText = document.querySelector('[data-testid="console-login-rbac-note"]')?.textContent?.trim() || '';
          const bodyText = document.body.innerText || '';
          return {
            pathname: window.location.pathname,
            hasEmailInput: Boolean(emailEl),
            emailDefaultValue: emailEl ? emailEl.value : null,
            headingText,
            rbacNoteText,
            hasRoleTabs:
              bodyText.includes('Admin (Toàn quyền)') ||
              bodyText.includes('Manager (Quản lý tòa)'),
          };
        })()`);

        consoleUiReport.unauthenticatedRedirectedToLoginRoute =
          loginScreenAudit.pathname === '/login';
        consoleUiReport.loginScreenRendered = Boolean(loginScreenAudit.hasEmailInput);
        consoleUiReport.emptyEmailByDefault = loginScreenAudit.emailDefaultValue === '';
        consoleUiReport.zeroRoleSelectorTabsOnLogin = !loginScreenAudit.hasRoleTabs;
        consoleUiReport.loginHeadingMatchesSpec =
          loginScreenAudit.headingText === 'Đăng nhập hệ thống quản lý AdHome';
        consoleUiReport.serverDerivedRbacNoticeVisible = loginScreenAudit.rbacNoteText.includes(
          'Quyền truy cập được xác định tự động sau khi xác thực'
        );
        await saveShot('rc1_console_login_screen.png');

        // Phase B: Submit wrong password
        await setControlledInput('[data-testid="console-login-email"]', 'admin@adhome.vn');
        await setControlledInput('[data-testid="console-login-password"]', 'IncorrectPassword999!');
        await cdp.eval(
          `document.querySelector('[data-testid="console-login-submit"]')?.click()`
        );

        let hasErrorMsg = false;
        for (let p = 0; p < 25; p++) {
          hasErrorMsg = await cdp.eval(
            `Boolean(document.querySelector('[data-testid="console-login-error"]'))`
          );
          if (hasErrorMsg) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        consoleUiReport.wrongPasswordFeedbackDisplayed = Boolean(hasErrorMsg);
        await saveShot('rc1_console_login_invalid.png');

        // Phase C: Authentic Admin Login (admin@adhome.vn)
        await setControlledInput(
          '[data-testid="console-login-password"]',
          securityAndSeoReport.testAdminPassword
        );
        await cdp.eval(
          `document.querySelector('[data-testid="console-login-submit"]')?.click()`
        );

        let adminDashboardReady = false;
        for (let p = 0; p < 35; p++) {
          adminDashboardReady = await cdp.eval(
            `Boolean(document.querySelector('[data-testid="console-logout-button"]'))`
          );
          if (adminDashboardReady) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        const adminCookiesResult = await cdp.send('Network.getCookies');
        const adminSessionCookie = (adminCookiesResult.cookies || []).find(
          (c) => c.name === 'adhome_console_session'
        );

        const adminDomAudit = await cdp.eval(`(() => {
          const roleBadge = document.querySelector('[data-testid="console-actor-role-badge"]')?.textContent?.trim() || '';
          const scopeSummary = document.querySelector('[data-testid="console-actor-scope-summary"]')?.textContent?.trim() || '';
          const portfolioSummary = document.querySelector('[data-testid="console-overview-portfolio-summary"]')?.textContent?.trim() || '';
          const financeLocked = document.querySelector('[data-testid="nav-item-finance"]')?.getAttribute('data-locked');
          const settingsLocked = document.querySelector('[data-testid="nav-item-settings"]')?.getAttribute('data-locked');
          const hasFinanceLedger = Boolean(document.querySelector('[data-testid="console-overview-finance-ledger"]'));
          const rawJwtInLocalStorage = localStorage.getItem('adhome_console_token');
          const bodyText = document.body.innerText || '';
          return {
            pathname: window.location.pathname,
            roleBadge,
            scopeSummary,
            portfolioSummary,
            financeLocked,
            settingsLocked,
            hasFinanceLedger,
            rawJwtInLocalStorage,
            hasRoleSwitcher: bodyText.includes('Đổi vai trò') || bodyText.includes('Đổi ⇄'),
          };
        })()`);

        consoleUiReport.adminLogin.authenticatedDashboardReached = Boolean(adminDashboardReady);
        consoleUiReport.adminLogin.pathnameIsRoot = adminDomAudit.pathname === '/';
        consoleUiReport.adminLogin.zeroRawJwtInLocalStorage =
          adminDomAudit.rawJwtInLocalStorage === null;
        consoleUiReport.adminLogin.httpOnlySessionCookieSet = Boolean(
          adminSessionCookie && adminSessionCookie.httpOnly === true
        );
        consoleUiReport.adminLogin.roleBadgeIsAdmin = adminDomAudit.roleBadge === 'ADMIN';
        consoleUiReport.adminLogin.scopeSummaryIsAll4Buildings =
          adminDomAudit.scopeSummary === 'Toàn quyền 4 tòa';
        consoleUiReport.adminLogin.overviewShows4Buildings34Rooms =
          adminDomAudit.portfolioSummary.includes('4 tòa nhà, 34 căn hộ');
        consoleUiReport.adminLogin.financeAndSettingsUnlocked =
          adminDomAudit.financeLocked === 'false' && adminDomAudit.settingsLocked === 'false';
        consoleUiReport.adminLogin.financeLedgerVisible = adminDomAudit.hasFinanceLedger;
        consoleUiReport.adminLogin.zeroRoleSwitcherInShell = !adminDomAudit.hasRoleSwitcher;
        await saveShot('rc1_console_dashboard_authenticated.png');

        // Navigate to Settings & RBAC Account Management and create Manager account via UI
        await cdp.eval(`document.querySelector('[data-testid="nav-item-settings"]')?.click()`);
        for (let p = 0; p < 30; p++) {
          const tableReady = await cdp.eval(
            `Boolean(document.querySelector('[data-testid="console-accounts-table"]'))`
          );
          if (tableReady) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        await cdp.eval(
          `document.querySelector('[data-testid="console-open-create-account"]')?.click()`
        );
        await new Promise((r) => setTimeout(r, 250));

        const TEST_MANAGER_EMAIL = 'manager.lk01@adhome.vn';
        const TEST_MANAGER_PASSWORD = 'AdHome@ManagerLK01!2026';

        await setControlledInput('[data-testid="account-form-name"]', 'Nguyễn Văn Minh');
        await setControlledInput('[data-testid="account-form-email"]', TEST_MANAGER_EMAIL);
        await setControlledInput('[data-testid="account-form-password"]', TEST_MANAGER_PASSWORD);

        for (const bldId of ['bld-lk01-31', 'bld-lk01-32', 'bld-lk08-24', 'bld-lk08-25']) {
          const wantChecked = bldId === 'bld-lk01-31' || bldId === 'bld-lk01-32';
          await cdp.eval(`(() => {
            const cb = document.querySelector(${JSON.stringify(`[data-testid="scope-checkbox-${bldId}"]`)});
            if (cb && cb.checked !== ${wantChecked}) {
              cb.click();
            }
          })()`);
        }
        await new Promise((r) => setTimeout(r, 150));

        await cdp.eval(`document.querySelector('[data-testid="account-form-submit"]')?.click()`);

        let managerRowRendered = false;
        for (let p = 0; p < 35; p++) {
          managerRowRendered = await cdp.eval(
            `Boolean(document.querySelector('[data-testid="account-row-manager.lk01@adhome.vn"]'))`
          );
          if (managerRowRendered) break;
          await new Promise((r) => setTimeout(r, 150));
        }
        consoleUiReport.adminLogin.createdManagerViaSettingsUi = Boolean(managerRowRendered);
        await saveShot('rc1_console_admin_accounts.png');

        consoleUiReport.adminLogin.pass = Boolean(
          consoleUiReport.adminLogin.authenticatedDashboardReached &&
            consoleUiReport.adminLogin.pathnameIsRoot &&
            consoleUiReport.adminLogin.zeroRawJwtInLocalStorage &&
            consoleUiReport.adminLogin.httpOnlySessionCookieSet &&
            consoleUiReport.adminLogin.roleBadgeIsAdmin &&
            consoleUiReport.adminLogin.scopeSummaryIsAll4Buildings &&
            consoleUiReport.adminLogin.overviewShows4Buildings34Rooms &&
            consoleUiReport.adminLogin.financeAndSettingsUnlocked &&
            consoleUiReport.adminLogin.financeLedgerVisible &&
            consoleUiReport.adminLogin.zeroRoleSwitcherInShell &&
            consoleUiReport.adminLogin.createdManagerViaSettingsUi
        );

        // Logout Admin
        await cdp.eval(`document.querySelector('[data-testid="console-logout-button"]')?.click()`);
        let backToLogin = false;
        for (let p = 0; p < 25; p++) {
          backToLogin = await cdp.eval(
            `window.location.pathname === '/login' && Boolean(document.querySelector('[data-testid="console-login-email"]'))`
          );
          if (backToLogin) break;
          await new Promise((r) => setTimeout(r, 120));
        }
        const postLogoutCookies = await cdp.send('Network.getCookies');
        const lingeringCookie = (postLogoutCookies.cookies || []).find(
          (c) => c.name === 'adhome_console_session' && c.value
        );
        consoleUiReport.logoutFlow.logoutReturnedToLoginRoute = Boolean(backToLogin);
        consoleUiReport.logoutFlow.httpOnlySessionCookieCleared = !lingeringCookie;
        consoleUiReport.logoutFlow.pass =
          consoleUiReport.logoutFlow.logoutReturnedToLoginRoute &&
          consoleUiReport.logoutFlow.httpOnlySessionCookieCleared;
        await saveShot('rc1_console_logout_returned.png');

        // Phase D: Authentic Manager Login (manager.lk01@adhome.vn) via Unified /login
        await setControlledInput('[data-testid="console-login-email"]', TEST_MANAGER_EMAIL);
        await setControlledInput('[data-testid="console-login-password"]', TEST_MANAGER_PASSWORD);
        await cdp.eval(
          `document.querySelector('[data-testid="console-login-submit"]')?.click()`
        );

        let managerDashboardReady = false;
        for (let p = 0; p < 35; p++) {
          managerDashboardReady = await cdp.eval(
            `Boolean(document.querySelector('[data-testid="console-logout-button"]'))`
          );
          if (managerDashboardReady) break;
          await new Promise((r) => setTimeout(r, 150));
        }
        await new Promise((r) => setTimeout(r, 300));

        const mgrCookiesResult = await cdp.send('Network.getCookies');
        const mgrSessionCookie = (mgrCookiesResult.cookies || []).find(
          (c) => c.name === 'adhome_console_session'
        );

        const managerDomAudit = await cdp.eval(`(() => {
          const roleBadge = document.querySelector('[data-testid="console-actor-role-badge"]')?.textContent?.trim() || '';
          const scopeSummary = document.querySelector('[data-testid="console-actor-scope-summary"]')?.textContent?.trim() || '';
          const portfolioSummary = document.querySelector('[data-testid="console-overview-portfolio-summary"]')?.textContent?.trim() || '';
          const financeLocked = document.querySelector('[data-testid="nav-item-finance"]')?.getAttribute('data-locked');
          const settingsLocked = document.querySelector('[data-testid="nav-item-settings"]')?.getAttribute('data-locked');
          const hasFinanceLedger = Boolean(document.querySelector('[data-testid="console-overview-finance-ledger"]'));
          const rawJwtInLocalStorage = localStorage.getItem('adhome_console_token');
          const bodyText = document.body.innerText || '';
          return {
            roleBadge,
            scopeSummary,
            portfolioSummary,
            financeLocked,
            settingsLocked,
            hasFinanceLedger,
            rawJwtInLocalStorage,
            hasLk0131: bodyText.includes('LK01-31'),
            hasLk0132: bodyText.includes('LK01-32'),
            hasLk0824: bodyText.includes('LK08-24'),
            hasLk0825: bodyText.includes('LK08-25'),
            hasRoleSwitcher: bodyText.includes('Đổi vai trò') || bodyText.includes('Đổi ⇄'),
          };
        })()`);

        consoleUiReport.managerLogin.authenticatedDashboardReached = Boolean(managerDashboardReady);
        consoleUiReport.managerLogin.zeroRawJwtInLocalStorage =
          managerDomAudit.rawJwtInLocalStorage === null;
        consoleUiReport.managerLogin.httpOnlySessionCookieSet = Boolean(
          mgrSessionCookie && mgrSessionCookie.httpOnly === true
        );
        consoleUiReport.managerLogin.roleBadgeIsManager = managerDomAudit.roleBadge === 'MANAGER';
        consoleUiReport.managerLogin.scopeSummaryIs2Buildings =
          managerDomAudit.scopeSummary === '2 tòa phân công';
        consoleUiReport.managerLogin.overviewShows2Buildings14Rooms =
          managerDomAudit.portfolioSummary.includes('2 tòa nhà, 14 căn hộ');
        consoleUiReport.managerLogin.financeAndSettingsLocked =
          managerDomAudit.financeLocked === 'true' && managerDomAudit.settingsLocked === 'true';
        consoleUiReport.managerLogin.financeLedgerHidden = !managerDomAudit.hasFinanceLedger;
        consoleUiReport.managerLogin.onlyAssignedBuildingsRenderedInDom =
          managerDomAudit.hasLk0131 &&
          managerDomAudit.hasLk0132 &&
          !managerDomAudit.hasLk0824 &&
          !managerDomAudit.hasLk0825;
        consoleUiReport.managerLogin.zeroRoleSwitcherInShell = !managerDomAudit.hasRoleSwitcher;
        await saveShot('rc1_console_manager_dashboard_scoped.png');

        // Direct API authorization & scoping verification for real Manager account
        const mgrApiLoginRes = await fetch(`${BASE_URL}/api/v1/console/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_MANAGER_EMAIL,
            password: TEST_MANAGER_PASSWORD,
          }),
        });
        const mgrApiLoginBody = await mgrApiLoginRes.json();
        const mgrToken = mgrApiLoginBody.token;
        const mgrActorId = mgrApiLoginBody.actor?.id;

        const mgrPortfolioRes = await fetch(`${BASE_URL}/api/v1/console/portfolio`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
        });
        const mgrPortfolioBody = await mgrPortfolioRes.json();
        const allowedSet = new Set(['bld-lk01-31', 'bld-lk01-32']);
        consoleUiReport.managerLogin.apiPortfolioScopedTo2Buildings =
          mgrPortfolioRes.status === 200 &&
          Array.isArray(mgrPortfolioBody.buildings) &&
          mgrPortfolioBody.buildings.length === 2 &&
          mgrPortfolioBody.buildings.every((b) => allowedSet.has(b.id)) &&
          Array.isArray(mgrPortfolioBody.rooms) &&
          mgrPortfolioBody.rooms.every((r) => allowedSet.has(r.buildingId));

        const mgrAllowedRoomPatch = await fetch(
          `${BASE_URL}/api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mgrToken}`,
            },
            body: JSON.stringify({ price: 5000000 }),
          }
        );
        consoleUiReport.managerLogin.apiAllowedBuildingMutation200 =
          mgrAllowedRoomPatch.status === 200;

        const mgrForbiddenRoomPatch = await fetch(
          `${BASE_URL}/api/v1/console/rooms/can-2pn-mini-25-05-lk08-25-an-phu`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mgrToken}`,
            },
            body: JSON.stringify({ price: 5600000 }),
          }
        );
        consoleUiReport.managerLogin.apiUnassignedBuildingMutation403 =
          mgrForbiddenRoomPatch.status === 403;

        const mgrAccountsRes = await fetch(`${BASE_URL}/api/v1/console/accounts`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
        });
        consoleUiReport.managerLogin.apiAccountsEndpointForbidden403 =
          mgrAccountsRes.status === 403;

        const mgrFinanceRes = await fetch(`${BASE_URL}/api/v1/console/finance/summary`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
        });
        consoleUiReport.managerLogin.apiFinanceEndpointForbidden403 =
          mgrFinanceRes.status === 403;

        // Phase E: Instant Session Invalidation on Admin Scope Change (sessionVersion increment)
        if (mgrActorId) {
          const scopeNarrowRes = await fetch(
            `${BASE_URL}/api/v1/console/accounts/${encodeURIComponent(mgrActorId)}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${securityAndSeoReport.adminToken}`,
              },
              body: JSON.stringify({
                buildingScopes: ['bld-lk01-31'],
              }),
            }
          );
          const scopeNarrowBody = await scopeNarrowRes.json();

          // Reload Manager's active browser tab — must immediately bounce to /login
          await cdp.send('Page.reload');
          let invalidatedToLogin = false;
          for (let p = 0; p < 30; p++) {
            await new Promise((r) => setTimeout(r, 120));
            invalidatedToLogin = await cdp.eval(
              `window.location.pathname === '/login' && Boolean(document.querySelector('[data-testid="console-login-email"]'))`
            );
            if (invalidatedToLogin) break;
          }

          consoleUiReport.managerLogin.instantLogoutOnAdminScopeChange = Boolean(
            scopeNarrowRes.status === 200 &&
              scopeNarrowBody.sessionsInvalidated === true &&
              invalidatedToLogin
          );

          // Restore Manager scope cleanly to ['bld-lk01-31', 'bld-lk01-32']
          await fetch(
            `${BASE_URL}/api/v1/console/accounts/${encodeURIComponent(mgrActorId)}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${securityAndSeoReport.adminToken}`,
              },
              body: JSON.stringify({
                buildingScopes: ['bld-lk01-31', 'bld-lk01-32'],
              }),
            }
          );
        }

        consoleUiReport.managerLogin.pass = Boolean(
          consoleUiReport.managerLogin.authenticatedDashboardReached &&
            consoleUiReport.managerLogin.zeroRawJwtInLocalStorage &&
            consoleUiReport.managerLogin.httpOnlySessionCookieSet &&
            consoleUiReport.managerLogin.roleBadgeIsManager &&
            consoleUiReport.managerLogin.scopeSummaryIs2Buildings &&
            consoleUiReport.managerLogin.overviewShows2Buildings14Rooms &&
            consoleUiReport.managerLogin.financeAndSettingsLocked &&
            consoleUiReport.managerLogin.financeLedgerHidden &&
            consoleUiReport.managerLogin.onlyAssignedBuildingsRenderedInDom &&
            consoleUiReport.managerLogin.zeroRoleSwitcherInShell &&
            consoleUiReport.managerLogin.apiPortfolioScopedTo2Buildings &&
            consoleUiReport.managerLogin.apiAllowedBuildingMutation200 &&
            consoleUiReport.managerLogin.apiUnassignedBuildingMutation403 &&
            consoleUiReport.managerLogin.apiAccountsEndpointForbidden403 &&
            consoleUiReport.managerLogin.apiFinanceEndpointForbidden403 &&
            consoleUiReport.managerLogin.instantLogoutOnAdminScopeChange
        );

        consoleUiReport.pass = Boolean(
          consoleUiReport.legacyConsoleHost301OnPort5174 &&
            consoleUiReport.unauthenticatedRedirectedToLoginRoute &&
            consoleUiReport.loginScreenRendered &&
            consoleUiReport.emptyEmailByDefault &&
            consoleUiReport.zeroRoleSelectorTabsOnLogin &&
            consoleUiReport.loginHeadingMatchesSpec &&
            consoleUiReport.serverDerivedRbacNoticeVisible &&
            consoleUiReport.wrongPasswordFeedbackDisplayed &&
            consoleUiReport.adminLogin.pass &&
            consoleUiReport.logoutFlow.pass &&
            consoleUiReport.managerLogin.pass
        );

        console.log(
          'Dual-Role Console UI & RBAC E2E completed:',
          consoleUiReport.pass ? 'PASS' : 'FAIL'
        );
      }
    } finally {
      try {
        consoleProc.kill();
      } catch {
        // ignore
      }
    }

    // Reset Server RUM telemetry buffer cleanly via authenticated Admin call right before Landing CWV
    await fetch(`${BASE_URL}/api/v1/public/rum/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${securityAndSeoReport.adminToken}` },
    });

    // 1. Desktop 1920x1080 Viewport (using setViewportClean to avoid synthetic viewport-resize layout shifts)
    await setViewportClean(cdp, {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 1200));
    await saveShot('rc1_1920_home.png');

    // 2. Desktop 1440x900 Viewport
    await setViewportClean(cdp, {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 800));
    await saveShot('rc1_1440_home.png');

    // Verify Canonical & OpenGraph & Console /login Links on Home
    const homeHeadAudit = await cdp.eval(`(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const footerConsoleLink = document.querySelector('footer a[href*="console.adhome.vn"]')?.getAttribute('href');
      const introConsoleLink = document.querySelector('section#ve-adhome a[href*="console.adhome.vn"]')?.getAttribute('href');
      return { canonical, ogUrl, ogImage, footerConsoleLink, introConsoleLink };
    })()`);

    // Interaction 1: Filter Studio Rooms on Home
    const intFilterStudio = await nativeClickAndMeasureInp(
      cdp,
      '[role="tab"]:nth-child(2)',
      '1. Filter Studio Rooms'
    );
    realInteractions.push(intFilterStudio);

    // Interaction 2: Reset Filter
    const intResetFilter = await nativeClickAndMeasureInp(
      cdp,
      '[role="tab"]:nth-child(1)',
      '2. Reset Type Filter'
    );
    realInteractions.push(intResetFilter);

    // Desktop Room Detail: 1440x900
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 800));
    await saveShot('rc1_1440_room_detail.png');

    const roomDetailHeadAudit = await cdp.eval(`(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
      return { canonical, ogUrl };
    })()`);

    // 3. Mobile iPhone 12/13/14 Pro (390x844) Viewport
    await setViewportClean(cdp, {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 900));
    await saveShot('rc1_390x844_home.png');

    // UI Polish 1: Test Mobile Navigation Menu with Backdrop Overlay and Body Scroll Lock
    const intOpenMobileNav = await nativeClickAndMeasureInp(
      cdp,
      'header button[aria-expanded]',
      '3. Open Mobile Navigation'
    );
    realInteractions.push(intOpenMobileNav);
    await new Promise((r) => setTimeout(r, 250));

    // Audit Mobile Navigation overlay and body scroll lock
    const mobileNavAudit = await cdp.eval(`(() => {
      const backdrop = document.querySelector('[data-testid="mobile-nav-backdrop"]');
      const drawer = document.querySelector('[data-testid="mobile-nav-drawer"]');
      const ctaBtn = drawer ? drawer.querySelector('a[href="/phong-trong"]') : null;
      const ctaRect = ctaBtn ? ctaBtn.getBoundingClientRect() : null;
      const bodyOverflow = document.body.style.overflow;
      return {
        hasBackdrop: Boolean(backdrop),
        bodyLocked: bodyOverflow === 'hidden',
        hasDrawer: Boolean(drawer),
        ctaVisibleInScreen: Boolean(ctaRect && ctaRect.bottom <= window.innerHeight),
        ctaBottomY: ctaRect ? Math.round(ctaRect.bottom) : null,
        windowHeight: window.innerHeight,
      };
    })()`);

    await saveShot('rc1_390x844_mobile_nav_backdrop.png');

    // Close Mobile Navigation via backdrop click
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 195,
      y: 700,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 195,
      y: 700,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 250));

    // Check body lock released
    const bodyUnlockCheck = await cdp.eval(`document.body.style.overflow !== 'hidden'`);

    // Open Quick View on 390x844
    await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="room-card-studio-ban-cong-31-06-lk01-31-an-phu"]',
      '4. Open Quick View on 390x844'
    );
    await new Promise((r) => setTimeout(r, 300));
    await saveShot('rc1_390x844_quickview.png');

    // Close Quick View
    await nativeClickAndMeasureInp(
      cdp,
      'button[aria-label="Đóng xem nhanh"]',
      '4b. Close Quick View'
    );
    await new Promise((r) => setTimeout(r, 200));

    // Navigate to Room Detail on 390x844
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 900));
    await saveShot('rc1_390x844_room_detail.png');

    // Scroll down to show sticky bottom bar
    await cdp.eval(`window.scrollTo(0, 600)`);
    await new Promise((r) => setTimeout(r, 300));
    await saveShot('rc1_390x844_room_detail_scrolled.png');

    // Scroll back to top
    await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await new Promise((r) => setTimeout(r, 250));

    // UI Polish 2: Open Lead Inquiry Modal and Verify De-duplicated Header & Unchecked Consent
    const intOpenLeadModal = await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="mobile-top-inquire-cta"]',
      '5. Open Lead Modal on 390x844'
    );
    realInteractions.push(intOpenLeadModal);
    await new Promise((r) => setTimeout(r, 300));

    const leadModalAudit = await cdp.eval(`(() => {
      const titleEl = document.getElementById('lead-inquiry-modal-title');
      const titleText = titleEl ? titleEl.textContent.trim() : '';
      const headerDiv = titleEl ? titleEl.parentElement : null;
      // Header must NOT contain duplicated paragraph with ID, code or price
      const hasDuplicatedSubheader = Boolean(headerDiv && headerDiv.querySelector('p'));

      const contextBox = document.querySelector('[data-testid="inquiry-room-context"]');
      const contextText = contextBox ? contextBox.textContent.trim() : '';

      const privacyCheckbox = document.querySelector('[data-testid="lead-privacy-checkbox"]');
      const isConsentCheckedByDefault = privacyCheckbox ? privacyCheckbox.checked : null;

      return {
        titleText,
        hasDuplicatedSubheader,
        headerCleanAndConcise: titleText === 'Đăng ký xem phòng P.31-06' && !hasDuplicatedSubheader,
        hasContextBox: Boolean(contextBox),
        contextText,
        isConsentCheckedByDefault,
      };
    })()`);

    await saveShot('rc1_390x844_lead_modal_deduped.png');

    // UI Verification: Trigger Validation Error (Consent Missing)
    await nativeClickAndMeasureInp(
      cdp,
      'form button[type="submit"]',
      '6. Trigger Consent Validation Error'
    );
    await new Promise((r) => setTimeout(r, 200));
    await saveShot('rc1_390x844_lead_modal_validation.png');

    // Generate unique phone and name for this specific test run to avoid 10-minute duplicate collision
    const testRunSuffix = `${(Date.now() % 900000) + 100000}`;
    const testLeadPhone = `0985${testRunSuffix}`;
    const testLeadName = `Nguyen Van RC1 ${testRunSuffix.slice(-4)}`;

    // Fill Out Valid Lead Form
    await nativeTypeAndMeasureInp(
      cdp,
      '#lead-name',
      testLeadName,
      '7. Type Full Name'
    );
    await nativeTypeAndMeasureInp(
      cdp,
      '#lead-phone',
      testLeadPhone,
      '8. Type Phone Number'
    );

    // Check Privacy Consent
    await nativeClickAndMeasureInp(
      cdp,
      '[data-testid="lead-privacy-checkbox"]',
      '9. Check Privacy Consent'
    );
    await new Promise((r) => setTimeout(r, 100));

    // Submit Lead to Real Database
    await nativeClickAndMeasureInp(
      cdp,
      'form button[type="submit"]',
      '10. Submit Lead Inquiry'
    );

    let leadPersistedAudit = null;
    for (let poll = 0; poll < 30; poll++) {
      await new Promise((r) => setTimeout(r, 200));
      leadPersistedAudit = await cdp.eval(`(() => {
        const refCodeEl = document.querySelector('[data-testid="inquiry-reference-code"]');
        const successTitle = document.querySelector('h4');
        if (refCodeEl && refCodeEl.textContent.trim()) {
          return {
            savedText: successTitle ? successTitle.textContent.trim() : '',
            refCode: refCodeEl.textContent.trim(),
          };
        }
        return null;
      })()`);
      if (leadPersistedAudit?.refCode) break;
    }
    await saveShot('rc1_390x844_lead_persisted.png');

    // Verify in PostgreSQL that lead was persisted
    const dbLead = await prisma.leadInquiry.findFirst({
      where: { phone: testLeadPhone },
      orderBy: { createdAt: 'desc' },
    });

    const refCodeRegex = /^ADH-[0-9]{4}-[A-Z0-9]{4,8}$/i;
    const refCodeFormatValid = Boolean(
      leadPersistedAudit?.refCode && refCodeRegex.test(leadPersistedAudit.refCode)
    );
    const dbMatchesUiCode = Boolean(
      dbLead &&
      leadPersistedAudit &&
      dbLead.referenceCode === leadPersistedAudit.refCode
    );

    // Clean up test lead strictly by in-memory primary key ID
    if (dbLead) {
      await prisma.leadInquiry.delete({ where: { id: dbLead.id } });
    }

    // Retrieve Core Web Vitals from RUM State on Room Detail BEFORE navigating away
    const roomDetailRum = await cdp.eval(`(() => {
      const rum = window.__ADHOME_RUM__;
      return {
        lcpMs: rum?.lcpMs || 0,
        clsScore: rum?.clsScore || 0,
        maxInpMs: rum?.maxInpMs || 0,
        p98InpMs: rum?.p98InpMs || 0,
        tbtMs: rum?.tbtMs || 0,
        totalInpEvents: rum?.inpEvents?.length || 0,
        events: rum?.inpEvents?.slice(-10) || [],
      };
    })()`);

    // 4. Viewport 430x932 (iPhone 14 Pro Max)
    await setViewportClean(cdp, {
      width: 430,
      height: 932,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await new Promise((r) => setTimeout(r, 700));
    await saveShot('rc1_430x932_home.png');

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
    });
    await new Promise((r) => setTimeout(r, 700));
    await saveShot('rc1_430x932_room_detail.png');

    // 5. Dedicated Catalog Viewport: 390x844
    await setViewportClean(cdp, {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `${BASE_URL}/phong-trong` });
    await new Promise((r) => setTimeout(r, 700));
    await saveShot('rc1_390x844_catalog.png');

    // Navigate cleanly to about:blank to flush final sendBeacon RUM metrics cleanly
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await new Promise((r) => setTimeout(r, 450));

    // Retrieve Server-side RUM Summary across all sessions
    const serverRumRes = await fetch(`${BASE_URL}/api/v1/public/rum/summary`);
    const serverRumSummary = await serverRumRes.json();

    // Probe live public DNS & HTTPS reachability transparently
    const liveDomainDeploymentProbe = await probeLivePublicDomains();

    const legacyDomain301RedirectLanding = Boolean(
      securityAndSeoReport.domainAudit.legacyLanding301Pass
    );
    const legacyDomain301RedirectConsole = Boolean(
      securityAndSeoReport.domainAudit.legacyConsole301OnApiHostPass &&
        legacyConsoleHost301OnPort5174
    );

    const finalReport = {
      verificationTitle:
        'ADHOME LANDING & CONSOLE — RELEASE CANDIDATE 1 (RC1) COMPREHENSIVE VERIFICATION',
      timestamp: new Date().toISOString(),
      canonicalDomain: CANONICAL_ORIGIN,
      consoleDomain: CONSOLE_ORIGIN,
      consoleLoginUrl: CONSOLE_LOGIN_URL,
      baseUrl: BASE_URL,
      liveDomainDeploymentProbe,
      rc01_uiPolish: {
        mobileNavigation: {
          backdropOverlayRendered: mobileNavAudit.hasBackdrop,
          bodyScrollLockApplied: mobileNavAudit.bodyLocked,
          bodyUnlockOnClose: bodyUnlockCheck,
          bottomCtaVisibleWithoutTruncation: mobileNavAudit.ctaVisibleInScreen,
          ctaBottomY: mobileNavAudit.ctaBottomY,
          windowHeight: mobileNavAudit.windowHeight,
          pass:
            mobileNavAudit.hasBackdrop &&
            mobileNavAudit.bodyLocked &&
            mobileNavAudit.ctaVisibleInScreen,
        },
        leadInquiryModal: {
          titleText: leadModalAudit.titleText,
          headerCleanAndConcise: leadModalAudit.headerCleanAndConcise,
          noDuplicatedSubheaderInHeader: !leadModalAudit.hasDuplicatedSubheader,
          roomContextCardPreserved: leadModalAudit.hasContextBox,
          privacyConsentUncheckedByDefault: leadModalAudit.isConsentCheckedByDefault === false,
          leadPersistedInPostgres: Boolean(dbLead && dbLead.phone === testLeadPhone),
          persistedReferenceCode: leadPersistedAudit?.refCode || '',
          referenceCodeFormatValid: refCodeFormatValid,
          uiAndDatabaseCodesMatch: dbMatchesUiCode,
          pass:
            leadModalAudit.headerCleanAndConcise &&
            leadModalAudit.isConsentCheckedByDefault === false &&
            Boolean(dbLead) &&
            refCodeFormatValid &&
            dbMatchesUiCode,
        },
      },
      rc02_canonicalDomain: {
        canonicalLinkHome: homeHeadAudit.canonical === `${CANONICAL_ORIGIN}/`,
        canonicalLinkRoomDetail:
          roomDetailHeadAudit.canonical ===
          `${CANONICAL_ORIGIN}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
        ogUrlCanonical: homeHeadAudit.ogUrl === `${CANONICAL_ORIGIN}/`,
        ogImageCanonical: Boolean(homeHeadAudit.ogImage?.startsWith(CANONICAL_ORIGIN)),
        footerConsoleLink: homeHeadAudit.footerConsoleLink === CONSOLE_LOGIN_URL,
        introConsoleLink: homeHeadAudit.introConsoleLink === CONSOLE_LOGIN_URL,
        robotsTxtCanonicalSitemap: Boolean(securityAndSeoReport.domainAudit.robotsSitemapLine),
        sitemapCanonicalUrls: Boolean(securityAndSeoReport.domainAudit.sitemapHasCanonicalOrigin),
        sitemapZeroOldDomainOccurrences: Boolean(
          securityAndSeoReport.domainAudit.sitemapHasZeroOldDomains
        ),
        legacyDomain301RedirectLanding,
        legacyDomain301RedirectConsole,
        pass:
          homeHeadAudit.canonical === `${CANONICAL_ORIGIN}/` &&
          roomDetailHeadAudit.canonical ===
            `${CANONICAL_ORIGIN}/phong/studio-ban-cong-31-06-lk01-31-an-phu` &&
          homeHeadAudit.ogUrl === `${CANONICAL_ORIGIN}/` &&
          Boolean(homeHeadAudit.ogImage?.startsWith(CANONICAL_ORIGIN)) &&
          homeHeadAudit.footerConsoleLink === CONSOLE_LOGIN_URL &&
          homeHeadAudit.introConsoleLink === CONSOLE_LOGIN_URL &&
          Boolean(securityAndSeoReport.domainAudit.robotsSitemapLine) &&
          Boolean(securityAndSeoReport.domainAudit.sitemapHasCanonicalOrigin) &&
          Boolean(securityAndSeoReport.domainAudit.sitemapHasZeroOldDomains) &&
          legacyDomain301RedirectLanding &&
          legacyDomain301RedirectConsole,
      },
      rc03_backendSecurityAndRbac: {
        bootSecurityAssertPass: securityAndSeoReport.bootSecurityPass,
        missingSecretThrowsFatal: securityAndSeoReport.missingSecretThrowsFatal,
        trustProxyConfigValid: securityAndSeoReport.trustProxyConfigValid,
        publicSecurityContextBlocked: securityAndSeoReport.publicSecurityContextBlocked,
        unauthenticatedRumResetBlocked401:
          securityAndSeoReport.unauthenticatedRumResetBlocked401,
        managerRumResetForbidden403: securityAndSeoReport.managerRumResetForbidden403,
        adminRumResetAuthorized200: securityAndSeoReport.adminRumResetAuthorized200,
        sampleActorsAudited: securityAndSeoReport.sampleActorsAudited,
        inactiveSampleActorBlocked401: securityAndSeoReport.inactiveSampleActorBlocked401,
        inactiveSampleActorLoginBlocked401:
          securityAndSeoReport.inactiveSampleActorLoginBlocked401,
        productionAdminTokenAuthorized: securityAndSeoReport.productionAdminTokenAuthorized,
        productionAdminLoginApi: securityAndSeoReport.productionAdminLoginApi,
        productionAdminLoginUi: consoleUiReport.adminLogin.pass,
        consoleDualRoleUiE2ePass: consoleUiReport.pass,
        consoleUiE2eReport: consoleUiReport,
        missingPasswordBlocked400: securityAndSeoReport.missingPasswordBlocked400,
        nullPasswordBlocked400: securityAndSeoReport.nullPasswordBlocked400,
        emptyPasswordBlocked400: securityAndSeoReport.emptyPasswordBlocked400,
        wrongPasswordBlocked401: securityAndSeoReport.wrongPasswordBlocked401,
        publicRoomsWriteBlocked405: securityAndSeoReport.publicRoomsWriteBlocked,
        rateLimitingEnforced429: securityAndSeoReport.rateLimitingEnforced429,
        unauthenticatedConsoleBlocked401:
          securityAndSeoReport.unauthenticatedConsoleAccessBlocked,
        viewerRoleMutationForbidden403: securityAndSeoReport.viewerRoleMutationBlocked,
        buildingManagerScopingForbidden403: securityAndSeoReport.buildingScopeEnforced,
        secretRotationDualKeyAccepted: securityAndSeoReport.secretRotationDualKeyAccepted,
        burnedOldKeyRejected401: securityAndSeoReport.burnedOldKeyRejected401,
        tokenRevocationByJtiWorks: securityAndSeoReport.tokenRevocationByJtiWorks,
        sessionVersionInvalidationWorks: securityAndSeoReport.sessionVersionInvalidationWorks,
        zeroPrivateDataLeakage: securityAndSeoReport.zeroTenantDataLeakage,
        pass:
          securityAndSeoReport.bootSecurityPass &&
          securityAndSeoReport.missingSecretThrowsFatal &&
          securityAndSeoReport.trustProxyConfigValid &&
          securityAndSeoReport.publicSecurityContextBlocked &&
          securityAndSeoReport.unauthenticatedRumResetBlocked401 &&
          securityAndSeoReport.managerRumResetForbidden403 &&
          securityAndSeoReport.adminRumResetAuthorized200 &&
          securityAndSeoReport.sampleActorsAudited &&
          securityAndSeoReport.inactiveSampleActorBlocked401 &&
          securityAndSeoReport.inactiveSampleActorLoginBlocked401 &&
          securityAndSeoReport.productionAdminTokenAuthorized &&
          securityAndSeoReport.productionAdminLoginApi &&
          consoleUiReport.pass &&
          securityAndSeoReport.missingPasswordBlocked400 &&
          securityAndSeoReport.nullPasswordBlocked400 &&
          securityAndSeoReport.emptyPasswordBlocked400 &&
          securityAndSeoReport.wrongPasswordBlocked401 &&
          securityAndSeoReport.publicRoomsWriteBlocked &&
          securityAndSeoReport.rateLimitingEnforced429 &&
          securityAndSeoReport.unauthenticatedConsoleAccessBlocked &&
          securityAndSeoReport.viewerRoleMutationBlocked &&
          securityAndSeoReport.buildingScopeEnforced &&
          securityAndSeoReport.secretRotationDualKeyAccepted &&
          securityAndSeoReport.burnedOldKeyRejected401 &&
          securityAndSeoReport.tokenRevocationByJtiWorks &&
          securityAndSeoReport.sessionVersionInvalidationWorks &&
          securityAndSeoReport.zeroTenantDataLeakage,
      },
      rc04_sustainedLoadTesting: {
        summary: sustainedLoadReport.summary,
        publicContentTiers: sustainedLoadReport.publicContentSustainedTiers.map((t) => ({
          vuCount: t.vuCount,
          activeWorkers: t.activeWorkers,
          throughputReqSec: t.requests.throughputReqSec,
          p95Ms: t.latencyMs.p95,
          p99Ms: t.latencyMs.p99,
          infrastructureErrorRatePct: t.requests.infrastructureErrorRatePct,
          peakPostgresConnections: t.postgresqlConnectionPool.peakTotalConnections,
          memoryGrowthPct: t.resourceUsage.memoryGrowthPct,
          slaPass: t.slaPass,
        })),
        validLeadCapacityBenchmark: sustainedLoadReport.validLeadCapacityBenchmark,
        antiSpamAndRateLimitBenchmark: sustainedLoadReport.antiSpamAndRateLimitBenchmark,
        pass: sustainedLoadReport.summary.overallPass,
      },
      rc05_databaseAndSeo: {
        backupAndRestorePass: backupRestoreReport.restoreVerification.pass,
        backupDurationMs: backupRestoreReport.backupFile.dumpDurationMs,
        restoreDurationMs: backupRestoreReport.restoreVerification.restoreDurationMs,
        backupSha256: backupRestoreReport.backupFile.sha256,
        dynamicSsrEtag304Works: securityAndSeoReport.dynamicSsrEtag304Works,
        oldSlug301RedirectWorks: securityAndSeoReport.oldSlug301RedirectWorks,
        unpublishedRoom404AndNoindex: securityAndSeoReport.unpublishedRoom404AndNoindex,
        pass:
          backupRestoreReport.restoreVerification.pass &&
          securityAndSeoReport.dynamicSsrEtag304Works &&
          securityAndSeoReport.oldSlug301RedirectWorks &&
          securityAndSeoReport.unpublishedRoom404AndNoindex,
      },
      rc06_coreWebVitals: {
        lcpMs: roomDetailRum.lcpMs,
        clsScore: roomDetailRum.clsScore,
        maxInpMs: roomDetailRum.maxInpMs,
        p98InpMs: roomDetailRum.p98InpMs,
        lcpGoodUnder2500ms: roomDetailRum.lcpMs > 0 && roomDetailRum.lcpMs <= 2500,
        clsGoodUnder01: roomDetailRum.clsScore >= 0 && roomDetailRum.clsScore <= 0.1,
        inpGoodUnder200ms: roomDetailRum.maxInpMs > 0 && roomDetailRum.maxInpMs <= 200,
        serverRumClsGood:
          !serverRumSummary?.metrics?.CLS?.count ||
          serverRumSummary?.metrics?.CLS?.p75 <= 0.1,
        serverRumClsMaxGood:
          !serverRumSummary?.metrics?.CLS?.count ||
          serverRumSummary?.metrics?.CLS?.max <= 0.1,
        roomDetailRum,
        serverRumSummary,
        realInteractions,
        allInteractionsUnder200ms: realInteractions.every((i) => i.passUnder200ms),
        recordedEventsGreaterThanZero: realInteractions.every((i) => i.recordedEvents > 0),
        pass:
          roomDetailRum.lcpMs > 0 &&
          roomDetailRum.lcpMs <= 2500 &&
          roomDetailRum.clsScore >= 0 &&
          roomDetailRum.clsScore <= 0.1 &&
          roomDetailRum.maxInpMs > 0 &&
          roomDetailRum.maxInpMs <= 200 &&
          (!serverRumSummary?.metrics?.CLS?.count ||
            (serverRumSummary?.metrics?.CLS?.p75 <= 0.1 &&
              serverRumSummary?.metrics?.CLS?.max <= 0.1)) &&
          realInteractions.every((i) => i.passUnder200ms && i.recordedEvents > 0) &&
          roomDetailRum.totalInpEvents > 0,
      },
      overallVerdict: 'RC1_VERIFICATION_PENDING',
    };

    // Strict Quality Gate computation: evaluated via shared qualityGateCore engine
    const evaluation = evaluateQualityGate(finalReport);
    finalReport.overallVerdict = evaluation.verdict;
    finalReport.qualityGatePassed = evaluation.passed;
    finalReport.qualityGateIssues = evaluation.issues;

    const jsonStr = JSON.stringify(finalReport, null, 2);
    const localOutPath = path.join(RC1_OUTPUT_DIR, 'rc1_verification_results.json');
    const artifactOutPath = path.join(ARTIFACT_DIR, 'rc1_verification_results.json');
    fs.writeFileSync(localOutPath, jsonStr);
    fs.writeFileSync(artifactOutPath, jsonStr);

    console.log('\n============================================================');
    console.log(`   RC1 FULL VERIFICATION: ${finalReport.overallVerdict}    `);
    console.log(`   Written to: ${localOutPath}`);
    console.log(`   Artifact:   ${artifactOutPath}`);
    console.log('============================================================\n');

    return finalReport;
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith('verifyRC1.mjs')) {
  runFullRC1Verification()
    .then((r) => {
      console.log('Verification completed with verdict:', r.overallVerdict);
      if (r.overallVerdict !== 'RC1_PRODUCTION_READY') {
        console.error('CRITICAL: RC1 Quality Gate failed! Overall verdict is:', r.overallVerdict);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Verification failed with error:', err);
      process.exit(1);
    });
}
