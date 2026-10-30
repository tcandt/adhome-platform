import React, { useState, useEffect } from 'react';
import { Search, X, Building, Home, User, FileText, ArrowRight } from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useAuth } from '@/app/providers/AuthContext';
import { EXPIRING_CONTRACTS_MOCK } from '@/shared/data/businessMetrics';

export const GlobalSearchModal: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, setActiveModule } = useNavigation();
  const { buildings, rooms } = usePortfolio();
  const { isBuildingAllowed } = useAuth();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const normalized = query.trim().toLowerCase();

  const filteredBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(normalized) || b.address.toLowerCase().includes(normalized) || b.code.toLowerCase().includes(normalized)
  );

  const filteredRooms = rooms.filter(r =>
    r.code.toLowerCase().includes(normalized) ||
    r.buildingName.toLowerCase().includes(normalized) ||
    (r.currentTenant && r.currentTenant.name.toLowerCase().includes(normalized))
  );

  const filteredContracts = EXPIRING_CONTRACTS_MOCK.filter(c =>
    isBuildingAllowed(c.buildingCode) &&
    (c.contractCode.toLowerCase().includes(normalized) ||
      c.tenantName.toLowerCase().includes(normalized) ||
      c.roomCode.toLowerCase().includes(normalized))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-elevated border border-appBorder-light dark:border-appBorder-dark overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-appBorder-light dark:border-appBorder-dark gap-3">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm theo số phòng (101, 201), tên khách thuê, mã tòa nhà..."
            autoFocus
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {/* Buildings */}
          {filteredBuildings.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
                Tòa nhà ({filteredBuildings.length})
              </p>
              <div className="space-y-1">
                {filteredBuildings.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveModule('buildings');
                      setIsSearchOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{b.name}</p>
                        <p className="text-[11px] text-slate-400">{b.address}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      {b.occupiedRooms}/{b.totalRooms} căn <ArrowRight className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rooms */}
          {filteredRooms.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
                Căn hộ / Phòng ({filteredRooms.length})
              </p>
              <div className="space-y-1">
                {filteredRooms.slice(0, 5).map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setActiveModule('buildings');
                      setIsSearchOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <Home className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {r.code} • {r.type} ({r.area}m²)
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {r.buildingName} • Khách:{' '}
                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                            {r.currentTenant?.name || 'Trống'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'OCCUPIED'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : r.status === 'AVAILABLE'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {r.status === 'OCCUPIED' ? 'Đang thuê' : r.status === 'AVAILABLE' ? 'Phòng trống' : 'Giữ cọc'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contracts */}
          {filteredContracts.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
                Hợp đồng ({filteredContracts.length})
              </p>
              <div className="space-y-1">
                {filteredContracts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveModule('contracts');
                      setIsSearchOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {c.contractCode} • {c.tenantName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {c.buildingName} - {c.roomCode} • Hết hạn:{' '}
                          <span className="text-rose-600 font-semibold">{c.endDate}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {c.monthlyRent.toLocaleString('vi-VN')}₫/th
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredBuildings.length === 0 && filteredRooms.length === 0 && filteredContracts.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm">Không tìm thấy kết quả phù hợp với "{query}"</p>
              <p className="text-xs mt-1">Thử tìm kiếm với số phòng hoặc tên khách thuê</p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-between text-[11px] text-slate-400">
          <span>Dùng phím ↑ ↓ để di chuyển, ESC để đóng</span>
          <span>Unified Search • AdHome V2</span>
        </div>
      </div>
    </div>
  );
};
