# ADHOME CONSOLE V2 — EVIDENCE BATCH: UI-REDESIGN-e60b23d

**Mã đợt bằng chứng:** `UI-REDESIGN-e60b23d`  
**Git Commit HEAD:** [`e60b23df6e3ace3d3bc7b92a5b072e22426d12b9`](https://github.com/tcandt/adhome-platform/commit/e60b23df6e3ace3d3bc7b92a5b072e22426d12b9)  
**Thời điểm ghi nhận:** 02/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi:** `UI-SIDEBAR-02` (App Shell Floating Toggle), `UI-HEADER-03` (Desktop Header 64px phẳng 2 vùng), `QA-HEADER-01` (Acceptance Suite), Deterministic 2-Tier Workspace Toolbar.  
**Môi trường:** Native Windows 11 Pro, Node.js `v24.15.0`, PostgreSQL 18 Local, strict **NO Docker**, Landing RC1 feature freeze.

---

## 1. Tóm tắt nội dung thay đổi & Cải tiến kỹ thuật

Đợt thay đổi này giải quyết triệt để các khiếm khuyết trong bản thiết kế cũ (Commit `8615eff`):
1. **Kiến trúc App Shell Floating Toggle (`UI-SIDEBAR-02`):**
   - Nút toggle điều hướng được đưa ra ngoài DOM của Sidebar và Header, render tại cấp `DesktopShell`.
   - Vùng chạm chuẩn $44 \times 44\text{px}$.
   - Tọa độ $Y$ cố định tuyệt đối ở `top: 10px` (căn giữa header 64px).
   - Tọa độ $X$ chuyển dịch tịnh tiến mượt mà: $X=256\text{px}$ (mở rộng) $\leftrightarrow$ $X=80\text{px}$ (thu gọn).
   - Duy nhất một phần tử `<button>` luôn mount trong DOM, giữ nguyên icon Hamburger (`Menu`) và bảo toàn focus bàn phím của trình duyệt.
   - Gỡ bỏ vĩnh viễn `SidebarRail` và `SidebarTrigger` cũ; phím tắt `Ctrl+B` được quản lý duy nhất bởi Animate UI Provider (loại trừ input tag).
2. **Desktop Header tối giản 2 vùng phẳng 64px (`UI-HEADER-03`):**
   - Chiều cao cố định $64\text{px}$ (`h-16`) ở cả 2 trạng thái mở rộng và thu gọn.
   - Vùng an toàn `pl-16` bảo đảm khoảng thở không va chạm giữa nút floating toggle và tiêu đề Breadcrumb (`safeZoneOk: true`).
   - Chuyển Scope selector về Workspace; Sync, Notifications, Profile đặt tại chân Sidebar (`SidebarFooter`).
3. **Deterministic 2-Tier Toolbar tại Operational Workspace:**
   - Tầng 1: Tiêu đề phân hệ + Phân cấp hành động rõ ràng (Utility "Đồng bộ" $\to$ Secondary "Import sổ cũ" $\to$ Primary CTA "Lập hợp đồng mới").
   - Tầng 2: Ngữ cảnh tòa nhà và kỳ thanh toán (Building Scope + Period selector), chống vỡ dòng trên màn hình nhỏ.

---

## 2. Danh mục 10 ảnh bằng chứng thực tế (Chrome CDP · DPR = 2)

| STT | Tên file ảnh (Click xem) | Viewport CSS | Pixel thực | Kích thước | SHA-256 Checksum | Mô tả kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| 1 | [`redesign_desktop_1440_header_expanded.png`](screenshots/redesign_desktop_1440_header_expanded.png) | 1440x900 | 2880x1800 | 405,999 bytes | `e262c7cd72b4c82c23b432054b63dd0849012b9897679fc3381aa2a631164233` | **UI-HEADER-03/UI-SIDEBAR-02:** Desktop 1440x900 App Shell Floating Toggle ($X=256\text{px}$, $Y=10\text{px}$, $44\times 44\text{px}$), Header phẳng 2 vùng & Sidebar mở rộng ($248\text{px}$), Logo độc lập, Scope trong Workspace, Sync/Notif/Profile ở chân Sidebar |
| 2 | [`redesign_desktop_1440_header_collapsed.png`](screenshots/redesign_desktop_1440_header_collapsed.png) | 1440x900 | 2880x1800 | 323,825 bytes | `22b135a8b38fa725604e530f8481edef7db7e50ac754f88a027ff91c220e8b5c` | **UI-SIDEBAR-02:** Desktop 1440x900 Sidebar thu gọn ($72\text{px}$) với App Shell Floating Toggle ($X=80\text{px}$, $Y=10\text{px}$, $44\times 44\text{px}$), icon Menu, không drop dưới logo, giữ nguyên focus bàn phím, Header $64\text{px}$ phẳng |
| 3 | [`redesign_desktop_1280_header_contracts.png`](screenshots/redesign_desktop_1280_header_contracts.png) | 1280x720 | 2560x1440 | 344,180 bytes | `8fa5c1be1f70ed7ea49a0a0fcb8eb334e1ac7f9293354a16109595814641571c` | **UI-01:** Desktop 1280x720 Header không tràn 2 dòng, các cụm điều hướng và context tòa nhà cân đối |
| 4 | [`redesign_desktop_1920_header_overview.png`](screenshots/redesign_desktop_1920_header_overview.png) | 1920x1080 | 3840x2160 | 445,407 bytes | `1a6beab0d95d3080f07c1d11281c6d8c5521f49040dcc8e54b754ea63198303a` | **UI-01:** Desktop 1920x1080 Header trên màn hình rộng 1080p, bố cục sắc nét không vỡ tỷ lệ |
| 5 | [`redesign_desktop_1280_contracts_table_expanded.png`](screenshots/redesign_desktop_1280_contracts_table_expanded.png) | 1280x720 | 2560x1440 | 349,355 bytes | `503839c23cb11c74b1c1cd25799fa6131c1ee56627c3216c1bcda43b0b31b78e` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi Sidebar MỞ RỘNG ($248\text{px}$): 6 cột cân đối, không tràn ngang (`scrollWidth=1274 <= 1280`), cột Thao tác sticky-right ghim sát phải |
| 6 | [`redesign_desktop_1280_contracts_table_collapsed.png`](screenshots/redesign_desktop_1280_contracts_table_collapsed.png) | 1280x720 | 2560x1440 | 287,895 bytes | `0276287014ed56d5fd35c07d9a33cf4f94d79f33c5f395b6b58ccbe5e00b8e81` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi Sidebar THU GỌN ($72\text{px}$): Vùng hiển thị mở rộng, cột Thao tác sticky-right ghim cố định |
| 7 | [`redesign_desktop_contracts_table_polished.png`](screenshots/redesign_desktop_contracts_table_polished.png) | 1440x900 | 2880x1800 | 468,576 bytes | `4764fdb49d36e027efd382e75eb9462b245dcc0a27f3d231a6344c17f4880e2f` | **UI-04/05/FIN-UI-03:** Bảng danh sách hợp đồng Desktop 1440x900: Mã HĐ ngắn (HD-WF-010A), badge "Từ sổ cũ", định dạng tiền tệ nowrap, phân rã cọc cam kết và thực thu chuẩn hóa, cột Thao tác sticky-right |
| 8 | [`redesign_desktop_contracts_menu_open.png`](screenshots/redesign_desktop_contracts_menu_open.png) | 1440x900 | 2880x1800 | 485,275 bytes | `8a2e79be175d68795a34863c919c2047b093fe18ddd752e3d3942f57848977ba` | **UI-06:** Menu ba chấm mở bằng Portal tại dòng hợp đồng, hiển thị đầy đủ trong viewport, không bị cắt bởi table container |
| 9 | [`redesign_mobile_390x844_contracts_cards.png`](screenshots/redesign_mobile_390x844_contracts_cards.png) | 390x844 | 780x1688 | 135,859 bytes | `aa8ecd3185b902b156e37b70e174f8de0fb986cfdb85ea795ac903b2a52dcf9d` | **UI-07/FIN-UI-03:** Thẻ hợp đồng Mobile (390x844): Giá thuê nowrap không bị xuống dòng, mã HĐ ngắn, cọc thực thu chuẩn hóa, nút Bàn giao $44\text{px}+$ |
| 10 | [`redesign_mobile_390x844_actions_bottom_sheet.png`](screenshots/redesign_mobile_390x844_actions_bottom_sheet.png) | 390x844 | 780x1688 | 107,886 bytes | `641efee205d055483b54fe77bec10be641d66846bc3c89b8849972f561ed73eb` | **UI-07/QA-06:** Action Bottom Sheet trên Mobile mở từ thẻ hợp đồng với grab-bar, contextual header (tòa/phòng, mã HĐ, trạng thái), safe-area padding và touch targets $44\text{px}+$ |

---

## 3. Trạng thái Quality Gates

- `GATE_HEADER_SIDEBAR_UX`: **PASS**
- `GATE_HOVER_EXPAND_STABILITY`: **PASS**
- `GATE_TOUCH_TARGETS_44PX`: **PASS**
- `GATE_GLOBAL_SHEETS_A11Y`: **PASS**
- `GATE_MULTI_VIEWPORT_TABLES`: **PASS**
- `GATE_TABLE_ACTIONS_HITTEST`: **PASS**
- `GATE_EVIDENCE_INTEGRITY`: **PASS**
- `GATE_SECURITY_INVARIANTS`: **PASS**
- `BUILD & LINT`: **PASS** (0 errors)

Chi tiết hồ sơ nghiệm thu kỹ thuật xem tại: [`ACCEPTANCE_REPORT.md`](ACCEPTANCE_REPORT.md).
