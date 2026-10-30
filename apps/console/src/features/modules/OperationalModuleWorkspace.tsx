import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileSignature,
  KeyRound,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
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

interface OperationalModuleWorkspaceProps {
  moduleId: Exclude<NavModuleId, 'overview' | 'buildings' | 'settings'>;
}

export const OperationalModuleWorkspace: React.FC<
  OperationalModuleWorkspaceProps
> = ({ moduleId }) => {
  const { hasCapability } = useAuth();
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
  const [ctTenantId, setCtTenantId] = useState('');
  const [ctStartDate, setCtStartDate] = useState('2026-11-01');
  const [ctEndDate, setCtEndDate] = useState('2027-10-31');
  const [ctRentVnd, setCtRentVnd] = useState(4500000);
  const [ctDepositVnd, setCtDepositVnd] = useState(4500000);
  const [ctOccupants, setCtOccupants] = useState(2);
  const [ctError, setCtError] = useState<string | null>(null);
  const [isSavingCt, setIsSavingCt] = useState(false);

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
    setCtRentVnd(candidateRoom?.listPriceVnd || 4500000);
    setCtDepositVnd(candidateRoom?.listPriceVnd || 4500000);
    setCtTenantId(tenants[0]?.id || '');
    setCtError(null);
    setIsContractModalOpen(true);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCt(true);
    setCtError(null);
    try {
      const res = await fetch('/api/v1/console/v2/contracts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({
          roomId: ctRoomId,
          tenantId: ctTenantId,
          startDate: ctStartDate,
          endDate: ctEndDate,
          monthlyRentVnd: Math.trunc(Number(ctRentVnd) || 0),
          depositVnd: Math.trunc(Number(ctDepositVnd) || 0),
          occupantsCount: Math.trunc(Number(ctOccupants) || 1),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setCtError(data.message || 'Không thể lập hợp đồng.');
        return;
      }
      setIsContractModalOpen(false);
      await Promise.all([loadModuleData(), refreshPortfolio()]);
    } catch {
      setCtError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSavingCt(false);
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
        customerName: string;
        customerPhone: string;
        holdAmountVnd: number;
        status: string;
        expectedMoveIn: string | null;
      }>)
    : [];

  const contracts = Array.isArray(payload?.contracts)
    ? (payload.contracts as Array<{
        id: string;
        contractCode: string;
        buildingCode: string;
        roomCode: string;
        tenantName: string;
        tenantPhone: string;
        startDate: string;
        endDate: string;
        monthlyRentVnd: number;
        depositVnd: number;
        electricRateVnd: number;
        waterBillingMethod: string;
        waterRateVnd: number;
        status: string;
      }>)
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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {currentNavConfig.description}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {currentNavConfig.hasPeriodToolbar && (
            <div
              data-testid="module-period-toolbar"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-1"
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
            <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
              {reservations.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <KeyRound className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chưa có phiếu đặt cọc hoặc giữ chỗ đang hoạt động
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Dữ liệu đặt cọc được ghi nhận trực tiếp trên bảng{' '}
                    <code>room_reservations</code> và <code>deposits</code> của
                    PostgreSQL (không có bản ghi mẫu ảo).
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
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {r.status}
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
                <div className="overflow-x-auto">
                  <table
                    data-testid="contracts-table"
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Mã hợp đồng</th>
                        <th className="pb-3">Tòa &amp; Phòng</th>
                        <th className="pb-3">Khách đứng tên</th>
                        <th className="pb-3">Thời hạn</th>
                        <th className="pb-3">Giá thuê / Cọc</th>
                        <th className="pb-3">Điện &amp; Nước</th>
                        <th className="pb-3">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {contracts.map((c) => (
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
                              Cọc: {c.depositVnd.toLocaleString('vi-VN')} đ
                            </div>
                          </td>
                          <td className="py-3 text-[11px] text-slate-600 dark:text-slate-300">
                            Điện: {c.electricRateVnd.toLocaleString('vi-VN')}đ ·
                            Nước: {c.waterRateVnd.toLocaleString('vi-VN')}đ (
                            {c.waterBillingMethod})
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              {c.status}
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

          {/* 3. SETTLEMENTS & CRON */}
          {moduleId === 'settlements' && (
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
                      : 'Chưa cấu hình'}
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
                    Tổng chi vận hành
                  </span>
                  <div className="mt-1 text-lg font-bold text-rose-600 tabular-nums">
                    -{financeSummary.totalExpenseVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Dòng tiền ròng (Net Cashflow)
                  </span>
                  <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                    {financeSummary.netCashflowVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
                {ledgerEntries.length === 0 ? (
                  <div className="py-8 text-center space-y-1.5">
                    <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Sổ quỹ kỳ {formatPeriodDisplay(selectedPeriod)} chưa có
                      bút toán
                    </h3>
                    <p className="text-xs text-slate-500">
                      Nhấn &ldquo;Ghi phiếu thu / chi&rdquo; để lưu bút toán
                      thực tế trực tiếp vào PostgreSQL.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table
                      data-testid="ledger-entries-table"
                      className="w-full text-left text-xs"
                    >
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3">Mã phiếu</th>
                          <th className="pb-3">Loại</th>
                          <th className="pb-3">Danh mục</th>
                          <th className="pb-3">Diễn giải</th>
                          <th className="pb-3">Số tiền</th>
                          <th className="pb-3">Người ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ledgerEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="py-3 font-mono font-bold">
                              {entry.entryCode}
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  entry.entryType === 'INCOME'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {entry.entryType === 'INCOME'
                                  ? 'Phiếu thu'
                                  : 'Phiếu chi'}
                              </span>
                            </td>
                            <td className="py-3 font-medium">
                              {entry.category}
                            </td>
                            <td className="py-3">{entry.description}</td>
                            <td
                              className={`py-3 font-bold tabular-nums ${
                                entry.entryType === 'INCOME'
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {entry.entryType === 'INCOME' ? '+' : '-'}
                              {entry.amountVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 font-mono text-[11px] text-slate-500">
                              {entry.recordedBy}
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

          {/* 7. REVENUE REPORTS */}
          {moduleId === 'reports' && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-primary" />
                  Báo cáo công suất &amp; doanh thu theo tòa nhà (
                  {formatPeriodDisplay(selectedPeriod)})
                </h3>
              </div>

              {reportBreakdown.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Chưa có tòa nhà trong phạm vi báo cáo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    data-testid="reports-breakdown-table"
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Tòa nhà</th>
                        <th className="pb-3">Phòng lấp đầy</th>
                        <th className="pb-3">Tỷ lệ lấp đầy</th>
                        <th className="pb-3">Doanh thu HĐ / tháng</th>
                        <th className="pb-3">Phát hành trong kỳ</th>
                        <th className="pb-3">Thực thu trong kỳ</th>
                        <th className="pb-3">Còn phải thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {reportBreakdown.map((row) => (
                        <tr key={row.buildingId}>
                          <td className="py-3.5 font-bold text-slate-900 dark:text-white">
                            {row.buildingCode} · {row.buildingName}
                          </td>
                          <td className="py-3.5 tabular-nums">
                            {row.occupiedRooms}/{row.totalRooms} phòng
                          </td>
                          <td className="py-3.5 font-bold text-brand-primary tabular-nums">
                            {row.occupancyRatePercent}%
                          </td>
                          <td className="py-3.5 font-bold tabular-nums">
                            {row.contractedRentVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3.5 tabular-nums">
                            {row.invoicedVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3.5 tabular-nums text-emerald-600 font-semibold">
                            {row.collectedVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3.5 tabular-nums text-amber-600 font-semibold">
                            {row.receivableVnd.toLocaleString('vi-VN')} đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CREATE CONTRACT MODAL */}
      {isContractModalOpen && (
        <div
          data-testid="modal-create-contract"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Lập hợp đồng thuê phòng mới
              </h3>
              <button
                type="button"
                onClick={() => setIsContractModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateContract} className="p-5 space-y-4">
              {ctError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                  {ctError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Phòng cho thuê *
                  </label>
                  <select
                    value={ctRoomId}
                    onChange={(e) => {
                      setCtRoomId(e.target.value);
                      const rm = rooms.find((x) => x.id === e.target.value);
                      if (rm) {
                        setCtRentVnd(rm.listPriceVnd);
                        setCtDepositVnd(rm.listPriceVnd * rm.depositMonths);
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                    required
                  >
                    <option value="">— Chọn phòng —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.buildingCode} · {r.code} (
                        {r.listPriceVnd.toLocaleString('vi-VN')}đ)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Khách đứng tên *
                  </label>
                  <select
                    value={ctTenantId}
                    onChange={(e) => setCtTenantId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                    required
                  >
                    <option value="">— Chọn khách thuê —</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} ({t.phone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Ngày bắt đầu *
                  </label>
                  <input
                    type="date"
                    value={ctStartDate}
                    onChange={(e) => setCtStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Ngày kết thúc *
                  </label>
                  <input
                    type="date"
                    value={ctEndDate}
                    onChange={(e) => setCtEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Giá thuê (VND/th) *
                  </label>
                  <input
                    type="number"
                    min={500000}
                    step={100000}
                    value={ctRentVnd}
                    onChange={(e) =>
                      setCtRentVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Tiền cọc (VND) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100000}
                    value={ctDepositVnd}
                    onChange={(e) =>
                      setCtDepositVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số người ở
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={ctOccupants}
                    onChange={(e) =>
                      setCtOccupants(parseInt(e.target.value, 10) || 1)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsContractModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  data-testid="submit-create-contract"
                  type="submit"
                  disabled={isSavingCt || !ctRoomId || !ctTenantId}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingCt && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Ký &amp; kích hoạt hợp đồng</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE LEDGER ENTRY MODAL */}
      {isLedgerModalOpen && (
        <div
          data-testid="modal-create-ledger"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Ghi phiếu thu / chi sổ quỹ ({formatPeriodDisplay(selectedPeriod)}
                )
              </h3>
              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
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
    </div>
  );
};

