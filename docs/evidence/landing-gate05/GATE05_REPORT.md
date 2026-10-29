# ADHOME LANDING PAGE — GATE 05 RELEASE ACCEPTANCE REPORT

- **Timestamp:** `2026-10-29T16:25:00+07:00`
- **Target Domain:** `https://adhome.vn` / `https://adhome.ductinh.one`
- **Database Engine:** Native Windows PostgreSQL `18.3` (`127.0.0.1:5432`, database `adhome_v2`) + Prisma ORM `5.22.0` (**Zero Docker — D-05 Compliant**)
- **Automated Verification Evidence:**
  - `apps/landing/gate05_verification_results.json` (`scripts/verifyGate05.mjs`)
  - `apps/landing/gate05_loadtest_results.json` (`scripts/loadTestGate05.mjs`)

---

## 1. P0 — ĐÁNH GIÁ LẠI PERFORMANCE (Real Native-Input INP, Long Tasks, TBT & RUM)

Khắc phục triệt để hạn chế `INP = 0ms` (do synthetic `el.click()` ở Gate 04):
- Sử dụng **Chromium CDP Native Input Events** (`Input.dispatchMouseEvent` với `mouseMoved` → `mousePressed` → `mouseReleased` và `Input.dispatchKeyEvent` với `keyDown` → `keyUp`) kết hợp `PerformanceObserver({ type: 'event', durationThreshold: 0, buffered: true })`, `PerformanceObserver({ type: 'longtask', buffered: true })` và đo 2-frame `requestAnimationFrame` presentation latency trên bản build production.
- Tích hợp **Real User Monitoring (RUM)** (`src/services/rumService.ts` + `POST /api/v1/public/rum` + `GET /api/v1/public/rum/summary`).

### Kết quả đo lường thực tế trên 8 tương tác bắt buộc

| # | Tương tác người dùng thực (Native CDP Mouse/Key Input) | EventTiming (`ms`) | 2-Frame rAF Presentation (`ms`) | Effective INP (`ms`) | Ngưỡng (`<= 200ms`) |
| :- | :--- | :---: | :---: | :---: | :---: |
| 1 | Click Room Card (`Phòng 31-06 · Studio Ban Công`) | `40.0 ms` | `48.7 ms` | **`48.7 ms`** | **PASS** |
| 2 | Mở / Đóng Quick View Modal (`[aria-label="Đóng xem nhanh"]`) | `32.0 ms` | `35.6 ms` | **`35.6 ms`** | **PASS** |
| 3 | Đổi ảnh trong Album trang chi tiết (`/phong/:slug`) | `16.0 ms` | `43.1 ms` | **`43.1 ms`** | **PASS** |
| 4 | Lọc phòng theo phân loại (`Studio` / `Nổi bật`) | `24.0 ms` | `41.9 ms` | **`41.9 ms`** | **PASS** |
| 5 | Mở / Đóng Mobile Navigation Drawer (`390×844`) | `16.0 ms` | `25.7 ms` | **`25.7 ms`** | **PASS** |
| 6 | Mở và nhập liệu vào Lead Inquiry Modal (`#lead-name`, `#lead-phone`) | `16.0 ms` (`3.35 ms/key`) | `41.7 ms` (open) | **`41.7 ms`** | **PASS** |
| 7 | Submit form & kích hoạt kiểm tra lỗi (Unchecked Consent Validation) | `32.0 ms` | `40.2 ms` | **`40.2 ms`** | **PASS** |
| 8 | Điều hướng giữa Home (`/`) → Catalog (`/phong-trong`) → Room Detail (`/phong/:slug`) | `24.0 ms` | `8.7 ms` | **`24.0 ms`** | **PASS** |

- **Max Real Interaction INP:** **`48.7 ms`** (`> 0 ms` trên cả 8/8 tương tác, đạt chuẩn `< 200 ms`).
- **Desktop Web Vitals (`1440×900`):** `LCP = 384 ms`, `CLS = 0.0006`, `Long Tasks = 1` (`TBT = 35 ms`), `Gradients = 0`, `Backdrop Blur = 0`.
- **Server RUM Aggregator (`GET /api/v1/public/rum/summary`):** Đã thu thập `51` mẫu RUM thực tế (`INP p50 = 16 ms`, `p75 = 24 ms`, `p95 = 32 ms`, `max = 40 ms`; `LCP p50 = 56 ms`, `p95 = 384 ms`).

---

## 2. P0 — SEO CONSISTENCY (Dynamic PostgreSQL SSR + Outbox Sync Queue with Retry)

Không phụ thuộc vào việc chỉ ghi đè file tĩnh trong `dist/` tại runtime:
1. **Dynamic SSR / Revalidation trực tiếp từ PostgreSQL (`server/seoPrerenderer.ts` & `server/publicApiPlugin.ts`):**
   - Các route `GET /`, `GET /phong-trong`, `GET /phong/:slug`, `GET /sitemap.xml` và `GET /robots.txt` truy vấn trực tiếp từ PostgreSQL kèm `ETag: W/"adhome-seo-v${catalogVersion}"` và `Cache-Control: public, max-age=0, must-revalidate`.
2. **Outbox Sync Queue có Retry & Tách biệt lỗi (`SeoSyncJob`):**
   - Khi cập nhật phòng qua `PATCH /api/v1/console/rooms/:slug`, hệ thống tăng `Organization.catalogVersion`, ghi `RoomAuditLog` và tạo bản ghi `SeoSyncJob` (`status: 'PENDING'`, `maxAttempts: 3`).
   - Kiểm thử giả lập lỗi ghi snapshot ở lần thử đầu (`x-simulate-seo-sync-fail-once: 1`):
     - Dữ liệu phòng trong PostgreSQL (`price: 5350000`) **không bị rollback**, SSR trả về ngay giá mới `5.350.000đ` (`"price":5350000`).
     - Worker tự động retry ở lần thử thứ 2 và chuyển trạng thái `jobStatus: "SYNCED"`, `attempts: 2`, lưu vết lỗi tạm thời ở `lastError`.
3. **Xử lý phòng chuyển sang `OCCUPIED` hoặc `RESERVED`:**
   - Khi phòng chuyển sang `OCCUPIED` hoặc `RESERVED`, `GET /phong/:slug` lập tức trả về **`HTTP 404`** kèm header `X-Robots-Tag: noindex, nofollow` và `<meta name="robots" content="noindex, nofollow" />`.
   - `GET /sitemap.xml` và `GET /api/v1/public/rooms` lập tức loại bỏ URL phòng không còn khả dụng.
4. **Xử lý khi `slug` phòng thay đổi (`previousSlugs`):**
   - Khi đổi `slug` từ `studio-ban-cong-31-06-lk01-31-an-phu` sang `studio-ban-cong-31-06-lk01-31-an-phu-renamed`, slug cũ được lưu vào `previousSlugs`.
   - Truy cập URL cũ trả về **`HTTP 301 Moved Permanently`** (`Location: /phong/studio-ban-cong-31-06-lk01-31-an-phu-renamed`), URL mới trả về `HTTP 200`, và `sitemap.xml` cập nhật ngay sang URL mới.

---

## 3. P0 — SECURITY, DATABASE & STEPPED LOAD TEST (10, 100 & 1,000 Virtual Users)

### 3.1. Xác thực Bearer HMAC, Thu hồi Token, Xoay vòng khóa & Phân quyền tại Backend

| Kịch bản kiểm thử bảo mật | Kết quả thực tế | Trạng thái |
| :--- | :--- | :---: |
| Ghi trái phép lên Public API (`POST/PUT/PATCH/DELETE /api/v1/public/rooms`) | `405 Method Not Allowed` (`PUBLIC_WRITE_FORBIDDEN`) | **PASS** |
| Đọc/Sửa/Xóa danh sách Lead qua Public API (`GET/PUT/PATCH/DELETE /api/v1/public/inquiries`) | `405 Method Not Allowed` | **PASS** |
| Không có Bearer Token / Token sai chữ ký HMAC | `401 Unauthorized` | **PASS** |
| Token hết hạn (`exp < now`) | `401 Unauthorized` (`reason: "TOKEN_EXPIRED"`) | **PASS** |
| **Không tin quyền tự khai báo ở Client Token:** Token của `usr-viewer-01` tự khai báo `role: "ADMIN"`, `permissions: ["rooms.publish.write"]` trong payload | Backend đối chiếu bảng `ConsoleActor` trong PostgreSQL (`role: "VIEWER"`) và chặn **`403 INSUFFICIENT_PERMISSION`** | **PASS** |
| **Cross-Tenant Isolation:** Token của `usr-other-org-01` tự khai báo `orgId: "org-adhome-anphu"` | Backend đối chiếu DB (`orgId: "org-empty-saas"`) và chặn **`403 CROSS_TENANT_FORBIDDEN`** | **PASS** |
| **Building Scope Isolation:** Manager `usr-mgr-lk01` (chỉ quản lý `LK01-31`, `LK01-32`) sửa phòng thuộc `LK08-25` | Chặn **`403 BUILDING_SCOPE_FORBIDDEN`** | **PASS** |
| **Secret Rotation (`kid`):** Token ký bằng khóa kỳ trước (`kid: "k1-2026-09"`) và khóa hiện hành (`kid: "k2-2026-10"`) | Xác thực thành công **`200 OK`** (`usedKeyId: "k1-2026-09"`) | **PASS** |
| **Token Revocation (`RevokedToken` theo `jti`):** Thu hồi qua `POST /api/v1/console/auth/revoke` rồi gọi lại API | Chặn **`401 Unauthorized`** (`reason: "TOKEN_REVOKED"`) | **PASS** |
| **Session Invalidation (`sessionVersion`):** Tăng `ConsoleActor.sessionVersion` để vô hiệu hóa toàn bộ phiên cũ | Chặn **`401 Unauthorized`** (`reason: "SESSION_INVALIDATED"`) | **PASS** |
| **Strict Public Projection:** Kiểm tra rò rỉ `currentTenantName`, `currentTenantPhone`, `internalNotes` | `0` trường nhạy cảm bị lộ (`zeroPrivateFieldLeakage: true`) | **PASS** |

### 3.2. Kết quả Stepped Load Test (10, 100 và 1.000 Virtual Users)

Thực thi bằng `scripts/loadTestGate05.mjs` trên PostgreSQL 18.3 với kịch bản hỗn hợp thực tế (`50%` Public Catalog API `GET /api/v1/public/rooms`, `30%` Dynamic SSR Room Detail `GET /phong/:slug`, `20%` Ghi Lead mới vào PostgreSQL `POST /api/v1/public/inquiries`):

| Cấp tải (Virtual Users) | Tổng Request | p50 (`ms`) | p95 (`ms`) | p99 (`ms`) | Throughput (`req/s`) | Error Rate (`5xx`/Net) | CPU (`%`) | RAM RSS (`MB`) | PG Peak Connections (`Total / Active`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **10 VUs** | `10` | `21.38 ms` | `39.69 ms` | `39.69 ms` | `131.58 req/s` | **`0.00%`** (`0` lỗi) | `17.21%` | `70.58 MB` | `18 / 1` |
| **100 VUs** | `100` | `93.14 ms` | `145.62 ms` | `147.23 ms` | `525.82 req/s` | **`0.00%`** (`0` lỗi) | `22.86%` | `79.20 MB` | `18 / 11` |
| **1,000 VUs** | `1,000` | `210.01 ms` | `442.54 ms` | `553.24 ms` | `794.50 req/s` | **`0.00%`** (`0` lỗi) | `31.54%` | `144.65 MB` | `18 / 3` |

- **Kiểm thử Race Condition 50 Request gửi trùng đồng thời (`duplicateRaceBurst50`):**
  - 50 request bắn cùng lúc cho cùng `(phone: 0988777666, roomCode: P.31-06, inquiryType: VIEW_ROOM)`.
  - Kết quả: **`1 × 201 Created`**, **`49 × 409 Conflict`**, tổng thời gian xử lý `43.25 ms`, số bản ghi lưu trong PostgreSQL: **`1` bản ghi duy nhất**.

---

## 4. P1 — MOBILE UX FINAL, LEAD PRIVACY & SAAS `0..N` DATA MODEL

1. **Sticky Bottom CTA trên Mobile Room Detail (`/phong/:slug`):**
   - Sử dụng `IntersectionObserver` theo dõi nút CTA chính phía trên (`[data-testid="mobile-top-inquire-cta"]`).
   - Khi ở đầu trang (`scrollY = 0`): Top CTA hiển thị rõ, Sticky Bottom CTA **ẩn hoàn toàn** (`data-sticky-visible="false"`, `display: none`).
   - Khi cuộn qua Top CTA (`scrollY = 680`): Sticky Bottom CTA **tự động xuất hiện** (`data-sticky-visible="true"`, `display: flex`).
2. **Tinh gọn Quick View (`RoomDetailModal.tsx`):**
   - Thay thế 4 hộp thông số riêng lẻ bằng **2 dòng thông số ngang gọn gàng** (`Thông số & Nội thất: 32m² · Studio Ban Công · Full nội thất` và `Thời điểm khả dụng: Có thể vào ở ngay`).
3. **Hiển thị giá thuê của Room Card đầu tiên ngay trong màn hình đầu `390×844`:**
   - Cân chỉnh nhịp dọc Hero & danh sách phòng trên `< sm` mobile để **toàn bộ thẻ phòng đầu tiên cùng mức giá `5.000.000đ / tháng`** hiển thị trọn vẹn ở `bottomY = 816px <= 844px` mà không cần cuộn và không giảm cỡ chữ.
4. **Form đăng ký (`LeadInquiryModal.tsx`) & Quyền riêng tư:**
   - **Checkbox đồng ý (`privacyConsent`) mặc định KHÔNG tích sẵn (`checked = false`)**; nếu bấm gửi khi chưa tích sẽ hiển thị thông báo yêu cầu xác nhận.
   - Đã lược bỏ dòng giải thích lặp lại `Định dạng ngày Việt Nam: DD/MM/YYYY...` bên dưới các nút chọn nhanh ngày.
   - Mỗi bản ghi `LeadInquiry` lưu vào PostgreSQL đều gắn chặt cả `roomId` (`rm-31-06`) và `orgId` (`org-adhome-anphu`).
5. **Kiến trúc dữ liệu SaaS `0..N` (`Organization` → `0..N Building` → `0..N Floor` → `0..N Room`):**
   - Không hardcode 4 tòa nhà vào cấu trúc hệ thống.
   - Đã xác minh trên cả `org-adhome-anphu` (`4` tòa nhà, `11` tầng, `12` phòng công khai) và `org-empty-saas` (`0` tòa nhà, `0` tầng, `0` phòng công khai — `emptyOrgRoomsApiWorksWithZeroBuildings: true`).

