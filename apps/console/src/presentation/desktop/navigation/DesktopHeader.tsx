import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { useSidebar } from '@/shared/ui/animate-sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@animate-ui/react/primitives/tooltip';

export const DesktopHeader: React.FC = () => {
  const {
    activeModule,
    setActiveModule,
    currentNavConfig,
    activeSubBreadcrumb,
    setIsSearchOpen,
    isNotificationsOpen,
    setIsNotificationsOpen,
  } = useNavigation();

  const {
    notifications,
    unreadNotificationsCount,
    markNotificationsRead,
    organization,
    activeBuildings,
  } = usePortfolio();

  const { user, logout, hasCapability } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Close popovers on click outside or Escape
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNotificationsOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [setIsNotificationsOpen]);

  const initials =
    user?.backendRole === 'ADMIN' && (!user.name || user.name.includes('Admin'))
      ? 'RA'
      : (user?.name || 'AD')
          .split(/\s+/)
          .filter(Boolean)
          .slice(-2)
          .map((p) => p[0])
          .join('')
          .toUpperCase() || 'RA';

  const actorScopeBadgeText =
    user?.assignedBuildingIds === 'ALL'
      ? 'Toàn hệ thống'
      : `Phạm vi: ${activeBuildings.length} tòa`;

  return (
    <header
      data-testid="console-desktop-header"
      className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between bg-white dark:bg-[#111827] px-4 lg:px-6 backdrop-blur-md select-none transition-colors"
    >
      {/* ZONE 1 (LEFT): Sidebar Toggle */}
      <div className="flex items-center gap-3 flex-1 justify-start min-w-0">
        {/* Sidebar Toggle Button (44x44px minimum target) */}
        <Tooltip side="bottom" sideOffset={6} align="start">
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="console-sidebar-toggle"
              data-sidebar="trigger"
              data-state={state}
              aria-expanded={isExpanded}
              aria-controls="console-desktop-sidebar-panel"
              aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} thanh điều hướng (Ctrl+B)`}
              onClick={toggleSidebar}
              className="inline-flex h-11 w-11 min-w-[44px] min-h-[44px] items-center justify-center rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              <span data-testid="console-sidebar-trigger" className="sr-only">
                {isExpanded ? 'Thu gọn' : 'Mở rộng'} thanh điều hướng
              </span>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
            {isExpanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}{' '}
            <kbd className="ml-1 font-mono text-[10px] text-slate-300">Ctrl B</kbd>
          </TooltipContent>
        </Tooltip>

        {/* Header Title & Breadcrumb for screen readers & test query */}
        <span data-testid="console-header-title" className="sr-only">
          {activeSubBreadcrumb
            ? `${currentNavConfig.label} - ${activeSubBreadcrumb}`
            : currentNavConfig.label}
        </span>
      </div>

      {/* ZONE 2 (CENTER): Global Command Search Bar (Ctrl+K) */}
      <div className="flex-1 flex items-center justify-center max-w-xl mx-auto px-2">
        <button
          type="button"
          data-testid="console-global-search-trigger"
          onClick={() => setIsSearchOpen(true)}
          className="inline-flex h-10 w-full max-w-[440px] items-center gap-2.5 rounded-full border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/90 dark:bg-slate-800/60 px-4 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200 transition-all shadow-2xs text-left cursor-pointer"
          title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K)"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="font-medium truncate flex-1">Tìm phòng, khách, hợp đồng...</span>
          <kbd className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400 shadow-2xs shrink-0">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* ZONE 3 (RIGHT): Notifications + Profile Admin */}
      <div className="flex flex-1 items-center justify-end gap-2.5 shrink-0">
        {/* Notifications Bell */}
        <div ref={notifRef} className="relative">
          <Tooltip side="bottom" sideOffset={6} align="end">
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="console-notifications-trigger"
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                aria-expanded={isNotificationsOpen}
                aria-label="Thông báo hệ thống"
                className="relative inline-flex h-9 w-9 min-w-[36px] min-h-[36px] items-center justify-center rounded-full border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 before:absolute before:-inset-1 before:content-['']"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span
                    data-testid="console-notifications-unread-badge"
                    className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-[#111827]"
                  >
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
              Thông báo ({unreadNotificationsCount} chưa đọc)
            </TooltipContent>
          </Tooltip>

          {/* Notifications Popover */}
          {isNotificationsOpen && (
            <div
              data-testid="console-notifications-popover"
              className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    Thông báo hệ thống
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {unreadNotificationsCount > 0
                      ? `${unreadNotificationsCount} thông báo chưa đọc`
                      : 'Tất cả thông báo đã đọc'}
                  </p>
                </div>
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    data-testid="console-notifications-mark-all-read"
                    onClick={() =>
                      void markNotificationsRead(
                        notifications.filter((n) => !n.isRead).map((n) => n.key)
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Đã đọc hết
                  </button>
                )}
              </div>

              <div className="max-h-80 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Không có thông báo mới chưa xử lý.
                    </p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (!item.isRead) {
                          void markNotificationsRead([item.key]);
                        }
                        setActiveModule(item.targetModule as NavModuleId);
                        setIsNotificationsOpen(false);
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer ${
                        item.isRead ? 'opacity-70' : 'bg-blue-50/40 dark:bg-blue-950/20'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                          {item.description}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Admin Avatar Button & Popover */}
        <div ref={userMenuRef} className="relative">
          <Tooltip side="bottom" sideOffset={6} align="end">
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="console-user-menu-trigger"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                aria-label="Tài khoản quản trị"
                className="relative inline-flex h-9 w-9 min-w-[36px] min-h-[36px] items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 text-[11px] font-bold text-white shadow-2xs hover:opacity-90 ring-1 ring-white/20 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 before:absolute before:-inset-1 before:content-['']"
              >
                {initials}
              </button>
            </TooltipTrigger>
            <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
              {user?.name} ({user?.backendRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'})
            </TooltipContent>
          </Tooltip>

          {/* User Profile Popover */}
          {isUserMenuOpen && (
            <div
              data-testid="console-user-menu-popover"
              className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl space-y-1"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2.5">
                <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {user?.name}
                </div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {user?.email}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                    <ShieldCheck className="h-3 w-3" />
                    {user?.roleTitle}
                  </span>
                  <span
                    data-testid="console-actor-scope-badge"
                    className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                  >
                    {actorScopeBadgeText}
                  </span>
                  <span
                    data-testid="console-actor-role-badge"
                    className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300"
                  >
                    {user?.backendRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'}
                  </span>
                </div>
                {organization && (
                  <div className="mt-1.5 truncate text-[11px] text-slate-400">
                    Tổ chức: {organization.name}
                  </div>
                )}
              </div>

              <div className="py-1 space-y-1">
                <button
                  type="button"
                  data-testid="console-theme-toggle"
                  onClick={() => toggleTheme()}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'light' ? (
                      <Moon className="h-4 w-4 text-slate-500" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-400" />
                    )}
                    Giao diện {theme === 'light' ? 'Tối (Dark)' : 'Sáng (Light)'}
                  </span>
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {theme === 'light' ? 'Sáng' : 'Tối'}
                  </span>
                </button>

                {hasCapability('canManageSettings') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModule('settings');
                      setIsUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    Cài đặt & Thiết lập hệ thống
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
                <button
                  type="button"
                  data-testid="console-logout-button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất an toàn
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
