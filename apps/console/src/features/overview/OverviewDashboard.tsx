import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Cpu,
  DoorOpen,
  FileSignature,
  Loader2,
  PhoneCall,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatPeriodDisplay } from '@/app/navigation/navigationConfig';

function formatVnd(amount: number): string {
  return `${Math.trunc(amount).toLocaleString('vi-VN')} đ`;
}

export const OverviewDashboard: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const {
    setActiveModule,
    openTenantsWorkspace,
    setSelectedBuildingIds,
    selectedPeriod,
  } = useNavigation();
  const {
    syncStatus,
    syncError,
    organization,
    scopedBuildings,
    kpis,
    recentLeads,
    refreshPortfolio,
  } = usePortfolio();

  const hunonicBadge =
    kpis.hunonicStatus === 'VERIFIED'
      ? {
          text: `${kpis.hunonicOnlineMeters}/${kpis.hunonicTotalMeters} công tơ online`,
          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
        }
      : {
          text: 'Hunonic: Chưa cấu hình',
          cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        };

  return (
    <div className="space-y-6">
      {/* Scope & Live PostgreSQL Summary Banner */}
      <div
        data-testid="console-overview-portfolio-summary"
        className="flex flex-col gap-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-blue-400">
              {organization?.name || user?.organizationName}
            </span>
            <span className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {kpis.buildingsCount} tòa nhà · {kpis.floorsCount} tầng ·{' '}
              {kpis.totalRooms} phòng
            </span>
            <span
              data-testid="console-hunonic-status-pill"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${hunonicBadge.cls}`}
            >
              <Cpu className="h-3 w-3" />
              {hunonicBadge.text}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Dữ liệu đồng bộ trực tiếp từ PostgreSQL · Kỳ theo dõi{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {formatPeriodDisplay(selectedPeriod)}
            </strong>{' '}
            · Xuất bản Landing:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {kpis.publishedLandingRooms} phòng công khai
            </strong>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshPortfolio()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {syncStatus === 'loading' || syncStatus === 'refreshing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('buildings')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Quản lý phòng
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {syncError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshPortfolio()}
            className="shrink-0 font-bold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 4 Authoritative PostgreSQL KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Occupancy */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Công suất lấp đầy
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 text-brand-primary dark:text-blue-400">
              <DoorOpen className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {kpis.occupancyRatePercent}%
            </span>
            <span className="text-xs font-medium text-slate-500">
              ({kpis.occupiedRooms}/{kpis.totalRooms} phòng)
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {kpis.availableRooms} trống
            </span>
            <span>·</span>
            <span>{kpis.reservedRooms} giữ chỗ</span>
            <span>·</span>
            <span>{kpis.maintenanceRooms} bảo trì</span>
          </div>
        </div>

        {/* Card 2: Active Contracts & Contracted Rent */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Tiền phòng theo hợp đồng
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <FileSignature className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatVnd(kpis.contractedMonthlyRentVnd)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{kpis.activeContractsCount} hợp đồng hiệu lực</span>
            <span title="Tổng giá niêm yết của các phòng đang có khách">
              Niêm yết đang ở: {formatVnd(kpis.occupiedListValueVnd)}
            </span>
          </div>
        </div>

        {/* Card 3: Period Receivables & Invoices */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Công nợ phải thu ({selectedPeriod})
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatVnd(kpis.periodReceivableVnd)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Đã thu: {formatVnd(kpis.periodCollectedVnd)}</span>
            <span
              className={
                kpis.overdueInvoicesCount > 0
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : ''
              }
            >
              {kpis.overdueInvoicesCount} quá hạn
            </span>
          </div>
        </div>

        {/* Card 4: Tenants & Incoming Landing Leads */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Khách thuê & Yêu cầu mới
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {kpis.tenantsCount}
            </span>
            <span className="text-xs text-slate-500">hồ sơ khách thuê</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              Lead Landing mới: <strong>{kpis.newLeadsCount}</strong>
            </span>
            {hasCapability('canManageTenants') && (
              <button
                type="button"
                onClick={() => openTenantsWorkspace()}
                className="font-semibold text-brand-primary dark:text-blue-400 hover:underline"
              >
                Xem khách thuê →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Column Section: Scoped Buildings + Real Landing Inquiries */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left 2 cols: Buildings in Authorized Scope */}
        <section className="xl:col-span-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2
                data-testid="console-overview-buildings-heading"
                className="text-sm font-bold text-slate-900 dark:text-white"
              >
                Danh mục tòa nhà trong phạm vi ({scopedBuildings.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn tòa nhà để đi thẳng vào sơ đồ tầng, phòng và hồ sơ khách
                thuê
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('buildings')}
              className="text-xs font-semibold text-brand-primary dark:text-blue-400 hover:underline"
            >
              Mở sơ đồ phòng
            </button>
          </div>

          {scopedBuildings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-10 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-medium text-slate-500">
                Chưa có tòa nhà nào trong phạm vi hiển thị hiện tại.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {scopedBuildings.map((bld) => {
                const occPct =
                  bld.stats.totalRooms > 0
                    ? Math.round(
                        (bld.stats.occupiedRooms / bld.stats.totalRooms) * 100
                      )
                    : 0;
                return (
                  <button
                    key={bld.id}
                    type="button"
                    data-testid={`console-overview-building-card-${bld.code}`}
                    onClick={() => {
                      setSelectedBuildingIds([bld.id]);
                      setActiveModule('buildings');
                    }}
                    className="group flex flex-col justify-between rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 text-left hover:border-brand-primary/50 hover:bg-white dark:hover:bg-slate-800/60 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-primary dark:text-blue-300">
                          {bld.code}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {bld.stats.floorsCount} tầng · {bld.stats.totalRooms}{' '}
                          phòng
                        </span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-primary dark:group-hover:text-blue-400">
                        {bld.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {bld.streetAddress}, {bld.ward}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-brand-primary"
                          style={{ width: `${occPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                        <span>
                          Đang ở: <strong>{bld.stats.occupiedRooms}</strong> ·
                          Trống:{' '}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {bld.stats.availableRooms}
                          </strong>
                        </span>
                        <span className="font-semibold">
                          Web: {bld.stats.publishedRooms}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right col: Real PostgreSQL Landing Inquiries */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Yêu cầu xem phòng từ Landing
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ghi nhận thực từ bảng lead_inquiries
              </p>
            </div>
            <PhoneCall className="h-4 w-4 text-slate-400" />
          </div>

          {recentLeads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-8 text-center">
              <p className="text-xs text-slate-500">
                Chưa có yêu cầu xem phòng mới từ Landing Page.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentLeads.slice(0, 6).map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-brand-primary dark:text-blue-400">
                      {lead.referenceCode}
                    </span>
                    <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                      {lead.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-900 dark:text-white">
                    {lead.fullName} · {lead.phone}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {lead.roomCode
                      ? `Quan tâm phòng ${lead.roomCode}`
                      : 'Tư vấn nhu cầu thuê phòng'}
                    {lead.preferredMoveInDateDisplay
                      ? ` · Dự kiến ${lead.preferredMoveInDateDisplay}`
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
