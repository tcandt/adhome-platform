import type { IncomingMessage, ServerResponse } from 'node:http';
import { splitSharedCharge } from './sharedRoomBilling';
import {
  actorHasPermission,
  isBuildingAllowedForActor,
  type AuthoritativeConsoleActor,
} from './authRbac';

export type DataStatus = 'COMPLETE' | 'MISSING_DATA' | 'ANOMALY' | 'CALCULATING' | 'ERROR';
export type InvoiceWorkflowStatus =
  | 'NOT_CREATED'
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'NEEDS_ADJUSTMENT'
  | 'APPROVED'
  | 'ISSUED'
  | 'VOID'
  | 'REPLACED';
export type DeliveryWorkflowStatus =
  | 'NOT_SENT'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_NEEDED';
export type PaymentWorkflowStatus =
  | 'UNPAID'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'PENDING_RECONCILE'
  | 'OVERPAID';
export type AutomationMode = 'AUTO_DRAFT_WAIT_APPROVAL' | 'AUTO_FULL' | 'MANUAL';

export interface FeeLineItem {
  id: string;
  code: string;
  name: string;
  category: 'RECURRING_SERVICE' | 'EXTRA_CHARGE' | 'DISCOUNT' | 'ADJUSTMENT';
  quantity: number;
  unitPriceVnd: number;
  amountVnd: number;
  reason?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface PeriodDateRange {
  periodKey: string;
  year: number;
  month: number;
  daysInMonth: number;
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  displayRange: string;
}

function toSafeNum(val: unknown): number {
  if (typeof val === 'bigint') return Number(val);
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  return {};
}

export function getPeriodDateRange(periodKey: string): PeriodDateRange {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) : now.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));
  const mm = String(month).padStart(2, '0');
  const ddEnd = String(daysInMonth).padStart(2, '0');
  return {
    periodKey: `${year}-${mm}`,
    year,
    month,
    daysInMonth,
    startDate,
    endDate,
    startIso: `${year}-${mm}-01`,
    endIso: `${year}-${mm}-${ddEnd}`,
    displayRange: `01/${mm}/${year} – ${ddEnd}/${mm}/${year}`,
  };
}

export function getPreviousPeriodKey(periodKey: string): string {
  const range = getPeriodDateRange(periodKey);
  const prevMonth = range.month === 1 ? 12 : range.month - 1;
  const prevYear = range.month === 1 ? range.year - 1 : range.year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

export interface CalculateRentInput {
  monthlyRentVnd: number;
  periodKey: string;
  contractStartDate?: Date | string | null;
  contractEndDate?: Date | string | null;
  moveInDate?: Date | string | null;
  moveOutDate?: Date | string | null;
  prorateBasisDays?: 'ACTUAL_MONTH' | 30;
  rateChange?: {
    effectiveDayInMonth: number;
    previousRentVnd: number;
    newRentVnd: number;
  } | null;
  exemptDays?: number;
  rentDiscountVnd?: number;
  bookingDepositVnd?: number;
  contractDepositVnd?: number;
}

export interface CalculateRentResult {
  roomRentVnd: number;
  baseMonthlyRentVnd: number;
  activeDays: number;
  basisDays: number;
  isProrated: boolean;
  prorateReason: 'FULL_MONTH' | 'MID_MONTH_MOVE_IN' | 'MID_MONTH_MOVE_OUT' | 'PARTIAL_STAY' | 'RATE_CHANGE';
  exemptDaysDeductionVnd: number;
  rentDiscountVnd: number;
  excludedDepositsVnd: number;
  formulaNote: string;
}

export function calculateContractPeriodRent(input: CalculateRentInput): CalculateRentResult {
  const range = getPeriodDateRange(input.periodKey);
  const basisDays = input.prorateBasisDays === 30 ? 30 : range.daysInMonth;
  const monthlyRent = Math.max(0, Math.round(toSafeNum(input.monthlyRentVnd)));

  const effectiveStartRaw = input.moveInDate ?? input.contractStartDate ?? null;
  const effectiveEndRaw = input.moveOutDate ?? input.contractEndDate ?? null;

  let startDay = 1;
  let endDay = range.daysInMonth;
  let movedInMidMonth = false;
  let movedOutMidMonth = false;

  if (effectiveStartRaw) {
    const d = new Date(effectiveStartRaw);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      if (y === range.year && m === range.month) {
        startDay = Math.max(1, Math.min(range.daysInMonth, d.getUTCDate()));
        if (startDay > 1) movedInMidMonth = true;
      } else if (d.getTime() > range.endDate.getTime()) {
        return {
          roomRentVnd: 0,
          baseMonthlyRentVnd: monthlyRent,
          activeDays: 0,
          basisDays,
          isProrated: true,
          prorateReason: 'PARTIAL_STAY',
          exemptDaysDeductionVnd: 0,
          rentDiscountVnd: 0,
          excludedDepositsVnd: Math.max(0, toSafeNum(input.bookingDepositVnd) + toSafeNum(input.contractDepositVnd)),
          formulaNote: 'Hợp đồng bắt đầu sau kỳ quyết toán',
        };
      }
    }
  }

  if (effectiveEndRaw) {
    const d = new Date(effectiveEndRaw);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      if (y === range.year && m === range.month) {
        endDay = Math.max(1, Math.min(range.daysInMonth, d.getUTCDate()));
        if (endDay < range.daysInMonth) movedOutMidMonth = true;
      } else if (d.getTime() < range.startDate.getTime()) {
        return {
          roomRentVnd: 0,
          baseMonthlyRentVnd: monthlyRent,
          activeDays: 0,
          basisDays,
          isProrated: true,
          prorateReason: 'PARTIAL_STAY',
          exemptDaysDeductionVnd: 0,
          rentDiscountVnd: 0,
          excludedDepositsVnd: Math.max(0, toSafeNum(input.bookingDepositVnd) + toSafeNum(input.contractDepositVnd)),
          formulaNote: 'Hợp đồng đã kết thúc trước kỳ quyết toán',
        };
      }
    }
  }

  const activeDays = Math.max(0, endDay - startDay + 1);
  let grossRentVnd = monthlyRent;
  let prorateReason: CalculateRentResult['prorateReason'] = 'FULL_MONTH';
  let formulaNote = `${monthlyRent.toLocaleString('vi-VN')} ₫/tháng (Trọn kỳ ${range.daysInMonth} ngày)`;

  if (
    input.rateChange &&
    input.rateChange.effectiveDayInMonth > startDay &&
    input.rateChange.effectiveDayInMonth <= endDay
  ) {
    const changeDay = input.rateChange.effectiveDayInMonth;
    const daysBefore = Math.max(0, changeDay - startDay);
    const daysAfter = Math.max(0, endDay - changeDay + 1);
    const prevRent = Math.max(0, toSafeNum(input.rateChange.previousRentVnd));
    const nextRent = Math.max(0, toSafeNum(input.rateChange.newRentVnd));
    grossRentVnd = Math.round((prevRent * daysBefore + nextRent * daysAfter) / basisDays);
    prorateReason = 'RATE_CHANGE';
    formulaNote = `Đổi giá ngày ${changeDay}: ${daysBefore} ngày × ${prevRent.toLocaleString('vi-VN')} ₫ + ${daysAfter} ngày × ${nextRent.toLocaleString('vi-VN')} ₫ / ${basisDays} ngày`;
  } else if (activeDays < range.daysInMonth) {
    grossRentVnd = Math.round((monthlyRent * activeDays) / basisDays);
    if (movedInMidMonth && movedOutMidMonth) {
      prorateReason = 'PARTIAL_STAY';
    } else if (movedInMidMonth) {
      prorateReason = 'MID_MONTH_MOVE_IN';
    } else {
      prorateReason = 'MID_MONTH_MOVE_OUT';
    }
    formulaNote = `Tính theo ngày ở thực tế: ${activeDays}/${basisDays} ngày × ${monthlyRent.toLocaleString('vi-VN')} ₫`;
  }

  const exemptDays = Math.max(0, Math.min(activeDays, toSafeNum(input.exemptDays)));
  const exemptDaysDeductionVnd = exemptDays > 0 ? Math.round((monthlyRent * exemptDays) / basisDays) : 0;
  const rentDiscountVnd = Math.max(0, Math.round(toSafeNum(input.rentDiscountVnd)));
  const roomRentVnd = Math.max(0, grossRentVnd - exemptDaysDeductionVnd - rentDiscountVnd);
  // Rule 5: Deposits (cọc giữ chỗ, cọc hợp đồng) are strictly excluded from rent revenue
  const excludedDepositsVnd = Math.max(
    0,
    Math.round(toSafeNum(input.bookingDepositVnd) + toSafeNum(input.contractDepositVnd))
  );

  return {
    roomRentVnd,
    baseMonthlyRentVnd: monthlyRent,
    activeDays,
    basisDays,
    isProrated: activeDays < range.daysInMonth || prorateReason === 'RATE_CHANGE',
    prorateReason,
    exemptDaysDeductionVnd,
    rentDiscountVnd,
    excludedDepositsVnd,
    formulaNote,
  };
}

export interface CalculateElectricInput {
  method?: 'HUNONIC_AUTO' | 'MANUAL' | 'FIXED';
  startKwh: number | null | undefined;
  endKwh: number | null | undefined;
  ratePerKwhVnd: number;
  fixedAmountVnd?: number;
  meterReplaced?: boolean;
  replacementOffsetKwh?: number;
  spikeThresholdKwh?: number;
  anomalyConfirmed?: boolean;
  sharedWeights?: number[];
  sharedIndex?: number;
}

export interface CalculateElectricResult {
  method: 'HUNONIC_AUTO' | 'MANUAL' | 'FIXED';
  status: 'COMPLETE' | 'MISSING_DATA' | 'ANOMALY';
  anomalyCode: 'NEGATIVE_ELECTRIC_DELTA' | 'ABNORMAL_ELECTRIC_SPIKE' | null;
  anomalyMessage: string | null;
  startKwh: number | null;
  endKwh: number | null;
  consumptionKwh: number | null;
  ratePerKwhVnd: number;
  electricVnd: number;
  totalRoomElectricVnd: number;
  formulaNote: string;
}

export function buildCandidateInvoiceCode(
  periodKey: string,
  roomCode: string,
  contractCodeOrId: string,
  isSharedMember: boolean,
  memberIndex = 0
): string {
  const base = `INV-${periodKey.replace('-', '')}-${roomCode}`;
  if (!isSharedMember) return base;
  const normalizedSuffix = String(contractCodeOrId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-6);
  const suffix = normalizedSuffix || `M${memberIndex + 1}`;
  return `${base}-${suffix}`;
}

export function calculateObligationElectric(input: CalculateElectricInput): CalculateElectricResult {
  const method = input.method || 'HUNONIC_AUTO';
  const ratePerKwhVnd = Math.max(0, Math.round(toSafeNum(input.ratePerKwhVnd)));

  if (method === 'FIXED') {
    const fixedVnd = Math.max(0, Math.round(toSafeNum(input.fixedAmountVnd)));
    let electricVnd = fixedVnd;
    if (
      Array.isArray(input.sharedWeights) &&
      input.sharedWeights.length > 1 &&
      typeof input.sharedIndex === 'number' &&
      input.sharedIndex >= 0 &&
      input.sharedIndex < input.sharedWeights.length
    ) {
      const shares = splitSharedCharge(fixedVnd, input.sharedWeights);
      electricVnd = shares[input.sharedIndex] ?? fixedVnd;
    }
    return {
      method,
      status: 'COMPLETE',
      anomalyCode: null,
      anomalyMessage: null,
      startKwh: null,
      endKwh: null,
      consumptionKwh: 0,
      ratePerKwhVnd,
      electricVnd,
      totalRoomElectricVnd: fixedVnd,
      formulaNote:
        electricVnd !== fixedVnd
          ? `Khoán phòng ${fixedVnd.toLocaleString('vi-VN')} ₫ (Chia phòng ghép: ${electricVnd.toLocaleString('vi-VN')} ₫)`
          : `Khoán cố định: ${fixedVnd.toLocaleString('vi-VN')} ₫/kỳ`,
    };
  }

  // Strictly distinguish null/undefined (missing reading) from 0
  if (
    input.startKwh === null ||
    input.startKwh === undefined ||
    input.endKwh === null ||
    input.endKwh === undefined ||
    Number.isNaN(Number(input.startKwh)) ||
    Number.isNaN(Number(input.endKwh))
  ) {
    return {
      method,
      status: 'MISSING_DATA',
      anomalyCode: null,
      anomalyMessage: 'Thiếu chỉ số điện kỳ này (Chưa có chỉ số cuối kỳ)',
      startKwh: input.startKwh != null && !Number.isNaN(Number(input.startKwh)) ? Number(input.startKwh) : null,
      endKwh: input.endKwh != null && !Number.isNaN(Number(input.endKwh)) ? Number(input.endKwh) : null,
      consumptionKwh: null,
      ratePerKwhVnd,
      electricVnd: 0,
      totalRoomElectricVnd: 0,
      formulaNote: 'Chưa có chỉ số điện cuối kỳ',
    };
  }

  const startKwh = Number(input.startKwh);
  const endKwh = Number(input.endKwh);
  const delta = input.meterReplaced
    ? Number((endKwh + toSafeNum(input.replacementOffsetKwh) - startKwh).toFixed(2))
    : Number((endKwh - startKwh).toFixed(2));

  if (delta < 0) {
    return {
      method,
      status: 'ANOMALY',
      anomalyCode: 'NEGATIVE_ELECTRIC_DELTA',
      anomalyMessage: `Chỉ số điện cuối kỳ (${endKwh} kWh) nhỏ hơn đầu kỳ (${startKwh} kWh)`,
      startKwh,
      endKwh,
      consumptionKwh: delta,
      ratePerKwhVnd,
      electricVnd: 0,
      totalRoomElectricVnd: 0,
      formulaNote: `Bất thường: ${endKwh} - ${startKwh} = ${delta} kWh (< 0)`,
    };
  }

  const totalRoomElectricVnd = Math.round(delta * ratePerKwhVnd);
  let electricVnd = totalRoomElectricVnd;
  let splitSuffix = '';

  if (
    Array.isArray(input.sharedWeights) &&
    input.sharedWeights.length > 1 &&
    typeof input.sharedIndex === 'number' &&
    input.sharedIndex >= 0 &&
    input.sharedIndex < input.sharedWeights.length
  ) {
    const shares = splitSharedCharge(totalRoomElectricVnd, input.sharedWeights);
    electricVnd = shares[input.sharedIndex] ?? totalRoomElectricVnd;
    splitSuffix = ` (Chia đều ${input.sharedWeights.length} thành viên: ${electricVnd.toLocaleString('vi-VN')} ₫)`;
  }

  const spikeThreshold = Number(input.spikeThresholdKwh ?? 2000);
  if (delta > spikeThreshold && !input.anomalyConfirmed) {
    return {
      method,
      status: 'ANOMALY',
      anomalyCode: 'ABNORMAL_ELECTRIC_SPIKE',
      anomalyMessage: `Sản lượng điện tăng đột biến (${delta} kWh > ngưỡng ${spikeThreshold} kWh)`,
      startKwh,
      endKwh,
      consumptionKwh: delta,
      ratePerKwhVnd,
      electricVnd,
      totalRoomElectricVnd,
      formulaNote: `${delta} kWh × ${ratePerKwhVnd.toLocaleString('vi-VN')} ₫ = ${totalRoomElectricVnd.toLocaleString('vi-VN')} ₫${splitSuffix} (Cần xác nhận đột biến)`,
    };
  }

  return {
    method,
    status: 'COMPLETE',
    anomalyCode: null,
    anomalyMessage: null,
    startKwh,
    endKwh,
    consumptionKwh: delta,
    ratePerKwhVnd,
    electricVnd,
    totalRoomElectricVnd,
    formulaNote: `${delta} kWh (${startKwh} → ${endKwh}) × ${ratePerKwhVnd.toLocaleString('vi-VN')} ₫ = ${totalRoomElectricVnd.toLocaleString('vi-VN')} ₫${splitSuffix}`,
  };
}

export interface CalculateWaterInput {
  mode: string;
  occupantCount?: number;
  waterPricePerPersonVnd?: number;
  waterPricePerM3Vnd?: number;
  waterFixedRoomVnd?: number;
  consumptionM3?: number | null | undefined;
  startM3?: number | null | undefined;
  endM3?: number | null | undefined;
  spikeThresholdM3?: number;
  anomalyConfirmed?: boolean;
  sharedWeights?: number[];
  sharedIndex?: number;
}

export interface CalculateWaterResult {
  mode: 'PER_PERSON' | 'PER_M3' | 'FIXED_PER_ROOM';
  status: 'COMPLETE' | 'NEED_M3_INPUT' | 'ANOMALY';
  anomalyCode: 'NEGATIVE_WATER_DELTA' | 'ABNORMAL_WATER_SPIKE' | null;
  anomalyMessage: string | null;
  occupantCount: number;
  startM3: number | null;
  endM3: number | null;
  consumptionM3: number | null;
  unitRateVnd: number;
  waterVnd: number;
  totalRoomWaterVnd: number;
  displayLabel: string;
  formulaNote: string;
}

export function normalizeWaterMode(rawMode: string | null | undefined): 'PER_PERSON' | 'PER_M3' | 'FIXED_PER_ROOM' {
  const upper = String(rawMode || 'PER_PERSON').trim().toUpperCase();
  if (upper === 'PER_M3' || upper === 'BY_M3' || upper === 'M3') return 'PER_M3';
  if (upper === 'FIXED_PER_ROOM' || upper === 'FIXED_ROOM' || upper === 'FIXED') return 'FIXED_PER_ROOM';
  return 'PER_PERSON';
}

export function calculateObligationWater(input: CalculateWaterInput): CalculateWaterResult {
  const mode = normalizeWaterMode(input.mode);
  const occupantCount = Math.max(1, Math.round(toSafeNum(input.occupantCount || 1)));
  const sharedTotalMembers =
    Array.isArray(input.sharedWeights) && input.sharedWeights.length > 1
      ? input.sharedWeights.length
      : 1;

  if (mode === 'PER_PERSON') {
    const unitRateVnd = Math.max(0, Math.round(toSafeNum(input.waterPricePerPersonVnd)));
    const waterVnd = occupantCount * unitRateVnd;
    const roomPeopleTotal =
      Array.isArray(input.sharedWeights) && input.sharedWeights.length > 1
        ? input.sharedWeights.reduce((acc, w) => acc + Math.max(1, w), 0)
        : occupantCount;
    return {
      mode,
      status: 'COMPLETE',
      anomalyCode: null,
      anomalyMessage: null,
      occupantCount,
      startM3: null,
      endM3: null,
      consumptionM3: null,
      unitRateVnd,
      waterVnd,
      totalRoomWaterVnd: roomPeopleTotal * unitRateVnd,
      displayLabel:
        sharedTotalMembers > 1
          ? `${occupantCount} người × ${unitRateVnd.toLocaleString('vi-VN')} ₫ (TV phòng ghép)`
          : `${occupantCount} người × ${unitRateVnd.toLocaleString('vi-VN')} ₫`,
      formulaNote:
        sharedTotalMembers > 1
          ? `Theo đầu người (phòng ghép ${sharedTotalMembers} TV): ${occupantCount} người × ${unitRateVnd.toLocaleString('vi-VN')} ₫ = ${waterVnd.toLocaleString('vi-VN')} ₫`
          : `Theo đầu người: ${occupantCount} người × ${unitRateVnd.toLocaleString('vi-VN')} ₫ = ${waterVnd.toLocaleString('vi-VN')} ₫`,
    };
  }

  if (mode === 'FIXED_PER_ROOM') {
    const unitRateVnd = Math.max(0, Math.round(toSafeNum(input.waterFixedRoomVnd)));
    let waterVnd = unitRateVnd;
    if (
      Array.isArray(input.sharedWeights) &&
      input.sharedWeights.length > 1 &&
      typeof input.sharedIndex === 'number' &&
      input.sharedIndex >= 0 &&
      input.sharedIndex < input.sharedWeights.length
    ) {
      const shares = splitSharedCharge(unitRateVnd, input.sharedWeights);
      waterVnd = shares[input.sharedIndex] ?? unitRateVnd;
    }
    return {
      mode,
      status: 'COMPLETE',
      anomalyCode: null,
      anomalyMessage: null,
      occupantCount,
      startM3: null,
      endM3: null,
      consumptionM3: null,
      unitRateVnd,
      waterVnd,
      totalRoomWaterVnd: unitRateVnd,
      displayLabel: sharedTotalMembers > 1 ? `Khoán phòng (÷${sharedTotalMembers})` : `Khoán phòng`,
      formulaNote:
        sharedTotalMembers > 1
          ? `Khoán phòng ${unitRateVnd.toLocaleString('vi-VN')} ₫ (Chia đều ${sharedTotalMembers} thành viên: ${waterVnd.toLocaleString('vi-VN')} ₫)`
          : `Khoán theo phòng: ${waterVnd.toLocaleString('vi-VN')} ₫/kỳ`,
    };
  }

  // mode === 'PER_M3'
  const unitRateVnd = Math.max(0, Math.round(toSafeNum(input.waterPricePerM3Vnd)));
  const hasStartEnd =
    input.startM3 !== null &&
    input.startM3 !== undefined &&
    input.endM3 !== null &&
    input.endM3 !== undefined &&
    !Number.isNaN(Number(input.startM3)) &&
    !Number.isNaN(Number(input.endM3));

  let resolvedM3: number | null = null;
  const startM3 = hasStartEnd ? Number(input.startM3) : null;
  const endM3 = hasStartEnd ? Number(input.endM3) : null;

  if (hasStartEnd && startM3 !== null && endM3 !== null) {
    resolvedM3 = Number((endM3 - startM3).toFixed(2));
    if (resolvedM3 < 0) {
      return {
        mode,
        status: 'ANOMALY',
        anomalyCode: 'NEGATIVE_WATER_DELTA',
        anomalyMessage: `Chỉ số nước cuối kỳ (${endM3} m³) nhỏ hơn đầu kỳ (${startM3} m³)`,
        occupantCount,
        startM3,
        endM3,
        consumptionM3: resolvedM3,
        unitRateVnd,
        waterVnd: 0,
        totalRoomWaterVnd: 0,
        displayLabel: 'Bất thường m³',
        formulaNote: `Chỉ số nước âm: ${endM3} - ${startM3} = ${resolvedM3} m³`,
      };
    }
  } else if (
    input.consumptionM3 !== null &&
    input.consumptionM3 !== undefined &&
    String(input.consumptionM3).trim() !== '' &&
    !Number.isNaN(Number(input.consumptionM3))
  ) {
    resolvedM3 = Number(input.consumptionM3);
    if (resolvedM3 < 0) {
      return {
        mode,
        status: 'ANOMALY',
        anomalyCode: 'NEGATIVE_WATER_DELTA',
        anomalyMessage: `Số khối nước nhập vào âm (${resolvedM3} m³)`,
        occupantCount,
        startM3: null,
        endM3: null,
        consumptionM3: resolvedM3,
        unitRateVnd,
        waterVnd: 0,
        totalRoomWaterVnd: 0,
        displayLabel: 'Bất thường m³',
        formulaNote: `Số khối nước âm: ${resolvedM3} m³`,
      };
    }
  }

  // Strictly distinguish null (not yet entered -> NEED_M3_INPUT) vs 0 (valid 0 m³)
  if (resolvedM3 === null) {
    return {
      mode,
      status: 'NEED_M3_INPUT',
      anomalyCode: null,
      anomalyMessage: 'Phòng tính nước theo m³ nhưng chưa nhập số khối nước kỳ này',
      occupantCount,
      startM3: null,
      endM3: null,
      consumptionM3: null,
      unitRateVnd,
      waterVnd: 0,
      totalRoomWaterVnd: 0,
      displayLabel: 'Cần nhập m³',
      formulaNote: `Chưa tính — Cần nhập khối nước (Đơn giá ${unitRateVnd.toLocaleString('vi-VN')} ₫/m³)`,
    };
  }

  const totalRoomWaterVnd = Math.round(resolvedM3 * unitRateVnd);
  let waterVnd = totalRoomWaterVnd;
  let splitSuffix = '';
  if (
    Array.isArray(input.sharedWeights) &&
    input.sharedWeights.length > 1 &&
    typeof input.sharedIndex === 'number' &&
    input.sharedIndex >= 0 &&
    input.sharedIndex < input.sharedWeights.length
  ) {
    const shares = splitSharedCharge(totalRoomWaterVnd, input.sharedWeights);
    waterVnd = shares[input.sharedIndex] ?? totalRoomWaterVnd;
    splitSuffix = ` (Chia đều ${input.sharedWeights.length} thành viên: ${waterVnd.toLocaleString('vi-VN')} ₫)`;
  }

  const spikeThreshold = Number(input.spikeThresholdM3 ?? 100);
  if (resolvedM3 > spikeThreshold && !input.anomalyConfirmed) {
    return {
      mode,
      status: 'ANOMALY',
      anomalyCode: 'ABNORMAL_WATER_SPIKE',
      anomalyMessage: `Số khối nước tăng đột biến (${resolvedM3} m³ > ngưỡng ${spikeThreshold} m³)`,
      occupantCount,
      startM3,
      endM3,
      consumptionM3: resolvedM3,
      unitRateVnd,
      waterVnd,
      totalRoomWaterVnd,
      displayLabel: `${resolvedM3} m³ (Đột biến)`,
      formulaNote: `${resolvedM3} m³ × ${unitRateVnd.toLocaleString('vi-VN')} ₫ = ${totalRoomWaterVnd.toLocaleString('vi-VN')} ₫${splitSuffix}`,
    };
  }

  return {
    mode,
    status: 'COMPLETE',
    anomalyCode: null,
    anomalyMessage: null,
    occupantCount,
    startM3,
    endM3,
    consumptionM3: resolvedM3,
    unitRateVnd,
    waterVnd,
    totalRoomWaterVnd,
    displayLabel:
      sharedTotalMembers > 1
        ? `${resolvedM3} m³ (÷${sharedTotalMembers} thành viên)`
        : `${resolvedM3} m³ × ${unitRateVnd.toLocaleString('vi-VN')} ₫`,
    formulaNote: `${resolvedM3} m³ × ${unitRateVnd.toLocaleString('vi-VN')} ₫ = ${totalRoomWaterVnd.toLocaleString('vi-VN')} ₫${splitSuffix}`,
  };
}

export interface CalculateTotalsInput {
  roomRentVnd: number;
  electricVnd: number;
  waterVnd: number;
  baseServiceFeeVnd: number;
  feeItems?: FeeLineItem[];
  previousDebtVnd?: number;
  prepaidCreditVnd?: number;
  paidAmountVnd?: number;
}

export interface CalculateTotalsResult {
  roomRentVnd: number;
  electricVnd: number;
  waterVnd: number;
  serviceFeeVnd: number;
  extraChargeVnd: number;
  discountVnd: number;
  adjustmentVnd: number;
  currentPeriodDueVnd: number;
  previousDebtVnd: number;
  prepaidCreditVnd: number;
  totalPayableVnd: number;
  paidAmountVnd: number;
  remainingAmountVnd: number;
  overpaidAmountVnd: number;
  feeItems: FeeLineItem[];
}

export function calculateObligationTotals(input: CalculateTotalsInput): CalculateTotalsResult {
  const roomRentVnd = Math.max(0, Math.round(toSafeNum(input.roomRentVnd)));
  const electricVnd = Math.max(0, Math.round(toSafeNum(input.electricVnd)));
  const waterVnd = Math.max(0, Math.round(toSafeNum(input.waterVnd)));
  const baseServiceFeeVnd = Math.max(0, Math.round(toSafeNum(input.baseServiceFeeVnd)));

  const rawItems = Array.isArray(input.feeItems) ? input.feeItems : [];
  const normalizedItems: FeeLineItem[] = rawItems.map((item, idx) => {
    const qty = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const unitPrice = Math.round(toSafeNum(item.unitPriceVnd ?? item.amountVnd));
    const amount = Math.round(toSafeNum(item.amountVnd ?? qty * unitPrice));
    return {
      id: item.id || `fee-${idx + 1}`,
      code: item.code || `FEE_${idx + 1}`,
      name: item.name || 'Khoản phí',
      category: item.category || 'EXTRA_CHARGE',
      quantity: qty,
      unitPriceVnd: unitPrice,
      amountVnd: amount,
      reason: item.reason,
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt,
    };
  });

  const hasRecurringItems = normalizedItems.some((i) => i.category === 'RECURRING_SERVICE');
  const recurringSum = normalizedItems
    .filter((i) => i.category === 'RECURRING_SERVICE')
    .reduce((sum, i) => sum + Math.max(0, i.amountVnd), 0);

  const serviceFeeVnd = hasRecurringItems ? recurringSum : baseServiceFeeVnd;
  const extraChargeVnd = normalizedItems
    .filter((i) => i.category === 'EXTRA_CHARGE')
    .reduce((sum, i) => sum + Math.max(0, i.amountVnd), 0);
  const discountVnd = normalizedItems
    .filter((i) => i.category === 'DISCOUNT')
    .reduce((sum, i) => sum + Math.abs(i.amountVnd), 0);
  const adjustmentVnd = normalizedItems
    .filter((i) => i.category === 'ADJUSTMENT')
    .reduce((sum, i) => sum + i.amountVnd, 0);

  // Section 9.1: Tổng phát sinh kỳ này = Tiền phòng + Tiền điện + Tiền nước + Phí dịch vụ + Phí phát sinh - Giảm trừ + Điều chỉnh
  const currentPeriodDueVnd =
    roomRentVnd + electricVnd + waterVnd + serviceFeeVnd + extraChargeVnd - discountVnd + adjustmentVnd;

  const previousDebtVnd = Math.max(0, Math.round(toSafeNum(input.previousDebtVnd)));
  const prepaidCreditVnd = Math.max(0, Math.round(toSafeNum(input.prepaidCreditVnd)));

  // Section 9.2: Tổng cần thanh toán = Tổng phát sinh kỳ này + Công nợ kỳ trước - Khoản đã trả trước
  const totalPayableVnd = Math.max(0, currentPeriodDueVnd + previousDebtVnd - prepaidCreditVnd);
  const paidAmountVnd = Math.max(0, Math.round(toSafeNum(input.paidAmountVnd)));
  const remainingAmountVnd = Math.max(0, totalPayableVnd - paidAmountVnd);
  const overpaidAmountVnd = paidAmountVnd > totalPayableVnd ? paidAmountVnd - totalPayableVnd : 0;

  return {
    roomRentVnd,
    electricVnd,
    waterVnd,
    serviceFeeVnd,
    extraChargeVnd,
    discountVnd,
    adjustmentVnd,
    currentPeriodDueVnd,
    previousDebtVnd,
    prepaidCreditVnd,
    totalPayableVnd,
    paidAmountVnd,
    remainingAmountVnd,
    overpaidAmountVnd,
    feeItems: normalizedItems,
  };
}

export interface SafetyEvaluationInput {
  electricStatus: 'COMPLETE' | 'MISSING_DATA' | 'ANOMALY';
  waterStatus: 'COMPLETE' | 'NEED_M3_INPUT' | 'ANOMALY';
  monthlyRentVnd: number;
  electricRateVnd: number;
  waterUnitRateVnd: number;
  contractValidInPeriod: boolean;
  hasUnconfirmedAnomaly: boolean;
  totals: CalculateTotalsResult;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
}

export interface SafetyEvaluationResult {
  canApprove: boolean;
  canAutoIssue: boolean;
  canSend: boolean;
  dataStatus: DataStatus;
  blockingReasons: string[];
  sendBlockingReasons: string[];
}

export function evaluateObligationSafety(input: SafetyEvaluationInput): SafetyEvaluationResult {
  const blockingReasons: string[] = [];
  const sendBlockingReasons: string[] = [];

  if (input.electricStatus === 'MISSING_DATA') {
    blockingReasons.push('Thiếu chỉ số điện cuối kỳ');
  } else if (input.electricStatus === 'ANOMALY') {
    blockingReasons.push('Chỉ số điện bất thường chưa được xác nhận');
  }

  if (input.waterStatus === 'NEED_M3_INPUT') {
    blockingReasons.push('Chưa nhập số khối nước (m³)');
  } else if (input.waterStatus === 'ANOMALY') {
    blockingReasons.push('Số khối nước bất thường chưa được xác nhận');
  }

  if (input.monthlyRentVnd <= 0 && input.totals.roomRentVnd <= 0) {
    blockingReasons.push('Đơn giá tiền phòng chưa hợp lệ (≤ 0 ₫)');
  }
  if (input.electricRateVnd < 0 || input.waterUnitRateVnd < 0) {
    blockingReasons.push('Đơn giá điện/nước không hợp lệ');
  }

  if (!input.contractValidInPeriod) {
    blockingReasons.push('Hợp đồng không nằm trong thời gian hiệu lực của kỳ');
  }

  if (input.hasUnconfirmedAnomaly && !blockingReasons.some((r) => r.includes('bất thường'))) {
    blockingReasons.push('Có cảnh báo bất thường cần kiểm tra');
  }

  const expectedCurrent =
    input.totals.roomRentVnd +
    input.totals.electricVnd +
    input.totals.waterVnd +
    input.totals.serviceFeeVnd +
    input.totals.extraChargeVnd -
    input.totals.discountVnd +
    input.totals.adjustmentVnd;
  const expectedTotal = Math.max(
    0,
    expectedCurrent + input.totals.previousDebtVnd - input.totals.prepaidCreditVnd
  );
  if (expectedTotal !== input.totals.totalPayableVnd || input.totals.totalPayableVnd < 0) {
    blockingReasons.push('Sai lệch công thức tổng tiền thanh toán');
  }

  const hasPhone = Boolean(String(input.tenantPhone || '').trim());
  const hasEmail = Boolean(String(input.tenantEmail || '').trim());
  if (!hasPhone && !hasEmail) {
    sendBlockingReasons.push('Thiếu thông tin liên hệ người nhận (SĐT/Zalo hoặc Email)');
  }

  let dataStatus: DataStatus = 'COMPLETE';
  if (
    input.electricStatus === 'ANOMALY' ||
    input.waterStatus === 'ANOMALY' ||
    input.hasUnconfirmedAnomaly
  ) {
    dataStatus = 'ANOMALY';
  } else if (
    input.electricStatus === 'MISSING_DATA' ||
    input.waterStatus === 'NEED_M3_INPUT' ||
    blockingReasons.length > 0
  ) {
    dataStatus = 'MISSING_DATA';
  }

  const canApprove = blockingReasons.length === 0;
  const canSend = canApprove && sendBlockingReasons.length === 0;
  const canAutoIssue = canSend;

  return {
    canApprove,
    canAutoIssue,
    canSend,
    dataStatus,
    blockingReasons,
    sendBlockingReasons: [...blockingReasons, ...sendBlockingReasons],
  };
}

// ============================================================================
// Workspace Data Assembly & API Endpoints
// ============================================================================

const MODULE_AUTOMATION_KEY = 'SETTLEMENT_AUTOMATION';

export async function buildSettlementWorkspacePayload(params: {
  prisma: any;
  orgId: string;
  scopedBuildingIds: string[];
  periodKey: string;
}) {
  const { prisma, orgId, scopedBuildingIds, periodKey } = params;
  const range = getPeriodDateRange(periodKey);
  const prevPeriodKey = getPreviousPeriodKey(periodKey);

  const [
    org,
    automationConn,
    buildings,
    rooms,
    contracts,
    electricMeters,
    currentInvoices,
    previousUnpaidInvoices,
    billingPeriods,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.integrationConnection.findUnique({
      where: { orgId_providerId: { orgId, providerId: MODULE_AUTOMATION_KEY } },
    }),
    prisma.building.findMany({
      where: { orgId, id: { in: scopedBuildingIds } },
      orderBy: { code: 'asc' },
    }),
    prisma.consoleRoom.findMany({
      where: { orgId, buildingId: { in: scopedBuildingIds } },
      include: {
        building: true,
        occupants: { where: { isActive: true } },
      },
      orderBy: [{ buildingId: 'asc' }, { code: 'asc' }],
    }),
    prisma.contract.findMany({
      where: {
        orgId,
        buildingId: { in: scopedBuildingIds },
        status: { in: ['ACTIVE', 'EXTENDED', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED'] },
      },
      include: { tenant: true, room: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.electricMeter.findMany({
      where: {
        orgId,
        room: { buildingId: { in: scopedBuildingIds } },
      },
      include: {
        room: { include: { building: true } },
        readings: {
          where: { periodKey: { in: [periodKey, prevPeriodKey] } },
          orderBy: { recordedAt: 'desc' },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        orgId,
        buildingId: { in: scopedBuildingIds },
        periodKey,
      },
      include: {
        room: true,
        building: true,
        tenant: true,
        contract: { include: { tenant: true } },
        payments: { orderBy: { verifiedAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.findMany({
      where: {
        orgId,
        buildingId: { in: scopedBuildingIds },
        periodKey: { lt: periodKey },
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
      },
    }),
    prisma.billingPeriod.findMany({
      where: { orgId, buildingId: { in: scopedBuildingIds } },
      include: { building: true },
      orderBy: [{ periodKey: 'desc' }],
      take: 36,
    }),
    prisma.consoleAuditLog.findMany({
      where: {
        orgId,
        OR: [
          { buildingId: { in: scopedBuildingIds } },
          { buildingId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
  ]);

  const autoCfg = parseJsonObject(automationConn?.capabilities);
  const automationMode: AutomationMode =
    autoCfg.mode === 'AUTO_FULL' || autoCfg.mode === 'MANUAL'
      ? autoCfg.mode
      : 'AUTO_DRAFT_WAIT_APPROVAL';
  const defaultDeliveryChannel: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL' =
    autoCfg.defaultChannel === 'EMAIL' || autoCfg.defaultChannel === 'ZALO_BOT'
      ? autoCfg.defaultChannel
      : 'ZALO_OA';

  const roomById = new Map<string, any>(rooms.map((r: any) => [r.id, r]));
  const buildingById = new Map<string, any>(buildings.map((b: any) => [b.id, b]));
  const electricMeterByRoomId = new Map<string, any>(
    electricMeters.map((m: any) => [m.roomId, m])
  );

  // Previous unpaid debt by contractId or roomId
  const prevDebtByContractId = new Map<string, number>();
  const prevDebtByRoomId = new Map<string, number>();
  for (const inv of previousUnpaidInvoices) {
    const rem = Math.max(0, toSafeNum(inv.totalAmountVnd) - toSafeNum(inv.paidAmountVnd));
    if (rem <= 0) continue;
    if (inv.contractId) {
      prevDebtByContractId.set(inv.contractId, (prevDebtByContractId.get(inv.contractId) || 0) + rem);
    }
    prevDebtByRoomId.set(inv.roomId, (prevDebtByRoomId.get(inv.roomId) || 0) + rem);
  }

  // Active contracts in period
  const activeContractsInPeriod = contracts.filter((c: any) => {
    const start = c.startDate ? new Date(c.startDate) : null;
    const end = c.endDate ? new Date(c.endDate) : null;
    const overlapsStart = !start || Number.isNaN(start.getTime()) || start.getTime() <= range.endDate.getTime();
    const overlapsEnd = !end || Number.isNaN(end.getTime()) || end.getTime() >= range.startDate.getTime();
    if (['ACTIVE', 'EXTENDED', 'EXPIRING_SOON'].includes(c.status) && overlapsStart && overlapsEnd) {
      return true;
    }
    return currentInvoices.some(
      (inv: any) => inv.contractId === c.id || (inv.roomId === c.roomId && !inv.contractId)
    );
  });

  const obligationsByRoom = new Map<string, any[]>();
  for (const c of activeContractsInPeriod) {
    const list = obligationsByRoom.get(c.roomId) || [];
    // If not SHARED_ROOM, avoid duplicate contracts unless both have invoices
    const room = roomById.get(c.roomId);
    if (room?.rentalModel !== 'SHARED_ROOM' && list.length >= 1) {
      const hasOwnInvoice = currentInvoices.some((inv: any) => inv.contractId === c.id);
      if (!hasOwnInvoice) continue;
    }
    list.push(c);
    obligationsByRoom.set(c.roomId, list);
  }

  for (const inv of currentInvoices) {
    if (!obligationsByRoom.has(inv.roomId)) {
      const rm = roomById.get(inv.roomId);
      const fallbackContract = inv.contract || {
        id: inv.contractId || `virtual-contract-${inv.roomId}`,
        contractCode: inv.contract?.contractCode || `HD-${rm?.code || inv.roomId}`,
        roomId: inv.roomId,
        buildingId: inv.buildingId,
        tenantId: inv.tenantId,
        status: 'ACTIVE',
        monthlyRentVnd: inv.roomRentVnd || rm?.baseRentVnd || 0,
        waterBillingMethod: rm?.waterBillingMethod || 'PER_PERSON',
        waterRateVnd: rm?.waterRateVnd || 100000,
        startDate: range.startIso,
        endDate: range.endIso,
        tenant: inv.tenant || inv.contract?.tenant || {
          id: inv.tenantId || `tenant-${inv.roomId}`,
          fullName: 'Khách lưu trú',
          phone: '',
          email: '',
        },
      };
      obligationsByRoom.set(inv.roomId, [fallbackContract]);
    }
  }

  const periodLockByBuilding = new Map<string, any>();
  for (const bp of billingPeriods) {
    if (bp.periodKey === periodKey) {
      periodLockByBuilding.set(bp.buildingId, bp);
    }
  }

  const settlementRows: any[] = [];
  const alerts: any[] = [];

  for (const [roomId, roomContracts] of obligationsByRoom.entries()) {
    const room = roomById.get(roomId);
    if (!room) continue;
    const building = buildingById.get(room.buildingId) || room.building;
    const buildingPeriod = periodLockByBuilding.get(room.buildingId);
    const isPeriodLocked = buildingPeriod?.status === 'LOCKED';

    const isSharedRoom = room.rentalModel === 'SHARED_ROOM' || roomContracts.length > 1;
    const orderedRoomContracts = [...roomContracts].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return String(a.contractCode || a.id).localeCompare(String(b.contractCode || b.id), 'vi');
    });

    const sharedWeights = orderedRoomContracts.map((rc: any) => {
      const occCount = (room.occupants || []).filter((o: any) => o.contractId === rc.id).length;
      return Math.max(1, occCount || Number(rc.occupantsCount || 1) || 1);
    });
    const totalSharedWeight = sharedWeights.reduce((acc, w) => acc + w, 0);

    // Resolve shared room-level utility inputs from any sibling invoice in the same period so all members stay synced
    const roomPeriodInvoices = currentInvoices.filter((inv: any) => inv.roomId === room.id);
    let roomSharedElectricMeta: any = null;
    let roomSharedWaterMeta: any = null;
    for (const rInv of roomPeriodInvoices) {
      const sMeta = parseJsonObject(parseJsonObject(rInv.policySnapshot).settlementMeta);
      if (!roomSharedElectricMeta && sMeta.electric?.endKwh !== undefined && sMeta.electric?.endKwh !== null) {
        roomSharedElectricMeta = sMeta.electric;
      }
      if (!roomSharedWaterMeta && sMeta.water?.consumptionM3 !== undefined && sMeta.water?.consumptionM3 !== null) {
        roomSharedWaterMeta = sMeta.water;
      }
    }

    let emittedElectricAlertForRoom = false;
    let emittedWaterAlertForRoom = false;

    for (const [contractIndex, contract] of orderedRoomContracts.entries()) {
      const obligationKey = `${periodKey}:${room.id}:${contract.id}`;

      const matchedInvoice =
        currentInvoices.find(
          (inv: any) => inv.roomId === room.id && inv.contractId === contract.id
        ) ||
        (orderedRoomContracts.length === 1 && !isSharedRoom
          ? currentInvoices.find((inv: any) => inv.roomId === room.id)
          : null);

      const snapshot = parseJsonObject(matchedInvoice?.policySnapshot);
      const settlementMeta = parseJsonObject(snapshot.settlementMeta);
      const isFirstCombined = snapshot.type === 'FIRST_COMBINED_INVOICE';
      const finSummary = parseJsonObject(snapshot.financialSummary);

      const isFrozenSnapshot =
        isPeriodLocked ||
        Boolean(snapshot.isFrozen) ||
        (matchedInvoice &&
          ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(matchedInvoice.status) &&
          Boolean(settlementMeta.frozenAt || isFirstCombined));

      // Electric Meter & Reading resolution
      const electricMeter = electricMeterByRoomId.get(room.id);
      const currentReadingRecord = electricMeter?.readings?.find((r: any) => r.periodKey === periodKey);
      const prevReadingRecord = electricMeter?.readings?.find((r: any) => r.periodKey === prevPeriodKey);
      const effectiveElectricMeta =
        settlementMeta.electric?.endKwh !== undefined && settlementMeta.electric?.endKwh !== null
          ? settlementMeta.electric
          : roomSharedElectricMeta || settlementMeta.electric || {};

      const electricMethod: 'HUNONIC_AUTO' | 'MANUAL' | 'FIXED' =
        effectiveElectricMeta?.method ||
        (room.electricBillingMode === 'FIXED'
          ? 'FIXED'
          : electricMeter?.connectionStatus === 'ONLINE'
          ? 'HUNONIC_AUTO'
          : 'MANUAL');

      // Determine startKwh & endKwh
      let resolvedStartKwh: number | null = null;
      let resolvedEndKwh: number | null = null;

      if (effectiveElectricMeta?.startKwh !== undefined && effectiveElectricMeta?.startKwh !== null) {
        resolvedStartKwh = effectiveElectricMeta.startKwh;
      } else if (prevReadingRecord?.readingKwh !== undefined) {
        resolvedStartKwh = Number(prevReadingRecord.readingKwh);
      } else if (electricMeter && currentReadingRecord?.readingKwh !== undefined) {
        const monthDelta = Number(electricMeter.monthReportedKwh ?? 0);
        resolvedStartKwh = Math.max(0, Number(currentReadingRecord.readingKwh) - monthDelta);
      } else if (electricMeter && electricMeter.connectionStatus === 'ONLINE' && electricMeter.cumulativeKwh != null) {
        const monthDelta = Number(electricMeter.monthReportedKwh ?? 0);
        resolvedStartKwh = Math.max(0, Number(electricMeter.cumulativeKwh) - monthDelta);
      } else if (isFirstCombined) {
        resolvedStartKwh = 0;
      } else if (electricMeter) {
        resolvedStartKwh = Number(electricMeter.cumulativeKwh || 0);
      }

      if (effectiveElectricMeta?.endKwh !== undefined && effectiveElectricMeta?.endKwh !== null) {
        resolvedEndKwh = effectiveElectricMeta.endKwh;
      } else if (currentReadingRecord?.readingKwh !== undefined) {
        resolvedEndKwh = Number(currentReadingRecord.readingKwh);
      } else if (electricMeter && electricMeter.connectionStatus === 'ONLINE' && electricMeter.monthReportedKwh != null) {
        resolvedEndKwh = Number(electricMeter.cumulativeKwh || 0);
      } else if (isFirstCombined) {
        resolvedEndKwh = resolvedStartKwh ?? 0;
      } else {
        resolvedEndKwh = null;
      }

      const electricRateVnd = Number(
        effectiveElectricMeta?.ratePerKwhVnd ??
          electricMeter?.tariffRateVnd ??
          room.electricRateVnd ??
          org?.defaultElectricRateVnd ??
          3800
      );

      const electricCalc = calculateObligationElectric({
        method: electricMethod,
        startKwh: resolvedStartKwh,
        endKwh: resolvedEndKwh,
        ratePerKwhVnd: electricRateVnd,
        fixedAmountVnd: effectiveElectricMeta?.fixedAmountVnd,
        meterReplaced: Boolean(effectiveElectricMeta?.meterReplaced),
        replacementOffsetKwh: effectiveElectricMeta?.replacementOffsetKwh,
        anomalyConfirmed: Boolean(effectiveElectricMeta?.anomalyConfirmed),
        sharedWeights: orderedRoomContracts.length > 1 ? sharedWeights : undefined,
        sharedIndex: orderedRoomContracts.length > 1 ? contractIndex : undefined,
      });

      // Water calculation resolution
      const effectiveWaterMeta =
        settlementMeta.water?.consumptionM3 !== undefined && settlementMeta.water?.consumptionM3 !== null
          ? settlementMeta.water
          : roomSharedWaterMeta || settlementMeta.water || {};

      const rawWaterMode =
        effectiveWaterMeta?.mode ||
        contract.waterBillingMethod ||
        room.waterBillingMethod ||
        building?.waterBillingMethod ||
        org?.defaultWaterMethod ||
        'PER_PERSON';

      const contractOccupants = (room.occupants || []).filter(
        (o: any) => o.contractId === contract.id
      ).length;
      const fallbackOccupants =
        isSharedRoom || orderedRoomContracts.length > 1
          ? Math.max(1, Number(contract.occupantsCount || 1))
          : Math.max(1, (room.occupants || []).length || Number(contract.occupantsCount || 1));
      const resolvedOccupantCount = Math.max(
        1,
        Number(
          settlementMeta.water?.occupantCount ??
            snapshot.occupantsCount ??
            (contractOccupants > 0 ? contractOccupants : fallbackOccupants)
        )
      );

      const resolvedWaterUnitRate = Number(
        effectiveWaterMeta?.unitRateVnd ??
          contract.waterRateVnd ??
          room.waterRateVnd ??
          building?.waterRateVnd ??
          org?.defaultWaterRateVnd ??
          (normalizeWaterMode(rawWaterMode) === 'PER_M3' ? 25000 : 100000)
      );

      const waterConsumptionM3 =
        effectiveWaterMeta?.consumptionM3 !== undefined && effectiveWaterMeta?.consumptionM3 !== null
          ? effectiveWaterMeta.consumptionM3
          : snapshot.waterUsageM3 !== undefined
          ? snapshot.waterUsageM3
          : isFirstCombined && normalizeWaterMode(rawWaterMode) === 'PER_M3'
          ? 0
          : null;

      const waterCalc = calculateObligationWater({
        mode: rawWaterMode,
        occupantCount: resolvedOccupantCount,
        waterPricePerPersonVnd: resolvedWaterUnitRate,
        waterPricePerM3Vnd: resolvedWaterUnitRate,
        waterFixedRoomVnd: resolvedWaterUnitRate,
        consumptionM3: waterConsumptionM3,
        startM3: effectiveWaterMeta?.startM3 ?? null,
        endM3: effectiveWaterMeta?.endM3 ?? null,
        anomalyConfirmed: Boolean(effectiveWaterMeta?.anomalyConfirmed),
        sharedWeights: orderedRoomContracts.length > 1 ? sharedWeights : undefined,
        sharedIndex: orderedRoomContracts.length > 1 ? contractIndex : undefined,
      });

      // Room Rent resolution (Rule 5: never mix deposit into roomRentVnd!)
      const rentCalc = calculateContractPeriodRent({
        monthlyRentVnd: toSafeNum(
          settlementMeta.rent?.baseMonthlyRentVnd ??
            contract.monthlyRentVnd ??
            room.baseRentVnd ??
            0
        ),
        periodKey,
        contractStartDate: contract.startDate,
        contractEndDate: contract.endDate,
        moveInDate: settlementMeta.rent?.moveInDate,
        moveOutDate: settlementMeta.rent?.moveOutDate,
        rateChange: settlementMeta.rent?.rateChange || null,
        exemptDays: settlementMeta.rent?.exemptDays || 0,
        rentDiscountVnd: settlementMeta.rent?.rentDiscountVnd || 0,
        bookingDepositVnd: isFirstCombined ? toSafeNum(finSummary.bookingDepositB) : 0,
        contractDepositVnd: isFirstCombined ? toSafeNum(finSummary.contractDepositRequiredC) : 0,
      });

      const baseServiceFee = toSafeNum(room.serviceFeeVnd ?? 0);
      const defaultFeeItems: FeeLineItem[] = Array.isArray(settlementMeta.feeItems)
        ? settlementMeta.feeItems
        : [
            ...(baseServiceFee > 0
              ? [
                  {
                    id: `fee-service-${room.code}`,
                    code: 'SERVICE_BASE',
                    name: 'Phí dịch vụ định kỳ (Internet, rác, vệ sinh)',
                    category: 'RECURRING_SERVICE' as const,
                    quantity: 1,
                    unitPriceVnd: baseServiceFee,
                    amountVnd: baseServiceFee,
                  },
                ]
              : []),
            ...(matchedInvoice && toSafeNum(matchedInvoice.adjustmentVnd) !== 0 && !settlementMeta.feeItems
              ? [
                  {
                    id: `fee-adj-${room.code}`,
                    code: 'INITIAL_ADJUSTMENT',
                    name: isFirstCombined
                      ? 'Khoản thu/khấu trừ cọc hợp đồng kỳ đầu (Tách khỏi tiền thuê)'
                      : 'Điều chỉnh kỳ',
                    category: 'ADJUSTMENT' as const,
                    quantity: 1,
                    unitPriceVnd: toSafeNum(matchedInvoice.adjustmentVnd),
                    amountVnd: toSafeNum(matchedInvoice.adjustmentVnd),
                    reason: isFirstCombined ? 'Cọc hợp đồng kỳ đầu' : 'Điều chỉnh',
                  },
                ]
              : []),
          ];

      const previousDebtVnd =
        settlementMeta.previousDebtVnd !== undefined
          ? toSafeNum(settlementMeta.previousDebtVnd)
          : prevDebtByContractId.get(contract.id) ??
            (roomContracts.length === 1 ? prevDebtByRoomId.get(room.id) ?? 0 : 0);

      const prepaidCreditVnd = toSafeNum(settlementMeta.prepaidCreditVnd);
      const paidAmountVnd = toSafeNum(matchedInvoice?.paidAmountVnd);

      const totals =
        isFrozenSnapshot && matchedInvoice
          ? calculateObligationTotals({
              roomRentVnd: toSafeNum(matchedInvoice.roomRentVnd),
              electricVnd: toSafeNum(matchedInvoice.electricVnd),
              waterVnd: toSafeNum(matchedInvoice.waterVnd),
              baseServiceFeeVnd: toSafeNum(matchedInvoice.serviceFeeVnd),
              feeItems: defaultFeeItems,
              previousDebtVnd,
              prepaidCreditVnd,
              paidAmountVnd,
            })
          : calculateObligationTotals({
              roomRentVnd: rentCalc.roomRentVnd,
              electricVnd: electricCalc.electricVnd,
              waterVnd: waterCalc.waterVnd,
              baseServiceFeeVnd: baseServiceFee,
              feeItems: defaultFeeItems,
              previousDebtVnd,
              prepaidCreditVnd,
              paidAmountVnd,
            });

      const tenant = contract.tenant ||
        matchedInvoice?.tenant || {
          id: contract.tenantId || `tenant-${room.id}`,
          fullName: 'Khách lưu trú',
          phone: '',
          email: '',
        };

      const effectiveElectricStatus =
        isFrozenSnapshot && matchedInvoice ? 'COMPLETE' : electricCalc.status;
      const effectiveWaterStatus =
        isFrozenSnapshot && matchedInvoice ? 'COMPLETE' : waterCalc.status;

      const safety = evaluateObligationSafety({
        electricStatus: effectiveElectricStatus,
        waterStatus: effectiveWaterStatus,
        monthlyRentVnd: Math.max(rentCalc.baseMonthlyRentVnd, totals.roomRentVnd),
        electricRateVnd,
        waterUnitRateVnd: waterCalc.unitRateVnd,
        contractValidInPeriod: rentCalc.activeDays > 0 || Boolean(matchedInvoice),
        hasUnconfirmedAnomaly:
          effectiveElectricStatus === 'ANOMALY' || effectiveWaterStatus === 'ANOMALY',
        totals,
        tenantPhone: tenant.phone,
        tenantEmail: tenant.email,
      });

      const dataStatus: DataStatus = safety.dataStatus;

      let invoiceStatus: InvoiceWorkflowStatus = 'NOT_CREATED';
      if (matchedInvoice) {
        if (matchedInvoice.status === 'VOID') {
          invoiceStatus = 'VOID';
        } else if (['ISSUED', 'PARTIAL', 'PAID', 'OVERDUE'].includes(matchedInvoice.status)) {
          invoiceStatus = 'ISSUED';
        } else if (settlementMeta.workflowStatus === 'APPROVED') {
          invoiceStatus = safety.canApprove ? 'APPROVED' : 'NEEDS_ADJUSTMENT';
        } else if (settlementMeta.workflowStatus === 'NEEDS_ADJUSTMENT') {
          invoiceStatus = 'NEEDS_ADJUSTMENT';
        } else if (settlementMeta.workflowStatus === 'PENDING_APPROVAL') {
          invoiceStatus = safety.canApprove ? 'PENDING_APPROVAL' : 'NEEDS_ADJUSTMENT';
        } else {
          invoiceStatus = safety.canApprove ? 'DRAFT' : 'NEEDS_ADJUSTMENT';
        }
      }

      const deliveryMeta = parseJsonObject(settlementMeta.delivery);
      let deliveryStatus: DeliveryWorkflowStatus = 'NOT_SENT';
      if (
        deliveryMeta.status &&
        ['NOT_SENT', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRY_NEEDED'].includes(
          deliveryMeta.status
        )
      ) {
        deliveryStatus = deliveryMeta.status;
      } else if (
        matchedInvoice &&
        ['PAID', 'PARTIAL'].includes(matchedInvoice.status)
      ) {
        deliveryStatus = 'DELIVERED';
      } else if (matchedInvoice && matchedInvoice.status === 'ISSUED' && deliveryMeta.sentAt) {
        deliveryStatus = 'SENT';
      }

      const deliveryChannel: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL' =
        deliveryMeta.channel || defaultDeliveryChannel;

      let paymentStatus: PaymentWorkflowStatus = 'UNPAID';
      const txList = matchedInvoice?.payments || [];
      const hasUnreconciledTx = txList.some(
        (tx: any) => tx.reconcileState === 'UNMATCHED' || tx.reconcileState === 'PENDING'
      );
      if (hasUnreconciledTx) {
        paymentStatus = 'PENDING_RECONCILE';
      } else if (totals.overpaidAmountVnd > 0) {
        paymentStatus = 'OVERPAID';
      } else if (totals.totalPayableVnd > 0 && totals.paidAmountVnd >= totals.totalPayableVnd) {
        paymentStatus = 'PAID';
      } else if (totals.paidAmountVnd > 0 && totals.paidAmountVnd < totals.totalPayableVnd) {
        paymentStatus = 'PARTIAL';
      } else if (matchedInvoice?.status === 'OVERDUE') {
        paymentStatus = 'OVERDUE';
      } else {
        paymentStatus = 'UNPAID';
      }

      // Generate actionable alerts for Part D (deduplicate room-level electric/water alerts for shared rooms)
      const roomLabelForAlert = isSharedRoom
        ? `Phòng ghép ${room.code} (${orderedRoomContracts.length} TV)`
        : `Phòng ${room.code}`;
      if (effectiveElectricStatus === 'MISSING_DATA' && !emittedElectricAlertForRoom) {
        emittedElectricAlertForRoom = true;
        alerts.push({
          id: `alert-elec-missing-${room.id}-${periodKey}`,
          obligationKey,
          roomId: room.id,
          roomCode: room.code,
          buildingId: building.id,
          buildingCode: building.code,
          severity: 'WARNING',
          category: 'MISSING_ELECTRIC',
          title: `${roomLabelForAlert} thiếu chỉ số điện kỳ ${periodKey}`,
          description: electricCalc.anomalyMessage || 'Chưa đồng bộ hoặc chưa nhập chỉ số điện cuối kỳ.',
          actionLabel: 'Nhập chỉ số điện',
          actionType: 'INPUT_ELECTRIC',
        });
      } else if (effectiveElectricStatus === 'ANOMALY' && !emittedElectricAlertForRoom) {
        emittedElectricAlertForRoom = true;
        alerts.push({
          id: `alert-elec-anomaly-${room.id}-${periodKey}`,
          obligationKey,
          roomId: room.id,
          roomCode: room.code,
          buildingId: building.id,
          buildingCode: building.code,
          severity: 'CRITICAL',
          category: electricCalc.anomalyCode || 'ELECTRIC_ANOMALY',
          title: `${roomLabelForAlert}: ${electricCalc.anomalyMessage}`,
          description: `Đầu kỳ: ${electricCalc.startKwh ?? '—'} kWh • Cuối kỳ: ${electricCalc.endKwh ?? '—'} kWh`,
          actionLabel: 'Kiểm tra chỉ số',
          actionType: 'INPUT_ELECTRIC',
        });
      }

      if (effectiveWaterStatus === 'NEED_M3_INPUT' && !emittedWaterAlertForRoom) {
        emittedWaterAlertForRoom = true;
        alerts.push({
          id: `alert-water-missing-${room.id}-${periodKey}`,
          obligationKey,
          roomId: room.id,
          roomCode: room.code,
          buildingId: building.id,
          buildingCode: building.code,
          severity: 'WARNING',
          category: 'MISSING_WATER_M3',
          title: `${roomLabelForAlert} cần nhập số khối nước (m³)`,
          description: `Chính sách tính nước theo m³ (${waterCalc.unitRateVnd.toLocaleString('vi-VN')} ₫/m³). Chưa có số khối kỳ ${periodKey}.`,
          actionLabel: 'Nhập khối nước',
          actionType: 'INPUT_WATER',
        });
      } else if (effectiveWaterStatus === 'ANOMALY' && !emittedWaterAlertForRoom) {
        emittedWaterAlertForRoom = true;
        alerts.push({
          id: `alert-water-anomaly-${room.id}-${periodKey}`,
          obligationKey,
          roomId: room.id,
          roomCode: room.code,
          buildingId: building.id,
          buildingCode: building.code,
          severity: 'CRITICAL',
          category: waterCalc.anomalyCode || 'WATER_ANOMALY',
          title: `${roomLabelForAlert}: ${waterCalc.anomalyMessage}`,
          description: `Đơn giá ${waterCalc.unitRateVnd.toLocaleString('vi-VN')} ₫/m³`,
          actionLabel: 'Kiểm tra nước',
          actionType: 'INPUT_WATER',
        });
      }

      if (deliveryStatus === 'FAILED' || deliveryStatus === 'RETRY_NEEDED') {
        alerts.push({
          id: `alert-delivery-failed-${obligationKey}`,
          obligationKey,
          roomId: room.id,
          roomCode: room.code,
          buildingId: building.id,
          buildingCode: building.code,
          severity: 'CRITICAL',
          category: 'DELIVERY_FAILED',
          title: `Phòng ${room.code}: Gửi hóa đơn thất bại qua ${deliveryChannel}`,
          description: deliveryMeta.lastError || 'Cần kiểm tra thông tin người nhận và gửi lại.',
          actionLabel: 'Gửi lại hóa đơn',
          actionType: 'OPEN_DELIVERY_TAB',
        });
      }

      // Filter audit logs relevant to this room / invoice
      const rowHistory = recentAuditLogs
        .filter((log: any) => {
          const meta = parseJsonObject(log.metadata);
          return (
            log.entityId === matchedInvoice?.id ||
            log.entityId === room.id ||
            log.entityId === obligationKey ||
            meta.roomCode === room.code ||
            meta.obligationKey === obligationKey ||
            meta.invoiceCode === matchedInvoice?.invoiceCode ||
            String(log.summary || '').includes(room.code)
          );
        })
        .slice(0, 20)
        .map((log: any) => ({
          id: log.id,
          action: log.action,
          actorEmail: log.actorEmail || log.actorId || 'system',
          actorRole: log.actorRole || 'SYSTEM',
          summary: log.summary || log.action,
          createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
          metadata: parseJsonObject(log.metadata),
        }));

      settlementRows.push({
        obligationKey,
        periodKey,
        periodDisplayRange: range.displayRange,
        isPeriodLocked,
        isFrozenSnapshot: Boolean(isFrozenSnapshot),
        room: {
          id: room.id,
          code: room.code,
          title: room.title,
          occupancyStatus: room.occupancyStatus,
          rentalModel: room.rentalModel,
          sharedContractCount: orderedRoomContracts.length,
        },
        sharedRoomInfo: {
          isSharedRoom: isSharedRoom || orderedRoomContracts.length > 1,
          memberIndex: contractIndex + 1,
          totalMembers: orderedRoomContracts.length,
          weight: sharedWeights[contractIndex] ?? 1,
          totalWeight: totalSharedWeight,
        },
        building: {
          id: building.id,
          code: building.code,
          name: building.name,
        },
        tenant: {
          id: tenant.id,
          fullName: tenant.fullName,
          phone: tenant.phone || '',
          email: tenant.email || '',
        },
        contract: {
          id: contract.id,
          code: contract.contractCode || contract.code || `HD-${room.code}`,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate,
          occupantCount: resolvedOccupantCount,
          monthlyRentVnd: toSafeNum(
            settlementMeta.rent?.baseMonthlyRentVnd ??
              contract.monthlyRentVnd ??
              room.baseRentVnd ??
              0
          ),
        },
        rent: rentCalc,
        electric: {
          ...electricCalc,
          status: effectiveElectricStatus,
          meterId: electricMeter?.id || null,
          meterSerial: electricMeter?.meterSerial || null,
          connectionStatus: electricMeter?.connectionStatus || 'UNCONFIGURED',
          lastSyncedAt: electricMeter?.lastSyncedAt
            ? new Date(electricMeter.lastSyncedAt).toISOString()
            : null,
          inputSource:
            settlementMeta.electric?.inputSource ||
            currentReadingRecord?.source ||
            (electricMeter?.connectionStatus === 'ONLINE' ? 'HUNONIC_SYNC' : 'NONE'),
          updatedBy: settlementMeta.electric?.updatedBy || currentReadingRecord?.recordedByActor || null,
        },
        water: {
          ...waterCalc,
          status: effectiveWaterStatus,
          inputSource: settlementMeta.water?.inputSource || 'CONTRACT_POLICY',
          updatedBy: settlementMeta.water?.updatedBy || null,
          updatedAt: settlementMeta.water?.updatedAt || null,
        },
        totals,
        safety,
        statuses: {
          dataStatus,
          invoiceStatus,
          deliveryStatus,
          paymentStatus,
        },
        invoice: matchedInvoice
          ? {
              id: matchedInvoice.id,
              code: matchedInvoice.invoiceCode,
              dbStatus: matchedInvoice.status,
              dueDate: matchedInvoice.dueDate,
              createdAt:
                matchedInvoice.createdAt instanceof Date
                  ? matchedInvoice.createdAt.toISOString()
                  : String(matchedInvoice.createdAt),
              updatedAt:
                matchedInvoice.updatedAt instanceof Date
                  ? matchedInvoice.updatedAt.toISOString()
                  : String(matchedInvoice.updatedAt),
              isFirstCombined,
              approvedBy: settlementMeta.approvedBy || null,
              approvedAt: settlementMeta.approvedAt || null,
              issuedBy: settlementMeta.issuedBy || snapshot.lockedBy || null,
              issuedAt: settlementMeta.issuedAt || snapshot.frozenAt || null,
            }
          : null,
        delivery: {
          channel: deliveryChannel,
          recipientName: tenant.fullName,
          recipientContact:
            deliveryChannel === 'EMAIL'
              ? tenant.email || tenant.phone || ''
              : tenant.phone || tenant.email || '',
          status: deliveryStatus,
          sentAt: deliveryMeta.sentAt || null,
          deliveredAt: deliveryMeta.deliveredAt || null,
          attempts: Number(deliveryMeta.attempts || 0),
          lastError: deliveryMeta.lastError || null,
          txId: deliveryMeta.txId || null,
        },
        payments: {
          totalPayableVnd: totals.totalPayableVnd,
          paidAmountVnd: totals.paidAmountVnd,
          remainingAmountVnd: totals.remainingAmountVnd,
          overpaidAmountVnd: totals.overpaidAmountVnd,
          status: paymentStatus,
          transactions: txList.map((tx: any) => ({
            id: tx.id,
            transactionCode: tx.externalTxId,
            provider: tx.providerId,
            amountVnd: toSafeNum(tx.amountVnd),
            reconcileStatus: tx.reconcileState,
            paidAt:
              tx.verifiedAt instanceof Date ? tx.verifiedAt.toISOString() : String(tx.verifiedAt),
            note: tx.referenceText || '',
          })),
        },
        history: rowHistory,
      });
    }
  }

  settlementRows.sort((a, b) => {
    const bCmp = String(a.building.code).localeCompare(String(b.building.code), 'vi');
    if (bCmp !== 0) return bCmp;
    return String(a.room.code).localeCompare(String(b.room.code), 'vi', { numeric: true });
  });

  // Part B: 6 KPIs computed from real rows
  const kpiSummary = {
    totalExpectedPeriodVnd: settlementRows.reduce((sum, r) => sum + r.totals.totalPayableVnd, 0),
    currentPeriodChargesVnd: settlementRows.reduce((sum, r) => sum + r.totals.currentPeriodDueVnd, 0),
    totalPreviousDebtVnd: settlementRows.reduce((sum, r) => sum + r.totals.previousDebtVnd, 0),
    totalRoomRentVnd: settlementRows.reduce((sum, r) => sum + r.totals.roomRentVnd, 0),
    totalUtilitiesAndServicesVnd: settlementRows.reduce(
      (sum, r) =>
        sum +
        r.totals.electricVnd +
        r.totals.waterVnd +
        r.totals.serviceFeeVnd +
        r.totals.extraChargeVnd,
      0
    ),
    totalElectricVnd: settlementRows.reduce((sum, r) => sum + r.totals.electricVnd, 0),
    totalWaterVnd: settlementRows.reduce((sum, r) => sum + r.totals.waterVnd, 0),
    totalServiceAndExtraVnd: settlementRows.reduce(
      (sum, r) => sum + r.totals.serviceFeeVnd + r.totals.extraChargeVnd,
      0
    ),
    readyInvoicesCount: settlementRows.filter((r) => r.safety.canApprove).length,
    totalObligationsCount: settlementRows.length,
    sentInvoicesCount: settlementRows.filter((r) =>
      ['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
    ).length,
    needSendInvoicesCount: settlementRows.filter((r) => r.statuses.invoiceStatus !== 'VOID').length,
    totalCollectedVnd: settlementRows.reduce((sum, r) => sum + r.totals.paidAmountVnd, 0),
    totalRemainingReceivableVnd: settlementRows.reduce(
      (sum, r) => sum + r.totals.remainingAmountVnd,
      0
    ),
  };

  // Part C: Independent progress dimensions
  const progressSummary = {
    totalObligations: settlementRows.length,
    completeDataCount: settlementRows.filter((r) => r.statuses.dataStatus === 'COMPLETE').length,
    missingDataCount: settlementRows.filter((r) => r.statuses.dataStatus === 'MISSING_DATA').length,
    anomalyCount: settlementRows.filter((r) => r.statuses.dataStatus === 'ANOMALY').length,
    draftCreatedCount: settlementRows.filter((r) => r.statuses.invoiceStatus !== 'NOT_CREATED')
      .length,
    pendingApprovalCount: settlementRows.filter((r) =>
      ['DRAFT', 'PENDING_APPROVAL'].includes(r.statuses.invoiceStatus)
    ).length,
    needsAdjustmentCount: settlementRows.filter(
      (r) => r.statuses.invoiceStatus === 'NEEDS_ADJUSTMENT'
    ).length,
    approvedCount: settlementRows.filter((r) => r.statuses.invoiceStatus === 'APPROVED').length,
    issuedCount: settlementRows.filter((r) => r.statuses.invoiceStatus === 'ISSUED').length,
    sentCount: settlementRows.filter((r) =>
      ['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
    ).length,
    paidCount: settlementRows.filter((r) => r.statuses.paymentStatus === 'PAID').length,
    unpaidCount: settlementRows.filter((r) =>
      ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(r.statuses.paymentStatus)
    ).length,
  };

  return {
    periodKey: range.periodKey,
    periodDisplayRange: range.displayRange,
    automationPolicy: {
      mode: automationMode,
      defaultChannel: defaultDeliveryChannel,
      electricSpikeThresholdKwh: Number(autoCfg.electricSpikeThresholdKwh ?? 2000),
      waterSpikeThresholdM3: Number(autoCfg.waterSpikeThresholdM3 ?? 100),
    },
    kpiSummary,
    progressSummary,
    alerts,
    settlementRows,
  };
}

// ============================================================================
// HTTP Route Handler for /api/v1/console/v2/settlements/*
// ============================================================================

export async function handleSettlementCenterApi(params: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  urlObj: URL;
  prisma: any;
  actor: AuthoritativeConsoleActor;
  scopedBuildingIds: string[];
  readJsonBody: (req: IncomingMessage) => Promise<Record<string, any>>;
  sendJson: (res: ServerResponse, status: number, payload: unknown) => void;
}): Promise<boolean> {
  const {
    req,
    res,
    pathname,
    urlObj,
    prisma,
    actor,
    scopedBuildingIds,
    readJsonBody,
    sendJson,
  } = params;

  const method = req.method || 'GET';
  const orgId = actor.orgId;

  // 1. GET /api/v1/console/v2/settlements/workspace
  if (method === 'GET' && pathname === '/api/v1/console/v2/settlements/workspace') {
    if (!actorHasPermission(actor, 'settlements.view')) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Không có quyền xem quyết toán kỳ.',
      });
      return true;
    }

    const periodKey = String(urlObj.searchParams.get('periodKey') || '').trim() || '2026-11';
    const buildingIdParam = String(urlObj.searchParams.get('buildingId') || '').trim();
    const filteredBuildingIds =
      buildingIdParam && buildingIdParam !== 'ALL'
        ? scopedBuildingIds.filter((id) => id === buildingIdParam)
        : scopedBuildingIds;

    const payload = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds: filteredBuildingIds,
      periodKey,
    });

    sendJson(res, 200, { ok: true, ...payload });
    return true;
  }

  // 2. POST /api/v1/console/v2/settlements/room-input
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/room-input') {
    const body = await readJsonBody(req);
    const hasFeeAdjustments = Array.isArray(body.feeItems) || body.confirmAnomaly !== undefined;

    if (hasFeeAdjustments) {
      if (!actorHasPermission(actor, 'settlements.manage')) {
        sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Tài khoản không có quyền chỉnh sửa phí/điều chỉnh hóa đơn.',
        });
        return true;
      }
    } else {
      const canInputReading =
        actor.role === 'TECHNICIAN' ||
        actorHasPermission(actor, 'settlements.manage') ||
        actorHasPermission(actor, 'meters.override_reading');
      if (!canInputReading) {
        sendJson(res, 403, {
          ok: false,
          errorCode: 'INSUFFICIENT_PERMISSION',
          message: 'Tài khoản không có quyền nhập chỉ số điện/nước.',
        });
        return true;
      }
    }

    const periodKey = String(body.periodKey || '2026-11').trim();
    const roomId = String(body.roomId || '').trim();
    const contractId = String(body.contractId || '').trim();

    if (!roomId || !periodKey) {
      sendJson(res, 400, {
        ok: false,
        errorCode: 'MISSING_ROOM_OR_PERIOD',
        message: 'Thiếu mã phòng hoặc kỳ quyết toán.',
      });
      return true;
    }

    const room = await prisma.consoleRoom.findUnique({
      where: { id: roomId },
      include: { building: true, occupants: { where: { isActive: true } } },
    });
    if (!room || room.orgId !== orgId || !isBuildingAllowedForActor(actor, room.buildingId, room.building.code)) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_ROOM_SCOPE',
        message: 'Phòng không thuộc phạm vi tòa nhà được phân quyền.',
      });
      return true;
    }

    // Check if period is locked
    const billingPeriod = await prisma.billingPeriod.findUnique({
      where: {
        orgId_buildingId_periodKey: {
          orgId,
          buildingId: room.buildingId,
          periodKey,
        },
      },
    });
    if (billingPeriod?.status === 'LOCKED') {
      sendJson(res, 409, {
        ok: false,
        errorCode: 'PERIOD_ALREADY_LOCKED',
        message: `Kỳ quyết toán ${periodKey} của tòa ${room.building.code} đã khóa sổ. Không thể sửa trực tiếp số liệu gốc.`,
      });
      return true;
    }

    if (body.rawTotalOverrideVnd !== undefined) {
      sendJson(res, 400, {
        ok: false,
        errorCode: 'RAW_TOTAL_OVERRIDE_FORBIDDEN',
        message: 'Không cho phép ghi đè trực tiếp tổng tiền cuối cùng. Vui lòng thêm dòng Điều chỉnh có lý do.',
      });
      return true;
    }

    const activeRoomContractsRaw = await prisma.contract.findMany({
      where: { orgId, roomId: room.id, status: { in: ['ACTIVE', 'EXTENDED', 'EXPIRING_SOON'] } },
      include: { tenant: true },
    });
    const orderedRoomContracts = [...activeRoomContractsRaw].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return String(a.contractCode || a.id).localeCompare(String(b.contractCode || b.id), 'vi');
    });

    const requestedContract = contractId
      ? orderedRoomContracts.find((c: any) => c.id === contractId) ||
        (await prisma.contract.findUnique({ where: { id: contractId }, include: { tenant: true } }))
      : orderedRoomContracts[0] || null;

    if (!requestedContract) {
      sendJson(res, 404, {
        ok: false,
        errorCode: 'CONTRACT_NOT_FOUND',
        message: 'Không tìm thấy hợp đồng hiệu lực của phòng.',
      });
      return true;
    }

    const effectiveContracts =
      orderedRoomContracts.some((c: any) => c.id === requestedContract.id)
        ? orderedRoomContracts
        : [...orderedRoomContracts, requestedContract];

    const isSharedRoom = room.rentalModel === 'SHARED_ROOM' || effectiveContracts.length > 1;
    const sharedWeights = effectiveContracts.map((rc: any) => {
      const occCount = (room.occupants || []).filter((o: any) => o.contractId === rc.id).length;
      return Math.max(1, occCount || Number(rc.occupantsCount || 1) || 1);
    });

    const contract = requestedContract;
    const existingInvoices = await prisma.invoice.findMany({
      where: { orgId, roomId: room.id, periodKey },
      orderBy: { createdAt: 'desc' },
    });

    const findInvoiceForContract = (targetContractId: string) =>
      existingInvoices.find((inv: any) => inv.contractId === targetContractId) ||
      (!isSharedRoom && effectiveContracts.length <= 1 ? existingInvoices[0] : null) ||
      null;

    const matchedInvoice = findInvoiceForContract(contract.id);
    const applyToRoomMembers = Boolean(body.applyToRoomMembers) || !contractId;

    if (
      !applyToRoomMembers &&
      matchedInvoice &&
      ['ISSUED', 'PARTIAL', 'PAID'].includes(matchedInvoice.status) &&
      !body.allowIssuedAdjustment
    ) {
      sendJson(res, 409, {
        ok: false,
        errorCode: 'INVOICE_ALREADY_ISSUED',
        message: `Hóa đơn ${matchedInvoice.invoiceCode} đã phát hành. Chỉ được phép tạo bút toán điều chỉnh, không sửa trực tiếp chỉ số gốc.`,
      });
      return true;
    }

    const prevSnapshot = parseJsonObject(matchedInvoice?.policySnapshot);
    const prevMeta = parseJsonObject(prevSnapshot.settlementMeta);
    const prevElectric = parseJsonObject(prevMeta.electric);
    const prevWater = parseJsonObject(prevMeta.water);

    let nextElectricMeta: any = null;
    if (body.electric !== undefined && body.electric !== null) {
      const eInput = body.electric;
      const startKwh =
        eInput.startKwh !== undefined && eInput.startKwh !== null && eInput.startKwh !== ''
          ? Number(eInput.startKwh)
          : prevElectric.startKwh ?? 0;
      const endKwh =
        eInput.endKwh !== undefined && eInput.endKwh !== null && eInput.endKwh !== ''
          ? Number(eInput.endKwh)
          : null;

      nextElectricMeta = {
        ...prevElectric,
        method: eInput.method || prevElectric.method || 'MANUAL',
        startKwh,
        endKwh,
        ratePerKwhVnd: Number(
          eInput.ratePerKwhVnd ?? prevElectric.ratePerKwhVnd ?? room.electricRateVnd ?? 3800
        ),
        meterReplaced: Boolean(eInput.meterReplaced ?? prevElectric.meterReplaced),
        replacementOffsetKwh: Number(eInput.replacementOffsetKwh ?? prevElectric.replacementOffsetKwh ?? 0),
        anomalyConfirmed: Boolean(eInput.anomalyConfirmed ?? body.confirmAnomaly ?? prevElectric.anomalyConfirmed),
        inputSource: 'MANUAL_SETTLEMENT',
        reason: String(eInput.reason || body.reason || 'Cập nhật chỉ số điện tại Tổng hợp kỳ'),
        updatedBy: actor.email || actor.id,
        updatedAt: new Date().toISOString(),
      };

      if (endKwh !== null && !Number.isNaN(endKwh) && endKwh >= 0) {
        let electricMeter = await prisma.electricMeter.findUnique({
          where: { roomId: room.id },
        });
        if (!electricMeter) {
          electricMeter = await prisma.electricMeter.create({
            data: {
              orgId,
              roomId: room.id,
              meterSerial: `MTR-${room.code}`,
              connectionStatus: 'ONLINE',
              cumulativeKwh: endKwh,
              monthReportedKwh: Math.max(0, endKwh - Number(startKwh || 0)),
              lastSyncedAt: new Date(),
            },
          });
        } else {
          await prisma.electricMeter.update({
            where: { id: electricMeter.id },
            data: {
              cumulativeKwh: endKwh,
              monthReportedKwh: Math.max(0, endKwh - Number(startKwh || 0)),
              lastSyncedAt: new Date(),
            },
          });
        }

        await prisma.meterReading.create({
          data: {
            meterId: electricMeter.id,
            periodKey,
            readingKwh: endKwh,
            source: 'MANUAL_APPROVED',
            recordedByActor: actor.email,
            overrideReason: String(eInput.reason || body.reason || 'Cập nhật tại Tổng hợp kỳ'),
          },
        });
      }
    }

    let nextWaterMeta: any = null;
    if (body.water !== undefined && body.water !== null) {
      const wInput = body.water;
      const hasConsumption =
        wInput.consumptionM3 !== undefined &&
        wInput.consumptionM3 !== null &&
        String(wInput.consumptionM3).trim() !== '';
      const consumptionM3 = hasConsumption ? Number(wInput.consumptionM3) : null;

      nextWaterMeta = {
        ...prevWater,
        mode: wInput.mode || prevWater.mode || contract.waterBillingMethod || room.waterBillingMethod || 'PER_M3',
        occupantCount: Number(
          wInput.occupantCount ??
            prevWater.occupantCount ??
            (isSharedRoom ? Number(contract.occupantsCount || 1) : Math.max(1, (room.occupants || []).length))
        ),
        consumptionM3,
        startM3:
          wInput.startM3 !== undefined && wInput.startM3 !== null && wInput.startM3 !== ''
            ? Number(wInput.startM3)
            : null,
        endM3:
          wInput.endM3 !== undefined && wInput.endM3 !== null && wInput.endM3 !== ''
            ? Number(wInput.endM3)
            : null,
        unitRateVnd:
          wInput.unitRateVnd !== undefined
            ? Number(wInput.unitRateVnd)
            : prevWater.unitRateVnd,
        anomalyConfirmed: Boolean(wInput.anomalyConfirmed ?? body.confirmAnomaly ?? prevWater.anomalyConfirmed),
        inputSource: 'MANUAL_SETTLEMENT',
        reason: String(wInput.reason || body.reason || 'Nhập số khối nước tại Tổng hợp kỳ'),
        updatedBy: actor.email || actor.id,
        updatedAt: new Date().toISOString(),
      };
    }

    const mappedBodyFeeItems: FeeLineItem[] | undefined = Array.isArray(body.feeItems)
      ? body.feeItems.map((item: any, idx: number) => ({
          id: item.id || `fee-${Date.now()}-${idx}`,
          code: item.code || `ITEM_${idx + 1}`,
          name: String(item.name || 'Khoản mục chi phí'),
          category: item.category || 'EXTRA_CHARGE',
          quantity: Number(item.quantity || 1),
          unitPriceVnd: Math.round(toSafeNum(item.unitPriceVnd ?? item.amountVnd)),
          amountVnd: Math.round(
            toSafeNum(item.amountVnd ?? Number(item.quantity || 1) * toSafeNum(item.unitPriceVnd))
          ),
          reason: item.reason || body.reason || '',
          updatedBy: actor.email || actor.id,
          updatedAt: new Date().toISOString(),
        }))
      : undefined;

    const shouldSyncAllRoomMembers =
      isSharedRoom && (applyToRoomMembers || nextElectricMeta !== null || nextWaterMeta !== null);

    let primarySavedInvoice: any = null;
    let primaryTotals: any = null;
    let primaryElectricCalc: any = null;
    let primaryWaterCalc: any = null;
    let primaryWorkflowStatus: InvoiceWorkflowStatus = 'PENDING_APPROVAL';
    let updatedMembersCount = 0;

    for (const [memberIdx, memberContract] of effectiveContracts.entries()) {
      const isPrimary = memberContract.id === contract.id;
      if (!isPrimary && !shouldSyncAllRoomMembers) continue;

      const memberMatchedInv = findInvoiceForContract(memberContract.id);
      if (
        !isPrimary &&
        memberMatchedInv &&
        ['ISSUED', 'PARTIAL', 'PAID'].includes(memberMatchedInv.status) &&
        !body.allowIssuedAdjustment
      ) {
        continue;
      }
      if (
        isPrimary &&
        applyToRoomMembers &&
        memberMatchedInv &&
        ['ISSUED', 'PARTIAL', 'PAID'].includes(memberMatchedInv.status) &&
        !body.allowIssuedAdjustment
      ) {
        continue;
      }

      const mPrevSnapshot = parseJsonObject(memberMatchedInv?.policySnapshot);
      const mPrevMeta = parseJsonObject(mPrevSnapshot.settlementMeta);
      const mPrevElectric = parseJsonObject(mPrevMeta.electric);
      const mPrevWater = parseJsonObject(mPrevMeta.water);

      const mElectricMeta = nextElectricMeta ? { ...mPrevElectric, ...nextElectricMeta } : mPrevElectric;
      const mWaterMeta = nextWaterMeta ? { ...mPrevWater, ...nextWaterMeta } : mPrevWater;
      const mFeeItems = isPrimary && mappedBodyFeeItems ? mappedBodyFeeItems : mPrevMeta.feeItems;

      const resolvedMemberMonthlyRentVnd = toSafeNum(
        (isPrimary ? body.rent?.baseMonthlyRentVnd : undefined) ??
          mPrevMeta.rent?.baseMonthlyRentVnd ??
          memberContract.monthlyRentVnd ??
          room.baseRentVnd ??
          0
      );

      const mRentCalc = calculateContractPeriodRent({
        monthlyRentVnd: resolvedMemberMonthlyRentVnd,
        periodKey,
        contractStartDate: memberContract.startDate,
        contractEndDate: memberContract.endDate,
        moveInDate: (isPrimary ? body.rent?.moveInDate : undefined) ?? mPrevMeta.rent?.moveInDate,
        moveOutDate: (isPrimary ? body.rent?.moveOutDate : undefined) ?? mPrevMeta.rent?.moveOutDate,
        rateChange: (isPrimary ? body.rent?.rateChange : undefined) ?? mPrevMeta.rent?.rateChange,
        exemptDays: (isPrimary ? body.rent?.exemptDays : undefined) ?? mPrevMeta.rent?.exemptDays,
        rentDiscountVnd:
          (isPrimary ? body.rent?.rentDiscountVnd : undefined) ?? mPrevMeta.rent?.rentDiscountVnd,
      });

      const mElectricCalc = calculateObligationElectric({
        method: mElectricMeta.method || 'MANUAL',
        startKwh: mElectricMeta.startKwh,
        endKwh: mElectricMeta.endKwh,
        ratePerKwhVnd: Number(mElectricMeta.ratePerKwhVnd ?? room.electricRateVnd ?? 3800),
        meterReplaced: Boolean(mElectricMeta.meterReplaced),
        replacementOffsetKwh: Number(mElectricMeta.replacementOffsetKwh || 0),
        anomalyConfirmed: Boolean(mElectricMeta.anomalyConfirmed),
        sharedWeights: effectiveContracts.length > 1 ? sharedWeights : undefined,
        sharedIndex: effectiveContracts.length > 1 ? memberIdx : undefined,
      });

      const rawWaterMode =
        mWaterMeta.mode || memberContract.waterBillingMethod || room.waterBillingMethod || 'PER_PERSON';
      const defaultWaterRate = Number(
        mWaterMeta.unitRateVnd ??
          memberContract.waterRateVnd ??
          room.waterRateVnd ??
          (normalizeWaterMode(rawWaterMode) === 'PER_M3' ? 25000 : 100000)
      );
      const memberOccCount = isSharedRoom
        ? Number(mWaterMeta.occupantCount ?? memberContract.occupantsCount ?? 1)
        : Number(mWaterMeta.occupantCount ?? Math.max(1, (room.occupants || []).length));

      const mWaterCalc = calculateObligationWater({
        mode: rawWaterMode,
        occupantCount: Math.max(1, memberOccCount),
        waterPricePerPersonVnd: defaultWaterRate,
        waterPricePerM3Vnd: defaultWaterRate,
        waterFixedRoomVnd: defaultWaterRate,
        consumptionM3: mWaterMeta.consumptionM3,
        startM3: mWaterMeta.startM3,
        endM3: mWaterMeta.endM3,
        anomalyConfirmed: Boolean(mWaterMeta.anomalyConfirmed),
        sharedWeights: effectiveContracts.length > 1 ? sharedWeights : undefined,
        sharedIndex: effectiveContracts.length > 1 ? memberIdx : undefined,
      });

      const mTotals = calculateObligationTotals({
        roomRentVnd: mRentCalc.roomRentVnd,
        electricVnd: mElectricCalc.electricVnd,
        waterVnd: mWaterCalc.waterVnd,
        baseServiceFeeVnd: toSafeNum(room.serviceFeeVnd ?? 0),
        feeItems: mFeeItems,
        previousDebtVnd: toSafeNum(
          (isPrimary ? body.previousDebtVnd : undefined) ?? mPrevMeta.previousDebtVnd ?? 0
        ),
        prepaidCreditVnd: toSafeNum(
          (isPrimary ? body.prepaidCreditVnd : undefined) ?? mPrevMeta.prepaidCreditVnd ?? 0
        ),
        paidAmountVnd: toSafeNum(memberMatchedInv?.paidAmountVnd),
      });

      const mSafety = evaluateObligationSafety({
        electricStatus: mElectricCalc.status,
        waterStatus: mWaterCalc.status,
        monthlyRentVnd: Math.max(mRentCalc.baseMonthlyRentVnd, mTotals.roomRentVnd),
        electricRateVnd: mElectricCalc.ratePerKwhVnd,
        waterUnitRateVnd: mWaterCalc.unitRateVnd,
        contractValidInPeriod: mRentCalc.activeDays > 0,
        hasUnconfirmedAnomaly: mElectricCalc.status === 'ANOMALY' || mWaterCalc.status === 'ANOMALY',
        totals: mTotals,
        tenantPhone: memberContract.tenant?.phone,
        tenantEmail: memberContract.tenant?.email,
      });

      const mNextWorkflowStatus: InvoiceWorkflowStatus = mSafety.canApprove
        ? 'PENDING_APPROVAL'
        : 'NEEDS_ADJUSTMENT';

      const nextPolicySnapshot = {
        ...mPrevSnapshot,
        version: 'settlement-v2',
        waterPricingMode: mWaterCalc.mode,
        waterUsageM3: mWaterCalc.consumptionM3,
        occupantsCount: mWaterCalc.occupantCount,
        settlementMeta: {
          ...mPrevMeta,
          workflowStatus: mNextWorkflowStatus,
          rent: {
            ...(mPrevMeta.rent || {}),
            ...(isPrimary && body.rent ? body.rent : {}),
            baseMonthlyRentVnd: resolvedMemberMonthlyRentVnd,
            calculatedRoomRentVnd: mRentCalc.roomRentVnd,
            formulaNote: mRentCalc.formulaNote,
          },
          electric: {
            ...mElectricMeta,
            consumptionKwh: mElectricCalc.consumptionKwh,
            electricVnd: mElectricCalc.electricVnd,
            status: mElectricCalc.status,
          },
          water: {
            ...mWaterMeta,
            mode: mWaterCalc.mode,
            consumptionM3: mWaterCalc.consumptionM3,
            unitRateVnd: mWaterCalc.unitRateVnd,
            waterVnd: mWaterCalc.waterVnd,
            status: mWaterCalc.status,
          },
          feeItems: mTotals.feeItems,
          previousDebtVnd: mTotals.previousDebtVnd,
          prepaidCreditVnd: mTotals.prepaidCreditVnd,
          lastUpdatedBy: actor.email || actor.id,
          lastUpdatedAt: new Date().toISOString(),
        },
      };

      const dueDate = memberMatchedInv?.dueDate || `${periodKey}-05`;
      const invoiceCode =
        memberMatchedInv?.invoiceCode ||
        buildCandidateInvoiceCode(
          periodKey,
          room.code,
          memberContract.contractCode || memberContract.id,
          isSharedRoom,
          memberIdx
        );

      const netAdjustmentForDb =
        mTotals.extraChargeVnd -
        mTotals.discountVnd +
        mTotals.adjustmentVnd +
        mTotals.previousDebtVnd -
        mTotals.prepaidCreditVnd;

      const savedInv = memberMatchedInv
        ? await prisma.invoice.update({
            where: { id: memberMatchedInv.id },
            data: {
              roomRentVnd: BigInt(mTotals.roomRentVnd),
              electricVnd: BigInt(mTotals.electricVnd),
              waterVnd: BigInt(mTotals.waterVnd),
              serviceFeeVnd: BigInt(mTotals.serviceFeeVnd),
              adjustmentVnd: BigInt(netAdjustmentForDb),
              totalAmountVnd: BigInt(mTotals.totalPayableVnd),
              policySnapshot: nextPolicySnapshot,
            },
          })
        : await prisma.invoice.upsert({
            where: {
              orgId_invoiceCode: {
                orgId,
                invoiceCode,
              },
            },
            update: {
              contractId: memberContract.id,
              tenantId: memberContract.tenantId,
              roomRentVnd: BigInt(mTotals.roomRentVnd),
              electricVnd: BigInt(mTotals.electricVnd),
              waterVnd: BigInt(mTotals.waterVnd),
              serviceFeeVnd: BigInt(mTotals.serviceFeeVnd),
              adjustmentVnd: BigInt(netAdjustmentForDb),
              totalAmountVnd: BigInt(mTotals.totalPayableVnd),
              policySnapshot: nextPolicySnapshot,
            },
            create: {
              orgId,
              buildingId: room.buildingId,
              roomId: room.id,
              contractId: memberContract.id,
              tenantId: memberContract.tenantId,
              periodKey,
              invoiceCode,
              status: 'DRAFT',
              dueDate,
              roomRentVnd: BigInt(mTotals.roomRentVnd),
              electricVnd: BigInt(mTotals.electricVnd),
              waterVnd: BigInt(mTotals.waterVnd),
              serviceFeeVnd: BigInt(mTotals.serviceFeeVnd),
              adjustmentVnd: BigInt(netAdjustmentForDb),
              totalAmountVnd: BigInt(mTotals.totalPayableVnd),
              paidAmountVnd: BigInt(0),
              policySnapshot: nextPolicySnapshot,
            },
          });

      updatedMembersCount += 1;
      if (isPrimary || !primarySavedInvoice) {
        primarySavedInvoice = savedInv;
        primaryTotals = mTotals;
        primaryElectricCalc = mElectricCalc;
        primaryWaterCalc = mWaterCalc;
        primaryWorkflowStatus = mNextWorkflowStatus;
      }
    }

    if (!primarySavedInvoice && applyToRoomMembers) {
      sendJson(res, 409, {
        ok: false,
        errorCode: 'INVOICE_ALREADY_ISSUED',
        message: `Tất cả hóa đơn thành viên phòng ${room.code} đã phát hành. Chỉ được phép tạo bút toán điều chỉnh.`,
      });
      return true;
    }

    const savedInvoice = primarySavedInvoice;
    const totals = primaryTotals;
    const electricCalc = primaryElectricCalc;
    const waterCalc = primaryWaterCalc;
    const nextWorkflowStatus = primaryWorkflowStatus;

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        buildingId: room.buildingId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'INVOICE',
        entityId: savedInvoice.id,
        action: 'SETTLEMENT_ROOM_INPUT_UPDATED',
        summary:
          updatedMembersCount > 1
            ? `Cập nhật dữ liệu quyết toán phòng ghép ${room.code} (${updatedMembersCount} thành viên) kỳ ${periodKey}`
            : `Cập nhật dữ liệu quyết toán phòng ${room.code} kỳ ${periodKey} (Tổng: ${totals.totalPayableVnd.toLocaleString('vi-VN')} ₫)`,
        metadata: {
          periodKey,
          roomCode: room.code,
          invoiceCode: savedInvoice.invoiceCode,
          updatedMembersCount,
          electricVnd: totals.electricVnd,
          waterVnd: totals.waterVnd,
          waterConsumptionM3: waterCalc.consumptionM3,
          electricConsumptionKwh: electricCalc.consumptionKwh,
          totalPayableVnd: totals.totalPayableVnd,
          workflowStatus: nextWorkflowStatus,
          reason: body.reason || 'Cập nhật dữ liệu quyết toán phòng',
        },
      },
    });

    const updatedWorkspace = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds,
      periodKey,
    });
    const updatedRow = updatedWorkspace.settlementRows.find(
      (r) => r.room.id === room.id && r.contract.id === contract.id
    );

    sendJson(res, 200, {
      ok: true,
      row: updatedRow,
      kpiSummary: updatedWorkspace.kpiSummary,
      progressSummary: updatedWorkspace.progressSummary,
      alerts: updatedWorkspace.alerts,
    });
    return true;
  }

  // 3. POST /api/v1/console/v2/settlements/compile
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/compile') {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền tổng hợp kỳ.',
      });
      return true;
    }

    const body = await readJsonBody(req);
    const periodKey = String(body.periodKey || '2026-11').trim();
    const buildingIdParam = String(body.buildingId || 'ALL').trim();
    const targetObligationKeys: string[] = Array.isArray(body.obligationKeys)
      ? body.obligationKeys.map(String)
      : [];

    const filteredBuildingIds =
      buildingIdParam && buildingIdParam !== 'ALL'
        ? scopedBuildingIds.filter((id) => id === buildingIdParam)
        : scopedBuildingIds;

    const currentWorkspace = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds: filteredBuildingIds,
      periodKey,
    });

    const requestedMode: AutomationMode =
      body.mode === 'AUTO_FULL' || body.mode === 'MANUAL' || body.mode === 'AUTO_DRAFT_WAIT_APPROVAL'
        ? body.mode
        : currentWorkspace.automationPolicy.mode;

    const rowsToProcess =
      targetObligationKeys.length > 0
        ? currentWorkspace.settlementRows.filter((r) => targetObligationKeys.includes(r.obligationKey))
        : currentWorkspace.settlementRows;

    const defaultDueDate = `${periodKey}-05`;

    let createdCount = 0;
    let updatedCount = 0;
    let readyForApprovalCount = 0;
    let autoIssuedCount = 0;
    let autoSentCount = 0;
    let isolatedExceptionCount = 0;

    for (const row of rowsToProcess) {
      if (row.isPeriodLocked) continue;

      if (row.invoice && ['ISSUED', 'PARTIAL', 'PAID'].includes(row.invoice.dbStatus)) {
        continue;
      }

      const existingInv = row.invoice
        ? await prisma.invoice.findUnique({ where: { id: row.invoice.id } })
        : null;
      const prevSnapshot = parseJsonObject(existingInv?.policySnapshot);
      const prevMeta = parseJsonObject(prevSnapshot.settlementMeta);

      let nextWorkflowStatus: InvoiceWorkflowStatus = 'DRAFT';
      let nextDbStatus: 'DRAFT' | 'ISSUED' = 'DRAFT';
      let deliveryMeta = parseJsonObject(prevMeta.delivery);
      let frozenAt: string | null = prevMeta.frozenAt || null;

      if (requestedMode === 'AUTO_FULL') {
        if (row.safety.canAutoIssue) {
          nextWorkflowStatus = 'ISSUED';
          nextDbStatus = 'ISSUED';
          frozenAt = new Date().toISOString();
          deliveryMeta = {
            channel: row.delivery.channel,
            recipientName: row.tenant.fullName,
            recipientContact: row.delivery.recipientContact,
            status: 'SENT',
            sentAt: new Date().toISOString(),
            attempts: Number(deliveryMeta.attempts || 0) + 1,
            txId: `AUTO-MSG-${Date.now()}-${row.room.code}`,
            lastError: null,
          };
          autoIssuedCount += 1;
          autoSentCount += 1;
        } else {
          nextWorkflowStatus = 'NEEDS_ADJUSTMENT';
          nextDbStatus = 'DRAFT';
          isolatedExceptionCount += 1;
        }
      } else {
        if (row.safety.canApprove) {
          nextWorkflowStatus = 'PENDING_APPROVAL';
          readyForApprovalCount += 1;
        } else {
          nextWorkflowStatus = 'NEEDS_ADJUSTMENT';
          isolatedExceptionCount += 1;
        }
      }

      const netAdjustmentForDb =
        row.totals.extraChargeVnd -
        row.totals.discountVnd +
        row.totals.adjustmentVnd +
        row.totals.previousDebtVnd -
        row.totals.prepaidCreditVnd;

      const snapshotPayload = {
        ...prevSnapshot,
        version: 'settlement-v2',
        waterPricingMode: row.water.mode,
        waterUsageM3: row.water.consumptionM3,
        occupantsCount: row.water.occupantCount,
        settlementMeta: {
          ...prevMeta,
          workflowStatus: nextWorkflowStatus,
          frozenAt,
          compiledAt: new Date().toISOString(),
          compiledBy: actor.email || actor.id,
          compileMode: requestedMode,
          approvedBy: nextDbStatus === 'ISSUED' ? actor.email || 'AUTO_ENGINE' : prevMeta.approvedBy,
          approvedAt: nextDbStatus === 'ISSUED' ? new Date().toISOString() : prevMeta.approvedAt,
          issuedBy: nextDbStatus === 'ISSUED' ? actor.email || 'AUTO_ENGINE' : prevMeta.issuedBy,
          issuedAt: nextDbStatus === 'ISSUED' ? new Date().toISOString() : prevMeta.issuedAt,
          rent: {
            ...(prevMeta.rent || {}),
            baseMonthlyRentVnd: row.rent.baseMonthlyRentVnd,
            calculatedRoomRentVnd: row.rent.roomRentVnd,
            activeDays: row.rent.activeDays,
            formulaNote: row.rent.formulaNote,
          },
          electric: {
            ...(prevMeta.electric || {}),
            method: row.electric.method,
            startKwh: row.electric.startKwh,
            endKwh: row.electric.endKwh,
            consumptionKwh: row.electric.consumptionKwh,
            ratePerKwhVnd: row.electric.ratePerKwhVnd,
            electricVnd: row.electric.electricVnd,
            status: row.electric.status,
          },
          water: {
            ...(prevMeta.water || {}),
            mode: row.water.mode,
            occupantCount: row.water.occupantCount,
            consumptionM3: row.water.consumptionM3,
            unitRateVnd: row.water.unitRateVnd,
            waterVnd: row.water.waterVnd,
            status: row.water.status,
          },
          feeItems: row.totals.feeItems,
          previousDebtVnd: row.totals.previousDebtVnd,
          prepaidCreditVnd: row.totals.prepaidCreditVnd,
          delivery: deliveryMeta,
        },
      };

      const candidateCode =
        existingInv?.invoiceCode ||
        buildCandidateInvoiceCode(
          periodKey,
          row.room.code,
          row.contract.code || row.contract.id,
          row.room.rentalModel === 'SHARED_ROOM' || row.room.sharedContractCount > 1,
          (row.sharedRoomInfo?.memberIndex ?? 1) - 1
        );

      if (existingInv) {
        await prisma.invoice.update({
          where: { id: existingInv.id },
          data: {
            status: nextDbStatus,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: snapshotPayload,
          },
        });
        updatedCount += 1;
      } else {
        await prisma.invoice.upsert({
          where: {
            orgId_invoiceCode: {
              orgId,
              invoiceCode: candidateCode,
            },
          },
          update: {
            status: nextDbStatus,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: snapshotPayload,
          },
          create: {
            orgId,
            buildingId: row.building.id,
            roomId: row.room.id,
            contractId: row.contract.id,
            tenantId: row.tenant.id,
            periodKey,
            invoiceCode: candidateCode,
            status: nextDbStatus,
            dueDate: defaultDueDate,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            paidAmountVnd: BigInt(0),
            policySnapshot: snapshotPayload,
          },
        });
        createdCount += 1;
      }
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PERIOD',
        entityId: periodKey,
        action: 'SETTLEMENT_COMPILED',
        summary: `Tổng hợp kỳ ${periodKey} (Chế độ: ${requestedMode}) — Tạo mới: ${createdCount}, Cập nhật: ${updatedCount}, Sẵn sàng duyệt: ${readyForApprovalCount}, Tự động phát hành: ${autoIssuedCount}, Ngoại lệ: ${isolatedExceptionCount}`,
        metadata: {
          periodKey,
          mode: requestedMode,
          createdCount,
          updatedCount,
          readyForApprovalCount,
          autoIssuedCount,
          autoSentCount,
          isolatedExceptionCount,
        },
      },
    });

    const refreshed = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds: filteredBuildingIds,
      periodKey,
    });

    sendJson(res, 200, {
      ok: true,
      compileResult: {
        periodKey,
        mode: requestedMode,
        createdCount,
        updatedCount,
        readyForApprovalCount,
        autoIssuedCount,
        autoSentCount,
        isolatedExceptionCount,
      },
      ...refreshed,
    });
    return true;
  }

  // 4. POST /api/v1/console/v2/settlements/approve
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/approve') {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền phê duyệt hóa đơn quyết toán.',
      });
      return true;
    }

    const body = await readJsonBody(req);
    const periodKey = String(body.periodKey || '2026-11').trim();
    const action: 'APPROVE' | 'REJECT' = body.action === 'REJECT' ? 'REJECT' : 'APPROVE';
    const obligationKeys: string[] = Array.isArray(body.obligationKeys)
      ? body.obligationKeys.map(String)
      : [];

    const workspace = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds,
      periodKey,
    });

    const candidates =
      obligationKeys.length > 0
        ? workspace.settlementRows.filter((r) => obligationKeys.includes(r.obligationKey))
        : workspace.settlementRows.filter((r) =>
            ['DRAFT', 'PENDING_APPROVAL'].includes(r.statuses.invoiceStatus)
          );

    const approvedList: string[] = [];
    const skippedList: Array<{ obligationKey: string; roomCode: string; reasons: string[] }> = [];
    const defaultDueDate = `${periodKey}-05`;

    for (const row of candidates) {
      if (row.isPeriodLocked) {
        skippedList.push({
          obligationKey: row.obligationKey,
          roomCode: row.room.code,
          reasons: ['Kỳ đã khóa sổ'],
        });
        continue;
      }

      if (action === 'APPROVE' && !row.safety.canApprove) {
        skippedList.push({
          obligationKey: row.obligationKey,
          roomCode: row.room.code,
          reasons: row.safety.blockingReasons,
        });
        continue;
      }

      const existingInv = row.invoice
        ? await prisma.invoice.findUnique({ where: { id: row.invoice.id } })
        : null;
      const prevSnapshot = parseJsonObject(existingInv?.policySnapshot);
      const prevMeta = parseJsonObject(prevSnapshot.settlementMeta);

      const nextWorkflowStatus: InvoiceWorkflowStatus =
        action === 'APPROVE' ? 'APPROVED' : 'NEEDS_ADJUSTMENT';

      const nextSnapshot = {
        ...prevSnapshot,
        version: 'settlement-v2',
        settlementMeta: {
          ...prevMeta,
          workflowStatus: nextWorkflowStatus,
          approvedBy: action === 'APPROVE' ? actor.email || actor.id : null,
          approvedAt: action === 'APPROVE' ? new Date().toISOString() : null,
          rejectionReason: action === 'REJECT' ? String(body.reason || 'Yêu cầu kiểm tra lại số liệu') : null,
          feeItems: row.totals.feeItems,
          previousDebtVnd: row.totals.previousDebtVnd,
          prepaidCreditVnd: row.totals.prepaidCreditVnd,
        },
      };

      const netAdjustmentForDb =
        row.totals.extraChargeVnd -
        row.totals.discountVnd +
        row.totals.adjustmentVnd +
        row.totals.previousDebtVnd -
        row.totals.prepaidCreditVnd;

      const candidateCode =
        existingInv?.invoiceCode ||
        buildCandidateInvoiceCode(
          periodKey,
          row.room.code,
          row.contract.code || row.contract.id,
          row.room.rentalModel === 'SHARED_ROOM' || row.room.sharedContractCount > 1,
          (row.sharedRoomInfo?.memberIndex ?? 1) - 1
        );

      if (existingInv) {
        await prisma.invoice.update({
          where: { id: existingInv.id },
          data: {
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: nextSnapshot,
          },
        });
      } else {
        await prisma.invoice.upsert({
          where: { orgId_invoiceCode: { orgId, invoiceCode: candidateCode } },
          update: {
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: nextSnapshot,
          },
          create: {
            orgId,
            buildingId: row.building.id,
            roomId: row.room.id,
            contractId: row.contract.id,
            tenantId: row.tenant.id,
            periodKey,
            invoiceCode: candidateCode,
            status: 'DRAFT',
            dueDate: defaultDueDate,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            paidAmountVnd: BigInt(0),
            policySnapshot: nextSnapshot,
          },
        });
      }

      approvedList.push(row.room.code);
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PERIOD',
        entityId: periodKey,
        action: action === 'APPROVE' ? 'SETTLEMENT_APPROVED' : 'SETTLEMENT_RETURNED_FOR_ADJUSTMENT',
        summary:
          action === 'APPROVE'
            ? `Phê duyệt ${approvedList.length} hóa đơn kỳ ${periodKey} (Bỏ qua ${skippedList.length} phòng chưa đủ điều kiện)`
            : `Trả lại điều chỉnh ${approvedList.length} hóa đơn kỳ ${periodKey}`,
        metadata: {
          periodKey,
          action,
          processedRooms: approvedList,
          skippedRooms: skippedList,
          reason: body.reason || null,
        },
      },
    });

    const refreshed = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds,
      periodKey,
    });

    sendJson(res, 200, {
      ok: true,
      approvalResult: {
        action,
        processedCount: approvedList.length,
        processedRooms: approvedList,
        skippedCount: skippedList.length,
        skippedRooms: skippedList,
      },
      ...refreshed,
    });
    return true;
  }

  // 5. POST /api/v1/console/v2/settlements/issue-and-send
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/issue-and-send') {
    if (!actorHasPermission(actor, 'invoices.manage')) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền phát hành và gửi hóa đơn.',
      });
      return true;
    }

    const body = await readJsonBody(req);
    const periodKey = String(body.periodKey || '2026-11').trim();
    const obligationKeys: string[] = Array.isArray(body.obligationKeys)
      ? body.obligationKeys.map(String)
      : [];
    const requestedChannel: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL' | undefined =
      body.channel === 'ZALO_OA' || body.channel === 'ZALO_BOT' || body.channel === 'EMAIL'
        ? body.channel
        : undefined;
    const simulateFailure = Boolean(body.simulateFailure);

    const workspace = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds,
      periodKey,
    });

    const candidates =
      obligationKeys.length > 0
        ? workspace.settlementRows.filter((r) => obligationKeys.includes(r.obligationKey))
        : workspace.settlementRows.filter(
            (r) =>
              r.safety.canApprove &&
              ['APPROVED', 'PENDING_APPROVAL', 'DRAFT', 'ISSUED'].includes(r.statuses.invoiceStatus) &&
              !['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
          );

    const issuedAndSentRooms: string[] = [];
    const failedDeliveries: Array<{ roomCode: string; reason: string }> = [];
    const defaultDueDate = `${periodKey}-05`;

    for (const row of candidates) {
      if (!row.safety.canApprove) {
        failedDeliveries.push({
          roomCode: row.room.code,
          reason: row.safety.blockingReasons.join('; '),
        });
        continue;
      }

      const existingInv = row.invoice
        ? await prisma.invoice.findUnique({ where: { id: row.invoice.id } })
        : null;
      const prevSnapshot = parseJsonObject(existingInv?.policySnapshot);
      const prevMeta = parseJsonObject(prevSnapshot.settlementMeta);
      const prevDelivery = parseJsonObject(prevMeta.delivery);

      const channel = requestedChannel || row.delivery.channel || 'ZALO_OA';
      const recipientContact =
        String(body.recipientOverride || '').trim() ||
        (channel === 'EMAIL'
          ? row.tenant.email || row.tenant.phone
          : row.tenant.phone || row.tenant.email) ||
        '';

      const attempts = Number(prevDelivery.attempts || 0) + 1;
      const canDeliver = Boolean(recipientContact) && !simulateFailure;

      const deliveryMeta = canDeliver
        ? {
            channel,
            recipientName: row.tenant.fullName,
            recipientContact,
            status: 'SENT' as DeliveryWorkflowStatus,
            sentAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            attempts,
            txId: `MSG-${channel}-${Date.now()}-${row.room.code}`,
            lastError: null,
          }
        : {
            channel,
            recipientName: row.tenant.fullName,
            recipientContact,
            status: 'FAILED' as DeliveryWorkflowStatus,
            sentAt: prevDelivery.sentAt || null,
            attempts,
            txId: null,
            lastError: !recipientContact
              ? 'Thiếu SĐT/Zalo hoặc Email người nhận'
              : 'Kênh gửi tạm thời phản hồi lỗi kết nối (Có thể nhấn Gửi lại)',
          };

      const immutableSnapshot = {
        ...prevSnapshot,
        version: 'settlement-v2',
        waterPricingMode: row.water.mode,
        waterUsageM3: row.water.consumptionM3,
        occupantsCount: row.water.occupantCount,
        frozenInvoiceSnapshot: {
          frozenAt: prevMeta.frozenAt || new Date().toISOString(),
          periodKey,
          roomCode: row.room.code,
          buildingCode: row.building.code,
          contractCode: row.contract.code,
          tenantName: row.tenant.fullName,
          tenantPhone: row.tenant.phone,
          rent: row.rent,
          electric: row.electric,
          water: row.water,
          totals: row.totals,
        },
        settlementMeta: {
          ...prevMeta,
          workflowStatus: 'ISSUED',
          frozenAt: prevMeta.frozenAt || new Date().toISOString(),
          approvedBy: prevMeta.approvedBy || actor.email || actor.id,
          approvedAt: prevMeta.approvedAt || new Date().toISOString(),
          issuedBy: prevMeta.issuedBy || actor.email || actor.id,
          issuedAt: prevMeta.issuedAt || new Date().toISOString(),
          feeItems: row.totals.feeItems,
          previousDebtVnd: row.totals.previousDebtVnd,
          prepaidCreditVnd: row.totals.prepaidCreditVnd,
          delivery: deliveryMeta,
        },
      };

      const netAdjustmentForDb =
        row.totals.extraChargeVnd -
        row.totals.discountVnd +
        row.totals.adjustmentVnd +
        row.totals.previousDebtVnd -
        row.totals.prepaidCreditVnd;

      const nextDbStatus =
        existingInv && ['PAID', 'PARTIAL', 'OVERDUE'].includes(existingInv.status)
          ? existingInv.status
          : 'ISSUED';

      const candidateCode =
        existingInv?.invoiceCode ||
        buildCandidateInvoiceCode(
          periodKey,
          row.room.code,
          row.contract.code || row.contract.id,
          row.room.rentalModel === 'SHARED_ROOM' || row.room.sharedContractCount > 1,
          (row.sharedRoomInfo?.memberIndex ?? 1) - 1
        );

      if (existingInv) {
        await prisma.invoice.update({
          where: { id: existingInv.id },
          data: {
            status: nextDbStatus,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: immutableSnapshot,
          },
        });
      } else {
        await prisma.invoice.upsert({
          where: { orgId_invoiceCode: { orgId, invoiceCode: candidateCode } },
          update: {
            status: 'ISSUED',
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            policySnapshot: immutableSnapshot,
          },
          create: {
            orgId,
            buildingId: row.building.id,
            roomId: row.room.id,
            contractId: row.contract.id,
            tenantId: row.tenant.id,
            periodKey,
            invoiceCode: candidateCode,
            status: 'ISSUED',
            dueDate: defaultDueDate,
            roomRentVnd: BigInt(row.totals.roomRentVnd),
            electricVnd: BigInt(row.totals.electricVnd),
            waterVnd: BigInt(row.totals.waterVnd),
            serviceFeeVnd: BigInt(row.totals.serviceFeeVnd),
            adjustmentVnd: BigInt(netAdjustmentForDb),
            totalAmountVnd: BigInt(row.totals.totalPayableVnd),
            paidAmountVnd: BigInt(0),
            policySnapshot: immutableSnapshot,
          },
        });
      }

      if (canDeliver) {
        issuedAndSentRooms.push(row.room.code);
      } else {
        failedDeliveries.push({
          roomCode: row.room.code,
          reason: deliveryMeta.lastError || 'Gửi thất bại',
        });
      }
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PERIOD',
        entityId: periodKey,
        action: 'SETTLEMENT_ISSUED_AND_SENT',
        summary: `Phát hành & gửi hóa đơn kỳ ${periodKey}: Gửi thành công ${issuedAndSentRooms.length} phòng, lỗi ${failedDeliveries.length} phòng`,
        metadata: {
          periodKey,
          channel: requestedChannel || 'DEFAULT',
          sentRooms: issuedAndSentRooms,
          failedDeliveries,
        },
      },
    });

    const refreshed = await buildSettlementWorkspacePayload({
      prisma,
      orgId,
      scopedBuildingIds,
      periodKey,
    });

    sendJson(res, 200, {
      ok: true,
      issueAndSendResult: {
        sentCount: issuedAndSentRooms.length,
        sentRooms: issuedAndSentRooms,
        failedCount: failedDeliveries.length,
        failedDeliveries,
      },
      ...refreshed,
    });
    return true;
  }

  // 6. POST /api/v1/console/v2/settlements/automation-policy
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/automation-policy') {
    if (!actorHasPermission(actor, 'settlements.manage')) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'INSUFFICIENT_PERMISSION',
        message: 'Tài khoản không có quyền cấu hình chế độ tự động quyết toán.',
      });
      return true;
    }

    const body = await readJsonBody(req);
    const mode: AutomationMode =
      body.mode === 'AUTO_FULL' || body.mode === 'MANUAL'
        ? body.mode
        : 'AUTO_DRAFT_WAIT_APPROVAL';
    const defaultChannel =
      body.defaultChannel === 'EMAIL' || body.defaultChannel === 'ZALO_BOT'
        ? body.defaultChannel
        : 'ZALO_OA';

    const policyObj = {
      mode,
      defaultChannel,
      electricSpikeThresholdKwh: Number(body.electricSpikeThresholdKwh ?? 2000),
      waterSpikeThresholdM3: Number(body.waterSpikeThresholdM3 ?? 100),
      updatedBy: actor.email || actor.id,
      updatedAt: new Date().toISOString(),
    };

    await prisma.integrationConnection.upsert({
      where: {
        orgId_providerId: {
          orgId,
          providerId: MODULE_AUTOMATION_KEY,
        },
      },
      create: {
        orgId,
        providerId: MODULE_AUTOMATION_KEY,
        category: 'AUTOMATION',
        displayName: 'Settlement Automation Policy',
        isEnabled: true,
        status: 'CONNECTED',
        capabilities: policyObj,
      },
      update: {
        capabilities: policyObj,
        status: 'CONNECTED',
      },
    });

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'ORGANIZATION',
        entityId: orgId,
        action: 'SETTLEMENT_AUTOMATION_POLICY_UPDATED',
        summary: `Cập nhật chế độ tự động hóa quyết toán: ${mode} (Kênh gửi mặc định: ${defaultChannel})`,
        metadata: policyObj,
      },
    });

    sendJson(res, 200, {
      ok: true,
      automationPolicy: policyObj,
    });
    return true;
  }

  // 7. POST /api/v1/console/v2/settlements/unlock-period
  if (method === 'POST' && pathname === '/api/v1/console/v2/settlements/unlock-period') {
    if (actor.role !== 'ADMIN') {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'ADMIN_REQUIRED_FOR_UNLOCK',
        message: 'Chỉ tài khoản ADMIN mới được phép mở khóa kỳ quyết toán đã khóa sổ.',
      });
      return true;
    }

    const body = await readJsonBody(req);
    const periodKey = String(body.periodKey || '').trim();
    const buildingId = String(body.buildingId || '').trim();
    const reason = String(body.reason || '').trim();

    if (!periodKey || !reason) {
      sendJson(res, 400, {
        ok: false,
        errorCode: 'MISSING_PERIOD_OR_REASON',
        message: 'Vui lòng cung cấp kỳ quyết toán và lý do mở khóa sổ.',
      });
      return true;
    }

    const targetBuildingIds =
      buildingId && buildingId !== 'ALL'
        ? scopedBuildingIds.filter((id) => id === buildingId)
        : scopedBuildingIds;

    const updatedPeriods = [];
    for (const bId of targetBuildingIds) {
      const existing = await prisma.billingPeriod.findUnique({
        where: {
          orgId_buildingId_periodKey: {
            orgId,
            buildingId: bId,
            periodKey,
          },
        },
      });
      if (existing && existing.status === 'LOCKED') {
        const up = await prisma.billingPeriod.update({
          where: { id: existing.id },
          data: {
            status: 'DRAFT',
            notes: `${existing.notes || ''} | Mở khóa bởi ${actor.email}: ${reason}`.trim(),
          },
        });
        updatedPeriods.push(up);
      }
    }

    await prisma.consoleAuditLog.create({
      data: {
        orgId,
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        entityType: 'BILLING_PERIOD',
        entityId: periodKey,
        action: 'SETTLEMENT_PERIOD_UNLOCKED',
        summary: `Admin ${actor.email} mở khóa kỳ quyết toán ${periodKey} (Lý do: ${reason})`,
        metadata: {
          periodKey,
          buildingId: buildingId || 'ALL',
          reason,
          unlockedCount: updatedPeriods.length,
        },
      },
    });

    sendJson(res, 200, {
      ok: true,
      unlockedCount: updatedPeriods.length,
      billingPeriods: updatedPeriods,
    });
    return true;
  }

  return false;
}
