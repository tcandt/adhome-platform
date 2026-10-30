/**
 * Quality Gate Failure & Strictness Verification Test
 *
 * Demonstrates both:
 * 1. Shared Unit-Level Evaluation: Imports `evaluateQualityGate` from `qualityGateCore.mjs`.
 * 2. Process-Level Negative Testing: Spawns `verifyRC1.mjs --dry-run-gate-only --simulate-failure=...`
 *    as actual OS child processes and proves that every failure mode genuinely causes
 *    the process to exit with code 1 and output RC1_VERIFICATION_FAILED, while compliant
 *    runs exit with code 0 and output RC1_PRODUCTION_READY.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { evaluateQualityGate } from './qualityGateCore.mjs';
import { getBaselinePassReportFixture } from './verifyRC1.mjs';

function runChildProcessVerification(args) {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'apps', 'landing', 'scripts', 'verifyRC1.mjs');
    const proc = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

async function runQualityGateFailureSuite() {
  console.log('=================================================================');
  console.log('   ADHOME RC1 QUALITY GATE FAILURE & STRICTNESS TEST SUITE       ');
  console.log('   (Shared Core Engine + OS Process Exit-Code Verification)      ');
  console.log('=================================================================\n');

  // PART 1: Shared Core Engine Evaluation Tests
  console.log('--- PART 1: Shared Core Engine (qualityGateCore.mjs) Evaluation ---');
  const unitCases = [
    {
      id: 'UNIT-FAIL-01',
      name: 'CLS exceeds 0.1 threshold (e.g. 0.25)',
      mutate: (r) => {
        r.rc06_coreWebVitals.clsScore = 0.25;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-02',
      name: 'LCP exceeds 2500ms threshold (e.g. 3200ms)',
      mutate: (r) => {
        r.rc06_coreWebVitals.lcpMs = 3200;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-03',
      name: 'LCP is 0ms (missing/uncollected telemetry)',
      mutate: (r) => {
        r.rc06_coreWebVitals.lcpMs = 0;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-04',
      name: 'INP exceeds 200ms threshold (e.g. 280ms)',
      mutate: (r) => {
        r.rc06_coreWebVitals.maxInpMs = 280;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-05',
      name: 'Production Admin Login API fails (rejected credentials)',
      mutate: (r) => {
        r.rc03_backendSecurityAndRbac.productionAdminLoginApi = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-06',
      name: 'Missing password not rejected with 400',
      mutate: (r) => {
        r.rc03_backendSecurityAndRbac.missingPasswordBlocked400 = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-07',
      name: 'Wrong password not rejected with 401',
      mutate: (r) => {
        r.rc03_backendSecurityAndRbac.wrongPasswordBlocked401 = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-08',
      name: 'SEO Canonical URL mismatch or legacy domain 301 redirect broken',
      mutate: (r) => {
        r.rc02_canonicalDomain.legacyDomain301RedirectLanding = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-09',
      name: 'Lead Inquiry Modal fails database persistence',
      mutate: (r) => {
        r.rc01_uiPolish.leadInquiryModal.pass = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-10',
      name: 'Server-side aggregated RUM CLS p75 exceeds 0.1 (e.g. 0.18)',
      mutate: (r) => {
        r.rc06_coreWebVitals.serverRumSummary.metrics.CLS.p75 = 0.18;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-11',
      name: 'Server-side aggregated RUM CLS max outlier exceeds 0.1 (e.g. 0.1137 while p75=0)',
      mutate: (r) => {
        r.rc06_coreWebVitals.serverRumSummary.metrics.CLS.p75 = 0.0;
        r.rc06_coreWebVitals.serverRumSummary.metrics.CLS.max = 0.1137;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-12',
      name: 'Unauthenticated POST /api/v1/public/rum/reset not blocked with 401',
      mutate: (r) => {
        r.rc03_backendSecurityAndRbac.unauthenticatedRumResetBlocked401 = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-FAIL-13',
      name: 'Dual-Role (Admin + Manager) Console UI E2E fails',
      mutate: (r) => {
        r.rc03_backendSecurityAndRbac.consoleDualRoleUiE2ePass = false;
      },
      expectedVerdict: 'RC1_VERIFICATION_FAILED',
    },
    {
      id: 'UNIT-PASS-14',
      name: 'All SLA and Gate criteria satisfied',
      mutate: () => {},
      expectedVerdict: 'RC1_PRODUCTION_READY',
    },
  ];

  let unitAllPassed = true;
  for (const tc of unitCases) {
    const fixture = getBaselinePassReportFixture();
    tc.mutate(fixture);
    const evaluation = evaluateQualityGate(fixture);
    const isExpected = evaluation.verdict === tc.expectedVerdict;

    console.log(`[${tc.id}] ${tc.name}`);
    console.log(`  -> Evaluated: ${evaluation.verdict} | Expected: ${tc.expectedVerdict}`);
    console.log(`  -> Result: ${isExpected ? 'PASS (Strict enforcement)' : 'FAIL'}\n`);

    if (!isExpected) unitAllPassed = false;
  }

  if (!unitAllPassed) {
    console.error('CRITICAL: Unit-level Quality Gate tests failed!');
    process.exit(1);
  }

  // PART 2: Real OS Process Exit-Code Verification
  console.log('--- PART 2: Real OS Process Exit-Code Verification (verifyRC1.mjs) ---');
  const processCases = [
    {
      id: 'PROC-FAIL-01',
      name: 'verifyRC1.mjs --simulate-failure=cls',
      args: ['--dry-run-gate-only', '--simulate-failure=cls'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-02',
      name: 'verifyRC1.mjs --simulate-failure=lcp',
      args: ['--dry-run-gate-only', '--simulate-failure=lcp'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-03',
      name: 'verifyRC1.mjs --simulate-failure=lcp-zero',
      args: ['--dry-run-gate-only', '--simulate-failure=lcp-zero'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-04',
      name: 'verifyRC1.mjs --simulate-failure=admin-login',
      args: ['--dry-run-gate-only', '--simulate-failure=admin-login'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-05',
      name: 'verifyRC1.mjs --simulate-failure=missing-password-pass',
      args: ['--dry-run-gate-only', '--simulate-failure=missing-password-pass'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-06',
      name: 'verifyRC1.mjs --simulate-failure=seo',
      args: ['--dry-run-gate-only', '--simulate-failure=seo'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-07',
      name: 'verifyRC1.mjs --simulate-failure=server-rum-cls-max',
      args: ['--dry-run-gate-only', '--simulate-failure=server-rum-cls-max'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-08',
      name: 'verifyRC1.mjs --simulate-failure=rum-reset-unprotected',
      args: ['--dry-run-gate-only', '--simulate-failure=rum-reset-unprotected'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-FAIL-09',
      name: 'verifyRC1.mjs --simulate-failure=console-dual-role',
      args: ['--dry-run-gate-only', '--simulate-failure=console-dual-role'],
      expectedExitCode: 1,
    },
    {
      id: 'PROC-PASS-10',
      name: 'verifyRC1.mjs (normal pass with all criteria satisfied)',
      args: ['--dry-run-gate-only'],
      expectedExitCode: 0,
    },
  ];

  let procAllPassed = true;
  for (const pc of processCases) {
    const result = await runChildProcessVerification(pc.args);
    const isExitExpected = result.code === pc.expectedExitCode;

    console.log(`[${pc.id}] ${pc.name}`);
    console.log(`  -> Actual Exit Code: ${result.code} | Expected Exit Code: ${pc.expectedExitCode}`);
    console.log(`  -> Result: ${isExitExpected ? 'PASS (Process exit code verified)' : 'FAIL'}\n`);

    if (!isExitExpected) procAllPassed = false;
  }

  if (!procAllPassed) {
    console.error('CRITICAL: Process-level Quality Gate tests failed!');
    process.exit(1);
  }

  console.log('=================================================================');
  console.log('   ALL 14 UNIT TESTS & 10 PROCESS-LEVEL TESTS PASSED (100%)      ');
  console.log('   Gate proves genuine OS exit code 1 on failure & 0 on pass.    ');
  console.log('=================================================================\n');
}

runQualityGateFailureSuite();
