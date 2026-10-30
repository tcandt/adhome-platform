import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { MobileHeader } from '../navigation/MobileHeader';
import { MobileDrawer } from '../navigation/MobileDrawer';
import { MobileBottomNav } from '../navigation/MobileBottomNav';
import { useNavigation } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { GenericModuleView } from '@/features/modules/GenericModuleView';
import { AccountManagementView } from '@/features/settings/AccountManagementView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';

export const MobileShell: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeModule, currentNavConfig } = useNavigation();
  const { hasCapability } = useAuth();

  const isModuleAllowed = currentNavConfig.requiredCapability
    ? hasCapability(currentNavConfig.requiredCapability)
    : true;

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-appText-primary antialiased">
      <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />

      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="pt-16 pb-20 px-3.5">
        {!isModuleAllowed ? (
          <div
            data-testid="console-module-forbidden"
            className="p-8 text-center bg-surface dark:bg-surface-dark border border-rose-200 dark:border-rose-900 rounded-2xl shadow-soft"
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
          <AccountManagementView />
        ) : (
          <GenericModuleView moduleId={activeModule} />
        )}
      </main>

      <MobileBottomNav onOpenDrawer={() => setDrawerOpen(true)} />

      <GlobalSearchModal />
    </div>
  );
};
