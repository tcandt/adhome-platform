import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { loadAdhomeEnv } from '../server/envLoader.js';
import { hashPassword } from '../server/passwordHash.ts';
import {
  encryptSecret,
  decryptSecret,
  maskSecretHint,
} from '../server/cryptoVault.ts';
import {
  HunonicCloudClient,
  validateKwhReading,
  calculateWaterBill,
} from '../server/hunonicAdapter.ts';
import {
  PROD_ADMIN_ID,
  provisionProductionAdmin,
} from './provisionProductionAdmin.mjs';

loadAdhomeEnv();

const LANDING_URL = process.env.RC1_BASE_URL || 'http://127.0.0.1:8081';
const CONSOLE_URL = process.env.CONSOLE_BASE_URL || 'http://127.0.0.1:5174';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';
const EVIDENCE_DIR = path.join(process.cwd(), 'docs', 'evidence', 'console-v2');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

async function cleanTestFixtures(prismaClient) {
  // Find test rooms (C3A-*, RACE-*, DIR-*)
  const testRooms = await prismaClient.consoleRoom.findMany({
    where: {
      OR: [
        { code: { startsWith: 'C3A-' } },
        { code: { startsWith: 'RACE-' } },
        { code: { startsWith: 'DIR-' } },
      ],
    },
    select: { id: true },
  });
  const testRoomIds = testRooms.map((r) => r.id);

  if (testRoomIds.length > 0) {
    await prismaClient.roomOccupant.deleteMany({
      where: { roomId: { in: testRoomIds } },
    });
    await prismaClient.meterReading.deleteMany({
      where: { meter: { roomId: { in: testRoomIds } } },
    });
    await prismaClient.electricMeter.deleteMany({
      where: { roomId: { in: testRoomIds } },
    });
    await prismaClient.invoice.deleteMany({
      where: {
        OR: [
          { roomId: { in: testRoomIds } },
          { contract: { roomId: { in: testRoomIds } } },
        ],
      },
    });
    await prismaClient.deposit.deleteMany({
      where: {
        OR: [
          { contract: { roomId: { in: testRoomIds } } },
          { reservation: { roomId: { in: testRoomIds } } },
        ],
      },
    });
    await prismaClient.contract.deleteMany({
      where: { roomId: { in: testRoomIds } },
    });
    await prismaClient.roomReservation.deleteMany({
      where: { roomId: { in: testRoomIds } },
    });
    await prismaClient.consoleRoom.deleteMany({
      where: { id: { in: testRoomIds } },
    });
  }

  // Find test tenants
  const testTenants = await prismaClient.tenant.findMany({
    where: {
      phone: {
        in: [
          '0988776655',
          '0919988776',
          '0977112233',
          '0901234567',
          '0909998888',
          '0906667777',
          '0905554444',
          '0977112234',
          '0903332211',
        ],
      },
    },
    include: {
      contracts: true,
      reservations: true,
      invoices: true,
    },
  });

  for (const t of testTenants) {
    await prismaClient.roomOccupant.deleteMany({
      where: { tenantId: t.id },
    });
    const contractIds = t.contracts.map((c) => c.id);
    if (contractIds.length > 0) {
      await prismaClient.deposit.deleteMany({
        where: { contractId: { in: contractIds } },
      });
      await prismaClient.contract.deleteMany({
        where: { id: { in: contractIds } },
      });
    }
    const resvIds = t.reservations.map((r) => r.id);
    if (resvIds.length > 0) {
      await prismaClient.deposit.deleteMany({
        where: { reservationId: { in: resvIds } },
      });
      await prismaClient.roomReservation.deleteMany({
        where: { id: { in: resvIds } },
      });
    }
    const invoiceIds = t.invoices.map((inv) => inv.id);
    if (invoiceIds.length > 0) {
      await prismaClient.invoice.deleteMany({
        where: { id: { in: invoiceIds } },
      });
    }
    await prismaClient.tenant.delete({
      where: { id: t.id },
    });
  }

  // Clean up test actors & test organizations
  await prismaClient.consoleActor.deleteMany({
    where: { email: 'manager.c3@adhome.vn' },
  });
  await prismaClient.tenant.deleteMany({
    where: { orgId: 'org-test-isolation-99' },
  });
  await prismaClient.organization.deleteMany({
    where: { slug: 'test-isolation-org-99' },
  });
}

function getRepoRoot() {
  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(curr, 'pnpm-workspace.yaml'))) return curr;
    curr = path.resolve(curr, '..');
  }
  return 'D:\\AdHome-Platform';
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium browser executable found.');
}

function killProcessTreeWindows(proc) {
  if (!proc || !proc.pid) return Promise.resolve();
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    killer.on('close', () => resolve());
    killer.on('error', () => resolve());
  });
}

async function waitForHttp200(url, maxTries = 45) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch { }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(err);
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || 'Eval exception'
      );
    }
    return res?.result?.value;
  }

  async screenshot(outPaths) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
    });
    const buf = Buffer.from(data, 'base64');
    for (const p of outPaths) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
    }
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch { }
    }
  }
}

async function fetchHttp(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { }
  return { status: res.status, headers: res.headers, text, json };
}

async function main() {
  console.log('=== ADHOME CONSOLE V2: C3 HARDENING VERIFICATION ===');
  const startedAt = new Date().toISOString();
  const testResults = {
    evaluatedAt: startedAt,
    verdict: 'PENDING',
    reportingTier: 'LOCAL_GATE_PASSED',
    checks: {},
    evidenceFiles: [],
  };

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  let landingProc = null;
  let consoleProc = null;
  let browserProc = null;

  try {
    // 0. PRE-CLEANUP TEST FIXTURES
    console.log('[Step 0] Pre-cleaning residual test fixtures from PostgreSQL...');
    await cleanTestFixtures(prisma);

    // 1. START PREVIEW SERVERS
    console.log('[Step 1] Starting Landing (8081) & Console (5174) Preview Servers...');
    const repoRoot = getRepoRoot();
    const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    landingProc = spawn(
      pnpmBin,
      ['--filter', '@adhome/landing', 'preview', '--host', '127.0.0.1', '--port', '8081'],
      {
        cwd: repoRoot,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ADHOME_CONSOLE_LOGIN_ENABLED: 'true',
          HUNONIC_ALLOW_MOCK: 'true',
        },
      }
    );
    landingProc.stderr?.on('data', (d) => process.stderr.write(`[LANDING ERR] ${d}`));
    landingProc.stdout?.on('data', (d) => {
      const s = d.toString();
      if (s.includes('Error') || s.includes('error') || s.includes('Exception')) {
        process.stderr.write(`[LANDING OUT] ${s}`);
      }
    });

    consoleProc = spawn(
      pnpmBin,
      ['--filter', '@adhome/console', 'preview', '--host', '127.0.0.1', '--port', '5174'],
      {
        cwd: repoRoot,
        shell: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ADHOME_API_TARGET: LANDING_URL,
        },
      }
    );

    const [landingUp, consoleUp] = await Promise.all([
      waitForHttp200(`${LANDING_URL}/`),
      waitForHttp200(`${CONSOLE_URL}/login`),
    ]);
    if (!landingUp || !consoleUp) {
      throw new Error(`Servers failed to start: landingUp=${landingUp}, consoleUp=${consoleUp}`);
    }
    console.log('  Preview servers running successfully.');

    // 2. PROVISION ADMIN & TEST USERS
    console.log('[Step 2] Provisioning test users and verifying DB connection...');
    const ephemeralAdminPassword = `AdHome@AdminPass${crypto.randomBytes(4).toString('hex')}!`;
    await provisionProductionAdmin({
      email: 'admin@adhome.vn',
      newPassword: ephemeralAdminPassword,
      forceActivate: true,
    });
    const adminAcc = await prisma.consoleActor.findUnique({
      where: { id: PROD_ADMIN_ID },
    });
    if (!adminAcc) throw new Error('Admin account not found in database.');
    const orgId = adminAcc.orgId;

    // Provision second org to test multi-tenant isolation
    const secondOrg = await prisma.organization.upsert({
      where: { slug: 'test-isolation-org-99' },
      update: {},
      create: {
        id: 'org-test-isolation-99',
        name: 'Tổ Chức Cách Ly Test Org 99',
        slug: 'test-isolation-org-99',
        hotline: '0905999999',
        addressSummary: 'Địa chỉ cách ly test',
        catalogVersion: 1,
      },
    });

    const secondOrgTenant = await prisma.tenant.create({
      data: {
        orgId: secondOrg.id,
        fullName: 'Khách Ngoại Lai Org 99',
        phone: '0905554444',
        normalizedPhone: '0905554444',
      },
    });

    const managerPasswordHash = await hashPassword('Manager@123456');
    const bldLk = await prisma.building.findFirst({
      where: { orgId, code: { startsWith: 'LK01' } },
    });
    if (!bldLk) throw new Error('Building starting with LK01 not found.');

    const bldLkFloor = await prisma.floor.findFirst({
      where: { buildingId: bldLk.id },
    });
    if (!bldLkFloor) throw new Error('Floor not found in LK01');

    await prisma.consoleActor.upsert({
      where: { email: 'manager.c3@adhome.vn' },
      update: {
        passwordHash: managerPasswordHash,
        role: 'MANAGER',
        permissions: [
          'rooms.manage',
          'tenants.manage',
          'contracts.manage',
          'settlements.manage',
          'finance.read', // NO finance.write!
        ],
        buildingScopes: [bldLk.id],
        isActive: true,
      },
      create: {
        id: 'usr-mgr-c3',
        orgId,
        email: 'manager.c3@adhome.vn',
        displayName: 'Quản lý Tòa LK01 Test',
        role: 'MANAGER',
        passwordHash: managerPasswordHash,
        permissions: [
          'rooms.manage',
          'tenants.manage',
          'contracts.manage',
          'settlements.manage',
          'finance.read',
        ],
        buildingScopes: [bldLk.id],
        isActive: true,
      },
    });

    // 3. MULTI-TENANT LOGIN AUDIT ISOLATION
    console.log('[Step 3] Testing Multi-tenant Login Audit Isolation...');
    await prisma.consoleLoginAudit.create({
      data: {
        orgId,
        actorId: adminAcc.id,
        emailAttempted: adminAcc.email,
        outcome: 'SUCCESS',
        clientIp: '127.0.0.1',
      },
    });
    await prisma.consoleLoginAudit.create({
      data: {
        orgId: secondOrg.id,
        emailAttempted: 'external@other-tenant.com',
        outcome: 'SUCCESS',
        clientIp: '127.0.0.1',
      },
    });

    // 4. AUTHENTICATE TO APIS
    console.log('[Step 4] Authenticating as Admin & Manager...');
    const adminLoginResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@adhome.vn',
          password: ephemeralAdminPassword,
        }),
      }
    );
    if (adminLoginResp.status !== 200 || !adminLoginResp.json?.ok) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginResp.json)}`);
    }
    const adminCookie = adminLoginResp.headers.get('set-cookie')?.split(';')[0];

    const mgrLoginResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'manager.c3@adhome.vn',
          password: 'Manager@123456',
        }),
      }
    );
    if (mgrLoginResp.status !== 200 || !mgrLoginResp.json?.ok) {
      throw new Error(`Manager login failed: ${JSON.stringify(mgrLoginResp.json)}`);
    }
    const mgrCookie = mgrLoginResp.headers.get('set-cookie')?.split(';')[0];

    // Query Settings Audit tab as admin
    const auditResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/settings`,
      {
        headers: { Cookie: adminCookie, Accept: 'application/json' },
      }
    );
    const auditLogins = auditResp.json?.loginAudits || [];
    const leakedOtherOrg = auditLogins.some(
      (l) => l.emailAttempted === 'external@other-tenant.com'
    );
    testResults.checks.multiTenantAuditIsolation = {
      pass: !leakedOtherOrg && auditLogins.length > 0,
      totalLoginsVisible: auditLogins.length,
      leakedOtherOrg,
    };
    console.log(
      `-> Multi-tenant login audit isolation: ${testResults.checks.multiTenantAuditIsolation.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 5. CHECK 2: REVERSIBLE AES-256-GCM CREDENTIALS ENCRYPTION
    console.log('[Step 5] Testing Reversible AES-256-GCM Credentials Vault...');
    const testApiKey = 'hunonic_live_api_key_secret_xyz1234567890!';
    await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/settings/integration`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          providerId: 'HUNONIC',
          secretToken: testApiKey,
          accountLabel: 'Hunonic Enterprise Account',
          isEnabled: true,
        }),
      }
    );

    const rawConnInDb = await prisma.integrationConnection.findUnique({
      where: { orgId_providerId: { orgId, providerId: 'HUNONIC' } },
    });
    const encSecretObj = rawConnInDb?.credentialsJson?.encryptedSecret;
    const isEncryptedGcm =
      encSecretObj?.alg === 'aes-256-gcm' &&
      typeof encSecretObj?.ciphertext === 'string' &&
      encSecretObj?.ciphertext !== testApiKey;
    const decryptedVal = decryptSecret(encSecretObj);
    const isDecryptedAccurate = decryptedVal === testApiKey;
    const isMaskedHintSafe = rawConnInDb?.secretHint?.includes('••••');

    testResults.checks.credentialsCryptoVault = {
      pass: isEncryptedGcm && isDecryptedAccurate && isMaskedHintSafe,
      alg: encSecretObj?.alg,
      ciphertextLength: encSecretObj?.ciphertext?.length,
      decryptedMatch: isDecryptedAccurate,
      secretHint: rawConnInDb?.secretHint,
    };
    console.log(
      `-> AES-256-GCM Credentials Vault: ${testResults.checks.credentialsCryptoVault.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 6. CHECK 3: PERMISSION SEPARATION: finance.write VS finance.read
    console.log('[Step 6] Testing Permission Separation: finance.write...');
    const mgrLedgerResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/ledger`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: mgrCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          entryType: 'INCOME',
          category: 'Test',
          amountVnd: 500000,
          description: 'Unauthorized write attempt by manager',
        }),
      }
    );
    const mgrBlocked =
      mgrLedgerResp.status === 403 &&
      mgrLedgerResp.json?.errorCode === 'INSUFFICIENT_PERMISSION';

    const adminLedgerResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/ledger`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          entryType: 'INCOME',
          category: 'Thu tiền phòng',
          amountVnd: 4500000,
          description: 'Admin Authorized Write Entry',
        }),
      }
    );
    const adminAllowed =
      adminLedgerResp.status === 201 && adminLedgerResp.json?.ok === true;

    testResults.checks.financeWritePermissionSeparation = {
      pass: mgrBlocked && adminAllowed,
      managerStatus: mgrLedgerResp.status,
      managerErrorCode: mgrLedgerResp.json?.errorCode,
      adminStatus: adminLedgerResp.status,
    };
    console.log(
      `-> finance.write Permission Separation: ${testResults.checks.financeWritePermissionSeparation.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 7. CHECK 4: CONCURRENCY ROW-LEVEL LOCK RACE CONDITION (P0)
    console.log('[Step 7] Testing Concurrency Row-Level Lock on Contract Creation...');
    const raceRoom = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `RACE-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Race Condition Test',
        area: 28,
        listPriceVnd: 5000000n,
        occupancyStatus: 'AVAILABLE',
      },
    });

    const testTenant = await prisma.tenant.create({
      data: {
        orgId,
        fullName: 'Khách Hàng Race Concurrency',
        phone: '0988776655',
        normalizedPhone: '0988776655',
        primaryBuildingId: bldLk.id,
      },
    });

    const postContractPayload = {
      roomId: raceRoom.id,
      tenantId: testTenant.id,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      monthlyRentVnd: 5000000,
      depositVnd: 5000000,
    };

    const [reqA, reqB] = await Promise.all([
      fetchHttp(`${LANDING_URL}/api/v1/console/v2/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify(postContractPayload),
      }),
      fetchHttp(`${LANDING_URL}/api/v1/console/v2/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify(postContractPayload),
      }),
    ]);

    const statuses = [reqA.status, reqB.status].sort();
    const exactlyOne201 = statuses[0] === 201 && statuses[1] === 409;
    const conflictResp = reqA.status === 409 ? reqA.json : reqB.json;
    const correctErrorCode =
      conflictResp?.errorCode === 'ROOM_ALREADY_HAS_CONTRACT';

    const activeContractsInDb = await prisma.contract.count({
      where: {
        roomId: raceRoom.id,
        status: { in: ['ACTIVE', 'EXPIRING', 'EXTENDED', 'DRAFT'] },
      },
    });

    testResults.checks.concurrencyRowLevelLock = {
      pass: exactlyOne201 && correctErrorCode && activeContractsInDb === 1,
      statusA: reqA.status,
      statusB: reqB.status,
      errorCode409: conflictResp?.errorCode,
      activeContractsInDb,
    };
    console.log(
      `-> Concurrency Row-Level Lock: ${testResults.checks.concurrencyRowLevelLock.pass ? 'PASS' : 'FAIL'
      } (ReqA: ${reqA.status}, ReqB: ${reqB.status}, DB contracts: ${activeContractsInDb})`
    );

    // 8. CHECK 5: C3 HARDENED LIFECYCLE & INVARIANTS
    console.log('[Step 8] Testing C3 Hardened Lifecycle State Machines & Invariants...');
    const lifeRoom1 = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `C3A-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Test C3A Lifecycle 1',
        area: 30,
        listPriceVnd: 5000000n,
        occupancyStatus: 'AVAILABLE',
        rentalModel: 'ENTIRE_ROOM',
        totalBeds: 1,
      },
    });
    const lifeRoom2 = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `C3A-T-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Đích Chuyển C3A',
        area: 35,
        listPriceVnd: 4800000n,
        occupancyStatus: 'AVAILABLE',
        rentalModel: 'ENTIRE_ROOM',
        totalBeds: 1,
      },
    });
    const lifeRoom3 = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `C3A-S-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Test C3A Thừa Cọc',
        area: 32,
        listPriceVnd: 5000000n,
        occupancyStatus: 'AVAILABLE',
        rentalModel: 'ENTIRE_ROOM',
        totalBeds: 1,
      },
    });

    // Dedicated room for Direct Contract Creation Test (Unpaid deposit, Draft status, Pre-handover)
    const directRoom = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `DIR-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Direct Contract Test',
        area: 28,
        listPriceVnd: 4500000n,
        occupancyStatus: 'AVAILABLE',
        rentalModel: 'ENTIRE_ROOM',
        totalBeds: 1,
      },
    });
    const directTenant = await prisma.tenant.create({
      data: {
        orgId,
        fullName: 'Khách Hàng Tạo Trực Tiếp',
        phone: '0903332211',
        normalizedPhone: '0903332211',
        primaryBuildingId: bldLk.id,
      },
    });

    // 8.1 Customer Profile Decoupling & Soft-delete Occupants (P1)
    console.log('  Testing 8.1: Customer profile decoupled & Soft Delete Occupants...');
    const createTenantResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          fullName: 'Nguyễn Văn C3 Normalization',
          phone: '0901234567',
          roomId: lifeRoom1.id,
        }),
      }
    );
    const roomAfterTenantCreate = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const tenantDecoupledPass =
      createTenantResp.status === 201 &&
      roomAfterTenantCreate?.occupancyStatus === 'AVAILABLE';

    // Room Occupants API: Add & Soft Delete
    const addOccupantResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/rooms/${encodeURIComponent(
        lifeRoom1.id
      )}/occupants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          fullName: 'Lê Thị Bạn Ở Ghép',
          phone: '0909998888',
          relationToPrimary: 'ROOMMATE',
          gender: 'FEMALE',
        }),
      }
    );
    const addedOccupant = addOccupantResp.json?.occupant;
    const getOccupantsResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/rooms/${encodeURIComponent(
        lifeRoom1.id
      )}/occupants`,
      {
        headers: { Cookie: adminCookie, Accept: 'application/json' },
      }
    );
    const occupantsList = getOccupantsResp.json?.occupants || [];
    const roomOccupantsPass =
      addOccupantResp.status === 201 &&
      occupantsList.some((o) => o.fullName === 'Lê Thị Bạn Ở Ghép');

    // Test Soft Delete Occupant (P1)
    const softDeleteResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/occupants/${encodeURIComponent(
        addedOccupant.id
      )}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({ moveOutDate: '2026-11-01' }),
      }
    );
    const softDeletedInDb = await prisma.roomOccupant.findUnique({
      where: { id: addedOccupant.id },
    });
    const deactAuditLog = await prisma.consoleAuditLog.findFirst({
      where: { entityId: addedOccupant.id, action: 'DEACTIVATE_OCCUPANT' },
    });
    const softDeletePass =
      softDeleteResp.status === 200 &&
      softDeleteResp.json?.softDeleted === true &&
      softDeletedInDb !== null &&
      softDeletedInDb.isActive === false &&
      softDeletedInDb.moveOutDate === '2026-11-01' &&
      deactAuditLog !== null;

    testResults.checks.softDeleteRoomOccupants = {
      pass: softDeletePass,
      status: softDeleteResp.status,
      isActive: softDeletedInDb?.isActive,
      moveOutDate: softDeletedInDb?.moveOutDate,
      auditAction: deactAuditLog?.action,
    };
    console.log(
      `  -> Soft Delete Room Occupants (P1): ${softDeletePass ? 'PASS' : 'FAIL'}`
    );

    // 8.2 Direct Contract Creation: Unpaid Deposit, Draft Status, Pre-handover State (P0)
    console.log('  Testing 8.2: Direct contract creation without payment proof (P0)...');
    const directContractResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/contracts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          roomId: directRoom.id,
          tenantId: directTenant.id,
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          monthlyRentVnd: 4500000,
          depositVnd: 4500000,
          isDepositPaid: false, // Default: no payment proof
        }),
      }
    );
    const directContract = directContractResp.json?.contract;
    const directRoomAfter = await prisma.consoleRoom.findUnique({
      where: { id: directRoom.id },
    });
    const directDepositInDb = await prisma.deposit.findFirst({
      where: { contractId: directContract?.id, depositType: 'CONTRACT' },
    });
    const directLedgerCount = await prisma.ledgerEntry.count({
      where: {
        description: { contains: directContract?.contractCode || 'NON_EXISTENT' },
        entryType: 'INCOME',
      },
    });

    const directContractProofPass =
      directContractResp.status === 201 &&
      directContract?.status === 'DRAFT' &&
      directRoomAfter?.occupancyStatus === 'RESERVED' &&
      directDepositInDb !== null &&
      directDepositInDb.amountVnd === 4500000n &&
      directDepositInDb.paidAmountVnd === 0n &&
      directDepositInDb.paymentStatus === 'PENDING' &&
      directLedgerCount === 0;

    testResults.checks.directContractDepositProof = {
      pass: directContractProofPass,
      status: directContractResp.status,
      contractStatus: directContract?.status,
      roomOccupancy: directRoomAfter?.occupancyStatus,
      depositPaymentStatus: directDepositInDb?.paymentStatus,
      depositPaidAmountVnd: Number(directDepositInDb?.paidAmountVnd || 0),
      incomeLedgerEntries: directLedgerCount,
    };
    console.log(
      `  -> Direct Contract Deposit Proof (P0): ${directContractProofPass ? 'PASS' : 'FAIL'}`
    );

    // 8.3 Booking Hold Without Payment (Zero Ledger Entry)
    console.log('  Testing 8.3: Booking hold without payment (zero ledger entry)...');
    const unpaidResvResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          roomId: lifeRoom1.id,
          customerName: 'Trần Thị Thu Thảo',
          customerPhone: '0919988776',
          holdAmountVnd: 2000000,
          expectedMoveIn: '2026-11-15',
          holdDays: 7,
          paymentConfirmed: false,
          notes: 'Giữ chỗ chưa chuyển khoản',
        }),
      }
    );
    const unpaidResv = unpaidResvResp.json?.reservation;
    const unpaidDep = unpaidResvResp.json?.deposit;
    const unpaidLedgerCount = await prisma.ledgerEntry.count({
      where: {
        description: { contains: unpaidResv?.reservationCode || 'NON_EXISTENT' },
      },
    });
    const unpaidHoldPass =
      unpaidResvResp.status === 201 &&
      unpaidResv?.status === 'PENDING' &&
      unpaidDep?.paymentStatus === 'PENDING' &&
      unpaidDep?.paidAmountVnd === 0 &&
      unpaidLedgerCount === 0;

    // 8.4 Confirm Payment with Idempotency Test (P0)
    console.log('  Testing 8.4: Confirm payment idempotency & row locking (P0)...');
    const confirmPaymentResp1 = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        unpaidResv.id
      )}/confirm-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          paymentMethod: 'BANK_TRANSFER',
          notes: 'Khách đã chuyển khoản thành công',
        }),
      }
    );

    // Second call to test idempotency
    const confirmPaymentResp2 = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        unpaidResv.id
      )}/confirm-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          paymentMethod: 'BANK_TRANSFER',
          notes: 'Gọi lại lần 2 để kiểm thử idempotency',
        }),
      }
    );

    const paidLedgerCount = await prisma.ledgerEntry.count({
      where: {
        description: { contains: unpaidResv.reservationCode },
        entryType: 'INCOME',
      },
    });
    const depositRowsCount = await prisma.deposit.count({
      where: { reservationId: unpaidResv.id },
    });

    const confirmPaymentPass =
      confirmPaymentResp1.status === 200 &&
      confirmPaymentResp1.json?.reservation?.status === 'CONFIRMED' &&
      confirmPaymentResp1.json?.deposit?.paymentStatus === 'PAID' &&
      confirmPaymentResp2.status === 200 &&
      confirmPaymentResp2.json?.reservation?.status === 'CONFIRMED' &&
      paidLedgerCount === 1 && // Strictly exactly 1! Zero duplicate income entries!
      depositRowsCount === 1; // Strictly exactly 1! Zero duplicate deposit rows!

    testResults.checks.paymentConfirmationIdempotency = {
      pass: confirmPaymentPass,
      statusCall1: confirmPaymentResp1.status,
      statusCall2: confirmPaymentResp2.status,
      incomeLedgerEntries: paidLedgerCount,
      depositRowsInDb: depositRowsCount,
    };
    console.log(
      `  -> Payment Confirmation Idempotency (P0): ${confirmPaymentPass ? 'PASS' : 'FAIL'} (Ledger: ${paidLedgerCount}, Deposits: ${depositRowsCount})`
    );

    // 8.5 Strict Cancellation Allocation Invariant (P0)
    console.log('  Testing 8.5: Strict cancellation allocation invariant (P0)...');
    // First: unbalanced allocation attempt (sum = 1M + 250k + 250k = 1.5M != 2.0M paid deposit)
    const unbalancedCancelResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        unpaidResv.id
      )}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          reason: 'Hủy thử nghiệm phân bổ không cân bằng',
          refundAmountVnd: 1000000,
          deductionAmountVnd: 250000,
          forfeitAmountVnd: 250000,
        }),
      }
    );
    const unbalancedBlocked =
      unbalancedCancelResp.status === 422 &&
      unbalancedCancelResp.json?.errorCode === 'INVALID_CANCELLATION_ALLOCATION';

    // Second: balanced allocation (1.5M + 250k + 250k = 2.0M)
    const cancelResvResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        unpaidResv.id
      )}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          reason: 'Khách hủy giữ chỗ',
          refundAmountVnd: 1500000,
          deductionAmountVnd: 250000,
          forfeitAmountVnd: 250000,
        }),
      }
    );
    const roomAfterCancel = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const depAfterCancel = await prisma.deposit.findUnique({
      where: { id: unpaidDep.id },
    });
    const cancelExpenseCount = await prisma.ledgerEntry.count({
      where: {
        description: { contains: unpaidResv.reservationCode },
        entryType: 'EXPENSE',
      },
    });

    const resvCancelledPass =
      unbalancedBlocked &&
      cancelResvResp.status === 200 &&
      roomAfterCancel?.occupancyStatus === 'AVAILABLE' &&
      (depAfterCancel?.status === 'REFUNDED' || depAfterCancel?.status === 'PARTIALLY_REFUNDED') &&
      cancelExpenseCount === 1;

    testResults.checks.strictCancellationAllocation = {
      pass: resvCancelledPass,
      unbalancedBlocked,
      unbalancedStatusCode: unbalancedCancelResp.status,
      unbalancedErrorCode: unbalancedCancelResp.json?.errorCode,
      balancedStatusCode: cancelResvResp.status,
      refundExpenseRecorded: cancelExpenseCount === 1,
    };
    console.log(
      `  -> Strict Cancellation Allocation (P0): ${resvCancelledPass ? 'PASS' : 'FAIL'} (Unbalanced: ${unbalancedCancelResp.status}, Balanced: ${cancelResvResp.status})`
    );

    // 8.6 Conversion Math Case B <= C & Multi-tenant Isolation Check (P0)
    console.log('  Testing 8.6: Conversion math B <= C and Multi-tenant Isolation (P0)...');
    const resv2Resp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          roomId: lifeRoom1.id,
          customerName: 'Hoàng Văn Nam',
          customerPhone: '0977112233',
          holdAmountVnd: 2000000,
          paymentConfirmed: true,
          expectedMoveIn: '2026-11-01',
          holdDays: 5,
        }),
      }
    );
    const resv2 = resv2Resp.json?.reservation;

    // Cross-tenant Isolation Attack Attempt: Pass tenantId belonging to secondOrg
    const crossTenantConvertResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        resv2.id
      )}/convert-to-contract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          tenantId: secondOrgTenant.id, // Alien tenant from other org!
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          monthlyRentVnd: 5000000,
          depositVnd: 5000000,
        }),
      }
    );
    const multiTenantConvertBlocked =
      crossTenantConvertResp.status === 404 &&
      crossTenantConvertResp.json?.errorCode === 'TENANT_NOT_FOUND';

    testResults.checks.multiTenantIsolationCheck = {
      pass: multiTenantConvertBlocked,
      status: crossTenantConvertResp.status,
      errorCode: crossTenantConvertResp.json?.errorCode,
    };
    console.log(
      `  -> Multi-tenant Isolation in Conversion (P0): ${multiTenantConvertBlocked ? 'PASS' : 'FAIL'}`
    );

    // Legitimate conversion (B = 2M <= C = 5M)
    const convertResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        resv2.id
      )}/convert-to-contract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          monthlyRentVnd: 5000000,
          depositVnd: 5000000,
          coOccupants: [
            {
              fullName: 'Hoàng Thị Em',
              phone: '0977112234',
              relationToPrimary: 'FAMILY',
            },
          ],
        }),
      }
    );
    const contract = convertResp.json?.contract;
    const roomAfterConvert = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const resvAfterConvert = await prisma.roomReservation.findUnique({
      where: { id: resv2.id },
    });

    const origBookingDep = await prisma.deposit.findFirst({
      where: { reservationId: resv2.id, depositType: 'BOOKING' },
    });
    const newContractDep = await prisma.deposit.findFirst({
      where: { contractId: contract?.id, depositType: 'CONTRACT' },
    });

    // Verify first combined invoice: Rent (5M) + Deposit Due (5M - 2M = 3M) = 8M
    const firstInvoice = await prisma.invoice.findFirst({
      where: { contractId: contract?.id },
    });

    const convertShortagePass =
      convertResp.status === 201 &&
      contract?.status === 'DRAFT' && // Pre-handover status is DRAFT
      roomAfterConvert?.occupancyStatus === 'RESERVED' && // Pre-handover room is RESERVED
      resvAfterConvert?.status === 'CONVERTED' &&
      origBookingDep?.amountVnd === 2000000n &&
      origBookingDep?.status === 'APPLIED_TO_CONTRACT' &&
      origBookingDep?.paymentStatus === 'TRANSFERRED' &&
      newContractDep?.amountVnd === 5000000n && // Full required deposit C stored!
      newContractDep?.paidAmountVnd === 2000000n && // Transferred amount B stored!
      newContractDep?.paymentStatus === 'PARTIALLY_PAID' && // B < C is PARTIALLY_PAID!
      firstInvoice?.totalAmountVnd === 8000000n;

    // 8.7 Conversion Math Case B > C with S > R and Advance Rent Credit (P0)
    console.log('  Testing 8.7: Conversion math B > C (S > R) with ADVANCE_RENT preservation (P0)...');
    const surplusResvResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          roomId: lifeRoom3.id,
          customerName: 'Đặng Tuấn Anh',
          customerPhone: '0906667777',
          holdAmountVnd: 12000000, // B = 12M!
          paymentConfirmed: true,
          expectedMoveIn: '2026-11-01',
          holdDays: 5,
        }),
      }
    );
    const surplusResv = surplusResvResp.json?.reservation;

    const surplusConvertResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        surplusResv.id
      )}/convert-to-contract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          monthlyRentVnd: 5000000, // R = 5M
          depositVnd: 5000000, // C = 5M
          surplusAction: 'RENT_CREDIT',
        }),
      }
    );
    const surplusContract = surplusConvertResp.json?.contract;
    const surplusInvoice = await prisma.invoice.findFirst({
      where: { contractId: surplusContract?.id },
    });
    // B = 12M, C = 5M -> Surplus S = 7M.
    // Applied to month 1 rent: min(7M, 5M) = 5M -> first month invoice due = 0!
    // Remaining surplus credit S - R = 7M - 5M = 2M stored in ADVANCE_RENT row!
    const advanceRentDep = await prisma.deposit.findFirst({
      where: { contractId: surplusContract?.id, depositType: 'ADVANCE_RENT' },
    });

    const convertSurplusPass =
      surplusConvertResp.status === 201 &&
      surplusInvoice?.totalAmountVnd === 0n &&
      advanceRentDep !== null &&
      advanceRentDep.amountVnd === 2000000n &&
      advanceRentDep.paidAmountVnd === 2000000n &&
      advanceRentDep.paymentStatus === 'PAID';

    testResults.checks.accurateContractDepositTracking = {
      pass: convertShortagePass && convertSurplusPass,
      shortageMath: {
        pass: convertShortagePass,
        contractStatus: contract?.status,
        roomStatus: roomAfterConvert?.occupancyStatus,
        contractDepositAmountVnd: Number(newContractDep?.amountVnd || 0),
        contractDepositPaidAmountVnd: Number(newContractDep?.paidAmountVnd || 0),
        contractDepositPaymentStatus: newContractDep?.paymentStatus,
        firstInvoiceTotalVnd: Number(firstInvoice?.totalAmountVnd || 0),
      },
      surplusMath: {
        pass: convertSurplusPass,
        firstInvoiceTotalVnd: Number(surplusInvoice?.totalAmountVnd || 0),
        advanceRentAmountVnd: Number(advanceRentDep?.amountVnd || 0),
        advanceRentPaymentStatus: advanceRentDep?.paymentStatus,
      },
    };
    console.log(
      `  -> Accurate Contract Deposit Tracking (P0): ${testResults.checks.accurateContractDepositTracking.pass ? 'PASS' : 'FAIL'}`
    );

    // 8.8 Contract Handover Baseline Readings & Transition to ACTIVE/OCCUPIED (P0)
    console.log('  Testing 8.8: Contract handover with baseline readings & activation (P0)...');
    const handoverResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/contracts/${encodeURIComponent(
        contract.id
      )}/handover`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          handoverMeterKwh: 125.5,
          handoverWaterM3: 35.0,
          notes: 'Bàn giao chìa khóa và kiểm tra công tơ thực tế',
        }),
      }
    );
    const contractAfterHandover = await prisma.contract.findUnique({
      where: { id: contract.id },
    });
    const roomAfterHandover = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const handoverPass =
      handoverResp.status === 200 &&
      contractAfterHandover?.status === 'ACTIVE' &&
      roomAfterHandover?.occupancyStatus === 'OCCUPIED' &&
      contractAfterHandover?.handoverMeterKwh === 125.5 &&
      contractAfterHandover?.handoverWaterM3 === 35.0;

    // 8.9 Deposit Partial Refund with Deduction
    const depRefundResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/deposits/${encodeURIComponent(
        newContractDep.id
      )}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          refundAmountVnd: 1500000,
          deductionAmountVnd: 500000,
          deductionReason: 'Khấu trừ phí vệ sinh đệm',
        }),
      }
    );
    const depRefundPass =
      depRefundResp.status === 200 &&
      depRefundResp.json?.deposit?.status === 'REFUNDED';

    // 8.10 Contract Extension
    const extendResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/contracts/${encodeURIComponent(
        contract.id
      )}/extend`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          newEndDate: '2028-04-30',
          newMonthlyRentVnd: 5200000,
          notes: 'Gia hạn thêm 6 tháng',
        }),
      }
    );
    const extendPass =
      extendResp.status === 200 &&
      extendResp.json?.contract?.status === 'EXTENDED' &&
      extendResp.json?.contract?.endDate === '2028-04-30';

    // 8.11 Transfer Room
    const transferResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/contracts/${encodeURIComponent(
        contract.id
      )}/transfer-room`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          newRoomId: lifeRoom2.id,
          newMonthlyRentVnd: 4800000,
        }),
      }
    );
    const oldRoomAfterTransfer = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const newRoomAfterTransfer = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom2.id },
    });
    const transferPass =
      transferResp.status === 200 &&
      oldRoomAfterTransfer?.occupancyStatus === 'AVAILABLE' &&
      newRoomAfterTransfer?.occupancyStatus === 'OCCUPIED' &&
      transferResp.json?.contract?.roomId === lifeRoom2.id;

    // 8.12 Terminate Contract
    const terminateResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/contracts/${encodeURIComponent(
        contract.id
      )}/terminate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          reason: 'Khách mua nhà riêng, trả phòng trước hạn',
          roomNextStatus: 'AVAILABLE',
        }),
      }
    );
    const roomAfterTerminate = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom2.id },
    });
    const terminatePass =
      terminateResp.status === 200 &&
      terminateResp.json?.contract?.status === 'TERMINATED' &&
      roomAfterTerminate?.occupancyStatus === 'AVAILABLE';

    testResults.checks.c3aLifecycleStateMachines = {
      pass:
        tenantDecoupledPass &&
        roomOccupantsPass &&
        softDeletePass &&
        directContractProofPass &&
        unpaidHoldPass &&
        confirmPaymentPass &&
        resvCancelledPass &&
        convertShortagePass &&
        convertSurplusPass &&
        handoverPass &&
        depRefundPass &&
        extendPass &&
        transferPass &&
        terminatePass,
      tenantDecoupled: tenantDecoupledPass,
      roomOccupants: roomOccupantsPass,
      occupantSoftDeleted: softDeletePass,
      directContractProof: directContractProofPass,
      unpaidHoldZeroLedger: unpaidHoldPass,
      confirmPaymentLedgerIdempotent: confirmPaymentPass,
      cancellationInvariant: resvCancelledPass,
      conversionShortageMath: convertShortagePass,
      conversionSurplusMath: convertSurplusPass,
      contractHandoverMeters: handoverPass,
      depositRefundAndDeduction: depRefundPass,
      contractExtended: extendPass,
      contractTransferred: transferPass,
      contractTerminated: terminatePass,
    };
    console.log(
      `-> C3A State Machines: ${testResults.checks.c3aLifecycleStateMachines.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 9. CHECK 6: C3B HUNONIC CLOUD METERING & WATER BILLING
    console.log('[Step 9] Testing C3B Hunonic Cloud Adapter & Water Billing...');

    // Unit test: Fail-closed production isolation
    let failClosedPass = false;
    try {
      const prodClient = new HunonicCloudClient();
      const origAllowMock = process.env.HUNONIC_ALLOW_MOCK;
      const origMockMode = process.env.HUNONIC_MOCK_MODE;
      const origNodeEnv = process.env.NODE_ENV;
      process.env.HUNONIC_ALLOW_MOCK = 'false';
      process.env.HUNONIC_MOCK_MODE = 'false';
      process.env.NODE_ENV = 'production';
      try {
        await prodClient.login('0987654321', '');
      } finally {
        process.env.HUNONIC_ALLOW_MOCK = origAllowMock;
        process.env.HUNONIC_MOCK_MODE = origMockMode;
        process.env.NODE_ENV = origNodeEnv;
      }
    } catch (err) {
      failClosedPass = err.message.includes('Mật khẩu tài khoản Hunonic Cloud không được để trống khi vận hành thực tế');
    }

    // Hunonic Meter Sync API
    const hunonicSyncResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/hunonic/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
      }
    );
    const hunonicSyncPass =
      hunonicSyncResp.status === 200 &&
      hunonicSyncResp.json?.ok === true &&
      typeof hunonicSyncResp.json?.syncedCount === 'number';

    // Verify source is 'MOCK' or 'HUNONIC_VERIFIED' in DB
    const latestSyncReading = await prisma.meterReading.findFirst({
      where: {
        recordedByActor: { in: ['HUNONIC_MOCK_ADAPTER', 'HUNONIC_CLOUD_AGENT'] },
      },
      orderBy: { recordedAt: 'desc' },
    });
    const mockReadingSourcePass =
      latestSyncReading !== null &&
      ['MOCK', 'HUNONIC_VERIFIED'].includes(latestSyncReading.source);

    // Manual meter reading override
    const manualReadingResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/meters/${encodeURIComponent(
        lifeRoom1.id
      )}/manual-reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          readingKwh: 245.5,
          overrideReason: 'Chốt chỉ số bàn giao mặt bằng',
        }),
      }
    );
    const manualReadingDb = await prisma.meterReading.findFirst({
      where: {
        overrideReason: 'Chốt chỉ số bàn giao mặt bằng',
      },
      orderBy: { recordedAt: 'desc' },
    });
    const manualPass =
      manualReadingResp.status === 200 &&
      manualReadingResp.json?.meter?.cumulativeKwh === 245.5 &&
      manualReadingDb?.source === 'MANUAL_APPROVED';

    // Meter replacement endpoint
    const replaceMeterResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/meters/${encodeURIComponent(
        lifeRoom1.id
      )}/replace`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          newMeterSerial: 'HUNONIC-GEN2-9988',
          newHunonicDeviceId: 'HNC-9988',
          initialKwh: 0,
          reason: 'Nâng cấp công tơ điện tử Wi-Fi thế hệ mới',
        }),
      }
    );
    const replaceMeterDb = await prisma.meterReading.findFirst({
      where: {
        overrideReason: { contains: 'HUNONIC-GEN2-9988' },
      },
      orderBy: { recordedAt: 'desc' },
    });
    const replacePass =
      replaceMeterResp.status === 200 &&
      replaceMeterResp.json?.meter?.meterSerial === 'HUNONIC-GEN2-9988' &&
      replaceMeterDb?.source === 'MANUAL_APPROVED';

    // Strict kWh validation checks
    const valNormal = validateKwhReading(100, 150);
    const valNegative = validateKwhReading(100, 80);
    const valExcessive = validateKwhReading(100, 2500);
    const valReplaced = validateKwhReading(null, 15, true);

    const kwhValidationPass =
      valNormal.isValid &&
      !valNegative.isValid &&
      valNegative.errorCode === 'NEGATIVE_DELTA' &&
      !valExcessive.isValid &&
      valExcessive.errorCode === 'EXCESSIVE_DELTA' &&
      valReplaced.isValid;

    // 3 Water Calculation Methods
    const waterM3 = calculateWaterBill({
      method: 'PER_M3',
      rateVnd: 15000,
      consumptionM3: 15,
    });
    const waterPerson = calculateWaterBill({
      method: 'PER_PERSON',
      rateVnd: 100000,
      occupantsCount: 2,
    });
    const waterFixed = calculateWaterBill({
      method: 'FIXED_PER_ROOM',
      rateVnd: 150000,
    });

    const waterCalcPass =
      waterM3.totalVnd === 225000 &&
      waterPerson.totalVnd === 200000 &&
      waterFixed.totalVnd === 150000;

    testResults.checks.c3bHunonicAndWater = {
      pass:
        failClosedPass &&
        hunonicSyncPass &&
        mockReadingSourcePass &&
        manualPass &&
        replacePass &&
        kwhValidationPass &&
        waterCalcPass,
      failClosedIsolation: failClosedPass,
      hunonicSync: hunonicSyncPass,
      mockReadingSource: mockReadingSourcePass,
      manualReading: manualPass,
      meterReplacement: replacePass,
      kwhValidation: kwhValidationPass,
      water3Methods: waterCalcPass,
    };
    console.log(
      `-> C3B Hunonic & Water: ${testResults.checks.c3bHunonicAndWater.pass ? 'PASS' : 'FAIL'
      } (Fail-closed: ${failClosedPass ? 'PASS' : 'FAIL'}, MockSource: ${mockReadingSourcePass ? 'PASS' : 'FAIL'}, ManualApproved: ${manualPass ? 'PASS' : 'FAIL'}, Water: ${waterCalcPass ? 'PASS' : 'FAIL'})`
    );

    // 10. CHECK 8: BROWSER CDP SCREENSHOTS & UI VERIFICATION
    console.log('[Step 10] Taking Headless Browser UI Screenshots via CDP...');
    const browserBin = findBrowserExecutable();
    const cdpPort = 9226;
    const userDataDir = path.join(
      process.cwd(),
      '.tmp_cdp_profile_c3_' + Date.now()
    );
    fs.mkdirSync(userDataDir, { recursive: true });

    browserProc = spawn(
      browserBin,
      [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
          (r) => r.json()
        );
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch { }
    }
    if (!wsUrl) throw new Error('Cannot connect to Chromium CDP port.');

    const cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    async function setControlledInput(selector, value) {
      await cdp.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Input not found: ' + ${JSON.stringify(selector)});
        el.focus();
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ${JSON.stringify(String(value))});
        else el.value = ${JSON.stringify(String(value))};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    }

    async function waitForSelector(selector, maxTries = 40, intervalMs = 250) {
      for (let i = 0; i < maxTries; i++) {
        const found = await cdp
          .eval(`document.querySelector(${JSON.stringify(selector)}) !== null`)
          .catch(() => false);
        if (found) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return false;
    }

    // 10.0 Log into Console UI as Admin
    console.log('  Logging into Console UI via Login Page...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${CONSOLE_URL}/login` });
    const loginEmailFound = await waitForSelector('[data-testid="console-login-email"]', 40, 250);
    if (!loginEmailFound) throw new Error('Timeout waiting for console login email input');
    await setControlledInput('[data-testid="console-login-email"]', 'admin@adhome.vn');
    await setControlledInput('[data-testid="console-login-password"]', ephemeralAdminPassword);
    await cdp.eval(`document.querySelector('[data-testid="console-login-submit"]')?.click()`);
    const headerFound = await waitForSelector('[data-testid="console-desktop-header"]', 50, 250);
    if (!headerFound) throw new Error('Timeout waiting for console desktop header after login');
    console.log('  Console UI authenticated successfully as Admin.');

    async function captureScreen(
      url,
      width,
      height,
      filename,
      readySelector,
      preWaitAction,
      waitForSelectorAfterAction
    ) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 768,
      });

      await cdp.send('Page.navigate', { url });

      if (preWaitAction) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const executed = await cdp
            .eval(`(() => {
              try {
                ${preWaitAction};
                return true;
              } catch {
                return false;
              }
            })()`)
            .catch(() => false);
          if (executed) break;
        }
      }

      let readyFound = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const ok = await cdp
          .eval(`document.querySelector('${readySelector}') !== null`)
          .catch(() => false);
        if (ok) {
          readyFound = true;
          break;
        }
      }
      if (!readyFound) {
        throw new Error(`Timeout waiting for selector: ${readySelector} on ${url}`);
      }

      if (waitForSelectorAfterAction) {
        let afterActionFound = false;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const ok = await cdp
            .eval(`document.querySelector('${waitForSelectorAfterAction}') !== null`)
            .catch(() => false);
          if (ok) {
            afterActionFound = true;
            break;
          }
        }
        if (!afterActionFound) {
          throw new Error(`Timeout waiting for afterAction selector: ${waitForSelectorAfterAction}`);
        }
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }

      // Allow typography, CSS transitions, and SVG charts to settle
      await new Promise((r) => setTimeout(r, 600));

      const outAppPath = path.join(ARTIFACT_DIR, filename);
      const outEvidencePath = path.join(EVIDENCE_DIR, filename);
      await cdp.screenshot([outAppPath, outEvidencePath]);
      testResults.evidenceFiles.push(filename);
      console.log(`  Captured: ${filename} (${width}x${height})`);
    }

    // Capture 1: Contracts Workspace (1440x900) - Shows Status Filters, Draft Contract & "Bàn giao phòng" button
    await captureScreen(
      `${CONSOLE_URL}/?module=contracts`,
      1440,
      900,
      'console_v2_1440_contracts_workspace.png',
      '[data-testid="console-module-workspace-contracts"]',
      `(() => {
        if (window.__adhome_setActiveModule) window.__adhome_setActiveModule('contracts');
      })()`,
      '[data-testid="btn-open-create-contract"]'
    );

    // Capture 2: Handover Modal with Baseline Meter Inputs (1440x900)
    console.log('  Opening Handover Modal for DRAFT contract...');
    await cdp.eval(`(() => {
      const btn = document.querySelector('[data-testid="btn-open-handover"]') ||
                  document.querySelector('button[data-testid^="btn-open-handover-"]');
      if (btn) btn.click();
    })()`);
    const handoverModalFound = await waitForSelector('[data-testid="contract-handover-modal"]', 40, 250);
    if (handoverModalFound) {
      await setControlledInput('input[placeholder*="105.5"]', 125.5);
      await setControlledInput('input[placeholder*="12.0"]', 35.0);
      await new Promise((r) => setTimeout(r, 600));
      await cdp.screenshot([
        path.join(ARTIFACT_DIR, 'console_v2_1440_contract_handover_modal.png'),
        path.join(EVIDENCE_DIR, 'console_v2_1440_contract_handover_modal.png'),
      ]);
      testResults.evidenceFiles.push('console_v2_1440_contract_handover_modal.png');
      console.log('  Captured: console_v2_1440_contract_handover_modal.png (1440x900)');
      // Close handover modal cleanly
      await cdp.eval(`(() => {
        const modal = document.querySelector('[data-testid="contract-handover-modal"]');
        const cancelBtn = modal?.querySelector('button[type="button"]');
        if (cancelBtn) cancelBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Capture 3: Contract Creation Wizard Modal with Dynamic Vietnam Dates (1440x900)
    console.log('  Opening Contract Creation Wizard Modal...');
    await cdp.eval(`(() => {
      const btn = document.querySelector('[data-testid="btn-open-create-contract"]');
      if (btn) btn.click();
    })()`);
    const wizardModalFound = await waitForSelector('[data-testid="contract-creation-wizard-modal"]', 40, 250);
    if (wizardModalFound) {
      // Advance wizard to Step 4/5
      await cdp.eval(`(() => {
        const nextBtn = document.querySelector('[data-testid="wizard-btn-next"]');
        if (nextBtn) {
          nextBtn.click();
          setTimeout(() => {
            const btn2 = document.querySelector('[data-testid="wizard-btn-next"]');
            if (btn2) btn2.click();
            setTimeout(() => {
              const btn3 = document.querySelector('[data-testid="wizard-btn-next"]');
              if (btn3) btn3.click();
            }, 150);
          }, 150);
        }
      })()`);
      await new Promise((r) => setTimeout(r, 800));
      await cdp.screenshot([
        path.join(ARTIFACT_DIR, 'console_v2_1440_contract_modal_dynamic_dates.png'),
        path.join(EVIDENCE_DIR, 'console_v2_1440_contract_modal_dynamic_dates.png'),
      ]);
      testResults.evidenceFiles.push('console_v2_1440_contract_modal_dynamic_dates.png');
      console.log('  Captured: console_v2_1440_contract_modal_dynamic_dates.png (1440x900)');
      // Close wizard modal cleanly
      await cdp.eval(`(() => {
        const modal = document.querySelector('[data-testid="contract-creation-wizard-modal"]');
        const closeBtn = modal?.querySelector('button');
        if (closeBtn) closeBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Capture 4: Deposits & Reservations Workspace (1440x900) - Vietnamese badges & paidAmountVnd
    await captureScreen(
      `${CONSOLE_URL}/?module=deposits`,
      1440,
      900,
      'console_v2_1440_deposits_workspace.png',
      '[data-testid="console-module-workspace-deposits"]',
      `(() => {
        if (window.__adhome_setActiveModule) window.__adhome_setActiveModule('deposits');
      })()`
    );

    // Capture 5: Settlements & Hunonic Meters Workspace (1440x900)
    await captureScreen(
      `${CONSOLE_URL}/?module=settlements`,
      1440,
      900,
      'console_v2_1440_settlements_hunonic.png',
      '[data-testid="console-module-workspace-settlements"]',
      `(() => {
        if (window.__adhome_setActiveModule) window.__adhome_setActiveModule('settlements');
      })()`
    );

    // Capture 6: Mobile Bottom Nav & Contracts Cards View (390x844)
    await captureScreen(
      `${CONSOLE_URL}/?module=contracts&mode=mobile`,
      390,
      844,
      'console_v2_390x844_contracts_mobile.png',
      '[data-testid="console-mobile-bottom-nav"]',
      `(() => {
        if (window.__adhome_setActiveModule) window.__adhome_setActiveModule('contracts');
      })()`
    );

    cdp.close();

    // 10.1 UI EVIDENCE HASH & DISTINCTNESS VERIFICATION
    console.log('\n[Step 10.1] Computing SHA-256 checksums and verifying distinctness...');
    const screenshotFiles = [
      'console_v2_1440_contracts_workspace.png',
      'console_v2_1440_contract_handover_modal.png',
      'console_v2_1440_contract_modal_dynamic_dates.png',
      'console_v2_1440_deposits_workspace.png',
      'console_v2_1440_settlements_hunonic.png',
      'console_v2_390x844_contracts_mobile.png',
    ];

    const imageHashes = [];
    for (const f of screenshotFiles) {
      const artPath = path.join(ARTIFACT_DIR, f);
      if (!fs.existsSync(artPath)) {
        throw new Error(`Screenshot file missing: ${f}`);
      }
      const buf = fs.readFileSync(artPath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      imageHashes.push({
        filename: f,
        sizeBytes: buf.length,
        sha256,
      });
      console.log(`  - ${f}: ${sha256} (${buf.length} bytes)`);
    }

    const uniqueShaSet = new Set(imageHashes.map((item) => item.sha256));
    const allDistinct = uniqueShaSet.size === screenshotFiles.length;
    const allSufficientSize = imageHashes.every((item) => item.sizeBytes > 20000);

    testResults.checks.evidenceScreenshotsValid = {
      pass: allDistinct && allSufficientSize,
      totalScreenshots: screenshotFiles.length,
      distinctScreenshots: uniqueShaSet.size,
      allDistinct,
      allSufficientSize,
      hashes: imageHashes,
    };
    console.log(
      `-> UI Evidence Distinctness: ${testResults.checks.evidenceScreenshotsValid.pass ? 'PASS' : 'FAIL'
      } (${uniqueShaSet.size} unique hashes out of ${screenshotFiles.length})`
    );

    if (!allDistinct) {
      throw new Error(
        `EVIDENCE REJECTION: Duplicate screenshot hashes detected! All UI evidence screenshots must represent distinct module views.`
      );
    }

    // 11. FINAL VERDICT COMPUTATION
    const allChecksPassed = Object.values(testResults.checks).every(
      (c) => c.pass === true
    );
    testResults.verdict = allChecksPassed ? 'LOCAL_GATE_PASSED' : 'FAILED';
    testResults.finishedAt = new Date().toISOString();

    const outJson = JSON.stringify(testResults, null, 2);
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'console_v2_c3_verification.json'),
      outJson
    );
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'console_v2_c3_verification.json'),
      outJson
    );

    console.log('\n======================================================');
    console.log(`FINAL VERDICT: ${testResults.verdict}`);
    console.log(`REPORTING TIER: ${testResults.reportingTier}`);
    console.log(`ALL CHECKS: ${allChecksPassed ? '100% PASSED' : 'FAILURES DETECTED'}`);
    console.log('======================================================');

    if (!allChecksPassed) {
      process.exit(1);
    }
  } finally {
    console.log('\n[Cleanup] Cleaning up test fixtures in PostgreSQL...');
    try {
      await cleanTestFixtures(prisma);
      console.log('  Test fixtures cleaned up successfully.');
    } catch (cleanErr) {
      console.error('  Failed to clean test fixtures:', cleanErr);
    }
    console.log('[Cleanup] Terminating preview servers & browser...');
    if (browserProc) {
      try {
        await killProcessTreeWindows(browserProc);
      } catch { }
    }
    if (landingProc) {
      try {
        await killProcessTreeWindows(landingProc);
      } catch { }
    }
    if (consoleProc) {
      try {
        await killProcessTreeWindows(consoleProc);
      } catch { }
    }
  }
}

main()
  .catch((err) => {
    console.error('FATAL VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
