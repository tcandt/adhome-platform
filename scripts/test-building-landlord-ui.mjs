import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const useWebkit = process.env.ADHOME_WEBKIT_LAYOUT === '1';
const browser = await (useWebkit ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'chrome', headless: true }));
const base = process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187';
const owner = { fullName: 'CHU NHA KIEM THU', birthDate: '1985-07-21', address: '24 DUONG KIEM THU', idNumber: '000000000001', phone: '0900000001', accountNumber: '00123456789', bank: 'NGAN HANG QA', accountName: 'CHU TAI KHOAN' };
await mkdir('.artifacts/building-landlord', { recursive: true });
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 760 }, reducedMotion: 'reduce', locale: 'vi-VN' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const building = { id: 'b1', code: 'QA', name: 'TOA NHA QA', streetAddress: '', ward: '', province: '', managerName: '', managerPhone: '', status: 'ACTIVE', buildingType: 'SERVICED_APARTMENT', isActive: true, description: '', floors: [], landlord: {}, stats: { floorsCount: 0, totalRooms: 0, occupiedRooms: 0 } };
    let failure = true, reads = 0, writes = 0, sent;
    let release; const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', orgId: 'qa', role: 'ADMIN', email: 'qa@example.test', buildingScopes: ['*'] } } });
      if (path.endsWith('/bootstrap')) { reads++; return route.fulfill({ json: { ok: true, buildings: [building], rooms: [], tenants: [] } }); }
      if (path.endsWith('/buildings') || path.endsWith('/buildings/b1')) {
        writes++; sent = request.postDataJSON();
        if (failure) return route.fulfill({ status: 422, json: { ok: false, message: 'Lỗi kiểm thử: chưa lưu được.' } });
        await pending;
        Object.assign(building, sent);
        return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: { ok: true, building } });
      }
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${base}/?module=buildings`);
    await page.locator('[data-testid="console-building-scope-selector"]:visible').first().click();
    await page.locator('[data-testid="btn-open-create-building"]:visible').click();
    let dialog = page.getByTestId('modal-create-building'); await dialog.waitFor();
    await dialog.getByTestId('input-building-code').fill('QA');
    await dialog.getByTestId('input-building-name').fill('TOA NHA QA');
    await dialog.getByTestId('input-building-initial-floors').fill('0');
    for (const [key, value] of Object.entries(owner)) await dialog.getByTestId(`input-landlord-${key}`).fill(key === 'birthDate' ? '21/07/1985' : value);
    await checkLayout(dialog, 'create', width);
    await page.screenshot({ path: `.artifacts/building-landlord/${useWebkit ? 'webkit' : 'chrome'}-create-${width}.png`, fullPage: true });
    await dialog.getByTestId('submit-create-building').click();
    await dialog.getByTestId('create-building-error').waitFor();
    assert.equal(writes, 1); assert.deepEqual(sent.landlord, owner);
    await assertOwner(dialog, owner);
    failure = false;
    const beforeSaveReads = reads;
    await dialog.getByTestId('submit-create-building').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="submit-create-building"]')?.disabled);
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByTestId('input-landlord-fullName').isDisabled(), true);
    release(); await dialog.waitFor({ state: 'detached' });
    assert.ok(reads > beforeSaveReads, 'save waits for bootstrap readback');
    await page.getByRole('button', { name: 'Cấu hình TOA NHA QA', exact: true }).click();
    await page.getByRole(width >= 768 ? 'menuitem' : 'button', { name: 'Chỉnh sửa tòa nhà', exact: true }).click();
    dialog = page.getByTestId('modal-edit-building'); await dialog.waitFor();
    await assertOwner(dialog, owner);
    await checkLayout(dialog, 'edit', width);
    await page.screenshot({ path: `.artifacts/building-landlord/${useWebkit ? 'webkit' : 'chrome'}-edit-${width}.png`, fullPage: true });
    await dialog.getByTestId('input-landlord-accountNumber').fill('0000987654');
    failure = true;
    await dialog.getByTestId('submit-edit-building').click();
    await dialog.getByText('Lỗi kiểm thử: chưa lưu được.', { exact: true }).waitFor();
    assert.equal(await dialog.getByTestId('input-landlord-accountNumber').inputValue(), '0000987654');
    failure = false;
    await dialog.getByTestId('submit-edit-building').click(); await dialog.waitFor({ state: 'detached' });
    assert.equal(building.landlord.accountNumber, '0000987654');
    assert.equal(building.landlord.idNumber, '000000000001');
    await page.getByRole('button', { name: 'Cấu hình TOA NHA QA', exact: true }).click();
    await page.getByRole(width >= 768 ? 'menuitem' : 'button', { name: 'Chỉnh sửa tòa nhà', exact: true }).click();
    dialog = page.getByTestId('modal-edit-building'); await dialog.waitFor();
    assert.equal(await dialog.getByTestId('input-landlord-accountNumber').inputValue(), '0000987654');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    results.push({ engine: useWebkit ? 'webkit' : 'chrome', width, fonts: '13px inputs/selects/labels/buttons', noOverflow: true, pinnedActions: true, createEditReadback: true, failurePreservesInputs: true, busyEscapeBlocked: true });
    console.log(`PASS ${useWebkit ? 'WebKit' : 'Chrome'} ${width}px: create/edit/readback, consistent fonts, pinned controls, error recovery and keyboard`);
    await context.close();
  }
  await writeFile(`.artifacts/building-landlord/${useWebkit ? 'webkit' : 'chrome'}-results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }

async function assertOwner(dialog, expected) {
  for (const [key, value] of Object.entries(expected)) assert.equal(await dialog.getByTestId(`input-landlord-${key}`).inputValue(), key === 'birthDate' ? '21/07/1985' : value);
}

async function checkLayout(dialog, mode, width) {
  const body = dialog.getByTestId(`${mode}-building-content`);
  const header = dialog.getByTestId(`${mode}-building-header`);
  const footer = dialog.getByTestId(`${mode}-building-footer`);
  await dialog.page().waitForFunction(testId => {
    const popup = document.querySelector(`[data-testid="${testId}"]`); return popup && Number(getComputedStyle(popup).opacity) >= .999;
  }, `modal-${mode}-building`);
  await body.evaluate(el => { el.scrollTop = 0; });
  const original = await Promise.all([header.boundingBox(), footer.boundingBox()]);
  const geometry = await dialog.evaluate(el => {
    const controls = [...el.querySelectorAll('input, select')];
    const fonts = nodes => [...new Set(nodes.map(node => getComputedStyle(node).fontSize))];
    return { controlFonts: fonts(controls), labelFonts: fonts([...el.querySelectorAll('label')]),
      buttonFonts: fonts([...el.querySelectorAll('button')]), heights: [...new Set(controls.map(node => getComputedStyle(node).height))],
      overflow: el.scrollWidth > el.clientWidth,
      badControls: controls.filter(node => node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length };
  });
  assert.deepEqual(geometry.controlFonts, ['13px']); assert.deepEqual(geometry.labelFonts, ['13px']); assert.deepEqual(geometry.buttonFonts, ['13px']);
  assert.deepEqual(geometry.heights, ['38px']); assert.equal(geometry.overflow, false); assert.equal(geometry.badControls, 0);
  const [address, idNumber, birthDate] = await Promise.all([
    dialog.getByTestId('input-landlord-address').boundingBox(),
    dialog.getByTestId('input-landlord-idNumber').boundingBox(),
    dialog.getByTestId('input-landlord-birthDate').boundingBox(),
  ]);
  assert.ok(address.width > idNumber.width * 1.8, 'Landlord address should span both columns');
  assert.equal(Math.round(birthDate.height), Math.round(idNumber.height), 'Date input should match text input height');
  assert.equal(Math.round(address.height), Math.round(idNumber.height), 'Address input should match text input height');
  for (const position of [.5, 1]) {
    await body.evaluate((el, position) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * position; }, position);
    const after = await Promise.all([header.boundingBox(), footer.boundingBox()]);
    for (let i = 0; i < original.length; i++) assert.equal(Math.round(after[i].y), Math.round(original[i].y));
  }
  const bottom = await footer.boundingBox(); assert.ok(bottom.y + bottom.height <= 761);
  const popup = await dialog.boundingBox(); assert.ok(popup.width <= width);
}
