/**
 * Quality Gate Core Evaluation Engine for AdHome Landing & Console RC1
 * Shared strictly between verifyRC1.mjs (positive production run) and
 * verifyQualityGateFailure.mjs (negative failure validation suite).
 *
 * Guarantees zero logic drift between production verification and gate testing.
 */

export function evaluateQualityGate(report) {
  const issues = [];

  // RC-01: UI Polish & Usability
  const rc01 = report?.rc01_uiPolish;
  if (!rc01?.mobileNavigation?.pass) {
    issues.push('RC-01: Mobile navigation usability gate failed.');
  }
  if (!rc01?.leadInquiryModal?.pass) {
    issues.push('RC-01: Lead inquiry modal or database persistence gate failed.');
  }

  // RC-02: Official Domain Migration (adhome.vn & console.adhome.vn) + Legacy 301 Redirects
  const rc02 = report?.rc02_canonicalDomain;
  if (!rc02?.pass) {
    issues.push('RC-02: Canonical domain (adhome.vn / console.adhome.vn) or SEO metadata gate failed.');
  }
  if (rc02?.legacyDomain301RedirectLanding !== true) {
    issues.push('RC-02: Legacy domain adhome.ductinh.one -> https://adhome.vn 301 redirect failed.');
  }
  if (rc02?.legacyDomain301RedirectConsole !== true) {
    issues.push('RC-02: Legacy domain console-adhome.ductinh.one -> https://console.adhome.vn 301 redirect failed.');
  }

  // RC-03: Backend Security, Cookie/CSRF Hardening & Dual-Role (Admin + Manager) RBAC
  const rc03 = report?.rc03_backendSecurityAndRbac;
  if (!rc03?.pass) {
    issues.push('RC-03: Backend security, RBAC or authentication gate failed.');
  }
  if (rc03?.productionAdminLoginApi !== true) {
    issues.push('RC-03: Production Admin Login API with scrypt password verification did not pass.');
  }
  if (rc03?.missingPasswordBlocked400 !== true) {
    issues.push('RC-03: Missing password rejection gate failed (must return 400).');
  }
  if (rc03?.wrongPasswordBlocked401 !== true) {
    issues.push('RC-03: Wrong password rejection gate failed (must return 401).');
  }
  if (rc03?.inactiveSampleActorLoginBlocked401 !== true) {
    issues.push('RC-03: Deactivated sample actor login rejection gate failed (must return 401).');
  }
  if (rc03?.unauthenticatedRumResetBlocked401 !== true) {
    issues.push('RC-03: Unauthenticated POST /api/v1/public/rum/reset must be blocked with 401.');
  }
  if (rc03?.managerRumResetForbidden403 !== true) {
    issues.push('RC-03: Non-Admin POST /api/v1/public/rum/reset must be forbidden with 403.');
  }
  if (rc03?.consoleDualRoleUiE2ePass !== true) {
    issues.push('RC-03: Unified /login & Dual-Role (Admin + Manager) Console E2E verification failed.');
  }

  // RC-04: Sustained Load Testing
  const rc04 = report?.rc04_sustainedLoadTesting;
  if (!rc04?.pass) {
    issues.push('RC-04: Sustained load testing or concurrency benchmark gate failed.');
  }

  // RC-05: Database Integrity & Dynamic SEO
  const rc05 = report?.rc05_databaseAndSeo;
  if (!rc05?.pass) {
    issues.push('RC-05: Native PostgreSQL backup/restore or dynamic SEO invariants failed.');
  }

  // RC-06: Core Web Vitals (CWV) — Strict p75 AND max CLS enforcement
  const rc06 = report?.rc06_coreWebVitals;
  if (!rc06) {
    issues.push('RC-06: Core Web Vitals telemetry missing.');
  } else {
    if (typeof rc06.lcpMs !== 'number' || rc06.lcpMs <= 0 || rc06.lcpMs > 2500) {
      issues.push(`RC-06: LCP must be > 0 and <= 2500ms (measured: ${rc06.lcpMs}ms).`);
    }

    if (typeof rc06.clsScore !== 'number' || rc06.clsScore < 0 || rc06.clsScore > 0.1) {
      issues.push(`RC-06: CLS must be <= 0.1 (measured: ${rc06.clsScore}).`);
    }

    if (typeof rc06.maxInpMs !== 'number' || rc06.maxInpMs <= 0 || rc06.maxInpMs > 200) {
      issues.push(`RC-06: Max INP must be > 0 and <= 200ms (measured: ${rc06.maxInpMs}ms).`);
    }

    const serverCls = rc06.serverRumSummary?.metrics?.CLS;
    if (serverCls && serverCls.count > 0) {
      if (typeof serverCls.p75 === 'number' && serverCls.p75 > 0.1) {
        issues.push(`RC-06: Server RUM aggregated CLS p75 exceeds 0.1 threshold (measured: ${serverCls.p75}).`);
      }
      if (typeof serverCls.max === 'number' && serverCls.max > 0.1) {
        issues.push(`RC-06: Server RUM aggregated CLS max outlier exceeds 0.1 threshold (measured: ${serverCls.max}).`);
      }
    }

    if (!rc06.pass) {
      issues.push('RC-06: Sub-gate rc06_coreWebVitals.pass evaluated to false.');
    }
  }

  const passed = issues.length === 0;

  return {
    passed,
    verdict: passed ? 'RC1_PRODUCTION_READY' : 'RC1_VERIFICATION_FAILED',
    issues,
  };
}
