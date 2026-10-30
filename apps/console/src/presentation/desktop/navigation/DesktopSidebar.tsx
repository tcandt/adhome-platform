import React from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  NAV_GROUPS_CONFIG,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/animate-sidebar';

export const DesktopSidebar: React.FC = () => {
  const { hasCapability } = useAuth();
  const { activeModule, setActiveModule } = useNavigation();
  const { moduleCounts } = usePortfolio();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar>
      <SidebarHeader
        className={isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}
      >
        <button
          type="button"
          onClick={() => setActiveModule('overview')}
          className="flex items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          title="AdHome Console — Trang tổng quan"
        >
          <BrandLogo collapsed={isCollapsed} size="md" />
        </button>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS_CONFIG.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              !item.requiredCapability || hasCapability(item.requiredCapability)
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  const countValue = item.countKey
                    ? moduleCounts[item.countKey]
                    : 0;

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        testId={`console-nav-${item.id}`}
                        onClick={() => setActiveModule(item.id)}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive
                              ? 'text-brand-primary dark:text-blue-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 truncate text-left">
                              {item.label}
                            </span>
                            {countValue > 0 && (
                              <span
                                className={`ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                                  item.countKey === 'invoicesUnpaid'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : isActive
                                    ? 'bg-brand-primary/15 text-brand-primary dark:bg-blue-400/20 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {countValue}
                              </span>
                            )}
                          </>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="px-3 py-2.5">
        {isCollapsed ? (
          <div
            className="flex items-center justify-center text-[10px] font-mono text-slate-400 dark:text-slate-500"
            title="Phím tắt thu gọn/mở rộng: Ctrl + B"
          >
            ⌘B
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1">
            <span>Thu gọn thanh bên</span>
            <kbd className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
              Ctrl B
            </kbd>
          </div>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
