import React, { useState } from 'react';
import { Bell, Building2, Check, Menu, Search, X } from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface MobileHeaderProps {
  onOpenDrawer: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onOpenDrawer,
}) => {
  const {
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
    activeBuildings,
    notifications,
    unreadNotificationsCount,
    markNotificationsRead,
  } = usePortfolio();

  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
  const allActiveIds = activeBuildings.map((b) => b.id);

  const scopeChipText =
    activeBuildings.length === 0
      ? '0 tòa'
      : selectedBuildingIds.length === 0 ||
        selectedBuildingIds.length >= activeBuildings.length
      ? `Tất cả (${activeBuildings.length})`
      : selectedBuildingIds.length === 1
      ? activeBuildings.find((b) => b.id === selectedBuildingIds[0])?.code ||
        '1 tòa'
      : `${selectedBuildingIds.length}/${activeBuildings.length} tòa`;

  return (
    <>
      <header
        data-testid="console-mobile-header"
        className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-2 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-[#111827]/95 px-3 backdrop-blur-md"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            data-testid="console-mobile-menu-trigger"
            onClick={onOpenDrawer}
            aria-label="Mở menu điều hướng"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {activeSubBreadcrumb || currentNavConfig.label}
            </h1>
            {activeSubBreadcrumb && (
              <p className="truncate text-[10px] font-medium text-slate-400">
                {currentNavConfig.label}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {currentNavConfig.supportsBuildingScope && (
            <button
              type="button"
              data-testid="console-mobile-building-scope"
              onClick={() => setScopeSheetOpen(true)}
              className="inline-flex h-9 max-w-[116px] items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-blue-400" />
              <span className="truncate">{scopeChipText}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Tìm kiếm"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            data-testid="console-mobile-notifications-trigger"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            aria-label="Thông báo"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800"
          >
            <Bell className="h-4 w-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Building Scope Bottom Sheet */}
      {scopeSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 backdrop-blur-[1px]">
          <div className="w-full rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Chọn phạm vi tòa nhà
              </h3>
              <button
                type="button"
                onClick={() => setScopeSheetOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedBuildingIds([]);
                setScopeSheetOpen(false);
              }}
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-xs font-semibold text-brand-primary dark:text-blue-400"
            >
              <span>Tất cả tòa nhà trong phạm vi ({activeBuildings.length})</span>
              {selectedBuildingIds.length === 0 && <Check className="h-4 w-4" />}
            </button>
            <div className="max-h-60 space-y-1.5 overflow-y-auto">
              {activeBuildings.map((b) => {
                const checked =
                  selectedBuildingIds.length === 0 ||
                  selectedBuildingIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBuildingInScope(b.id, allActiveIds)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 px-3.5 py-2.5 text-left"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {b.code} · {b.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.stats.occupiedRooms}/{b.stats.totalRooms} phòng có
                        khách
                      </div>
                    </div>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        checked
                          ? 'border-brand-primary bg-brand-primary text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Notifications Sheet */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 backdrop-blur-[1px]">
          <div className="w-full rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Thông báo hệ thống
                </h3>
                <p className="text-[11px] text-slate-500">
                  {unreadNotificationsCount > 0
                    ? `${unreadNotificationsCount} chưa đọc`
                    : 'Đã đọc tất cả'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void markNotificationsRead(
                        notifications.filter((n) => !n.isRead).map((n) => n.key)
                      )
                    }
                    className="text-xs font-semibold text-brand-primary dark:text-blue-400"
                  >
                    Đã đọc hết
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-64 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Không có thông báo mới.
                </p>
              ) : (
                notifications.map((n) => (
                  <div key={n.key} className="py-2.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {n.title}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {n.description}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
