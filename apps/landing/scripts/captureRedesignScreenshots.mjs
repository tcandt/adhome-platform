import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { hashPassword } from '../server/passwordHash.ts';

const prisma = new PrismaClient();
const REPO_ROOT = process.cwd();
const LANDING_URL = 'http://127.0.0.1:8081';
const CONSOLE_URL = 'http://127.0.0.1:5174';

const TASK_ID = 'UI-ROUNDED-SHELL-AND-LOGO-LOADER';
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'console-v2', TASK_ID);
const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

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
    } catch { }
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
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('  [Browser Exception]:', JSON.stringify(msg.params?.exceptionDetails?.exception || msg.params?.exceptionDetails));
        }
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
      try { this.ws.close(); } catch { }
    }
  }
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — UI-REDESIGN Visual Evidence Runner');
  console.log('Tasks: UI-01 (Header), UI-02 (Sidebar Trigger), UI-04 (Short Code), UI-05 (Table), UI-07 (Mobile)');
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
    console.log(`  Production admin verified: ${prodAdminBefore.email}`);

    const ephemeralPassword = `TestAdminUiRedesign@${crypto.randomBytes(6).toString('hex')}!`;
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
        env: {
          ...process.env,
          ADHOME_API_TARGET: 'http://127.0.0.1:8081',
        },
      }
    );
    const consoleOk = await waitForHttpOk(CONSOLE_URL, 40, 500);
    if (!consoleOk) throw new Error('Failed to start console preview server.');
    console.log('  Console server ready.');

    // 3. Connect Chrome CDP
    console.log('\n[Step 3] Launching Chrome CDP...');
    const browserBin = findBrowserExecutable();
    const cdpPort = 9225;
    const userDataDir = path.join(REPO_ROOT, '.tmp-ui-redesign-profile');
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { }
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
      } catch { }
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
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCookies');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${CONSOLE_URL}/login` });
    console.log(`  Navigating to ${CONSOLE_URL}/login...`);
    await new Promise((r) => setTimeout(r, 800));

    const isAlreadyIn = await cdp.eval(`!!document.querySelector('[data-testid="console-desktop-header"]')`).catch(() => false);
    if (!isAlreadyIn) {
      const hasLogin = await waitForSelector('[data-testid="console-login-email"]');
      if (!hasLogin) {
        const finalDebug = await cdp.eval(`({ url: window.location.href, body: document.body ? document.body.innerHTML.slice(0, 500) : null })`).catch((e) => ({ error: e.message }));
        console.error('  Failed to find login selector. Current page state:', finalDebug);
        throw new Error('Console login page did not load.');
      }

      await setControlledInput('[data-testid="console-login-email"]', testActor.email);
      await setControlledInput('[data-testid="console-login-password"]', ephemeralPassword);
      await cdp.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);

      const hasHeader = await waitForSelector('[data-testid="console-desktop-header"]', 50, 250);
      if (!hasHeader) throw new Error('Console failed to login.');
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log('  Authenticated successfully.');

    async function capture({ filename, width, height, scenario }) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 768,
      });
      await new Promise((r) => setTimeout(r, 500));

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

    // Helper to reliably set and verify sidebar state (QA-04-FIX-01 / QA-HEADER-01)
    async function setSidebarState(targetState) {
      const getState = () => cdp.eval(`(() => {
        const sidebar = document.querySelector('[data-testid="console-desktop-sidebar"]');
        return sidebar ? sidebar.getAttribute('data-state') : null;
      })()`);

      let current = await getState();
      if (current !== targetState) {
        await cdp.eval(`(() => {
          const btn = document.querySelector('[data-testid="console-sidebar-toggle"]') ||
                      document.querySelector('[data-sidebar="trigger"]') ||
                      document.querySelector('[data-testid="console-sidebar-trigger"]');
          if (btn) btn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 600));
        current = await getState();
      }
      if (current !== targetState) {
        throw new Error(`QA-04-FIX-01 Assertion Failed: Expected sidebar '${targetState}', but got '${current}'`);
      }
      return current;
    }

    // 5. Capture Redesigned Views
    console.log('\n[Step 5] Capturing Redesigned Visual Evidence (AFTER_REDESIGN)...');

    // =========================================================================
    // [QA-HEADER-01] Desktop Header & Sidebar Redesign Formal Quality Gate
    // =========================================================================
    console.log('\n[QA-HEADER-01] Executing Header & Sidebar UX Verification Quality Gate...');

    // Assertion 1: Aligned Header Architecture & Layout Controls
    const toggleArch = await cdp.eval(`(() => {
      const toggle = document.querySelector('[data-testid="console-sidebar-toggle"]');
      const sidebar = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const header = document.querySelector('[data-testid="console-desktop-header"]');
      const sidebarHeader = sidebar?.querySelector('[data-sidebar="header"]');
      const search = header?.querySelector('[data-testid="console-global-search-trigger"]');
      const notif = header?.querySelector('[data-testid="console-notifications-trigger"]');
      const userMenu = header?.querySelector('[data-testid="console-user-menu-trigger"]');

      const toggleRect = toggle ? toggle.getBoundingClientRect() : null;
      const searchRect = search ? search.getBoundingClientRect() : null;
      const headerRect = header ? header.getBoundingClientRect() : null;

      const toggleExists = !!toggle;
      const inSidebar = sidebar ? sidebar.contains(toggle) : false;
      const inHeader = header ? header.contains(toggle) : false;
      const inSidebarHeader = sidebarHeader ? sidebarHeader.contains(toggle) : false;

      // Verify DesktopHeader controls
      const headerControls = {
        hasTrigger: !!header?.querySelector('[data-sidebar="trigger"], [data-testid="console-sidebar-trigger"], [data-testid="console-sidebar-toggle"]'),
        hasSearch: !!search,
        hasNotifications: !!notif,
        hasUserMenu: !!userMenu,
        hasScope: !!header?.querySelector('[data-testid="console-building-scope-selector"]'),
        hasSync: !!header?.querySelector('[data-testid="console-sync-status"]'),
      };

      const headerHeight = headerRect ? Math.round(headerRect.height) : 0;
      const toggleWidth = toggleRect ? Math.round(toggleRect.width) : 0;
      const toggleHeight = toggleRect ? Math.round(toggleRect.height) : 0;

      // Safe zone check: search must start to the right of the toggle
      const safeZoneOk = (searchRect && toggleRect) ? (searchRect.left >= toggleRect.right) : false;

      const layoutPassed = inHeader && !inSidebar && !inSidebarHeader &&
        headerControls.hasTrigger && headerControls.hasSearch &&
        headerControls.hasNotifications && headerControls.hasUserMenu &&
        !headerControls.hasScope && !headerControls.hasSync;

      return {
        toggleExists,
        inSidebar,
        inHeader,
        inSidebarHeader,
        toggleSize: { width: toggleWidth, height: toggleHeight },
        headerHeight,
        headerControls,
        layoutPassed,
        safeZoneOk,
        topCoord: toggleRect ? Math.round(toggleRect.top) : null,
        leftCoord: toggleRect ? Math.round(toggleRect.left) : null,
      };
    })()`);

    console.log('  [QA-HEADER-01 Assertion 1] Aligned Header & Toggle Controls:', toggleArch);
    if (!toggleArch.toggleExists || !toggleArch.inHeader || toggleArch.inSidebar || toggleArch.inSidebarHeader) {
      throw new Error(`QA-HEADER-01 Failed: Toggle button is not in Header or leaked into Sidebar: ${JSON.stringify(toggleArch)}`);
    }
    if (toggleArch.toggleSize.width < 44 || toggleArch.toggleSize.height < 44) {
      throw new Error(`QA-HEADER-01 Failed: Toggle touch target < 44px: ${JSON.stringify(toggleArch.toggleSize)}`);
    }
    if (!toggleArch.layoutPassed || toggleArch.headerHeight !== 64 || !toggleArch.safeZoneOk) {
      throw new Error(`QA-HEADER-01 Failed: Header layout mismatch or height != 64: ${JSON.stringify(toggleArch)}`);
    }

    // Assertion 2: Expanded -> Collapsed -> Expanded Pointer Transition & Widths
    console.log('  [QA-HEADER-01 Assertion 2] Testing Pointer Event Collapse & Sidebar Transitions...');
    const initialSidebar = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const r = sb ? sb.getBoundingClientRect() : null;
      return {
        state: sb?.getAttribute('data-state'),
        width: Math.round(r?.width || 0),
      };
    })()`);
    if (initialSidebar.state !== 'expanded' || Math.abs(initialSidebar.width - 248) > 2) {
      throw new Error(`QA-HEADER-01 Failed: Initial sidebar not expanded (248px): ${JSON.stringify(initialSidebar)}`);
    }

    // Click toggle button to collapse
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    const collapsedCheck = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const toggle = document.querySelector('[data-testid="console-sidebar-toggle"]');
      const r = sb ? sb.getBoundingClientRect() : null;
      return {
        state: sb?.getAttribute('data-state'),
        width: Math.round(r?.width || 0),
        ariaExpanded: toggle?.getAttribute('aria-expanded'),
      };
    })()`);
    console.log('  [QA-HEADER-01 Collapsed Check]:', collapsedCheck);
    if (collapsedCheck.state !== 'collapsed' || Math.abs(collapsedCheck.width - 72) > 2 || collapsedCheck.ariaExpanded !== 'false') {
      throw new Error(`QA-HEADER-01 Failed: Collapse transition failed: ${JSON.stringify(collapsedCheck)}`);
    }

    // Hover stability test: Dispatch mouseenter / mousemove on collapsed sidebar
    await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      if (sb) {
        sb.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        sb.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    const hoverCheck = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const r = sb ? sb.getBoundingClientRect() : null;
      return { state: sb?.getAttribute('data-state'), width: Math.round(r?.width || 0) };
    })()`);
    console.log('  [QA-HEADER-01 Hover Stability Check]:', hoverCheck);
    if (hoverCheck.state !== 'collapsed' || Math.abs(hoverCheck.width - 72) > 2) {
      throw new Error(`QA-HEADER-01 Failed: Sidebar auto-expanded on hover! State: ${JSON.stringify(hoverCheck)}`);
    }

    // Click toggle button again to re-expand
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));
    const reExpandedCheck = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const toggle = document.querySelector('[data-testid="console-sidebar-toggle"]');
      const r = sb ? sb.getBoundingClientRect() : null;
      return {
        state: sb?.getAttribute('data-state'),
        width: Math.round(r?.width || 0),
        ariaExpanded: toggle?.getAttribute('aria-expanded'),
      };
    })()`);
    if (reExpandedCheck.state !== 'expanded' || Math.abs(reExpandedCheck.width - 248) > 2) {
      throw new Error(`QA-HEADER-01 Failed: Re-expand failed: ${JSON.stringify(reExpandedCheck)}`);
    }

    // Assertion 3: Keyboard Shortcut Ctrl+B & Input Tag Exclusion
    console.log('  [QA-HEADER-01 Assertion 3] Testing Keyboard Shortcut Ctrl+B...');
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      modifiers: 2, // Ctrl
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      modifiers: 2,
    });
    await new Promise((r) => setTimeout(r, 600));

    const ctrlBCheck = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      return sb?.getAttribute('data-state');
    })()`);
    console.log('  [QA-HEADER-01 Ctrl+B Result]:', ctrlBCheck);
    if (ctrlBCheck !== 'collapsed') {
      throw new Error(`QA-HEADER-01 Failed: Ctrl+B did not collapse sidebar (got '${ctrlBCheck}')`);
    }

    // Test input tag exclusion: when typing in an input, Ctrl+B must NOT toggle
    await cdp.eval(`(() => {
      const input = document.createElement('input');
      input.id = 'temp-test-input';
      document.body.appendChild(input);
      input.focus();
    })()`);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      modifiers: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    const inputExclusionCheck = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const input = document.getElementById('temp-test-input');
      if (input) input.remove();
      return sb?.getAttribute('data-state');
    })()`);
    console.log('  [QA-HEADER-01 Input Exclusion Check]:', inputExclusionCheck);
    if (inputExclusionCheck !== 'collapsed') {
      throw new Error(`QA-HEADER-01 Failed: Ctrl+B triggered inside an input tag!`);
    }

    // Re-expand via Ctrl+B
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      modifiers: 2,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      modifiers: 2,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Assertion 4: LocalStorage Persistence across Reload
    console.log('  [QA-HEADER-01 Assertion 4] Testing LocalStorage Persistence across Reload...');
    // Set to collapsed and verify localStorage
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 500));
    const savedPref = await cdp.eval(`localStorage.getItem('adhome_ui_sidebar_open')`);
    if (savedPref !== 'false') {
      throw new Error(`QA-HEADER-01 Failed: Expected localStorage 'adhome_ui_sidebar_open' to be 'false', got '${savedPref}'`);
    }

    // Reload page
    await cdp.send('Page.reload');
    await waitForSelector('[data-testid="console-desktop-header"]', 50, 250);
    await new Promise((r) => setTimeout(r, 1000));

    const reloadedState = await cdp.eval(`(() => {
      const sb = document.querySelector('[data-testid="console-desktop-sidebar"]');
      const r = sb ? sb.getBoundingClientRect() : null;
      return { state: sb?.getAttribute('data-state'), width: Math.round(r?.width || 0) };
    })()`);
    console.log('  [QA-HEADER-01 Reload Persistence Check]:', reloadedState);
    if (reloadedState.state !== 'collapsed' || Math.abs(reloadedState.width - 72) > 2) {
      throw new Error(`QA-HEADER-01 Failed: Sidebar did not persist collapsed state across reload: ${JSON.stringify(reloadedState)}`);
    }

    // Re-expand sidebar after reload
    await cdp.eval(`document.querySelector('[data-testid="console-sidebar-toggle"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    // Assertion 5: Relocated Controls Verification (Scope, Notifications, User Menu, Sync)
    console.log('  [QA-HEADER-01 Assertion 5] Testing Relocated Controls (Scope, Notifications, User Menu, Sync)...');
    // 5a. Scope in Overview
    const overviewScopeCheck = await cdp.eval(`(() => {
      const scopeBtn = document.querySelector('[data-testid="console-overview-portfolio-summary"] [data-testid="console-building-scope-selector"]');
      return { found: !!scopeBtn };
    })()`);
    console.log('  [Overview Scope Check]:', overviewScopeCheck);
    if (!overviewScopeCheck.found) {
      throw new Error(`QA-HEADER-01 Failed: BuildingScopeSelector not found in Overview summary banner`);
    }

    // 5b. Sync in Sidebar Footer
    const syncCheck = await cdp.eval(`(() => {
      const syncBtn = document.querySelector('[data-sidebar="footer"] [data-testid="console-sync-status"]');
      return { found: !!syncBtn };
    })()`);
    if (!syncCheck.found) {
      throw new Error(`QA-HEADER-01 Failed: Sync Status not found in Sidebar Footer`);
    }

    // 5c. Notifications in Desktop Header
    await cdp.eval(`document.querySelector('[data-testid="console-desktop-header"] [data-testid="console-notifications-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 400));
    const notifPopoverCheck = await cdp.eval(`(() => {
      const popover = document.querySelector('[data-testid="console-notifications-popover"]');
      return { found: !!popover };
    })()`);
    if (!notifPopoverCheck.found) {
      throw new Error(`QA-HEADER-01 Failed: Notifications popover failed to open from Desktop Header`);
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 300));

    // 5d. User Menu in Desktop Header
    await cdp.eval(`document.querySelector('[data-testid="console-desktop-header"] [data-testid="console-user-menu-trigger"]')?.click()`);
    await new Promise((r) => setTimeout(r, 400));
    const userMenuCheck = await cdp.eval(`(() => {
      const popover = document.querySelector('[data-testid="console-user-menu-popover"]');
      const roleBadge = popover?.querySelector('[data-testid="console-actor-role-badge"]') ||
                        document.querySelector('[data-testid="console-actor-role-badge"]');
      const scopeBadge = popover?.querySelector('[data-testid="console-actor-scope-badge"]');
      const themeToggle = popover?.querySelector('[data-testid="console-theme-toggle"]');
      const logoutBtn = popover?.querySelector('[data-testid="console-logout-button"]');
      return {
        popoverFound: !!popover,
        roleBadgeFound: !!roleBadge,
        scopeBadgeFound: !!scopeBadge,
        themeToggleFound: !!themeToggle,
        logoutBtnFound: !!logoutBtn,
      };
    })()`);
    console.log('  [User Menu Check]:', userMenuCheck);
    if (!userMenuCheck.popoverFound || !userMenuCheck.roleBadgeFound || !userMenuCheck.scopeBadgeFound || !userMenuCheck.themeToggleFound || !userMenuCheck.logoutBtnFound) {
      throw new Error(`QA-HEADER-01 Failed: User Menu items incomplete: ${JSON.stringify(userMenuCheck)}`);
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 300));

    // Assertion 6: Multi-Viewport Header Stability & Zoom Simulation
    console.log('  [QA-HEADER-01 Assertion 6] Testing Multi-Viewport Header Stability & Zoom Simulation...');
    const headerMatrix = [1024, 1280, 1366, 1440, 1920];
    for (const w of headerMatrix) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 900,
        deviceScaleFactor: 2,
        mobile: false,
      });
      await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
      await new Promise((r) => setTimeout(r, 150));

      const vpCheck = await cdp.eval(`(() => {
        const header = document.querySelector('[data-testid="console-desktop-header"]');
        const h = header ? header.getBoundingClientRect().height : 0;
        const overflow = document.documentElement.scrollWidth > window.innerWidth;
        return { height: Math.round(h), overflow };
      })()`);
      console.log(`    Viewport ${w}px: Header Height = ${vpCheck.height}px | Overflow = ${vpCheck.overflow}`);
      if (vpCheck.overflow || vpCheck.height > 66 || vpCheck.height < 54) {
        throw new Error(`QA-HEADER-01 Failed at ${w}px: Header height (${vpCheck.height}px) or overflow (${vpCheck.overflow})`);
      }
    }

    // Zoom Simulations (1280px @ 125% zoom = 1024px, 1440px @ 125% zoom = 1152px, 1920px @ 150% zoom = 1280px)
    const zoomTestMatrix = [
      { label: '1280px @ 125% zoom', width: 1024, height: 768 },
      { label: '1440px @ 125% zoom', width: 1152, height: 800 },
      { label: '1920px @ 150% zoom', width: 1280, height: 720 },
    ];
    for (const zt of zoomTestMatrix) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: zt.width,
        height: zt.height,
        deviceScaleFactor: 2,
        mobile: false,
      });
      await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
      await new Promise((r) => setTimeout(r, 150));
      const ztCheck = await cdp.eval(`(() => {
        const header = document.querySelector('[data-testid="console-desktop-header"]');
        const h = header ? header.getBoundingClientRect().height : 0;
        return { height: Math.round(h), overflow: document.documentElement.scrollWidth > window.innerWidth };
      })()`);
      console.log(`  [QA-HEADER-01 ${zt.label} Simulation]: height = ${ztCheck.height}px | overflow = ${ztCheck.overflow}`);
      if (ztCheck.overflow || ztCheck.height > 66 || ztCheck.height < 54) {
        throw new Error(`QA-HEADER-01 Failed at ${zt.label}: Header height (${ztCheck.height}px) or overflow (${ztCheck.overflow})`);
      }
    }

    // Reset back to standard 1440x900
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
    await new Promise((r) => setTimeout(r, 300));
    console.log('[QA-HEADER-01] ALL ASSERTIONS PASSED (100% PASS).\n');

    // 1. Desktop 1440x900 Header & Sidebar Expanded
    await navigateModule('overview');
    await capture({
      filename: 'redesign_desktop_1440_header_expanded.png',
      width: 1440,
      height: 900,
      scenario: 'UI-POLISH: Desktop 1440x900 Header với Sidebar Toggle [≡], Tìm kiếm Ctrl+K căn giữa, Thông báo và Profile Admin cân đối, Logo AdHome hài hòa, không viền giao cắt, hiệu ứng Animate UI mượt mà',
    });

    // 2. Desktop 1440x900 Header & Sidebar Collapsed
    await setSidebarState('collapsed');
    await capture({
      filename: 'redesign_desktop_1440_header_collapsed.png',
      width: 1440,
      height: 900,
      scenario: 'UI-POLISH: Desktop 1440x900 Sidebar thu gọn (72px) mượt mà không giật cục, icon mark cân đối, Header 64px không viền giao cắt, Tìm kiếm căn giữa',
    });

    // Re-expand sidebar
    await setSidebarState('expanded');

    // 3. Desktop 1280x720 Viewport Responsiveness
    await capture({
      filename: 'redesign_desktop_1280_header_contracts.png',
      width: 1280,
      height: 720,
      scenario: 'UI-01: Desktop 1280x720 Header không tràn 2 dòng, các cụm điều hướng và context tòa nhà cân đối',
    });

    // 4. Desktop 1920x1080 Viewport Widescreen
    await capture({
      filename: 'redesign_desktop_1920_header_overview.png',
      width: 1920,
      height: 1080,
      scenario: 'UI-01: Desktop 1920x1080 Header trên màn hình rộng 1080p, bố cục sắc nét không vỡ tỷ lệ',
    });

    // 5. Desktop Contracts Table Multi-Viewport Matrix (QA-04, QA-04-FIX-01, QA-04-FIX-02)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await navigateModule('contracts');
    await waitForSelector('[data-testid="contracts-table"]', 30, 200);

    // [QA-HEADER-01 Assertion 8] Contracts Workspace 2-Tier Toolbar Verification
    console.log('\n[QA-HEADER-01 Assertion 8] Verifying Contracts Deterministic 2-Tier Toolbar...');
    const contractsToolbarCheck = await cdp.eval(`(() => {
      const toolbar = document.querySelector('[data-testid="module-workspace-toolbar"]');
      const actions = document.querySelector('[data-testid="module-toolbar-actions"]');
      const context = document.querySelector('[data-testid="module-toolbar-context"]');
      const refreshBtn = actions?.querySelector('[data-testid="btn-module-refresh"]');
      const importBtn = actions?.querySelector('[data-testid="btn-open-legacy-import"]');
      const createBtn = actions?.querySelector('[data-testid="btn-open-create-contract"]');
      const scopeSelector = context?.querySelector('[data-testid="console-building-scope-selector"]');
      return {
        hasToolbar: !!toolbar,
        hasActions: !!actions,
        hasContext: !!context,
        hasRefresh: !!refreshBtn,
        hasImport: !!importBtn,
        hasCreate: !!createBtn,
        hasScope: !!scopeSelector,
      };
    })()`);
    console.log('  [Contracts 2-Tier Toolbar Check]:', contractsToolbarCheck);
    if (!contractsToolbarCheck.hasToolbar || !contractsToolbarCheck.hasActions || !contractsToolbarCheck.hasContext || !contractsToolbarCheck.hasRefresh || !contractsToolbarCheck.hasImport || !contractsToolbarCheck.hasCreate) {
      throw new Error(`QA-HEADER-01 Assertion 8 Failed: Contracts 2-Tier Toolbar check failed: ${JSON.stringify(contractsToolbarCheck)}`);
    }

    console.log('\n[QA-04] Executing Multi-Viewport Table & Sticky Column Assertions (1280, 1366, 1440, 1920)...');
    const tableTestMatrix = [
      { width: 1280, height: 720, label: '1280x720' },
      { width: 1366, height: 768, label: '1366x768' },
      { width: 1440, height: 900, label: '1440x900' },
      { width: 1920, height: 1080, label: '1920x1080' },
    ];

    for (const vp of tableTestMatrix) {
      for (const sidebarState of ['expanded', 'collapsed']) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: false,
        });
        await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
        await new Promise((r) => setTimeout(r, 200));

        // Enforce verified sidebar state
        const verifiedSidebar = await setSidebarState(sidebarState);

        const matrixResult = await cdp.eval(`(() => {
          const doc = document.documentElement;
          const table = document.querySelector('[data-testid="contracts-table"]');
          const container = table?.closest('.overflow-x-auto') || table;
          const containerRect = container ? container.getBoundingClientRect() : null;
          const stickyTh = table?.querySelector('th.sticky');
          const stickyTds = Array.from(table?.querySelectorAll('td.sticky') || []);
          const triggers = Array.from(table?.querySelectorAll('[data-testid="action-menu-trigger"]') || []);

          const overflow = doc.scrollWidth > window.innerWidth;
          const thRect = stickyTh ? stickyTh.getBoundingClientRect() : null;
          const stickyThPinned = thRect && containerRect
            ? thRect.right <= containerRect.right + 2 && thRect.right >= containerRect.right - 120 && thRect.right <= window.innerWidth
            : false;
          const allTdsVisible = stickyTds.length > 0 && stickyTds.every((td) => {
            const r = td.getBoundingClientRect();
            return containerRect
              ? r.right <= containerRect.right + 2 && r.right >= containerRect.right - 120 && r.right <= window.innerWidth && r.left >= 0
              : r.right <= window.innerWidth && r.left >= 0;
          });
          const allTriggersAccessible = triggers.length > 0 && triggers.every((t) => {
            const r = t.getBoundingClientRect();
            return r.right <= window.innerWidth && r.left >= 0 && r.width >= 40 && r.height >= 40;
          });

          // QA-04-FIX-02: Hit-testing with document.elementFromPoint
          let hitTestPassed = false;
          let hitTestDetails = null;
          if (triggers.length > 0) {
            const trg = triggers[0];
            const r = trg.getBoundingClientRect();
            const cx = Math.round(r.left + r.width / 2);
            const cy = Math.round(r.top + r.height / 2);
            const topEl = document.elementFromPoint(cx, cy);
            hitTestPassed = topEl === trg || trg.contains(topEl);
            hitTestDetails = { cx, cy, topElTag: topEl?.tagName, topElTestId: topEl?.getAttribute('data-testid') };
          }

          return {
            docScrollWidth: doc.scrollWidth,
            windowInnerWidth: window.innerWidth,
            overflow,
            hasTable: !!table,
            stickyThPinned,
            allTdsVisible,
            allTriggersAccessible,
            triggerCount: triggers.length,
            hitTestPassed,
            hitTestDetails,
          };
        })()`);

        console.log(`     [QA-04 ${vp.label} | Sidebar ${verifiedSidebar}] scrollWidth=${matrixResult.docScrollWidth}/${matrixResult.windowInnerWidth} | Overflow: ${matrixResult.overflow} | Sticky Th Pinned: ${matrixResult.stickyThPinned} | HitTest: ${matrixResult.hitTestPassed}`);

        if (matrixResult.overflow) {
          throw new Error(`QA-04 Failure at ${vp.label} (${sidebarState}): Whole-page horizontal overflow detected (scrollWidth=${matrixResult.docScrollWidth} > innerWidth=${matrixResult.windowInnerWidth})`);
        }
        if (!matrixResult.stickyThPinned || !matrixResult.allTdsVisible || !matrixResult.allTriggersAccessible || !matrixResult.hitTestPassed) {
          throw new Error(`QA-04 Failure at ${vp.label} (${sidebarState}): Sticky action column, triggers, or hit-testing obscured: ${JSON.stringify(matrixResult)}`);
        }
      }
    }

    // QA-04-FIX-02: 125% Zoom Simulation Test (width 1024px equivalent to 1280px at 125% zoom)
    console.log('\n[QA-04-FIX-02] Simulating 125% Zoom on 1280px (Effective Width: 1024px)...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await setSidebarState('expanded');
    const zoom125Result = await cdp.eval(`(() => {
      const doc = document.documentElement;
      const table = document.querySelector('[data-testid="contracts-table"]');
      const triggers = Array.from(table?.querySelectorAll('[data-testid="action-menu-trigger"]') || []);
      let hitTestPassed = false;
      if (triggers.length > 0) {
        const trg = triggers[0];
        const r = trg.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        const topEl = document.elementFromPoint(cx, cy);
        hitTestPassed = topEl === trg || trg.contains(topEl);
      }
      return {
        docScrollWidth: doc.scrollWidth,
        windowInnerWidth: window.innerWidth,
        overflow: doc.scrollWidth > window.innerWidth,
        hitTestPassed,
      };
    })()`);
    console.log(`     [125% Zoom Simulation Result]: scrollWidth=${zoom125Result.docScrollWidth}/${zoom125Result.windowInnerWidth} | Overflow: ${zoom125Result.overflow} | HitTest: ${zoom125Result.hitTestPassed}`);
    if (zoom125Result.overflow || !zoom125Result.hitTestPassed) {
      throw new Error(`QA-04-FIX-02 Failure at 125% zoom: ${JSON.stringify(zoom125Result)}`);
    }

    // C2-00: Full Horizontal Scroll Range Verification across scrollLeft = 0, mid, max
    console.log('\n[C2-00] Full Horizontal Scroll Range Verification (0 -> mid -> max scrollLeft)...');
    for (const testSidebar of ['expanded', 'collapsed']) {
      await setSidebarState(testSidebar);
      const scrollSweepResult = await cdp.eval(`(() => {
        const table = document.querySelector('[data-testid="contracts-table"]');
        const container = table?.closest('.overflow-x-auto');
        if (!container) return { error: 'No table scroll container' };

        const maxScroll = container.scrollWidth - container.clientWidth;
        const testPositions = [0, Math.round(maxScroll / 2), maxScroll];
        const stepResults = [];

        for (const pos of testPositions) {
          container.scrollLeft = pos;
          const containerRect = container.getBoundingClientRect();
          const stickyTh = table.querySelector('th.sticky');
          const thRect = stickyTh?.getBoundingClientRect();
          const triggers = Array.from(table.querySelectorAll('[data-testid="action-menu-trigger"]'));
          const firstTrigger = triggers[0];
          const trgRect = firstTrigger?.getBoundingClientRect();

          let hitTestPassed = false;
          let topTag = null;
          if (trgRect) {
            const cx = Math.round(trgRect.left + trgRect.width / 2);
            const cy = Math.round(trgRect.top + trgRect.height / 2);
            const topEl = document.elementFromPoint(cx, cy);
            hitTestPassed = topEl === firstTrigger || firstTrigger?.contains(topEl);
            topTag = topEl?.tagName;
          }

          const isPinned = thRect && Math.abs(thRect.right - containerRect.right) <= 2 && thRect.right <= window.innerWidth;
          stepResults.push({
            pos,
            maxScroll,
            isPinned,
            hitTestPassed,
            topTag,
            thRight: thRect ? Math.round(thRect.right) : null,
            containerRight: Math.round(containerRect.right)
          });
        }

        container.scrollLeft = 0;
        return {
          allPassed: stepResults.every(s => s.isPinned && s.hitTestPassed),
          steps: stepResults
        };
      })()`);
      console.log(`     [Scroll Sweep | Sidebar ${testSidebar}]: allPassed=${scrollSweepResult.allPassed}`);
      if (!scrollSweepResult.allPassed) {
        throw new Error(`C2-00 Full horizontal scroll test failed for sidebar ${testSidebar}: ${JSON.stringify(scrollSweepResult)}`);
      }
    }

    // Capture Table at 1280x720 with Sidebar EXPANDED (QA-04-FIX-01 Visual Proof)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await setSidebarState('expanded');
    await capture({
      filename: 'redesign_desktop_1280_contracts_table_expanded.png',
      width: 1280,
      height: 720,
      scenario: 'QA-04-FIX-01: Bảng hợp đồng Desktop tại 1280x720 khi Sidebar MỞ RỘNG (248px): 6 cột cân đối, không tràn ngang, cột Thao tác sticky-right luôn nhìn thấy',
    });

    // Capture Table at 1280x720 with Sidebar COLLAPSED (QA-04-FIX-01 Visual Proof)
    await setSidebarState('collapsed');
    await capture({
      filename: 'redesign_desktop_1280_contracts_table_collapsed.png',
      width: 1280,
      height: 720,
      scenario: 'QA-04-FIX-01: Bảng hợp đồng Desktop tại 1280x720 khi Sidebar THU GỌN (72px): Vùng hiển thị mở rộng, cột Thao tác sticky-right ghim cố định',
    });

    // Reset to 1440x900 with Sidebar EXPANDED for Desktop Polished
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await setSidebarState('expanded');
    await capture({
      filename: 'redesign_desktop_contracts_table_polished.png',
      width: 1440,
      height: 900,
      scenario: 'UI-04/05/FIN-UI-03: Bảng danh sách hợp đồng Desktop 1440x900: Mã HĐ ngắn (HD-WF-010A, HD-S2R-105), badge "Từ sổ cũ", định dạng tiền tệ nowrap, phân rã cọc cam kết và thực thu chuẩn hóa, cột Thao tác sticky-right',
    });

    // 6. Action Menu Open in Portal (no clipping)
    await cdp.eval(`(() => {
      const desktopTriggers = Array.from(document.querySelectorAll('[data-testid="contracts-table"] [data-testid="action-menu-trigger"]'));
      if (desktopTriggers.length > 0) {
        const targetTrigger = desktopTriggers[0];
        targetTrigger.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    // Assert UI-06-FIX-01: ActionMenu popover is rendered via Portal, fully within viewport, not clipped
    const popoverProof = await cdp.eval(`(() => {
      const popover = document.querySelector('[data-testid="action-menu-popover"]');
      if (!popover) return { found: false, error: 'Popover element not found' };
      const r = popover.getBoundingClientRect();
      const inViewport = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      return {
        found: true,
        inViewport,
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        portalId: popover.parentElement?.id || popover.parentElement?.tagName,
      };
    })()`);
    console.log('     [UI-06-FIX-01 Assertion] ActionMenu popover check:', popoverProof);
    if (!popoverProof?.found || !popoverProof.inViewport || popoverProof.width < 100) {
      throw new Error(`UI-06-FIX-01 Assertion Failed: Popover not properly displayed in viewport: ${JSON.stringify(popoverProof)}`);
    }

    await capture({
      filename: 'redesign_desktop_contracts_menu_open.png',
      width: 1440,
      height: 900,
      scenario: 'UI-06: Menu ba chấm mở bằng Portal tại dòng hợp đồng, hiển thị đầy đủ trong viewport, không bị cắt bởi table container',
    });

    // Close menu & reset scroll
    await cdp.eval(`(() => {
      document.body.click();
      window.scrollTo(0, 0);
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    // 7. Mobile Contracts Cards (390x844)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.eval(`(() => {
      window.dispatchEvent(new Event('resize'));
      window.scrollTo(0, 0);
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    // Assert QA-03 / C2-00: Comprehensive Mobile Touch Targets Audit (Header, Navigation, Triggers >= 44x44px)
    const mobileTriggerCheck = await cdp.eval(`(() => {
      const selectors = [
        '[data-testid="console-mobile-menu-trigger"]',
        '[data-testid="console-mobile-building-scope"]',
        '[data-testid="console-mobile-search-trigger"]',
        '[data-testid="console-mobile-notifications-trigger"]',
        '[data-testid="console-mobile-bottom-nav"] button',
        '[data-testid="action-menu-trigger"]',
        '[data-testid="btn-open-handover-mobile"]'
      ];
      const allButtons = Array.from(document.querySelectorAll(selectors.join(','))).filter(
        (t) => t.getBoundingClientRect().height > 0 && t.getBoundingClientRect().width > 0
      );
      if (allButtons.length === 0) {
        return { count: 0, passed: false, error: 'No visible mobile interactive targets found' };
      }
      const nonCompliant = [];
      const inspected = [];
      for (const t of allButtons) {
        const r = t.getBoundingClientRect();
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        const testId = t.getAttribute('data-testid') || t.getAttribute('aria-label') || t.tagName;
        inspected.push({ testId, width: w, height: h });
        if (w < 44 || h < 44) {
          nonCompliant.push({ testId, width: w, height: h });
        }
      }
      return {
        count: allButtons.length,
        passed: nonCompliant.length === 0,
        nonCompliantCount: nonCompliant.length,
        nonCompliant,
        sampleTargets: inspected.slice(0, 6),
      };
    })()`);
    console.log('     [QA-03/C2-00 Comprehensive Touch Target Quality Gate]:', mobileTriggerCheck);
    if (!mobileTriggerCheck.passed) {
      throw new Error(`QA-03/C2-00 Assertion Failed: Mobile controls below 44x44px: ${JSON.stringify(mobileTriggerCheck)}`);
    }

    await capture({
      filename: 'redesign_mobile_390x844_contracts_cards.png',
      width: 390,
      height: 844,
      scenario: 'UI-07/FIN-UI-03: Thẻ hợp đồng Mobile (390x844): Giá thuê nowrap không bị xuống dòng, mã HĐ ngắn, cọc thực thu chuẩn hóa, nút Bàn giao 44px+',
    });

    // 8. Mobile Action Bottom Sheet & Keyboard / A11y Proof (UI-07-FIX-02, UI-07-FIX-03, UI-07-FIX-04, QA-06)
    await cdp.eval(`(() => {
      const triggers = Array.from(document.querySelectorAll('[data-testid="action-menu-trigger"]')).filter(
        (t) => t.getBoundingClientRect().height > 0
      );
      if (triggers.length > 0) {
        triggers[0].click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 700));

    // Assert UI-07-FIX-02, UI-07-FIX-03, UI-07-FIX-04: Bottom Sheet with contextual header, scroll lock, and safe area
    const sheetProof = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="action-menu-bottom-sheet"]');
      if (!sheet) return { found: false, error: 'Bottom sheet not found' };
      const r = sheet.getBoundingClientRect();
      const titleEl = document.getElementById('action-menu-sheet-title');
      const badgeEl = sheet.querySelector('span.rounded-full');
      const bodyLocked = document.body.style.overflow === 'hidden';
      const role = sheet.getAttribute('role');
      const ariaModal = sheet.getAttribute('aria-modal');

      return {
        found: true,
        height: Math.round(r.height),
        width: Math.round(r.width),
        title: titleEl ? titleEl.textContent?.trim() : null,
        badge: badgeEl ? badgeEl.textContent?.trim() : null,
        bodyLocked,
        role,
        ariaModal,
      };
    })()`);
    console.log('     [UI-07-FIX-02/03/04 Contextual Bottom Sheet & A11y check]:', sheetProof);
    if (!sheetProof?.found || sheetProof.height < 100 || !sheetProof.bodyLocked || sheetProof.role !== 'dialog' || sheetProof.ariaModal !== 'true') {
      throw new Error(`UI-07-FIX-02/03/04 Assertion Failed: Bottom sheet accessibility contract violated: ${JSON.stringify(sheetProof)}`);
    }

    // QA-06: Testing Keyboard Navigation & Focus Trap via CDP
    console.log('\n[QA-06] Testing Mobile Bottom Sheet Keyboard Navigation & Focus Trap...');
    const initialFocus = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="action-menu-bottom-sheet"]');
      return {
        inside: sheet ? sheet.contains(document.activeElement) : false,
        activeTag: document.activeElement?.tagName,
        activeText: document.activeElement?.textContent?.trim()?.slice(0, 30),
      };
    })()`);
    console.log('     [QA-06 Step 1] Initial Focus Inside Sheet:', initialFocus);

    // Tab key navigation
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await new Promise((r) => setTimeout(r, 100));

    const tabFocus = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="action-menu-bottom-sheet"]');
      return {
        inside: sheet ? sheet.contains(document.activeElement) : false,
        activeText: document.activeElement?.textContent?.trim()?.slice(0, 30),
      };
    })()`);
    console.log('     [QA-06 Step 2] Tab Key Cycled Focus:', tabFocus);
    if (!tabFocus.inside) {
      throw new Error(`QA-06 Failed: Focus escaped bottom sheet on Tab: ${JSON.stringify(tabFocus)}`);
    }

    // Escape key closes sheet and restores focus
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const escapeProof = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="action-menu-bottom-sheet"]');
      const bodyOverflow = document.body.style.overflow;
      const activeTrigger = document.activeElement?.getAttribute('data-testid') === 'action-menu-trigger';
      return {
        sheetClosed: sheet === null,
        scrollLockRestored: bodyOverflow !== 'hidden',
        focusRestoredToTrigger: activeTrigger,
      };
    })()`);
    console.log('     [QA-06 Step 3] Escape Key & Focus Restoration:', escapeProof);
    if (!escapeProof.sheetClosed || !escapeProof.scrollLockRestored || !escapeProof.focusRestoredToTrigger) {
      throw new Error(`QA-06 Failed: Escape handling or focus restoration failed: ${JSON.stringify(escapeProof)}`);
    }

    // Re-open sheet for screenshot capture
    await cdp.eval(`(() => {
      const triggers = Array.from(document.querySelectorAll('[data-testid="action-menu-trigger"]')).filter(
        (t) => t.getBoundingClientRect().height > 0
      );
      if (triggers.length > 0) triggers[0].click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    await capture({
      filename: 'redesign_mobile_390x844_actions_bottom_sheet.png',
      width: 390,
      height: 844,
      scenario: 'UI-07/QA-06: Action Bottom Sheet trên Mobile mở từ thẻ hợp đồng với grab-bar, contextual header (tòa/phòng, mã HĐ, trạng thái), safe-area padding và touch targets 44px+',
    });

    // Close action sheet
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    // C2-00 / P1: Testing Building Scope Bottom Sheet A11y & Focus Management
    console.log('\n[C2-00/P1] Testing Building Scope Bottom Sheet Focus Trap & Escape...');
    await cdp.eval(`(() => {
      const scopeBtn = document.querySelector('[data-testid="console-mobile-building-scope"]');
      if (scopeBtn) scopeBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const scopeSheetCheck = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="console-mobile-scope-sheet"]');
      if (!sheet) return { found: false, error: 'Scope sheet not found' };
      const bodyOverflow = document.body.style.overflow;
      const role = sheet.getAttribute('role');
      const ariaModal = sheet.getAttribute('aria-modal');
      const focusInside = sheet.contains(document.activeElement);
      return {
        found: true,
        bodyLocked: bodyOverflow === 'hidden',
        role,
        ariaModal,
        focusInside,
      };
    })()`);
    console.log('     [Scope Sheet Verification]:', scopeSheetCheck);
    if (!scopeSheetCheck.found || !scopeSheetCheck.bodyLocked || scopeSheetCheck.role !== 'dialog' || scopeSheetCheck.ariaModal !== 'true') {
      throw new Error(`C2-00 Scope Sheet A11y Failed: ${JSON.stringify(scopeSheetCheck)}`);
    }

    // Escape closes scope sheet
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const scopeClosedCheck = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="console-mobile-scope-sheet"]');
      const bodyOverflow = document.body.style.overflow;
      const activeTrigger = document.activeElement?.getAttribute('data-testid') === 'console-mobile-building-scope';
      return {
        sheetClosed: sheet === null,
        scrollLockRestored: bodyOverflow !== 'hidden',
        focusRestoredToTrigger: activeTrigger,
      };
    })()`);
    console.log('     [Scope Sheet Escape & Restore]:', scopeClosedCheck);
    if (!scopeClosedCheck.sheetClosed || !scopeClosedCheck.scrollLockRestored || !scopeClosedCheck.focusRestoredToTrigger) {
      throw new Error(`C2-00 Scope Sheet Escape Failed: ${JSON.stringify(scopeClosedCheck)}`);
    }

    // C2-00 / P1: Testing Notifications Bottom Sheet A11y & Focus Management
    console.log('\n[C2-00/P1] Testing Notifications Bottom Sheet Focus Trap & Escape...');
    await cdp.eval(`(() => {
      const notifBtn = document.querySelector('[data-testid="console-mobile-notifications-trigger"]');
      if (notifBtn) notifBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const notifSheetCheck = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="console-mobile-notifications-sheet"]');
      if (!sheet) return { found: false, error: 'Notifications sheet not found' };
      const bodyOverflow = document.body.style.overflow;
      const role = sheet.getAttribute('role');
      const ariaModal = sheet.getAttribute('aria-modal');
      const focusInside = sheet.contains(document.activeElement);
      return {
        found: true,
        bodyLocked: bodyOverflow === 'hidden',
        role,
        ariaModal,
        focusInside,
      };
    })()`);
    console.log('     [Notifications Sheet Verification]:', notifSheetCheck);
    if (!notifSheetCheck.found || !notifSheetCheck.bodyLocked || notifSheetCheck.role !== 'dialog' || notifSheetCheck.ariaModal !== 'true') {
      throw new Error(`C2-00 Notifications Sheet A11y Failed: ${JSON.stringify(notifSheetCheck)}`);
    }

    // Escape closes notifications sheet
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const notifClosedCheck = await cdp.eval(`(() => {
      const sheet = document.querySelector('[data-testid="console-mobile-notifications-sheet"]');
      const bodyOverflow = document.body.style.overflow;
      const activeTrigger = document.activeElement?.getAttribute('data-testid') === 'console-mobile-notifications-trigger';
      return {
        sheetClosed: sheet === null,
        scrollLockRestored: bodyOverflow !== 'hidden',
        focusRestoredToTrigger: activeTrigger,
      };
    })()`);
    console.log('     [Notifications Sheet Escape & Restore]:', notifClosedCheck);
    if (!notifClosedCheck.sheetClosed || !notifClosedCheck.scrollLockRestored || !notifClosedCheck.focusRestoredToTrigger) {
      throw new Error(`C2-00 Notifications Sheet Escape Failed: ${JSON.stringify(notifClosedCheck)}`);
    }

    cdp.close();

    // 6. Write Manifest & Checksums
    console.log('\n[Step 6] Writing Redesign Manifest & Checksums...');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'screenshots-manifest.json'), JSON.stringify(manifest, null, 2));

    const checkLines = manifest.map((m) => `${m.sha256}  ${m.relativePath} (${m.sizeBytes} bytes, ${m.viewport})`);
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'checksums-verified.txt'), checkLines.join('\n'));

    // QA-07: Direct Disk Verification of Evidence Integrity & Unmanaged File Detection
    console.log('\n[QA-07] Verifying Image Files on Disk against SHA-256 Manifest...');
    let qa07Passed = true;
    for (const item of manifest) {
      const fullPath = path.join(EVIDENCE_DIR, item.relativePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`  [QA-07 FAIL] Missing file: ${item.relativePath}`);
        qa07Passed = false;
        continue;
      }
      const diskBuf = fs.readFileSync(fullPath);
      const diskSha = crypto.createHash('sha256').update(diskBuf).digest('hex');
      const matches = diskSha === item.sha256 && diskBuf.length === item.sizeBytes;
      console.log(`  File: ${item.filename.padEnd(46)} | Disk Bytes: ${diskBuf.length} | SHA: ${diskSha.slice(0, 16)}... [${matches ? 'PASS' : 'FAIL'}]`);
      if (!matches) qa07Passed = false;
    }

    // C2-00: Unmanaged files verification
    const diskPngFiles = fs.readdirSync(path.join(EVIDENCE_DIR, 'screenshots'))
      .filter((f) => f.endsWith('.png'));
    const manifestFilenames = new Set(manifest.map((m) => m.filename));
    const unmanagedFiles = diskPngFiles.filter((f) => !manifestFilenames.has(f));
    if (unmanagedFiles.length > 0) {
      console.error(`  [QA-07 FAIL] Found unmanaged PNG files in screenshots folder: ${JSON.stringify(unmanagedFiles)}`);
      qa07Passed = false;
    } else {
      console.log(`  [QA-07] Zero unmanaged PNG files: 100% of ${diskPngFiles.length} files in screenshots folder are tracked in manifest. [PASS]`);
    }

    if (!qa07Passed) {
      throw new Error('QA-07 Assertion Failed: Discrepancy detected between disk evidence and manifest');
    }
    console.log(`\n[QA-07] 100% of ${manifest.length} screenshot files on disk verified matching recorded SHA-256 checksums.`);

    console.log(`Successfully captured ${manifest.length} redesign screenshots.`);

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
      try { browserProc.kill(); } catch { }
    }
    if (consoleProc) {
      try { consoleProc.kill(); } catch { }
    }
    if (landingProc) {
      try { landingProc.kill(); } catch { }
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error during redesign evidence capture:', err);
  process.exit(1);
});
