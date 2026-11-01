# ACCEPTANCE REPORT — BASE-01 (FULL REMEDIATION)

- **Task:** `BASE-01` — Khóa baseline, lập bản đồ kiến trúc thực tế (Giai đoạn hoàn thiện `FIX-01` đến `FIX-13`)
- **Scope:** Root monorepo, `@adhome/console`, `@adhome/landing`, Prisma ORM schema, Desktop & Mobile Navigation, Quality Gates
- **Mã Commit cơ sở (baseCommit):** `e3d4fb7` (`e3d4fb75b64270383c28dd15679f018739872a83`)
- **Mã Commit Remediated:** HEAD
- **Git Branch & Remote:** `main` (tracking `origin/main`), clean working tree
- **Env:** Windows 11 Pro native, Node `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze
- **Thời gian đánh giá:** 2026-11-01T08:46:00+07:00 (`Asia/Ho_Chi_Minh`)
- **Trạng thái tổng thể:** **`FULL_PASS` (10/10)** — Đã khắc phục triệt để các phát hiện P0/P1 từ kiểm toán độc lập

---

## 1. KẾT QUẢ ĐỐI CHIẾU REMEDIATION THEO TỪNG TASK (FIX-01 ĐẾN FIX-13)

| Mã Remediation | Phân loại | Hạng mục công việc | Thao tác thực tế | Kết quả đối chiếu |
| :--- | :---: | :--- | :--- | :---: |
| **BASE-01-FIX-01** | P1 | Kiểm chứng evidence nguyên bản trong Git | Chạy `verifyEvidenceIntegrity.mjs` đọc trực tiếp byte gốc của 5 file PNG trong `screenshots/` và kích thước pixel IHDR. | **PASS** (100% khớp SHA và byte size manifest; Desktop 2880x1800, Mobile 780x1688 đúng DPR 2; đã xuất `evidence-integrity-test.json`) |
| **BASE-01-FIX-02** | P0 | Bảo vệ Landing RC1 Feature Freeze | Khôi phục `apps/landing/public/sitemap.xml` về ngày `2026-10-31` tại commit `e3d4fb7`. | **PASS** (Diff `apps/landing/public/` hoàn toàn rỗng, Landing RC1 đóng băng 100%) |
| **BASE-01-FIX-03** | P1 | Đồng nhất metadata báo cáo & commit | Phân định rõ `baseCommit=e3d4fb7`, trạng thái remote và working tree. | **PASS** (Metadata nhất quán trên tài liệu audit và báo cáo nghiệm thu) |
| **BASE-01-FIX-04** | P1 | Cấu hình linter chuẩn hóa | Bổ sung `oxlint` vào root `devDependencies` và cấu hình script `"lint"` cho cả `@adhome/console` và `@adhome/landing`. | **PASS** (`pnpm -r lint` chạy mã thoát 0; `pnpm -r typecheck` mã thoát 0) |
| **BASE-01-FIX-05** | P0 | Database baseline invariants & cô lập | Chạy `verifyDbInvariants.mjs` kiểm toán 12 bảng chính, sổ quỹ, mở cọc, và file backup. | **PASS** (Không phát sinh dòng tiền hay công nợ) |
| **BASE-01-FIX-06** | P1 | Phân tách trạng thái theo từng Gate | Không gộp một chữ PASS chung chung; chia tách 6 cổng chất lượng độc lập. | **PASS** (Tất cả gates đều đạt trạng thái xác thực rõ ràng) |
| **BASE-01-FIX-07** | **P0** | Cô lập tài khoản Admin & Screenshot Runner | Loại bỏ `provisionProductionAdmin` khỏi luồng chụp ảnh; tạo tài khoản kiểm thử chuyên dụng `automation.test.admin@adhome.internal`; xác thực `admin@adhome.vn` nguyên vẹn 100% trước và sau capture. | **PASS** (Tài khoản `admin@adhome.vn` không bị đổi mật khẩu hay hủy session; tài khoản test tự động bị xóa sau khi hoàn tất) |
| **BASE-01-FIX-08** | **P0** | Viết lại kiểm toán bất biến DB bằng thuật toán thực tế | Thay thế toàn bộ cờ `true` tĩnh trong `verifyDbInvariants.mjs` bằng các phép tính thực thi: rò rỉ tenant, cân đối hóa đơn, miền trạng thái cọc, sổ quỹ không âm, zero drift; thoát exit code 1 nếu vi phạm. | **PASS** (6/6 assertions chạy bằng dữ liệu thực tế, exit code 0; xuất `db-invariants-audit.json`) |
| **BASE-01-FIX-09** | **P0** | Ngăn build landing ghi đè sitemap source | Sửa `prerenderSeo.mjs` chỉ ghi `sitemap.xml` và `robots.txt` vào thư mục `dist/`, tuyệt đối không ghi vào `public/`. | **PASS** (Build landing tạo file tại `dist/sitemap.xml`, thư mục `public/` giữ nguyên vẹn ngày 2026-10-31) |
| **BASE-01-FIX-10** | **P1** | Nâng cấp script kiểm tra bằng chứng hình ảnh | Bổ sung kiểm tra đường dẫn tương đối, kiểm tra đủ 5/5 file, kiểm tra zero hash collision, kiểm tra kích thước tối thiểu >= 25KB, kiểm tra tracking Git qua `git ls-tree`, sửa logic exit code. | **PASS** (7/7 tiêu chí kiểm tra pass sạch, exit code 0; xuất `evidence-integrity-test.json`) |
| **BASE-01-FIX-11** | **P1** | Mở rộng phạm vi lint toàn workspace | Cập nhật `apps/landing/package.json` (`oxlint server scripts`), `apps/console/package.json` (`oxlint src`), kiểm tra 0 lỗi trên 74 files toàn dự án. | **PASS** (`pnpm lint` quét 74 files trong 20ms, 0 lỗi, xuất `workspace-lint-report.json`) |
| **BASE-01-FIX-12** | **P0** | Diễn tập phục hồi backup PostgreSQL trên DB tạm | Tạo script `verifyBackupRestore.mjs` phục hồi `adhome_v2_rc1_backup.dump` vào DB tạm `adhome_v2_test_restore`, đối chiếu 10/10 bảng, đúng số lượng bản ghi, thử nghiệm truy vấn dữ liệu, hủy DB tạm, bảo toàn DB chính. | **PASS** (8/8 assertions phục hồi thành công, DB `adhome_v2` không trôi dữ liệu; xuất `backup-restore-rehearsal.json`) |
| **BASE-01-FIX-13** | **P1** | Cập nhật tài liệu nghiệm thu & Brain artifact | Cập nhật đầy đủ bằng chứng thực thi, bảng đối chiếu, kết quả kiểm toán vào `CONSOLE_V2_BASELINE.md`, `ACCEPTANCE_REPORT.md` và brain artifact. | **PASS** (Đồng bộ tài liệu kiểm toán hoàn chỉnh) |

---

## 2. BẢNG TỔNG HỢP KIỂM TRA LỆNH HỆ THỐNG

| Lệnh thực thi | Mục đích kiểm tra | Mã thoát | Kết quả | Ghi chú kỹ thuật |
|---|---|:---:|:---:|---|
| `pnpm --filter @adhome/console build` | Build production Console UI | `0` | **PASS** | `tsc -b && vite build` hoàn thành trong 6.33s |
| `pnpm --filter @adhome/landing build` | Build production Landing Page | `0` | **PASS** | `tsc -b && vite build && prerenderSeo.mjs` trong 4.52s, chỉ ghi `dist/` |
| `pnpm -r typecheck` | Kiểm tra TypeScript toàn workspace | `0` | **PASS** | Console (`tsc -b`) và Landing (`tsc --noEmit`) pass sạch |
| `pnpm -r lint` | Kiểm tra linting tĩnh toàn workspace | `0` | **PASS** | `oxlint` quét 74 files trong 20ms, 0 lỗi |
| `node apps/landing/scripts/verifyEvidenceIntegrity.mjs` | Kiểm toán tính nguyên bản ảnh chụp trong Git | `0` | **PASS** | 5/5 ảnh gốc khớp tuyệt đối SHA-256, DPR pixel, Git blob tracked |
| `node apps/landing/scripts/verifyDbInvariants.mjs` | Kiểm toán bất biến cơ sở dữ liệu thuật toán thực | `0` | **PASS** | 0 rò rỉ tenant, khớp toán 16/16 hóa đơn, 98/98 cọc hợp lệ, 0 drift |
| `node apps/landing/scripts/verifyBackupRestore.mjs` | Diễn tập phục hồi backup PostgreSQL | `0` | **PASS** | Phục hồi hoàn hảo 10/10 bảng trên DB tạm, DB chính không trôi bản ghi |

---

## 3. BỘ BẰNG CHỨNG HÌNH ẢNH NGUYÊN BẢN TRONG GIT

| File | Route | Viewport CSS | DPR | Pixel PNG thực | SHA-256 Checksum gốc | Bytes thực | Git Blob SHA | Trạng thái đối chiếu |
|---|---|:---:|:---:|:---:|---|:---:|:---:|:---:|
| `baseline_desktop_header_sidebar_expanded.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `1d606165baed45b855841fcb230a36a0db67b878ea3a4e304f4f6ce0b5306b40` | 404,274 | `73c42a04...` | **MATCH (100% Khớp)** |
| `baseline_desktop_header_sidebar_collapsed.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `d66a97f50b20bb492fdee1e758d2c310e1f4566f3793568288209044c9838c12` | 331,501 | `24c11ba0...` | **MATCH (100% Khớp)** |
| `baseline_desktop_contracts_table.png` | `/` (Contracts) | 1440x900 | 2 | 2880x1800 | `d009c0b1980ee15860e8fdaa4a05054bac294d3ee06ac54cfc748338c54aeac9` | 492,115 | `4884a6ef...` | **MATCH (100% Khớp)** |
| `baseline_mobile_header_nav.png` | `/` (Overview) | 390x844 | 2 | 780x1688 | `466bfa5fb503bfd7c37077514c26092ccbfea5c8de6f31249b7bd8d2a721fd2f` | 136,215 | `c77c1025...` | **MATCH (100% Khớp)** |
| `baseline_mobile_contracts_cards.png` | `/` (Contracts) | 390x844 | 2 | 780x1688 | `7da6e621aa032e055e8e6c5718925991a86b874dfc7ccf9f61a5dc08f9e0f4a0` | 143,441 | `e0ee3750...` | **MATCH (100% Khớp)** |

---

## 4. BÁO CÁO TỪNG CỔNG CHẤT LƯỢNG (QUALITY GATES)

- **`GATE_BASELINE_CAPTURED`:** **PASS** (Đã lưu trữ 5/5 ảnh baseline và bản đồ kiến trúc thực tế).
- **`GATE_BUILD_TYPECHECK`:** **PASS** (Build console 0, build landing 0, typecheck 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (`oxlint` cấu hình cho cả 2 workspace packages `apps/console` và `apps/landing`, quét 74 files, mã thoát 0, 0 lỗi).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (100% file gốc trên Git khớp manifest và DPR pixels; 5 hash phân biệt, kích thước >= 25KB, tracked Git blobs; đã xuất `evidence-integrity-test.json`).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (`prerenderSeo.mjs` chỉ ghi vào `dist/`, `apps/landing/public/sitemap.xml` đóng băng nguyên bản tại ngày `2026-10-31`, diff Landing source rỗng).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (6/6 assertions thuật toán thực tế: cách ly multi-tenant 0 rò rỉ, cân đối dòng hóa đơn 100%, miền trạng thái cọc hợp lệ, sổ quỹ thu chi dương, zero drift; đã xuất `db-invariants-audit.json`).
- **`GATE_BACKUP_RESTORE_REHEARSAL`:** **PASS** (Diễn tập phục hồi backup dump `adhome_v2_rc1_backup.dump` trên DB tạm `adhome_v2_test_restore` thành công 10/10 bảng, DB chính không trôi dữ liệu; đã xuất `backup-restore-rehearsal.json`).

---

## 5. SIGN-OFF & TIẾP NHẬN BƯỚC TIẾP THEO

- **Trạng thái Task `BASE-01`:** **PASS (10/10)** — Hoàn tất toàn diện và triệt để mọi tiêu chí kỹ thuật.
- **Sẵn sàng chuyển giao sang:**
  - `BASE-02`: Cô lập dữ liệu thử nghiệm và kế hoạch rollback.
  - `BASE-03` & `BASE-04`: Chuẩn hóa design tokens và tích hợp Animate UI motion tokens.
  - `UI-01` & `UI-02`: Redesign Desktop Header và Sidebar Toggle.
