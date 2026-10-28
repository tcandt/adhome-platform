import React from 'react';
import {
  Briefcase,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
  MapPin,
  BedDouble,
  Wind,
  Refrigerator,
  Utensils,
  Droplets,
  Car,
  Laptop,
  Shirt,
  Lock,
  CheckCircle2,
} from 'lucide-react';

export const WhyChooseAndAmenitiesSection: React.FC = () => {
  const whyChooseItems = [
    {
      icon: Briefcase,
      title: 'Full nội thất đồng bộ — Chỉ xách vali vào ở',
      description:
        'Mỗi căn hộ được trang bị đầy đủ giường nệm, tủ quần áo, bàn làm việc, máy lạnh, tủ lạnh và bếp từ. Không tốn chi phí mua sắm ban đầu.',
    },
    {
      icon: MapPin,
      title: 'Khu đô thị Ân Phú quy hoạch sạch, yên tĩnh',
      description:
        'Nằm tại Phường Tân An, Đắk Lắk với hạ tầng đường nhựa rộng 16m, nhiều cây xanh, không ngập nước, dân cư văn minh và thuận tiện đi làm hàng ngày.',
    },
    {
      icon: Lock,
      title: 'Không gian riêng tư, khóa vân tay 24/7',
      description:
        'Giờ giấc ra vào hoàn toàn tự do bằng khóa cổng vân tay 2 lớp, hành lang có camera giám sát và khu để xe tầng trệt an toàn.',
    },
    {
      icon: Zap,
      title: 'Tình trạng phòng & điện nước minh bạch',
      description:
        'Giá thuê niêm yết rõ ràng trên website, công tơ điện nước riêng từng phòng cập nhật tự động, không phát sinh phụ phí mập mờ.',
    },
    {
      icon: Sparkles,
      title: 'Vệ sinh định kỳ & bảo trì nhanh chóng',
      description:
        'Khu vực chung, sảnh để xe và cầu thang được dọn vệ sinh hàng tuần. Đội ngũ kỹ thuật tại chỗ hỗ trợ xử lý sự cố điện nước nhanh.',
    },
    {
      icon: ShieldCheck,
      title: 'Hợp đồng rõ ràng, hỗ trợ đăng ký tạm trú',
      description:
        'Thủ tục thuê minh bạch, hỗ trợ hoàn thiện khai báo tạm trú trực tuyến đầy đủ cho người đi làm, công chức và sinh viên ở dài hạn.',
    },
  ];

  const interiorAmenities = [
    {
      icon: BedDouble,
      label: 'Giường gỗ sồi & Nệm 1m6',
      detail: 'Kết cấu chắc chắn, nệm êm tiêu chuẩn căn hộ dịch vụ',
    },
    {
      icon: Shirt,
      label: 'Tủ quần áo kịch trần',
      detail: 'Tủ gỗ 2–3 buồng rộng rãi cho khách ở dài hạn',
    },
    {
      icon: Wind,
      label: 'Máy lạnh Inverter tiết kiệm điện',
      detail: 'Bảo dưỡng vệ sinh định kỳ trước khi bàn giao',
    },
    {
      icon: Droplets,
      label: 'Bình nóng lạnh & Vách kính tắm',
      detail: 'Nhà vệ sinh khép kín sạch sẽ, nước mạnh ổn định',
    },
    {
      icon: Utensils,
      label: 'Khu bếp đá trắng & Hút mùi',
      detail: 'Bếp từ, bồn rửa inox và máy hút mùi hạn chế ám mùi',
    },
    {
      icon: Refrigerator,
      label: 'Tủ lạnh 2 ngăn riêng biệt',
      detail: 'Dung tích 150L – 250L tùy hạng phòng Studio / 2PN',
    },
    {
      icon: Laptop,
      label: 'Bàn làm việc & Ghế tựa',
      detail: 'Đặt cạnh cửa sổ hoặc ban công nhiều ánh sáng tự nhiên',
    },
    {
      icon: Wifi,
      label: 'Wifi Mesh riêng từng tầng',
      detail: 'Đường truyền cáp quang ổn định cho làm việc & học tập',
    },
    {
      icon: Car,
      label: 'Chỗ để xe tầng trệt rộng rãi',
      detail: 'Sàn lát gạch sạch sẽ, phân làn gọn gàng, miễn phí giữ xe',
    },
  ];

  return (
    <section
      id="tien-ich"
      className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Part 1: Section 5.5 — Vì sao nên chọn căn hộ tại AdHome */}
        <div className="max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            Trải nghiệm người thuê được đặt lên đầu
          </span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Vì sao khách thuê dài hạn chọn căn hộ dịch vụ AdHome?
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-ink-secondary leading-relaxed">
            Chúng tôi thiết kế và vận hành từng tòa nhà tại Khu đô thị Ân Phú dựa trên
            nhu cầu thực tế của người đi làm và sinh viên: chỗ ở phải sạch, đủ tiện nghi,
            yên tĩnh để nghỉ ngơi và minh bạch về chi phí hàng tháng.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {whyChooseItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.title}
                className="bg-canvas-pure p-6 rounded-card border border-line shadow-subtle flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-brand-700 mb-4">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-ink leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Part 2: Section 5.6 — Tiện ích & Nội thất bàn giao */}
        <div className="mt-14 pt-12 border-t border-line">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Intro & Transparent Fee Table */}
            <div className="lg:col-span-4 space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Danh mục bàn giao tiêu chuẩn
                </span>
                <h3 className="mt-1.5 text-xl sm:text-2xl font-bold text-ink tracking-tight">
                  Tiện ích &amp; Nội thất có sẵn trong từng phòng
                </h3>
                <p className="mt-2 text-sm text-ink-secondary leading-relaxed">
                  Tất cả nội thất được kiểm tra hoạt động tốt và ghi nhận rõ trong biên
                  bản bàn giao khi ký hợp đồng.
                </p>
              </div>

              {/* Transparent Monthly Fee Box */}
              <div className="bg-canvas-pure p-5 rounded-card border border-line shadow-subtle">
                <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-600" />
                  <span>Biểu phí dịch vụ minh bạch</span>
                </h4>
                <dl className="mt-3.5 space-y-2.5 text-xs sm:text-sm">
                  <div className="flex items-center justify-between py-1.5 border-b border-line">
                    <dt className="text-ink-secondary">Điện sinh hoạt</dt>
                    <dd className="font-semibold text-ink tabular-nums">
                      3.500đ / kWh (đồng hồ riêng)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-line">
                    <dt className="text-ink-secondary">Nước sạch</dt>
                    <dd className="font-semibold text-ink tabular-nums">
                      15.000đ / m³
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-line">
                    <dt className="text-ink-secondary">Internet Wifi từng tầng</dt>
                    <dd className="font-semibold text-status-availableText">
                      Miễn phí
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-line">
                    <dt className="text-ink-secondary">Chỗ để xe máy tầng trệt</dt>
                    <dd className="font-semibold text-status-availableText">
                      Miễn phí
                    </dd>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <dt className="text-ink-secondary">Vệ sinh hành lang &amp; rác</dt>
                    <dd className="font-semibold text-status-availableText">
                      Đã bao gồm
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Right Grid of 9 Furnishings & Amenities */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {interiorAmenities.map((amenity) => {
                const IconComp = amenity.icon;
                return (
                  <div
                    key={amenity.label}
                    className="bg-canvas-pure p-4 rounded-card border border-line flex items-start gap-3.5"
                  >
                    <div className="w-9 h-9 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-ink shrink-0 mt-0.5">
                      <IconComp className="w-4 h-4 text-brand-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-ink">
                        {amenity.label}
                      </h4>
                      <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                        {amenity.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
