import React, { useEffect, useMemo, useState } from 'react';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import { Popover } from '@animate-ui/react/primitives/base-ui/popover';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  FileSignature,
  FileText,
  Filter,
  LayoutGrid,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { ContractDocumentLink } from '@/shared/ui/ContractDocumentDialog';
import { SettlementProgressBar } from '@/shared/ui/SettlementAnimatePrimitives';
import {
  formatContractDisplayCode,
  formatWaterBillingLabel,
} from '@/shared/tokens/designTokens';

export interface ContractListItem {
  id: string;
  contractCode: string;
  buildingCode: string;
  roomId: string;
  roomCode: string;
  tenantName: string;
  tenantPhone: string;
  occupants?: Array<{ id: string; fullName: string; relationToPrimary: string }>;
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
  missingDocumentFields?: string[];
  documentStatus?: 'COMPLETE' | 'INCOMPLETE';
}

interface ContractsWorkspaceViewProps {
  contracts: ContractListItem[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onOpenHandover: (contract: ContractListItem) => void;
  onOpenExtend: (contract: ContractListItem) => void;
  onOpenTransfer: (contract: ContractListItem) => void;
  onOpenTerminate: (contract: ContractListItem) => void;
}

type ContractStatusFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'EXPIRING' | 'TERMINATED';

const STATUS_FILTER_OPTIONS: Array<{ id: ContractStatusFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả trạng thái' },
  { id: 'ACTIVE', label: 'Đang hiệu lực' },
  { id: 'DRAFT', label: 'Chờ bàn giao' },
  { id: 'EXPIRING', label: 'Sắp hết hạn' },
  { id: 'TERMINATED', label: 'Đã thanh lý' },
];

function getContractStatusBadge(status: string) {
  if (status === 'ACTIVE' || status === 'EXTENDED') {
    return {
      label: 'Đang hiệu lực',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    };
  }
  if (status === 'DRAFT') {
    return {
      label: 'Chờ bàn giao',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    };
  }
  if (status === 'EXPIRING') {
    return {
      label: 'Sắp hết hạn',
      cls: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    };
  }
  return {
    label: 'Đã thanh lý',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
}

function matchesStatusFilter(status: string, filter: ContractStatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'ACTIVE') return status === 'ACTIVE' || status === 'EXTENDED';
  if (filter === 'DRAFT') return status === 'DRAFT';
  if (filter === 'EXPIRING') return status === 'EXPIRING';
  return status === 'TERMINATED' || status === 'EXPIRED';
}

export const ContractsWorkspaceView: React.FC<ContractsWorkspaceViewProps> = ({
  contracts,
  isLoading,
  onRefresh,
  onOpenHandover,
  onOpenExtend,
  onOpenTransfer,
  onOpenTerminate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contractStatusFilter, setContractStatusFilter] =
    useState<ContractStatusFilter>('ALL');
  const [onlyMissingDoc, setOnlyMissingDoc] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table'
  );
  const [expandedMissingIds, setExpandedMissingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setViewMode(e.matches ? 'card' : 'table');
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const missingDocCount = useMemo(
    () => contracts.filter((c) => (c.missingDocumentFields?.length || 0) > 0).length,
    [contracts]
  );

  const completeDocCount = Math.max(0, contracts.length - missingDocCount);
  const docCompletionRate =
    contracts.length > 0
      ? Math.round((completeDocCount / contracts.length) * 100)
      : 100;

  const activeFilterCount =
    (contractStatusFilter !== 'ALL' ? 1 : 0) + (onlyMissingDoc ? 1 : 0);

  const displayedContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contracts.filter((c) => {
      if (!matchesStatusFilter(c.status, contractStatusFilter)) return false;

      if (onlyMissingDoc && (c.missingDocumentFields?.length || 0) === 0) {
        return false;
      }

      if (!q) return true;
      const { displayCode, rawCode } = formatContractDisplayCode(c.contractCode);
      const haystack = [
        displayCode,
        rawCode,
        c.buildingCode,
        c.roomCode,
        `${c.buildingCode} ${c.roomCode}`,
        c.tenantName,
        c.tenantPhone,
        ...(c.occupants || []).map((o) => o.fullName),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [contracts, contractStatusFilter, onlyMissingDoc, searchQuery]);

  const buildActionItems = (c: ContractListItem, mobile = false) => [
    ...(c.status === 'DRAFT'
      ? [
        {
          label: 'Bàn giao phòng',
          variant: 'primary' as const,
          testId: mobile ? `btn-open-handover-mobile-${c.id}` : 'action-handover-item',
          onClick: () => onOpenHandover(c),
        },
      ]
      : []),
    ...(c.status === 'ACTIVE' || c.status === 'EXTENDED' || c.status === 'EXPIRING'
      ? [
        {
          label: 'Gia hạn hợp đồng',
          onClick: () => onOpenExtend(c),
        },
        {
          label: 'Đổi phòng',
          onClick: () => onOpenTransfer(c),
        },
        {
          label: 'Thanh lý hợp đồng',
          variant: 'danger' as const,
          onClick: () => onOpenTerminate(c),
        },
      ]
      : []),
  ];

  const renderMissingSummary = (c: ContractListItem, mode: 'card' | 'table') => {
    const missing = c.missingDocumentFields || [];
    if (missing.length === 0) {
      return (
        <span
          data-testid={`contract-doc-status-ok-${c.contractCode}`}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900/50"
        >
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          Đủ hồ sơ PDF
        </span>
      );
    }

    if (mode === 'table') {
      return (
        <div
          data-testid={`contract-doc-status-missing-${c.contractCode}`}
          className="flex flex-col gap-1 items-start"
        >
          <span
            title={`Cần bổ sung: ${missing.join(', ')}`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70"
          >
            <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" />
            Thiếu {missing.length} thông tin
          </span>
          <span
            title={missing.join(', ')}
            className="text-[10px] text-amber-700 dark:text-amber-300/90 max-w-[185px] truncate"
          >
            Cần bổ sung: {missing.join(', ')}
          </span>
        </div>
      );
    }

    const isExpanded = Boolean(expandedMissingIds[c.id]);
    return (
      <div
        data-testid={`contract-doc-status-missing-${c.contractCode}`}
        className="rounded-lg border border-amber-200/90 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/25 px-2.5 py-1.5 text-[11px]"
      >
        <Collapsible.Root
          open={isExpanded}
          onOpenChange={(open) =>
            setExpandedMissingIds((prev) => ({ ...prev, [c.id]: open }))
          }
        >
          <Collapsible.Trigger
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left font-bold text-amber-800 dark:text-amber-300"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">
                Thiếu {missing.length} thông tin cần bổ sung
              </span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''
                }`}
            />
          </Collapsible.Trigger>
          <Collapsible.Panel className="overflow-hidden pt-1.5 text-[10.5px] text-amber-900/90 dark:text-amber-200/90">
            <ul className="list-disc pl-4 space-y-0.5">
              {missing.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Nhấn vào ID hồ sơ ở trên để bổ sung &amp; xem PDF.
            </p>
          </Collapsible.Panel>
        </Collapsible.Root>
      </div>
    );
  };

  return (
    <div className="space-y-3 min-w-0" data-testid="contracts-workspace">
      {/* Main Content Card */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs min-w-0 overflow-hidden">
        {/* Desktop compact header + PDF progress */}
        <div className="hidden md:flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
              Hợp đồng thuê &amp; Hồ sơ PDF
            </h2>
            <span className="inline-flex h-5 items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {contracts.length}
            </span>
          </div>

          {contracts.length > 0 && (
            <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="whitespace-nowrap">
                Hồ sơ PDF:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {completeDocCount}/{contracts.length}
                </strong>{' '}
                đầy đủ
              </span>
              <div className="w-24">
                <SettlementProgressBar
                  value={docCompletionRate}
                  ariaLabel="Tỷ lệ hoàn thiện hồ sơ hợp đồng PDF"
                  indicatorClassName={
                    missingDocCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Unified Toolbar Row: Search + Filter Icon + Single View Mode Toggle + Icon-Only Refresh */}
        <div className="space-y-2" data-testid="contracts-toolbar">
          <div className="flex items-center gap-1.5 sm:gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                data-testid="input-search-contracts"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm ID hồ sơ, mã phòng, tên khách, SĐT..."
                className="h-9 w-full text-xs pl-8 pr-7 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Icon Popover */}
            <Popover.Root open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <Button asChild hoverScale={1.03} tapScale={0.96}>
                <Popover.Trigger
                  type="button"
                  data-testid="btn-contracts-filter"
                  aria-label={
                    activeFilterCount > 0
                      ? `Bộ lọc hợp đồng (đang bật ${activeFilterCount})`
                      : 'Bộ lọc hợp đồng'
                  }
                  title="Bộ lọc trạng thái & hồ sơ PDF"
                  className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    activeFilterCount > 0
                      ? 'bg-brand-primary/10 dark:bg-brand-primary/20 border-brand-primary/50 text-brand-primary'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {activeFilterCount > 0 && (
                    <span
                      data-testid="contracts-filter-badge"
                      className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[9.5px] font-bold text-white shadow-xs"
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </Popover.Trigger>
              </Button>
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-[90]">
                  <Popover.Popup
                    data-testid="contracts-filter-popover"
                    className="w-[272px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3.5 shadow-xl space-y-3 outline-none text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">
                        Lọc hợp đồng
                      </span>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          data-testid="btn-contracts-filter-reset"
                          onClick={() => {
                            setContractStatusFilter('ALL');
                            setOnlyMissingDoc(false);
                          }}
                          className="text-[11px] font-semibold text-brand-primary hover:underline"
                        >
                          Đặt lại
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                        Trạng thái
                      </span>
                      <div className="space-y-1">
                        {STATUS_FILTER_OPTIONS.map((opt) => {
                          const count = contracts.filter((c) =>
                            matchesStatusFilter(c.status, opt.id)
                          ).length;
                          const selected = contractStatusFilter === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`filter-contract-status-${opt.id}`}
                              onClick={() => setContractStatusFilter(opt.id)}
                              className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors ${
                                selected
                                  ? 'bg-brand-primary/10 text-brand-primary font-bold dark:bg-brand-primary/20'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                <span>{opt.label}</span>
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                        Hồ sơ &amp; PDF
                      </span>
                      <button
                        type="button"
                        data-testid="filter-contract-missing-doc"
                        aria-pressed={onlyMissingDoc}
                        onClick={() => setOnlyMissingDoc((prev) => !prev)}
                        className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors ${
                          onlyMissingDoc
                            ? 'bg-amber-600 text-white border-amber-600 font-bold'
                            : 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Thiếu thông tin cần bổ sung</span>
                        </span>
                        <span className="font-mono font-bold tabular-nums">
                          {missingDocCount}
                        </span>
                      </button>
                    </div>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            {/* Single View Mode Toggle Icon (click toggles card <-> table) */}
            <Button
              type="button"
              hoverScale={1.03}
              tapScale={0.96}
              data-testid="btn-contracts-view-toggle"
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
              onClick={() =>
                setViewMode((prev) => (prev === 'card' ? 'table' : 'card'))
              }
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              {viewMode === 'card' ? (
                <LayoutGrid className="w-4 h-4" />
              ) : (
                <Table2 className="w-4 h-4" />
              )}
            </Button>

            {/* Icon-Only Reload Button */}
            <Button
              type="button"
              hoverScale={1.03}
              tapScale={0.96}
              disabled={isLoading}
              data-testid="btn-contracts-refresh"
              aria-label="Làm mới dữ liệu hợp đồng"
              title="Làm mới"
              onClick={() => void onRefresh()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
              />
            </Button>
          </div>

          {/* Slim Status / Active Filter Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="whitespace-nowrap">
                Hiển thị <strong className="text-slate-800 dark:text-slate-200">{displayedContracts.length}</strong> / {contracts.length} hợp đồng
              </span>
              {contractStatusFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setContractStatusFilter('ALL')}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-brand-primary hover:bg-brand-primary/20"
                >
                  <span>
                    {STATUS_FILTER_OPTIONS.find((o) => o.id === contractStatusFilter)?.label}
                  </span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {onlyMissingDoc && (
                <button
                  type="button"
                  onClick={() => setOnlyMissingDoc(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300"
                >
                  <span>Thiếu thông tin PDF</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {missingDocCount > 0 && !onlyMissingDoc && (
              <button
                type="button"
                onClick={() => setOnlyMissingDoc(true)}
                className="md:hidden inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Thiếu PDF ({missingDocCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {displayedContracts.length === 0 ? (
          <div className="py-10 text-center space-y-2.5" data-testid="contracts-empty-state">
            <FileSignature className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {contracts.length === 0
                ? 'Chưa có hợp đồng thuê trong phạm vi tòa nhà đang chọn'
                : 'Không tìm thấy hợp đồng phù hợp bộ lọc'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {contracts.length === 0
                ? 'Hợp đồng mới được khởi tạo trực tiếp từ sơ đồ phòng hoặc phiếu đặt cọc giữ chỗ.'
                : 'Thử xóa từ khóa tìm kiếm hoặc đặt lại bộ lọc để xem toàn bộ hợp đồng.'}
            </p>
            {(activeFilterCount > 0 || searchQuery.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setContractStatusFilter('ALL');
                  setOnlyMissingDoc(false);
                }}
                className="inline-flex h-8 items-center px-3 rounded-lg text-xs font-bold bg-brand-primary text-white hover:bg-brand-hover transition-colors"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
              /* CARD VIEW (Mobile & Desktop) */
              <div
                data-testid="contracts-card-grid"
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
              >
                {displayedContracts.map((c) => {
                  const { displayCode, isImported, rawCode } = formatContractDisplayCode(
                    c.contractCode
                  );
                  const badge = getContractStatusBadge(c.status);
                  const hasMissing = (c.missingDocumentFields?.length || 0) > 0;
                  return (
                    <div
                      key={c.id}
                      data-testid={`contract-card-${c.contractCode}`}
                      className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2.5 text-xs shadow-xs flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="truncate whitespace-nowrap">
                              {c.buildingCode} · {c.roomCode}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                            <ActionMenu
                              contextTitle={`${c.buildingCode} · ${c.roomCode}`}
                              contextSubtitle={`HĐ: ${displayCode} · ${c.tenantName}`}
                              contextBadge={badge.label}
                              items={buildActionItems(c, true)}
                            />
                          </div>
                        </div>

                        {/* Clickable ID hồ sơ để xem PDF / bổ sung thông tin */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="text-[11px] font-mono flex items-center gap-1.5 flex-wrap min-w-0">
                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <ContractDocumentLink
                              contractId={c.id}
                              testId={`contract-profile-link-${c.contractCode}`}
                              title={
                                hasMissing
                                  ? 'Mở hồ sơ để bổ sung thông tin & xem PDF'
                                  : 'Xem bản hợp đồng PDF'
                              }
                              onProfileSaved={() => void onRefresh()}
                            >
                              {displayCode}
                            </ContractDocumentLink>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                              HĐ Chính
                            </span>
                            {isImported && (
                              <span className="rounded px-1.5 py-0.2 text-[9.5px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/50 whitespace-nowrap">
                                Sổ cũ
                              </span>
                            )}
                            {displayCode !== rawCode && (
                              <span
                                className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]"
                                title={rawCode}
                              >
                                ({rawCode})
                              </span>
                            )}
                          </div>

                          {!hasMissing && renderMissingSummary(c, 'card')}
                        </div>

                        {hasMissing && renderMissingSummary(c, 'card')}

                        {(c.occupants || [])
                          .filter((person) => person.relationToPrimary === 'OTHER')
                          .map((person) => (
                            <div key={person.id} className="text-[11px]">
                              <ContractDocumentLink
                                contractId={c.id}
                                occupantId={person.id}
                                onProfileSaved={() => void onRefresh()}
                              >
                                {`Đại diện HĐ · ${person.fullName}`}
                              </ContractDocumentLink>
                            </div>
                          ))}

                        <div className="space-y-1.5 text-[11px] bg-slate-50/80 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 shrink-0">Khách thuê:</span>
                            <span className="font-bold text-slate-900 dark:text-white truncate text-right max-w-[180px]">
                              {c.tenantName}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 shrink-0">Giá thuê:</span>
                            <span className="font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                              {c.monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 shrink-0">Thời hạn:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300 text-[10.5px] whitespace-nowrap">
                              {c.startDate} → {c.endDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 shrink-0">Tiền cọc:</span>
                          <span className="font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                            {c.depositVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="text-slate-500 shrink-0">Thực thu:</span>
                          {c.remainingDepositVnd && c.remainingDepositVnd > 0 ? (
                            <span className="tabular-nums whitespace-nowrap">
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {(c.collectedDepositVnd ?? 0).toLocaleString('vi-VN')} đ
                              </span>
                              <span className="text-rose-600 dark:text-rose-400 font-bold ml-1">
                                (thiếu {c.remainingDepositVnd.toLocaleString('vi-VN')} đ)
                              </span>
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                              {(c.collectedDepositVnd ?? c.depositVnd).toLocaleString('vi-VN')} đ (đủ)
                            </span>
                          )}
                        </div>
                        {c.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => onOpenHandover(c)}
                            data-testid="btn-open-handover-mobile"
                            className="w-full mt-1.5 h-8 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <FileSignature className="w-3.5 h-3.5 shrink-0" />
                            <span>Bàn giao phòng</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* TABLE VIEW (Desktop & Mobile) */
              <div
                className="w-full min-w-0 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs overflow-hidden"
                style={{ contain: 'layout inline-size' }}
              >
                <div className="overflow-x-auto">
                  <table
                    data-testid="contracts-table"
                    className="w-full text-left text-xs min-w-[820px]"
                  >
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold">
                      <th className="py-2.5 px-2.5 whitespace-nowrap">ID Hồ sơ &amp; PDF</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">Phòng &amp; Tòa</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap">Khách đứng tên</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap">Thời hạn &amp; Tiện ích</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap">Giá thuê &amp; Cọc</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">Trạng thái</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap w-10">
                        <span className="sr-only">Thao tác</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayedContracts.map((c) => {
                      const { displayCode, isImported, rawCode } = formatContractDisplayCode(
                        c.contractCode
                      );
                      const badge = getContractStatusBadge(c.status);
                      const hasMissing = (c.missingDocumentFields?.length || 0) > 0;
                      return (
                        <tr
                          key={c.id}
                          data-testid={`contract-row-${c.contractCode}`}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Col 1: ID hồ sơ (click xem PDF) & tình trạng hồ sơ */}
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <ContractDocumentLink
                                contractId={c.id}
                                testId={`contract-profile-link-${c.contractCode}`}
                                className="font-mono whitespace-nowrap"
                                title={
                                  hasMissing
                                    ? 'Click để bổ sung thông tin hồ sơ & xem PDF'
                                    : 'Click để xem hợp đồng PDF'
                                }
                                onProfileSaved={() => void onRefresh()}
                              >
                                {displayCode}
                              </ContractDocumentLink>
                              {isImported && (
                                <span className="inline-flex items-center rounded px-1 py-0.2 text-[9.5px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
                                  Sổ cũ
                                </span>
                              )}
                            </div>
                            <div className="mt-1">{renderMissingSummary(c, 'table')}</div>
                            {displayCode !== rawCode && (
                              <div
                                className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[160px] mt-0.5"
                                title={rawCode}
                              >
                                {rawCode}
                              </div>
                            )}
                            {(c.occupants || [])
                              .filter((person) => person.relationToPrimary === 'OTHER')
                              .map((person) => (
                                <div key={person.id} className="mt-1 text-[11px] whitespace-nowrap">
                                  <ContractDocumentLink
                                    contractId={c.id}
                                    occupantId={person.id}
                                    onProfileSaved={() => void onRefresh()}
                                  >
                                    {`Đại diện · ${person.fullName}`}
                                  </ContractDocumentLink>
                                </div>
                              ))}
                          </td>

                          {/* Col 2: Phòng & Tòa */}
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50/80 dark:bg-blue-950/40 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 whitespace-nowrap">
                              <Building2 className="w-3 h-3 shrink-0" />
                              {c.buildingCode} · {c.roomCode}
                            </span>
                          </td>

                          {/* Col 3: Khách đứng tên */}
                          <td className="py-2.5 px-2.5 whitespace-nowrap">
                            <div
                              className="font-bold text-slate-900 dark:text-white truncate max-w-[140px]"
                              title={c.tenantName}
                            >
                              {c.tenantName}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                              {c.tenantPhone}
                            </div>
                          </td>

                          {/* Col 4: Thời hạn & Tiện ích */}
                          <td className="py-2.5 px-2.5 whitespace-nowrap">
                            <div className="font-mono text-[11px] whitespace-nowrap text-slate-700 dark:text-slate-300">
                              {c.startDate} → {c.endDate}
                            </div>
                            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                              <span>
                                Điện:{' '}
                                <strong className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                                  {c.electricRateVnd.toLocaleString('vi-VN')}đ
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                Nước:{' '}
                                <strong className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                                  {c.waterRateVnd.toLocaleString('vi-VN')}đ
                                </strong>
                                {formatWaterBillingLabel(c.waterBillingMethod)}
                              </span>
                            </div>
                          </td>

                          {/* Col 5: Giá thuê & Cọc */}
                          <td className="py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {c.monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              <div>Cọc: {c.depositVnd.toLocaleString('vi-VN')} đ</div>
                              {c.collectedDepositVnd !== undefined &&
                                (c.remainingDepositVnd && c.remainingDepositVnd > 0 ? (
                                  <div className="text-[10px] whitespace-nowrap mt-0.5">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      Thu: {c.collectedDepositVnd.toLocaleString('vi-VN')} đ
                                    </span>
                                    <span className="text-rose-600 dark:text-rose-400 font-bold ml-1">
                                      (thiếu {c.remainingDepositVnd.toLocaleString('vi-VN')} đ)
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap mt-0.5">
                                    Thu đủ: {c.collectedDepositVnd.toLocaleString('vi-VN')} đ
                                  </div>
                                ))}
                            </div>
                          </td>

                          {/* Col 6: Trạng thái */}
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </td>

                          {/* Col 7: Thao tác */}
                          <td className="py-2.5 px-2 text-right whitespace-nowrap w-10">
                            <div className="relative inline-flex items-center justify-end">
                              {c.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  data-testid="btn-open-handover"
                                  onClick={() => onOpenHandover(c)}
                                  className="sr-only"
                                  aria-hidden="true"
                                  tabIndex={-1}
                                >
                                  Bàn giao phòng
                                </button>
                              )}

                              <ActionMenu
                                contextTitle={`${c.buildingCode} · ${c.roomCode}`}
                                contextSubtitle={`HĐ: ${displayCode} · ${c.tenantName}`}
                                contextBadge={badge.label}
                                items={buildActionItems(c, false)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
      </div>
    </div>
  );
};