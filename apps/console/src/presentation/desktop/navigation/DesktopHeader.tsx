import React from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';

export const DesktopHeader: React.FC = () => {
  const {
    activeModule,
    setBuildingsSubTab,
    currentNavConfig,
    activeSubBreadcrumb,
    setIsSearchOpen,
  } = useNavigation();

  return (
    <header
      data-testid="console-desktop-header"
      className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-[#111827]/95 px-6 backdrop-blur-md select-none transition-colors"
    >
      {/* ZONE 1 (LEFT): Contextual Module Title & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2.5">
        <nav
          aria-label="Điều hướng ngữ cảnh"
          className="flex min-w-0 items-center gap-1.5"
        >
          {activeSubBreadcrumb ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (activeModule === 'buildings') {
                    setBuildingsSubTab('rooms');
                  }
                }}
                className="truncate text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {currentNavConfig.label}
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <h1
                data-testid="console-header-title"
                className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {activeSubBreadcrumb}
              </h1>
            </>
          ) : (
            <h1
              data-testid="console-header-title"
              className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white"
            >
              {currentNavConfig.label}
            </h1>
          )}
        </nav>
      </div>

      {/* ZONE 2 (RIGHT): Global Command Search (Ctrl+K) */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          data-testid="console-global-search-trigger"
          onClick={() => setIsSearchOpen(true)}
          className="inline-flex h-9.5 items-center gap-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/90 dark:bg-slate-800/60 px-3 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200 transition-all shadow-2xs"
          title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-medium hidden sm:inline">Tìm phòng, khách, hợp đồng...</span>
          <kbd className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>
    </header>
  );
};
