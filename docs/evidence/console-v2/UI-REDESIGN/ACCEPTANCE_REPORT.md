# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU REMEDIATION & CHỨNG MINH THỰC NGHIỆM
**Mã tài liệu:** `ADHOME-CONSOLE-V2-REMEDIATION-ACCEPTANCE-2026-11-01`  
**Các Task hoàn thành:** `C2-00` (Baseline & QA Remediation), `QA-04-FIX-01`, `QA-04-FIX-02`, `QA-06`, `UI-07-FIX-04`, `QA-05-FIX-01`, `QA-07`  
**Thời điểm thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI REMEDIATION & TASK C2-00

Đáp ứng đầy đủ các quan sát và khuyến nghị từ đợt kiểm toán độc lập, đợt remediation này đã xử lý dứt điểm các lỗi test harness, bổ sung bằng chứng tương tác bàn phím CDP, hit-testing qua `document.elementFromPoint`, kiểm tra va chạm mã HĐ phức tạp, rà soát 100% tệp trên đĩa và mở rộng chuẩn hóa Touch Targets Mobile toàn diện:

### 1.1. `C2-00` — Chuẩn Hóa Touch Targets $\ge 44\times 44\text{px}$ Toàn Bộ Mobile Header & Navigation (P0)
- **Vấn đề phát hiện từ kiểm toán:** Các nút tìm kiếm và thông báo dùng `h-9 w-9` (36×36px), menu dùng `h-10 w-10` (40×40px), nút đóng modal dùng `h-8 w-8` (32×32px).
- **Triển khai kỹ thuật:**
  - Nâng cấp toàn bộ các nút trong [`MobileHeader.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/mobile/navigation/MobileHeader.tsx), [`MobileDrawer.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/mobile/navigation/MobileDrawer.tsx) và [`GlobalSearchModal.tsx`](file:///d:/AdHome-Platform/apps/console/src/shared/ui/GlobalSearchModal.tsx) đạt chuẩn tối thiểu **$44\times 44\text{px}$** (`h-11 w-11 min-h-[44px] min-w-[44px]`).
  - Tăng chiều cao container Mobile Header lên `h-16` (64px) tạo khoảng đệm thông thoáng, không bị ép biên.
  - Mở rộng script kiểm thử CDP quét tự động toàn bộ 26 controls tương tác trên Mobile.
- **Bằng chứng CDP thực nghiệm:**
  ```json
  {
    "count": 26,
    "passed": true,
    "nonCompliantCount": 0,
    "nonCompliant": [],
    "sampleTargets": [
      { "testId": "console-mobile-menu-trigger", "width": 44, "height": 44 },
      { "testId": "console-mobile-building-scope", "width": 103, "height": 44 },
      { "testId": "console-mobile-search-trigger", "width": 44, "height": 44 },
      { "testId": "console-mobile-notifications-trigger", "width": 44, "height": 44 },
      { "testId": "action-menu-trigger", "width": 44, "height": 44 }
    ]
  }
  ```
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.2. `C2-00` — Đồng Bộ Quản Lý Accessibility & Focus Trap Cho Mọi Bottom Sheet (P1)
- **Triển khai kỹ thuật:** Nâng cấp cả 2 sheet Chọn phạm vi tòa nhà và Thông báo trong [`MobileHeader.tsx`](file:///d:/AdHome-Platform/apps/console/src/presentation/mobile/navigation/MobileHeader.tsx):
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
  - Khóa cuộn nền: `document.body.style.overflow = 'hidden'` và `touchAction = 'none'`.
  - Focus trap tuần hoàn với phím `Tab` và `Shift+Tab`.
  - Phím `Escape` đóng sheet và **khôi phục tiêu điểm** chính xác về nút trigger tương ứng.
  - Backdrop dismiss khi chạm ra ngoài và đệm an toàn `paddingBottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem))`.
- **Bằng chứng CDP thực nghiệm:**
  - Scope Sheet Escape & Restore: `{ sheetClosed: true, scrollLockRestored: true, focusRestoredToTrigger: true }` [PASS]
  - Notifications Sheet Escape & Restore: `{ sheetClosed: true, scrollLockRestored: true, focusRestoredToTrigger: true }` [PASS]

---

### 1.3. `C2-00` — Sửa Cursor SidebarRail Trong `animate-sidebar.tsx` (P1)
- **Triển khai kỹ thuật tại [`animate-sidebar.tsx`](file:///d:/AdHome-Platform/apps/console/src/shared/ui/animate-sidebar.tsx):**
  - Đổi `cursor-ew-resize` thành `cursor-pointer`.
  - Mở rộng vùng tương tác `w-4` với thanh chỉ báo `bg-brand-primary/60` khi hover/focus, loại bỏ nhầm lẫn với thao tác kéo thả resize.
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.4. `C2-00` — Lưu Trữ Tệp Ảnh Mồ Côi & Kiểm Tra Đĩa Tuyệt Đối (P1)
- **Triển khai kỹ thuật:**
  - Tệp cũ `redesign_desktop_1280_contracts_table_polished.png` đã được lưu trữ an toàn trong thư mục `docs/evidence/console-v2/UI-REDESIGN/screenshots/archive/` kèm `README.md` giải trình.
  - Thư mục chính hiện chứa chính xác **10 tệp PNG**, khớp 100% với `screenshots-manifest.json` và `checksums-verified.txt`.
  - Bổ sung kiểm tra tự động phát hiện tệp mồ côi (`unmanagedFiles.length === 0`).
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.5. `C2-00` — Kiểm Thử Cuộn Ngang Toàn Dải Bảng Desktop (Full Scroll Range Sweep)
- Quét tự động 3 mốc: `scrollLeft = 0` (đầu), `scrollLeft = mid` (giữa), `scrollLeft = max` (cuối) trên cả 2 trạng thái Sidebar mở rộng và thu gọn:
  - Cột sticky `th.sticky` và `td.sticky` luôn ghim sát mép phải vùng nhìn: `Math.abs(thRect.right - containerRect.right) <= 2`.
  - Nút ba chấm thao tác `action-menu-trigger` luôn vượt qua kiểm tra `document.elementFromPoint(cx, cy)` (Hit-test PASS).
  $\rightarrow$ **Trạng thái:** **PASS**.

---

## 2. BẢNG BẰNG CHỨNG 10 ẢNH CHỤP GIAO DIỆN (CHROME CDP · DPR = 2)

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 407,060 | `7aa90e22ef34bc7238a58bbf2997db12040bf563510b09b1556bf84e03033d41` | Header 3 cụm cân đối, avatar phẳng vững chắc, scope selector, search Ctrl+K, live sync |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 334,092 | `f69f41bd30b4d0054cb3ed6c6abed6d0ca85e3b9a0a6989049ab4aa2c7d14750` | Sidebar thu gọn: trigger viền mềm $\ge 40\times 40\text{px}$, morphing icon, tooltip Ctrl+B |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 348,720 | `63a2ad057311b8942e854d651cec9c6ad20566edb4093dec81405072718810d9` | Viewport 1280x720: Header 1 dòng không tràn, cân đối điều hướng |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 447,942 | `8a725f482116708317e5b6661fd649974b5424efdf3e919479faa6fdfbf60439` | Widescreen 1920x1080: Bố cục tỷ lệ chuẩn, độ sắc nét cao |
| 5 | `redesign_desktop_1280_contracts_table_expanded.png` | 1280x720 | 2 | 2560x1440 | 373,522 | `1a307dffeed3123bb5129b5e72ade57e1e3089cf86d5bea9a2e55b307e36b2bc` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi **Sidebar MỞ RỘNG (248px)**: 6 cột cân đối, không tràn ngang (`scrollWidth=1274 <= 1280`), cột Thao tác sticky-right luôn nhìn thấy |
| 6 | `redesign_desktop_1280_contracts_table_collapsed.png` | 1280x720 | 2 | 2560x1440 | 327,589 | `b7654819f1c0aaccf817e6ecee7a5e4bebdad17d1da9cc136e8a266b2ef9f4a8` | **QA-04-FIX-01:** Bảng hợp đồng Desktop tại 1280x720 khi **Sidebar THU GỌN (72px)**: Vùng hiển thị mở rộng, cột Thao tác sticky-right ghim cố định |
| 7 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 479,874 | `ea747597ccb13923b3f868876e54c47a1b9fb19bb359f416e37e47332ba58a56` | **FIN-UI-03:** Bảng danh sách hợp đồng Desktop 1440x900: Mã HĐ ngắn (HD-WF-010A, HD-S2R-105), badge "Từ sổ cũ", phân rã cọc cam kết và thực thu chuẩn hóa |
| 8 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 496,073 | `a24d03cde94a7b5a0d794a691b7c28e8806f58d839a442433b357e0a03da77b5` | **UI-06:** Menu ba chấm ActionMenu mở bằng Portal: Nổi trên toàn bộ bảng, nằm trọn trong viewport (`top: 406, bottom: 569`), không bị cắt |
| 9 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 135,100 | `6709fe0a9730fd3dffa798406ec62f8941b8019faaefd2a4565fa4ed5a25f3d2` | **C2-00/QA-03/FIN-UI-03:** Thẻ hợp đồng Mobile (390x844) và Mobile Header 44px+: 26/26 controls đạt chuẩn touch target $\ge 44\times 44\text{px}$ |
| 10 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 105,306 | `5f622006e429041985a34768fd334c9bbb4205ae81df2362758eec908a832994` | **C2-00/UI-07-FIX-04/QA-06:** Contextual Bottom Sheet với Focus trap, khóa cuộn nền (`bodyLocked: true`), `role="dialog"`, `aria-modal="true"`, safe-area insets và điều hướng bàn phím CDP xác thực |

---

## 3. TỔNG HỢP QUALITY GATES ĐẠT ĐƯỢC

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
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
| `GATE_SECURITY_INVARIANTS` | Tài khoản sản xuất `admin@adhome.vn` bất biến | Không bị chỉnh sửa, dọn dẹp actor kiểm thử tự động | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không sửa đổi tài nguyên landing | `apps/landing/public/` giữ nguyên ngày `2026-10-31` | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 10/10 file ảnh trên đĩa khớp mã băm SHA-256 (`QA-07`) | 100% SHA-256 và byte size khớp hoàn toàn | **PASS** |

**Kết luận Task C2-00:** Đã giải quyết 100% các vấn đề kiểm toán, hoàn thành trọn vẹn bộ bằng chứng 10 ảnh chất lượng cao và khóa vững chắc Baseline trước khi bước vào Task C2-01.
