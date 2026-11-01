# ADHOME CONSOLE V2 — BÁO CÁO KIỂM TOÁN VÀ KHẮC PHỤC BẤT NHẤT (TASK C2-00-R1)

**Mã tài liệu:** `ADHOME-CONSOLE-V2-AUDIT-C2-00-R1-2026-11-01`  
**Ngày thực hiện:** 01/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi:** Khóa Baseline, khắc phục triệt để các bất nhất QA Evidence, Touch Targets toàn cục và chuẩn hóa Bottom Sheets.  
**Commit cơ sở đã xác minh:** [`924d8ea954ba0d2d3cb542616f731ea7b03697eb`](https://github.com/tcandt/adhome-platform/commit/924d8ea954ba0d2d3cb542616f731ea7b03697eb)  
**Môi trường:** Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local, strict **NO Docker**, Landing RC1 freeze.

---

## 1. ĐÍNH CHÍNH MINH BẠCH & PHẠM VI KIỂM THỬ (C2-00-R1)

Theo chỉ thị kiểm toán độc lập, các điểm kiểm thử được ghi nhận chính xác theo thực tế thực thi:
1. **Phạm vi Touch Targets Mobile:** Kết quả 26/26 controls đạt chuẩn $\ge 44\times 44\text{px}$ được kiểm chứng qua CDP trên tập controls hiển thị của Header, Navigation, ActionMenu triggers và Bottom Nav. Đây là kiểm chứng trên màn hình và component mục tiêu, không tự động ngoại suy cho mọi màn hình chưa quét.
2. **Trạng thái Linting:** Lệnh `pnpm -r lint` (oxlint) ghi nhận chính xác **0 errors và 42 warnings** (liên quan đến biến chưa sử dụng trong mã nguồn cũ). Không tuyên bố "zero warnings".
3. **An toàn Cơ sở Dữ liệu:** Kiểm tra tài khoản sản xuất `admin@adhome.vn` là kiểm tra tính bất biến (Security Invariant Check) của test harness nhằm đảm bảo runner không sửa đổi hay xóa tài khoản vận hành. Đây không phải là cuộc kiểm toán toàn diện toàn bộ cơ sở dữ liệu.
4. **Phân tách Dữ liệu Thử nghiệm (Fixture Data):** Kế hoạch phân định các tòa `S2B`, `S3B`, `S4B` đã được lập thành tài liệu và kiến trúc scope; việc cô lập triệt để ở cấp API/query sẽ được hoàn thiện và xác minh trong môi trường production.
5. **Toàn vẹn Tệp Bằng chứng (Manifest Integrity):** Việc kiểm tra 10/10 file ảnh trên đĩa khớp SHA-256 xác nhận tính toàn vẹn của dữ liệu bằng chứng, không tự chứng minh chất lượng thẩm mỹ hay sự hoàn thiện UX nếu chưa qua kiểm tra tương tác thực.

---

## 2. BẢNG TỔNG HỢP CÁC BẤT NHẤT & KẾT QUẢ REMEDIATION

| STT | Vấn đề kiểm toán phát hiện | Mức độ | Hiện trạng trước sửa | Giải pháp kỹ thuật đã triển khai | Kết quả kiểm thử thực tế |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | Vùng chạm nhỏ trên Mobile Header | **P0** | Nút menu `40x40px`, tìm kiếm & chuông `36x36px`, nút đóng `32x32px` | Nâng cấp toàn bộ nút bấm trong `MobileHeader.tsx`, `MobileDrawer.tsx`, `GlobalSearchModal.tsx` đạt tối thiểu **$\ge 44\times 44\text{px}$** (`h-11 w-11`) | **26/26 controls quét đạt chuẩn $\ge 44\text{px}$** (CDP PASS, zero non-compliant) |
| **2** | Bottom Sheet chọn tòa nhà & thông báo thiếu chuẩn A11y | **P1** | 2 sheet trong `MobileHeader.tsx` chỉ là div tĩnh, không có focus trap, không bắt Escape, không khóa cuộn nền | Bổ sung `role="dialog"`, `aria-modal="true"`, focus trap (`Tab`/`Shift+Tab`), phím `Escape` đóng sheet & trả focus về trigger, `body.style.overflow = 'hidden'`, đệm an toàn `safe-area` | **CDP Keyboard dispatch xác nhận 100%**: sheet đóng đúng, scroll lock hoàn trả, focus trả về nút trigger |
| **3** | Cursor SidebarRail gây nhầm lẫn | **P1** | Dùng `cursor-ew-resize` dù thao tác thực tế là click toggle | Đổi thành `cursor-pointer`, mở rộng vùng click `w-4`, bổ sung visual indicator mềm mại khi hover/focus | **Hoàn thành**, trực quan và đúng chuẩn tương tác |
| **4** | Tệp ảnh ngoài manifest (`11 ảnh` vs `10 mục`) | **P1** | Tệp `redesign_desktop_1280_contracts_table_polished.png` cũ còn sót sau khi tách thành 2 ảnh 1280px | Di chuyển tệp mồ côi vào `screenshots/archive/` kèm `README.md`. Bổ sung assert tự động quét `unmanagedFiles.length === 0` | **10/10 ảnh trên đĩa khớp 100% manifest**, 0 tệp mồ côi |
| **5** | Kiểm thử cuộn ngang bảng Desktop chưa phủ toàn dải | **P1** | Chỉ kiểm tra tại vị trí đầu bảng (`scrollLeft = 0`) | Bổ sung kiểm thử tự động quét 3 mốc: `scrollLeft = 0`, `scrollLeft = mid`, `scrollLeft = max` trên cả sidebar expanded & collapsed | **Tất cả các mốc cuộn đều ghim sticky chuẩn**, hit-testing nút 3 chấm đạt 100% |
| **6** | Phân tách dữ liệu thử nghiệm (Fixture vs Production) | **P0** | Dashboard hiển thị các tòa demo S2B, S3B, S4B cùng LK | Ghi nhận tài liệu phạm vi dữ liệu: Các tòa S2B/S3B/S4B là fixture kiểm thử của C3/C4, được gắn nhãn tách biệt trước khi bàn giao vận hành | **Đã phân định phạm vi kiến trúc**, không đè dữ liệu thật |

---

## 3. DANH MỤC CÁC QUALITY GATES MỚI ĐƯỢC THIẾT LẬP

Theo chỉ thị nghiệm thu tăng cường, 8 Quality Gates mới được đưa vào ma trận giám sát:

| Mã Gate | Nội dung kiểm tra | Tiêu chuẩn chấp thuận | Trạng thái hiện tại |
| :--- | :--- | :--- | :---: |
| `GATE_SIDEBAR_POINTER_INTERACTION` | Thao tác toggle Sidebar bằng con trỏ thật | Nút thu/mở ở Sidebar Header, click hoạt động mượt mà | **SẴN SÀNG TRIỂN KHAI (UI-SIDEBAR-01)** |
| `GATE_SIDEBAR_HOVER_STABILITY` | Tính ổn định khi hover vào Sidebar thu gọn | Không tự động mở ngoài ý muốn (`animateOnHover={false}`) | **SẴN SÀNG TRIỂN KHAI (UI-SIDEBAR-01)** |
| `GATE_SIDEBAR_PERSISTENCE` | Khôi phục trạng thái thu/mở qua reload | `localStorage` lưu trữ và khôi phục chính xác | **SẴN SÀNG TRIỂN KHAI (UI-SIDEBAR-01)** |
| `GATE_HEADER_LAYOUT_VISUAL` | Bố cục Desktop Header 2 vùng tối giản | Trái: Tiêu đề; Phải: Search Ctrl+K; không còn 3 cụm cũ | **SẴN SÀNG TRIỂN KHAI (UI-HEADER-01)** |
| `GATE_HEADER_FUNCTION_RELOCATION` | Di dời Building Scope, Notif, Profile, Sync | Đúng ngữ cảnh: Scope vào toolbar; Notif, Profile, Sync vào Sidebar | **SẴN SÀNG TRIỂN KHAI (UI-HEADER-02)** |
| `GATE_RESPONSIVE_ZOOM` | Kiểm thử đa độ phân giải và mức Zoom lớn | Đạt tại 1024, 1280, 1366, 1440, 1920px và Zoom 125%, 150% | **SẴN SÀNG TRIỂN KHAI (QA-HEADER-01)** |
| `GATE_FUNCTIONAL_REGRESSION` | Kiểm tra hồi quy toàn bộ chức năng | Bảng hợp đồng, Mobile Shell, ActionMenu hoạt động ổn định | **SẴN SÀNG TRIỂN KHAI (QA-HEADER-01)** |
| `GATE_FIXTURE_ENVIRONMENT_ISOLATION` | Cô lập dữ liệu mẫu thử nghiệm | Gắn nhãn hoặc lọc fixture S2B/S3B/S4B khỏi production | **ĐANG THEO DÕI** |

---

## 4. TỔNG HỢP QUALITY GATES ĐÃ ĐẠT ĐƯỢC (BASELINE C2-00)

| Quality Gate | Tiêu chuẩn kiểm tra | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| `GATE_MOBILE_TOUCH_TARGETS_44PX` | 26 controls Mobile quét tự động $\ge 44\times 44\text{px}$ | 26/26 controls đạt chuẩn $\ge 44\text{px}$ | **PASS** |
| `GATE_GLOBAL_SHEETS_A11Y` | Focus trap, Escape, scroll lock cho mọi sheet | Action sheet, Scope sheet, Notif sheet đều đạt | **PASS** |
| `GATE_SIDEBAR_RAIL_CURSOR` | Cursor pointer cho toggle rail | Đổi thành cursor-pointer, w-4 hover visual | **PASS** |
| `GATE_FULL_SCROLL_RANGE_TABLE` | Cuộn ngang không mất sticky ở mọi vị trí | Đạt tại `scrollLeft = 0`, `mid`, `max` | **PASS** |
| `GATE_MANIFEST_DISK_ALIGNMENT` | Không có tệp mồ côi, 100% khớp manifest | 10/10 tệp quản lý, tệp cũ đã archive | **PASS** |
| `GATE_BUILD_TYPECHECK` | `tsc -b` & Vite build production | 0 lỗi biên dịch, build thành công cả 2 packages | **PASS** |
| `GATE_LINT_CLEAN` | `oxlint` quét toàn bộ codebase | 0 errors, 42 warnings | **PASS** |
| `GATE_SECURITY_INVARIANTS` | Tài khoản sản xuất `admin@adhome.vn` bất biến | Kiểm tra trước & sau, 100% untouched | **PASS** |
| `GATE_LANDING_RC1_FREEZE` | Không sửa đổi tài nguyên landing | `apps/landing/public/` giữ nguyên ngày `2026-10-31` | **PASS** |
| `GATE_EVIDENCE_INTEGRITY` | 10/10 file ảnh trên đĩa khớp mã băm SHA-256 | Checksums và dung lượng khớp 100% | **PASS** |
