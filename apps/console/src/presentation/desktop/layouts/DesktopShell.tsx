import React, { useCallback, useState } from 'react';
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
import { AppShellSidebarToggle } from '../navigation/AppShellSidebarToggle';

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

  // UI-SIDEBAR-02: the Ctrl/Cmd+B shortcut is owned exclusively by the
  // Animate UI Provider (it already excludes input/textarea/select and
  // contenteditable). A second window listener here previously fired on the
  // same keypress, so it was removed to guarantee one toggle per press.

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
      <DesktopSidebar />

      {/* App Shell control — independent of Sidebar and Header DOM */}
      <AppShellSidebarToggle />

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
