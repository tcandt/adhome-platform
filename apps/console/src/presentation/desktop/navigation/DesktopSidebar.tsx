import React from 'react';
import {
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
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
  useSidebar,
} from '@/shared/ui/animate-sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@animate-ui/react/primitives/tooltip';

export const DesktopSidebar: React.FC = () => {
  const { hasCapability } = useAuth();
  const {
    activeModule,
    setActiveModule,
  } = useNavigation();
  const {
    syncStatus,
    syncError,
    lastSyncedAt,
    refreshPortfolio,
    moduleCounts,
  } = usePortfolio();

  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar>
      {/* SIDEBAR HEADER: Brand Logo only (64px in every state).
          Smooth crossfade between full logo and icon mark on collapse/expand. */}
      <SidebarHeader
        className={`px-4 flex items-center transition-all duration-280 ease-[cubic-bezier(0.77,0,0.175,1)] ${
          isCollapsed ? 'justify-center' : 'justify-start'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveModule('overview')}
          className="flex items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 cursor-pointer"
          title="AdHome Console — Trang tổng quan"
        >
          <div className="relative flex items-center h-10 w-full overflow-hidden">
            {/* Full Logo: visible when expanded */}
            <div
              className={`flex items-center transition-all duration-280 ease-[cubic-bezier(0.77,0,0.175,1)] ${
                isCollapsed
                  ? 'opacity-0 scale-95 pointer-events-none absolute left-0'
                  : 'opacity-100 scale-100 relative'
              }`}
            >
              <BrandLogo collapsed={false} size="md" />
            </div>

            {/* Icon Mark: visible when collapsed, centered */}
            <div
              className={`flex items-center justify-center transition-all duration-280 ease-[cubic-bezier(0.77,0,0.175,1)] ${
                isCollapsed
                  ? 'opacity-100 scale-100 relative w-full'
                  : 'opacity-0 scale-95 pointer-events-none absolute left-1/2 -translate-x-1/2'
              }`}
            >
              <BrandLogo collapsed={true} size="md" />
            </div>
          </div>
        </button>
      </SidebarHeader>

      {/* SIDEBAR CONTENT: 10 Operational Modules */}
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
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <Icon
                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                              isActive
                                ? 'text-brand-primary dark:text-blue-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                        </span>
                        <span
                          className="flex-1 flex items-center justify-between overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-280 ease-[cubic-bezier(0.77,0,0.175,1)]"
                          style={{
                            maxWidth: isCollapsed ? '0px' : '180px',
                            opacity: isCollapsed ? 0 : 1,
                            pointerEvents: isCollapsed ? 'none' : 'auto',
                          }}
                        >
                          <span className="truncate text-left font-medium">
                            {item.label}
                          </span>
                          {countValue > 0 && (
                            <span
                              className={`ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
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
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* SIDEBAR FOOTER: PostgreSQL Live Sync Status */}
      <SidebarFooter
        className={`p-3 flex items-center border-t border-slate-100 dark:border-slate-800/80 transition-all duration-280 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {syncStatus === 'error' ? (
          <button
            type="button"
            data-testid="console-sync-status"
            onClick={() => void refreshPortfolio()}
            title={syncError || 'Lỗi kết nối PostgreSQL — Nhấn để thử lại'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300 shadow-2xs"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span
              className="overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-280 ease-[cubic-bezier(0.77,0,0.175,1)]"
              style={{
                maxWidth: isCollapsed ? '0px' : '100px',
                opacity: isCollapsed ? 0 : 1,
              }}
            >
              Lỗi sync — Thử lại
            </span>
          </button>
        ) : (
          <Tooltip side="right" sideOffset={10}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="console-sync-status"
                onClick={() => void refreshPortfolio()}
                aria-label="Trạng thái đồng bộ PostgreSQL"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {syncStatus === 'loading' || syncStatus === 'refreshing' ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </>
                  )}
                </span>
                <span
                  className="overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-280 ease-[cubic-bezier(0.77,0,0.175,1)] text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  style={{
                    maxWidth: isCollapsed ? '0px' : '100px',
                    opacity: isCollapsed ? 0 : 1,
                  }}
                >
                  PostgreSQL Live
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
              {lastSyncedAt
                ? `Đồng bộ PostgreSQL lúc ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN')} (Nhấn để làm mới)`
                : 'Đang kết nối PostgreSQL...'}
            </TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};
