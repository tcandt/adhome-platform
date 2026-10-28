import React, { useState, useEffect } from 'react';
import { DesktopSidebar } from '../navigation/DesktopSidebar';
import { DesktopHeader } from '../navigation/DesktopHeader';
import { useNavigation } from '@/app/providers/NavigationContext';
import { OverviewDashboard } from '@/features/overview/OverviewDashboard';
import { UnifiedBuildingCanvas } from '@/features/buildings/UnifiedBuildingCanvas';
import { GenericModuleView } from '@/features/modules/GenericModuleView';
import { GlobalSearchModal } from '@/shared/ui/GlobalSearchModal';

export const DesktopShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_sidebar_collapsed');
      return stored === 'true';
    }
    return false;
  });

  const { activeModule } = useNavigation();

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('adhome_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  // Global keyboard shortcut: Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        // Only trigger if not typing inside an input/textarea
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

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-appText-primary antialiased selection:bg-brand-primary selection:text-white">
      {/* Synchronized Animated Sidebar */}
      <DesktopSidebar collapsed={collapsed} />

      {/* Synchronized Animated Header with external Toggle */}
      <DesktopHeader
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed(prev => !prev)}
      />

      {/* Main Content Viewport with Synchronized Margin Transition */}
      <main
        className={`pt-20 px-8 pb-12 transition-[margin-left] duration-[280ms] ease-in-out motion-reduce:transition-none ${
          collapsed ? 'ml-[72px]' : 'ml-[256px]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto">
          {activeModule === 'overview' && <OverviewDashboard />}
          {activeModule === 'buildings' && <UnifiedBuildingCanvas />}
          {activeModule !== 'overview' && activeModule !== 'buildings' && (
            <GenericModuleView moduleId={activeModule} />
          )}
        </div>
      </main>

      {/* Global Search Modal */}
      <GlobalSearchModal />
    </div>
  );
};
