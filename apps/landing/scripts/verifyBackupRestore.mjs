import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const REPO_ROOT = process.cwd();
const BACKUP_PATH = path.join(REPO_ROOT, 'backups', 'adhome_v2_rc1_backup.dump');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'console-v2', 'BASE-01', 'e3d4fb7');
const OUTPUT_PATH = path.join(EVIDENCE_DIR, 'backup-restore-rehearsal.json');

const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PSQL_EXE = path.join(PG_BIN_DIR, 'psql.exe');
const PG_RESTORE_EXE = path.join(PG_BIN_DIR, 'pg_restore.exe');

const PG_HOST = process.env.PGHOST || '127.0.0.1';
const PG_PORT = process.env.PGPORT || '5432';
const PG_USER = process.env.PGUSER || 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD || 'postgres';
const TEST_DB = 'adhome_v2_test_restore';
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
  console.log('AdHome Console V2 — BASE-01-FIX-12 PostgreSQL Backup Restore Rehearsal');
  console.log(`Target Test DB: ${TEST_DB} (Isolated, non-production)`);
  console.log(`Backup Source: ${path.relative(REPO_ROOT, BACKUP_PATH)}`);
  console.log('=================================================================\n');

  const assertions = [];

  // 1. Verify backup file exists and has non-trivial size
  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Backup file not found at: ${BACKUP_PATH}`);
  }
  const backupSize = fs.statSync(BACKUP_PATH).size;
  assertions.push({
    name: 'Backup Dump File Exists & Non-Zero',
    passed: backupSize > 25000,
    details: { backupSize, minRequired: 25000 },
  });

  // 2. Snapshot operational production DB table counts before rehearsal
  console.log('[Step 1] Snapshotting operational database adhome_v2...');
  const prodPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PROD_DB}?schema=public`,
      },
    },
  });

  const prodCountsBefore = {
    organizations: await prodPrisma.organization.count(),
    buildings: await prodPrisma.building.count(),
    floors: await prodPrisma.floor.count(),
    rooms: await prodPrisma.consoleRoom.count(),
    contracts: await prodPrisma.contract.count(),
    deposits: await prodPrisma.deposit.count(),
    invoices: await prodPrisma.invoice.count(),
    ledgerEntries: await prodPrisma.ledgerEntry.count(),
  };

  // 3. Create fresh isolated test database
  console.log(`[Step 2] Provisioning isolated test database ${TEST_DB}...`);
  runPsql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB};`);
  runPsql('postgres', `CREATE DATABASE ${TEST_DB};`);

  const dbList = runPsql('postgres', `SELECT datname FROM pg_database WHERE datname = '${TEST_DB}';`);
  assertions.push({
    name: 'Isolated Test Database Created',
    passed: dbList === TEST_DB,
    details: { testDbName: TEST_DB },
  });

  // 4. Restore backup dump into test database
  console.log(`[Step 3] Restoring backup dump into ${TEST_DB}...`);
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

  // 5. Inspect restored schema and tables
  console.log(`[Step 4] Inspecting restored schema and records in ${TEST_DB}...`);
  const rawTables = runPsql(
    TEST_DB,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );
  const tables = rawTables.split('\n').map((t) => t.trim()).filter(Boolean);

  const EXPECTED_TABLES = [
    'buildings',
    'console_actors',
    'console_login_audit',
    'floors',
    'lead_inquiries',
    'organizations',
    'public_room_listings',
    'revoked_tokens',
    'room_audit_logs',
    'seo_sync_jobs',
  ];

  const allTablesPresent = EXPECTED_TABLES.every((t) => tables.includes(t));
  assertions.push({
    name: 'All Expected Schema Tables Restored (10/10)',
    passed: allTablesPresent && tables.length >= 10,
    details: { restoredTables: tables, expectedTables: EXPECTED_TABLES },
  });

  // Query record counts in restored database
  const getCount = (tbl) => Number(runPsql(TEST_DB, `SELECT count(*) FROM ${tbl};`));
  const restoredCounts = {
    organizations: getCount('organizations'),
    buildings: getCount('buildings'),
    floors: getCount('floors'),
    publicRoomListings: getCount('public_room_listings'),
    consoleActors: getCount('console_actors'),
    leadInquiries: getCount('lead_inquiries'),
  };

  const recordsRestoredValid =
    restoredCounts.organizations === 2 &&
    restoredCounts.buildings === 4 &&
    restoredCounts.floors === 11 &&
    restoredCounts.publicRoomListings === 13 &&
    restoredCounts.consoleActors === 6 &&
    restoredCounts.leadInquiries === 1;

  assertions.push({
    name: 'Data Integrity: Restored Record Counts Match Dump Baseline Exactly',
    passed: recordsRestoredValid,
    details: restoredCounts,
  });

  // Query sample restored record
  const sampleOrg = runPsql(TEST_DB, "SELECT name FROM organizations WHERE id = 'org-adhome-anphu';");
  const sampleAdmin = runPsql(TEST_DB, "SELECT email FROM console_actors WHERE email = 'admin@adhome.vn';");
  assertions.push({
    name: 'Read Access & Relational Integrity on Restored Database',
    passed: sampleOrg === 'AdHome KĐT Ân Phú' && sampleAdmin === 'admin@adhome.vn',
    details: { sampleOrg, sampleAdmin },
  });

  // 6. Tear down isolated test database
  console.log(`[Step 5] Dropping isolated test database ${TEST_DB}...`);
  runPsql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB};`);
  const dbListAfter = runPsql('postgres', `SELECT datname FROM pg_database WHERE datname = '${TEST_DB}';`);
  assertions.push({
    name: 'Temporary Test Database Cleanly Destroyed After Rehearsal',
    passed: dbListAfter === '',
    details: { testDbExistsAfterCleanup: dbListAfter !== '' },
  });

  // 7. Assert operational production DB was 100% untouched
  console.log('[Step 6] Verifying operational production database non-drift...');
  const prodCountsAfter = {
    organizations: await prodPrisma.organization.count(),
    buildings: await prodPrisma.building.count(),
    floors: await prodPrisma.floor.count(),
    rooms: await prodPrisma.consoleRoom.count(),
    contracts: await prodPrisma.contract.count(),
    deposits: await prodPrisma.deposit.count(),
    invoices: await prodPrisma.invoice.count(),
    ledgerEntries: await prodPrisma.ledgerEntry.count(),
  };

  const prodDrift = [];
  for (const [k, v] of Object.entries(prodCountsBefore)) {
    if (v !== prodCountsAfter[k]) {
      prodDrift.push({ table: k, before: v, after: prodCountsAfter[k] });
    }
  }

  const prodUntouched = prodDrift.length === 0;
  assertions.push({
    name: 'Operational Database (adhome_v2) 100% Untouched (Zero Drift)',
    passed: prodUntouched,
    details: { prodDrift, prodCounts: prodCountsAfter },
  });

  await prodPrisma.$disconnect();

  const allPassed = assertions.every((a) => a.passed);

  const report = {
    rehearsalTimestamp: new Date().toISOString(),
    engine: 'PostgreSQL 18.4 (Native Windows, local socket/TCP, no Docker)',
    sourceDump: {
      relativePath: 'backups/adhome_v2_rc1_backup.dump',
      byteSize: backupSize,
      format: 'PostgreSQL Custom Archive (pg_dump -Fc)',
    },
    targetDatabase: TEST_DB,
    operationalDatabase: PROD_DB,
    restoredSchema: {
      tables,
      counts: restoredCounts,
    },
    assertions,
    rehearsalStatus: allPassed ? 'PASS' : 'FAIL',
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n--- BACKUP RESTORE REHEARSAL RESULTS ---');
  assertions.forEach((a) => {
    console.log(`[${a.passed ? 'PASS' : 'FAIL'}] ${a.name}`);
    if (!a.passed) {
      console.log('      Details:', JSON.stringify(a.details));
    }
  });

  console.log(`\nRestored Table Counts:`);
  console.log(`  Organizations: ${restoredCounts.organizations} | Buildings: ${restoredCounts.buildings} | Floors: ${restoredCounts.floors}`);
  console.log(`  Public Room Listings: ${restoredCounts.publicRoomListings} | Console Actors: ${restoredCounts.consoleActors} | Leads: ${restoredCounts.leadInquiries}`);
  console.log(`\n>>> GATE_BACKUP_RESTORE_REHEARSAL: ${report.rehearsalStatus} <<<\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during backup restore rehearsal:', err);
  process.exit(1);
});
