import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const require = createRequire(import.meta.url);
const { PAYMENT_PROVIDERS: providers } = require(resolve('apps/landing/node_modules/.cache/payment-integration-tests/paymentProviderRegistry.js'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir('.artifacts/payment-integrations', { recursive: true });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const building = { id: 'test-building', code: 'QA', name: 'Nhà kiểm thử', status: 'ACTIVE', floors: [], stats: { totalRooms: 0, availableRooms: 0, occupiedRooms: 0 } };
    let connections = [];
    let rejectSave = true;
    let releaseSave;
    let waitSave = false;
    const base = '/api/v1/console/v2/settings/payment-connections';
    await page.route('**/api/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@example.test', orgId: 'qa', role: 'ADMIN' } } });
      if (path.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [building], rooms: [], tenants: [] } });
      if (path === '/api/v1/console/v2/settings') return route.fulfill({ json: { ok: true, organization: {}, integrations: [], notificationChannels: [], cronJobs: [], auditLogs: [] } });
      if (path === base && req.method() === 'GET') {
        return route.fulfill({ json: { ok: true, providers, publicWebhookOrigin: 'https://console.adhome.vn', connections, legacyConfigured: [], auditLogs: [] } });
      }
      if (path === base && req.method() === 'POST') {
        assert.equal(req.headers()['x-requested-with'], 'AdHome-Console');
        if (rejectSave) return route.fulfill({ status: 422, json: { ok: false, message: 'Kiểm thử: khóa không hợp lệ.' } });
        const body = req.postDataJSON();
        assert.equal(body.accounts.length, 2);
        assert.equal(body.credentials.apiToken, 'fake-secret-test');
        assert.equal(body.credentials.webhookSecret, 'fake-webhook-secret');
        if (waitSave) await new Promise(resolve => { releaseSave = resolve; });
        connections = [{ ...body, id: 'connection-1', credentials: undefined, version: 1, credentialFields: ['apiToken'], isEnabled: false, status: 'UNCONFIGURED', lastTestedAt: null, lastTestMessage: null, webhookUrl: 'https://console.adhome.vn/api/v1/webhooks/payments/sepay/connection-1', webhookPath: '/api/v1/webhooks/payments/sepay/connection-1', webhookEnabled: false, webhookAuth: 'HMAC_SHA256', webhookLastReceivedAt: null, webhookRegisteredAt: null, webhookEvents: [] }];
        return route.fulfill({ status: 201, json: { ok: true, id: 'connection-1' } });
      }
      if (path.endsWith('/webhook')) {
        const body = req.postDataJSON();
        connections = connections.map(c => ({ ...c, version: c.version + 1, webhookEnabled: body.isEnabled }));
        return route.fulfill({ json: { ok: true, message: 'Đã bật nhận webhook.' } });
      }
      if (path.endsWith('/test')) {
        connections = connections.map(c => ({ ...c, version: c.version + 1, status: 'ERROR', lastTestMessage: 'Nhà cung cấp từ chối khóa.', lastTestedAt: new Date().toISOString() }));
        return route.fulfill({ status: 422, json: { ok: false, message: 'Nhà cung cấp từ chối khóa.' } });
      }
      return route.fulfill({ json: { ok: true, items: [], transactions: [] } });
    });
    await page.goto(`${process.env.ADHOME_UI_URL || 'http://127.0.0.1:5174'}/?module=settings`);
    if (width < 640) await page.getByTestId('settings-mobile-section').selectOption('payments');
    else await page.getByTestId('settings-tab-payments').click();
    const hub = page.getByTestId('payment-integration-hub');
    await hub.waitFor();
    await hub.getByRole('button', { name: 'Thêm SePay', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const providerBox = await dialog.getByLabel('Nhà cung cấp').boundingBox();
    const nameBox = await dialog.getByLabel('Tên kết nối').boundingBox();
    assert.ok(providerBox && nameBox && Math.abs(providerBox.y - nameBox.y) < 3, 'Provider and name share a row');
    await dialog.screenshot({ path: `.artifacts/payment-integrations/compact-form-${width}.png` });
    const draftUrl = dialog.getByLabel('URL webhook dự kiến');
    assert.match(await draftUrl.inputValue(), /^https:\/\/console\.adhome\.vn\/api\/v1\/webhooks\/payments\/sepay\//);
    await draftUrl.click();
    await dialog.getByRole('status').filter({ hasText: 'Đã sao chép URL webhook.' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await draftUrl.inputValue());
    await dialog.getByLabel('Tên kết nối').fill('SePay nhiều ngân hàng');
    await dialog.getByLabel('API Token', { exact: true }).fill('fake-secret-test');
    const authSelect = dialog.getByLabel('Xác thực webhook', { exact: true });
    const info = dialog.getByRole('button', { name: 'Thông tin API Token' });
    await info.hover();
    await page.getByText('Tùy chọn. Chỉ dùng kiểm tra quyền đọc API SePay, không dùng xác thực webhook.').waitFor();
    await dialog.getByLabel('Tên kết nối').hover();
    await page.getByText('Tùy chọn. Chỉ dùng kiểm tra quyền đọc API SePay, không dùng xác thực webhook.').waitFor({ state: 'hidden' });
    await info.click();
    await page.getByText('Tùy chọn. Chỉ dùng kiểm tra quyền đọc API SePay, không dùng xác thực webhook.').waitFor();
    await dialog.getByLabel('Tên kết nối').click();
    await page.getByText('Tùy chọn. Chỉ dùng kiểm tra quyền đọc API SePay, không dùng xác thực webhook.').waitFor({ state: 'hidden' });
    await dialog.getByLabel('HMAC Secret Key', { exact: true }).fill('fake-hmac-secret');
    await authSelect.selectOption('API_KEY');
    assert.equal(await dialog.getByLabel('HMAC Secret Key', { exact: true }).count(), 0);
    assert.equal(await dialog.getByLabel('Webhook API Key', { exact: true }).inputValue(), '', 'Switching auth clears the previous key');
    await dialog.getByLabel('Webhook API Key', { exact: true }).fill('fake-api-key');
    await authSelect.selectOption('HMAC_SHA256');
    assert.equal(await dialog.getByLabel('HMAC Secret Key', { exact: true }).inputValue(), '');
    await dialog.getByLabel('HMAC Secret Key', { exact: true }).fill('fake-webhook-secret');
    for (const [code, number, name] of [['VCB', '001', 'TEST A'], ['MB', '002', 'TEST B']]) {
      await dialog.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click();
      await dialog.getByLabel('Mã ngân hàng', { exact: true }).last().fill(code);
      await dialog.getByLabel('Số tài khoản', { exact: true }).last().fill(number);
      await dialog.getByLabel('Chủ tài khoản', { exact: true }).last().fill(name);
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.activeElement?.closest('[role=dialog]') || document.activeElement?.hasAttribute('data-base-ui-focus-guard'), undefined, { timeout: 2000 });
    }
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Modal has no horizontal overflow');
    await dialog.screenshot({ path: `.artifacts/payment-integrations/form-${width}.png` });
    await dialog.getByRole('button', { name: 'Lưu kết nối & tài khoản', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'khóa không hợp lệ' }).waitFor();
    assert.equal(await dialog.getByLabel('Số tài khoản', { exact: true }).count(), 2);
    assert.equal(await hub.getByRole('status').count(), 0, 'Failure never produces success');
    rejectSave = false; waitSave = true;
    await dialog.getByRole('button', { name: 'Lưu kết nối & tài khoản', exact: true }).click();
    await dialog.getByRole('button', { name: 'Đang lưu và tải lại…' }).waitFor();
    assert.equal(await dialog.count(), 1, 'Dialog remains open while real request is pending');
    assert.ok(releaseSave); releaseSave();
    await dialog.waitFor({ state: 'hidden' });
    await hub.getByRole('status').filter({ hasText: 'Đã lưu cấu hình' }).waitFor();
    assert.ok(await hub.getByRole('button', { name: 'Bật sử dụng API', exact: true }).isDisabled());
    const panel = hub.getByTestId('webhook-panel-connection-1');
    assert.equal(await panel.getByLabel('URL nhận cho kết nối này').inputValue(), 'https://console.adhome.vn/api/v1/webhooks/payments/sepay/connection-1');
    await panel.getByText('Cách cấu hình tại nhà cung cấp', { exact: true }).click();
    await panel.getByText(/SePay Dashboard/).waitFor();
    await panel.getByRole('button', { name: 'Bật nhận webhook', exact: true }).click();
    await panel.getByRole('button', { name: 'Tắt nhận webhook', exact: true }).waitFor();
    assert.ok(await hub.getByRole('button', { name: 'Bật sử dụng API', exact: true }).isDisabled(), 'Webhook enable does not imply API verified');
    await hub.getByRole('button', { name: 'Kiểm tra API', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kiểm tra ngay', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal(await hub.getByRole('status').count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
    await hub.getByText('Kiểm tra thất bại', { exact: true }).waitFor();
    await hub.getByRole('button', { name: 'Sửa cấu hình', exact: true }).click();
    dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('API Token', { exact: true }).inputValue(), '', 'Stored key is never hydrated into browser');
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await hub.getByRole('button', { name: 'Thêm MoMo', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByText(/MoMo hỗ trợ nhận webhook/).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await page.evaluate(() => document.activeElement?.textContent?.includes('Thêm MoMo')), 'Focus returns to triggering button');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    await page.screenshot({ path: `.artifacts/payment-integrations/${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ width, reducedMotion: true, result: 'PASS', checks: ['multi-bank form', 'save failure preservation', 'pending server request', 'read-back success', 'unverified enable guard', 'API failure', 'secret redaction', 'unsupported provider', 'Escape/focus restore', 'no overflow', 'per-connection webhook URL', 'SePay setup guide', 'independent webhook toggle'] });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile('.artifacts/payment-integrations/ui-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
