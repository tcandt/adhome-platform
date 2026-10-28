import React from 'react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface RoomCardProps {
  room: RoomListing;
  onSelect: (room: RoomListing) => void;
}

/**
 * Gate 02 Room Card — Strict Minimalist Hierarchy:
 * 1. Large photo
 * 2. Status (and subtle "Ảnh minh họa" label if illustrative)
 * 3. Short room name
 * 4. Area · Room type · Furnished level
 * 5. Monthly price
 * 6. Single primary CTA
 */
export const RoomCard: React.FC<RoomCardProps> = ({ room, onSelect }) => {
  const primaryImage = room.images[0] || {
    url: '/images/rooms/studio-standard-01.png',
    alt: room.shortTitle,
    isIllustrative: true,
  };

  const isAvailable = room.status === 'AVAILABLE';

  return (
    <article
      onClick={() => onSelect(room)}
      className="group bg-canvas-pure rounded-card border border-line overflow-hidden shadow-card hover:shadow-cardHover transition-shadow duration-200 cursor-pointer flex flex-col"
    >
      {/* 1. Large 4:3 Photo + 2. Status */}
      <div className="relative aspect-[4/3] bg-canvas-warm overflow-hidden">
        <img
          src={primaryImage.url}
          alt={primaryImage.alt || room.shortTitle}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.015] transition-transform duration-300"
        />

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <span
            className={`px-2.5 py-1 rounded text-xs font-semibold border ${
              isAvailable
                ? 'bg-status-availableBg text-status-availableText border-status-availableBorder'
                : 'bg-status-comingBg text-status-comingText border-status-comingBorder'
            }`}
          >
            {isAvailable ? 'Đang trống' : room.availableFromLabel}
          </span>

          {primaryImage.isIllustrative && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-pure/90 text-ink-secondary border border-line">
              Ảnh minh họa
            </span>
          )}
        </div>
      </div>

      {/* Card Body: Short Title + Specs + Price + Single CTA */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* 3. Short room name */}
          <h3 className="text-[17px] font-semibold text-ink group-hover:text-brand-700 transition-colors leading-snug">
            {room.shortTitle}
          </h3>

          {/* 4. Area, room type, furnished */}
          <p className="mt-1.5 text-sm text-ink-secondary tabular-nums">
            {room.area}m² · {room.roomType} · {room.furnishedLabel}
          </p>
        </div>

        {/* 5. Price & 6. Single Primary CTA */}
        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
          <div>
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatVndPrice(room.price)}
            </span>
            <span className="text-xs text-ink-muted"> / tháng</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(room);
            }}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
          >
            Xem chi tiết
          </button>
        </div>
      </div>
    </article>
  );
};
