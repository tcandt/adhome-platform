import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: path.resolve('apps/console'), stdio: 'ignore', windowsHide: true,
});
for (let attempt = 0; attempt < 40; attempt++) {
  try { if ((await fetch('http://127.0.0.1:4175/')).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });

await page.addInitScript(() => {
  sessionStorage.setItem('adhome_v2_active_module', 'invoices');
  localStorage.setItem('adhome_active_building', 'ALL');
});

const actor = {
  id: 'actor-ui-proof', displayName: 'Quản trị viên', email: 'admin@adhome.vn', role: 'ADMIN',
  orgId: 'org-ui-proof', orgName: 'AdHome', permissions: ['system.admin'], buildingScopes: ['*'], sessionVersion: 1,
};
const invoice = {
  id: 'inv-ui-proof', invoiceCode: 'INV-HD-P25-02-7F293215', buildingCode: 'LK08-25', roomCode: 'P25-02',
  tenantName: 'Ngô Tử Vũ', periodKey: '2026-11', dueDate: '2026-11-05', roomRentVnd: 9800000,
  electricVnd: 850000, waterVnd: 300000, serviceFeeVnd: 1500000, adjustmentVnd: 0,
  totalAmountVnd: 12450000, paidAmountVnd: 0, status: 'ISSUED',
};

await page.route('**/api/v1/console/**', async route => {
  const url = new URL(route.request().url());
  let body = { ok: true };
  if (url.pathname.endsWith('/auth/me')) body = { ok: true, actor };
  else if (url.pathname.endsWith('/v2/bootstrap')) body = {
    ok: true, organization: { id: 'org-ui-proof', name: 'AdHome' },
    buildings: [{ id: 'bld-ui-proof', code: 'LK08-25', name: 'Tòa LK08-25', status: 'ACTIVE', floors: [] }],
    rooms: [], tenants: [], kpis: {}, recentLeads: [], notifications: { items: [], unreadCount: 0 }, moduleCounts: { invoicesUnpaid: 1 }, syncedAt: new Date().toISOString(),
  };
  else if (url.pathname.endsWith('/v2/module-data')) body = { ok: true, module: 'invoices', activePeriod: '2026-11', invoices: [invoice] };
  else if (url.pathname.endsWith('/v2/invoices/inv-ui-proof')) body = {
    ok: true, automaticHandover: { electricRequired: false, waterRequired: true },
    vietQr: { providerId: 'SEPAY', bankCode: 'MB', accountNumber: '0888888888', accountName: 'CONG TY ADHOME', transferContent: 'INVHDP25027F293215', amountVnd: 12450000, qrUrl: null },
    invoice: { ...invoice, policySnapshot: {}, payments: [] },
  };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

await page.goto('http://127.0.0.1:4175/?module=invoices', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForFunction(() => typeof window.__adhome_openInvoicePayModal === 'function');
await page.evaluate(() => window.__adhome_openInvoicePayModal());
await page.getByTestId('invoice-payment-modal').waitFor({ state: 'visible' });
await page.getByRole('button', { name: 'Quét QR' }).click();
await page.waitForFunction(() => {
  const image = document.querySelector('img[alt^="Mã VietQR"]');
  return image instanceof HTMLImageElement && image.complete;
}, null, { timeout: 15000 });
await page.waitForTimeout(500);

const output = path.resolve('docs/evidence/invoice-payment-redesign-mobile.png');
await fs.mkdir(path.dirname(output), { recursive: true });
await page.screenshot({ path: output, fullPage: false });
console.log(output);
await browser.close();
server.kill();
