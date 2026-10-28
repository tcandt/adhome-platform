import React from 'react';
import {
  TrendingUp,
  Building2,
  Home,
  Users,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Zap,
  Receipt,
  CreditCard,
  Send,
  Plus,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import {
  EXPIRING_CONTRACTS_MOCK,
  PENDING_INVOICES_MOCK,
  RECENT_TRANSACTIONS_MOCK,
} from '@/shared/data/businessMetrics';

export const OverviewDashboard: React.FC = () => {
  const { user, activeBuildingId } = useAuth();
  const { setActiveModule } = useNavigation();
  const { currentOrg, buildings, rooms } = usePortfolio();

  // Filter buildings according to user scope & header active building selection
  const scopedBuildings = buildings.filter(b => {
    if (activeBuildingId !== 'ALL' && b.id !== activeBuildingId) return false;
    if (user?.assignedBuildingIds !== 'ALL') {
      return user?.assignedBuildingIds?.includes(b.id);
    }
    return true;
  });

  // Calculate metrics dynamically from dynamic portfolio rooms
  const scopedRooms = rooms.filter(r => {
    if (activeBuildingId !== 'ALL' && r.buildingId !== activeBuildingId) return false;
    return true;
  });

  const totalRooms = scopedRooms.length;
  const occupiedRooms = scopedRooms.filter(r => r.status === 'OCCUPIED').length;
  const availableRooms = scopedRooms.filter(r => r.status === 'AVAILABLE').length;
  const heldRooms = scopedRooms.filter(r => r.status === 'HELD').length;
  const maintenanceRooms = scopedRooms.filter(r => r.status === 'MAINTENANCE').length;
  const monthlyRevenue = scopedRooms.filter(r => r.status === 'OCCUPIED').reduce((acc, r) => acc + r.price, 0);
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const hunonicOnlineCount = scopedRooms.filter(r => r.meterStatus.hunonicOnline).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-2xl text-white shadow-elevated">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              {activeBuildingId === 'ALL' ? `Tổ chức: ${currentOrg.name}` : scopedBuildings[0]?.name}
            </span>
            <span className="text-xs text-blue-100 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"></span> Đồng bộ Hunonic IoT trực tiếp
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            Vận hành căn hộ dịch vụ AdHome
          </h2>
          <p className="text-xs text-blue-100/90 mt-1 max-w-xl">
            Portfolio Workspace: {scopedBuildings.length} tòa nhà, {totalRooms} căn hộ, quản lý hợp đồng, hóa đơn FSM và đối soát tự động.
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveModule('deposits')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white text-blue-700 hover:bg-blue-50 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Tạo cọc giữ phòng
          </button>
          <button
            onClick={() => setActiveModule('settlements')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-colors backdrop-blur-sm"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" /> Chốt số điện nước
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy Card */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tỷ lệ lấp đầy
            </span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-brand-primary">
              <Home className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {occupancyRate}%
            </span>
            <span className="text-xs text-slate-500">
              ({occupiedRooms}/{totalRooms} phòng)
            </span>
          </div>
          {/* Progress Bar */}
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
            <div className="bg-brand-primary h-full" style={{ width: `${occupancyRate}%` }} title={`Đang thuê: ${occupiedRooms} căn`} />
            <div className="bg-amber-400 h-full" style={{ width: `${(heldRooms / totalRooms) * 100}%` }} title={`Giữ cọc: ${heldRooms} căn`} />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-primary"></span> Thuê: {occupiedRooms}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span> Cọc: {heldRooms}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Trống: {availableRooms}
            </span>
          </div>
        </div>

        {/* Expected Revenue */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Doanh thu tháng 10
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {monthlyRevenue.toLocaleString('vi-VN')}₫
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> 6 căn đang phát sinh dòng tiền
            </span>
            <span className="text-slate-400">Đã thu: 92%</span>
          </div>
        </div>

        {/* Receivables & Debt */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Công nợ cần thu
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-rose-600">
              5.520.000₫
            </span>
            <span className="text-xs text-slate-500">(1 phòng 31-05)</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-rose-500 font-medium">Quá hạn 3 ngày</span>
            <button
              onClick={() => setActiveModule('invoices')}
              className="text-brand-primary hover:underline font-semibold"
            >
              Nhắc nợ ➔
            </button>
          </div>
        </div>

        {/* Hunonic Metering Gateway */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Công tơ Hunonic IoT
            </span>
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950 text-cyan-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {hunonicOnlineCount}/{totalRooms}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              Online ({Math.round((hunonicOnlineCount / totalRooms) * 100)}%)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> 1 công tơ 24-06 bảo trì
            </span>
            <button
              onClick={() => setActiveModule('settlements')}
              className="text-cyan-600 hover:underline font-semibold"
            >
              Xem chỉ số ➔
            </button>
          </div>
        </div>
      </div>

      {/* Buildings Breakdown Grid (Unified Workspace Portfolio) */}
      <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-primary" /> Danh mục 4 tòa nhà tập trung
            </h3>
            <p className="text-xs text-slate-500">
              Khu đô thị Ân Phú, phường Tân An, TP. Buôn Ma Thuột, Đắk Lắk (34 căn hộ dịch vụ)
            </p>
          </div>
          <button
            onClick={() => setActiveModule('buildings')}
            className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
          >
            Mở Workspace quản lý ➔
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {scopedBuildings.map(b => {
            const bRooms = rooms.filter(r => r.buildingId === b.id);
            const bOccupied = bRooms.filter(r => r.status === 'OCCUPIED').length;
            const bAvailable = bRooms.filter(r => r.status === 'AVAILABLE').length;

            return (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-appBorder-light dark:border-appBorder-dark hover:border-brand-primary dark:hover:border-brand-primary transition-colors bg-slate-50/50 dark:bg-slate-900/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      {b.code}
                    </span>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1.5 truncate">
                      {b.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{b.address}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    IoT {b.hunonicGatewayStatus}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center py-2 bg-white dark:bg-slate-800 rounded-lg border border-appBorder-light dark:border-appBorder-dark">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Đang ở</span>
                    <strong className="text-sm text-slate-800 dark:text-slate-100">{bOccupied}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Phòng trống</span>
                    <strong className="text-sm text-emerald-600">{bAvailable}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Lấp đầy</span>
                    <strong className="text-sm text-brand-primary">
                      {Math.round((bOccupied / b.totalRooms) * 100)}%
                    </strong>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Doanh thu: <b>{b.monthlyRevenue.toLocaleString('vi-VN')}₫</b></span>
                  <span className="text-emerald-600 font-medium">Thu {b.collectionRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Column Section: Expiring Contracts & Overdue Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Contracts */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Hợp đồng sắp hết hạn (30 ngày)
              </h3>
              <p className="text-xs text-slate-400">Cần liên hệ khách thuê để gia hạn hoặc xếp lịch nhận phòng</p>
            </div>
            <button
              onClick={() => setActiveModule('contracts')}
              className="text-xs font-medium text-brand-primary hover:underline"
            >
              Tất cả ➔
            </button>
          </div>

          <div className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
            {EXPIRING_CONTRACTS_MOCK.map(contract => (
              <div key={contract.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {contract.roomCode}
                    </span>
                    <span className="text-xs text-slate-500">• {contract.tenantName}</span>
                    <span className="text-[11px] text-slate-400">({contract.phone})</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {contract.buildingName} • Tiền thuê: {contract.monthlyRent.toLocaleString('vi-VN')}₫/th
                  </p>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        contract.daysRemaining <= 15
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                    >
                      Còn {contract.daysRemaining} ngày
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Hết hạn: {contract.endDate}</p>
                  </div>
                  <button
                    onClick={() => setActiveModule('contracts')}
                    className="p-1.5 text-slate-400 hover:text-brand-primary rounded-lg hover:bg-slate-100"
                    title="Chi tiết hợp đồng"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending & Overdue Invoices */}
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-500" /> Hóa đơn chưa thanh toán
              </h3>
              <p className="text-xs text-slate-400">Quản lý thu tiền theo quy trình trạng thái FSM</p>
            </div>
            <button
              onClick={() => setActiveModule('invoices')}
              className="text-xs font-medium text-brand-primary hover:underline"
            >
              Xem hóa đơn ➔
            </button>
          </div>

          <div className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
            {PENDING_INVOICES_MOCK.map(inv => (
              <div key={inv.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {inv.roomCode}
                    </span>
                    <span className="text-xs text-slate-500">• {inv.tenantName}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inv.status === 'OVERDUE'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                    >
                      {inv.status === 'OVERDUE' ? 'Quá hạn' : 'Chờ thanh toán'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Điện: {inv.electricAmount.toLocaleString('vi-VN')}₫ | Nước: {inv.waterAmount.toLocaleString('vi-VN')}₫ | Phòng: {inv.roomRentAmount.toLocaleString('vi-VN')}₫
                  </p>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      {inv.amount.toLocaleString('vi-VN')}₫
                    </span>
                    <span className="text-[10px] text-slate-400">Hạn: {inv.dueDate}</span>
                  </div>
                  <button
                    onClick={() => alert(`Gửi thông báo nhắc thanh toán hóa đơn ${inv.invoiceCode} cho khách ${inv.tenantName} qua Zalo & SMS.`)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg"
                    title="Gửi nhắc nợ Zalo"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions & Payment Ledger */}
      <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" /> Sổ quỹ & Giao dịch ngân hàng gần đây
            </h3>
            <p className="text-xs text-slate-400">
              Đối soát tự động qua SePay Webhook và sao kê tài khoản ngân hàng VCB
            </p>
          </div>
          <button
            onClick={() => setActiveModule('payments')}
            className="text-xs font-medium text-brand-primary hover:underline"
          >
            Lịch sử đối soát ➔
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-appBorder-light dark:border-appBorder-dark text-slate-400 font-semibold">
                <th className="pb-2.5">Mã GD</th>
                <th className="pb-2.5">Thời gian</th>
                <th className="pb-2.5">Phòng / Khách</th>
                <th className="pb-2.5">Kênh thanh toán</th>
                <th className="pb-2.5">Nội dung đối soát</th>
                <th className="pb-2.5 text-right">Số tiền</th>
                <th className="pb-2.5 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
              {RECENT_TRANSACTIONS_MOCK.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {tx.code}
                  </td>
                  <td className="py-2.5 text-slate-400 text-[11px]">{tx.timestamp}</td>
                  <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {tx.roomCode} • {tx.payerName}
                  </td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      {tx.method}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-500 font-mono text-[11px] truncate max-w-xs">
                    {tx.reference}
                  </td>
                  <td className={`py-2.5 text-right font-bold ${
                    tx.type === 'EXPENSE_MAINTENANCE' ? 'text-rose-600' : 'text-emerald-600'
                  }`}>
                    {tx.type === 'EXPENSE_MAINTENANCE' ? '-' : '+'}
                    {tx.amount.toLocaleString('vi-VN')}₫
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã ghi sổ
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
