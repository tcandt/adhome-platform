# AdHome Console V2 — Evidence Batch: UI-POLISH-HEADER-SIDEBAR

**Ngày thực hiện:** 02/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi:** Hoàn thiện tinh chỉnh giao diện Header & Sidebar theo yêu cầu người dùng:
1. **Bố trí Logo cân đối:** Căn lề padding và căn giữa theo trục dọc chuẩn mực trong SidebarHeader (64px), loại bỏ cảm giác bị ép sát góc.
2. **Loại bỏ viền giao cắt:** Xóa bỏ triệt để viền ngang `border-b` ở `SidebarHeader`, giữ Sidebar là một khối liền mạch đơn nhất; loại bỏ mối nối chữ T (T-junction/crosshair border) giao nhau giữa Header và Sidebar.
3. **Thanh tìm kiếm căn giữa Header:** Bố trí kiến trúc 3 vùng cân xứng (Trái: Toggle [≡] $\ge 44\times 44\text{px}$; Giữa: Command Search `Ctrl + K` căn giữa hoàn hảo; Phải: Thông báo và Profile Admin).
4. **Icon thông báo & Profile Admin thanh thoát:** Tinh chỉnh kích thước visual về chuẩn `36×36px` (`h-9 w-9`) với viền mỏng tinh tế và vùng chạm cảm ứng an toàn đạt chuẩn công thái học.
5. **Hiệu ứng thu gọn / mở rộng Animate UI mượt mà:** Khắc phục tình trạng giật cục do unmount đột ngột; áp dụng animation chuyển động mượt mà (transition cubic-bezier Animate UI chuẩn, crossfade logo, và co giãn mượt nhãn menu không vỡ chữ).

## Danh sách tệp hồ sơ
- [`ACCEPTANCE_REPORT.md`](ACCEPTANCE_REPORT.md): Báo cáo chi tiết nghiệm thu kỹ thuật, ma trận kiểm thử tự động Chrome CDP và bảng đối chiếu SHA-256.
- [`screenshots-manifest.json`](screenshots-manifest.json): Danh mục bằng chứng định dạng JSON chứa metadata, kích thước byte và mã băm SHA-256 của từng ảnh chụp.
- [`checksums-verified.txt`](checksums-verified.txt): Danh sách SHA-256 đối chiếu toàn vẹn ổ đĩa.
- [`screenshots/`](screenshots/): Thư mục chứa 10 tệp ảnh chụp giao diện độ phân giải cao tại các viewport 1440x900, 1280x720, 1920x1080 và 390x844.

## Các hình ảnh nổi bật
1. `screenshots/redesign_desktop_1440_header_expanded.png`: Header Desktop với Search Bar căn giữa hoàn hảo, icon thông báo và avatar Profile Admin thanh thoát, Sidebar mở rộng (248px) có Logo căn chỉnh cân đối, không viền ngang giao cắt.
2. `screenshots/redesign_desktop_1440_header_collapsed.png`: Sidebar thu gọn (72px) mượt mà với icon mark trung tâm; Header giữ phẳng 64px, Search căn giữa.
3. `screenshots/redesign_desktop_contracts_table_polished.png`: Bảng danh sách hợp đồng 6 cột chuẩn hóa, cột Thao tác sticky-right.
4. `screenshots/redesign_desktop_contracts_menu_open.png`: Action Menu Portal floating trọn vẹn trong viewport.
5. `screenshots/redesign_mobile_390x844_contracts_cards.png`: Thẻ hợp đồng Mobile tối ưu touch target $\ge 44\times 44\text{px}$.
6. `screenshots/redesign_mobile_390x844_actions_bottom_sheet.png`: Action Bottom Sheet Mobile với focus trap và phím Escape.
