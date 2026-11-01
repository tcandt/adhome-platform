# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU UI/UX REDESIGN & REMEDIATION (ĐỢT A & ĐỢT B)
**Mã tài liệu:** `ADHOME-CONSOLE-V2-UI-REDESIGN-REMEDIATION-2026-11-01`  
**Các Task hoàn thành:** `BASE-03`, `BASE-04`, `UI-01`, `UI-02`, `UI-04`, `UI-05`, `UI-06`, `UI-07` (Bao gồm đầy đủ `UI-05-FIX-01`, `UI-05-FIX-02`, `UI-06-FIX-01`, `UI-07-FIX-01`, `UI-07-FIX-02`, `UI-01-FIX-01`, `UI-02-FIX-01`, `UI-04-FIX-01`)  
**Thời điểm thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN REMEDIATION THEO REVIEW ĐỘC LẬP (ĐỢT A & ĐỢT B)

Tài liệu này báo cáo chi tiết kết quả giải quyết toàn bộ các điểm quan sát từ kiểm toán độc lập `ADHOME-UI-REDESIGN-INDEPENDENT-REVIEW-2026-11-01`:

### 1.1. Đợt A (P0 - Visual & Layout Blockers)

1. **`UI-05-FIX-01` — Tối ưu triệt để bảng hợp đồng Desktop & Cột Thao tác Sticky Right:**
   - **Vấn đề trước sửa:** Trên màn hình 1280px / 1440px khi sidebar mở rộng (248px), 8 cột unconstrained đẩy cột `Trạng thái` và `Thao tác` ra ngoài mép phải màn hình.
   - **Giải pháp:** Tinh gọn và hợp nhất thành **6 cột ngữ nghĩa chuẩn**:
     1. `Hợp đồng & Phòng`: Mã hiển thị ngắn in đậm + badge "Từ sổ cũ" + Tòa & Số phòng ngay bên dưới + mã gốc dạng tooltip/subtext.
     2. `Khách đứng tên`: Tên khách in đậm truncate có tooltip + số điện thoại dạng mono.
     3. `Thời hạn & Tiện ích`: Ngày bắt đầu $\rightarrow$ kết thúc + Giá điện và nước chuẩn hóa.
     4. `Giá thuê & Cọc`: Giá thuê `đ/tháng` nowrap + Phân rã tiền cọc đã thu và còn thiếu rõ ràng (`UI-05-FIX-02`).
     5. `Trạng thái`: Badge bo tròn với màu sắc ngữ nghĩa (Đang hiệu lực / Chờ bàn giao / Sắp hết hạn / Đã thanh lý).
     6. `Thao tác`: **Cố định mép phải (`sticky right-0`)** với nền `bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs`, đổ bóng phân cách `shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.08)]` và độ rộng `w-16`. Nút ba chấm luôn hiển thị ngay trước mắt người quản lý ở mọi mức zoom và kích thước bảng.
   - **Khẳng định bằng chứng CDP DOM:**
     - `document.documentElement.scrollWidth: 1434px` $\le$ `window.innerWidth: 1440px`.
     - `docOverflow: false` $\rightarrow$ **PASS**.

2. **`UI-06-FIX-01` — Bằng chứng E2E Portal ActionMenu không bị cắt:**
   - **Vấn đề trước sửa:** Ảnh `menu_open.png` trước đây không thể hiện menu mở trong viewport hoặc bị trùng SHA với bảng đóng.
   - **Giải pháp:** `ActionMenu` sử dụng `FloatingPortal id="adhome-action-menu-portal"` gắn trực tiếp vào `document.body`, thoát hoàn toàn khỏi container `overflow-x-auto` của bảng.
   - **Khẳng định bằng chứng CDP DOM (`getBoundingClientRect`):**
     - `found: true`, `inViewport: true`.
     - Kích thước popover: `width: 224px`, `height: 163px`.
     - Tọa độ viewport: `top: 405px`, `bottom: 568px`, `left: 1150px`, `right: 1374px` (nằm trọn vẹn trong màn hình 1440x900).
     - Portal ID xác thực: `_r_36_` $\rightarrow$ **PASS**.

3. **`QA-EVIDENCE-02` — Quality Gate chụp ảnh màn hình bằng chứng:**
   - Tất cả 8 ảnh chụp màn hình được sinh thông qua Chrome DevTools Protocol tại tỉ lệ DPR=2 với kích thước PNG thật `2880x1800`, `2560x1440`, `3840x2160`, `780x1688`.
   - 100% file ảnh có SHA-256 phân biệt, dung lượng $\ge 100\text{KB}$, và phản ánh chính xác trạng thái DOM tương ứng.

---

### 1.2. Đợt B (P1 - Operational UX Polish)

1. **`UI-07-FIX-01` — Mở rộng Hitbox 3 Chấm:**
   - Nút ba chấm được mở rộng đạt chuẩn cảm ứng:
     - Desktop: `h-10 w-10 min-w-[40px] min-h-[40px]`.
     - Mobile: `h-11 w-11 min-w-[44px] min-h-[44px]`.
   - **Xác thực CDP DOM:** `{ width: 44, height: 44, meetsMinTarget: true }` $\rightarrow$ **PASS**.

2. **`UI-07-FIX-02` — Contextual Bottom Sheet trên Mobile:**
   - Khi bấm 3 chấm trên thẻ hợp đồng mobile, hệ thống mở một Bottom Sheet ngữ cảnh chuyên nghiệp:
     - Grab-bar bo góc mềm ở đỉnh modal.
     - Tiêu đề ngữ cảnh: Hiển thị Tòa & Phòng (ví dụ: `S4B · S4-404`).
     - Phụ đề: Hiển thị Mã HĐ ngắn & Tên khách thuê.
     - Huy hiệu trạng thái: Badge trạng thái hợp đồng (`Đang hiệu lực`).
     - Nhóm thao tác thông thường và nhóm thao tác nguy hiểm (`variant: danger`) được phân tách bằng đường kẻ rõ ràng.
     - Nút "Đóng" to rõ ở chân sheet với safe-area padding.
   - **Xác thực CDP DOM:** `{ found: true, height: 337, width: 390, title: 'S4B · S4-404', badge: 'Đang hiệu lực' }` $\rightarrow$ **PASS**.

3. **`UI-01-FIX-01` — Chuẩn hóa User Profile Header:**
   - Thay thế avatar gradient bằng màu thương hiệu phẳng vững chắc (`bg-blue-600 dark:bg-blue-500`).
   - Mở rộng độ rộng tối đa của tên: `max-w-[160px] lg:max-w-[220px] 2xl:max-w-[320px]`.
   - Bổ sung `title` tooltip chứa toàn bộ họ tên và email.
   - Menu dropdown hiển thị tên đầy đủ không bao giờ bị cắt.

4. **`UI-02-FIX-01` — Tinh chỉnh Nút Sidebar Toggle:**
   - Làm mềm viền nút thu phóng sidebar: `rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100/90 text-slate-500 hover:text-slate-800`.
   - Loại bỏ hoàn toàn cảm giác hộp đen nặng nề, giữ nguyên chuẩn kích thước $\ge 40\times 40\text{px}$ và morphing icon.

5. **`UI-04-FIX-01` — Regex Mã Hợp Đồng Hỗ Trợ Dấu Chấm (`.`):**
   - Nâng cấp regex trích xuất mã phòng trong `formatContractDisplayCode` từ `[A-Za-z0-9-]+` thành `[A-Za-z0-9._-]+`.
   - Chạy kiểm thử đơn vị `testContractShortCodes.mjs` trên toàn bộ 13 hợp đồng đang hoạt động trong PostgreSQL:
     - `HD-IMP-P.31-06-3673` $\rightarrow$ `HD-P.31-06` (Imported: true)
     - `HD-IMP-R-WF-010A-3673` $\rightarrow$ `HD-WF-010A` (Imported: true)
     - `HD-IMP-S3-301-0483` $\rightarrow$ `HD-S3-301` (Imported: true)
     - `HD-IMP-S3-302-0483` $\rightarrow$ `HD-S3-302` (Imported: true)
     - `HD-S2B-INV` $\rightarrow$ `HD-S2B-INV` (Imported: false)
     - `HD-S2B-S2R-101-B839` $\rightarrow$ `HD-S2R-101` (Imported: false)
     - `HD-S2B-S2R-103-103F` $\rightarrow$ `HD-S2R-103` (Imported: false)
     - `HD-S2B-S2R-104-4C36` $\rightarrow$ `HD-S2R-104` (Imported: false)
     - `HD-S2B-S2R-105-BCF2` $\rightarrow$ `HD-S2R-105` (Imported: false)
     - `HD-S4-401..S4-404` $\rightarrow$ `HD-S4-401..S4-404` (Imported: false)
   - **Kết quả:** **100% duy nhất, không trùng lặp, `GATE_CONTRACT_SHORT_CODE: PASS`**.

6. **`UI-05-FIX-02` — Cấu trúc Lại Hiển Thị Tiền Cọc:**
   - Phân biệt rõ ràng giữa tiền cọc theo hợp đồng và tình trạng thu nộp thực tế:
     - Nếu đã thu đủ: Hiển thị `Cọc: X.XXX đ`, `Đã thu: X.XXX đ (đủ)`.
     - Nếu còn thiếu: Hiển thị `Cọc: X.XXX đ`, `Đã thu: Y.YYY đ (thiếu Z.ZZZ đ)` với màu đỏ tương phản cảnh báo nghiệp vụ.

---

## 2. BỘ BẰNG CHỨNG HÌNH ẢNH MỚI (VERIFIED CDP SCREENSHOTS)

Tất cả 8 ảnh chụp màn hình được lưu trữ tại `docs/evidence/console-v2/UI-REDESIGN/screenshots/` và được đối chiếu checksum SHA-256 nghiêm ngặt:

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 407,060 | `7aa90e22ef34bc7238a58bbf2997db12040bf563510b09b1556bf84e03033d41` | Desktop Header & Sidebar mở rộng: 3 vùng rõ ràng, avatar phẳng vững chắc, scope tòa nhà, search Ctrl+K, sync status |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 334,092 | `f69f41bd30b4d0054cb3ed6c6abed6d0ca85e3b9a0a6989049ab4aa2c7d14750` | Desktop Sidebar thu gọn: Nút trigger $\ge 40\times 40\text{px}$, viền mềm, tooltip Ctrl+B, morphing icon |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 348,720 | `63a2ad057311b8942e854d651cec9c6ad20566edb4093dec81405072718810d9` | Desktop Viewport 1280x720: Header 1 dòng không tràn, cân đối cụm điều hướng |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 447,942 | `8a725f482116708317e5b6661fd649974b5424efdf3e919479faa6fdfbf60439` | Desktop Widescreen 1920x1080: Bố cục tỷ lệ chuẩn, độ sắc nét cao |
| 5 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 484,040 | `8fd353bf04a23609dcac020ee6fa3e23e7043586ddc621424a988ea2fc779869` | Bảng Hợp đồng Desktop 6 cột: Cột Thao tác sticky-right, không tràn ngang trang (`scrollWidth <= innerWidth`), tiền cọc phân rã rõ ràng |
| 6 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 500,011 | `32bc98b4660a46a73c0f65de35308a94a3627f8840d79f743a693a510d35f41a` | Menu ba chấm mở bằng Portal: Nổi trên toàn bộ bảng, nằm trọn trong viewport (`top: 405, bottom: 568`), không bị cắt |
| 7 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 134,509 | `6fc654dbc31ad8d858d6f9125987d6c52f938ba217568bd0346589267ddf0e22` | Thẻ Hợp đồng Mobile (390x844): Giá thuê `4.000.000 đ/tháng` nguyên vẹn 1 dòng, nút Bàn giao 44px+, hitbox 3 chấm $\ge 44\text{px}$ |
| 8 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 103,745 | `9a7bd56130f257769b0a22d1a9774a8e224def61b18da3addc9b3e5031feede1` | Contextual Action Bottom Sheet: Grab bar, tiêu đề `S4B · S4-404`, badge `Đang hiệu lực`, phân tách rõ nhóm nguy hiểm, touch targets $\ge 44\text{px}$ |

---

## 3. KẾT QUẢ QUALITY GATES & BẢO TOÀN HỆ THỐNG

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| `GATE_BUILD_TYPECHECK` | `tsc -b` & Vite build production | 0 lỗi biên dịch, build `@adhome/console` và `@adhome/landing` exit code 0 | **PASS** |
| `GATE_LINT_CONFIGURED` | `oxlint` quét toàn bộ mã nguồn | 0 errors (26 warnings không cản trở) | **PASS** |
| `GATE_CONTRACT_SHORT_CODE` | 13/13 hợp đồng PostgreSQL có mã ngắn duy nhất | 100% unique, hỗ trợ dấu chấm `.` (`HD-P.31-06`) | **PASS** |
| `GATE_TABLE_OVERFLOW` | `document.documentElement.scrollWidth <= innerWidth` | `docScrollWidth: 1434` $\le$ `1440` (`docOverflow: false`) | **PASS** |
| `GATE_PORTAL_POPUP` | Popover nổi qua Portal, `inViewport: true` | `top: 405, bottom: 568`, `inViewport: true`, `portalId: '_r_36_'` | **PASS** |
| `GATE_TOUCH_TARGETS` | Hitbox $\ge 40\text{px}$ Desktop, $\ge 44\text{px}$ Mobile | Mobile trigger đạt $44\times 44\text{px}$, nút Bàn giao $\ge 44\text{px}$ | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản sản xuất `admin@adhome.vn` bất biến | Dùng actor cô lập `automation.test.admin@adhome.internal` và tự động dọn dẹp | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không sửa đổi tài nguyên landing | `apps/landing/public/` giữ nguyên ngày `2026-10-31` | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 8/8 file ảnh có checksum SHA-256 phân biệt | Checksums và dung lượng khớp 100% | **PASS** |

**Kết luận nghiệm thu:** Tất cả các yêu cầu remediation từ kiểm toán độc lập đã được xử lý triệt để, chứng minh bằng code, unit test và bằng chứng hình ảnh CDP thực tế. Đủ điều kiện chuyển giao và nghiệm thu.
