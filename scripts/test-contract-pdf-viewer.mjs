import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.ADHOME_PLAYWRIGHT_MODULE || 'playwright');
const pdf = await readFile('.artifacts/rental-workflow/LEASE_1PN.pdf');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 820 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const paths = [];
    page.on('pageerror', error => errors.push(error.message));
    const building = { id: 'b1', code: 'QA', name: 'Tòa nhà thử', status: 'ACTIVE', stats: { totalRooms: 1, occupiedRooms: 1 }, floors: [] };
    const contract = { id: 'qa-contract', contractCode: 'HD-QA', buildingCode: 'QA', roomId: 'room-qa', roomCode: '101', tenantName: 'Khách thử', tenantPhone: '0900000001', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRentVnd: 4500000, depositVnd: 4500000, electricRateVnd: 3800, waterRateVnd: 15000 };
    const room = { id: 'room-qa', buildingId: 'b1', code: '101', buildingName: building.name, floorName: 'Tầng 1', area: 25, roomType: 'Studio', rentalModel: 'ENTIRE_ROOM', electricRateVnd: 3800, waterRateVnd: 15000, listPriceVnd: 4500000, maxOccupants: 2, occupancyStatus: 'OCCUPIED', building, activeContract: contract };
    const profile = { tenant: { fullName: 'Khách thử', birthDate: '1995-05-20', idNumber: '000000000001', phone: '0900000001', address: 'Địa chỉ thử' }, landlord: { fullName: 'Chủ nhà thử', idNumber: '000000000002', address: 'Địa chỉ thử' }, members: [], rentalAddress: 'Căn hộ thử', signedDate: '2026-11-03', leaseTemplate: 'LEASE_1PN' };
    await page.route('**/api/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      paths.push(pathname);
      if (pathname.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@example.test', role: 'ADMIN', orgId: 'qa', buildingScopes: ['*'] } } });
      if (pathname.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [building], rooms: [room], tenants: [] } });
      if (pathname.endsWith('/module-data')) return route.fulfill({ json: { ok: true, contracts: [contract] } });
      if (pathname.endsWith('/qa-contract/document')) return route.request().method() === 'GET'
        ? route.fulfill({ json: { ok: true, contract, room: { code: '101', buildingName: building.name }, profile, missing: [] } })
        : route.fulfill({ contentType: 'application/pdf', body: pdf });
      return route.fulfill({ json: { ok: true, items: [] } });
    });
    await page.goto(`${process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187'}/?module=contracts`);
    if (process.env.ADHOME_PDF_DEBUG) { await page.waitForTimeout(1200); console.log('DEBUG', page.url(), paths, errors, (await page.locator('body').innerText()).slice(0, 1200)); }
    await page.getByRole('button', { name: 'Xem hợp đồng HD-QA', exact: true }).click();
    const dialog = page.getByTestId('contract-document-dialog');
    await dialog.locator('.contract-pdf-page').last().waitFor();
    assert.equal(await dialog.locator('.contract-pdf-page').count(), 8);
    await dialog.locator('.contract-pdf-page canvas').first().waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.contract-pdf-page canvas');
      if (!canvas?.width) return false;
      const context = canvas.getContext('2d');
      for (let y = 0; y < canvas.height; y += 30) for (let x = 0; x < canvas.width; x += 30) {
        const pixel = context.getImageData(x, y, 1, 1).data;
        if (pixel[0] < 180 && pixel[1] < 180 && pixel[2] < 180) return true;
      }
      return false;
    });
    const scroll = dialog.locator('.contract-pdf-scroll');
    const fit = await scroll.evaluate(element => ({ width: element.clientWidth, page: element.querySelector('.contract-pdf-page').getBoundingClientRect().width, content: element.scrollWidth }));
    assert.ok(fit.page > 0 && fit.page <= fit.width && fit.content <= fit.width + 1, 'default PDF fits mobile and desktop width');
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.equal(await dialog.locator('.contract-pdf-page').last().isVisible(), true);
    assert.ok(await scroll.evaluate(element => element.scrollTop > 0), 'all pages are reachable by scrolling');
    await dialog.getByRole('button', { name: 'Phóng to PDF' }).click();
    await page.waitForFunction(() => { const element = document.querySelector('.contract-pdf-scroll'); return element && element.scrollWidth > element.clientWidth; });
    await dialog.getByRole('button', { name: 'Vừa chiều rộng' }).click();
    if (width === 390) {
      const zoomed = await scroll.evaluate(element => {
        const touch = (x, y) => new Touch({ identifier: x, target: element, clientX: x, clientY: y });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(100, 300), touch(200, 300)] }));
        element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(75, 300), touch(225, 300)] }));
        return true;
      });
      assert.equal(zoomed, true);
      await dialog.getByRole('button', { name: 'Vừa chiều rộng' }).filter({ hasText: '150%' }).waitFor();
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px PDF: eight pages, fit width, scroll, zoom${width === 390 ? ', two-finger gesture' : ''}`);
  }
} finally { await browser.close(); }
