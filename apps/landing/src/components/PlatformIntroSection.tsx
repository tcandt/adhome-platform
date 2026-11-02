import React from 'react';
import { ArrowUpRight, Building2, MonitorCog, Check } from 'lucide-react';

const platformBenefits = [
  { title: 'Thiết kế theo cách bạn vận hành', detail: 'Từ một nhà trọ đến nhiều tòa căn hộ, AdHome tiếp nhận quy trình thực tế để tư vấn thiết kế nền tảng phù hợp với quy mô, mô hình kinh doanh và cách làm việc của từng đơn vị.' },
  { title: 'Kết nối công việc quản lý hằng ngày', detail: 'Hướng đến một nơi làm việc thống nhất cho thông tin phòng, khách lưu trú, hợp đồng, kỳ thu tiền và công việc vận hành; giảm việc tổng hợp rời rạc giữa sổ sách và nhiều bảng tính.' },
  { title: 'Cho thuê nền tảng, đồng hành triển khai', detail: 'Chủ cơ sở có thể trao đổi nhu cầu thuê nền tảng, cấu hình ban đầu, chuyển đổi dữ liệu và hướng dẫn sử dụng. Phạm vi tính năng, lộ trình triển khai và chi phí được thống nhất theo nhu cầu thực tế.' },
  { title: 'Phát triển từ trải nghiệm vận hành thật', detail: 'Việc trực tiếp kinh doanh căn hộ dịch vụ tại Ân Phú giúp AdHome hiểu rõ những điểm chạm giữa chủ cơ sở, bộ phận quản lý và người thuê để tiếp tục hoàn thiện sản phẩm.' },
];
const livingBenefits = ['Căn hộ dịch vụ cao cấp với không gian riêng tư và nội thất đồng bộ', 'Studio, căn 1 phòng ngủ và 2 phòng ngủ mini phù hợp nhiều nhu cầu', 'Tư vấn phòng, hẹn xem trực tiếp và trao đổi rõ chi phí trước khi thuê', 'Khu đô thị Ân Phú, phường Tân An, tỉnh Đắk Lắk'];

export const PlatformIntroSection: React.FC = () => (
  <section id="ve-adhome" className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20">
    <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">Về nền tảng AdHome</span>
        <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-ink tracking-tight leading-tight">Công nghệ quản lý lưu trú.<br className="hidden sm:block" /> Trải nghiệm sống từ thực tế.</h2>
        <p className="mt-4 text-sm sm:text-base text-ink-secondary leading-relaxed">AdHome vừa là đơn vị thiết kế, phát triển và cho thuê nền tảng quản lý căn hộ dịch vụ, nhà nghỉ, khách sạn, nhà trọ và các mô hình lưu trú; vừa trực tiếp kinh doanh căn hộ dịch vụ cao cấp tại Khu đô thị Ân Phú, phường Tân An, tỉnh Đắk Lắk.</p>
        <p className="mt-3 text-sm sm:text-base text-ink-secondary leading-relaxed">Hai hướng đi bổ trợ cho nhau: kinh nghiệm đón khách và vận hành mỗi ngày giúp công nghệ gần với nhu cầu thực tế hơn; công nghệ giúp thông tin rõ ràng, công việc có hệ thống và việc kết nối với khách thuê thuận tiện hơn.</p>
      </div>
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-7 rounded-section border border-line bg-canvas-pure p-6 sm:p-8">
          <MonitorCog className="h-8 w-8 text-brand-700" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand-700">Dành cho chủ cơ sở & đơn vị vận hành</p>
          <h3 className="mt-2 text-xl font-bold text-ink">Một nền tảng phù hợp với mô hình của bạn</h3>
          <div className="mt-6 grid sm:grid-cols-2 gap-5">
            {platformBenefits.map(item => <div key={item.title}><h4 className="text-sm font-semibold text-ink">{item.title}</h4><p className="mt-2 text-sm text-ink-secondary leading-relaxed">{item.detail}</p></div>)}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="mailto:admin@adhome.vn?subject=T%C6%B0%20v%E1%BA%A5n%20n%E1%BB%81n%20t%E1%BA%A3ng%20AdHome" className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-3 text-sm font-semibold text-white">Trao đổi nhu cầu nền tảng <ArrowUpRight className="h-4 w-4" /></a>
            <a href="https://console.adhome.vn/login" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-brand-700">AdHome Console <ArrowUpRight className="h-4 w-4" /></a>
          </div>
        </div>
        <div className="lg:col-span-5 rounded-section border border-line bg-canvas-pure p-6 sm:p-8">
          <Building2 className="h-8 w-8 text-brand-700" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand-700">Dành cho khách tìm không gian sống</p>
          <h3 className="mt-2 text-xl font-bold text-ink">An tâm chọn nơi ở tại Ân Phú</h3>
          <p className="mt-3 text-sm text-ink-secondary leading-relaxed">AdHome hướng đến trải nghiệm ở tiện nghi, chỉn chu và thuận tiện cho người đi làm, chuyên gia, gia đình nhỏ và khách có nhu cầu lưu trú dài ngày. Mỗi cuộc tư vấn bắt đầu từ nhu cầu về không gian, ngân sách và thời điểm nhận phòng của bạn.</p>
          <ul className="mt-5 space-y-3">{livingBenefits.map(item => <li key={item} className="flex gap-2.5 text-sm text-ink-secondary leading-relaxed"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /><span>{item}</span></li>)}</ul>
          <a href="https://zalo.me/0567867889" target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-semibold text-brand-700">Tư vấn căn hộ qua Zalo <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-sm text-ink-secondary leading-relaxed">Bạn đang tìm một căn hộ để ở, hay một công cụ để quản lý cơ sở lưu trú tốt hơn? AdHome luôn sẵn sàng lắng nghe. Liên hệ 05678.67889 hoặc admin@adhome.vn để cùng trao đổi phương án phù hợp.</p>
    </div>
  </section>
);
