import React, { useState, useEffect } from 'react';
import { X, MapPin, Check, Share2, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RoomListing } from '../types/room';
import {
  formatIsoDateDdMmYyyy,
  formatVndPrice,
} from '../services/roomService';

interface RoomDetailModalProps {
  room: RoomListing | null;
  sourceVerified?: boolean;
  onClose: () => void;
  onInquire: (room: RoomListing) => void;
  onOpenFullPage: (room: RoomListing) => void;
}

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  room,
  sourceVerified = true,
  onClose,
  onInquire,
  onOpenFullPage,
}) => {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setSelectedImgIdx(0);
    setCopiedLink(false);
  }, [room]);

  // Body scroll lock & Escape key handler for mobile & desktop accessibility
  useEffect(() => {
    if (!room) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
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

  return (
    <AnimatePresence>
      {room && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Xem nhanh ${room.shortTitle}`}
          className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-canvas-pure w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-3xl sm:rounded-section border-0 sm:border border-line shadow-modal overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-line flex items-center justify-between gap-3 bg-canvas shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 min-w-0">
                <span className="text-sm font-bold text-ink leading-snug">
                  {room.shortTitle}
                </span>
                <span
                  className={`self-start sm:self-auto px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${
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

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  aria-label="Sao chép liên kết phòng"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-warm border border-line inline-flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5 text-brand-600" />
                  <span>{copiedLink ? 'Đã chép link' : 'Chia sẻ'}</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng chi tiết phòng"
                  className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-warm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {(() => {
                const images =
                  room.images.length > 0
                    ? room.images
                    : [
                        {
                          url: '/images/rooms/studio-standard-01.webp',
                          srcSet:
                            '/images/rooms/studio-standard-01-640w.webp 640w, /images/rooms/studio-standard-01.webp 1024w',
                          alt: room.shortTitle,
                          isIllustrative: true,
                        },
                      ];
                const activeImage = images[selectedImgIdx] || images[0];

                return (
                  <div className="space-y-3">
                    <div className="relative aspect-[16/10] rounded-card overflow-hidden bg-canvas-warm border border-line">
                      <img
                        src={activeImage.url}
                        srcSet={activeImage.srcSet}
                        sizes="(max-width: 768px) 100vw, 720px"
                        alt={activeImage.alt}
                        className="w-full h-full object-cover"
                      />
                      {activeImage.isIllustrative && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded text-xs font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
                          Ảnh minh họa không gian
                        </span>
                      )}
                    </div>

                    {images.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {images.map((img, i) => (
                          <button
                            key={img.url + i}
                            type="button"
                            onClick={() => setSelectedImgIdx(i)}
                            className={`w-20 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-opacity ${
                              i === selectedImgIdx
                                ? 'border-brand-600 opacity-100'
                                : 'border-line opacity-65 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={img.url}
                              alt={img.alt}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Room Title, Location & Price */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-line">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-ink">
                    {room.title}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-ink-secondary flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    <span>
                      {room.buildingName} ({room.floorName}) ·{' '}
                      {room.buildingAddress}
                    </span>
                  </p>
                  <p className="mt-2 text-xs sm:text-sm text-ink-secondary tabular-nums">
                    Diện tích: <strong className="text-ink">{room.area}m²</strong> ·
                    Loại: <strong className="text-ink">{room.roomType}</strong> ·
                    Khả dụng:{' '}
                    <strong className="text-ink">
                      {room.status === 'AVAILABLE'
                        ? `Sẵn sàng (${formatIsoDateDdMmYyyy(room.availableFrom)})`
                        : `Dự kiến sau ${formatIsoDateDdMmYyyy(room.availableFrom)}`}
                    </strong>
                  </p>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="text-xs text-ink-secondary block">
                    Giá thuê hàng tháng
                  </span>
                  <span className="text-2xl font-bold text-ink tabular-nums">
                    {formatVndPrice(room.price)}
                  </span>
                  <span className="text-xs text-ink-secondary block">
                    Đặt cọc {room.depositMonths} tháng
                  </span>
                </div>
              </div>

              {/* Description & Furnishings */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-7 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">
                      Thông tin căn hộ
                    </h4>
                    <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed">
                      {room.detailedDescription}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-ink">
                      Nội thất &amp; trang bị
                    </h4>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {room.amenities.map((am) => (
                        <div
                          key={am}
                          className="flex items-center gap-2 text-xs sm:text-sm text-ink-secondary"
                        >
                          <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          <span>{am}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 bg-canvas p-4 rounded-card border border-line space-y-2.5 text-xs sm:text-sm">
                  <h4 className="font-semibold text-ink">
                    Quy định điện nước &amp; dịch vụ
                  </h4>
                  <p className="text-ink-secondary">
                    • <strong>Điện:</strong> {room.serviceFees.electricity}
                  </p>
                  <p className="text-ink-secondary">
                    • <strong>Nước:</strong> {room.serviceFees.water}
                  </p>
                  <p className="text-ink-secondary">
                    • <strong>Internet:</strong> {room.serviceFees.wifi}
                  </p>
                  <p className="text-ink-secondary">
                    • <strong>Để xe:</strong> {room.serviceFees.parking}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer: Open Full Detail Page + Primary Inquiry CTA */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-line bg-canvas flex flex-wrap items-center justify-between gap-3 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <a
                href={`/phong/${room.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onClose();
                  onOpenFullPage(room);
                }}
                className="px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line inline-flex items-center gap-1.5"
              >
                <span>Mở trang chi tiết</span>
                <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
              </a>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden sm:inline-flex px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink-secondary hover:text-ink"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onInquire(room);
                  }}
                  className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors min-h-[42px]"
                >
                  {room.status === 'AVAILABLE'
                    ? `Đăng ký xem ${room.roomCode}`
                    : `Nhận thông báo khi có ${room.roomCode}`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
