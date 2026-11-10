import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('.artifacts/reconciliation-ui', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const building = { id: 'b1', code: 'AP', name: 'An Phú', status: 'ACTIVE', floors: [], stats: { totalRooms: 12, availableRooms: 3, occupiedRooms: 9 } };

await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/auth/me')) return route.fulfill({ json: { ok: true, actor: { id: 'qa', email: 'qa@adhome.vn', orgId: 'adhome', role: 'ADMIN', displayName: 'Hoàng Tín' } } });
  if (path.endsWith('/bootstrap')) return route.fulfill({ json: { ok: true, buildings: [building], rooms: [], tenants: [] } });
  if (path.endsWith('/module-data')) return route.fulfill({ json: {
    ok: true,
    providers: [
      { providerId: 'PAYOS', displayName: 'payOS', isEnabled: true, status: 'VERIFIED', capabilities: ['PAYMENT_LINK', 'VIETQR_DYNAMIC'] },
      { providerId: 'SEPAY', displayName: 'SePay', isEnabled: true, status: 'VERIFIED', capabilities: ['VIETQR_DYNAMIC', 'AUTO_RECONCILE'] },
      { providerId: 'TINGEE', displayName: 'Tingee', isEnabled: false, status: 'UNCONFIGURED', capabilities: ['VIETQR_DYNAMIC'] },
    ],
    transactions: [
      { id: 'tx1', providerId: 'SePay', externalTxId: 'FT263130948521', amountVnd: 14166667, payerName: 'NGUYEN VAN AN', referenceText: 'AP401 T11 2026', reconcileState: 'MATCHED', matchType: 'EXACT', direction: 'IN', invoiceCode: 'HD-AP401-1126', verifiedAt: '2026-11-09T14:20:00Z' },
      { id: 'tx2', providerId: 'payOS', externalTxId: 'PAYOS-8409231', amountVnd: 6500000, payerName: 'TRAN MINH THU', referenceText: 'Thanh toan phong 302', reconcileState: 'PENDING', matchType: 'SUGGESTED', direction: 'IN', invoiceCode: null, verifiedAt: '2026-11-09T13:10:00Z' },
      { id: 'tx3', providerId: 'Tiền mặt', externalTxId: 'TM-091126-014', amountVnd: 4200000, payerName: 'LE QUANG HUY', referenceText: 'Thu tiền phòng tháng 11', reconcileState: 'MATCHED', matchType: 'EXACT', direction: 'IN', invoiceCode: 'HD-AP205-1126', verifiedAt: '2026-11-09T10:05:00Z' },
      { id: 'tx4', providerId: 'MB Bank', externalTxId: 'OUT-091126-08', amountVnd: 1250000, accountName: 'Hoàn cọc P.102', referenceText: 'Hoan coc hop dong HD-102', reconcileState: 'PENDING', matchType: 'NONE', direction: 'OUT', invoiceCode: null, verifiedAt: '2026-11-09T09:15:00Z' },
    ],
  } });
  return route.fulfill({ json: { ok: true, items: [] } });
});

await page.goto('http://127.0.0.1:4176/?module=payments');
await page.getByTestId('payments-reconciliation-workspace').waitFor();
await page.waitForTimeout(500);
await page.evaluate(() => {
  const loader = document.querySelector('[data-testid="adhome-logo-fill-loader"]');
  loader?.previousElementSibling?.remove();
  loader?.remove();
  const pageLayer = document.querySelector('body > div > div');
  if (pageLayer instanceof HTMLElement) pageLayer.style.opacity = '1';
});
await page.screenshot({ path: '.artifacts/reconciliation-ui/mobile.png', fullPage: true });
console.log(JSON.stringify({ screenshot: '.artifacts/reconciliation-ui/mobile.png', overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors: [] }));
await browser.close();
