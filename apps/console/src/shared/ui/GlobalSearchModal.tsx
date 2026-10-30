import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  DoorOpen,
  LayoutGrid,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  NAV_ITEMS_CONFIG,
  useNavigation,
} from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';

export const GlobalSearchModal: React.FC = () => {
  const { hasCapability } = useAuth();
  const {
    isSearchOpen,
    setIsSearchOpen,
    setActiveModule,
    setBuildingsSubTab,
    openTenantsWorkspace,
    setSelectedBuildingIds,
  } = useNavigation();
  const { activeBuildings, rooms, tenants } = usePortfolio();

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  const q = query.trim().toLowerCase();

  const matchedModules = useMemo(() => {
    return NAV_ITEMS_CONFIG.filter(
      (item) =>
        (!item.requiredCapability || hasCapability(item.requiredCapability)) &&
        (!q ||
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [q, hasCapability]);

  const matchedBuildings = useMemo(() => {
    if (!q) return activeBuildings.slice(0, 4);
    return activeBuildings
      .filter(
        (b) =>
          b.code.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          b.streetAddress.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [activeBuildings, q]);

  const matchedRooms = useMemo(() => {
    if (!q) return rooms.slice(0, 5);
    return rooms
      .filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.buildingCode.toLowerCase().includes(q) ||
          (r.currentTenant?.fullName.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 6);
  }, [rooms, q]);

  const matchedTenants = useMemo(() => {
    if (!hasCapability('canManageTenants')) return [];
    if (!q) return tenants.slice(0, 5);
    return tenants
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          t.phone.includes(q) ||
          (t.currentRoomCode?.toLowerCase().includes(q) ?? false) ||
          t.idNumber.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [tenants, q, hasCapability]);

  if (!isSearchOpen) return null;

  return (
    <div
      data-testid="console-global-search-modal"
      onClick={() => setIsSearchOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 p-4 pt-16 sm:pt-20 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-brand-primary dark:text-blue-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tòa nhà, mã phòng, tên/SĐT khách thuê hoặc phân hệ..."
            data-testid="console-global-search-input"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsSearchOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">
          {/* Tenants */}
          {matchedTenants.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <UserCheck className="h-3.5 w-3.5" />
                Khách thuê ({matchedTenants.length})
              </div>
              <div className="space-y-1">
                {matchedTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      openTenantsWorkspace(t.id);
                      setIsSearchOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {t.fullName} · {t.phone}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t.currentRoomCode
                          ? `Phòng ${t.currentRoomCode} (${t.buildingCode})`
                          : 'Chưa gán phòng'}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-brand-primary dark:text-blue-400">
                      Tòa nhà & phòng / Khách thuê →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rooms */}
          {matchedRooms.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <DoorOpen className="h-3.5 w-3.5" />
                Phòng ({matchedRooms.length})
              </div>
              <div className="space-y-1">
                {matchedRooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedBuildingIds([r.buildingId]);
                      setActiveModule('buildings');
                      setBuildingsSubTab('rooms');
                      setIsSearchOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Phòng {r.code} · {r.buildingCode}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.roomType} · {r.area}m² ·{' '}
                        {r.listPriceVnd.toLocaleString('vi-VN')} đ/tháng
                      </div>
                    </div>
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {r.occupancyStatus}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buildings */}
          {matchedBuildings.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Building2 className="h-3.5 w-3.5" />
                Tòa nhà ({matchedBuildings.length})
              </div>
              <div className="space-y-1">
                {matchedBuildings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSelectedBuildingIds([b.id]);
                      setActiveModule('buildings');
                      setBuildingsSubTab('rooms');
                      setIsSearchOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {b.code} · {b.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.streetAddress}, {b.ward}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {b.stats.totalRooms} phòng
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Modules */}
          {matchedModules.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <LayoutGrid className="h-3.5 w-3.5" />
                Phân hệ ({matchedModules.length})
              </div>
              <div className="space-y-1">
                {matchedModules.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setActiveModule(m.id);
                        setIsSearchOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    >
                      <Icon className="h-4 w-4 text-brand-primary dark:text-blue-400" />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {m.label}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {m.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {matchedTenants.length === 0 &&
            matchedRooms.length === 0 &&
            matchedBuildings.length === 0 &&
            matchedModules.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                Không tìm thấy kết quả phù hợp với &ldquo;{query}&rdquo;.
              </p>
            )}
        </div>
      </div>
    </div>
  );
};
