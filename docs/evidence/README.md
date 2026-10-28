# AdHome V2 Console — Thư Viện Minh Chứng Nghiệm Thu UI/UX

Thư mục này lưu trữ toàn bộ các file **video ghi hình trực tiếp (WebP)** và **ảnh chụp màn hình (PNG)** phục vụ việc theo dõi, đối chiếu và nghiệm thu các tiêu chuẩn giao diện theo [ADHOME_V2_BLUEPRINT.md](file:///d:/AdHome-Platform/ADHOME_V2_BLUEPRINT.md) và tài liệu **Homeland-SaaS**.

---

## 🎬 1. Danh Sách Video Ghi Hình Phiên Thao Tác Trực Tiếp (WebP)

Các file video định dạng WebP có thể mở trực tiếp bằng bất kỳ trình duyệt web nào (Chrome, Edge, Firefox, Brave) hoặc trình xem đa phương tiện hỗ trợ WebP.

| STT | Tên Video Gốc | Tên Video Dễ Nhớ | Nội dung ghi hình |
| :---: | :--- | :--- | :--- |
| **01** | [`ui_ux_correction_audit_1793178463235.webp`](./ui_ux_correction_audit_1793178463235.webp) | [`01_video_sidebar_toggle_animation.webp`](./01_video_sidebar_toggle_animation.webp) | • Mở/thu gọn Sidebar bằng nút ngoài Header<br>• Mở/thu gọn bằng phím tắt `Ctrl+B`<br>• Chuyển động 280ms đồng bộ không gián đoạn<br>• Logo chuyển icon 44px và menu căn giữa |
| **02** | [`portfolio_drawer_audit_1793178613044.webp`](./portfolio_drawer_audit_1793178613044.webp) | [`02_video_portfolio_board_and_drawer.webp`](./02_video_portfolio_board_and_drawer.webp) | • Bảng điều hành 4 tòa 2×2 Portfolio Board (34 phòng)<br>• Mở Room Detail Drawer căn 31-04 (HĐ hết hạn)<br>• Chuyển ngay sang căn 31-05 (Cảnh báo nợ 5.52 tr)<br>• Đóng nhanh bằng phím `ESC` |
| **03** | [`floorplan_dark_mobile_audit_1793178755924.webp`](./floorplan_dark_mobile_audit_1793178755924.webp) | [`03_video_floorplan_dark_mobile.webp`](./03_video_floorplan_dark_mobile.webp) | • Sơ đồ mặt bằng kiến trúc SVG & Mô hình 3D Homeland<br>• Nhấp trực tiếp vào ô phòng SVG để mở Drawer<br>• Bật/tắt Dark Mode tương phản cao<br>• Bố cục MobileShell 390×844 và mở Mobile Drawer |

---

## 📸 2. Danh Sách Ảnh Chụp Màn Hình Nghiệm Thu (PNG)

| File Ảnh | Độ phân giải | Nội dung thể hiện |
| :--- | :---: | :--- |
| [`01_desktop_overview_1920x1080.png`](./01_desktop_overview_1920x1080.png) | 1920×1080 | Tổng quan Dashboard điều hành, KPI lấp đầy, doanh thu và sổ quỹ |
| [`02_sidebar_collapsed_72px.png`](./02_sidebar_collapsed_72px.png) | 1920×1080 | Sidebar thu gọn 72px với nút Toggle trên Header và icon logo 44px |
| [`03_sidebar_expanded_256px.png`](./03_sidebar_expanded_256px.png) | 1920×1080 | Sidebar mở rộng 256px đầy đủ nhãn danh mục và logo ngang |
| [`04_portfolio_board_2x2_34rooms.png`](./04_portfolio_board_2x2_34rooms.png) | 1920×1080 | Bảng 4 tòa tập trung 2×2 Portfolio Board bao quát 34 phòng đồng thời |
| [`05_room_drawer_3104_expiring.png`](./05_room_drawer_3104_expiring.png) | 1920×1080 | Room Detail Drawer phòng 31-04 (HĐ sắp hết hạn, công tơ Hunonic IoT) |
| [`06_room_drawer_3105_debt_warning.png`](./06_room_drawer_3105_debt_warning.png) | 1920×1080 | Room Detail Drawer phòng 31-05 (Cảnh báo nợ quá hạn 5.520.000₫) |
| [`07_homeland_floorplan_svg_3d.png`](./07_homeland_floorplan_svg_3d.png) | 1920×1080 | Sơ đồ mặt bằng kiến trúc vector SVG & Mô hình cắt lớp 3D Homeland-SaaS |
| [`08_drawer_opened_from_svg_floorplan.png`](./08_drawer_opened_from_svg_floorplan.png) | 1920×1080 | Mở Drawer trực tiếp từ vùng nhấp phòng trên sơ đồ mặt bằng SVG |
| [`09_dark_mode_portfolio_2x2.png`](./09_dark_mode_portfolio_2x2.png) | 1920×1080 | Chế độ Dark Mode nền tối chuyên nghiệp cho Bảng 2×2 Portfolio Board |
| [`10_mobile_shell_390x844.png`](./10_mobile_shell_390x844.png) | 390×844 | Bố cục MobileShell cuộn dọc thẻ compact, thanh điều hướng đáy ghim cố định |
| [`11_mobile_drawer_open_390x844.png`](./11_mobile_drawer_open_390x844.png) | 390×844 | Drawer điều hướng trên di động hiển thị danh mục và hồ sơ người dùng |
| [`12_login_page_stacked_logo.png`](./12_login_page_stacked_logo.png) | 1920×1080 | Trang đăng nhập Universal với thẻ đăng nhập trung tâm và Logo dọc |

---

## 📦 3. Kết Quả Kiểm Tra Mã Nguồn & Build

Lệnh kiểm tra TypeScript nghiêm ngặt và đóng gói sản phẩm:
```powershell
pnpm --filter @adhome/console build
```

Kết quả:
```text
✓ 1987 modules transformed.
dist/index.html                   1.10 kB │ gzip:  0.64 kB
dist/assets/index-Db3GzyJZ.css   43.62 kB │ gzip:  7.68 kB
dist/assets/index-CjSiiU7O.js   368.00 kB │ gzip: 98.61 kB
✓ built in 2.50s (0 errors)
```

Kết quả kiểm toán chuyển động Animate UI:
```text
npx @animate-ui/cli audit
Motion audit: 8 of 27 files move, 51 facts.
Totals: compositor 8 · paint 15 (colors) · layout 3 (margin-left, left, width)
reduced motion: 4 of 8 files that move have a path · project-wide: src\index.css
```

---

## 🚀 4. Minh Chứng Kiến Trúc SaaS Multi-Tenant & Dynamic CRUD (P0)

Minh chứng cho quyết định kiến trúc: **AdHome V2 là SaaS đa khách hàng (Organization → Buildings 0..N → Floors 0..N → Rooms 0..N)**, không bị giới hạn cứng ở 4 tòa hay 34 phòng:

| STT | File Minh Chứng | Loại | Nội dung kiểm thử nghiệm thu |
| :---: | :--- | :---: | :--- |
| **04** | [`saas_dynamic_portfolio_audit.webp`](./saas_dynamic_portfolio_audit.webp) | Video WebP | • **Chuyển đổi Tổ chức:** Đổi từ `Khu đô thị Ân Phú` sang `Tổ chức B — Green Residences (0 tòa)`<br>• **Empty State:** Màn hình chào mừng thân thiện khi chưa có tòa nhà + 2 nút CTA<br>• **Thêm Tòa Nhà:** Mở modal `CreateBuildingModal`, tạo tòa `SAPPHIRE-1` (4 tầng)<br>• **Thêm Hàng Loạt Phòng:** Sinh mã tiền tố `50` tự động thành 5001, 5002, 5003, 5004 trên Tầng 4<br>• **Xóa An Toàn (Safe Delete):** Tòa mới rỗng được phép xóa vĩnh viễn<br>• **Chặn Xóa Bảo Vệ Tài Chính:** Chuyển về Ân Phú, bấm xóa `LK01-31` (đang có 6 phòng thuê & nợ) → Hệ thống **chặn xóa vĩnh viễn** để bảo toàn lịch sử và đề xuất **Lưu trữ (Archive)** |
| **05** | [`building_created_evidence.png`](./building_created_evidence.png) | Ảnh PNG | Giao diện sau khi tạo tòa `SAPPHIRE-1` với số liệu tầng/phòng động |
| **06** | [`org_check_evidence.png`](./org_check_evidence.png) | Ảnh PNG | Trình chọn tổ chức và modal xác nhận an toàn tài chính |
