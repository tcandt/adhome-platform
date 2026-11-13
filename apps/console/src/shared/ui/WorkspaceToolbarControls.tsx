import React, { useEffect, useState } from 'react';
import { Popover } from '@animate-ui/react/primitives/base-ui/popover';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import {
  formatPeriodDisplay,
  getCurrentVnPeriodKey,
} from '@/app/navigation/navigationConfig';

/**
 * Shared responsive Card/Table view mode hook:
 * defaults to Card on mobile (<768px) and Table on desktop (>=768px).
 */
export function useResponsiveViewMode(): [
  'card' | 'table',
  React.Dispatch<React.SetStateAction<'card' | 'table'>>,
] {
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table'
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setViewMode(e.matches ? 'card' : 'table');
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  return [viewMode, setViewMode];
}

export interface CompactPeriodStepperProps {
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (period: string, deltaMonths: number) => string;
  testIdPrefix?: string;
}

/** Compact Month/Year period stepper consistent on Mobile (< sm) and Desktop. */
export const CompactPeriodStepper: React.FC<CompactPeriodStepperProps> = ({
  selectedPeriod,
  onChangePeriod,
  shiftPeriodKey,
  testIdPrefix = 'module',
}) => {
  const currentPeriod = getCurrentVnPeriodKey();
  return (
    <div className="flex items-center gap-1.5">
      <div
        data-testid={`${testIdPrefix}-period-selector`}
        className="inline-flex h-8 sm:h-9 items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 sm:p-1 dark:bg-slate-800/80"
      >
        <button
          type="button"
          data-testid={`btn-${testIdPrefix}-period-prev`}
          aria-label="Kỳ trước"
          onClick={() => onChangePeriod(shiftPeriodKey(selectedPeriod, -1))}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <label className="relative inline-flex cursor-pointer items-center gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
          <span className="sm:hidden">
            T{selectedPeriod.slice(5, 7)}/{selectedPeriod.slice(0, 4)}
          </span>
          <span className="hidden sm:inline">
            Kỳ {formatPeriodDisplay(selectedPeriod)}
          </span>
          <input
            data-testid={`input-${testIdPrefix}-period`}
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
          data-testid={`btn-${testIdPrefix}-period-next`}
          aria-label="Kỳ sau"
          onClick={() => onChangePeriod(shiftPeriodKey(selectedPeriod, 1))}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {selectedPeriod !== currentPeriod && (
        <button
          type="button"
          onClick={() => onChangePeriod(currentPeriod)}
          className="hidden sm:inline-flex h-9 items-center rounded-xl bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 whitespace-nowrap"
        >
          Kỳ này
        </button>
      )}
    </div>
  );
};

export interface WorkspaceSearchToolbarProps {
  testIdPrefix: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  viewMode: 'card' | 'table';
  onToggleViewMode: () => void;
  isLoading: boolean;
  onRefresh: () => void;
  activeFilterCount?: number;
  isFilterOpen?: boolean;
  onFilterOpenChange?: (open: boolean) => void;
  filterContent?: React.ReactNode;
  refreshAriaLabel?: string;
}

/**
 * Single-row unified Search + Filter Popover Icon + Single View Toggle Icon + Refresh Icon.
 */
export const WorkspaceSearchToolbar: React.FC<WorkspaceSearchToolbarProps> = ({
  testIdPrefix,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  viewMode,
  onToggleViewMode,
  isLoading,
  onRefresh,
  activeFilterCount = 0,
  isFilterOpen,
  onFilterOpenChange,
  filterContent,
  refreshAriaLabel = 'Làm mới dữ liệu',
}) => {
  return (
    <div className="flex w-full items-center gap-1.5 sm:gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          data-testid={`input-search-${testIdPrefix}`}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary dark:border-slate-700 dark:bg-slate-800/80"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Xóa từ khóa tìm kiếm"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filterContent && (
        <Popover.Root open={isFilterOpen} onOpenChange={onFilterOpenChange}>
          <Button asChild hoverScale={1.03} tapScale={0.96}>
            <Popover.Trigger
              type="button"
              data-testid={`btn-${testIdPrefix}-filter`}
              aria-label={
                activeFilterCount > 0
                  ? `Bộ lọc (đang bật ${activeFilterCount})`
                  : 'Bộ lọc'
              }
              title="Bộ lọc"
              className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                activeFilterCount > 0
                  ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span
                  data-testid={`${testIdPrefix}-filter-badge`}
                  className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[9.5px] font-bold text-white shadow-xs"
                >
                  {activeFilterCount}
                </span>
              )}
            </Popover.Trigger>
          </Button>
          <Popover.Portal>
            <Popover.Positioner
              side="bottom"
              align="end"
              sideOffset={8}
              className="z-[90]"
            >
              <Popover.Popup
                data-testid={`${testIdPrefix}-filter-popover`}
                className="w-[272px] max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl outline-none dark:border-slate-700 dark:bg-[#111827]"
              >
                {filterContent}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}

      <Button
        type="button"
        hoverScale={1.03}
        tapScale={0.96}
        data-testid={`btn-${testIdPrefix}-view-toggle`}
        data-view-mode={viewMode}
        aria-label={
          viewMode === 'card'
            ? 'Đang xem dạng thẻ — nhấn để chuyển sang dạng bảng'
            : 'Đang xem dạng bảng — nhấn để chuyển sang dạng thẻ'
        }
        title={
          viewMode === 'card'
            ? 'Đang xem: Dạng thẻ (nhấn để đổi sang bảng)'
            : 'Đang xem: Dạng bảng (nhấn để đổi sang thẻ)'
        }
        onClick={onToggleViewMode}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-brand-primary transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        {viewMode === 'card' ? (
          <LayoutGrid className="h-4 w-4" />
        ) : (
          <Table2 className="h-4 w-4" />
        )}
      </Button>

      <Button
        type="button"
        hoverScale={1.03}
        tapScale={0.96}
        disabled={isLoading}
        data-testid={`btn-${testIdPrefix}-refresh`}
        aria-label={refreshAriaLabel}
        title="Làm mới"
        onClick={onRefresh}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        <RefreshCw
          className={`h-4 w-4 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
        />
      </Button>
    </div>
  );
};

/** Exports tabular data as UTF-8 BOM CSV cleanly in browser. */
export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\r\n');
  const blob = new Blob(['\uFEFF' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

