import React from 'react';
import { LogOut, Moon, Sun, User, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  NAV_GROUPS_CONFIG,
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { MobileSidebarSheet } from '@/shared/ui/animate-sidebar';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  moreOnly?: boolean;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  moreOnly = false,
}) => {
  const { user, logout, hasCapability } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeModule, setActiveModule } = useNavigation();
  const { moduleCounts } = usePortfolio();

  const handleSelect = (id: NavModuleId) => {
    setActiveModule(id);
    onClose();
  };

  return (
    <MobileSidebarSheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={moreOnly ? 'Các mục mở rộng' : 'Menu điều hướng AdHome Console'}
    >
      {/* Header with Clean BrandLogo & Close button */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4">
        {moreOnly ? (
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Menu mở rộng</h2>
            <p className="text-[11px] text-slate-500">Các tính năng nghiệp vụ & hệ thống</p>
          </div>
        ) : (
          <BrandLogo variant="horizontal" size="md" />
        )}
        <button
          type="button"
          data-testid="console-mobile-drawer-close"
          onClick={onClose}
          aria-label={moreOnly ? 'Đóng các mục mở rộng' : 'Đóng menu'}
          className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Shared Navigation across Groups - 4px gap rule */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS_CONFIG.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              (!moreOnly || !['overview', 'buildings', 'invoices', 'payments'].includes(item.id)) &&
              (!item.requiredCapability || hasCapability(item.requiredCapability))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="mb-4 last:mb-0">
              <div className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  const countValue = item.countKey
                    ? moduleCounts[item.countKey]
                    : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`console-mobile-nav-${item.id}`}
                      onClick={() => handleSelect(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-500/15 font-semibold text-blue-600 dark:text-blue-400'
                          : 'font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800'
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400 stroke-[2.25px]'
                            : 'text-slate-400 dark:text-slate-500 stroke-[1.75px]'
                        }`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {countValue > 0 && (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                          {countValue}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* User profile & actions footer */}
      <div
        className="shrink-0 border-t border-slate-100 bg-slate-50/50 dark:bg-slate-900/40 px-3.5 py-3 space-y-2 dark:border-slate-800"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-800/80 p-2 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 font-bold text-xs text-blue-800 dark:text-blue-200">
              {user?.name?.trim().split(/\s+/).slice(-2).map(n => n[0]).join('').toUpperCase() || 'AD'}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Đổi giao diện sáng/tối"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            void logout();
          }}
          className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-3 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Đăng xuất khỏi hệ thống</span>
        </button>
      </div>
    </MobileSidebarSheet>
  );
};
