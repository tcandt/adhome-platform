import React, { useCallback, useState } from 'react';
import { ArrowRight, DoorOpen, FileSignature, Receipt, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatPeriodDisplay } from '@/app/navigation/navigationConfig';

import { ContractCreationWizardModal as ContractWizard } from '../modules/modals/ContractCreationWizardModal';
const money = (n: number) => `${Math.trunc(n).toLocaleString('vi-VN')} đ`;
const compactMoney = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu` : money(n);
const card = 'rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#111827] shadow-2xs';

export function MobileOverviewSummary() {
  const { user, hasCapability } = useAuth();
  const { selectedPeriod, setSelectedPeriod, setActiveModule } = useNavigation();
  const { kpis, syncStatus, refreshPortfolio, lastSyncedAt, rooms } = usePortfolio();
  const [contractOpen, setContractOpen] = useState(false);
  const closeContract = useCallback(() => setContractOpen(false), []);
  const busy = syncStatus === 'loading' || syncStatus === 'refreshing';
  const ready = Boolean(lastSyncedAt);
  const meterRooms = rooms.filter(room => room.occupancyStatus !== 'ARCHIVED');
  const meterCount = (status: string) => meterRooms.filter(room => room.meterStatus === status).length;
  const metrics = [
    ['Tổng số phòng', kpis.totalRooms, `${kpis.buildingsCount} tòa nhà`, 'text-slate-900 dark:text-white'],
    ['Đang sử dụng', kpis.occupiedRooms, `${kpis.occupancyRatePercent.toLocaleString('vi-VN')}% lấp đầy`, 'text-blue-600 dark:text-blue-400'],
    ['Phòng trống', kpis.availableRooms, 'Sẵn sàng cho thuê', 'text-emerald-600 dark:text-emerald-400'],
    ['Giữ chỗ', kpis.reservedRooms, 'Phòng đang giữ chỗ', 'text-amber-600 dark:text-amber-400'],
  ] as const;
  return (
    <section aria-label="Tổng quan vận hành" className="space-y-3.5" aria-busy={busy}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Xin chào, {user?.backendRole === 'ADMIN' ? 'Admin' : user?.name}
          </p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Tổng quan vận hành
          </h1>
          <p className="sr-only">{formatPeriodDisplay(selectedPeriod)}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshPortfolio()}
          disabled={busy}
          aria-label="Làm mới dữ liệu"
          title="Làm mới dữ liệu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-2xs"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {busy && (
        <p role="status" className="text-xs text-blue-600 dark:text-blue-400 animate-pulse font-medium">
          Đang cập nhật dữ liệu từ máy chủ…
        </p>
      )}

      <div data-testid="mobile-room-kpis" className="grid grid-cols-2 gap-3">
        {metrics.map(([label, value, hint, color]) => (
          <div key={label} className={`${card} min-w-0 p-3.5 flex flex-col justify-between`}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${color}`}>
              {ready ? value : '—'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {ready ? hint : 'Đang tải…'}
            </p>
          </div>
        ))}
      </div>

      <section className={`${card} p-4.5`} aria-label="Tài chính theo kỳ">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Tài chính</h2>
            <p className="text-[11px] text-slate-500">Kỳ {formatPeriodDisplay(selectedPeriod)}</p>
          </div>
          <label className="flex items-center gap-1">
            <span className="sr-only">Kỳ tài chính</span>
            <input
              aria-label="Kỳ tài chính"
              type="month"
              value={selectedPeriod}
              onChange={e => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) setSelectedPeriod(e.target.value);
              }}
              className="h-9 min-w-0 max-w-[140px] rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
        </div>

        <div className="mt-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tiền phòng theo hợp đồng / tháng</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {ready ? money(kpis.contractedMonthlyRentVnd) : '—'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {kpis.activeContractsCount} hợp đồng đang có hiệu lực
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="rounded-xl bg-amber-50/60 p-2.5 dark:bg-amber-950/20">
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Còn phải thu</p>
            <p className="mt-1 text-base font-bold tabular-nums text-amber-800 dark:text-amber-200 truncate" title={money(kpis.periodReceivableVnd)}>
              {ready ? compactMoney(kpis.periodReceivableVnd) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/20">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Đã thu trong kỳ</p>
            <p className="mt-1 text-base font-bold tabular-nums text-emerald-800 dark:text-emerald-200 truncate" title={money(kpis.periodCollectedVnd)}>
              {ready ? compactMoney(kpis.periodCollectedVnd) : '—'}
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Số dư chưa thu · {kpis.overdueInvoicesCount} hóa đơn quá hạn (mọi kỳ).
        </p>
      </section>

      <div aria-label="Thao tác nhanh" className="grid grid-cols-3 gap-2">
        {hasCapability('canManageContracts') && (
          <button
            onClick={() => setContractOpen(true)}
            className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-98 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <FileSignature className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-[11px] truncate">Tạo HĐ</span>
          </button>
        )}
        {hasCapability('canManageInvoices') && (
          <button
            onClick={() => setActiveModule('invoices')}
            className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-98 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] truncate">Hóa đơn</span>
          </button>
        )}
        {hasCapability('canManagePayments') && (
          <button
            onClick={() => setActiveModule('payments')}
            className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-98 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 transition-all"
          >
            <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] truncate">Thu tiền</span>
          </button>
        )}
      </div>

      <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
        <button
          onClick={() => setActiveModule('buildings')}
          className="flex min-h-[48px] w-full items-center gap-2.5 px-4 py-3 text-left text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <DoorOpen className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="flex-1 truncate">{kpis.maintenanceRooms} phòng bảo trì · Xem sơ đồ phòng</span>
          <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
        <div className="px-4 py-3.5 text-xs">
          <p className={meterCount('OFFLINE') + meterCount('STALE') > 0 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-slate-900 dark:text-white'}>
            Công tơ điện thông minh
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-1">
              <span>Online:</span> <strong className="text-emerald-600">{meterCount('ONLINE')}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-1">
              <span>Mất kết nối:</span> <strong className="text-rose-600">{meterCount('OFFLINE')}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-1">
              <span>Chưa cấu hình:</span> <strong>{meterCount('UNCONFIGURED')}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-1">
              <span>Dữ liệu cũ:</span> <strong className="text-amber-600">{meterCount('STALE')}</strong>
            </div>
          </dl>
          <p className="mt-2 text-[10.5px] text-slate-400">
            Chưa cấu hình không đồng nghĩa với chưa lắp công tơ.
          </p>
        </div>
      </div>
      {contractOpen && <ContractWizard isOpen onClose={closeContract} onSuccess={refreshPortfolio} />}
    </section>
  );
}
