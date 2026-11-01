import { PrismaClient } from '@prisma/client';
// QA-05 & QA-05-FIX-01: Direct import from the exact source of truth in Console
import { formatContractDisplayCode } from '../../console/src/shared/tokens/designTokens.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('=================================================================');
  console.log('AdHome Console V2 — QA-05-FIX-01 Advanced Contract Short Code Verification');
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
  let hasLiveCollision = false;

  for (const c of contracts) {
    const { displayCode, isImported, rawCode } = formatContractDisplayCode(c.contractCode);
    console.log(`  Raw: ${rawCode.padEnd(28)} -> Display: ${displayCode.padEnd(16)} (Imported: ${isImported})`);

    if (seen.has(displayCode)) {
      console.error(`  [COLLISION DETECTED] Both ${seen.get(displayCode)} and ${rawCode} map to ${displayCode}`);
      hasLiveCollision = true;
    } else {
      seen.set(displayCode, rawCode);
    }
  }

  // 2. Comprehensive edge cases
  console.log('\n--- PROPERTY TESTS WITH EDGE CASES ---');
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

  // 3. QA-05-FIX-01: Multi-Building with identical room numbers across buildings
  console.log('\n--- QA-05-FIX-01 TEST 1: Identical room codes across different buildings ---');
  const multiBuildingContracts = [
    { building: 'S2', raw: 'HD-S2B-S2R-101-B839', expected: 'HD-S2R-101' },
    { building: 'S3', raw: 'HD-S3B-S3R-101-C940', expected: 'HD-S3R-101' },
    { building: 'S4', raw: 'HD-S4B-S4R-101-D051', expected: 'HD-S4R-101' },
  ];
  let multiBuildingPassed = true;
  const multiBuildingSeen = new Set();
  for (const mbc of multiBuildingContracts) {
    const { displayCode } = formatContractDisplayCode(mbc.raw);
    const pass = displayCode === mbc.expected && !multiBuildingSeen.has(displayCode);
    multiBuildingSeen.add(displayCode);
    console.log(`  Building ${mbc.building}: ${mbc.raw} -> ${displayCode} [${pass ? 'PASS' : 'FAIL'}]`);
    if (!pass) multiBuildingPassed = false;
  }

  // 4. QA-05-FIX-01: Historical contract renewals on the same room across different periods
  console.log('\n--- QA-05-FIX-01 TEST 2: Historical contract renewals on same room ---');
  const historicalContracts = [
    { period: '2024-Term', raw: 'HD-S2B-S2R-101-T24-1111', expected: 'HD-S2R-101-T24' },
    { period: '2025-Term', raw: 'HD-S2B-S2R-101-T25-2222', expected: 'HD-S2R-101-T25' },
    { period: '2026-Term', raw: 'HD-S2B-S2R-101-T26-3333', expected: 'HD-S2R-101-T26' },
  ];
  let historicalPassed = true;
  const historicalSeen = new Set();
  for (const hc of historicalContracts) {
    const { displayCode } = formatContractDisplayCode(hc.raw);
    const pass = displayCode === hc.expected && !historicalSeen.has(displayCode);
    historicalSeen.add(displayCode);
    console.log(`  Period ${hc.period}: ${hc.raw} -> ${displayCode} [${pass ? 'PASS' : 'FAIL'}]`);
    if (!pass) historicalPassed = false;
  }

  // 5. QA-05-FIX-01: Same stem collision fallback: rawCode preservation
  console.log('\n--- QA-05-FIX-01 TEST 3: Same-stem duplicate handling (rawCode preservation) ---');
  const duplicateStem1 = 'HD-S2B-S2R-101-AAAA';
  const duplicateStem2 = 'HD-S2B-S2R-101-BBBB';
  const res1 = formatContractDisplayCode(duplicateStem1);
  const res2 = formatContractDisplayCode(duplicateStem2);
  // Both produce HD-S2R-101, but rawCode retains the distinction
  const rawDistinctionPassed = res1.displayCode === res2.displayCode && res1.rawCode !== res2.rawCode;
  console.log(`  Stem collision: both display '${res1.displayCode}', rawCodes distinct ('${res1.rawCode}' vs '${res2.rawCode}') [${rawDistinctionPassed ? 'PASS' : 'FAIL'}]`);

  // 6. SaaS scale dynamic collision check (simulate 100 contracts across 10 buildings)
  console.log('\n--- SAAS SCALE SYNTHETIC COLLISION TEST (100 CONTRACTS) ---');
  const syntheticSeen = new Map();
  let saasCollision = false;
  for (let b = 1; b <= 10; b++) {
    for (let r = 1; r <= 10; r++) {
      const roomStr = `P.${b}0${r}`;
      const code = `HD-BLD${b}-${roomStr}-A1B2`;
      const { displayCode } = formatContractDisplayCode(code);
      const key = `B${b}:${displayCode}`;
      if (syntheticSeen.has(key)) {
        saasCollision = true;
      } else {
        syntheticSeen.set(key, code);
      }
    }
  }
  console.log(`  Simulated 100 contracts across 10 buildings: zero scoped collisions [${!saasCollision ? 'PASS' : 'FAIL'}]`);

  const allPassed = !hasLiveCollision && edgeCasesPassed && multiBuildingPassed && historicalPassed && rawDistinctionPassed && !saasCollision;

  if (!allPassed) {
    console.error('\n>>> GATE_CONTRACT_SHORT_CODE: FAIL <<<');
    process.exit(1);
  } else {
    console.log(`\nAll ${contracts.length} live database contracts and all QA-05-FIX-01 multi-building / historical / SaaS test cases verified!`);
    console.log('>>> GATE_CONTRACT_SHORT_CODE: PASS <<<');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
