import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const landingDir = join(root, 'apps', 'landing');
const require = createRequire(join(landingDir, 'package.json'));

const { loadAdhomeEnv } = await import(pathToFileURL(join(landingDir, 'server', 'envLoader.js')).href);
loadAdhomeEnv();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { signConsoleToken, ALL_CONSOLE_PERMISSIONS, CONSOLE_SESSION_COOKIE_NAME } = await import(pathToFileURL(join(landingDir, 'server', 'authRbac.ts')).href);

const versionArg = process.argv.find(arg => arg.startsWith('--version='))?.split('=')[1] || 'after';
const outputDir = `C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\798edb81-8f61-48ac-a080-27d5761e4994\\screenshots\\${versionArg}`;
mkdirSync(outputDir, { recursive: true });

async function run() {
  console.log(`=== STARTING CAPTURE FOR VERSION: ${versionArg.toUpperCase()} ===`);
  const actor = await prisma.consoleActor.findFirst({ where: { role: 'ADMIN', isActive: true } });
  const nowSec = Math.floor(Date.now() / 1000);
  const token = signConsoleToken({
    jti: `jti-cap-${Date.now()}`,
    sub: actor.id,
    email: actor.email,
    orgId: actor.orgId,
    role: actor.role,
    permissions: Array.isArray(actor.permissions) && actor.permissions.length > 0 ? actor.permissions : ALL_CONSOLE_PERMISSIONS,
    buildingScopes: ['*'],
    sessionVersion: actor.sessionVersion,
    iat: nowSec,
    exp: nowSec + 7 * 86400,
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  // --- 1. CAPTURE LOGIN PAGE (NO AUTH) ---
  console.log('Capturing Login Page...');
  {
    // Desktop Login
    const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await deskContext.newPage();
    await page.goto('http://127.0.0.1:5174/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: join(outputDir, '01-desktop-login.png'), fullPage: false });
    await deskContext.close();

    // Mobile Login
    const mobContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    const mobPage = await mobContext.newPage();
    await mobPage.goto('http://127.0.0.1:5174/login', { waitUntil: 'domcontentloaded' });
    await mobPage.waitForTimeout(3500);
    await mobPage.screenshot({ path: join(outputDir, '01-mobile-login.png'), fullPage: false });
    await mobContext.close();
  }

  // Helper for authenticated desktop capture
  async function captureDesktopAuth(moduleKey, filename, extraAction) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([
      { name: CONSOLE_SESSION_COOKIE_NAME, value: token, domain: '127.0.0.1', path: '/' }
    ]);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5174/?module=${moduleKey}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (extraAction) await extraAction(page);
    await page.screenshot({ path: join(outputDir, filename), fullPage: false });
    await context.close();
  }

  // Helper for authenticated mobile capture
  async function captureMobileAuth(moduleKey, filename, extraAction) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    await context.addCookies([
      { name: CONSOLE_SESSION_COOKIE_NAME, value: token, domain: '127.0.0.1', path: '/' }
    ]);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5174/?module=${moduleKey}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (extraAction) await extraAction(page);
    await page.screenshot({ path: join(outputDir, filename), fullPage: false });
    await context.close();
  }

  // --- 2. DASHBOARD ---
  console.log('Capturing Dashboard...');
  await captureDesktopAuth('overview', '02-desktop-dashboard.png');
  await captureMobileAuth('overview', '02-mobile-dashboard.png');

  // --- 3. INVOICES ---
  console.log('Capturing Invoices...');
  await captureDesktopAuth('invoices', '03-desktop-invoices.png');
  await captureMobileAuth('invoices', '03-mobile-invoices.png');

  // --- 4. PAYMENTS ---
  console.log('Capturing Payments...');
  await captureDesktopAuth('payments', '04-desktop-payments.png');
  await captureMobileAuth('payments', '04-mobile-payments.png');

  // --- 5. FINANCE ---
  console.log('Capturing Finance...');
  await captureDesktopAuth('finance', '05-desktop-finance.png');
  await captureMobileAuth('finance', '05-mobile-finance.png');

  // --- 6. SETTINGS ---
  console.log('Capturing Settings...');
  await captureDesktopAuth('settings', '06-desktop-settings.png');
  await captureMobileAuth('settings', '06-mobile-settings.png');

  // --- 7. MORE DRAWER (MOBILE) & DESKTOP PROFILE POPOVER ---
  console.log('Capturing Mobile More Drawer & Desktop Profile Popover...');
  await captureMobileAuth('overview', '07-mobile-more-drawer.png', async (page) => {
    const drawerBtn = (await page.$('[data-testid="console-mobile-more-trigger"]')) || (await page.$('[data-testid="console-mobile-menu-trigger"]'));
    if (drawerBtn) {
      await drawerBtn.click();
      await page.waitForTimeout(600);
    }
  });

  await captureDesktopAuth('overview', '07-desktop-profile-popover.png', async (page) => {
    const avatarBtn = await page.$('[data-testid="console-user-menu-trigger"]');
    if (avatarBtn) {
      await avatarBtn.click();
      await page.waitForTimeout(600);
    }
  });

  await browser.close();
  await prisma.$disconnect();
  console.log(`=== CAPTURE FOR ${versionArg.toUpperCase()} COMPLETED SUCCESSFULLY! ===`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
