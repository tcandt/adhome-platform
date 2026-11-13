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

export interface SettlementRow {
  obligationKey: string;
  periodKey: string;
  periodDisplayRange: string;
  isPeriodLocked: boolean;
  isFrozenSnapshot: boolean;
  room: {
    id: string;
    code: string;
    title: string;
    occupancyStatus: string;
    rentalModel?: string;
    sharedContractCount: number;
  };
  building: {
    id: string;
    code: string;
    name: string;
  };
  tenant: {
    id: string;
    fullName: string;
    phone: string;
    email: string;
  };
  contract: {
    id: string;
    code: string;
    status: string;
    startDate: string;
    endDate: string;
    occupantCount: number;
    monthlyRentVnd: number;
  };
  rent: {
    roomRentVnd: number;
    baseMonthlyRentVnd: number;
    activeDays: number;
    basisDays: number;
    isProrated: boolean;
    prorateReason: string;
    exemptDaysDeductionVnd: number;
    rentDiscountVnd: number;
    excludedDepositsVnd: number;
    formulaNote: string;
  };
  electric: {
    method: 'HUNONIC_AUTO' | 'MANUAL' | 'FIXED';
    status: 'COMPLETE' | 'MISSING_DATA' | 'ANOMALY';
    anomalyCode: string | null;
    anomalyMessage: string | null;
    startKwh: number | null;
    endKwh: number | null;
    consumptionKwh: number | null;
    ratePerKwhVnd: number;
    electricVnd: number;
    formulaNote: string;
    meterId: string | null;
    meterSerial: string | null;
    connectionStatus: string;
    lastSyncedAt: string | null;
    inputSource: string;
    updatedBy: string | null;
  };
  water: {
    mode: 'PER_PERSON' | 'PER_M3' | 'FIXED_PER_ROOM';
    status: 'COMPLETE' | 'NEED_M3_INPUT' | 'ANOMALY';
    anomalyCode: string | null;
    anomalyMessage: string | null;
    occupantCount: number;
    startM3: number | null;
    endM3: number | null;
    consumptionM3: number | null;
    unitRateVnd: number;
    waterVnd: number;
    displayLabel: string;
    formulaNote: string;
    inputSource: string;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  totals: {
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
  };
  safety: {
    canApprove: boolean;
    canAutoIssue: boolean;
    canSend: boolean;
    dataStatus: DataStatus;
    blockingReasons: string[];
    sendBlockingReasons: string[];
  };
  statuses: {
    dataStatus: DataStatus;
    invoiceStatus: InvoiceWorkflowStatus;
    deliveryStatus: DeliveryWorkflowStatus;
    paymentStatus: PaymentWorkflowStatus;
  };
  invoice: {
    id: string;
    code: string;
    dbStatus: string;
    dueDate: string;
    createdAt: string;
    updatedAt: string;
    isFirstCombined: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    issuedBy: string | null;
    issuedAt: string | null;
  } | null;
  delivery: {
    channel: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL';
    recipientName: string;
    recipientContact: string;
    status: DeliveryWorkflowStatus;
    sentAt: string | null;
    deliveredAt: string | null;
    attempts: number;
    lastError: string | null;
    txId: string | null;
  };
  payments: {
    totalPayableVnd: number;
    paidAmountVnd: number;
    remainingAmountVnd: number;
    overpaidAmountVnd: number;
    status: PaymentWorkflowStatus;
    transactions: Array<{
      id: string;
      transactionCode: string;
      provider: string;
      amountVnd: number;
      reconcileStatus: string;
      paidAt: string;
      note: string;
    }>;
  };
  sharedRoomInfo?: {
    isSharedRoom: boolean;
    memberIndex: number;
    totalMembers: number;
    weight: number;
    totalWeight: number;
  };
  history: Array<{
    id: string;
    action: string;
    actorEmail: string;
    actorRole: string;
    summary: string;
    createdAt: string;
    metadata: Record<string, any>;
  }>;
}

export interface SettlementRoomGroup {
  groupKey: string;
  roomId: string;
  room: SettlementRow['room'];
  building: SettlementRow['building'];
  isSharedRoom: boolean;
  members: SettlementRow[];
  primaryRow: SettlementRow;
  totalMembersCount: number;
  isPeriodLocked: boolean;
  isAnyFrozenSnapshot: boolean;
  aggregatedTotals: {
    roomRentVnd: number;
    electricVnd: number;
    waterVnd: number;
    serviceFeeVnd: number;
    extraChargeVnd: number;
    discountVnd: number;
    adjustmentVnd: number;
    previousDebtVnd: number;
    prepaidCreditVnd: number;
    totalPayableVnd: number;
    paidAmountVnd: number;
    remainingAmountVnd: number;
    overpaidAmountVnd: number;
  };
  aggregatedCounts: {
    completeDataCount: number;
    missingDataCount: number;
    anomalyCount: number;
    pendingApprovalCount: number;
    needsAdjustmentCount: number;
    approvedCount: number;
    issuedCount: number;
    sentCount: number;
    paidCount: number;
    canApproveCount: number;
    canSendCount: number;
  };
}

export function groupSettlementRowsByRoom(rows: SettlementRow[]): SettlementRoomGroup[] {
  const byRoom = new Map<string, SettlementRow[]>();
  for (const row of rows) {
    const key = `${row.periodKey}:${row.room.id}`;
    const list = byRoom.get(key) || [];
    list.push(row);
    byRoom.set(key, list);
  }

  const groups: SettlementRoomGroup[] = [];
  for (const [groupKey, membersRaw] of byRoom.entries()) {
    const members = [...membersRaw].sort((a, b) => {
      const idxA = a.sharedRoomInfo?.memberIndex ?? 1;
      const idxB = b.sharedRoomInfo?.memberIndex ?? 1;
      if (idxA !== idxB) return idxA - idxB;
      return a.contract.code.localeCompare(b.contract.code, 'vi');
    });
    const primaryRow = members[0];
    const isSharedRoom = Boolean(
      primaryRow.sharedRoomInfo?.isSharedRoom ||
        primaryRow.room.rentalModel === 'SHARED_ROOM' ||
        members.length > 1 ||
        primaryRow.room.sharedContractCount > 1
    );

    const aggregatedTotals = members.reduce(
      (acc, m) => ({
        roomRentVnd: acc.roomRentVnd + Number(m.totals.roomRentVnd || 0),
        electricVnd: acc.electricVnd + Number(m.totals.electricVnd || 0),
        waterVnd: acc.waterVnd + Number(m.totals.waterVnd || 0),
        serviceFeeVnd: acc.serviceFeeVnd + Number(m.totals.serviceFeeVnd || 0),
        extraChargeVnd: acc.extraChargeVnd + Number(m.totals.extraChargeVnd || 0),
        discountVnd: acc.discountVnd + Number(m.totals.discountVnd || 0),
        adjustmentVnd: acc.adjustmentVnd + Number(m.totals.adjustmentVnd || 0),
        previousDebtVnd: acc.previousDebtVnd + Number(m.totals.previousDebtVnd || 0),
        prepaidCreditVnd: acc.prepaidCreditVnd + Number(m.totals.prepaidCreditVnd || 0),
        totalPayableVnd: acc.totalPayableVnd + Number(m.totals.totalPayableVnd || 0),
        paidAmountVnd: acc.paidAmountVnd + Number(m.totals.paidAmountVnd || 0),
        remainingAmountVnd: acc.remainingAmountVnd + Number(m.totals.remainingAmountVnd || 0),
        overpaidAmountVnd: acc.overpaidAmountVnd + Number(m.totals.overpaidAmountVnd || 0),
      }),
      {
        roomRentVnd: 0,
        electricVnd: 0,
        waterVnd: 0,
        serviceFeeVnd: 0,
        extraChargeVnd: 0,
        discountVnd: 0,
        adjustmentVnd: 0,
        previousDebtVnd: 0,
        prepaidCreditVnd: 0,
        totalPayableVnd: 0,
        paidAmountVnd: 0,
        remainingAmountVnd: 0,
        overpaidAmountVnd: 0,
      }
    );

    const aggregatedCounts = {
      completeDataCount: members.filter((m) => m.statuses.dataStatus === 'COMPLETE').length,
      missingDataCount: members.filter((m) => m.statuses.dataStatus === 'MISSING_DATA').length,
      anomalyCount: members.filter((m) => m.statuses.dataStatus === 'ANOMALY').length,
      pendingApprovalCount: members.filter((m) => m.statuses.invoiceStatus === 'PENDING_APPROVAL')
        .length,
      needsAdjustmentCount: members.filter((m) => m.statuses.invoiceStatus === 'NEEDS_ADJUSTMENT')
        .length,
      approvedCount: members.filter((m) => m.statuses.invoiceStatus === 'APPROVED').length,
      issuedCount: members.filter((m) => m.statuses.invoiceStatus === 'ISSUED').length,
      sentCount: members.filter(
        (m) => m.statuses.deliveryStatus === 'SENT' || m.statuses.deliveryStatus === 'DELIVERED'
      ).length,
      paidCount: members.filter((m) => m.statuses.paymentStatus === 'PAID').length,
      canApproveCount: members.filter(
        (m) =>
          m.safety.canApprove &&
          !['APPROVED', 'ISSUED', 'VOID'].includes(m.statuses.invoiceStatus)
      ).length,
      canSendCount: members.filter(
        (m) => m.safety.canSend && m.statuses.deliveryStatus !== 'DELIVERED'
      ).length,
    };

    groups.push({
      groupKey,
      roomId: primaryRow.room.id,
      room: primaryRow.room,
      building: primaryRow.building,
      isSharedRoom,
      members,
      primaryRow,
      totalMembersCount: members.length,
      isPeriodLocked: members.every((m) => m.isPeriodLocked),
      isAnyFrozenSnapshot: members.some((m) => m.isFrozenSnapshot),
      aggregatedTotals,
      aggregatedCounts,
    });
  }

  return groups;
}

export interface SettlementAlertItem {
  id: string;
  obligationKey: string;
  roomId: string;
  roomCode: string;
  buildingId: string;
  buildingCode: string;
  severity: 'WARNING' | 'CRITICAL';
  category: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: 'INPUT_ELECTRIC' | 'INPUT_WATER' | 'OPEN_DELIVERY_TAB' | 'OPEN_DRAWER';
}

export interface SettlementKpiSummary {
  totalExpectedPeriodVnd: number;
  currentPeriodChargesVnd: number;
  totalPreviousDebtVnd: number;
  totalRoomRentVnd: number;
  totalUtilitiesAndServicesVnd: number;
  totalElectricVnd: number;
  totalWaterVnd: number;
  totalServiceAndExtraVnd: number;
  readyInvoicesCount: number;
  totalObligationsCount: number;
  sentInvoicesCount: number;
  needSendInvoicesCount: number;
  totalCollectedVnd: number;
  totalRemainingReceivableVnd: number;
}

export interface SettlementProgressSummary {
  totalObligations: number;
  completeDataCount: number;
  missingDataCount: number;
  anomalyCount: number;
  draftCreatedCount: number;
  pendingApprovalCount: number;
  needsAdjustmentCount: number;
  approvedCount: number;
  issuedCount: number;
  sentCount: number;
  paidCount: number;
  unpaidCount: number;
}

export type QuickFilterTabId =
  | 'ALL'
  | 'MISSING_DATA'
  | 'PENDING_APPROVAL'
  | 'READY_TO_SEND'
  | 'SENT'
  | 'UNPAID'
  | 'ANOMALY'
  | 'COMPLETE_DATA'
  | 'DRAFT_CREATED'
  | 'ISSUED'
  | 'PAID';

export type DrawerTabId = 'OVERVIEW' | 'FEES' | 'DELIVERY' | 'PAYMENT' | 'HISTORY';

export function formatVnd(amount: number | null | undefined): string {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '0 ₫';
  return `${Math.round(num).toLocaleString('vi-VN')} ₫`;
}

export function getDataStatusBadge(status: DataStatus): { label: string; className: string } {
  switch (status) {
    case 'COMPLETE':
      return {
        label: 'Đủ dữ liệu',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    case 'MISSING_DATA':
      return {
        label: 'Thiếu dữ liệu',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 'ANOMALY':
      return {
        label: 'Bất thường',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
      };
    case 'CALCULATING':
      return {
        label: 'Đang tính',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
      };
    default:
      return {
        label: 'Lỗi dữ liệu',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
      };
  }
}

export function getInvoiceStatusBadge(status: InvoiceWorkflowStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'NOT_CREATED':
      return {
        label: 'Chưa tạo',
        className:
          'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
    case 'DRAFT':
      return {
        label: 'Hóa đơn nháp',
        className:
          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
      };
    case 'PENDING_APPROVAL':
      return {
        label: 'Chờ phê duyệt',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 'NEEDS_ADJUSTMENT':
      return {
        label: 'Cần điều chỉnh',
        className:
          'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/80',
      };
    case 'APPROVED':
      return {
        label: 'Đã phê duyệt',
        className:
          'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80',
      };
    case 'ISSUED':
      return {
        label: 'Đã phát hành',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
      };
    case 'VOID':
      return {
        label: 'Đã hủy',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
      };
    default:
      return {
        label: 'Đã thay thế',
        className:
          'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
}

export function getDeliveryStatusBadge(status: DeliveryWorkflowStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'SENT':
      return {
        label: 'Đã gửi',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
      };
    case 'DELIVERED':
      return {
        label: 'Đã nhận',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    case 'QUEUED':
      return {
        label: 'Chờ gửi',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 'SENDING':
      return {
        label: 'Đang gửi',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
      };
    case 'FAILED':
      return {
        label: 'Gửi lỗi',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
      };
    case 'RETRY_NEEDED':
      return {
        label: 'Cần gửi lại',
        className:
          'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/80',
      };
    default:
      return {
        label: 'Chưa gửi',
        className:
          'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      };
  }
}

export function getPaymentStatusBadge(status: PaymentWorkflowStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'PAID':
      return {
        label: 'Đã thanh toán',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    case 'PARTIAL':
      return {
        label: 'Thanh toán một phần',
        className:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 'OVERDUE':
      return {
        label: 'Quá hạn',
        className:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
      };
    case 'PENDING_RECONCILE':
      return {
        label: 'Chờ đối soát',
        className:
          'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80',
      };
    case 'OVERPAID':
      return {
        label: 'Thu dư',
        className:
          'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/80',
      };
    default:
      return {
        label: 'Chưa thanh toán',
        className:
          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
}

export function formatChannelLabel(channel: string): string {
  switch (channel) {
    case 'ZALO_OA':
      return 'Zalo OA';
    case 'ZALO_BOT':
      return 'Zalo Bot';
    case 'EMAIL':
      return 'Email';
    default:
      return channel || 'Zalo OA';
  }
}

export function exportSettlementCsv(rows: SettlementRow[], periodKey: string) {
  const headers = [
    'Mã phòng',
    'Mô hình phòng',
    'Tòa nhà',
    'Khách thuê',
    'SĐT',
    'Mã hợp đồng',
    'Kỳ quyết toán',
    'Tiền phòng (VND)',
    'Điện (kWh)',
    'Tiền điện (VND)',
    'Phương thức nước',
    'Tiền nước (VND)',
    'Phí dịch vụ (VND)',
    'Phí phát sinh (VND)',
    'Giảm trừ/Điều chỉnh (VND)',
    'Công nợ kỳ trước (VND)',
    'Tổng thanh toán (VND)',
    'Đã thu (VND)',
    'Còn phải thu (VND)',
    'Trạng thái dữ liệu',
    'Mã hóa đơn',
    'Trạng thái hóa đơn',
    'Trạng thái gửi',
    'Kênh gửi',
    'Trạng thái thanh toán',
  ];

  const lines = rows.map((r) => [
    r.room.code,
    r.sharedRoomInfo?.isSharedRoom || r.room.rentalModel === 'SHARED_ROOM'
      ? `Ở ghép (${r.sharedRoomInfo?.memberIndex ?? 1}/${r.sharedRoomInfo?.totalMembers ?? r.room.sharedContractCount})`
      : 'Nguyên phòng',
    r.building.code,
    r.tenant.fullName,
    r.tenant.phone,
    r.contract.code,
    r.periodKey,
    r.totals.roomRentVnd,
    r.electric.consumptionKwh ?? '',
    r.totals.electricVnd,
    r.water.mode,
    r.totals.waterVnd,
    r.totals.serviceFeeVnd,
    r.totals.extraChargeVnd,
    r.totals.adjustmentVnd - r.totals.discountVnd,
    r.totals.previousDebtVnd,
    r.totals.totalPayableVnd,
    r.totals.paidAmountVnd,
    r.totals.remainingAmountVnd,
    getDataStatusBadge(r.statuses.dataStatus).label,
    r.invoice?.code || '',
    getInvoiceStatusBadge(r.statuses.invoiceStatus).label,
    getDeliveryStatusBadge(r.statuses.deliveryStatus).label,
    formatChannelLabel(r.delivery.channel),
    getPaymentStatusBadge(r.statuses.paymentStatus).label,
  ]);

  const csvContent =
    '\uFEFF' +
    [headers, ...lines]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Quyet-toan-ky-${periodKey}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

