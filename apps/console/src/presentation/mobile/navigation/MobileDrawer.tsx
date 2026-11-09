import React from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  NAV_GROUPS_CONFIG,
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
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
  const { hasCapability } = useAuth();
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
      title={moreOnly ? 'Các mục bổ sung' : 'Menu điều hướng AdHome Console'}
    >
      {/* Header with Clean Horizontal BrandLogo (Zero PRO badge clutter) */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4">
        {moreOnly ? <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">More</h2> : <BrandLogo variant="horizontal" size="md" />}
        <button
          type="button"
          data-testid="console-mobile-drawer-close"
          onClick={onClose}
          aria-label={moreOnly ? 'Đóng các mục bổ sung' : 'Đóng menu'}
          className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Exact Shared 10-Module Navigation across 3 Official Groups */}
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
                      aria-current={isActive ? 'page' : undefined}
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

      <div className="shrink-0 border-t border-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        Hồ sơ, giao diện và đăng xuất trong avatar trên thanh đầu trang.
      </div>
    </MobileSidebarSheet>
  );
};
