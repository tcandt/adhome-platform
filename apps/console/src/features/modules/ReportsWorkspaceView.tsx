import React, { useMemo, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import {
  BarChart3,
  Building2,
  Download,
  TrendingUp,
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

export interface ReportBuildingBreakdown {
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
  operatingExpenseVnd?: number;
  netResultVnd?: number;
}

interface ReportsWorkspaceViewProps {
  breakdown: ReportBuildingBreakdown[];
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (periodKey: string, deltaMonths: number) => string;
  isLoading: boolean;
  onRefresh: () => void;
}

type SortKey = 'COLLECTED_DESC' | 'RECEIVABLE_DESC' | 'OCCUPANCY_DESC' | 'CODE_ASC';

export const ReportsWorkspaceView: React.FC<ReportsWorkspaceViewProps> = ({
  breakdown,
  selectedPeriod,
  onChangePeriod,
  shiftPeriodKey,
  isLoading,
  onRefresh,
}) => {
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'ALL' | 'HAS_DEBT' | 'SETTLED'>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('COLLECTED_DESC');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] =
    useState<ReportBuildingBreakdown | null>(null);

  const activeFilterCount =
    (debtFilter !== 'ALL' ? 1 : 0) + (sortBy !== 'COLLECTED_DESC' ? 1 : 0);

  const filteredBreakdown = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase('vi');
    const items = breakdown.filter((b) => {
      if (debtFilter === 'HAS_DEBT' && b.receivableVnd <= 0) return false;
      if (debtFilter === 'SETTLED' && b.receivableVnd > 0) return false;
      if (!normalized) return true;
      return [b.buildingCode, b.buildingName].some((val) =>
        val.toLocaleLowerCase('vi').includes(normalized)
      );
    });

    items.sort((a, b) => {
      if (sortBy === 'RECEIVABLE_DESC') return b.receivableVnd - a.receivableVnd;
      if (sortBy === 'OCCUPANCY_DESC')
        return b.occupancyRatePercent - a.occupancyRatePercent;
      if (sortBy === 'CODE_ASC')
        return a.buildingCode.localeCompare(b.buildingCode, 'vi');
      return b.collectedVnd - a.collectedVnd;
    });
    return items;
  }, [breakdown, searchQuery, debtFilter, sortBy]);

  const totals = useMemo(() => {
    return filteredBreakdown.reduce(
      (acc, b) => {
        acc.totalRooms += b.totalRooms;
        acc.occupiedRooms += b.occupiedRooms;
        acc.contractedRentVnd += b.contractedRentVnd;
        acc.invoicedVnd += b.invoicedVnd;
        acc.collectedVnd += b.collectedVnd;
        acc.receivableVnd += b.receivableVnd;
        acc.operatingExpenseVnd += b.operatingExpenseVnd || 0;
        acc.netResultVnd +=
          b.netResultVnd !== undefined
            ? b.netResultVnd
            : b.collectedVnd - (b.operatingExpenseVnd || 0);
        return acc;
      },
      {
        totalRooms: 0,
        occupiedRooms: 0,
        contractedRentVnd: 0,
        invoicedVnd: 0,
        collectedVnd: 0,
        receivableVnd: 0,
        operatingExpenseVnd: 0,
        netResultVnd: 0,
      }
    );
  }, [filteredBreakdown]);

  const avgOccupancyPercent =
    totals.totalRooms > 0
      ? Math.round((totals.occupiedRooms / totals.totalRooms) * 100)
      : 0;
  const collectionRatePercent =
    totals.invoicedVnd > 0
      ? Math.round((totals.collectedVnd / totals.invoicedVnd) * 100)
      : 0;

  const handleExportCsv = () => {
    downloadCsvFile(
      `bao-cao-doanh-thu-${selectedPeriod}.csv`,
      [
        'Mã tòa',
        'Tên tòa nhà',
        'Lấp đầy',
        'Tỷ lệ (%)',
        'Tiền thuê HĐ',
        'Đã lập HĐ',
        'Thực thu',
        'Công nợ',
        'Chi phí VH',
        'Lãi gộp kỳ',
      ],
      filteredBreakdown.map((b) => {
        const exp = b.operatingExpenseVnd || 0;
        const net = b.netResultVnd !== undefined ? b.netResultVnd : b.collectedVnd - exp;
        return [
          b.buildingCode,
          b.buildingName,
          `${b.occupiedRooms}/${b.totalRooms}`,
          b.occupancyRatePercent,
          b.contractedRentVnd,
          b.invoicedVnd,
          b.collectedVnd,
          b.receivableVnd,
          exp,
          net,
        ];
      })
    );
  };

  return (
    <div data-testid="reports-workspace-view" className="space-y-3">
      {/* Compact Header & Period Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#111827]">
        <CompactPeriodStepper
          selectedPeriod={selectedPeriod}
          onChangePeriod={onChangePeriod}
          shiftPeriodKey={shiftPeriodKey}
          testIdPrefix="reports"
        />

        <button
          type="button"
          data-testid="reports-export-csv"
          onClick={handleExportCsv}
          disabled={filteredBreakdown.length === 0}
          className="inline-flex h-8 sm:h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Xuất CSV</span>
        </button>
      </div>

      {/* Unified Single-Row Search + Filter/Sort + 1-Button Toggle + Icon Refresh */}
      <WorkspaceSearchToolbar
        testIdPrefix="reports"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Tìm mã tòa, tên tòa nhà..."
        viewMode={viewMode}
        onToggleViewMode={() =>
          setViewMode((prev) => (prev === 'card' ? 'table' : 'card'))
        }
        isLoading={isLoading}
        onRefresh={onRefresh}
        activeFilterCount={activeFilterCount}
        isFilterOpen={isFilterOpen}
        onFilterOpenChange={setIsFilterOpen}
        refreshAriaLabel="Làm mới báo cáo"
        filterContent={
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Lọc &amp; Sắp xếp tòa nhà
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDebtFilter('ALL');
                    setSortBy('COLLECTED_DESC');
                  }}
                  className="text-[11px] font-semibold text-brand-primary hover:underline"
                >
                  Đặt lại
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">
                Trạng thái công nợ
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'ALL' as const, label: 'Tất cả' },
                  { id: 'HAS_DEBT' as const, label: 'Còn nợ' },
                  { id: 'SETTLED' as const, label: 'Thu đủ' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDebtFilter(opt.id)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      debtFilter === opt.id
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
                Sắp xếp theo
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="COLLECTED_DESC">Thực thu cao nhất</option>
                <option value="RECEIVABLE_DESC">Công nợ cao nhất</option>
                <option value="OCCUPANCY_DESC">Lấp đầy cao nhất</option>
                <option value="CODE_ASC">Mã tòa (A → Z)</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Portfolio 4-Metric KPI Strip */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Tỷ lệ lấp đầy</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {totals.occupiedRooms}/{totals.totalRooms}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-base sm:text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
              {avgOccupancyPercent}%
            </span>
            <span className="text-[11px] text-slate-400">
              {filteredBreakdown.length} tòa
            </span>
          </div>
          <div className="mt-2">
            <SettlementProgressBar
              value={avgOccupancyPercent}
              ariaLabel="Tỷ lệ lấp đầy toàn danh mục"
              indicatorClassName="bg-brand-primary"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span>Tiền thuê theo HĐ</span>
          </div>
          <div className="mt-1 text-base sm:text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
            {totals.contractedRentVnd.toLocaleString('vi-VN')} đ
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            Đã lập HĐ: {totals.invoicedVnd.toLocaleString('vi-VN')} đ
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Thực thu kỳ
            </span>
            <span className="font-bold">{collectionRatePercent}%</span>
          </div>
          <div className="mt-1 text-base sm:text-xl font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
            {totals.collectedVnd.toLocaleString('vi-VN')} đ
          </div>
          <div className="mt-2">
            <SettlementProgressBar
              value={collectionRatePercent}
              ariaLabel="Tỷ lệ thu tiền so với tổng đã lập hóa đơn"
              indicatorClassName="bg-emerald-500"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-amber-500" />
            <span>Công nợ &amp; Chi phí VH</span>
          </div>
          <div className="mt-1 text-base sm:text-xl font-extrabold text-rose-600 tabular-nums dark:text-rose-400">
            {totals.receivableVnd.toLocaleString('vi-VN')} đ
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            Chi phí: {totals.operatingExpenseVnd.toLocaleString('vi-VN')} đ
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredBreakdown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-[#111827]">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Không có dữ liệu tòa nhà phù hợp trong kỳ này.
          </p>
        </div>
      ) : viewMode === 'card' ? (
        /* CARD VIEW (Mobile default) */
        <div data-testid="reports-card-list" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredBreakdown.map((b) => {
            const pctCollected =
              b.invoicedVnd > 0
                ? Math.round((b.collectedVnd / b.invoicedVnd) * 100)
                : 0;
            const operatingExp = b.operatingExpenseVnd || 0;
            const netResult =
              b.netResultVnd !== undefined
                ? b.netResultVnd
                : b.collectedVnd - operatingExp;
            return (
              <button
                key={b.buildingId}
                type="button"
                data-testid={`report-card-${b.buildingCode}`}
                onClick={() => setSelectedBuilding(b)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left transition-colors hover:border-brand-primary/40 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-[#111827] dark:hover:bg-slate-800/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-[11px] font-extrabold text-brand-primary">
                        {b.buildingCode}
                      </span>
                      <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {b.buildingName}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Lấp đầy: {b.occupiedRooms}/{b.totalRooms} phòng (
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {b.occupancyRatePercent}%
                      </span>
                      )
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10.5px] font-semibold text-slate-400">
                      Thực thu
                    </div>
                    <div className="text-sm font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
                      {b.collectedVnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] dark:bg-slate-800/60">
                  <div>
                    <div className="text-slate-500">Đã lập HĐ</div>
                    <div className="font-bold text-slate-800 tabular-nums dark:text-slate-200">
                      {b.invoicedVnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Còn nợ</div>
                    <div
                      className={`font-bold tabular-nums ${
                        b.receivableVnd > 0 ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {b.receivableVnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Lãi gộp</div>
                    <div
                      className={`font-bold tabular-nums ${
                        netResult >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600'
                      }`}
                    >
                      {netResult.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <SettlementProgressBar
                    value={pctCollected}
                    ariaLabel={`Tiến độ thu tiền ${b.buildingCode}`}
                    indicatorClassName="bg-emerald-500"
                    className="flex-1"
                  />
                  <span className="text-[11px] font-bold text-slate-600 tabular-nums dark:text-slate-300">
                    {pctCollected}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (Desktop default — isolated inline-size) */
        <div
          data-testid="reports-table-view"
          className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]"
          style={{ contain: 'layout inline-size' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="px-4 py-3">Tòa nhà</th>
                  <th className="px-3 py-3 text-center">Lấp đầy</th>
                  <th className="px-3 py-3 text-right">Thuê HĐ</th>
                  <th className="px-3 py-3 text-right">Đã lập HĐ</th>
                  <th className="px-3 py-3 text-right">Thực thu</th>
                  <th className="px-3 py-3 text-right">Công nợ</th>
                  <th className="px-3 py-3 text-right">Chi phí VH</th>
                  <th className="px-4 py-3 text-right">Lãi gộp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBreakdown.map((b) => {
                  const operatingExp = b.operatingExpenseVnd || 0;
                  const netResult =
                    b.netResultVnd !== undefined
                      ? b.netResultVnd
                      : b.collectedVnd - operatingExp;
                  return (
                    <tr
                      key={b.buildingId}
                      onClick={() => setSelectedBuilding(b)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {b.buildingCode}
                        </span>
                        <span className="ml-1.5 text-slate-500">
                          {b.buildingName}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-center font-semibold">
                        <span>
                          {b.occupiedRooms}/{b.totalRooms}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-400">
                          ({b.occupancyRatePercent}%)
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {b.contractedRentVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right font-semibold tabular-nums">
                        {b.invoicedVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {b.collectedVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-rose-500 tabular-nums">
                        {b.receivableVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {operatingExp.toLocaleString('vi-VN')} đ
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap text-right font-extrabold tabular-nums ${
                          netResult >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {netResult.toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-extrabold text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white">
                  <td className="px-4 py-3 whitespace-nowrap">
                    Tổng cộng ({filteredBreakdown.length} tòa)
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    {totals.occupiedRooms}/{totals.totalRooms} ({avgOccupancyPercent}%)
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums">
                    {totals.contractedRentVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums">
                    {totals.invoicedVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right text-emerald-600 tabular-nums dark:text-emerald-400">
                    {totals.collectedVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right text-rose-600 tabular-nums">
                    {totals.receivableVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums">
                    {totals.operatingExpenseVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                    {totals.netResultVnd.toLocaleString('vi-VN')} đ
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Centered Building P&L Detail Dialog */}
      <Dialog.Root
        open={Boolean(selectedBuilding)}
        onOpenChange={(open) => {
          if (!open) setSelectedBuilding(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm" />
          <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-4">
            <Dialog.Popup
              data-testid="report-building-detail-dialog"
              className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
            >
              {selectedBuilding && (() => {
                const exp = selectedBuilding.operatingExpenseVnd || 0;
                const net =
                  selectedBuilding.netResultVnd !== undefined
                    ? selectedBuilding.netResultVnd
                    : selectedBuilding.collectedVnd - exp;
                const pct =
                  selectedBuilding.invoicedVnd > 0
                    ? Math.round(
                        (selectedBuilding.collectedVnd /
                          selectedBuilding.invoicedVnd) *
                          100
                      )
                    : 0;
                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-brand-primary" />
                        <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white">
                          Chi tiết P&amp;L — {selectedBuilding.buildingCode}
                        </Dialog.Title>
                      </div>
                      <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>

                    <div className="space-y-3 overflow-y-auto p-4 text-xs">
                      <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/70">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {selectedBuilding.buildingName}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Lấp đầy {selectedBuilding.occupiedRooms}/
                            {selectedBuilding.totalRooms} phòng (
                            {selectedBuilding.occupancyRatePercent}%)
                          </span>
                          <span className="font-bold text-emerald-600">
                            Thu {pct}%
                          </span>
                        </div>
                        <div className="mt-2">
                          <SettlementProgressBar
                            value={pct}
                            ariaLabel="Tỷ lệ thu tiền tòa nhà"
                            indicatorClassName="bg-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-slate-500">Tiền thuê HĐ</span>
                          <span className="font-semibold tabular-nums">
                            {selectedBuilding.contractedRentVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-slate-500">Tổng đã lập hóa đơn</span>
                          <span className="font-semibold tabular-nums">
                            {selectedBuilding.invoicedVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-slate-500">Thực thu trong kỳ</span>
                          <span className="font-bold text-emerald-600 tabular-nums">
                            +{selectedBuilding.collectedVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-slate-500">Công nợ chưa thu</span>
                          <span className="font-bold text-rose-500 tabular-nums">
                            {selectedBuilding.receivableVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-slate-500">Chi phí vận hành</span>
                          <span className="font-semibold text-rose-600 tabular-nums">
                            -{exp.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2.5 font-extrabold dark:bg-slate-800/40">
                          <span className="text-slate-900 dark:text-white">
                            Lãi gộp (Thực thu − Chi phí)
                          </span>
                          <span
                            className={`tabular-nums ${
                              net >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600'
                            }`}
                          >
                            {net >= 0 ? '+' : ''}
                            {net.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
