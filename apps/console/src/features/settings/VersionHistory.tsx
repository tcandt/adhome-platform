import { CheckCircle2, GitCommitHorizontal, PackageOpen } from 'lucide-react';

const releases = [
  {
    version: '2.8.0',
    date: '10/11/2026',
    title: 'Chi tiết hóa đơn và thanh toán VietQR',
    current: true,
    changes: [
      'Thiết kế lại cửa sổ thu tiền hóa đơn gọn, rõ và tối ưu cho điện thoại.',
      'Hiển thị đầy đủ kỳ hóa đơn, hạn thanh toán, khách thuê, từng khoản thu, tổng tiền, đã thu và còn phải thu.',
      'Bổ sung lựa chọn nhanh Tiền mặt hoặc Quét QR.',
      'VietQR hiển thị đúng số tiền, tài khoản nhận, chủ tài khoản và nội dung chuyển khoản từ cấu hình SePay đã xác minh.',
      'Hiển thị lịch sử thanh toán và chứng từ đã lưu; giữ nguyên quy trình bàn giao tự động khi thu đủ.',
      'Bổ sung mục Phiên bản trong Cài đặt để theo dõi nội dung từng lần phát hành.',
    ],
  },
  {
    version: '2.7.0',
    date: '09/11/2026',
    title: 'Quản lý hồ sơ thuê và khách hàng',
    changes: [
      'Hoàn thiện hồ sơ thuê, thành viên cùng ở và thông tin bàn giao.',
      'Cải thiện luồng xem tài liệu hợp đồng và hồ sơ cư trú.',
    ],
  },
  {
    version: '2.6.0',
    date: '08/11/2026',
    title: 'Tài liệu riêng tư và xác minh danh tính',
    changes: [
      'Bảo vệ tài liệu định danh theo quyền truy cập.',
      'Cải thiện quét QR giấy tờ và xác nhận dữ liệu trước khi lưu.',
    ],
  },
];

export function VersionHistory() {
  return <section className="space-y-4" data-testid="settings-version-history">
    <header className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30 sm:p-5">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><PackageOpen size={20} /></span><div><p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Phiên bản đang chạy</p><h2 className="mt-0.5 text-xl font-bold text-slate-950 dark:text-white">AdHome Console v{releases[0].version}</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Phát hành ngày {releases[0].date}</p></div></div>
    </header>
    <div className="space-y-3">{releases.map(release => <article key={release.version} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111827] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><GitCommitHorizontal size={16} className="text-blue-600" /><h3 className="text-sm font-bold">v{release.version} · {release.title}</h3></div><p className="mt-1 pl-6 text-[11px] text-slate-500">{release.date}</p></div>{release.current && <span className="rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">ĐANG SỬ DỤNG</span>}</div>
      <ul className="mt-4 space-y-2">{release.changes.map(change => <li key={change} className="flex gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>{change}</span></li>)}</ul>
    </article>)}</div>
  </section>;
}
