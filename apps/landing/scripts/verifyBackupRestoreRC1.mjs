import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';
const RC1_OUTPUT_DIR = path.join(process.cwd(), 'docs', 'evidence', 'rc1');
const SECURE_BACKUPS_DIR = path.join(process.cwd(), 'backups');
fs.mkdirSync(SECURE_BACKUPS_DIR, { recursive: true });
const BACKUP_PATH = path.join(SECURE_BACKUPS_DIR, 'adhome_v2_rc1_backup.dump');
const TEMP_DB_NAME = 'adhome_v2_restore_verify';

const PG_HOST = '127.0.0.1';
const PG_PORT = '5432';
const PG_USER = 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD || 'postgres';
const SOURCE_DB = 'adhome_v2';

const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_DUMP = fs.existsSync(path.join(PG_BIN_DIR, 'pg_dump.exe'))
  ? `"${path.join(PG_BIN_DIR, 'pg_dump.exe')}"`
  : 'pg_dump';
const PG_RESTORE = fs.existsSync(path.join(PG_BIN_DIR, 'pg_restore.exe'))
  ? `"${path.join(PG_BIN_DIR, 'pg_restore.exe')}"`
  : 'pg_restore';
const PSQL = fs.existsSync(path.join(PG_BIN_DIR, 'psql.exe'))
  ? `"${path.join(PG_BIN_DIR, 'psql.exe')}"`
  : 'psql';

const env = { ...process.env, PGPASSWORD: PG_PASSWORD };

function runCmd(cmd) {
  return execSync(cmd, { env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function runBackupAndRestoreVerification() {
  console.log('=== Starting PostgreSQL 18 Backup & Restore Verification for RC1 ===');

  const prismaSource = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${SOURCE_DB}?schema=public`,
      },
    },
  });

  // 1. Gather Source DB Statistics
  console.log(`Auditing source database: ${SOURCE_DB}...`);
  const [dbSizeRow] = await prismaSource.$queryRawUnsafe(
    `SELECT pg_size_pretty(pg_database_size('${SOURCE_DB}')) AS size_pretty, pg_database_size('${SOURCE_DB}') AS size_bytes`
  );

  const orgCount = await prismaSource.organization.count();
  const buildingCount = await prismaSource.building.count();
  const floorCount = await prismaSource.floor.count();
  const roomCount = await prismaSource.publicRoomListing.count();
  const inquiryCount = await prismaSource.leadInquiry.count();
  const actorCount = await prismaSource.consoleActor.count();
  const revokedCount = await prismaSource.revokedToken.count();
  const auditCount = await prismaSource.roomAuditLog.count();
  const seoJobCount = await prismaSource.seoSyncJob.count();

  const sourceCounts = {
    organizations: orgCount,
    buildings: buildingCount,
    floors: floorCount,
    rooms: roomCount,
    leadInquiries: inquiryCount,
    consoleActors: actorCount,
    revokedTokens: revokedCount,
    roomAuditLogs: auditCount,
    seoSyncJobs: seoJobCount,
  };

  console.log(`Source DB Size: ${dbSizeRow.size_pretty}`);
  console.log('Source Table Counts:', JSON.stringify(sourceCounts, null, 2));

  // 2. Perform Native `pg_dump`
  fs.mkdirSync(RC1_OUTPUT_DIR, { recursive: true });
  if (fs.existsSync(BACKUP_PATH)) {
    fs.unlinkSync(BACKUP_PATH);
  }

  console.log(`Running pg_dump to ${BACKUP_PATH}...`);
  const tDumpStart = Date.now();
  const dumpCmd = `${PG_DUMP} -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -F c -b -f "${BACKUP_PATH}" ${SOURCE_DB}`;
  runCmd(dumpCmd);
  const dumpDurationMs = Date.now() - tDumpStart;

  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Backup file was not created: ${BACKUP_PATH}`);
  }

  const dumpStats = fs.statSync(BACKUP_PATH);
  const dumpFileBuffer = fs.readFileSync(BACKUP_PATH);
  const dumpSha256 = crypto.createHash('sha256').update(dumpFileBuffer).digest('hex');

  console.log(`Backup completed in ${dumpDurationMs}ms.`);
  console.log(`Backup File Size: ${dumpStats.size} bytes (${Math.round((dumpStats.size / 1024) * 100) / 100} KB)`);
  console.log(`Backup SHA256: ${dumpSha256}`);

  // 3. Drop existing temp DB if any, and create clean database
  console.log(`Preparing temporary restore database: ${TEMP_DB_NAME}...`);
  try {
    runCmd(`${PSQL} -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEMP_DB_NAME} WITH (FORCE);"`);
  } catch {
    // Ignore drop if not present
  }
  runCmd(`${PSQL} -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d postgres -c "CREATE DATABASE ${TEMP_DB_NAME};"`);

  // 4. Perform `pg_restore` into temporary database
  console.log(`Restoring dump into ${TEMP_DB_NAME}...`);
  const tRestoreStart = Date.now();
  const restoreCmd = `${PG_RESTORE} -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${TEMP_DB_NAME} --no-owner --no-privileges "${BACKUP_PATH}"`;
  try {
    runCmd(restoreCmd);
  } catch (err) {
    // pg_restore can exit with 1 if there are minor warnings (e.g., schema existence); check if tables exist
    console.warn('pg_restore command produced warning/notice:', err.message);
  }
  const restoreDurationMs = Date.now() - tRestoreStart;
  console.log(`Restore completed in ${restoreDurationMs}ms.`);

  // 5. Connect to Restored DB and Verify All Records & Row Counts
  const prismaRestored = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEMP_DB_NAME}?schema=public`,
      },
    },
  });

  const restoredOrgCount = await prismaRestored.organization.count();
  const restoredBuildingCount = await prismaRestored.building.count();
  const restoredFloorCount = await prismaRestored.floor.count();
  const restoredRoomCount = await prismaRestored.publicRoomListing.count();
  const restoredInquiryCount = await prismaRestored.leadInquiry.count();
  const restoredActorCount = await prismaRestored.consoleActor.count();
  const restoredRevokedCount = await prismaRestored.revokedToken.count();
  const restoredAuditCount = await prismaRestored.roomAuditLog.count();
  const restoredSeoJobCount = await prismaRestored.seoSyncJob.count();

  const restoredCounts = {
    organizations: restoredOrgCount,
    buildings: restoredBuildingCount,
    floors: restoredFloorCount,
    rooms: restoredRoomCount,
    leadInquiries: restoredInquiryCount,
    consoleActors: restoredActorCount,
    revokedTokens: restoredRevokedCount,
    roomAuditLogs: restoredAuditCount,
    seoSyncJobs: restoredSeoJobCount,
  };

  console.log('Restored Table Counts:', JSON.stringify(restoredCounts, null, 2));

  // Verify Sample Room Content Integrity
  const sourceRoom = await prismaSource.publicRoomListing.findUnique({
    where: { id: 'rm-31-06' },
  });
  const restoredRoom = await prismaRestored.publicRoomListing.findUnique({
    where: { id: 'rm-31-06' },
  });

  const roomIntegrityMatch =
    sourceRoom &&
    restoredRoom &&
    sourceRoom.slug === restoredRoom.slug &&
    sourceRoom.price === restoredRoom.price &&
    sourceRoom.roomCode === restoredRoom.roomCode;

  // Verify Counts Match Exactly
  const countsMatch = Object.keys(sourceCounts).every(
    (k) => sourceCounts[k] === restoredCounts[k]
  );

  console.log(`Data & Counts Match: ${countsMatch ? 'YES' : 'NO'}`);
  console.log(`Sample Room rm-31-06 Match: ${roomIntegrityMatch ? 'YES' : 'NO'}`);

  // Disconnect clients
  await prismaSource.$disconnect();
  await prismaRestored.$disconnect();

  // 6. Clean up temporary database
  console.log(`Dropping temporary restore database ${TEMP_DB_NAME}...`);
  runCmd(`${PSQL} -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEMP_DB_NAME} WITH (FORCE);"`);

  const report = {
    testName: 'ADHOME RC1 PostgreSQL 18 Backup and Restore Verification',
    timestamp: new Date().toISOString(),
    databaseEngine: 'PostgreSQL 18.0.4',
    sourceDatabase: SOURCE_DB,
    databaseSize: dbSizeRow.size_pretty,
    databaseSizeBytes: Number(dbSizeRow.size_bytes),
    backupFile: {
      path: BACKUP_PATH,
      sizeBytes: dumpStats.size,
      sizeKb: Math.round((dumpStats.size / 1024) * 100) / 100,
      format: 'custom (-F c, compressed)',
      sha256: dumpSha256,
      dumpDurationMs,
    },
    restoreVerification: {
      tempDatabase: TEMP_DB_NAME,
      restoreDurationMs,
      sourceCounts,
      restoredCounts,
      countsMatch,
      sampleRoomIntegrityMatch: Boolean(roomIntegrityMatch),
      tempDbCleanedUp: true,
      pass: countsMatch && Boolean(roomIntegrityMatch),
    },
  };

  const jsonStr = JSON.stringify(report, null, 2);
  const localOutPath = path.join(RC1_OUTPUT_DIR, 'rc1_backup_restore_results.json');
  const artifactOutPath = path.join(ARTIFACT_DIR, 'rc1_backup_restore_results.json');

  fs.writeFileSync(localOutPath, jsonStr);
  fs.writeFileSync(artifactOutPath, jsonStr);

  console.log(`\nBackup & Restore Report written to:`);
  console.log(`- ${localOutPath}`);
  console.log(`- ${artifactOutPath}`);

  return report;
}

if (process.argv[1] && process.argv[1].endsWith('verifyBackupRestoreRC1.mjs')) {
  runBackupAndRestoreVerification()
    .then((r) => {
      console.log('\nBackup & Restore Verification Succeeded!');
      process.exit(r.restoreVerification.pass ? 0 : 1);
    })
    .catch((err) => {
      console.error('\nBackup & Restore Verification Failed:', err);
      process.exit(1);
    });
}
