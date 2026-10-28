import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  ChevronDown,
  Phone,
  Clock,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { BuildingPublicSummary } from '../types/room';

interface LocationAndFaqSectionProps {
  buildings: BuildingPublicSummary[];
  onOpenInquiry: () => void;
}

const FAQ_ITEMS = [
  {
    question: 'Phòng tại AdHome có full nội thất không? Bao gồm những gì?',
    answer:
      '100% căn hộ tại 4 tòa thuộc Khu đô thị Ân Phú đều được bàn giao full nội thất đồng bộ. Cụ thể gồm: giường gỗ sồi + nệm 1m6, tủ quần áo lớn, bàn làm việc + ghế, máy lạnh Inverter, tủ lạnh 2 ngăn, khu bếp mặt đá kèm bếp từ & máy hút mùi, bình nóng lạnh và vách kính tắm đứng. Một số căn 1PN và 2PN có thêm sofa tiếp khách, bàn ăn 4 ghế và máy giặt riêng.',
  },
  {
    question: 'Tôi có thể dọn vào ở ngay trong ngày được không?',
    answer:
      'Hoàn toàn được đối với tất cả các phòng đang có trạng thái "Đang trống" trên website. Mọi phòng trống đều đã được vệ sinh công nghiệp sạch sẽ và kiểm tra kỹ thuật sẵn sàng. Sau khi xem phòng, ký hợp đồng và cài đặt vân tay (chỉ mất khoảng 15–20 phút), bạn có thể chuyển đồ vào ở ngay.',
  },
  {
    question: 'Giá thuê hàng tháng đã bao gồm những chi phí gì?',
    answer:
      'Giá thuê niêm yết (từ 4.500.000đ – 6.500.000đ/tháng tùy loại phòng) đã bao gồm: miễn phí Internet Wifi tốc độ cao riêng từng tầng, miễn phí chỗ để xe máy tầng trệt, phí vệ sinh hành lang hàng tuần và thu gom rác sinh hoạt. Bạn chỉ thanh toán thêm tiền điện (3.500đ/kWh) và tiền nước (15.000đ/m³) theo đúng chỉ số đồng hồ riêng của phòng.',
  },
  {
    question: 'Có hỗ trợ đặt cọc giữ chỗ trước khi chuyển vào không?',
    answer:
      'Có. Nếu bạn đã chọn được phòng ưng ý nhưng cần vài ngày đến 1–2 tuần để sắp xếp lịch chuyển nhà, AdHome hỗ trợ ký phiếu giữ chỗ có mã xác nhận điện tử trên hệ thống. Tiền cọc tiêu chuẩn khi ký hợp đồng thuê là 01 tháng tiền phòng.',
  },
  {
    question: 'Khi nào biết chính xác phòng sắp trống và làm sao để đăng ký trước?',
    answer:
      'Nhờ quản lý hợp đồng trực tiếp trên nền tảng AdHome Console, ngay khi khách thuê hiện tại xác nhận ngày kết thúc hợp đồng (thường trước 15–30 ngày), phòng đó sẽ tự động hiển thị tại mục "Phòng sắp trống" kèm ngày dự kiến bàn giao. Bạn chỉ cần bấm nút "Giữ chỗ / Nhận tin" trên thẻ phòng, bộ phận quản lý sẽ ưu tiên liên hệ bạn đầu tiên ngay khi phòng sẵn sàng.',
  },
  {
    question: 'Giờ giấc ra vào và quy định tiếp bạn bè tại tòa nhà như thế nào?',
    answer:
      'Cư dân sử dụng cổng khóa vân tay 2 lớp ra vào tự do 24/7, không giới hạn giờ giấc. Bạn bè hoặc người thân có thể đến chơi thoải mái trong khung giờ sinh hoạt, chỉ cần đảm bảo giữ yên tĩnh chung sau 22h00 và đăng ký trước với quản lý nếu có người thân ở lại qua đêm.',
  },
];

export const LocationAndFaqSection: React.FC<LocationAndFaqSectionProps> = ({
  buildings,
  onOpenInquiry,
}) => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const nearbyConnections = [
    {
      place: 'Trục đường chính Hà Huy Tập & Khu hành chính Tân An',
      time: '2 – 3 phút di chuyển',
    },
    {
      place: 'Đại học Buôn Ma Thuột / Cao đẳng FPT Polytechnic Tây Nguyên',
      time: '4 – 6 phút di chuyển',
    },
    {
      place: 'Siêu thị Go! (Big C) / Co.opmart & Chợ Tân An',
      time: '5 – 7 phút di chuyển',
    },
    {
      place: 'Bệnh viện Đa khoa Vùng Tây Nguyên / Trung tâm Ngã 6',
      time: '8 – 10 phút di chuyển',
    },
  ];

  return (
    <>
      {/* SECTION 5.10: Khu vực & Vị trí */}
      <section
        id="vi-tri-khu-vuc"
        className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Info: Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700 mb-2">
                <MapPin className="w-3.5 h-3.5" />
                <span>Vị trí đắc địa &amp; Thuận tiện sinh hoạt</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
              </h2>
              <p className="mt-3 text-sm sm:text-base text-ink-secondary leading-relaxed">
                Hệ thống căn hộ dịch vụ AdHome tọa lạc tại{' '}
                <strong className="font-semibold text-ink">
                  Dãy LK01 và Dãy LK08, Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
                </strong>
                . Đây là khu đô thị mới được quy hoạch đồng bộ bậc nhất khu vực phía
                Bắc TP. Buôn Ma Thuột với lòng đường rộng, vỉa hè cây xanh mát mẻ,
                yên tĩnh và an ninh cao.
              </p>

              {/* Nearby Connectivity List */}
              <div className="mt-6 bg-canvas-pure rounded-card border border-line p-5 shadow-subtle">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-brand-600" />
                  <span>Kết nối giao thông &amp; tiện ích xung quanh</span>
                </h3>
                <div className="mt-3.5 divide-y divide-line">
                  {nearbyConnections.map((item) => (
                    <div
                      key={item.place}
                      className="py-2.5 flex items-center justify-between gap-4 text-xs sm:text-sm"
                    >
                      <span className="text-ink-secondary">{item.place}</span>
                      <span className="font-semibold text-ink shrink-0 tabular-nums">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4 Buildings Cards */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {buildings.map((bld) => (
                  <div
                    key={bld.id}
                    className="bg-canvas-pure p-4 rounded-card border border-line"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-brand-700" />
                        {bld.name}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-status-availableBg text-status-availableText border border-status-availableBorder tabular-nums">
                        Trống {bld.availableCount}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {bld.streetAddress}, {bld.ward}
                    </p>
                    <p className="mt-2 text-xs text-ink-secondary">
                      • {bld.highlights[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Exterior Visual + Direct Viewing Card */}
            <div className="lg:col-span-6 space-y-5">
              <div className="bg-canvas-pure p-3 sm:p-4 rounded-section border border-line shadow-card">
                <div className="relative aspect-[16/10] rounded-card overflow-hidden bg-canvas-muted">
                  <img
                    src="/images/rooms/building-exterior-anphu.png"
                    alt="Toàn cảnh tòa nhà căn hộ dịch vụ AdHome tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 right-3 bg-canvas-pure/95 p-3 rounded-lg border border-line flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-ink">
                        Cụm tòa nhà AdHome — Khu đô thị Ân Phú
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        Đường Hà Huy Tập, Phường Tân An, Đắk Lắk
                      </p>
                    </div>
                    <a
                      href="https://www.google.com/maps/search/?api=1&query=Khu+do+thi+An+Phu+Tan+An+Dak+Lak"
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-md text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 shrink-0"
                    >
                      Mở bản đồ chỉ đường →
                    </a>
                  </div>
                </div>
              </div>

              {/* Direct Viewing Appointment Box */}
              <div
                id="khu-vuc-lien-he"
                className="bg-canvas-pure p-6 rounded-section border border-line shadow-subtle"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-availableText">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Hỗ trợ xem phòng trực tiếp tất cả các ngày trong tuần
                    </span>
                    <h3 className="mt-1 text-lg font-bold text-ink">
                      Hẹn lịch xem phòng thực tế tại Khu đô thị Ân Phú
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-ink-secondary">
                      Quản lý tòa nhà luôn có mặt tại khu vực Tân An để mở cửa đón bạn
                      xem phòng từ 08:00 – 20:30 hàng ngày.
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs sm:text-sm">
                    <a
                      href="tel:0905889123"
                      className="inline-flex items-center gap-1.5 font-bold text-ink hover:text-brand-700"
                    >
                      <Phone className="w-4 h-4 text-brand-600" />
                      <span>0905 889 123 (Hotline / Zalo)</span>
                    </a>
                    <span className="hidden sm:inline-flex items-center gap-1 text-ink-muted">
                      <Clock className="w-3.5 h-3.5" />
                      08:00 – 20:30 (T2 – CN)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenInquiry}
                    className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                  >
                    Gửi yêu cầu hẹn xem phòng
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5.11: FAQ */}
      <section
        id="cau-hoi-thuong-gap"
        className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Giải đáp thắc mắc thực tế
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Câu hỏi thường gặp khi thuê căn hộ tại AdHome
            </h2>
            <p className="mt-2 text-sm sm:text-base text-ink-secondary">
              Thông tin rõ ràng về nội thất, chi phí điện nước, thủ tục giữ chỗ và hợp
              đồng thuê dài hạn.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.question}
                  className="bg-canvas-pure rounded-card border border-line overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-canvas/60 transition-colors"
                  >
                    <span className="text-sm sm:text-base font-bold text-ink">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-brand-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 text-xs sm:text-sm text-ink-secondary leading-relaxed border-t border-line/60">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
};
