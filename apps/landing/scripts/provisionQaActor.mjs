import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hashPassword, validatePasswordPolicy } from '../server/passwordHash.ts';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

async function main() {
  const email = 'automation.qa@adhome.internal';
  const rawPassword = 'AutomationQA@2026!SecureTest';
  const hashed = await hashPassword(rawPassword);

  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error('No org found');

  const actor = await prisma.consoleActor.upsert({
    where: { email },
    create: {
      id: 'usr-automation-qa',
      orgId: org.id,
      email,
      passwordHash: hashed.encoded,
      role: 'ADMIN',
      displayName: 'Automation QA Operator',
      isActive: true,
      permissions: ['*'],
      assignedBuildingIds: [],
    },
    update: {
      passwordHash: hashed.encoded,
      isActive: true,
      role: 'ADMIN',
      permissions: ['*'],
    },
  });

  console.log('SUCCESS: Provisioned QA Actor', actor.email);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
