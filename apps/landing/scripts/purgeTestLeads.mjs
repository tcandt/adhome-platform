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

export async function purgeTestLeads() {
  const result = await prisma.leadInquiry.deleteMany({
    where: {
      OR: [
        { fullName: { startsWith: 'RC1' } },
        { fullName: { startsWith: 'Spam' } },
        { fullName: { startsWith: 'Nguyen Van RC1' } },
        { phone: '0908889999' },
        { phone: '0901234567' },
      ],
    },
  });
  console.log(`Purged ${result.count} automated test lead records.`);
  const remaining = await prisma.leadInquiry.count();
  console.log(`Remaining legitimate leads: ${remaining}`);
  return { purged: result.count, remaining };
}

if (process.argv[1] && process.argv[1].endsWith('purgeTestLeads.mjs')) {
  purgeTestLeads()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

