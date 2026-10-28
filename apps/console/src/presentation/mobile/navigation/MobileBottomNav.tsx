import React from 'react';
import { LayoutDashboard, Building2, FileText, Receipt, Menu } from 'lucide-react';
import { useNavigation, NavModuleId } from '@/app/providers/NavigationContext';

interface MobileBottomNavProps {
  onOpenDrawer: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenDrawer }) => {
  const { activeModule, setActiveModule } = useNavigation();

  const tabs: { id: NavModuleId | 'menu'; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'buildings', label: 'Tòa nhà', icon: Building2 },
    { id: 'contracts', label: 'Hợp đồng', icon: FileText },
    { id: 'invoices', label: 'Hóa đơn', icon: Receipt },
    { id: 'menu', label: 'Thêm', icon: Menu },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-surface dark:bg-header-dark border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-around px-2 select-none pb-safe">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeModule === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'menu') {
                onOpenDrawer();
              } else {
                setActiveModule(tab.id);
              }
            }}
            className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-all ${
              isActive
                ? 'text-brand-primary font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
            <span className="text-[10px] leading-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
