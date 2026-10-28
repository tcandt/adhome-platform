import React from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onOpenInquiry: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenInquiry }) => {
  return (
    <section
      id="trang-chu"
      className="bg-canvas pt-5 sm:pt-12 pb-8 sm:pb-16 border-b border-line"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left Editorial Column (6 cols on desktop so title is strictly 2–3 lines) */}
          <div className="lg:col-span-6">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand-700">
              Khu đô thị Ân Phú · Phường Tân An, Đắk Lắk
            </p>

            <h1 className="mt-2.5 text-[30px] sm:text-[38px] lg:text-[44px] font-bold text-ink tracking-[-0.02em] leading-[1.16]">
              Căn hộ dịch vụ full nội thất tại{' '}
              <span className="whitespace-nowrap">Khu đô thị Ân Phú</span>
            </h1>

            <p className="mt-3 sm:mt-4 text-[15px] sm:text-base text-ink-secondary leading-relaxed max-w-xl">
              Không gian sống yên tĩnh, sạch sẽ với các lựa chọn phòng Studio, 1
              phòng ngủ và 2 phòng ngủ mini trang bị sẵn nội thất đồng bộ tại
              Phường Tân An, Đắk Lắk.
            </p>

            {/* Primary & Secondary CTAs — single row on mobile & desktop */}
            <div className="mt-5 sm:mt-7 flex flex-row items-center gap-2.5 sm:gap-3">
              <a
                href="#phong-dang-trong"
                className="px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-lg text-[13px] sm:text-base font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center gap-1.5 sm:gap-2 shrink-0"
              >
                <span>Xem phòng đang trống</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={onOpenInquiry}
                className="px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-lg text-[13px] sm:text-base font-medium text-ink bg-canvas-pure hover:bg-canvas-warm border border-line transition-colors shrink-0"
              >
                Liên hệ tư vấn
              </button>
            </div>

            {/* Single Calm Metadata Line */}
            <div className="mt-5 sm:mt-7 pt-4 sm:pt-5 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-ink-muted">
              <span>
                Loại phòng:{' '}
                <strong className="text-ink font-medium">
                  Studio · 1PN · 2PN
                </strong>
              </span>
              <span className="text-line-strong">·</span>
              <span>
                Diện tích:{' '}
                <strong className="text-ink font-medium tabular-nums">
                  28m² – 45m²
                </strong>
              </span>
              <span className="text-line-strong">·</span>
              <span>
                Giá thuê:{' '}
                <strong className="text-ink font-medium tabular-nums">
                  Từ 4,5 triệu/tháng
                </strong>
              </span>
            </div>
          </div>

          {/* Right Large Natural Apartment Photograph (6 cols on desktop) */}
          <div className="lg:col-span-6">
            <figure className="relative rounded-section overflow-hidden border border-line bg-canvas-warm shadow-card">
              <div className="aspect-[16/10] w-full overflow-hidden">
                <img
                  src="/images/rooms/hero-studio-balcony.png"
                  alt="Không gian căn hộ dịch vụ Studio có ban công tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className="px-4 py-2.5 bg-canvas-pure border-t border-line flex items-center justify-between gap-4 text-xs text-ink-muted">
                <span className="truncate">
                  Không gian mẫu Studio ban công 32m² — Khu đô thị Ân Phú, Tân An
                </span>
                <span className="px-2 py-0.5 rounded bg-canvas-warm text-ink-secondary border border-line shrink-0">
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
