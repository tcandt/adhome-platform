import React from 'react';
import {
  X,
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
  ShieldCheck,
  LogOut,
  Lock,
} from 'lucide-react';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { useNavigation, NavModuleId } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { UserCapabilities } from '@/shared/types/auth';
import { PENDING_INVOICES_MOCK } from '@/shared/data/businessMetrics';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ isOpen, onClose }) => {
  const { activeModule, setActiveModule } = useNavigation();
  const { user, logout, hasCapability, isBuildingAllowed } = useAuth();
  const {
    buildings,
    totalRoomsCount,
    occupiedRoomsCount,
    heldRoomsCount,
    expiringContractsCount,
  } = usePortfolio();

  if (!isOpen) return null;

  const scopedPendingInvoicesCount = PENDING_INVOICES_MOCK.filter(inv =>
    isBuildingAllowed(inv.buildingCode)
  ).length;

  const navItems: {
    id: NavModuleId;
    label: string;
    icon: React.ElementType;
    badge?: string;
    requiredCapability?: keyof UserCapabilities;
  }[] = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, requiredCapability: 'canViewOverview' },
    { id: 'buildings', label: 'Tòa nhà & Phòng', icon: Building2, badge: String(totalRoomsCount), requiredCapability: 'canManageRooms' },
    { id: 'tenants', label: 'Khách thuê', icon: Users, badge: String(occupiedRoomsCount), requiredCapability: 'canManageTenants' },
    { id: 'deposits', label: 'Đặt cọc & Giữ chỗ', icon: BookmarkCheck, badge: String(heldRoomsCount), requiredCapability: 'canManageDeposits' },
    { id: 'contracts', label: 'Hợp đồng', icon: FileText, badge: String(expiringContractsCount), requiredCapability: 'canManageContracts' },
    { id: 'settlements', label: 'Kỳ tổng hợp & Điện nước', icon: Zap, badge: 'Hunonic', requiredCapability: 'canManageSettlements' },
    { id: 'invoices', label: 'Hóa đơn', icon: Receipt, badge: String(scopedPendingInvoicesCount), requiredCapability: 'canManageInvoices' },
    { id: 'payments', label: 'Thanh toán & Đối soát', icon: CreditCard, requiredCapability: 'canManagePayments' },
    { id: 'finance', label: 'Thu chi & Sổ quỹ', icon: Wallet, requiredCapability: 'canAccessFinance' },
    { id: 'reports', label: 'Báo cáo doanh thu', icon: BarChart3, requiredCapability: 'canViewReports' },
    { id: 'settings', label: 'Cài đặt & Phân quyền', icon: Settings, requiredCapability: 'canManageSettings' },
  ];

  const isAdmin = user?.role === 'ORG_ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer content */}
      <div className="relative w-[300px] max-w-[85vw] bg-white dark:bg-slate-900 h-full flex flex-col z-10 shadow-drawer overflow-hidden">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-appBorder-light dark:border-appBorder-dark">
          <BrandLogo size="md" variant="horizontal" />
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modules List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const isLocked = item.requiredCapability
              ? !hasCapability(item.requiredCapability)
              : false;

            return (
              <button
                key={item.id}
                data-testid={`mobile-nav-item-${item.id}`}
                data-locked={isLocked ? 'true' : 'false'}
                onClick={() => {
                  if (!isLocked) {
                    setActiveModule(item.id);
                    onClose();
                  }
                }}
                disabled={isLocked}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-primary text-white font-semibold'
                    : isLocked
                    ? 'opacity-40 text-slate-400 cursor-not-allowed'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {isLocked ? (
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                ) : item.badge ? (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Authoritative RBAC Status & User Profile Footer (Zero Role Switcher) */}
        <div className="p-3 border-t border-appBorder-light dark:border-appBorder-dark bg-slate-50 dark:bg-slate-800/50">
          <div className="mb-2.5 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span className="font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Vai trò xác thực
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {isAdmin
                ? `Admin (${buildings.length} tòa toàn quyền)`
                : `Manager (${buildings.length} tòa phân công)`}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-brand-primary text-white flex items-center justify-center font-bold text-xs flex-shrink-0 uppercase">
                {user?.name?.charAt(0) || 'A'}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {user?.name}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>

            <button
              data-testid="console-mobile-logout-button"
              onClick={() => {
                void logout();
                onClose();
              }}
              className="p-1.5 text-rose-500 rounded-lg hover:bg-rose-50"
              aria-label="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
