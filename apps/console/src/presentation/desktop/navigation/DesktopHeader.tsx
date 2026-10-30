import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { SidebarTrigger } from '@/shared/ui/animate-sidebar';

export const DesktopHeader: React.FC = () => {
  const { user, logout, hasCapability } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    activeModule,
    setActiveModule,
    setBuildingsSubTab,
    currentNavConfig,
    activeSubBreadcrumb,
    selectedBuildingIds,
    setSelectedBuildingIds,
    toggleBuildingInScope,
    setIsSearchOpen,
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
  } = usePortfolio();

  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const scopeRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (scopeRef.current && !scopeRef.current.contains(target)) {
        setIsScopeOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsScopeOpen(false);
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

  const authorizedActiveIds = useMemo(
    () => activeBuildings.map((b) => b.id),
    [activeBuildings]
  );

  const scopeSummaryLabel = useMemo(() => {
    if (activeBuildings.length === 0) {
      return 'Chưa có tòa nhà (0)';
    }
    if (
      selectedBuildingIds.length === 0 ||
      selectedBuildingIds.length >= activeBuildings.length
    ) {
      return user?.assignedBuildingIds === 'ALL'
        ? `Tất cả tòa nhà (${activeBuildings.length})`
        : `Phạm vi phụ trách (${activeBuildings.length} tòa)`;
    }
    if (selectedBuildingIds.length === 1) {
      const bld = activeBuildings.find((b) => b.id === selectedBuildingIds[0]);
      return bld ? `${bld.code} · ${bld.name}` : '1 tòa nhà';
    }
    return `Đã chọn ${selectedBuildingIds.length}/${activeBuildings.length} tòa nhà`;
  }, [activeBuildings, selectedBuildingIds, user]);

  const actorScopeBadgeText =
    user?.assignedBuildingIds === 'ALL'
      ? 'Toàn hệ thống'
      : `Phạm vi: ${activeBuildings.length} tòa`;

  const initials = (user?.name || 'AD')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (
    <header
      data-testid="console-desktop-header"
      className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-[#111827]/95 px-4 lg:px-6 backdrop-blur-md"
    >
      {/* ZONE 1 (LEFT): Navigation Trigger + Module Title + Conditional 2nd-Level Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger />
        <nav
          aria-label="Điều hướng ngữ cảnh"
          className="flex min-w-0 items-center gap-1.5"
        >
          {activeSubBreadcrumb ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (activeModule === 'buildings') {
                    setBuildingsSubTab('rooms');
                  }
                }}
                className="truncate text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {currentNavConfig.label}
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <h1
                data-testid="console-header-title"
                className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {activeSubBreadcrumb}
              </h1>
            </>
          ) : (
            <h1
              data-testid="console-header-title"
              className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white"
            >
              {currentNavConfig.label}
            </h1>
          )}
        </nav>
      </div>

      {/* ZONE 2 (CENTER): Server-Scoped Single/Multi Building Selector (only on building-scoped modules) */}
      <div className="flex min-w-0 items-center justify-center">
        {currentNavConfig.supportsBuildingScope && (
          <div ref={scopeRef} className="relative">
            <button
              type="button"
              data-testid="console-building-scope-selector"
              onClick={() => setIsScopeOpen((prev) => !prev)}
              className="inline-flex h-9 max-w-[240px] xl:max-w-[300px] items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/90 dark:bg-slate-800/70 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-blue-400" />
              <span className="truncate">{scopeSummaryLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                  isScopeOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isScopeOpen && (
              <div
                data-testid="console-building-scope-popover"
                className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-2.5 pb-2 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Phạm vi tòa nhà
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBuildingIds([]);
                      setIsScopeOpen(false);
                    }}
                    className="text-[11px] font-semibold text-brand-primary dark:text-blue-400 hover:underline"
                  >
                    Chọn tất cả ({activeBuildings.length})
                  </button>
                </div>

                {activeBuildings.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">
                    Chưa có tòa nhà hoạt động trong phạm vi của bạn.
                  </p>
                ) : (
                  <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto">
                    {activeBuildings.map((bld) => {
                      const isChecked =
                        selectedBuildingIds.length === 0 ||
                        selectedBuildingIds.includes(bld.id);
                      return (
                        <div
                          key={bld.id}
                          className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleBuildingInScope(bld.id, authorizedActiveIds)
                            }
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                isChecked
                                  ? 'border-brand-primary bg-brand-primary text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isChecked && <Check className="h-3 w-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                                {bld.code} · {bld.name}
                              </div>
                              <div className="truncate text-[11px] text-slate-400">
                                {bld.stats.occupiedRooms}/{bld.stats.totalRooms}{' '}
                                phòng có khách
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBuildingIds([bld.id]);
                              setIsScopeOpen(false);
                            }}
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                          >
                            Chỉ tòa này
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ZONE 3 (RIGHT): Search (Ctrl+K) + Sync Status + Real Notifications + Avatar Menu */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Global Search (Ctrl/Cmd + K) */}
        <button
          type="button"
          data-testid="console-global-search-trigger"
          onClick={() => setIsSearchOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 px-2.5 xl:px-3 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden xl:inline">Tìm phòng, khách, hợp đồng...</span>
          <kbd className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
            Ctrl K
          </kbd>
        </button>

        {/* PostgreSQL Connection / Sync Indicator */}
        {syncStatus === 'error' ? (
          <button
            type="button"
            data-testid="console-sync-status"
            onClick={() => void refreshPortfolio()}
            title={syncError || 'Lỗi kết nối PostgreSQL — Nhấn để thử lại'}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2.5 text-[11px] font-semibold text-red-700 dark:text-red-300"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden 2xl:inline">Thử lại</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="console-sync-status"
            onClick={() => void refreshPortfolio()}
            title={
              lastSyncedAt
                ? `Đồng bộ PostgreSQL lúc ${new Date(
                    lastSyncedAt
                  ).toLocaleTimeString('vi-VN')}`
                : 'Đang kết nối PostgreSQL...'
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                syncStatus === 'loading' || syncStatus === 'refreshing'
                  ? 'animate-spin text-brand-primary'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
          </button>
        )}

        {/* Real Notifications Popover — Red badge ONLY when unreadNotificationsCount > 0 */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            data-testid="console-notifications-trigger"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            aria-label="Thông báo vận hành"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadNotificationsCount > 0 && (
              <span
                data-testid="console-notifications-unread-badge"
                className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#111827]"
              >
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div
              data-testid="console-notifications-popover"
              className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
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
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-primary dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
                        item.isRead ? 'opacity-70' : 'bg-blue-50/40 dark:bg-blue-950/20'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-brand-primary'
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

        {/* User Avatar Menu (Role, Scope, Theme Switcher, Settings, Logout) */}
        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            data-testid="console-user-menu-trigger"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 pl-1.5 pr-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-tr from-blue-600 to-cyan-500 text-[11px] font-bold text-white">
              {initials}
            </div>
            <div className="hidden md:flex flex-col items-start leading-none">
              <span className="max-w-[116px] truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                {user?.name}
              </span>
              <span
                data-testid="console-actor-role-badge"
                className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
              >
                {user?.backendRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>

          {isUserMenuOpen && (
            <div
              data-testid="console-user-menu-popover"
              className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl"
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
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
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
