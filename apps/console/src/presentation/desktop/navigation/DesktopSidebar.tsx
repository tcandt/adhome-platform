import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronUp,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  NAV_GROUPS_CONFIG,
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui/animate-sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@animate-ui/react/primitives/tooltip';

export const DesktopSidebar: React.FC = () => {
  const { user, logout, hasCapability } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    activeModule,
    setActiveModule,
    isNotificationsOpen,
    setIsNotificationsOpen,
  } = useNavigation();
  const {
    syncStatus,
    syncError,
    lastSyncedAt,
    organization,
    activeBuildings,
    notifications,
    unreadNotificationsCount,
    markNotificationsRead,
    refreshPortfolio,
    moduleCounts,
  } = usePortfolio();

  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

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

  const initials = (user?.name || 'AD')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'AD';

  const actorScopeBadgeText =
    user?.assignedBuildingIds === 'ALL'
      ? 'Toàn hệ thống'
      : `Phạm vi: ${activeBuildings.length} tòa`;

  return (
    <Sidebar>
      {/* SIDEBAR HEADER: Brand Logo only (64px in every state).
          The toggle lives in AppShellSidebarToggle (UI-SIDEBAR-02). */}
      <SidebarHeader
        className={isCollapsed ? 'justify-center px-2' : 'justify-start px-4'}
      >
        <button
          type="button"
          onClick={() => setActiveModule('overview')}
          className="flex items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          title="AdHome Console — Trang tổng quan"
        >
          <BrandLogo collapsed={isCollapsed} size="md" />
        </button>
      </SidebarHeader>

      {/* SIDEBAR CONTENT: 10 Operational Modules */}
      <SidebarContent>
        {NAV_GROUPS_CONFIG.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              !item.requiredCapability || hasCapability(item.requiredCapability)
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  const countValue = item.countKey
                    ? moduleCounts[item.countKey]
                    : 0;

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        testId={`console-nav-${item.id}`}
                        onClick={() => setActiveModule(item.id)}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive
                              ? 'text-brand-primary dark:text-blue-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 truncate text-left">
                              {item.label}
                            </span>
                            {countValue > 0 && (
                              <span
                                className={`ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                                  item.countKey === 'invoicesUnpaid'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : isActive
                                    ? 'bg-brand-primary/15 text-brand-primary dark:bg-blue-400/20 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {countValue}
                              </span>
                            )}
                          </>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* SIDEBAR FOOTER: Sync Status + Notifications + User Profile */}
      <SidebarFooter
        className={
          isCollapsed
            ? 'p-2 flex flex-col items-center gap-2 border-t border-slate-200/80 dark:border-slate-800/80'
            : 'p-3 flex flex-col gap-2.5 border-t border-slate-200/80 dark:border-slate-800/80'
        }
      >
        {/* ROW 1: System Sync + Notifications */}
        <div
          className={
            isCollapsed
              ? 'flex flex-col items-center gap-2 w-full'
              : 'flex items-center justify-between px-1 w-full'
          }
        >
          {/* Live Sync Status */}
          {syncStatus === 'error' ? (
            <button
              type="button"
              data-testid="console-sync-status"
              onClick={() => void refreshPortfolio()}
              title={syncError || 'Lỗi kết nối PostgreSQL — Nhấn để thử lại'}
              className={
                isCollapsed
                  ? 'relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 shadow-2xs'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300 shadow-2xs'
              }
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {!isCollapsed && <span>Lỗi sync — Thử lại</span>}
            </button>
          ) : (
            <Tooltip side="right" sideOffset={10}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid="console-sync-status"
                  onClick={() => void refreshPortfolio()}
                  aria-label="Trạng thái đồng bộ PostgreSQL"
                  className={
                    isCollapsed
                      ? 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors'
                      : 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors'
                  }
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    {syncStatus === 'loading' || syncStatus === 'refreshing' ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
                    ) : (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </>
                    )}
                  </span>
                  {!isCollapsed && (
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      PostgreSQL Live
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                {lastSyncedAt
                  ? `Đồng bộ PostgreSQL lúc ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN')} (Nhấn để làm mới)`
                  : 'Đang kết nối PostgreSQL...'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Notifications Trigger & Popover */}
          <div ref={notifRef} className="relative">
            {isCollapsed ? (
              <Tooltip side="right" sideOffset={10}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-testid="console-notifications-trigger"
                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                    aria-label="Thông báo vận hành"
                    className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadNotificationsCount > 0 && (
                      <span
                        data-testid="console-notifications-unread-badge"
                        className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#111827]"
                      >
                        {unreadNotificationsCount > 9
                          ? '9+'
                          : unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                  Thông báo hệ thống ({unreadNotificationsCount} chưa đọc)
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                data-testid="console-notifications-trigger"
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                aria-label="Thông báo vận hành"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors shadow-2xs cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span
                    data-testid="console-notifications-unread-badge"
                    className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#111827]"
                  >
                    {unreadNotificationsCount > 9
                      ? '9+'
                      : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Notifications Popover */}
            {isNotificationsOpen && (
              <div
                data-testid="console-notifications-popover"
                className="absolute left-full bottom-0 z-50 ml-3 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
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
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
                        Không có cảnh báo hoặc yêu cầu mới chưa xử lý.
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
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                          item.isRead
                            ? 'opacity-70'
                            : 'bg-blue-50/40 dark:bg-blue-950/20'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            item.isRead
                              ? 'bg-slate-300 dark:bg-slate-600'
                              : 'bg-blue-600'
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
        </div>

        {/* ROW 2: User Profile Card & Dropdown */}
        <div ref={userMenuRef} className="relative w-full">
          {isCollapsed ? (
            <Tooltip side="right" sideOffset={10}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid="console-user-menu-trigger"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-500 text-xs font-bold text-white shadow-2xs hover:opacity-90 transition-opacity cursor-pointer mx-auto"
                >
                  {initials}
                </button>
              </TooltipTrigger>
              <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                {user?.name} ({user?.backendRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'})
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              data-testid="console-user-menu-trigger"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-500 text-xs font-bold text-white shadow-2xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs font-semibold text-slate-900 dark:text-white"
                  title={user?.name}
                >
                  {user?.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    data-testid="console-actor-role-badge"
                    className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300"
                  >
                    {user?.backendRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'}
                  </span>
                  <span className="truncate text-[10px] text-slate-400">
                    {user?.roleTitle}
                  </span>
                </div>
              </div>
              <ChevronUp
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isUserMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}

          {/* User Profile Popover */}
          {isUserMenuOpen && (
            <div
              data-testid="console-user-menu-popover"
              className="absolute left-full bottom-0 z-50 ml-3 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-2xl"
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
                </div>
                {organization && (
                  <div className="mt-1.5 truncate text-[11px] text-slate-400">
                    Tổ chức: {organization.name}
                  </div>
                )}
              </div>

              <div className="py-1">
                <button
                  type="button"
                  data-testid="console-theme-toggle"
                  onClick={() => toggleTheme()}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    Cài đặt & Thiết lập hệ thống
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                <button
                  type="button"
                  data-testid="console-logout-button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất an toàn
                </button>
              </div>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
