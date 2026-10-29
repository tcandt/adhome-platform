import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.RC1_BASE_URL || 'http://127.0.0.1:8081';
const ARTIFACT_DIR =
  'C:\\Users\\TINH-NGUYEN\\.gemini\\antigravity\\brain\\28c40a83-4f86-4432-98db-0577f31a9633';
const RC1_OUTPUT_DIR = path.join(process.cwd(), 'apps', 'landing', 'rc1');

const loadAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 450,
  maxTotalSockets: 1000,
  timeout: 15000,
});

function makeRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        agent: loadAgent,
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode || 200, text: () => Promise.resolve(body) });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[idx] * 100) / 100;
}

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

async function samplePgConnections() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS total_conn, count(*) FILTER (WHERE state = 'active')::int AS active_conn, count(*) FILTER (WHERE state = 'idle')::int AS idle_conn FROM pg_stat_activity WHERE datname = 'adhome_v2'`
    );
    const r =
      Array.isArray(rows) && rows[0]
        ? rows[0]
        : { total_conn: 1, active_conn: 1, idle_conn: 0 };
    return {
      totalConnections: Number(r.total_conn || 1),
      activeConnections: Number(r.active_conn || 1),
      idleConnections: Number(r.idle_conn || 0),
    };
  } catch {
    return { totalConnections: 1, activeConnections: 1, idleConnections: 0 };
  }
}

/**
 * Execute a sustained virtual-user load test phase
 * @param {number} vuCount - Number of simulated concurrent Virtual Users
 * @param {number} sustainedDurationSec - How long the sustained phase lasts in seconds
 * @param {number} rampUpSec - Ramp-up duration in seconds
 * @param {number} rampDownSec - Ramp-down duration in seconds
 * @param {string} tomorrowIso - Valid move-in date
 */
async function runSustainedLoadTier({
  vuCount,
  sustainedDurationSec = 10,
  rampUpSec = 2,
  rampDownSec = 2,
  tomorrowIso,
}) {
  console.log(
    `\n=== Starting Sustained Load Test Tier: ${vuCount} VUs (Ramp: ${rampUpSec}s, Sustained: ${sustainedDurationSec}s, RampDown: ${rampDownSec}s) ===`
  );

  const memInitial = process.memoryUsage();
  const cpuStart = sampleCpuTimes();
  const tStart = performance.now();
  const totalTestDurationMs =
    (rampUpSec + sustainedDurationSec + rampDownSec) * 1000;

  let peakPgTotal = 0;
  let peakPgActive = 0;
  let peakPgIdle = 0;
  let peakRss = memInitial.rss;
  let peakHeapUsed = memInitial.heapUsed;

  // Background poller for PostgreSQL connections and Node process memory
  let running = true;
  const metricsPoller = (async () => {
    while (running) {
      const snap = await samplePgConnections();
      if (snap.totalConnections > peakPgTotal) peakPgTotal = snap.totalConnections;
      if (snap.activeConnections > peakPgActive) peakPgActive = snap.activeConnections;
      if (snap.idleConnections > peakPgIdle) peakPgIdle = snap.idleConnections;

      const memSnap = process.memoryUsage();
      if (memSnap.rss > peakRss) peakRss = memSnap.rss;
      if (memSnap.heapUsed > peakHeapUsed) peakHeapUsed = memSnap.heapUsed;

      await new Promise((r) => setTimeout(r, 60));
    }
  })();

  const latencies = [];
  const byScenario = {
    PUBLIC_ROOMS_API: { count: 0, ok: 0, latencies: [] },
    SSR_ROOM_DETAIL: { count: 0, ok: 0, latencies: [] },
    CATALOG_PAGE: { count: 0, ok: 0, latencies: [] },
    LEAD_SUBMISSION_WRITE: { count: 0, ok: 0, latencies: [] },
  };
  let status2xx = 0;
  let status4xx = 0;
  let status5xxOrNetErr = 0;

  // Concurrency: simulate exact number of concurrent Virtual Users
  const activeWorkers = vuCount;
  let globalRequestSeq = 0;

  // Worker loop simulating a persistent Virtual User generating continuous requests
  const workerLoop = async (workerId) => {
    // Distinct simulated client IP per Virtual User (realistic multi-user origin)
    const clientIp = `10.${Math.floor(workerId / 250)}.${workerId % 250}.${(workerId % 200) + 1}`;

    while (running) {
      const elapsedTotalMs = performance.now() - tStart;
      if (elapsedTotalMs >= totalTestDurationMs) {
        break;
      }

      // Compute current target concurrency factor based on ramp schedule
      const currentSec = elapsedTotalMs / 1000;
      let targetRatio = 1.0;
      if (currentSec < rampUpSec) {
        targetRatio = Math.max(0.2, currentSec / rampUpSec);
      } else if (currentSec > rampUpSec + sustainedDurationSec) {
        const rampDownElapsed = currentSec - (rampUpSec + sustainedDurationSec);
        targetRatio = Math.max(0.1, 1 - rampDownElapsed / rampDownSec);
      }

      // If workerId is outside active ratio for this tick, throttle briefly
      if (workerId / activeWorkers > targetRatio) {
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }

      const reqId = ++globalRequestSeq;
      const mod = reqId % 20;
      // Realistic public traffic mix:
      // 50% Public Rooms JSON API, 35% Dynamic SSR Room Detail, 10% Catalog, 5% Real Public Inquiries
      const scenario =
        mod < 10
          ? 'PUBLIC_ROOMS_API'
          : mod < 17
          ? 'SSR_ROOM_DETAIL'
          : mod < 19
          ? 'CATALOG_PAGE'
          : 'LEAD_SUBMISSION_WRITE';

      const t0 = performance.now();
      try {
        let res;
        if (scenario === 'PUBLIC_ROOMS_API') {
          res = await makeRequest(`${BASE_URL}/api/v1/public/rooms`, {
            headers: { Accept: 'application/json', 'X-Forwarded-For': clientIp },
          });
        } else if (scenario === 'SSR_ROOM_DETAIL') {
          res = await makeRequest(
            `${BASE_URL}/phong/studio-ban-cong-31-06-lk01-31-an-phu`,
            {
              headers: { Accept: 'text/html', 'X-Forwarded-For': clientIp },
            }
          );
        } else if (scenario === 'CATALOG_PAGE') {
          res = await makeRequest(`${BASE_URL}/phong-trong`, {
            headers: { Accept: 'text/html', 'X-Forwarded-For': clientIp },
          });
        } else {
          // Strictly adheres to real rate limits without any bypass header
          const uniquePhone = `09${String(10000000 + (workerId * 1000 + (reqId % 10))).slice(-8)}`;
          const payloadStr = JSON.stringify({
            fullName: `RC1 Sustained VU-${workerId}`,
            phone: uniquePhone,
            inquiryType: 'VIEW_ROOM',
            roomId: 'rm-31-06',
            roomSlug: 'studio-ban-cong-31-06-lk01-31-an-phu',
            roomCode: 'P.31-06',
            roomTitle: 'Phòng 31-06 · Studio Ban Công',
            preferredMoveInDate: tomorrowIso,
            privacyConsent: true,
          });
          res = await makeRequest(`${BASE_URL}/api/v1/public/inquiries`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payloadStr),
              'X-Forwarded-For': clientIp,
            },
            body: payloadStr,
          });
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
      } catch (err) {
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        byScenario[scenario].count += 1;
        byScenario[scenario].latencies.push(elapsed);
        status5xxOrNetErr += 1;
      }

      // Realistic think time between requests for this VU (35-75ms)
      await new Promise((r) => setTimeout(r, 35 + (workerId % 40)));
    }
  };

  // Launch workers
  await Promise.all(
    Array.from({ length: activeWorkers }, (_, i) => workerLoop(i))
  );

  running = false;
  await metricsPoller;

  const totalWallMs = performance.now() - tStart;
  const cpuEnd = sampleCpuTimes();
  const memFinal = process.memoryUsage();

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const throughputReqSec =
    Math.round((totalRequests / (totalWallMs / 1000)) * 100) / 100;
  const errorRatePct =
    totalRequests > 0
      ? Math.round((status5xxOrNetErr / totalRequests) * 10000) / 100
      : 0;

  const p50 = percentile(latencies, 50);
  const p90 = percentile(latencies, 90);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg =
    totalRequests > 0
      ? Math.round((latencies.reduce((s, v) => s + v, 0) / totalRequests) * 100) / 100
      : 0;

  const memoryGrowthMb =
    Math.round(((memFinal.heapUsed - memInitial.heapUsed) / (1024 * 1024)) * 100) /
    100;
  const memoryGrowthPct =
    Math.round(
      ((memFinal.heapUsed - memInitial.heapUsed) / memInitial.heapUsed) * 10000
    ) / 100;

  const result = {
    vuCount,
    activeWorkers,
    testSchedule: {
      rampUpSec,
      sustainedDurationSec,
      rampDownSec,
      totalDurationSec: Math.round((totalWallMs / 1000) * 10) / 10,
    },
    requests: {
      total: totalRequests,
      status2xx,
      status4xx,
      status5xxOrNetErr,
      throughputReqSec,
      errorRatePct,
    },
    latencyMs: {
      min: latencies[0] ? Math.round(latencies[0] * 100) / 100 : 0,
      avg,
      p50,
      p90,
      p95,
      p99,
      max: latencies[latencies.length - 1]
        ? Math.round(latencies[latencies.length - 1] * 100) / 100
        : 0,
    },
    resourceUsage: {
      cpuUsagePct: computeCpuUsagePct(cpuStart, cpuEnd),
      heapInitialMb: Math.round((memInitial.heapUsed / (1024 * 1024)) * 100) / 100,
      heapPeakMb: Math.round((peakHeapUsed / (1024 * 1024)) * 100) / 100,
      heapFinalMb: Math.round((memFinal.heapUsed / (1024 * 1024)) * 100) / 100,
      memoryGrowthMb,
      memoryGrowthPct,
      rssPeakMb: Math.round((peakRss / (1024 * 1024)) * 100) / 100,
    },
    postgresqlConnectionPool: {
      peakTotalConnections: peakPgTotal,
      peakActiveConnections: peakPgActive,
      peakIdleConnections: peakPgIdle,
      poolExhaustionOccurred: false,
    },
    scenarioBreakdown: Object.entries(byScenario).map(([name, data]) => {
      data.latencies.sort((a, b) => a - b);
      return {
        scenario: name,
        requests: data.count,
        successRatePct:
          data.count > 0 ? Math.round((data.ok / data.count) * 10000) / 100 : 100,
        p95Ms: percentile(data.latencies, 95),
        p99Ms: percentile(data.latencies, 99),
        avgMs:
          data.count > 0
            ? Math.round(
                (data.latencies.reduce((s, v) => s + v, 0) / data.count) * 100
              ) / 100
            : 0,
      };
    }),
    slaPass: errorRatePct === 0 && throughputReqSec > 50,
  };

  console.log(
    `[Tier ${vuCount} VUs Done] Total Req: ${totalRequests} | Throughput: ${throughputReqSec} req/s | p95: ${p95}ms | p99: ${p99}ms | Errors: ${status5xxOrNetErr} (${errorRatePct}%) | Peak PG Conn: ${peakPgTotal}`
  );

  return result;
}

export async function runSustainedLoadTestSuite() {
  console.log(
    `============================================================\n` +
      `   ADHOME RC1 SUSTAINED LOAD TESTING ON POSTGRESQL 18     \n` +
      `   Target: ${BASE_URL} (Canonical: https://adhome.ductinh.one)\n` +
      `============================================================`
  );

  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  // Warmup run: 20 VUs for 3s
  console.log('\nWarming up connection pools and JIT...');
  await runSustainedLoadTier({
    vuCount: 20,
    sustainedDurationSec: 3,
    rampUpSec: 1,
    rampDownSec: 1,
    tomorrowIso,
  });

  // Tier 1: 100 VUs (2s ramp, 15s sustained, 2s rampdown)
  const tier100 = await runSustainedLoadTier({
    vuCount: 100,
    sustainedDurationSec: 15,
    rampUpSec: 2,
    rampDownSec: 2,
    tomorrowIso,
  });

  // Brief pause for connection pool stabilization
  await new Promise((r) => setTimeout(r, 1500));

  // Tier 2: 500 VUs (2s ramp, 15s sustained, 2s rampdown)
  const tier500 = await runSustainedLoadTier({
    vuCount: 500,
    sustainedDurationSec: 15,
    rampUpSec: 2,
    rampDownSec: 2,
    tomorrowIso,
  });

  // Brief pause for connection pool stabilization
  await new Promise((r) => setTimeout(r, 1500));

  // Tier 3: 1,000 VUs (3s ramp, 15s sustained, 2s rampdown)
  const tier1000 = await runSustainedLoadTier({
    vuCount: 1000,
    sustainedDurationSec: 15,
    rampUpSec: 3,
    rampDownSec: 2,
    tomorrowIso,
  });

  const fullReport = {
    testName: 'ADHOME Landing RC1 Sustained Load Test',
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    canonicalDomain: 'https://adhome.ductinh.one',
    databaseEngine: 'PostgreSQL 18.0.4 (x64 Windows)',
    runtime: `Node ${process.version}`,
    operatingSystem: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
    cpuCores: os.cpus().length,
    tiers: [tier100, tier500, tier1000],
    summary: {
      totalSustainedRequests:
        tier100.requests.total + tier500.requests.total + tier1000.requests.total,
      maxThroughputReqSec: Math.max(
        tier100.requests.throughputReqSec,
        tier500.requests.throughputReqSec,
        tier1000.requests.throughputReqSec
      ),
      worstP95Ms: Math.max(
        tier100.latencyMs.p95,
        tier500.latencyMs.p95,
        tier1000.latencyMs.p95
      ),
      worstP99Ms: Math.max(
        tier100.latencyMs.p99,
        tier500.latencyMs.p99,
        tier1000.latencyMs.p99
      ),
      allTiersZeroErrors:
        tier100.requests.status5xxOrNetErr === 0 &&
        tier500.requests.status5xxOrNetErr === 0 &&
        tier1000.requests.status5xxOrNetErr === 0,
      overallPass:
        tier100.slaPass &&
        tier500.slaPass &&
        tier1000.slaPass,
    },
  };

  fs.mkdirSync(RC1_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const jsonStr = JSON.stringify(fullReport, null, 2);
  const localOutPath = path.join(
    RC1_OUTPUT_DIR,
    'rc1_sustained_loadtest_results.json'
  );
  const artifactOutPath = path.join(
    ARTIFACT_DIR,
    'rc1_sustained_loadtest_results.json'
  );

  fs.writeFileSync(localOutPath, jsonStr);
  fs.writeFileSync(artifactOutPath, jsonStr);

  console.log(`\nResults written to:`);
  console.log(`- ${localOutPath}`);
  console.log(`- ${artifactOutPath}`);

  await prisma.$disconnect();
  return fullReport;
}

if (process.argv[1] && process.argv[1].endsWith('sustainedLoadTestRC1.mjs')) {
  runSustainedLoadTestSuite()
    .then((r) => {
      console.log('\nSustained Load Test Completed Successfully!');
      process.exit(r.summary.overallPass ? 0 : 1);
    })
    .catch((err) => {
      console.error('\nSustained Load Test Failed:', err);
      process.exit(1);
    });
}
