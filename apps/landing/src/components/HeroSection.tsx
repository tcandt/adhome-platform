import React from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onOpenInquiry: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenInquiry }) => {
  return (
    <section
      id="trang-chu"
      className="bg-canvas pt-2 pb-3 sm:pt-12 sm:pb-16 border-b border-line"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-7 lg:gap-12 items-center">
          {/* Left Editorial Column (6 cols on desktop so title is strictly 2–3 lines) */}
          <div className="lg:col-span-6">
            <p className="text-[11px] sm:text-sm font-semibold uppercase tracking-wider text-brand-700">
              Khu đô thị Ân Phú · Phường Tân An, Đắk Lắk
            </p>

            <h1 className="mt-0.5 sm:mt-2.5 text-[22px] sm:text-[36px] lg:text-[42px] font-bold text-ink tracking-[-0.015em] leading-[1.22] sm:leading-[1.34]">
              Căn hộ dịch vụ full nội thất tại{' '}
              <span className="whitespace-nowrap">Khu đô thị Ân Phú</span>
            </h1>

            {/* Mobile-only compact starting price & room type summary right below title */}
            <p
              data-testid="mobile-hero-price-summary"
              className="mt-1 sm:hidden text-xs font-semibold text-ink tabular-nums"
            >
              Từ <span className="text-brand-700">4,5 triệu/tháng</span> · Studio
              · 1PN · 2PN (28–45m²) — vào ở ngay.
            </p>

            {/* Full editorial subtitle on desktop */}
            <p className="hidden sm:block mt-4 text-base text-ink-secondary leading-[1.65] max-w-xl">
              Không gian sống yên tĩnh, sạch sẽ với các lựa chọn phòng Studio, 1
              phòng ngủ và 2 phòng ngủ mini trang bị sẵn nội thất đồng bộ tại
              Phường Tân An, Đắk Lắk.
            </p>

            {/* Primary CTA on mobile (+ inline text action); Primary + Secondary button on desktop */}
            <div className="mt-2 sm:mt-7 flex flex-row items-center gap-3">
              <a
                href="#phong-dang-trong"
                className="px-4 sm:px-6 py-2 sm:py-3.5 rounded-lg text-xs sm:text-base font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center gap-1.5 sm:gap-2 shrink-0 min-h-[38px] sm:min-h-[44px]"
              >
                <span>Xem phòng đang trống</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={onOpenInquiry}
                className="hidden sm:inline-flex px-5 py-3.5 rounded-lg text-base font-semibold text-ink bg-canvas-pure hover:bg-canvas-warm border border-line transition-colors shrink-0 min-h-[44px] items-center"
              >
                Liên hệ tư vấn
              </button>

              <button
                type="button"
                onClick={onOpenInquiry}
                className="sm:hidden px-2 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink underline underline-offset-4 min-h-[38px]"
              >
                Tư vấn nhanh
              </button>
            </div>

            {/* Desktop Metadata Line (Hidden on mobile to save vertical fold height) */}
            <div className="hidden sm:flex mt-7 pt-5 border-t border-line flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
              <span>
                Loại phòng:{' '}
                <strong className="text-ink font-semibold">
                  Studio · 1PN · 2PN
                </strong>
              </span>
              <span className="text-line-strong" aria-hidden="true">
                ·
              </span>
              <span>
                Diện tích:{' '}
                <strong className="text-ink font-semibold tabular-nums">
                  28m² – 45m²
                </strong>
              </span>
              <span className="text-line-strong" aria-hidden="true">
                ·
              </span>
              <span>
                Giá thuê:{' '}
                <strong className="text-ink font-semibold tabular-nums">
                  Từ 4,5 triệu/tháng
                </strong>
              </span>
            </div>
          </div>

          {/* Right Large Natural Apartment Photograph (Compact 28/10 aspect on mobile so first room card + price appear inside 390x844 viewport) */}
          <div className="lg:col-span-6">
            <figure className="relative rounded-card sm:rounded-section overflow-hidden border border-line bg-canvas-warm shadow-card">
              <div className="aspect-[28/10] sm:aspect-[16/10] w-full overflow-hidden">
                <img
                  src="/images/rooms/hero-studio-balcony.webp"
                  srcSet="/images/rooms/hero-studio-balcony-640w.webp 640w, /images/rooms/hero-studio-balcony.webp 1024w"
                  sizes="(max-width: 1023px) 94vw, 580px"
                  width={1024}
                  height={571}
                  fetchPriority="high"
                  decoding="async"
                  alt="Không gian căn hộ dịch vụ Studio có ban công tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className="px-3 sm:px-4 py-1 sm:py-2.5 bg-canvas-pure border-t border-line flex items-center justify-between gap-3 text-[11px] sm:text-xs text-ink-secondary">
                <span className="truncate">
                  Không gian mẫu Studio ban công 32m² — KĐT Ân Phú, Tân An
                </span>
                <span className="px-2 py-0.5 rounded bg-canvas-warm text-ink-secondary border border-line shrink-0 font-medium">
                  Ảnh minh họa
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
};
