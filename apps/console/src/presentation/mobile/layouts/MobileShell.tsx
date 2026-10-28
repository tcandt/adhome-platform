import React, { useState } from 'react';
import { MobileHeader } from '../navigation/MobileHeader';
import { MobileDrawer } from '../navigation/MobileDrawer';
import { MobileBottomNav } from '../navigation/MobileBottomNav';
import { useNavigation } from '@/app/providers/NavigationContext';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { GenericModuleView } from '@/features/modules/GenericModuleView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';

export const MobileShell: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeModule } = useNavigation();

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-appText-primary antialiased">
      {/* Pinned Top Bar */}
      <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />

      {/* Slide-out Drawer Menu */}
      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main Module Content */}
      <main className="pt-16 pb-20 px-3.5">
        {activeModule === 'overview' && <OverviewDashboard />}
        {activeModule === 'buildings' && <UnifiedBuildingCanvas />}
        {activeModule !== 'overview' && activeModule !== 'buildings' && (
          <GenericModuleView moduleId={activeModule} />
        )}
      </main>

      {/* Pinned Bottom Nav */}
      <MobileBottomNav onOpenDrawer={() => setDrawerOpen(true)} />

      {/* Global Search Modal */}
      <GlobalSearchModal />
    </div>
  );
};
