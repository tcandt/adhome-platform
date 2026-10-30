import React from 'react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface ComingSoonSectionProps {
  rooms: RoomListing[];
  isLoading?: boolean;
  sourceVerified?: boolean;
  onSelectRoom: (room: RoomListing) => void;
  onNotifyRoom: (room: RoomListing) => void;
}

export const ComingSoonSection: React.FC<ComingSoonSectionProps> = ({
  rooms,
  isLoading = false,
  sourceVerified = true,
  onSelectRoom,
  onNotifyRoom,
}) => {
  if (!isLoading && rooms.length === 0) return null;

  return (
    <section
      id="phong-sap-co"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.26]">
            Phòng dự kiến sắp có
          </h2>
          <p className="mt-2 text-[15px] sm:text-base text-ink-secondary leading-relaxed">
            Các căn hộ dưới đây đang có hợp đồng thuê hoặc trong lịch bảo dưỡng.
            Thời điểm có phòng chỉ mang tính dự kiến theo kỳ hợp đồng hiện tại —
            bạn có thể đăng ký để nhận thông báo ngay khi phòng được xác nhận lịch
            trống.
          </p>
        </div>

        {/* Compact 2-Column Horizontal Cards (Zero truncated room titles) */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isLoading && rooms.length === 0
            ? [1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-canvas-pure rounded-card border border-line p-4 flex items-center gap-4 shadow-subtle animate-pulse"
                >
                  <div className="w-24 h-24 sm:w-32 sm:h-24 rounded-lg bg-canvas-muted shrink-0" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 bg-canvas-muted rounded w-1/3" />
                    <div className="h-5 bg-canvas-muted rounded w-2/3" />
                    <div className="pt-2 border-t border-line flex justify-between items-center">
                      <div className="h-4 bg-canvas-muted rounded w-28" />
                      <div className="h-9 bg-canvas-muted rounded w-36" />
                    </div>
                  </div>
                </div>
              ))
            : rooms.map((room) => {
            const primaryImg = room.images[0] || {
              url: '/images/rooms/studio-standard-01.webp',
              srcSet:
                '/images/rooms/studio-standard-01-640w.webp 640w, /images/rooms/studio-standard-01.webp 1024w',
              alt: room.shortTitle,
              isIllustrative: true,
            };
            const isVerified = sourceVerified && room.sourceVerified !== false;

            return (
              <article
                key={room.id}
                className="bg-canvas-pure rounded-card border border-line p-4 flex items-center gap-4 shadow-subtle"
              >
                {/* Compact Thumbnail */}
                <div
                  onClick={() => onSelectRoom(room)}
                  className="relative w-24 h-24 sm:w-32 sm:h-24 rounded-lg overflow-hidden bg-canvas-muted shrink-0 border border-line cursor-pointer"
                >
                  <img
                    src={primaryImg.url}
                    srcSet={primaryImg.srcSet}
                    sizes="128px"
                    width={primaryImg.width || 640}
                    height={primaryImg.height || 480}
                    alt={primaryImg.alt || room.shortTitle}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  {primaryImg.isIllustrative && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
                      Minh họa
                    </span>
                  )}
                </div>

                {/* Right Info & Action Block */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-comingBg text-status-comingText border border-status-comingBorder tabular-nums">
                      {isVerified
                        ? room.availableFromLabel
                        : `Minh họa · ${room.availableFromLabel}`}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {room.buildingName} · {room.floorName}
                    </span>
                  </div>

                  <h3 className="mt-1 text-[16px] font-semibold text-ink hover:text-brand-700 transition-colors">
                    <a
                      href={`/phong/${room.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectRoom(room);
                      }}
                    >
                      {room.shortTitle}
                    </a>
                  </h3>

                  <div className="mt-2.5 pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-ink-secondary tabular-nums">
                      {room.area}m² ·{' '}
                      <strong className="text-ink font-semibold">
                        {formatVndPrice(room.price)}/tháng
                      </strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => onNotifyRoom(room)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors whitespace-nowrap min-h-[36px]"
                    >
                      Nhận thông báo khi có phòng
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
