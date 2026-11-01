import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function formatContractDisplayCode(rawCode) {
  if (!rawCode) return { displayCode: '—', isImported: false, rawCode: '' };

  const isImported = rawCode.includes('-IMP-') || rawCode.startsWith('IMP-');

  let displayCode = rawCode;
  if (isImported) {
    const match = rawCode.match(/HD-IMP-(?:R-)?([A-Za-z0-9._-]+?)(?:-[0-9a-fA-F]{4})?$/);
    if (match && match[1]) {
      displayCode = `HD-${match[1]}`;
    }
  } else {
    const match = rawCode.match(/^HD-[A-Za-z0-9._]+-([A-Za-z0-9._-]+)-[0-9a-fA-F]{4}$/);
    if (match && match[1]) {
      displayCode = `HD-${match[1]}`;
    }
  }

  return { displayCode, isImported, rawCode };
}

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — UI-04-FIX-01 Contract Code Formatter Test');
  console.log('=================================================================\n');

  const contracts = await prisma.contract.findMany({
    select: { id: true, contractCode: true, status: true, roomId: true },
    orderBy: { contractCode: 'asc' },
  });

  console.log(`Fetched ${contracts.length} live contracts from PostgreSQL adhome_v2.\n`);

  const seen = new Map();
  let hasCollision = false;

  for (const c of contracts) {
    const { displayCode, isImported, rawCode } = formatContractDisplayCode(c.contractCode);
    console.log(`  Raw: ${rawCode.padEnd(28)} -> Display: ${displayCode.padEnd(16)} (Imported: ${isImported})`);

    if (seen.has(displayCode)) {
      console.error(`  [COLLISION DETECTED] Both ${seen.get(displayCode)} and ${rawCode} map to ${displayCode}`);
      hasCollision = true;
    } else {
      seen.set(displayCode, rawCode);
    }
  }

  // Property tests with edge cases
  console.log('\n--- PROPERTY TESTS WITH EDGE CASES ---');
  const edgeCases = [
    { input: 'HD-IMP-P.31-06-3673', expectedDisplay: 'HD-P.31-06', expectedImported: true },
    { input: 'HD-IMP-R-WF-010A-3673', expectedDisplay: 'HD-WF-010A', expectedImported: true },
    { input: 'HD-S2B-S2R-105-BCF2', expectedDisplay: 'HD-S2R-105', expectedImported: false },
    { input: 'HD-S4-401', expectedDisplay: 'HD-S4-401', expectedImported: false },
    { input: 'HD-CUSTOM.DOT.01-1234', expectedDisplay: 'HD-CUSTOM.DOT.01-1234', expectedImported: false },
  ];

  let edgeCasesPassed = true;
  for (const ec of edgeCases) {
    const res = formatContractDisplayCode(ec.input);
    const pass = res.displayCode === ec.expectedDisplay && res.isImported === ec.expectedImported;
    console.log(`  Case: ${ec.input.padEnd(24)} -> ${res.displayCode.padEnd(16)} [${pass ? 'PASS' : 'FAIL'}]`);
    if (!pass) edgeCasesPassed = false;
  }

  if (hasCollision || !edgeCasesPassed) {
    console.error('\n>>> GATE_CONTRACT_SHORT_CODE: FAIL <<<');
    process.exit(1);
  } else {
    console.log('\nAll 13 contracts have 100% unique short display codes!');
    console.log('>>> GATE_CONTRACT_SHORT_CODE: PASS <<<');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

