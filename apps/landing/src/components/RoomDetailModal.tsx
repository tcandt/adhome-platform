import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Share2, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RoomListing } from '../types/room';
import {
  formatRoomAvailabilityLabel,
  formatVndPrice,
} from '../services/roomService';

interface RoomDetailModalProps {
  room: RoomListing | null;
  sourceVerified?: boolean;
  onClose: () => void;
  onInquire: (room: RoomListing) => void;
  onOpenFullPage: (room: RoomListing) => void;
}

/**
 * Gate 04 Quick View Modal — Concise Summary Preview (distinct from /phong/:slug):
 * - Primary photo (+ "Ảnh minh họa" badge if illustrative)
 * - Short room title + verified status badge
 * - Monthly price
 * - 4 core specifications (Diện tích, Loại phòng, Nội thất, Thời điểm khả dụng)
 * - 2 clear actions: "Mở trang chi tiết" (/phong/:slug) or "Đăng ký xem phòng"
 * - Full keyboard focus trap (Tab / Shift+Tab / Escape)
 */
export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  room,
  sourceVerified = true,
  onClose,
  onInquire,
  onOpenFullPage,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCopiedLink(false);
  }, [room]);

  // Body scroll lock, initial focus & keyboard focus trap (Tab / Shift+Tab / Escape)
  useEffect(() => {
    if (!room) return;
    const prevOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [room, onClose]);

  const handleCopyUrl = async () => {
    if (!room) return;
    const url = `${window.location.origin}/phong/${room.slug}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const primaryImage = room?.images[0] || {
    url: '/images/rooms/studio-standard-01.webp',
    srcSet:
      '/images/rooms/studio-standard-01-640w.webp 640w, /images/rooms/studio-standard-01.webp 1024w',
    alt: room?.shortTitle || 'Ảnh căn hộ AdHome',
    isIllustrative: true,
  };

  return (
    <AnimatePresence>
      {room && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quickview-room-title"
          className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            data-testid="room-quickview-modal"
            className="bg-canvas-pure w-full max-h-[86dvh] sm:max-h-[88vh] max-w-lg rounded-t-2xl sm:rounded-section border-t sm:border border-line shadow-modal overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Compact Header */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2 bg-canvas shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 shrink-0">
                  Xem nhanh · {room.roomCode}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${
                    room.status === 'AVAILABLE'
                      ? 'bg-status-availableBg text-status-availableText border-status-availableBorder'
                      : 'bg-status-comingBg text-status-comingText border-status-comingBorder'
                  }`}
                >
                  {sourceVerified && room.sourceVerified !== false
                    ? room.status === 'AVAILABLE'
                      ? 'Đang trống'
                      : room.availableFromLabel
                    : `Minh họa · ${
                        room.status === 'AVAILABLE'
                          ? 'Đang trống'
                          : room.availableFromLabel
                      }`}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  aria-label="Sao chép liên kết phòng"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-warm border border-line inline-flex items-center gap-1"
                >
                  <Share2 className="w-3.5 h-3.5 text-brand-600" />
                  <span>{copiedLink ? 'Đã chép' : 'Chia sẻ'}</span>
                </button>

                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng xem nhanh"
                  className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-warm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Concise Body: Photo + Title/Price + 4 Key Specs */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* 1. Primary Photo */}
              <div className="relative aspect-[16/9] rounded-card overflow-hidden bg-canvas-warm border border-line">
                <img
                  src={primaryImage.url}
                  srcSet={primaryImage.srcSet}
                  sizes="(max-width: 640px) 94vw, 512px"
                  alt={primaryImage.alt}
                  className="w-full h-full object-cover"
                />
                {primaryImage.isIllustrative && (
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
                    Ảnh minh họa
                  </span>
                )}
                {room.images.length > 1 && (
                  <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded text-[11px] font-medium bg-ink/80 text-white tabular-nums">
                    Album {room.images.length} ảnh ở trang chi tiết
                  </span>
                )}
              </div>

              {/* 2. Title + Location + Price */}
              <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-line">
                <div className="min-w-0">
                  <h3
                    id="quickview-room-title"
                    className="text-base sm:text-lg font-bold text-ink leading-snug"
                  >
                    {room.shortTitle}
                  </h3>
                  <p className="mt-1 text-xs text-ink-secondary flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    <span className="truncate">
                      {room.buildingName} ({room.floorName}) · KĐT Ân Phú
                    </span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-xl font-bold text-ink tabular-nums block">
                    {formatVndPrice(room.price)}
                  </span>
                  <span className="text-[11px] text-ink-secondary block">
                    / tháng · Cọc {room.depositMonths} tháng
                  </span>
                </div>
              </div>

              {/* 3. Two Concise Horizontal Specification Rows (More breathing room than 4 boxed cards) */}
              <div
                data-testid="quickview-2-spec-rows"
                className="rounded-lg bg-canvas border border-line divide-y divide-line text-xs"
              >
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-ink-muted shrink-0">
                    Thông số &amp; Nội thất
                  </span>
                  <strong className="text-ink font-semibold tabular-nums text-right">
                    {room.area}m² · {room.roomType} · {room.furnishedLabel}
                  </strong>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-ink-muted shrink-0">
                    Thời điểm khả dụng
                  </span>
                  <strong
                    data-testid="quickview-availability-label"
                    className="text-ink font-semibold tabular-nums text-right"
                  >
                    {formatRoomAvailabilityLabel(room)}
                  </strong>
                </div>
              </div>

              <p className="text-xs text-ink-secondary leading-relaxed">
                {room.shortDescription} Xem toàn bộ album ảnh, danh mục nội thất
                và biểu phí điện nước tại trang chi tiết phòng.
              </p>
            </div>

            {/* Footer: 2 Actions — "Mở trang chi tiết" & "Đăng ký xem" */}
            <div className="px-4 py-3.5 border-t border-line bg-canvas grid grid-cols-2 gap-2.5 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <a
                href={`/phong/${room.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onClose();
                  onOpenFullPage(room);
                }}
                className="py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line inline-flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <span>Mở trang chi tiết</span>
                <ExternalLink className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              </a>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInquire(room);
                }}
                className="py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors min-h-[42px]"
              >
                {room.status === 'AVAILABLE'
                  ? `Đăng ký xem ${room.roomCode}`
                  : `Nhận báo ${room.roomCode}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
