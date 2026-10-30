import React from 'react';
import { ExternalLink } from 'lucide-react';

export const PlatformIntroSection: React.FC = () => {
  const tenantBenefits = [
    {
      title: 'Theo dõi danh sách phòng khả dụng',
      detail:
        'Tra cứu các phòng đang mở thuê theo loại phòng, diện tích và tầng mà không cần hỏi qua nhiều kênh trung gian.',
    },
    {
      title: 'Xem thông tin nội thất & chi phí rõ ràng',
      detail:
        'Mức giá thuê hàng tháng, quy định đặt cọc và danh mục nội thất tiêu chuẩn được trình bày cụ thể cho từng mã phòng.',
    },
    {
      title: 'Đăng ký lịch hẹn xem phòng trực tiếp',
      detail:
        'Gửi yêu cầu xem phòng theo khung giờ thuận tiện để bộ phận quản lý tại Khu đô thị Ân Phú sắp xếp đón tiếp.',
    },
    {
      title: 'Nhận thông báo khi có phòng sắp trống',
      detail:
        'Để lại thông tin quan tâm đối với các hạng phòng đang có người ở để được ưu tiên liên hệ khi phòng sẵn sàng.',
    },
  ];

  return (
    <section
      id="ve-adhome"
      className="py-12 sm:py-16 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-canvas-pure rounded-section border border-line p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Intro (5 cols) */}
            <div className="lg:col-span-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                Về nền tảng AdHome
              </span>
              <h2 className="mt-2 text-xl sm:text-2xl font-bold text-ink tracking-tight leading-snug">
                Hệ thống quản lý &amp; giới thiệu căn hộ dịch vụ hướng tới sự minh bạch
              </h2>
              <p className="mt-3 text-sm sm:text-[15px] text-ink-secondary leading-relaxed">
                AdHome được xây dựng để kết nối quy trình quản lý vận hành tòa nhà
                với nhu cầu tìm chỗ ở thực tế của khách thuê tại Khu đô thị Ân Phú,
                Phường Tân An, Đắk Lắk.
              </p>

              <div className="mt-5 pt-4 border-t border-line">
                <a
                  href="https://console.adhome.vn/login"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-ink-secondary hover:text-brand-700 transition-colors"
                >
                  <span>Dành cho đơn vị vận hành: AdHome Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Right 2x2 Tenant Benefits (7 cols) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tenantBenefits.map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-card bg-canvas border border-line"
                >
                  <h3 className="text-sm font-semibold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
