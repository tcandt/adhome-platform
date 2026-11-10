import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const webkitLayout = process.env.ADHOME_WEBKIT_LAYOUT === '1';
const pdf = await readFile('.artifacts/rental-workflow/LEASE_1PN.pdf');
const base = process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187';
await mkdir('.artifacts/contract-preview/ui', { recursive: true });
const profile = { tenant: { fullName: 'KHACH KIEM THU', birthDate: '1995-05-20', idNumber: '000000000001', phone: '0900000001', address: 'DIA CHI KIEM THU' }, landlord: { fullName: 'CHU NHA KIEM THU', idNumber: '000000000002', address: 'DIA CHI CHU NHA' }, members: [], rentalAddress: 'CAN HO KIEM THU', signedDate: '2026-11-03', leaseTemplate: 'LEASE_1PN', durationText: '12 thang', purpose: 'De o' };
const building = { id: 'b1', code: 'QA', name: 'Tòa nhà kiểm thử', status: 'ACTIVE', stats: { totalRooms: 1, occupiedRooms: 1 }, floors: [] };
const contract = { id: 'qa-contract', contractCode: 'HD-QA', buildingCode: 'QA', roomId: 'room-qa', roomCode: '101', tenantName: profile.tenant.fullName, tenantPhone: profile.tenant.phone, status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRentVnd: 4500000, depositVnd: 4500000, electricRateVnd: 3800, waterRateVnd: 15000 };
const room = { id: 'room-qa', buildingId: 'b1', code: '101', buildingName: building.name, floorName: 'Tầng 1', area: 25, roomType: 'Studio', rentalModel: 'WHOLE_ROOM', electricRateVnd: 3800, waterRateVnd: 15000, listPriceVnd: 4500000, maxOccupants: 4, occupancyStatus: 'OCCUPIED', building, activeContract: contract };
const browser = await (webkitLayout ? webkit.launch({ headless: true, timeout: 10000 }) : chromium.launch({ channel: 'chrome', headless: true }));
const results = [];
async function checkFormLayout(page, dialog, width) {
  await page.waitForFunction(() => { const el = document.querySelector('[data-testid="contract-document-dialog"]'); const style = el && getComputedStyle(el); return style && Number(style.opacity) >= .999 && (style.filter === 'none' || style.filter === 'blur(0px)'); });
  const body = dialog.locator('.contract-document-body');
  const header = dialog.locator('.contract-document-header');
  const toolbar = dialog.locator('.contract-document-toolbar');
  const footer = dialog.locator('.contract-document-footer');
  await body.evaluate(el => { el.scrollTop = 0; });
  const before = await Promise.all([header.boundingBox(), toolbar.boundingBox(), footer.boundingBox()]);
  const geometry = await dialog.evaluate(root => {
    const body = root.querySelector('.contract-document-body');
    const form = root.querySelector('form');
    const outer = body.getBoundingClientRect();
    const box = form.getBoundingClientRect();
    const controls = [...root.querySelectorAll('input, select')];
    return { bodyOverflow: body.scrollWidth > body.clientWidth, formOverflow: form.scrollWidth > form.clientWidth,
      leftFits: box.left >= outer.left, rightFits: box.right <= outer.right + 1,
      overflowingInputs: controls.filter(el => { const input = el.getBoundingClientRect(), label = el.parentElement.getBoundingClientRect(); return input.left < label.left - 1 || input.right > label.right + 1; }).length,
      dateHeight: getComputedStyle(root.querySelector('input[type=date]')).height,
      dateFont: getComputedStyle(root.querySelector('input[type=date]')).fontSize,
      textFont: getComputedStyle(root.querySelector('input[type=text]')).fontSize,
      controlFonts: [...new Set(controls.map(el => getComputedStyle(el).fontSize))],
      labelFonts: [...new Set([...root.querySelectorAll('.contract-document-fields label')].map(el => getComputedStyle(el).fontSize))],
      buttonFonts: [...new Set([...root.querySelectorAll('.contract-document-footer button')].map(el => getComputedStyle(el).fontSize))],
      scrollable: body.scrollHeight > body.clientHeight };
  });
  assert.equal(geometry.bodyOverflow, false); assert.equal(geometry.formOverflow, false);
  assert.equal(geometry.leftFits && geometry.rightFits, true); assert.equal(geometry.overflowingInputs, 0);
  assert.equal(geometry.dateHeight, '38px'); assert.equal(geometry.dateFont, geometry.textFont);
  assert.equal(geometry.dateFont, '13px', 'all date and text inputs match labels and actions');
  assert.deepEqual(geometry.controlFonts, ['13px']);
  assert.deepEqual(geometry.labelFonts, geometry.controlFonts);
  assert.deepEqual(geometry.buttonFonts, geometry.controlFonts);
  assert.equal(geometry.scrollable, true);
  for (const position of [0.5, 1]) {
    await body.evaluate((el, position) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * position; }, position);
    const after = await Promise.all([header.boundingBox(), toolbar.boundingBox(), footer.boundingBox()]);
    for (let i = 0; i < before.length; i++) assert.equal(Math.round(after[i].y), Math.round(before[i].y), 'header, toolbar and footer stay pinned');
  }
  await body.evaluate(el => { el.scrollTop = 0; });
}
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'vi-VN' });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    let mode = 'complete', writes = 0, previews = 0, metadataReads = 0;
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@example.test', role: 'ADMIN', orgId: 'qa', buildingScopes: ['*'] } } });
      if (path.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [building], rooms: [room], tenants: [] } });
      if (path.endsWith('/rental-workflow/room-qa')) return route.fulfill({ json: { ok: true, room, contract: { ...contract, tenant: profile.tenant, invoices: [], deposits: [] }, reservation: null, profile, bookingBalance: 0 } });
      if (path.endsWith('/module-data')) return route.fulfill({ json: { ok: true, contracts: [contract] } });
      if (path.endsWith('/document/profile')) { writes++; return route.fulfill({ json: { ok: true, missing: [] } }); }
      if (path.endsWith('/qa-contract/document')) {
        if (route.request().method() === 'GET') {
          metadataReads++;
          return route.fulfill({ json: { ok: true, contract, room: { code: '101', buildingName: building.name }, profile: mode === 'missing' ? { ...profile, tenant: { ...profile.tenant, birthDate: '' } } : mode === 'validation' ? { ...profile, landlord: {} } : profile, missing: mode === 'missing' ? ['Ngày sinh khách thuê hợp lệ'] : [] } });
        }
        previews++;
        assert.equal(route.request().postDataJSON().profile.tenant.fullName, profile.tenant.fullName);
        if (mode === 'complete' && previews === 1) await gate;
        if (mode === 'failure') return route.fulfill({ status: 503, json: { ok: false, message: 'Không thể chuyển mẫu Word sang PDF trên máy chủ.' } });
        if (mode === 'invalid') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Not PDF</title>' });
        if (mode === 'validation') return route.fulfill({ status: 422, json: { ok: false, message: 'Bổ sung thông tin trước khi xem hợp đồng.', missing: ['Họ tên bên cho thuê', 'Giấy tờ bên cho thuê', 'Địa chỉ bên cho thuê'] } });
        return route.fulfill({ contentType: 'application/pdf', body: pdf });
      }
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${base}/?module=contracts`);
    const link = page.getByRole('button', { name: 'Xem hợp đồng HD-QA', exact: true });
    await link.click();
    const dialog = page.getByTestId('contract-document-dialog');
    if (webkitLayout) {
      // WebKit on Windows has no native PDF viewer; exercise its date controls and form layout.
      release();
      await dialog.getByRole('button', { name: 'Thông tin', exact: true }).click();
      await dialog.getByLabel('Ngày sinh', { exact: true }).fill('1994-12-20');
      await checkFormLayout(page, dialog, width);
      if (width <= 600) { await page.setViewportSize({ width, height: 640 }); await checkFormLayout(page, dialog, width); }
      await page.screenshot({ path: `.artifacts/contract-preview/ui/webkit-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      results.push({ width, engine: 'webkit', pinnedHeaderToolbarFooter: true, noHorizontalScroll: true, nativeDateFitsColumn: true, shortViewport: width <= 600 });
      console.log(`PASS WebKit contract layout ${width}px: native date fields, no horizontal overflow, pinned controls`);
      await context.close();
      continue;
    }
    await dialog.getByRole('status').filter({ hasText: 'Đang tạo bản PDF' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Tải PDF', exact: true }).isDisabled(), true);
    assert.equal(writes, 0); release();
    await dialog.locator('.contract-pdf-page').last().waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="In hợp đồng"]')?.disabled);
    await page.waitForFunction(() => { const el = document.querySelector('[data-testid="contract-document-dialog"]'); const style = el && getComputedStyle(el); return style && Number(style.opacity) >= .999 && (style.filter === 'none' || style.filter === 'blur(0px)'); });
    assert.equal(new URL(page.url()).searchParams.get('module'), 'contracts');
    const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Tải PDF', exact: true }).click()]);
    assert.equal(download.suggestedFilename(), 'Hop-dong-HD-QA.pdf');
    await download.saveAs(`.artifacts/contract-preview/ui/download-${width}.pdf`);
    await page.evaluate(() => { const frame = document.querySelector('iframe[title="In hợp đồng"]'); frame.contentWindow.print = () => { window.__contractPrinted = true; }; });
    await dialog.getByRole('button', { name: 'In hợp đồng', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__contractPrinted), true, 'print acts on the PDF, not the application page');
    await page.screenshot({ path: `.artifacts/contract-preview/ui/pdf-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Thông tin', exact: true }).click();
    assert.equal(await dialog.getByLabel('Họ và tên', { exact: true }).inputValue(), profile.tenant.fullName);
    await checkFormLayout(page, dialog, width);
    if (width <= 600) {
      await page.setViewportSize({ width, height: 640 });
      await checkFormLayout(page, dialog, width);
      const footer = await dialog.locator('.contract-document-footer').boundingBox();
      assert.ok(footer.y + footer.height <= 640);
      await page.screenshot({ path: `.artifacts/contract-preview/ui/compact-${width}.png`, fullPage: true });
      await page.setViewportSize({ width, height: 900 });
    }
    await page.screenshot({ path: `.artifacts/contract-preview/ui/profile-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Đóng hợp đồng', exact: true }).click();
    assert.equal(writes, 0, 'opening and inspecting a contract does not save it');
    mode = 'missing'; const before = previews;
    await link.click(); await dialog.getByLabel('Ngày sinh', { exact: true }).waitFor();
    assert.equal(previews, before, 'missing data blocks PDF generation');
    await dialog.getByLabel('Ngày sinh', { exact: true }).fill('1995-05-20');
    await dialog.getByRole('button', { name: 'Lưu & xem PDF', exact: true }).click();
    await dialog.locator('.contract-pdf-page').last().waitFor(); assert.equal(writes, 1);
    await dialog.getByRole('button', { name: 'Đóng hợp đồng', exact: true }).click();
    for (mode of ['failure', 'invalid']) {
      await link.click(); await dialog.getByRole('alert').waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Tải PDF', exact: true }).isDisabled(), true);
      assert.equal(await dialog.locator('.contract-pdf-page').count(), 0);
      if (mode === 'failure') await page.screenshot({ path: `.artifacts/contract-preview/ui/error-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    }
    assert.ok(metadataReads >= 4); assert.deepEqual(errors, []);
    mode = 'validation';
    await link.click();
    const missingSummary = dialog.locator('.contract-missing summary');
    await missingSummary.getByRole('status').filter({ hasText: 'Cần bổ sung 3 thông tin' }).waitFor();
    assert.equal(await dialog.getByRole('alert').count(), 0, 'expected validation has one compact notice, not a duplicate retry error');
    assert.equal(await dialog.locator('.contract-missing').evaluate(el => el.open), false);
    await missingSummary.focus(); await page.keyboard.press('Enter');
    assert.equal(await dialog.locator('.contract-missing').evaluate(el => el.open), true);
    await checkFormLayout(page, dialog, width);
    await page.screenshot({ path: `.artifacts/contract-preview/ui/missing-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Đóng hợp đồng', exact: true }).click();
    mode = 'complete';
    await page.goto(`${base}/?module=buildings&rentalRoom=room-qa`);
    await page.getByRole('button', { name: 'Xem hợp đồng HD-QA', exact: true }).click();
    await dialog.locator('.contract-pdf-page').last().waitFor();
    assert.equal(await page.getByRole('dialog', { includeHidden: true }).count(), 2, 'PDF remains nested inside the room popup, which is hidden from accessibility while the child is open');
    await dialog.getByRole('button', { name: 'Thông tin', exact: true }).click();
    await dialog.getByLabel('Địa chỉ thường trú', { exact: true }).fill('DIA CHI DA CAP NHAT');
    await dialog.getByRole('button', { name: 'Lưu & xem PDF', exact: true }).click();
    await dialog.locator('.contract-pdf-page').last().waitFor();
    await dialog.getByRole('button', { name: 'Đóng hợp đồng', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Hồ sơ & tài liệu', exact: true }).click();
    await page.getByRole('tab', { name: 'Khách thuê', exact: true }).click();
    assert.equal(await page.getByLabel('Địa chỉ thường trú', { exact: true }).inputValue(), 'DIA CHI DA CAP NHAT', 'parent profile reflects data saved from PDF dialog');
    assert.deepEqual(errors, []);
    results.push({ width, reducedMotion: true, pinnedHeaderToolbarFooter: true, noHorizontalScroll: true, nativeDateFitsColumn: true, shortViewport: width <= 600, clickCodeOpensPdf: true, downloadedPdf: true, printTargetsPdf: true, nestedRoomDialogPreserved: true, savedProfileUpdatesParent: true, incompleteProfileThenExplicitSave: true, noImplicitSave: true, conversionAndMimeErrors: true });
    console.log(`PASS contract preview ${width}px: inline PDF, download, fields, missing-data save, errors, Escape and no implicit writes`);
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`.artifacts/contract-preview/ui/${webkitLayout ? 'webkit-layout-results' : 'results'}.json`, JSON.stringify(results, null, 2));
