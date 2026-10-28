import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  BookmarkCheck,
  FileText,
  Zap,
  Receipt,
  CreditCard,
  Wallet,
  BarChart3,
  Settings,
  Lock,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { useNavigation, NavModuleId } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface DesktopSidebarProps {
  collapsed: boolean;
}

interface SidebarNavItem {
  id: NavModuleId;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  requiresAdmin?: boolean;
}

interface SidebarNavGroup {
  group: string;
  items: SidebarNavItem[];
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ collapsed }) => {
  const { activeModule, setActiveModule } = useNavigation();
  const { user, login, logout } = useAuth();
  const { totalRoomsCount, occupiedRoomsCount, heldRoomsCount, expiringContractsCount } = usePortfolio();

  const navItems: SidebarNavGroup[] = [
    {
      group: 'VẬN HÀNH CỐT LÕI',
      items: [
        { id: 'overview' as NavModuleId, label: 'Tổng quan', icon: LayoutDashboard },
        { id: 'buildings' as NavModuleId, label: 'Tòa nhà & Phòng', icon: Building2, badge: String(totalRoomsCount) },
        { id: 'tenants' as NavModuleId, label: 'Khách thuê', icon: Users, badge: String(occupiedRoomsCount) },
        { id: 'deposits' as NavModuleId, label: 'Đặt cọc & Giữ chỗ', icon: BookmarkCheck, badge: String(heldRoomsCount), badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
        { id: 'contracts' as NavModuleId, label: 'Hợp đồng', icon: FileText, badge: String(expiringContractsCount), badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' },
      ],
    },
    {
      group: 'TÀI CHÍNH & KỲ TỔNG HỢP',
      items: [
        { id: 'settlements' as NavModuleId, label: 'Kỳ tổng hợp & Điện nước', icon: Zap, badge: 'Hunonic', badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
        { id: 'invoices' as NavModuleId, label: 'Hóa đơn', icon: Receipt, badge: '3', badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
        { id: 'payments' as NavModuleId, label: 'Thanh toán & Đối soát', icon: CreditCard },
        { id: 'finance' as NavModuleId, label: 'Thu chi & Sổ quỹ', icon: Wallet, requiresAdmin: true },
      ],
    },
    {
      group: 'HỆ THỐNG & BÁO CÁO',
      items: [
        { id: 'reports' as NavModuleId, label: 'Báo cáo doanh thu', icon: BarChart3 },
        { id: 'settings' as NavModuleId, label: 'Cài đặt & Phân quyền', icon: Settings, requiresAdmin: true },
      ],
    },
  ];

  const handleRoleToggle = () => {
    if (user?.role === 'ORG_ADMIN') {
      login('MANAGER');
    } else {
      login('ORG_ADMIN');
    }
  };

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 flex flex-col bg-sidebar-light dark:bg-sidebar-dark border-r border-appBorder-light dark:border-appBorder-dark transition-[width] duration-[280ms] ease-in-out motion-reduce:transition-none select-none ${
        collapsed ? 'w-[72px]' : 'w-[256px]'
      }`}
      aria-label="Thanh điều hướng chính"
    >
      {/* Brand Header: Logo switch smoothly without duplicate toggle button */}
      <div className={`h-16 flex items-center px-4 border-b border-appBorder-light dark:border-appBorder-dark overflow-hidden ${
        collapsed ? 'justify-center' : 'justify-start'
      }`}>
        <div className="flex items-center gap-2 transition-opacity duration-200">
          {!collapsed ? (
            <BrandLogo size="md" variant="horizontal" />
          ) : (
            <BrandLogo size="sm" variant="icon-only" />
          )}
        </div>
      </div>

      {/* Navigation Modules List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {navItems.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            {/* Section label - smoothly fades out when collapsed */}
            <div
              className={`px-2.5 pb-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase transition-opacity duration-200 ${
                collapsed ? 'opacity-0 h-0 p-0 m-0 overflow-hidden' : 'opacity-100'
              }`}
            >
              {group.group}
            </div>

            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              const isLocked = item.requiresAdmin && user?.role === 'MANAGER';

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!isLocked) {
                      setActiveModule(item.id);
                    }
                  }}
                  disabled={isLocked}
                  title={`${item.label} ${isLocked ? '(Chỉ dành cho Admin)' : ''}`}
                  className={`w-full flex items-center rounded-xl text-[13.5px] font-medium transition-all group relative ${
                    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                  } ${
                    isActive
                      ? 'bg-brand-primary text-white shadow-soft font-semibold'
                      : isLocked
                      ? 'opacity-40 text-slate-400 cursor-not-allowed hover:bg-transparent'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-primary'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${isActive ? 'text-white' : ''}`} />

                  {/* Collapsed dot badge for alerts */}
                  {collapsed && item.badge && !isActive && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-primary ring-2 ring-white dark:ring-slate-900" />
                  )}

                  {/* Expanded Label and Badges */}
                  {!collapsed && (
                    <div className="flex-1 flex items-center justify-between text-left overflow-hidden whitespace-nowrap">
                      <span className="truncate">{item.label}</span>
                      {isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-slate-400 ml-1.5 flex-shrink-0" />
                      ) : item.badge ? (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ml-1.5 ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : item.badgeColor || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Role Switcher & User Profile Footer */}
      <div className="p-2.5 border-t border-appBorder-light dark:border-appBorder-dark bg-slate-50/70 dark:bg-slate-900/70">
        {/* Role Quick Switcher (RBAC) */}
        {!collapsed ? (
          <div className="mb-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-appBorder-light dark:border-appBorder-dark transition-opacity duration-200">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              <span className="flex items-center gap-1 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-brand-primary" /> Phân quyền RBAC
              </span>
              <button
                onClick={handleRoleToggle}
                className="text-brand-primary hover:underline font-bold text-[10px]"
                title="Đổi vai trò giữa Admin và Manager để kiểm tra giao diện"
              >
                Đổi vai trò ⇄
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  user?.role === 'ORG_ADMIN'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}
              >
                {user?.role === 'ORG_ADMIN' ? 'ORG_ADMIN' : 'MANAGER'}
              </span>
              <span className="text-[10.5px] text-slate-600 dark:text-slate-400 truncate">
                {user?.role === 'ORG_ADMIN' ? 'Toàn quyền 4 tòa' : '2 tòa phân công'}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-2 flex justify-center">
            <button
              onClick={handleRoleToggle}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                user?.role === 'ORG_ADMIN'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
              }`}
              title={`Vai trò hiện tại: ${user?.role}. Bấm để đổi vai trò.`}
            >
              {user?.role === 'ORG_ADMIN' ? 'ADM' : 'MGR'}
            </button>
          </div>
        )}

        {/* User Profile */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-primary to-teal-400 text-white flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0"
              title={user?.name}
            >
              {user?.name.charAt(0) || 'A'}
            </div>
            {!collapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {user?.name || 'Chưa đăng nhập'}
                </p>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">
                  {user?.email || 'admin@adhome.vn'}
                </p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
