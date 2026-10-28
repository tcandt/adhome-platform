import React from 'react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface RoomCardProps {
  room: RoomListing;
  sourceVerified?: boolean;
  onSelect: (room: RoomListing) => void;
}

/**
 * Gate 02 / Gate 03 Room Card — Strict 6-Element Minimalist Hierarchy:
 * 1. Large 4:3 photo (WebP + responsive srcSet + lazy loading)
 * 2. Verified status badge (+ "Ảnh minh họa" label if illustrative)
 * 3. Short room name (semantic link to /phong/:slug)
 * 4. Area · Room type · Furnished level
 * 5. Monthly price
 * 6. Single primary CTA
 */
export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  sourceVerified = true,
  onSelect,
}) => {
  const primaryImage = room.images[0] || {
    url: '/images/rooms/studio-standard-01.webp',
    srcSet:
      '/images/rooms/studio-standard-01-640w.webp 640w, /images/rooms/studio-standard-01.webp 1024w',
    width: 1024,
    height: 571,
    alt: room.shortTitle,
    isIllustrative: true,
  };

  const isAvailable = room.status === 'AVAILABLE';
  const isVerified = sourceVerified && room.sourceVerified !== false;
  const statusText = isAvailable ? 'Đang trống' : room.availableFromLabel;

  return (
    <article
      onClick={() => onSelect(room)}
      className="group bg-canvas-pure rounded-card border border-line overflow-hidden shadow-card hover:shadow-cardHover transition-shadow duration-200 cursor-pointer flex flex-col h-full"
    >
      {/* 1. Large 4:3 Photo + 2. Status */}
      <div className="relative aspect-[4/3] bg-canvas-warm overflow-hidden shrink-0">
        <img
          src={primaryImage.url}
          srcSet={primaryImage.srcSet}
          sizes="(max-width: 767px) 92vw, (max-width: 1023px) 46vw, 380px"
          width={primaryImage.width || 1024}
          height={primaryImage.height || 764}
          alt={primaryImage.alt || room.shortTitle}
          loading="lazy"
          decoding="async"
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
            {isVerified ? statusText : `Minh họa · ${statusText}`}
          </span>

          {primaryImage.isIllustrative && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
              Ảnh minh họa
            </span>
          )}
        </div>
      </div>

      {/* Card Body: Uniform Height & Spacing */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* 3. Short room name */}
          <h3 className="text-[17px] font-semibold text-ink group-hover:text-brand-700 transition-colors leading-snug">
            <a
              href={`/phong/${room.slug}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(room);
              }}
              className="focus:outline-none"
            >
              {room.shortTitle}
            </a>
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
            <span className="text-xs text-ink-secondary"> / tháng</span>
          </div>

          <a
            href={`/phong/${room.slug}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(room);
            }}
            className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center justify-center min-h-[40px]"
          >
            Xem chi tiết
          </a>
        </div>
      </div>
    </article>
  );
};
