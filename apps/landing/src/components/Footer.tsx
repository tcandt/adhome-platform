import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

interface FooterProps {
  onNavigate: (path: string, hash?: string) => void;
  onOpenInquiry: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigate,
  onOpenInquiry,
}) => {
  const handleLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
    hash?: string
  ) => {
    e.preventDefault();
    onNavigate(path, hash);
  };

  return (
    <footer className="bg-brand-navy text-white pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-white/15">
          {/* Column 1: Brand & Positioning */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/brand/adhome-icon-white.svg"
                alt="AdHome"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
              />
              <div>
                <span className="text-lg font-bold tracking-tight text-white block leading-none">
                  AdHome
                </span>
                <span className="text-xs text-white/75 mt-1 block">
                  Căn hộ dịch vụ Khu đô thị Ân Phú
                </span>
              </div>
            </div>

            <p className="text-sm text-white/80 leading-relaxed max-w-md pt-1">
              Hệ thống quản lý và giới thiệu căn hộ dịch vụ Studio, 1 phòng ngủ
              và 2 phòng ngủ mini full nội thất tại Khu đô thị Ân Phú, Phường
              Tân An, Đắk Lắk.
            </p>
          </div>

          {/* Column 2: Navigation */}
          <div className="md:col-span-3 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Điều hướng
            </h3>
            <ul className="space-y-2 text-sm text-white/85">
              <li>
                <a
                  href="/"
                  onClick={(e) => handleLink(e, '/', '#trang-chu')}
                  className="hover:text-white transition-colors"
                >
                  Trang chủ
                </a>
              </li>
              <li>
                <a
                  href="/phong-trong"
                  onClick={(e) => handleLink(e, '/phong-trong')}
                  className="hover:text-white transition-colors"
                >
                  Tất cả phòng cho thuê
                </a>
              </li>
              <li>
                <a
                  href="/#phong-sap-co"
                  onClick={(e) => handleLink(e, '/', '#phong-sap-co')}
                  className="hover:text-white transition-colors"
                >
                  Phòng dự kiến sắp có
                </a>
              </li>
              <li>
                <a
                  href="/#khong-gian-song"
                  onClick={(e) => handleLink(e, '/', '#khong-gian-song')}
                  className="hover:text-white transition-colors"
                >
                  Không gian sống &amp; tiện nghi
                </a>
              </li>
              <li>
                <a
                  href="/#ve-adhome"
                  onClick={(e) => handleLink(e, '/', '#ve-adhome')}
                  className="hover:text-white transition-colors"
                >
                  Về nền tảng AdHome
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Location & Inquiry Action */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Khu vực &amp; Liên hệ
            </h3>
            <p className="text-sm text-white/85 flex items-start gap-2 leading-relaxed">
              <MapPin className="w-4 h-4 text-white/70 shrink-0 mt-1" />
              <span>Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk</span>
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenInquiry}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-ink bg-white hover:bg-canvas transition-colors min-h-[40px]"
              >
                Liên hệ tư vấn thuê phòng
              </button>
              <a
                href="https://console-adhome.vn"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2.5 rounded-lg text-xs font-medium text-white/85 hover:text-white border border-white/25 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <span>AdHome Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/70">
          <p>
            © {new Date().getFullYear()} AdHome (adhome.vn) — Khu đô
            thị Ân Phú, Phường Tân An, Đắk Lắk.
          </p>
          <p>Một số hình ảnh trên trang là ảnh minh họa không gian mẫu.</p>
        </div>
      </div>
    </footer>
  );
};
