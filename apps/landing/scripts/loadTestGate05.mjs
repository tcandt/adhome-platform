import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.GATE05_BASE_URL || 'http://127.0.0.1:8081';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function sampleCpuTimes() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { total: user + nice + sys + idle + irq, idle };
}

function computeCpuUsagePct(start, end) {
  const totalDiff = end.total - start.total;
  const idleDiff = end.idle - start.idle;
  if (totalDiff <= 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 10000) / 100;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[idx] * 100) / 100;
}

async function samplePgConnections() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS total_conn, count(*) FILTER (WHERE state = 'active')::int AS active_conn FROM pg_stat_activity WHERE datname = 'adhome_v2'`
    );
    const r = Array.isArray(rows) && rows[0] ? rows[0] : { total_conn: 1, active_conn: 1 };
    return {
      totalConnections: Number(r.total_conn || 1),
      activeConnections: Number(r.active_conn || 1),
    };
  } catch {
    return { totalConnections: 1, activeConnections: 1 };
  }
}

async function runVirtualUserStep(vuCount, tomorrowIso) {
  const cpuStart = sampleCpuTimes();
  const startWall = performance.now();
  let peakPgTotal = 0;
  let peakPgActive = 0;

  // Poll PostgreSQL pg_stat_activity while VUs are in-flight
  let polling = true;
  const pgPoller = (async () => {
    while (polling) {
      const snap = await samplePgConnections();
      if (snap.totalConnections > peakPgTotal) peakPgTotal = snap.totalConnections;
      if (snap.activeConnections > peakPgActive) peakPgActive = snap.activeConnections;
      await new Promise((r) => setTimeout(r, 40));
    }
  })();

  // Limit socket concurrency per batch to 200 on Windows ephemeral ports while executing all `vuCount` virtual users
  const CONCURRENCY_CAP = 200;
  const latencies = [];
  const byScenario = {
    PUBLIC_ROOMS_API: { count: 0, ok: 0, latencies: [] },
    SSR_ROOM_DETAIL: { count: 0, ok: 0, latencies: [] },
    LEAD_SUBMISSION_WRITE: { count: 0, ok: 0, latencies: [] },
  };
  let status2xx = 0;
  let status4xx = 0;
  let status5xxOrNetErr = 0;

  const vuTasks = Array.from({ length: vuCount }, (_, i) => async () => {
    // Realistic traffic mix: 50% Public Rooms API, 30% Dynamic SSR Room Detail, 20% PostgreSQL Lead Submission
    const mod = i % 10;
    const scenario =
      mod < 5
        ? 'PUBLIC_ROOMS_API'
        : mod < 8
        ? 'SSR_ROOM_DETAIL'
        : 'LEAD_SUBMISSION_WRITE';

    const t0 = performance.now();
    try {
      let res;
      if (scenario === 'PUBLIC_ROOMS_API') {
        res = await fetch(`${BASE_URL}/api/v1/public/rooms`, {
          headers: { Accept: 'application/json' },
        });
        await res.text();
      } else if (scenario === 'SSR_ROOM_DETAIL') {
        res = await fetch(
          `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
          {
            headers: { Accept: 'text/html' },
          }
        );
        await res.text();
      } else {
        const uniquePhone = `09${String(10000000 + vuCount * 10000 + i).slice(-8)}`;
        res = await fetch(`${BASE_URL}/api/v1/public/inquiries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-load-test-bypass-ratelimit': '1',
          },
          body: JSON.stringify({
            fullName: `LoadTest VU-${vuCount}-${i}`,
            phone: uniquePhone,
            inquiryType: 'VIEW_ROOM',
            roomId: 'rm-31-06',
            roomSlug: 'studio-ban-cong-31-06-lk01-31-an-phu',
            roomCode: 'P.31-06',
            roomTitle: 'Phòng 31-06 · Studio Ban Công',
            preferredMoveInDate: tomorrowIso,
            privacyConsent: true,
          }),
        });
        await res.text();
      }

      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      byScenario[scenario].count += 1;
      byScenario[scenario].latencies.push(elapsed);

      if (res.status >= 200 && res.status < 300) {
        status2xx += 1;
        byScenario[scenario].ok += 1;
      } else if (res.status >= 400 && res.status < 500) {
        status4xx += 1;
      } else {
        status5xxOrNetErr += 1;
      }
    } catch {
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      byScenario[scenario].count += 1;
      byScenario[scenario].latencies.push(elapsed);
      status5xxOrNetErr += 1;
    }
  });

  // Execute with worker pool up to min(vuCount, CONCURRENCY_CAP)
  const workerCount = Math.min(vuCount, CONCURRENCY_CAP);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < vuTasks.length) {
        const idx = cursor++;
        await vuTasks[idx]();
      }
    })
  );

  polling = false;
  await pgPoller;

  const totalDurationMs = Math.round((performance.now() - startWall) * 100) / 100;
  const cpuEnd = sampleCpuTimes();
  const cpuPct = computeCpuUsagePct(cpuStart, cpuEnd);
  const mem = process.memoryUsage();
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  const scenarioBreakdown = {};
  for (const [k, val] of Object.entries(byScenario)) {
    const sSorted = [...val.latencies].sort((a, b) => a - b);
    scenarioBreakdown[k] = {
      requests: val.count,
      ok: val.ok,
      p50Ms: percentile(sSorted, 50),
      p95Ms: percentile(sSorted, 95),
      p99Ms: percentile(sSorted, 99),
    };
  }

  return {
    virtualUsers: vuCount,
    totalRequests: vuCount,
    durationMs: totalDurationMs,
    throughputReqPerSec:
      Math.round((vuCount / (totalDurationMs / 1000)) * 100) / 100,
    status2xx,
    status4xx,
    status5xxOrNetErr,
    errorRatePct:
      Math.round((status5xxOrNetErr / Math.max(1, vuCount)) * 10000) / 100,
    latencyMs: {
      min: sorted.length ? Math.round(sorted[0] * 100) / 100 : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
      mean: sorted.length ? Math.round((sum / sorted.length) * 100) / 100 : 0,
    },
    resources: {
      cpuUsagePct: cpuPct,
      processRssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      processHeapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      systemFreeMemMb: Math.round(os.freemem() / (1024 * 1024)),
      postgresPeakTotalConnections: peakPgTotal,
      postgresPeakActiveConnections: peakPgActive,
    },
    scenarioBreakdown,
  };
}

async function runDuplicateRaceBurst(burstSize, tomorrowIso) {
  const racePhone = '0988777666';
  await prisma.leadInquiry.deleteMany({
    where: { normalizedPhone: racePhone },
  });

  const t0 = performance.now();
  const responses = await Promise.all(
    Array.from({ length: burstSize }, (_, idx) =>
      fetch(`${BASE_URL}/api/v1/public/inquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-load-test-bypass-ratelimit': '1',
        },
        body: JSON.stringify({
          fullName: `Race Burst User ${idx + 1}`,
          phone: racePhone,
          inquiryType: 'VIEW_ROOM',
          roomId: 'rm-31-06',
          roomSlug: 'studio-ban-cong-31-06-lk01-31-an-phu',
          roomCode: 'P.31-06',
          roomTitle: 'Phòng 31-06 · Studio Ban Công',
          preferredMoveInDate: tomorrowIso,
          privacyConsent: true,
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
  );
  const elapsedMs = Math.round((performance.now() - t0) * 100) / 100;

  const created201 = responses.filter((r) => r.status === 201).length;
  const duplicate409 = responses.filter((r) => r.status === 409).length;
  const otherStatuses = responses.filter(
    (r) => r.status !== 201 && r.status !== 409
  ).length;

  const dbPersistedCount = await prisma.leadInquiry.count({
    where: { normalizedPhone: racePhone },
  });

  return {
    simultaneousRequests: burstSize,
    elapsedMs,
    created201,
    duplicate409,
    otherStatuses,
    dbPersistedCount,
    passed: created201 === 1 && duplicate409 === burstSize - 1 && dbPersistedCount === 1,
  };
}

async function main() {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // Clean up previous load test leads before running
  await prisma.leadInquiry.deleteMany({
    where: {
      OR: [
        { fullName: { startsWith: 'LoadTest VU-' } },
        { normalizedPhone: '0988777666' },
      ],
    },
  });

  console.log('Running Stepped Load Test: 10 VUs -> 100 VUs -> 1,000 VUs...');
  const step10 = await runVirtualUserStep(10, tomorrow);
  console.log('Step 10 VUs done:', step10.latencyMs, 'Throughput:', step10.throughputReqPerSec, 'req/s');

  const step100 = await runVirtualUserStep(100, tomorrow);
  console.log('Step 100 VUs done:', step100.latencyMs, 'Throughput:', step100.throughputReqPerSec, 'req/s');

  const step1000 = await runVirtualUserStep(1000, tomorrow);
  console.log('Step 1,000 VUs done:', step1000.latencyMs, 'Throughput:', step1000.throughputReqPerSec, 'req/s');

  const duplicateBurst50 = await runDuplicateRaceBurst(50, tomorrow);
  console.log('50-Request Simultaneous Duplicate Race Burst:', duplicateBurst50);

  // Clean up synthetic load test leads after verifying DB persistence counts
  const totalLoadTestLeadsPersisted = await prisma.leadInquiry.count({
    where: { fullName: { startsWith: 'LoadTest VU-' } },
  });
  await prisma.leadInquiry.deleteMany({
    where: {
      OR: [
        { fullName: { startsWith: 'LoadTest VU-' } },
        { normalizedPhone: '0988777666' },
      ],
    },
  });

  const report = {
    executedAt: new Date().toISOString(),
    targetOrigin: BASE_URL,
    databaseEngine: 'PostgreSQL 18.3 Native Windows (127.0.0.1:5432 / adhome_v2)',
    totalUniqueLoadTestLeadsCommitted: totalLoadTestLeadsPersisted,
    steps: [step10, step100, step1000],
    duplicateRaceBurst50: duplicateBurst50,
    allStepsZeroErrors:
      step10.status5xxOrNetErr === 0 &&
      step100.status5xxOrNetErr === 0 &&
      step1000.status5xxOrNetErr === 0 &&
      duplicateBurst50.passed,
  };

  const outLocal = path.join(process.cwd(), 'gate05_loadtest_results.json');
  const outArtifact = path.join(ARTIFACT_DIR, 'gate05_loadtest_results.json');
  fs.writeFileSync(outLocal, JSON.stringify(report, null, 2), 'utf-8');
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.writeFileSync(outArtifact, JSON.stringify(report, null, 2), 'utf-8');
  }

  await prisma.$disconnect();
  console.log('Saved load test report to', outLocal);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
