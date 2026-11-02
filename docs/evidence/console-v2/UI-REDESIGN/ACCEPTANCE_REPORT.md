# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU REMEDIATION & QA-HEADER-01
**Mã tài liệu:** `ADHOME-CONSOLE-V2-REMEDIATION-ACCEPTANCE-2026-11-02`  
**Các Task hoàn thành:** `UI-SIDEBAR-02`, `UI-HEADER-03`, `QA-HEADER-01`, `C2-00-R1`, `C2-00` (Baseline & QA Remediation), `QA-04-FIX-01`, `QA-04-FIX-02`, `QA-06`, `UI-07-FIX-04`, `QA-05-FIX-01`, `QA-07`  
**Thời điểm thực hiện:** 02/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI REMEDIATION & KIẾN TRÚC HEADER/SIDEBAR UX (C2-00-R2)

Đáp ứng triệt để phản hồi kiểm toán độc lập và chỉ đạo kỹ thuật từ Chủ dự án (PO) đánh giá bản thiết kế trước đạt 4/10 với các khiếm khuyết về kiến trúc điều hướng:
1. Nút thu gọn/mở rộng bị gắn bên trong `SidebarHeader` dẫn đến việc rơi xuống dưới Logo khi thu gọn, kích thước nút không đồng nhất ($32\text{px}$ và $28\text{px}$ không đạt chuẩn $\ge 44\text{px}$).
2. Chiều cao header bị lệch giữa trạng thái mở rộng ($64\text{px}$) và thu gọn ($80\text{px}$).
3. `SidebarRail` vẫn còn tồn tại tạo ra nút toggle ngầm thứ hai ngoài ý muốn.
4. Hai component nút khác nhau mount/unmount theo trạng thái gây mất focus bàn phím của người dùng.
5. Sự kiện `Ctrl+B` bị trùng lặp listener giữa `DesktopShell` và `Provider` của Animate UI.
6. Toolbar phân hệ chưa có cấu trúc phân tầng rõ ràng, các nút hành động bị wrap tự do.

Đợt triển khai này đã hoàn thiện giải pháp kiến trúc **App Shell Floating Toggle** và **Deterministic 2-Tier Toolbar** theo chuẩn Animate UI:

### 1.1. `UI-SIDEBAR-02` — Kiến Trúc App Shell Floating Toggle Độc Lập
- **Nguyên lý độc lập DOM:**
  - Nút toggle (`AppShellSidebarToggle.tsx`) được render trực tiếp tại cấp `DesktopShell`, **hoàn toàn nằm ngoài cây DOM** của `DesktopSidebar` và `DesktopHeader`.
  - Nằm trên đường biên giữa Sidebar và Workspace Content với `position: fixed; z-index: 30`.
- **Đồng nhất tọa độ Y & Chuyển dịch X mượt mà:**
  - Tọa độ $Y$ cố định tuyệt đối ở `top: 10px`, căn chính giữa Header $64\text{px}$ (`(64 - 44) / 2 = 10px`) trong mọi trạng thái.
  - Tọa độ $X$ chuyển dịch tịnh tiến qua CSS transform:
    - Khi mở rộng ($248\text{px}$): $X = 248 + 8 = 256\text{px}$.
    - Khi thu gọn ($72\text{px}$): $X = 72 + 8 = 80\text{px}$.
  - Thời gian và hàm gia tốc chuyển động tái sử dụng trực tiếp CSS variables của Animate UI (`var(--animate-ui-sidebar-duration, 280ms)` và easing `cubic-bezier(0.77, 0, 0.175, 1)`).
- **Phần tử duy nhất bảo toàn Focus (Single Always-Mounted Button):**
  - Sử dụng duy nhất một phần tử `<button>` luôn mount trong DOM, giữ nguyên icon Menu (hamburger), tooltip trực quan và `aria-expanded` tương ứng.
  - Sau khi click hoặc chuyển đổi, tiêu điểm bàn phím (`document.activeElement`) được bảo toàn 100%.
  - Chuẩn kích thước vùng chạm: đúng $44 \times 44\text{px}$ (`APP_SHELL_TOGGLE_SIZE = 44`).
- **Loại bỏ hoàn toàn SidebarRail & Listener trùng lặp:**
  - Đã xóa bỏ hoàn toàn component `SidebarRail` và `SidebarTrigger` cũ khỏi `animate-sidebar.tsx`.
  - Gỡ bỏ window listener trùng lặp cho `Ctrl+B` tại `DesktopShell`, giao toàn quyền quản lý shortcut cho Animate UI `Provider` (đã có sẵn cơ chế loại trừ input/textarea/select/contenteditable).
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.2. `UI-HEADER-03` — Desktop Header 2 Vùng Phẳng 64px & Safe Zone Không Va Chạm
- **Chiều cao 64px phẳng đồng nhất:**
  - Gỡ bỏ toàn bộ logic custom height; Header luôn cố định $64\text{px}$ (`h-16`) ở mọi trạng thái mở rộng hoặc thu gọn.
- **Safe Zone bảo vệ Tiêu đề phân hệ:**
  - Thiết lập vùng an toàn `pl-16` ($64\text{px}$) ở đầu Header: đảm bảo khoảng cách $12\text{px}$ thở tự nhiên giữa mép phải nút Floating Toggle ($52\text{px}$ từ mép nội dung) và tiêu đề Breadcrumb.
  - Tiêu đề và nút toggle không bao giờ xảy ra va chạm hay đè lên nhau (`safeZoneOk: true`).
- **Header tối giản 2 vùng chức năng:**
  - **Vùng 1 (Trái):** Tiêu đề phân hệ và Breadcrumbs ngữ cảnh (`data-testid="console-header-title"`).
  - **Vùng 2 (Phải):** Command Search (`data-testid="console-global-search-trigger"`) kích hoạt bằng `Ctrl+K`.
  - Các chức năng phạm vi (Building Scope) được chuyển về Workspace; Thông báo, PostgreSQL Sync và Hồ sơ người dùng đặt tại chân Sidebar (`SidebarFooter`).
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.3. Phân Tầng Toolbar Xác Định 2 Tầng (Deterministic 2-Tier Toolbar)
- Triển khai tại [`OperationalModuleWorkspace.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/OperationalModuleWorkspace.tsx):
  - **Tầng 1 (Hành động & Tiêu đề):** `data-testid="module-workspace-toolbar"`.
    - Phía trái: Tiêu đề phân hệ và mô tả ngắn.
    - Phía phải: Phân cấp hành động rõ ràng (`data-testid="module-toolbar-actions"`):
      - Tiện ích (Utility): Nút "Đồng bộ" (`RefreshCw`, `btn-module-refresh`).
      - Thứ cấp (Secondary): Nút "Import sổ cũ" (`btn-open-legacy-import`).
      - Điểm nhấn chính (Primary CTA): Nút "Lập hợp đồng mới" (`btn-open-create-contract`).
  - **Tầng 2 (Ngữ cảnh):** `data-testid="module-toolbar-context"`:
    - Chứa bộ chọn tòa nhà (`BuildingScopeSelector`) và thanh chọn kỳ thanh toán (`period-selector-toolbar`).
    - Nằm gọn gàng bên dưới tầng 1, ngăn chặn triệt để hiện tượng wrap nút gây vỡ layout trên các viewport $1280\text{px}$ và $1366\text{px}$.
$\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.4. `QA-HEADER-01` — Nghiệm Thu Thực Nghiệm Tương Tác & Bố Cục Qua Chrome CDP
Toàn bộ kịch bản nghiệm thu tự động trong [`captureRedesignScreenshots.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/captureRedesignScreenshots.mjs) đã vượt qua với kết quả **100% PASS**:
1. **Assertion 1 — Độc lập kiến trúc & Header sạch 2 vùng:**
   - `toggleExists: true`, `inSidebar: false`, `inHeader: false`, `inSidebarHeader: false`.
   - Kích thước nút toggle: $44 \times 44\text{px}$ ($\ge 44\text{px}$).
   - Chiều cao Header: chuẩn $64\text{px}$.
   - Toàn bộ clutter controls trong Header = false (`hasTrigger: false`, `hasScope: false`, `hasNotifications: false`, `hasUserMenu: false`, `hasSync: false`).
   - Khoảng an toàn tiêu đề: `safeZoneOk: true` ($X=256\text{px}$, $Y=10\text{px}$).
2. **Assertion 2 — Chuyển trạng thái con trỏ, tọa độ & Focus:**
   - Ban đầu mở rộng: width = $248\text{px}$, toggleLeft = $256\text{px}$, toggleTop = $10\text{px}$.
   - Click thu gọn: width = $72\text{px}$, toggleLeft = $80\text{px}$, toggleTop = $10\text{px}$, `aria-expanded="false"`.
   - Tọa độ $Y$ không đổi ($10\text{px}$).
3. **Assertion 3 — Ổn định rê chuột (Hover Stability):**
   - Dispatch sự kiện `mouseenter` & `mousemove` trên sidebar thu gọn: giữ nguyên $72\text{px}$, không tự bung (`animateOnHover={false}`).
   - Click mở rộng lại: width = $248\text{px}$, toggleLeft = $256\text{px}$, toggleTop = $10\text{px}$.
4. **Assertion 4 — Phím tắt toàn cục `Ctrl+B` & Loại trừ ô nhập liệu:**
   - Bấm `Ctrl+B`: thu gọn về $72\text{px}$.
   - Tạo phần tử `<input>`, focus và bấm `Ctrl+B`: trạng thái giữ nguyên $72\text{px}$, không bị kích hoạt ngoài ý muốn.
   - Bấm `Ctrl+B`: mở rộng lại $248\text{px}$.
5. **Assertion 5 — Lưu trữ trạng thái qua `localStorage` & Reload:**
   - Thu gọn và kiểm tra `localStorage.getItem('adhome_ui_sidebar_open') === 'false'`.
   - Gọi `Page.reload`: trạng thái sau khi tải lại trang vẫn là `collapsed` ($72\text{px}$).
6. **Assertion 6 — Kiểm tra các control đã dời vị trí:**
   - Building Scope trong Overview: tìm thấy.
   - Live Sync, Notifications popover và User Menu popover trong chân Sidebar (`SidebarFooter`): tìm thấy, phím `Escape` đóng mượt mà.
7. **Assertion 7 — Độ ổn định đa Viewport & Mô phỏng Zoom:**
   - Thử nghiệm trên ma trận viewport: $1024\text{px}$, $1280\text{px}$, $1366\text{px}$, $1440\text{px}$, $1920\text{px}$.
   - Thử nghiệm mô phỏng Zoom: $1280\text{px}$ @ 125% zoom ($1024\text{px}$), $1440\text{px}$ @ 125% zoom ($1152\text{px}$), $1920\text{px}$ @ 150% zoom ($1280\text{px}$).
   - Toàn bộ đều đạt chiều cao Header $64\text{px}$ và **0 pixel tràn ngang** (`overflow: false`).
8. **Assertion 8 — Toolbar phân hệ 2 tầng xác định:**
   - Phân hệ Hợp đồng (`contracts`): `hasToolbar: true`, `hasActions: true`, `hasContext: true`, đầy đủ các nút `Refresh`, `Import`, `Create` và `ScopeSelector`.
$\rightarrow$ **Trạng thái:** **PASS 100%**.

---

## 2. BẢNG BẰNG CHỨNG 10 ẢNH CHỤP GIAO DIỆN (CHROME CDP · DPR = 2)

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 405,999 | `e262c7cd72b4c82c23b432054b63dd0849012b9897679fc3381aa2a631164233` | **UI-HEADER-03/UI-SIDEBAR-02:** Desktop 1440x900 App Shell Floating Toggle ($X=256\text{px}$, $Y=10\text{px}$, $44\times 44\text{px}$), Header tối giản 2 vùng (Breadcrumb/Tiêu đề + Search Ctrl+K) & Sidebar mở rộng ($248\text{px}$), Logo độc lập, Scope trong Workspace, Sync/Thông báo/Profile ở chân Sidebar |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 323,825 | `22b135a8b38fa725604e530f8481edef7db7e50ac754f88a027ff91c220e8b5c` | **UI-SIDEBAR-02:** Desktop 1440x900 Sidebar thu gọn ($72\text{px}$) với App Shell Floating Toggle ($X=80\text{px}$, $Y=10\text{px}$, $44\times 44\text{px}$), icon Menu, không drop dưới logo, giữ nguyên focus, Header $64\text{px}$ phẳng |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 344,180 | `8fa5c1be1f70ed7ea49a0a0fcb8eb334e1ac7f9293354a16109595814641571c` | **UI-01:** Desktop 1280x720 Header không tràn 2 dòng, các cụm điều hướng và context tòa nhà cân đối |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 445,407 | `1a6beab0d95d3080f07c1d11281c6d8c5521f49040dcc8e54b754ea63198303a` | **UI-01:** Desktop 1920x1080 Header trên màn hình rộng 1080p, bố cục sắc nét không vỡ tỷ lệ |
| 5 | `redesign_desktop_1280_contracts_table_expanded.png` | 1280x720 | 2 | 2560x1440 | 349,355 | `503839c23cb11c74b1c1cd25799fa6131c1ee56627c3216c1bcda43b0b31b78e` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi Sidebar MỞ RỘNG ($248\text{px}$): 6 cột cân đối, không tràn ngang (`scrollWidth=1274 <= 1280`), cột Thao tác sticky-right luôn ghim sát phải |
| 6 | `redesign_desktop_1280_contracts_table_collapsed.png` | 1280x720 | 2 | 2560x1440 | 287,895 | `0276287014ed56d5fd35c07d9a33cf4f94d79f33c5f395b6b58ccbe5e00b8e81` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi Sidebar THU GỌN ($72\text{px}$): Vùng hiển thị mở rộng, cột Thao tác sticky-right ghim cố định |
| 7 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 468,576 | `4764fdb49d36e027efd382e75eb9462b245dcc0a27f3d231a6344c17f4880e2f` | **UI-04/05/FIN-UI-03:** Bảng danh sách hợp đồng Desktop 1440x900: Mã HĐ ngắn (HD-WF-010A, HD-S2R-105), badge "Từ sổ cũ", định dạng tiền tệ nowrap, phân rã cọc cam kết và thực thu chuẩn hóa, cột Thao tác sticky-right |
| 8 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 485,275 | `8a2e79be175d68795a34863c919c2047b093fe18ddd752e3d3942f57848977ba` | **UI-06:** Menu ba chấm mở bằng Portal tại dòng hợp đồng, hiển thị đầy đủ trong viewport, không bị cắt bởi table container |
| 9 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 135,859 | `aa8ecd3185b902b156e37b70e174f8de0fb986cfdb85ea795ac903b2a52dcf9d` | **UI-07/FIN-UI-03:** Thẻ hợp đồng Mobile (390x844): Giá thuê nowrap không bị xuống dòng, mã HĐ ngắn, cọc thực thu chuẩn hóa, nút Bàn giao $44\text{px}+$ |
| 10 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 107,886 | `641efee205d055483b54fe77bec10be641d66846bc3c89b8849972f561ed73eb` | **UI-07/QA-06:** Action Bottom Sheet trên Mobile mở từ thẻ hợp đồng với grab-bar, contextual header (tòa/phòng, mã HĐ, trạng thái), safe-area padding và touch targets $44\text{px}+$ |

---

## 3. TỔNG HỢP QUALITY GATES ĐẠT ĐƯỢC

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| `GATE_HEADER_SIDEBAR_UX` | Nút toggle Sidebar App Shell Floating ngoài DOM, Header 2 vùng phẳng 64px, chuyển Scope/Notif/Profile (`QA-HEADER-01`) | Toggle nổi độc lập ($X=256/80\text{px}$, $Y=10\text{px}$), Header $64\text{px}$ phẳng 2 vùng, safe zone không va chạm | **PASS** |
| `GATE_HOVER_EXPAND_STABILITY` | Sidebar thu gọn không tự động bung ra khi rê chuột (`UI-SIDEBAR-01` / `02`) | `animateOnHover={false}`, giữ vững $72\text{px}$ khi mouseenter/mousemove | **PASS** |
| `GATE_TOUCH_TARGETS_44PX` | Toàn bộ controls Mobile & Floating Toggle $\ge 44\times 44\text{px}$ | 26/26 controls Mobile và nút Toggle Desktop đạt chuẩn $\ge 44\times 44\text{px}$ | **PASS** |
| `GATE_GLOBAL_SHEETS_A11Y` | Focus trap, Escape, scroll lock cho mọi sheet (`C2-00`) | Action sheet, Scope sheet, Notif sheet đều đạt | **PASS** |
| `GATE_MULTI_VIEWPORT_TABLES` | Bảng hợp đồng không tràn ngang trên 1280, 1366, 1440, 1920 (`QA-04`) | Toàn bộ 4 viewports x 2 trạng thái sidebar đều không tràn, cột sticky ghim chuẩn | **PASS** |
| `GATE_TABLE_ACTIONS_HITTEST` | Hit-test cột sticky và action menu trigger bằng `document.elementFromPoint` | 100% hit-test hợp lệ, không bị che khuất | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 100% ảnh khớp SHA-256 manifest, zero unmanaged files (`QA-07`) | 10/10 file ảnh khớp SHA-256 byte-by-byte, 0 unmanaged files | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản Admin sản xuất (`admin@adhome.vn`) 100% bất biến | Trước và sau test: 100% khớp snapshot byte-by-byte | **PASS** |
