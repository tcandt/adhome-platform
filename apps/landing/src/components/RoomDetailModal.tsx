import React, { useState, useEffect } from 'react';
import { X, MapPin, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface RoomDetailModalProps {
  room: RoomListing | null;
  onClose: () => void;
  onInquire: (room: RoomListing) => void;
}

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  room,
  onClose,
  onInquire,
}) => {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);

  useEffect(() => {
    setSelectedImgIdx(0);
  }, [room]);

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
          aria-label={`Chi tiết ${room.shortTitle}`}
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-canvas-pure rounded-section max-w-3xl w-full border border-line shadow-modal overflow-hidden my-auto max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4 bg-canvas">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-bold text-ink">
                  {room.shortTitle}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${
                    room.status === 'AVAILABLE'
                      ? 'bg-status-availableBg text-status-availableText border-status-availableBorder'
                      : 'bg-status-comingBg text-status-comingText border-status-comingBorder'
                  }`}
                >
                  {room.status === 'AVAILABLE'
                    ? 'Đang trống'
                    : room.availableFromLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng chi tiết phòng"
                className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-warm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {(() => {
                const images =
                  room.images.length > 0
                    ? room.images
                    : [
                        {
                          url: '/images/rooms/studio-standard-01.png',
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
                        alt={activeImage.alt}
                        className="w-full h-full object-cover"
                      />
                      {activeImage.isIllustrative && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded text-xs font-medium bg-canvas-pure/90 text-ink-secondary border border-line">
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
                    Phù hợp: <strong className="text-ink">{room.maxOccupants}</strong>
                  </p>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="text-xs text-ink-muted block">
                    Giá thuê hàng tháng
                  </span>
                  <span className="text-2xl font-bold text-ink tabular-nums">
                    {formatVndPrice(room.price)}
                  </span>
                  <span className="text-xs text-ink-muted block">
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

            {/* Modal Footer: Single Primary CTA */}
            <div className="px-5 py-4 border-t border-line bg-canvas flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink-secondary hover:text-ink"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInquire(room);
                }}
                className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
              >
                {room.status === 'AVAILABLE'
                  ? `Đăng ký xem ${room.roomCode}`
                  : `Nhận thông báo khi có ${room.roomCode}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
