import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { hashPassword } from '../server/passwordHash.ts';

const prisma = new PrismaClient();
const REPO_ROOT = path.resolve('d:\\AdHome-Platform');
const LANDING_URL = 'http://127.0.0.1:8081';
const CONSOLE_URL = 'http://127.0.0.1:5174';

const TASK_ID = 'BASE-01';
const COMMIT_SHA = 'e3d4fb7';
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'console-v2', TASK_ID, COMMIT_SHA);
const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const ARTIFACT_DIR = path.resolve('C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error('No compatible browser executable found.');
}

function killPort(port) {
  try {
    const { execSync } = require('node:child_process');
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(Number(pid))) {
        try { execSync(`taskkill /F /PID ${pid}`); } catch {}
      }
    }
  } catch {}
}

async function waitForHttpOk(url, maxTries = 40, intervalMs = 500) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(url, (r) => {
          resolve(r.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(800, () => {
          req.destroy();
          resolve(0);
        });
      });
      if (res >= 200 && res < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.nextId++;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`CDP Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(outPaths) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(res.data, 'base64');
    for (const p of outPaths) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
    }
    return buf;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — BASE-01 Baseline Architecture & Evidence');
  console.log(`Commit: ${COMMIT_SHA} | Task: ${TASK_ID}`);
  console.log('=================================================================\n');

  let landingProc = null;
  let consoleProc = null;
  let browserProc = null;
  let prodAdminSnapshot = null;
  const manifest = [];

  try {
    // 1. Snapshot Production Admin & Provision Dedicated Test Actor
    console.log('[Step 1] Snapshotting Production Admin & Provisioning Test Actor...');
    const PROD_ADMIN_EMAIL = 'admin@adhome.vn';
    const TEST_ACTOR_EMAIL = 'automation.test.admin@adhome.internal';
    const TEST_ACTOR_ID = 'usr-automation-test-admin';

    const prodAdminBefore = await prisma.consoleActor.findUnique({
      where: { email: PROD_ADMIN_EMAIL },
    });
    if (!prodAdminBefore) {
      throw new Error(`Production admin (${PROD_ADMIN_EMAIL}) does not exist in database.`);
    }
    prodAdminSnapshot = JSON.stringify(prodAdminBefore);
    console.log(`  Production admin verified: ${prodAdminBefore.email} (sessionVersion: ${prodAdminBefore.sessionVersion})`);

    const ephemeralPassword = `TestAdminBase01@${crypto.randomBytes(6).toString('hex')}!`;
    const passwordHash = await hashPassword(ephemeralPassword);

    const testActor = await prisma.consoleActor.upsert({
      where: { email: TEST_ACTOR_EMAIL },
      update: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        isActive: true,
        sessionVersion: { increment: 1 },
      },
      create: {
        id: TEST_ACTOR_ID,
        email: TEST_ACTOR_EMAIL,
        displayName: 'Automation Test Runner Admin',
        orgId: prodAdminBefore.orgId,
        role: 'ADMIN',
        permissions: prodAdminBefore.permissions,
        buildingScopes: prodAdminBefore.buildingScopes,
        isActive: true,
        passwordHash,
        passwordUpdatedAt: new Date(),
        sessionVersion: 1,
      },
    });
    console.log(`  Isolated test actor ready: ${testActor.email}`);

    // 2. Start Servers
    console.log('\n[Step 2] Starting Servers...');
    killPort(8081);
    killPort(5174);
    await new Promise((r) => setTimeout(r, 600));

    landingProc = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['--filter', '@adhome/landing', 'preview', '--host', '127.0.0.1', '--port', '8081'],
      {
        cwd: REPO_ROOT,
        shell: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ADHOME_CONSOLE_LOGIN_ENABLED: 'true',
          HUNONIC_ALLOW_MOCK: 'true',
          HUNONIC_MOCK_MODE: 'true',
        },
      }
    );
    const landingOk = await waitForHttpOk(`${LANDING_URL}/api/v1/health`, 40, 500);
    if (!landingOk) throw new Error('Failed to start landing preview server.');
    console.log('  Landing server ready.');

    consoleProc = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['--filter', '@adhome/console', 'preview', '--host', '127.0.0.1', '--port', '5174'],
      {
        cwd: REPO_ROOT,
        shell: true,
        stdio: 'ignore',
        env: { ...process.env },
      }
    );
    const consoleOk = await waitForHttpOk(CONSOLE_URL, 40, 500);
    if (!consoleOk) throw new Error('Failed to start console preview server.');
    console.log('  Console server ready.');

    // 3. Connect Chrome CDP
    console.log('\n[Step 3] Launching Chrome CDP...');
    const browserBin = findBrowserExecutable();
    const cdpPort = 9224;
    const userDataDir = path.join(REPO_ROOT, '.tmp-base-01-profile');
    fs.mkdirSync(userDataDir, { recursive: true });

    browserProc = spawn(
      browserBin,
      [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    let cdpWsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) {
          cdpWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }
    if (!cdpWsUrl) throw new Error('CDP WebSocket URL not found.');
    console.log('  CDP connected:', cdpWsUrl);

    const cdp = new CdpClient(cdpWsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    async function waitForSelector(selector, maxTries = 40, intervalMs = 250) {
      for (let i = 0; i < maxTries; i++) {
        const found = await cdp.eval(`document.querySelector(${JSON.stringify(selector)}) !== null`).catch(() => false);
        if (found) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return false;
    }

    async function setControlledInput(selector, value) {
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

    async function navigateModule(moduleId) {
      await cdp.eval(`(() => {
        const navBtn = document.querySelector('[data-testid="console-nav-' + ${JSON.stringify(moduleId)} + '"]') ||
                       document.querySelector('[data-testid="nav-' + ${JSON.stringify(moduleId)} + '"]');
        if (navBtn) navBtn.click();
        else if (window.__adhome_setActiveModule) window.__adhome_setActiveModule(${JSON.stringify(moduleId)});
      })()`);
      await new Promise((r) => setTimeout(r, 800));
    }

    // 4. Authenticate into Console UI
    console.log('\n[Step 4] Logging into Console UI...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${CONSOLE_URL}/login` });
    const hasLogin = await waitForSelector('[data-testid="console-login-email"]');
    if (!hasLogin) throw new Error('Console login page did not load.');

    await setControlledInput('[data-testid="console-login-email"]', testActor.email);
    await setControlledInput('[data-testid="console-login-password"]', ephemeralPassword);
    await cdp.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);

    const hasHeader = await waitForSelector('[data-testid="console-desktop-header"]', 50, 250);
    if (!hasHeader) throw new Error('Console failed to login.');
    await new Promise((r) => setTimeout(r, 1000));
    console.log('  Authenticated successfully.');

    async function capture({ filename, width, height, scenario }) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 768,
      });
      await new Promise((r) => setTimeout(r, 400));

      const outPaths = [
        path.join(SCREENSHOTS_DIR, filename),
        path.join(ARTIFACT_DIR, filename),
      ];

      const buf = await cdp.screenshot(outPaths);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

      const meta = {
        filename,
        scenario,
        viewport: `${width}x${height}`,
        sizeBytes: buf.length,
        sha256,
        relativePath: `screenshots/${filename}`,
        capturedAt: new Date().toISOString(),
      };
      manifest.push(meta);
      console.log(`     Saved ${filename}: ${buf.length} bytes | SHA: ${sha256.slice(0, 16)}...`);
      return meta;
    }

    // Capture 1: Desktop Header & Sidebar Expanded
    console.log('\n[Step 5] Capturing Baseline Screenshots...');
    await navigateModule('overview');
    await capture({
      filename: 'baseline_desktop_header_sidebar_expanded.png',
      width: 1440,
      height: 900,
      scenario: 'Desktop Header & Sidebar trạng thái mở rộng (Expanded) với Scope tòa nhà, Search, Notifications và User profile',
    });

    // Capture 2: Desktop Header & Sidebar Collapsed
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));
    await capture({
      filename: 'baseline_desktop_header_sidebar_collapsed.png',
      width: 1440,
      height: 900,
      scenario: 'Desktop Header & Sidebar trạng thái thu gọn (Collapsed, Ctrl+B) và nút thu phóng sidebar hiện trạng',
    });

    // Toggle back to expanded
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    // Capture 3: Desktop Contracts Table
    await navigateModule('contracts');
    await waitForSelector('[data-testid="contract-row"]', 30, 200);
    await capture({
      filename: 'baseline_desktop_contracts_table.png',
      width: 1440,
      height: 900,
      scenario: 'Desktop Phân hệ Hợp đồng: Bảng danh sách hợp đồng hiện trạng, mã hợp đồng dài, nút hành động và các cột dữ liệu',
    });

    // Capture 4: Mobile Header Nav
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await navigateModule('overview');
    await new Promise((r) => setTimeout(r, 600));
    await capture({
      filename: 'baseline_mobile_header_nav.png',
      width: 390,
      height: 844,
      scenario: 'Giao diện Mobile: Header di động, chuyển đổi chế độ xem, điều hướng dưới chân trang (Bottom Navigation)',
    });

    // Capture 5: Mobile Contracts Cards
    await navigateModule('contracts');
    await new Promise((r) => setTimeout(r, 600));
    await capture({
      filename: 'baseline_mobile_contracts_cards.png',
      width: 390,
      height: 844,
      scenario: 'Giao diện Mobile: Danh sách hợp đồng dạng thẻ (Mobile Cards), định dạng tiền tệ và các nút hành động hiện trạng',
    });

    cdp.close();

    // 6. Write Manifest & Verification
    console.log('\n[Step 6] Writing Manifest & Checksums...');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'screenshots-manifest.json'), JSON.stringify(manifest, null, 2));

    const checkLines = manifest.map((m) => `${m.sha256}  ${m.relativePath} (${m.sizeBytes} bytes, ${m.viewport})`);
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'checksums-verified.txt'), checkLines.join('\n'));

    console.log('Manifest written successfully.');
    console.log(`Captured ${manifest.length} baseline screenshots. Zero collisions: ${new Set(manifest.map(m => m.sha256)).size === manifest.length}`);

  } finally {
    // Check production admin isolation
    try {
      const prodAdminAfter = await prisma.consoleActor.findUnique({
        where: { email: 'admin@adhome.vn' },
      });
      const prodAdminAfterJson = JSON.stringify(prodAdminAfter);
      if (typeof prodAdminSnapshot !== 'undefined' && prodAdminSnapshot !== prodAdminAfterJson) {
        console.error('CRITICAL VIOLATION: Production admin (admin@adhome.vn) was modified!');
        process.exitCode = 1;
      } else {
        console.log('\n[Security Invariant] PASS: Production admin (admin@adhome.vn) is 100% untouched.');
      }
    } catch (secErr) {
      console.error('Security invariant check error:', secErr);
      process.exitCode = 1;
    }

    // Clean up test actor
    try {
      await prisma.consoleActor.deleteMany({
        where: { email: 'automation.test.admin@adhome.internal' },
      });
      console.log('[Cleanup] Ephemeral test actor deleted.');
    } catch (cleanupErr) {
      console.warn('[Cleanup Warning] Failed to delete test actor:', cleanupErr);
    }

    if (browserProc) {
      try { browserProc.kill(); } catch {}
    }
    if (consoleProc) {
      try { consoleProc.kill(); } catch {}
    }
    if (landingProc) {
      try { landingProc.kill(); } catch {}
    }
    await prisma.$disconnect();
    killPort(8081);
    killPort(5174);
  }
}

main().catch((err) => {
  console.error('Fatal error during baseline capture:', err);
  process.exit(1);
});

