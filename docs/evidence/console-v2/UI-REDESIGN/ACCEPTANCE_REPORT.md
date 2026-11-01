# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU REMEDIATION & QA-HEADER-01
**Mã tài liệu:** `ADHOME-CONSOLE-V2-REMEDIATION-ACCEPTANCE-2026-11-01`  
**Các Task hoàn thành:** `C2-00-R1`, `UI-SIDEBAR-01`, `UI-HEADER-01`, `UI-HEADER-02`, `QA-HEADER-01`, `C2-00` (Baseline & QA Remediation), `QA-04-FIX-01`, `QA-04-FIX-02`, `QA-06`, `UI-07-FIX-04`, `QA-05-FIX-01`, `QA-07`  
**Thời điểm thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI REMEDIATION & NHÓM TASK HEADER/SIDEBAR UX

Đáp ứng đầy đủ các quan sát và khuyến nghị từ đợt kiểm toán độc lập về trải nghiệm Header/Sidebar trên Desktop (`C2-00 ACCEPTED WITH CONDITIONS — DESKTOP HEADER & SIDEBAR UX NOT ACCEPTED`), đợt triển khai này đã tái cấu trúc triệt để kiến trúc điều hướng Desktop:

### 1.1. `C2-00-R1` — Hiệu Chỉnh Hồ Sơ Kiểm Toán & Công Khai Minh Bạch
- Ghi nhận đầy đủ mã băm commit kiểm toán cơ sở: `924d8ea954ba0d2d3cb542616f731ea7b03697eb`.
- Làm rõ phạm vi kiểm thử Touch Targets Mobile: 26/26 controls thuộc phạm vi test harness đạt $\ge 44\times 44\text{px}$.
- Minh bạch kết quả linter: 0 errors, 42 warnings (đã dọn dẹp các biến/import thừa).
- Phân biệt rõ giữa kiểm tra cô lập tài khoản Admin (`admin@adhome.vn`) và kiểm tra toàn vẹn cơ sở dữ liệu (`verifyDbInvariants.mjs`).
- Chuẩn hóa 8 Quality Gates mới cho toàn bộ hệ thống.
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.2. `UI-SIDEBAR-01` — Tái Cấu Trúc Nút Toggle Sidebar Ngay Cạnh Logo
- **Vấn đề trước đây:** Nút toggle Sidebar nằm trong Desktop Header gây sai lệch ngữ cảnh; hover vào sidebar bị tự động mở rộng ngoài ý muốn (`animateOnHover={true}`).
- **Triển khai kỹ thuật:**
  - Gỡ bỏ hoàn toàn `SidebarTrigger` khỏi `DesktopHeader.tsx`.
  - Đặt nút Toggle trực tiếp bên trong `SidebarHeader` cạnh Logo:
    - **Khi mở rộng (248px):** BrandLogo nằm bên trái, nút Toggle (`PanelLeftClose`, `data-testid="console-sidebar-toggle"`, `data-sidebar="trigger"`) nằm bên phải, có tooltip "Thu gọn thanh điều hướng (Ctrl+B)".
    - **Khi thu gọn (72px):** Logo mark AdHome nằm giữa, ngay bên dưới là nút Toggle (`PanelLeftOpen`, `data-testid="console-sidebar-toggle"`, `data-sidebar="trigger"`) nằm chính giữa, nổi bật, dễ khám phá.
  - Tắt hoàn toàn tự động mở khi hover: cấu hình `animateOnHover={false}` trong [`animate-sidebar.tsx`](file:///d:/AdHome-Platform/apps/console/src/shared/ui/animate-sidebar.tsx).
  - Phím tắt toàn cục `Ctrl+B` (loại trừ khi focus vào `input`, `textarea`, `select`).
  - Lưu trạng thái thu gọn/mở rộng vào `localStorage` (`adhome_ui_sidebar_open`) duy trì qua các lần tải lại trang (reload).
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.3. `UI-HEADER-01` — Thiết Kế Lại Desktop Header Tối Giản 2 Vùng
- **Vấn đề trước đây:** Desktop Header quá tải với 3 cụm (Scope selector, Notifications, Sync status, User Profile, Search, Toggle) gây rối mắt và chật chội trên màn hình nhỏ.
- **Triển khai kỹ thuật tại [`DesktopHeader.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/desktop/navigation/DesktopHeader.tsx):**
  - Giảm thiểu xuống đúng **2 vùng chức năng tinh gọn**:
    - **Vùng 1 (Trái):** Tiêu đề phân hệ và Breadcrumbs ngữ cảnh (`data-testid="console-header-title"`).
    - **Vùng 2 (Phải):** Thanh tìm kiếm nhanh toàn hệ thống Command Search (`data-testid="console-global-search-trigger"`) kích hoạt bằng `Ctrl+K`.
  - Chiều cao chuẩn 64px (`h-16`), nền kính mờ `backdrop-blur-md`, viền đáy thanh lịch.
  - 100% không tràn ngang trên mọi độ phân giải từ 1024px đến 1920px.
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.4. `UI-HEADER-02` — Tái Bố Trí Chức Năng Về Đúng Ngữ Cảnh (Relocation)
- **Phạm vi tòa nhà (Building Scope Selector):**
  - Tách thành component độc lập [`BuildingScopeSelector.tsx`](file:///d:/AdHome-Platform/apps/console/src/shared/ui/BuildingScopeSelector.tsx), bảo toàn `data-testid="console-building-scope-selector"`.
  - Di chuyển trực tiếp vào toolbar ngữ cảnh của không gian làm việc phân hệ [`OperationalModuleWorkspace.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/OperationalModuleWorkspace.tsx) và banner tóm tắt [`OverviewDashboard.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/overview/OverviewDashboard.tsx).
- **Trạng thái đồng bộ Live Sync PostgreSQL (`data-testid="console-sync-status"`):**
  - Chuyển về `SidebarFooter` trong [`DesktopSidebar.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/desktop/navigation/DesktopSidebar.tsx). Hiển thị chấm trạng thái xanh/spinner xoay hoặc nút Thử lại màu đỏ khi mất kết nối.
- **Thông báo vận hành (`data-testid="console-notifications-trigger"`):**
  - Chuyển về `SidebarFooter` trong [`DesktopSidebar.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/desktop/navigation/DesktopSidebar.tsx). Có huy hiệu số đỏ (`unreadNotificationsCount`), popover bay sang phải (`data-testid="console-notifications-popover"`) không bị cắt khuất.
- **Hồ sơ người dùng & Giao diện & Đăng xuất (`data-testid="console-user-menu-trigger"`):**
  - Chuyển thành thẻ đại diện ở chân Sidebar (`SidebarFooter`). Bao gồm Avatar ký tự đầu, Tên đầy đủ, Vai trò hệ thống (`data-testid="console-actor-role-badge"`), Chuyển đổi Dark/Light mode (`data-testid="console-theme-toggle"`), Huy hiệu phạm vi (`data-testid="console-actor-scope-badge"`), và nút Đăng xuất an toàn (`data-testid="console-logout-button"`).
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.5. `QA-HEADER-01` — Nghiệm Thu Thực Nghiệm Tương Tác & Bố Cục Qua Chrome CDP
Đã chạy kiểm thử tự động toàn diện trong [`captureRedesignScreenshots.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/captureRedesignScreenshots.mjs):
1. **Khẳng định vị trí nút Toggle:** `inSidebarHeader: true`, `inDesktopHeader: false`, `cleanHeaderPassed: true` [PASS].
2. **Kiểm thử chuyển trạng thái con trỏ:** Mở rộng (248px) $\rightarrow$ Thu gọn (72px, `aria-expanded="false"`) $\rightarrow$ Mở rộng (248px) [PASS].
3. **Kiểm thử độ ổn định khi rê chuột (Hover Stability):** Rê chuột vào sidebar thu gọn **không** gây mở bung ngoài ý muốn (`animateOnHover={false}`) [PASS].
4. **Kiểm thử phím tắt `Ctrl+B`:** Thu gọn/mở rộng thành công qua phím tắt, đồng thời bỏ qua khi đang gõ trong input (`inputExclusion: PASS`).
5. **Kiểm thử lưu trữ `localStorage`:** Trạng thái thu gọn được lưu vào `adhome_ui_sidebar_open` và duy trì chính xác sau khi reload trang (`Page.reload`) [PASS].
6. **Kiểm thử mở Popover từ Sidebar:** Cả popover Thông báo và popover Hồ sơ người dùng mở bình thường, phím `Escape` đóng mượt mà [PASS].
7. **Kiểm thử đa độ phân giải & Mô phỏng Zoom:** 1024px, 1280px, 1366px, 1440px, 1920px và các mức Zoom 125% / 150% đều duy trì chiều cao Header 64px, **0 pixel tràn ngang** (`overflow: false`) [PASS].
$\rightarrow$ **Trạng thái:** **PASS 100%**.

---

## 2. BẢNG BẰNG CHỨNG 10 ẢNH CHỤP GIAO DIỆN (CHROME CDP · DPR = 2)

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 407,136 | `c134594e4ab68e2215d2cb23ebced97a69a2cdcebb7b8707cc69be0068f5cc52` | **UI-HEADER-01/UI-SIDEBAR-01:** Desktop 1440x900 Header tối giản 2 vùng (Breadcrumb/Tiêu đề + Search Ctrl+K) & Sidebar mở rộng với nút Toggle cạnh Logo, Scope chuyển về Workspace, Sync/Thông báo/User Profile trong chân Sidebar |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 322,747 | `fc5f2e5c13915523d2d0b7babaf7e6f813745d7ff50a28fe67c1898537ce1081` | **UI-SIDEBAR-01:** Desktop 1440x900 Sidebar thu gọn (72px) với nút Toggle đặt cạnh Logo, icon PanelLeftOpen, tooltip Ctrl+B, không tự mở khi hover |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 345,161 | `46f3ce55db9c61e4228a7d781fcde55d7530003ae3a973b8fd3136463ea37f5e` | Viewport 1280x720: Header 2 vùng 1 dòng tuyệt đối không tràn, cân đối điều hướng ngữ cảnh |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 446,558 | `785d1159447d07a4fd7ff3324091a058bbca45fda0f4a99453d9b4910c7d74ad` | Widescreen 1920x1080: Bố cục Header 2 vùng và Sidebar mở rộng sắc nét, tỷ lệ hoàn hảo |
| 5 | `redesign_desktop_1280_contracts_table_expanded.png` | 1280x720 | 2 | 2560x1440 | 352,039 | `2d272a8a3138659eb02c5545aa0875a27a77ee1b9be9e376149eb6f803c36b55` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi **Sidebar MỞ RỘNG (248px)**: 6 cột cân đối, không tràn ngang (`scrollWidth=1274 <= 1280`), cột Thao tác sticky-right luôn ghim sát phải |
| 6 | `redesign_desktop_1280_contracts_table_collapsed.png` | 1280x720 | 2 | 2560x1440 | 318,753 | `3fce62ef9a214a2dfa96077416bdf5f3d3363fe452dde52be5c92ca8996f2371` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi **Sidebar THU GỌN (72px)**: Vùng hiển thị mở rộng, cột Thao tác sticky-right ghim cố định |
| 7 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 480,820 | `ca96576e0d3a5079b7d3559122f77e833b57c62aa10c3c84a63c24698d575fe0` | **FIN-UI-03:** Bảng danh sách hợp đồng Desktop 1440x900: Mã HĐ ngắn (HD-WF-010A, HD-S2R-105), badge "Từ sổ cũ", phân rã cọc cam kết và thực thu chuẩn hóa |
| 8 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 497,350 | `8cb62388ade18aa69ff10ebd5803195fb1c30ad53ae7bdbbdc2759ca3a142c28` | **UI-06:** Menu ba chấm ActionMenu mở bằng Portal: Nổi trên toàn bộ bảng, nằm trọn trong viewport (`top: 406, bottom: 569`), không bị cắt |
| 9 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 141,503 | `8eb5c3d01998d2b7882dceee3c0975faece536dbcd81c3eeb16d8fbccc12e6ad` | **C2-00/QA-03/FIN-UI-03:** Thẻ hợp đồng Mobile (390x844) và Mobile Header 44px+: 26/26 controls đạt chuẩn touch target $\ge 44\times 44\text{px}$ |
| 10 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 110,406 | `a5bb2dbda9a64dee680fd658e4210df9bd32773cff3635cbb0c591d26a3755e1` | **C2-00/UI-07-FIX-04/QA-06:** Contextual Bottom Sheet với Focus trap, khóa cuộn nền (`bodyLocked: true`), `role="dialog"`, `aria-modal="true"`, safe-area insets và điều hướng bàn phím CDP xác thực |

---

## 3. TỔNG HỢP QUALITY GATES ĐẠT ĐƯỢC

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| `GATE_HEADER_SIDEBAR_UX` | Nút toggle Sidebar cạnh Logo, Header 2 vùng, chuyển Scope/Notif/Profile (`QA-HEADER-01`) | Toggle cạnh logo, header 64px 2 vùng, hoán chuyển chức năng hoàn tất | **PASS** |
| `GATE_HOVER_EXPAND_STABILITY` | Sidebar thu gọn không tự động bung ra khi rê chuột (`UI-SIDEBAR-01`) | `animateOnHover={false}`, giữ vững 72px khi mouseenter | **PASS** |
| `GATE_TOUCH_TARGETS_44PX` | Toàn bộ controls Mobile $\ge 44\times 44\text{px}$ (`C2-00`) | 26/26 controls quét tự động đạt chuẩn $\ge 44\text{px}$ | **PASS** |
| `GATE_GLOBAL_SHEETS_A11Y` | Focus trap, Escape, scroll lock cho mọi sheet (`C2-00`) | Action sheet, Scope sheet, Notif sheet đều đạt | **PASS** |
| `GATE_SIDEBAR_RAIL_CURSOR` | Cursor pointer cho toggle rail (`C2-00`) | Đổi thành cursor-pointer, w-4 hover visual | **PASS** |
| `GATE_FULL_SCROLL_RANGE_TABLE` | Cuộn ngang không mất sticky ở mọi vị trí (`C2-00`) | Đạt tại `scrollLeft = 0`, `mid`, `max` | **PASS** |
| `GATE_MANIFEST_DISK_ALIGNMENT` | Không có tệp mồ côi, 100% khớp manifest (`C2-00`) | 10/10 tệp quản lý, tệp cũ đã archive | **PASS** |
| `GATE_TABLE_MULTI_VIEWPORT` | Bảng hợp đồng tại 1280, 1366, 1440, 1920 (`QA-04`) | 8/8 cấu hình không tràn ngang, sticky column chuẩn | **PASS** |
| `GATE_SIDEBAR_STATE_VERIFIED` | Khẳng định thực tế data-state của Sidebar (`QA-04-FIX-01`) | Kiểm tra `data-state === targetState`, tách 2 ảnh 1280px | **PASS** |
| `GATE_HIT_TEST_VISIBLE` | Nút thao tác không bị che khuất (`QA-04-FIX-02`) | `document.elementFromPoint` đạt trên 8/8 cấu hình và Zoom 125% | **PASS** |
| `GATE_CDP_KEYBOARD_A11Y` | Tương tác bàn phím CDP trên Mobile Sheet (`QA-06`) | Focus trap tuần hoàn Tab, Escape đóng modal & trả focus | **PASS** |
| `GATE_DEPOSIT_FORMAT_SEMANTICS` | Cảnh báo tiền cọc chuẩn ngữ nghĩa (`FIN-UI-03`) | Trung tính cho đã thu thiếu, đỏ cho còn thiếu, xanh cho đủ | **PASS** |
| `GATE_CONTRACT_SHORT_CODE` | Đơn nguồn & va chạm nâng cao (`QA-05-FIX-01`) | Nguồn sự thật Console, kiểm thử 113 HĐ đa tòa & tái ký | **PASS** |
| `GATE_BUILD_TYPECHECK` | `tsc -b` & Vite build production | 0 lỗi biên dịch, build thành công cả 2 packages | **PASS** |
| `GATE_LINT_HYGIENE` | `oxlint src` & `oxlint src server scripts` | 0 errors, 42 warnings | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản sản xuất `admin@adhome.vn` bất biến | Không bị chỉnh sửa, dọn dẹp actor kiểm thử tự động | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không sửa đổi tài nguyên landing | `apps/landing/public/` giữ nguyên ngày `2026-10-31` | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 10/10 file ảnh trên đĩa khớp mã băm SHA-256 (`QA-07`) | 100% SHA-256 và byte size khớp hoàn toàn | **PASS** |

**Kết luận đợt triển khai:** Toàn bộ các yêu cầu của `UI-SIDEBAR-01`, `UI-HEADER-01`, `UI-HEADER-02` và tiêu chuẩn nghiệm thu `QA-HEADER-01` đã được hoàn thành 100%, có bằng chứng Chrome CDP thực nghiệm, mã băm SHA-256 khớp tuyệt đối trên đĩa.
