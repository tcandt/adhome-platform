import React, { useEffect, useMemo, useState } from 'react';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileText,
  LayoutGrid,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import {
  formatPeriodDisplay,
  getCurrentVnPeriodKey,
} from '@/app/navigation/navigationConfig';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { ContractDocumentLink } from '@/shared/ui/ContractDocumentDialog';
import {
  SettlementProgressBar,
  SettlementShimmerButton,
} from '@/shared/ui/SettlementAnimatePrimitives';
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

export interface OccupancyWorkspaceData {
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
}

interface ContractsWorkspaceViewProps {
  selectedPeriod: string;
  onChangePeriod: (nextPeriod: string) => void;
  shiftPeriodKey: (period: string, deltaMonths: number) => string;
  contracts: ContractListItem[];
  roomsCount: number;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  contractsSubView: 'contracts' | 'occupancy';
  onChangeSubView: (view: 'contracts' | 'occupancy') => void;
  occupancyData: OccupancyWorkspaceData | null;
  onOpenHandover: (contract: ContractListItem) => void;
  onOpenExtend: (contract: ContractListItem) => void;
  onOpenTransfer: (contract: ContractListItem) => void;
  onOpenTerminate: (contract: ContractListItem) => void;
}

type ContractStatusFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'EXPIRING' | 'TERMINATED';

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

function isContractInPeriod(contract: ContractListItem, periodKey: string): boolean {
  const startMonth = (contract.startDate || '').slice(0, 7);
  const endMonth = (contract.endDate || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
    return true;
  }
  return startMonth <= periodKey && endMonth >= periodKey;
}

export const ContractsWorkspaceView: React.FC<ContractsWorkspaceViewProps> = ({
  selectedPeriod,
  onChangePeriod,
  shiftPeriodKey,
  contracts,
  roomsCount,
  isLoading,
  onRefresh,
  contractsSubView,
  onChangeSubView,
  occupancyData,
  onOpenHandover,
  onOpenExtend,
  onOpenTransfer,
  onOpenTerminate,
}) => {
  const [periodScope, setPeriodScope] = useState<'PERIOD' | 'ALL'>('PERIOD');
  const [searchQuery, setSearchQuery] = useState('');
  const [contractStatusFilter, setContractStatusFilter] =
    useState<ContractStatusFilter>('ALL');
  const [onlyMissingDoc, setOnlyMissingDoc] = useState(false);
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

  const periodContracts = useMemo(() => {
    if (periodScope === 'ALL') return contracts;
    return contracts.filter((c) => isContractInPeriod(c, selectedPeriod));
  }, [contracts, periodScope, selectedPeriod]);

  const missingDocCount = useMemo(
    () => periodContracts.filter((c) => (c.missingDocumentFields?.length || 0) > 0).length,
    [periodContracts]
  );

  const completeDocCount = Math.max(0, periodContracts.length - missingDocCount);
  const docCompletionRate =
    periodContracts.length > 0
      ? Math.round((completeDocCount / periodContracts.length) * 100)
      : 100;

  const displayedContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return periodContracts.filter((c) => {
      if (contractStatusFilter === 'ACTIVE') {
        if (c.status !== 'ACTIVE' && c.status !== 'EXTENDED') return false;
      } else if (contractStatusFilter === 'DRAFT') {
        if (c.status !== 'DRAFT') return false;
      } else if (contractStatusFilter === 'EXPIRING') {
        if (c.status !== 'EXPIRING') return false;
      } else if (contractStatusFilter === 'TERMINATED') {
        if (c.status !== 'TERMINATED' && c.status !== 'EXPIRED') return false;
      }

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
  }, [periodContracts, contractStatusFilter, onlyMissingDoc, searchQuery]);

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
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                isExpanded ? 'rotate-180' : ''
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
      {/* Unified Top Bar: Month/Year + Reload + Subviews */}
      <div
        data-testid="contracts-toolbar"
        className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2.5 sm:px-4 sm:py-3 shadow-xs space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Desktop heading */}
          <div className="hidden md:block min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
              Hợp đồng thuê &amp; Hồ sơ PDF
            </h2>
            <p className="truncate text-xs text-slate-500">
              Theo dõi hiệu lực theo kỳ, kiểm tra hồ sơ thiếu thông tin và xem bản in PDF
            </p>
          </div>

          {/* Right/Top Controls: Month/Year + Period Scope + Reload */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div
                data-testid="contracts-period-selector"
                className="inline-flex h-8 sm:h-9 items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 sm:p-1 rounded-xl"
              >
                <button
                  type="button"
                  data-testid="btn-contracts-period-prev"
                  aria-label="Kỳ trước"
                  onClick={() => {
                    setPeriodScope('PERIOD');
                    onChangePeriod(shiftPeriodKey(selectedPeriod, -1));
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <label className="relative inline-flex items-center gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                  <span className="sm:hidden">
                    T{selectedPeriod.slice(5, 7)}/{selectedPeriod.slice(0, 4)}
                  </span>
                  <span className="hidden sm:inline">
                    Kỳ {formatPeriodDisplay(selectedPeriod)}
                  </span>
                  <input
                    data-testid="input-contracts-period"
                    type="month"
                    value={selectedPeriod}
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                        setPeriodScope('PERIOD');
                        onChangePeriod(e.target.value);
                      }
                    }}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  data-testid="btn-contracts-period-next"
                  aria-label="Kỳ sau"
                  onClick={() => {
                    setPeriodScope('PERIOD');
                    onChangePeriod(shiftPeriodKey(selectedPeriod, 1));
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                data-testid="btn-contracts-period-scope"
                aria-pressed={periodScope === 'ALL'}
                onClick={() =>
                  setPeriodScope((prev) => (prev === 'PERIOD' ? 'ALL' : 'PERIOD'))
                }
                className={`inline-flex h-8 sm:h-9 items-center px-2 sm:px-2.5 rounded-xl text-[11px] font-bold border transition-colors whitespace-nowrap ${
                  periodScope === 'ALL'
                    ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="sm:hidden">{`Tất cả (${contracts.length})`}</span>
                <span className="hidden sm:inline">{`Tất cả kỳ (${contracts.length})`}</span>
              </button>

              {selectedPeriod !== getCurrentVnPeriodKey() && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodScope('PERIOD');
                    onChangePeriod(getCurrentVnPeriodKey());
                  }}
                  className="hidden sm:inline-flex h-9 items-center px-2.5 rounded-xl text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 transition-colors whitespace-nowrap"
                >
                  Kỳ hiện tại
                </button>
              )}
            </div>

            <SettlementShimmerButton
              type="button"
              data-testid="btn-contracts-refresh"
              isLoading={isLoading}
              loadingText="Đang tải..."
              shimmerColor="#2563eb"
              onClick={() => void onRefresh()}
              title="Tải lại dữ liệu hợp đồng"
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2.5 sm:px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Làm mới</span>
            </SettlementShimmerButton>
          </div>
        </div>

        {/* Subview tabs & PDF completeness indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              data-testid="tab-subview-contracts"
              onClick={() => onChangeSubView('contracts')}
              className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                contractsSubView === 'contracts'
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <FileSignature className="w-3.5 h-3.5 shrink-0" />
              <span>
                Hợp đồng thuê ({periodContracts.length}
                {periodScope === 'PERIOD' && contracts.length !== periodContracts.length
                  ? `/${contracts.length}`
                  : ''}
                )
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-subview-occupancy"
              onClick={() => onChangeSubView('occupancy')}
              className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                contractsSubView === 'occupancy'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>
                Đối soát Occupancy ({occupancyData?.summary?.totalRooms || roomsCount})
              </span>
            </button>
          </div>

          {contractsSubView === 'contracts' && periodContracts.length > 0 && (
            <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="whitespace-nowrap">
                Hồ sơ PDF: <strong className="text-slate-800 dark:text-slate-200">{completeDocCount}/{periodContracts.length}</strong> đầy đủ
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
      </div>

      {/* Main Content Card */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs min-w-0 overflow-hidden">
        {contractsSubView === 'occupancy' && (
          <div className="space-y-4" data-testid="occupancy-workspace">
            {occupancyData?.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[11px] text-slate-500 font-medium">Tổng số phòng</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white" data-testid="kpi-total-rooms">
                    {occupancyData.summary.totalRooms}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                  <span className="block text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Đang ở (OCCUPIED)</span>
                  <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400" data-testid="kpi-occupied-rooms">
                    {occupancyData.summary.occupiedRooms}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
                  <span className="block text-[11px] text-blue-700 dark:text-blue-400 font-medium">Phòng trống (AVAILABLE)</span>
                  <span className="text-base font-extrabold text-blue-700 dark:text-blue-400" data-testid="kpi-available-rooms">
                    {occupancyData.summary.availableRooms}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                  <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-medium">Đang giữ chỗ (RESERVED)</span>
                  <span className="text-base font-extrabold text-amber-700 dark:text-amber-400">
                    {occupancyData.summary.reservedRooms}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
                  <span className="block text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">Tỷ lệ lấp đầy</span>
                  <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-400" data-testid="kpi-occupancy-rate">
                    {occupancyData.summary.occupancyRatePercent}%
                  </span>
                </div>
              </div>
            )}

            <div
              className="w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              style={{ contain: 'layout inline-size' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[780px]" data-testid="occupancy-table">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">Phòng &amp; Tòa</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Mô hình thuê</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Trạng thái lấp đầy</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Người thuê chính</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Hợp đồng hiệu lực</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Số người ở</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Tính nhất quán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {occupancyData?.rooms?.map((rm) => (
                    <tr key={rm.roomId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {rm.buildingCode} · {rm.roomCode}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {rm.rentalModel === 'SHARED_ROOM' ? 'Phòng ghép (SHARED)' : 'Nguyên căn (WHOLE)'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap ${
                            rm.occupancyStatus === 'OCCUPIED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : rm.occupancyStatus === 'AVAILABLE'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : rm.occupancyStatus === 'RESERVED'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {rm.occupancyStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {rm.primaryTenant ? (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{rm.primaryTenant.fullName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{rm.primaryTenant.phone}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa có khách</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] whitespace-nowrap">
                        {rm.activeContract ? (
                          <div>
                            <ContractDocumentLink
                              contractId={rm.activeContract.id}
                              onProfileSaved={() => void onRefresh()}
                            >
                              {rm.activeContract.contractCode}
                            </ContractDocumentLink>
                            {rm.activeContract.notes?.includes('paidThrough') && (
                              <span className="block text-[10px] text-slate-500">
                                {rm.activeContract.notes.split('paidThrough:')[1]?.trim()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {rm.occupantsCount} / {rm.maxOccupants} người
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {rm.isConsistent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            Khớp 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            <AlertCircle className="w-3 h-3" />
                            Lệch dữ liệu
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {contractsSubView === 'contracts' && (
          <>
            {/* Search & View Toggle Row + Status Chips */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 w-full">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    data-testid="input-search-contracts"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm ID hồ sơ, mã phòng, tên khách, SĐT..."
                    className="h-9 w-full text-xs pl-8 pr-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Chế độ hiển thị danh sách hợp đồng"
                  data-testid="contracts-view-mode-toggle"
                  className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 gap-0.5"
                >
                  <button
                    type="button"
                    data-testid="btn-contracts-view-card"
                    aria-label="Hiển thị dạng thẻ (Card)"
                    aria-pressed={viewMode === 'card'}
                    title="Hiển thị dạng thẻ (Card)"
                    onClick={() => setViewMode('card')}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      viewMode === 'card'
                        ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-testid="btn-contracts-view-table"
                    aria-label="Hiển thị dạng bảng (Table)"
                    aria-pressed={viewMode === 'table'}
                    title="Hiển thị dạng bảng (Table)"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      viewMode === 'table'
                        ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Table2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 min-w-0">
                <div className="flex items-center gap-1.5 w-full md:w-auto min-w-0 overflow-x-auto no-scrollbar">
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
                      data-testid={`filter-contract-status-${tab.id}`}
                      onClick={() => setContractStatusFilter(tab.id as ContractStatusFilter)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        contractStatusFilter === tab.id
                          ? 'bg-brand-primary text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}

                  {missingDocCount > 0 && (
                    <button
                      type="button"
                      data-testid="filter-contract-missing-doc"
                      aria-pressed={onlyMissingDoc}
                      onClick={() => setOnlyMissingDoc((prev) => !prev)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                        onlyMissingDoc
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70 hover:bg-amber-100'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Thiếu thông tin ({missingDocCount})</span>
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  Hiển thị <strong>{displayedContracts.length}</strong> / {periodContracts.length} hợp đồng
                </span>
              </div>
            </div>

            {/* Empty state */}
            {displayedContracts.length === 0 ? (
              <div className="py-10 text-center space-y-2.5" data-testid="contracts-empty-state">
                <FileSignature className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {contracts.length === 0
                    ? 'Chưa có hợp đồng thuê trong phạm vi tòa nhà đang chọn'
                    : periodContracts.length === 0
                    ? `Không có hợp đồng hiệu lực trong kỳ ${formatPeriodDisplay(selectedPeriod)}`
                    : 'Không tìm thấy hợp đồng phù hợp bộ lọc'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {periodContracts.length === 0 && contracts.length > 0
                    ? 'Nhấn "Tất cả kỳ" hoặc chuyển sang tháng khác để xem các hợp đồng hiện có.'
                    : 'Hợp đồng mới được khởi tạo trực tiếp từ sơ đồ phòng hoặc phiếu đặt cọc giữ chỗ.'}
                </p>
                {periodContracts.length === 0 && contracts.length > 0 && periodScope === 'PERIOD' && (
                  <button
                    type="button"
                    onClick={() => setPeriodScope('ALL')}
                    className="inline-flex h-8 items-center px-3 rounded-lg text-xs font-bold bg-brand-primary text-white hover:bg-brand-hover transition-colors"
                  >
                    Xem tất cả kỳ ({contracts.length})
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
                            <div className="inline-flex items-center justify-end">
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
          </>
        )}
      </div>
    </div>
  );
};
