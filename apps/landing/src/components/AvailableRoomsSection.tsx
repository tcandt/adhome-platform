import React, { useMemo, useState } from 'react';
import {
  Maximize2,
  Users,
  Layers,
  Check,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  MessageSquarePlus,
  Sparkles,
  Camera,
} from 'lucide-react';
import { RoomListing, RoomTypeCategory } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface AvailableRoomsSectionProps {
  rooms: RoomListing[];
  isLoading?: boolean;
  onSelectRoom: (room: RoomListing) => void;
  onInquireRoom: (room: RoomListing) => void;
}

type SortOption = 'FEATURED' | 'PRICE_ASC' | 'PRICE_DESC' | 'AREA_DESC';
type ViewStateOverride = 'LIVE' | 'SKELETON' | 'SOLD_OUT';

const ROOM_TYPE_FILTERS: Array<{ label: string; value: 'ALL' | RoomTypeCategory }> = [
  { label: 'Tất cả loại phòng', value: 'ALL' },
  { label: 'Studio (28–30m²)', value: 'Studio' },
  { label: 'Studio Ban Công (32m²)', value: 'Studio Ban Công' },
  { label: '1 Phòng Ngủ (35–36m²)', value: '1 Phòng Ngủ' },
  { label: '2PN Mini + PK (45m²)', value: '2PN Mini + PK' },
];

const BUILDING_FILTERS = [
  { label: 'Tất cả 4 tòa Ân Phú', value: 'ALL' },
  { label: 'Tòa LK01-31', value: 'LK01-31' },
  { label: 'Tòa LK01-32', value: 'LK01-32' },
  { label: 'Tòa LK08-24', value: 'LK08-24' },
  { label: 'Tòa LK08-25', value: 'LK08-25' },
];

export const AvailableRoomsSection: React.FC<AvailableRoomsSectionProps> = ({
  rooms,
  isLoading = false,
  onSelectRoom,
  onInquireRoom,
}) => {
  const [selectedType, setSelectedType] = useState<'ALL' | RoomTypeCategory>('ALL');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('FEATURED');
  const [onlyImmediateMoveIn, setOnlyImmediateMoveIn] = useState<boolean>(false);
  const [viewOverride, setViewOverride] = useState<ViewStateOverride>('LIVE');

  const filteredRooms = useMemo(() => {
    if (viewOverride === 'SOLD_OUT') return [];

    let list = [...rooms];

    if (selectedType !== 'ALL') {
      list = list.filter((r) => r.roomType === selectedType);
    }

    if (selectedBuilding !== 'ALL') {
      list = list.filter((r) => r.buildingCode === selectedBuilding);
    }

    if (onlyImmediateMoveIn) {
      list = list.filter((r) => r.status === 'AVAILABLE');
    }

    list.sort((a, b) => {
      if (sortBy === 'PRICE_ASC') return a.price - b.price;
      if (sortBy === 'PRICE_DESC') return b.price - a.price;
      if (sortBy === 'AREA_DESC') return b.area - a.area;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.displayOrder - b.displayOrder;
    });

    return list;
  }, [rooms, selectedType, selectedBuilding, sortBy, onlyImmediateMoveIn, viewOverride]);

  const resetFilters = () => {
    setSelectedType('ALL');
    setSelectedBuilding('ALL');
    setSortBy('FEATURED');
    setOnlyImmediateMoveIn(false);
    setViewOverride('LIVE');
  };

  const showSkeleton = isLoading || viewOverride === 'SKELETON';

  return (
    <section
      id="phong-dang-trong"
      className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-8 border-b border-line">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-status-availableText bg-status-availableBg border border-status-availableBorder px-2.5 py-1 rounded mb-3">
              <span className="w-2 h-2 rounded-full bg-green-600" />
              Danh sách cập nhật trực tiếp
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Phòng đang trống — Sẵn sàng dọn vào ở ngay
            </h2>
            <p className="mt-2 text-sm sm:text-base text-ink-secondary max-w-2xl">
              Tất cả các căn hộ bên dưới đều đang trống thực tế tại Khu đô thị Ân Phú,
              Phường Tân An, Đắk Lắk. Đã hoàn tất vệ sinh công nghiệp, kiểm tra thiết bị
              và niêm yết giá minh bạch.
            </p>
          </div>

          {/* Subtle UX State Switcher (for testing Skeleton / Empty states per spec) */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end text-xs">
            <span className="text-ink-muted">Trạng thái hiển thị:</span>
            <div className="inline-flex rounded-lg border border-line bg-canvas-pure p-0.5">
              <button
                type="button"
                onClick={() => setViewOverride('LIVE')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewOverride === 'LIVE'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Thực tế ({rooms.length})
              </button>
              <button
                type="button"
                onClick={() => setViewOverride('SKELETON')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewOverride === 'SKELETON'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Đang tải
              </button>
              <button
                type="button"
                onClick={() => setViewOverride('SOLD_OUT')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewOverride === 'SOLD_OUT'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Tạm hết phòng
              </button>
            </div>
          </div>
        </div>

        {/* Filter & Sort Bar */}
        <div className="mt-6 bg-canvas-pure p-4 rounded-section border border-line shadow-subtle space-y-4">
          {/* Row 1: Room Type Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo loại phòng">
              {ROOM_TYPE_FILTERS.map((item) => {
                const active = selectedType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSelectedType(item.value)}
                    className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
                      active
                        ? 'bg-ink text-white border-ink'
                        : 'bg-canvas text-ink-secondary border-line hover:bg-canvas-warm hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-canvas-warm text-ink-secondary border border-line font-medium">
                <Check className="w-3.5 h-3.5 text-brand-600" />
                100% Full nội thất đồng bộ
              </span>
            </div>
          </div>

          {/* Row 2: Building Filter + Sort + Result Count */}
          <div className="pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted mr-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Tòa nhà:
              </span>
              {BUILDING_FILTERS.map((bld) => {
                const active = selectedBuilding === bld.value;
                return (
                  <button
                    key={bld.value}
                    type="button"
                    onClick={() => setSelectedBuilding(bld.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                      active
                        ? 'bg-brand-50 text-brand-800 border-brand-200 font-semibold'
                        : 'bg-canvas-pure text-ink-secondary border-line hover:bg-canvas-warm'
                    }`}
                  >
                    {bld.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
              <span className="text-xs text-ink-muted tabular-nums">
                Hiển thị <strong className="text-ink">{filteredRooms.length}</strong> /{' '}
                {rooms.length} phòng trống
              </span>

              <div className="flex items-center gap-2">
                <label htmlFor="room-sort-select" className="text-xs text-ink-muted">
                  Sắp xếp:
                </label>
                <select
                  id="room-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink bg-canvas border border-line focus:outline-none focus:border-brand-600"
                >
                  <option value="FEATURED">Đề xuất nổi bật</option>
                  <option value="PRICE_ASC">Giá thuê: Thấp đến cao</option>
                  <option value="PRICE_DESC">Giá thuê: Cao đến thấp</option>
                  <option value="AREA_DESC">Diện tích: Lớn đến nhỏ</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Room Listing Grid / Skeleton / Empty State */}
        {showSkeleton ? (
          <div
            aria-label="Đang tải danh sách phòng trống"
            className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-canvas-pure rounded-card border border-line overflow-hidden animate-pulse"
              >
                <div className="aspect-[16/10] bg-canvas-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-canvas-muted rounded w-1/3" />
                  <div className="h-5 bg-canvas-muted rounded w-5/6" />
                  <div className="h-4 bg-canvas-muted rounded w-2/3" />
                  <div className="pt-3 border-t border-line flex justify-between items-center">
                    <div className="h-6 bg-canvas-muted rounded w-28" />
                    <div className="h-9 bg-canvas-muted rounded w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="mt-8 bg-canvas-pure rounded-section border border-line p-8 sm:p-12 text-center max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-full bg-canvas-warm border border-line flex items-center justify-center mx-auto text-ink-secondary">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-ink">
              {viewOverride === 'SOLD_OUT'
                ? 'Hiện tại các phòng trống đã được khách đặt giữ chỗ hết'
                : 'Chưa tìm thấy phòng khớp với bộ lọc hiện tại'}
            </h3>
            <p className="mt-2 text-sm text-ink-secondary">
              {viewOverride === 'SOLD_OUT'
                ? 'Bạn có thể xem danh sách 4 phòng sắp trống trong tháng 11 bên dưới hoặc để lại thông tin để AdHome báo ngay khi có phòng mới.'
                : 'Hãy thử chọn "Tất cả loại phòng" hoặc xem sang các tòa lân cận thuộc Khu đô thị Ân Phú.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-ink bg-canvas-warm hover:bg-canvas-muted border border-line inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Xem lại toàn bộ {rooms.length} phòng trống</span>
              </button>
              <a
                href="#phong-sap-co"
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
              >
                Xem phòng sắp có
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRooms.map((room) => {
              const primaryImage = room.images[0]?.url || '/images/rooms/studio-standard-01.png';
              return (
                <article
                  key={room.id}
                  className="bg-canvas-pure rounded-card border border-line overflow-hidden shadow-card hover:shadow-cardHover transition-shadow duration-200 flex flex-col"
                >
                  {/* Image Container */}
                  <div
                    onClick={() => onSelectRoom(room)}
                    className="relative aspect-[16/10] bg-canvas-warm overflow-hidden cursor-pointer group"
                  >
                    <img
                      src={primaryImage}
                      alt={room.images[0]?.alt || room.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />

                    {/* Top-left Status Badge */}
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded text-xs font-semibold bg-status-availableBg text-status-availableText border border-status-availableBorder shadow-subtle">
                        ● Đang trống
                      </span>
                      {room.featured && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-brand-navy text-white">
                          Phòng chọn nhiều
                        </span>
                      )}
                    </div>

                    {/* Top-right Photo Count */}
                    {room.images.length > 1 && (
                      <span className="absolute top-3 right-3 px-2 py-1 rounded text-[11px] font-medium bg-ink/75 text-white inline-flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {room.images.length} ảnh
                      </span>
                    )}

                    {/* Bottom Location & Room Code Strip */}
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded text-xs font-semibold bg-canvas-pure/95 text-ink border border-line shadow-subtle">
                        {room.roomCode} · {room.buildingName}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
                        {room.floorName}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col">
                    {/* Highlight Micro-line */}
                    {room.highlightNote && (
                      <p className="text-xs font-semibold text-brand-700 mb-1.5">
                        {room.highlightNote}
                      </p>
                    )}

                    {/* Title */}
                    <h3 className="text-base sm:text-lg font-bold text-ink leading-snug">
                      <button
                        type="button"
                        onClick={() => onSelectRoom(room)}
                        className="text-left hover:text-brand-700 transition-colors"
                      >
                        {room.title}
                      </button>
                    </h3>

                    {/* Key Specs Row */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-ink-secondary">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-ink-muted" />
                        {room.roomType}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Maximize2 className="w-3.5 h-3.5 text-ink-muted" />
                        {room.area}m²
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-ink-muted" />
                        {room.maxOccupants}
                      </span>
                    </div>

                    {/* Short Description */}
                    <p className="mt-2.5 text-xs sm:text-sm text-ink-secondary line-clamp-2 leading-relaxed">
                      {room.shortDescription}
                    </p>

                    {/* Furniture Tags */}
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {room.amenities.slice(0, 5).map((item) => (
                        <span
                          key={item}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-warm text-ink-secondary border border-line"
                        >
                          {item}
                        </span>
                      ))}
                      {room.amenities.length > 5 && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-warm text-ink-muted border border-line">
                          +{room.amenities.length - 5} tiện ích
                        </span>
                      )}
                    </div>

                    {/* Card Footer: Price & Dual CTAs */}
                    <div className="mt-5 pt-4 border-t border-line flex items-end justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-medium text-ink-muted block">
                          Giá thuê niêm yết
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg sm:text-xl font-bold text-ink tabular-nums">
                            {formatVndPrice(room.price)}
                          </span>
                          <span className="text-xs text-ink-muted">/ tháng</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectRoom(room)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm hover:bg-canvas-muted border border-line transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Chi tiết</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onInquireRoom(room)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center gap-1"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>Quan tâm</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
