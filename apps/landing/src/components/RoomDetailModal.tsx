import React, { useState } from 'react';
import {
  X,
  MapPin,
  Maximize2,
  Users,
  Layers,
  CheckCircle2,
  CalendarClock,
  Phone,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react';
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

  if (!room) return null;

  const images =
    room.images.length > 0
      ? room.images
      : [
          {
            url: '/images/rooms/studio-standard-01.png',
            alt: room.title,
            caption: room.shortDescription,
          },
        ];

  const activeImage = images[selectedImgIdx] || images[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết ${room.roomCode} — ${room.title}`}
      className="fixed inset-0 z-50 bg-ink/75 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-canvas-pure rounded-section max-w-4xl w-full border border-line shadow-modal overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Bar */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4 bg-canvas">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-brand-navy text-white">
              {room.roomCode}
            </span>
            {room.status === 'AVAILABLE' ? (
              <span className="px-2.5 py-1 rounded text-xs font-semibold bg-status-availableBg text-status-availableText border border-status-availableBorder">
                ● Đang trống — {room.availableFromLabel}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded text-xs font-semibold bg-status-comingBg text-status-comingText border border-status-comingBorder">
                ● Sắp có — {room.availableFromLabel}
              </span>
            )}
            <span className="text-xs text-ink-muted hidden sm:inline">
              · {room.buildingName} ({room.floorName})
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ chi tiết phòng"
            className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-warm transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Photo Viewer */}
            <div className="lg:col-span-7 space-y-3">
              <div className="relative aspect-[16/10] rounded-card overflow-hidden bg-canvas-warm border border-line">
                <img
                  src={activeImage.url}
                  alt={activeImage.alt}
                  className="w-full h-full object-cover"
                />
              </div>
              {activeImage.caption && (
                <p className="text-xs text-ink-muted italic">
                  {activeImage.caption}
                </p>
              )}

              {images.length > 1 && (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <button
                      key={img.url + i}
                      type="button"
                      onClick={() => setSelectedImgIdx(i)}
                      className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                        i === selectedImgIdx
                          ? 'border-brand-600'
                          : 'border-line opacity-70 hover:opacity-100'
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

            {/* Right Column: Key Specs & Price */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-ink leading-snug">
                  {room.title}
                </h3>
                <p className="mt-1.5 text-xs text-ink-secondary flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span>
                    {room.buildingName} — {room.buildingAddress}
                  </span>
                </p>

                {/* Price Box */}
                <div className="mt-4 p-4 rounded-card bg-canvas-warm border border-line">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-ink-muted">
                      Giá thuê niêm yết
                    </span>
                    <span className="text-xs font-semibold text-brand-700">
                      Cọc {room.depositMonths} tháng
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-ink tabular-nums">
                      {formatVndPrice(room.price)}
                    </span>
                    <span className="text-xs text-ink-muted">/ tháng</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-secondary">
                    {room.furnishedLabel}
                  </p>
                </div>

                {/* Spec Grid */}
                <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-2.5 rounded-lg bg-canvas border border-line">
                    <Layers className="w-4 h-4 text-brand-600 mx-auto" />
                    <span className="text-[11px] text-ink-muted block mt-1">
                      Loại phòng
                    </span>
                    <span className="text-xs font-bold text-ink">
                      {room.roomType}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-canvas border border-line">
                    <Maximize2 className="w-4 h-4 text-brand-600 mx-auto" />
                    <span className="text-[11px] text-ink-muted block mt-1">
                      Diện tích
                    </span>
                    <span className="text-xs font-bold text-ink tabular-nums">
                      {room.area}m²
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-canvas border border-line">
                    <Users className="w-4 h-4 text-brand-600 mx-auto" />
                    <span className="text-[11px] text-ink-muted block mt-1">
                      Phù hợp
                    </span>
                    <span className="text-xs font-bold text-ink">
                      {room.maxOccupants}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-ink-muted flex items-center gap-1.5 pt-2 border-t border-line">
                <RefreshCw className="w-3.5 h-3.5 text-brand-600" />
                <span>{room.lastSyncedFromConsole}</span>
              </div>
            </div>
          </div>

          {/* Detailed Description & Furnishings */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 border-t border-line">
            <div className="md:col-span-7 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-ink">
                  Mô tả chi tiết căn hộ
                </h4>
                <p className="mt-1.5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                  {room.detailedDescription}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-ink">
                  Danh mục nội thất &amp; tiện nghi trong phòng
                </h4>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {room.amenities.map((am) => (
                    <div
                      key={am}
                      className="flex items-center gap-1.5 text-xs text-ink-secondary bg-canvas px-2.5 py-1.5 rounded border border-line"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                      <span>{am}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Service Fees Breakdown */}
            <div className="md:col-span-5 bg-canvas p-4 rounded-card border border-line">
              <h4 className="text-sm font-bold text-ink">
                Chi phí dịch vụ hàng tháng
              </h4>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-2 py-1 border-b border-line">
                  <dt className="text-ink-muted">Tiền điện:</dt>
                  <dd className="font-semibold text-ink text-right">
                    {room.serviceFees.electricity}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1 border-b border-line">
                  <dt className="text-ink-muted">Tiền nước:</dt>
                  <dd className="font-semibold text-ink text-right">
                    {room.serviceFees.water}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1 border-b border-line">
                  <dt className="text-ink-muted">Internet Wifi:</dt>
                  <dd className="font-semibold text-status-availableText text-right">
                    {room.serviceFees.wifi}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1 border-b border-line">
                  <dt className="text-ink-muted">Chỗ để xe:</dt>
                  <dd className="font-semibold text-status-availableText text-right">
                    {room.serviceFees.parking}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <dt className="text-ink-muted">Vệ sinh chung:</dt>
                  <dd className="font-semibold text-ink text-right">
                    {room.serviceFees.management}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Bottom Modal CTA Footer */}
        <div className="px-5 py-4 border-t border-line bg-canvas flex flex-wrap items-center justify-between gap-3">
          <a
            href="tel:0905889123"
            className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line inline-flex items-center gap-2"
          >
            <Phone className="w-4 h-4 text-brand-600" />
            <span>Gọi trực tiếp: 0905 889 123</span>
          </a>

          <div className="flex items-center gap-2.5">
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
              className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 inline-flex items-center gap-2"
            >
              {room.status === 'AVAILABLE' ? (
                <>
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>Quan tâm &amp; Hẹn xem phòng {room.roomCode}</span>
                </>
              ) : (
                <>
                  <CalendarClock className="w-4 h-4" />
                  <span>Đăng ký giữ chỗ trước {room.roomCode}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
