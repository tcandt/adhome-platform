# ADHOME CONSOLE V2 — TÀI LIỆU KHÓA BASELINE VÀ BẢN ĐỒ KIẾN TRÚC THỰC TẾ
**Mã tài liệu:** `CONSOLE-V2-BASELINE-2026-11-01`  
**Mã Task:** `BASE-01` (Bao gồm đầy đủ remediations `FIX-01` đến `FIX-13`, `SEC-01`, `OPS-01`, `BASE-02-A/B/C/D`, `FIN-UI-01`, `EVD-01`, `QA-01`)  
**Thời điểm khóa:** 01/11/2026 09:38:00 (Asia/Ho_Chi_Minh)  
**Mã Commit Cơ Sở (baseCommit):** `e3d4fb7` (`e3d4fb75b64270383c28dd15679f018739872a83`)  
**Mã Commit Remediated:** HEAD  
**Git Branch & Remote:** `main` (tracking `origin/main`)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze.

---

## 1. TỔNG QUAN HỆ THỐNG VÀ CẤU TRÚC WORKSPACE

### 1.1. Cấu trúc Monorepo (`pnpm-workspace.yaml`)
Monorepo được quản lý bằng `pnpm@11.14.0` bao gồm 2 workspace packages:
- **`apps/console` (`@adhome/console`)**: Single Page Application dành cho Quản trị viên và Quản lý vận hành căn hộ.
  - Công nghệ: React 19.0.0, Vite 6.1.0, TailwindCSS 3.4.17, TypeScript 5.7.3, Motion 14.7.1, `@animate-ui/react` 2.3.0, `@base-ui/react` 1.9.0, Lucide React 1.63.0.
  - Cổng phục vụ mặc định: `http://127.0.0.1:5174` (preview / dev).
- **`apps/landing` (`@adhome/landing`)**: Trang thông tin giới thiệu sản phẩm (Landing Page RC1) tích hợp toàn bộ HTTP API backend của Console V2 qua Express middleware/plugin.
  - Công nghệ: Node.js / Express, Prisma ORM 5.22.0, Vite 6.1.0, React 19.
  - Cổng phục vụ mặc định: `http://127.0.0.1:8081` (preview) / `5173` (dev).
- **Thư mục tài liệu & bằng chứng**:
  - `docs/evidence/console-v2/`: Chứa toàn bộ báo cáo nghiệm thu và ảnh chụp CDP theo từng giai đoạn (`C3.2-REMEDIATION`, `C4/SPRINT-0-1`, `C4/SPRINT-2`, `C4/SPRINT-3`, `C4/SPRINT-4`, `BASE-01`).
  - `docs/audits/`: Chứa các tài liệu thẩm định kỹ thuật độc lập.

### 1.2. Kiểm toán bảo vệ dữ liệu cá nhân & Bí mật Repository (`SEC-01`)
- **Phân loại dữ liệu:** 100% bản ghi khách thuê, người ở, đầu mối liên hệ trong cơ sở dữ liệu và bằng chứng hình ảnh là dữ liệu mẫu nhân tạo (**`TEST_FIXTURE`**). Số điện thoại dùng đầu số thử nghiệm (`0911000***`, `0977888***`, `094400***`), email nội bộ (`@adhome.internal`, `@test.internal`). **0 dữ liệu cá nhân thật (Real PII = 0)**.
- **Bảo vệ sao lưu:** Toàn bộ file backup dump (`*.dump`, `*.backup`, `backups/`) được loại trừ nghiêm ngặt trong `.gitignore`, không bao giờ commit lên GitHub public repository (xác thực 0 dump file trong Git history).

---

## 2. BẢN ĐỒ KIẾN TRÚC THỰC TẾ (ROUTE → COMPONENT → API → DB → TEST)

| UI Route / Module | Component Frontend | Endpoint Backend (`consoleBusinessApi.ts`) | Bảng cơ sở dữ liệu (Prisma / PostgreSQL) | Bộ kiểm thử tự động xác minh |
| :--- | :--- | :--- | :--- | :--- |
| **Header & Sidebar** | `DesktopHeader.tsx`<br>`DesktopSidebar.tsx`<br>`animate-sidebar.tsx` | `GET /api/v1/console/auth/me`<br>`POST /api/v1/console/auth/logout` | `ConsoleActor`<br>`Organization`<br>`Building` | `verifyC4Sprint4.mjs`<br>`captureBaselineScreenshots.mjs` |
| **Overview Dashboard** | `OverviewDashboard.tsx`<br>`UnifiedBuildingCanvas.tsx` | `GET /api/v1/console/v2/module-data?module=overview` | `ConsoleRoom`<br>`Contract`<br>`Invoice`<br>`PaymentTransaction` | `verifyC4Sprint4.mjs`<br>`reconcileOccupancyAndDeposits.mjs` |
| **Phân hệ Đặt cọc (`deposits`)** | `OperationalModuleWorkspace.tsx`<br>`HoldRoomModal.tsx` | `GET /api/v1/console/v2/module-data?module=deposits`<br>`POST /api/v1/console/v2/reservations`<br>`POST /api/v1/console/v2/reservations/:id/cancel` | `RoomReservation`<br>`Deposit`<br>`ConsoleRoom` | `verifyC4Sprint2.mjs` (T-02, T-03, T-10) |
| **Phân hệ Hợp đồng (`contracts`)** | `OperationalModuleWorkspace.tsx`<br>`CreateContractModal.tsx`<br>`HandoverModal.tsx` | `GET /api/v1/console/v2/module-data?module=contracts`<br>`POST /api/v1/console/v2/contracts`<br>`POST /api/v1/console/v2/contracts/:id/handover` | `Contract`<br>`Tenant`<br>`RoomOccupant`<br>`ConsoleRoom`<br>`Deposit` | `verifyC4Sprint1.mjs`<br>`verifyC4Sprint4.mjs` |
| **Import Sổ Cũ (`wizard`)** | `PaperBookMigrationWizardModal.tsx` | `POST /api/v1/console/v2/legacy-import/preview`<br>`POST /api/v1/console/v2/legacy-import/commit` | `Contract`<br>`Tenant`<br>`Deposit`<br>`RoomOccupant`<br>`ConsoleAuditLog` | `verifyC4Sprint3.mjs` (T-25, T-26, T-27) |
| **Phân hệ Đối soát & Hunonic (`settlements`)** | `OperationalModuleWorkspace.tsx`<br>`HunonicSettingsModal.tsx` | `GET /api/v1/console/v2/module-data?module=settlements`<br>`POST /api/v1/console/integrations/hunonic/sync-jobs`<br>`POST /api/v1/console/integrations/hunonic/tariff`<br>`POST /api/v1/console/v2/settlements/month-close` | `BillingPeriod`<br>`ElectricMeter`<br>`MeterReading`<br>`IntegrationSyncJob`<br>`IntegrationConnection` | `verifyC4Sprint4.mjs` (T-20, T-21, T-22, T-23, T-24) |
| **Hóa đơn & Tiền nước (`invoices`)** | `OperationalModuleWorkspace.tsx`<br>`CalculateWaterModal.tsx` | `GET /api/v1/console/v2/module-data?module=invoices`<br>`POST /api/v1/console/v2/settlements/calculate-water` | `Invoice`<br>`BillingPeriod`<br>`RoomOccupant`<br>`ElectricMeter` | `verifyC4Sprint4.mjs` (T-17, T-18, T-19) |
| **Thanh toán & Thu tiền (`payments`)** | `OperationalModuleWorkspace.tsx`<br>`InvoicePaymentModal.tsx` | `GET /api/v1/console/v2/module-data?module=payments`<br>`POST /api/v1/console/v2/invoices/:id/pay`<br>`POST /api/v1/console/v2/reconciliation/match` | `PaymentTransaction`<br>`Invoice`<br>`LedgerEntry` | `verifyC4Sprint2.mjs` (T-04, T-05, T-29) |
| **Sổ quỹ Thu chi (`finance`)** | `OperationalModuleWorkspace.tsx`<br>`CreateLedgerEntryModal.tsx` | `GET /api/v1/console/v2/module-data?module=finance`<br>`POST /api/v1/console/v2/finance/ledger-entries` | `LedgerEntry`<br>`Building` | `verifyC4Sprint2.mjs` (T-08, T-09, T-11) |
| **Cài đặt Tích hợp (`settings`)** | `SettingsWorkspaceView.tsx`<br>`HunonicSettingsModal.tsx` | `GET /api/v1/console/integrations/hunonic/sync-jobs`<br>`POST /api/v1/console/integrations/hunonic/tariff` | `IntegrationConnection`<br>`CronJobConfig`<br>`ConsoleAuditLog` | `verifyC4Sprint4.mjs` |

---

## 3. ĐỐI CHIẾU NGHIỆP VỤ CÔNG SUẤT PHÒNG & SỔ CỌC (`FIN-UI-01`, `OPS-01`)

### 3.1. Đối chiếu KPI Công suất phòng (`16/44 OCCUPIED`, `9 ACTIVE Contracts`)
Kiểm toán qua script [`reconcileOccupancyAndDeposits.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/reconcileOccupancyAndDeposits.mjs) xác nhận công thức chính xác:
- **Tổng số phòng:** 44 phòng = 16 OCCUPIED + 5 RESERVED + 23 AVAILABLE.
- **16 phòng OCCUPIED gồm hai nhóm rõ ràng:**
  1. **9 phòng có Hợp đồng ACTIVE trực tiếp:** `P.31-06`, `R-WF-010A`, `S2R-INV`, `S3-301`, `S3-302`, `S4-401`, `S4-402`, `S4-403`, `S4-404`.
  2. **7 phòng có khách ở từ dữ liệu listing/sổ cũ:** `P.24-06`, `P.25-03`, `P.31-01`, `P.31-02`, `P.31-04`, `P.31-05`, `P.32-05`.
- **Phân loại tòa nhà (`OPS-01`):**
  - 4 Tòa vận hành khu Liền kề: `LK01-31`, `LK01-32`, `LK08-24`, `LK08-25` (29 phòng).
  - 3 Tòa fixture kiểm thử phân hệ: `S2B` (5 phòng), `S3B` (5 phòng), `S4B` (5 phòng).

### 3.2. Bản chất thông báo "Đã thu 0đ (thiếu 6.000.000đ)" trên Hợp đồng ACTIVE
- Tại hợp đồng `HD-S4-401`, giá trị `deposit_vnd = 6.000.000 đ`. Hợp đồng đã ký kết và ở trạng thái **`ACTIVE`**.
- Tuy nhiên, khách thuê chưa hoàn tất đóng tiền cọc hoặc kế toán chưa tạo phiếu thu cọc liên kết (`paidAmountVnd = 0`).
- Giao diện tính toán: $\text{Thiếu} = \text{Tiền cọc quy định} (6.000.000\text{ đ}) - \text{Thực thu} (0\text{ đ}) = 6.000.000\text{ đ}$.
- **Kết luận:** Đây là cảnh báo nghiệp vụ hoàn toàn chính xác nhằm nhắc nhở quản lý thu cọc tồn đọng, không phải lỗi tính toán dữ liệu.

---

## 4. KIỂM TOÁN PACKAGE SCRIPTS VÀ KẾT QUẢ QUALITY GATES

### 4.1. Danh mục package scripts hiện có
- **Root (`package.json`)**:
  - `pnpm dev`: Khởi động Landing Page dev server (`port 5173`).
  - `pnpm dev:console`: Khởi động Console dev server (`port 5174`).
  - `pnpm build`: Chạy đệ quy `pnpm -r build`.
  - `pnpm build:landing`: Build `@adhome/landing` (`tsc -b && vite build && node scripts/prerenderSeo.mjs`).
  - `pnpm build:console`: Build `@adhome/console` (`tsc -b && vite build`).
  - `pnpm typecheck`: Chạy đệ quy `pnpm -r typecheck`.
  - `pnpm lint`: Chạy đệ quy `pnpm -r lint` (sử dụng oxlint).

### 4.2. Kết quả thực thi kiểm tra chất lượng Baseline

| Lệnh thực thi | Mã thoát (Exit Code) | Kết quả kiểm tra | Ghi chú & Đánh giá |
| :--- | :---: | :---: | :--- |
| `pnpm --filter @adhome/console build` | `0` | **PASS** | `tsc -b` pass sạch, Vite build xuất `dist/index.html` (1.1 kB), `index.js` (1,044 kB), `index.css` (61.1 kB) trong 5.32s. |
| `pnpm --filter @adhome/landing build` | `0` | **PASS** | `tsc -b` pass sạch, prerender SEO 12 URLs vào `dist/` thành công trong 3.40s, `apps/landing/public/` không bị ghi đè. |
| `pnpm -r typecheck` | `0` | **PASS** | Cả `@adhome/console` (`tsc -b`) và `@adhome/landing` (`tsc --noEmit`) pass sạch. |
| `pnpm -r lint` | `0` | **PASS** | `oxlint src` quét 41 files console; `oxlint src server scripts` quét 56 files landing (tổng 97 files toàn workspace), **0 errors**. |
| `node apps/landing/scripts/verifyPrivacyEvidence.mjs` | `0` | **PASS (100%)** | 4/4 assertions: 100% fixture nhân tạo, 0 real PII, 0 dump trong Git, `.gitignore` bảo vệ đầy đủ. |
| `node apps/landing/scripts/verifyEvidenceIntegrity.mjs` | `0` | **PASS (100%)** | 7/7 tiêu chí: 5/5 files, SHA-256 match, DPR 2 pixel valid, >=25KB, 5 hash phân biệt, **local `git hash-object` khớp 100% Git blob HEAD**. |
| `node apps/landing/scripts/verifyDbInvariants.mjs` | `0` | **PASS (100%)** | 8/8 assertions: cách ly tenant, nhất quán quan hệ FK cross-org, cân đối hóa đơn, cọc hợp lệ, sổ quỹ dương, **zero fingerprint/sum drift, negative test passed**. |
| `node apps/landing/scripts/verifyBackupRestore.mjs` | `0` | **PASS (100%)** | 8/8 assertions diễn tập phục hồi PostgreSQL dump toàn diện (31 bảng, 11 bảng nghiệp vụ đầy đủ, DB tạm tên ngẫu nhiên, zero production mutation). |
| `node apps/landing/scripts/reconcileOccupancyAndDeposits.mjs` | `0` | **PASS (100%)** | Đối chiếu thành công 16 phòng ở, 9 HĐ active, giải trình cảnh báo thiếu cọc 6M. |

---

## 5. BỘ BẰNG CHỨNG HÌNH ẢNH NGUYÊN BẢN TRONG GIT (`EVD-01`, `EVD-02`)

> [!NOTE]
> 5 ảnh dưới đây là ảnh baseline ghi nhận hiện trạng **TRƯỚC REDESIGN (`BEFORE_REDESIGN`)**, không phải bằng chứng nghiệm thu giao diện mới của `UI-01/UI-02`.

| STT | Tên file ảnh | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Git Blob SHA-1 (Local & HEAD) | Trạng thái đối chiếu |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: |
| 1 | `baseline_desktop_header_sidebar_expanded.png` | 1440x900 | 2 | 2880x1800 | 404,274 | `1d606165baed45b855841fcb230a36a0db67b878ea3a4e304f4f6ce0b5306b40` | `73c42a04...` | **MATCH (100% Khớp)** |
| 2 | `baseline_desktop_header_sidebar_collapsed.png` | 1440x900 | 2 | 2880x1800 | 331,501 | `d66a97f50b20bb492fdee1e758d2c310e1f4566f3793568288209044c9838c12` | `24c11ba0...` | **MATCH (100% Khớp)** |
| 3 | `baseline_desktop_contracts_table.png` | 1440x900 | 2 | 2880x1800 | 492,115 | `d009c0b1980ee15860e8fdaa4a05054bac294d3ee06ac54cfc748338c54aeac9` | `4884a6ef...` | **MATCH (100% Khớp)** |
| 4 | `baseline_mobile_header_nav.png` | 390x844 | 2 | 780x1688 | 136,215 | `466bfa5fb503bfd7c37077514c26092ccbfea5c8de6f31249b7bd8d2a721fd2f` | `c77c1025...` | **MATCH (100% Khớp)** |
| 5 | `baseline_mobile_contracts_cards.png` | 390x844 | 2 | 780x1688 | 143,441 | `7da6e621aa032e055e8e6c5718925991a86b874dfc7ccf9f61a5dc08f9e0f4a0` | `e0ee3750...` | **MATCH (100% Khớp)** |

---

## 6. BÁO CÁO TRẠNG THÁI THEO TỪNG CỔNG CHẤT LƯỢNG (QUALITY GATES)

- **`GATE_BASELINE_CAPTURED`:** **PASS** (Đã lưu trữ 5/5 ảnh baseline và bản đồ kiến trúc thực tế, runner dùng actor cô lập không tác động admin sản xuất).
- **`GATE_BUILD_TYPECHECK`:** **PASS** (Build console 0, build landing 0, typecheck 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (`oxlint` cấu hình đầy đủ cho cả 2 workspace packages bao gồm `landing/src`, quét 97 files, mã thoát 0, 0 lỗi).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (100% file gốc trên Git khớp manifest và DPR pixels; 5 hash phân biệt, kích thước >= 25KB, **local git hash-object khớp 100% blob SHA trong HEAD**; đã xuất `evidence-integrity-test.json`).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (`prerenderSeo.mjs` chỉ ghi vào `dist/`, `apps/landing/public/sitemap.xml` đóng băng nguyên bản tại ngày `2026-10-31`, diff Landing source rỗng).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (8/8 assertions thuật toán thực tế: cách ly multi-tenant 0 rò rỉ, nhất quán quan hệ FK chéo org, cân đối dòng hóa đơn 100%, miền trạng thái cọc hợp lệ, sổ quỹ thu chi dương, **zero value/fingerprint drift**, negative test passed; đã xuất `db-invariants-audit.json`).
- **`GATE_BACKUP_RESTORE_REHEARSAL`:** **PASS** (Diễn tập phục hồi backup dump toàn diện 31 bảng nghiệp vụ vào DB tạm tên ngẫu nhiên `adhome_v2_rehearsal_*` thành công 100%, bảo toàn DB chính không trôi dữ liệu; đã xuất `backup-restore-rehearsal.json`).
- **`GATE_PRIVACY_EVIDENCE_AUDIT`:** **PASS** (51 thực thể trong DB đều là fixture nhân tạo, 0 real PII, 0 dump trong Git, `.gitignore` bảo vệ đầy đủ; đã xuất `privacy-evidence-audit.json`).
