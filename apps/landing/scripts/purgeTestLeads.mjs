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

/**
 * Safe Test Lead Purge Utility
 *
 * SAFETY INVARIANTS:
 * 1. Defaults to DRY-RUN mode. Never deletes unless explicitly passed `--execute --confirm-delete-test-leads`.
 * 2. Does NOT use heuristic name or phone filters that could match authentic customers.
 * 3. Targets ONLY explicitly registered test lead IDs, explicit testRunIds, or explicit `[TEST_RUN:...]` tags in note.
 */
export async function purgeTestLeads(options = {}) {
  const isExecute = options.execute ?? process.argv.includes('--execute');
  const isConfirmed =
    options.confirmed ?? process.argv.includes('--confirm-delete-test-leads');
  const targetIds = options.ids ?? parseArgValue('--ids')?.split(',').map((s) => s.trim()).filter(Boolean);
  const targetRunId = options.testRunId ?? parseArgValue('--test-run-id');
  const matchTestTag = options.matchTestTag ?? process.argv.includes('--match-test-tag');

  // Build targeted query filter
  const conditions = [];

  if (targetIds && targetIds.length > 0) {
    conditions.push({ id: { in: targetIds } });
  }

  if (targetRunId) {
    conditions.push({ note: { contains: `[TEST_RUN:${targetRunId}]` } });
  }

  if (matchTestTag) {
    conditions.push({ note: { contains: '[TEST_RUN:' } });
    conditions.push({ note: { contains: '[IS_TEST: true]' } });
  }

  if (conditions.length === 0) {
    console.log(
      '[purgeTestLeads] No specific targeting criteria provided (--ids, --test-run-id, or --match-test-tag).'
    );
    console.log(
      'For safety against accidental data loss, you must specify target criteria.'
    );
    const totalCount = await prisma.leadInquiry.count();
    console.log(`Current total LeadInquiry rows in database: ${totalCount}`);
    return { dryRun: true, matchedCount: 0, deletedCount: 0, matchedRecords: [] };
  }

  const matchingRecords = await prisma.leadInquiry.findMany({
    where: { OR: conditions },
    select: {
      id: true,
      referenceCode: true,
      fullName: true,
      phone: true,
      note: true,
      createdAt: true,
    },
  });

  console.log(`\n=== Safe Test Lead Purge ===`);
  console.log(`Targeting criteria: ${JSON.stringify(conditions)}`);
  console.log(`Found ${matchingRecords.length} matching test lead records.`);

  if (matchingRecords.length > 0) {
    console.log('Sample matched records:');
    matchingRecords.slice(0, 10).forEach((rec, idx) => {
      console.log(
        `  ${idx + 1}. ID: ${rec.id} | Code: ${rec.referenceCode} | Name: ${rec.fullName} | Note: ${rec.note || 'none'} | Created: ${rec.createdAt.toISOString()}`
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

  const deleteIds = matchingRecords.map((r) => r.id);
  const deleteResult = await prisma.leadInquiry.deleteMany({
    where: { id: { in: deleteIds } },
  });

  console.log(
    `\n[EXECUTION COMPLETE] Successfully deleted ${deleteResult.count} test lead records.`
  );
  const remainingCount = await prisma.leadInquiry.count();
  console.log(`Remaining LeadInquiry rows in database: ${remainingCount}`);

  return {
    dryRun: false,
    matchedCount: matchingRecords.length,
    deletedCount: deleteResult.count,
    deletedIds: deleteIds,
    remainingCount,
  };
}

function parseArgValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : null;
}

if (process.argv[1] && process.argv[1].endsWith('purgeTestLeads.mjs')) {
  purgeTestLeads()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect().then(() => process.exit(1));
    });
}
