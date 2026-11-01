import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Building2, Check, ChevronDown, Search } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';

export const BuildingScopeSelector: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { user } = useAuth();
  const {
    selectedBuildingIds,
    setSelectedBuildingIds,
    toggleBuildingInScope,
  } = useNavigation();
  const { activeBuildings } = usePortfolio();

  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState('');
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (scopeRef.current && !scopeRef.current.contains(target)) {
        setIsScopeOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsScopeOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const authorizedActiveIds = useMemo(
    () => activeBuildings.map((b) => b.id),
    [activeBuildings]
  );

  const filteredBuildings = useMemo(() => {
    if (!scopeSearchQuery.trim()) return activeBuildings;
    const q = scopeSearchQuery.toLowerCase();
    return activeBuildings.filter(
      (b) =>
        b.code.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q)
    );
  }, [activeBuildings, scopeSearchQuery]);

  const scopeSummaryLabel = useMemo(() => {
    if (activeBuildings.length === 0) {
      return 'Chưa có tòa nhà (0)';
    }
    if (
      selectedBuildingIds.length === 0 ||
      selectedBuildingIds.length >= activeBuildings.length
    ) {
      return user?.assignedBuildingIds === 'ALL'
        ? `Tất cả tòa nhà (${activeBuildings.length})`
        : `Phạm vi phụ trách (${activeBuildings.length} tòa)`;
    }
    if (selectedBuildingIds.length === 1) {
      const bld = activeBuildings.find((b) => b.id === selectedBuildingIds[0]);
      return bld ? `${bld.code} · ${bld.name}` : '1 tòa nhà';
    }
    return `Đã chọn ${selectedBuildingIds.length}/${activeBuildings.length} tòa nhà`;
  }, [activeBuildings, selectedBuildingIds, user]);

  return (
    <div ref={scopeRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        data-testid="console-building-scope-selector"
        onClick={() => setIsScopeOpen((prev) => !prev)}
        aria-expanded={isScopeOpen}
        aria-haspopup="listbox"
        className="inline-flex h-9 max-w-[240px] xl:max-w-[320px] items-center gap-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-2xs"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-blue-400" />
        <span className="truncate">{scopeSummaryLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            isScopeOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isScopeOpen && (
        <div
          role="listbox"
          data-testid="console-building-scope-popover"
          className="absolute left-0 top-full z-50 mt-1.5 w-72 sm:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-2 pb-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Phạm vi tòa nhà ({activeBuildings.length})
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedBuildingIds([]);
                setIsScopeOpen(false);
              }}
              className="text-[11px] font-semibold text-brand-primary dark:text-blue-400 hover:underline"
            >
              Chọn tất cả ({activeBuildings.length})
            </button>
          </div>

          {activeBuildings.length > 4 && (
            <div className="mt-2 px-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm mã hoặc tên tòa nhà..."
                  value={scopeSearchQuery}
                  onChange={(e) => setScopeSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {activeBuildings.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              Chưa có tòa nhà hoạt động trong phạm vi của bạn.
            </p>
          ) : filteredBuildings.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              Không tìm thấy tòa nhà khớp với &ldquo;{scopeSearchQuery}&rdquo;.
            </p>
          ) : (
            <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto">
              {filteredBuildings.map((bld) => {
                const isChecked =
                  selectedBuildingIds.length === 0 ||
                  selectedBuildingIds.includes(bld.id);
                return (
                  <div
                    key={bld.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleBuildingInScope(bld.id, authorizedActiveIds)
                      }
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isChecked
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {bld.code} · {bld.name}
                        </div>
                        <div className="truncate text-[11px] text-slate-400">
                          {bld.stats.occupiedRooms}/{bld.stats.totalRooms} phòng có khách
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBuildingIds([bld.id]);
                        setIsScopeOpen(false);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      Chỉ tòa này
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

