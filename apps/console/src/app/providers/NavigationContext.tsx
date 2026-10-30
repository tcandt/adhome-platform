import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  type BuildingsSubTabId,
  NAV_GROUPS_CONFIG,
  NAV_ITEMS_CONFIG,
  type NavGroupConfig,
  type NavItemConfig,
  type NavModuleId,
  SETTINGS_TABS_CONFIG,
  type SettingsTabId,
  getCurrentVnPeriodKey,
} from '@/app/navigation/navigationConfig';

export {
  NAV_GROUPS_CONFIG,
  NAV_ITEMS_CONFIG,
  SETTINGS_TABS_CONFIG,
  getCurrentVnPeriodKey,
};
export type {
  BuildingsSubTabId,
  NavGroupConfig,
  NavItemConfig,
  NavModuleId,
  SettingsTabId,
};

interface NavigationContextType {
  activeModule: NavModuleId;
  setActiveModule: (module: NavModuleId) => void;
  buildingsSubTab: BuildingsSubTabId;
  setBuildingsSubTab: (tab: BuildingsSubTabId) => void;
  openTenantsWorkspace: (tenantId?: string | null) => void;
  focusedTenantId: string | null;
  setFocusedTenantId: (tenantId: string | null) => void;
  settingsTab: SettingsTabId;
  setSettingsTab: (tab: SettingsTabId) => void;
  selectedPeriod: string;
  setSelectedPeriod: (periodKey: string) => void;
  /** Empty array `[]` means ALL authorized buildings in scope; non-empty means 1..N selected building IDs */
  selectedBuildingIds: string[];
  setSelectedBuildingIds: (ids: string[]) => void;
  toggleBuildingInScope: (buildingId: string, allAuthorizedIds: string[]) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  currentNavConfig: NavItemConfig;
  /** Non-null ONLY when navigating a 2nd-level context (e.g. Tòa nhà & phòng / Khách thuê, or Settings sub-tab) */
  activeSubBreadcrumb: string | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, hasCapability, refreshSession, setActiveBuildingId } =
    useAuth();

  const [activeModule, setActiveModuleState] = useState<NavModuleId>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('adhome_v2_active_module');
      if (stored && NAV_ITEMS_CONFIG.some((item) => item.id === stored)) {
        return stored as NavModuleId;
      }
    }
    return 'overview';
  });

  const [buildingsSubTab, setBuildingsSubTabState] =
    useState<BuildingsSubTabId>('rooms');
  const [focusedTenantId, setFocusedTenantId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('organization');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() =>
    getCurrentVnPeriodKey()
  );
  const [selectedBuildingIds, setSelectedBuildingIdsState] = useState<string[]>(
    []
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Reset scope & guard module permissions whenever session or actor changes
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveModuleState('overview');
      setBuildingsSubTabState('rooms');
      setSelectedBuildingIdsState([]);
      return;
    }
    const targetConfig = NAV_ITEMS_CONFIG.find(
      (item) => item.id === activeModule
    );
    if (
      targetConfig?.requiredCapability &&
      !hasCapability(targetConfig.requiredCapability)
    ) {
      setActiveModuleState('overview');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adhome_v2_active_module', 'overview');
      }
    }
  }, [isAuthenticated, user, activeModule, hasCapability]);

  // Global keyboard shortcut: Ctrl/Cmd + K opens Global Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setSelectedBuildingIds = (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    setSelectedBuildingIdsState(unique);
    setActiveBuildingId(unique.length === 1 ? unique[0] : 'ALL');
  };

  const toggleBuildingInScope = (
    buildingId: string,
    allAuthorizedIds: string[]
  ) => {
    setSelectedBuildingIdsState((prev) => {
      // If currently "ALL" ([]), clicking one selects just that building or toggles
      const base = prev.length === 0 ? [...allAuthorizedIds] : [...prev];
      const next = base.includes(buildingId)
        ? base.filter((id) => id !== buildingId)
        : [...base, buildingId];

      // If none left or all selected, normalize back to [] ("All authorized")
      const normalized =
        next.length === 0 || next.length >= allAuthorizedIds.length ? [] : next;
      setActiveBuildingId(normalized.length === 1 ? normalized[0] : 'ALL');
      return normalized;
    });
  };

  const setActiveModule = (module: NavModuleId) => {
    const targetConfig = NAV_ITEMS_CONFIG.find((item) => item.id === module);
    if (
      targetConfig?.requiredCapability &&
      !hasCapability(targetConfig.requiredCapability)
    ) {
      return;
    }
    setActiveModuleState(module);
    if (module !== 'buildings') {
      setFocusedTenantId(null);
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('adhome_v2_active_module', module);
    }
    void refreshSession();
  };

  const setBuildingsSubTab = (tab: BuildingsSubTabId) => {
    setBuildingsSubTabState(tab);
    if (tab !== 'tenants') {
      setFocusedTenantId(null);
    }
  };

  const openTenantsWorkspace = (tenantId?: string | null) => {
    setActiveModule('buildings');
    setBuildingsSubTabState('tenants');
    setFocusedTenantId(tenantId ?? null);
  };

  const currentNavConfig =
    NAV_ITEMS_CONFIG.find((item) => item.id === activeModule) ||
    NAV_ITEMS_CONFIG[0];

  const activeSubBreadcrumb = useMemo<string | null>(() => {
    if (activeModule === 'buildings' && buildingsSubTab === 'tenants') {
      return 'Khách thuê';
    }
    if (activeModule === 'settings') {
      return (
        SETTINGS_TABS_CONFIG.find((t) => t.id === settingsTab)?.label || null
      );
    }
    return null;
  }, [activeModule, buildingsSubTab, settingsTab]);

  return (
    <NavigationContext.Provider
      value={{
        activeModule,
        setActiveModule,
        buildingsSubTab,
        setBuildingsSubTab,
        openTenantsWorkspace,
        focusedTenantId,
        setFocusedTenantId,
        settingsTab,
        setSettingsTab,
        selectedPeriod,
        setSelectedPeriod,
        selectedBuildingIds,
        setSelectedBuildingIds,
        toggleBuildingInScope,
        isSearchOpen,
        setIsSearchOpen,
        isNotificationsOpen,
        setIsNotificationsOpen,
        currentNavConfig,
        activeSubBreadcrumb,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}
