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
  return createPortal(<nav data-testid="console-mobile-bottom-nav" aria-label="Điều hướng nhanh di động" className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 pt-1 backdrop-blur-md dark:border-slate-800 dark:bg-[#111827]/95" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}>
    {tabs.filter(tab => { const capability = NAV_ITEMS_CONFIG.find(item => item.id === tab.id)?.requiredCapability; return !capability || hasCapability(capability); }).map(tab => {
      const active = activeModule === tab.id;
      const Icon = tab.icon;
      return <button key={tab.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => setActiveModule(tab.id as NavModuleId)} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] ${active ? 'font-bold text-blue-700 dark:text-blue-300' : 'font-medium text-slate-500 dark:text-slate-400'}`}><Icon className="h-5 w-5" /><span>{tab.label}</span></button>;
    })}
    <button type="button" data-testid="console-mobile-more-trigger" aria-label="More — Các mục bổ sung" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onOpenMore} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] ${moreActive || moreOpen ? 'font-bold text-blue-700 dark:text-blue-300' : 'font-medium text-slate-500 dark:text-slate-400'}`}><LayoutGrid className="h-5 w-5" /><span>More</span></button>
  </nav>, document.body);
};
