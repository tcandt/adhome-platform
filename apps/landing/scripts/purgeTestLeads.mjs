import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function parseArgValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : null;
}

/**
 * Safe Test Lead Purge Utility
 *
 * STRICT SAFETY INVARIANTS:
 * 1. Defaults to DRY-RUN mode. Never deletes unless explicitly passed `--execute --confirm-delete-test-leads`.
 * 2. Does NOT use heuristic name, phone, or user-controllable note strings.
 * 3. Deletes ONLY by explicit primary key UUIDs passed via `options.ids` or `--ids=<uuid1,uuid2>`.
 */
export async function purgeTestLeads(options = {}) {
  const isExecute = options.execute ?? process.argv.includes('--execute');
  const isConfirmed =
    options.confirmed ?? process.argv.includes('--confirm-delete-test-leads');
  const targetIds =
    options.ids ??
    parseArgValue('--ids')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (!targetIds || targetIds.length === 0) {
    console.log('[purgeTestLeads] No explicit target UUIDs provided (--ids=<uuid,uuid>).');
    console.log('For safety against data loss, purging requires exact primary key IDs.');
    const totalCount = await prisma.leadInquiry.count();
    console.log(`Current total LeadInquiry rows in database: ${totalCount}`);
    return { dryRun: true, matchedCount: 0, deletedCount: 0, matchedRecords: [] };
  }

  const matchingRecords = await prisma.leadInquiry.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true,
      referenceCode: true,
      fullName: true,
      phone: true,
      createdAt: true,
    },
  });

  console.log(`\n=== Safe Test Lead Purge (Targeted by UUID) ===`);
  console.log(`Target IDs: ${targetIds.join(', ')}`);
  console.log(`Found ${matchingRecords.length} matching lead records.`);

  if (matchingRecords.length > 0) {
    matchingRecords.forEach((rec, idx) => {
      console.log(
        `  ${idx + 1}. ID: ${rec.id} | Code: ${rec.referenceCode} | Name: ${rec.fullName} | Phone: ${rec.phone} | Created: ${rec.createdAt.toISOString()}`
      );
    });
  }

  if (!isExecute || !isConfirmed) {
    console.log(
      '\n[DRY-RUN MODE] No records were deleted. To perform deletion, rerun with flags: --execute --confirm-delete-test-leads'
    );
    return {
      dryRun: true,
      matchedCount: matchingRecords.length,
      deletedCount: 0,
      matchedRecords: matchingRecords.map((r) => r.id),
    };
  }

  const deleteResult = await prisma.leadInquiry.deleteMany({
    where: { id: { in: targetIds } },
  });

  console.log(
    `\n[EXECUTION COMPLETE] Successfully deleted ${deleteResult.count} lead records by explicit ID.`
  );

  return {
    dryRun: false,
    matchedCount: matchingRecords.length,
    deletedCount: deleteResult.count,
    matchedRecords: matchingRecords.map((r) => r.id),
  };
}

if (process.argv[1] && process.argv[1].endsWith('purgeTestLeads.mjs')) {
  purgeTestLeads()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect().then(() => process.exit(1));
    });
}
