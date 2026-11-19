import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  AlertCircle,
  ArrowRight,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  Cpu,
  DoorOpen,
  FileSignature,
  Receipt,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatPeriodDisplay } from '@/app/navigation/navigationConfig';
import { CompactPeriodRangePicker } from '@/shared/ui/CompactPeriodRangePicker';
import { SettlementProgressBar } from '@/shared/ui/SettlementAnimatePrimitives';

import { ContractCreationWizardModal as ContractWizard } from '../modules/modals/ContractCreationWizardModal';

const money = (n: number) => `${Math.trunc(n).toLocaleString('vi-VN')} đ`;
const signedMoney = (n: number) =>
  `${n >= 0 ? '+' : '-'}${Math.abs(Math.trunc(n)).toLocaleString('vi-VN')} đ`;

const card =
  'rounded-2xl border border-slate-200/85 bg-white dark:border-slate-800 dark:bg-[#111827] shadow-2xs';

export function MobileOverviewSummary() {
  const { user, hasCapability } = useAuth();
  const {
    selectedPeriod,
    selectedPeriodRange,
    setSelectedPeriodRange,
    setActiveModule,
  } = useNavigation();
  const { kpis, syncStatus, refreshPortfolio, lastSyncedAt, rooms } =
    usePortfolio();
  const [contractOpen, setContractOpen] = useState(false);
  const closeContract = useCallback(() => setContractOpen(false), []);
  const busy = syncStatus === 'loading' || syncStatus === 'refreshing';
  const ready = Boolean(lastSyncedAt);

  const monthsCount = useMemo(() => {
    if (!selectedPeriodRange) return 1;
    const [fy, fm] = selectedPeriodRange.from.split('-').map(Number);
    const [ty, tm] = selectedPeriodRange.to.split('-').map(Number);
    return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
  }, [selectedPeriodRange]);

  const meterRooms = useMemo(
    () => rooms.filter((room) => room.occupancyStatus !== 'ARCHIVED'),
    [rooms]
  );
  const meterCount = useCallback(
    (status: string) =>
      meterRooms.filter((room) => room.meterStatus === status).length,
    [meterRooms]
  );

  // Financial calculations for intuitive reconciliation
  const periodInvoiced = kpis.periodInvoicedVnd;
  const periodCollected = kpis.periodCollectedVnd;
  const periodReceivable = kpis.periodReceivableVnd;
  const contractedPerMonth = kpis.contractedMonthlyRentVnd;
  const expectedContractRentForRange = contractedPerMonth * monthsCount;
  const serviceAndOtherDelta = periodInvoiced - expectedContractRentForRange;

  const collectionRatePercent = useMemo(() => {
    if (periodInvoiced <= 0) {
      return periodCollected > 0 ? 100 : 0;
    }
    return Math.min(100, Math.round((periodCollected / periodInvoiced) * 100));
  }, [periodInvoiced, periodCollected]);

  const isFullyCollected = periodInvoiced > 0 && periodReceivable === 0;

  // Room distribution percentages for segmented visual bar
  const totalRoomsSafe = Math.max(1, kpis.totalRooms);
  const occWidth = Math.round((kpis.occupiedRooms / totalRoomsSafe) * 100);
  const resWidth = Math.round((kpis.reservedRooms / totalRoomsSafe) * 100);
  const maintWidth = Math.round((kpis.maintenanceRooms / totalRoomsSafe) * 100);

  const roomKpiCards = [
    {
      label: 'Tổng số phòng',
      value: kpis.totalRooms,
      hint: `${kpis.buildingsCount} tòa nhà · ${kpis.floorsCount} tầng`,
      valueCls: 'text-slate-900 dark:text-white',
      icon: Building2,
      iconWrapCls:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      accentBar: 'bg-slate-400 dark:bg-slate-600',
    },
    {
      label: 'Đang sử dụng',
      value: kpis.occupiedRooms,
      hint: `${kpis.occupancyRatePercent.toLocaleString('vi-VN')}% công suất lấp đầy`,
      valueCls: 'text-blue-600 dark:text-blue-400',
      icon: UserCheck,
      iconWrapCls:
        'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      accentBar: 'bg-blue-600 dark:bg-blue-500',
    },
    {
      label: 'Phòng trống',
      value: kpis.availableRooms,
      hint: 'Sẵn sàng đón khách thuê',
      valueCls: 'text-emerald-600 dark:text-emerald-400',
      icon: DoorOpen,
      iconWrapCls:
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      accentBar: 'bg-emerald-500 dark:bg-emerald-400',
    },
    {
      label: 'Giữ chỗ',
      value: kpis.reservedRooms,
      hint:
        kpis.reservedRooms > 0
          ? 'Đang giữ cọc chờ nhận phòng'
          : 'Không có phòng giữ chỗ',
      valueCls: 'text-amber-600 dark:text-amber-400',
      icon: BookmarkCheck,
      iconWrapCls:
        'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      accentBar: 'bg-amber-500 dark:bg-amber-400',
    },
  ] as const;

  const onlineMeters = meterCount('ONLINE');
  const offlineMeters = meterCount('OFFLINE');
  const staleMeters = meterCount('STALE');
  const unconfiguredMeters = meterCount('UNCONFIGURED');
  const hasMeterAlerts = offlineMeters + staleMeters > 0;

  return (
    <section
      aria-label="Tổng quan vận hành"
      className="space-y-3.5"
      aria-busy={busy}
    >
      {/* Top Greeting & Refresh Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              Xin chào, {user?.backendRole === 'ADMIN' ? 'Admin' : user?.name}
            </p>
          </div>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Tổng quan vận hành
          </h1>
          <p className="sr-only">{formatPeriodDisplay(selectedPeriod)}</p>
        </div>
        <Button
          type="button"
          hoverScale={1.03}
          tapScale={0.96}
          onClick={() => void refreshPortfolio()}
          disabled={busy}
          aria-label="Làm mới dữ liệu"
          title="Làm mới dữ liệu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/85 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-2xs"
        >
          <RefreshCw
            className={`h-4 w-4 ${busy ? 'animate-spin text-blue-600' : ''}`}
          />
        </Button>
      </div>

      {busy && (
        <p
          role="status"
          className="text-xs text-blue-600 dark:text-blue-400 animate-pulse font-medium"
        >
          Đang cập nhật dữ liệu từ máy chủ…
        </p>
      )}

      {/* Room KPI 2x2 Grid */}
      <div data-testid="mobile-room-kpis" className="grid grid-cols-2 gap-2.5">
        {roomKpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveModule('buildings')}
              className={`${card} group relative min-w-0 overflow-hidden p-3.5 text-left transition-all hover:border-blue-300/80 active:scale-[0.99] dark:hover:border-slate-700`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {item.label}
                </p>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.iconWrapCls}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p
                className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${item.valueCls}`}
              >
                {ready ? item.value : '—'}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {ready ? item.hint : 'Đang tải…'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Compact Room Capacity Distribution Strip */}
      <div className={`${card} px-3.5 py-3`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Cơ cấu quỹ phòng ({kpis.totalRooms} phòng)
          </span>
          <button
            type="button"
            onClick={() => setActiveModule('buildings')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sơ đồ phòng
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div
          role="img"
          aria-label={`Tỷ lệ phòng: ${kpis.occupiedRooms} đang ở, ${kpis.reservedRooms} giữ chỗ, ${kpis.availableRooms} phòng trống, ${kpis.maintenanceRooms} bảo trì`}
          className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-emerald-500/20 dark:bg-slate-800 p-0.5 gap-0.5"
        >
          {kpis.occupiedRooms > 0 && (
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
              style={{ width: `${Math.max(4, occWidth)}%` }}
            />
          )}
          {kpis.reservedRooms > 0 && (
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.max(4, resWidth)}%` }}
            />
          )}
          {kpis.maintenanceRooms > 0 && (
            <div
              className="h-full rounded-full bg-rose-500 transition-all"
              style={{ width: `${Math.max(4, maintWidth)}%` }}
            />
          )}
          {kpis.availableRooms > 0 && (
            <div className="h-full flex-1 rounded-full bg-emerald-500/80 dark:bg-emerald-500/60 transition-all" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-500" />
              Đang ở: <strong className="text-slate-700 dark:text-slate-200">{kpis.occupiedRooms}</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Trống: <strong className="text-slate-700 dark:text-slate-200">{kpis.availableRooms}</strong>
            </span>
            {kpis.reservedRooms > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Giữ chỗ: <strong className="text-slate-700 dark:text-slate-200">{kpis.reservedRooms}</strong>
              </span>
            )}
            {kpis.maintenanceRooms > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <Wrench className="h-3 w-3" />
                Bảo trì: <strong>{kpis.maintenanceRooms}</strong>
              </span>
            )}
          </div>
          <span className="text-[10.5px] font-medium text-slate-400">
            Web: {kpis.publishedLandingRooms} phòng
          </span>
        </div>
      </div>

      {/* Executive Financial & Cashflow Summary Card */}
      <section
        className={`${card} overflow-hidden`}
        aria-label="Tài chính theo kỳ"
      >
        {/* Card Header with Period Picker */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Tài chính theo kỳ
              </h2>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Doanh thu &amp; dòng tiền
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <CompactPeriodRangePicker
              value={selectedPeriodRange}
              onChange={setSelectedPeriodRange}
              testIdPrefix="mobile-overview"
            />
          </div>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Primary Metric: Total Invoiced in Period + Collection Progress */}
          <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 via-white to-blue-50/30 p-3.5 dark:border-slate-800 dark:from-slate-900/70 dark:via-[#111827] dark:to-blue-950/20">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Tổng phải thu {monthsCount > 1 ? `(${monthsCount} tháng)` : 'trong kỳ'}
              </p>
              {ready && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isFullyCollected
                      ? 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : periodInvoiced > 0
                      ? 'bg-blue-100/90 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isFullyCollected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      Đã thu đủ 100%
                    </>
                  ) : periodInvoiced > 0 ? (
                    `Đạt ${collectionRatePercent}%`
                  ) : (
                    'Chưa phát hành HĐ'
                  )}
                </span>
              )}
            </div>
            <p className="mt-1.5 break-words text-[1.65rem] font-bold leading-none tabular-nums tracking-tight text-slate-950 dark:text-white">
              {ready ? money(periodInvoiced) : '—'}
            </p>

            {/* Animated Collection Progress Bar */}
            <div className="mt-3 space-y-1.5">
              <SettlementProgressBar
                value={ready ? collectionRatePercent : 0}
                max={100}
                ariaLabel="Tiến độ thu tiền trong kỳ"
                indicatorClassName={
                  isFullyCollected
                    ? 'bg-emerald-500'
                    : collectionRatePercent > 0
                    ? 'bg-blue-600'
                    : 'bg-slate-300 dark:bg-slate-700'
                }
                trackClassName="bg-slate-200/80 dark:bg-slate-800 h-2"
              />
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Tiến độ thực thu</span>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {ready
                    ? `${Math.trunc(periodCollected).toLocaleString('vi-VN')} / ${money(periodInvoiced)}`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* 2-Column Split: Collected vs Receivable (Exact VND, Clear Comparison) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Collected Box */}
            <button
              type="button"
              onClick={() => setActiveModule('payments')}
              className="group min-w-0 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-left transition-all hover:bg-emerald-50 active:scale-[0.99] dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/35"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  Đã thu {monthsCount > 1 ? `(${monthsCount}T)` : 'trong kỳ'}
                </p>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p
                className="mt-1.5 truncate text-base font-bold leading-tight tabular-nums text-emerald-900 dark:text-emerald-200"
                title={money(periodCollected)}
              >
                {ready ? money(periodCollected) : '—'}
              </p>
              <p className="mt-1 truncate text-[10.5px] text-emerald-700/80 dark:text-emerald-400/80">
                {ready
                  ? periodInvoiced > 0
                    ? `Đạt ${collectionRatePercent}% phát sinh`
                    : 'Đối soát phiếu thu →'
                  : 'Đang tải…'}
              </p>
            </button>

            {/* Receivable Box */}
            <button
              type="button"
              onClick={() => setActiveModule('invoices')}
              className={`group min-w-0 rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                periodReceivable > 0
                  ? 'border-amber-200/90 bg-amber-50/70 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/25'
                  : 'border-slate-200/80 bg-slate-50/70 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <p
                  className={`truncate text-[11px] font-semibold ${
                    periodReceivable > 0
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Còn phải thu {monthsCount > 1 ? `(${monthsCount}T)` : ''}
                </p>
                <Receipt
                  className={`h-3.5 w-3.5 shrink-0 ${
                    periodReceivable > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
              </div>
              <p
                className={`mt-1.5 truncate text-base font-bold leading-tight tabular-nums ${
                  periodReceivable > 0
                    ? 'text-amber-900 dark:text-amber-200'
                    : 'text-slate-900 dark:text-white'
                }`}
                title={money(periodReceivable)}
              >
                {ready ? money(periodReceivable) : '—'}
              </p>
              <p
                className={`mt-1 truncate text-[10.5px] ${
                  periodReceivable > 0
                    ? 'text-amber-700/90 dark:text-amber-400/90'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {ready
                  ? periodReceivable > 0
                    ? `${kpis.unpaidInvoicesCount} hóa đơn chờ thu →`
                    : 'Không còn nợ trong kỳ'
                  : 'Đang tải…'}
              </p>
            </button>
          </div>

          {/* Transparent Breakdown: Contracted Base Rent & Service/Utility Delta */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/40 divide-y divide-slate-200/60 dark:divide-slate-800">
            <div className="flex items-center justify-between gap-2 pb-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Tiền phòng theo hợp đồng / tháng
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {kpis.activeContractsCount} hợp đồng đang có hiệu lực
                  {monthsCount > 1 &&
                    ` · ${monthsCount} tháng: ${money(expectedContractRentForRange)}`}
                </p>
              </div>
              <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">
                {ready ? money(contractedPerMonth) : '—'}
              </span>
            </div>

            {ready && periodInvoiced > 0 && serviceAndOtherDelta !== 0 && (
              <div className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-600 dark:text-slate-300">
                    {serviceAndOtherDelta > 0
                      ? 'Điện, nước, dịch vụ & phát sinh kỳ'
                      : 'Chênh lệch kỳ đầu / giảm trừ HĐ'}
                  </p>
                  <p className="truncate text-[10.5px] text-slate-400 dark:text-slate-500">
                    Chênh lệch so với tiền phòng HĐ
                  </p>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${
                    serviceAndOtherDelta > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {signedMoney(serviceAndOtherDelta)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">
                Công nợ quá hạn (mọi kỳ)
              </span>
              {kpis.overdueInvoicesCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveModule('invoices')}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  <AlertCircle className="h-3 w-3" />
                  {kpis.overdueInvoicesCount} hóa đơn quá hạn
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />0 hóa đơn quá hạn
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions Bar */}
      <div aria-label="Thao tác nhanh" className="grid grid-cols-3 gap-2.5">
        {hasCapability('canManageContracts') && (
          <Button
            type="button"
            hoverScale={1.02}
            tapScale={0.97}
            onClick={() => setContractOpen(true)}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileSignature className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold truncate">Tạo hợp đồng</span>
          </Button>
        )}
        {hasCapability('canManageInvoices') && (
          <Button
            type="button"
            hoverScale={1.02}
            tapScale={0.97}
            onClick={() => setActiveModule('invoices')}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Receipt className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold truncate">Hóa đơn kỳ</span>
          </Button>
        )}
        {hasCapability('canManagePayments') && (
          <Button
            type="button"
            hoverScale={1.02}
            tapScale={0.97}
            onClick={() => setActiveModule('payments')}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-amber-300 hover:bg-amber-50/30 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold truncate">Thu tiền</span>
          </Button>
        )}
      </div>

      {/* Smart Meters (Hunonic IoT) & Maintenance Card */}
      <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
        <button
          type="button"
          onClick={() => setActiveModule('buildings')}
          className="flex min-h-[48px] w-full items-center gap-2.5 px-4 py-3 text-left text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <DoorOpen className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate font-bold text-slate-900 dark:text-white">
              Quản lý sơ đồ phòng &amp; trạng thái
            </p>
            <p className="truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
              {kpis.maintenanceRooms} phòng đang bảo trì · {kpis.expiringContractsCount} HĐ sắp hết hạn
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
        </button>

        <div className="px-4 py-3.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu
                className={`h-4 w-4 ${
                  hasMeterAlerts
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              />
              <p
                className={
                  hasMeterAlerts
                    ? 'font-bold text-amber-700 dark:text-amber-300'
                    : 'font-bold text-slate-900 dark:text-white'
                }
              >
                Công tơ điện thông minh
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {onlineMeters}/{meterRooms.length} online
            </span>
          </div>

          <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
              <strong className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {onlineMeters}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Mất kết nối
              </span>
              <strong className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {offlineMeters}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                Chưa cấu hình
              </span>
              <strong className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {unconfiguredMeters}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Dữ liệu cũ
              </span>
              <strong className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {staleMeters}
              </strong>
            </div>
          </dl>
          <p className="mt-2 text-[10.5px] text-slate-400">
            Chưa cấu hình không đồng nghĩa với chưa lắp công tơ vật lý tại phòng.
          </p>
        </div>
      </div>

      {contractOpen && (
        <ContractWizard
          isOpen
          onClose={closeContract}
          onSuccess={refreshPortfolio}
        />
      )}
    </section>
  );
}
