import React from 'react';
import {
  Search,
  Bell,
  Sun,
  Moon,
  Building2,
  Calendar,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
} from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { usePresentationMode } from '@/shared/hooks/usePresentationMode';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface DesktopHeaderProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  collapsed,
  onToggleSidebar,
}) => {
  const { currentNavConfig, setIsSearchOpen, isNotificationsOpen, setIsNotificationsOpen } = useNavigation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { setOverride } = usePresentationMode();
  const {
    currentOrg,
    organizations,
    setCurrentOrgId,
    buildings,
    selectedBuildingFilter,
    setSelectedBuildingFilter,
    rooms,
  } = usePortfolio();

  return (
    <header
      className={`fixed top-0 right-0 z-20 h-16 bg-surface/95 dark:bg-header-dark/95 backdrop-blur-md border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between px-5 transition-[left] duration-[280ms] ease-in-out motion-reduce:transition-none ${
        collapsed ? 'left-[72px]' : 'left-[256px]'
      }`}
    >
      {/* Left: Sidebar Toggle (Moved outside Sidebar into Header per Task 1) + Breadcrumbs */}
      <div className="flex items-center gap-3">
        {/* External Sidebar Toggle Button with Animate UI timing */}
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          title={collapsed ? 'Mở rộng thanh điều hướng (Ctrl+B)' : 'Thu gọn thanh điều hướng (Ctrl+B)'}
          aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          ) : (
            <PanelLeftClose className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          )}
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

        {/* Breadcrumb & Current Title */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            AdHome Console
          </span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <h1 className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            {currentNavConfig.label}
          </h1>
        </div>

        {/* Unified Dynamic Building Selector dropdown */}
        <div className="hidden lg:flex items-center ml-3 pl-3 border-l border-appBorder-light dark:border-appBorder-dark">
          <div className="relative flex items-center">
            <Building2 className="w-4 h-4 text-brand-primary mr-2" />
            <select
              value={selectedBuildingFilter}
              onChange={e => setSelectedBuildingFilter(e.target.value)}
              className="bg-slate-100/90 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 py-1.5 pl-2.5 pr-8 rounded-lg border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary transition-colors"
            >
              <option value="ALL">🏢 Toàn bộ ({buildings.length} tòa · {rooms.length} phòng)</option>
              {buildings.map(bld => {
                const bldRooms = rooms.filter(r => r.buildingId === bld.id);
                const bldOccupied = bldRooms.filter(r => r.status === 'OCCUPIED').length;
                return (
                  <option key={bld.id} value={bld.id}>
                    📍 {bld.code} ({bldOccupied}/{bldRooms.length} căn)
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Right: Global Search, Period, Notifications, Theme, User */}
      <div className="flex items-center gap-2.5">
        {/* Global Search trigger */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent hover:border-slate-300"
          title="Tìm kiếm nhanh phòng, khách thuê, hợp đồng (Ctrl + K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Tìm phòng, khách, hợp đồng...</span>
          <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-500 font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Time period filter */}
        <div className="hidden md:flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 px-2.5 py-1.5 bg-slate-100/70 dark:bg-slate-800/70 rounded-lg">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>Kỳ T10/2026</span>
        </div>

        {/* Notifications toggle */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 rounded-lg text-slate-500 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Thông báo vận hành"
            aria-label="Thông báo vận hành"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"></span>
          </button>
        </div>

        {/* Theme mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
          aria-label="Chuyển chế độ giao diện"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Mobile Viewport Preview Toggle (Rule D-06) */}
        <button
          onClick={() => setOverride('mobile')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-primary bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Xem bố cục Mobile Shell độc lập (Rule D-06)"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Bản Mobile</span>
        </button>

        {/* Multi-Tenant Organization Switcher */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-appBorder-light dark:border-appBorder-dark">
          <select
            value={currentOrg.id}
            onChange={e => setCurrentOrgId(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 border-0 focus:ring-0 cursor-pointer max-w-[160px] truncate"
            title="Chuyển đổi Tổ chức / Tenant"
          >
            {organizations.map(org => (
              <option key={org.id} value={org.id} className="dark:bg-slate-800">
                🏢 {org.name}
              </option>
            ))}
          </select>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {currentOrg.plan}
          </span>
        </div>
      </div>
    </header>
  );
};
