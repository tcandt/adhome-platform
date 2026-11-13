import React, { useMemo, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  Download,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { SettlementProgressBar } from '@/shared/ui/SettlementAnimatePrimitives';
import {
  CompactPeriodStepper,
  WorkspaceSearchToolbar,
  downloadCsvFile,
  useResponsiveViewMode,
} from '@/shared/ui/WorkspaceToolbarControls';

export interface LedgerEntryItem {
  id: string;
  entryCode: string;
  buildingId?: string | null;
  buildingCode?: string | null;
  buildingName?: string | null;
  periodKey?: string | null;
  entryType: string;
  category: string;
  amountVnd: number;
  description: string;
  recordedBy: string;
  occurredAt: string;
}

export interface FinanceSummary {
  totalIncomeVnd: number;
  totalExpenseVnd: number;
  netCashflowVnd: number;
}

interface FinanceWorkspaceViewProps {
  summary: FinanceSummary;
  entries: LedgerEntryItem[];
  activeBuildings: Array<{ id: string; code: string; name: string }>;
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (periodKey: string, deltaMonths: number) => string;
  isLoading: boolean;
  onRefresh: () => void;
  canCreateLedger: boolean;
  onOpenCreateLedger: () => void;
}

const formatOccurredAt = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const FinanceWorkspaceView: React.FC<FinanceWorkspaceViewProps> = ({
  summary,
  entries,
  activeBuildings,
  selectedPeriod,
  onChangePeriod,
  shiftPeriodKey,
  isLoading,
  onRefresh,
  canCreateLedger,
  onOpenCreateLedger,
}) => {
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [buildingFilter, setBuildingFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<LedgerEntryItem | null>(null);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [entries]);

  const activeFilterCount =
    (typeFilter !== 'ALL' ? 1 : 0) +
    (buildingFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0);

  const filteredEntries = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase('vi');
    return entries.filter((item) => {
      if (typeFilter !== 'ALL' && item.entryType !== typeFilter) return false;
      if (buildingFilter === '__ORG__' && item.buildingId) return false;
      if (
        buildingFilter !== 'ALL' &&
        buildingFilter !== '__ORG__' &&
        item.buildingId !== buildingFilter
      ) {
        return false;
      }
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
        return false;
      }
      if (!normalized) return true;
      return [
        item.category,
        item.description,
        item.recordedBy,
        item.buildingCode,
        item.buildingName,
        item.entryCode,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('vi').includes(normalized));
    });
  }, [entries, searchQuery, typeFilter, buildingFilter, categoryFilter]);

  const totalFlow = summary.totalIncomeVnd + summary.totalExpenseVnd;
  const incomeRatioPercent =
    totalFlow > 0 ? Math.round((summary.totalIncomeVnd / totalFlow) * 100) : 0;

  const incomeCount = useMemo(
    () => entries.filter((e) => e.entryType === 'INCOME').length,
    [entries]
  );
  const expenseCount = entries.length - incomeCount;

  const handleExportCsv = () => {
    downloadCsvFile(
      `so-quy-${selectedPeriod}.csv`,
      ['Loại', 'Danh mục', 'Tòa nhà', 'Diễn giải', 'Số tiền (VND)', 'Người ghi', 'Thời gian'],
      filteredEntries.map((item) => [
        item.entryType === 'INCOME' ? 'Phiếu thu' : 'Phiếu chi',
        item.category,
        item.buildingCode || 'Chung tổ chức',
        item.description,
        item.entryType === 'INCOME' ? item.amountVnd : -item.amountVnd,
        item.recordedBy,
        formatOccurredAt(item.occurredAt),
      ])
    );
  };

  return (
    <div data-testid="finance-workspace-view" className="space-y-3">
      {/* Compact Header & Period Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#111827]">
        <CompactPeriodStepper
          selectedPeriod={selectedPeriod}
          onChangePeriod={onChangePeriod}
          shiftPeriodKey={shiftPeriodKey}
          testIdPrefix="finance"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="finance-export-csv"
            onClick={handleExportCsv}
            disabled={filteredEntries.length === 0}
            aria-label="Xuất CSV"
            title="Xuất CSV"
            className="inline-flex h-8 sm:h-9 w-8 sm:w-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white sm:px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Xuất CSV</span>
          </button>

          {canCreateLedger && (
            <button
              type="button"
              data-testid="btn-open-create-ledger"
              onClick={onOpenCreateLedger}
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-primary px-3 text-xs font-bold text-white shadow-sm hover:bg-brand-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sm:hidden">Ghi phiếu</span>
              <span className="hidden sm:inline">Ghi phiếu thu / chi</span>
            </button>
          )}
        </div>
      </div>

      {/* Unified Single-Row Search + Filter + 1-Button Toggle + Icon Refresh */}
      <WorkspaceSearchToolbar
        testIdPrefix="finance"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Tìm diễn giải, danh mục, tòa nhà, người ghi..."
        viewMode={viewMode}
        onToggleViewMode={() =>
          setViewMode((prev) => (prev === 'card' ? 'table' : 'card'))
        }
        isLoading={isLoading}
        onRefresh={onRefresh}
        activeFilterCount={activeFilterCount}
        isFilterOpen={isFilterOpen}
        onFilterOpenChange={setIsFilterOpen}
        refreshAriaLabel="Làm mới sổ quỹ"
        filterContent={
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Lọc sổ quỹ
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('ALL');
                    setBuildingFilter('ALL');
                    setCategoryFilter('ALL');
                  }}
                  className="text-[11px] font-semibold text-brand-primary hover:underline"
                >
                  Đặt lại
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">
                Loại bút toán
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'ALL' as const, label: 'Tất cả' },
                  { id: 'INCOME' as const, label: 'Phiếu thu' },
                  { id: 'EXPENSE' as const, label: 'Phiếu chi' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`finance-filter-type-${opt.id}`}
                    onClick={() => setTypeFilter(opt.id)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      typeFilter === opt.id
                        ? 'bg-brand-primary text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-500">
                Tòa nhà
              </label>
              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Tất cả tòa nhà</option>
                <option value="__ORG__">Chung toàn tổ chức</option>
                {activeBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>

            {categoryOptions.length > 0 && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">
                  Danh mục
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">Tất cả danh mục</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        }
      />

      {/* Compact 3-Metric Cashflow Strip + Flow Ratio Bar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111827] space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50/70 px-3 py-2 dark:bg-emerald-950/30">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>Tổng thu ({incomeCount})</span>
            </div>
            <div className="mt-0.5 text-sm sm:text-lg font-extrabold text-emerald-700 tabular-nums dark:text-emerald-400">
              +{summary.totalIncomeVnd.toLocaleString('vi-VN')} đ
            </div>
          </div>

          <div className="rounded-xl bg-rose-50/70 px-3 py-2 dark:bg-rose-950/30">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              <span>Tổng chi ({expenseCount})</span>
            </div>
            <div className="mt-0.5 text-sm sm:text-lg font-extrabold text-rose-600 tabular-nums dark:text-rose-400">
              -{summary.totalExpenseVnd.toLocaleString('vi-VN')} đ
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                <span>Lưu chuyển thuần</span>
              </span>
              {totalFlow > 0 && (
                <span className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                  Thu {incomeRatioPercent}%
                </span>
              )}
            </div>
            <div
              className={`mt-0.5 text-base sm:text-lg font-extrabold tabular-nums ${
                summary.netCashflowVnd >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {summary.netCashflowVnd >= 0 ? '+' : ''}
              {summary.netCashflowVnd.toLocaleString('vi-VN')} đ
            </div>
          </div>
        </div>

        <SettlementProgressBar
          value={incomeRatioPercent}
          max={100}
          ariaLabel="Tỷ lệ thu trên tổng lưu chuyển sổ quỹ"
          indicatorClassName="bg-emerald-500"
          trackClassName="bg-rose-100 dark:bg-rose-950/50"
        />
      </div>

      {/* Empty State */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-[#111827]">
          <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {entries.length === 0
              ? 'Chưa có bút toán thu / chi nào trong kỳ này.'
              : 'Không tìm thấy bút toán khớp bộ lọc hiện tại.'}
          </p>
        </div>
      ) : viewMode === 'card' ? (
        /* CARD VIEW (Mobile default) */
        <div data-testid="finance-card-list" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredEntries.map((item) => {
            const isIncome = item.entryType === 'INCOME';
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`finance-card-${item.id}`}
                onClick={() => setDetailEntry(item)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left transition-colors hover:border-brand-primary/40 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-[#111827] dark:hover:bg-slate-800/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        isIncome
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="h-3 w-3" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                      {isIncome ? 'Thu' : 'Chi'}
                    </span>
                    <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {item.category}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-extrabold tabular-nums ${
                      isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isIncome ? '+' : '-'}
                    {item.amountVnd.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                <p className="mt-1.5 line-clamp-2 text-xs text-slate-700 dark:text-slate-300">
                  {item.description}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400">
                    <Building2 className="h-3 w-3" />
                    {item.buildingCode || 'Chung tổ chức'}
                  </span>
                  <span>
                    {item.recordedBy} · {formatOccurredAt(item.occurredAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (Desktop default — isolated inline-size to prevent mobile horizontal leak) */
        <div
          data-testid="finance-table-view"
          className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]"
          style={{ contain: 'layout inline-size' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Danh mục &amp; Diễn giải</th>
                  <th className="px-4 py-3">Tòa nhà</th>
                  <th className="px-4 py-3">Người ghi &amp; Thời gian</th>
                  <th className="px-4 py-3 text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.map((item) => {
                  const isIncome = item.entryType === 'INCOME';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setDetailEntry(item)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                            isIncome
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {isIncome ? 'Phiếu thu' : 'Phiếu chi'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.category}
                        </div>
                        <div className="mt-0.5 max-w-md truncate text-[11.5px] text-slate-600 dark:text-slate-300">
                          {item.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                        {item.buildingCode || 'Chung tổ chức'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {item.recordedBy}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatOccurredAt(item.occurredAt)}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap text-right font-extrabold tabular-nums ${
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {item.amountVnd.toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Centered Ledger Voucher Detail Dialog */}
      <Dialog.Root
        open={Boolean(detailEntry)}
        onOpenChange={(open) => {
          if (!open) setDetailEntry(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm" />
          <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-4">
            <Dialog.Popup
              data-testid="finance-entry-detail-dialog"
              className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
            >
              {detailEntry && (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-brand-primary" />
                      <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white">
                        Chi tiết{' '}
                        {detailEntry.entryType === 'INCOME'
                          ? 'Phiếu thu'
                          : 'Phiếu chi'}
                      </Dialog.Title>
                    </div>
                    <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>

                  <div className="space-y-3 overflow-y-auto p-4 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/70">
                      <span className="text-slate-500">Số tiền bút toán</span>
                      <span
                        className={`text-lg font-extrabold tabular-nums ${
                          detailEntry.entryType === 'INCOME'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {detailEntry.entryType === 'INCOME' ? '+' : '-'}
                        {detailEntry.amountVnd.toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-slate-500">Danh mục</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {detailEntry.category}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-slate-500">Tòa nhà</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {detailEntry.buildingCode
                            ? `${detailEntry.buildingCode}${
                                detailEntry.buildingName
                                  ? ` · ${detailEntry.buildingName}`
                                  : ''
                              }`
                            : 'Chung toàn tổ chức'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="flex items-center gap-1 text-slate-500">
                          <UserCheck className="h-3.5 w-3.5" />
                          Người ghi
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {detailEntry.recordedBy}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="flex items-center gap-1 text-slate-500">
                          <Calendar className="h-3.5 w-3.5" />
                          Thời gian
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formatOccurredAt(detailEntry.occurredAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-slate-500">Mã chứng từ</span>
                        <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {detailEntry.entryCode}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Diễn giải
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                        {detailEntry.description}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
