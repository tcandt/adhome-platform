import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/landing/package.json'));
const { PDFDocument } = require('pdf-lib');
const sharp = require(process.env.ADHOME_SHARP_MODULE || 'sharp');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.ADHOME_UI_URL || 'http://127.0.0.1:5187';
const pdf = await PDFDocument.create(); pdf.addPage([400, 500]); pdf.addPage([400, 500]); const pdfBytes = Buffer.from(await pdf.save());
const profile = { tenant: { fullName: 'Khach chinh', phone: '0900000001', idNumber: '000000000001', birthDate: '1995-01-01', gender: 'Nam', address: 'Dia chi QA' }, landlord: { fullName: 'Chu nha QA', idNumber: '000000000002', address: 'Dia chi QA' }, members: [], rentalAddress: 'Dia chi QA', authority: 'Cong an QA', signedDate: '2026-11-01', leaseTemplate: 'LEASE_1PN' };
await mkdir('.artifacts/private-documents/ui', { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const building = { id: 'b1', code: 'QA', name: 'TOA NHA QA', status: 'ACTIVE', buildingType: 'SERVICED_APARTMENT', streetAddress: 'QA', floors: [{ id: 'f1', floorNumber: 1, name: 'Tang 1' }], stats: { totalRooms: 1, floorsCount: 1, occupiedRooms: 1 }, landlord: {} };
    const contract = { id: 'c1', contractCode: 'HD-QA', status: 'ACTIVE', tenantId: 't1', tenantName: 'Khach chinh', startDate: '2026-11-01', endDate: '2027-11-01', monthlyRentVnd: 5000000, depositVnd: 10000000, occupantsCount: 2 };
    const occupants = [
      { id: 'o1', tenantId: 't1', contractId: 'c1', fullName: 'Khach chinh', phone: '0900000001', relationToPrimary: 'PRIMARY', residenceRegStatus: 'PENDING', isActive: true },
      { id: 'o2', contractId: 'c1', fullName: 'Nguoi cung ho', phone: '0900000002', relationToPrimary: 'FAMILY', residenceRegStatus: 'REGISTERED', isActive: true },
      { id: 'o3', contractId: 'c1', fullName: 'Da chuyen di', relationToPrimary: 'OTHER', isActive: false },
    ];
    const room = { id: 'r1', code: '101', buildingId: 'b1', buildingCode: 'QA', buildingName: building.name, floorId: 'f1', floorNumber: 1, floorName: 'Tang 1', roomType: 'Studio', area: 25, rentalModel: 'ENTIRE_ROOM', occupancyStatus: 'OCCUPIED', maxOccupants: 3, listPriceVnd: 5000000, depositMonths: 2, effectiveElectricRateVnd: 3800, effectiveWaterRateVnd: 100000, effectiveWaterMethod: 'PER_PERSON', amenities: [], images: [], activeContract: contract, activeContracts: [contract], occupants: occupants.filter(o => o.isActive), currentTenant: { id: 't1', fullName: 'Khach chinh', phone: '0900000001' }, updatedAt: '2026-11-08T00:00:00Z' };
    const tenant = { id: 't1', fullName: 'Khach chinh', phone: '0900000001', email: '', idNumber: '000000000001', residenceRegStatus: 'PENDING', currentRoomId: 'r1', currentRoomCode: '101', buildingCode: 'QA', primaryBuildingId: 'b1', activeContractCode: 'HD-QA', monthlyRentVnd: 5000000 };
    let buildingWrites = 0, docWrites = 0, failed = false, failNext = true; const docs = new Map(), sessions = new Map();
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data });
      if (path.endsWith('/auth/me')) return json({ ok: true, actor: { id: 'qa', orgId: 'qa', role: 'ADMIN', email: 'qa@example.test', buildingScopes: ['*'] } });
      if (path.endsWith('/bootstrap')) return json({ ok: true, buildings: [building], rooms: [room], tenants: [tenant] });
      if (path.endsWith('/rental-workflow/r1')) return json({ ok: true, room, contract, contracts: [contract], profile });
      if (path.endsWith('/occupants')) return json({ ok: true, occupants });
      const documentPath = path.match(/^(.*\/(?:documents|identity-documents))(?:\/([^/]+)(?:\/(chunks|complete))?)?$/);
      if (documentPath) {
        const [, endpoint, id, op] = documentPath;
        if (!docs.has(endpoint)) docs.set(endpoint, []);
        if (method === 'GET') return json({ ok: true, documents: docs.get(endpoint) });
        if (method === 'POST' && !id) { const data = request.postDataJSON(); const uploadId = crypto.randomUUID(); sessions.set(uploadId, { ...data, id: uploadId, parts: [], endpoint }); return json({ ok: true, uploadId, chunkBytes: 128 * 1024 }, 201); }
        if (method === 'PUT') {
          docWrites++; const part = Number(url.searchParams.get('part'));
          if (failNext) { failNext = false; failed = true; return json({ ok: false, message: 'Loi tai tep kiem thu' }, 503); }
          sessions.get(id).parts[part] = request.postDataBuffer(); return json({ ok: true, part, size: request.postDataBuffer().length });
        }
        if (op === 'complete') {
          const session = sessions.get(id); const document = { id, name: session.name, kind: session.kind, mimeType: session.mimeType, size: session.size, pages: session.mimeType === 'application/pdf' ? 2 : 1 };
          assert.equal(Buffer.concat(session.parts).length, session.size);
          if (endpoint.includes('identity')) {
            const imageBytes = Buffer.concat(session.parts);
            const image = await sharp(imageBytes).metadata();
            assert.equal(image.format, 'jpeg');
            const { info } = await sharp(imageBytes).trim({ background: '#fff', threshold: 12 }).toBuffer({ resolveWithObject: true });
            assert.ok(info.width < image.width - 8 && info.height < image.height - 8, 'saved JPEG contains a real white margin on every side');
            assert.ok(Math.abs(Math.max(info.width, info.height) / Math.min(info.width, info.height) - 1.586) < 0.02, 'card inside the padding preserves ID-1 aspect ratio');
          }
          docs.set(endpoint, [...docs.get(endpoint).filter(d => !endpoint.includes('identity') || d.kind !== session.kind), document]); return json({ ok: true, document }, 201);
        }
        if (method === 'DELETE') { docs.set(endpoint, docs.get(endpoint).filter(d => d.id !== id)); return json({ ok: true, documents: docs.get(endpoint) }); }
      }
      if (path.endsWith('/document/profile')) return json({ ok: true, missing: [] });
      if (path.endsWith('/document')) {
        if (method === 'GET') return json({ ok: true, contract, room: { code: '101', buildingName: building.name }, profile, missing: [] });
        const body = request.postDataJSON();
        if (body.bundle && (docs.get('/api/v1/console/v2/contracts/c1/identity-documents') || []).length < 2) return json({ ok: false, message: 'Bo sung CCCD', missing: ['CCCD mặt trước', 'CCCD mặt sau'] }, 422);
        return route.fulfill({ contentType: 'application/pdf', body: pdfBytes });
      }
      if (path.endsWith('/buildings') || path.endsWith('/buildings/b1')) { buildingWrites++; return json({ ok: true, building }); }
      return json({ ok: true, items: [] });
    });
    try {
      await page.goto(`${base}/?module=buildings`);
      await page.getByTestId('subtab-buildings-tenants').click();
      const directory = page.getByTestId('console-tenants-directory');
      await directory.getByRole('button', { name: 'Tất cả (2)', exact: true }).waitFor();
      assert.equal(await directory.getByText('Nguoi cung ho', { exact: true }).filter({ visible: true }).count(), 1);
      await directory.getByRole('button', { name: 'Hồ sơ lưu trú', exact: true }).filter({ visible: true }).click();
      await page.getByTestId('room-modal-tab-occupants').waitFor();
      const table = page.getByRole('tabpanel', { name: 'Khách ở', exact: true }).getByRole('table');
      await table.locator('tbody tr').nth(1).waitFor();
      assert.equal(await table.locator('tbody tr').count(), 2);
      await page.getByTestId('room-modal-tab-overview').click();
      await page.getByRole('button', { name: 'Khách lưu trú (2)', exact: true }).waitFor();
      await page.getByTestId('room-modal-tab-contracts').click(); await page.getByRole('button', { name: 'Xem hợp đồng HD-QA', exact: true }).click();
      const dialog = page.getByTestId('contract-document-dialog'); await dialog.getByRole('button', { name: 'Xem trước', exact: true }).waitFor();
      assert.equal(await dialog.getByLabel('Bản in', { exact: true }).inputValue(), 'bundle');
      const capture = dialog.getByLabel('Chụp CCCD mặt trước', { exact: true }); assert.equal(await capture.getAttribute('capture'), 'environment');
      if (width === 1440) {
        await dialog.getByLabel('Tải lên CCCD mặt trước', { exact: true }).setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid-image') });
        const unreadable = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'CCCD mặt trước', exact: true }) });
        await unreadable.getByRole('alert').filter({ hasText: 'Không thể đọc ảnh này' }).waitFor();
        await unreadable.getByRole('button', { name: 'Đóng quét CCCD', exact: true }).click();
        assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), 0);
      }
      const synthetic = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#28313b'; x.fillRect(0, 0, 1000, 700);
        x.fillStyle = '#cbe4de'; x.beginPath(); x.moveTo(140, 140); x.lineTo(860, 100); x.lineTo(820, 580); x.lineTo(180, 600); x.closePath(); x.fill();
        x.fillStyle = '#b13b3b'; x.font = 'bold 40px Arial'; x.fillText('IDENTITY QA FIXTURE', 240, 220); x.fillStyle = '#487d80'; x.fillRect(230, 280, 130, 180); x.fillStyle = '#333'; for (let y = 290; y < 510; y += 45) x.fillRect(420, y, 320, 10);
        return c.toDataURL('image/png').split(',')[1];
      });
      const blank = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 700; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#eee'; x.fillRect(0, 0, 700, 700); return c.toDataURL('image/png').split(',')[1]; });
      if (width === 1440) {
        let assetFailures = 0;
        await page.route(/\/opencv[^/?]*\.js(?:\?|$)/, route => { assetFailures++; return assetFailures === 1 ? route.abort() : route.continue(); });
        await dialog.getByLabel('Tải lên CCCD mặt trước', { exact: true }).setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64') });
        const unavailable = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'CCCD mặt trước', exact: true }) });
        await unavailable.getByRole('alert').filter({ hasText: 'Không tải được bộ nhận diện góc' }).waitFor({ timeout: 60000 });
        await unavailable.getByRole('button', { name: 'Đóng quét CCCD', exact: true }).click();
        assert.equal(assetFailures, 1); assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), 0);
      }
      await dialog.getByLabel('Tải lên CCCD mặt trước', { exact: true }).setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64') });
      const fallback = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'CCCD mặt trước', exact: true }) });
      await fallback.getByRole('alert').filter({ hasText: 'Chưa xác định chắc chắn' }).waitFor({ timeout: 60000 });
      assert.equal(await fallback.getByAltText('CCCD mặt trước đã cắt và phẳng hoá').count(), 0, 'uncertain detection never silently crops the default rectangle');
      assert.equal(await fallback.getByRole('button', { name: 'Góc 1', exact: true }).count(), 0);
      await page.screenshot({ path: `.artifacts/private-documents/ui/scanner-fallback-${width}.png` });
      await fallback.getByRole('button', { name: 'Chỉnh góc', exact: true }).click();
      await fallback.getByRole('button', { name: 'Góc 1', exact: true }).focus(); await page.keyboard.press('ArrowRight');
      await fallback.getByRole('button', { name: 'Cắt & phẳng hoá', exact: true }).click();
      await fallback.getByAltText('CCCD mặt trước đã cắt và phẳng hoá').waitFor();
      await page.screenshot({ path: `.artifacts/private-documents/ui/scanner-${width}.png` });
      await fallback.getByRole('button', { name: 'Đóng quét CCCD', exact: true }).click();
      assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), 0);
      for (const side of ['trước', 'sau']) {
        await dialog.getByLabel(`Tải lên CCCD mặt ${side}`, { exact: true }).setInputFiles({ name: 'identity.png', mimeType: 'image/png', buffer: Buffer.from(synthetic, 'base64') });
        const scanner = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: `CCCD mặt ${side}`, exact: true }) });
        await scanner.getByAltText(`CCCD mặt ${side} đã cắt và phẳng hoá`).waitFor({ timeout: 60000 });
        const confirm = scanner.getByRole('button', { name: 'Xác nhận ảnh cắt', exact: true });
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some(el => el.getAttribute('aria-busy') === 'false' && el.textContent.includes('Xác nhận ảnh cắt')));
        assert.equal(await confirm.isEnabled(), true);
        assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), side === 'trước' ? 0 : 1, 'a successful automatic crop must wait for explicit confirmation');
        await page.screenshot({ path: `.artifacts/private-documents/ui/scanner-confirm-${side === 'trước' ? 'front' : 'back'}-${width}.png` });
        if (side === 'trước') {
          await scanner.getByRole('button', { name: 'Đóng quét CCCD', exact: true }).click();
          assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), 0, 'cancel discards an unconfirmed crop');
          await dialog.getByLabel('Tải lên CCCD mặt trước', { exact: true }).setInputFiles({ name: 'identity.png', mimeType: 'image/png', buffer: Buffer.from(synthetic, 'base64') });
          await scanner.getByAltText('CCCD mặt trước đã cắt và phẳng hoá').waitFor({ timeout: 60000 });
          await scanner.getByRole('button', { name: 'Chỉnh góc', exact: true }).click();
          await scanner.getByRole('button', { name: 'Góc 1', exact: true }).focus(); await page.keyboard.press('ArrowRight');
          assert.equal(await confirm.isDisabled(), true, 'corner changes invalidate the previous preview');
          await scanner.getByRole('button', { name: 'Cắt & phẳng hoá', exact: true }).click();
          await scanner.getByAltText('CCCD mặt trước đã cắt và phẳng hoá').waitFor();
        }
        await confirm.click();
        await scanner.waitFor({ state: 'hidden', timeout: 60000 });
        await dialog.getByText(`CCCD-mat-${side === 'trước' ? 'truoc' : 'sau'}.jpg`, { exact: true }).waitFor();
      }
      assert.equal(await dialog.getByText('Chờ lưu', { exact: true }).count(), 2, 'each confirmed crop queues exactly one file');
      assert.equal(await dialog.getByRole('button', { name: 'Xem trước', exact: true }).isDisabled(), true, 'unsaved scans remain in the form until uploaded');
      await dialog.getByRole('button', { name: 'Lưu ảnh CCCD', exact: true }).click();
      await dialog.getByText('Loi tai tep kiem thu', { exact: true }).waitFor(); assert.equal(failed, true);
      assert.equal((docs.get('/api/v1/console/v2/contracts/c1/identity-documents') || []).length, 0);
      await dialog.getByRole('button', { name: 'Lưu ảnh CCCD', exact: true }).click();
      await dialog.getByRole('link', { name: 'CCCD-mat-sau.jpg', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Xem trước', exact: true }).click(); await dialog.getByText('2 trang', { exact: true }).waitFor();
      await page.screenshot({ path: `.artifacts/private-documents/ui/dossier-${width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await dialog.getByRole('button', { name: 'Đóng hợp đồng', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.getByTestId('subtab-buildings-rooms').click();
      await page.getByRole('button', { name: 'Cấu hình TOA NHA QA', exact: true }).click(); await page.getByRole(width >= 768 ? 'menuitem' : 'button', { name: 'Chỉnh sửa tòa nhà', exact: true }).click();
      const edit = page.getByTestId('modal-edit-building');
      if (width === 1440) {
        await edit.getByLabel('Tải lên Sổ đỏ căn nhà mặt trước', { exact: true }).setInputFiles({ name: 'oversized.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) });
        await edit.getByRole('alert').filter({ hasText: 'vượt quá 25 MB' }).waitFor();
        assert.equal(await edit.getByText('Chờ lưu', { exact: true }).count(), 0);
      }
      await edit.getByLabel('Tải lên Sổ đỏ căn nhà mặt trước', { exact: true }).setInputFiles({ name: 'multi-page.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
      await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click(); await edit.waitFor({ state: 'hidden' });
      assert.equal(buildingWrites, 1); assert.equal(docs.get('/api/v1/console/v2/buildings/b1/documents')[0].pages, 2);
      await page.getByRole('button', { name: 'Cấu hình TOA NHA QA', exact: true }).click(); await page.getByRole(width >= 768 ? 'menuitem' : 'button', { name: 'Chỉnh sửa tòa nhà', exact: true }).click();
      await edit.getByRole('link', { name: 'multi-page.pdf', exact: true }).waitFor();
      await edit.getByRole('link', { name: 'multi-page.pdf', exact: true }).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const popup = document.querySelector('[data-testid="modal-edit-building"]');
        const style = popup && getComputedStyle(popup);
        return style && Number(style.opacity) >= .999 && (style.filter === 'none' || style.filter === 'blur(0px)');
      });
      await page.screenshot({ path: `.artifacts/private-documents/ui/building-${width}.png` });
      assert.equal(await edit.evaluate(el => el.scrollWidth > el.clientWidth), false);
      assert.deepEqual(errors, []); assert.ok(docWrites >= 3);
      console.log(`PASS ${width}px reduced motion: explicit crop confirmation, cancel without queuing, corner-change invalidation, real white padding, ID-1 ratio, upload retry/readback and dossier flow`);
    } catch (e) { await page.screenshot({ path: `.artifacts/private-documents/ui/failure-${width}.png` }); console.error('PAGE', (await page.locator('body').innerText()).slice(-3500), errors); throw e; }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
