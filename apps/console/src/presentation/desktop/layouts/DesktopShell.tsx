import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { DesktopSidebar } from '../navigation/DesktopSidebar';
import { DesktopHeader } from '../navigation/DesktopHeader';
import { useNavigation } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { GenericModuleView } from '@/features/modules/GenericModuleView';
import { AccountManagementView } from '@/features/settings/AccountManagementView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';

export const DesktopShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_sidebar_collapsed');
      return stored === 'true';
    }
    return false;
  });

  const { activeModule, currentNavConfig } = useNavigation();
  const { hasCapability } = useAuth();

  useEffect(() => {
    localStorage.setItem('adhome_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          setCollapsed(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-appText-primary antialiased selection:bg-brand-primary selection:text-white">
      <DesktopSidebar collapsed={collapsed} />

      <DesktopHeader
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed(prev => !prev)}
      />

      <main
        className={`pt-20 px-8 pb-12 transition-[margin-left] duration-[280ms] ease-in-out motion-reduce:transition-none ${
          collapsed ? 'ml-[72px]' : 'ml-[256px]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto">
          {!isModuleAllowed ? (
            <div
              data-testid="console-module-forbidden"
              className="p-10 text-center bg-surface dark:bg-surface-dark border border-rose-200 dark:border-rose-900 rounded-2xl shadow-soft"
            >
              <Lock className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Không có quyền truy cập phân hệ {currentNavConfig.label}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Vui lòng liên hệ Quản trị viên Hệ thống (Admin) nếu bạn cần được cấp quyền cho phân hệ này.
              </p>
            </div>
          ) : activeModule === 'overview' ? (
            <OverviewDashboard />
          ) : activeModule === 'buildings' ? (
            <UnifiedBuildingCanvas />
          ) : activeModule === 'settings' ? (
            <AccountManagementView />
          ) : (
            <GenericModuleView moduleId={activeModule} />
          )}
        </div>
      </main>

      <GlobalSearchModal />
    </div>
  );
};
