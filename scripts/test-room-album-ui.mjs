import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const floor = { id: 'f1', buildingId: 'b1', floorNumber: 1, name: 'Tầng 1', roomCount: 1 };
    const building = { id: 'b1', code: 'QA', name: 'Tòa nhà thử', status: 'ACTIVE', stats: { availableRooms: 1, totalRooms: 1, occupiedRooms: 0, reservedRooms: 0 }, floors: [floor], streetAddress: 'Địa chỉ thử' };
    const room = { id: 'room-qa', buildingId: 'b1', floorId: 'f1', floorNumber: 1, code: '101', buildingName: building.name, floorName: 'Tầng 1', area: 25, roomType: 'Studio', rentalModel: 'ENTIRE_ROOM', electricRateVnd: 3800, effectiveElectricRateVnd: 3800, waterRateVnd: 15000, effectiveWaterRateVnd: 15000, effectiveWaterMethod: 'PER_M3', serviceFeeVnd: 0, listPriceVnd: 4500000, depositMonths: 1, maxOccupants: 2, occupancyStatus: 'AVAILABLE', isPublishedToLanding: true, building, images: [] };
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@example.test', orgId: 'qa', role: 'ADMIN' } } });
      if (url.pathname.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [building], rooms: [room], tenants: [] } });
      if (url.pathname.endsWith('/rental-workflow/room-qa')) return route.fulfill({ json: { ok: true, room, contract: null, reservation: null, contracts: [] } });
      if (url.pathname.endsWith('/occupants')) return route.fulfill({ json: { ok: true, occupants: [] } });
      if (url.pathname.endsWith('/images') && route.request().method() === 'POST') {
        assert.equal(route.request().headers()['content-type'], 'image/png');
        room.images = [{ id: '00000000-0000-0000-0000-000000000001', mimeType: 'image/png', alt: room.code, size: png.length }];
        return route.fulfill({ status: 201, json: { ok: true, images: room.images } });
      }
      if (url.pathname.endsWith('/00000000-0000-0000-0000-000000000001')) return route.fulfill({ contentType: 'image/png', body: png });
      return route.fulfill({ json: { ok: true, items: [] } });
    });
    await page.goto(`${process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187'}/?module=buildings`);
    if (process.env.ADHOME_ALBUM_DEBUG) { await page.waitForTimeout(1000); console.log('DEBUG', errors, (await page.locator('body').innerText()).slice(0, 1000)); }
    await page.getByTestId('building-expand-QA').click();
    await page.getByTestId('floor-expand-f1').click();
    await page.getByTestId('room-card-QA-101').click();
    const panel = page.getByRole('tabpanel', { name: /Tổng quan/ });
    await panel.getByRole('heading', { name: 'Album ảnh' }).waitFor();
    const rates = panel.locator('dl[aria-label="Điện và nước"] dt');
    assert.equal(await rates.count(), 2);
    const boxes = await Promise.all([rates.nth(0).boundingBox(), rates.nth(1).boundingBox()]);
    assert.ok(Math.abs(boxes[0].y - boxes[1].y) < 3, 'electricity and water share one row');
    await panel.getByLabel('Chọn ảnh phòng').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: png });
    await panel.getByRole('link', { name: 'Xem ảnh phòng 1' }).waitFor();
    assert.equal(await panel.getByText('Ảnh bìa', { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px room overview: rates aligned, album upload, thumbnail cover`);
  }
} finally { await browser.close(); }
