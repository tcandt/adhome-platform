# ADHOME LANDING PAGE — GATE 04 PRODUCTION HARDENING & MOBILE UX REPORT

## 1. Tổng quan thực thi Gate 04

- **Phạm vi**: Khắc phục triệt để 5 vấn đề từ báo cáo đánh giá Gate 03 (`8.1/10`) trên `apps/landing` để đạt chuẩn **Production Ready** mà không phá vỡ bố cục Editorial phẳng của Desktop (`8.8/10`) và tuyệt đối **không sử dụng Docker (`D-05`)**.
- **Cơ sở dữ liệu thực tế**: Native Windows **PostgreSQL 18** (`127.0.0.1:5432`, database `adhome_v2`) kết nối qua **Prisma ORM (`@prisma/client` v5.22.0)**. Đã xóa hoàn toàn các file lưu trữ tạm bằng JSON (`data/verified-public-rooms.json`, `data/public-inquiries.json`).
- **Kết quả kiểm thử tự động (`scripts/verifyGate04.mjs`)**: **20 / 20 PASS (0 FAIL)**.

---

## 2. P0 — Bảo mật Public API, RBAC & Multi-Tenant / Building Scope Isolation

### 2.1. Phân tách `Public Read` và `Authenticated Console Write`

| Endpoint | Method | Phân quyền & Xác thực | Hành vi bảo mật đã kiểm chứng |
| :--- | :--- | :--- | :--- |
| `/api/v1/public/rooms` | `GET` | Công khai (Read-only) | Chỉ trả về phòng `isPublic = true` và `status IN ('AVAILABLE', 'COMING_SOON')` qua strict projection `PUBLIC_ROOM_SELECT` (loại bỏ hoàn toàn `currentTenantName`, `currentTenantPhone`, `internalNotes`, `orgId`). |
| `/api/v1/public/rooms/:slug` | `GET` | Công khai (Read-only) | Trả về chi tiết 1 phòng công khai qua strict projection `PUBLIC_ROOM_SELECT`. |
| `/api/v1/public/rooms*` | `POST`, `PATCH`, `PUT`, `DELETE` | **Bị chặn hoàn toàn (`405 Method Not Allowed`)** | Trả về `405 PUBLIC_WRITE_FORBIDDEN` kèm header `Allow: GET`. Không tồn tại bất kỳ đường ghi công khai nào vào dữ liệu phòng. |
| `/api/v1/public/inquiries` | `POST` | Công khai (Rate-limited + Validated) | Giới hạn tần suất `12 requests / 60s / IP` (`429 Too Many Requests`), kiểm tra honeypot chống bot, validate SĐT 10 số Việt Nam, ngày không ở quá khứ, lưu vào bảng `lead_inquiries` trong PostgreSQL qua `prisma.$transaction`. |
| `/api/v1/public/inquiries` | `GET`, `PATCH`, `DELETE` | **Bị chặn hoàn toàn (`405 Method Not Allowed`)** | Ngăn chặn truy cập trái phép danh sách SĐT/họ tên khách hàng trên nhánh `/public/*`. |
| `/api/v1/console/rooms/:slug` | `PATCH` | **Bearer Token HMAC-SHA256 + RBAC (`rooms.publish.write`) + Tenant Scope (`orgId`) + Building Scope (`buildingId`)** | Kiểm tra chữ ký HMAC-SHA256, hạn dùng `exp`, quyền `rooms.publish.write`, kiểm tra `claims.orgId === room.orgId` (`403 CROSS_TENANT_FORBIDDEN`), kiểm tra `buildingScopes` cho vai trò `MANAGER` (`403 BUILDING_SCOPE_FORBIDDEN`), ghi `RoomAuditLog` và tự động đồng bộ lại file HTML SEO tĩnh trên đĩa. |
| `/api/v1/console/inquiries` | `GET` | **Bearer Token + RBAC (`leads.read`) + Tenant Scope (`orgId`)** | Chỉ trả về danh sách lead thuộc `claims.orgId`. |
| `/api/v1/console/audit-logs` | `GET` | **Bearer Token + RBAC (`ADMIN`/`MANAGER`) + Tenant Scope (`orgId`)** | Truy xuất lịch sử thay đổi giá/trạng thái phòng trong bảng `room_audit_logs`. |

### 2.2. Kết quả 10 bài kiểm thử bảo mật tự động (`SEC-01` → `SEC-10`)

- **`SEC-01` (PASS)**: `PATCH /api/v1/public/rooms/:slug` không có token bị từ chối với `HTTP 405 (PUBLIC_WRITE_FORBIDDEN)`.
- **`SEC-02` (PASS)**: `POST` và `DELETE` trên `/api/v1/public/rooms*` bị từ chối với `HTTP 405`.
- **`SEC-03` (PASS)**: `GET /api/v1/public/inquiries` không xác thực bị từ chối với `HTTP 405` (bảo vệ PII khách đăng ký).
- **`SEC-04` (PASS)**: `PATCH /api/v1/console/rooms/:slug` thiếu header `Authorization` bị từ chối với `HTTP 401 (UNAUTHORIZED)`.
- **`SEC-05` (PASS)**: `PATCH /api/v1/console/rooms/:slug` dùng token giả mạo chữ ký HMAC bị từ chối với `HTTP 401 (INVALID_SIGNATURE)`.
- **`SEC-06` (PASS)**: Tài khoản `VIEWER` (chỉ có `rooms.read`, không có `rooms.publish.write`) gọi `PATCH /api/v1/console/rooms/:slug` bị từ chối với `HTTP 403 (INSUFFICIENT_PERMISSION)`.
- **`SEC-07` (PASS)**: Tài khoản `ADMIN` của tổ chức khác (`orgId: "org-other-competitor"`) gọi `PATCH` vào phòng của `org-adhome-anphu` bị từ chối với `HTTP 403 (CROSS_TENANT_FORBIDDEN)`.
- **`SEC-08` (PASS)**: Tài khoản `MANAGER` chỉ được phân quyền tòa `bld-lk01-31` cố tình gọi `PATCH` vào phòng `P.25-05` (thuộc tòa `bld-lk08-25`) bị từ chối với `HTTP 403 (BUILDING_SCOPE_FORBIDDEN)`.
- **`SEC-09` (PASS)**: Kiểm tra rò rỉ dữ liệu nhạy cảm: Trong bảng PostgreSQL `public_room_listings` có 5 dòng chứa thông tin người thuê nội bộ (`currentTenantName`, `currentTenantPhone`, `internalNotes`), nhưng JSON trả về từ `GET /api/v1/public/rooms` có **0 trường nhạy cảm bị lộ**.
- **`SEC-10` (PASS)**: Kiểm tra chống spam/flood trên `POST /api/v1/public/inquiries`: trả về `HTTP 429 Too Many Requests` kèm header `Retry-After: 60`.

---

## 3. P0 — Lưu trữ PostgreSQL + Prisma, Chống Race Condition & Đồng bộ SEO Tĩnh

- **`DB-01a` & `DB-01b` (PASS)**: Khi Manager hợp lệ cập nhật giá phòng `P.31-06` qua `PATCH /api/v1/console/rooms/studio-ban-cong-31-06-lk01-31-an-phu`:
  1. Dữ liệu trong bảng PostgreSQL `public_room_listings` được cập nhật trong `prisma.$transaction`.
  2. Bản ghi `RoomAuditLog` được tạo trong bảng `room_audit_logs` lưu rõ `actorUserId`, `actorRole`, `changedFields`, `previousValues`, `newValues`.
  3. Module `syncPrerenderedSeoFiles()` tự động cập nhật ngay lập tức file tĩnh `dist/phong/studio-ban-cong-31-06-lk01-31-an-phu/index.html` và `dist/sitemap.xml`, đảm bảo `<title>`, `<meta name="description">` và JSON-LD `offers.price` luôn khớp 100% với PostgreSQL.
- **`DB-02` (PASS — 10-Way Concurrency Deduplication)**: Khi bắn đồng thời 10 request `POST /api/v1/public/inquiries` cùng SĐT và mã phòng tại cùng một mili-giây (`Promise.all`), nhờ `prisma.$transaction` kết hợp ràng buộc `@unique` trên cột `dedupe_window_key` của PostgreSQL:
  - Đúng **1 request** trả về `201 Created` (`ADH-0102-18C3`).
  - Đúng **9 request** còn lại bị chặn với `409 Conflict (DUPLICATE_SUBMISSION)`.
  - Truy vấn trực tiếp bảng `lead_inquiries` trong PostgreSQL xác nhận chỉ có **duy nhất 1 dòng** được ghi.

---

## 4. P1 — Tối ưu Mobile UX (`390×844` & `430×932`), Date UX & Core Web Vitals

1. **Thu gọn Mobile Hero & bỏ CTA lặp trên Mobile Header (`UX-02` PASS)**:
   - Đã loại bỏ nút `"Xem phòng"` bị lặp trên thanh Mobile Header (ngay phía trên nút `"Xem phòng đang trống"` của Hero).
   - Đưa mức giá khởi điểm và loại phòng (`Từ 4,5 triệu/tháng · Studio · 1PN · 2PN (28–45m²)`) lên ngay dưới tiêu đề chính trên Mobile, rút gọn mô tả, ẩn dải thông số phụ ở đáy Hero trên Mobile, và dùng tỷ lệ ảnh `21:10` gọn gàng.
   - Chiều cao Mobile Hero giảm xuống còn **`477px`**, giúp tiêu đề mục **`Phòng đang trống tại Khu đô thị Ân Phú`** và thanh phân loại phòng xuất hiện ngay ở tọa độ **`Y = 542px`** trên màn hình `390×844` (không cần cuộn).
2. **Tách biệt rõ Quick View Modal và Trang chi tiết `/phong/:slug` (`UX-03` PASS)**:
   - `RoomDetailModal.tsx` (Quick View) được tinh gọn thành bản xem trước tóm tắt: Ảnh chính, Tên phòng, Trạng thái, Giá thuê, đúng **4 thông số cốt lõi** (Diện tích, Loại phòng, Nội thất, Khả dụng) và 2 nút hành động (`Mở trang chi tiết` hoặc `Đăng ký xem P.XX-XX`), không còn lặp lại bảng biểu phí dịch vụ dài.
3. **Đưa Giá, Trạng thái khả dụng và CTA chính lên ngay đầu trang chi tiết Mobile (`UX-04` PASS)**:
   - Trên `/phong/:slug` ở màn hình Mobile (`390×844` & `430×932`), ngay dưới thanh Breadcrumb 1 dòng (`Trang chủ / Danh sách phòng / P.31-06` + nút `Chia sẻ`) và Album ảnh là thẻ tóm tắt đầu trang chứa Giá thuê (`5.000.000đ / tháng`), Thời điểm khả dụng (`Có thể vào ở ngay`) và nút CTA chính **`Đăng ký hẹn xem phòng P.31-06`** nằm ở tọa độ đáy **`Y = 705px`** (nằm trọn trong màn hình đầu tiên `844px` trước phần mô tả dài).
   - Bổ sung thanh Sticky Bottom CTA Bar có hỗ trợ `safe-area-inset-bottom` và `padding-bottom` cho trang để không che khuất nội dung.
4. **Chuẩn hóa hiển thị ngày `DD/MM/YYYY` & Quy tắc ngày khả dụng (`UX-01` & `UX-05` PASS)**:
   - Các phòng có `status === 'AVAILABLE'` và `availableFrom <= todayIso` (`2026-10-28` so với ngày hiện tại `2026-10-29`) tự động hiển thị **`"Có thể vào ở ngay"`** thay vì hiển thị ngày quá khứ `Sẵn sàng vào ở (28/10/2026)`.
   - Ô nhập ngày `#lead-date` trong `LeadInquiryModal.tsx` hiển thị trực tiếp định dạng Việt Nam **`29/10/2026` (`DD/MM/YYYY`)** ngay bên trong ô input trên mọi ngôn ngữ trình duyệt (kể cả `en-US`), đi kèm nút chọn lịch và các mốc chọn nhanh (`Hôm nay`, `Ngày mai`, `+3 ngày`).
5. **Accessibility & Throttled Core Web Vitals (`A11Y-01` & `CWV-01` PASS)**:
   - Kiểm tra bẫy tiêu điểm bàn phím (`Tab` / `Shift+Tab` / `Escape`) trong Modal đạt chuẩn (`focusInsideModal = true`).
   - Đo Core Web Vitals thực tế trên bản Production (`http://127.0.0.1:8081`) với giả lập mạng di động **4G (`latency: 80ms`, `4 Mbps`)** và **CPU 4x Slowdown** qua CDP:
     - **LCP**: `328ms` (Ngưỡng `< 2500ms`)
     - **INP**: `0ms` / `< 16ms` (Ngưỡng `< 200ms`)
     - **CLS**: `0.0000` (Ngưỡng `< 0.1`)

