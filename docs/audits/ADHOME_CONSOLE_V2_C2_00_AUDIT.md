# ADHOME CONSOLE V2 — BÁO CÁO KIỂM TOÁN VÀ KHẮC PHỤC BẤT NHẤT (TASK C2-00)

**Mã tài liệu:** `ADHOME-CONSOLE-V2-AUDIT-C2-00-2026-11-01`  
**Ngày thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi:** Khóa Baseline, khắc phục triệt để các bất nhất QA Evidence, Touch Targets toàn cục và chuẩn hóa Bottom Sheets.  
**Commit cơ sở:** [`12f7ca5`](https://github.com/tcandt/adhome-platform/commit/12f7ca57a037bb36a95a746d04671f3274abfb31)  
**Môi trường:** Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local, strict **NO Docker**, Landing RC1 freeze.

---

## 1. BẢNG TỔNG HỢP CÁC BẤT NHẤT & KẾT QUẢ REMEDIATION (C2-00)

| STT | Vấn đề kiểm toán phát hiện | Mức độ | Hiện trạng trước sửa | Giải pháp kỹ thuật đã triển khai | Kết quả kiểm thử thực tế |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | Vùng chạm nhỏ trên Mobile Header | **P0** | Nút menu `40x40px`, tìm kiếm & chuông `36x36px`, nút đóng `32x32px` | Nâng cấp toàn bộ nút bấm trong `MobileHeader.tsx`, `MobileDrawer.tsx`, `GlobalSearchModal.tsx` đạt tối thiểu **$\ge 44\times 44\text{px}$** (`h-11 w-11`) | **26/26 controls đạt chuẩn $\ge 44\text{px}$** (CDP PASS, zero non-compliant) |
| **2** | Bottom Sheet chọn tòa nhà & thông báo thiếu chuẩn A11y | **P1** | 2 sheet trong `MobileHeader.tsx` chỉ là div tĩnh, không có focus trap, không bắt Escape, không khóa cuộn nền | Bổ sung `role="dialog"`, `aria-modal="true"`, focus trap (`Tab`/`Shift+Tab`), phím `Escape` đóng sheet & trả focus về trigger, `body.style.overflow = 'hidden'`, đệm an toàn `safe-area` | **CDP Keyboard dispatch xác nhận 100%**: sheet đóng đúng, scroll lock hoàn trả, focus trả về nút trigger |
| **3** | Cursor SidebarRail gây nhầm lẫn | **P1** | Dùng `cursor-ew-resize` dù thao tác thực tế là click toggle | Đổi thành `cursor-pointer`, mở rộng vùng click `w-4`, bổ sung visual indicator mềm mại khi hover/focus | **Hoàn thành**, trực quan và đúng chuẩn tương tác |
| **4** | Tệp ảnh ngoài manifest (`11 ảnh` vs `10 mục`) | **P1** | Tệp `redesign_desktop_1280_contracts_table_polished.png` cũ còn sót sau khi tách thành 2 ảnh 1280px | Di chuyển tệp mồ côi vào `screenshots/archive/` kèm `README.md`. Bổ sung assert tự động quét `unmanagedFiles.length === 0` | **10/10 ảnh trên đĩa khớp 100% manifest**, 0 tệp mồ côi |
| **5** | Kiểm thử cuộn ngang bảng Desktop chưa phủ toàn dải | **P1** | Chỉ kiểm tra tại vị trí đầu bảng (`scrollLeft = 0`) | Bổ sung kiểm thử tự động quét 3 mốc: `scrollLeft = 0`, `scrollLeft = mid`, `scrollLeft = max` trên cả sidebar expanded & collapsed | **Tất cả các mốc cuộn đều ghim sticky chuẩn**, hit-testing nút 3 chấm đạt 100% |
| **6** | Phân tách dữ liệu thử nghiệm (Fixture vs Production) | **P0** | Dashboard hiển thị các tòa demo S2B, S3B, S4B cùng LK | Ghi nhận tài liệu phạm vi dữ liệu: Các tòa S2B/S3B/S4B là fixture kiểm thử của C3/C4, được gắn nhãn tách biệt trước khi bàn giao vận hành | **Đã phân định phạm vi kiến trúc**, không đè dữ liệu thật |

---

## 2. CHI TIẾT KỸ THUẬT CÁC BƯỚC KHẮC PHỤC

### 2.1. Chuẩn hóa Touch Targets Mobile $\ge 44\times 44\text{px}$
- **`apps/console/src/presentation/mobile/navigation/MobileHeader.tsx`**:
  - `console-mobile-menu-trigger`: `min-h-[44px] min-w-[44px] h-11 w-11` (thay vì `40x40px`).
  - `console-mobile-building-scope`: `min-h-[44px] h-11 px-3` (thay vì `36px`).
  - `console-mobile-search-trigger`: `min-h-[44px] min-w-[44px] h-11 w-11` (thay vì `36x36px`).
  - `console-mobile-notifications-trigger`: `min-h-[44px] min-w-[44px] h-11 w-11` (thay vì `36x36px`).
  - Nút đóng (`X`): `min-h-[44px] min-w-[44px] h-11 w-11` (thay vì `32x32px`).
  - Chiều cao container header: điều chỉnh `h-16` (64px) tạo khoảng trống cân đối, không ép chặt giao diện.
- **`apps/console/src/presentation/mobile/navigation/MobileDrawer.tsx`**:
  - Nút đóng menu: `h-11 w-11 min-h-[44px] min-w-[44px]`.
  - Nút chuyển theme & nút đăng xuất: `min-h-[44px]`.
- **`apps/console/src/shared/ui/GlobalSearchModal.tsx`**:
  - Nút đóng tìm kiếm: `h-11 w-11 min-h-[44px] min-w-[44px]`.
  - Tất cả các dòng kết quả tìm kiếm (Khách thuê, Phòng, Tòa nhà, Phân hệ): `min-h-[44px]`.

---

### 2.2. Chuẩn hóa Accessibility cho Mobile Bottom Sheets
Cả 2 sheet trong `MobileHeader.tsx` (Chọn phạm vi tòa nhà & Thông báo hệ thống) hiện tuân thủ đầy đủ hợp đồng trợ năng:
1. **WAI-ARIA Dialog Semantics:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
2. **Khóa cuộn nền (Scroll Lock):** Đặt `document.body.style.overflow = 'hidden'` và `document.body.style.touchAction = 'none'` khi sheet mở; tự động hoàn trả khi đóng.
3. **Focus Trap & Auto-focus:** Khi mở, tự động focus vào nút đầu tiên; khi nhấn `Tab`/`Shift+Tab`, giữ tiêu điểm tuần hoàn bên trong sheet.
4. **Phím Escape:** Nhấn `Escape` lập tức đóng sheet và **khôi phục tiêu điểm** chính xác về nút bấm mở trigger ban đầu.
5. **Backdrop Dismiss:** Chạm vào vùng nền mờ bên ngoài lập tức đóng sheet.
6. **Đệm an toàn (Safe-Area Insets):** `paddingBottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem))`.

---

### 2.3. Sửa SidebarRail trong `animate-sidebar.tsx`
- Thay thế `cursor-ew-resize` bằng `cursor-pointer`.
- Tăng bề rộng vùng hover `w-4` với thanh chỉ báo `bg-brand-primary/60` khi hover/focus, loại bỏ hoàn toàn cảm giác nhầm lẫn với thao tác kéo thay đổi kích thước.

---

### 2.4. Lưu trữ tệp ảnh mồ côi & Chống thất thoát Evidence
- Chuyển `redesign_desktop_1280_contracts_table_polished.png` vào thư mục `docs/evidence/console-v2/UI-REDESIGN/screenshots/archive/`.
- Thư mục chính `docs/evidence/console-v2/UI-REDESIGN/screenshots/` hiện có đúng **10 tệp PNG**, khớp 100% với:
  - `screenshots-manifest.json` (10 mục)
  - `checksums-verified.txt` (10 mục)
- Script kiểm thử tự động bổ sung cơ chế kiểm tra đĩa nghiêm ngặt: nếu phát hiện bất kỳ tệp `.png` nào không nằm trong manifest, script sẽ lập tức báo lỗi và dừng quy trình.

---

### 2.5. Kiểm thử cuộn ngang toàn dải bảng Desktop
- Đã kiểm tra tự động tại các mốc cuộn:
  - `scrollLeft = 0` (đầu bảng)
  - `scrollLeft = mid` (giữa bảng)
  - `scrollLeft = max` (cuối bảng)
- Trên cả 2 trạng thái Sidebar mở rộng và thu gọn:
  - Cột `th.sticky` và `td.sticky` luôn ghim chính xác sát mép phải vùng nhìn (`Math.abs(thRect.right - containerRect.right) <= 2`).
  - Nút ba chấm thao tác `action-menu-trigger` luôn vượt qua kiểm tra `document.elementFromPoint(cx, cy)` (Hit-test PASS).

---

## 3. BẢNG CHECKLIST QUALITY GATES C2-00

| Cổng kiểm tra | Quy chuẩn | Thực tế đạt được | Kết luận |
| :--- | :--- | :--- | :---: |
| `GATE_MOBILE_TOUCH_TARGETS_44PX` | Toàn bộ controls Mobile $\ge 44\times 44\text{px}$ | 26/26 controls quét tự động đạt chuẩn | **PASS** |
| `GATE_GLOBAL_SHEETS_A11Y` | Focus trap, Escape, scroll lock cho mọi sheet | Action sheet, Scope sheet, Notif sheet đều đạt | **PASS** |
| `GATE_SIDEBAR_RAIL_CURSOR` | Cursor pointer cho toggle rail | Đổi thành cursor-pointer, w-4 hover visual | **PASS** |
| `GATE_FULL_SCROLL_RANGE_TABLE` | Cuộn ngang không mất sticky ở mọi vị trí | Đạt tại `scrollLeft = 0`, `mid`, `max` | **PASS** |
| `GATE_MANIFEST_DISK_ALIGNMENT` | Không có tệp mồ côi, 100% khớp manifest | 10/10 tệp quản lý, tệp cũ đã archive | **PASS** |
| `GATE_BUILD_TYPECHECK` | `tsc -b` & Vite build production | 0 errors | **PASS** |
| `GATE_LINT_CLEAN` | `oxlint` quét toàn bộ codebase | 0 errors | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản `admin@adhome.vn` bất biến | Kiểm tra trước & sau, 100% untouched | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không thay đổi `apps/landing/public/` | 100% frozen ngày 31/10/2026 | **PASS** |

**Kết luận Task C2-00:** Hoàn thành 100% các mục tiêu khóa baseline, xử lý sạch các bất nhất kiểm toán và sẵn sàng chuyển sang Task C2-01 (Tối ưu Mobile Header & Global Sheets chi tiết).
