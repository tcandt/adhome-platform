import React from 'react';
import {
  FileText,
  Users,
  BookmarkCheck,
  Zap,
  Receipt,
  CreditCard,
  Wallet,
  BarChart3,
  Settings,
  AlertCircle,
  Plus,
  Download,
  Filter,
} from 'lucide-react';
import { NavModuleId, useNavigation } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { EXPIRING_CONTRACTS_MOCK, PENDING_INVOICES_MOCK } from '@/shared/data/businessMetrics';

export const GenericModuleView: React.FC<{ moduleId: NavModuleId }> = ({ moduleId }) => {
  const { currentNavConfig } = useNavigation();
  const { user, isBuildingAllowed } = useAuth();

  const scopedContracts = EXPIRING_CONTRACTS_MOCK.filter(c =>
    isBuildingAllowed(c.buildingCode)
  );
  const scopedInvoices = PENDING_INVOICES_MOCK.filter(inv =>
    isBuildingAllowed(inv.buildingCode)
  );

  return (
    <div className="space-y-6">
      {/* Module Title & Top Toolbar */}
      <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {currentNavConfig.label}
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
              Console V2 Alpha
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {currentNavConfig.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200">
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-hover shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Thêm mới
          </button>
        </div>
      </div>

      {/* Module Specific Preview Content */}
      {moduleId === 'contracts' && (
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            Danh sách Hợp đồng thuê đang theo dõi ({scopedContracts.length} hồ sơ)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder-light dark:border-appBorder-dark text-slate-400 font-semibold">
                  <th className="pb-3">Mã HĐ</th>
                  <th className="pb-3">Khách thuê</th>
                  <th className="pb-3">Tòa / Phòng</th>
                  <th className="pb-3">Ngày hết hạn</th>
                  <th className="pb-3">Giá thuê</th>
                  <th className="pb-3">Tiền cọc</th>
                  <th className="pb-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
                {scopedContracts.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 font-mono font-bold text-brand-primary">{c.contractCode}</td>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">
                      {c.tenantName} ({c.phone})
                    </td>
                    <td className="py-3">{c.buildingName} - {c.roomCode}</td>
                    <td className="py-3 font-semibold text-rose-600">{c.endDate} (còn {c.daysRemaining} ngày)</td>
                    <td className="py-3 font-semibold">{c.monthlyRent.toLocaleString('vi-VN')}₫/th</td>
                    <td className="py-3 text-emerald-600 font-semibold">Đã thu cọc</td>
                    <td className="py-3 text-right">
                      <button className="text-brand-primary hover:underline font-semibold text-xs">
                        Gia hạn
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {moduleId === 'settlements' && (
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft space-y-4">
          <div className="p-4 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6 text-cyan-600" />
              <div>
                <h4 className="text-sm font-bold text-cyan-900 dark:text-cyan-100">
                  Cổng kết nối Hunonic IoT Gateway
                </h4>
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  Chế độ website & mobile provider đã được cấu hình; tự động kéo chỉ số kWh và m³ lúc 00:00 ngày 25 hàng tháng.
                </p>
              </div>
            </div>
            <button
              onClick={() => alert('Đang kích hoạt đồng bộ chỉ số thời gian thực từ Hunonic Cloud API...')}
              className="px-3 py-2 text-xs font-bold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-sm"
            >
              Đồng bộ ngay
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Trạng thái kỳ: <b>Kỳ tổng hợp tháng 10/2026</b> đang chốt số. 125/128 phòng đã có chỉ số điện nước tự động.
          </p>
        </div>
      )}

      {moduleId === 'invoices' && (
        <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            Hóa đơn chu kỳ & Vòng đời FSM ({scopedInvoices.length} hóa đơn)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder-light dark:border-appBorder-dark text-slate-400 font-semibold">
                  <th className="pb-3">Mã HĐ</th>
                  <th className="pb-3">Phòng / Khách</th>
                  <th className="pb-3">Kỳ hóa đơn</th>
                  <th className="pb-3">Hạn thanh toán</th>
                  <th className="pb-3">Tổng tiền</th>
                  <th className="pb-3">Trạng thái FSM</th>
                  <th className="pb-3 text-right">Nhắc nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
                {scopedInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 font-mono font-bold text-slate-800 dark:text-slate-100">{inv.invoiceCode}</td>
                    <td className="py-3 font-medium">{inv.roomCode} - {inv.tenantName}</td>
                    <td className="py-3 text-slate-500">{inv.period}</td>
                    <td className="py-3 text-rose-600 font-medium">{inv.dueDate}</td>
                    <td className="py-3 font-bold text-slate-900 dark:text-slate-100">
                      {inv.amount.toLocaleString('vi-VN')}₫
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => alert(`Gửi mã thanh toán QR SePay cho ${inv.tenantName}`)}
                        className="text-brand-primary hover:underline font-semibold text-xs"
                      >
                        Gửi QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Default placeholder notice according to Rule 9 */}
      {moduleId !== 'contracts' && moduleId !== 'settlements' && moduleId !== 'invoices' && (
        <div className="p-8 text-center bg-surface dark:bg-surface-dark border border-dashed border-appBorder-light dark:border-appBorder-dark rounded-card">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Module {currentNavConfig.label}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Giao diện cấu trúc chuẩn theo Blueprint. Dữ liệu đang được kết nối theo vertical slice tiếp theo.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span>Vai trò đang duyệt: <b>{user?.role}</b></span>
            <span>•</span>
            <span>Quyền truy cập: <b className="text-emerald-600">Đã kích hoạt</b></span>
          </div>
        </div>
      )}
    </div>
  );
};
