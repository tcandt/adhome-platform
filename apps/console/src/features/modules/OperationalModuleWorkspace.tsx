import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  Edit3,
  FileSignature,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
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
import { HunonicSettingsModal } from './modals/HunonicSettingsModal';
import { ActionMenu } from '@/shared/ui/ActionMenu';

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

  // Contract Status Filter & Handover Modal state
  const [contractStatusFilter, setContractStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'DRAFT' | 'EXPIRING' | 'TERMINATED'
  >('ALL');
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [selectedHandoverContract, setSelectedHandoverContract] = useState<any>(null);
  const [handoverKwh, setHandoverKwh] = useState<number | ''>('');
  const [handoverWaterM3, setHandoverWaterM3] = useState<number | ''>('');
  const [handoverMoveInDate, setHandoverMoveInDate] = useState(getTodayIsoVn());
  const [handoverBy, setHandoverBy] = useState('');
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
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

  const openContractModal = () => {
    const candidateRoom =
      rooms.find((r) => !r.activeContract) || rooms[0] || null;
    setCtRoomId(candidateRoom?.id || '');
    setCtReservationId(null);
    setIsContractModalOpen(true);
  };

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
        return;
      }
      setIsManualReadingModalOpen(false);
      await loadModuleData();
    } catch {
      setManualError('Lỗi kết nối máy chủ.');
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
        return;
      }
      setIsLedgerModalOpen(false);
      setLgDescription('');
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setLgError('Lỗi kết nối máy chủ.');
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
    ? (payload.contracts as Array<{
        id: string;
        contractCode: string;
        buildingCode: string;
        roomId: string;
        roomCode: string;
        tenantName: string;
        tenantPhone: string;
        startDate: string;
        endDate: string;
        monthlyRentVnd: number;
        depositVnd: number;
        collectedDepositVnd?: number;
        remainingDepositVnd?: number;
        electricRateVnd: number;
        waterBillingMethod: string;
        waterRateVnd: number;
        status: string;
      }>)
    : [];

  const displayedContracts = useMemo(() => {
    if (contractStatusFilter === 'ALL') return contracts;
    if (contractStatusFilter === 'ACTIVE')
      return contracts.filter(
        (c) => c.status === 'ACTIVE' || c.status === 'EXTENDED'
      );
    if (contractStatusFilter === 'DRAFT')
      return contracts.filter((c) => c.status === 'DRAFT');
    if (contractStatusFilter === 'EXPIRING')
      return contracts.filter((c) => c.status === 'EXPIRING');
    if (contractStatusFilter === 'TERMINATED')
      return contracts.filter(
        (c) => c.status === 'TERMINATED' || c.status === 'EXPIRED'
      );
    return contracts;
  }, [contracts, contractStatusFilter]);

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
        totalAmountVnd: number;
        paidAmountVnd: number;
        status: string;
      }>)
    : [];

  const paymentProviders = Array.isArray(payload?.providers)
    ? (payload.providers as Array<{
        providerId: string;
        displayName: string;
        isEnabled: boolean;
        status: string;
        capabilities: string[];
      }>)
    : [];

  const transactions = Array.isArray(payload?.transactions)
    ? (payload.transactions as Array<{
        id: string;
        providerId: string;
        externalTxId: string;
        amountVnd: number;
        payerName: string | null;
        referenceText: string | null;
        reconcileState: string;
        invoiceCode: string | null;
        verifiedAt: string;
      }>)
    : [];

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
      className="space-y-4"
      data-testid={`console-module-workspace-${moduleId}`}
    >
      {/* MODULE TOOLBAR + CONDITIONAL DYNAMIC PERIOD SELECTOR */}
      <div className="p-4 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {currentNavConfig.label}
          </h2>
          <p className="text-xs text-slate-500">
            {currentNavConfig.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentNavConfig.hasPeriodToolbar && (
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
          )}

          <button
            type="button"
            onClick={() => void loadModuleData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Tạo phiếu giữ chỗ</span>
            </button>
          )}

          {moduleId === 'contracts' && hasCapability('canManageContracts') && (
            <button
              type="button"
              data-testid="btn-open-create-contract"
              onClick={openContractModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand-primary hover:bg-brand-hover text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lập hợp đồng mới</span>
            </button>
          )}

          {moduleId === 'settlements' && (
            <>
              <button
                type="button"
                data-testid="btn-hunonic-sync"
                onClick={handleSyncHunonic}
                disabled={isSyncingHunonic}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-sm disabled:opacity-50"
              >
                <Zap
                  className={`w-3.5 h-3.5 ${
                    isSyncingHunonic ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isSyncingHunonic
                    ? 'Đang đồng bộ...'
                    : 'Đồng bộ Hunonic Cloud'}
                </span>
              </button>
              <button
                type="button"
                data-testid="btn-open-manual-reading"
                onClick={() => {
                  setManualRoomId(rooms[0]?.id || '');
                  setManualKwh(150);
                  setManualReason('Chốt chỉ số chu kỳ');
                  setManualError(null);
                  setIsManualReadingModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Ghi chỉ số tay</span>
              </button>
            </>
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
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
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
              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
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

          {/* 2. CONTRACTS */}
          {moduleId === 'contracts' && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
              {contracts.length === 0 ? (
                <div className="py-10 text-center space-y-2.5">
                  <FileSignature className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chưa có hợp đồng thuê trong phạm vi tòa nhà đang chọn
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Lập hợp đồng mới từ danh sách phòng và hồ sơ khách thuê để
                    tự động cập nhật trạng thái lưu trú sang{' '}
                    <code>OCCUPIED</code> trên PostgreSQL.
                  </p>
                </div>
              ) : (
                <>
                  {/* CONTRACTS STATUS FILTER BAR */}
                  <div className="relative mb-4">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar scroll-smooth">
                      {[
                        { id: 'ALL', label: 'Tất cả' },
                        { id: 'ACTIVE', label: 'Đang hiệu lực' },
                        { id: 'DRAFT', label: 'Chờ bàn giao' },
                        { id: 'EXPIRING', label: 'Sắp hết hạn' },
                        { id: 'TERMINATED', label: 'Đã thanh lý' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setContractStatusFilter(tab.id as any)}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                            contractStatusFilter === tab.id
                              ? 'bg-brand-primary text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-6 bg-gradient-to-l from-white dark:from-[#111827] to-transparent md:hidden" />
                  </div>

                  {/* Mobile Contracts Cards */}
                  <div className="block md:hidden space-y-3">
                    {displayedContracts.map((c) => (
                      <div
                        key={c.id}
                        data-testid={`contract-mobile-card-${c.contractCode}`}
                        className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2.5 text-xs shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-brand-primary" />
                            {c.buildingCode} · {c.roomCode}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.status === 'ACTIVE' || c.status === 'EXTENDED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : c.status === 'DRAFT'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : c.status === 'EXPIRING'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {c.status === 'ACTIVE' || c.status === 'EXTENDED'
                              ? 'Đang hiệu lực'
                              : c.status === 'DRAFT'
                              ? 'Chờ bàn giao'
                              : c.status === 'EXPIRING'
                              ? 'Sắp hết hạn'
                              : 'Đã thanh lý'}
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                          <FileSignature className="w-3 h-3 text-slate-400" />
                          {c.contractCode}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40 p-2.5 rounded-lg">
                          <div>
                            Khách: <b className="text-slate-900 dark:text-white">{c.tenantName}</b>
                          </div>
                          <div>
                            Giá thuê: <b className="tabular-nums text-slate-900 dark:text-white">{c.monthlyRentVnd.toLocaleString('vi-VN')} đ</b>
                          </div>
                          <div className="col-span-2">
                            Thời hạn: <span className="font-mono">{c.startDate} → {c.endDate}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-slate-600 dark:text-slate-400">
                              Cọc yêu cầu: <b className="text-slate-900 dark:text-white tabular-nums">{c.depositVnd.toLocaleString('vi-VN')} đ</b>
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Đã thu: <span className="text-emerald-600 font-bold tabular-nums">{(c.collectedDepositVnd ?? c.depositVnd).toLocaleString('vi-VN')} đ</span>
                              {c.remainingDepositVnd && c.remainingDepositVnd > 0 ? (
                                <> · Thiếu: <span className="text-rose-500 font-bold tabular-nums">{c.remainingDepositVnd.toLocaleString('vi-VN')} đ</span></>
                              ) : (
                                <> · <span className="text-emerald-600 font-semibold">Đủ</span></>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {c.status === 'DRAFT' && (
                              <button
                                type="button"
                                onClick={() => openHandoverModal(c)}
                                data-testid="btn-open-handover-mobile"
                                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm"
                              >
                                Bàn giao
                              </button>
                            )}
                            {c.status === 'ACTIVE' || c.status === 'EXTENDED' || c.status === 'EXPIRING' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedContract(c);
                                    setExtNewEndDate(computeEndDateIsoVn(c.endDate, 6));
                                    setExtNewRentVnd(c.monthlyRentVnd);
                                    setExtNotes('');
                                    setLifecycleError(null);
                                    setIsExtendModalOpen(true);
                                  }}
                                  className="px-2 py-1 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded"
                                >
                                  Gia hạn
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedContract(c);
                                    setTransferTargetRoomId('');
                                    setTransferNewRentVnd(c.monthlyRentVnd);
                                    setLifecycleError(null);
                                    setIsTransferModalOpen(true);
                                  }}
                                  className="px-2 py-1 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded"
                                >
                                  Đổi phòng
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedContract(c);
                                    setTermReason('Hết hạn hợp đồng');
                                    setTermRoomNextStatus('AVAILABLE');
                                    setLifecycleError(null);
                                    setIsTerminateModalOpen(true);
                                  }}
                                  className="px-2 py-1 text-[10.5px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 rounded"
                                >
                                  Thanh lý
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Contracts Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table
                      data-testid="contracts-table"
                      className="w-full text-left text-xs"
                    >
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Mã hợp đồng</th>
                        <th className="pb-3">Tòa & Phòng</th>
                        <th className="pb-3">Khách đứng tên</th>
                        <th className="pb-3">Thời hạn</th>
                        <th className="pb-3">Giá thuê / Cọc</th>
                        <th className="pb-3">Điện & Nước</th>
                        <th className="pb-3">Trạng thái</th>
                        <th className="pb-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {displayedContracts.map((c) => (
                        <tr key={c.id}>
                          <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">
                            {c.contractCode}
                          </td>
                          <td className="py-3 font-semibold">
                            {c.buildingCode} · {c.roomCode}
                          </td>
                          <td className="py-3">
                            <div className="font-bold">{c.tenantName}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {c.tenantPhone}
                            </div>
                          </td>
                          <td className="py-3 font-mono text-[11px]">
                            {c.startDate} → {c.endDate}
                          </td>
                          <td className="py-3 tabular-nums">
                            <div className="font-bold">
                              {c.monthlyRentVnd.toLocaleString('vi-VN')} đ/th
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Cọc yêu cầu: {c.depositVnd.toLocaleString('vi-VN')} đ
                              {c.collectedDepositVnd !== undefined && (
                                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Đã thu: {c.collectedDepositVnd.toLocaleString('vi-VN')} đ
                                  {c.remainingDepositVnd && c.remainingDepositVnd > 0 ? (
                                    <span className="text-rose-500 font-bold"> (thiếu {c.remainingDepositVnd.toLocaleString('vi-VN')}đ)</span>
                                  ) : (
                                    <span> (đủ)</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-[11px] text-slate-600 dark:text-slate-300">
                            Điện: {c.electricRateVnd.toLocaleString('vi-VN')}đ ·
                            Nước: {c.waterRateVnd.toLocaleString('vi-VN')}đ (
                            {c.waterBillingMethod})
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                c.status === 'ACTIVE' || c.status === 'EXTENDED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : c.status === 'DRAFT'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : c.status === 'EXPIRING'
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {c.status === 'ACTIVE' || c.status === 'EXTENDED'
                                ? 'Đang hiệu lực'
                                : c.status === 'DRAFT'
                                ? 'Chờ bàn giao'
                                : c.status === 'EXPIRING'
                                ? 'Sắp hết hạn'
                                : 'Đã thanh lý'}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {c.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  onClick={() => openHandoverModal(c)}
                                  data-testid="btn-open-handover"
                                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm"
                                >
                                  Bàn giao phòng
                                </button>
                              )}
                              {c.status === 'ACTIVE' ||
                              c.status === 'EXTENDED' ||
                              c.status === 'EXPIRING' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedContract(c);
                                      setExtNewEndDate(
                                        computeEndDateIsoVn(c.endDate, 6)
                                      );
                                      setExtNewRentVnd(c.monthlyRentVnd);
                                      setExtNotes('');
                                      setLifecycleError(null);
                                      setIsExtendModalOpen(true);
                                    }}
                                    className="px-2 py-1 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded"
                                  >
                                    Gia hạn
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedContract(c);
                                      setTransferTargetRoomId('');
                                      setTransferNewRentVnd(c.monthlyRentVnd);
                                      setLifecycleError(null);
                                      setIsTransferModalOpen(true);
                                    }}
                                    className="px-2 py-1 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded"
                                  >
                                    Đổi phòng
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedContract(c);
                                      setTermReason('Hết hạn hợp đồng');
                                      setTermRoomNextStatus('AVAILABLE');
                                      setLifecycleError(null);
                                      setIsTerminateModalOpen(true);
                                    }}
                                    className="px-2 py-1 text-[10.5px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 rounded"
                                  >
                                    Thanh lý
                                  </button>
                                </>
                              ) : null}

                              {/* Standard Three-Dot Action Menu (UI-03) */}
                              <ActionMenu
                                items={[
                                  ...(c.status === 'DRAFT'
                                    ? [
                                        {
                                          label: 'Bàn giao phòng',
                                          variant: 'primary' as const,
                                          onClick: () => openHandoverModal(c),
                                        },
                                      ]
                                    : []),
                                  ...(c.status === 'ACTIVE' ||
                                  c.status === 'EXTENDED' ||
                                  c.status === 'EXPIRING'
                                    ? [
                                        {
                                          label: 'Gia hạn hợp đồng',
                                          onClick: () => {
                                            setSelectedContract(c);
                                            setExtNewEndDate(
                                              computeEndDateIsoVn(c.endDate, 6)
                                            );
                                            setExtNewRentVnd(c.monthlyRentVnd);
                                            setExtNotes('');
                                            setLifecycleError(null);
                                            setIsExtendModalOpen(true);
                                          },
                                        },
                                        {
                                          label: 'Đổi phòng',
                                          onClick: () => {
                                            setSelectedContract(c);
                                            setTransferTargetRoomId('');
                                            setTransferNewRentVnd(c.monthlyRentVnd);
                                            setLifecycleError(null);
                                            setIsTransferModalOpen(true);
                                          },
                                        },
                                        {
                                          label: 'Thanh lý hợp đồng',
                                          variant: 'danger' as const,
                                          onClick: () => {
                                            setSelectedContract(c);
                                            setTermReason('Hết hạn hợp đồng');
                                            setTermRoomNextStatus('AVAILABLE');
                                            setLifecycleError(null);
                                            setIsTerminateModalOpen(true);
                                          },
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
              )}
            </div>
          )}

          {/* 3. SETTLEMENTS & METERS */}
          {moduleId === 'settlements' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-brand-primary" />
                      Trạng thái chốt kỳ {formatPeriodDisplay(selectedPeriod)}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Hunonic:{' '}
                      {String(payload?.hunonicStatus || 'UNCONFIGURED') ===
                      'VERIFIED'
                        ? 'Đã xác thực'
                        : 'Sẵn sàng kết nối'}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {billingPeriods.map((bp) => (
                      <div
                        key={bp.buildingId}
                        className="py-3 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100">
                            {bp.buildingCode} · {bp.buildingName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Kỳ đối soát: {bp.periodKey} · Ngoại lệ:{' '}
                            {bp.exceptionCount}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                          {bp.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-brand-primary" />
                      Lịch tác vụ tự động (Asia/Ho_Chi_Minh)
                    </h3>
                    {hasCapability('canManageSettings') && (
                      <button
                        type="button"
                        onClick={() => setActiveModule('settings')}
                        className="text-xs font-semibold text-brand-primary hover:underline"
                      >
                        Cấu hình Cron →
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {cronJobs.map((job) => (
                      <div
                        key={job.id}
                        className="py-3 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {job.displayName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {job.cronExpression} ({job.timezone})
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                            job.isEnabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {job.isEnabled ? 'Đang bật' : 'Đang tắt'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Electric Meters & Telemetry */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-amber-500" />
                      Đồng hồ điện thông minh Hunonic Cloud &amp; Chỉ số phòng
                    </h3>
                    <span className="text-xs text-slate-500">
                      Nước: Áp dụng linh hoạt theo 3 phương thức (M³, Đầu người, Khoán)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsHunonicModalOpen(true)}
                      data-testid="btn-open-hunonic-settings"
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" /> Cấu hình Hunonic
                    </button>
                    <button
                      type="button"
                      disabled={isSyncingHunonic}
                      onClick={handleSyncHunonic}
                      data-testid="btn-sync-hunonic-now"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingHunonic ? 'animate-spin' : ''}`} />
                      Đồng bộ nền
                    </button>
                  </div>
                </div>

                {meters.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Chưa có thiết bị đồng hồ điện nào được ghi nhận cho các phòng
                    trong tổ chức.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Phòng</th>
                          <th className="pb-3">Số Serial / Device ID</th>
                          <th className="pb-3">Chỉ số tích lũy (kWh)</th>
                          <th className="pb-3">Công suất (W)</th>
                          <th className="pb-3">Trạng thái kết nối</th>
                          <th className="pb-3">Lần đồng bộ cuối</th>
                          <th className="pb-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {meters.map((m) => (
                          <tr key={m.id}>
                            <td className="py-3 font-semibold">
                              {m.buildingCode} · {m.roomCode}
                            </td>
                            <td className="py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {m.meterSerial || m.hunonicDeviceId || 'Chưa gắn'}
                            </td>
                            <td className="py-3 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                              {m.cumulativeKwh !== null
                                ? `${m.cumulativeKwh.toFixed(2)} kWh`
                                : '—'}
                            </td>
                            <td className="py-3 font-mono tabular-nums text-amber-600">
                              {m.instantPowerW !== null
                                ? `${m.instantPowerW} W`
                                : '—'}
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                                  m.connectionStatus === 'ONLINE'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : m.connectionStatus === 'STALE'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {m.connectionStatus}
                              </span>
                            </td>
                            <td className="py-3 text-[11px] text-slate-500 font-mono">
                              {m.lastSyncedAt
                                ? new Date(m.lastSyncedAt).toLocaleTimeString(
                                    'vi-VN',
                                    {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )
                                : 'Chưa đồng bộ'}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const targetRoom = rooms.find(
                                    (r) => r.code === m.roomCode
                                  );
                                  setManualRoomId(targetRoom?.id || '');
                                  setManualKwh(m.cumulativeKwh || 0);
                                  setManualReason('Kiểm tra thực tế');
                                  setManualError(null);
                                  setIsManualReadingModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg"
                              >
                                Ghi chỉ số tay
                              </button>
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

          {/* 4. INVOICES */}
          {moduleId === 'invoices' && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
              {invoices.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chưa phát hành hóa đơn cho kỳ{' '}
                    {formatPeriodDisplay(selectedPeriod)}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Tất cả số tiền hóa đơn trên PostgreSQL được lưu trữ chính
                    xác ở dạng số nguyên VND (<code>BigInt</code>).
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Mã hóa đơn</th>
                        <th className="pb-3">Phòng / Khách</th>
                        <th className="pb-3">Hạn thanh toán</th>
                        <th className="pb-3">Tổng phải thu</th>
                        <th className="pb-3">Đã thu</th>
                        <th className="pb-3">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-3 font-mono font-bold">
                            {inv.invoiceCode}
                          </td>
                          <td className="py-3">
                            <b>
                              {inv.buildingCode} · {inv.roomCode}
                            </b>
                            {inv.tenantName ? ` — ${inv.tenantName}` : ''}
                          </td>
                          <td className="py-3 font-mono">{inv.dueDate}</td>
                          <td className="py-3 font-bold tabular-nums">
                            {inv.totalAmountVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3 tabular-nums text-emerald-600 font-semibold">
                            {inv.paidAmountVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 5. PAYMENTS & RECONCILIATION */}
          {moduleId === 'payments' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {paymentProviders.map((p) => (
                  <div
                    key={p.providerId}
                    className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-brand-primary" />
                        {p.displayName}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {p.status === 'UNCONFIGURED'
                          ? 'Chưa cấu hình'
                          : p.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
                {transactions.length === 0 ? (
                  <div className="py-8 text-center space-y-1.5">
                    <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Chưa phát sinh giao dịch chuyển khoản trong kỳ{' '}
                      {formatPeriodDisplay(selectedPeriod)}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Kết nối SePay, payOS hoặc Tingee trong mục Cài đặt &amp;
                      Thiết lập để tự động nhận webhook biến động số dư.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Cổng</th>
                          <th className="pb-3">Mã GD ngân hàng</th>
                          <th className="pb-3">Số tiền</th>
                          <th className="pb-3">Nội dung</th>
                          <th className="pb-3">Hóa đơn khớp</th>
                          <th className="pb-3">Đối soát</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="py-3 font-bold">{tx.providerId}</td>
                            <td className="py-3 font-mono">
                              {tx.externalTxId}
                            </td>
                            <td className="py-3 font-bold tabular-nums">
                              {tx.amountVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3">{tx.referenceText || '—'}</td>
                            <td className="py-3 font-mono">
                              {tx.invoiceCode || 'Chưa gán'}
                            </td>
                            <td className="py-3">{tx.reconcileState}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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

      {/* 5-Tab Hunonic Cloud Configuration Modal (HUN-02) */}
      <HunonicSettingsModal
        isOpen={isHunonicModalOpen}
        onClose={() => setIsHunonicModalOpen(false)}
        onSyncTriggered={() => loadModuleData()}
      />
    </div>
  );
};
