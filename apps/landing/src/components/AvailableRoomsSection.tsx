import React, { useMemo, useState } from 'react';
import { ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { DataMode, RoomListing } from '../types/room';
import { RoomCard } from './RoomCard';

interface AvailableRoomsSectionProps {
  rooms: RoomListing[];
  isLoading?: boolean;
  error?: string | null;
  dataMode?: DataMode;
  sourceVerified?: boolean;
  onRetry?: () => void;
  onOpenInquiry?: () => void;
  onSelectRoom: (room: RoomListing) => void;
  onNavigateAllRooms: () => void;
}

type QuickCategory = 'ALL' | 'STUDIO' | '1PN' | '2PN';

export const AvailableRoomsSection: React.FC<AvailableRoomsSectionProps> = ({
  rooms,
  isLoading = false,
  error = null,
  dataMode = 'LIVE',
  sourceVerified = true,
  onRetry,
  onOpenInquiry,
  onSelectRoom,
  onNavigateAllRooms,
}) => {
  const [activeCategory, setActiveCategory] = useState<QuickCategory>('ALL');

  const categoryTabs: Array<{ id: QuickCategory; label: string }> = [
    { id: 'ALL', label: 'Nổi bật' },
    { id: 'STUDIO', label: 'Studio' },
    { id: '1PN', label: '1 Phòng Ngủ' },
    { id: '2PN', label: '2 Phòng Ngủ' },
  ];

  // Prioritize 3-6 featured rooms on the home page per Requirement 4
  const displayedRooms = useMemo(() => {
    let list = [...rooms];
    if (activeCategory === 'STUDIO') {
      list = list.filter(
        (r) => r.roomType === 'Studio' || r.roomType === 'Studio Ban Công'
      );
    } else if (activeCategory === '1PN') {
      list = list.filter((r) => r.roomType === '1 Phòng Ngủ');
    } else if (activeCategory === '2PN') {
      list = list.filter((r) => r.roomType === '2PN Mini + PK');
    } else {
      list.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return a.displayOrder - b.displayOrder;
      });
    }
    return list.slice(0, 6);
  }, [rooms, activeCategory]);

  const isVerifiedSource = sourceVerified && dataMode === 'LIVE';

  return (
    <section
      id="phong-dang-trong"
      className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Clean Section Header + Quick Category Filter */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-line">
          <div>
            <h2 className="text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.26]">
              Phòng đang trống tại Khu đô thị Ân Phú
            </h2>
            <p className="mt-2 text-[15px] sm:text-base text-ink-secondary">
              Các căn hộ sẵn sàng đón khách thuê tại Phường Tân An, Đắk Lắk.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Phân loại phòng"
          >
            {categoryTabs.map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors min-h-[40px] ${
                    active
                      ? 'bg-ink text-white border-ink'
                      : 'bg-canvas-pure text-ink-secondary border-line hover:bg-canvas-warm hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Explicit DEMO MODE Notice when unverified seed data is active */}
        {dataMode === 'DEMO' && (
          <div
            role="status"
            data-testid="demo-mode-banner"
            className="mt-6 p-3.5 rounded-card bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-800" />
            <span>
              <strong>Chế độ Dữ liệu mẫu (Demo Mode):</strong> Danh sách dưới đây
              là dữ liệu minh họa khi chưa gắn nguồn Public Listings API. Tình
              trạng phòng chính thức chỉ được công bố khi kết nối ở chế độ Live
              Mode.
            </span>
          </div>
        )}

        {/* Content: Loading / API Error (No Seed Fallback!) / 3-Column Grid */}
        {isLoading ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-canvas-pure rounded-card border border-line overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-canvas-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-canvas-muted rounded w-2/3" />
                  <div className="h-4 bg-canvas-muted rounded w-1/2" />
                  <div className="pt-4 border-t border-line flex justify-between items-center">
                    <div className="h-6 bg-canvas-muted rounded w-24" />
                    <div className="h-9 bg-canvas-muted rounded w-28" />
                  </div>
                </div>
              </div>
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
            <h3 className="text-base sm:text-lg font-bold text-ink">
              Tạm thời chưa thể tải danh sách phòng khả dụng
            </h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Thử tải lại dữ liệu</span>
                </button>
              )}
              {onOpenInquiry && (
                <button
                  type="button"
                  onClick={onOpenInquiry}
                  className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas hover:bg-canvas-warm border border-line"
                >
                  Liên hệ trực tiếp quản lý
                </button>
              )}
            </div>
          </div>
        ) : displayedRooms.length === 0 ? (
          <div className="mt-8 bg-canvas-pure rounded-section border border-line p-8 text-center max-w-xl mx-auto">
            <p className="text-base font-semibold text-ink">
              Hiện chưa có phòng trống thuộc phân loại này
            </p>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Bạn có thể xem các phân loại khác hoặc kiểm tra danh sách phòng sắp có
              bên dưới.
            </p>
            <button
              type="button"
              onClick={() => setActiveCategory('ALL')}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm border border-line"
            >
              Xem tất cả loại phòng
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                sourceVerified={isVerifiedSource}
                onSelect={(r) => onSelectRoom(r)}
              />
            ))}
          </div>
        )}

        {/* Prominent Navigation to Dedicated /phong-trong Catalog Page */}
        {!error && (
          <div className="mt-10 flex items-center justify-center">
            <a
              href="/phong-trong"
              onClick={(e) => {
                e.preventDefault();
                onNavigateAllRooms();
              }}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line transition-colors inline-flex items-center gap-2 shadow-subtle min-h-[44px]"
            >
              <span>Xem tất cả phòng trống</span>
              <ArrowRight className="w-4 h-4 text-brand-600" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
};
