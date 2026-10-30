import React from 'react';
import { LogOut, Moon, ShieldCheck, Sun, X } from 'lucide-react';
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
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, logout, hasCapability } = useAuth();
  const { activeModule, setActiveModule } = useNavigation();
  const { moduleCounts, activeBuildings } = usePortfolio();
  const { theme, toggleTheme } = useTheme();

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
      title="Menu điều hướng AdHome Console"
    >
      {/* Header with Clean Horizontal BrandLogo (Zero PRO badge clutter) */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4">
        <BrandLogo variant="horizontal" size="md" />
        <button
          type="button"
          data-testid="console-mobile-drawer-close"
          onClick={onClose}
          aria-label="Đóng menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Exact Shared 10-Module Navigation across 3 Official Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS_CONFIG.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              !item.requiredCapability || hasCapability(item.requiredCapability)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="mb-4 last:mb-0">
              <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
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
                      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-500/15 font-semibold text-brand-primary dark:text-blue-400'
                          : 'font-medium text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800'
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          isActive
                            ? 'text-brand-primary dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {countValue > 0 && (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
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

      {/* Footer: Verified Actor Profile, Theme & Safe Logout */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2">
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
          <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {user?.name}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {user?.email}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>
              {user?.backendRole === 'ADMIN'
                ? 'Admin · Toàn hệ thống'
                : `Manager · ${activeBuildings.length} tòa`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {theme === 'light' ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{theme === 'light' ? 'Nền tối' : 'Nền sáng'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              void logout();
            }}
            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs font-semibold text-red-600 dark:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </MobileSidebarSheet>
  );
};
