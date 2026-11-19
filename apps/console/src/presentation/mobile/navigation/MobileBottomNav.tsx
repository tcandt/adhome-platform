import React from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Building2, ClipboardCheck, LayoutDashboard, Receipt } from 'lucide-react';
import { type NavModuleId, useNavigation, NAV_ITEMS_CONFIG } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';

export interface MobileBottomNavProps {
  onOpenMore?: () => void;
  moreOpen?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = () => {
  const { activeModule, setActiveModule } = useNavigation();
  const { hasCapability } = useAuth();

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'buildings', label: 'Tòa nhà', icon: Building2 },
    { id: 'invoices', label: 'Hóa đơn', icon: Receipt },
    { id: 'settlements', label: 'Tổng hợp kỳ', icon: ClipboardCheck },
    { id: 'reports', label: 'Báo cáo', icon: BarChart3 },
  ] as const;

  // Keep viewport navigation outside the scrolling/clipped, animated page tree.
  // Safari can otherwise composite a fixed descendant with the page content.
  return createPortal(
    <nav
      data-testid="console-mobile-bottom-nav"
      aria-label="Điều hướng nhanh di động"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200/80 bg-white/95 px-1 pt-1.5 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#111827]/95"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {tabs
        .filter((tab) => {
          const capability = NAV_ITEMS_CONFIG.find((item) => item.id === tab.id)?.requiredCapability;
          return !capability || hasCapability(capability);
        })
        .map((tab) => {
          const active = activeModule === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveModule(tab.id as NavModuleId)}
              className={`group flex min-h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[11px] transition-colors ${
                active
                  ? 'font-bold text-blue-600 dark:text-blue-400'
                  : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-500/15'
                    : 'group-active:bg-slate-100 dark:group-active:bg-slate-800'
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] transition-transform group-active:scale-95 ${
                    active ? 'stroke-[2.25px]' : 'stroke-[1.75px]'
                  }`}
                />
              </span>
              <span className="truncate tracking-tight">{tab.label}</span>
            </button>
          );
        })}
    </nav>,
    document.body
  );
};
