import React, { useMemo, useRef, useState, useEffect } from "react";
import { Building2, ChevronDown, Edit, Info, Plus, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { CreateBuildingModal } from "@/features/buildings/modals/CreateBuildingModal";
import { EditBuildingModal } from "@/features/buildings/modals/EditBuildingModal";
import { BuildingInfoDialog } from "@/features/buildings/modals/BuildingInfoDialog";
import type { ConsoleBuildingDto } from "@/shared/types/portfolio";
import { useAuth } from "@/app/providers/AuthContext";
import { useNavigation } from "@/app/providers/NavigationContext";
import { usePortfolio } from "@/app/providers/PortfolioContext";

export const BuildingScopeSelector: React.FC<{
  className?: string;
  compact?: boolean;
}> = ({ className = "", compact = false }) => {
  const { user, hasCapability } = useAuth();
  const {
    selectedBuildingIds,
    isBuildingScopeEmpty,
    clearBuildingScope,
    setSelectedBuildingIds,
    toggleBuildingInScope,
  } = useNavigation();
  const { activeBuildings } = usePortfolio();

  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [createBuildingOpen, setCreateBuildingOpen] = useState(false);
  const [infoBuildingId, setInfoBuildingId] = useState<string | null>(null);
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isScopeOpen)
      popoverRef.current
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.focus();
    else {
      setSearchOpen(false);
      setScopeSearchQuery("");
    }
  }, [isScopeOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        scopeRef.current &&
        !scopeRef.current.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsScopeOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsScopeOpen(false);
        if (popoverRef.current?.contains(document.activeElement))
          triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const authorizedActiveIds = useMemo(
    () => activeBuildings.map((b) => b.id),
    [activeBuildings],
  );

  const filteredBuildings = useMemo(() => {
    if (!scopeSearchQuery.trim()) return activeBuildings;
    const q = scopeSearchQuery.toLowerCase();
    return activeBuildings.filter(
      (b) =>
        b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q),
    );
  }, [activeBuildings, scopeSearchQuery]);

  const scopeSummaryLabel = useMemo(() => {
    if (isBuildingScopeEmpty) return "Chưa chọn tòa nhà";
    if (activeBuildings.length === 0) {
      return "Chưa có tòa nhà (0)";
    }
    if (
      selectedBuildingIds.length === 0 ||
      selectedBuildingIds.length >= activeBuildings.length
    ) {
      return user?.assignedBuildingIds === "ALL"
        ? `Tất cả tòa nhà (${activeBuildings.length})`
        : `Phạm vi phụ trách (${activeBuildings.length} tòa)`;
    }
    if (selectedBuildingIds.length === 1) {
      const bld = activeBuildings.find((b) => b.id === selectedBuildingIds[0]);
      return bld ? `${bld.code} · ${bld.name}` : "1 tòa nhà";
    }
    return `Đã chọn ${selectedBuildingIds.length}/${activeBuildings.length} tòa nhà`;
  }, [activeBuildings, selectedBuildingIds, user, isBuildingScopeEmpty]);

  const allSelected =
    !isBuildingScopeEmpty &&
    activeBuildings.length > 0 &&
    (selectedBuildingIds.length === 0 ||
      authorizedActiveIds.every((id) => selectedBuildingIds.includes(id)));
  const partiallySelected =
    !isBuildingScopeEmpty && !allSelected && selectedBuildingIds.length > 0;
  const selectedCount = isBuildingScopeEmpty
    ? 0
    : selectedBuildingIds.length || activeBuildings.length;

  const popover = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Danh sách tòa nhà"
      data-testid="console-building-scope-popover"
      className={`${compact ? "fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top,0px))] z-50 max-h-[75dvh] overflow-y-auto" : "absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)]"} rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900`}
    >
      <div className="flex items-center gap-0.5 border-b border-slate-100 pb-2 dark:border-slate-800">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            aria-label="Chọn hoặc bỏ chọn tất cả tòa nhà"
            data-testid="building-scope-select-all"
            checked={allSelected}
            disabled={activeBuildings.length === 0}
            ref={(node) => {
              if (node) node.indeterminate = partiallySelected;
            }}
            onChange={() => {
              if (allSelected) clearBuildingScope();
              else setSelectedBuildingIds([]);
            }}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
          />
        </label>
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-white">
          Tòa nhà
        </span>
        <button
          type="button"
          data-testid="building-scope-search-trigger"
          aria-label={searchOpen ? "Đóng tìm tòa nhà" : "Tìm tòa nhà"}
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen((previous) => !previous);
            setScopeSearchQuery("");
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {searchOpen ? (
            <X className="h-[18px] w-[18px]" />
          ) : (
            <Search className="h-[18px] w-[18px]" />
          )}
        </button>
        {hasCapability("canManageBuildings") && (
          <button
            type="button"
            data-testid="btn-open-create-building"
            aria-label="Thêm tòa nhà"
            title="Thêm tòa nhà"
            onClick={() => {
              setIsScopeOpen(false);
              setCreateBuildingOpen(true);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      {searchOpen && (
        <div className="px-2 pt-2">
          <input
            ref={searchRef}
            type="search"
            aria-label="Tìm mã hoặc tên tòa nhà"
            placeholder="Tìm mã hoặc tên tòa nhà…"
            value={scopeSearchQuery}
            onChange={(event) => setScopeSearchQuery(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-base outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 sm:text-sm"
          />
        </div>
      )}
      {activeBuildings.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-500">
          Chưa có tòa nhà hoạt động trong phạm vi của bạn.
        </p>
      ) : filteredBuildings.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-500">
          Không tìm thấy tòa nhà phù hợp.
        </p>
      ) : (
        <div className="mt-1 max-h-72 overflow-y-auto">
          {filteredBuildings.map((building) => {
            const checked =
              !isBuildingScopeEmpty &&
              (selectedBuildingIds.length === 0 ||
                selectedBuildingIds.includes(building.id));
            return (
              <div
                key={building.id}
                className="flex min-h-16 items-center gap-1 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                <input
                  type="checkbox"
                  aria-label={building.name}
                  data-testid={`building-scope-checkbox-${building.code}`}
                  checked={checked}
                  onChange={() =>
                    toggleBuildingInScope(building.id, authorizedActiveIds)
                  }
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-blue-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {building.name}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    {building.code} · {building.stats.availableRooms} phòng
                    trống
                  </span>
                </span>
                </label>
                <button type="button" aria-label={`Xem thông tin tòa nhà ${building.name}`} title="Thông tin tòa nhà" onClick={() => { setIsScopeOpen(false); setInfoBuildingId(building.id); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-700"><Info size={18} /></button>
                {hasCapability("canManageBuildings") && <button type="button" aria-label={`Chỉnh sửa tòa nhà ${building.name}`} title="Chỉnh sửa tòa nhà" onClick={() => { setIsScopeOpen(false); setEditingBuildingId(building.id); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-700"><Edit size={18} /></button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
  return (
    <>
      <div
        ref={scopeRef}
        className={`relative inline-block shrink-0 ${className}`}
      >
        <button
          type="button"
          ref={triggerRef}
          data-testid="console-building-scope-selector"
          onClick={() => setIsScopeOpen((prev) => !prev)}
          aria-expanded={isScopeOpen}
          aria-haspopup="dialog"
          aria-label={
            compact ? `Chọn tòa nhà: ${scopeSummaryLabel}` : undefined
          }
          title={scopeSummaryLabel}
          className={
            compact
              ? "relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              : "inline-flex h-11 max-w-[240px] xl:max-w-[320px] items-center gap-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          }
        >
          <Building2
            className={
              compact
                ? "h-5 w-5"
                : "h-4 w-4 shrink-0 text-brand-primary dark:text-blue-400"
            }
          />
          {compact ? (
            <span
              data-testid="console-building-scope-count"
              className="absolute bottom-1 right-1 flex min-h-3 min-w-3 items-center justify-center rounded-full bg-white px-0.5 text-[8px] font-semibold leading-none tabular-nums dark:bg-[#111827]"
            >
              {selectedCount}
            </span>
          ) : (
            <>
              <span className="truncate">{scopeSummaryLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isScopeOpen ? "rotate-180" : ""
                }`}
              />
            </>
          )}
        </button>

        {isScopeOpen &&
          (compact ? createPortal(popover, document.body) : popover)}
      </div>
      {createBuildingOpen &&
        createPortal(
          <CreateBuildingModal
            isOpen
            onClose={() => setCreateBuildingOpen(false)}
          />,
          document.body,
        )}
      <BuildingInfoDialog building={activeBuildings.find((building) => building.id === infoBuildingId)} onClose={() => setInfoBuildingId(null)} />
      <EditBuildingModal isOpen={Boolean(editingBuildingId)} building={(activeBuildings.find((building) => building.id === editingBuildingId) || null) as ConsoleBuildingDto | null} onClose={() => setEditingBuildingId(null)} />
    </>
  );
};
