import React from 'react';
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Menu,
  Receipt,
} from 'lucide-react';
import {
  type NavModuleId,
  useNavigation,
} from '@/app/providers/NavigationContext';

interface MobileBottomNavProps {
  onOpenDrawer: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onOpenDrawer,
}) => {
  const { activeModule, setActiveModule } = useNavigation();

  const quickTabs: Array<{
    id: NavModuleId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'buildings', label: 'Phòng & Khách', icon: Building2 },
    { id: 'invoices', label: 'Hóa đơn', icon: Receipt },
    { id: 'payments', label: 'Đối soát', icon: CreditCard },
  ];

  return (
    <nav
      data-testid="console-mobile-bottom-nav"
      aria-label="Điều hướng nhanh di động"
      className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#111827]/95 px-1 backdrop-blur-md"
    >
      {quickTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeModule === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveModule(tab.id)}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors ${
              isActive
                ? 'font-bold text-brand-primary dark:text-blue-400'
                : 'font-medium text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium text-slate-500 dark:text-slate-400"
      >
        <Menu className="h-5 w-5" />
        <span>Menu</span>
      </button>
    </nav>
  );
};
