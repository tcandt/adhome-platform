import React, { useCallback, useState } from 'react';
import { ArrowRight, DoorOpen, FileSignature, Receipt, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatPeriodDisplay } from '@/app/navigation/navigationConfig';

import { ContractCreationWizardModal as ContractWizard } from '../modules/modals/ContractCreationWizardModal';
const money = (n: number) => `${Math.trunc(n).toLocaleString('vi-VN')} đ`;
const compactMoney = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu` : money(n);
const card = 'rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#111827]';

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
    ['Đang sử dụng', kpis.occupiedRooms, `${kpis.occupancyRatePercent.toLocaleString('vi-VN')}% lấp đầy`, 'text-blue-700 dark:text-blue-300'],
    ['Phòng trống', kpis.availableRooms, 'Sẵn sàng cho thuê', 'text-emerald-700 dark:text-emerald-300'],
    ['Giữ chỗ', kpis.reservedRooms, 'Phòng đang giữ chỗ', 'text-amber-700 dark:text-amber-300'],
  ] as const;
  return <section aria-label="Tổng quan vận hành" className="space-y-3" aria-busy={busy}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Xin chào, {user?.backendRole === 'ADMIN' ? 'Admin' : user?.name}</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">Tổng quan vận hành</h1>
        <p className="sr-only">{formatPeriodDisplay(selectedPeriod)}</p>
      </div>
      <button type="button" onClick={() => void refreshPortfolio()} disabled={busy} aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
      </button>
    </div>
    {busy && <p role="status" className="text-xs text-slate-500 dark:text-slate-400">Đang cập nhật dữ liệu…</p>}
    <div data-testid="mobile-room-kpis" className="grid grid-cols-2 gap-3">
      {metrics.map(([label, value, hint, color]) => <div key={label} className={`${card} min-w-0 p-3`}>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${color}`}>{ready ? value : '—'}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{ready ? hint : 'Đang tải dữ liệu…'}</p>
      </div>)}
    </div>
    <section className={`${card} p-4`} aria-label="Tài chính theo kỳ">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Tài chính</h2>
        <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><span className="sr-only">Kỳ tài chính</span><input aria-label="Kỳ tài chính" type="month" value={selectedPeriod} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setSelectedPeriod(e.target.value); }} className="min-h-11 min-w-0 max-w-[155px] rounded-lg border border-slate-200 bg-transparent px-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]" /></label>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Tiền phòng theo hợp đồng / tháng</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">{ready ? money(kpis.contractedMonthlyRentVnd) : '—'}</p>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{kpis.activeContractsCount} hợp đồng hiệu lực</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div><p className="text-xs text-slate-500 dark:text-slate-400">Còn phải thu</p><p className="mt-1 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300" title={money(kpis.periodReceivableVnd)}>{ready ? compactMoney(kpis.periodReceivableVnd) : '—'}</p></div>
        <div><p className="text-xs text-slate-500 dark:text-slate-400">Đã thu trong kỳ</p><p className="mt-1 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300" title={money(kpis.periodCollectedVnd)}>{ready ? compactMoney(kpis.periodCollectedVnd) : '—'}</p></div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Số dư chưa thu · {kpis.overdueInvoicesCount} hóa đơn quá hạn (mọi kỳ).</p>
    </section>
    <div aria-label="Thao tác nhanh" className="grid grid-cols-3 gap-2">
      {hasCapability('canManageContracts') && <button onClick={() => setContractOpen(true)} className="mobile-quick-action"><FileSignature className="h-5 w-5" /><span>Tạo hợp đồng</span></button>}
      {hasCapability('canManageInvoices') && <button onClick={() => setActiveModule('invoices')} className="mobile-quick-action"><Receipt className="h-5 w-5" /><span>Hóa đơn</span></button>}
      {hasCapability('canManagePayments') && <button onClick={() => setActiveModule('payments')} className="mobile-quick-action"><Wallet className="h-5 w-5" /><span>Thu tiền</span></button>}
    </div>
    <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
      <button onClick={() => setActiveModule('buildings')} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-xs"><DoorOpen className="h-4 w-4 text-blue-600" /><span className="flex-1">{kpis.maintenanceRooms} phòng bảo trì · Xem sơ đồ phòng</span><ArrowRight className="h-4 w-4" /></button>
      <div className="px-4 py-3 text-xs">
        <p className={meterCount('OFFLINE') + meterCount('STALE') > 0 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold'}>Công tơ theo phòng</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <div>Online: <strong>{meterCount('ONLINE')}</strong></div><div>Mất kết nối: <strong>{meterCount('OFFLINE')}</strong></div>
          <div>Chưa cấu hình: <strong>{meterCount('UNCONFIGURED')}</strong></div><div>Dữ liệu cũ: <strong>{meterCount('STALE')}</strong></div>
        </dl>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Chưa cấu hình không đồng nghĩa với chưa lắp công tơ.</p>
      </div>
    </div>
    {contractOpen && <ContractWizard isOpen onClose={closeContract} onSuccess={refreshPortfolio} />}
  </section>;
}
