import React from 'react';
import {
  Search,
  PhoneCall,
  Eye,
  BookmarkCheck,
  FileSignature,
  CalendarCheck,
} from 'lucide-react';

interface RentalProcessSectionProps {
  onOpenInquiry: () => void;
}

export const RentalProcessSection: React.FC<RentalProcessSectionProps> = ({
  onOpenInquiry,
}) => {
  const steps = [
    {
      stepNumber: '01',
      icon: Search,
      title: 'Xem phòng phù hợp',
      description:
        'Tra cứu danh sách phòng đang trống hoặc sắp trống tại Khu đô thị Ân Phú cùng mức giá, diện tích và nội thất thực tế ngay trên website.',
    },
    {
      stepNumber: '02',
      icon: PhoneCall,
      title: 'Liên hệ tư vấn',
      description:
        'Gửi yêu cầu quan tâm mã phòng hoặc liên hệ Hotline/Zalo để quản lý tòa nhà giải đáp chi tiết và xác nhận tình trạng phòng.',
    },
    {
      stepNumber: '03',
      icon: Eye,
      title: 'Hẹn xem phòng trực tiếp',
      description:
        'Đến xem trực tiếp căn hộ tại dãy LK01 & LK08 Khu đô thị Ân Phú, Phường Tân An để kiểm tra ánh sáng, nội thất và môi trường sống.',
    },
    {
      stepNumber: '04',
      icon: BookmarkCheck,
      title: 'Giữ chỗ / Đặt cọc',
      description:
        'Đặt cọc giữ phòng minh bạch có phiếu xác nhận điện tử từ hệ thống AdHome, chốt ngày dọn vào ở theo lịch cá nhân của bạn.',
    },
    {
      stepNumber: '05',
      icon: FileSignature,
      title: 'Ký hợp đồng & Nhận phòng',
      description:
        'Ký hợp đồng thuê rõ ràng, ghi nhận chỉ số điện nước ban đầu, cài vân tay ra vào tòa nhà và nhận bàn giao phòng sạch sẽ.',
    },
  ];

  return (
    <section
      id="quy-trinh-thue"
      className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-line">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Thủ tục đơn giản &amp; rõ ràng
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Quy trình thuê phòng 5 bước tại AdHome
            </h2>
            <p className="mt-2 text-sm sm:text-base text-ink-secondary max-w-2xl">
              Từ lúc xem thông tin trên website đến khi nhận chìa khóa và cài đặt vân
              tay đều được chuẩn hóa nhanh gọn, minh bạch.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenInquiry}
            className="self-start md:self-end px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center gap-2 shrink-0"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Đặt lịch xem phòng ngay</span>
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {steps.map((item) => {
            const IconComp = item.icon;
            return (
              <div
                key={item.stepNumber}
                className="bg-canvas-pure p-5 rounded-card border border-line shadow-subtle flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-canvas-warm text-brand-800 border border-line tabular-nums">
                      Bước {item.stepNumber}
                    </span>
                    <div className="w-9 h-9 rounded-lg bg-canvas-warm border border-line flex items-center justify-center text-ink-secondary">
                      <IconComp className="w-4 h-4 text-brand-700" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-ink">{item.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
