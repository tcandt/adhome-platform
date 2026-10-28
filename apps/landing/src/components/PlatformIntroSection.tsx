import React from 'react';
import {
  RefreshCw,
  FileText,
  Gauge,
  Receipt,
  ExternalLink,
  CheckCircle2,
  Building2,
  ShieldCheck,
} from 'lucide-react';

export const PlatformIntroSection: React.FC = () => {
  const platformFeatures = [
    {
      icon: RefreshCw,
      title: 'Cập nhật tình trạng phòng trống theo thời gian thực',
      description:
        'Khi một hợp đồng kết thúc hoặc có phòng hoàn tất bảo dưỡng trên Console quản lý, trạng thái phòng trống và phòng sắp có được đồng bộ lên website cho khách thuê tra cứu.',
    },
    {
      icon: FileText,
      title: 'Quản lý hợp đồng, tiền cọc & đăng ký tạm trú rõ ràng',
      description:
        'Mọi thông tin ngày nhận phòng, tiền đặt cọc, biên bản bàn giao nội thất và hồ sơ khai báo tạm trú của cư dân đều được lưu trữ chuẩn xác.',
    },
    {
      icon: Gauge,
      title: 'Đồng bộ chỉ số điện nước tự động (Hunonic)',
      description:
        'Hệ thống kết nối trực tiếp công tơ thông minh từng phòng tại 4 tòa Khu đô thị Ân Phú, giúp ghi nhận điện nước minh bạch, tránh sai sót.',
    },
    {
      icon: Receipt,
      title: 'Theo dõi kỳ hóa đơn & lịch sử thanh toán minh bạch',
      description:
        'Khách thuê nhận thông báo chi tiết tiền phòng và điện nước định kỳ hàng tháng rõ ràng từng hạng mục, đối soát thanh toán nhanh gọn.',
    },
  ];

  return (
    <section
      id="nen-tang-adhome"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Explanation of AdHome Platform */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-canvas-pure border border-line text-xs font-semibold text-brand-800 mb-3">
              <Building2 className="w-3.5 h-3.5 text-brand-600" />
              <span>Nền tảng công nghệ đứng sau hệ thống căn hộ</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight leading-snug">
              AdHome — Kết hợp dịch vụ lưu trú thực tế và hệ thống quản lý vận hành
              minh bạch
            </h2>

            <p className="mt-3 text-sm sm:text-base text-ink-secondary leading-relaxed">
              Khác với các trang đăng tin rao vặt rời rạc dễ gặp tình trạng “phòng ảo,
              giá báo một đằng thu một nẻo”, website{' '}
              <strong className="font-semibold text-ink">adhome.ductinh.one</strong>{' '}
              được vận hành gắn liền với nền tảng quản lý căn hộ dịch vụ{' '}
              <strong className="font-semibold text-ink">AdHome Console</strong>.
            </p>

            <div className="mt-6 space-y-4">
              {platformFeatures.map((feat) => {
                const IconComp = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="bg-canvas-pure p-4 rounded-card border border-line flex items-start gap-3.5"
                  >
                    <div className="w-9 h-9 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-brand-700 shrink-0 mt-0.5">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-ink">{feat.title}</h3>
                      <p className="mt-1 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                        {feat.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Clean Architectural Console Sync Preview Card */}
          <div className="lg:col-span-6">
            <div className="bg-canvas-pure rounded-section border border-line shadow-card overflow-hidden">
              {/* Mockup Header Bar */}
              <div className="bg-brand-navy text-white px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/brand/adhome-icon-white.svg"
                    alt="AdHome Console"
                    className="w-7 h-7 object-contain"
                  />
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase text-brand-200">
                      AdHome Management Console
                    </p>
                    <p className="text-sm font-bold text-white">
                      Đồng bộ danh mục Khu đô thị Ân Phú — Đắk Lắk
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-green-900/60 text-green-200 border border-green-700/60">
                  ● Trực tuyến
                </span>
              </div>

              {/* Console Sync Ledger Content */}
              <div className="p-5 sm:p-6 space-y-5">
                {/* Summary Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-canvas-warm border border-line">
                    <span className="text-[11px] text-ink-muted block">
                      Quỹ phòng vận hành
                    </span>
                    <span className="text-lg font-bold text-ink tabular-nums">
                      4 tòa · 34 phòng
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-status-availableBg border border-status-availableBorder">
                    <span className="text-[11px] text-status-availableText block font-medium">
                      Đang mở thuê
                    </span>
                    <span className="text-lg font-bold text-status-availableText tabular-nums">
                      08 phòng trống
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-status-comingBg border border-status-comingBorder">
                    <span className="text-[11px] text-status-comingText block font-medium">
                      Sắp đáo hạn HĐ
                    </span>
                    <span className="text-lg font-bold text-status-comingText tabular-nums">
                      04 phòng sắp có
                    </span>
                  </div>
                </div>

                {/* Building Status Table */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-muted mb-2">
                    <span>Trạng thái đồng bộ theo tòa nhà</span>
                    <span>Công tơ Hunonic &amp; Quỹ phòng</span>
                  </div>
                  <div className="border border-line rounded-lg divide-y divide-line text-xs">
                    {[
                      {
                        code: 'Tòa LK01-31 Ân Phú',
                        addr: 'Đường Hà Huy Tập, P. Tân An',
                        avail: '2 phòng trống',
                        coming: '1 sắp có (10/11)',
                      },
                      {
                        code: 'Tòa LK01-32 Ân Phú',
                        addr: 'Đường Hà Huy Tập, P. Tân An',
                        avail: '2 phòng trống',
                        coming: '1 sắp có (18/11)',
                      },
                      {
                        code: 'Tòa LK08-24 Ân Phú',
                        addr: 'Dãy LK08, KĐT Ân Phú',
                        avail: '2 phòng trống',
                        coming: '1 sắp có (05/11)',
                      },
                      {
                        code: 'Tòa LK08-25 Ân Phú',
                        addr: 'Dãy LK08, KĐT Ân Phú',
                        avail: '2 phòng trống',
                        coming: '1 sắp có (25/11)',
                      },
                    ].map((b) => (
                      <div
                        key={b.code}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold text-ink block">
                            {b.code}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {b.addr}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-status-availableBg text-status-availableText border border-status-availableBorder font-semibold tabular-nums">
                            {b.avail}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-status-comingBg text-status-comingText border border-status-comingBorder font-medium tabular-nums">
                            {b.coming}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Data Architecture Note & Link for Operators */}
                <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-ink-secondary">
                    <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
                    <span>
                      Dữ liệu phòng, hình ảnh và giá thuê được chuẩn hóa từ hệ thống
                      quản lý.
                    </span>
                  </div>
                  <a
                    href="https://console-adhome.ductinh.one"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  >
                    <span>Truy cập Console Quản lý</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
