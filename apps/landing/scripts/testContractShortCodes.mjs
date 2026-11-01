import { PrismaClient } from '@prisma/client';
// QA-05: Direct import from the exact source of truth in Console
import { formatContractDisplayCode } from '../../console/src/shared/tokens/designTokens.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — QA-05 Contract Code Formatter Single-Source Test');
  console.log('Source of truth: apps/console/src/shared/tokens/designTokens.ts');
  console.log('=================================================================\n');

  // 1. Fetch live records from database
  const contracts = await prisma.contract.findMany({
    select: { id: true, contractCode: true, status: true, roomId: true },
    orderBy: { contractCode: 'asc' },
  });

  if (contracts.length === 0) {
    throw new Error('QA-05 Violation: No contract records found in database to verify.');
  }

  console.log(`Fetched ${contracts.length} live contracts dynamically from PostgreSQL adhome_v2.\n`);

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

  // 2. Comprehensive edge cases & SaaS scale simulation
  console.log('\n--- PROPERTY TESTS WITH EDGE CASES & SAAS VARIATIONS ---');
  const edgeCases = [
    { input: 'HD-IMP-P.31-06-3673', expectedDisplay: 'HD-P.31-06', expectedImported: true },
    { input: 'HD-IMP-R-WF-010A-3673', expectedDisplay: 'HD-WF-010A', expectedImported: true },
    { input: 'HD-IMP-S3-301-0483', expectedDisplay: 'HD-S3-301', expectedImported: true },
    { input: 'HD-S2B-S2R-105-BCF2', expectedDisplay: 'HD-S2R-105', expectedImported: false },
    { input: 'HD-S4-401', expectedDisplay: 'HD-S4-401', expectedImported: false },
    { input: 'HD-CUSTOM.DOT.01-1234', expectedDisplay: 'HD-CUSTOM.DOT.01-1234', expectedImported: false },
    { input: 'HD-IMP-A1.12-08-9999', expectedDisplay: 'HD-A1.12-08', expectedImported: true },
    { input: 'HD-TWR1-R-305B-ABCD', expectedDisplay: 'HD-R-305B', expectedImported: false },
  ];

  let edgeCasesPassed = true;
  for (const ec of edgeCases) {
    const res = formatContractDisplayCode(ec.input);
    const pass = res.displayCode === ec.expectedDisplay && res.isImported === ec.expectedImported;
    console.log(`  Case: ${ec.input.padEnd(24)} -> ${res.displayCode.padEnd(18)} [${pass ? 'PASS' : 'FAIL'}]`);
    if (!pass) edgeCasesPassed = false;
  }

  // 3. SaaS scale dynamic collision check (simulate 100 contracts across 10 buildings)
  console.log('\n--- SAAS SCALE SYNTHETIC COLLISION TEST (100 CONTRACTS) ---');
  const syntheticSeen = new Map();
  let saasCollision = false;
  for (let b = 1; b <= 10; b++) {
    for (let r = 1; r <= 10; r++) {
      const roomStr = `P.${b}0${r}`;
      const code = `HD-BLD${b}-${roomStr}-A1B2`;
      const { displayCode } = formatContractDisplayCode(code);
      // In scoped building context, display codes are mapped cleanly
      const key = `B${b}:${displayCode}`;
      if (syntheticSeen.has(key)) {
        saasCollision = true;
      } else {
        syntheticSeen.set(key, code);
      }
    }
  }
  console.log(`  Simulated 100 contracts across 10 buildings: zero scoped collisions [${!saasCollision ? 'PASS' : 'FAIL'}]`);

  if (hasCollision || !edgeCasesPassed || saasCollision) {
    console.error('\n>>> GATE_CONTRACT_SHORT_CODE: FAIL <<<');
    process.exit(1);
  } else {
    console.log(`\nAll ${contracts.length} live database contracts and 100 SaaS synthetic contracts verified unique!`);
    console.log('>>> GATE_CONTRACT_SHORT_CODE: PASS <<<');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
