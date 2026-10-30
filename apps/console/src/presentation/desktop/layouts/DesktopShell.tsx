import React, { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { OperationalModuleWorkspace } from '@/features/modules/OperationalModuleWorkspace';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { SettingsWorkspaceView } from '@/features/settings/SettingsWorkspaceView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';
import { SidebarInset, SidebarProvider } from '@/shared/ui/animate-sidebar';
import { DesktopHeader } from '../navigation/DesktopHeader';
import { DesktopSidebar } from '../navigation/DesktopSidebar';

const SIDEBAR_UI_PREF_KEY = 'adhome_ui_sidebar_open';

export const DesktopShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_UI_PREF_KEY);
      if (saved === 'false') return false;
    }
    return true;
  });

  const { activeModule, currentNavConfig } = useNavigation();
  const { hasCapability } = useAuth();

  const handleOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_UI_PREF_KEY, String(open));
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          handleOpenChange(!sidebarOpen);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, handleOpenChange]);

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
      <DesktopSidebar />

      <SidebarInset>
        <DesktopHeader />

        <main className="flex-1 px-4 lg:px-6 py-5 min-w-0">
          <div className="max-w-[1600px] mx-auto">
            {!isModuleAllowed ? (
              <div
                data-testid="console-module-forbidden"
                className="p-10 text-center bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-900 rounded-2xl"
              >
                <Lock className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Không có quyền truy cập phân hệ {currentNavConfig.label}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Vui lòng liên hệ Quản trị viên Hệ thống (Admin) nếu bạn cần
                  được cấp quyền cho phân hệ này.
                </p>
              </div>
            ) : activeModule === 'overview' ? (
              <OverviewDashboard />
            ) : activeModule === 'buildings' ? (
              <UnifiedBuildingCanvas />
            ) : activeModule === 'settings' ? (
              <SettingsWorkspaceView />
            ) : (
              <OperationalModuleWorkspace moduleId={activeModule} />
            )}
          </div>
        </main>
      </SidebarInset>

      <GlobalSearchModal />
    </SidebarProvider>
  );
};
