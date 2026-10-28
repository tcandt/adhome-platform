import React from 'react';
import {
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  CalendarCheck,
} from 'lucide-react';

interface FooterProps {
  availableCount: number;
  comingSoonCount: number;
  onOpenInquiry: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  availableCount,
  comingSoonCount,
  onOpenInquiry,
}) => {
  return (
    <footer className="bg-brand-navy text-white pb-20 sm:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10 pb-10 border-b border-white/15">
          {/* Column 1: Brand & Positioning */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/brand/adhome-icon-white.svg"
                alt="AdHome Logo"
                className="w-10 h-10 object-contain"
              />
              <div>
                <span className="text-xl font-bold tracking-tight text-white block">
                  AdHome
                </span>
                <span className="text-xs text-brand-200">
                  Nền tảng Quản lý &amp; Cho thuê Căn hộ Dịch vụ
                </span>
              </div>
            </div>

            <p className="text-sm text-white/80 leading-relaxed max-w-md">
              Hệ thống căn hộ dịch vụ Studio, 1 phòng ngủ và 2 phòng ngủ mini full
              nội thất tại{' '}
              <strong className="text-white font-semibold">
                Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
              </strong>
              . Tình trạng phòng trống, lịch phòng sắp có và biểu phí dịch vụ được
              đồng bộ minh bạch từ hệ thống quản lý vận hành AdHome.
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded bg-white/10 text-green-300 font-medium">
                ● {availableCount} phòng đang trống
              </span>
              <span className="px-2.5 py-1 rounded bg-white/10 text-amber-200 font-medium">
                ● {comingSoonCount} phòng sắp trống
              </span>
            </div>
          </div>

          {/* Column 2: Quick Navigation */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-200">
              Danh mục thông tin
            </h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li>
                <a href="#phong-dang-trong" className="hover:text-white transition-colors">
                  Phòng đang trống ({availableCount})
                </a>
              </li>
              <li>
                <a href="#phong-sap-co" className="hover:text-white transition-colors">
                  Phòng sắp có ({comingSoonCount})
                </a>
              </li>
              <li>
                <a href="#tien-ich" className="hover:text-white transition-colors">
                  Tiện ích &amp; Nội thất bàn giao
                </a>
              </li>
              <li>
                <a href="#bo-suu-tap" className="hover:text-white transition-colors">
                  Bộ sưu tập hình ảnh thực tế
                </a>
              </li>
              <li>
                <a href="#quy-trinh-thue" className="hover:text-white transition-colors">
                  Quy trình thuê 5 bước
                </a>
              </li>
              <li>
                <a href="#nen-tang-adhome" className="hover:text-white transition-colors">
                  Giới thiệu nền tảng AdHome
                </a>
              </li>
              <li>
                <a href="#cau-hoi-thuong-gap" className="hover:text-white transition-colors">
                  Câu hỏi thường gặp (FAQ)
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Location & Contact */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-200">
              Khu vực hoạt động &amp; Liên hệ
            </h3>
            <div className="space-y-2.5 text-sm text-white/85">
              <p className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-brand-200 shrink-0 mt-1" />
                <span>
                  Dãy LK01 (Tòa 31, 32) &amp; Dãy LK08 (Tòa 24, 25), Khu đô thị Ân
                  Phú, Đường Hà Huy Tập, Phường Tân An, Đắk Lắk
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-brand-200 shrink-0" />
                <a href="tel:0905889123" className="hover:text-white font-semibold">
                  0905 889 123 (Hotline / Zalo tư vấn thuê phòng)
                </a>
              </p>
              <p className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-brand-200 shrink-0" />
                <a href="mailto:lienhe@adhome.ductinh.one" className="hover:text-white">
                  lienhe@adhome.ductinh.one
                </a>
              </p>
            </div>

            <div className="pt-3 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenInquiry}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-brand-navy bg-white hover:bg-brand-50 transition-colors inline-flex items-center gap-1.5"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Đăng ký hẹn xem phòng</span>
              </button>
              <a
                href="https://console-adhome.ductinh.one"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2.5 rounded-lg text-xs font-medium text-white/90 hover:text-white border border-white/20 hover:border-white/40 transition-colors inline-flex items-center gap-1.5"
              >
                <span>AdHome Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} AdHome Platform (adhome.ductinh.one). Hệ thống
            quản lý và cho thuê căn hộ dịch vụ Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.
          </p>
          <div className="flex items-center gap-4">
            <span>Đồng bộ dữ liệu từ Console V2</span>
            <span>·</span>
            <a
              href="https://console-adhome.ductinh.one"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white underline"
            >
              Dành cho Quản lý
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
