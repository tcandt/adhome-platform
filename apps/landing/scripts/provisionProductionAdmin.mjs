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

export const DEV_SAMPLE_ACTOR_IDS = [
  'usr-admin-01',
  'usr-mgr-lk01',
  'usr-viewer-01',
  'usr-other-org-01',
];

export async function provisionProductionAdmin() {
  console.log('\n=============================================================');
  console.log('   PROVISION AUTHENTIC PRODUCTION ADMINISTRATOR & SANITIZE   ');
  console.log('=============================================================');

  // 1. Provision authentic production administrator
  const prodAdmin = await prisma.consoleActor.upsert({
    where: { id: 'usr-admin-prod' },
    update: {
      email: 'admin@adhome.ductinh.one',
      orgId: 'org-adhome-anphu',
      role: 'ADMIN',
      permissions: ['rooms.publish.write', 'rooms.read', 'leads.read', 'system.admin'],
      buildingScopes: ['*'],
      isActive: true,
    },
    create: {
      id: 'usr-admin-prod',
      email: 'admin@adhome.ductinh.one',
      orgId: 'org-adhome-anphu',
      role: 'ADMIN',
      permissions: ['rooms.publish.write', 'rooms.read', 'leads.read', 'system.admin'],
      buildingScopes: ['*'],
      sessionVersion: 1,
      isActive: true,
    },
  });

  console.log(`[Provisioned] Production Admin: ${prodAdmin.id} (${prodAdmin.email}) | Active: ${prodAdmin.isActive}`);

  // 2. Deactivate development sample actors
  const deactivationResult = await prisma.consoleActor.updateMany({
    where: {
      id: { in: DEV_SAMPLE_ACTOR_IDS },
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  console.log(`[Deactivated] Sample Development Actors: ${deactivationResult.count} actors set to isActive: false`);

  // 3. Remove known leftover test leads (0908889999 and 0901234567) while strictly preserving authentic leads
  const lingeringTestLeads = await prisma.leadInquiry.findMany({
    where: {
      OR: [
        { phone: '0908889999' },
        { phone: '0901234567' },
      ],
    },
    select: { id: true, referenceCode: true, phone: true },
  });

  if (lingeringTestLeads.length > 0) {
    const testIds = lingeringTestLeads.map((l) => l.id);
    await prisma.leadInquiry.deleteMany({
      where: { id: { in: testIds } },
    });
    console.log(`[Cleaned] Purged ${testIds.length} leftover test leads strictly by ID (${lingeringTestLeads.map((l) => l.referenceCode).join(', ')})`);
  }

  // 4. Verification audit
  const [allActors, remainingLeads] = await Promise.all([
    prisma.consoleActor.findMany({ orderBy: { id: 'asc' } }),
    prisma.leadInquiry.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  console.log('\n--- Final Actor Security State ---');
  allActors.forEach((a) => {
    const isSample = DEV_SAMPLE_ACTOR_IDS.includes(a.id);
    const tag = isSample ? '[DEV SAMPLE]' : '[AUTHENTIC PRODUCTION]';
    console.log(`  ${tag} ${a.id} | ${a.email} | Role: ${a.role} | Active: ${a.isActive}`);
  });

  console.log('\n--- Preserved Lead Records ---');
  remainingLeads.forEach((l, idx) => {
    console.log(`  ${idx + 1}. Code: ${l.referenceCode} | Name: ${l.fullName} | Phone: ${l.phone} | Created: ${l.createdAt.toISOString()}`);
  });

  return {
    prodAdmin,
    deactivationCount: deactivationResult.count,
    totalActors: allActors.length,
    activeActors: allActors.filter((a) => a.isActive).map((a) => a.id),
    sampleActorsDeactivated: allActors.filter((a) => DEV_SAMPLE_ACTOR_IDS.includes(a.id)).every((a) => !a.isActive),
    remainingLeadsCount: remainingLeads.length,
  };
}

if (process.argv[1] && process.argv[1].endsWith('provisionProductionAdmin.mjs')) {
  provisionProductionAdmin()
    .then((res) => {
      console.log('\nProvisioning & Sanitization completed:', res.sampleActorsDeactivated ? 'SAFE' : 'RISK');
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error(err);
      prisma.$disconnect().then(() => process.exit(1));
    });
}
