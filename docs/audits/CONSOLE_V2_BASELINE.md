# ADHOME CONSOLE V2 — TÀI LIỆU KHÓA BASELINE VÀ BẢN ĐỒ KIẾN TRÚC THỰC TẾ
**Mã tài liệu:** `CONSOLE-V2-BASELINE-2026-11-01`  
**Mã Task:** `BASE-01` (Kèm các remediations `BASE-01-FIX-01` đến `FIX-06`)  
**Thời điểm khóa:** 01/11/2026 08:14:00 (Asia/Ho_Chi_Minh)  
**Mã Commit Cơ Sở (baseCommit):** `e3d4fb7` (`e3d4fb75b64270383c28dd15679f018739872a83`)  
**Mã Commit Evidence (evidenceCommit):** `43c2c74` (`43c2c74088f362a6e965a1740959bec85f468ec8`)  
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

### 1.2. Kiểm toán file tài liệu nội bộ
- **`AGENTS.md`**: Không tồn tại ở thư mục gốc repo cũng như các thư mục con (đã quét bằng script tìm kiếm file đệ quy). Toàn bộ quy chuẩn làm việc được kế thừa từ `ADHOME_V2_BLUEPRINT.md` và tài liệu checklist `ADHOME-V2-AGENT-CHECKLIST-2026-11-01`.

---

## 2. BẢN ĐỒ KIẾN TRÚC THỰC TẾ (ROUTE → COMPONENT → API → DB → TEST)

| UI Route / Module | Component Frontend | Endpoint Backend (`consoleBusinessApi.ts`) | Bảng cơ sở dữ liệu (Prisma / PostgreSQL) | Bộ kiểm thử tự động xác minh |
| :--- | :--- | :--- | :--- | :--- |
| **Header & Sidebar** | `DesktopHeader.tsx`<br>`DesktopSidebar.tsx`<br>`animate-sidebar.tsx` | `GET /api/v1/console/auth/me`<br>`POST /api/v1/console/auth/logout` | `ConsoleActor`<br>`Organization`<br>`Building` | `verifyC4Sprint4.mjs`<br>`captureBaselineScreenshots.mjs` |
| **Overview Dashboard** | `OverviewDashboard.tsx`<br>`UnifiedBuildingCanvas.tsx` | `GET /api/v1/console/v2/module-data?module=overview` | `ConsoleRoom`<br>`Contract`<br>`Invoice`<br>`PaymentTransaction` | `verifyC4Sprint4.mjs` |
| **Phân hệ Đặt cọc (`deposits`)** | `OperationalModuleWorkspace.tsx`<br>`HoldRoomModal.tsx` | `GET /api/v1/console/v2/module-data?module=deposits`<br>`POST /api/v1/console/v2/reservations`<br>`POST /api/v1/console/v2/reservations/:id/cancel` | `RoomReservation`<br>`Deposit`<br>`ConsoleRoom` | `verifyC4Sprint2.mjs` (T-02, T-03, T-10) |
| **Phân hệ Hợp đồng (`contracts`)** | `OperationalModuleWorkspace.tsx`<br>`CreateContractModal.tsx`<br>`HandoverModal.tsx` | `GET /api/v1/console/v2/module-data?module=contracts`<br>`POST /api/v1/console/v2/contracts`<br>`POST /api/v1/console/v2/contracts/:id/handover` | `Contract`<br>`Tenant`<br>`RoomOccupant`<br>`ConsoleRoom`<br>`Deposit` | `verifyC4Sprint1.mjs`<br>`verifyC4Sprint4.mjs` |
| **Import Sổ Cũ (`wizard`)** | `PaperBookMigrationWizardModal.tsx` | `POST /api/v1/console/v2/legacy-import/preview`<br>`POST /api/v1/console/v2/legacy-import/commit` | `Contract`<br>`Tenant`<br>`Deposit`<br>`RoomOccupant`<br>`ConsoleAuditLog` | `verifyC4Sprint3.mjs` (T-25, T-26, T-27) |
| **Phân hệ Đối soát & Hunonic (`settlements`)** | `OperationalModuleWorkspace.tsx`<br>`HunonicSettingsModal.tsx` | `GET /api/v1/console/v2/module-data?module=settlements`<br>`POST /api/v1/console/integrations/hunonic/sync-jobs`<br>`POST /api/v1/console/integrations/hunonic/tariff`<br>`POST /api/v1/console/v2/settlements/month-close` | `BillingPeriod`<br>`ElectricMeter`<br>`MeterReading`<br>`IntegrationSyncJob`<br>`IntegrationConnection` | `verifyC4Sprint4.mjs` (T-20, T-21, T-22, T-23, T-24) |
| **Hóa đơn & Tiền nước (`invoices`)** | `OperationalModuleWorkspace.tsx`<br>`CalculateWaterModal.tsx` | `GET /api/v1/console/v2/module-data?module=invoices`<br>`POST /api/v1/console/v2/settlements/calculate-water` | `Invoice`<br>`BillingPeriod`<br>`RoomOccupant`<br>`ElectricMeter` | `verifyC4Sprint4.mjs` (T-17, T-18, T-19) |
| **Thanh toán & Thu tiền (`payments`)** | `OperationalModuleWorkspace.tsx`<br>`InvoicePaymentModal.tsx` | `GET /api/v1/console/v2/module-data?module=payments`<br>`POST /api/v1/console/v2/invoices/:id/pay`<br>`POST /api/v1/console/v2/reconciliation/match` | `PaymentTransaction`<br>`Invoice`<br>`LedgerEntry` | `verifyC4Sprint2.mjs` (T-04, T-05, T-29) |
| **Sổ quỹ Thu chi (`finance`)** | `OperationalModuleWorkspace.tsx`<br>`CreateLedgerEntryModal.tsx` | `GET /api/v1/console/v2/module-data?module=finance`<br>`POST /api/v1/console/v2/finance/ledger-entries` | `LedgerEntry`<br>`Building` | `verifyC4Sprint2.mjs` (T-08, T-09, T-11) |
| **Cài đặt Tích hợp (`settings`)** | `SettingsWorkspaceView.tsx`<br>`HunonicSettingsModal.tsx` | `GET /api/v1/console/integrations/hunonic/sync-jobs`<br>`POST /api/v1/console/integrations/hunonic/tariff` | `IntegrationConnection`<br>`CronJobConfig`<br>`ConsoleAuditLog` | `verifyC4Sprint4.mjs` |

---

## 3. KIỂM TOÁN PACKAGE SCRIPTS VÀ KẾT QUẢ BASELINE CHECKS

### 3.1. Danh mục package scripts hiện có
- **Root (`package.json`)**:
  - `pnpm dev`: Khởi động Landing Page dev server (`port 5173`).
  - `pnpm dev:console`: Khởi động Console dev server (`port 5174`).
  - `pnpm build`: Chạy đệ quy `pnpm -r build`.
  - `pnpm build:landing`: Build `@adhome/landing` (`tsc -b && vite build && node scripts/prerenderSeo.mjs`).
  - `pnpm build:console`: Build `@adhome/console` (`tsc -b && vite build`).
  - `pnpm typecheck`: Chạy đệ quy `pnpm -r typecheck`.
  - `pnpm lint`: Chạy đệ quy `pnpm -r lint` (sử dụng oxlint).

### 3.2. Kết quả thực thi kiểm tra chất lượng Baseline (`BASE-01-FIX-04`)

| Lệnh thực thi | Mã thoát (Exit Code) | Kết quả kiểm tra | Ghi chú & Đánh giá |
| :--- | :---: | :---: | :--- |
| `pnpm --filter @adhome/console build` | `0` | **PASS** | `tsc -b` pass sạch, Vite build xuất `dist/index.html` (1.1 kB), `index.js` (1,044 kB), `index.css` (61.1 kB) trong 4.81s. |
| `pnpm --filter @adhome/landing build` | `0` | **PASS** | `tsc -b` pass sạch, prerender SEO 12 URLs thành công trong 3.0s. |
| `pnpm -r typecheck` | `0` | **PASS** | Cả `@adhome/console` (`tsc -b`) và `@adhome/landing` (`tsc --noEmit`) pass sạch. |
| `pnpm -r lint` | `0` | **PASS** | `oxlint src` quét 41 files console (0 lỗi, 43 warnings); `oxlint server` quét 9 files landing (0 lỗi, 7 warnings) hoàn thành trong 28ms. |
| `verifyC4Sprint4.mjs` | `0` | **PASS (100%)** | 4/4 suites (C4-HUN-01, C4-HUN-02, C4-WAT-01, C4-CLOSE-01) pass sạch, 6/6 screenshots phân biệt tuyệt đối. |

---

## 4. MA TRẬN PHÂN QUYỀN VÀ TRẠNG THÁI DỮ LIỆU HIỆN HÀNH

### 4.1. Phân quyền vai trò (Admin vs Manager)
Hệ thống sử dụng cơ chế Role-Based Access Control (RBAC) kết hợp Capability Flags trong `authRbac.ts`:
- **Quản trị viên (`ADMIN`)**:
  - Toàn quyền truy cập mọi phân hệ: `canAccessFinance`, `canAccessSettings`, `canCloseMonth`, `canManageContracts`.
  - Tài khoản Production bootstrap: `admin@adhome.vn` (Org: `org-adhome-anphu`).
- **Quản lý vận hành (`MANAGER`)**:
  - Bị giới hạn nghiêm ngặt theo danh mục tòa nhà được phân công (`assignedBuildingIds`).
  - Không có quyền truy cập Sổ quỹ thu chi, không được đổi biểu giá Hunonic, không được khóa sổ kỳ quyết toán.

### 4.2. Dữ liệu thử nghiệm (Demo Fixtures) vs Dữ liệu thực
- **Bảo toàn dữ liệu tài chính:** Kiểm toán qua `verifyDbInvariants.mjs` xác nhận:
  - Organizations: 2 | Buildings: 7 | Rooms: 44 | Contracts: 13 | Deposits: 98 | Invoices: 16 | Ledger: 437.
  - Tổng thu hoạt động: 877.100.000 đ | Chi hoạt động: 255.200.000 đ.
  - Zero cash-in drift: Không phát sinh dòng tiền hay công nợ nào trong quá trình kiểm toán baseline.

---

## 5. BỘ BẰNG CHỨNG HÌNH ẢNH NGUYÊN BẢN TRONG GIT (`BASE-01-FIX-01`)

Kết quả đối chiếu byte gốc và kích thước pixel từ script [`verifyEvidenceIntegrity.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/verifyEvidenceIntegrity.mjs) xác nhận 100% khớp với manifest:

| STT | Tên file ảnh | Viewport CSS | DPR | Pixel PNG thực | Bytes thực | SHA-256 Checksum gốc | Trạng thái đối chiếu |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :---: |
| 1 | `baseline_desktop_header_sidebar_expanded.png` | 1440x900 | 2 | 2880x1800 | 404,274 | `1d606165baed45b8061ce20f66b51e5ea4512e9b0bc983d548356f9eeb6f1c4a` | **MATCH (100% Khớp)** |
| 2 | `baseline_desktop_header_sidebar_collapsed.png` | 1440x900 | 2 | 2880x1800 | 331,501 | `d66a97f50b20bb492fdee1e758d2c310e1f4566f3793568288209044c9838c12` | **MATCH (100% Khớp)** |
| 3 | `baseline_desktop_contracts_table.png` | 1440x900 | 2 | 2880x1800 | 492,115 | `d009c0b1980ee15860e8fdaa4a05054bac294d3ee06ac54cfc748338c54aeac9` | **MATCH (100% Khớp)** |
| 4 | `baseline_mobile_header_nav.png` | 390x844 | 2 | 780x1688 | 136,215 | `466bfa5fb503bfd7c37077514c26092ccbfea5c8de6f31249b7bd8d2a721fd2f` | **MATCH (100% Khớp)** |
| 5 | `baseline_mobile_contracts_cards.png` | 390x844 | 2 | 780x1688 | 143,441 | `7da6e621aa032e055e8e6c5718925991a86b874dfc7ccf9f61a5dc08f9e0f4a0` | **MATCH (100% Khớp)** |

> [!NOTE]
> Sự khác biệt checksum mà công cụ bên ngoài quan sát được là do pipeline nén/downscale của giao diện web ChatGPT khi đính kèm ảnh (ảnh desktop 2880x1800 bị hạ độ phân giải xuống 2048x1280). Các tệp PNG lưu trực tiếp trong Git repository hoàn toàn nguyên bản và khớp tuyệt đối với manifest.

---

## 6. BÁO CÁO TRẠNG THÁI THEO TỪNG CỔNG CHẤT LƯỢNG (`BASE-01-FIX-06`)

- **`GATE_BASELINE_CAPTURED`:** **PASS** (Đã lưu trữ 5/5 ảnh baseline và bản đồ kiến trúc thực tế).
- **`GATE_BUILD_TYPECHECK`:** **PASS** (Build console 0, build landing 0, typecheck 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (Đã tích hợp `oxlint` cho cả 2 workspace packages, chạy mã thoát 0).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (100% file gốc trên Git khớp manifest và DPR pixels; đã xuất `evidence-integrity-test.json`).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (`apps/landing/public/sitemap.xml` đã khôi phục về ngày `2026-10-31`, diff Landing rỗng).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (Không trôi dòng tiền, không biến động tài chính, đã xuất `db-invariants-audit.json`).
