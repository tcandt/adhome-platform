import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  MapPin,
  Check,
  Share2,
  Calendar,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DataMode, RoomListing } from '../types/room';
import {
  formatIsoDateDdMmYyyy,
  formatVndPrice,
} from '../services/roomService';
import { RoomCard } from './RoomCard';

interface RoomDetailPageProps {
  room: RoomListing | null;
  allRooms: RoomListing[];
  isLoading: boolean;
  error: string | null;
  dataMode: DataMode;
  sourceVerified: boolean;
  onBackCatalog: () => void;
  onBackHome: () => void;
  onInquireRoom: (room: RoomListing) => void;
  onNavigateRoom: (room: RoomListing) => void;
}

export const RoomDetailPage: React.FC<RoomDetailPageProps> = ({
  room,
  allRooms,
  isLoading,
  error,
  dataMode,
  sourceVerified,
  onBackCatalog,
  onBackHome,
  onInquireRoom,
  onNavigateRoom,
}) => {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setSelectedImgIdx(0);
    setLightboxOpen(false);
    setCopiedUrl(false);
  }, [room?.id]);

  const handleCopyShareUrl = async () => {
    if (!room) return;
    const shareUrl = `${window.location.origin}/phong/${room.slug}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2800);
    } catch {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2800);
    }
  };

  if (isLoading) {
    return (
      <section className="py-10 sm:py-16 bg-canvas min-h-[75vh]">
        <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6 animate-pulse">
          <div className="h-5 w-48 bg-canvas-muted rounded" />
          <div className="h-9 w-2/3 bg-canvas-muted rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 aspect-[16/10] bg-canvas-muted rounded-section" />
            <div className="lg:col-span-4 h-80 bg-canvas-muted rounded-section" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-12 sm:py-20 bg-canvas min-h-[70vh]">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-canvas-pure rounded-section border border-line p-8 space-y-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-ink">
              Không thể tải thông tin chi tiết phòng
            </h1>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
              >
                Thử tải lại
              </button>
              <button
                type="button"
                onClick={onBackHome}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!room) {
    return (
      <section className="py-12 sm:py-20 bg-canvas min-h-[70vh]">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-canvas-pure rounded-section border border-line p-8 space-y-4">
            <h1 className="text-xl font-bold text-ink">
              Không tìm thấy thông tin căn hộ này
            </h1>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Mã phòng hoặc đường dẫn bạn truy cập hiện không tồn tại hoặc căn hộ
              đã ngừng mở thuê công khai.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onBackCatalog}
                className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
              >
                Xem danh sách phòng đang mở thuê
              </button>
              <button
                type="button"
                onClick={onBackHome}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas border border-line"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const images =
    room.images.length > 0
      ? room.images
      : [
          {
            url: '/images/rooms/studio-standard-01.webp',
            srcSet:
              '/images/rooms/studio-standard-01-640w.webp 640w, /images/rooms/studio-standard-01.webp 1024w',
            alt: room.shortTitle,
            caption: 'Ảnh minh họa không gian mẫu',
            isIllustrative: true,
          },
        ];

  const activeImage = images[selectedImgIdx] || images[0];
  const isAvailable = room.status === 'AVAILABLE';
  const isVerified = sourceVerified && room.sourceVerified !== false && dataMode === 'LIVE';
  const formattedAvailableDate = formatIsoDateDdMmYyyy(room.availableFrom);

  const relatedRooms = allRooms
    .filter((r) => r.id !== room.id && r.status === 'AVAILABLE')
    .slice(0, 3);

  return (
    <article className="py-8 sm:py-14 bg-canvas min-h-[80vh]">
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Demo Mode Unverified Notice */}
        {dataMode === 'DEMO' && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-card bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              <strong>Chế độ Dữ liệu mẫu (Demo Mode):</strong> Thông tin và tình
              trạng phòng dưới đây là dữ liệu minh họa phục vụ xem trước giao
              diện, chưa xác minh từ hệ thống vận hành thực tế.
            </span>
          </div>
        )}

        {/* Top Bar: Breadcrumb + Share Link Button */}
        <div className="pb-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-ink-secondary"
          >
            <button
              type="button"
              onClick={onBackHome}
              className="hover:text-ink transition-colors"
            >
              Trang chủ
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={onBackCatalog}
              className="hover:text-ink transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Danh sách phòng</span>
            </button>
            <span>/</span>
            <span className="font-semibold text-ink">{room.roomCode}</span>
          </nav>

          <button
            type="button"
            onClick={handleCopyShareUrl}
            aria-label="Sao chép liên kết chia sẻ phòng"
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line inline-flex items-center gap-1.5 transition-colors"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-status-availableText" />
                <span className="text-status-availableText">
                  Đã sao chép liên kết phòng
                </span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-brand-600" />
                <span>Chia sẻ liên kết phòng</span>
              </>
            )}
          </button>
        </div>

        {/* Main 12-Column Detail Layout */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Left 7 Columns: Photo Album + Detailed Info */}
          <div className="lg:col-span-7 space-y-8">
            {/* Album Viewer */}
            <div className="space-y-3">
              <div
                onClick={() => setLightboxOpen(true)}
                className="group relative aspect-[16/10] rounded-section overflow-hidden bg-canvas-warm border border-line cursor-pointer shadow-card"
              >
                <img
                  src={activeImage.url}
                  srcSet={activeImage.srcSet}
                  sizes="(max-width: 1024px) 100vw, 680px"
                  width={activeImage.width || 1024}
                  height={activeImage.height || 764}
                  alt={activeImage.alt}
                  className="w-full h-full object-cover"
                />

                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                      isAvailable
                        ? 'bg-status-availableBg text-status-availableText border-status-availableBorder'
                        : 'bg-status-comingBg text-status-comingText border-status-comingBorder'
                    }`}
                  >
                    {!isVerified
                      ? `Minh họa · ${
                          isAvailable ? 'Đang trống' : room.availableFromLabel
                        }`
                      : isAvailable
                      ? 'Đang trống'
                      : room.availableFromLabel}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {activeImage.isIllustrative && (
                      <span className="px-2.5 py-1 rounded text-xs font-medium bg-canvas-pure/95 text-ink-secondary border border-line">
                        Ảnh minh họa
                      </span>
                    )}
                    <span className="p-1.5 rounded bg-canvas-pure/95 text-ink border border-line">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {activeImage.caption && (
                  <div className="absolute bottom-0 inset-x-0 px-4 py-2 bg-canvas-pure/95 border-t border-line text-xs text-ink-secondary flex items-center justify-between gap-2">
                    <span className="truncate">{activeImage.caption}</span>
                    <span className="tabular-nums font-medium shrink-0">
                      Ảnh {selectedImgIdx + 1}/{images.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Album Thumbnails */}
              {images.length > 1 && (
                <div
                  className="flex items-center gap-2.5 overflow-x-auto pb-1"
                  role="region"
                  aria-label="Album ảnh phòng"
                >
                  {images.map((img, i) => (
                    <button
                      key={img.url + i}
                      type="button"
                      onClick={() => setSelectedImgIdx(i)}
                      aria-label={`Xem ảnh ${i + 1}: ${img.alt}`}
                      className={`relative w-24 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-opacity ${
                        i === selectedImgIdx
                          ? 'border-brand-600 opacity-100'
                          : 'border-line opacity-70 hover:opacity-100'
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

            {/* Room Description */}
            <div className="bg-canvas-pure rounded-section border border-line p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Mô tả chi tiết căn hộ {room.roomCode}
                </h2>
                <p className="mt-2 text-sm sm:text-[15px] text-ink-secondary leading-relaxed">
                  {room.detailedDescription}
                </p>
              </div>

              {/* Key Specifications Grid */}
              <div className="pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-ink-muted block">Diện tích</span>
                  <strong className="text-ink font-semibold tabular-nums mt-0.5 block">
                    {room.area}m²
                  </strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Loại hình</span>
                  <strong className="text-ink font-semibold mt-0.5 block">
                    {room.roomType}
                  </strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Mức nội thất</span>
                  <strong className="text-ink font-semibold mt-0.5 block">
                    {room.furnishedLabel}
                  </strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Số người ở tối đa</span>
                  <strong className="text-ink font-semibold mt-0.5 block">
                    {room.maxOccupants}
                  </strong>
                </div>
              </div>

              {/* Furnishings Checklist */}
              <div className="pt-4 border-t border-line">
                <h3 className="text-base font-bold text-ink">
                  Danh mục nội thất &amp; trang bị trong phòng
                </h3>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {room.amenities.map((am) => (
                    <div
                      key={am}
                      className="flex items-center gap-2 text-xs sm:text-sm text-ink-secondary bg-canvas px-3 py-2 rounded-lg border border-line"
                    >
                      <Check className="w-4 h-4 text-brand-600 shrink-0" />
                      <span>{am}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Service Fees */}
              <div className="pt-4 border-t border-line">
                <h3 className="text-base font-bold text-ink">
                  Biểu phí điện, nước &amp; dịch vụ
                </h3>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div className="p-3 rounded-lg bg-canvas border border-line">
                    <dt className="font-semibold text-ink">Điện sinh hoạt</dt>
                    <dd className="text-ink-secondary mt-0.5">
                      {room.serviceFees.electricity}
                    </dd>
                  </div>
                  <div className="p-3 rounded-lg bg-canvas border border-line">
                    <dt className="font-semibold text-ink">Nước sinh hoạt</dt>
                    <dd className="text-ink-secondary mt-0.5">
                      {room.serviceFees.water}
                    </dd>
                  </div>
                  <div className="p-3 rounded-lg bg-canvas border border-line">
                    <dt className="font-semibold text-ink">Internet / Wifi</dt>
                    <dd className="text-ink-secondary mt-0.5">
                      {room.serviceFees.wifi}
                    </dd>
                  </div>
                  <div className="p-3 rounded-lg bg-canvas border border-line">
                    <dt className="font-semibold text-ink">Chỗ để xe</dt>
                    <dd className="text-ink-secondary mt-0.5">
                      {room.serviceFees.parking}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Sticky Summary & Lead CTA Card */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <div className="bg-canvas-pure rounded-section border border-line p-5 sm:p-6 shadow-card space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                    Mã phòng {room.roomCode}
                  </span>
                  <span className="text-xs text-ink-secondary">
                    {room.buildingName} · {room.floorName}
                  </span>
                </div>

                <h1 className="mt-1.5 text-xl sm:text-2xl font-bold text-ink leading-snug">
                  {room.title}
                </h1>

                <p className="mt-2 text-xs sm:text-sm text-ink-secondary flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>
                    {room.buildingName} ({room.floorName}),{' '}
                    {room.buildingAddress}
                  </span>
                </p>
              </div>

              {/* Price & Availability Summary Box */}
              <div className="p-4 rounded-card bg-canvas border border-line space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs sm:text-sm text-ink-secondary">
                    Giá thuê niêm yết
                  </span>
                  <div>
                    <span className="text-2xl font-bold text-ink tabular-nums">
                      {formatVndPrice(room.price)}
                    </span>
                    <span className="text-xs text-ink-secondary"> / tháng</span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-line flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-ink-secondary">Tiền đặt cọc</span>
                  <strong className="text-ink font-semibold">
                    {room.depositMonths} tháng tiền phòng
                  </strong>
                </div>

                <div className="pt-2.5 border-t border-line flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-ink-secondary flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-600" />
                    <span>Thời điểm khả dụng</span>
                  </span>
                  <strong className="text-ink font-semibold tabular-nums">
                    {isAvailable
                      ? `Sẵn sàng vào ở (${formattedAvailableDate})`
                      : `Dự kiến sau ${formattedAvailableDate}`}
                  </strong>
                </div>
              </div>

              {/* Primary Contact / Booking CTA */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => onInquireRoom(room)}
                  className="w-full py-3.5 px-5 rounded-lg text-sm sm:text-base font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                >
                  {isAvailable
                    ? `Đăng ký hẹn xem phòng ${room.roomCode}`
                    : `Nhận thông báo khi có phòng ${room.roomCode}`}
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="w-full py-2.5 px-4 rounded-lg text-xs sm:text-sm font-medium text-ink bg-canvas hover:bg-canvas-warm border border-line transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4 text-brand-600" />
                  <span>
                    {copiedUrl
                      ? 'Đã sao chép đường dẫn chia sẻ!'
                      : `Sao chép đường dẫn /phong/${room.slug}`}
                  </span>
                </button>
              </div>

              <p className="text-xs text-ink-secondary leading-relaxed border-t border-line pt-4">
                {isAvailable
                  ? 'Bộ phận quản lý tại Khu đô thị Ân Phú sẽ liên hệ xác nhận khung giờ xem phòng trực tiếp theo lịch hẹn của bạn.'
                  : 'Thời điểm trống thực tế phụ thuộc lịch bàn giao của hợp đồng hiện tại. Chúng tôi sẽ báo ngay khi phòng sẵn sàng mở xem.'}
              </p>
            </div>
          </div>
        </div>

        {/* Related Available Rooms */}
        {relatedRooms.length > 0 && (
          <div className="mt-14 pt-10 border-t border-line">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-ink">
                Các căn hộ đang trống khác tại Khu đô thị Ân Phú
              </h2>
              <button
                type="button"
                onClick={onBackCatalog}
                className="text-xs sm:text-sm font-semibold text-brand-700 hover:underline shrink-0"
              >
                Xem tất cả phòng →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedRooms.map((rel) => (
                <RoomCard
                  key={rel.id}
                  room={rel}
                  sourceVerified={sourceVerified && dataMode === 'LIVE'}
                  onSelect={(r) => onNavigateRoom(r)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Album Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Album ảnh ${room.shortTitle}`}
            className="fixed inset-0 z-50 bg-ink/85 flex items-center justify-center p-3 sm:p-6"
            onClick={() => setLightboxOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-canvas-pure rounded-section max-w-4xl w-full overflow-hidden border border-line shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative bg-ink aspect-[16/10] flex items-center justify-center">
                <img
                  src={activeImage.url}
                  alt={activeImage.alt}
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Đóng xem ảnh"
                  className="absolute top-3 right-3 p-2.5 rounded-lg bg-canvas-pure/95 text-ink"
                >
                  <X className="w-5 h-5" />
                </button>
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImgIdx(
                          (selectedImgIdx - 1 + images.length) % images.length
                        )
                      }
                      aria-label="Ảnh trước"
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-canvas-pure/95 text-ink"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImgIdx((selectedImgIdx + 1) % images.length)
                      }
                      aria-label="Ảnh tiếp theo"
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-canvas-pure/95 text-ink"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-ink">
                    {activeImage.caption || activeImage.alt}
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    {room.shortTitle} · Ảnh {selectedImgIdx + 1}/{images.length}
                  </p>
                </div>
                {activeImage.isIllustrative && (
                  <span className="px-2.5 py-1 rounded text-xs bg-canvas-warm text-ink-secondary border border-line shrink-0">
                    Ảnh minh họa
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
};
