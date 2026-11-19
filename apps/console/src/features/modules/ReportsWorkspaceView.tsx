import React, { useMemo, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Popover } from '@animate-ui/react/primitives/base-ui/popover';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Coins,
  Download,
  Droplets,
  FileSpreadsheet,
  Loader2,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { SettlementProgressBar } from '@/shared/ui/SettlementAnimatePrimitives';
import {
  CompactPeriodStepper,
  WorkspaceSearchToolbar,
  downloadCsvFile,
  useResponsiveViewMode,
} from '@/shared/ui/WorkspaceToolbarControls';
import {
  exportRoomMatrixExcel,
  type RoomMatrixPayload,
} from './reportExcelExporter';

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
  // Bổ sung chi tiết Doanh thu & Thực thu
  invoicedRentVnd?: number;
  invoicedElectricVnd?: number;
  invoicedWaterVnd?: number;
  invoicedServiceVnd?: number;
  collectedRentVnd?: number;
  collectedElectricVnd?: number; // Tổng tiền điện thực thu
  collectedWaterVnd?: number;    // Tổng tiền nước thực thu
  collectedServiceVnd?: number;
  // Bổ sung chi tiết Chi phí
  electricExpenseVnd?: number;   // Tổng tiền điện đã chi
  waterExpenseVnd?: number;      // Tổng tiền nước đã chi
  generalExpenseVnd?: number;    // Chi phí vận hành
  totalExpenseVnd?: number;      // Tổng chi phí
}

interface ReportsWorkspaceViewProps {
  breakdown: ReportBuildingBreakdown[];
  roomMatrixData?: RoomMatrixPayload | null;
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (periodKey: string, deltaMonths: number) => string;
  isLoading: boolean;
  onRefresh: () => void;
}

type SortKey = 'COLLECTED_DESC' | 'RECEIVABLE_DESC' | 'OCCUPANCY_DESC' | 'CODE_ASC';

export const ReportsWorkspaceView: React.FC<ReportsWorkspaceViewProps> = ({
  breakdown,
  roomMatrixData,
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
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
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
        acc.collectedElectricVnd += b.collectedElectricVnd || 0;
        acc.collectedWaterVnd += b.collectedWaterVnd || 0;
        acc.electricExpenseVnd += b.electricExpenseVnd || 0;
        acc.waterExpenseVnd += b.waterExpenseVnd || 0;
        acc.generalExpenseVnd += b.generalExpenseVnd || 0;
        acc.totalExpenseVnd +=
          b.totalExpenseVnd !== undefined
            ? b.totalExpenseVnd
            : b.operatingExpenseVnd || 0;
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
        collectedElectricVnd: 0,
        collectedWaterVnd: 0,
        electricExpenseVnd: 0,
        waterExpenseVnd: 0,
        generalExpenseVnd: 0,
        totalExpenseVnd: 0,
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

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    setIsExportMenuOpen(false);
    try {
      await exportRoomMatrixExcel({
        roomMatrixData,
        activePeriod: selectedPeriod,
        breakdown: filteredBreakdown,
      });
      setExportFeedback('Đã xuất file Excel báo cáo theo phòng thành công!');
      setTimeout(() => setExportFeedback(null), 4000);
    } catch (err) {
      console.error('Lỗi xuất file Excel:', err);
      // Fallback
      handleExportCsv();
    } finally {
      setIsExportingExcel(false);
    }
  };

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
        'Thực thu tổng',
        'Điện thực thu',
        'Nước thực thu',
        'Công nợ chưa thu',
        'Điện đã chi',
        'Nước đã chi',
        'Chi phí vận hành',
        'Tổng chi phí',
        'Lãi gộp kỳ',
      ],
      filteredBreakdown.map((b) => {
        const exp = b.totalExpenseVnd || b.operatingExpenseVnd || 0;
        const net = b.netResultVnd !== undefined ? b.netResultVnd : b.collectedVnd - exp;
        return [
          b.buildingCode,
          b.buildingName,
          `${b.occupiedRooms}/${b.totalRooms}`,
          b.occupancyRatePercent,
          b.contractedRentVnd,
          b.invoicedVnd,
          b.collectedVnd,
          b.collectedElectricVnd || 0,
          b.collectedWaterVnd || 0,
          b.receivableVnd,
          b.electricExpenseVnd || 0,
          b.waterExpenseVnd || 0,
          b.generalExpenseVnd || 0,
          exp,
          net,
        ];
      })
    );
  };

  return (
    <div data-testid="reports-workspace-view" className="space-y-3">
      {/* Export feedback toast */}
      {exportFeedback && (
        <div className="px-3.5 py-2.5 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium">{exportFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportFeedback(null)}
            className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact Header & Period Stepper */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white p-1.5 sm:px-3 sm:py-2.5 dark:border-slate-800 dark:bg-[#111827]">
        <CompactPeriodStepper
          selectedPeriod={selectedPeriod}
          onChangePeriod={onChangePeriod}
          shiftPeriodKey={shiftPeriodKey}
          testIdPrefix="reports"
          fullWidth
        />

        {/* Export Popover Menu (@animate-ui/react Popover) */}
        <Popover.Root open={isExportMenuOpen} onOpenChange={setIsExportMenuOpen}>
          <Popover.Trigger
            type="button"
            data-testid="reports-export-btn"
            aria-label="Xuất báo cáo"
            title="Xuất báo cáo theo phòng hoặc CSV"
            disabled={filteredBreakdown.length === 0 || isExportingExcel}
            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-50 shadow-xs transition-colors text-xs font-semibold shrink-0 cursor-pointer"
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="hidden sm:inline">Xuất báo cáo</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[120]">
              <Popover.Popup className="w-84 rounded-2xl border border-slate-200 bg-white p-2 text-xs shadow-2xl dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 space-y-1">
                <div className="px-2.5 py-1.5 font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span>Tùy chọn xuất báo cáo</span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full">
                    Kỳ {selectedPeriod}
                  </span>
                </div>

                {/* Option 1: Excel Room Matrix (Mẫu chuẩn theo phòng) */}
                <button
                  type="button"
                  data-testid="reports-export-excel-matrix"
                  onClick={() => void handleExportExcel()}
                  disabled={isExportingExcel}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex items-start gap-2.5 group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 shrink-0 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Báo cáo theo phòng (Excel .xlsx)</span>
                      <span className="text-[10px] bg-emerald-500 text-white font-semibold px-1 py-0.2 rounded text-center">
                        Mẫu chuẩn
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                      Chi tiết mỗi phòng: Tiền thuê, Tiền điện, Tiền nước, Phí MG, Tiền cọc theo ngày & 12 tháng.
                    </div>
                  </div>
                </button>

                {/* Option 2: CSV Tổng hợp tòa nhà */}
                <button
                  type="button"
                  data-testid="reports-export-csv"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleExportCsv();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors flex items-start gap-2.5 group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                    <Download className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      Bảng tổng hợp tòa nhà (CSV)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                      Tổng hợp doanh thu, công nợ, chi phí theo từng tòa nhà.
                    </div>
                  </div>
                </button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
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
            const operatingExp = b.totalExpenseVnd || b.operatingExpenseVnd || 0;
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

                {/* Sub-row: Chi tiết Điện - Nước thực thu & Chi phí */}
                <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100/80 px-2.5 py-1 text-[10.5px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    Thu điện: <strong>{(b.collectedElectricVnd || 0).toLocaleString('vi-VN')} đ</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Droplets className="h-3 w-3 text-cyan-500" />
                    Thu nước: <strong>{(b.collectedWaterVnd || 0).toLocaleString('vi-VN')} đ</strong>
                  </span>
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
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="px-4 py-3">Tòa nhà</th>
                  <th className="px-3 py-3 text-center">Lấp đầy</th>
                  <th className="px-3 py-3 text-right">Thuê HĐ</th>
                  <th className="px-3 py-3 text-right">Đã lập HĐ</th>
                  <th className="px-3 py-3 text-right">Thực thu (Điện/Nước)</th>
                  <th className="px-3 py-3 text-right">Công nợ</th>
                  <th className="px-3 py-3 text-right">Chi phí (Điện/Nước/VH)</th>
                  <th className="px-4 py-3 text-right">Lãi gộp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBreakdown.map((b) => {
                  const operatingExp = b.totalExpenseVnd || b.operatingExpenseVnd || 0;
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
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                          {b.collectedVnd.toLocaleString('vi-VN')} đ
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          ⚡{(b.collectedElectricVnd || 0).toLocaleString('vi-VN')} • 💧{(b.collectedWaterVnd || 0).toLocaleString('vi-VN')}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-rose-500 tabular-nums">
                        {b.receivableVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="tabular-nums text-slate-600 dark:text-slate-300 font-semibold">
                          {operatingExp.toLocaleString('vi-VN')} đ
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          ⚡{(b.electricExpenseVnd || 0).toLocaleString('vi-VN')} • 💧{(b.waterExpenseVnd || 0).toLocaleString('vi-VN')}
                        </div>
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
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <div className="text-emerald-600 tabular-nums dark:text-emerald-400">
                      {totals.collectedVnd.toLocaleString('vi-VN')} đ
                    </div>
                    <div className="text-[10px] font-normal text-slate-500 tabular-nums">
                      ⚡{(totals.collectedElectricVnd || 0).toLocaleString('vi-VN')} • 💧{(totals.collectedWaterVnd || 0).toLocaleString('vi-VN')}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right text-rose-600 tabular-nums">
                    {totals.receivableVnd.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <div className="tabular-nums">
                      {(totals.totalExpenseVnd || totals.operatingExpenseVnd).toLocaleString('vi-VN')} đ
                    </div>
                    <div className="text-[10px] font-normal text-slate-500 tabular-nums">
                      ⚡{(totals.electricExpenseVnd || 0).toLocaleString('vi-VN')} • 💧{(totals.waterExpenseVnd || 0).toLocaleString('vi-VN')}
                    </div>
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
              className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
            >
              {selectedBuilding && (() => {
                const b = selectedBuilding;
                const invoicedTotal = b.invoicedVnd || 0;
                const collectedTotal = b.collectedVnd || 0;
                const receivableTotal = b.receivableVnd || 0;

                // Chi tiết Thực thu
                const collectedElectric = b.collectedElectricVnd || 0;
                const collectedWater = b.collectedWaterVnd || 0;
                const collectedRent = b.collectedRentVnd || 0;
                const collectedService = b.collectedServiceVnd || 0;

                // Chi tiết Đã lập hóa đơn
                const invoicedElectric = b.invoicedElectricVnd || 0;
                const invoicedWater = b.invoicedWaterVnd || 0;
                const invoicedRent = b.invoicedRentVnd || 0;
                const invoicedService = b.invoicedServiceVnd || 0;

                // Chi tiết Chi phí
                const electricExp = b.electricExpenseVnd || 0;
                const waterExp = b.waterExpenseVnd || 0;
                const generalExp =
                  b.generalExpenseVnd !== undefined
                    ? b.generalExpenseVnd
                    : Math.max(0, (b.operatingExpenseVnd || 0) - (electricExp + waterExp));
                const totalExp =
                  b.totalExpenseVnd !== undefined
                    ? b.totalExpenseVnd
                    : b.operatingExpenseVnd || (electricExp + waterExp + generalExp);

                // Lãi gộp & Hiệu quả
                const netProfit =
                  b.netResultVnd !== undefined
                    ? b.netResultVnd
                    : collectedTotal - totalExp;

                // Chênh lệch điện nước
                const electricSpread = collectedElectric - electricExp;
                const waterSpread = collectedWater - waterExp;

                const pct =
                  invoicedTotal > 0
                    ? Math.round((collectedTotal / invoicedTotal) * 100)
                    : 0;

                const marginPercent =
                  collectedTotal > 0
                    ? Math.round((netProfit / collectedTotal) * 100)
                    : 0;

                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-brand-primary/10 p-1.5 text-brand-primary">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                          <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white">
                            Chi tiết P&amp;L — {b.buildingCode}
                          </Dialog.Title>
                          <div className="text-[11px] text-slate-500">
                            {b.buildingName} • Kỳ {selectedPeriod}
                          </div>
                        </div>
                      </div>
                      <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>

                    <div className="space-y-3.5 overflow-y-auto p-4 text-xs">
                      {/* CARD 1: THÔNG TIN TÒA NHÀ & TIẾN ĐỘ THU */}
                      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Lấp đầy: {b.occupiedRooms}/{b.totalRooms} phòng ({b.occupancyRatePercent}%)
                          </span>
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
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
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2.5 text-center text-[11px] dark:border-slate-700/60">
                          <div>
                            <div className="text-slate-400">Thuê HĐ</div>
                            <div className="mt-0.5 font-bold tabular-nums text-slate-800 dark:text-slate-200">
                              {b.contractedRentVnd.toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400">Đã lập HĐ</div>
                            <div className="mt-0.5 font-bold tabular-nums text-slate-800 dark:text-slate-200">
                              {invoicedTotal.toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400">Công nợ chưa thu</div>
                            <div
                              className={`mt-0.5 font-bold tabular-nums ${
                                receivableTotal > 0 ? 'text-rose-600' : 'text-slate-500'
                              }`}
                            >
                              {receivableTotal.toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CARD 2: DOANH THU & THỰC THU (TIỀN VÀO) */}
                      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                            <span>1. DOANH THU &amp; THỰC THU</span>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 tabular-nums">
                            +{collectedTotal.toLocaleString('vi-VN')} đ
                          </span>
                        </div>

                        <div className="mt-2.5 divide-y divide-emerald-100/70 dark:divide-emerald-900/30">
                          {/* Tiền phòng */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="font-medium text-slate-700 dark:text-slate-200">
                                Tiền thuê phòng
                              </div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                Đã lập HĐ: {invoicedRent.toLocaleString('vi-VN')} đ
                              </div>
                            </div>
                            <div className="font-semibold tabular-nums text-slate-900 dark:text-white">
                              +{collectedRent.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Tổng tiền điện thực thu */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                                <Zap className="h-3.5 w-3.5 text-amber-500" />
                                <span>Tổng tiền điện thực thu</span>
                              </div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                Đã lập HĐ: {invoicedElectric.toLocaleString('vi-VN')} đ
                              </div>
                            </div>
                            <div className="font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
                              +{collectedElectric.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Tổng tiền nước thực thu */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="flex items-center gap-1 font-semibold text-cyan-700 dark:text-cyan-400">
                                <Droplets className="h-3.5 w-3.5 text-cyan-500" />
                                <span>Tổng tiền nước thực thu</span>
                              </div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                Đã lập HĐ: {invoicedWater.toLocaleString('vi-VN')} đ
                              </div>
                            </div>
                            <div className="font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
                              +{collectedWater.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Phí dịch vụ & khác nếu có */}
                          {(invoicedService > 0 || collectedService > 0) && (
                            <div className="flex items-center justify-between py-1.5">
                              <div>
                                <div className="text-slate-600 dark:text-slate-300">
                                  Phí dịch vụ &amp; khoản khác
                                </div>
                                <div className="text-[10px] text-slate-400 tabular-nums">
                                  Đã lập HĐ: {invoicedService.toLocaleString('vi-VN')} đ
                                </div>
                              </div>
                              <div className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                +{collectedService.toLocaleString('vi-VN')} đ
                              </div>
                            </div>
                          )}

                          {/* Tổng kết thu */}
                          <div className="flex items-center justify-between pt-2">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              Tổng thực thu trong kỳ
                            </span>
                            <span className="text-sm font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">
                              +{collectedTotal.toLocaleString('vi-VN')} đ
                            </span>
                          </div>

                          {/* Công nợ chưa thu */}
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-slate-500">
                              Công nợ chưa thu (Phải thu còn lại)
                            </span>
                            <span
                              className={`font-bold tabular-nums ${
                                receivableTotal > 0 ? 'text-rose-600' : 'text-slate-500'
                              }`}
                            >
                              {receivableTotal.toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* CARD 3: CHI PHÍ ĐÃ CHI (TIỀN RA) */}
                      <div className="rounded-2xl border border-rose-200/80 bg-rose-50/30 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-300">
                            <TrendingDown className="h-4 w-4 text-rose-600" />
                            <span>2. CHI PHÍ ĐÃ CHI</span>
                          </div>
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 tabular-nums">
                            -{totalExp.toLocaleString('vi-VN')} đ
                          </span>
                        </div>

                        <div className="mt-2.5 divide-y divide-rose-100/70 dark:divide-rose-900/30">
                          {/* Tổng tiền điện đã chi */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                                <Zap className="h-3.5 w-3.5 text-rose-500" />
                                <span>Tổng tiền điện đã chi</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Thanh toán EVN / Hóa đơn điện lực
                              </div>
                            </div>
                            <div className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                              -{electricExp.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Tổng tiền nước đã chi */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                                <Droplets className="h-3.5 w-3.5 text-rose-500" />
                                <span>Tổng tiền nước đã chi</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Thanh toán đơn vị cấp nước sinh hoạt
                              </div>
                            </div>
                            <div className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                              -{waterExp.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Chi phí vận hành */}
                          <div className="flex items-center justify-between py-1.5">
                            <div>
                              <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                                <Wrench className="h-3.5 w-3.5 text-amber-600" />
                                <span>Chi phí vận hành</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Bảo trì, sửa chữa, tạp vụ, internet, rác...
                              </div>
                            </div>
                            <div className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                              -{generalExp.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Tổng chi phí */}
                          <div className="flex items-center justify-between pt-2">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              Tổng chi phí trong kỳ
                            </span>
                            <span className="text-sm font-extrabold text-rose-600 tabular-nums dark:text-rose-400">
                              -{totalExp.toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* CARD 4: ĐỐI SOÁT CHÊNH LỆCH ĐIỆN NƯỚC (HIỆU QUẢ DỊCH VỤ) */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            <span className="flex items-center gap-1">
                              <Zap className="h-3.5 w-3.5 text-amber-500" />
                              Điện
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                                electricSpread >= 0
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {electricSpread >= 0 ? 'Thặng dư' : 'Bù lỗ'}
                            </span>
                          </div>
                          <div className="mt-1.5 space-y-0.5 text-[10.5px] text-slate-500 tabular-nums">
                            <div className="flex justify-between">
                              <span>Thu:</span>
                              <span className="font-medium text-emerald-600">
                                +{collectedElectric.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Chi:</span>
                              <span className="font-medium text-rose-600">
                                -{electricExp.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 border-t border-slate-200/60 pt-1 flex justify-between text-[11px] font-bold dark:border-slate-700/60">
                            <span>Chênh lệch:</span>
                            <span
                              className={`tabular-nums ${
                                electricSpread >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {electricSpread >= 0 ? '+' : ''}
                              {electricSpread.toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            <span className="flex items-center gap-1">
                              <Droplets className="h-3.5 w-3.5 text-cyan-500" />
                              Nước
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                                waterSpread >= 0
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {waterSpread >= 0 ? 'Thặng dư' : 'Bù lỗ'}
                            </span>
                          </div>
                          <div className="mt-1.5 space-y-0.5 text-[10.5px] text-slate-500 tabular-nums">
                            <div className="flex justify-between">
                              <span>Thu:</span>
                              <span className="font-medium text-emerald-600">
                                +{collectedWater.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Chi:</span>
                              <span className="font-medium text-rose-600">
                                -{waterExp.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 border-t border-slate-200/60 pt-1 flex justify-between text-[11px] font-bold dark:border-slate-700/60">
                            <span>Chênh lệch:</span>
                            <span
                              className={`tabular-nums ${
                                waterSpread >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {waterSpread >= 0 ? '+' : ''}
                              {waterSpread.toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* CARD 5: KẾT QUẢ KINH DOANH — LÃI GỘP */}
                      <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50 p-4 shadow-sm dark:border-emerald-500/40 dark:from-emerald-950/40 dark:via-[#111827] dark:to-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            LÃI GỘP (Thực thu − Chi phí)
                          </span>
                          <span className="rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10.5px] font-extrabold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                            Tỷ suất: {marginPercent}%
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                          Thực thu (+{collectedTotal.toLocaleString('vi-VN')} đ) − Chi phí (-{totalExp.toLocaleString('vi-VN')} đ)
                        </div>
                        <div
                          className={`mt-2 text-xl font-black tabular-nums sm:text-2xl ${
                            netProfit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {netProfit >= 0 ? '+' : ''}
                          {netProfit.toLocaleString('vi-VN')} đ
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
