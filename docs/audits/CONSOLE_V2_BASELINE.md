# ADHOME CONSOLE V2 — TÀI LIỆU KHÓA BASELINE VÀ BẢN ĐỒ KIẾN TRÚC THỰC TẾ
**Mã tài liệu:** `CONSOLE-V2-BASELINE-2026-11-01`  
**Mã Task:** `BASE-01`  
**Thời điểm khóa:** 01/11/2026 07:57:00 (Asia/Ho_Chi_Minh)  
**HEAD Commit:** `e3d4fb75b64270383c28dd15679f018739872a83` (`e3d4fb7`)  
**Git Branch:** `main` (clean working tree)  
**Môi trường thực thi:** Native Windows 11 Pro, Node.js `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**.

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
  - `pnpm lint`: Chạy đệ quy `pnpm -r lint`.

### 3.2. Kết quả thực thi kiểm tra chất lượng Baseline tại HEAD (`e3d4fb7`)

| Lệnh thực thi | Mã thoát (Exit Code) | Kết quả kiểm tra | Ghi chú & Đánh giá trung thực |
| :--- | :---: | :---: | :--- |
| `pnpm --filter @adhome/console build` | `0` | **PASS** | `tsc -b` pass sạch, Vite build xuất `dist/index.html` (1.1 kB), `index.js` (1,044 kB), `index.css` (61.1 kB) trong 4.81s. |
| `pnpm --filter @adhome/landing build` | `0` | **PASS** | `tsc -b` pass sạch, prerender SEO 12 URLs thành công trong 3.0s. |
| `pnpm -r typecheck` | `0` | **PASS** | `@adhome/landing` thực thi `tsc --noEmit` thành công; `@adhome/console` không cấu hình script `typecheck` riêng (được bảo vệ qua `build`). |
| `pnpm -r lint` | `1` | **FAIL (Missing Script)** | **Ghi nhận trung thực:** Không package nào khai báo script `lint` trong `package.json`. Sẽ xử lý trong task `QA-04`. |
| `verifyC4Sprint4.mjs` | `0` | **PASS (100%)** | 4/4 suites (C4-HUN-01, C4-HUN-02, C4-WAT-01, C4-CLOSE-01) pass sạch, 6/6 screenshots phân biệt tuyệt đối. |

---

## 4. MA TRẬN PHÂN QUYỀN VÀ TRẠNG THÁI DỮ LIỆU HIỆN HÀNH

### 4.1. Phân quyền vai trò (Admin vs Manager)
Hệ thống sử dụng cơ chế Role-Based Access Control (RBAC) kết hợp Capability Flags trong `authRbac.ts`:
- **Quản trị viên (`ADMIN`)**:
  - Toàn quyền truy cập mọi phân hệ, bao gồm: `canAccessFinance` (xem/ghi sổ quỹ), `canAccessSettings` (cấu hình tổ chức, nhân sự, biểu giá Hunonic, cổng thanh toán), `canCloseMonth` (khóa sổ kỳ quyết toán), `canManageContracts` (lập/gia hạn/thanh lý hợp đồng).
  - Tài khoản Production bootstrap: `admin@adhome.vn` (Org: `org-adhome-anphu`).
- **Quản lý vận hành (`MANAGER`)**:
  - Bị giới hạn nghiêm ngặt theo danh mục tòa nhà được phân công (`assignedBuildingIds`).
  - **Không** có quyền truy cập Sổ quỹ thu chi (`finance.read`/`finance.write`), **không** được đổi biểu giá Hunonic (`settings.manage`), **không** được khóa sổ kỳ quyết toán (`settlements.manage`), và **không** được xem báo cáo cấp tổ chức.

### 4.2. Dữ liệu thử nghiệm (Demo Fixtures) vs Dữ liệu thực
- **Tòa nhà mẫu trong DB**:
  - `bld-anphu-01` (Tòa An Phú 01): Dữ liệu tòa thực tế của tổ chức `org-adhome-anphu`.
  - `bld-s4b` (Tòa S4 Hunonic IoT & Settlements): Tòa nhà cô lập phục vụ kiểm thử tích hợp công tơ Hunonic và quyết toán.
  - `bld-s2b`, `bld-s3b`: Tòa nhà cô lập phục vụ kiểm thử cọc và di chuyển sổ cũ.
- **Ranh giới an toàn:** Tất cả mutation kiểm thử đều gắn chặt `orgId: 'org-adhome-anphu'` và building ID cô lập; tuyệt đối không can thiệp chéo tổ chức.

---

## 5. BỘ ẢNH BẰNG CHỨNG BASELINE TRƯỚC KHI THAY ĐỔI (`BASE-01`)

Bộ ảnh được chụp tự động qua Chromium DevTools Protocol (CDP) kết nối phiên Quản trị viên tại HEAD `e3d4fb7`:

| STT | Tên file ảnh | Dung lượng | Viewport | SHA-256 Checksum | Mô tả góc nhìn trước sửa đổi |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | `baseline_desktop_header_sidebar_expanded.png` | 404.3 KB | 1440x900 | `1d606165baed45b8061ce20f66b51e5ea4512e9b0bc983d548356f9eeb6f1c4a` | Desktop Header & Sidebar trạng thái mở rộng (Expanded): Scope tòa nhà, Search, Notifications và User profile hiện trạng. |
| 2 | `baseline_desktop_header_sidebar_collapsed.png` | 331.5 KB | 1440x900 | `d66a97f50b20bb490a61fa03407955f1be69bc4aa32d3b417ef288ebf2ddfba2` | Desktop Header & Sidebar trạng thái thu gọn (Collapsed, Ctrl+B) và nút thu phóng sidebar hiện trạng. |
| 3 | `baseline_desktop_contracts_table.png` | 492.1 KB | 1440x900 | `d009c0b1980ee158c3db0a4eb4ec9aa0914b3a4a11270275ea2a981c2f21626c` | Desktop Phân hệ Hợp đồng: Bảng danh sách hợp đồng hiện trạng, mã hợp đồng dài, nút hành động và các cột dữ liệu. |
| 4 | `baseline_mobile_header_nav.png` | 136.2 KB | 390x844 | `466bfa5fb503bfd7c31d102e3b2e04eb92f44766bb32d84a7e7041ca73a8ad35` | Giao diện Mobile: Header di động, chuyển đổi chế độ xem, điều hướng dưới chân trang (Bottom Navigation) hiện trạng. |
| 5 | `baseline_mobile_contracts_cards.png` | 143.4 KB | 390x844 | `7da6e621aa032e057f975eb1ae9c7198bb638c4d283e7a0e2380f6fead14b8a5` | Giao diện Mobile: Danh sách hợp đồng dạng thẻ (Mobile Cards), định dạng tiền tệ và các nút hành động hiện trạng. |

---

## 6. DANH SÁCH FILE VÀ MODULE TÁC ĐỘNG TIẾP THEO

Bám sát lộ trình ưu tiên tại Mục A.3 của `ADHOME-V2-AGENT-CHECKLIST-2026-11-01`:
1. **`BASE-02 / BASE-03 / BASE-04`**:
   - `apps/console/src/shared/ui/`: Thiết lập design tokens, motion tokens và auditing Animate UI skill.
   - `apps/landing/scripts/seedFixtures.mjs`: Chuẩn hóa dữ liệu test cô lập.
2. **`UI-01 / UI-02`**:
   - `apps/console/src/presentation/desktop/navigation/DesktopHeader.tsx`: Redesign header phân cấp 3 cụm.
   - `apps/console/src/shared/ui/animate-sidebar.tsx`: Redesign nút thu phóng sidebar 3 trạng thái.
3. **`UI-04 / UI-05 / UI-06 / UI-07`**:
   - `apps/console/src/features/modules/OperationalModuleWorkspace.tsx`: Rút gọn mã hiển thị hợp đồng, tối ưu density bảng, chuẩn hóa portal menu ba chấm, và tối ưu thẻ mobile.
