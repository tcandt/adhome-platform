import assert from 'node:assert/strict';

// Set ADHOME_PLAYWRIGHT_MODULE to a module URL when using a shared installation.
const playwright = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.ADHOME_CONSOLE_TEST_URL || 'http://127.0.0.1:5174';
const backgroundMs = Number(process.env.ADHOME_BACKGROUND_TEST_MS || 16000);
const actor = { id: 'resume-test', email: 'resume@example.test', role: 'ADMIN', orgId: 'resume-org' };
const results = [];

for (const engine of ['chromium', 'webkit']) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    let documentCount = 0;
    let bootstrapCount = 0;
    let authCount = 0;
    let authMode = 'valid';
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentCount++;
    });
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.__resumeTestSockets = [];
      window.WebSocket = class extends NativeWebSocket {
        constructor(...args) { super(...args); window.__resumeTestSockets.push(this); }
      };
    });
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/auth/me')) {
        authCount++;
        if (authMode === 'offline') return route.abort('failed');
        if (authMode === 'expired') return route.fulfill({ status: 401, json: { ok: false } });
        return route.fulfill({ json: { ok: true, actor } });
      }
      if (pathname.endsWith('/bootstrap')) {
        bootstrapCount++;
        return route.fulfill({ json: { ok: true, buildings: [], rooms: [], tenants: [], syncedAt: new Date().toISOString() } });
      }
      throw new Error(`Unexpected API request: ${route.request().method()} ${pathname}`);
    });
    await page.goto(`${baseUrl}/?module=buildings&motion=reduced`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('console-mobile-shell').waitFor();
    await page.getByTestId('adhome-logo-fill-loader').waitFor({ state: 'detached' });
    assert.equal(await page.locator('script[src*="/@vite/client"]').count(), 0, 'Mobile server must not ship the dev client that reloads on reconnect');
    assert.equal(await page.evaluate(() => window.__resumeTestSockets.length), 0, 'Mobile server must not open a development WebSocket');
    await page.getByTestId('console-mobile-header').getByTestId('console-building-scope-selector').click();
    await page.getByTestId('btn-open-create-building').click();
    const draft = page.getByTestId('input-building-name');
    await draft.fill('Bản nháp giữ khi chuyển ứng dụng');
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const initialBootstrap = bootstrapCount;
    const hide = async () => page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
      for (const socket of window.__resumeTestSockets) socket.close();
    });
    const resume = async () => page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await hide();
    // Also exercise an actual network transition while the tab is backgrounded.
    await context.setOffline(true);
    await page.waitForTimeout(backgroundMs);
    await context.setOffline(false);
    let beforeAuth = authCount;
    await resume();
    await page.waitForFunction(() => document.visibilityState === 'visible');
    await page.waitForTimeout(500);
    assert.ok(authCount > beforeAuth, 'Resume must still verify the session');
    assert.equal(await draft.inputValue(), 'Bản nháp giữ khi chuyển ứng dụng');
    assert.equal(bootstrapCount, initialBootstrap, 'An unchanged session must not bootstrap the page again');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    assert.equal(documentCount, 1);

    authMode = 'offline';
    await hide();
    await resume();
    await page.waitForTimeout(500);
    assert.equal(await draft.inputValue(), 'Bản nháp giữ khi chuyển ứng dụng');
    assert.equal(documentCount, 1);

    authMode = 'expired';
    beforeAuth = authCount;
    await hide();
    await resume();
    await page.getByTestId('console-login-heading').waitFor();
    assert.ok(authCount > beforeAuth);
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin, 'Session expiry must show login without a document reload');
    assert.equal(documentCount, 1);
    assert.deepEqual(errors, []);
    results.push({ engine, passed: true, backgroundMs, documentCount, bootstrapCount, sessionExpiryWithoutReload: true });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  } finally {
    await browser.close();
  }
}
