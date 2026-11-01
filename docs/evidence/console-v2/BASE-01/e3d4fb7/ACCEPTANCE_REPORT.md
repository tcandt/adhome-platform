# ACCEPTANCE REPORT — BASE-01 (ADVANCED REMEDIATION)

- **Task:** `BASE-01` — Khóa baseline, lập bản đồ kiến trúc thực tế (Giai đoạn hoàn thiện nâng cao: `FIX-01` đến `FIX-13`, `SEC-01`, `OPS-01`, `BASE-02-A/B/C/D`, `FIN-UI-01`, `EVD-01`, `QA-01`)
- **Scope:** Root monorepo, `@adhome/console`, `@adhome/landing`, Prisma ORM schema, Desktop & Mobile Navigation, Privacy & Quality Gates
- **Mã Commit cơ sở (baseCommit):** `e3d4fb7` (`e3d4fb75b64270383c28dd15679f018739872a83`)
- **Mã Commit Remediated:** HEAD
- **Git Branch & Remote:** `main` (tracking `origin/main`), clean working tree
- **Env:** Windows 11 Pro native, Node `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze
- **Thời gian đánh giá:** 2026-11-01T09:40:00+07:00 (`Asia/Ho_Chi_Minh`)
- **Trạng thái nghiệm thu kỹ thuật:** **`VERIFIED_PASS` (Theo từng Gate độc lập, không gộp nhãn chung)**

---

## 1. KẾT QUẢ ĐỐI CHIẾU CÁC HẠNG MỤC THEO ĐÁNH GIÁ ĐỘC LẬP

| Mã Hạng mục | Mức độ | Yêu cầu kiểm toán độc lập | Thao tác kỹ thuật & Kết quả thực tế | Trạng thái |
| :--- | :---: | :--- | :--- | :---: |
| **`SEC-01`** | **P0** | Rà soát PII & bí mật trong public evidence | Tạo `verifyPrivacyEvidence.mjs`: quét 51 thực thể trong DB (khách thuê, người ở, leads) xác nhận 100% là `TEST_FIXTURE` nhân tạo, 0 Real PII. Xác thực 0 dump file trong Git history, `.gitignore` bảo vệ `*.dump`, `backups/`. Xuất `privacy-evidence-audit.json`. | **PASS** |
| **`BASE-02-A`** | **P0** | Cô lập tài khoản test & runner chụp ảnh | Runner dùng test actor `automation.test.admin@adhome.internal`, snapshot và assert tài khoản `admin@adhome.vn` nguyên vẹn 100%. Loại bỏ hardcode đường dẫn tuyệt đối, chuyển sang `process.cwd()`. | **PASS** |
| **`BASE-02-B`** | **P0** | Zero drift kiểm tra giá trị & fingerprint, không chỉ count | Cập nhật `verifyDbInvariants.mjs`: tính toán SHA-256 fingerprint trên từng dòng và tổng tiền của Invoices, Deposits, Ledger, Contracts. Chạy negative test: can thiệp 1 VNĐ giữ nguyên số dòng lập tức kích hoạt phát hiện lệch (FAIL). Xuất `db-invariants-audit.json`. | **PASS** |
| **`BASE-02-C`** | **P0** | Kiểm tra nhất quán quan hệ Multi-tenant (FKs) | Kiểm tra cross-table consistency: `room.orgId === building.orgId`, `contract.orgId === room/tenant/building.orgId`, `deposit/invoice.orgId === contract.orgId`. Kết quả: 0 sai lệch. | **PASS** |
| **`BASE-02-D`** | **P0** | Phục hồi backup toàn diện 31 bảng nghiệp vụ | Nâng cấp `verifyBackupRestore.mjs` phục hồi dump toàn diện `adhome_v2_full_operational_backup.dump` (31 bảng, 44 phòng, 13 HĐ, 98 cọc, 437 ledger, 877.1M thu, 255.2M chi) vào DB tạm tên ngẫu nhiên `adhome_v2_rehearsal_*`. Xuất `backup-restore-rehearsal.json`. | **PASS** |
| **`FIN-UI-01`** | **P0** | Đối chiếu công suất phòng & cảnh báo thiếu cọc 6M | Viết `reconcileOccupancyAndDeposits.mjs`: xác thực 44 phòng (16 occupied gồm 9 có HĐ active + 7 từ listing cũ, 5 reserved, 23 available). Cảnh báo "Đã thu 0đ (thiếu 6.000.000đ)" trên `HD-S4-401` là do cọc quy định 6M nhưng chưa thu phiếu cọc (`paid=0`), đúng logic vận hành. Xuất `occupancy-deposit-reconciliation.json`. | **PASS** |
| **`OPS-01`** | **P0** | Phân loại dữ liệu LK thực tế vs Tòa fixture S2B/S3B/S4B | Phân định rõ 4 tòa LK (29 phòng khu Liền kề Ân Phú) và 3 tòa S-series (15 phòng fixture phục vụ test C4 Sprint 2, 3, 4). | **PASS** |
| **`EVD-01`** | **P1** | Đối chiếu local hash-object trực tiếp với Git blob HEAD | Cập nhật `verifyEvidenceIntegrity.mjs` chạy `git hash-object` trên file đĩa và đối chiếu trực tiếp với SHA blob trong `git ls-tree -r HEAD`. 5/5 ảnh khớp tuyệt đối, phát hiện tức thì nếu file bị sửa uncommitted. | **PASS** |
| **`QA-01`** | **P1** | Lint bao phủ đầy đủ source và script | Mở rộng cấu hình `oxlint` bao phủ cả `apps/landing/src` (`oxlint src server scripts`), quét 97 files toàn workspace với **0 errors**, xuất `workspace-lint-report.json`. | **PASS** |
| **`EVD-02`** | **P1** | Đóng dấu rõ ảnh baseline là TRƯỚC REDESIGN | Gắn nhãn `BEFORE_REDESIGN` cho 5 ảnh baseline, không sử dụng làm bằng chứng nghiệm thu giao diện sau redesign. | **PASS** |

---

## 2. BẢNG TỔNG HỢP KIỂM TRA LỆNH HỆ THỐNG

| Lệnh thực thi | Mục đích kiểm tra | Mã thoát | Kết quả | Ghi chú kỹ thuật |
|---|---|:---:|:---:|---|
| `pnpm --filter @adhome/console build` | Build production Console UI | `0` | **PASS** | `tsc -b && vite build` hoàn thành trong 5.32s |
| `pnpm --filter @adhome/landing build` | Build production Landing Page | `0` | **PASS** | `tsc -b && vite build && prerenderSeo.mjs` trong 3.40s, chỉ ghi `dist/` |
| `pnpm -r typecheck` | Kiểm tra TypeScript toàn workspace | `0` | **PASS** | Console (`tsc -b`) và Landing (`tsc --noEmit`) pass sạch |
| `pnpm -r lint` | Kiểm tra linting tĩnh toàn workspace | `0` | **PASS** | `oxlint` quét 97 files (kèm `landing/src`) trong 25ms, **0 lỗi** |
| `node apps/landing/scripts/verifyPrivacyEvidence.mjs` | Kiểm toán PII & bảo vệ sao lưu | `0` | **PASS** | 51 thực thể 100% synthetic test fixture, 0 dump trong Git |
| `node apps/landing/scripts/verifyEvidenceIntegrity.mjs` | Kiểm toán ảnh thô so với blob Git HEAD | `0` | **PASS** | 5/5 ảnh gốc khớp tuyệt đối SHA-256, DPR pixel, `git hash-object` = HEAD blob |
| `node apps/landing/scripts/verifyDbInvariants.mjs` | Kiểm toán bất biến DB bằng giá trị & fingerprint | `0` | **PASS** | 0 rò rỉ tenant, FKs nhất quán, 16/16 hóa đơn khớp toán, zero drift, negative test pass |
| `node apps/landing/scripts/verifyBackupRestore.mjs` | Diễn tập phục hồi backup full 31 bảng | `0` | **PASS** | Phục hồi hoàn hảo 31 bảng trên DB tạm ngẫu nhiên, DB chính không trôi bản ghi |
| `node apps/landing/scripts/reconcileOccupancyAndDeposits.mjs` | Đối chiếu công suất & cọc hợp đồng | `0` | **PASS** | 16/44 occupied, 9 HĐ active, giải trình chính xác cảnh báo thiếu cọc 6M |

---

## 3. BỘ BẰNG CHỨNG HÌNH ẢNH NGUYÊN BẢN TRONG GIT (`BEFORE_REDESIGN`)

| File | Route | Viewport CSS | DPR | Pixel PNG thực | SHA-256 Checksum gốc | Git Blob SHA-1 (Local & HEAD) | Trạng thái đối chiếu |
|---|---|:---:|:---:|:---:|---|:---:|:---:|
| `baseline_desktop_header_sidebar_expanded.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `1d606165baed45b855841fcb230a36a0db67b878ea3a4e304f4f6ce0b5306b40` | `73c42a04...` | **MATCH (100% Khớp)** |
| `baseline_desktop_header_sidebar_collapsed.png` | `/` (Overview) | 1440x900 | 2 | 2880x1800 | `d66a97f50b20bb492fdee1e758d2c310e1f4566f3793568288209044c9838c12` | `24c11ba0...` | **MATCH (100% Khớp)** |
| `baseline_desktop_contracts_table.png` | `/` (Contracts) | 1440x900 | 2 | 2880x1800 | `d009c0b1980ee15860e8fdaa4a05054bac294d3ee06ac54cfc748338c54aeac9` | `4884a6ef...` | **MATCH (100% Khớp)** |
| `baseline_mobile_header_nav.png` | `/` (Overview) | 390x844 | 2 | 780x1688 | `466bfa5fb503bfd7c37077514c26092ccbfea5c8de6f31249b7bd8d2a721fd2f` | `c77c1025...` | **MATCH (100% Khớp)** |
| `baseline_mobile_contracts_cards.png` | `/` (Contracts) | 390x844 | 2 | 780x1688 | `7da6e621aa032e055e8e6c5718925991a86b874dfc7ccf9f61a5dc08f9e0f4a0` | `e0ee3750...` | **MATCH (100% Khớp)** |

---

## 4. BÁO CÁO THEO TỪNG CỔNG CHẤT LƯỢNG ĐỘC LẬP

- **`GATE_BASELINE_CAPTURED`:** **PASS** (Đã lưu trữ 5/5 ảnh baseline `BEFORE_REDESIGN`, runner dùng actor cô lập không tác động admin sản xuất).
- **`GATE_BUILD_TYPECHECK`:** **PASS** (Build console 0, build landing 0, typecheck 0).
- **`GATE_LINT_CONFIGURED`:** **PASS** (`oxlint` cấu hình cho cả 2 workspace packages gồm `apps/landing/src`, quét 97 files, mã thoát 0, 0 lỗi).
- **`GATE_EVIDENCE_INTEGRITY`:** **PASS** (100% file gốc trên Git khớp manifest và DPR pixels; 5 hash phân biệt, kích thước >= 25KB, **local git hash-object khớp 100% blob SHA trong HEAD**; đã xuất `evidence-integrity-test.json`).
- **`GATE_LANDING_RC1_FREEZE`:** **PASS** (`prerenderSeo.mjs` chỉ ghi vào `dist/`, `apps/landing/public/sitemap.xml` đóng băng nguyên bản tại ngày `2026-10-31`, diff Landing source rỗng).
- **`GATE_DATABASE_INVARIANTS`:** **PASS** (8/8 assertions: cách ly tenant, FKs nhất quán, 16/16 hóa đơn khớp toán, miền trạng thái cọc hợp lệ, sổ quỹ thu chi dương, **zero value/fingerprint drift**, negative test passed; đã xuất `db-invariants-audit.json`).
- **`GATE_BACKUP_RESTORE_REHEARSAL`:** **PASS** (Diễn tập phục hồi backup full 31 bảng nghiệp vụ vào DB tạm tên ngẫu nhiên `adhome_v2_rehearsal_*` thành công 100%, bảo toàn DB chính không trôi dữ liệu; đã xuất `backup-restore-rehearsal.json`).
- **`GATE_PRIVACY_EVIDENCE_AUDIT`:** **PASS** (51 thực thể trong DB đều là fixture nhân tạo, 0 real PII, 0 dump trong Git, `.gitignore` bảo vệ đầy đủ; đã xuất `privacy-evidence-audit.json`).

---

## 5. KẾT LUẬN & SẴN SÀNG CHUYỂN GIAO SPRINT UI/UX TIẾP THEO

Toàn bộ các yêu cầu an toàn dữ liệu, kiểm toán PII, backup phục hồi toàn diện, kiểm chứng hash blob và đối soát nghiệp vụ đã được hoàn thành. Đủ điều kiện chuyển giao sang các task giao diện tiếp theo theo đúng lộ trình Mục E:
1. **Visual Foundation:** Chuẩn hóa design tokens và tích hợp Animate UI motion tokens.
2. **`UI-01` & `UI-02`:** Redesign Desktop Header (3 vùng rõ ràng, scope tòa nhà, search, profile) và Sidebar Toggle (control hòa hợp giao diện, tooltip, keyboard shortcut, smooth motion).
3. **`UI-03` đến `UI-07`:** Desktop Contracts table, Mobile Header, Mobile Contracts cards, Mobile Dashboard density, và Logo loading đo tiến độ thực.
