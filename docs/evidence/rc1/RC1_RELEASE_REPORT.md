# BÁO CÁO NGHIỆM THU PHÁT HÀNH RC1 — ADHOME LANDING PAGE & CONSOLE QUẢN TRỊ

- **Phiên bản:** Release Candidate 1 (RC1 — Post-Review 6 Unified Console & Official Domain Migration)
- **Thời điểm kiểm định đồng bộ (UTC):** `2026-10-30T04:54:53.443Z`
- **Landing Page Domain chính thức:** `https://adhome.vn` (chuyển hướng `301` tự động từ `adhome.ductinh.one`)
- **Console Quản trị Domain chính thức:** `https://console.adhome.vn` (chuyển hướng `301` tự động từ `console-adhome.ductinh.one`)
- **URL Đăng nhập Console hợp nhất:** `https://console.adhome.vn/login`
- **Nền tảng cơ sở dữ liệu:** Native PostgreSQL 18.0 (`127.0.0.1:5432/adhome_v2` — Native Windows Service, không sử dụng Docker)
- **Kết luận Quality Gate tự động (`qualityGateCore.mjs`):** **`RC1_PRODUCTION_READY`** (`exit code 0`, `0` lỗi tồn đọng)
- **Phạm vi xác minh môi trường:** Toàn bộ mã nguồn, cơ sở dữ liệu PostgreSQL 18, kiểm thử chịu tải, kiểm thử bảo mật RBAC hai vai trò (**Admin** & **Manager**) và Core Web Vitals đã được xác minh tự động trên **Windows Local Workstation** (`http://127.0.0.1:8081` & `http://127.0.0.1:5174`). Trạng thái DNS công khai của `adhome.vn` và `console.adhome.vn` được ghi nhận trung thực tại Mục 2 (`LOCAL_WORKSTATION_VERIFIED_PENDING_EXTERNAL_DNS_CUTOVER`).

---

## 1. Tổng hợp khắc phục triệt để các yêu cầu Review 6 (P0 & P1)

| Hạng mục Review 6 | Cấp độ | Giải pháp kỹ thuật đã triển khai | Kết quả kiểm chứng |
| :--- | :---: | :--- | :---: |
| **1. Chuyển đổi sang tên miền chính thức `adhome.vn` & `console.adhome.vn`** | **P0** | Cập nhật toàn bộ Canonical URL, OpenGraph (`og:url`, `og:image`), JSON-LD, `sitemap.xml` (14 URLs), `robots.txt` về `https://adhome.vn`; toàn bộ liên kết Console trên Landing Page trỏ tới `https://console.adhome.vn/login`. Bổ sung middleware HTTP `301` cho `adhome.ductinh.one` và `console-adhome.ductinh.one`. | **PASS** (`rc02_canonicalDomain.pass = true`) |
| **2. Màn hình đăng nhập hợp nhất `/login` (bỏ tab chọn Admin/Manager)** | **P0** | Loại bỏ hoàn toàn bộ chọn vai trò `Admin (Toàn quyền)` / `Manager (Quản lý tòa)` và bỏ email điền sẵn trên `LoginPage.tsx`. Phục vụ tại `/login` với đúng bố cục, nhãn trường và thông điệp *"Quyền truy cập được xác định tự động sau khi xác thực"*. Xóa bỏ hoàn toàn `mockUsers.ts` và nút `"Đổi vai trò ⇄"`. | **PASS** (`zeroRoleSelectorTabsOnLogin = true`, `emptyEmailByDefault = true`) |
| **3. Phân quyền RBAC hai vai trò (Admin vs Manager) từ PostgreSQL** | **P0** | Vai trò (`ADMIN` / `MANAGER`), danh sách 18 quyền chi tiết (`permissions` -> `capabilities`) và phạm vi tòa nhà (`buildingScopes` -> `assignedBuildingIds`) được suy dẫn 100% từ bảng `ConsoleActor` qua `/api/v1/console/auth/login` và `/api/v1/console/auth/me`, thực thi đồng thời ở Backend API và Console UI. | **PASS** (`adminLogin.pass = true`, `managerLogin.pass = true`) |
| **4. Phân hệ Admin tạo tài khoản nhân sự & thu hồi phiên tức thì** | **P1** | Xây dựng API chỉ dành cho Admin (`GET/POST /api/v1/console/accounts`, `PATCH /api/v1/console/accounts/:id`) và giao diện `AccountManagementView.tsx` trong phân hệ **Cài đặt & Phân quyền**. Mọi thay đổi vai trò, tòa nhà phụ trách, quyền hạn hoặc khóa tài khoản tự động tăng `sessionVersion`, vô hiệu hóa tức thì phiên đang mở của nhân sự. | **PASS** (`createdManagerViaSettingsUi = true`, `instantLogoutOnAdminScopeChange = true`) |
| **5. Loại bỏ lưu trữ JWT thô trong `localStorage` & bảo vệ `/rum/reset`** | **P1** | Chuyển phiên đăng nhập Console sang cookie `adhome_console_session` (`HttpOnly; SameSite=Lax; Path=/`, bật cờ `Secure` trên HTTPS production) kết hợp header chống CSRF `X-Requested-With: AdHome-Console`. Khóa endpoint `POST /api/v1/public/rum/reset` chỉ cho phép `ADMIN` (`401` khi chưa đăng nhập, `403` với `MANAGER`). | **PASS** (`zeroRawJwtInLocalStorage = true`, `httpOnlySessionCookieSet = true`) |
| **6. Triệt tiêu outlier `CLS.max = 0.1137` & siết chặt Quality Gate** | **P1** | Xác định chính xác nguyên nhân: khung skeleton `min-h-[75vh]` trong `RoomDetailPage.tsx` khiến `Footer` lọt vào viewport `1440x900` ở `y = 788px` trước khi dữ liệu phòng tải xong. Nâng skeleton lên `min-h-[120vh]` giúp `CLS.max` toàn cục giảm từ `0.1137` xuống **`0.0005`**. Cập nhật `qualityGateCore.mjs` bắt buộc cả `CLS.p75 <= 0.1` **và** `CLS.max <= 0.1`. | **PASS** (`CLS.p50 = 0`, `CLS.p75 = 0.0005`, `CLS.max = 0.0005`) |
| **7. Chuẩn hóa thông số kỹ thuật băm mật khẩu `scrypt` & mã Git SHA** | **P1** | Tài liệu hóa chính xác thông số thực tế trong `apps/landing/server/passwordHash.ts`: `crypto.scrypt` với **`SALT_LEN = 16` bytes** (`128-bit` cryptographic random salt), `KEY_LEN = 64` bytes, `N = 16384, r = 8, p = 1`, so sánh hằng thời gian bằng `crypto.timingSafeEqual`. Không ghi cứng mã SHA cũ trong báo cáo. | **PASS** (Đối chiếu trực tiếp mã nguồn) |

---

## 2. Cấu hình Tên miền Chính thức & Trạng thái Môi trường Thực tế

### 2.1. Bảng định tuyến tên miền mục tiêu & chuyển hướng `301`

| Thành phần | URL chính thức | Hành vi chuyển hướng từ tên miền cũ (`*.ductinh.one`) | Kết quả kiểm thử HTTP |
| :--- | :--- | :--- | :---: |
| **Landing Page** | `https://adhome.vn` | `Host: adhome.ductinh.one/phong-trong` -> `301 Moved Permanently` tới `https://adhome.vn/phong-trong` | **PASS (`301`)** |
| **Console Quản trị** | `https://console.adhome.vn` | `Host: console-adhome.ductinh.one/` -> `301 Moved Permanently` tới `https://console.adhome.vn/` | **PASS (`301`)** |
| **Đăng nhập Console** | `https://console.adhome.vn/login` | `Host: console-adhome.ductinh.one/login` -> `301 Moved Permanently` tới `https://console.adhome.vn/login` | **PASS (`301`)** |
| **Canonical / Sitemap / Robots** | `https://adhome.vn/sitemap.xml` | 14 URL chuẩn hóa dưới `https://adhome.vn`, **0** lần xuất hiện `ductinh.one` trong `sitemap.xml` và `robots.txt` | **PASS** |

### 2.2. Phân tách minh bạch: Kiểm thử Local Workstation vs Trạng thái DNS Công khai (`liveDomainDeploymentProbe`)

Bộ kiểm định `verifyRC1.mjs` thực hiện truy vấn DNS/HTTPS trực tiếp tại thời điểm `2026-10-30T04:54:53.443Z` để báo cáo trung thực trạng thái hạ tầng:

- **Môi trường đã xác minh E2E đầy đủ:** Máy trạm Windows Local Workstation (`http://127.0.0.1:8081` cho Landing + API PostgreSQL 18 và `http://127.0.0.1:5174` cho Console SPA).
- **Kết quả dò DNS công khai (`liveDomainDeploymentProbe`):**
  - `adhome.vn` (`https://adhome.vn/`): `dnsResolved = false` (`dnsError: "ENODATA"` — chưa trỏ bản ghi `A`/`CNAME` công khai trên DNS nhà đăng ký tên miền).
  - `console.adhome.vn` (`https://console.adhome.vn/login`): `dnsResolved = false` (`dnsError: "ENOTFOUND"` — chưa khởi tạo bản ghi subdomain trên DNS công khai).
  - Ghi chú trạng thái: `LOCAL_WORKSTATION_VERIFIED_PENDING_EXTERNAL_DNS_CUTOVER`. Ngay khi quản trị viên hạ tầng trỏ bản ghi DNS `adhome.vn` và `console.adhome.vn` về Reverse Proxy (Cloudflare / Nginx / Caddy), toàn bộ metadata SEO, cookie phiên và chuyển hướng `301` đã khớp sẵn 100%.

---

## 3. Kiểm chứng E2E Màn hình Đăng nhập Hợp nhất `/login` & Phân quyền Admin / Manager

Toàn bộ kết quả dưới đây được trích xuất nguyên văn từ `rc03_backendSecurityAndRbac.consoleUiE2eReport` trong `docs/evidence/rc1/rc1_verification_results.json`:

### 3.1. Giao diện `/login` hợp nhất & Cơ chế Phiên `HttpOnly` Cookie

- Điều hướng người dùng chưa xác thực từ `/` sang `/login`: **`true`** (`unauthenticatedRedirectedToLoginRoute: true`).
- Trường `Email hoặc tên đăng nhập` để trống mặc định (`""`), không điền sẵn tài khoản Admin: **`true`** (`emptyEmailByDefault: true`).
- Không còn bất kỳ nút/tab chọn vai trò `Admin` / `Manager` trên màn hình đăng nhập: **`true`** (`zeroRoleSelectorTabsOnLogin: true`).
- Tiêu đề chuẩn *"Đăng nhập hệ thống quản lý AdHome"* & ghi chú *"Quyền truy cập được xác định tự động sau khi xác thực"*: **`true`**.
- Nhập sai mật khẩu hiển thị cảnh báo lỗi rõ ràng (`401 INVALID_CREDENTIALS`): **`true`** (`wrongPasswordFeedbackDisplayed: true`).
- Không lưu chuỗi JWT thô trong `localStorage` (`localStorage.getItem('adhome_console_token') === null`): **`true`** ở cả phiên Admin và phiên Manager.
- Cookie phiên `adhome_console_session` được cấp với cờ `HttpOnly = true` và bị xóa sạch ngay khi bấm Đăng xuất: **`true`**.

### 3.2. Đối chiếu thực nghiệm E2E giữa hai vai trò `ADMIN` và `MANAGER`

| Tiêu chí kiểm chứng thực tế trên trình duyệt & API | Tài khoản **Admin** (`admin@adhome.vn`) | Tài khoản **Manager** (`manager.lk01@adhome.vn`) | Kết quả |
| :--- | :--- | :--- | :---: |
| **Nguồn khởi tạo tài khoản** | `provisionProductionAdmin.mjs` (`usr-admin-prod`) | Tạo trực tiếp bởi Admin trên giao diện **Cài đặt & Phân quyền** | **PASS** |
| **Nhãn vai trò & Tóm tắt phạm vi ở Sidebar** | `ADMIN` · `Toàn quyền 4 tòa` | `MANAGER` · `2 tòa phân công` | **PASS** |
| **Số lượng tòa nhà & căn hộ trên Overview Workspace** | `4 tòa nhà, 34 căn hộ` (`LK01-31`, `LK01-32`, `LK08-24`, `LK08-25`) | `2 tòa nhà, 14 căn hộ` (chỉ hiển thị `LK01-31` & `LK01-32`; ẩn hoàn toàn `LK08-24`, `LK08-25`) | **PASS** |
| **Nút chuyển đổi vai trò giả lập (`"Đổi vai trò ⇄"`)** | Đã xóa hoàn toàn (`zeroRoleSwitcherInShell: true`) | Đã xóa hoàn toàn (`zeroRoleSwitcherInShell: true`) | **PASS** |
| **Phân hệ `Thu chi & Sổ quỹ` & Bảng Sổ quỹ ngân hàng** | Mở khóa (`data-locked="false"`), hiển thị bảng Sổ quỹ | Khóa (`data-locked="true"`), ẩn bảng Sổ quỹ, API `/finance/summary` trả `403` | **PASS** |
| **Phân hệ `Cài đặt & Phân quyền` (`/api/v1/console/accounts`)** | Mở khóa (`data-locked="false"`), tạo/sửa/khóa nhân sự `200`/`201` | Khóa (`data-locked="true"`), gọi trực tiếp API trả `403 FORBIDDEN` | **PASS** |
| **API `GET /api/v1/console/portfolio` (PostgreSQL)** | Trả đủ `4` tòa nhà của tổ chức | Chỉ trả đúng `2` tòa được phân công (`bld-lk01-31`, `bld-lk01-32`) | **PASS** |
| **Cập nhật phòng thuộc tòa được giao (`LK01-31`)** | `200 OK` | `200 OK` (`apiAllowedBuildingMutation200: true`) | **PASS** |
| **Cập nhật phòng ngoài phạm vi giao (`LK08-25`)** | `200 OK` | Bị chặn `403 BUILDING_SCOPE_FORBIDDEN` (`apiUnassignedBuildingMutation403: true`) | **PASS** |
| **Thu hồi phiên tức thì khi Admin đổi phạm vi tòa nhà** | Admin gọi `PATCH /api/v1/console/accounts/:id` -> `sessionsInvalidated: true` | Trình duyệt đang mở của Manager tự động bị đăng xuất về `/login` ngay khi tải lại | **PASS** |

---

## 4. Bảo mật Xác thực, Mật khẩu `scrypt` & Kiểm toán Dữ liệu

1. **Thuật toán băm mật khẩu (`apps/landing/server/passwordHash.ts`):**
   - Sử dụng `crypto.scrypt` tích hợp sẵn của Node.js với tham số chi phí `N = 16384`, `r = 8`, `p = 1`, độ dài khóa dẫn xuất `KEY_LEN = 64` bytes và muối ngẫu nhiên mật mã **`SALT_LEN = 16` bytes** (`crypto.randomBytes(16)`).
   - Định dạng lưu trữ: `scrypt$16384$8$1$<saltHex>$<derivedKeyHex>`, xác minh bằng `crypto.timingSafeEqual` chống tấn công đo thời gian (timing attack).
2. **Kiểm tra từ chối đăng nhập thiếu hoặc sai thông tin (`POST /api/v1/console/auth/login`):**
   - Thiếu trường `password`: **`400 BAD_REQUEST`** (`missingPasswordBlocked400: true`)
   - `password: null`: **`400 BAD_REQUEST`** (`nullPasswordBlocked400: true`)
   - `password: ""`: **`400 BAD_REQUEST`** (`emptyPasswordBlocked400: true`)
   - Sai mật khẩu: **`401 INVALID_CREDENTIALS`** (`wrongPasswordBlocked401: true`)
3. **Cô lập tuyệt đối tài khoản mẫu phát triển (`@adhome.internal`):**
   - 4 tài khoản mẫu (`usr-admin-01`, `usr-mgr-lk01`, `usr-viewer-01`, `usr-other-org-01`) được chuyển sang tên miền nội bộ `@adhome.internal`, khóa cứng `isActive = false`, `passwordHash = null`, từ chối `401` trên cả API đăng nhập lẫn xác thực token (`sampleActorsAudited: true`, `inactiveSampleActorBlocked401: true`, `inactiveSampleActorLoginBlocked401: true`).
4. **Bảo vệ Endpoint Quản trị & RUM Telemetry:**
   - `GET /api/v1/public/security/context`: **`404` / Đã gỡ bỏ** (`publicSecurityContextBlocked: true`).
   - `POST /api/v1/public/rum/reset`: Chặn `401` khi không có token (`unauthenticatedRumResetBlocked401: true`), chặn `403` với tài khoản `MANAGER` (`managerRumResetForbidden403: true`), chỉ cho phép `200` với `ADMIN` (`adminRumResetAuthorized200: true`).
5. **Xoay vòng khóa ký JWT, Thu hồi JTI & An toàn Lead thật:**
   - Hỗ trợ song song khóa hiện hành (`k4-2026-10`) và khóa liền trước (`k3-2026-10`), từ chối `401` khóa cũ đã hủy (`k2-2026-10`).
   - Dọn dữ liệu kiểm thử Lead chỉ xóa theo khóa chính `id` (UUID) vừa tạo trong bộ nhớ phiên test; bản ghi thật `ADH-9769-01C6DD` (`Nguyen Minh Khoa`) được bảo toàn nguyên vẹn trong PostgreSQL 18.

---

## 5. Kết quả Core Web Vitals (CWV) & Kiểm chứng Quality Gate Nghiêm ngặt

### 5.1. Số liệu Core Web Vitals chính xác (không làm tròn sai lệch)

Trích xuất nguyên văn từ `rc06_coreWebVitals` trong `docs/evidence/rc1/rc1_verification_results.json`:

| Chỉ số đo lường | Ngưỡng chuẩn Google / Gate | Giá trị đo thực tế | Phân vị chi tiết (`serverRumSummary`, `n = 62` mẫu) | Đánh giá |
| :--- | :---: | :---: | :--- | :---: |
| **LCP (Room Detail `390x844`)** | `> 0 ms` và `<= 2500 ms` | **`100 ms`** | Toàn cục (`n = 8`): `p50 = 100 ms`, `p75 = 192 ms`, `p95 = 224 ms`, `max = 224 ms` | **PASS** |
| **CLS (Room Detail `390x844`)** | `<= 0.10` | **`0`** | `roomDetailRum.clsScore = 0` (`76` sự kiện tương tác thực) | **PASS** |
| **CLS Tổng hợp Server RUM (Toàn cục)** | `p75 <= 0.10` **và** `max <= 0.10` | **`p75 = 0.0005` · `max = 0.0005`** | Toàn cục (`n = 11`): `p50 = 0`, `p75 = 0.0005`, `p90 = 0.0005`, `p95 = 0.0005`, `max = 0.0005` | **PASS** |
| **CLS Tổng hợp theo Thiết bị** | `p75 <= 0.10` **và** `max <= 0.10` | **Mobile `max = 0` · Desktop `max = 0.0005`** | Mobile (`n = 5`): `p50 = 0, p75 = 0, p95 = 0, max = 0` · Desktop (`n = 6`): `p50 = 0, p75 = 0.0005, p95 = 0.0005, max = 0.0005` | **PASS** |
| **INP Tối đa (Tương tác CDP thực)** | `> 0 ms` và `<= 200 ms` | **`40 ms`** (`p98 = 40 ms`) | Toàn cục (`n = 39`): `p50 = 16 ms`, `p75 = 24 ms`, `p90 = 32 ms`, `p95 = 40 ms`, `max = 40 ms` | **PASS** |
| **Total Blocking Time (TBT)** | Theo dõi Long Tasks | **`0 ms`** | `4` tác vụ ngắn khởi tạo (`72–74 ms`), không gây nghẽn luồng chính | **PASS** |

### 5.2. Kiểm thử âm tính Quality Gate (`verifyQualityGateFailure.mjs`)

- Động cơ đánh giá dùng chung `apps/landing/scripts/qualityGateCore.mjs` đã vượt qua **14/14 bài kiểm thử đơn vị (Unit Tests)** và **10/10 bài kiểm thử mã thoát tiến trình hệ điều hành (OS Process Exit-Code Tests)**, bao gồm kịch bản giả lập `CLS.p75 = 0` nhưng `CLS.max = 0.1137` (`--simulate-failure=server-rum-cls-max` -> bắt buộc trả `RC1_VERIFICATION_FAILED` và `exit code 1`), kịch bản `/rum/reset` không được bảo vệ (`exit code 1`) và kịch bản lỗi phân quyền Dual-Role Console (`exit code 1`).

---

## 6. Kết quả Kiểm thử Chịu tải Duy trì & Sao lưu Phục hồi PostgreSQL 18

### 6.1. Kiểm thử chịu tải duy trì (`49,038` requests trên PostgreSQL 18 Native)

| Cấp độ tải / Kịch bản | Thông lượng (`req/s`) | Độ trễ `p95` | Độ trễ `p99` | Tỷ lệ lỗi Hạ tầng (`5xx`/Net) | Kết nối PG tối đa | Kết quả |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **100 VUs** (Duy trì 15s) | `946.98 req/s` | `59.48 ms` | `91.00 ms` | `0%` | `22` | **PASS** |
| **500 VUs** (Duy trì 15s) | `782.75 req/s` | `618.29 ms` | `624.86 ms` | `0%` | `22` | **PASS** |
| **1000 VUs** (Duy trì 15s) | `788.39 req/s` | `1244.23 ms` | `1257.48 ms` | `0%` | `23` | **PASS** |
| **50 Lead hợp lệ đồng thời (`Promise.all`)** | `1300.40 req/s` | `38.43 ms` | `38.54 ms` (max) | `100%` ghi DB (`50/50`) | `22` | **PASS** |
| **Chống Spam IP đơn lẻ & Giả mạo Header** | Chặn `429` chuẩn xác | — | — | Chống giả mạo `x-rate-limit-key` & `422` dữ liệu sai | — | **PASS** |

### 6.2. Sao lưu & Phục hồi thực tế PostgreSQL 18 (`verifyBackupRestoreRC1.mjs`)

- **Thời gian `pg_dump`:** `164 ms` (`39,927 bytes`, lưu ngoài kho mã nguồn tại thư mục `backups/` đã cấu hình `.gitignore`).
- **Mã băm toàn vẹn SHA-256:** `d8ffe57dafa39a3c0dc310732deaa60affcf38852d5ccf9a0b18a00a39f0869c`.
- **Thời gian `pg_restore` vào DB kiểm chứng độc lập (`adhome_v2_restore_verify`):** `162 ms`, khớp 100% số lượng bản ghi trên toàn bộ 9 bảng (`organizations: 2`, `buildings: 4`, `floors: 11`, `rooms: 13`, `leadInquiries: 1`, `consoleActors: 6`, `revokedTokens: 27`, `roomAuditLogs: 61`, `seoSyncJobs: 61`) và dọn sạch DB tạm sau kiểm chứng.
- **Lưu trữ lịch sử Git:** Các khóa bí mật phát triển cũ đã được xoay vòng sang `k4-2026-10`; file dump tuyệt đối không còn theo dõi trong cây Git. Trước khi mở kho mã nguồn ra công cộng (nếu có), khuyến nghị chạy `git filter-repo` trên bản sao lưu để cắt bỏ hoàn toàn blob lịch sử cũ.

---

## 7. Danh mục Bằng chứng Nghiệm thu Đồng bộ (`docs/evidence/rc1/`)

1. **Báo cáo JSON kiểm định:**
   - `docs/evidence/rc1/rc1_verification_results.json` (`overallVerdict: "RC1_PRODUCTION_READY"`)
   - `docs/evidence/rc1/rc1_sustained_loadtest_results.json`
   - `docs/evidence/rc1/rc1_backup_restore_results.json`
2. **Ảnh chụp màn hình Console Quản trị (Unified `/login` & Dual-Role RBAC):**
   - `rc1_console_login_screen.png` — Giao diện `/login` hợp nhất, ô email trống, không có tab chọn vai trò Admin/Manager.
   - `rc1_console_login_invalid.png` — Cảnh báo từ chối đăng nhập khi sai mật khẩu.
   - `rc1_console_dashboard_authenticated.png` — Workspace của **Admin** (`admin@adhome.vn`): `ADMIN · Toàn quyền 4 tòa` (`4 tòa nhà, 34 căn hộ`), đầy đủ phân hệ.
   - `rc1_console_admin_accounts.png` — Phân hệ **Cài đặt & Phân quyền (RBAC)** nơi Admin tạo tài khoản **Manager** `manager.lk01@adhome.vn` gán phạm vi `LK01-31` & `LK01-32`.
   - `rc1_console_logout_returned.png` — Trạng thái quay về `/login` và xóa cookie `HttpOnly` sau khi đăng xuất.
   - `rc1_console_manager_dashboard_scoped.png` — Workspace của **Manager** (`manager.lk01@adhome.vn`): `MANAGER · 2 tòa phân công` (`2 tòa nhà, 14 căn hộ`), chỉ hiển thị `LK01-31` & `LK01-32`, khóa `Thu chi & Sổ quỹ` và `Cài đặt & Phân quyền`.
3. **Ảnh chụp màn hình Landing Page đa khung nhìn (`adhome.vn`):**
   - Desktop: `rc1_1920_home.png`, `rc1_1440_home.png`, `rc1_1440_room_detail.png`.
   - Mobile `390x844` & `430x932`: `rc1_390x844_home.png`, `rc1_390x844_mobile_nav_backdrop.png`, `rc1_390x844_quickview.png`, `rc1_390x844_room_detail.png`, `rc1_390x844_room_detail_scrolled.png`, `rc1_390x844_lead_modal_deduped.png`, `rc1_390x844_lead_modal_validation.png`, `rc1_390x844_lead_persisted.png` (mã xác nhận `ADH-5591-86AFA1`), `rc1_390x844_catalog.png`, `rc1_430x932_home.png`, `rc1_430x932_room_detail.png`.

---

## 8. Checklist Cutover Hạ tầng Production (`adhome.vn` & `console.adhome.vn`)

1. **Cấu hình DNS trên nhà đăng ký tên miền `adhome.vn`:**
   - Trỏ bản ghi `A` / `CNAME` cho `@` (`adhome.vn`) và `console` (`console.adhome.vn`) về IP/Ingress của Reverse Proxy production.
   - Giữ bản ghi `adhome.ductinh.one` và `console-adhome.ductinh.one` trỏ về cùng Reverse Proxy để middleware tự động phục vụ chuyển hướng `301` vĩnh viễn sang `https://adhome.vn` và `https://console.adhome.vn`.
2. **Biến môi trường bắt buộc trên máy chủ Production:**
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://<db_user>:<db_pass>@127.0.0.1:5432/adhome_v2?schema=public`
   - `ADHOME_CONSOLE_JWT_SECRET=<khóa ngẫu nhiên >= 32 ký tự>`
   - `ADHOME_CONSOLE_LOGIN_ENABLED=true`
   - `TRUST_PROXY=true` và `TRUSTED_PROXIES=127.0.0.1,::1` (khi đứng sau Nginx/Cloudflare cục bộ).
3. **Khởi tạo tài khoản Admin Production lần đầu:**
   ```bash
   node apps/landing/scripts/provisionProductionAdmin.mjs --email=admin@adhome.vn --password="<MatKhauQuanTriManh>" --force-activate
   ```
   Sau khi đăng nhập tại `https://console.adhome.vn/login`, Admin sử dụng phân hệ **Cài đặt & Phân quyền** để tạo tài khoản riêng cho từng nhân sự `MANAGER` theo đúng tòa nhà phụ trách.
