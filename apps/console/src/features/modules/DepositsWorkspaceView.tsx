import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  Info,
  KeyRound,
  Layers,
  Plus,
  Wallet,
} from 'lucide-react';
import {
  WorkspaceSearchToolbar,
  useResponsiveViewMode,
} from '@/shared/ui/WorkspaceToolbarControls';
import { formatVnDate } from '@/shared/tokens/designTokens';

export interface ReservationItem {
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
}

export interface DepositItem {
  id: string;
  depositType?: string;
  amountVnd: number;
  paidAmountVnd?: number;
  refundedVnd: number;
  deductedAmountVnd?: number;
  forfeitedAmountVnd?: number;
  transferredAmountVnd?: number;
  transferredToDepositId?: string | null;
  contractId?: string | null;
  reservationId?: string | null;
  paymentStatus?: string;
  paymentMethod?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
}

export interface EnrichedDepositItem extends DepositItem {
  isTransferred: boolean;
  effectivePaid: number;
  remainingDue: number;
  availableBalance: number;
}

export interface GroupedDepositItem extends EnrichedDepositItem {
  transferredSources: EnrichedDepositItem[];
  isTransferredToAnother: boolean;
}

interface DepositsWorkspaceViewProps {
  reservations: ReservationItem[];
  deposits: DepositItem[];
  canManageContracts: boolean;
  isLoading: boolean;
  initialSearchQuery?: string;
  onRefresh: () => void;
  onOpenCreateReservation: () => void;
  onConvertReservationToContract: (reservation: ReservationItem) => void;
  onCancelReservation: (reservationId: string) => void;
  onOpenDepositRefund: (deposit: DepositItem, availableBalance: number) => void;
}

const getReservationBadge = (status: string) => {
  if (status === 'CONFIRMED') {
    return {
      label: 'Đã cọc giữ chỗ',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }
  if (status === 'CONVERTED') {
    return {
      label: 'Đã lên hợp đồng',
      cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    };
  }
  if (status === 'CANCELLED') {
    return {
      label: 'Đã hủy giữ',
      cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    };
  }
  if (status === 'EXPIRED') {
    return {
      label: 'Hết hạn',
      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  return {
    label: 'Chờ đặt cọc',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  };
};

const getDepositStatusBadge = (status: string) => {
  if (status === 'HELD') {
    return {
      label: 'Đang giữ cọc',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }
  if (status === 'APPLIED_TO_CONTRACT') {
    return {
      label: 'Đã chuyển sang HĐ',
      cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    };
  }
  if (status === 'PARTIALLY_REFUNDED') {
    return {
      label: 'Đã hoàn 1 phần',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    };
  }
  if (status === 'REFUNDED') {
    return {
      label: 'Đã hoàn cọc',
      cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    };
  }
  if (status === 'FORFEITED') {
    return {
      label: 'Đã phạt/tịch thu',
      cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    };
  }
  return {
    label: status,
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
};

export const DepositsWorkspaceView: React.FC<DepositsWorkspaceViewProps> = ({
  reservations,
  deposits,
  canManageContracts,
  isLoading,
  initialSearchQuery,
  onRefresh,
  onOpenCreateReservation,
  onConvertReservationToContract,
  onCancelReservation,
  onOpenDepositRefund,
}) => {
  const [subTab, setSubTab] = useState<'RESERVATIONS' | 'DEPOSITS'>(
    initialSearchQuery ? 'DEPOSITS' : 'RESERVATIONS'
  );
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedDepositIds, setExpandedDepositIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (initialSearchQuery) {
      setSubTab('DEPOSITS');
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  const toggleExpandDeposit = (id: string) => {
    setExpandedDepositIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const activeFilterCount = statusFilter !== 'ALL' ? 1 : 0;

  const filteredReservations = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase('vi');
    return reservations.filter((r) => {
      const isActive = r.status === 'CONFIRMED' || r.status === 'PENDING';
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'CLOSED' && isActive) return false;
      if (!normalized) return true;
      return [
        r.reservationCode,
        r.buildingCode,
        r.roomCode,
        r.customerName,
        r.customerPhone,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('vi').includes(normalized));
    });
  }, [reservations, searchQuery, statusFilter]);

  // Group booking deposits that transferred into contract deposits into a single unified item
  const { groupedDeposits } = useMemo(() => {
    const enriched: EnrichedDepositItem[] = deposits.map((d) => {
      const isTransferred =
        d.status === 'APPLIED_TO_CONTRACT' || d.paymentStatus === 'TRANSFERRED';
      const isTerminal =
        d.status === 'REFUNDED' || d.status === 'FORFEITED' || isTransferred;
      const effectivePaid =
        d.paidAmountVnd ?? (d.paymentStatus === 'PAID' ? d.amountVnd : 0);
      const remainingDue = isTerminal
        ? 0
        : Math.max(0, d.amountVnd - effectivePaid);
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
      return {
        ...d,
        isTransferred,
        effectivePaid,
        remainingDue,
        availableBalance,
      };
    });

    const depositMap = new Map<string, EnrichedDepositItem>(
      enriched.map((d) => [d.id, d])
    );
    const contractDepositByContractId = new Map<string, EnrichedDepositItem>(
      enriched
        .filter((d) => d.depositType === 'CONTRACT' && d.contractId)
        .map((d) => [d.contractId!, d])
    );

    // Identify child booking deposits transferred into a contract deposit
    const sourcesByParentId = new Map<string, EnrichedDepositItem[]>();
    const childIds = new Set<string>();

    for (const d of enriched) {
      if (d.isTransferred) {
        let parentId: string | null = null;
        if (d.transferredToDepositId && depositMap.has(d.transferredToDepositId)) {
          parentId = d.transferredToDepositId;
        } else if (d.contractId && contractDepositByContractId.has(d.contractId)) {
          const parent = contractDepositByContractId.get(d.contractId);
          if (parent && parent.id !== d.id) {
            parentId = parent.id;
          }
        }

        if (parentId) {
          childIds.add(d.id);
          const list = sourcesByParentId.get(parentId) || [];
          list.push(d);
          sourcesByParentId.set(parentId, list);
        }
      }
    }

    const grouped: GroupedDepositItem[] = enriched
      .filter((d) => !childIds.has(d.id))
      .map((d) => ({
        ...d,
        transferredSources: sourcesByParentId.get(d.id) || [],
        isTransferredToAnother: childIds.has(d.id),
      }));

    return { groupedDeposits: grouped };
  }, [deposits]);

  const filteredDeposits = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase('vi');
    return groupedDeposits.filter((d) => {
      const isActive =
        d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED';
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'CLOSED' && isActive) return false;
      if (!normalized) return true;
      const childMatch = d.transferredSources.some((src) =>
        [src.id, src.notes, src.depositType]
          .filter(Boolean)
          .some((v) => String(v).toLocaleLowerCase('vi').includes(normalized))
      );
      return (
        childMatch ||
        [d.id, d.depositType, d.notes, getDepositStatusBadge(d.status).label]
          .filter(Boolean)
          .some((v) => String(v).toLocaleLowerCase('vi').includes(normalized))
      );
    });
  }, [groupedDeposits, searchQuery, statusFilter]);

  const activeReservationCount = reservations.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'PENDING'
  ).length;
  const totalHeldVnd = groupedDeposits.reduce(
    (sum, d) => sum + d.availableBalance,
    0
  );
  const totalHoldReservedVnd = reservations
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING')
    .reduce((sum, r) => sum + r.holdAmountVnd, 0);

  return (
    <div data-testid="deposits-workspace-view" className="space-y-3">
      {/* Sub-tabs & Primary CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            data-testid="deposits-tab-reservations"
            onClick={() => setSubTab('RESERVATIONS')}
            className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-bold transition-colors ${
              subTab === 'RESERVATIONS'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-500" />
            <span>Giữ chỗ ({reservations.length})</span>
          </button>
          <button
            type="button"
            data-testid="deposits-tab-ledger"
            onClick={() => setSubTab('DEPOSITS')}
            className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-bold transition-colors ${
              subTab === 'DEPOSITS'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Wallet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Sổ tiền cọc ({groupedDeposits.length})</span>
          </button>
        </div>

        {canManageContracts && (
          <button
            type="button"
            data-testid="btn-open-create-reservation"
            onClick={onOpenCreateReservation}
            className="inline-flex h-8 sm:h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="sm:hidden">Giữ chỗ</span>
            <span className="hidden sm:inline">Tạo phiếu giữ chỗ</span>
          </button>
        )}
      </div>

      {/* Unified Single-Row Toolbar */}
      <WorkspaceSearchToolbar
        testIdPrefix="deposits"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={
          subTab === 'RESERVATIONS'
            ? 'Tìm phòng, tên khách, SĐT, mã giữ chỗ...'
            : 'Tìm mã khoản cọc, loại cọc, trạng thái...'
        }
        viewMode={viewMode}
        onToggleViewMode={() =>
          setViewMode((prev) => (prev === 'card' ? 'table' : 'card'))
        }
        isLoading={isLoading}
        onRefresh={onRefresh}
        activeFilterCount={activeFilterCount}
        isFilterOpen={isFilterOpen}
        onFilterOpenChange={setIsFilterOpen}
        refreshAriaLabel="Làm mới đặt cọc và giữ chỗ"
        filterContent={
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Lọc trạng thái
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="text-[11px] font-semibold text-brand-primary hover:underline"
                >
                  Đặt lại
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'ALL' as const, label: 'Tất cả' },
                { id: 'ACTIVE' as const, label: 'Đang giữ' },
                { id: 'CLOSED' as const, label: 'Đã đóng' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                    statusFilter === opt.id
                      ? 'bg-brand-primary text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Compact 3-Metric Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
        <div className="rounded-xl bg-amber-50/70 px-3 py-2 dark:bg-amber-950/30">
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Đang giữ chỗ
          </div>
          <div className="mt-0.5 text-sm sm:text-lg font-extrabold text-amber-700 tabular-nums dark:text-amber-400">
            {activeReservationCount} phiếu
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
          <div className="text-[11px] font-semibold text-slate-500">
            Tiền giữ chỗ
          </div>
          <div className="mt-0.5 text-sm sm:text-lg font-extrabold text-slate-900 tabular-nums dark:text-white">
            {totalHoldReservedVnd.toLocaleString('vi-VN')} đ
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-xl bg-emerald-50/70 px-3 py-2 dark:bg-emerald-950/30">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            Số dư cọc khả dụng
          </div>
          <div className="mt-0.5 text-sm sm:text-lg font-extrabold text-emerald-700 tabular-nums dark:text-emerald-400">
            {totalHeldVnd.toLocaleString('vi-VN')} đ
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: RESERVATIONS */}
      {subTab === 'RESERVATIONS' ? (
        filteredReservations.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-[#111827]">
            <KeyRound className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {reservations.length === 0
                ? 'Chưa có phiếu giữ chỗ nào. Nhấn "Tạo phiếu giữ chỗ" để khóa phòng tạm thời.'
                : 'Không có phiếu giữ chỗ khớp bộ lọc hiện tại.'}
            </p>
          </div>
        ) : viewMode === 'card' ? (
          <div data-testid="deposits-reservations-cards" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {filteredReservations.map((r) => {
              const badge = getReservationBadge(r.status);
              const isActionable = r.status === 'CONFIRMED' || r.status === 'PENDING';
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111827]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-brand-primary">
                          {r.buildingCode} · {r.roomCode}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-900 dark:text-white">
                        {r.customerName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {r.customerPhone} · {r.reservationCode}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10.5px] text-slate-400">Giữ chỗ</div>
                      <div className="text-sm font-extrabold text-slate-900 tabular-nums dark:text-white">
                        {r.holdAmountVnd.toLocaleString('vi-VN')} đ
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500">
                      Dự kiến vào: {formatVnDate(r.expectedMoveIn)}
                    </span>
                    {isActionable && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onConvertReservationToContract(r)}
                          className="h-7 whitespace-nowrap rounded-lg bg-brand-primary px-2.5 text-[11px] font-bold text-white hover:bg-brand-hover"
                        >
                          Lập HĐ
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancelReservation(r.id)}
                          className="h-7 whitespace-nowrap rounded-lg bg-rose-50 px-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-testid="deposits-reservations-table"
            className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]"
            style={{ contain: 'layout inline-size' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                    <th className="px-4 py-3">Phòng</th>
                    <th className="px-3 py-3">Khách đặt giữ chỗ</th>
                    <th className="px-3 py-3 text-right">Tiền giữ chỗ</th>
                    <th className="px-3 py-3">Dự kiến vào</th>
                    <th className="px-3 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReservations.map((r) => {
                    const badge = getReservationBadge(r.status);
                    const isActionable = r.status === 'CONFIRMED' || r.status === 'PENDING';
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.buildingCode} · {r.roomCode}
                          </div>
                          <div className="font-mono text-[10.5px] text-slate-400">
                            {r.reservationCode}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {r.customerName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {r.customerPhone}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right font-bold tabular-nums">
                          {r.holdAmountVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatVnDate(r.expectedMoveIn)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {isActionable ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onConvertReservationToContract(r)}
                                className="h-7 whitespace-nowrap rounded-lg bg-brand-primary px-2.5 text-[11px] font-bold text-white hover:bg-brand-hover"
                              >
                                Lập HĐ
                              </button>
                              <button
                                type="button"
                                onClick={() => onCancelReservation(r.id)}
                                className="h-7 whitespace-nowrap rounded-lg bg-rose-50 px-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : filteredDeposits.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-[#111827]">
          <Wallet className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Chưa có khoản tiền cọc nào khớp bộ lọc.
          </p>
        </div>
      ) : viewMode === 'card' ? (
        /* SUB-TAB 2 CARD VIEW */
        <div data-testid="deposits-ledger-cards" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredDeposits.map((d) => {
            const badge = getDepositStatusBadge(d.status);
            const canRefund =
              !d.isTransferred &&
              d.availableBalance > 0 &&
              (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED');
            const hasSources = (d.transferredSources?.length || 0) > 0;
            const isExpanded = expandedDepositIds.has(d.id);
            const displayId = `#${d.id.slice(0, 8).toUpperCase()}`;

            return (
              <div
                key={d.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111827] transition-all shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {d.depositType === 'BOOKING'
                          ? 'Cọc giữ phòng'
                          : d.depositType === 'ADVANCE_RENT'
                          ? 'Tiền trả trước'
                          : 'Cọc hợp đồng'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {hasSources && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          Gộp cọc giữ chỗ ({d.transferredSources.length})
                        </span>
                      )}
                    </div>
                    {/* Click into ID to view details / expand */}
                    <div className="mt-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpandDeposit(d.id)}
                        className="group inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-brand-primary hover:text-brand-hover hover:underline transition-colors"
                        title="Click vào ID để xem chi tiết khoản cọc"
                      >
                        <span>{displayId}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-slate-400 group-hover:text-brand-primary transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-brand-primary' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10.5px] text-slate-400">Khả dụng</div>
                    <div className="text-sm font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
                      {d.availableBalance.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] dark:bg-slate-800/60">
                  <div>
                    <div className="text-slate-500">Yêu cầu</div>
                    <div className="font-bold tabular-nums">
                      {d.amountVnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Đã thu</div>
                    <div className="font-bold text-emerald-600 tabular-nums">
                      {d.effectivePaid.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Đã hoàn</div>
                    <div className="font-bold text-slate-600 tabular-nums dark:text-slate-300">
                      {d.refundedVnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>

                {/* EXPANDED BREAKDOWN ACCORDION */}
                {isExpanded && (
                  <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-800/50 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-700/60 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-brand-primary" />
                        <span>Chi tiết cơ cấu nguồn cọc ({displayId})</span>
                      </span>
                      <span className="text-emerald-600 font-semibold tabular-nums">
                        Tổng thu: {d.effectivePaid.toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    <div className="space-y-1.5 divide-y divide-slate-200/50 dark:divide-slate-700/50">
                      {d.transferredSources.map((src) => {
                        const srcPaid =
                          src.paidAmountVnd ??
                          (src.paymentStatus === 'PAID'
                            ? src.amountVnd
                            : src.transferredAmountVnd ?? src.amountVnd);
                        return (
                          <div key={src.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-[11px]">
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <span>↳ Cọc giữ phòng</span>
                                <span className="font-mono text-[10px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-200/50 dark:border-blue-800/50">
                                  #{src.id.slice(0, 8).toUpperCase()}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                Đã chuyển vào cọc hợp đồng {displayId}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {srcPaid.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {(() => {
                        const transferredSum = d.transferredSources.reduce((sum, s) => {
                          const amt =
                            s.paidAmountVnd ??
                            (s.paymentStatus === 'PAID'
                              ? s.amountVnd
                              : s.transferredAmountVnd ?? s.amountVnd);
                          return sum + amt;
                        }, 0);
                        const directPaid = Math.max(0, d.effectivePaid - transferredSum);
                        if (directPaid > 0) {
                          return (
                            <div className="pt-1.5 flex items-center justify-between text-[11px]">
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  ↳ {hasSources ? 'Thu bổ sung / Thanh toán đợt 1' : 'Thanh toán cọc trực tiếp'}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {hasSources ? 'Thu đủ khi ký hợp đồng' : 'Thu tiền cọc theo hợp đồng'}
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {directPaid.toLocaleString('vi-VN')} đ
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {d.notes && (
                      <div className="mt-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px] text-slate-500 dark:text-slate-400 italic">
                        {d.notes}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => toggleExpandDeposit(d.id)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                  >
                    {isExpanded
                      ? 'Thu gọn chi tiết'
                      : hasSources
                      ? `Xem chi tiết (${d.transferredSources.length + 1} khoản)`
                      : 'Xem chi tiết'}
                  </button>

                  <div>
                    {d.isTransferred ? (
                      <span className="rounded bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                        Đã chuyển HĐ
                      </span>
                    ) : canRefund ? (
                      <button
                        type="button"
                        onClick={() => onOpenDepositRefund(d, d.availableBalance)}
                        className="h-7 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Hoàn / Khấu trừ
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Hết số dư</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* SUB-TAB 2 TABLE VIEW (isolated inline-size) */
        <div
          data-testid="deposits-ledger-table"
          className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]"
          style={{ contain: 'layout inline-size' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="px-4 py-3">Phân loại & Mã cọc</th>
                  <th className="px-3 py-3 text-right">Yêu cầu</th>
                  <th className="px-3 py-3 text-right">Đã thu</th>
                  <th className="px-3 py-3 text-right">Còn thu</th>
                  <th className="px-3 py-3 text-right">Đã hoàn</th>
                  <th className="px-3 py-3 text-right">Khả dụng</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Xử lý cọc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDeposits.map((d) => {
                  const badge = getDepositStatusBadge(d.status);
                  const canRefund =
                    !d.isTransferred &&
                    d.availableBalance > 0 &&
                    (d.status === 'HELD' || d.status === 'PARTIALLY_REFUNDED');
                  const hasSources = (d.transferredSources?.length || 0) > 0;
                  const isExpanded = expandedDepositIds.has(d.id);
                  const displayId = `#${d.id.slice(0, 8).toUpperCase()}`;

                  return (
                    <React.Fragment key={d.id}>
                      <tr className={isExpanded ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpandDeposit(d.id)}
                              className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors"
                              title="Click để mở rộng chi tiết"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180 text-brand-primary' : ''
                                }`}
                              />
                            </button>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <span>
                                  {d.depositType === 'BOOKING'
                                    ? 'Cọc giữ phòng'
                                    : d.depositType === 'ADVANCE_RENT'
                                    ? 'Tiền trả trước'
                                    : 'Cọc hợp đồng'}
                                </span>
                                {hasSources && (
                                  <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[9.5px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                    Gộp giữ chỗ
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleExpandDeposit(d.id)}
                                className="font-mono text-[10.5px] text-brand-primary hover:underline text-left block"
                                title="Click vào ID để xem chi tiết"
                              >
                                {displayId}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right font-bold tabular-nums">
                          {d.amountVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-emerald-600 tabular-nums">
                          {d.effectivePaid.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right font-semibold tabular-nums">
                          {d.remainingDue > 0 ? (
                            <span className="text-rose-500 font-bold">
                              {d.remainingDue.toLocaleString('vi-VN')} đ
                            </span>
                          ) : (
                            <span className="text-slate-400">0 đ</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-slate-500 tabular-nums">
                          {d.refundedVnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                          {d.availableBalance.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {d.isTransferred ? (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                              Đã chuyển HĐ
                            </span>
                          ) : canRefund ? (
                            <button
                              type="button"
                              onClick={() => onOpenDepositRefund(d, d.availableBalance)}
                              className="h-7 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                            >
                              Hoàn / Khấu trừ
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Hết số dư</span>
                          )}
                        </td>
                      </tr>

                      {/* TABLE EXPANDED ROW */}
                      {isExpanded && (
                        <tr key={`${d.id}-expanded`} className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/80 space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                                <span className="flex items-center gap-1.5">
                                  <Layers className="h-4 w-4 text-brand-primary" />
                                  <span>Chi tiết nguồn cơ cấu cọc ({displayId})</span>
                                </span>
                                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  Tổng thực thu: {d.effectivePaid.toLocaleString('vi-VN')} đ
                                </span>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                {d.transferredSources.map((src) => {
                                  const srcPaid =
                                    src.paidAmountVnd ??
                                    (src.paymentStatus === 'PAID'
                                      ? src.amountVnd
                                      : src.transferredAmountVnd ?? src.amountVnd);
                                  return (
                                    <div key={src.id} className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/60 last:border-b-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          ↳ Cọc giữ phòng
                                        </span>
                                        <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/50 dark:border-blue-800/50">
                                          #{src.id.slice(0, 8).toUpperCase()}
                                        </span>
                                        <span className="text-slate-500 text-[11px]">
                                          (Đã chuyển sang HĐ)
                                        </span>
                                      </div>
                                      <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                        {srcPaid.toLocaleString('vi-VN')} đ
                                      </div>
                                    </div>
                                  );
                                })}

                                {(() => {
                                  const transferredSum = d.transferredSources.reduce((sum, s) => {
                                    const amt =
                                      s.paidAmountVnd ??
                                      (s.paymentStatus === 'PAID'
                                        ? s.amountVnd
                                        : s.transferredAmountVnd ?? s.amountVnd);
                                    return sum + amt;
                                  }, 0);
                                  const directPaid = Math.max(0, d.effectivePaid - transferredSum);
                                  if (directPaid > 0) {
                                    return (
                                      <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/60 last:border-b-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                                            ↳ {hasSources ? 'Thu bổ sung / Thanh toán đợt 1' : 'Thanh toán cọc trực tiếp'}
                                          </span>
                                          <span className="text-slate-500 text-[11px]">
                                            ({hasSources ? 'Thu đủ khi ký hợp đồng' : 'Thu tiền cọc theo hợp đồng'})
                                          </span>
                                        </div>
                                        <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                          {directPaid.toLocaleString('vi-VN')} đ
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>

                              {d.notes && (
                                <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 italic">
                                  {d.notes}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
