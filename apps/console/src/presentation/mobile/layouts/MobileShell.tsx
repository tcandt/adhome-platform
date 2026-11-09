import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { OperationalModuleWorkspace } from '@/features/modules/OperationalModuleWorkspace';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { SettingsWorkspaceView } from '@/features/settings/SettingsWorkspaceView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';
import { EmptyBuildingScope } from '@/shared/ui/EmptyBuildingScope';
import { MobileBottomNav } from '../navigation/MobileBottomNav';
import { MobileDrawer } from '../navigation/MobileDrawer';
import { MobileHeader } from '../navigation/MobileHeader';

export const MobileShell: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOnly, setMoreOnly] = useState(false);
  const { activeModule, currentNavConfig, isBuildingScopeEmpty } = useNavigation();
  const { hasCapability } = useAuth();

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <div
      data-testid="console-mobile-shell"
      className="min-h-dvh bg-[#F7F9FC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 antialiased"
      style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
    >
      <MobileHeader onOpenDrawer={() => { setMoreOnly(false); setDrawerOpen(true); }} />

      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} moreOnly={moreOnly} />

      <main className={`${activeModule === 'buildings' ? 'pt-2' : 'pt-4'} min-w-0 overflow-x-clip px-4`} style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
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
        ) : isBuildingScopeEmpty && currentNavConfig.supportsBuildingScope && activeModule !== 'buildings' ? (
          <EmptyBuildingScope />
        ) : activeModule === 'overview' ? (
          <OverviewDashboard mobile />
        ) : activeModule === 'buildings' ? (
          <UnifiedBuildingCanvas />
        ) : activeModule === 'settings' ? (
          <SettingsWorkspaceView />
        ) : (
          <OperationalModuleWorkspace moduleId={activeModule} />
        )}
      </main>

      <MobileBottomNav onOpenMore={() => { setMoreOnly(true); setDrawerOpen(true); }} moreOpen={drawerOpen && moreOnly} />

      <GlobalSearchModal />
    </div>
  );
};
