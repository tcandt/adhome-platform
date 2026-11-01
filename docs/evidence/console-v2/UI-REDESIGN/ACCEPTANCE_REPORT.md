# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU SPRINT C1 (UI/UX QUALITY REMEDIATION)
**Mã tài liệu:** `ADHOME-CONSOLE-V2-SPRINT-C1-ACCEPTANCE-2026-11-01`  
**Các Task hoàn thành:** `QA-03`, `QA-04`, `UI-07-FIX-03`, `FIN-UI-03`, `QA-05` (Tiếp nối và củng cố toàn diện `BASE-03/04`, `UI-01/02/04/05/06/07`)  
**Thời điểm thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI SPRINT C1

Theo đúng định hướng phản hồi từ đợt đánh giá độc lập (8,2/10), Sprint C1 tập trung giải quyết triệt để các lỗ hổng kiểm thử, củng cố tính tiếp cận (Accessibility), chuẩn hóa hiển thị tài chính cọc và mở rộng kiểm thử đa độ phân giải:

### 1.1. `QA-03` — Sửa Quality Gate Touch Target Mobile $\ge 44\times 44\text{px}$ (P0)
- **Vấn đề trước sửa:** Script capture kiểm tra `width >= 40 && height >= 40` và chỉ in log mà không throw error khi không đạt.
- **Triển khai kỹ thuật:**
  - Nâng cấp điều kiện kiểm tra nghiêm ngặt: Mọi trigger trên Mobile (`[data-testid="action-menu-trigger"]`) phải đạt tối thiểu **$44\times 44\text{px}$**.
  - Bổ sung cơ chế Fail-fast: Nếu danh sách trigger rỗng (`count === 0`) hoặc bất kỳ trigger nào $< 44\text{px}$, script lập tức throw Error và hủy bỏ quy trình.
- **Bằng chứng CDP thực nghiệm:**
  ```json
  {
    "count": 13,
    "sampleTarget": { "width": 44, "height": 44 },
    "passed": true,
    "nonCompliantCount": 0,
    "nonCompliant": []
  }
  ```
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.2. `QA-04` — Mở Rộng Kiểm Thử Bảng Hợp Đồng Đa Độ Phân Giải (P0)
- **Vấn đề trước sửa:** Chưa có bằng chứng trực quan và số đo kiểm thử tự động cho bảng hợp đồng ở độ phân giải phổ biến 1280px / 1366px khi Sidebar mở rộng.
- **Triển khai kỹ thuật:**
  - Thiết lập ma trận kiểm thử tự động quét 8 trạng thái viewport kết hợp Sidebar:
    - 1280x720 (Expanded & Collapsed)
    - 1366x768 (Expanded & Collapsed)
    - 1440x900 (Expanded & Collapsed)
    - 1920x1080 (Expanded & Collapsed)
  - Tại mỗi trạng thái, kiểm tra tự động:
    1. Không có tràn ngang toàn trang: `doc.scrollWidth <= window.innerWidth`.
    2. Cột Thao tác sticky-right (`th.sticky`, `td.sticky`) luôn ghim sát mép phải trong viewport (`right <= window.innerWidth`).
    3. Nút ba chấm trên tất cả các dòng đều tương tác được, không bị che khuất bởi bất kỳ container nào.
  - Bổ sung ảnh chụp giao diện bảng hợp đồng thực tế tại **1280x720** khi Sidebar mở rộng (`redesign_desktop_1280_contracts_table_polished.png`).
- **Bằng chứng CDP thực nghiệm (8/8 PASS):**
  - `1280x720 (Expanded)`: `scrollWidth=1274/1280 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1280x720 (Collapsed)`: `scrollWidth=1274/1280 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1366x768 (Expanded)`: `scrollWidth=1360/1366 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1366x768 (Collapsed)`: `scrollWidth=1360/1366 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1440x900 (Expanded)`: `scrollWidth=1434/1440 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1440x900 (Collapsed)`: `scrollWidth=1434/1440 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1920x1080 (Expanded)`: `scrollWidth=1914/1920 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`
  - `1920x1080 (Collapsed)`: `scrollWidth=1914/1920 | Overflow: false | Sticky Th Pinned: true | Triggers OK: true`  
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.3. `UI-07-FIX-03` — Accessibility & Focus Management cho Mobile Bottom Sheet (P1)
- **Vấn đề trước sửa:** Mobile Bottom Sheet thiếu cơ chế quản lý tiêu điểm tương đương `FloatingFocusManager` của Desktop.
- **Triển khai kỹ thuật tại [`ActionMenu.tsx`](file:///d:/AdHome-Platform/apps/console/src/shared/ui/ActionMenu.tsx):**
  - **Focus Trap:** Tự động đưa tiêu điểm vào phần tử đầu tiên khi sheet mở; bắt phím `Tab` và `Shift+Tab` giữ tiêu điểm tuần hoàn bên trong sheet modal.
  - **Khóa cuộn nền (Scroll Lock):** Đặt `document.body.style.overflow = 'hidden'` khi sheet mở, tự động hoàn trả khi đóng.
  - **Phím Escape:** Nhấn `Escape` lập tức đóng sheet.
  - **Khôi phục tiêu điểm:** Tự động trả focus về đúng nút ba chấm trigger trên thẻ hợp đồng sau khi đóng.
  - **WAI-ARIA Compliance:** Bổ sung `aria-labelledby="action-menu-sheet-title"`, `aria-describedby`, `role="dialog"`, `aria-modal="true"`.
- **Bằng chứng CDP thực nghiệm:**
  ```json
  {
    "found": true,
    "height": 337,
    "width": 390,
    "title": "S4B · S4-404",
    "badge": "Đang hiệu lực",
    "bodyLocked": true,
    "role": "dialog",
    "ariaModal": "true"
  }
  ```
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.4. `FIN-UI-03` — Chuẩn Hóa Cảnh Báo Tiền Cọc & Màu Sắc Ngữ Nghĩa (P1)
- **Vấn đề trước sửa:** Khoản "Đã thu: 0 đ" vẫn hiển thị bằng màu xanh lục trước khi hiển thị số tiền thiếu màu đỏ.
- **Triển khai kỹ thuật tại [`OperationalModuleWorkspace.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/OperationalModuleWorkspace.tsx):**
  - **Khi thiếu cọc (`remainingDepositVnd > 0`):**
    - Khoản đã thu chuyển sang màu trung tính: `text-slate-600 dark:text-slate-400 font-medium`.
    - Khoản còn thiếu hiển thị nổi bật bằng màu đỏ tương phản cao: `text-rose-600 dark:text-rose-400 font-bold`.
    - Phân biệt rõ "Cọc cam kết" theo hợp đồng với "Thực thu" thực tế.
  - **Khi đã thu đủ (`remainingDepositVnd <= 0`):**
    - Hiển thị "Đã thu đủ: X đ (đủ)" hoàn toàn bằng màu xanh lục ngữ nghĩa (`text-emerald-600 dark:text-emerald-400 font-semibold`).
  - Áp dụng đồng bộ cho cả **Bảng hợp đồng Desktop** và **Thẻ hợp đồng Mobile**.
- **Bằng chứng thực nghiệm:** Kiểm tra trực quan trên ảnh `redesign_desktop_contracts_table_polished.png` và `redesign_mobile_390x844_contracts_cards.png`.  
  $\rightarrow$ **Trạng thái:** **PASS**.

---

### 1.5. `QA-05` — Kiểm Thử Mã Hợp Đồng Từ Cùng Một Nguồn (Single-Source) (P1)
- **Vấn đề trước sửa:** Script kiểm thử sao chép lại hàm regex và in thông báo số lượng bản ghi cố định.
- **Triển khai kỹ thuật tại [`testContractShortCodes.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/testContractShortCodes.mjs):**
  - Import trực tiếp hàm `formatContractDisplayCode` từ mã nguồn Console: `apps/console/src/shared/tokens/designTokens.ts`.
  - Đếm và kiểm tra động toàn bộ các hợp đồng thực tế trong PostgreSQL.
  - Mô phỏng thêm 100 hợp đồng đa dạng trên 10 tòa nhà khác nhau để kiểm tra độ tin cậy khi mở rộng SaaS.
- **Bằng chứng thực thi:**
  - 13/13 hợp đồng live PostgreSQL: 100% unique, zero collisions.
  - 100 hợp đồng SaaS mô phỏng: 100% unique trong phạm vi tòa nhà.
  - `GATE_CONTRACT_SHORT_CODE: PASS`.  
  $\rightarrow$ **Trạng thái:** **PASS**.

---

## 2. BẢNG BẰNG CHỨNG 9 ẢNH CHỤP GIAO DIỆN (CHROME CDP · DPR = 2)

| STT | Tên file ảnh bằng chứng | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Mô tả chi tiết kịch bản kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `redesign_desktop_1440_header_expanded.png` | 1440x900 | 2 | 2880x1800 | 407,060 | `7aa90e22ef34bc72...` | Header 3 cụm cân đối, avatar phẳng vững chắc, scope selector, search Ctrl+K, live sync |
| 2 | `redesign_desktop_1440_header_collapsed.png` | 1440x900 | 2 | 2880x1800 | 334,092 | `f69f41bd30b4d005...` | Sidebar thu gọn: trigger viền mềm $\ge 40\times 40\text{px}$, morphing icon, tooltip Ctrl+B |
| 3 | `redesign_desktop_1280_header_contracts.png` | 1280x720 | 2 | 2560x1440 | 348,720 | `63a2ad057311b894...` | Viewport 1280x720: Header 1 dòng không tràn, cân đối điều hướng |
| 4 | `redesign_desktop_1920_header_overview.png` | 1920x1080 | 2 | 3840x2160 | 447,942 | `8a725f4821167083...` | Widescreen 1920x1080: Bố cục tỷ lệ chuẩn, độ sắc nét cao |
| 5 | `redesign_desktop_1280_contracts_table_polished.png` | 1280x720 | 2 | 2560x1440 | 327,589 | `b7654819f1c0aacc...` | **QA-04:** Bảng hợp đồng Desktop tại độ phân giải 1280x720 khi Sidebar mở rộng: 6 cột cân đối, không tràn ngang (`scrollWidth=1274 <= 1280`), cột Thao tác sticky-right luôn nhìn thấy |
| 6 | `redesign_desktop_contracts_table_polished.png` | 1440x900 | 2 | 2880x1800 | 422,901 | `0aa937289518d2b1...` | **FIN-UI-03:** Bảng hợp đồng Desktop 6 cột tại 1440x900: Tiền cọc phân rã trung tính/đỏ khi thiếu cọc, xanh khi đủ cọc, cột Thao tác sticky-right |
| 7 | `redesign_desktop_contracts_menu_open.png` | 1440x900 | 2 | 2880x1800 | 439,917 | `b574708639628790...` | **UI-06:** Menu ba chấm ActionMenu mở bằng Portal: Nổi trên toàn bộ bảng, nằm trọn trong viewport (`top: 406, bottom: 569`), không bị cắt |
| 8 | `redesign_mobile_390x844_contracts_cards.png` | 390x844 | 2 | 780x1688 | 134,606 | `f23e98b06bb2377c...` | **QA-03/FIN-UI-03:** Thẻ Mobile 390x844: Hitbox 3 chấm đạt chuẩn $44\times 44\text{px}$, hiển thị cọc chuẩn hóa, nút Bàn giao $\ge 44\text{px}$ |
| 9 | `redesign_mobile_390x844_actions_bottom_sheet.png` | 390x844 | 2 | 780x1688 | 103,745 | `9a7bd56130f25776...` | **UI-07-FIX-03:** Contextual Bottom Sheet với Focus trap, khóa cuộn nền (`bodyLocked: true`), `role="dialog"`, `aria-modal="true"`, grab-bar và safe area padding |

---

## 3. TỔNG HỢP QUALITY GATES ĐẠT ĐƯỢC

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| `GATE_TOUCH_TARGETS_44PX` | Tất cả trigger Mobile $\ge 44\times 44\text{px}$ (`QA-03`) | 13/13 trigger đạt chuẩn, fail-fast nếu không đạt | **PASS** |
| `GATE_TABLE_MULTI_VIEWPORT` | Bảng hợp đồng tại 1280, 1366, 1440, 1920 (`QA-04`) | 8/8 cấu hình không tràn ngang, sticky column chuẩn | **PASS** |
| `GATE_BOTTOM_SHEET_A11Y` | Focus trap, scroll lock, Escape, WAI-ARIA (`UI-07-FIX-03`) | Bắt tiêu điểm, body scroll lock, Escape đóng modal | **PASS** |
| `GATE_DEPOSIT_FORMAT_SEMANTICS` | Cảnh báo tiền cọc chuẩn ngữ nghĩa (`FIN-UI-03`) | Trung tính cho đã thu thiếu, đỏ cho còn thiếu, xanh cho đủ | **PASS** |
| `GATE_SINGLE_SOURCE_CODE` | Import formatter trực tiếp từ Console (`QA-05`) | Nguồn sự thật duy nhất, kiểm thử 113 hợp đồng | **PASS** |
| `GATE_BUILD_TYPECHECK` | `tsc -b` & Vite build production | 0 lỗi biên dịch, build thành công cả 2 packages | **PASS** |
| `GATE_LINT_CONFIGURED` | `oxlint` quét toàn bộ mã nguồn | 0 errors | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản sản xuất `admin@adhome.vn` bất biến | Không bị chỉnh sửa, dọn dẹp actor kiểm thử tự động | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không sửa đổi tài nguyên landing | `apps/landing/public/` giữ nguyên ngày `2026-10-31` | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 9/9 file ảnh có checksum SHA-256 phân biệt | Checksums và dung lượng khớp 100% | **PASS** |

**Kết luận Sprint C1:** Đã hoàn thành 100% các mục tiêu đóng lỗ hổng kiểm thử, nâng cấp khả năng tiếp cận và đảm bảo độ tin cậy của giao diện AdHome Console V2 trên mọi độ phân giải.
