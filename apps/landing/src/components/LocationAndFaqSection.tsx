import React, { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface LocationAndFaqSectionProps {
  onOpenInquiry: () => void;
}

const FAQ_ITEMS = [
  {
    question: 'Phòng cho thuê đã bao gồm những nội thất gì?',
    answer:
      'Các căn hộ Studio, 1PN và 2PN mini được trang bị giường, nệm, tủ quần áo, bàn làm việc, máy lạnh, tủ lạnh, khu bếp nấu và bình nóng lạnh. Danh mục chi tiết từng phòng được hiển thị trong phần Xem chi tiết và ghi nhận tại biên bản bàn giao khi ký hợp đồng.',
  },
  {
    question: 'Chi phí điện, nước và dịch vụ hàng tháng được tính như thế nào?',
    answer:
      'Tiền điện và nước sinh hoạt được tính theo chỉ số đồng hồ riêng của từng phòng theo biểu phí niêm yết tại tòa nhà. Hệ thống hỗ trợ sẵn kết nối Internet Wifi theo tầng và khu vực để xe máy tại tầng trệt.',
  },
  {
    question: 'Làm sao để hẹn lịch xem phòng thực tế tại Khu đô thị Ân Phú?',
    answer:
      'Bạn có thể nhấn vào nút "Xem chi tiết" trên phòng đang quan tâm rồi chọn "Đăng ký xem phòng", hoặc bấm "Liên hệ tư vấn" để để lại số điện thoại và khung giờ thuận tiện. Quản lý khu căn hộ tại Phường Tân An sẽ liên hệ xác nhận lịch hẹn.',
  },
  {
    question: 'Thông tin "Phòng dự kiến sắp có" có chắc chắn trống đúng ngày đó không?',
    answer:
      'Ngày hiển thị ở mục Phòng sắp có là thời điểm dự kiến dựa trên thời hạn hợp đồng hiện tại hoặc lịch bảo dưỡng. Khi bạn đăng ký "Nhận thông báo khi có phòng", chúng tôi sẽ thông báo ngay khi phòng được xác nhận bàn giao thực tế.',
  },
  {
    question: 'Thời hạn hợp đồng thuê và tiền đặt cọc quy định ra sao?',
    answer:
      'Hệ thống ưu tiên khách thuê ở dài hạn (thông thường từ 6 tháng đến 12 tháng) với mức đặt cọc tiêu chuẩn 01 tháng tiền phòng và hỗ trợ thủ tục khai báo tạm trú theo quy định.',
  },
];

export const LocationAndFaqSection: React.FC<LocationAndFaqSectionProps> = ({
  onOpenInquiry,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const distances = [
    { place: 'Trục đường Hà Huy Tập & trung tâm Phường Tân An', time: '2 – 3 phút' },
    { place: 'Đại học Buôn Ma Thuột & Khu hành chính mới', time: '4 – 6 phút' },
    { place: 'Siêu thị Go! / Co.opmart & Chợ Tân An', time: '5 – 7 phút' },
    { place: 'Bệnh viện Đa khoa Vùng Tây Nguyên', time: '8 – 10 phút' },
  ];

  return (
    <section
      id="lien-he"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left Column (5 cols): Location & Direct Contact */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Vị trí khu căn hộ</span>
              </p>
              <h2 className="mt-2 text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.26]">
                Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
              </h2>
              <p className="mt-3 text-[15px] sm:text-base text-ink-secondary leading-relaxed">
                Khu căn hộ nằm trên các trục đường nội khu yên tĩnh thuộc Khu đô
                thị Ân Phú (gần đường Hà Huy Tập), thuận tiện di chuyển vào trung
                tâm TP. Buôn Ma Thuột và các khu vực lân cận tại Phường Tân An.
              </p>
            </div>

            <div className="bg-canvas-pure rounded-card border border-line p-5">
              <h3 className="text-sm font-semibold text-ink">
                Kết nối di chuyển từ Khu đô thị Ân Phú
              </h3>
              <dl className="mt-3 divide-y divide-line text-sm">
                {distances.map((d) => (
                  <div
                    key={d.place}
                    className="py-2.5 flex items-center justify-between gap-4"
                  >
                    <dt className="text-ink-secondary">{d.place}</dt>
                    <dd className="font-medium text-ink shrink-0 tabular-nums">
                      {d.time}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Khu+do+thi+An+Phu+Tan+An+Dak+Lak"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs sm:text-sm font-semibold text-brand-700 hover:underline"
                >
                  Xem vị trí Khu đô thị Ân Phú trên Google Maps →
                </a>
                <button
                  type="button"
                  onClick={onOpenInquiry}
                  className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                >
                  Đặt lịch xem phòng
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): FAQ Accordion */}
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Thông tin cần biết
            </p>
            <h2 className="mt-2 text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.2]">
              Câu hỏi thường gặp
            </h2>

            <div className="mt-6 space-y-3">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div
                    key={item.question}
                    className="bg-canvas-pure rounded-card border border-line overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-canvas transition-colors"
                    >
                      <span className="text-[15px] sm:text-base font-semibold text-ink">
                        {item.question}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-brand-600' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 pt-1 text-sm text-ink-secondary leading-relaxed border-t border-line/60">
                            {item.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
