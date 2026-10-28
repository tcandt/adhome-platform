import React from 'react';
import {
  MapPin,
  CheckCircle2,
  ArrowRight,
  CalendarClock,
  Sparkles,
  Home,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { PortfolioAvailabilitySummary, RoomListing } from '../types/room';
import { formatVndCompact, formatVndPrice } from '../services/roomService';

interface HeroSectionProps {
  summary: PortfolioAvailabilitySummary;
  featuredRoom?: RoomListing;
  onSelectRoom: (room: RoomListing) => void;
  onOpenInquiry: (room?: RoomListing) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  summary,
  featuredRoom,
  onSelectRoom,
  onOpenInquiry,
}) => {
  return (
    <section
      id="trang-chu"
      className="relative bg-canvas pt-6 sm:pt-10 pb-12 sm:pb-16 border-b border-line"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Editorial Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Authentic Rental Value Proposition */}
          <div className="lg:col-span-6 lg:pt-2">
            {/* Location & Live Status Pill */}
            <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-md bg-canvas-pure border border-line text-xs font-medium text-ink-secondary mb-5 shadow-subtle">
              <span className="inline-flex items-center gap-1.5 text-status-availableText font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-600" />
                Đang mở thuê trực tiếp
              </span>
              <span className="text-line-strong">·</span>
              <span className="inline-flex items-center gap-1 text-ink">
                <MapPin className="w-3.5 h-3.5 text-brand-600" />
                Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-ink tracking-tight leading-[1.18]">
              Căn hộ dịch vụ &amp; Studio full nội thất tại{' '}
              <span className="text-brand-800">Khu đô thị Ân Phú</span>
            </h1>

            <p className="mt-4 text-base sm:text-lg text-ink-secondary leading-relaxed">
              Không gian sống sạch sẽ, yên tĩnh và riêng tư tại Phường Tân An,
              Đắk Lắk. Toàn bộ phòng được trang bị sẵn giường nệm, máy lạnh, tủ
              lạnh, bếp nấu và bàn làm việc đồng bộ —{' '}
              <strong className="font-semibold text-ink">
                chỉ cần xách vali vào ở ngay.
              </strong>
            </p>

            {/* Practical Checklist for Tenants */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-ink-secondary">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  Đa dạng loại phòng: <strong>Studio, 1PN, 2PN Mini</strong>{' '}
                  (28m² – 45m²)
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  Nội thất gỗ sồi sáng màu mới 100%, bếp &amp; WC khép kín
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  Khóa vân tay ra vào tự do 24/7, nhà xe tầng trệt an ninh
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  Tình trạng phòng &amp; giá thuê cập nhật minh bạch từ hệ thống
                  AdHome
                </span>
              </div>
            </div>

            {/* Primary CTA Group */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <a
                href="#phong-dang-trong"
                className="px-6 py-3.5 rounded-lg text-sm sm:text-base font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center justify-center gap-2 shadow-subtle"
              >
                <span>Xem {summary.availableCount} phòng đang trống</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="#phong-sap-co"
                className="px-5 py-3.5 rounded-lg text-sm sm:text-base font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line transition-colors inline-flex items-center justify-center gap-2"
              >
                <CalendarClock className="w-4 h-4 text-amber-700" />
                <span>Phòng sắp có ({summary.comingSoonCount})</span>
              </a>
            </div>

            {/* Tenant Audience Note */}
            <div className="mt-6 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
              <span>
                Phù hợp: Nhân viên văn phòng, bác sĩ, giảng viên, sinh viên
                &amp; gia đình trẻ ở dài hạn.
              </span>
              <button
                type="button"
                onClick={() => onOpenInquiry()}
                className="text-brand-700 font-semibold hover:underline"
              >
                Cần tư vấn chọn phòng nhanh? →
              </button>
            </div>
          </div>

          {/* Right Column: Real-Estate Photo Composition */}
          <div className="lg:col-span-6">
            <div className="bg-canvas-pure p-3 sm:p-4 rounded-section border border-line shadow-card">
              {/* Primary Hero Photograph */}
              <div className="relative rounded-card overflow-hidden bg-canvas-warm aspect-[16/10]">
                <img
                  src="/images/rooms/hero-studio-balcony.png"
                  alt="Phòng Studio ban công full nội thất tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-status-availableBg text-status-availableText border border-status-availableBorder shadow-subtle">
                    ● Đang trống — Vào ở ngay
                  </span>
                  <span className="px-2.5 py-1 rounded text-xs font-medium bg-canvas-pure/95 text-ink border border-line">
                    Tòa LK01-31 · KĐT Ân Phú
                  </span>
                </div>
              </div>

              {/* Caption & Direct Room Action under Hero Photo */}
              {featuredRoom && (
                <div className="mt-3.5 pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span className="font-semibold text-ink">
                        {featuredRoom.roomCode}
                      </span>
                      <span>·</span>
                      <span>{featuredRoom.roomType}</span>
                      <span>·</span>
                      <span className="tabular-nums">{featuredRoom.area}m²</span>
                      <span>·</span>
                      <span>{featuredRoom.floorName}</span>
                    </div>
                    <p className="text-sm font-semibold text-ink mt-0.5">
                      {featuredRoom.title}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-base font-bold text-brand-800 tabular-nums">
                        {formatVndPrice(featuredRoom.price)}
                      </span>
                      <span className="text-xs text-ink-muted block">
                        / tháng · Full nội thất
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectRoom(featuredRoom)}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm hover:bg-canvas-muted border border-line transition-colors"
                    >
                      Xem phòng này
                    </button>
                  </div>
                </div>
              )}

              {/* Secondary Thumbnail Strip */}
              <div className="mt-3 pt-3 border-t border-line grid grid-cols-3 gap-2.5">
                <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-canvas-warm/70 border border-line/70">
                  <img
                    src="/images/rooms/one-bedroom-living-01.png"
                    alt="Căn hộ 1 phòng ngủ vách lam gỗ"
                    className="w-12 h-10 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">
                      Căn 1PN 36m²
                    </p>
                    <p className="text-[11px] text-ink-muted truncate">
                      Có sofa &amp; vách ngăn
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-canvas-warm/70 border border-line/70">
                  <img
                    src="/images/rooms/kitchen-corner-detail.png"
                    alt="Góc bếp từ và tủ lạnh riêng"
                    className="w-12 h-10 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">
                      Bếp &amp; Tủ lạnh
                    </p>
                    <p className="text-[11px] text-ink-muted truncate">
                      Trang bị sẵn 100%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-canvas-warm/70 border border-line/70">
                  <img
                    src="/images/rooms/building-exterior-anphu.png"
                    alt="Tòa nhà căn hộ dịch vụ Khu đô thị Ân Phú"
                    className="w-12 h-10 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">
                      KĐT Ân Phú
                    </p>
                    <p className="text-[11px] text-ink-muted truncate">
                      Tân An, Đắk Lắk
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Availability Summary Bar (Required Deliverable) */}
        <div className="mt-10 bg-canvas-pure rounded-section border border-line shadow-subtle overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {/* Metric 1: Available Rooms */}
            <a
              href="#phong-dang-trong"
              className="p-5 hover:bg-canvas-warm/60 transition-colors flex items-start justify-between gap-3 group"
            >
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-status-availableText">
                  <span className="w-2 h-2 rounded-full bg-green-600" />
                  Phòng đang trống
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-ink tabular-nums">
                  {summary.availableCount} phòng
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-ink-secondary">
                  Đã vệ sinh sạch — Dọn vào ở ngay →
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-status-availableBg border border-status-availableBorder flex items-center justify-center text-status-availableText shrink-0">
                <Home className="w-5 h-5" />
              </div>
            </a>

            {/* Metric 2: Coming Soon Rooms */}
            <a
              href="#phong-sap-co"
              className="p-5 hover:bg-canvas-warm/60 transition-colors flex items-start justify-between gap-3 group"
            >
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-status-comingText">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  Phòng sắp trống
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-ink tabular-nums">
                  {summary.comingSoonCount} phòng
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-ink-secondary">
                  Dự kiến có phòng tháng 11 · Nhận giữ chỗ →
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-status-comingBg border border-status-comingBorder flex items-center justify-center text-status-comingText shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
            </a>

            {/* Metric 3: Price Range & Area */}
            <div className="p-5 flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Mức giá &amp; Diện tích
                </span>
                <p className="mt-1.5 text-xl sm:text-2xl font-bold text-ink tabular-nums">
                  {formatVndCompact(summary.minPrice)} –{' '}
                  {formatVndCompact(summary.maxPrice)}
                  <span className="text-sm font-normal text-ink-muted">
                    /tháng
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Diện tích {summary.areaRange} · Full nội thất
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-brand-700 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>

            {/* Metric 4: Location & System Sync */}
            <a
              href="#vi-tri-khu-vuc"
              className="p-5 hover:bg-canvas-warm/60 transition-colors flex items-start justify-between gap-3 group"
            >
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Vị trí khu căn hộ
                </span>
                <p className="mt-1.5 text-lg sm:text-xl font-bold text-ink">
                  Khu đô thị Ân Phú
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-ink-secondary">
                  P. Tân An, Đắk Lắk · 4 tòa (LK01 &amp; LK08)
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-brand-700 shrink-0">
                <Building className="w-5 h-5" />
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
