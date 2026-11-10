import React from 'react';
import { MobileOverviewSummary } from './MobileOverviewSummary';
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
import { BuildingScopeSelector } from '@/shared/ui/BuildingScopeSelector';

function formatVnd(amount: number): string {
  return `${Math.trunc(amount).toLocaleString('vi-VN')} đ`;
}

export const OverviewDashboard: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => {
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
    <div className={mobile ? "space-y-4" : "space-y-6"}>
      {!mobile && <>
      {/* Scope & Live PostgreSQL Summary Banner */}
      <div
        data-testid="console-overview-portfolio-summary"
        className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:flex-row sm:items-center sm:justify-between shadow-2xs"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {organization?.name || user?.organizationName}
            </span>
            <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {kpis.buildingsCount} tòa nhà · {kpis.floorsCount} tầng ·{' '}
              {kpis.totalRooms} phòng
            </span>
            <span
              data-testid="console-hunonic-status-pill"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${hunonicBadge.cls}`}
            >
              <Cpu className="h-3.5 w-3.5" />
              {hunonicBadge.text}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Tổng quan vận hành · Kỳ theo dõi{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {formatPeriodDisplay(selectedPeriod)}
            </strong>{' '}
            · Xuất bản Landing:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {kpis.publishedLandingRooms} phòng công khai
            </strong>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <BuildingScopeSelector />
          <button
            type="button"
            onClick={() => void refreshPortfolio()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {syncStatus === 'loading' || syncStatus === 'refreshing' ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('buildings')}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-xs font-semibold text-white transition-colors cursor-pointer shadow-xs"
          >
            Quản lý phòng
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      </>}
      {syncError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{mobile ? 'Không thể cập nhật dữ liệu. Đang giữ lần đồng bộ gần nhất.' : syncError}</span>
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

      {mobile && <MobileOverviewSummary />}
      {/* 4 Authoritative PostgreSQL KPI Cards */}
      {!mobile && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Occupancy */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Công suất lấp đầy
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <DoorOpen className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                {kpis.occupancyRatePercent}%
              </span>
              <span className="text-xs font-medium text-slate-500">
                ({kpis.occupiedRooms}/{kpis.totalRooms} phòng)
              </span>
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
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
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Tiền phòng theo hợp đồng
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <FileSignature className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
              {formatVnd(kpis.contractedMonthlyRentVnd)}
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <span>{kpis.activeContractsCount} hợp đồng hiệu lực</span>
            <span title="Tổng giá niêm yết của các phòng đang có khách">
              Niêm yết: {formatVnd(kpis.occupiedListValueVnd)}
            </span>
          </div>
        </div>

        {/* Card 3: Period Receivables & Invoices */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Còn phải thu ({formatPeriodDisplay(selectedPeriod)})
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
              {formatVnd(kpis.periodReceivableVnd)}
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <span>Đã thu: {formatVnd(kpis.periodCollectedVnd)}</span>
            <span
              className={
                kpis.overdueInvoicesCount > 0
                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                  : ''
              }
            >
              {kpis.overdueInvoicesCount} quá hạn
            </span>
          </div>
        </div>

        {/* Card 4: Tenants & Incoming Landing Leads */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Khách thuê & Yêu cầu mới
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                {kpis.tenantsCount}
              </span>
              <span className="text-xs text-slate-500">hồ sơ khách thuê</span>
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800/80">
            <span className="text-slate-500 dark:text-slate-400">
              Lead Landing mới: <strong>{kpis.newLeadsCount}</strong>
            </span>
            {hasCapability('canManageTenants') && (
              <button
                type="button"
                onClick={() => openTenantsWorkspace()}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Xem khách thuê →
              </button>
            )}
          </div>
        </div>
      </div>

      }
      {/* Main Two-Column Section: Scoped Buildings + Real Landing Inquiries */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left 2 cols: Buildings in Authorized Scope */}
        <section className="xl:col-span-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6 shadow-2xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2
                data-testid="console-overview-buildings-heading"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Danh mục tòa nhà trong phạm vi ({scopedBuildings.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chọn tòa nhà để đi thẳng vào sơ đồ tầng, phòng và hồ sơ khách thuê
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('buildings')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Mở sơ đồ phòng →
            </button>
          </div>

          {scopedBuildings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-12 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-medium text-slate-500">
                Chưa có tòa nhà nào trong phạm vi hiển thị hiện tại.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
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
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4.5 text-left hover:border-blue-500/50 hover:bg-white dark:hover:bg-slate-800/60 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-600 dark:text-blue-300">
                          {bld.code}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {bld.stats.floorsCount} tầng · {bld.stats.totalRooms}{' '}
                          phòng
                        </span>
                      </div>
                      <h3 className="mt-2.5 truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {bld.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {bld.streetAddress}, {bld.ward}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-500"
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
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6 shadow-2xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Yêu cầu xem phòng từ Landing
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Khách quan tâm từ website
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
