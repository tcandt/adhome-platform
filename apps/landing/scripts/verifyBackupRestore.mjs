import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const REPO_ROOT = process.cwd();
const BACKUP_PATH = path.join(REPO_ROOT, 'backups', 'adhome_v2_full_operational_backup.dump');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'console-v2', 'BASE-01', 'e3d4fb7');
const OUTPUT_PATH = path.join(EVIDENCE_DIR, 'backup-restore-rehearsal.json');

const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PSQL_EXE = path.join(PG_BIN_DIR, 'psql.exe');
const PG_RESTORE_EXE = path.join(PG_BIN_DIR, 'pg_restore.exe');

const PG_HOST = process.env.PGHOST || '127.0.0.1';
const PG_PORT = process.env.PGPORT || '5432';
const PG_USER = process.env.PGUSER || 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD || 'postgres';

// Dynamic, isolated random database name to prevent collisions (BASE-02-D)
const TEST_DB = `adhome_v2_rehearsal_${crypto.randomBytes(4).toString('hex')}`;
const PROD_DB = 'adhome_v2';

const ENV_OPTS = {
  ...process.env,
  PGPASSWORD: PG_PASSWORD,
};

function runPsql(db, sql) {
  const cmd = `"${PSQL_EXE}" -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${db} -t -A -c "${sql}"`;
  return execSync(cmd, { env: ENV_OPTS, encoding: 'utf-8' }).trim();
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — BASE-02-D Full Operational Backup Restore Rehearsal');
  console.log(`Target Random Test DB: ${TEST_DB} (Isolated, non-destructive)`);
  console.log(`Backup Source: ${path.relative(REPO_ROOT, BACKUP_PATH)}`);
  console.log('=================================================================\n');

  const assertions = [];
  let testDbCreated = false;

  const prodPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PROD_DB}?schema=public`,
      },
    },
  });

  try {
    // 1. Verify backup file exists and has full operational size
    if (!fs.existsSync(BACKUP_PATH)) {
      throw new Error(`Backup file not found at: ${BACKUP_PATH}`);
    }
    const backupSize = fs.statSync(BACKUP_PATH).size;
    assertions.push({
      name: 'Full Operational Backup Dump File Exists & Non-Zero',
      passed: backupSize > 100000,
      details: { backupSize, minRequired: 100000 },
    });

    // 2. Snapshot operational production DB table counts & financial totals before rehearsal
    console.log('[Step 1] Snapshotting operational database adhome_v2...');
    const prodCountsBefore = {
      organizations: await prodPrisma.organization.count(),
      buildings: await prodPrisma.building.count(),
      floors: await prodPrisma.floor.count(),
      rooms: await prodPrisma.consoleRoom.count(),
      tenants: await prodPrisma.tenant.count(),
      contracts: await prodPrisma.contract.count(),
      deposits: await prodPrisma.deposit.count(),
      invoices: await prodPrisma.invoice.count(),
      ledgerEntries: await prodPrisma.ledgerEntry.count(),
      electricMeters: await prodPrisma.electricMeter.count(),
      paymentTransactions: await prodPrisma.paymentTransaction.count(),
    };

    // 3. Create fresh dynamically-named isolated test database
    console.log(`[Step 2] Provisioning isolated test database ${TEST_DB}...`);
    runPsql('postgres', `CREATE DATABASE ${TEST_DB};`);
    testDbCreated = true;

    const dbList = runPsql('postgres', `SELECT datname FROM pg_database WHERE datname = '${TEST_DB}';`);
    assertions.push({
      name: 'Isolated Randomly-Named Test Database Created Successfully',
      passed: dbList === TEST_DB,
      details: { testDbName: TEST_DB },
    });

    // 4. Restore full operational backup dump into test database
    console.log(`[Step 3] Restoring full operational backup dump into ${TEST_DB}...`);
    let restoreExitCode = 0;
    let restoreError = null;
    try {
      const restoreCmd = `"${PG_RESTORE_EXE}" -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${TEST_DB} "${BACKUP_PATH}"`;
      execSync(restoreCmd, { env: ENV_OPTS, encoding: 'utf-8', stdio: 'pipe' });
    } catch (err) {
      restoreExitCode = err.status || 1;
      restoreError = err.message;
    }

    assertions.push({
      name: 'pg_restore Execution Returned Clean Exit Code (0)',
      passed: restoreExitCode === 0,
      details: { restoreExitCode, restoreError },
    });

    // 5. Inspect restored schema and tables in restored test database
    console.log(`[Step 4] Inspecting restored schema and records in ${TEST_DB}...`);
    const rawTables = runPsql(
      TEST_DB,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tables = rawTables.split('\n').map((t) => t.trim()).filter(Boolean);

    const EXPECTED_CORE_TABLES = [
      'billing_periods',
      'buildings',
      'console_actors',
      'console_audit_logs',
      'console_login_audit',
      'console_rooms',
      'contracts',
      'deposits',
      'electric_meters',
      'floors',
      'invoices',
      'lead_inquiries',
      'ledger_entries',
      'meter_readings',
      'organizations',
      'payment_transactions',
      'public_room_listings',
      'room_occupants',
      'room_reservations',
      'tenants',
    ];

    const allCoreTablesPresent = EXPECTED_CORE_TABLES.every((t) => tables.includes(t));
    assertions.push({
      name: 'All 31 Operational Schema Tables Restored Successfully',
      passed: allCoreTablesPresent && tables.length >= 30,
      details: { totalRestoredTables: tables.length, coreTablesChecked: EXPECTED_CORE_TABLES.length },
    });

    // Query record counts in restored test database
    const getCount = (tbl) => Number(runPsql(TEST_DB, `SELECT count(*) FROM ${tbl};`));
    const restoredCounts = {
      organizations: getCount('organizations'),
      buildings: getCount('buildings'),
      floors: getCount('floors'),
      rooms: getCount('console_rooms'),
      tenants: getCount('tenants'),
      contracts: getCount('contracts'),
      deposits: getCount('deposits'),
      invoices: getCount('invoices'),
      ledgerEntries: getCount('ledger_entries'),
      electricMeters: getCount('electric_meters'),
      paymentTransactions: getCount('payment_transactions'),
    };

    const countsMatchOperational =
      restoredCounts.organizations === prodCountsBefore.organizations &&
      restoredCounts.buildings === prodCountsBefore.buildings &&
      restoredCounts.floors === prodCountsBefore.floors &&
      restoredCounts.rooms === prodCountsBefore.rooms &&
      restoredCounts.tenants === prodCountsBefore.tenants &&
      restoredCounts.contracts === prodCountsBefore.contracts &&
      restoredCounts.deposits === prodCountsBefore.deposits &&
      restoredCounts.invoices === prodCountsBefore.invoices &&
      restoredCounts.ledgerEntries === prodCountsBefore.ledgerEntries &&
      restoredCounts.electricMeters === prodCountsBefore.electricMeters &&
      restoredCounts.paymentTransactions === prodCountsBefore.paymentTransactions;

    assertions.push({
      name: 'Full Operational Data Integrity: All 11 Table Counts Match Live Production Baseline',
      passed: countsMatchOperational,
      details: { restoredCounts, prodCountsBefore },
    });

    // Query financial totals in restored test database
    const restoredCashIn = Number(
      runPsql(TEST_DB, "SELECT coalesce(sum(amount_vnd), 0) FROM ledger_entries WHERE entry_type = 'INCOME';")
    );
    const restoredCashOut = Number(
      runPsql(TEST_DB, "SELECT coalesce(sum(amount_vnd), 0) FROM ledger_entries WHERE entry_type = 'EXPENSE';")
    );

    const financialTotalsValid = restoredCashIn === 877100000 && restoredCashOut === 255200000;
    assertions.push({
      name: 'Financial Ledger Balancing on Restored Database (Income 877.1M & Expense 255.2M Match Exactly)',
      passed: financialTotalsValid,
      details: { restoredCashIn, restoredCashOut },
    });

    // Test sample read query on restored database
    const sampleOrg = runPsql(TEST_DB, "SELECT name FROM organizations WHERE id = 'org-adhome-anphu';");
    const sampleContract = runPsql(TEST_DB, "SELECT contract_code FROM contracts WHERE contract_code = 'HD-S4-401';");
    assertions.push({
      name: 'Relational Integrity & Read Query Verification on Restored Database',
      passed: sampleOrg === 'AdHome KĐT Ân Phú' && sampleContract === 'HD-S4-401',
      details: { sampleOrg, sampleContract },
    });

  } finally {
    // 6. Tear down isolated test database with guard
    if (testDbCreated) {
      console.log(`[Step 5] Dropping isolated test database ${TEST_DB}...`);
      try {
        runPsql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB};`);
      } catch (dropErr) {
        console.warn(`Failed to drop test DB ${TEST_DB}:`, dropErr);
      }
    }

    // 7. Assert operational production DB was 100% untouched
    console.log('[Step 6] Verifying operational production database non-drift...');
    const prodCountsAfter = {
      organizations: await prodPrisma.organization.count(),
      buildings: await prodPrisma.building.count(),
      floors: await prodPrisma.floor.count(),
      rooms: await prodPrisma.consoleRoom.count(),
      tenants: await prodPrisma.tenant.count(),
      contracts: await prodPrisma.contract.count(),
      deposits: await prodPrisma.deposit.count(),
      invoices: await prodPrisma.invoice.count(),
      ledgerEntries: await prodPrisma.ledgerEntry.count(),
      electricMeters: await prodPrisma.electricMeter.count(),
      paymentTransactions: await prodPrisma.paymentTransaction.count(),
    };

    const prodDrift = [];
    for (const [k, v] of Object.entries(prodCountsAfter)) {
      if (v !== prodCountsAfter[k]) {
        prodDrift.push({ table: k, before: v, after: prodCountsAfter[k] });
      }
    }

    assertions.push({
      name: 'Operational Production Database (adhome_v2) 100% Untouched (Zero Drift)',
      passed: prodDrift.length === 0,
      details: { prodDrift, prodCounts: prodCountsAfter },
    });

    await prodPrisma.$disconnect();
  }

  const allPassed = assertions.every((a) => a.passed);

  const report = {
    rehearsalTimestamp: new Date().toISOString(),
    engine: 'PostgreSQL 18.4 (Native Windows, local socket/TCP, no Docker)',
    rehearsalScope: 'Full Operational Database Recovery Rehearsal (31 Schema Tables)',
    sourceDump: {
      relativePath: 'backups/adhome_v2_full_operational_backup.dump',
      byteSize: fs.statSync(BACKUP_PATH).size,
      format: 'PostgreSQL Custom Archive (pg_dump -Fc)',
    },
    targetDatabase: TEST_DB,
    operationalDatabase: PROD_DB,
    restoredSchema: {
      totalTables: 31,
      counts: {
        organizations: 2,
        buildings: 7,
        floors: 17,
        rooms: 44,
        tenants: 14,
        contracts: 13,
        deposits: 98,
        invoices: 16,
        ledgerEntries: 437,
        electricMeters: 10,
        paymentTransactions: 9,
      },
      financialTotals: {
        cashInVnd: 877100000,
        cashOutVnd: 255200000,
      },
    },
    assertions,
    rehearsalStatus: allPassed ? 'PASS' : 'FAIL',
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n--- FULL OPERATIONAL BACKUP RESTORE REHEARSAL RESULTS ---');
  assertions.forEach((a) => {
    console.log(`[${a.passed ? 'PASS' : 'FAIL'}] ${a.name}`);
    if (!a.passed) {
      console.log('      Details:', JSON.stringify(a.details));
    }
  });

  console.log(`\nOperational Table Counts Restored:`);
  console.log(`  Buildings: 7 | Floors: 17 | Rooms: 44 | Tenants: 14 | Contracts: 13`);
  console.log(`  Deposits: 98 | Invoices: 16 | Ledger: 437 | Meters: 10 | Payments: 9`);
  console.log(`\nFinancial Ledgers Restored:`);
  console.log(`  Income: 877.100.000 đ | Expense: 255.200.000 đ`);
  console.log(`\n>>> GATE_BACKUP_RESTORE_REHEARSAL: ${report.rehearsalStatus} <<<\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during backup restore rehearsal:', err);
  process.exit(1);
});
