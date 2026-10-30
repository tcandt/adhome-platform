/**
 * Quality Gate Core Evaluation Engine for AdHome Landing RC1
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

  // RC-02: Canonical Domain & SEO Metadata
  const rc02 = report?.rc02_canonicalDomain;
  if (!rc02?.pass) {
    issues.push('RC-02: Canonical domain or SEO metadata gate failed.');
  }

  // RC-03: Backend Security, RBAC & Authentic Admin Authentication
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

  // RC-06: Core Web Vitals (CWV)
  const rc06 = report?.rc06_coreWebVitals;
  if (!rc06) {
    issues.push('RC-06: Core Web Vitals telemetry missing.');
  } else {
    // LCP must be strictly valid (> 0) and <= 2500ms
    if (typeof rc06.lcpMs !== 'number' || rc06.lcpMs <= 0 || rc06.lcpMs > 2500) {
      issues.push(`RC-06: LCP must be > 0 and <= 2500ms (measured: ${rc06.lcpMs}ms).`);
    }

    // CLS must be strictly >= 0 and <= 0.1
    if (typeof rc06.clsScore !== 'number' || rc06.clsScore < 0 || rc06.clsScore > 0.1) {
      issues.push(`RC-06: CLS must be <= 0.1 (measured: ${rc06.clsScore}).`);
    }

    // Max INP must be strictly > 0 and <= 200ms
    if (typeof rc06.maxInpMs !== 'number' || rc06.maxInpMs <= 0 || rc06.maxInpMs > 200) {
      issues.push(`RC-06: Max INP must be > 0 and <= 200ms (measured: ${rc06.maxInpMs}ms).`);
    }

    // Server RUM CLS p75 must be <= 0.1 (when RUM samples exist)
    const serverCls = rc06.serverRumSummary?.metrics?.CLS;
    if (serverCls && serverCls.count > 0 && typeof serverCls.p75 === 'number' && serverCls.p75 > 0.1) {
      issues.push(`RC-06: Server RUM aggregated CLS p75 exceeds 0.1 threshold (measured: ${serverCls.p75}).`);
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

