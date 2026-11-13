import React from 'react';
import { createPortal } from 'react-dom';
import { Building2, CreditCard, LayoutDashboard, LayoutGrid, Receipt } from 'lucide-react';
import { type NavModuleId, useNavigation, NAV_ITEMS_CONFIG } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';

export const MobileBottomNav: React.FC<{ onOpenMore: () => void; moreOpen: boolean }> = ({ onOpenMore, moreOpen }) => {
  const { activeModule, setActiveModule } = useNavigation();
  const { hasCapability } = useAuth();
  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'buildings', label: 'Tòa nhà', icon: Building2 },
    { id: 'invoices', label: 'Hóa đơn', icon: Receipt },
    { id: 'payments', label: 'Đối soát', icon: CreditCard },
  ] as const;
  const moreActive = !tabs.some(tab => tab.id === activeModule);
  // Keep viewport navigation outside the scrolling/clipped, animated page tree.
  // Safari can otherwise composite a fixed descendant with the page content.
  return createPortal(
    <nav
      data-testid="console-mobile-bottom-nav"
      aria-label="Điều hướng nhanh di động"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200/80 bg-white/95 px-1.5 pt-1.5 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#111827]/95"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {tabs
        .filter(tab => {
          const capability = NAV_ITEMS_CONFIG.find(item => item.id === tab.id)?.requiredCapability;
          return !capability || hasCapability(capability);
        })
        .map(tab => {
          const active = activeModule === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveModule(tab.id as NavModuleId)}
              className={`group flex min-h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] transition-colors ${
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
                <Icon className={`h-[18px] w-[18px] transition-transform group-active:scale-95 ${active ? 'stroke-[2.25px]' : 'stroke-[1.75px]'}`} />
              </span>
              <span className="truncate tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      <button
        type="button"
        data-testid="console-mobile-more-trigger"
        aria-label="More — Các mục bổ sung"
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        onClick={onOpenMore}
        className={`group flex min-h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] transition-colors ${
          moreActive || moreOpen
            ? 'font-bold text-blue-600 dark:text-blue-400'
            : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
        }`}
      >
        <span
          className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
            moreActive || moreOpen
              ? 'bg-blue-50 dark:bg-blue-500/15'
              : 'group-active:bg-slate-100 dark:group-active:bg-slate-800'
          }`}
        >
          <LayoutGrid className={`h-[18px] w-[18px] transition-transform group-active:scale-95 ${moreActive || moreOpen ? 'stroke-[2.25px]' : 'stroke-[1.75px]'}`} />
        </span>
        <span className="truncate tracking-tight">More</span>
      </button>
    </nav>,
    document.body
  );
};
