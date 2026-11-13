import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import '../apps/landing/server/envLoader.js';
import {
  calculateContractPeriodRent,
  calculateObligationElectric,
  calculateObligationWater,
  calculateObligationTotals,
  evaluateObligationSafety,
  handleSettlementCenterApi,
} from '../apps/landing/server/settlementCenterApi.ts';

const requireLanding = createRequire(new URL('../apps/landing/package.json', import.meta.url));
const { PrismaClient } = requireLanding('@prisma/client');
const prisma = new PrismaClient();

function createMockReqRes(method, urlPath, bodyObj = null, headers = {}) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const req = new http.IncomingMessage(null);
  req.method = method;
  req.url = urlPath;
  req.headers = {
    'content-type': 'application/json',
    'x-requested-with': 'AdHome-Console-CSRF-v1',
    ...headers,
  };
  req.push(bodyStr);
  req.push(null);

  let statusCode = 200;
  let responseBody = '';
  const res = {
    writeHead(status) {
      statusCode = status;
    },
    setHeader() {},
    end(chunk) {
      if (chunk) responseBody += String(chunk);
    },
  };

  return {
    req,
    res,
    getResult() {
      return {
        status: statusCode,
        data: responseBody ? JSON.parse(responseBody) : null,
      };
    },
  };
}

async function callSettlementEndpoint(actor, scopedBuildingIds, method, urlPath, bodyObj = null) {
  const { req, res, getResult } = createMockReqRes(method, urlPath, bodyObj);
  const urlObj = new URL(urlPath, 'http://127.0.0.1:5173');
  const readJsonBody = async () => (bodyObj ? bodyObj : {});
  const sendJson = (_res, status, payload) => {
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  };

  await handleSettlementCenterApi({
    req,
    res,
    pathname: urlObj.pathname,
    urlObj,
    prisma,
    actor,
    scopedBuildingIds,
    readJsonBody,
    sendJson,
  });

  return getResult();
}

const results = [];
function recordTest(code, name, fn) {
  results.push({ code, name, fn });
}

// ============================================================================
// UNIT TESTS FOR PURE SETTLEMENT ENGINE (TC-01 .. TC-17)
// ============================================================================

recordTest('TC-01', 'Phòng thuê nguyên tháng (Full month rent & deposit exclusion)', async () => {
  const res = calculateContractPeriodRent({
    monthlyRentVnd: 4_500_000,
    periodKey: '2026-11',
    contractStartDate: '2026-01-01',
    contractEndDate: '2026-12-31',
    bookingDepositVnd: 2_000_000,
    contractDepositVnd: 4_500_000,
  });
  assert.equal(res.roomRentVnd, 4_500_000);
  assert.equal(res.activeDays, 30);
  assert.equal(res.isProrated, false);
  assert.equal(res.excludedDepositsVnd, 6_500_000, 'Deposit must be excluded from room rent');
});

recordTest('TC-02', 'Phòng vào ở giữa tháng (Mid-month move-in prorated)', async () => {
  const res = calculateContractPeriodRent({
    monthlyRentVnd: 3_000_000,
    periodKey: '2026-11', // 30 days
    moveInDate: '2026-11-16', // 15 days (16..30)
  });
  assert.equal(res.activeDays, 15);
  assert.equal(res.roomRentVnd, 1_500_000);
  assert.equal(res.prorateReason, 'MID_MONTH_MOVE_IN');
});

recordTest('TC-03', 'Phòng trả giữa tháng (Mid-month move-out prorated)', async () => {
  const res = calculateContractPeriodRent({
    monthlyRentVnd: 3_000_000,
    periodKey: '2026-11', // 30 days
    moveOutDate: '2026-11-10', // 10 days (1..10)
  });
  assert.equal(res.activeDays, 10);
  assert.equal(res.roomRentVnd, 1_000_000);
  assert.equal(res.prorateReason, 'MID_MONTH_MOVE_OUT');
});

recordTest('TC-04', 'Phòng đổi giá thuê giữa kỳ (Mid-period rent rate change)', async () => {
  const res = calculateContractPeriodRent({
    monthlyRentVnd: 4_500_000,
    periodKey: '2026-11', // 30 days
    rateChange: {
      effectiveDayInMonth: 16, // 15 days at 3M + 15 days at 4.5M
      previousRentVnd: 3_000_000,
      newRentVnd: 4_500_000,
    },
  });
  assert.equal(res.prorateReason, 'RATE_CHANGE');
  assert.equal(res.roomRentVnd, 3_750_000);
});

recordTest('TC-05', 'Phòng có công tơ điện tự động (Hunonic auto meter calculation)', async () => {
  const res = calculateObligationElectric({
    method: 'HUNONIC_AUTO',
    startKwh: 1200,
    endKwh: 1350,
    ratePerKwhVnd: 3800,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.consumptionKwh, 150);
  assert.equal(res.electricVnd, 570_000);
});

recordTest('TC-06', 'Phòng nhập điện thủ công (Manual electric meter reading)', async () => {
  const res = calculateObligationElectric({
    method: 'MANUAL',
    startKwh: 410,
    endKwh: 510,
    ratePerKwhVnd: 4000,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.consumptionKwh, 100);
  assert.equal(res.electricVnd, 400_000);
});

recordTest('TC-07', 'Phòng thiếu chỉ số điện (Missing electric reading != 0)', async () => {
  const res = calculateObligationElectric({
    method: 'MANUAL',
    startKwh: 410,
    endKwh: null,
    ratePerKwhVnd: 4000,
  });
  assert.equal(res.status, 'MISSING_DATA');
  assert.equal(res.consumptionKwh, null);
  assert.equal(res.electricVnd, 0);
});

recordTest('TC-08', 'Phòng có chỉ số điện âm (Negative electric delta anomaly)', async () => {
  const res = calculateObligationElectric({
    method: 'MANUAL',
    startKwh: 500,
    endKwh: 450,
    ratePerKwhVnd: 3800,
  });
  assert.equal(res.status, 'ANOMALY');
  assert.equal(res.anomalyCode, 'NEGATIVE_ELECTRIC_DELTA');
  assert.equal(res.consumptionKwh, -50);
  assert.equal(res.electricVnd, 0);
});

recordTest('TC-09', 'Phòng tính nước theo đầu người (Water PER_PERSON)', async () => {
  const res = calculateObligationWater({
    mode: 'PER_PERSON',
    occupantCount: 3,
    waterPricePerPersonVnd: 100_000,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.waterVnd, 300_000);
});

recordTest('TC-10', 'Phòng tính nước theo m³ chưa nhập số khối (Water PER_M3 missing input)', async () => {
  const res = calculateObligationWater({
    mode: 'PER_M3',
    waterPricePerM3Vnd: 25_000,
    consumptionM3: null,
  });
  assert.equal(res.status, 'NEED_M3_INPUT');
  assert.equal(res.consumptionM3, null);
  assert.equal(res.waterVnd, 0);
});

recordTest('TC-11', 'Phòng tính nước theo m³ sau khi nhập số khối (Water PER_M3 with 12 m³)', async () => {
  const res = calculateObligationWater({
    mode: 'PER_M3',
    waterPricePerM3Vnd: 25_000,
    consumptionM3: 12,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.consumptionM3, 12);
  assert.equal(res.waterVnd, 300_000);
});

recordTest('TC-12', 'Phòng tính nước theo m³ với giá trị 0 m³ hợp lệ (Water PER_M3 with 0 m³)', async () => {
  const res = calculateObligationWater({
    mode: 'PER_M3',
    waterPricePerM3Vnd: 25_000,
    consumptionM3: 0,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.consumptionM3, 0);
  assert.equal(res.waterVnd, 0);
});

recordTest('TC-13', 'Phòng tính nước khoán theo phòng (Water FIXED_PER_ROOM)', async () => {
  const res = calculateObligationWater({
    mode: 'FIXED_PER_ROOM',
    waterFixedRoomVnd: 150_000,
  });
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.waterVnd, 150_000);
});

recordTest('TC-14', 'Phòng có phí dịch vụ cố định (Recurring service fee)', async () => {
  const totals = calculateObligationTotals({
    roomRentVnd: 4_000_000,
    electricVnd: 380_000,
    waterVnd: 200_000,
    baseServiceFeeVnd: 150_000,
    feeItems: [
      {
        id: 'srv-1',
        code: 'INTERNET_TRASH',
        name: 'Internet + Rác + Vệ sinh',
        category: 'RECURRING_SERVICE',
        quantity: 1,
        unitPriceVnd: 220_000,
        amountVnd: 220_000,
      },
    ],
  });
  assert.equal(totals.serviceFeeVnd, 220_000);
  assert.equal(totals.totalPayableVnd, 4_800_000);
});

recordTest('TC-15', 'Phòng có phí phát sinh một lần (One-off extra charge)', async () => {
  const totals = calculateObligationTotals({
    roomRentVnd: 4_000_000,
    electricVnd: 380_000,
    waterVnd: 200_000,
    baseServiceFeeVnd: 150_000,
    feeItems: [
      {
        id: 'ext-1',
        code: 'KEY_CARD',
        name: 'Làm lại thẻ từ thang máy',
        category: 'EXTRA_CHARGE',
        quantity: 2,
        unitPriceVnd: 50_000,
        amountVnd: 100_000,
      },
    ],
  });
  assert.equal(totals.extraChargeVnd, 100_000);
  assert.equal(totals.totalPayableVnd, 4_830_000);
});

recordTest('TC-16', 'Phòng có giảm trừ / điều chỉnh (Discount & Adjustment)', async () => {
  const totals = calculateObligationTotals({
    roomRentVnd: 4_000_000,
    electricVnd: 380_000,
    waterVnd: 200_000,
    baseServiceFeeVnd: 150_000,
    feeItems: [
      {
        id: 'dsc-1',
        code: 'LOYALTY_DISC',
        name: 'Ưu đãi khách thuê dài hạn',
        category: 'DISCOUNT',
        quantity: 1,
        unitPriceVnd: 200_000,
        amountVnd: 200_000,
      },
      {
        id: 'adj-1',
        code: 'WATER_FIX_ADJ',
        name: 'Bù trừ sai số đồng hồ kỳ trước',
        category: 'ADJUSTMENT',
        quantity: 1,
        unitPriceVnd: -50_000,
        amountVnd: -50_000,
      },
    ],
  });
  assert.equal(totals.discountVnd, 200_000);
  assert.equal(totals.adjustmentVnd, -50_000);
  assert.equal(totals.currentPeriodDueVnd, 4_480_000);
});

recordTest('TC-17', 'Phòng có công nợ kỳ trước & khoản trả trước (Previous debt & prepaid credit)', async () => {
  const totals = calculateObligationTotals({
    roomRentVnd: 4_000_000,
    electricVnd: 300_000,
    waterVnd: 200_000,
    baseServiceFeeVnd: 150_000,
    previousDebtVnd: 1_200_000,
    prepaidCreditVnd: 350_000,
  });
  assert.equal(totals.currentPeriodDueVnd, 4_650_000);
  assert.equal(totals.totalPayableVnd, 5_500_000);
});

// ============================================================================
// INTEGRATION TESTS AGAINST POSTGRESQL DATABASE (TC-18 .. TC-26)
// ============================================================================

const TEST_PERIOD = '2026-12';

recordTest('TC-18', 'Tổng hợp kỳ chạy lại không tạo trùng hóa đơn (Idempotent compile)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Clean any existing test invoices in TEST_PERIOD
  await prisma.invoice.deleteMany({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });
  await prisma.billingPeriod.deleteMany({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });

  const run1 = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/compile',
    { periodKey: TEST_PERIOD, mode: 'AUTO_DRAFT_WAIT_APPROVAL' }
  );
  assert.equal(run1.status, 200);
  assert.equal(run1.data.ok, true);
  const countAfterRun1 = await prisma.invoice.count({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });
  assert.ok(countAfterRun1 > 0, 'First compile should create draft invoices');

  const run2 = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/compile',
    { periodKey: TEST_PERIOD, mode: 'AUTO_DRAFT_WAIT_APPROVAL' }
  );
  assert.equal(run2.status, 200);
  const countAfterRun2 = await prisma.invoice.count({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });
  assert.equal(
    countAfterRun2,
    countAfterRun1,
    'Running compile a second time must never create duplicate invoices'
  );
});

recordTest('TC-19', 'Phê duyệt 1 hóa đơn hợp lệ (Single obligation approval)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Find S4-401 (PER_PERSON water) and give it complete electric reading for TEST_PERIOD
  const room401 = await prisma.consoleRoom.findFirst({
    where: { orgId: 'org-adhome-anphu', code: 'S4-401' },
  });
  assert.ok(room401, 'Room S4-401 must exist');

  const inputRes = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/room-input',
    {
      periodKey: TEST_PERIOD,
      roomId: room401.id,
      electric: { startKwh: 100, endKwh: 180, ratePerKwhVnd: 3800 },
      reason: 'Nhập chỉ số điện S4-401 kỳ 2026-12',
    }
  );
  assert.equal(inputRes.status, 200);
  assert.equal(inputRes.data.row.safety.canApprove, true);

  const approveRes = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/approve',
    {
      periodKey: TEST_PERIOD,
      action: 'APPROVE',
      obligationKeys: [inputRes.data.row.obligationKey],
    }
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.approvalResult.processedCount, 1);
  const approvedRow = approveRes.data.settlementRows.find(
    (r) => r.obligationKey === inputRes.data.row.obligationKey
  );
  assert.equal(approvedRow.statuses.invoiceStatus, 'APPROVED');
});

recordTest('TC-20', 'Phê duyệt hàng loạt chỉ duyệt hóa đơn hợp lệ, chặn phòng thiếu m³ nước (Bulk approve safety gate)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Room S4-402 is PER_M3 water; ensure it has NO water m³ entered yet
  const ws = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'GET',
    `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
  );
  const row402 = ws.data.settlementRows.find((r) => r.room.code === 'S4-402');
  const row401 = ws.data.settlementRows.find((r) => r.room.code === 'S4-401');
  assert.ok(row402 && row401);
  assert.equal(row402.water.status, 'NEED_M3_INPUT');
  assert.equal(row402.safety.canApprove, false);

  const bulkRes = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/approve',
    {
      periodKey: TEST_PERIOD,
      action: 'APPROVE',
      obligationKeys: [row401.obligationKey, row402.obligationKey],
    }
  );
  assert.equal(bulkRes.status, 200);
  assert.equal(bulkRes.data.approvalResult.processedCount, 1);
  assert.equal(bulkRes.data.approvalResult.skippedCount, 1);
  assert.equal(bulkRes.data.approvalResult.skippedRooms[0].roomCode, 'S4-402');
});

recordTest('TC-21', 'Chế độ A: Tự động tạo nháp chờ duyệt (Mode A creates PENDING_APPROVAL without auto-issuing)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Enter water 12 m³ & electric for S4-402 so it becomes complete
  const room402 = await prisma.consoleRoom.findFirst({
    where: { orgId: 'org-adhome-anphu', code: 'S4-402' },
  });
  await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/room-input',
    {
      periodKey: TEST_PERIOD,
      roomId: room402.id,
      electric: { startKwh: 200, endKwh: 300, ratePerKwhVnd: 3800 },
      water: { mode: 'PER_M3', consumptionM3: 12, occupantCount: 2, unitRateVnd: 25000 },
    }
  );

  const compileModeA = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/compile',
    {
      periodKey: TEST_PERIOD,
      mode: 'AUTO_DRAFT_WAIT_APPROVAL',
    }
  );
  assert.equal(compileModeA.status, 200);
  const row402After = compileModeA.data.settlementRows.find((r) => r.room.code === 'S4-402');
  assert.equal(row402After.statuses.invoiceStatus, 'PENDING_APPROVAL');
  assert.equal(row402After.statuses.deliveryStatus, 'NOT_SENT');
  assert.equal(row402After.totals.waterVnd, 300_000);
});

recordTest('TC-22', 'Chế độ B: Tự động hoàn toàn phát hành & gửi phòng đủ điều kiện, cô lập phòng lỗi (Mode B AUTO_FULL)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  const compileModeB = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/compile',
    {
      periodKey: TEST_PERIOD,
      mode: 'AUTO_FULL',
    }
  );
  assert.equal(compileModeB.status, 200);
  assert.ok(compileModeB.data.compileResult.autoIssuedCount >= 1);

  const row402 = compileModeB.data.settlementRows.find((r) => r.room.code === 'S4-402');
  assert.equal(row402.statuses.invoiceStatus, 'ISSUED');
  assert.equal(row402.statuses.deliveryStatus, 'SENT');

  // Meanwhile an incomplete room (e.g. P24.03 missing water m³) must be isolated in NEEDS_ADJUSTMENT
  const rowIncomplete = compileModeB.data.settlementRows.find(
    (r) => !r.safety.canApprove
  );
  if (rowIncomplete) {
    assert.equal(rowIncomplete.statuses.invoiceStatus, 'NEEDS_ADJUSTMENT');
    assert.equal(rowIncomplete.statuses.deliveryStatus, 'NOT_SENT');
  }
});

recordTest('TC-23', 'Gửi hóa đơn thất bại và gửi lại không tạo hóa đơn mới (Delivery failure & retry idempotency)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Prepare S4-403 (FIXED_ROOM water) with electric reading
  const room403 = await prisma.consoleRoom.findFirst({
    where: { orgId: 'org-adhome-anphu', code: 'S4-403' },
  });
  const input403 = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/room-input',
    {
      periodKey: TEST_PERIOD,
      roomId: room403.id,
      electric: { startKwh: 50, endKwh: 100, ratePerKwhVnd: 3800 },
    }
  );
  const obKey403 = input403.data.row.obligationKey;
  const invIdBefore = input403.data.row.invoice.id;

  // Simulate failed send
  const failSend = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/issue-and-send',
    {
      periodKey: TEST_PERIOD,
      obligationKeys: [obKey403],
      simulateFailure: true,
    }
  );
  assert.equal(failSend.status, 200);
  const rowAfterFail = failSend.data.settlementRows.find((r) => r.obligationKey === obKey403);
  assert.equal(rowAfterFail.statuses.deliveryStatus, 'FAILED');
  assert.equal(rowAfterFail.invoice.id, invIdBefore);

  // Retry send -> succeeds without creating a duplicate invoice
  const retrySend = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/issue-and-send',
    {
      periodKey: TEST_PERIOD,
      obligationKeys: [obKey403],
      simulateFailure: false,
    }
  );
  assert.equal(retrySend.status, 200);
  const rowAfterRetry = retrySend.data.settlementRows.find((r) => r.obligationKey === obKey403);
  assert.equal(rowAfterRetry.statuses.deliveryStatus, 'SENT');
  assert.equal(rowAfterRetry.invoice.id, invIdBefore, 'Retry must reuse the exact same invoice ID');
  assert.ok(rowAfterRetry.delivery.attempts >= 2);
});

recordTest('TC-24', 'Thanh toán một phần và thanh toán đủ đồng bộ tức thì vào Tổng hợp kỳ (Partial & full payment sync)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  const wsBefore = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'GET',
    `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
  );
  const row403 = wsBefore.data.settlementRows.find((r) => r.room.code === 'S4-403');
  const totalDue = row403.totals.totalPayableVnd;
  assert.ok(totalDue > 1_000_000);

  // Partial payment of 1.000.000 VND
  await prisma.invoice.update({
    where: { id: row403.invoice.id },
    data: {
      paidAmountVnd: BigInt(1_000_000),
      status: 'PARTIAL',
    },
  });

  const wsPartial = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'GET',
    `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
  );
  const rowPartial = wsPartial.data.settlementRows.find((r) => r.room.code === 'S4-403');
  assert.equal(rowPartial.statuses.paymentStatus, 'PARTIAL');
  assert.equal(rowPartial.totals.paidAmountVnd, 1_000_000);
  assert.equal(rowPartial.totals.remainingAmountVnd, totalDue - 1_000_000);

  // Full payment
  await prisma.invoice.update({
    where: { id: row403.invoice.id },
    data: {
      paidAmountVnd: BigInt(totalDue),
      status: 'PAID',
    },
  });

  const wsPaid = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'GET',
    `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
  );
  const rowPaid = wsPaid.data.settlementRows.find((r) => r.room.code === 'S4-403');
  assert.equal(rowPaid.statuses.paymentStatus, 'PAID');
  assert.equal(rowPaid.totals.remainingAmountVnd, 0);
});

recordTest('TC-25', 'Khóa sổ kỳ chặn sửa trực tiếp & phân quyền mở khóa Admin (Period lock & RBAC check)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };
  const receptionistActor = {
    id: 'usr-rec-test',
    orgId: 'org-adhome-anphu',
    email: 'letan@adhome.vn',
    role: 'RECEPTIONIST',
    buildingIds: bldIds,
  };

  const room401 = await prisma.consoleRoom.findFirst({
    where: { orgId: 'org-adhome-anphu', code: 'S4-401' },
  });

  // Lock the building period for S4-401
  await prisma.billingPeriod.upsert({
    where: {
      orgId_buildingId_periodKey: {
        orgId: 'org-adhome-anphu',
        buildingId: room401.buildingId,
        periodKey: TEST_PERIOD,
      },
    },
    create: {
      orgId: 'org-adhome-anphu',
      buildingId: room401.buildingId,
      periodKey: TEST_PERIOD,
      status: 'LOCKED',
      lockedAt: new Date(),
    },
    update: {
      status: 'LOCKED',
      lockedAt: new Date(),
    },
  });

  // Direct room-input on locked period must fail with 409 PERIOD_ALREADY_LOCKED
  const editLocked = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/room-input',
    {
      periodKey: TEST_PERIOD,
      roomId: room401.id,
      electric: { startKwh: 100, endKwh: 250, ratePerKwhVnd: 3800 },
    }
  );
  assert.equal(editLocked.status, 409);
  assert.equal(editLocked.data.errorCode, 'PERIOD_ALREADY_LOCKED');

  // Receptionist attempting to unlock period must fail with 403
  const nonAdminUnlock = await callSettlementEndpoint(
    receptionistActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/unlock-period',
    {
      periodKey: TEST_PERIOD,
      buildingId: room401.buildingId,
      reason: 'Thử mở khóa trái phép',
    }
  );
  assert.equal(nonAdminUnlock.status, 403);

  // Admin unlocking with reason succeeds
  const adminUnlock = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'POST',
    '/api/v1/console/v2/settlements/unlock-period',
    {
      periodKey: TEST_PERIOD,
      buildingId: room401.buildingId,
      reason: 'Mở khóa kiểm toán định kỳ',
    }
  );
  assert.equal(adminUnlock.status, 200);
  assert.equal(adminUnlock.data.unlockedCount, 1);
});

recordTest('TC-26', 'Thay đổi đơn giá ở Settings không làm lệch hóa đơn đã phát hành (Immutable policySnapshot)', async () => {
  const buildings = await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } });
  const bldIds = buildings.map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  // Check S4-402 which was ISSUED in TC-22
  const wsBefore = await callSettlementEndpoint(
    adminActor,
    bldIds,
    'GET',
    `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
  );
  const row402Before = wsBefore.data.settlementRows.find((r) => r.room.code === 'S4-402');
  assert.equal(row402Before.statuses.invoiceStatus, 'ISSUED');
  const frozenTotalBefore = row402Before.totals.totalPayableVnd;
  const frozenWaterBefore = row402Before.totals.waterVnd;

  // Temporarily change room S4-402 waterRateVnd & electricRateVnd in DB
  const room402 = await prisma.consoleRoom.findFirst({
    where: { orgId: 'org-adhome-anphu', code: 'S4-402' },
  });
  const origElectricRate = room402.electricRateVnd;
  const origWaterRate = room402.waterRateVnd;

  await prisma.consoleRoom.update({
    where: { id: room402.id },
    data: { electricRateVnd: 9999, waterRateVnd: 88888 },
  });

  try {
    const wsAfterRateChange = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'GET',
      `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
    );
    const row402After = wsAfterRateChange.data.settlementRows.find((r) => r.room.code === 'S4-402');
    assert.equal(
      row402After.totals.totalPayableVnd,
      frozenTotalBefore,
      'Issued invoice totalPayableVnd must remain frozen after room rate change'
    );
    assert.equal(
      row402After.totals.waterVnd,
      frozenWaterBefore,
      'Issued invoice waterVnd must remain frozen after room rate change'
    );
  } finally {
    // Restore original rates and clean up TEST_PERIOD
    await prisma.consoleRoom.update({
      where: { id: room402.id },
      data: { electricRateVnd: origElectricRate, waterRateVnd: origWaterRate },
    });
    await prisma.invoice.deleteMany({
      where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
    });
    await prisma.billingPeriod.deleteMany({
      where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
    });
    await prisma.meterReading.deleteMany({
      where: { periodKey: TEST_PERIOD, meter: { orgId: 'org-adhome-anphu' } },
    });
  }
});

// ============================================================================
// SHARED ROOM (PHÒNG Ở GHÉP) SEPARATE MEMBER BILLING TESTS (TC-27 .. TC-29)
// ============================================================================

recordTest('TC-27', 'Phòng ở ghép: Chia đều tiền điện & nước và bảo toàn tổng số (Conservation)', async () => {
  const weights4 = [1, 1, 1, 1];
  const eShares = weights4.map((_, idx) =>
    calculateObligationElectric({
      method: 'MANUAL',
      startKwh: 100,
      endKwh: 300, // 200 kWh * 3,800 = 760,000
      ratePerKwhVnd: 3800,
      sharedWeights: weights4,
      sharedIndex: idx,
    })
  );
  assert.deepEqual(
    eShares.map((s) => s.electricVnd),
    [190_000, 190_000, 190_000, 190_000]
  );
  assert.equal(eShares[0].totalRoomElectricVnd, 760_000);

  const wShares = weights4.map((_, idx) =>
    calculateObligationWater({
      mode: 'PER_M3',
      occupantCount: 1,
      waterPricePerPersonVnd: 100_000,
      waterPricePerM3Vnd: 25_000,
      waterFixedRoomVnd: 200_000,
      consumptionM3: 12, // 12 m³ * 25,000 = 300,000
      sharedWeights: weights4,
      sharedIndex: idx,
    })
  );
  assert.deepEqual(
    wShares.map((s) => s.waterVnd),
    [75_000, 75_000, 75_000, 75_000]
  );
  assert.equal(wShares[0].totalRoomWaterVnd, 300_000);

  // Conservation test for non-divisible amount (100,000 across 3 members)
  const unevenWater = [1, 1, 1].map((_, idx) =>
    calculateObligationWater({
      mode: 'PER_M3',
      occupantCount: 1,
      waterPricePerPersonVnd: 100_000,
      waterPricePerM3Vnd: 25_000,
      waterFixedRoomVnd: 200_000,
      consumptionM3: 4, // 100,000
      sharedWeights: [1, 1, 1],
      sharedIndex: idx,
    }).waterVnd
  );
  assert.equal(
    unevenWater.reduce((a, b) => a + b, 0),
    100_000,
    'Shared split must strictly conserve total amount'
  );
});

recordTest('TC-28', 'Phòng ở ghép 4 người: Tiền phòng gán riêng, điện/nước chia đều, phí khác riêng từng HĐ', async () => {
  const bld = await prisma.building.findFirst({ where: { orgId: 'org-adhome-anphu', code: 'S4B' } });
  assert.ok(bld, 'S4B test building must exist');
  const floor = await prisma.floor.findFirst({ where: { buildingId: bld.id } });
  assert.ok(floor, 'S4B floor must exist');
  const bldIds = (await prisma.building.findMany({ where: { orgId: 'org-adhome-anphu' } })).map((b) => b.id);
  const adminActor = {
    id: 'usr-admin-test',
    orgId: 'org-adhome-anphu',
    email: 'admin@adhome.vn',
    role: 'ADMIN',
    buildingIds: bldIds,
  };

  const tag = `TC28-${Date.now()}`;
  const room = await prisma.consoleRoom.create({
    data: {
      orgId: 'org-adhome-anphu',
      buildingId: bld.id,
      floorId: floor.id,
      code: `P31.04-${tag.slice(-4)}`,
      title: 'Phòng ghép 31.04 Test',
      area: 28,
      occupancyStatus: 'OCCUPIED',
      rentalModel: 'SHARED_ROOM',
      totalBeds: 4,
      listPriceVnd: BigInt(4_000_000),
      electricBillingMode: 'MANUAL',
      electricRateVnd: 3800,
      waterBillingMethod: 'PER_M3',
      waterRateVnd: 25000,
    },
  });

  const assignedRents = [3_500_000, 4_200_000, 3_800_000, 4_500_000];
  const createdTenantIds = [];
  const createdContractIds = [];

  try {
    for (let i = 0; i < 4; i++) {
      const phoneNum = `0901${tag.slice(-4)}0${i}`;
      const t = await prisma.tenant.create({
        data: {
          orgId: 'org-adhome-anphu',
          fullName: `Thành viên ${i + 1} (${tag.slice(-4)})`,
          phone: phoneNum,
          normalizedPhone: phoneNum,
          email: `tv${i + 1}-${tag.slice(-4)}@adhome.test`,
        },
      });
      createdTenantIds.push(t.id);

      const c = await prisma.contract.create({
        data: {
          orgId: 'org-adhome-anphu',
          buildingId: bld.id,
          roomId: room.id,
          tenantId: t.id,
          contractCode: `HD-3104-${i + 1}-${tag.slice(-4)}`,
          rentalModel: 'SHARED_ROOM',
          status: 'ACTIVE',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
          occupantsCount: 1,
          monthlyRentVnd: BigInt(assignedRents[i]),
          depositVnd: BigInt(assignedRents[i]),
          waterBillingMethod: 'PER_M3',
          waterRateVnd: 25000,
        },
      });
      createdContractIds.push(c.id);
    }

    // 1. Room-level utility input (200 kWh + 12 m³ -> 760k electric, 300k water) across all 4 members
    const roomUtilRes = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'POST',
      '/api/v1/console/v2/settlements/room-input',
      {
        periodKey: TEST_PERIOD,
        roomId: room.id,
        applyToRoomMembers: true,
        electric: { startKwh: 100, endKwh: 300, ratePerKwhVnd: 3800 },
        water: { mode: 'PER_M3', consumptionM3: 12, unitRateVnd: 25000 },
        reason: 'Nhập điện nước phòng ghép 31.04',
      }
    );
    assert.equal(roomUtilRes.status, 200);

    // 2. Member 2 extra parking fee (+150k) & Member 3 custom monthly rent override (3.9M)
    const m2Res = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'POST',
      '/api/v1/console/v2/settlements/room-input',
      {
        periodKey: TEST_PERIOD,
        roomId: room.id,
        contractId: createdContractIds[1],
        feeItems: [
          {
            code: 'PARKING_M2',
            name: 'Phí gửi xe thêm',
            category: 'EXTRA_CHARGE',
            quantity: 1,
            unitPriceVnd: 150_000,
            amountVnd: 150_000,
          },
        ],
        reason: 'Bổ sung phí gửi xe cho Thành viên 2',
      }
    );
    assert.equal(m2Res.status, 200);

    const m3Res = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'POST',
      '/api/v1/console/v2/settlements/room-input',
      {
        periodKey: TEST_PERIOD,
        roomId: room.id,
        contractId: createdContractIds[2],
        rent: { baseMonthlyRentVnd: 3_900_000 },
        reason: 'Điều chỉnh tiền phòng riêng cho Thành viên 3',
      }
    );
    assert.equal(m3Res.status, 200);

    const wsRes = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'GET',
      `/api/v1/console/v2/settlements/workspace?periodKey=${TEST_PERIOD}`
    );
    assert.equal(wsRes.status, 200);
    const sharedRows = wsRes.data.settlementRows
      .filter((r) => r.room.id === room.id)
      .sort((a, b) => a.sharedRoomInfo.memberIndex - b.sharedRoomInfo.memberIndex);

    assert.equal(sharedRows.length, 4, 'Must produce 4 distinct obligations for 4 members');
    assert.deepEqual(
      sharedRows.map((r) => r.totals.roomRentVnd),
      [3_500_000, 4_200_000, 3_900_000, 4_500_000],
      'Each member must retain distinct assigned room rent'
    );
    assert.deepEqual(
      sharedRows.map((r) => r.totals.electricVnd),
      [190_000, 190_000, 190_000, 190_000],
      'Room electric must be split equally among 4 members'
    );
    assert.deepEqual(
      sharedRows.map((r) => r.totals.waterVnd),
      [75_000, 75_000, 75_000, 75_000],
      'Room water must be split equally among 4 members'
    );
    assert.deepEqual(
      sharedRows.map((r) => r.totals.extraChargeVnd),
      [0, 150_000, 0, 0],
      'Extra charges must apply strictly to individual member invoice'
    );

    const distinctInvoiceCodes = new Set(sharedRows.map((r) => r.invoice?.code).filter(Boolean));
    assert.equal(distinctInvoiceCodes.size, 4, 'Each member must receive a unique invoiceCode');

    // TC-29 inline verification: Approve & Issue/Send all 4 member invoices without code collision
    const keys = sharedRows.map((r) => r.obligationKey);
    const approveRes = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'POST',
      '/api/v1/console/v2/settlements/approve',
      { periodKey: TEST_PERIOD, obligationKeys: keys, action: 'APPROVE' }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.approvalResult.processedCount, 4);

    const sendRes = await callSettlementEndpoint(
      adminActor,
      bldIds,
      'POST',
      '/api/v1/console/v2/settlements/issue-and-send',
      { periodKey: TEST_PERIOD, obligationKeys: keys, channel: 'ZALO_OA' }
    );
    assert.equal(sendRes.status, 200);
    const issuedShared = sendRes.data.settlementRows.filter(
      (r) =>
        r.room.id === room.id &&
        r.statuses.invoiceStatus === 'ISSUED' &&
        r.statuses.deliveryStatus === 'SENT'
    );
    assert.equal(issuedShared.length, 4, 'All 4 separate member invoices must issue & send');
  } finally {
    await prisma.invoice.deleteMany({ where: { roomId: room.id } });
    await prisma.electricMeter.deleteMany({ where: { roomId: room.id } });
    await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    await prisma.consoleRoom.deleteMany({ where: { id: room.id } });
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.billingPeriod.deleteMany({
      where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
    });
    await prisma.meterReading.deleteMany({
      where: { periodKey: TEST_PERIOD, meter: { orgId: 'org-adhome-anphu' } },
    });
  }
});

async function cleanupTestPeriod() {
  await prisma.invoice.deleteMany({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });
  await prisma.billingPeriod.deleteMany({
    where: { orgId: 'org-adhome-anphu', periodKey: TEST_PERIOD },
  });
  await prisma.meterReading.deleteMany({
    where: { periodKey: TEST_PERIOD, meter: { orgId: 'org-adhome-anphu' } },
  });
}

async function main() {
  await cleanupTestPeriod();
  console.log('================================================================');
  console.log(`ADHOME SETTLEMENT & AUTOMATED BILLING CENTER — ${results.length} TEST SUITE`);
  console.log('================================================================');
  let passed = 0;
  for (const t of results) {
    try {
      await t.fn();
      passed += 1;
      console.log(`✅ [${t.code}] ${t.name}`);
    } catch (err) {
      console.error(`❌ [${t.code}] ${t.name}`);
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  console.log('----------------------------------------------------------------');
  console.log(`ALL ${passed}/${results.length} MANDATORY SETTLEMENT TESTS PASSED!`);
  console.log('----------------------------------------------------------------');
  await cleanupTestPeriod();
  await prisma.$disconnect();
}

main();
