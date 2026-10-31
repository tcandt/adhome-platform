import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { OperationalModuleWorkspace } from '@/features/modules/OperationalModuleWorkspace';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { SettingsWorkspaceView } from '@/features/settings/SettingsWorkspaceView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';
import { MobileBottomNav } from '../navigation/MobileBottomNav';
import { MobileDrawer } from '../navigation/MobileDrawer';
import { MobileHeader } from '../navigation/MobileHeader';

export const MobileShell: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeModule, currentNavConfig } = useNavigation();
  const { hasCapability } = useAuth();

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <div
      data-testid="console-mobile-shell"
      className="min-h-screen bg-[#F7F9FC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 antialiased overflow-x-hidden"
    >
      <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />

      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="pt-3 pb-20 px-3.5">
        {!isModuleAllowed ? (
          <div
            data-testid="console-module-forbidden"
            className="p-8 text-center bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-900 rounded-2xl"
          >
            <Lock className="w-7 h-7 text-rose-500 mx-auto mb-2" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Không có quyền truy cập phân hệ {currentNavConfig.label}
            </h2>
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
      </main>

      <MobileBottomNav onOpenDrawer={() => setDrawerOpen(true)} />

      <GlobalSearchModal />
    </div>
  );
};
