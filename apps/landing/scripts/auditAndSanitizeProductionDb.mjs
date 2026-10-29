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

const KNOWN_DEV_SAMPLE_ACTOR_IDS = [
  'usr-admin-01',
  'usr-mgr-lk01',
  'usr-viewer-01',
  'usr-other-org-01',
];

export async function auditAndSanitizeProductionDb(options = {}) {
  const shouldDeactivate =
    options.deactivateSampleActors ??
    process.argv.includes('--deactivate-sample-actors');

  console.log('\n======================================================');
  console.log('   ADHOME DATABASE AUDIT & PRODUCTION SANITIZATION');
  console.log('======================================================');

  // 1. Audit Console Actors
  const allActors = await prisma.consoleActor.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const sampleActors = allActors.filter((a) =>
    KNOWN_DEV_SAMPLE_ACTOR_IDS.includes(a.id)
  );
  const genuineActors = allActors.filter(
    (a) => !KNOWN_DEV_SAMPLE_ACTOR_IDS.includes(a.id)
  );

  console.log(`\n[ConsoleActor Audit] Total: ${allActors.length}`);
  console.log(`- Sample Development Actors: ${sampleActors.length}`);
  sampleActors.forEach((a) => {
    console.log(
      `  • [DEV SAMPLE] ID: ${a.id} | Email: ${a.email} | Role: ${a.role} | Active: ${a.isActive ? 'YES (RISK)' : 'NO (SAFE)'}`
    );
  });

  console.log(`- Genuine / Provisioned Actors: ${genuineActors.length}`);
  genuineActors.forEach((a) => {
    console.log(
      `  • [PRODUCTION] ID: ${a.id} | Email: ${a.email} | Role: ${a.role} | Active: ${a.isActive}`
    );
  });

  let deactivatedCount = 0;
  if (shouldDeactivate && sampleActors.some((a) => a.isActive)) {
    console.log('\n[Action] Deactivating sample development actors...');
    const result = await prisma.consoleActor.updateMany({
      where: {
        id: { in: KNOWN_DEV_SAMPLE_ACTOR_IDS },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    deactivatedCount = result.count;
    console.log(
      `Successfully deactivated ${deactivatedCount} sample development actors.`
    );
  }

  // 2. Audit Lead Inquiries
  const allLeads = await prisma.leadInquiry.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n[LeadInquiry Audit] Total: ${allLeads.length}`);
  allLeads.forEach((l, idx) => {
    const isTaggedTest =
      (l.note && l.note.includes('[TEST_RUN:')) ||
      l.fullName.includes('RC1') ||
      l.fullName.includes('Test');
    console.log(
      `  ${idx + 1}. [${isTaggedTest ? 'TEST/DEMO' : 'AUTHENTIC'}] Code: ${l.referenceCode} | Name: ${l.fullName} | Phone: ${l.phone} | Created: ${l.createdAt.toISOString()}`
    );
  });

  const auditReport = {
    timestamp: new Date().toISOString(),
    actors: {
      total: allActors.length,
      sampleDevActorsCount: sampleActors.length,
      activeSampleActorsCount: sampleActors.filter((a) => a.isActive).length,
      genuineActorsCount: genuineActors.length,
      deactivatedSampleActors: deactivatedCount,
      allSampleActorsDeactivated: sampleActors.every(
        (a) => !a.isActive || (shouldDeactivate && deactivatedCount > 0)
      ),
    },
    leads: {
      total: allLeads.length,
      leads: allLeads.map((l) => ({
        id: l.id,
        referenceCode: l.referenceCode,
        fullName: l.fullName,
        phone: l.phone,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  };

  return auditReport;
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('auditAndSanitizeProductionDb.mjs')
) {
  auditAndSanitizeProductionDb()
    .then((report) => {
      console.log('\nAudit Summary:', JSON.stringify(report.actors, null, 2));
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      prisma.$disconnect().then(() => process.exit(1));
    });
}

