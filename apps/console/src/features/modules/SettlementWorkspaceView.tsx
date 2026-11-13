import React, { useMemo, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Columns3,
  CreditCard,
  Download,
  Droplets,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  Zap,
} from 'lucide-react';
import { formatPeriodDisplay } from '@/app/navigation/navigationConfig';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { BuildingScopeSelector } from '@/shared/ui/BuildingScopeSelector';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { notifySave } from '@/shared/ui/SaveToast';
import {
  SettlementProgressBar,
  SettlementShimmerButton,
} from '@/shared/ui/SettlementAnimatePrimitives';
import { SettlementDetailDrawer } from './SettlementDetailDrawer';
import {
  type AutomationMode,
  type DrawerTabId,
  type FeeLineItem,
  type QuickFilterTabId,
  type SettlementAlertItem,
  type SettlementRow,
  exportSettlementCsv,
  formatChannelLabel,
  formatVnd,
  getDataStatusBadge,
  getDeliveryStatusBadge,
  getInvoiceStatusBadge,
  getPaymentStatusBadge,
  groupSettlementRowsByRoom,
} from './settlementTypes';

interface SettlementWorkspaceViewProps {
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (period: string, deltaMonths: number) => string;
  payload: Record<string, unknown> | null;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

type SortField = 'ROOM_CODE' | 'TOTAL_PAYABLE' | 'STATUS';
type SortDirection = 'ASC' | 'DESC';

export const SettlementWorkspaceView: React.FC<SettlementWorkspaceViewProps> = ({
  selectedPeriod,
  onChangePeriod,
  shiftPeriodKey,
  payload,
  isLoading,
  onRefresh,
}) => {
  const { user, hasCapability, hasPermission } = useAuth();
  const canManageSettlements = hasCapability('canManageSettlements');
  const canManageInvoices = hasCapability('canManageInvoices');
  const canWriteFinance = hasCapability('canAccessFinance') || hasPermission('finance.write');
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN' || hasPermission('system.admin');
  const canInputReadings =
    canManageSettlements || String(user?.role || '').toUpperCase() === 'TECHNICIAN' || isAdmin;

  // Filters & Table UI State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickTab, setQuickTab] = useState<QuickFilterTabId>('ALL');
  const [buildingFilter, setBuildingFilter] = useState<string>('ALL');
  const [waterModeFilter, setWaterModeFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('ROOM_CODE');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ASC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Column visibility toggles (Group 2 & Group 3 optional columns)
  const [showColMenu, setShowColMenu] = useState<boolean>(false);
  const [visibleCols, setVisibleCols] = useState({
    periodDates: false,
    serviceFee: false,
    extraCharge: false,
    discountAdj: false,
    previousDebt: false,
    invoiceCode: false,
    deliveryChannel: false,
  });

  // Selection & Shared Room Expansion state
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [activeObligationKey, setActiveObligationKey] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTabId>('OVERVIEW');

  // Quick Water / Electric Modal state
  const [quickInputModal, setQuickInputModal] = useState<{
    open: boolean;
    mode: 'WATER' | 'ELECTRIC';
    row: SettlementRow | null;
    waterM3: string;
    startKwh: string;
    endKwh: string;
    reason: string;
  }>({
    open: false,
    mode: 'WATER',
    row: null,
    waterM3: '',
    startKwh: '0',
    endKwh: '',
    reason: 'Nhập nhanh tại bảng Tổng hợp kỳ',
  });

  // Month-close & Unlock Modal state
  const [lockModalOpen, setLockModalOpen] = useState<boolean>(false);
  const [unlockReason, setUnlockReason] = useState<string>('');

  // Action loading states
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
    message: string;
  } | null>(null);

  const rawRows: SettlementRow[] = useMemo(() => {
    return Array.isArray(payload?.settlementRows)
      ? (payload.settlementRows as SettlementRow[])
      : [];
  }, [payload]);

  const rawAlerts: SettlementAlertItem[] = useMemo(() => {
    return Array.isArray(payload?.alerts)
      ? (payload.alerts as SettlementAlertItem[])
      : [];
  }, [payload]);

  const automationPolicy = useMemo(() => {
    const p = (payload?.automationPolicy || {}) as Record<string, any>;
    return {
      mode: (p.mode as AutomationMode) || 'AUTO_DRAFT_WAIT_APPROVAL',
      defaultChannel: (p.defaultChannel as 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL') || 'ZALO_OA',
    };
  }, [payload]);

  const billingPeriods = useMemo(() => {
    return Array.isArray(payload?.billingPeriods)
      ? (payload.billingPeriods as Array<{
          buildingId: string;
          buildingCode: string;
          buildingName: string;
          periodKey: string;
          status: string;
          exceptionCount: number;
          lockedAt: string | null;
        }>)
      : [];
  }, [payload]);

  const availableBuildings = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const r of rawRows) {
      if (!map.has(r.building.id)) {
        map.set(r.building.id, r.building);
      }
    }
    return Array.from(map.values());
  }, [rawRows]);

  // Apply building & water mode & search filters first (used for KPIs & Progress Bar!)
  const baseScopedRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('vi');
    return rawRows.filter((row) => {
      if (buildingFilter !== 'ALL' && row.building.id !== buildingFilter) return false;
      if (waterModeFilter !== 'ALL' && row.water.mode !== waterModeFilter) return false;
      if (!q) return true;
      return [
        row.room.code,
        row.building.code,
        row.building.name,
        row.tenant.fullName,
        row.tenant.phone,
        row.contract.code,
        row.invoice?.code,
      ]
        .filter(Boolean)
        .some((val) => String(val).toLocaleLowerCase('vi').includes(q));
    });
  }, [rawRows, buildingFilter, waterModeFilter, searchQuery]);

  // Dynamic KPIs computed from baseScopedRows (Section 3.2: never static!)
  const dynamicKpis = useMemo(() => {
    return {
      totalExpectedPeriodVnd: baseScopedRows.reduce((s, r) => s + r.totals.totalPayableVnd, 0),
      currentPeriodChargesVnd: baseScopedRows.reduce((s, r) => s + r.totals.currentPeriodDueVnd, 0),
      totalPreviousDebtVnd: baseScopedRows.reduce((s, r) => s + r.totals.previousDebtVnd, 0),
      totalRoomRentVnd: baseScopedRows.reduce((s, r) => s + r.totals.roomRentVnd, 0),
      totalUtilitiesAndServicesVnd: baseScopedRows.reduce(
        (s, r) =>
          s +
          r.totals.electricVnd +
          r.totals.waterVnd +
          r.totals.serviceFeeVnd +
          r.totals.extraChargeVnd,
        0
      ),
      totalElectricVnd: baseScopedRows.reduce((s, r) => s + r.totals.electricVnd, 0),
      totalWaterVnd: baseScopedRows.reduce((s, r) => s + r.totals.waterVnd, 0),
      totalServiceAndExtraVnd: baseScopedRows.reduce(
        (s, r) => s + r.totals.serviceFeeVnd + r.totals.extraChargeVnd,
        0
      ),
      readyInvoicesCount: baseScopedRows.filter((r) => r.safety.canApprove).length,
      totalObligationsCount: baseScopedRows.length,
      sentInvoicesCount: baseScopedRows.filter((r) =>
        ['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
      ).length,
      needSendInvoicesCount: baseScopedRows.filter((r) => r.statuses.invoiceStatus !== 'VOID')
        .length,
      totalCollectedVnd: baseScopedRows.reduce((s, r) => s + r.totals.paidAmountVnd, 0),
      totalRemainingReceivableVnd: baseScopedRows.reduce(
        (s, r) => s + r.totals.remainingAmountVnd,
        0
      ),
    };
  }, [baseScopedRows]);

  // Dynamic Progress Counts (Section 3.3)
  const dynamicProgress = useMemo(() => {
    return {
      totalObligations: baseScopedRows.length,
      completeDataCount: baseScopedRows.filter((r) => r.statuses.dataStatus === 'COMPLETE').length,
      missingDataCount: baseScopedRows.filter((r) => r.statuses.dataStatus === 'MISSING_DATA').length,
      anomalyCount: baseScopedRows.filter((r) => r.statuses.dataStatus === 'ANOMALY').length,
      draftCreatedCount: baseScopedRows.filter((r) => r.statuses.invoiceStatus !== 'NOT_CREATED').length,
      pendingApprovalCount: baseScopedRows.filter((r) =>
        ['DRAFT', 'PENDING_APPROVAL'].includes(r.statuses.invoiceStatus)
      ).length,
      readyToSendCount: baseScopedRows.filter(
        (r) =>
          r.safety.canApprove &&
          ['APPROVED', 'PENDING_APPROVAL', 'DRAFT', 'ISSUED'].includes(r.statuses.invoiceStatus) &&
          !['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
      ).length,
      issuedCount: baseScopedRows.filter((r) => r.statuses.invoiceStatus === 'ISSUED').length,
      sentCount: baseScopedRows.filter((r) =>
        ['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
      ).length,
      paidCount: baseScopedRows.filter((r) => r.statuses.paymentStatus === 'PAID').length,
      unpaidCount: baseScopedRows.filter((r) =>
        ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(r.statuses.paymentStatus)
      ).length,
    };
  }, [baseScopedRows]);

  // Apply quickTab filter and sorting
  const filteredRows = useMemo(() => {
    const matching = baseScopedRows.filter((r) => {
      switch (quickTab) {
        case 'MISSING_DATA':
          return r.statuses.dataStatus === 'MISSING_DATA';
        case 'COMPLETE_DATA':
          return r.statuses.dataStatus === 'COMPLETE';
        case 'ANOMALY':
          return r.statuses.dataStatus === 'ANOMALY';
        case 'DRAFT_CREATED':
          return r.statuses.invoiceStatus !== 'NOT_CREATED';
        case 'PENDING_APPROVAL':
          return ['DRAFT', 'PENDING_APPROVAL'].includes(r.statuses.invoiceStatus);
        case 'READY_TO_SEND':
          return (
            r.safety.canApprove &&
            ['APPROVED', 'PENDING_APPROVAL', 'DRAFT', 'ISSUED'].includes(r.statuses.invoiceStatus) &&
            !['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus)
          );
        case 'ISSUED':
          return r.statuses.invoiceStatus === 'ISSUED';
        case 'SENT':
          return ['SENT', 'DELIVERED'].includes(r.statuses.deliveryStatus);
        case 'UNPAID':
          return ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(r.statuses.paymentStatus);
        case 'PAID':
          return r.statuses.paymentStatus === 'PAID';
        default:
          return true;
      }
    });

    const sorted = [...matching].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'TOTAL_PAYABLE') {
        cmp = a.totals.totalPayableVnd - b.totals.totalPayableVnd;
      } else if (sortField === 'STATUS') {
        cmp = String(a.statuses.invoiceStatus).localeCompare(String(b.statuses.invoiceStatus));
      } else {
        const bCmp = String(a.building.code).localeCompare(String(b.building.code), 'vi');
        cmp =
          bCmp !== 0
            ? bCmp
            : String(a.room.code).localeCompare(String(b.room.code), 'vi', { numeric: true });
      }
      return sortDirection === 'ASC' ? cmp : -cmp;
    });

    return sorted;
  }, [baseScopedRows, quickTab, sortField, sortDirection]);

  const roomGroups = useMemo(() => groupSettlementRowsByRoom(filteredRows), [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(roomGroups.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedGroups = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return roomGroups.slice(start, start + pageSize);
  }, [roomGroups, safePage]);

  const paginatedRows = useMemo(
    () => paginatedGroups.flatMap((g) => g.members),
    [paginatedGroups]
  );

  const visibleColCount =
    11 + Object.values(visibleCols).filter((isOn) => Boolean(isOn)).length;

  const activeDrawerRow = useMemo(() => {
    if (!activeObligationKey) return null;
    return rawRows.find((r) => r.obligationKey === activeObligationKey) || null;
  }, [rawRows, activeObligationKey]);

  const drawerSiblings = useMemo(() => {
    if (!activeDrawerRow) return [];
    const sameRoom = rawRows.filter(
      (r) => r.room.id === activeDrawerRow.room.id && r.periodKey === activeDrawerRow.periodKey
    );
    return [...sameRoom].sort(
      (a, b) => (a.sharedRoomInfo?.memberIndex ?? 1) - (b.sharedRoomInfo?.memberIndex ?? 1)
    );
  }, [rawRows, activeDrawerRow]);

  const toggleRoomExpand = (roomId: string, nextOpen?: boolean) => {
    setExpandedRooms((prev) => ({
      ...prev,
      [roomId]: nextOpen !== undefined ? nextOpen : !prev[roomId],
    }));
  };

  const toggleSelectGroup = (memberKeys: string[]) => {
    const allSelected = memberKeys.length > 0 && memberKeys.every((k) => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys((prev) => prev.filter((k) => !memberKeys.includes(k)));
    } else {
      setSelectedKeys((prev) => Array.from(new Set([...prev, ...memberKeys])));
    }
  };

  const scopedAlerts = useMemo(() => {
    if (buildingFilter === 'ALL') return rawAlerts;
    return rawAlerts.filter((a) => a.buildingId === buildingFilter);
  }, [rawAlerts, buildingFilter]);

  const openDrawerForRow = (row: SettlementRow, tab: DrawerTabId = 'OVERVIEW') => {
    setActiveObligationKey(row.obligationKey);
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  const openQuickInput = (row: SettlementRow, mode: 'WATER' | 'ELECTRIC') => {
    setQuickInputModal({
      open: true,
      mode,
      row,
      waterM3:
        row.water.consumptionM3 !== null && row.water.consumptionM3 !== undefined
          ? String(row.water.consumptionM3)
          : '',
      startKwh: row.electric.startKwh !== null ? String(row.electric.startKwh) : '0',
      endKwh: row.electric.endKwh !== null ? String(row.electric.endKwh) : '',
      reason:
        mode === 'WATER'
          ? `Nhập khối nước phòng ${row.room.code} kỳ ${row.periodKey}`
          : `Nhập chỉ số điện phòng ${row.room.code} kỳ ${row.periodKey}`,
    });
  };

  const toggleSelectAll = () => {
    const visibleKeys = paginatedRows.map((r) => r.obligationKey);
    const allSelected =
      visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // ============================================================================
  // API Handlers
  // ============================================================================

  const handleSaveRoomInput = async (inputPayload: {
    roomId: string;
    contractId: string;
    periodKey: string;
    applyToRoomMembers?: boolean;
    rent?: {
      baseMonthlyRentVnd?: number;
    };
    electric?: {
      startKwh: number | null;
      endKwh: number | null;
      ratePerKwhVnd: number;
      anomalyConfirmed?: boolean;
      reason?: string;
    };
    water?: {
      mode: string;
      consumptionM3: number | null;
      occupantCount: number;
      unitRateVnd: number;
      anomalyConfirmed?: boolean;
      reason?: string;
    };
    feeItems?: FeeLineItem[];
    reason?: string;
  }): Promise<boolean> => {
    setIsMutating(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/room-input', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify(inputPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Không thể lưu dữ liệu quyết toán phòng.',
        });
        return false;
      }
      notifySave(true, `Đã cập nhật & tính lại quyết toán phòng ${data.row?.room?.code || ''}`);
      setFeedbackBanner({
        type: 'SUCCESS',
        message: `Đã lưu & tính lại thành công phòng ${data.row?.room?.code || ''}: Tổng cần thanh toán ${formatVnd(data.row?.totals?.totalPayableVnd || 0)}.`,
      });
      await onRefresh();
      return true;
    } catch {
      setFeedbackBanner({
        type: 'ERROR',
        message: 'Lỗi kết nối máy chủ khi lưu dữ liệu quyết toán.',
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const handleCompilePeriod = async (overrideMode?: AutomationMode, keys?: string[]) => {
    setIsMutating(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/compile', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          periodKey: selectedPeriod,
          buildingId: buildingFilter,
          mode: overrideMode || automationPolicy.mode,
          obligationKeys: keys && keys.length > 0 ? keys : selectedKeys.length > 0 ? selectedKeys : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Lỗi khi tổng hợp kỳ quyết toán.',
        });
        return;
      }
      const cr = data.compileResult || {};
      notifySave(true, `Đã tổng hợp kỳ ${selectedPeriod}`);
      setFeedbackBanner({
        type: cr.isolatedExceptionCount > 0 ? 'WARNING' : 'SUCCESS',
        message:
          cr.mode === 'AUTO_FULL'
            ? `Tổng hợp tự động kỳ ${selectedPeriod}: Phát hành & gửi thành công ${cr.autoIssuedCount} phòng, cô lập ${cr.isolatedExceptionCount} phòng thiếu dữ liệu.`
            : `Tổng hợp kỳ ${selectedPeriod} hoàn tất: ${cr.readyForApprovalCount} phòng đủ điều kiện chờ duyệt, ${cr.isolatedExceptionCount} phòng cần bổ sung chỉ số.`,
      });
      await onRefresh();
    } catch {
      setFeedbackBanner({
        type: 'ERROR',
        message: 'Lỗi kết nối máy chủ khi tổng hợp kỳ.',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleApproveObligations = async (
    keys: string[],
    action: 'APPROVE' | 'REJECT' = 'APPROVE',
    reason?: string
  ): Promise<boolean> => {
    setIsMutating(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/approve', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          periodKey: selectedPeriod,
          action,
          obligationKeys: keys,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Không thể phê duyệt hóa đơn.',
        });
        return false;
      }
      const ar = data.approvalResult || {};
      notifySave(
        true,
        action === 'APPROVE'
          ? `Đã phê duyệt ${ar.processedCount || 0} hóa đơn`
          : `Đã chuyển điều chỉnh ${ar.processedCount || 0} hóa đơn`
      );
      setFeedbackBanner({
        type: ar.skippedCount > 0 ? 'WARNING' : 'SUCCESS',
        message:
          ar.skippedCount > 0
            ? `Đã phê duyệt ${ar.processedCount} phòng (${(ar.processedRooms || []).join(', ')}). Tự động chặn ${ar.skippedCount} phòng chưa đủ dữ liệu (${(ar.skippedRooms || []).map((s: any) => s.roomCode).join(', ')}).`
            : `Đã phê duyệt thành công ${ar.processedCount} hóa đơn quyết toán.`,
      });
      setSelectedKeys([]);
      await onRefresh();
      return true;
    } catch {
      setFeedbackBanner({
        type: 'ERROR',
        message: 'Lỗi kết nối khi phê duyệt hóa đơn.',
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const handleIssueAndSend = async (
    keys: string[],
    channel?: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL',
    recipientOverride?: string
  ): Promise<boolean> => {
    setIsMutating(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/issue-and-send', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          periodKey: selectedPeriod,
          obligationKeys: keys,
          channel,
          recipientOverride,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Lỗi khi phát hành và gửi hóa đơn.',
        });
        return false;
      }
      const ir = data.issueAndSendResult || {};
      notifySave(true, `Đã phát hành & gửi ${ir.sentCount || 0} hóa đơn`);
      setFeedbackBanner({
        type: ir.failedCount > 0 ? 'WARNING' : 'SUCCESS',
        message:
          ir.failedCount > 0
            ? `Đã phát hành & gửi thành công ${ir.sentCount} phòng. Có ${ir.failedCount} phòng gửi chưa thành công cần kiểm tra.`
            : `Đã phát hành (đóng băng Snapshot) và gửi thành công ${ir.sentCount} hóa đơn tới khách thuê.`,
      });
      setSelectedKeys([]);
      await onRefresh();
      return true;
    } catch {
      setFeedbackBanner({
        type: 'ERROR',
        message: 'Lỗi kết nối khi phát hành & gửi hóa đơn.',
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const handleRecordPayment = async (params: {
    invoiceId: string;
    amountVnd: number;
    providerId: string;
    referenceText: string;
  }): Promise<boolean> => {
    setIsMutating(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/v1/console/v2/invoices/${encodeURIComponent(params.invoiceId)}/pay`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          amountVnd: params.amountVnd,
          providerId: params.providerId,
          referenceText: params.referenceText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Không thể ghi nhận thanh toán.',
        });
        return false;
      }
      notifySave(true, 'Đã ghi nhận thanh toán hóa đơn');
      setFeedbackBanner({
        type: 'SUCCESS',
        message: `Đã ghi nhận thanh toán ${formatVnd(params.amountVnd)} cho hóa đơn ${data.invoice?.invoiceCode || ''}.`,
      });
      await onRefresh();
      return true;
    } catch {
      setFeedbackBanner({
        type: 'ERROR',
        message: 'Lỗi kết nối khi ghi nhận thanh toán.',
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateAutomationMode = async (nextMode: AutomationMode) => {
    if (!canManageSettlements) return;
    setIsMutating(true);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/automation-policy', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          mode: nextMode,
          defaultChannel: automationPolicy.defaultChannel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        notifySave(true, 'Đã cập nhật chế độ tự động hóa quyết toán');
        await onRefresh();
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleLockBuildingPeriod = async (buildingId: string, periodKey: string) => {
    setIsMutating(true);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/month-close', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          buildingId,
          periodKey,
          notes: `Khóa sổ quyết toán kỳ ${periodKey}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Không thể khóa sổ kỳ quyết toán.',
        });
        return;
      }
      notifySave(true, `Đã khóa sổ kỳ ${periodKey}`);
      setFeedbackBanner({
        type: 'SUCCESS',
        message: `Đã khóa sổ kỳ ${periodKey} thành công (${data.summary?.totalInvoicesFrozen || 0} hóa đơn đóng băng).`,
      });
      await onRefresh();
    } finally {
      setIsMutating(false);
    }
  };

  const handleUnlockBuildingPeriod = async (buildingId: string, periodKey: string) => {
    if (!unlockReason.trim()) return;
    setIsMutating(true);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/unlock-period', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          buildingId,
          periodKey,
          reason: unlockReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        notifySave(true, `Đã mở khóa kỳ ${periodKey}`);
        setUnlockReason('');
        await onRefresh();
      } else {
        setFeedbackBanner({
          type: 'ERROR',
          message: data.message || 'Không thể mở khóa kỳ quyết toán.',
        });
      }
    } finally {
      setIsMutating(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortField(field);
      setSortDirection(field === 'TOTAL_PAYABLE' ? 'DESC' : 'ASC');
    }
  };

  const completionPercent =
    dynamicProgress.totalObligations > 0
      ? Math.round((dynamicProgress.completeDataCount / dynamicProgress.totalObligations) * 100)
      : 0;

  return (
    <div
      className="settlement-center-workspace space-y-4"
      data-testid="settlement-center-workspace"
    >
      {/* =====================================================================
          PART A — HEADER NGHIỆP VỤ (Section 3.1)
         ===================================================================== */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight"
                data-testid="settlement-header-title"
              >
                Tổng hợp kỳ &amp; Quyết toán
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                <Sparkles className="w-3 h-3" />
                {automationPolicy.mode === 'AUTO_FULL'
                  ? 'Chế độ B: Tự động hoàn toàn'
                  : automationPolicy.mode === 'MANUAL'
                  ? 'Chế độ C: Thủ công'
                  : 'Chế độ A: Tự động nháp – Chờ duyệt'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kiểm tra chi phí, lập hóa đơn và theo dõi thanh toán theo kỳ.
            </p>
          </div>

          {/* Primary / Secondary / Tertiary Action Hierarchy */}
          <div className="flex flex-wrap items-center xl:justify-end gap-2 shrink-0">
            {/* Tertiary: Làm mới dữ liệu */}
            <button
              type="button"
              data-testid="btn-settlement-refresh"
              onClick={() => void onRefresh()}
              disabled={isLoading || isMutating}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            {/* Secondary: Phê duyệt hàng loạt */}
            {canManageSettlements && (
              <SettlementShimmerButton
                type="button"
                data-testid="btn-settlement-bulk-approve"
                isLoading={isMutating}
                loadingText="Đang duyệt..."
                shimmerColor="#4f46e5"
                disabled={dynamicProgress.completeDataCount === 0}
                onClick={() => void handleApproveObligations(selectedKeys, 'APPROVE')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/90 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  Phê duyệt hàng loạt
                  {selectedKeys.length > 0 ? ` (${selectedKeys.length})` : ''}
                </span>
              </SettlementShimmerButton>
            )}

            {/* Secondary: Phát hành & gửi */}
            {canManageInvoices && (
              <SettlementShimmerButton
                type="button"
                data-testid="btn-settlement-bulk-issue-send"
                isLoading={isMutating}
                loadingText="Đang gửi..."
                shimmerColor="#059669"
                disabled={dynamicKpis.readyInvoicesCount === 0}
                onClick={() => void handleIssueAndSend(selectedKeys)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  Phát hành &amp; gửi
                  {selectedKeys.length > 0 ? ` (${selectedKeys.length})` : ''}
                </span>
              </SettlementShimmerButton>
            )}

            {/* Primary: Tổng hợp kỳ */}
            {canManageSettlements && (
              <SettlementShimmerButton
                type="button"
                data-testid="btn-settlement-compile-primary"
                isLoading={isMutating}
                loadingText="Đang tổng hợp..."
                onClick={() => void handleCompilePeriod()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-extrabold shadow-xs transition-colors disabled:opacity-50"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Tổng hợp kỳ</span>
              </SettlementShimmerButton>
            )}

            {/* More Actions Menu (Xuất CSV/Excel, Khóa sổ kỳ, Chế độ tự động) */}
            <ActionMenu
              items={[
                {
                  label: `Xuất bảng quyết toán (${selectedPeriod}.csv)`,
                  icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
                  onClick: () => exportSettlementCsv(filteredRows, selectedPeriod),
                },
                {
                  label: 'Khóa sổ kỳ & Lịch sử khóa sổ',
                  icon: <Lock className="w-4 h-4 text-amber-600" />,
                  onClick: () => setLockModalOpen(true),
                },
                ...(canManageSettlements
                  ? [
                      {
                        label: 'Chế độ A: Tự động tạo nháp – Chờ duyệt',
                        icon: <ShieldCheck className="w-4 h-4 text-blue-600" />,
                        onClick: () => void handleUpdateAutomationMode('AUTO_DRAFT_WAIT_APPROVAL'),
                      },
                      {
                        label: 'Chế độ B: Tự động hoàn toàn (Phát hành & Gửi)',
                        icon: <Sparkles className="w-4 h-4 text-indigo-600" />,
                        onClick: () => void handleUpdateAutomationMode('AUTO_FULL'),
                      },
                      {
                        label: 'Chế độ C: Vận hành thủ công',
                        icon: <Settings2 className="w-4 h-4 text-slate-600" />,
                        onClick: () => void handleUpdateAutomationMode('MANUAL'),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>

        {/* Filter Bar Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          {/* Month / Year Picker */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Kỳ trước"
              onClick={() => onChangePeriod(shiftPeriodKey(selectedPeriod, -1))}
              className="inline-flex h-10 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-bold text-slate-900 dark:text-white">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Kỳ {formatPeriodDisplay(selectedPeriod)}</span>
              <input
                data-testid="input-module-period"
                type="month"
                value={selectedPeriod}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                    onChangePeriod(e.target.value);
                  }
                }}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              aria-label="Kỳ sau"
              onClick={() => onChangePeriod(shiftPeriodKey(selectedPeriod, 1))}
              className="inline-flex h-10 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Global BuildingScopeSelector + Local Building Filter */}
          <div className="hidden md:block">
            <BuildingScopeSelector />
          </div>

          {availableBuildings.length > 1 && (
            <select
              aria-label="Lọc nhanh tòa có phát sinh"
              data-testid="select-settlement-building-filter"
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">Mọi tòa phát sinh ({availableBuildings.length})</option>
              {availableBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Advanced Water Method Filter */}
          <select
            aria-label="Phương thức tính nước"
            data-testid="select-settlement-water-filter"
            value={waterModeFilter}
            onChange={(e) => {
              setWaterModeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Mọi phương thức nước</option>
            <option value="PER_M3">Nước theo khối (m³)</option>
            <option value="PER_PERSON">Nước theo đầu người</option>
            <option value="FIXED_PER_ROOM">Nước khoán phòng</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              data-testid="input-settlement-search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm mã phòng, tên khách, SĐT, mã hợp đồng, mã HĐ..."
              className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Feedback Banner */}
        {feedbackBanner && (
          <div
            data-testid="settlement-feedback-banner"
            className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
              feedbackBanner.type === 'ERROR'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                : feedbackBanner.type === 'WARNING'
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {feedbackBanner.type === 'ERROR' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedbackBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-[11px] font-bold underline shrink-0"
            >
              Đóng
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          PART B — 6 KPI TÀI CHÍNH VÀ TIẾN ĐỘ (Section 3.2 - Compact Flat Strip)
         ===================================================================== */}
      <div
        className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 overflow-hidden"
        data-testid="settlement-kpi-grid"
      >
        {/* KPI 1: Tổng dự kiến kỳ */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            1. Tổng dự kiến kỳ
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums truncate"
            data-testid="kpi-total-expected"
          >
            {formatVnd(dynamicKpis.totalExpectedPeriodVnd)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">
            Phát sinh kỳ: {formatVnd(dynamicKpis.currentPeriodChargesVnd)}
          </div>
        </div>

        {/* KPI 2: Tiền phòng */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            2. Tiền phòng
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-blue-600 dark:text-blue-400 tabular-nums truncate"
            data-testid="kpi-room-rent"
          >
            {formatVnd(dynamicKpis.totalRoomRentVnd)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">
            {dynamicKpis.totalObligationsCount} hợp đồng trong kỳ
          </div>
        </div>

        {/* KPI 3: Điện + Nước + Dịch vụ */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            3. Điện + Nước + DV
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-amber-600 dark:text-amber-400 tabular-nums truncate"
            data-testid="kpi-utilities-services"
          >
            {formatVnd(dynamicKpis.totalUtilitiesAndServicesVnd)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">
            Đ: {formatVnd(dynamicKpis.totalElectricVnd)} · N: {formatVnd(dynamicKpis.totalWaterVnd)}
          </div>
        </div>

        {/* KPI 4: Hóa đơn sẵn sàng */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            4. Hóa đơn sẵn sàng
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums"
            data-testid="kpi-ready-invoices"
          >
            {dynamicKpis.readyInvoicesCount}/{dynamicKpis.totalObligationsCount}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">
            Đủ dữ liệu ({completionPercent}%)
          </div>
        </div>

        {/* KPI 5: Đã gửi khách */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            5. Đã gửi khách
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums"
            data-testid="kpi-sent-invoices"
          >
            {dynamicKpis.sentInvoicesCount}/{dynamicKpis.needSendInvoicesCount}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">
            Qua {formatChannelLabel(automationPolicy.defaultChannel)}
          </div>
        </div>

        {/* KPI 6: Đã thu / Còn phải thu */}
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            6. Đã thu / Còn phải thu
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums truncate"
            data-testid="kpi-collected-amount"
          >
            {formatVnd(dynamicKpis.totalCollectedVnd)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate">
            Còn: {formatVnd(dynamicKpis.totalRemainingReceivableVnd)}
          </div>
        </div>
      </div>

      {/* =====================================================================
          PART C — THANH TIẾN ĐỘ QUYẾT TOÁN KỲ (Section 3.3)
         ===================================================================== */}
      <div
        className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 sm:p-4 shadow-2xs space-y-3"
        data-testid="settlement-progress-bar-section"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span>Tiến độ hoàn thiện dữ liệu &amp; quyết toán kỳ {selectedPeriod}</span>
            <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
              ({completionPercent}% đủ dữ liệu)
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Nhấn vào từng chỉ số để lọc nhanh danh sách phòng bên dưới
          </span>
        </div>

        {/* Visual Progress Track (@animate-ui/react Progress) */}
        <SettlementProgressBar
          value={completionPercent}
          max={100}
          ariaLabel="Tiến độ hoàn thành quyết toán kỳ"
          indicatorClassName="bg-emerald-500"
        />

        {/* 8 Interactive Status Pills (Independent dimensions, never falsely summed) */}
        <div className="flex items-center sm:flex-wrap gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: 'ALL' as QuickFilterTabId, label: 'Tổng phòng có nghĩa vụ', count: dynamicProgress.totalObligations },
            { id: 'COMPLETE_DATA' as QuickFilterTabId, label: 'Đủ dữ liệu', count: dynamicProgress.completeDataCount },
            { id: 'MISSING_DATA' as QuickFilterTabId, label: 'Thiếu dữ liệu', count: dynamicProgress.missingDataCount },
            { id: 'DRAFT_CREATED' as QuickFilterTabId, label: 'Đã tạo nháp', count: dynamicProgress.draftCreatedCount },
            { id: 'PENDING_APPROVAL' as QuickFilterTabId, label: 'Chờ phê duyệt', count: dynamicProgress.pendingApprovalCount },
            { id: 'ISSUED' as QuickFilterTabId, label: 'Đã phát hành', count: dynamicProgress.issuedCount },
            { id: 'SENT' as QuickFilterTabId, label: 'Đã gửi', count: dynamicProgress.sentCount },
            { id: 'PAID' as QuickFilterTabId, label: 'Đã thanh toán', count: dynamicProgress.paidCount },
          ].map((pill) => {
            const active = quickTab === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                data-testid={`progress-pill-${pill.id.toLowerCase()}`}
                onClick={() => {
                  setQuickTab(pill.id);
                  setCurrentPage(1);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          PART D — TRUNG TÂM CẢNH BÁO VÀ XỬ LÝ NGOẠI LỆ (Section 3.4)
         ===================================================================== */}
      {scopedAlerts.length > 0 && (
        <div
          className="rounded-2xl border border-amber-200/90 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 sm:p-4 space-y-2.5"
          data-testid="settlement-exception-center"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Trung tâm cảnh báo &amp; xử lý ngoại lệ ({scopedAlerts.length} mục cần kiểm tra trước khi phát hành)
              </span>
            </div>
            {scopedAlerts.length > 4 && (
              <button
                type="button"
                onClick={() => setQuickTab('MISSING_DATA')}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline"
              >
                Lọc tất cả phòng cần bổ sung →
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {scopedAlerts.slice(0, 6).map((alert) => {
              const targetRow = rawRows.find((r) => r.obligationKey === alert.obligationKey);
              return (
                <div
                  key={alert.id}
                  data-testid={`settlement-alert-${alert.roomCode}`}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-white dark:bg-slate-900 p-2.5 text-xs shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {alert.title}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {alert.description}
                    </div>
                  </div>
                  {targetRow && (
                    <button
                      type="button"
                      data-testid={`alert-action-${alert.roomCode}`}
                      onClick={() => {
                        if (alert.actionType === 'INPUT_WATER') {
                          openQuickInput(targetRow, 'WATER');
                        } else if (alert.actionType === 'INPUT_ELECTRIC') {
                          openQuickInput(targetRow, 'ELECTRIC');
                        } else if (alert.actionType === 'OPEN_DELIVERY_TAB') {
                          openDrawerForRow(targetRow, 'DELIVERY');
                        } else {
                          openDrawerForRow(targetRow, 'FEES');
                        }
                      }}
                      className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors"
                    >
                      {alert.actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 4 — BẢNG QUYẾT TOÁN PHÒNG TRUNG TÂM (DESKTOP) & CARDS (MOBILE)
         ===================================================================== */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-xs overflow-hidden">
        {/* Table Toolbar: Quick Filter Tabs + Sort + Column Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-4 py-3">
          {/* Quick Filter Tabs (Section 4.3) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5" role="tablist">
            {[
              { id: 'ALL' as QuickFilterTabId, label: 'Tất cả', count: dynamicProgress.totalObligations },
              { id: 'MISSING_DATA' as QuickFilterTabId, label: 'Cần bổ sung', count: dynamicProgress.missingDataCount },
              { id: 'PENDING_APPROVAL' as QuickFilterTabId, label: 'Chờ duyệt', count: dynamicProgress.pendingApprovalCount },
              { id: 'READY_TO_SEND' as QuickFilterTabId, label: 'Sẵn sàng gửi', count: dynamicProgress.readyToSendCount },
              { id: 'SENT' as QuickFilterTabId, label: 'Đã gửi', count: dynamicProgress.sentCount },
              { id: 'UNPAID' as QuickFilterTabId, label: 'Chưa thanh toán', count: dynamicProgress.unpaidCount },
              { id: 'ANOMALY' as QuickFilterTabId, label: 'Bất thường', count: dynamicProgress.anomalyCount },
            ].map((tab) => {
              const active = quickTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`settlement-tab-${tab.id.toLowerCase()}`}
                  onClick={() => {
                    setQuickTab(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors min-h-9 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 font-mono text-[10.5px] ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort & Column Visibility Controls (Desktop) */}
          <div className="hidden md:flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => toggleSort('TOTAL_PAYABLE')}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Sắp xếp: {sortField === 'TOTAL_PAYABLE' ? 'Tổng tiền' : sortField === 'STATUS' ? 'Trạng thái' : 'Mã phòng'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-settlement-column-selector"
              onClick={() => setShowColMenu((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
            >
              <Columns3 className="w-3.5 h-3.5 text-slate-400" />
              <span>Bộ chọn cột</span>
            </button>

            {showColMenu && (
              <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xl space-y-2 text-xs">
                <div className="font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                  Hiển thị cột mở rộng
                </div>
                {[
                  { key: 'periodDates', label: '5. Kỳ thanh toán' },
                  { key: 'serviceFee', label: '9. Phí dịch vụ' },
                  { key: 'extraCharge', label: '10. Phí phát sinh' },
                  { key: 'discountAdj', label: '11. Giảm trừ / Điều chỉnh' },
                  { key: 'previousDebt', label: '12. Công nợ kỳ trước' },
                  { key: 'invoiceCode', label: '15. Mã hóa đơn' },
                  { key: 'deliveryChannel', label: '18. Kênh gửi' },
                ].map((c) => (
                  <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(visibleCols as any)[c.key]}
                      onChange={(e) =>
                        setVisibleCols((prev) => ({ ...prev, [c.key]: e.target.checked }))
                      }
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-700 dark:text-slate-300">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DESKTOP TABLE VIEW (hidden on mobile < md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse" data-testid="settlement-desktop-table">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th
                  className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 py-3 pl-3.5 pr-1.5 w-8"
                >
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả phòng trong trang"
                    checked={
                      paginatedRows.length > 0 &&
                      paginatedRows.every((r) => selectedKeys.includes(r.obligationKey))
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
                <th
                  className="sticky left-8 z-20 bg-slate-50 dark:bg-slate-900 py-3 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                  onClick={() => toggleSort('ROOM_CODE')}
                >
                  Phòng
                </th>
                <th className="py-3 px-1.5 whitespace-nowrap">Tòa</th>
                <th className="py-3 px-1.5 whitespace-nowrap">Khách / HĐ</th>
                {visibleCols.periodDates && <th className="py-3 px-1.5">Kỳ TT</th>}
                <th className="py-3 px-1.5 text-right whitespace-nowrap">Tiền phòng</th>
                <th className="py-3 px-1.5 text-right whitespace-nowrap">Điện</th>
                <th className="py-3 px-1.5 text-right whitespace-nowrap">Nước</th>
                {visibleCols.serviceFee && <th className="py-3 px-1.5 text-right">Phí DV</th>}
                {visibleCols.extraCharge && <th className="py-3 px-1.5 text-right">Phát sinh</th>}
                {visibleCols.discountAdj && <th className="py-3 px-1.5 text-right">Đ.chỉnh</th>}
                {visibleCols.previousDebt && <th className="py-3 px-1.5 text-right">Nợ cũ</th>}
                <th
                  className="py-3 px-1.5 text-right cursor-pointer hover:text-blue-600 whitespace-nowrap"
                  onClick={() => toggleSort('TOTAL_PAYABLE')}
                >
                  Tổng thu
                </th>
                {visibleCols.invoiceCode && <th className="py-3 px-1.5">Mã HĐ</th>}
                <th
                  className="py-3 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                  onClick={() => toggleSort('STATUS')}
                >
                  Dữ liệu / HĐ
                </th>
                <th className="py-3 px-1.5 whitespace-nowrap">Gửi / Thu</th>
                {visibleCols.deliveryChannel && <th className="py-3 px-1.5">Kênh</th>}
                <th
                  className="sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 py-3 pl-1 pr-3 w-10 text-right"
                  aria-label="Thao tác"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedGroups.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-12 text-center text-xs text-slate-500">
                    Không có phòng/hợp đồng nào khớp với bộ lọc hiện tại trong kỳ {selectedPeriod}.
                  </td>
                </tr>
              ) : (
                paginatedGroups.map((group) => {
                  const primaryRow = group.primaryRow;
                  const groupKeys = group.members.map((m) => m.obligationKey);
                  const isGroupSelected =
                    groupKeys.length > 0 && groupKeys.every((k) => selectedKeys.includes(k));
                  const isExpanded = Boolean(expandedRooms[group.roomId]);

                  if (!group.isSharedRoom) {
                    const row = primaryRow;
                    const dataBadge = getDataStatusBadge(row.statuses.dataStatus);
                    const invBadge = getInvoiceStatusBadge(row.statuses.invoiceStatus);
                    const delivBadge = getDeliveryStatusBadge(row.statuses.deliveryStatus);
                    const payBadge = getPaymentStatusBadge(row.statuses.paymentStatus);
                    const netAdj = row.totals.adjustmentVnd - row.totals.discountVnd;

                    return (
                      <tr
                        key={row.obligationKey}
                        data-testid={`settlement-row-${row.room.code}`}
                        className={`group transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/50 ${
                          isGroupSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : 'bg-white dark:bg-[#111827]'
                        }`}
                      >
                        {/* 1. Checkbox */}
                        <td className="sticky left-0 z-10 bg-inherit py-2.5 pl-3.5 pr-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Chọn phòng ${row.room.code}`}
                            checked={isGroupSelected}
                            onChange={() => toggleSelectRow(row.obligationKey)}
                            className="rounded border-slate-300"
                          />
                        </td>

                        {/* 2. Clickable Room Code (Sticky Left) */}
                        <td className="sticky left-8 z-10 bg-inherit py-2.5 px-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            data-testid={`btn-open-room-drawer-${row.room.code}`}
                            onClick={() => openDrawerForRow(row, 'OVERVIEW')}
                            className="inline-flex items-center gap-1 font-extrabold text-blue-600 dark:text-blue-400 hover:underline text-xs"
                          >
                            <span>{row.room.code}</span>
                          </button>
                        </td>

                        {/* 3. Building */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                          {row.building.code}
                        </td>

                        {/* 4. Tenant / Representative */}
                        <td className="py-2.5 px-1.5 max-w-[130px]">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {row.tenant.fullName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {row.contract.code}
                          </div>
                        </td>

                        {/* 5. Billing Period */}
                        {visibleCols.periodDates && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                            <div>{row.periodKey}</div>
                            <div className="text-[10px]">{row.rent.activeDays}/{row.rent.basisDays} ngày</div>
                          </td>
                        )}

                        {/* 6. Room Rent */}
                        <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                          {formatVnd(row.totals.roomRentVnd)}
                        </td>

                        {/* 7. Electric */}
                        <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                          {row.electric.status === 'MISSING_DATA' ? (
                            <button
                              type="button"
                              data-testid={`btn-inline-electric-${row.room.code}`}
                              onClick={() => openQuickInput(row, 'ELECTRIC')}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 px-1.5 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300"
                            >
                              <Zap className="w-3 h-3" /> Nhập kWh
                            </button>
                          ) : (
                            <div>
                              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                                {formatVnd(row.totals.electricVnd)}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {row.electric.consumptionKwh ?? 0} kWh
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 8. Water */}
                        <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                          {row.water.status === 'NEED_M3_INPUT' ? (
                            <button
                              type="button"
                              data-testid={`btn-inline-water-${row.room.code}`}
                              onClick={() => openQuickInput(row, 'WATER')}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/60 px-1.5 py-1 text-[10px] font-bold text-cyan-800 dark:text-cyan-300"
                            >
                              <Droplets className="w-3 h-3" /> Nhập m³
                            </button>
                          ) : (
                            <div>
                              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                                {formatVnd(row.totals.waterVnd)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {row.water.mode === 'PER_M3'
                                  ? `${row.water.consumptionM3 ?? 0} m³`
                                  : row.water.mode === 'PER_PERSON'
                                  ? `${row.water.occupantCount} người`
                                  : 'Khoán'}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 9. Service Fee */}
                        {visibleCols.serviceFee && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatVnd(row.totals.serviceFeeVnd)}
                          </td>
                        )}

                        {/* 10. Extra Charge */}
                        {visibleCols.extraCharge && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatVnd(row.totals.extraChargeVnd)}
                          </td>
                        )}

                        {/* 11. Discount / Adjustment */}
                        {visibleCols.discountAdj && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {netAdj === 0 ? '0 ₫' : formatVnd(netAdj)}
                          </td>
                        )}

                        {/* 12. Previous Debt */}
                        {visibleCols.previousDebt && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-rose-600 dark:text-rose-400">
                            {row.totals.previousDebtVnd > 0 ? formatVnd(row.totals.previousDebtVnd) : '0 ₫'}
                          </td>
                        )}

                        {/* 13. Total Payable */}
                        <td className="py-2.5 pl-1.5 pr-3 text-right font-mono font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {formatVnd(row.totals.totalPayableVnd)}
                        </td>

                        {/* 14. Invoice Code */}
                        {visibleCols.invoiceCode && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {row.invoice?.code || '—'}
                          </td>
                        )}

                        {/* 15. Data & Invoice Status (Borderless Status Dots) */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5 leading-tight">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${dataBadge.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dataBadge.dotClassName}`} />
                              {dataBadge.label}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${invBadge.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${invBadge.dotClassName}`} />
                              {invBadge.label}
                            </span>
                          </div>
                        </td>

                        {/* 16. Delivery & Payment Status (Borderless Status Dots) */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5 leading-tight">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${delivBadge.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${delivBadge.dotClassName}`} />
                              {delivBadge.label}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${payBadge.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${payBadge.dotClassName}`} />
                              {payBadge.label}
                            </span>
                          </div>
                        </td>

                        {/* 17. Delivery Channel */}
                        {visibleCols.deliveryChannel && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            {formatChannelLabel(row.delivery.channel)}
                          </td>
                        )}

                        {/* 18. Actions (Only 3-Dot Button, Sticky Right) */}
                        <td className="sticky right-0 z-10 bg-white dark:bg-[#111827] group-hover:bg-blue-50 dark:group-hover:bg-slate-800 py-2.5 pl-1 pr-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end">
                            <ActionMenu
                              items={[
                                {
                                  label: 'Xem chi tiết quyết toán',
                                  icon: <Eye className="w-4 h-4 text-blue-600" />,
                                  onClick: () => openDrawerForRow(row, 'OVERVIEW'),
                                },
                                {
                                  label: 'Nhập chỉ số / Chỉnh sửa chi phí',
                                  icon: <Zap className="w-4 h-4 text-amber-500" />,
                                  onClick: () => openDrawerForRow(row, 'FEES'),
                                },
                                ...(row.water.mode === 'PER_M3'
                                  ? [
                                      {
                                        label: 'Nhập nhanh khối nước (m³)',
                                        icon: <Droplets className="w-4 h-4 text-cyan-500" />,
                                        onClick: () => openQuickInput(row, 'WATER'),
                                      },
                                    ]
                                  : []),
                                ...(canManageSettlements && row.safety.canApprove
                                  ? [
                                      {
                                        label: 'Phê duyệt hóa đơn này',
                                        icon: <ShieldCheck className="w-4 h-4 text-indigo-600" />,
                                        onClick: () =>
                                          void handleApproveObligations([row.obligationKey], 'APPROVE'),
                                      },
                                    ]
                                  : []),
                                ...(canManageInvoices && row.safety.canApprove
                                  ? [
                                      {
                                        label:
                                          row.statuses.deliveryStatus === 'SENT' ||
                                          row.statuses.deliveryStatus === 'DELIVERED'
                                            ? 'Gửi lại hóa đơn cho khách'
                                            : 'Phát hành & Gửi hóa đơn',
                                        icon: <Send className="w-4 h-4 text-emerald-600" />,
                                        onClick: () => void handleIssueAndSend([row.obligationKey]),
                                      },
                                    ]
                                  : []),
                                {
                                  label: 'Ghi nhận / Xem thanh toán',
                                  icon: <CreditCard className="w-4 h-4 text-emerald-600" />,
                                  onClick: () => openDrawerForRow(row, 'PAYMENT'),
                                },
                                {
                                  label: 'Lịch sử thay đổi (Audit)',
                                  icon: <History className="w-4 h-4 text-slate-500" />,
                                  onClick: () => openDrawerForRow(row, 'HISTORY'),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // SHARED ROOM: Parent aggregated summary row + Collapsible Member Breakdown Sub-Panel
                  const roomNetAdj =
                    group.aggregatedTotals.adjustmentVnd - group.aggregatedTotals.discountVnd;
                  const roomDataBadge =
                    group.aggregatedCounts.anomalyCount > 0
                      ? getDataStatusBadge('ANOMALY')
                      : group.aggregatedCounts.missingDataCount > 0
                      ? getDataStatusBadge('MISSING_DATA')
                      : getDataStatusBadge('COMPLETE');
                  const roomInvSummaryLabel =
                    group.aggregatedCounts.issuedCount === group.totalMembersCount
                      ? `Đã PH ${group.totalMembersCount}/${group.totalMembersCount}`
                      : group.aggregatedCounts.approvedCount === group.totalMembersCount
                      ? `Đã duyệt ${group.totalMembersCount}/${group.totalMembersCount}`
                      : `${group.aggregatedCounts.pendingApprovalCount + group.aggregatedCounts.approvedCount}/${group.totalMembersCount} HĐ`;
                  const roomDelivSummaryLabel =
                    group.aggregatedCounts.sentCount === group.totalMembersCount
                      ? `Đã gửi ${group.totalMembersCount}/${group.totalMembersCount}`
                      : `${group.aggregatedCounts.sentCount}/${group.totalMembersCount} đã gửi`;
                  const roomPaySummaryLabel =
                    group.aggregatedCounts.paidCount === group.totalMembersCount
                      ? 'Đã thu đủ'
                      : group.aggregatedCounts.paidCount > 0
                      ? `Thu ${group.aggregatedCounts.paidCount}/${group.totalMembersCount} HĐ`
                      : 'Chưa thanh toán';

                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr
                        data-testid={`settlement-row-${group.room.code}`}
                        className={`group transition-colors hover:bg-violet-50/50 dark:hover:bg-violet-950/25 ${
                          isGroupSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/30'
                            : isExpanded
                            ? 'bg-violet-50/40 dark:bg-violet-950/20'
                            : 'bg-white dark:bg-[#111827]'
                        }`}
                      >
                        {/* 1. Checkbox (selects all member invoices) */}
                        <td className="sticky left-0 z-10 bg-inherit py-2.5 pl-3.5 pr-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Chọn tất cả hóa đơn phòng ghép ${group.room.code}`}
                            checked={isGroupSelected}
                            onChange={() => toggleSelectGroup(groupKeys)}
                            className="rounded border-slate-300"
                          />
                        </td>

                        {/* 2. Clickable Shared Room + Expand Chevron */}
                        <td className="sticky left-8 z-10 bg-inherit py-2.5 px-1.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              data-testid={`btn-open-room-drawer-${group.room.code}`}
                              onClick={() => openDrawerForRow(primaryRow, 'OVERVIEW')}
                              className="inline-flex items-center gap-1 font-extrabold text-blue-600 dark:text-blue-400 hover:underline text-xs"
                            >
                              <span>{group.room.code}</span>
                            </button>
                            <button
                              type="button"
                              data-testid={`btn-toggle-shared-room-${group.room.code}`}
                              onClick={() => toggleRoomExpand(group.roomId)}
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-100/90 dark:bg-violet-950/70 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-200/80 transition-colors"
                            >
                              <Users className="w-2.5 h-2.5" />
                              <span>Ở ghép · {group.totalMembersCount} TV</span>
                              <ChevronDown
                                className={`w-3 h-3 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </td>

                        {/* 3. Building */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                          {group.building.code}
                        </td>

                        {/* 4. Members Summary */}
                        <td className="py-2.5 px-1.5 max-w-[130px]">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {group.totalMembersCount} TV · {group.totalMembersCount} HĐ
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {group.members.map((m) => m.tenant.fullName.split(' ').pop()).join(', ')}
                          </div>
                        </td>

                        {/* 5. Billing Period */}
                        {visibleCols.periodDates && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                            <div>{primaryRow.periodKey}</div>
                            <div className="text-[10px]">{group.totalMembersCount} hóa đơn riêng</div>
                          </td>
                        )}

                        {/* 6. Aggregated Room Rent */}
                        <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                            {formatVnd(group.aggregatedTotals.roomRentVnd)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Riêng {group.totalMembersCount} TV
                          </div>
                        </td>

                        {/* 7. Room Electric Total */}
                        <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                          {primaryRow.electric.status === 'MISSING_DATA' ? (
                            <button
                              type="button"
                              data-testid={`btn-inline-electric-${group.room.code}`}
                              onClick={() => openQuickInput(primaryRow, 'ELECTRIC')}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 px-1.5 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300"
                            >
                              <Zap className="w-3 h-3" /> Nhập kWh
                            </button>
                          ) : (
                            <div>
                              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                                {formatVnd(group.aggregatedTotals.electricVnd)}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {primaryRow.electric.consumptionKwh ?? 0} kWh
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 8. Room Water Total */}
                        <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                          {primaryRow.water.status === 'NEED_M3_INPUT' ? (
                            <button
                              type="button"
                              data-testid={`btn-inline-water-${group.room.code}`}
                              onClick={() => openQuickInput(primaryRow, 'WATER')}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/60 px-1.5 py-1 text-[10px] font-bold text-cyan-800 dark:text-cyan-300"
                            >
                              <Droplets className="w-3 h-3" /> Nhập m³
                            </button>
                          ) : (
                            <div>
                              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                                {formatVnd(group.aggregatedTotals.waterVnd)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {primaryRow.water.mode === 'PER_M3'
                                  ? `${primaryRow.water.consumptionM3 ?? 0} m³`
                                  : `Tổng ${group.totalMembersCount} TV`}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 9. Service Fee */}
                        {visibleCols.serviceFee && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatVnd(group.aggregatedTotals.serviceFeeVnd)}
                          </td>
                        )}

                        {/* 10. Extra Charge */}
                        {visibleCols.extraCharge && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatVnd(group.aggregatedTotals.extraChargeVnd)}
                          </td>
                        )}

                        {/* 11. Discount / Adjustment */}
                        {visibleCols.discountAdj && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {roomNetAdj === 0 ? '0 ₫' : formatVnd(roomNetAdj)}
                          </td>
                        )}

                        {/* 12. Previous Debt */}
                        {visibleCols.previousDebt && (
                          <td className="py-2.5 px-1.5 text-right font-mono tabular-nums whitespace-nowrap text-rose-600 dark:text-rose-400">
                            {group.aggregatedTotals.previousDebtVnd > 0
                              ? formatVnd(group.aggregatedTotals.previousDebtVnd)
                              : '0 ₫'}
                          </td>
                        )}

                        {/* 13. Room Total Payable */}
                        <td className="py-2.5 pl-1.5 pr-3 text-right font-mono font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {formatVnd(group.aggregatedTotals.totalPayableVnd)}
                        </td>

                        {/* 14. Invoice Code Count */}
                        {visibleCols.invoiceCode && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap font-mono text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                            {group.totalMembersCount} HĐ riêng
                          </td>
                        )}

                        {/* 15. Data & Invoice Status Summary (Borderless Status Dots) */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5 leading-tight">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${roomDataBadge.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${roomDataBadge.dotClassName}`} />
                              {roomDataBadge.label}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-violet-500" />
                              {roomInvSummaryLabel}
                            </span>
                          </div>
                        </td>

                        {/* 16. Delivery & Payment Status Summary (Borderless Status Dots) */}
                        <td className="py-2.5 px-1.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5 leading-tight">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-slate-400" />
                              {roomDelivSummaryLabel}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                                group.aggregatedCounts.paidCount === group.totalMembersCount
                                  ? getPaymentStatusBadge('PAID').textClassName
                                  : getPaymentStatusBadge('UNPAID').textClassName
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  group.aggregatedCounts.paidCount === group.totalMembersCount
                                    ? getPaymentStatusBadge('PAID').dotClassName
                                    : getPaymentStatusBadge('UNPAID').dotClassName
                                }`}
                              />
                              {roomPaySummaryLabel}
                            </span>
                          </div>
                        </td>

                        {/* 17. Delivery Channel */}
                        {visibleCols.deliveryChannel && (
                          <td className="py-2.5 px-1.5 whitespace-nowrap text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            {formatChannelLabel(primaryRow.delivery.channel)}
                          </td>
                        )}

                        {/* 18. Actions (Only 3-Dot Button, Sticky Right) */}
                        <td
                          className={`sticky right-0 z-10 py-2.5 pl-1 pr-3 text-right whitespace-nowrap ${
                            isExpanded
                              ? 'bg-violet-50 dark:bg-slate-900'
                              : 'bg-white dark:bg-[#111827]'
                          } group-hover:bg-violet-50 dark:group-hover:bg-slate-900`}
                        >
                          <div className="inline-flex items-center justify-end">
                            <ActionMenu
                              items={[
                                {
                                  label: isExpanded
                                    ? 'Thu gọn chi tiết thành viên'
                                    : `Mở rộng ${group.totalMembersCount} hóa đơn thành viên`,
                                  icon: <Users className="w-4 h-4 text-violet-600" />,
                                  onClick: () => toggleRoomExpand(group.roomId),
                                },
                                {
                                  label: 'Nhập chỉ số điện/nước chung cho cả phòng',
                                  icon: <Zap className="w-4 h-4 text-amber-500" />,
                                  onClick: () => openQuickInput(primaryRow, 'WATER'),
                                },
                                ...(canManageSettlements && group.aggregatedCounts.canApproveCount > 0
                                  ? [
                                      {
                                        label: `Phê duyệt tất cả ${group.totalMembersCount} HĐ phòng này`,
                                        icon: <ShieldCheck className="w-4 h-4 text-indigo-600" />,
                                        onClick: () => void handleApproveObligations(groupKeys, 'APPROVE'),
                                      },
                                    ]
                                  : []),
                                ...(canManageInvoices && group.aggregatedCounts.canSendCount > 0
                                  ? [
                                      {
                                        label: `Phát hành & Gửi tất cả ${group.totalMembersCount} HĐ`,
                                        icon: <Send className="w-4 h-4 text-emerald-600" />,
                                        onClick: () => void handleIssueAndSend(groupKeys),
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDABLE MEMBER INVOICE BREAKDOWN PANEL (@animate-ui/react Collapsible) */}
                      <tr data-testid={`settlement-shared-panel-${group.room.code}`}>
                        <td colSpan={visibleColCount} className="p-0 border-0">
                          <Collapsible.Root
                            open={isExpanded}
                            onOpenChange={(nextOpen) => toggleRoomExpand(group.roomId, nextOpen)}
                          >
                            <Collapsible.Panel className="overflow-hidden border-b border-violet-200/80 dark:border-violet-900/50 bg-violet-50/45 dark:bg-violet-950/20">
                              <div className="sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-[calc(100vw-290px)] px-4 sm:px-6 py-3.5 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1.5 font-bold text-violet-900 dark:text-violet-200">
                                      <Users className="w-4 h-4 text-violet-600" />
                                      Chi tiết hóa đơn từng thành viên — Phòng ghép {group.room.code} ({group.totalMembersCount} HĐ)
                                    </span>
                                    <span className="rounded-lg bg-white/90 dark:bg-slate-900/80 border border-violet-200/80 dark:border-violet-800 px-2.5 py-0.5 text-[11px] font-medium text-violet-800 dark:text-violet-300">
                                      Tiền phòng gán riêng theo HĐ • Điện ({formatVnd(group.aggregatedTotals.electricVnd)}) &amp; Nước ({formatVnd(group.aggregatedTotals.waterVnd)}) chia đều • Phí khác tính riêng
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => toggleRoomExpand(group.roomId, false)}
                                    className="text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline"
                                  >
                                    Thu gọn
                                  </button>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-violet-200/80 dark:border-violet-800/70 bg-white dark:bg-[#0F172A] shadow-2xs">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                      <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                          <th className="py-2 pl-2.5 pr-1.5">Thành viên / HĐ</th>
                                          <th className="py-2 px-1.5 text-right">Phòng riêng</th>
                                          <th className="py-2 px-1.5 text-right">Điện (1/{group.totalMembersCount})</th>
                                          <th className="py-2 px-1.5 text-right">Nước (1/{group.totalMembersCount})</th>
                                          <th className="py-2 px-1.5 text-right">DV &amp; Khác</th>
                                          <th className="py-2 px-1.5 text-right">Tổng thu</th>
                                          <th className="py-2 px-1.5">Mã hóa đơn</th>
                                          <th className="py-2 px-1.5">Trạng thái</th>
                                          <th className="py-2 pl-1.5 pr-2.5 text-right">Thao tác</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                        {group.members.map((member, mIdx) => {
                                          const mInvBadge = getInvoiceStatusBadge(member.statuses.invoiceStatus);
                                          const mPayBadge = getPaymentStatusBadge(member.statuses.paymentStatus);
                                          const memberExtrasAndService =
                                            member.totals.serviceFeeVnd +
                                            member.totals.extraChargeVnd +
                                            member.totals.adjustmentVnd -
                                            member.totals.discountVnd +
                                            member.totals.previousDebtVnd -
                                            member.totals.prepaidCreditVnd;
                                          return (
                                            <tr
                                              key={member.obligationKey}
                                              data-testid={`shared-member-row-${group.room.code}-${mIdx + 1}`}
                                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                            >
                                              <td className="py-2 pl-2.5 pr-1.5">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-950 text-[10px] font-extrabold text-violet-700 dark:text-violet-300">
                                                    {mIdx + 1}
                                                  </span>
                                                  <div className="min-w-0 max-w-[140px]">
                                                    <div className="font-bold text-slate-900 dark:text-white truncate">
                                                      {member.tenant.fullName}
                                                    </div>
                                                    <div className="font-mono text-[10px] text-slate-500 truncate">
                                                      {member.contract.code}
                                                    </div>
                                                  </div>
                                                </div>
                                              </td>
                                              <td className="py-2 px-1.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                                                {formatVnd(member.totals.roomRentVnd)}
                                              </td>
                                              <td className="py-2 px-1.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                                {formatVnd(member.totals.electricVnd)}
                                              </td>
                                              <td className="py-2 px-1.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                                {formatVnd(member.totals.waterVnd)}
                                              </td>
                                              <td className="py-2 px-1.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                                {formatVnd(memberExtrasAndService)}
                                              </td>
                                              <td className="py-2 px-1.5 text-right font-mono font-extrabold text-blue-700 dark:text-blue-400 tabular-nums whitespace-nowrap">
                                                {formatVnd(member.totals.totalPayableVnd)}
                                              </td>
                                              <td className="py-2 px-1.5 font-mono text-[10px] text-slate-600 dark:text-slate-300 max-w-[130px] truncate" title={member.invoice?.code || ''}>
                                                {member.invoice?.code || 'Chưa tạo mã'}
                                              </td>
                                              <td className="py-2 px-1.5 whitespace-nowrap">
                                                <div className="flex flex-col items-start gap-0.5 leading-tight">
                                                  <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold ${mInvBadge.textClassName}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${mInvBadge.dotClassName}`} />
                                                    {mInvBadge.label}
                                                  </span>
                                                  <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium ${mPayBadge.textClassName}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${mPayBadge.dotClassName}`} />
                                                    {mPayBadge.label}
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="py-2 pl-1.5 pr-2.5 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    data-testid={`btn-member-detail-${group.room.code}-${mIdx + 1}`}
                                                    onClick={() => openDrawerForRow(member, 'FEES')}
                                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-2 py-1 text-[10.5px] font-bold text-slate-700 dark:text-slate-200"
                                                  >
                                                    Sửa / Chi tiết
                                                  </button>
                                                  {canManageInvoices &&
                                                    member.safety.canApprove &&
                                                    member.statuses.invoiceStatus !== 'ISSUED' && (
                                                      <button
                                                        type="button"
                                                        onClick={() => void handleIssueAndSend([member.obligationKey])}
                                                        className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-[10.5px] font-bold"
                                                      >
                                                        Gửi HĐ
                                                      </button>
                                                    )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                </div>
                              </div>
                            </Collapsible.Panel>
                          </Collapsible.Root>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE WEB APP EXPERIENCE (< md, Section 17) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800" data-testid="settlement-mobile-list">
          {paginatedGroups.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Không có phòng nào khớp bộ lọc trong kỳ {selectedPeriod}.
            </div>
          ) : (
            paginatedGroups.map((group) => {
              const row = group.primaryRow;
              const isExpanded = Boolean(expandedRooms[group.roomId]);

              if (!group.isSharedRoom) {
                const invBadge = getInvoiceStatusBadge(row.statuses.invoiceStatus);
                const payBadge = getPaymentStatusBadge(row.statuses.paymentStatus);
                const dataBadge = getDataStatusBadge(row.statuses.dataStatus);

                return (
                  <div
                    key={row.obligationKey}
                    data-testid={`settlement-mobile-card-${row.room.code}`}
                    className="p-3.5 space-y-2.5 bg-white dark:bg-[#111827]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openDrawerForRow(row, 'OVERVIEW')}
                            className="text-sm font-extrabold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {row.room.code}
                          </button>
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                            {row.building.code}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${dataBadge.textClassName}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dataBadge.dotClassName}`} />
                            {dataBadge.label}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {row.tenant.fullName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                          {formatVnd(row.totals.totalPayableVnd)}
                        </div>
                        <div className="mt-0.5 flex items-center justify-end gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${invBadge.textClassName}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${invBadge.dotClassName}`} />
                            {invBadge.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${payBadge.textClassName}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${payBadge.dotClassName}`} />
                            {payBadge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Breakdown mini row */}
                    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tiền phòng</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {formatVnd(row.totals.roomRentVnd)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tiền điện</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {row.electric.status === 'MISSING_DATA' ? 'Thiếu kWh' : formatVnd(row.totals.electricVnd)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tiền nước</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {row.water.status === 'NEED_M3_INPUT' ? 'Cần nhập m³' : formatVnd(row.totals.waterVnd)}
                        </span>
                      </div>
                    </div>

                    {/* Mobile Touch Action Buttons (min-h-11) */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {row.water.status === 'NEED_M3_INPUT' ? (
                        <button
                          type="button"
                          onClick={() => openQuickInput(row, 'WATER')}
                          className="flex-1 min-h-11 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Droplets className="w-3.5 h-3.5" /> Nhập m³ nước
                        </button>
                      ) : row.electric.status === 'MISSING_DATA' ? (
                        <button
                          type="button"
                          onClick={() => openQuickInput(row, 'ELECTRIC')}
                          className="flex-1 min-h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Zap className="w-3.5 h-3.5" /> Nhập chỉ số điện
                        </button>
                      ) : row.statuses.invoiceStatus === 'PENDING_APPROVAL' || row.statuses.invoiceStatus === 'DRAFT' ? (
                        <button
                          type="button"
                          onClick={() => void handleApproveObligations([row.obligationKey], 'APPROVE')}
                          className="flex-1 min-h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Phê duyệt
                        </button>
                      ) : row.statuses.deliveryStatus !== 'SENT' && row.statuses.deliveryStatus !== 'DELIVERED' ? (
                        <button
                          type="button"
                          onClick={() => void handleIssueAndSend([row.obligationKey])}
                          className="flex-1 min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Gửi hóa đơn
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openDrawerForRow(row, 'PAYMENT')}
                          className="flex-1 min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Banknote className="w-3.5 h-3.5" /> Thu tiền / Đối soát
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openDrawerForRow(row, 'OVERVIEW')}
                        className="min-h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                      >
                        Chi tiết
                      </button>
                    </div>
                  </div>
                );
              }

              // SHARED ROOM MOBILE CARD WITH COLLAPSIBLE MEMBER BREAKDOWN
              const sharedGroupKeys = group.members.map((m) => m.obligationKey);
              const sharedDataBadge =
                group.aggregatedCounts.anomalyCount > 0
                  ? getDataStatusBadge('ANOMALY')
                  : group.aggregatedCounts.missingDataCount > 0
                  ? getDataStatusBadge('MISSING_DATA')
                  : getDataStatusBadge('COMPLETE');

              return (
                <Collapsible.Root
                  key={group.groupKey}
                  open={isExpanded}
                  onOpenChange={(nextOpen) => toggleRoomExpand(group.roomId, nextOpen)}
                  data-testid={`settlement-mobile-card-${group.room.code}`}
                  className="p-3.5 space-y-2.5 bg-white dark:bg-[#111827]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openDrawerForRow(row, 'OVERVIEW')}
                          className="text-sm font-extrabold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {group.room.code}
                        </button>
                        <span className="rounded bg-violet-100 dark:bg-violet-950/70 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                          Ở ghép · {group.totalMembersCount} TV
                        </span>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                          {group.building.code}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {group.totalMembersCount} thành viên · Hóa đơn tách riêng
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                        {formatVnd(group.aggregatedTotals.totalPayableVnd)}
                      </div>
                      <span className={`mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold ${sharedDataBadge.textClassName}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sharedDataBadge.dotClassName}`} />
                        {sharedDataBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* Aggregated Shared Room Breakdown */}
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Tổng tiền phòng</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {formatVnd(group.aggregatedTotals.roomRentVnd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Điện chung</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {row.electric.status === 'MISSING_DATA'
                          ? 'Thiếu kWh'
                          : formatVnd(group.aggregatedTotals.electricVnd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Nước chung</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {row.water.status === 'NEED_M3_INPUT'
                          ? 'Thiếu m³'
                          : formatVnd(group.aggregatedTotals.waterVnd)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Actions: Quick utility / Bulk room action + Member Expand Toggle */}
                  <div className="flex items-center gap-2">
                    <Collapsible.Trigger
                      type="button"
                      data-testid={`btn-mobile-toggle-shared-${group.room.code}`}
                      className="flex-1 min-h-11 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center gap-1.5 px-3"
                    >
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isExpanded
                          ? 'Thu gọn thành viên'
                          : `Xem ${group.totalMembersCount} HĐ thành viên`}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </Collapsible.Trigger>
                    {row.water.status === 'NEED_M3_INPUT' ? (
                      <button
                        type="button"
                        onClick={() => openQuickInput(row, 'WATER')}
                        className="min-h-11 px-3 rounded-xl bg-cyan-600 text-white text-xs font-bold shrink-0"
                      >
                        Nhập m³
                      </button>
                    ) : canManageInvoices && group.aggregatedCounts.canSendCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void handleIssueAndSend(sharedGroupKeys)}
                        className="min-h-11 px-3 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0"
                      >
                        Gửi cả phòng
                      </button>
                    ) : null}
                  </div>

                  {/* Collapsible Mobile Member Breakdown List */}
                  <Collapsible.Panel className="overflow-hidden">
                    <div className="pt-1.5 space-y-2 border-t border-violet-100 dark:border-violet-900/50">
                      <div className="text-[10.5px] font-medium text-violet-700 dark:text-violet-300">
                        Tiền phòng gán riêng • Điện &amp; nước chia đều {group.totalMembersCount} thành viên:
                      </div>
                      {group.members.map((member, mIdx) => {
                        const mInvBadge = getInvoiceStatusBadge(member.statuses.invoiceStatus);
                        const mPayBadge = getPaymentStatusBadge(member.statuses.paymentStatus);
                        const mExtras =
                          member.totals.serviceFeeVnd +
                          member.totals.extraChargeVnd +
                          member.totals.adjustmentVnd -
                          member.totals.discountVnd;
                        return (
                          <div
                            key={member.obligationKey}
                            data-testid={`mobile-shared-member-${group.room.code}-${mIdx + 1}`}
                            className="rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  #{mIdx + 1} · {member.tenant.fullName}
                                </div>
                                <div className="font-mono text-[10px] text-slate-500 truncate">
                                  {member.invoice?.code || member.contract.code}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono text-xs font-extrabold text-blue-700 dark:text-blue-400">
                                  {formatVnd(member.totals.totalPayableVnd)}
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-0.5">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${mInvBadge.textClassName}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${mInvBadge.dotClassName}`} />
                                    {mInvBadge.label}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${mPayBadge.textClassName}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${mPayBadge.dotClassName}`} />
                                    {mPayBadge.label}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px] bg-white/80 dark:bg-slate-900/60 rounded-lg p-2">
                              <div>
                                <span className="text-slate-400 block text-[10px]">Tiền phòng riêng</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                                  {formatVnd(member.totals.roomRentVnd)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Điện (1/{group.totalMembersCount})</span>
                                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                                  {formatVnd(member.totals.electricVnd)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Nước (1/{group.totalMembersCount})</span>
                                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                                  {formatVnd(member.totals.waterVnd)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">DV &amp; Phí khác</span>
                                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                                  {formatVnd(mExtras)}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openDrawerForRow(member, 'FEES')}
                              className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                            >
                              Xem / Sửa hóa đơn thành viên
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </Collapsible.Panel>
                </Collapsible.Root>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-500">
          <div>
            Hiển thị <strong>{paginatedGroups.length}</strong> / <strong>{roomGroups.length}</strong> phòng ({paginatedRows.length}/{filteredRows.length} hóa đơn hợp đồng)
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Trước
              </button>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                Trang {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          QUICK INPUT MODAL (Water m³ / Electric kWh inline input)
         ===================================================================== */}
      <Dialog.Root
        open={quickInputModal.open}
        onOpenChange={(nextOpen) =>
          !nextOpen && setQuickInputModal((prev) => ({ ...prev, open: false }))
        }
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]" />
          <Dialog.Popup
            data-testid="settlement-quick-input-modal"
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 shadow-2xl space-y-4"
          >
            {quickInputModal.row && (
              <>
                <div className="flex items-center justify-between">
                  <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {quickInputModal.mode === 'WATER' ? (
                      <>
                        <Droplets className="w-4 h-4 text-cyan-500" />
                        <span>Nhập số khối nước (m³) — Phòng {quickInputModal.row.room.code}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span>Nhập chỉ số điện (kWh) — Phòng {quickInputModal.row.room.code}</span>
                      </>
                    )}
                  </Dialog.Title>
                </div>

                {quickInputModal.mode === 'WATER' ? (
                  <div className="space-y-3 text-xs">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-slate-600 dark:text-slate-300">
                      Đơn giá áp dụng:{' '}
                      <strong className="font-mono">
                        {formatVnd(quickInputModal.row.water.unitRateVnd)}/m³
                      </strong>
                      . Nhập <strong>0</strong> nếu phòng không sử dụng nước trong kỳ.
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Số khối nước tiêu thụ kỳ {quickInputModal.row.periodKey} (m³)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        autoFocus
                        data-testid="modal-input-water-m3"
                        value={quickInputModal.waterM3}
                        onChange={(e) =>
                          setQuickInputModal((prev) => ({ ...prev, waterM3: e.target.value }))
                        }
                        placeholder="Ví dụ: 12"
                        className="min-h-11 w-full rounded-xl border border-cyan-400 bg-white dark:bg-slate-800 px-3 font-mono text-sm font-bold"
                      />
                    </div>
                    {quickInputModal.waterM3.trim() !== '' &&
                      !Number.isNaN(Number(quickInputModal.waterM3)) && (
                        <div className="flex justify-between items-center rounded-xl bg-cyan-50 dark:bg-cyan-950/50 p-3 font-mono text-xs">
                          <span>Thành tiền nước dự kiến:</span>
                          <strong className="text-cyan-700 dark:text-cyan-300 text-sm">
                            {formatVnd(
                              Math.round(
                                Number(quickInputModal.waterM3) *
                                  quickInputModal.row.water.unitRateVnd
                              )
                            )}
                          </strong>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-500 mb-1">
                          Chỉ số đầu kỳ (kWh)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          data-testid="modal-input-electric-start"
                          value={quickInputModal.startKwh}
                          onChange={(e) =>
                            setQuickInputModal((prev) => ({ ...prev, startKwh: e.target.value }))
                          }
                          className="min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          Chỉ số cuối kỳ (kWh)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          autoFocus
                          data-testid="modal-input-electric-end"
                          value={quickInputModal.endKwh}
                          onChange={(e) =>
                            setQuickInputModal((prev) => ({ ...prev, endKwh: e.target.value }))
                          }
                          placeholder="VD: 1250"
                          className="min-h-11 w-full rounded-xl border border-amber-400 bg-white dark:bg-slate-800 px-3 font-mono text-sm font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setQuickInputModal((prev) => ({ ...prev, open: false }))}
                    className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-semibold"
                  >
                    Hủy
                  </button>
                  <SettlementShimmerButton
                    type="button"
                    data-testid="modal-btn-save-quick-input"
                    isLoading={isMutating}
                    loadingText="Đang lưu..."
                    onClick={async () => {
                      const r = quickInputModal.row!;
                      const ok = await handleSaveRoomInput({
                        roomId: r.room.id,
                        contractId: r.contract.id,
                        periodKey: r.periodKey,
                        applyToRoomMembers:
                          Boolean(r.sharedRoomInfo?.isSharedRoom) || r.room.sharedContractCount > 1,
                        ...(quickInputModal.mode === 'WATER'
                          ? {
                              water: {
                                mode: 'PER_M3',
                                consumptionM3:
                                  quickInputModal.waterM3.trim() !== ''
                                    ? Number(quickInputModal.waterM3)
                                    : null,
                                occupantCount: r.water.occupantCount,
                                unitRateVnd: r.water.unitRateVnd,
                                reason: quickInputModal.reason,
                              },
                            }
                          : {
                              electric: {
                                startKwh: Number(quickInputModal.startKwh || 0),
                                endKwh:
                                  quickInputModal.endKwh.trim() !== ''
                                    ? Number(quickInputModal.endKwh)
                                    : null,
                                ratePerKwhVnd: r.electric.ratePerKwhVnd,
                                reason: quickInputModal.reason,
                              },
                            }),
                        reason: quickInputModal.reason,
                      });
                      if (ok) {
                        setQuickInputModal((prev) => ({ ...prev, open: false }));
                      }
                    }}
                    className="min-h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 text-xs font-bold"
                  >
                    Lưu &amp; Tính ngay
                  </SettlementShimmerButton>
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* =====================================================================
          MONTH-CLOSE LOCK & HISTORY MODAL (Section 15)
         ===================================================================== */}
      <Dialog.Root open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]" />
          <Dialog.Popup
            data-testid="settlement-lock-period-modal"
            className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Khóa sổ quyết toán kỳ {selectedPeriod}</span>
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setLockModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Đóng
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Khi khóa sổ kỳ, toàn bộ hóa đơn và bảng tính của tòa nhà trong kỳ {selectedPeriod} sẽ được đóng băng bất biến (Frozen Snapshot).
            </p>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              {billingPeriods.map((bp) => (
                <div key={bp.buildingId} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {bp.buildingCode} · {bp.buildingName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Trạng thái: <strong>{bp.status}</strong>
                      {bp.lockedAt ? ` · Khóa lúc ${new Date(bp.lockedAt).toLocaleString('vi-VN')}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {bp.status === 'LOCKED' ? (
                      <>
                        <span
                          data-testid="badge-month-close-locked"
                          className="rounded-lg bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3" /> ĐÃ KHÓA SỔ
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            data-testid={`btn-unlock-period-${bp.buildingCode}`}
                            onClick={() => void handleUnlockBuildingPeriod(bp.buildingId, bp.periodKey)}
                            disabled={!unlockReason.trim() || isMutating}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-800 disabled:opacity-40"
                          >
                            Mở khóa
                          </button>
                        )}
                      </>
                    ) : (
                      canManageSettlements && (
                        <button
                          type="button"
                          data-testid="btn-month-close-lock"
                          disabled={isMutating}
                          onClick={() => void handleLockBuildingPeriod(bp.buildingId, bp.periodKey)}
                          className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3" /> Khóa sổ kỳ
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && billingPeriods.some((b) => b.status === 'LOCKED') && (
              <div className="space-y-1 text-xs">
                <label className="block font-semibold text-slate-600 dark:text-slate-300">
                  Lý do mở khóa sổ (Bắt buộc đối với Admin khi mở khóa):
                </label>
                <input
                  type="text"
                  data-testid="input-unlock-period-reason"
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="Nhập lý do kiểm toán để mở khóa..."
                  className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs"
                />
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* =====================================================================
          5-TAB RIGHT-SIDE DETAIL DRAWER (Section 10)
         ===================================================================== */}
      <SettlementDetailDrawer
        open={drawerOpen}
        row={activeDrawerRow}
        siblingMembers={drawerSiblings}
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        onSelectObligation={(nextKey) => setActiveObligationKey(nextKey)}
        onClose={() => setDrawerOpen(false)}
        canManageSettlements={canManageSettlements}
        canManageInvoices={canManageInvoices}
        canWriteFinance={canWriteFinance}
        canInputReadings={canInputReadings}
        isSaving={isMutating}
        onSaveRoomInput={handleSaveRoomInput}
        onApproveObligation={handleApproveObligations}
        onIssueAndSend={handleIssueAndSend}
        onRecordPayment={handleRecordPayment}
      />
    </div>
  );
};
