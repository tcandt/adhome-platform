import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button as AnimatedButton } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { notifySave } from '@/shared/ui/SaveToast';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  FileSignature,
  FileSpreadsheet,
  ExternalLink,
  ImagePlus,
  ShieldCheck,
  Users,
  Gauge,
  History,
  KeyRound,
  Loader2,
  Lock,
  Droplets,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  UserCheck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  formatPeriodDisplay,
  getCurrentVnPeriodKey,
  type NavModuleId,
} from '@/app/navigation/navigationConfig';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { ContractCreationWizardModal } from './modals/ContractCreationWizardModal';
import { LegacyImportWizardModal } from './modals/LegacyImportWizardModal';
import { HunonicSettingsModal } from './modals/HunonicSettingsModal';
import { SettlementWorkspaceView } from './SettlementWorkspaceView';
import {
  ContractsWorkspaceView,
  type ContractListItem,
} from './ContractsWorkspaceView';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { ContractDocumentLink } from '@/shared/ui/ContractDocumentDialog';
import { MoneyInput } from '@/shared/ui/MoneyInput';
import { formatWaterBillingLabel } from '@/shared/tokens/designTokens';

function shiftPeriodKey(periodKey: string, deltaMonths: number): string {
  const match = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return getCurrentVnPeriodKey();
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1 + deltaMonths;
  const d = new Date(Date.UTC(year, monthIdx, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

function formatInvoiceDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/**
 * Returns today's ISO date string (YYYY-MM-DD) in Vietnam Timezone (Asia/Ho_Chi_Minh, UTC+7)
 */
export function getTodayIsoVn(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const vn = new Date(utc + 7 * 3600000);
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, '0');
  const d = String(vn.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isInvoiceOverdue(status: string, remaining: number, dueDate?: string): boolean {
  if (remaining <= 0 || status === 'PAID') return false;
  if (status === 'OVERDUE') return true;
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return dueDate < getTodayIsoVn();
  }
  return false;
}

function getInvoiceStatus(status: string, remaining: number, paidAmount: number, dueDate?: string) {
  if (remaining <= 0 || status === 'PAID') {
    return {
      code: 'PAID' as const,
      label: 'Đã thanh toán',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }
  const overdue = isInvoiceOverdue(status, remaining, dueDate);
  if (paidAmount > 0) {
    return {
      code: overdue ? ('OVERDUE' as const) : ('PARTIAL' as const),
      label: overdue ? 'Thu 1 phần · Quá hạn' : 'Đã thu một phần',
      className: overdue
        ? 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/50 dark:text-rose-300'
        : 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-300',
    };
  }
  if (overdue) {
    return {
      code: 'OVERDUE' as const,
      label: 'Quá hạn',
      className: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/50 dark:text-rose-300',
    };
  }
  return {
    code: 'UNPAID' as const,
    label: 'Chờ thanh toán',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-950/50 dark:text-blue-300',
  };
}

function getInvoiceFeeItems(inv: {
  roomRentVnd?: number;
  electricVnd?: number;
  waterVnd?: number;
  serviceFeeVnd?: number;
  adjustmentVnd?: number;
  totalAmountVnd: number;
}): Array<{ label: string; amountVnd: number }> {
  const rent = Number(inv.roomRentVnd || 0);
  const elec = Number(inv.electricVnd || 0);
  const water = Number(inv.waterVnd || 0);
  const svc = Number(inv.serviceFeeVnd || 0);
  const adj = Number(inv.adjustmentVnd || 0);
  const items: Array<{ label: string; amountVnd: number }> = [];
  if (rent !== 0) items.push({ label: 'Phòng', amountVnd: rent });
  if (elec !== 0) items.push({ label: 'Điện', amountVnd: elec });
  if (water !== 0) items.push({ label: 'Nước', amountVnd: water });
  if (svc !== 0) items.push({ label: 'Dịch vụ', amountVnd: svc });
  if (adj !== 0) items.push({ label: 'Điều chỉnh', amountVnd: adj });
  const represented = rent + elec + water + svc + adj;
  const diff = Number(inv.totalAmountVnd || 0) - represented;
  if (diff !== 0 && represented > 0) {
    items.push({ label: 'Cọc/Khác', amountVnd: diff });
  }
  return items;
}

function getPaymentChannelMeta(providerId: string): {
  label: string;
  badgeClassName: string;
  dotClassName: string;
} {
  const normalized = String(providerId || '').trim().toUpperCase();
  if (normalized === 'SEPAY') {
    return {
      label: 'SePay · VietQR',
      badgeClassName:
        'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300',
      dotClassName: 'bg-emerald-500',
    };
  }
  if (normalized === 'PAYOS') {
    return {
      label: 'payOS · VietQR',
      badgeClassName:
        'border-indigo-200 bg-indigo-50/80 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300',
      dotClassName: 'bg-indigo-500',
    };
  }
  if (normalized === 'TINGEE') {
    return {
      label: 'Tingee · OpenBanking',
      badgeClassName:
        'border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300',
      dotClassName: 'bg-sky-500',
    };
  }
  if (normalized === 'MANUAL_CASH' || normalized === 'TIỀN MẶT') {
    return {
      label: 'Tiền mặt',
      badgeClassName:
        'border-amber-200/90 bg-amber-50/80 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
      dotClassName: 'bg-amber-500',
    };
  }
  if (normalized === 'MANUAL_TRANSFER') {
    return {
      label: 'Chuyển khoản NH',
      badgeClassName:
        'border-blue-200 bg-blue-50/80 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300',
      dotClassName: 'bg-blue-500',
    };
  }
  return {
    label: providerId || 'Kênh khác',
    badgeClassName:
      'border-slate-200 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dotClassName: 'bg-slate-400',
  };
}

function formatPaymentProviderLabel(providerId: string): string {
  return getPaymentChannelMeta(providerId).label;
}

function getReconcileBadge(tx: {
  reconcileState: string;
  invoiceCode: string | null;
  matchType?: 'EXACT' | 'SUGGESTED' | 'NONE';
}) {
  const state = String(tx.reconcileState || '').toUpperCase();
  const hasInvoice = Boolean(tx.invoiceCode);
  if (state === 'OVERPAID') {
    return {
      isMatched: true,
      label: 'Thu dư',
      className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-950/50 dark:text-indigo-300',
    };
  }
  if (state === 'PARTIAL_MATCH') {
    return {
      isMatched: true,
      label: 'Khớp 1 phần',
      className: 'bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-950/50 dark:text-sky-300',
    };
  }
  if (hasInvoice || ['MATCHED', 'RECONCILED', 'VERIFIED'].includes(state)) {
    return {
      isMatched: true,
      label: 'Đã khớp',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }
  if (tx.matchType === 'SUGGESTED') {
    return {
      isMatched: false,
      label: 'Gợi ý khớp',
      className: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-950/50 dark:text-blue-300',
    };
  }
  return {
    isMatched: false,
    label: 'Chờ đối soát',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-300',
  };
}

/**
 * Computes the contract end date dynamically based on start date and duration months (standard minus 1 day).
 */
export function computeEndDateIsoVn(
  startDateIso: string,
  durationMonths: number
): string {
  const parts = startDateIso.split('-').map(Number);
  if (
    parts.length !== 3 ||
    isNaN(parts[0]) ||
    isNaN(parts[1]) ||
    isNaN(parts[2])
  ) {
    return startDateIso;
  }
  const year = parts[0];
  const month = parts[1] - 1;
  const day = parts[2];
  const d = new Date(Date.UTC(year, month + durationMonths, day));
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface OperationalModuleWorkspaceProps {
  moduleId: Exclude<NavModuleId, 'overview' | 'buildings' | 'settings'>;
}

export const OperationalModuleWorkspace: React.FC<
  OperationalModuleWorkspaceProps
> = ({ moduleId }) => {
  const { hasCapability, user } = useAuth();
  const {
    currentNavConfig,
    selectedPeriod,
    setSelectedPeriod,
    selectedBuildingIds,
    setActiveModule,
  } = useNavigation();
  const { rooms, tenants, activeBuildings, refreshPortfolio } = usePortfolio();

  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Contract Creation Modal state
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [ctRoomId, setCtRoomId] = useState('');
  const [ctReservationId, setCtReservationId] = useState<string | null>(null);

  // Reservation Modal state
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [resvRoomId, setResvRoomId] = useState('');
  const [resvCustomerName, setResvCustomerName] = useState('');
  const [resvCustomerPhone, setResvCustomerPhone] = useState('');
  const [resvHoldAmountVnd, setResvHoldAmountVnd] = useState(2000000);
  const [resvExpectedMoveIn, setResvExpectedMoveIn] = useState(() =>
    getTodayIsoVn()
  );
  const [resvHoldDays, setResvHoldDays] = useState(7);
  const [resvNotes, setResvNotes] = useState('');
  const [resvError, setResvError] = useState<string | null>(null);
  const [isSavingResv, setIsSavingResv] = useState(false);

  // Deposit Refund Modal state
  const [isDepositRefundModalOpen, setIsDepositRefundModalOpen] =
    useState(false);
  const [selectedDepositId, setSelectedDepositId] = useState('');
  const [depTotalAmountVnd, setDepTotalAmountVnd] = useState(0);
  const [depRefundVnd, setDepRefundVnd] = useState(0);
  const [depDeductionVnd, setDepDeductionVnd] = useState(0);
  const [depDeductionReason, setDepDeductionReason] = useState('');
  const [depError, setDepError] = useState<string | null>(null);
  const [isSavingDep, setIsSavingDep] = useState(false);

  // Invoice Payment Modal state
  const [isInvoicePaymentModalOpen, setIsInvoicePaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<{
    id: string;
    invoiceCode: string;
    buildingCode: string;
    roomCode: string;
    tenantName: string | null;
    periodKey: string;
    dueDate: string;
    totalAmountVnd: number;
    paidAmountVnd: number;
    status: string;
  } | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any | null>(null);
  const [invoiceVietQr, setInvoiceVietQr] = useState<{
    providerId: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transferContent: string;
    amountVnd: number;
    qrUrl: string | null;
  } | null>(null);
  const [invoicePayAmount, setInvoicePayAmount] = useState(0);
  const [invoicePayMethod, setInvoicePayMethod] = useState<'MANUAL_CASH' | 'MANUAL_TRANSFER' | 'SEPAY' | 'PAYOS'>('MANUAL_CASH');
  const [invoicePayRef, setInvoicePayRef] = useState('');
  const [invoicePayError, setInvoicePayError] = useState<string | null>(null);
  const [isSavingInvoicePay, setIsSavingInvoicePay] = useState(false);
  const [invoiceHandover, setInvoiceHandover] = useState<{ electricRequired: boolean; waterRequired: boolean } | null>(null);
  const [invoiceHandoverLoading, setInvoiceHandoverLoading] = useState(false);
  const [invoiceElectricStart, setInvoiceElectricStart] = useState('');
  const [invoiceWaterStart, setInvoiceWaterStart] = useState('');
  const [invoiceProof, setInvoiceProof] = useState<File | null>(null);
  const [invoicePaymentProofs, setInvoicePaymentProofs] = useState<Array<{ id: string; amountVnd: number; verifiedAt: string; proofUrl: string }>>([]);
  const [invoicePaymentCommittedId, setInvoicePaymentCommittedId] = useState('');
  const invoiceProofInput = useRef<HTMLInputElement>(null);
  const invoicePaymentAttempt = useRef<{ payload: string; key: string } | null>(null);

  // Legacy Import Wizard Modal state (C4-IMPORT-01/02)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Sprint 4: Month-Close, Water Billing, and Hunonic Sync State
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [monthCloseFeedback, setMonthCloseFeedback] = useState<string | null>(null);
  const [waterCalcMode, setWaterCalcMode] = useState<'PER_PERSON' | 'PER_M3' | 'FIXED_ROOM'>('PER_PERSON');
  const [isTriggeringSyncJob, setIsTriggeringSyncJob] = useState(false);

  // Contracts vs Occupancy View Sub-Toggle (C4-OCC-01)
  const [contractsSubView, setContractsSubView] = useState<'contracts' | 'occupancy'>('contracts');
  const [occupancyData, setOccupancyData] = useState<{
    summary: {
      totalRooms: number;
      occupiedRooms: number;
      availableRooms: number;
      reservedRooms: number;
      maintenanceRooms: number;
      occupancyRatePercent: number;
      totalOccupants: number;
    };
    rooms: any[];
  } | null>(null);
  const [isLoadingOccupancy, setIsLoadingOccupancy] = useState(false);

  const fetchOccupancyData = useCallback(async () => {
    setIsLoadingOccupancy(true);
    try {
      const res = await fetch('/api/v1/console/v2/occupancy', {
        credentials: 'include',
        headers: { 'X-Requested-With': CONSOLE_CSRF_HEADER },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOccupancyData(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingOccupancy(false);
    }
  }, []);

  useEffect(() => {
    if (moduleId === 'contracts' && contractsSubView === 'occupancy') {
      void fetchOccupancyData();
    }
  }, [moduleId, contractsSubView, fetchOccupancyData]);

  useEffect(() => {
    (window as any).__adhome_openLegacyImportModal = () => setIsImportModalOpen(true);
    (window as any).__adhome_setContractsSubView = (view: 'contracts' | 'occupancy') => {
      setContractsSubView(view);
      if (view === 'occupancy') void fetchOccupancyData();
    };
    return () => {
      delete (window as any).__adhome_openLegacyImportModal;
      delete (window as any).__adhome_setContractsSubView;
    };
  }, [fetchOccupancyData]);

  // Contract Lifecycle Modals (Extend / Transfer / Terminate)
  const [selectedContract, setSelectedContract] = useState<{
    id: string;
    contractCode: string;
    roomCode: string;
    roomId: string;
    buildingCode: string;
    tenantName: string;
    endDate: string;
    monthlyRentVnd: number;
  } | null>(null);

  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extNewEndDate, setExtNewEndDate] = useState('');
  const [extNewRentVnd, setExtNewRentVnd] = useState<number | ''>('');
  const [extNotes, setExtNotes] = useState('');

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetRoomId, setTransferTargetRoomId] = useState('');
  const [transferNewRentVnd, setTransferNewRentVnd] = useState<number | ''>('');

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [termReason, setTermReason] = useState('Hết hạn hợp đồng');
  const [termRoomNextStatus, setTermRoomNextStatus] = useState<
    'AVAILABLE' | 'MAINTENANCE'
  >('AVAILABLE');

  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);

  // Handover Modal state
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [selectedHandoverContract, setSelectedHandoverContract] = useState<any>(null);
  const [handoverKwh, setHandoverKwh] = useState<number | ''>('');
  const [handoverWaterM3, setHandoverWaterM3] = useState<number | ''>('');
  const [handoverMoveInDate, setHandoverMoveInDate] = useState(getTodayIsoVn());
  const [handoverBy, setHandoverBy] = useState('');
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverAllowPartialDeposit, setHandoverAllowPartialDeposit] = useState(false);
  const [handoverDepositOverrideReason, setHandoverDepositOverrideReason] = useState('');
  const [isSavingHandover, setIsSavingHandover] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);

  // Hunonic Sync & Manual Index Modal state
  const [isHunonicModalOpen, setIsHunonicModalOpen] = useState(false);
  const [isSyncingHunonic, setIsSyncingHunonic] = useState(false);
  const [hunonicFeedback, setHunonicFeedback] = useState<string | null>(null);
  const [isManualReadingModalOpen, setIsManualReadingModalOpen] =
    useState(false);
  const [manualRoomId, setManualRoomId] = useState('');
  const [manualKwh, setManualKwh] = useState(0);
  const [manualReason, setManualReason] = useState('Chốt chỉ số thực tế');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Ledger Entry Modal state
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [lgType, setLgType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [lgCategory, setLgCategory] = useState('Tiền phòng & dịch vụ');
  const [lgBuildingId, setLgBuildingId] = useState('');
  const [lgAmountVnd, setLgAmountVnd] = useState(1500000);
  const [lgDescription, setLgDescription] = useState('');
  const [lgError, setLgError] = useState<string | null>(null);
  const [isSavingLg, setIsSavingLg] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>('ALL');
  const [paymentQuery, setPaymentQuery] = useState('');
  const [paymentView, setPaymentView] = useState<'ALL' | 'PENDING' | 'MATCHED' | 'INCOMING' | 'OUTGOING'>('ALL');

  const loadModuleData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('module', moduleId);
      params.set('period', selectedPeriod);
      if (selectedBuildingIds.length > 0) {
        params.set('buildings', selectedBuildingIds.join(','));
      }
      const res = await fetch(
        `/api/v1/console/v2/module-data?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(
          data.message || 'Không thể tải dữ liệu phân hệ từ PostgreSQL.'
        );
        setPayload(null);
        return;
      }
      setPayload(data);
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [moduleId, selectedPeriod, selectedBuildingIds]);

  useEffect(() => {
    void loadModuleData();
  }, [loadModuleData]);

  const openReservationModal = () => {
    const candidateRoom =
      rooms.find((r) => r.occupancyStatus === 'AVAILABLE') || rooms[0] || null;
    setResvRoomId(candidateRoom?.id || '');
    setResvCustomerName('');
    setResvCustomerPhone('');
    setResvHoldAmountVnd(2000000);
    setResvExpectedMoveIn(getTodayIsoVn());
    setResvHoldDays(7);
    setResvNotes('');
    setResvError(null);
    setIsReservationModalOpen(true);
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingResv(true);
    setResvError(null);
    try {
      const res = await fetch('/api/v1/console/v2/reservations', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          roomId: resvRoomId,
          customerName: resvCustomerName.trim(),
          customerPhone: resvCustomerPhone.trim(),
          holdAmountVnd: Math.trunc(Number(resvHoldAmountVnd) || 0),
          expectedMoveIn: resvExpectedMoveIn,
          holdDays: Math.trunc(Number(resvHoldDays) || 7),
          notes: resvNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setResvError(data.message || 'Không thể tạo phiếu giữ chỗ.');
        return;
      }
      setIsReservationModalOpen(false);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setResvError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingResv(false);
    }
  };

  const handleCancelReservation = async (resvId: string) => {
    if (
      !window.confirm('Bạn có chắc chắn muốn hủy phiếu giữ chỗ này không?')
    )
      return;
    try {
      const res = await fetch(
        `/api/v1/console/v2/reservations/${encodeURIComponent(resvId)}/cancel`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({ reason: 'Khách hủy giữ chỗ', forfeit: false }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.message || 'Không thể hủy phiếu giữ chỗ.');
        return;
      }
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      alert('Lỗi kết nối máy chủ.');
    }
  };

  const handleConvertReservationToContract = (r: {
    id: string;
    roomId: string;
    customerName: string;
    customerPhone: string;
    holdAmountVnd: number;
    expectedMoveIn: string | null;
  }) => {
    setCtRoomId(r.roomId);
    setCtReservationId(r.id);
    setIsContractModalOpen(true);
  };

  const handleOpenInvoicePaymentModal = (inv: {
    id: string;
    invoiceCode: string;
    buildingCode: string;
    roomCode: string;
    tenantName: string | null;
    periodKey: string;
    dueDate: string;
    totalAmountVnd: number;
    paidAmountVnd: number;
    status: string;
  }) => {
    setSelectedInvoice(inv);
    const due = Math.max(0, inv.totalAmountVnd - inv.paidAmountVnd);
    setInvoicePayAmount(due);
    setInvoicePayMethod('MANUAL_CASH');
    setInvoicePayRef('');
    setInvoicePayError(null);
    setInvoiceHandover(null);
    setInvoiceDetail(null);
    setInvoiceVietQr(null);
    invoicePaymentAttempt.current = null;
    setInvoiceElectricStart('');
    setInvoiceWaterStart('');
    setInvoiceProof(null);
    setInvoicePaymentProofs([]);
    setInvoicePaymentCommittedId('');
    setInvoiceHandoverLoading(true);
    setIsInvoicePaymentModalOpen(true);
    void fetch(`/api/v1/console/v2/invoices/${encodeURIComponent(inv.id)}`, { credentials: 'include' })
      .then(async response => { if (!response.ok) throw new Error('Không tải được điều kiện bàn giao.'); return response.json(); })
      .then(data => {
        setInvoiceHandover(data.automaticHandover || null);
        setInvoiceDetail(data.invoice || null);
        setInvoiceVietQr(data.vietQr || null);
        setInvoicePaymentProofs((data.invoice?.payments || []).filter((payment: any) => payment.proofUrl));
      })
      .catch(() => setInvoicePayError('Không tải được điều kiện bàn giao. Đóng và mở lại hóa đơn trước khi thu tiền.'))
      .finally(() => setInvoiceHandoverLoading(false));
  };

  const handleInvoicePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || invoiceHandoverLoading) return;
    const remaining = Math.max(0, selectedInvoice.totalAmountVnd - selectedInvoice.paidAmountVnd);
    const amount = Math.trunc(invoicePayAmount || 0);
    if (amount > remaining) { setInvoicePayError('Số tiền thu vượt số còn phải thu.'); return; }
    if (invoiceHandover && amount === remaining &&
        ((invoiceHandover.electricRequired && invoiceElectricStart === '') || (invoiceHandover.waterRequired && invoiceWaterStart === ''))) {
      setInvoicePayError('Nhập chỉ số điện và nước đầu kỳ để tự động bàn giao sau khi thu đủ.'); return;
    }
    setIsSavingInvoicePay(true);
    setInvoicePayError(null);
    let committed = false;
    try {
      if (invoicePaymentCommittedId) {
        if (!invoiceProof) { setInvoicePayError('Chọn ảnh chứng từ để lưu.'); return; }
        const proofRes = await fetch(`/api/v1/console/v2/payment-transactions/${encodeURIComponent(invoicePaymentCommittedId)}/proof`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': invoiceProof.type, 'X-File-Name': encodeURIComponent(invoiceProof.name), 'X-Requested-With': CONSOLE_CSRF_HEADER }, body: invoiceProof });
        const proofData = await proofRes.json().catch(() => ({}));
        if (!proofRes.ok || !proofData.ok) { setInvoicePayError(proofData.message || 'Không lưu được ảnh chứng từ.'); return; }
        setIsInvoicePaymentModalOpen(false);
        await Promise.all([loadModuleData(), refreshPortfolio()]);
        notifySave(true, 'Đã lưu chứng từ thanh toán');
        return;
      }
      const paymentPayload = JSON.stringify({
        amountVnd: amount, providerId: invoicePayMethod, referenceText: invoicePayRef || undefined,
        handoverMeterKwh: invoiceElectricStart === '' ? undefined : Number(invoiceElectricStart),
        handoverWaterM3: invoiceWaterStart === '' ? undefined : Number(invoiceWaterStart),
      });
      if (invoicePaymentAttempt.current?.payload !== paymentPayload) invoicePaymentAttempt.current = { payload: paymentPayload, key: crypto.randomUUID() };
      const res = await fetch(
        `/api/v1/console/v2/invoices/${encodeURIComponent(selectedInvoice.id)}/pay`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
            'Idempotency-Key': invoicePaymentAttempt.current.key,
          },
          body: paymentPayload,
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setInvoicePayError(data.message || 'Lỗi khi thu tiền hóa đơn.');
        return;
      }
      committed = true;
      if (invoiceProof && data.transaction?.id) {
        const proofRes = await fetch(`/api/v1/console/v2/payment-transactions/${encodeURIComponent(data.transaction.id)}/proof`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': invoiceProof.type, 'X-File-Name': encodeURIComponent(invoiceProof.name), 'X-Requested-With': CONSOLE_CSRF_HEADER }, body: invoiceProof });
        const proofData = await proofRes.json().catch(() => ({}));
        if (!proofRes.ok || !proofData.ok) {
          setInvoicePaymentCommittedId(data.transaction.id);
          await Promise.all([loadModuleData(), refreshPortfolio()]);
          setInvoicePayError(`Đã ghi nhận thu tiền nhưng chưa lưu được chứng từ. ${proofData.message || 'Chọn ảnh và thử lưu lại.'}`);
          return;
        }
      }
      setIsInvoicePaymentModalOpen(false);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
      notifySave(true, data.handedOver ? 'Đã thu tiền và bàn giao phòng' : 'Đã thu tiền hóa đơn', data.handedOver ? 'Phòng và người ở đã được kích hoạt.' : undefined);
    } catch {
      if (committed) notifySave(false, 'Đã ghi giao dịch, chưa tải lại được dữ liệu', 'Hãy tải lại Hóa đơn; không thu lần nữa.');
      else setInvoicePayError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingInvoicePay(false);
    }
  };

  const handleDepositRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDep(true);
    setDepError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/deposits/${encodeURIComponent(
          selectedDepositId
        )}/refund`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            refundAmountVnd: Math.trunc(Number(depRefundVnd) || 0),
            deductionAmountVnd: Math.trunc(Number(depDeductionVnd) || 0),
            deductionReason: depDeductionReason.trim(),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setDepError(data.message || 'Không thể xử lý hoàn cọc.');
        return;
      }
      setIsDepositRefundModalOpen(false);
      await loadModuleData();
    } catch {
      setDepError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingDep(false);
    }
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(
          selectedContract.id
        )}/extend`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            newEndDate: extNewEndDate,
            newMonthlyRentVnd: extNewRentVnd
              ? Math.trunc(Number(extNewRentVnd))
              : undefined,
            notes: extNotes.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLifecycleError(data.message || 'Không thể gia hạn hợp đồng.');
        return;
      }
      setIsExtendModalOpen(false);
      await loadModuleData();
    } catch {
      setLifecycleError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingLifecycle(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(
          selectedContract.id
        )}/transfer-room`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            newRoomId: transferTargetRoomId,
            newMonthlyRentVnd: transferNewRentVnd
              ? Math.trunc(Number(transferNewRentVnd))
              : undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLifecycleError(data.message || 'Không thể chuyển phòng.');
        return;
      }
      setIsTransferModalOpen(false);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setLifecycleError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingLifecycle(false);
    }
  };

  const handleTerminateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(
          selectedContract.id
        )}/terminate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            reason: termReason.trim(),
            roomNextStatus: termRoomNextStatus,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLifecycleError(data.message || 'Không thể thanh lý hợp đồng.');
        return;
      }
      setIsTerminateModalOpen(false);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setLifecycleError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingLifecycle(false);
    }
  };

  const openHandoverModal = (c: any) => {
    setSelectedHandoverContract(c);
    setHandoverKwh(c.handoverMeterKwh ?? '');
    setHandoverWaterM3(c.handoverWaterM3 ?? '');
    setHandoverMoveInDate(getTodayIsoVn());
    setHandoverBy(user?.name || user?.email || 'Quản lý vận hành');
    setHandoverTo(c.tenantName || '');
    setHandoverNotes('');
    setHandoverAllowPartialDeposit(false);
    setHandoverDepositOverrideReason('');
    setHandoverError(null);
    setIsHandoverModalOpen(true);
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHandoverContract) return;
    setIsSavingHandover(true);
    setHandoverError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(
          selectedHandoverContract.id
        )}/handover`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            handoverMeterKwh: handoverKwh !== '' ? Number(handoverKwh) : null,
            handoverWaterM3: handoverWaterM3 !== '' ? Number(handoverWaterM3) : null,
            moveInDate: handoverMoveInDate,
            handoverBy: handoverBy.trim() || user?.name || user?.email || 'Quản lý vận hành',
            handoverTo: handoverTo.trim() || selectedHandoverContract.tenantName || 'Khách thuê',
            notes: handoverNotes.trim() || undefined,
            allowPartialDepositWithApproval: handoverAllowPartialDeposit,
            depositOverrideReason: handoverDepositOverrideReason.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setHandoverError(data.message || 'Không thể thực hiện bàn giao phòng.');
        return;
      }
      setIsHandoverModalOpen(false);
      setSelectedHandoverContract(null);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setHandoverError('Lỗi kết nối khi bàn giao phòng.');
    } finally {
      setIsSavingHandover(false);
    }
  };

  const handleSyncHunonic = async () => {
    setIsSyncingHunonic(true);
    setHunonicFeedback(null);
    try {
      const res = await fetch('/api/v1/console/v2/hunonic/sync', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setHunonicFeedback(
          data.message || 'Lỗi đồng bộ công tơ Hunonic Cloud.'
        );
        return;
      }
      setHunonicFeedback(
        `Đã đồng bộ ${data.totalMeters} công tơ: ${data.syncedCount} online, ${data.offlineCount} offline, ${data.staleCount} stale`
      );
      await loadModuleData();
    } catch {
      setHunonicFeedback('Lỗi kết nối máy chủ Hunonic.');
    } finally {
      setIsSyncingHunonic(false);
    }
  };

  const handleTriggerBackgroundSyncJob = async () => {
    setIsTriggeringSyncJob(true);
    setHunonicFeedback(null);
    try {
      const res = await fetch('/api/v1/console/integrations/hunonic/sync-jobs', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setHunonicFeedback(data.message || 'Lỗi khởi chạy tiến trình đồng bộ nền.');
        return;
      }
      setHunonicFeedback('Đã kích hoạt tiến trình đồng bộ nền Hunonic IoT Worker (RUNNING).');
      await loadModuleData();
    } catch {
      setHunonicFeedback('Lỗi kết nối máy chủ Hunonic Worker.');
    } finally {
      setIsTriggeringSyncJob(false);
    }
  };

  const handleMonthClose = async (buildingId: string, periodKey: string) => {
    setIsClosingMonth(true);
    setMonthCloseFeedback(null);
    try {
      const res = await fetch('/api/v1/console/v2/settlements/month-close', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({ buildingId, periodKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMonthCloseFeedback(data.message || 'Lỗi khi khóa sổ kỳ quyết toán.');
        return;
      }
      setMonthCloseFeedback(
        `Đã khóa sổ kỳ ${periodKey}: Đóng băng ${data.summary?.totalInvoicesFrozen || 0} hóa đơn (${(data.summary?.totalBilledVnd || 0).toLocaleString('vi-VN')} đ).`
      );
      await loadModuleData();
    } catch {
      setMonthCloseFeedback('Lỗi kết nối khi gửi yêu cầu khóa sổ.');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleManualReadingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingManual(true);
    setManualError(null);
    try {
      const res = await fetch(
        `/api/v1/console/v2/meters/${encodeURIComponent(
          manualRoomId
        )}/manual-reading`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            readingKwh: Number(manualKwh),
            overrideReason: manualReason.trim(),
            periodKey: selectedPeriod,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setManualError(data.message || 'Không thể lưu chỉ số tay.');
        notifySave(false, 'Không thể lưu chỉ số', data.message);
        return;
      }
      setIsManualReadingModalOpen(false);
      await loadModuleData();
      notifySave(true, 'Đã lưu chỉ số tay');
    } catch {
      setManualError('Lỗi kết nối máy chủ.');
      notifySave(false, 'Không thể lưu chỉ số', 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleCreateLedgerEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLg(true);
    setLgError(null);
    try {
      const res = await fetch('/api/v1/console/v2/ledger', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          entryType: lgType,
          category: lgCategory.trim(),
          buildingId: lgBuildingId || null,
          periodKey: selectedPeriod,
          amountVnd: Math.trunc(Number(lgAmountVnd) || 0),
          description: lgDescription.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLgError(data.message || 'Không thể ghi sổ quỹ.');
        notifySave(false, 'Không thể lưu sổ quỹ', data.message);
        return;
      }
      setIsLedgerModalOpen(false);
      setLgDescription('');
      await Promise.all([loadModuleData(), refreshPortfolio()]);
      notifySave(true, 'Đã lưu bút toán sổ quỹ');
    } catch {
      setLgError('Lỗi kết nối máy chủ.');
      notifySave(false, 'Không thể lưu sổ quỹ', 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingLg(false);
    }
  };

  const reservations = Array.isArray(payload?.reservations)
    ? (payload.reservations as Array<{
        id: string;
        reservationCode: string;
        buildingCode: string;
        roomCode: string;
        roomId: string;
        customerName: string;
        customerPhone: string;
        holdAmountVnd: number;
        status: string;
        expectedMoveIn: string | null;
      }>)
    : [];

  const depositsList = Array.isArray(payload?.deposits)
    ? (payload.deposits as Array<{
        id: string;
        depositType?: string;
        amountVnd: number;
        paidAmountVnd?: number;
        refundedVnd: number;
        deductedAmountVnd?: number;
        forfeitedAmountVnd?: number;
        transferredAmountVnd?: number;
        transferredToDepositId?: string | null;
        paymentStatus?: string;
        status: string;
        createdAt: string;
      }>)
    : [];

  const contracts = Array.isArray(payload?.contracts)
    ? (payload.contracts as ContractListItem[])
    : [];

  const billingPeriods = Array.isArray(payload?.billingPeriods)
    ? (payload.billingPeriods as Array<{
        buildingId: string;
        buildingCode: string;
        buildingName: string;
        periodKey: string;
        status: string;
        exceptionCount: number;
      }>)
    : [];

  const cronJobs = Array.isArray(payload?.cronJobs)
    ? (payload.cronJobs as Array<{
        id: string;
        jobKey: string;
        displayName: string;
        cronExpression: string;
        timezone: string;
        isEnabled: boolean;
        lastRunStatus: string;
      }>)
    : [];

  const meters = Array.isArray(payload?.meters)
    ? (payload.meters as Array<{
        id: string;
        buildingCode: string;
        roomCode: string;
        meterSerial: string | null;
        hunonicDeviceId: string | null;
        connectionStatus: string;
        instantPowerW: number | null;
        cumulativeKwh: number | null;
        monthReportedKwh: number | null;
        lastSyncedAt: string | null;
      }>)
    : [];

  const invoices = Array.isArray(payload?.invoices)
    ? (payload.invoices as Array<{
        id: string;
        invoiceCode: string;
        buildingCode: string;
        roomCode: string;
        tenantName: string | null;
        periodKey: string;
        dueDate: string;
        roomRentVnd?: number;
        electricVnd?: number;
        waterVnd?: number;
        serviceFeeVnd?: number;
        adjustmentVnd?: number;
        totalAmountVnd: number;
        paidAmountVnd: number;
        status: string;
      }>)
    : [];

  const invoiceBreakdown = useMemo(() => {
    if (!invoiceDetail) return [] as Array<{ label: string; amountVnd: number }>;
    const rows = [
      { label: 'Tiền phòng', amountVnd: Number(invoiceDetail.roomRentVnd || 0) },
      { label: 'Tiền điện', amountVnd: Number(invoiceDetail.electricVnd || 0) },
      { label: 'Tiền nước', amountVnd: Number(invoiceDetail.waterVnd || 0) },
      { label: 'Phí dịch vụ', amountVnd: Number(invoiceDetail.serviceFeeVnd || 0) },
      { label: 'Điều chỉnh', amountVnd: Number(invoiceDetail.adjustmentVnd || 0) },
    ].filter(row => row.amountVnd !== 0);
    const represented = rows.reduce((sum, row) => sum + row.amountVnd, 0);
    const difference = Number(invoiceDetail.totalAmountVnd || 0) - represented;
    if (difference !== 0) {
      rows.push({
        label: invoiceDetail.policySnapshot?.type === 'FIRST_COMBINED_INVOICE' ? 'Tiền cọc / khoản đầu kỳ' : 'Khoản khác',
        amountVnd: difference,
      });
    }
    return rows;
  }, [invoiceDetail]);

  const invoiceQrUrl = useMemo(() => {
    if (!invoiceVietQr?.accountNumber || !invoiceVietQr.bankCode || invoicePayAmount <= 0) return null;
    return `https://vietqr.app/img?bank=${encodeURIComponent(invoiceVietQr.bankCode)}&acc=${encodeURIComponent(invoiceVietQr.accountNumber)}&template=compact&amount=${Math.trunc(invoicePayAmount)}&des=${encodeURIComponent(invoiceVietQr.transferContent)}&showinfo=true&holder=${encodeURIComponent(invoiceVietQr.accountName).replace(/%20/g, '+')}`;
  }, [invoicePayAmount, invoiceVietQr]);

  const invoiceSummary = invoices.reduce(
    (summary, invoice) => {
      const remaining = Math.max(0, invoice.totalAmountVnd - invoice.paidAmountVnd);
      const isPaid = remaining <= 0 || invoice.status === 'PAID';
      const isOverdue = isInvoiceOverdue(invoice.status, remaining, invoice.dueDate);
      summary.totalVnd += invoice.totalAmountVnd;
      summary.paidVnd += invoice.paidAmountVnd;
      summary.remainingVnd += remaining;
      if (isPaid) summary.paidCount += 1;
      else summary.unpaidCount += 1;
      if (isOverdue) summary.overdueCount += 1;
      return summary;
    },
    { totalVnd: 0, paidVnd: 0, remainingVnd: 0, paidCount: 0, unpaidCount: 0, overdueCount: 0 }
  );

  const normalizedInvoiceQuery = invoiceQuery.trim().toLocaleLowerCase('vi');
  const filteredInvoices = invoices.filter((inv) => {
    const remaining = Math.max(0, inv.totalAmountVnd - inv.paidAmountVnd);
    const isPaid = remaining <= 0 || inv.status === 'PAID';
    const isOverdue = isInvoiceOverdue(inv.status, remaining, inv.dueDate);
    if (invoiceStatusFilter === 'PAID' && !isPaid) return false;
    if (invoiceStatusFilter === 'UNPAID' && isPaid) return false;
    if (invoiceStatusFilter === 'OVERDUE' && !isOverdue) return false;
    if (!normalizedInvoiceQuery) return true;
    return [inv.invoiceCode, inv.buildingCode, inv.roomCode, `${inv.buildingCode} ${inv.roomCode}`, inv.tenantName]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('vi').includes(normalizedInvoiceQuery));
  });

  useEffect(() => {
    if (moduleId !== 'invoices') return;
    const pendingId = sessionStorage.getItem('adhome:open-invoice-payment');
    if (!pendingId) return;
    const target = invoices.find(invoice => invoice.id === pendingId || invoice.invoiceCode === pendingId);
    if (!target) return;
    sessionStorage.removeItem('adhome:open-invoice-payment');
    handleOpenInvoicePaymentModal(target);
  }, [moduleId, invoices]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__adhome_openInvoicePayModal = (inv?: any) => {
        const target = inv || invoices[0];
        if (target) handleOpenInvoicePaymentModal(target);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__adhome_openInvoicePayModal;
      }
    };
  }, [invoices]);

  const transactions = Array.isArray(payload?.transactions)
    ? (payload.transactions as Array<{
        id: string;
        providerId: string;
        externalTxId: string;
        amountVnd: number;
        payerName: string | null;
        referenceText: string | null;
        reconcileState: string;
        invoiceId?: string | null;
        invoiceCode: string | null;
        buildingCode?: string | null;
        roomCode?: string | null;
        tenantName?: string | null;
        verifiedAt: string;
        direction?: 'IN' | 'OUT';
        occurredAt?: string;
        matchType?: 'EXACT' | 'SUGGESTED' | 'NONE';
        accountName?: string | null;
      }>)
    : [];

  const normalizedPaymentQuery = paymentQuery.trim().toLocaleLowerCase('vi');
  const filteredTransactions = transactions.filter((tx) => {
    const badge = getReconcileBadge(tx);
    const direction = tx.direction || 'IN';
    if (paymentView === 'INCOMING' && direction !== 'IN') return false;
    if (paymentView === 'OUTGOING' && direction !== 'OUT') return false;
    if (paymentView === 'PENDING' && badge.isMatched) return false;
    if (paymentView === 'MATCHED' && !badge.isMatched) return false;
    if (!normalizedPaymentQuery) return true;
    return [
      tx.providerId,
      formatPaymentProviderLabel(tx.providerId),
      tx.externalTxId,
      tx.payerName,
      tx.tenantName,
      tx.accountName,
      tx.buildingCode,
      tx.roomCode,
      tx.referenceText,
      tx.invoiceCode,
    ]
      .filter(Boolean)
      .some(value => String(value).toLocaleLowerCase('vi').includes(normalizedPaymentQuery));
  });
  const matchedTransactionCount = transactions.filter(tx => getReconcileBadge(tx).isMatched).length;
  const pendingTransactionCount = transactions.length - matchedTransactionCount;
  const incomingTransactionCount = transactions.filter(tx => (tx.direction || 'IN') === 'IN').length;
  const outgoingTransactionCount = transactions.filter(tx => tx.direction === 'OUT').length;
  const incomingTransactionVnd = transactions.filter(tx => (tx.direction || 'IN') === 'IN').reduce((sum, tx) => sum + tx.amountVnd, 0);
  const outgoingTransactionVnd = transactions.filter(tx => tx.direction === 'OUT').reduce((sum, tx) => sum + tx.amountVnd, 0);
  const netTransactionVnd = incomingTransactionVnd - outgoingTransactionVnd;

  const handleInspectTransactionInvoice = (tx: { invoiceId?: string | null; invoiceCode: string | null }) => {
    const targetKey = tx.invoiceId || tx.invoiceCode;
    if (targetKey && typeof window !== 'undefined') {
      sessionStorage.setItem('adhome:open-invoice-payment', targetKey);
    }
    setActiveModule('invoices');
  };

  const financeSummary = (payload?.summary as
    | {
        totalIncomeVnd: number;
        totalExpenseVnd: number;
        netCashflowVnd: number;
      }
    | undefined) || {
    totalIncomeVnd: 0,
    totalExpenseVnd: 0,
    netCashflowVnd: 0,
  };

  const ledgerEntries = Array.isArray(payload?.entries)
    ? (payload.entries as Array<{
        id: string;
        entryCode: string;
        entryType: string;
        category: string;
        amountVnd: number;
        description: string;
        recordedBy: string;
        occurredAt: string;
      }>)
    : [];

  const reportBreakdown = Array.isArray(payload?.breakdown)
    ? (payload.breakdown as Array<{
        buildingId: string;
        buildingCode: string;
        buildingName: string;
        totalRooms: number;
        occupiedRooms: number;
        occupancyRatePercent: number;
        contractedRentVnd: number;
        invoicedVnd: number;
        collectedVnd: number;
        receivableVnd: number;
      }>)
    : [];

  return (
    <div
      className="operational-workspace space-y-4"
      data-module={moduleId}
      data-testid={`console-module-workspace-${moduleId}`}
    >
      {/* MODULE TOOLBAR (UI-HEADER-03 / P1) — deterministic 2-tier layout:
          Tier 1: title + action hierarchy (utility → secondary → primary)
          Tier 2: context bar (building scope + period), only when relevant */}
      {moduleId !== 'invoices' && moduleId !== 'payments' && moduleId !== 'settlements' && moduleId !== 'contracts' && (
      <div
        data-testid="module-workspace-toolbar"
        className="module-workspace-toolbar bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl"
      >
        <div className="module-workspace-toolbar-row flex items-center justify-between gap-4 px-4 py-3">
        <div className="module-workspace-heading min-w-0">
          <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
            {currentNavConfig.label}
          </h2>
          <p className="truncate text-xs text-slate-500">
            {currentNavConfig.description}
          </p>
        </div>

        <div
          data-testid="module-toolbar-actions"
          className="module-toolbar-actions flex shrink-0 items-center gap-2"
        >
          {/* Utility action */}
          <button
            type="button"
            data-testid="btn-module-refresh"
            onClick={() => void loadModuleData()}
            title="Đồng bộ lại dữ liệu phân hệ"
            className="inline-flex h-9 items-center gap-1.5 px-2.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span>Đồng bộ</span>
          </button>

          {moduleId === 'deposits' && hasCapability('canManageContracts') && (
            <button
              type="button"
              data-testid="btn-open-create-reservation"
              onClick={openReservationModal}
              className="inline-flex h-9 items-center gap-1.5 px-3.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Tạo phiếu giữ chỗ</span>
            </button>
          )}

          {moduleId === 'finance' && hasCapability('canAccessFinance') && (
            <button
              type="button"
              data-testid="btn-open-create-ledger"
              onClick={() => {
                setLgError(null);
                setLgBuildingId(activeBuildings[0]?.id || '');
                setIsLedgerModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand-primary hover:bg-brand-hover text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ghi phiếu thu / chi</span>
            </button>
          )}
        </div>
        </div>

        {currentNavConfig.hasPeriodToolbar && (
          <div
            data-testid="module-toolbar-context"
            className="module-toolbar-context flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-2.5"
          >
            <div
              data-testid="period-selector-toolbar"
                className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl"
              >
                <button
                  type="button"
                  aria-label="Kỳ trước"
                  onClick={() =>
                    setSelectedPeriod(shiftPeriodKey(selectedPeriod, -1))
                  }
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <label className="inline-flex items-center gap-1.5 px-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                  <span>{formatPeriodDisplay(selectedPeriod)}</span>
                  <input
                    data-testid="input-module-period"
                    type="month"
                    value={selectedPeriod}
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                        setSelectedPeriod(e.target.value);
                      }
                    }}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Kỳ kế tiếp"
                  onClick={() =>
                    setSelectedPeriod(shiftPeriodKey(selectedPeriod, 1))
                  }
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                {selectedPeriod !== getCurrentVnPeriodKey() && (
                  <button
                    type="button"
                    onClick={() => setSelectedPeriod(getCurrentVnPeriodKey())}
                    className="px-2 py-1 text-[11px] font-semibold text-brand-primary hover:underline"
                  >
                    Kỳ hiện tại
                  </button>
                )}
              </div>
          </div>
        )}
      </div>
      )}

      {hunonicFeedback && (
        <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-xl flex items-center justify-between">
          <span>{hunonicFeedback}</span>
          <button
            type="button"
            onClick={() => setHunonicFeedback(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
          <span>Đang truy vấn dữ liệu thực tế từ PostgreSQL...</span>
        </div>
      ) : (
        <>
          {/* 1. DEPOSITS & RESERVATIONS */}
          {moduleId === 'deposits' && (
            <div className="module-content-stack space-y-4">
              <div className="module-surface bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    Phiếu giữ chỗ phòng (Room Reservations)
                  </h3>
                </div>

                {reservations.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Chưa có phiếu giữ chỗ đang hoạt động. Nhấn &ldquo;Tạo phiếu
                      giữ chỗ&rdquo; để khóa phòng tạm thời và nhận cọc.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Mã phiếu</th>
                          <th className="pb-3">Phòng</th>
                          <th className="pb-3">Khách đặt giữ chỗ</th>
                          <th className="pb-3">Tiền giữ chỗ</th>
                          <th className="pb-3">Ngày dự kiến vào</th>
                          <th className="pb-3">Trạng thái</th>
                          <th className="pb-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {reservations.map((r) => (
                          <tr key={r.id}>
                            <td className="py-3 font-mono font-bold">
                              {r.reservationCode}
                            </td>
                            <td className="py-3 font-semibold">
                              {r.buildingCode} · {r.roomCode}
                            </td>
                            <td className="py-3">
                              <div className="font-semibold">
                                {r.customerName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {r.customerPhone}
                              </div>
                            </td>
                            <td className="py-3 font-bold tabular-nums">
                              {r.holdAmountVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3">{r.expectedMoveIn || '—'}</td>
                            <td className="py-3">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                  r.status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : r.status === 'CONVERTED'
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                    : r.status === 'CANCELLED'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : r.status === 'EXPIRED'
                                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {r.status === 'CONFIRMED'
                                  ? 'Đã cọc giữ chỗ'
                                  : r.status === 'CONVERTED'
                                  ? 'Đã lên hợp đồng'
                                  : r.status === 'CANCELLED'
                                  ? 'Đã hủy giữ'
                                  : r.status === 'EXPIRED'
                                  ? 'Hết hạn'
                                  : 'Chờ đặt cọc'}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              {r.status === 'CONFIRMED' ||
                              r.status === 'PENDING' ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleConvertReservationToContract(r)
                                    }
                                    className="px-2.5 py-1 text-[11px] font-bold bg-brand-primary text-white rounded-lg hover:bg-brand-hover"
                                  >
                                    Lập HĐ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCancelReservation(r.id)
                                    }
                                    className="px-2.5 py-1 text-[11px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg hover:bg-rose-100"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Deposit Records Table */}
              <div className="module-surface bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  Sổ theo dõi tiền cọc (Deposits Ledger)
                </h3>
                {depositsList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Chưa có khoản tiền cọc nào được ghi nhận.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Mã khoản cọc</th>
                          <th className="pb-3">Phân loại</th>
                          <th className="pb-3">Tiền cọc yêu cầu</th>
                          <th className="pb-3">Đã thu</th>
                          <th className="pb-3">Còn phải thu</th>
                          <th className="pb-3">Đã hoàn</th>
                          <th className="pb-3">Số dư khả dụng</th>
                          <th className="pb-3">Thanh toán</th>
                          <th className="pb-3">Trạng thái cọc</th>
                          <th className="pb-3 text-right">Xử lý cọc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {depositsList.map((d) => {
                          const isTransferred = d.status === 'APPLIED_TO_CONTRACT' || d.paymentStatus === 'TRANSFERRED';
                          const isTerminal = d.status === 'REFUNDED' || d.status === 'FORFEITED' || isTransferred;
                          const effectivePaid = d.paidAmountVnd ?? (d.paymentStatus === 'PAID' ? d.amountVnd : 0);
                          const remainingDue = isTerminal ? 0 : Math.max(0, d.amountVnd - effectivePaid);
                          const availableBalance = isTransferred
                            ? 0
                            : Math.max(
                                0,
                                effectivePaid -
                                  d.refundedVnd -
                                  (d.deductedAmountVnd || 0) -
                                  (d.forfeitedAmountVnd || 0) -
                                  (d.transferredAmountVnd || 0)
                              );
                          return (
                          <tr key={d.id}>
                            <td className="py-3 font-mono font-bold">
                              {d.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="py-3">
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {d.depositType === 'BOOKING'
                                  ? 'Cọc giữ phòng'
                                  : d.depositType === 'ADVANCE_RENT'
                                  ? 'Tiền trả trước'
                                  : 'Cọc hợp đồng'}
                              </span>
                            </td>
                            <td className="py-3 font-bold tabular-nums text-slate-900 dark:text-white">
                              {d.amountVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 font-bold tabular-nums text-emerald-600">
                              {effectivePaid.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 tabular-nums font-semibold">
                              {remainingDue > 0 ? (
                                <span className="text-rose-500 font-bold">{remainingDue.toLocaleString('vi-VN')} đ</span>
                              ) : (
                                <span className="text-slate-400">0 đ</span>
                              )}
                            </td>
                            <td className="py-3 tabular-nums text-slate-500">
                              {d.refundedVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                              {availableBalance.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  d.paymentStatus === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                    : d.paymentStatus === 'PARTIALLY_PAID'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                    : d.paymentStatus === 'TRANSFERRED'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                                    : d.paymentStatus === 'REFUNDED'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                    : d.paymentStatus === 'FORFEITED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                                    : d.paymentStatus === 'PENDING'
                                    ? 'bg-amber-50/80 text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}
                              >
                                {d.paymentStatus === 'PAID'
                                  ? 'Đã thu tiền'
                                  : d.paymentStatus === 'PARTIALLY_PAID'
                                  ? 'Thu 1 phần'
                                  : d.paymentStatus === 'TRANSFERRED'
                                  ? 'Đã chuyển HĐ'
                                  : d.paymentStatus === 'REFUNDED'
                                  ? 'Đã hoàn cọc'
                                  : d.paymentStatus === 'FORFEITED'
                                  ? 'Đã tịch thu'
                                  : d.paymentStatus === 'PENDING'
                                  ? 'Chờ thanh toán'
                                  : 'Chờ thu'}
                              </span>
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                  d.status === 'HELD'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : d.status === 'APPLIED_TO_CONTRACT'
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                    : d.status === 'PARTIALLY_REFUNDED'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : d.status === 'REFUNDED'
                                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                    : d.status === 'FORFEITED'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {d.status === 'HELD'
                                  ? 'Đang giữ cọc'
                                  : d.status === 'APPLIED_TO_CONTRACT'
                                  ? 'Đã chuyển sang HĐ'
                                  : d.status === 'PARTIALLY_REFUNDED'
                                  ? 'Đã hoàn 1 phần'
                                  : d.status === 'REFUNDED'
                                  ? 'Đã hoàn cọc'
                                  : d.status === 'FORFEITED'
                                  ? 'Đã phạt/tịch thu'
                                  : d.status}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              {isTransferred ? (
                                <span className="text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded inline-flex items-center gap-1">
                                  Đã chuyển HĐ
                                  {d.transferredToDepositId && (
                                    <span className="font-mono text-[9px] opacity-75">
                                      ({d.transferredToDepositId.slice(0, 6)})
                                    </span>
                                  )}
                                </span>
                              ) : availableBalance > 0 && (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED') ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDepositId(d.id);
                                    setDepTotalAmountVnd(availableBalance);
                                    setDepRefundVnd(availableBalance);
                                    setDepDeductionVnd(0);
                                    setDepDeductionReason('');
                                    setDepError(null);
                                    setIsDepositRefundModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg"
                                >
                                  Hoàn / Khấu trừ
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  Hết số dư
                                </span>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. CONTRACTS & OCCUPANCY SOURCE OF TRUTH */}
          {moduleId === 'contracts' && (
            <ContractsWorkspaceView
              selectedPeriod={selectedPeriod}
              onChangePeriod={setSelectedPeriod}
              shiftPeriodKey={shiftPeriodKey}
              contracts={contracts}
              roomsCount={rooms.length}
              isLoading={isLoading || isLoadingOccupancy}
              onRefresh={loadModuleData}
              contractsSubView={contractsSubView}
              onChangeSubView={(nextView) => {
                setContractsSubView(nextView);
                if (nextView === 'occupancy') void fetchOccupancyData();
              }}
              occupancyData={occupancyData}
              onOpenHandover={(c) => openHandoverModal(c)}
              onOpenExtend={(c) => {
                setSelectedContract(c);
                setExtNewEndDate(computeEndDateIsoVn(c.endDate, 6));
                setExtNewRentVnd(c.monthlyRentVnd);
                setExtNotes('');
                setLifecycleError(null);
                setIsExtendModalOpen(true);
              }}
              onOpenTransfer={(c) => {
                setSelectedContract(c);
                setTransferTargetRoomId('');
                setTransferNewRentVnd(c.monthlyRentVnd);
                setLifecycleError(null);
                setIsTransferModalOpen(true);
              }}
              onOpenTerminate={(c) => {
                setSelectedContract(c);
                setTermReason('Hết hạn hợp đồng');
                setTermRoomNextStatus('AVAILABLE');
                setLifecycleError(null);
                setIsTerminateModalOpen(true);
              }}
            />
          )}

          {/* 3. SETTLEMENTS & AUTOMATED BILLING CENTER */}
          {moduleId === 'settlements' && (
            <SettlementWorkspaceView
              selectedPeriod={selectedPeriod}
              onChangePeriod={setSelectedPeriod}
              shiftPeriodKey={shiftPeriodKey}
              payload={payload}
              isLoading={isLoading}
              onRefresh={loadModuleData}
            />
          )}

          {/* 4. INVOICES */}
          {moduleId === 'invoices' && (
            <div className="invoice-workspace space-y-2.5 sm:space-y-3.5">
              {/* Unified Top Header, Period & Sync Bar */}
              <div className="invoice-period-header flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-2 sm:px-4 sm:py-3 shadow-xs dark:border-slate-800 dark:bg-[#111827]">
                <div className="hidden md:block min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
                    {currentNavConfig.label}
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {currentNavConfig.description}
                  </p>
                </div>

                <div className="flex flex-1 md:flex-initial items-center justify-between md:justify-end gap-2 min-w-0">
                  <div className="flex min-w-0 flex-1 md:flex-initial items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Kỳ trước"
                      onClick={() => setSelectedPeriod(shiftPeriodKey(selectedPeriod, -1))}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <label className="flex min-w-0 flex-1 md:flex-initial md:min-w-[168px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                      <span className="truncate">Kỳ {formatPeriodDisplay(selectedPeriod)}</span>
                      <input
                        data-testid="input-module-period"
                        type="month"
                        value={selectedPeriod}
                        onChange={(event) => {
                          if (/^\d{4}-\d{2}$/.test(event.target.value)) setSelectedPeriod(event.target.value);
                        }}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Kỳ kế tiếp"
                      onClick={() => setSelectedPeriod(shiftPeriodKey(selectedPeriod, 1))}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    {selectedPeriod !== getCurrentVnPeriodKey() && (
                      <button
                        type="button"
                        onClick={() => setSelectedPeriod(getCurrentVnPeriodKey())}
                        className="hidden lg:inline-flex h-9 items-center rounded-lg px-2 text-xs font-semibold text-brand-primary hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        Kỳ này
                      </button>
                    )}
                  </div>

                  <AnimatedButton
                    type="button"
                    data-testid="btn-module-refresh"
                    onClick={() => void loadModuleData()}
                    disabled={isLoading}
                    title="Đồng bộ lại dữ liệu hóa đơn"
                    aria-label={isLoading ? 'Đang đồng bộ hóa đơn' : 'Đồng bộ hóa đơn'}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-brand-primary ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Đồng bộ</span>
                  </AnimatedButton>
                </div>
              </div>

              {/* Compact 3-KPI Summary Grid */}
              <div className="invoice-summary-grid grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Còn phải thu trong kỳ
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      invoiceSummary.overdueCount > 0
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300'
                        : invoiceSummary.unpaidCount > 0
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}>
                      {invoiceSummary.overdueCount > 0
                        ? `${invoiceSummary.overdueCount} quá hạn`
                        : invoiceSummary.unpaidCount > 0
                          ? `${invoiceSummary.unpaidCount} chờ thu`
                          : 'Hoàn tất'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 sm:block">
                    <strong className={`block text-lg sm:text-xl font-bold tabular-nums ${
                      invoiceSummary.remainingVnd > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {invoiceSummary.remainingVnd.toLocaleString('vi-VN')} đ
                    </strong>
                    <p className="text-[11px] text-slate-500 sm:mt-0.5">
                      {invoiceSummary.unpaidCount > 0
                        ? `${invoiceSummary.unpaidCount}/${invoices.length} HĐ chưa tất toán`
                        : 'Tất cả HĐ đã thu đủ'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Tổng phát hành
                  </span>
                  <strong className="mt-0.5 block truncate text-sm sm:text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {invoiceSummary.totalVnd.toLocaleString('vi-VN')} đ
                  </strong>
                  <p className="mt-0.5 text-[10.5px] sm:text-[11px] text-slate-500">
                    {invoices.length} hóa đơn kỳ {selectedPeriod.slice(5, 7)}/{selectedPeriod.slice(0, 4)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Đã thu thực tế
                  </span>
                  <strong className="mt-0.5 block truncate text-sm sm:text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {invoiceSummary.paidVnd.toLocaleString('vi-VN')} đ
                  </strong>
                  <p className="mt-0.5 text-[10.5px] sm:text-[11px] text-slate-500">
                    {invoiceSummary.paidCount}/{invoices.length} hóa đơn hoàn tất
                  </p>
                </div>
              </div>

              {/* Main Invoice List Card */}
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                {/* Filter & Search Bar */}
                <div className="border-b border-slate-100 p-2.5 sm:p-4 dark:border-slate-800">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div
                      className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:gap-1.5"
                      role="tablist"
                      aria-label="Bộ lọc trạng thái hóa đơn"
                    >
                      {([
                        ['ALL', 'Tất cả', invoices.length],
                        ['UNPAID', 'Cần thu', invoiceSummary.unpaidCount],
                        ['OVERDUE', 'Quá hạn', invoiceSummary.overdueCount],
                        ['PAID', 'Đã thu', invoiceSummary.paidCount],
                      ] as const).map(([key, label, count]) => {
                        const active = invoiceStatusFilter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setInvoiceStatusFilter(key)}
                            className={`inline-flex h-9 min-w-0 items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1 sm:px-3 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors ${
                              active
                                ? 'bg-brand-primary text-white shadow-2xs'
                                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{label}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                                active
                                  ? 'bg-white/20 text-white'
                                  : key === 'OVERDUE' && count > 0
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative min-w-0 sm:w-64 md:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={invoiceQuery}
                        onChange={(e) => setInvoiceQuery(e.target.value)}
                        placeholder="Tìm phòng, khách thuê, mã HĐ..."
                        aria-label="Tìm kiếm hóa đơn"
                        className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-8 text-xs text-slate-900 outline-none transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-white dark:focus:ring-blue-950"
                      />
                      {invoiceQuery && (
                        <button
                          type="button"
                          aria-label="Xóa từ khóa tìm kiếm"
                          onClick={() => setInvoiceQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <div className="px-4 py-10 text-center space-y-2">
                    <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Chưa phát hành hóa đơn cho kỳ {formatPeriodDisplay(selectedPeriod)}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Hãy kiểm tra hợp đồng hiệu lực hoặc chuyển sang kỳ kế toán khác để xem danh sách hóa đơn.
                    </p>
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="px-4 py-10 text-center space-y-2">
                    <Search className="w-7 h-7 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Không tìm thấy hóa đơn phù hợp
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Không có hóa đơn nào khớp với bộ lọc hiện tại.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceStatusFilter('ALL');
                        setInvoiceQuery('');
                      }}
                      className="inline-flex h-8 items-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Đặt lại bộ lọc
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards View (md:hidden) */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                      {filteredInvoices.map((inv) => {
                        const remaining = Math.max(0, inv.totalAmountVnd - inv.paidAmountVnd);
                        const status = getInvoiceStatus(inv.status, remaining, inv.paidAmountVnd, inv.dueDate);
                        const feeItems = getInvoiceFeeItems(inv);
                        return (
                          <div
                            key={inv.id}
                            data-testid={`invoice-card-${inv.id}`}
                            className="invoice-mobile-card p-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                          >
                            {/* Row 1: Room + Tenant + Status Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-extrabold text-brand-primary dark:bg-blue-950/50 dark:text-blue-300">
                                    {inv.buildingCode} · {inv.roomCode}
                                  </span>
                                  <span className="truncate font-semibold text-xs text-slate-800 dark:text-slate-100">
                                    {inv.tenantName || 'Khách thuê chưa cập nhật'}
                                  </span>
                                </div>
                                <span className="mt-0.5 block truncate font-mono text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">
                                  {inv.invoiceCode} · Hạn {formatInvoiceDate(inv.dueDate)}
                                </span>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${status.className}`}>
                                {status.label}
                              </span>
                            </div>

                            {/* Row 2: Fee Breakdown Pills */}
                            {feeItems.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {feeItems.map((item) => (
                                  <span
                                    key={item.label}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 text-[10.5px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
                                  >
                                    <span className="text-slate-400">{item.label}:</span>
                                    <strong className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                      {item.amountVnd.toLocaleString('vi-VN')} đ
                                    </strong>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Row 3: Financial Summary + Action */}
                            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/40">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    {remaining > 0 ? 'Còn thu' : 'Đã thu đủ'}
                                  </span>
                                  <strong className={`text-sm font-extrabold tabular-nums ${
                                    remaining > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                  }`}>
                                    {(remaining > 0 ? remaining : inv.totalAmountVnd).toLocaleString('vi-VN')} đ
                                  </strong>
                                </div>
                                {inv.paidAmountVnd > 0 && remaining > 0 && (
                                  <p className="text-[10.5px] text-emerald-600 tabular-nums">
                                    Đã thu {inv.paidAmountVnd.toLocaleString('vi-VN')}/{inv.totalAmountVnd.toLocaleString('vi-VN')} đ
                                  </p>
                                )}
                              </div>

                              {remaining > 0 ? (
                                <AnimatedButton
                                  type="button"
                                  data-testid={`btn-pay-invoice-mobile-${inv.id}`}
                                  onClick={() => handleOpenInvoicePaymentModal(inv)}
                                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-brand-hover"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  <span>Thu tiền</span>
                                </AnimatedButton>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenInvoicePaymentModal(inv)}
                                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Chi tiết</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table View (hidden md:block) */}
                    <div className="hidden md:block overflow-x-auto p-4">
                      <table className="w-full text-left text-xs" data-testid="invoices-table">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 font-semibold">
                            <th className="pb-3 pr-3">Mã hóa đơn</th>
                            <th className="pb-3 pr-3">Phòng / Khách thuê</th>
                            <th className="pb-3 pr-3">Khoản thu chính</th>
                            <th className="pb-3 pr-3">Hạn TT</th>
                            <th className="pb-3 pr-3 text-right">Tổng phải thu</th>
                            <th className="pb-3 pr-3 text-right">Đã thu</th>
                            <th className="pb-3 pr-3 text-right">Còn thiếu</th>
                            <th className="pb-3 pr-3">Trạng thái</th>
                            <th className="pb-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredInvoices.map((inv) => {
                            const remaining = Math.max(0, inv.totalAmountVnd - inv.paidAmountVnd);
                            const status = getInvoiceStatus(inv.status, remaining, inv.paidAmountVnd, inv.dueDate);
                            const feeItems = getInvoiceFeeItems(inv);
                            return (
                              <tr
                                key={inv.id}
                                className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                              >
                                <td className="py-3.5 pr-3 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInvoicePaymentModal(inv)}
                                    className="font-mono font-bold text-slate-900 hover:text-brand-primary dark:text-white"
                                  >
                                    {inv.invoiceCode}
                                  </button>
                                </td>
                                <td className="py-3.5 pr-3 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-primary dark:bg-blue-950/50 dark:text-blue-300">
                                      {inv.buildingCode} · {inv.roomCode}
                                    </span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {inv.tenantName || '—'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 pr-3 align-middle">
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {feeItems.map((item) => (
                                      <span
                                        key={item.label}
                                        className="inline-flex items-center gap-1 rounded bg-slate-100/80 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                      >
                                        <span>{item.label}:</span>
                                        <strong className="tabular-nums">{item.amountVnd.toLocaleString('vi-VN')}</strong>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-3.5 pr-3 align-middle font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {formatInvoiceDate(inv.dueDate)}
                                </td>
                                <td className="py-3.5 pr-3 align-middle text-right font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                                  {inv.totalAmountVnd.toLocaleString('vi-VN')} đ
                                </td>
                                <td className="py-3.5 pr-3 align-middle text-right tabular-nums font-semibold whitespace-nowrap text-emerald-600">
                                  {inv.paidAmountVnd.toLocaleString('vi-VN')} đ
                                </td>
                                <td className="py-3.5 pr-3 align-middle text-right tabular-nums font-semibold whitespace-nowrap">
                                  <span className={remaining > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                                    {remaining.toLocaleString('vi-VN')} đ
                                  </span>
                                </td>
                                <td className="py-3.5 pr-3 align-middle whitespace-nowrap">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ring-1 ring-inset ${status.className}`}>
                                    {status.label}
                                  </span>
                                </td>
                                <td className="py-3.5 align-middle text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {remaining > 0 ? (
                                      <AnimatedButton
                                        type="button"
                                        onClick={() => handleOpenInvoicePaymentModal(inv)}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-primary px-2.5 text-[11px] font-bold text-white shadow-2xs hover:bg-brand-hover"
                                      >
                                        <CreditCard className="h-3 w-3" />
                                        <span>Thu tiền</span>
                                      </AnimatedButton>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenInvoicePaymentModal(inv)}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      >
                                        <span>Chi tiết</span>
                                      </button>
                                    )}
                                    <ActionMenu
                                      items={[
                                        ...(remaining > 0
                                          ? [
                                              {
                                                label: 'Thu tiền hóa đơn',
                                                variant: 'primary' as const,
                                                testId: 'action-pay-invoice',
                                                onClick: () => handleOpenInvoicePaymentModal(inv),
                                              },
                                            ]
                                          : []),
                                        {
                                          label: 'Xem chi tiết hóa đơn',
                                          onClick: () => handleOpenInvoicePaymentModal(inv),
                                        },
                                      ]}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 5. PAYMENTS & RECONCILIATION */}
          {moduleId === 'payments' && (
            <div className="space-y-2.5 sm:space-y-3.5" data-testid="payments-reconciliation-workspace">
              {/* Unified Top Header, Period & Sync Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-2 sm:px-4 sm:py-3 shadow-xs dark:border-slate-800 dark:bg-[#111827]">
                <div className="hidden md:block min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
                    {currentNavConfig.label}
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {currentNavConfig.description}
                  </p>
                </div>

                <div className="flex flex-1 md:flex-initial items-center justify-between md:justify-end gap-2 min-w-0">
                  <div className="flex min-w-0 flex-1 md:flex-initial items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Kỳ trước"
                      onClick={() => setSelectedPeriod(shiftPeriodKey(selectedPeriod, -1))}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <label className="flex min-w-0 flex-1 md:flex-initial md:min-w-[168px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                      <span className="truncate">Kỳ {formatPeriodDisplay(selectedPeriod)}</span>
                      <input
                        data-testid="input-module-period"
                        type="month"
                        value={selectedPeriod}
                        onChange={(event) => {
                          if (/^\d{4}-\d{2}$/.test(event.target.value)) setSelectedPeriod(event.target.value);
                        }}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Kỳ kế tiếp"
                      onClick={() => setSelectedPeriod(shiftPeriodKey(selectedPeriod, 1))}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    {selectedPeriod !== getCurrentVnPeriodKey() && (
                      <button
                        type="button"
                        onClick={() => setSelectedPeriod(getCurrentVnPeriodKey())}
                        className="hidden lg:inline-flex h-9 items-center rounded-lg px-2 text-xs font-semibold text-brand-primary hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        Kỳ này
                      </button>
                    )}
                  </div>

                  <AnimatedButton
                    type="button"
                    data-testid="btn-module-refresh"
                    aria-label="Đồng bộ dữ liệu đối soát"
                    title="Đồng bộ dữ liệu đối soát"
                    onClick={() => void loadModuleData()}
                    disabled={isLoading}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-brand-primary ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Đồng bộ</span>
                  </AnimatedButton>
                </div>
              </div>

              {/* Compact 2x2 / 4-Column Cashflow & Reconciliation Summary */}
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tiền nhận vào</span>
                    <span className="grid h-5.5 w-5.5 place-items-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <strong className="mt-0.5 block truncate text-sm sm:text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{incomingTransactionVnd.toLocaleString('vi-VN')} đ
                  </strong>
                  <p className="mt-0.5 truncate text-[10.5px] sm:text-[11px] text-slate-500">
                    {incomingTransactionCount} giao dịch tiền vào
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tiền chuyển ra</span>
                    <span className="grid h-5.5 w-5.5 place-items-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <strong className="mt-0.5 block truncate text-sm sm:text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    -{outgoingTransactionVnd.toLocaleString('vi-VN')} đ
                  </strong>
                  <p className="mt-0.5 truncate text-[10.5px] sm:text-[11px] text-slate-500">
                    {outgoingTransactionCount} giao dịch hoàn / chi
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Đã đối soát</span>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {transactions.length > 0 ? `${Math.round((matchedTransactionCount / transactions.length) * 100)}%` : '0%'}
                    </span>
                  </div>
                  <strong className="mt-0.5 block text-sm sm:text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {matchedTransactionCount}/{transactions.length} <span className="text-xs font-semibold text-slate-400">giao dịch</span>
                  </strong>
                  <p className="mt-0.5 truncate text-[10.5px] sm:text-[11px] text-slate-500">
                    Ròng: {netTransactionVnd >= 0 ? '+' : ''}{netTransactionVnd.toLocaleString('vi-VN')} đ
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Cần xử lý</span>
                    <span className={`h-2 w-2 rounded-full ${pendingTransactionCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  </div>
                  <strong className={`mt-0.5 block text-sm sm:text-lg font-bold tabular-nums ${
                    pendingTransactionCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {pendingTransactionCount} <span className="text-xs font-semibold text-slate-400">giao dịch</span>
                  </strong>
                  <p className="mt-0.5 truncate text-[10.5px] sm:text-[11px] text-slate-500">
                    {pendingTransactionCount > 0 ? 'Cần gán hóa đơn' : 'Đã xử lý hoàn tất'}
                  </p>
                </div>
              </div>

              {/* Main Transactions & Reconciliation List */}
              <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
                <div className="border-b border-slate-100 p-2.5 sm:p-4 dark:border-slate-800">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div
                      className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:gap-1.5"
                      role="tablist"
                      aria-label="Quản lý giao dịch đối soát"
                    >
                      {([
                        ['ALL', 'Tất cả', transactions.length],
                        ['PENDING', 'Cần xử lý', pendingTransactionCount],
                        ['INCOMING', 'Tiền vào', incomingTransactionCount],
                        ['OUTGOING', 'Tiền ra', outgoingTransactionCount],
                      ] as const).map(([value, label, count]) => {
                        const active = paymentView === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setPaymentView(value)}
                            className={`inline-flex h-9 min-w-0 items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1 sm:px-3 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors ${
                              active
                                ? 'bg-brand-primary text-white shadow-2xs'
                                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{label}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                                active
                                  ? 'bg-white/20 text-white'
                                  : value === 'PENDING' && count > 0
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative min-w-0 sm:w-64 md:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <span className="sr-only">Tìm giao dịch</span>
                      <input
                        type="search"
                        value={paymentQuery}
                        onChange={(event) => setPaymentQuery(event.target.value)}
                        placeholder="Tìm mã GD, phòng, khách, nội dung..."
                        className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-8 text-xs text-slate-900 outline-none transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-white dark:focus:ring-blue-950"
                      />
                      {paymentQuery && (
                        <button
                          type="button"
                          aria-label="Xóa từ khóa tìm kiếm giao dịch"
                          onClick={() => setPaymentQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="space-y-2 px-4 py-10 text-center">
                    <CreditCard className="mx-auto h-8 w-8 text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {transactions.length === 0
                        ? `Chưa có giao dịch trong kỳ ${formatPeriodDisplay(selectedPeriod)}`
                        : 'Không có giao dịch trong mục này'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {transactions.length === 0
                        ? 'Các giao dịch thu tiền mặt hoặc chuyển khoản qua cổng thanh toán sẽ tự động hiển thị tại đây.'
                        : 'Thử chuyển sang tab "Tất cả" hoặc xóa từ khóa tìm kiếm để xem toàn bộ giao dịch.'}
                    </p>
                    {transactions.length > 0 && (paymentView !== 'ALL' || paymentQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentView('ALL');
                          setPaymentQuery('');
                        }}
                        className="inline-flex h-8 items-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Xem tất cả ({transactions.length})
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile Transactions List (md:hidden) */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                      {filteredTransactions.map((tx) => {
                        const direction = tx.direction || 'IN';
                        const badge = getReconcileBadge(tx);
                        const channel = getPaymentChannelMeta(tx.providerId);
                        return (
                          <article key={tx.id} className="p-3.5 space-y-2.5">
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span
                                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                                    direction === 'IN'
                                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                                      : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                                  }`}
                                >
                                  {direction === 'IN' ? (
                                    <ArrowDownLeft className="h-4 w-4" />
                                  ) : (
                                    <ArrowUpRight className="h-4 w-4" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${channel.badgeClassName}`}
                                    >
                                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${channel.dotClassName}`} />
                                      <span>{channel.label}</span>
                                    </span>
                                    {tx.buildingCode && tx.roomCode && (
                                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-brand-primary dark:bg-blue-950/50 dark:text-blue-300">
                                        {tx.buildingCode} · {tx.roomCode}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                                    {tx.payerName || tx.tenantName || tx.accountName || (direction === 'IN' ? 'Khách thanh toán' : 'Chi hoàn tiền')}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-sm font-extrabold tabular-nums ${
                                    direction === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {direction === 'IN' ? '+' : '-'}
                                  {tx.amountVnd.toLocaleString('vi-VN')} đ
                                </p>
                                <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800/80 dark:bg-slate-900/50">
                              <p className="line-clamp-2 font-medium text-slate-700 dark:text-slate-200">
                                {tx.referenceText || 'Không có nội dung chuyển khoản'}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-1.5 text-[10.5px] text-slate-500 dark:border-slate-800">
                                <span className="truncate font-mono text-[10px] text-slate-400">
                                  {tx.externalTxId} · {new Date(tx.occurredAt || tx.verifiedAt).toLocaleString('vi-VN')}
                                </span>
                                {tx.invoiceCode ? (
                                  <button
                                    type="button"
                                    onClick={() => handleInspectTransactionInvoice(tx)}
                                    className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-brand-primary hover:underline"
                                  >
                                    <span>{tx.invoiceCode}</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActiveModule('invoices')}
                                    className="font-semibold text-amber-600 hover:underline dark:text-amber-400"
                                  >
                                    Đối soát HĐ →
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {/* Desktop Transactions Table (hidden md:block) */}
                    <div className="hidden overflow-x-auto p-4 md:block">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 dark:border-slate-800">
                            <th className="pb-3 pr-3">Thời gian / Mã GD</th>
                            <th className="pb-3 pr-3">Kênh thanh toán</th>
                            <th className="pb-3 pr-3">Phòng / Người chuyển</th>
                            <th className="pb-3 pr-3">Nội dung giao dịch</th>
                            <th className="pb-3 pr-3 text-right">Số tiền</th>
                            <th className="pb-3 pr-3">Hóa đơn khớp</th>
                            <th className="pb-3 text-right">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredTransactions.map((tx) => {
                            const direction = tx.direction || 'IN';
                            const badge = getReconcileBadge(tx);
                            const channel = getPaymentChannelMeta(tx.providerId);
                            return (
                              <tr
                                key={tx.id}
                                className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                              >
                                <td className="py-3.5 pr-3 align-middle whitespace-nowrap">
                                  <span className="block font-mono font-bold text-slate-900 dark:text-white">
                                    {tx.externalTxId}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-slate-500">
                                    {new Date(tx.occurredAt || tx.verifiedAt).toLocaleString('vi-VN')}
                                  </span>
                                </td>
                                <td className="py-3.5 pr-3 align-middle whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${channel.badgeClassName}`}
                                  >
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${channel.dotClassName}`} />
                                    <span>{channel.label}</span>
                                  </span>
                                </td>
                                <td className="py-3.5 pr-3 align-middle">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {tx.buildingCode && tx.roomCode && (
                                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-brand-primary dark:bg-blue-950/50 dark:text-blue-300">
                                        {tx.buildingCode} · {tx.roomCode}
                                      </span>
                                    )}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {tx.payerName || tx.tenantName || tx.accountName || '—'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 pr-3 align-middle max-w-xs">
                                  <p className="truncate text-slate-700 dark:text-slate-300" title={tx.referenceText || ''}>
                                    {tx.referenceText || '—'}
                                  </p>
                                </td>
                                <td className="py-3.5 pr-3 align-middle text-right font-bold tabular-nums whitespace-nowrap">
                                  <span className={direction === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                    {direction === 'IN' ? '+' : '-'}
                                    {tx.amountVnd.toLocaleString('vi-VN')} đ
                                  </span>
                                </td>
                                <td className="py-3.5 pr-3 align-middle whitespace-nowrap">
                                  {tx.invoiceCode ? (
                                    <button
                                      type="button"
                                      onClick={() => handleInspectTransactionInvoice(tx)}
                                      className="inline-flex items-center gap-1 font-mono font-bold text-brand-primary hover:underline"
                                    >
                                      <span>{tx.invoiceCode}</span>
                                      <ExternalLink className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setActiveModule('invoices')}
                                      className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
                                    >
                                      Chưa gán · Đối soát
                                    </button>
                                  )}
                                </td>
                                <td className="py-3.5 align-middle text-right whitespace-nowrap">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ring-1 ring-inset ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {/* 6. FINANCE & CASHBOOK LEDGER */}
          {moduleId === 'finance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Tổng thu kỳ {formatPeriodDisplay(selectedPeriod)}
                  </span>
                  <div className="mt-1 text-lg font-bold text-emerald-600 tabular-nums">
                    +{financeSummary.totalIncomeVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Tổng chi kỳ {formatPeriodDisplay(selectedPeriod)}
                  </span>
                  <div className="mt-1 text-lg font-bold text-rose-600 tabular-nums">
                    -{financeSummary.totalExpenseVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Dòng tiền ròng (Net Cashflow)
                  </span>
                  <div
                    className={`mt-1 text-lg font-bold tabular-nums ${
                      financeSummary.netCashflowVnd >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {financeSummary.netCashflowVnd >= 0 ? '+' : ''}
                    {financeSummary.netCashflowVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
                {ledgerEntries.length === 0 ? (
                  <div className="py-8 text-center space-y-1.5">
                    <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Chưa có phiếu thu / chi trong kỳ{' '}
                      {formatPeriodDisplay(selectedPeriod)}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Ghi nhận các khoản thu chi phát sinh để quản lý dòng tiền
                      chuẩn xác trên PostgreSQL.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Mã phiếu</th>
                          <th className="pb-3">Loại</th>
                          <th className="pb-3">Hạng mục</th>
                          <th className="pb-3">Diễn giải</th>
                          <th className="pb-3">Số tiền</th>
                          <th className="pb-3">Người ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ledgerEntries.map((e) => (
                          <tr key={e.id}>
                            <td className="py-3 font-mono font-bold">
                              {e.entryCode}
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  e.entryType === 'INCOME'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {e.entryType === 'INCOME'
                                  ? 'Phiếu thu'
                                  : 'Phiếu chi'}
                              </span>
                            </td>
                            <td className="py-3 font-semibold">{e.category}</td>
                            <td className="py-3 text-slate-600 dark:text-slate-300">
                              {e.description}
                            </td>
                            <td
                              className={`py-3 font-bold tabular-nums ${
                                e.entryType === 'INCOME'
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {e.entryType === 'INCOME' ? '+' : '-'}
                              {e.amountVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 text-slate-500 font-mono text-[11px]">
                              {e.recordedBy}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. REPORTS & ANALYTICS */}
          {moduleId === 'reports' && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-primary" />
                  Báo cáo hiệu suất kinh doanh kỳ{' '}
                  {formatPeriodDisplay(selectedPeriod)}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="pb-3">Tòa nhà</th>
                      <th className="pb-3">Tổng phòng</th>
                      <th className="pb-3">Đang thuê</th>
                      <th className="pb-3">Tỷ lệ lấp đầy</th>
                      <th className="pb-3">Tiền thuê HĐ</th>
                      <th className="pb-3">Đã lập hóa đơn</th>
                      <th className="pb-3">Thực thu</th>
                      <th className="pb-3">Công nợ còn lại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reportBreakdown.map((b) => (
                      <tr key={b.buildingId}>
                        <td className="py-3 font-bold">
                          {b.buildingCode} — {b.buildingName}
                        </td>
                        <td className="py-3 tabular-nums">{b.totalRooms}</td>
                        <td className="py-3 tabular-nums font-semibold text-brand-primary">
                          {b.occupiedRooms}
                        </td>
                        <td className="py-3 tabular-nums font-bold">
                          {b.occupancyRatePercent.toFixed(1)}%
                        </td>
                        <td className="py-3 tabular-nums">
                          {b.contractedRentVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3 tabular-nums">
                          {b.invoicedVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3 tabular-nums font-bold text-emerald-600">
                          {b.collectedVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td
                          className={`py-3 tabular-nums font-bold ${
                            b.receivableVnd > 0
                              ? 'text-rose-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {b.receivableVnd.toLocaleString('vi-VN')} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: 6-STEP CONTRACT CREATION WIZARD */}
      {isContractModalOpen && (
        <ContractCreationWizardModal
          isOpen={isContractModalOpen}
          preselectedRoomId={ctRoomId || undefined}
          preselectedReservationId={ctReservationId || undefined}
          onClose={() => setIsContractModalOpen(false)}
          onSuccess={async () => {
            setIsContractModalOpen(false);
            await Promise.all([loadModuleData(), refreshPortfolio()]);
          }}
        />
      )}

      {/* MODAL 2: CREATE RESERVATION */}
      {isReservationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                Tạo phiếu giữ chỗ phòng &amp; Nhận cọc
              </h3>
              <button
                type="button"
                onClick={() => setIsReservationModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateReservation} className="p-5 space-y-4">
              {resvError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {resvError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Phòng giữ chỗ *
                </label>
                <select
                  value={resvRoomId}
                  onChange={(e) => setResvRoomId(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  required
                >
                  <option value="">— Chọn phòng —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.buildingCode} · {r.code} ({r.occupancyStatus})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Tên khách hàng *
                  </label>
                  <input
                    type="text"
                    value={resvCustomerName}
                    onChange={(e) => setResvCustomerName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số điện thoại *
                  </label>
                  <input
                    type="text"
                    value={resvCustomerPhone}
                    onChange={(e) => setResvCustomerPhone(e.target.value)}
                    placeholder="0912345678"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Tiền giữ chỗ (VND)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100000}
                    value={resvHoldAmountVnd}
                    onChange={(e) =>
                      setResvHoldAmountVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Ngày dự kiến vào
                  </label>
                  <input
                    type="date"
                    value={resvExpectedMoveIn}
                    onChange={(e) => setResvExpectedMoveIn(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số ngày giữ chỗ
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={resvHoldDays}
                    onChange={(e) =>
                      setResvHoldDays(parseInt(e.target.value, 10) || 7)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Ghi chú
                </label>
                <input
                  type="text"
                  value={resvNotes}
                  onChange={(e) => setResvNotes(e.target.value)}
                  placeholder="Yêu cầu dọn dẹp, lắp thêm rèm..."
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReservationModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    isSavingResv ||
                    !resvRoomId ||
                    !resvCustomerName ||
                    !resvCustomerPhone
                  }
                  className="px-4 py-2 text-xs font-bold bg-amber-600 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingResv && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Tạo phiếu giữ chỗ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DEPOSIT REFUND / DEDUCTION */}
      {isDepositRefundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Xử lý hoàn cọc / Khấu trừ
              </h3>
              <button
                type="button"
                onClick={() => setIsDepositRefundModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDepositRefundSubmit} className="p-5 space-y-4">
              {depError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {depError}
                </div>
              )}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl text-xs space-y-1">
                <div className="text-slate-500">Số dư cọc khả dụng:</div>
                <div className="text-base font-bold text-emerald-600 tabular-nums">
                  {depTotalAmountVnd.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số tiền hoàn trả (VND)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={depTotalAmountVnd}
                    step={100000}
                    value={depRefundVnd}
                    onChange={(e) =>
                      setDepRefundVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số tiền khấu trừ (VND)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={depTotalAmountVnd}
                    step={100000}
                    value={depDeductionVnd}
                    onChange={(e) =>
                      setDepDeductionVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
              </div>
              {depDeductionVnd > 0 && (
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Lý do khấu trừ *
                  </label>
                  <input
                    type="text"
                    value={depDeductionReason}
                    onChange={(e) => setDepDeductionReason(e.target.value)}
                    placeholder="VD: Trừ tiền điện nước kỳ cuối hoặc hư hỏng thiết bị"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
              )}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositRefundModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingDep}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingDep && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Xác nhận xử lý cọc</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EXTEND CONTRACT */}
      {isExtendModalOpen && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-brand-primary" />
                Gia hạn hợp đồng {selectedContract.contractCode}
              </h3>
              <button
                type="button"
                onClick={() => setIsExtendModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleExtendSubmit} className="p-5 space-y-4">
              {lifecycleError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {lifecycleError}
                </div>
              )}
              <div className="text-xs text-slate-500">
                Phòng: <b>{selectedContract.roomCode}</b> · Khách:{' '}
                <b>{selectedContract.tenantName}</b> · Hạn cũ:{' '}
                <b>{selectedContract.endDate}</b>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Ngày kết thúc mới *
                </label>
                <input
                  type="date"
                  value={extNewEndDate}
                  onChange={(e) => setExtNewEndDate(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Giá thuê mới (để trống nếu giữ nguyên)
                </label>
                <input
                  type="number"
                  min={500000}
                  step={100000}
                  value={extNewRentVnd}
                  onChange={(e) =>
                    setExtNewRentVnd(
                      e.target.value ? parseInt(e.target.value, 10) : ''
                    )
                  }
                  placeholder={`Hiện tại: ${selectedContract.monthlyRentVnd.toLocaleString(
                    'vi-VN'
                  )} đ`}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExtendModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingLifecycle || !extNewEndDate}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingLifecycle && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Xác nhận gia hạn</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: TRANSFER ROOM */}
      {isTransferModalOpen && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-brand-primary" />
                Chuyển phòng {selectedContract.roomCode}
              </h3>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
              {lifecycleError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {lifecycleError}
                </div>
              )}
              <div className="text-xs text-slate-500">
                Khách thuê: <b>{selectedContract.tenantName}</b>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Chọn phòng đích chuyển đến *
                </label>
                <select
                  value={transferTargetRoomId}
                  onChange={(e) => setTransferTargetRoomId(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  required
                >
                  <option value="">— Chọn phòng trống —</option>
                  {rooms
                    .filter((r) => r.id !== selectedContract.roomId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.buildingCode} · {r.code} ({r.occupancyStatus})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Giá thuê mới tại phòng mới (để trống nếu giữ nguyên)
                </label>
                <input
                  type="number"
                  min={500000}
                  step={100000}
                  value={transferNewRentVnd}
                  onChange={(e) =>
                    setTransferNewRentVnd(
                      e.target.value ? parseInt(e.target.value, 10) : ''
                    )
                  }
                  placeholder={`Giá cũ: ${selectedContract.monthlyRentVnd.toLocaleString(
                    'vi-VN'
                  )} đ`}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingLifecycle || !transferTargetRoomId}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingLifecycle && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Xác nhận chuyển phòng</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: HANDOVER ROOM MODAL */}
      {isHandoverModalOpen && selectedHandoverContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div data-testid="contract-handover-modal" className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Bàn giao phòng &amp; Kích hoạt hợp đồng
              </h3>
              <button
                type="button"
                onClick={() => setIsHandoverModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleHandoverSubmit} className="p-5 space-y-4 text-xs">
              {handoverError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {handoverError}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
                <div>Hợp đồng: <b className="font-mono">{selectedHandoverContract.contractCode}</b></div>
                <div>Phòng: <b>{selectedHandoverContract.buildingCode} · {selectedHandoverContract.roomCode}</b></div>
                <div>Khách thuê: <b>{selectedHandoverContract.tenantName}</b> ({selectedHandoverContract.tenantPhone})</div>
              </div>

              {/* C4-HAND-01 Deposit Policy & Override Check */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-600 dark:text-slate-400">Tiền cọc quy định:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {Number(selectedHandoverContract.depositVnd || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <label className="flex items-start gap-2 cursor-pointer text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      data-testid="chk-handover-partial-deposit"
                      checked={handoverAllowPartialDeposit}
                      onChange={(e) => setHandoverAllowPartialDeposit(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-brand-primary focus:ring-brand-primary"
                    />
                    <span>
                      Phê duyệt bàn giao khi còn nợ tiền cọc (ALLOW_PARTIAL_WITH_APPROVAL)
                    </span>
                  </label>
                  {handoverAllowPartialDeposit && (
                    <div className="mt-2 pl-5 space-y-1">
                      <label className="block text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">
                        Lý do phê duyệt nợ cọc *
                      </label>
                      <input
                        type="text"
                        data-testid="input-handover-override-reason"
                        required={handoverAllowPartialDeposit}
                        value={handoverDepositOverrideReason}
                        onChange={(e) => setHandoverDepositOverrideReason(e.target.value)}
                        placeholder="Ví dụ: Khách hẹn thanh toán cọc kèm tiền phòng kỳ 1"
                        className="w-full p-2 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Người bàn giao (Đại diện) *
                  </label>
                  <input
                    type="text"
                    required
                    value={handoverBy}
                    onChange={(e) => setHandoverBy(e.target.value)}
                    placeholder="Tên/Email đại diện"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Người nhận bàn giao (Khách thuê) *
                  </label>
                  <input
                    type="text"
                    required
                    value={handoverTo}
                    onChange={(e) => setHandoverTo(e.target.value)}
                    placeholder="Tên khách nhận phòng"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Chỉ số công tơ điện ban đầu (kWh) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={handoverKwh}
                  onChange={(e) => setHandoverKwh(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ví dụ: 105.5"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Chỉ số đồng hồ nước ban đầu (m³) (Tùy chọn)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={handoverWaterM3}
                  onChange={(e) => setHandoverWaterM3(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ví dụ: 12.0"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Ngày nhận phòng thực tế *
                </label>
                <input
                  type="date"
                  required
                  value={handoverMoveInDate}
                  onChange={(e) => setHandoverMoveInDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Ghi chú hiện trạng bàn giao (chìa khóa, thẻ từ, trang thiết bị)
                </label>
                <textarea
                  rows={2}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="Ví dụ: Bàn giao 2 chìa khóa cơ, 1 remote máy lạnh, tường không trầy xước..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300">
                Xác nhận bàn giao sẽ tự động chuyển hợp đồng sang <b>Đang hiệu lực (ACTIVE)</b> và phòng sang <b>Đang thuê (OCCUPIED)</b>.
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsHandoverModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingHandover}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSavingHandover ? 'Đang kích hoạt...' : 'Xác nhận bàn giao & Kích hoạt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: TERMINATE CONTRACT */}
      {isTerminateModalOpen && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Thanh lý hợp đồng {selectedContract.contractCode}
              </h3>
              <button
                type="button"
                onClick={() => setIsTerminateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleTerminateSubmit} className="p-5 space-y-4">
              {lifecycleError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {lifecycleError}
                </div>
              )}
              <div className="text-xs text-slate-500">
                Khách thuê: <b>{selectedContract.tenantName}</b> · Phòng:{' '}
                <b>{selectedContract.roomCode}</b>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Lý do thanh lý *
                </label>
                <input
                  type="text"
                  value={termReason}
                  onChange={(e) => setTermReason(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Trạng thái phòng sau thanh lý
                </label>
                <select
                  value={termRoomNextStatus}
                  onChange={(e) =>
                    setTermRoomNextStatus(
                      e.target.value as 'AVAILABLE' | 'MAINTENANCE'
                    )
                  }
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                >
                  <option value="AVAILABLE">Phòng trống sẵn sàng (AVAILABLE)</option>
                  <option value="MAINTENANCE">Cần dọn dẹp / Bảo trì (MAINTENANCE)</option>
                </select>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTerminateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingLifecycle}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingLifecycle && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Xác nhận thanh lý</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: MANUAL METER READING */}
      {isManualReadingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Ghi chỉ số điện thủ công (Chốt tay)
              </h3>
              <button
                type="button"
                onClick={() => setIsManualReadingModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualReadingSubmit} className="p-5 space-y-4">
              {manualError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {manualError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Chọn phòng *
                </label>
                <select
                  value={manualRoomId}
                  onChange={(e) => setManualRoomId(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  required
                >
                  <option value="">— Chọn phòng —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.buildingCode} · {r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Chỉ số tích lũy mới (kWh) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualKwh}
                  onChange={(e) => setManualKwh(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Lý do can thiệp / ghi tay *
                </label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="VD: Công tơ mất sóng Wi-Fi, kiểm tra thực tế"
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  required
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualReadingModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual || !manualRoomId}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingManual && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Lưu chỉ số</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: CREATE LEDGER ENTRY */}
      {isLedgerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-brand-primary" />
                Ghi bút toán sổ quỹ tiền mặt / chuyển khoản
              </h3>
              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLedgerEntry} className="p-5 space-y-4">
              {lgError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {lgError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Loại bút toán
                  </label>
                  <select
                    value={lgType}
                    onChange={(e) =>
                      setLgType(e.target.value as 'INCOME' | 'EXPENSE')
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="INCOME">Phiếu thu (+)</option>
                    <option value="EXPENSE">Phiếu chi (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Tòa nhà
                  </label>
                  <select
                    value={lgBuildingId}
                    onChange={(e) => setLgBuildingId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">Chung toàn tổ chức</option>
                    {activeBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Danh mục
                  </label>
                  <input
                    type="text"
                    value={lgCategory}
                    onChange={(e) => setLgCategory(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số tiền nguyên (VND) *
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={10000}
                    value={lgAmountVnd}
                    onChange={(e) =>
                      setLgAmountVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Diễn giải chi tiết *
                </label>
                <input
                  data-testid="input-ledger-description"
                  type="text"
                  value={lgDescription}
                  onChange={(e) => setLgDescription(e.target.value)}
                  placeholder="VD: Thu tiền vệ sinh & phí quản lý tòa LK01"
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  required
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLedgerModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  data-testid="submit-create-ledger"
                  type="submit"
                  disabled={isSavingLg}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingLg && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Lưu bút toán sổ quỹ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Payment Modal */}
      {selectedInvoice && (() => {
        const modalRemaining = Math.max(0, selectedInvoice.totalAmountVnd - selectedInvoice.paidAmountVnd);
        const modalStatus = getInvoiceStatus(
          selectedInvoice.status,
          modalRemaining,
          selectedInvoice.paidAmountVnd,
          selectedInvoice.dueDate,
        );
        return (
          <Dialog.Root
            open={isInvoicePaymentModalOpen}
            onOpenChange={(open) => {
              if (!open && !isSavingInvoicePay) setIsInvoicePaymentModalOpen(false);
            }}
          >
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-[2px]" />
              <Dialog.Viewport className="fixed inset-0 z-[121] flex items-end justify-center sm:items-center sm:p-4">
                <Dialog.Popup
                  from="bottom"
                  data-testid="invoice-payment-modal"
                  aria-busy={isSavingInvoicePay}
                  className="invoice-payment-dialog flex max-h-[calc(100dvh-0.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
                >
                  <div className="invoice-payment-header flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                    <div className="min-w-0">
                      <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white flex items-start gap-2">
                        <CreditCard className="w-4 h-4 shrink-0 text-brand-primary mt-0.5" />
                        <span className="min-w-0 break-words">
                          {modalRemaining > 0 || invoicePaymentCommittedId ? 'Thu tiền hóa đơn' : 'Chi tiết hóa đơn'} — {selectedInvoice.invoiceCode}
                        </span>
                      </Dialog.Title>
                      <Dialog.Description className="mt-1 text-xs text-slate-500">
                        Ghi nhận đúng số tiền thực nhận và phương thức thanh toán.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close
                      data-testid="btn-close-invoice-payment-modal"
                      disabled={isSavingInvoicePay}
                      aria-label="Đóng cửa sổ thu tiền"
                      className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </Dialog.Close>
                  </div>
                  <form onSubmit={handleInvoicePaymentSubmit} className="invoice-payment-form min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                    <div className="space-y-4">
                      {invoicePayError && (
                        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                          {invoicePayError}
                        </div>
                      )}
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                        <section className="space-y-4" aria-labelledby="invoice-detail-heading">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 id="invoice-detail-heading" className="text-sm font-bold text-slate-900 dark:text-white">Chi tiết hóa đơn</h3>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  Kỳ {selectedInvoice.periodKey.slice(5, 7)}/{selectedInvoice.periodKey.slice(0, 4)} · Hạn thanh toán {selectedInvoice.dueDate.split('-').reverse().join('/')}
                                </p>
                              </div>
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${modalStatus.className}`}>
                                {modalStatus.label}
                              </span>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                              <div>
                                <dt className="text-slate-500">Phòng / Tòa</dt>
                                <dd className="mt-0.5 font-bold">{selectedInvoice.roomCode} · {selectedInvoice.buildingCode}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Khách thuê</dt>
                                <dd className="mt-0.5 font-bold">{selectedInvoice.tenantName || '—'}</dd>
                              </div>
                            </dl>
                            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                              {invoiceHandoverLoading && !invoiceDetail ? (
                                <p role="status" className="text-xs text-slate-500">Đang tải chi tiết hóa đơn…</p>
                              ) : invoiceBreakdown.length > 0 ? (
                                <div className="space-y-2 text-xs">
                                  {invoiceBreakdown.map(row => (
                                    <div key={row.label} className="flex items-center justify-between gap-4">
                                      <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
                                      <strong className="tabular-nums">{row.amountVnd.toLocaleString('vi-VN')} đ</strong>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">Chưa có chi tiết khoản thu.</p>
                              )}
                            </div>
                            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Tổng hóa đơn</span>
                                <strong className="tabular-nums">{selectedInvoice.totalAmountVnd.toLocaleString('vi-VN')} đ</strong>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Đã thu</span>
                                <strong className="tabular-nums text-emerald-600">{selectedInvoice.paidAmountVnd.toLocaleString('vi-VN')} đ</strong>
                              </div>
                              <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                                <span className="font-semibold">Còn phải thu</span>
                                <strong className={`text-lg tabular-nums ${modalRemaining > 0 ? 'text-brand-primary' : 'text-emerald-600'}`}>
                                  {modalRemaining.toLocaleString('vi-VN')} đ
                                </strong>
                              </div>
                            </div>
                          </div>
                          {invoiceDetail?.payments?.length > 0 && (
                            <details open={modalRemaining <= 0} className="rounded-xl border border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
                              <summary className="cursor-pointer font-semibold">Lịch sử thanh toán ({invoiceDetail.payments.length})</summary>
                              <div className="mt-3 space-y-2">
                                {invoiceDetail.payments.map((payment: any) => (
                                  <div key={payment.id} className="flex justify-between gap-3 border-t border-slate-100 pt-2 first:border-0 first:pt-0 dark:border-slate-800">
                                    <span>
                                      <b>{formatPaymentProviderLabel(payment.providerId)}</b>
                                      <small className="mt-0.5 block text-slate-500">{new Date(payment.verifiedAt).toLocaleString('vi-VN')}</small>
                                    </span>
                                    <strong className="tabular-nums text-emerald-600">+{Number(payment.amountVnd).toLocaleString('vi-VN')} đ</strong>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </section>

                        <section className="space-y-4" aria-labelledby="invoice-payment-heading">
                          <div>
                            <h3 id="invoice-payment-heading" className="text-sm font-bold text-slate-900 dark:text-white">Ghi nhận thanh toán</h3>
                            <p className="mt-0.5 text-xs text-slate-500">Chọn cách thu tiền và kiểm tra số tiền trước khi xác nhận.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Phương thức thanh toán chính">
                            <AnimatedButton
                              type="button"
                              aria-pressed={invoicePayMethod === 'MANUAL_CASH'}
                              onClick={() => setInvoicePayMethod('MANUAL_CASH')}
                              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold ${
                                invoicePayMethod === 'MANUAL_CASH'
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <Banknote size={17} />Tiền mặt
                            </AnimatedButton>
                            <AnimatedButton
                              type="button"
                              aria-pressed={invoicePayMethod === 'SEPAY'}
                              onClick={() => setInvoicePayMethod('SEPAY')}
                              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold ${
                                invoicePayMethod === 'SEPAY'
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <QrCode size={17} />Quét QR
                            </AnimatedButton>
                          </div>
                          <select id="invoice-payment-method" aria-label="Phương thức thanh toán" value={invoicePayMethod} onChange={(e) => setInvoicePayMethod(e.target.value as any)} className="sr-only">
                            <option value="MANUAL_CASH">Tiền mặt (Thu trực tiếp)</option>
                            <option value="MANUAL_TRANSFER">Chuyển khoản ngân hàng</option>
                            <option value="SEPAY">SePay (Quét mã VietQR)</option>
                            <option value="PAYOS">PayOS (Cổng thanh toán)</option>
                          </select>
                          <div>
                            <label htmlFor="invoice-payment-amount" className="mb-1.5 block text-xs font-semibold">Số tiền thu</label>
                            <MoneyInput
                              id="invoice-payment-amount"
                              min={1}
                              value={invoicePayAmount}
                              max={modalRemaining}
                              onChange={setInvoicePayAmount}
                              className="min-h-12 bg-slate-50 text-sm font-bold text-brand-primary dark:bg-slate-800"
                              required
                            />
                          </div>

                          {invoicePayMethod === 'SEPAY' && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                              {invoiceQrUrl && invoiceVietQr ? (
                                <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
                                  <div className="mx-auto w-full max-w-[210px] rounded-lg border border-slate-200 bg-white p-2">
                                    <img src={invoiceQrUrl} alt={`Mã VietQR thanh toán hóa đơn ${selectedInvoice.invoiceCode}`} className="aspect-square w-full object-contain" />
                                  </div>
                                  <dl className="min-w-0 space-y-2 text-xs">
                                    <div><dt className="text-slate-500">Ngân hàng</dt><dd className="font-bold">{invoiceVietQr.bankCode}</dd></div>
                                    <div><dt className="text-slate-500">Chủ tài khoản</dt><dd className="font-bold break-words">{invoiceVietQr.accountName}</dd></div>
                                    <div>
                                      <dt className="text-slate-500">Số tài khoản</dt>
                                      <dd className="flex items-center gap-1.5 font-bold">
                                        <span className="break-all">{invoiceVietQr.accountNumber}</span>
                                        <button type="button" aria-label="Sao chép số tài khoản" title="Sao chép số tài khoản" onClick={() => void navigator.clipboard.writeText(invoiceVietQr.accountNumber)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 dark:text-blue-300"><Copy size={14} /></button>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-slate-500">Nội dung chuyển khoản</dt>
                                      <dd className="flex items-center gap-1.5 font-bold">
                                        <span className="break-all">{invoiceVietQr.transferContent}</span>
                                        <button type="button" aria-label="Sao chép nội dung chuyển khoản" title="Sao chép nội dung chuyển khoản" onClick={() => void navigator.clipboard.writeText(invoiceVietQr.transferContent)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 dark:text-blue-300"><Copy size={14} /></button>
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              ) : (
                                <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                                  <AlertCircle size={16} className="shrink-0" />
                                  <p>Chưa có tài khoản SePay đã xác minh cho tòa nhà này. Cấu hình tài khoản nhận tiền trong Cài đặt trước khi quét QR.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {invoiceHandoverLoading && <p role="status" className="text-xs text-slate-500">Đang kiểm tra điều kiện bàn giao…</p>}
                          {invoiceHandover && (invoiceHandover.electricRequired || invoiceHandover.waterRequired) && invoicePayAmount >= modalRemaining && (
                            <fieldset className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                              <legend className="px-1 text-xs font-bold">Chỉ số đầu kỳ để bàn giao tự động</legend>
                              {invoiceHandover.electricRequired && (
                                <label className="block text-xs font-semibold">
                                  Chỉ số điện (kWh)
                                  <input type="number" min="0" step="any" required value={invoiceElectricStart} onChange={e => { setInvoiceElectricStart(e.target.value); setInvoicePayError(null); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                                </label>
                              )}
                              {invoiceHandover.waterRequired && (
                                <label className="block text-xs font-semibold">
                                  Chỉ số nước (m³)
                                  <input type="number" min="0" step="any" required value={invoiceWaterStart} onChange={e => { setInvoiceWaterStart(e.target.value); setInvoicePayError(null); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                                </label>
                              )}
                              <p className="text-xs text-slate-600 dark:text-slate-300">Thu đủ hóa đơn sẽ kích hoạt hợp đồng, người ở và trạng thái phòng trong cùng giao dịch.</p>
                            </fieldset>
                          )}

                          <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                            <input
                              ref={invoiceProofInput}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              aria-label="Ảnh chứng từ thanh toán"
                              onChange={e => {
                                const file = e.target.files?.[0] || null;
                                e.target.value = '';
                                if (file && file.size > 8 * 1024 * 1024) {
                                  setInvoicePayError('Ảnh chứng từ phải nhỏ hơn 8 MB.');
                                  return;
                                }
                                setInvoiceProof(file);
                                setInvoicePayError(null);
                              }}
                            />
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold">Ảnh chứng từ <span className="font-normal text-slate-500">(nếu có)</span></p>
                                <p className="truncate text-[11px] text-slate-500">{invoiceProof?.name || 'JPEG, PNG hoặc WebP · tối đa 8 MB'}</p>
                              </div>
                              <AnimatedButton type="button" onClick={() => invoiceProofInput.current?.click()} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-blue-700 dark:border-slate-700 dark:text-blue-300">
                                <ImagePlus size={14} />{invoiceProof ? 'Đổi ảnh' : 'Tải ảnh'}
                              </AnimatedButton>
                            </div>
                            {invoicePaymentProofs.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {invoicePaymentProofs.map((proof, index) => (
                                  <a key={proof.id} href={proof.proofUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    <ExternalLink size={12} />Chứng từ {index + 1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold">Ghi chú / Mã giao dịch tham chiếu</label>
                            <input
                              type="text"
                              placeholder="VD: GD-123456 hoặc Thu tiền đợt 1"
                              value={invoicePayRef}
                              onChange={(e) => setInvoicePayRef(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                        </section>
                      </div>
                    </div>
                    <div className="invoice-payment-actions sticky bottom-0 -mx-4 mt-5 flex gap-2 border-t border-slate-100 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-slate-800 dark:bg-[#111827]/95 sm:-mx-5 sm:px-5 sm:pb-0">
                      <AnimatedButton
                        type="button"
                        onClick={() => setIsInvoicePaymentModalOpen(false)}
                        disabled={isSavingInvoicePay}
                        className="min-h-11 flex-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Đóng
                      </AnimatedButton>
                      {(modalRemaining > 0 || Boolean(invoicePaymentCommittedId)) && (
                        <AnimatedButton
                          type="submit"
                          disabled={isSavingInvoicePay || invoiceHandoverLoading}
                          className="min-h-11 flex-[1.45] rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isSavingInvoicePay && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {isSavingInvoicePay ? (
                            <ShimmeringText
                              text={invoicePaymentCommittedId ? 'Đang lưu chứng từ...' : 'Đang ghi nhận...'}
                              color="#dbeafe"
                              shimmeringColor="#ffffff"
                            />
                          ) : (
                            <span>{invoicePaymentCommittedId ? 'Lưu chứng từ' : 'Xác nhận thu tiền'}</span>
                          )}
                        </AnimatedButton>
                      )}
                    </div>
                  </form>
                </Dialog.Popup>
              </Dialog.Viewport>
            </Dialog.Portal>
          </Dialog.Root>
        );
      })()}

      {/* Legacy Data Import Wizard Modal (C4-IMPORT-01/02) */}
      <LegacyImportWizardModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={async () => {
          await loadModuleData();
          if (fetchOccupancyData) await fetchOccupancyData();
        }}
      />

      {/* 5-Tab Hunonic Cloud Configuration Modal (HUN-02) */}
      <HunonicSettingsModal
        isOpen={isHunonicModalOpen}
        onClose={() => setIsHunonicModalOpen(false)}
        onSyncTriggered={() => loadModuleData()}
      />
    </div>
  );
};
