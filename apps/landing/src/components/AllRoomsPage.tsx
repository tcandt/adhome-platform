import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DataMode, RoomListing } from '../types/room';
import { RoomCard } from './RoomCard';

interface AllRoomsPageProps {
  rooms: RoomListing[];
  isLoading?: boolean;
  error?: string | null;
  dataMode?: DataMode;
  sourceVerified?: boolean;
  onRetry?: () => void;
  onSelectRoom: (room: RoomListing) => void;
  onBackHome: () => void;
}

type SortKey = 'DEFAULT' | 'PRICE_ASC' | 'PRICE_DESC' | 'AREA_DESC';

const PAGE_SIZE = 6;

export const AllRoomsPage: React.FC<AllRoomsPageProps> = ({
  rooms,
  isLoading = false,
  error = null,
  dataMode = 'LIVE',
  sourceVerified = true,
  onRetry,
  onSelectRoom,
  onBackHome,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'COMING_SOON'>('AVAILABLE');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [buildingFilter, setBuildingFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('DEFAULT');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState<boolean>(false);

  // Lock body scroll when Mobile Filter Sheet is open
  useEffect(() => {
    if (!mobileFilterSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileFilterSheetOpen]);

  // Dynamically derive room types & buildings from data (no hardcoded limits)
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => set.add(r.roomType));
    return Array.from(set);
  }, [rooms]);

  const availableBuildings = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => map.set(r.buildingCode, r.buildingName));
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    let list = [...rooms];

    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (typeFilter !== 'ALL') {
      list = list.filter((r) => r.roomType === typeFilter);
    }
    if (buildingFilter !== 'ALL') {
      list = list.filter((r) => r.buildingCode === buildingFilter);
    }

    list.sort((a, b) => {
      if (sortBy === 'PRICE_ASC') return a.price - b.price;
      if (sortBy === 'PRICE_DESC') return b.price - a.price;
      if (sortBy === 'AREA_DESC') return b.area - a.area;
      return a.displayOrder - b.displayOrder;
    });

    return list;
  }, [rooms, statusFilter, typeFilter, buildingFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRooms = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRooms.slice(start, start + PAGE_SIZE);
  }, [filteredRooms, safePage]);

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setBuildingFilter('ALL');
    setSortBy('DEFAULT');
    setCurrentPage(1);
  };

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (buildingFilter !== 'ALL' ? 1 : 0);

  const isVerifiedSource = sourceVerified && dataMode === 'LIVE';

  return (
    <section className="py-10 sm:py-16 bg-canvas min-h-[75vh]">
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Breadcrumb & Page Title */}
        <div className="pb-6 border-b border-line">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-ink-secondary hover:text-ink mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại trang chủ</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                Danh sách phòng cho thuê tại Khu đô thị Ân Phú
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-ink-secondary">
                Tra cứu toàn bộ căn hộ đang trống và sắp có theo loại phòng, tòa nhà
                và mức giá.
              </p>
            </div>

            {/* Mobile Filter Sheet Trigger + Sort */}
            <div className="flex md:hidden items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMobileFilterSheetOpen(true)}
                className="px-3.5 py-2.5 rounded-lg text-xs font-semibold text-ink bg-canvas-pure border border-line inline-flex items-center gap-2 min-h-[42px]"
              >
                <SlidersHorizontal className="w-4 h-4 text-brand-600" />
                <span>Bộ lọc {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
              </button>

              <select
                aria-label="Sắp xếp danh sách phòng"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortKey);
                  setCurrentPage(1);
                }}
                className="px-3 py-2.5 rounded-lg text-xs font-medium text-ink bg-canvas-pure border border-line min-h-[42px]"
              >
                <option value="DEFAULT">Sắp xếp: Mặc định</option>
                <option value="PRICE_ASC">Giá: Thấp đến cao</option>
                <option value="PRICE_DESC">Giá: Cao đến thấp</option>
                <option value="AREA_DESC">Diện tích: Lớn nhất</option>
              </select>
            </div>
          </div>
        </div>

        {/* Explicit DEMO MODE Notice */}
        {dataMode === 'DEMO' && (
          <div
            role="status"
            className="mt-6 p-3.5 rounded-card bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-800" />
            <span>
              <strong>Chế độ Dữ liệu mẫu (Demo Mode):</strong> Danh sách phòng
              đang hiển thị từ dữ liệu mẫu xem trước, chưa kết nối với nguồn dữ
              liệu đã xác minh từ Console.
            </span>
          </div>
        )}

        {/* Desktop Filter Bar (Hidden on Mobile — Mobile uses Filter Sheet) */}
        <div className="hidden md:flex mt-6 p-4 rounded-section bg-canvas-pure border border-line items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status */}
            <select
              aria-label="Trạng thái phòng"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'AVAILABLE' | 'COMING_SOON');
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="AVAILABLE">Đang trống</option>
              <option value="COMING_SOON">Phòng sắp có</option>
            </select>

            {/* Room Type */}
            <select
              aria-label="Loại phòng"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
            >
              <option value="ALL">Tất cả loại phòng</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Building */}
            <select
              aria-label="Tòa nhà"
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
            >
              <option value="ALL">Tất cả tòa nhà</option>
              {availableBuildings.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-medium text-brand-700 hover:underline px-2 py-1"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted tabular-nums">
              {filteredRooms.length} phòng phù hợp
            </span>
            <select
              aria-label="Sắp xếp"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortKey);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
            >
              <option value="DEFAULT">Sắp xếp: Mặc định</option>
              <option value="PRICE_ASC">Giá thuê: Thấp đến cao</option>
              <option value="PRICE_DESC">Giá thuê: Cao đến thấp</option>
              <option value="AREA_DESC">Diện tích: Lớn nhất</option>
            </select>
          </div>
        </div>

        {/* Room Grid */}
        {isLoading ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-canvas-pure rounded-card border border-line h-80 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            data-testid="catalog-api-error"
            className="mt-8 bg-canvas-pure rounded-section border border-line p-8 text-center max-w-xl mx-auto space-y-4"
          >
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-ink">
              Không thể tải danh sách phòng công khai
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử tải lại</span>
              </button>
            )}
          </div>
        ) : paginatedRooms.length === 0 ? (
          <div className="mt-8 bg-canvas-pure rounded-section border border-line p-10 text-center max-w-lg mx-auto">
            <p className="text-base font-bold text-ink">
              Không tìm thấy phòng khớp với bộ lọc
            </p>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Hãy thử mở rộng tiêu chí lọc để xem tất cả các phòng đang mở thuê.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-brand-600"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  sourceVerified={isVerifiedSource}
                  onSelect={(r) => onSelectRoom(r)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav
                aria-label="Phân trang danh sách phòng"
                className="mt-10 flex items-center justify-center gap-2"
              >
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-2.5 rounded-lg border border-line bg-canvas-pure text-ink disabled:opacity-40"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
                  (page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                        page === safePage
                          ? 'bg-ink text-white border-ink'
                          : 'bg-canvas-pure text-ink-secondary border-line hover:bg-canvas-warm'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="p-2.5 rounded-lg border border-line bg-canvas-pure text-ink disabled:opacity-40"
                  aria-label="Trang tiếp theo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {/* Dedicated Mobile Filter Sheet */}
      <AnimatePresence>
        {mobileFilterSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/60 flex items-end md:hidden"
            onClick={() => setMobileFilterSheetOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="bg-canvas-pure w-full rounded-t-2xl border-t border-line p-5 space-y-5 max-h-[85dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-base font-bold text-ink">Bộ lọc tìm phòng</h3>
                <button
                  type="button"
                  onClick={() => setMobileFilterSheetOpen(false)}
                  aria-label="Đóng bộ lọc"
                  className="p-2 rounded-lg text-ink-secondary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-2">
                    Trạng thái phòng
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'ALL', label: 'Tất cả' },
                      { id: 'AVAILABLE', label: 'Đang trống' },
                      { id: 'COMING_SOON', label: 'Sắp có' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setStatusFilter(st.id as 'ALL' | 'AVAILABLE' | 'COMING_SOON');
                          setCurrentPage(1);
                        }}
                        className={`py-2.5 px-2.5 rounded-lg text-xs font-medium border ${
                          statusFilter === st.id
                            ? 'bg-ink text-white border-ink'
                            : 'bg-canvas text-ink-secondary border-line'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-2">
                    Loại phòng
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTypeFilter('ALL');
                        setCurrentPage(1);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border ${
                        typeFilter === 'ALL'
                          ? 'bg-ink text-white border-ink'
                          : 'bg-canvas text-ink-secondary border-line'
                      }`}
                    >
                      Tất cả
                    </button>
                    {availableTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTypeFilter(t);
                          setCurrentPage(1);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border ${
                          typeFilter === t
                            ? 'bg-ink text-white border-ink'
                            : 'bg-canvas text-ink-secondary border-line'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-2">
                    Tòa nhà
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBuildingFilter('ALL');
                        setCurrentPage(1);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border ${
                        buildingFilter === 'ALL'
                          ? 'bg-ink text-white border-ink'
                          : 'bg-canvas text-ink-secondary border-line'
                      }`}
                    >
                      Tất cả
                    </button>
                    {availableBuildings.map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => {
                          setBuildingFilter(b.code);
                          setCurrentPage(1);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border ${
                          buildingFilter === b.code
                            ? 'bg-ink text-white border-ink'
                            : 'bg-canvas text-ink-secondary border-line'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-line grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="py-3 rounded-lg text-xs font-semibold text-ink bg-canvas-warm border border-line"
                >
                  Đặt lại
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFilterSheetOpen(false)}
                  className="py-3 rounded-lg text-xs font-semibold text-white bg-brand-600"
                >
                  Xem {filteredRooms.length} phòng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
