# ACCEPTANCE REPORT — BASE-01 (REMEDIATED)

- **Task:** `BASE-01` — Khóa baseline, lập bản đồ kiến trúc thực tế (Giai đoạn hoàn thiện `FIX-01` đến `FIX-06`)
- **Scope:** Root monorepo, `@adhome/console`, `@adhome/landing`, Prisma ORM schema, Desktop & Mobile Navigation, Quality Gates
- **Mã Commit cơ sở (baseCommit):** `e3d4fb7` (`e3d4fb75b64270383c28dd15679f018739872a83`)
- **Mã Commit evidence ban đầu (evidenceCommit):** `43c2c74` (`43c2c74088f362a6e965a1740959bec85f468ec8`)
- **Git Branch & Remote:** `main` (tracking `origin/main`), clean working tree
- **Env:** Windows 11 Pro native, Node `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze
- **Thời gian đánh giá:** 2026-11-01T08:15:00+07:00 (`Asia/Ho_Chi_Minh`)
- **Trạng thái tổng thể:** **`PASS`** (Đã giải quyết toàn bộ 6/6 điều kiện của `CONDITIONAL_PASS`)

---

## 1. KẾT QUẢ ĐỐI CHIẾU REMEDIATION THEO TỪNG TASK (FIX-01 ĐẾN FIX-06)

| Mã Remediation | Hạng mục công việc | Thao tác thực tế | Kết quả đối chiếu |
| :--- | :--- | :--- | :---: |
| **BASE-01-FIX-01** | Kiểm chứng evidence nguyên bản trong Git | Chạy `verifyEvidenceIntegrity.mjs` đọc trực tiếp byte gốc của 5 file PNG trong `screenshots/` và kích thước pixel IHDR. | **PASS** (100% khớp SHA và byte size manifest; Desktop 2880x1800, Mobile 780x1688 đúng DPR 2; đã xuất `evidence-integrity-test.json`) |
| **BASE-01-FIX-02** | Bảo vệ Landing RC1 Feature Freeze | Khôi phục `apps/landing/public/sitemap.xml` về ngày `2026-10-31` tại commit `e3d4fb7`; kiểm tra diff Landing. | **PASS** (`git diff e3d4fb7 -- apps/landing/public/` hoàn toàn rỗng, Landing RC1 đóng băng 100%) |
| **BASE-01-FIX-03** | Đồng nhất metadata báo cáo & commit | Phân định rõ `baseCommit=e3d4fb7`, `evidenceCommit=43c2c74`, ngày giờ, trạng thái remote và working tree. | **PASS** (Metadata nhất quán trên tài liệu audit và báo cáo nghiệm thu) |
| **BASE-01-FIX-04** | Cấu hình linter chuẩn hóa | Bổ sung `oxlint` vào root `devDependencies` và cấu hình script `"lint"` cho cả `@adhome/console` và `@adhome/landing`. | **PASS** (`pnpm -r lint` chạy mã thoát 0 trong 28ms; `pnpm -r typecheck` mã thoát 0) |
| **BASE-01-FIX-05** | Database baseline invariants & cô lập | Chạy `verifyDbInvariants.mjs` kiểm toán 12 bảng chính, sổ quỹ, mở cọc, và file backup. | **PASS** (Không phát sinh dòng tiền hay công nợ; đã xuất `db-invariants-audit.json`) |
| **BASE-01-FIX-06** | Phân tách trạng thái theo từng Gate | Không gộp một chữ PASS chung chung; chia tách 6 cổng chất lượng độc lập. | **PASS** (Tất cả 6 gates đều đạt trạng thái xác thực rõ ràng) |

---

## 2. BẢNG TỔNG HỢP KIỂM TRA LỆNH HỆ THỐNG

| Lệnh thực thi | Mục đích kiểm tra | Mã thoát | Kết quả | Ghi chú kỹ thuật |
|---|---|:---:|:---:|---|
| `pnpm --filter @adhome/console build` | Build production Console UI | `0` | **PASS** | `tsc -b && vite build` hoàn thành trong 4.81s |
| `pnpm --filter @adhome/landing build` | Build production Landing Page | `0` | **PASS** | `tsc -b && vite build && prerenderSeo.mjs` trong 3.00s |
| `pnpm -r typecheck` | Kiểm tra TypeScript toàn workspace | `0` | **PASS** | Console (`tsc -b`) và Landing (`tsc --noEmit`) pass sạch |
| `pnpm -r lint` | Kiểm tra linting tĩnh toàn workspace | `0` | **PASS** | `oxlint` quét 50 files trong 28ms, 0 lỗi |
| `node apps/landing/scripts/verifyEvidenceIntegrity.mjs` | Kiểm toán tính nguyên bản ảnh chụp trong Git | `0` | **PASS** | 5/5 ảnh gốc khớp tuyệt đối SHA-256 và DPR pixel |
| `node apps/landing/scripts/verifyDbInvariants.mjs` | Kiểm toán bất biến cơ sở dữ liệu | `0` | **PASS** | 0 cash-in drift, backup dump 39.9 KB tồn tại |

---

## 3. BỘ BẰNG CHỨNG HÌNH ẢNH NGUYÊN BẢN TRONG GIT

| File | Route | Viewport CSS | DPR | Pixel PNG thực | SHA-256 Checksum gốc | Bytes thực | Trạng thái đối chiếu |
|---|---|:---:|:---:|:---:|---|:---:|:---:|
| `baseline_desktop_header_sidebar_expanded.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `1d606165baed45b8061ce20f66b51e5ea4512e9b0bc983d548356f9eeb6f1c4a` | 404,274 | **MATCH (100% Khớp)** |
| `baseline_desktop_header_sidebar_collapsed.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `d66a97f50b20bb492fdee1e758d2c310e1f4566f3793568288209044c9838c12` | 331,501 | **MATCH (100% Khớp)** |
| `baseline_desktop_contracts_table.png` | `/` (Contracts) | 1440x900 | 2 | 2880x1800 | `d009c0b1980ee15860e8fdaa4a05054bac294d3ee06ac54cfc748338c54aeac9` | 492,115 | **MATCH (100% Khớp)** |
| `baseline_mobile_header_nav.png` | `/` (Overview) | 390x844 | 2 | 780x1688 | `466bfa5fb503bfd7c37077514c26092ccbfea5c8de6f31249b7bd8d2a721fd2f` | 136,215 | **MATCH (100% Khớp)** |
| `baseline_mobile_contracts_cards.png` | `/` (Contracts) | 390x844 | 2 | 780x1688 | `7da6e621aa032e055e8e6c5718925991a86b874dfc7ccf9f61a5dc08f9e0f4a0` | 143,441 | **MATCH (100% Khớp)** |

---

## 4. BÁO CÁO TỪNG CỔNG CHẤT LƯỢNG (QUALITY GATES)

- **`GATE_BASELINE_CAPTURED`:** **PASS** (Đã lưu trữ đầy đủ ảnh và bản đồ kiến trúc).
- **`GATE_BUILD_TYPECHECK`:** **PASS** (Build console 0, build landing 0, typecheck 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (`oxlint` cấu hình cho cả 2 workspace packages, chạy exit 0).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (100% file gốc trên Git khớp manifest và DPR pixels; đã xuất `evidence-integrity-test.json`).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (`apps/landing/public/sitemap.xml` đã khôi phục về ngày `2026-10-31`, diff Landing rỗng).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (Không trôi dòng tiền, không biến động tài chính; đã xuất `db-invariants-audit.json`).

---

## 5. SIGN-OFF & TIẾP NHẬN BƯỚC TIẾP THEO

- **Trạng thái Task `BASE-01`:** **PASS** (Hoàn tất toàn diện).
- **Sẵn sàng chuyển giao sang:**
  - `BASE-02`: Cô lập dữ liệu thử nghiệm và kế hoạch rollback.
  - `BASE-03` & `BASE-04`: Chuẩn hóa design tokens và tích hợp Animate UI motion tokens.
  - `UI-01` & `UI-02`: Redesign Desktop Header và Sidebar Toggle.
