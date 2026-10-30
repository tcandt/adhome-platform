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
    } catch {}
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
      } catch {}
    }
  }
}

async function fetchHttp(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

async function main() {
  console.log('=== ADHOME CONSOLE V2: C2 HARDENING, C3A & C3B VERIFICATION ===');
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
      `-> Multi-tenant login audit isolation: ${
        testResults.checks.multiTenantAuditIsolation.pass ? 'PASS' : 'FAIL'
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
      `-> AES-256-GCM Credentials Vault: ${
        testResults.checks.credentialsCryptoVault.pass ? 'PASS' : 'FAIL'
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
      `-> finance.write Permission Separation: ${
        testResults.checks.financeWritePermissionSeparation.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 7. CHECK 4: CONCURRENCY ROW-LEVEL LOCK RACE CONDITION (P0)
    console.log('[Step 7] Testing Concurrency Row-Level Lock on Contract Creation...');
    let raceRoom = await prisma.consoleRoom.findFirst({
      where: {
        orgId,
        buildingId: bldLk.id,
        occupancyStatus: 'AVAILABLE',
        contracts: { none: { status: { in: ['ACTIVE', 'EXPIRING'] } } },
      },
    });
    if (!raceRoom) {
      raceRoom = await prisma.consoleRoom.create({
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
    }

    let testTenant = await prisma.tenant.findFirst({
      where: { orgId, normalizedPhone: '0988776655' },
    });
    if (!testTenant) {
      testTenant = await prisma.tenant.create({
        data: {
          orgId,
          fullName: 'Khách Hàng Race Concurrency',
          phone: '0988776655',
          normalizedPhone: '0988776655',
          primaryBuildingId: bldLk.id,
        },
      });
    }

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
      where: { roomId: raceRoom.id, status: { in: ['ACTIVE', 'EXPIRING'] } },
    });

    testResults.checks.concurrencyRowLevelLock = {
      pass: exactlyOne201 && correctErrorCode && activeContractsInDb === 1,
      statusA: reqA.status,
      statusB: reqB.status,
      errorCode409: conflictResp?.errorCode,
      activeContractsInDb,
    };
    console.log(
      `-> Concurrency Row-Level Lock: ${
        testResults.checks.concurrencyRowLevelLock.pass ? 'PASS' : 'FAIL'
      } (ReqA: ${reqA.status}, ReqB: ${reqB.status}, DB contracts: ${activeContractsInDb})`
    );

    // 8. CHECK 5: C3A FULL LIFECYCLE STATE MACHINES
    console.log('[Step 8] Testing C3A Lifecycle State Machines...');
    const lifeRoom1 = await prisma.consoleRoom.create({
      data: {
        orgId,
        buildingId: bldLk.id,
        floorId: bldLkFloor.id,
        code: `C3A-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        title: 'Phòng Test C3A Lifecycle 1',
        area: 30,
        listPriceVnd: 4200000n,
        occupancyStatus: 'AVAILABLE',
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
      },
    });

    // Create Reservation
    const createResvResp = await fetchHttp(
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
          notes: 'Giữ phòng view đẹp',
        }),
      }
    );
    const resvData = createResvResp.json?.reservation;
    const depData = createResvResp.json?.deposit;

    const roomAfterResv = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const resvCreatedPass =
      createResvResp.status === 201 &&
      resvData?.status === 'CONFIRMED' &&
      depData?.status === 'HELD' &&
      roomAfterResv?.occupancyStatus === 'RESERVED';

    // Cancel Reservation
    const cancelResvResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/reservations/${encodeURIComponent(
        resvData.id
      )}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          reason: 'Khách đổi kế hoạch công tác',
          refundAmountVnd: 2000000,
        }),
      }
    );
    const roomAfterCancel = await prisma.consoleRoom.findUnique({
      where: { id: lifeRoom1.id },
    });
    const depAfterCancel = await prisma.deposit.findUnique({
      where: { id: depData.id },
    });
    const resvCancelledPass =
      cancelResvResp.status === 200 &&
      roomAfterCancel?.occupancyStatus === 'AVAILABLE' &&
      depAfterCancel?.status === 'REFUNDED';

    // Create Second Reservation & Convert to Contract
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
          holdAmountVnd: 4200000,
          expectedMoveIn: '2026-11-01',
          holdDays: 5,
        }),
      }
    );
    const resv2 = resv2Resp.json?.reservation;

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
          monthlyRentVnd: 4200000,
          depositVnd: 4200000,
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
    const convertPass =
      convertResp.status === 201 &&
      contract?.status === 'ACTIVE' &&
      roomAfterConvert?.occupancyStatus === 'OCCUPIED' &&
      resvAfterConvert?.status === 'CONVERTED';

    // Deposit Partial Refund with Deduction
    const contractDeposit = await prisma.deposit.findFirst({
      where: { contractId: contract.id },
    });
    const depRefundResp = await fetchHttp(
      `${LANDING_URL}/api/v1/console/v2/deposits/${encodeURIComponent(
        contractDeposit.id
      )}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify({
          refundAmountVnd: 3700000,
          deductionAmountVnd: 500000,
          deductionReason: 'Khấu trừ phí vệ sinh đệm',
        }),
      }
    );
    const depRefundPass =
      depRefundResp.status === 200 &&
      depRefundResp.json?.deposit?.status === 'REFUNDED';

    // Contract Extension
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
          newMonthlyRentVnd: 4400000,
          notes: 'Gia hạn thêm 6 tháng',
        }),
      }
    );
    const extendPass =
      extendResp.status === 200 &&
      extendResp.json?.contract?.status === 'EXTENDED' &&
      extendResp.json?.contract?.endDate === '2028-04-30';

    // Transfer Room
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

    // Terminate Contract
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
        resvCreatedPass &&
        resvCancelledPass &&
        convertPass &&
        depRefundPass &&
        extendPass &&
        transferPass &&
        terminatePass,
      resvCreated: resvCreatedPass,
      resvCancelled: resvCancelledPass,
      contractConverted: convertPass,
      depositRefundAndDeduction: depRefundPass,
      contractExtended: extendPass,
      contractTransferred: transferPass,
      contractTerminated: terminatePass,
    };
    console.log(
      `-> C3A State Machines: ${
        testResults.checks.c3aLifecycleStateMachines.pass ? 'PASS' : 'FAIL'
      }`
    );

    // 9. CHECK 6: C3B HUNONIC CLOUD METERING & WATER BILLING
    console.log('[Step 9] Testing C3B Hunonic Cloud Adapter & Water Billing...');

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
    const manualPass =
      manualReadingResp.status === 200 &&
      manualReadingResp.json?.meter?.cumulativeKwh === 245.5;

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
    const replacePass =
      replaceMeterResp.status === 200 &&
      replaceMeterResp.json?.meter?.meterSerial === 'HUNONIC-GEN2-9988';

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
        hunonicSyncPass &&
        manualPass &&
        replacePass &&
        kwhValidationPass &&
        waterCalcPass,
      hunonicSync: hunonicSyncPass,
      manualReading: manualPass,
      meterReplacement: replacePass,
      kwhValidation: kwhValidationPass,
      water3Methods: waterCalcPass,
    };
    console.log(
      `-> C3B Hunonic & Water: ${
        testResults.checks.c3bHunonicAndWater.pass ? 'PASS' : 'FAIL'
      }`
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
      } catch {}
    }
    if (!wsUrl) throw new Error('Cannot connect to Chromium CDP port.');

    const cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    async function captureScreen(
      url,
      width,
      height,
      filename,
      readySelector,
      postNavigateAction
    ) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 768,
      });

      const rawCookieVal = adminCookie.includes('=')
        ? adminCookie.slice(adminCookie.indexOf('=') + 1)
        : adminCookie;
      await cdp.send('Network.setCookie', {
        name: 'adhome_console_session',
        value: rawCookieVal,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
      });

      await cdp.send('Page.navigate', { url });

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const ok = await cdp
          .eval(
            `document.querySelector('${readySelector}') !== null || document.body.innerText.includes('AdHome')`
          )
          .catch(() => false);
        if (ok) break;
      }

      if (postNavigateAction) {
        await cdp.eval(postNavigateAction);
        await new Promise((r) => setTimeout(r, 600));
      }

      const outAppPath = path.join(ARTIFACT_DIR, filename);
      const outEvidencePath = path.join(EVIDENCE_DIR, filename);
      await cdp.screenshot([outAppPath, outEvidencePath]);
      testResults.evidenceFiles.push(filename);
      console.log(`  Captured: ${filename} (${width}x${height})`);
    }

    // Capture 1: Contracts Workspace (1440x900)
    await captureScreen(
      `${CONSOLE_URL}/?module=contracts`,
      1440,
      900,
      'console_v2_1440_contracts_workspace.png',
      '[data-testid="contracts-table"]'
    );

    // Capture 2: Deposits & Reservations Workspace (1440x900)
    await captureScreen(
      `${CONSOLE_URL}/?module=deposits`,
      1440,
      900,
      'console_v2_1440_deposits_workspace.png',
      '[data-testid="console-module-workspace-deposits"]'
    );

    // Capture 3: Settlements & Hunonic Meters Workspace (1440x900)
    await captureScreen(
      `${CONSOLE_URL}/?module=settlements`,
      1440,
      900,
      'console_v2_1440_settlements_hunonic.png',
      '[data-testid="console-module-workspace-settlements"]'
    );

    // Capture 4: Contract Creation Modal with Dynamic Vietnam Dates (1440x900)
    await captureScreen(
      `${CONSOLE_URL}/?module=contracts`,
      1440,
      900,
      'console_v2_1440_contract_modal_dynamic_dates.png',
      '[data-testid="btn-open-create-contract"]',
      `const btn = document.querySelector('[data-testid="btn-open-create-contract"]'); if (btn) btn.click();`
    );

    // Capture 5: Mobile Bottom Nav & Operations (390x844)
    await captureScreen(
      `${CONSOLE_URL}/?module=contracts`,
      390,
      844,
      'console_v2_390x844_contracts_mobile.png',
      '[data-testid="console-mobile-bottom-nav"]'
    );

    cdp.close();

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
    console.log('\n[Cleanup] Terminating preview servers & browser...');
    if (browserProc) {
      try {
        await killProcessTreeWindows(browserProc);
      } catch {}
    }
    if (landingProc) {
      try {
        await killProcessTreeWindows(landingProc);
      } catch {}
    }
    if (consoleProc) {
      try {
        await killProcessTreeWindows(consoleProc);
      } catch {}
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
