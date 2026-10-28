import React from 'react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface ComingSoonSectionProps {
  rooms: RoomListing[];
  onSelectRoom: (room: RoomListing) => void;
  onNotifyRoom: (room: RoomListing) => void;
}

export const ComingSoonSection: React.FC<ComingSoonSectionProps> = ({
  rooms,
  onSelectRoom,
  onNotifyRoom,
}) => {
  if (rooms.length === 0) return null;

  return (
    <section
      id="phong-sap-co"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.2]">
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
          {rooms.map((room) => {
            const thumb =
              room.images[0]?.url || '/images/rooms/studio-standard-01.png';
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
                    src={thumb}
                    alt={room.shortTitle}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Right Info & Action Block */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-comingBg text-status-comingText border border-status-comingBorder">
                      {room.availableFromLabel}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {room.buildingName} · {room.floorName}
                    </span>
                  </div>

                  <h3
                    onClick={() => onSelectRoom(room)}
                    className="mt-1 text-[16px] font-semibold text-ink hover:text-brand-700 transition-colors cursor-pointer"
                  >
                    {room.shortTitle}
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
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors whitespace-nowrap"
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
