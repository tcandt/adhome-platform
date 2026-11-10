import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let backups = [0, 1].map(index => ({ id: `00000000-0000-0000-0000-00000000000${index + 1}`, name: `Sao lưu thử ${index + 1}`, sizeBytes: (index + 1) * 2048, createdAt: '2026-11-06T03:00:00.000Z', createdBy: 'qa@example.test', digest: `digest-${index}`, counts: { tenant: index + 1 } }));
    let releaseDelete;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@example.test', orgId: 'qa', role: 'ADMIN' } } });
      if (path.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [], rooms: [], tenants: [] } });
      if (path === '/api/v1/console/v2/settings') return route.fulfill({ json: { ok: true, organization: {}, integrations: [], notificationChannels: [], cronJobs: [], auditLogs: [] } });
      if (path.endsWith('/settings/data/backups') && route.request().method() === 'GET') return route.fulfill({ json: { ok: true, backups } });
      if (path.endsWith('/settings/data/summary')) return route.fulfill({ json: { ok: true, counts: { tenant: 3 } } });
      if (path.endsWith('/settings/data/backups/delete')) {
        const body = route.request().postDataJSON();
        assert.equal(body.confirmation, 'XOA BAN SAO LUU');
        assert.equal(body.ids.length, 2);
        await new Promise(resolve => { releaseDelete = resolve; });
        backups = [];
        return route.fulfill({ json: { ok: true, deletedIds: body.ids, failedIds: [] } });
      }
      return route.fulfill({ json: { ok: true, items: [] } });
    });
    await page.goto(`${process.env.ADHOME_UI_URL || 'http://127.0.0.1:5197'}/?module=settings`);
    if (width < 640) await page.getByTestId('settings-mobile-section').selectOption('data');
    else await page.getByTestId('settings-tab-data').click();
    const table = page.getByRole('table', { name: 'Danh sách bản sao lưu' });
    await table.waitFor();
    assert.equal(await table.locator('tbody tr').count(), 2);
    assert.equal(await table.getByText('2.0 KB').count(), 1);
    await table.getByRole('button', { name: 'Hành động với Sao lưu thử 1' }).click();
    await page.getByRole('menuitem', { name: 'Khôi phục' }).waitFor();
    await page.getByRole('menuitem', { name: 'Xóa bản sao lưu' }).waitFor();
    await page.keyboard.press('Escape');
    await table.getByRole('checkbox', { name: 'Chọn tất cả bản sao lưu' }).check();
    assert.equal(await table.locator('tbody input[type=checkbox]:checked').count(), 2);
    await page.getByRole('button', { name: 'Xóa 2 bản đã chọn' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xóa bản sao lưu', exact: true });
    await dialog.getByLabel(/Nhập XOA BAN SAO LUU/).fill('XOA BAN SAO LUU');
    await dialog.getByRole('button', { name: 'Xóa bản sao lưu' }).click();
    await dialog.getByRole('status').waitFor();
    assert.equal(await dialog.count(), 1, 'Dialog stays open until the server responds');
    assert.ok(releaseDelete);
    releaseDelete();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Chưa có bản sao lưu.').waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px backup table: size, select all, confirmed bulk delete and response-driven close`);
  }
} finally { await browser.close(); }
