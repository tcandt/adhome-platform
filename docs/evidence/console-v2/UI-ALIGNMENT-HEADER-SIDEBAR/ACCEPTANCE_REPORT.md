# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU KIẾN TRÚC HEADER & SIDEBAR ALIGNMENT
**Mã tài liệu:** `ADHOME-CONSOLE-V2-UI-ALIGNMENT-2026-11-02`  
**Các Task hoàn thành:** `UI-ALIGNMENT-HEADER-SIDEBAR`, `UI-HEADER-03`, `UI-SIDEBAR-02`, `QA-HEADER-01`, `QA-04`, `QA-04-FIX-01`, `QA-04-FIX-02`, `QA-06`, `UI-07-FIX-04`, `QA-03`, `QA-07`  
**Thời điểm thực hiện:** 02/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI THEO THIẾT KẾ ĐỐI CHIẾU

Đáp ứng chính xác chỉ đạo và hình ảnh thiết kế chuẩn từ Người dùng (`media_1793585166675_cf5ab730.png` và `media_1793585198876_065dc885.png`), toàn bộ kiến trúc Desktop Header và Sidebar đã được căn chỉnh đồng bộ:

### 1.1. Bố Cục Desktop Header Chuẩn Hóa
- **Cụm bên trái (Left Zone):**
  1. **Nút Sidebar Toggle `[ ≡ ]`** (`data-testid="console-sidebar-toggle"`):
     - Dạng hình vuông bo tròn (`rounded-xl`, viền `border border-slate-200/90 dark:border-slate-700/80`, nền `bg-white dark:bg-slate-800/80`).
     - Kích thước đạt chuẩn touch target: $44 \times 44\text{px}$ (`h-11 w-11 min-w-[44px] min-h-[44px]`).
     - Đặt ngay tại mép trái Header, điều khiển đóng/mở Sidebar (`state: expanded <-> collapsed`).
  2. **Thanh tìm kiếm toàn hệ thống `[ 🔍 Tìm phòng, khách, hợp đồng... Ctrl + K ]`** (`data-testid="console-global-search-trigger"`):
     - Dạng viên thuốc mềm mại (`rounded-full`), chiều cao $44\text{px}$ (`h-11 min-h-[44px]`), viền tinh tế, icon `Search` phía trước và nhãn phím tắt `Ctrl + K` phía sau.
- **Cụm bên phải (Right Zone):**
  1. **Nút Thông báo hệ thống `[ 🔔 1 ]`** (`data-testid="console-notifications-trigger"`):
     - Nút tròn (`rounded-full`), kích thước $44 \times 44\text{px}$ (`h-11 w-11 min-w-[44px] min-h-[44px]`).
     - Huy hiệu số lượng chưa đọc màu đỏ nổi bật (`data-testid="console-notifications-unread-badge"`).
     - Nhấn mở Popover danh sách thông báo vận hành (`data-testid="console-notifications-popover"`), hỗ trợ đóng bằng click ngoài hoặc phím `Escape`.
  2. **Nút Hồ sơ Quản trị `[ RA ]`** (`data-testid="console-user-menu-trigger"`):
     - Avatar tròn xanh dương (`rounded-full bg-blue-600`), kích thước $44 \times 44\text{px}$, chữ viết tắt tài khoản màu trắng (`RA`).
     - Nhấn mở Popover quản lý tài khoản (`data-testid="console-user-menu-popover"`), hiển thị Role badge, Scope badge, chuyển đổi Theme Sáng/Tối và Đăng xuất an toàn.
- **Chiều cao và viền:** Cố định phẳng $64\text{px}$ (`h-16`), viền dưới `border-b border-slate-200/90 dark:border-slate-800/90`, nền trắng mờ `backdrop-blur-md`.

---

### 1.2. Bố Cục Sidebar Khi Mở Rộng & Thu Gọn
- **Trạng thái Mở rộng (Expanded - 248px):**
  - **Sidebar Header:** Hiển thị Logo đầy đủ của AdHome ("AdHome Smart Property Management") với icon nhà xanh và text thương hiệu (`BrandLogo collapsed={false}`). Header không chứa nút toggle để đảm bảo nhận diện thương hiệu nguyên vẹn, tinh tế.
  - **Sidebar Content:** Các nhóm phân hệ nghiệp vụ (`VẬN HÀNH CỐT LÕI`, `TÀI CHÍNH VÀ TỔNG HỢP`, `HỆ THỐNG`) hiển thị đầy đủ icon, tên module và huy hiệu đếm số lượng (`44`, `1`, `9`, `14`). Phân hệ đang chọn hiển thị thanh chỉ thị màu xanh ở mép trái (`h-5 w-1 rounded-r-full bg-brand-primary`), nền xanh dịu và chữ đậm.
  - **Sidebar Footer:** Hiển thị trạng thái kết nối `PostgreSQL Live` đồng bộ thời gian thực (`console-sync-status`).
- **Trạng thái Thu gọn (Collapsed - 72px):**
  - **Sidebar Header:** Chỉ hiển thị biểu tượng icon nhà AdHome ở chính giữa (`BrandLogo collapsed={true}`).
  - **Sidebar Content:** Chỉ hiển thị biểu tượng điều hướng ở chính giữa, tối ưu tối đa không gian làm việc cho bảng biểu và nội dung chính. Khi rê chuột (hover) vào icon, hiển thị Tooltip tên phân hệ nổi sang phải.
  - **Tính ổn định (Hover Stability):** Thuộc tính `animateOnHover={false}` đảm bảo khi rê chuột qua sidebar thu gọn, thanh điều hướng **không tự ý bung ra**, giữ nguyên không gian làm việc ổn định cho người dùng.

---

## 2. BẢNG BẰNG CHỨNG HÌNH ẢNH MỚI (EVIDENCE MANIFEST)

Toàn bộ 10 ảnh giao diện được chụp tự động bằng Chrome DevTools Protocol (CDP) tại thư mục `docs/evidence/console-v2/UI-ALIGNMENT-HEADER-SIDEBAR/screenshots/`:

| STT | Tên tệp ảnh | Kích thước | SHA-256 Checksum | Mô tả kịch bản kiểm thử |
|---|---|---|---|---|
| 01 | `redesign_desktop_1440_header_expanded.png` | $1440\times 900$ (397.398 B) | `e524403602e190eef9a1e55c866e5efbdd7eb18b25337d79dde4af24282ed862` | Header Desktop với Toggle [≡] 44px, Search Ctrl+K pill, Thông báo có badge đỏ, Profile Admin [RA], Sidebar mở rộng 248px có Logo đầy đủ |
| 02 | `redesign_desktop_1440_header_collapsed.png` | $1440\times 900$ (324.702 B) | `6ce2b788fe19b08b6dfca752bfda66ed248fa429fe53a575fdca001bbdf629f6` | Sidebar thu gọn 72px chỉ hiển thị icon điều hướng và Logo icon mark, Header giữ nguyên 64px với Toggle [≡], Search, Notifications, Profile Admin |
| 03 | `redesign_desktop_1280_header_contracts.png` | $1280\times 720$ (335.381 B) | `3706181622ebd84fe64060b6b6a92ab22c28b0288797515e97f9f5bc4cb9f396` | Header tại 1280x720 phẳng 64px, không tràn 2 dòng, search bar co giãn mượt mà |
| 04 | `redesign_desktop_1920_header_overview.png` | $1920\times 1080$ (437.248 B) | `5289065bdc2a1e0e84f8feab454bf6c0078a7c932b7975a3e0c8d35fc3de0e3d` | Header trên màn hình rộng 1080p, bố cục sắc nét, cân đối tỷ lệ |
| 05 | `redesign_desktop_1280_contracts_table_expanded.png` | $1280\times 720$ (341.137 B) | `2a34a7e50cb8a47da685df7591e51fe53b3937d52901dfdd130cc3074f7eb372` | Bảng hợp đồng tại 1280x720 khi Sidebar mở rộng: 6 cột cân đối, không tràn trang, cột Thao tác sticky-right ghim sát mép |
| 06 | `redesign_desktop_1280_contracts_table_collapsed.png` | $1280\times 720$ (288.571 B) | `8e7859a429bf5c5df827d9f4a420653e3c95b536311198e8491398fde343b23f` | Bảng hợp đồng tại 1280x720 khi Sidebar thu gọn: vùng hiển thị mở rộng tối đa, cột Thao tác sticky-right cố định |
| 07 | `redesign_desktop_contracts_table_polished.png` | $1440\times 900$ (459.655 B) | `847c9efbc53b254b9acebdcfc34bf9d287f2e18d78e2f662b37bf86582a3bbc7` | Bảng hợp đồng Desktop 1440x900 chuẩn hóa: Mã HĐ ngắn (HD-WF-010A), badge "Từ sổ cũ", số tiền nowrap, cọc phân rã rõ ràng |
| 08 | `redesign_desktop_contracts_menu_open.png` | $1440\times 900$ (476.507 B) | `f1a4d05412820fb4146dbe4de3d2ed1d61a550c531f09d699a1955c0df9b1702` | Menu ba chấm mở bằng Portal tại dòng hợp đồng, hiển thị trọn vẹn trong viewport, không bị che khuất |
| 09 | `redesign_mobile_390x844_contracts_cards.png` | $390\times 844$ (135.859 B) | `aa8ecd3185b902b156e37b70e174f8de0fb986cfdb85ea795ac903b2a52dcf9d` | Thẻ hợp đồng Mobile: Giá thuê nowrap, mã HĐ ngắn, cọc thực thu chuẩn hóa, nút Bàn giao 44px+ |
| 10 | `redesign_mobile_390x844_actions_bottom_sheet.png` | $390\times 844$ (107.886 B) | `641efee205d055483b54fe77bec10be641d66846bc3c89b8849972f561ed73eb` | Action Bottom Sheet trên Mobile mở từ thẻ hợp đồng với grab-bar, contextual header, safe-area padding và touch targets 44px+ |

---

## 3. KẾT QUẢ KIỂM TOÁN CÁC QUALITY GATES TỰ ĐỘNG

| Quality Gate | Chỉ số kiểm tra | Tiêu chuẩn nghiệm thu | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| **QA-HEADER-01 (1)** | Vị trí Toggle & Controls Header | Toggle trong Header, không nằm trong Sidebar; Search, Notif, UserMenu đầy đủ | `inHeader: true, hasTrigger: true, hasSearch: true, hasNotifications: true, hasUserMenu: true` | **PASS (100%)** |
| **QA-HEADER-01 (2)** | Touch Target Toggle | Chiều rộng & cao $\ge 44\text{px}$ | $44 \times 44\text{px}$ | **PASS** |
| **QA-HEADER-01 (3)** | Chiều cao Header | Chuẩn phẳng $64\text{px}$ trên mọi viewport | Chiều cao đo được = $64\text{px}$ | **PASS** |
| **QA-HEADER-01 (4)** | Chuyển đổi trạng thái Sidebar | Click toggle chuyển đổi $248\text{px} \leftrightarrow 72\text{px}$ | $248\text{px} \rightarrow 72\text{px} \rightarrow 248\text{px}$, aria-expanded đồng bộ | **PASS** |
| **QA-HEADER-01 (5)** | Độ ổn định khi rê chuột (Hover) | Rê chuột qua Sidebar thu gọn không tự động bung | Width duy trì đúng $72\text{px}$ khi dispatch mouseenter/mousemove | **PASS** |
| **QA-HEADER-01 (6)** | Phím tắt bàn phím Ctrl+B | Bấm Ctrl+B chuyển đổi trạng thái, loại trừ input tag | `collapsed`, input tag typing không kích hoạt ngoài ý muốn | **PASS** |
| **QA-HEADER-01 (7)** | Lưu trạng thái qua LocalStorage | Lưu `adhome_ui_sidebar_open` và giữ nguyên sau F5 | Reload page giữ nguyên trạng thái `collapsed` | **PASS** |
| **QA-HEADER-01 (8)** | Popovers Thông báo & Hồ sơ | Mở từ trigger trên Header, đóng bằng Escape | Popovers hiển thị đầy đủ, phím Escape đóng hoàn hảo | **PASS** |
| **QA-HEADER-01 (9)** | Đa Viewport (1024..1920) & Zoom | Chiều cao Header 64px, không tràn ngang trang | Height 64px, `overflow: false` trên toàn bộ ma trận zoom | **PASS** |
| **QA-04 / FIX-02** | Bảng hợp đồng đa viewport | Sticky action column pinned, hit-test trigger đạt | Không tràn ngang trang, sticky header và cột thao tác cố định | **PASS** |
| **C2-00 Scroll** | Quét cuộn ngang 0 -> mid -> max | Hit-test và ghim cột thao tác tại mọi vị trí cuộn | `allPassed: true` trên cả hai trạng thái Sidebar | **PASS** |
| **UI-06-FIX-01** | ActionMenu Popover Portal | Render qua Portal, nằm trọn trong viewport | Popover $224 \times 163\text{px}$, không bị cắt bởi table container | **PASS** |
| **QA-03 / C2-00** | Mobile Touch Targets | Tất cả nút điều hướng, header, actions $\ge 44\text{px}$ | 26/26 targets đạt $\ge 44 \times 44\text{px}$ (0 vi phạm) | **PASS** |
| **UI-07-FIX-02..04** | Mobile Bottom Sheet A11y | Scroll lock, role dialog, aria-modal, focus trap | Focus trap hoạt động, phím Escape đóng và trả focus về trigger | **PASS** |
| **QA-07** | Toàn vẹn bằng chứng trên ổ đĩa | SHA-256 đối chiếu 100% khớp, 0 file ngoài manifest | 10/10 file PNG khớp SHA-256, 0 file rác | **PASS** |
| **Security Invariant**| Cô lập tài khoản Admin production | `admin@adhome.vn` không bị biến động | Dữ liệu `admin@adhome.vn` 100% nguyên vẹn | **PASS** |

---

## 4. KẾT LUẬN

Bản cập nhật kiến trúc Header và Sidebar này đã:
1. **Giải quyết triệt để 100% các yêu cầu từ ảnh tham chiếu người dùng cung cấp**:
   - Nút Toggle `[ ≡ ]` đặt trang nhã ở đầu Header bên trái cạnh thanh Search `Ctrl + K`.
   - Cụm Thông báo `[ 🔔 1 ]` và Hồ sơ Admin `[ RA ]` đặt gọn gàng ở đầu Header bên phải.
   - Sidebar mở rộng hiển thị Logo AdHome đầy đủ, không bị nút toggle che khuất hay đè lên.
   - Sidebar thu gọn hiển thị icon logo nhà ở trung tâm và các icon module tinh giản, giải phóng diện tích tối đa cho không gian làm việc.
2. **Đạt chất lượng sản phẩm (Production Grade)**:
   - Toàn bộ chất lượng mã nguồn đã qua kiểm thử nghiệm thu tự động (CDP Chrome).
   - Touch targets $\ge 44\times 44\text{px}$ trên 100% phần tử tương tác.
   - Toàn bộ hình ảnh và hồ sơ kiểm toán đã được lưu trữ độc lập tại thư mục `docs/evidence/console-v2/UI-ALIGNMENT-HEADER-SIDEBAR/`.
