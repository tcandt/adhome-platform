# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU UI/UX REDESIGN
**Mã tài liệu:** `ADHOME-CONSOLE-V2-UI-REDESIGN-2026-11-01`  
**Các Task hoàn thành:** `BASE-03`, `BASE-04`, `UI-01`, `UI-02`, `UI-04`, `UI-05`, `UI-07`  
**Thời điểm thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN CÁC THAY ĐỔI & CHUẨN HÓA (REFACTORING SUMMARY)

### 1.1. BASE-03 — Chuẩn hóa Design Tokens & Visual Hierarchy
- Đã tạo [`apps/console/src/shared/tokens/designTokens.ts`](file:///d:/AdHome-Platform/apps/console/src/shared/tokens/designTokens.ts):
  - **Typography scale:** Định nghĩa font chữ `sans` (Inter) và `mono`, kích thước `h1`, `h2`, `h3`, `body`, `caption`, `badge`, `tabular-nums`.
  - **Semantic Palette:** Bảng màu trạng thái chuẩn cho Hợp đồng và Phòng: `ACTIVE` (Emerald), `DRAFT` (Amber), `EXPIRING` (Orange), `TERMINATED` (Slate), `RESERVED` (Sky), `AVAILABLE` (Slate).
  - **Touch targets:** Quy định tối thiểu $\ge 40\text{px}$ trên Desktop và $\ge 44\text{px}$ trên Mobile.

### 1.2. BASE-04 — Tích hợp Animate UI Motion Tokens có kiểm soát
- Đã cấu hình motion tokens:
  - Duration: `instant: 100ms`, `fast: 150ms`, `base: 200ms`, `modal: 250ms`.
  - Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
  - Tuân thủ nghiêm ngặt `prefers-reduced-motion` trong `index.css`.
  - Không animate danh sách bảng lớn nhằm triệt tiêu giật lag trên thiết bị cấu hình phổ thông.

### 1.3. UI-01 — Redesign Desktop Header (3 Cụm Phân Cấp Rõ Ràng)
- **Cụm 1 (Trái):** Nút trigger sidebar $\ge 40\times 40\text{px}$, vách ngăn phân cách tinh tế (`h-5 w-px`), breadcrumb module và tiêu đề trang trực quan (`console-header-title`).
- **Cụm 2 (Giữa):** Bộ chọn phạm vi tòa nhà (`console-building-scope-selector`) cân đối, tích hợp ô tìm kiếm lọc nhanh tòa nhà khi số lượng tòa $> 4$, hỗ trợ lọc "Chỉ tòa này" hoặc "Chọn tất cả".
- **Cụm 3 (Phải):**
  - Thanh tìm kiếm nhanh (`Ctrl + K`) với phím tắt kbd.
  - Trạng thái đồng bộ PostgreSQL live (`console-sync-status`) với tooltip hiển thị giờ đồng bộ chính xác và hiệu ứng quay nhẹ khi làm mới.
  - Chuông thông báo vận hành (`console-notifications-trigger`) hiển thị badge đỏ khi và chỉ khi có thông báo chưa đọc.
  - Menu hồ sơ cá nhân (`console-user-menu-trigger`) hiển thị tên đầy đủ không bị ép cắt, badge vai trò `ADMIN` / `MANAGER`, scope tòa nhà, bộ chuyển giao diện Sáng/Tối và nút Đăng xuất an toàn.
- **Kiểm thử đa độ phân giải:** Xác nhận không tràn ngang, không nhảy 2 hàng ở cả 3 viewport chuẩn: **1280x720**, **1440x900**, **1920x1080**.

### 1.4. UI-02 — Redesign Nút Thu Phóng Sidebar Desktop
- Nâng cấp `SidebarTrigger` thành nút bấm chuẩn kích thước $\ge 40\times 40\text{px}$ (`h-10 w-10`), viền mềm, bo góc `rounded-lg`, đổ bóng nhẹ `shadow-2xs`.
- Hiệu ứng morphing icon mượt mà giữa `PanelLeftClose` (khi mở rộng) và `PanelLeftOpen` (khi thu gọn).
- Tích hợp tooltip tự động từ `@animate-ui/react/primitives/tooltip`: "Thu gọn thanh điều hướng (Ctrl+B)" / "Mở rộng thanh điều hướng (Ctrl+B)".
- Hỗ trợ đầy đủ phím tắt `Ctrl + B`, `aria-expanded`, và lưu trạng thái vào `localStorage` (`adhome_ui_sidebar_open`).

### 1.5. UI-04 — Chuẩn hóa Mã Hợp Đồng Hiển Thị Ngắn (Short Display Code)
- Triển khai hàm `formatContractDisplayCode(rawCode)`:
  - Mã dài sổ cũ: `HD-IMP-R-WF-010A-3673` $\rightarrow$ `HD-WF-010A` kèm badge "Từ sổ cũ".
  - Mã dài sinh tự động: `HD-S2B-S2R-105-BCF2` $\rightarrow$ `HD-S2R-105`.
  - Mã chuẩn: `HD-S4-401` $\rightarrow$ `HD-S4-401`.
- **Tính bất biến (Immutable Invariant):** Giữ nguyên 100% `c.id` (UUID) và `c.contractCode` gốc trên cơ sở dữ liệu và các lệnh gọi API. Mã gốc đầy đủ được lưu trong thuộc tính `title` tooltip và xuất hiện dưới dạng chú thích phụ giúp tra cứu không bao giờ đứt đoạn.

### 1.6. UI-05 — Tối Ưu Desktop Contracts Table
- Cột bảng được sắp xếp theo mật độ thông tin tối ưu:
  1. **Mã hợp đồng:** Mã ngắn + badge "Từ sổ cũ" + mã gốc tham chiếu.
  2. **Tòa & Phòng:** In đậm rõ ràng.
  3. **Khách đứng tên:** Tên khách in đậm + số điện thoại dạng mono.
  4. **Thời hạn:** Ngày bắt đầu $\rightarrow$ ngày kết thúc với `whitespace-nowrap tabular-nums`.
  5. **Giá thuê / Cọc:** Định dạng tiền tệ `đ/tháng` (`whitespace-nowrap`), phân rã tiền cọc đã thu và tiền cọc còn thiếu rõ ràng.
  6. **Điện & Nước:** Hiển thị giá điện `đ/kWh`, nước hiển thị `/m³`, `/người`, `/phòng` qua `formatWaterBillingLabel`.
  7. **Trạng thái:** Badge bo góc mềm với màu sắc ngữ nghĩa.
  8. **Thao tác:** Nút ba chấm `ActionMenu` sử dụng Portal.

### 1.7. UI-07 — Tối Ưu Mobile Contracts Cards & Action Bottom Sheet
- Đóng gói toàn bộ các con số tiền tệ với `whitespace-nowrap`, triệt tiêu hoàn toàn lỗi xuống dòng cụm từ "4.000.000 đ" và "đ/tháng".
- Bố cục lưới thông tin 2 cột (`grid-cols-2`) rõ ràng, dễ quét trên màn hình 390px.
- Nút "Bàn giao phòng" full-width đạt chuẩn touch target $\ge 44\text{px}$ (`min-h-[44px]`).
- Tích hợp Action Bottom Sheet mượt mà trên Mobile với grab-bar và safe-area padding.

---

## 2. BỘ BẰNG CHỨNG HÌNH ẢNH SAU REDESIGN (AFTER_REDESIGN)

Toàn bộ 8 ảnh chụp màn hình được sinh tự động thông qua giao thức Chrome DevTools Protocol (CDP) tại tỉ lệ pixel thực (DPR = 2), với dữ liệu thực tế từ PostgreSQL 18:

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 405,617 | `f9ee1ed6ed56f6eeeb9e8d87537c78e3e952f99ca02b5a166d9ac2304bf2db07` | Desktop Header & Sidebar mở rộng: 3 vùng phân cấp, scope tòa nhà, search, sync indicator, profile |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 332,604 | `5010a6577cd178ff55b0f88cd2ae1f5c5b5b7e0c75aaba37725bc0e200ca0b9c` | Desktop Header & Sidebar thu gọn: Nút trigger $\ge 40\times 40\text{px}$, tooltip Ctrl+B, icon morphing |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 347,286 | `83dc196ba6817f69bb372115a7fe827dad728c77d24b7e33c7ded872d483950f` | Desktop Viewport 1280x720: Header giữ nguyên 1 dòng, không tràn ngang, không che title |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 447,871 | `569f85e34a2e14381453cd40d006c27512be3f2902c9d019149cb57c8c43719c` | Desktop Widescreen 1920x1080: Bố cục tỷ lệ vàng, độ sắc nét cao |
| 5 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 470,916 | `57fc1e337961d6fd187971fc178c79a895357c4a8cc164a4a493767a4cbe9d3c` | Bảng Hợp đồng Desktop: Mã ngắn (`HD-WF-010A`), badge "Từ sổ cũ", số tiền nowrap, điện nước chuẩn |
| 6 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 454,425 | `f7a40cd2430d36d9a1771846655d9ba6bd02d1efe4acec926231b6e4f2ba4abb` | Menu ba chấm ActionMenu mở bằng Portal: Nổi trên toàn bộ khung bảng, tự động flip/shift, không bị cắt |
| 7 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 144,011 | `018d878080617f89b77230942811d8ae1baeca2c974f99d806ded40f11beaf00` | Thẻ Hợp đồng Mobile (390x844): Giá thuê `4.000.000 đ/tháng` nguyên vẹn 1 dòng, nút Bàn giao 44px+ |
| 8 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 112,214 | `f5e55691506ae881d713a15eada5a34fefc7a53633fb7db7071aa7f3fdfc6306` | Bottom Action Sheet trên Mobile: Grab bar, safe-area padding, touch targets $\ge 44\text{px}$ |

---

## 3. KẾT QUẢ QUALITY GATES & BẢO TOÀN KIẾN TRÚC

- **`GATE_BUILD_TYPECHECK`:** **PASS** (`tsc -b` pass sạch, build `@adhome/console` và `@adhome/landing` exit code 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (`oxlint` quét toàn workspace 97 files, 0 errors).
- **`GATE_SECURITY_INVARIANTS`:** **PASS** (Tài khoản sản xuất `admin@adhome.vn` không bị thay đổi password hay session; dùng actor cô lập `automation.test.admin@adhome.internal` và tự động dọn dẹp).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (Không thay đổi bất kỳ file nào trong `apps/landing/public/`, `sitemap.xml` giữ nguyên ngày `2026-10-31`).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (100% dữ liệu tài chính, hợp đồng, cọc và sổ quỹ không bị biến dạng).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (8/8 file ảnh có checksum SHA-256 phân biệt 100%, dung lượng $\ge 25\text{KB}$, tỉ lệ DPR = 2 chuẩn xác).
