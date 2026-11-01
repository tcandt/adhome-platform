# ACCEPTANCE REPORT — BASE-01

- **Task:** `BASE-01` — Khóa baseline, lập bản đồ kiến trúc thực tế
- **Scope:** Root monorepo, `@adhome/console`, `@adhome/landing`, Prisma ORM schema, Desktop & Mobile Navigation, Baseline Checks
- **Git:** branch=`main` base=`e3d4fb7` HEAD=`e3d4fb7` remote=`origin/main`
- **Env:** Windows 11 Pro native, Node `v24.15.0`, pnpm `11.14.0`, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), strict **NO Docker**, Landing RC1 strict feature freeze
- **Thời gian:** 2026-11-01T07:58:00+07:00 (`Asia/Ho_Chi_Minh`)
- **Trạng thái:** **`PASS`**

---

## 1. Changes
- **Tài liệu thẩm định:** Tạo mới tài liệu kỹ thuật [`docs/audits/CONSOLE_V2_BASELINE.md`](file:///d:/AdHome-Platform/docs/audits/CONSOLE_V2_BASELINE.md) ghi nhận đầy đủ kiến trúc, ranh giới dữ liệu, kiểm toán scripts, mapping route → API → DB.
- **Công cụ bằng chứng:** Tạo mới script chụp ảnh tự động [`apps/landing/scripts/captureBaselineScreenshots.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/captureBaselineScreenshots.mjs) kết nối trực tiếp Chromium DevTools Protocol (CDP).
- **Không thay đổi Schema / Config:** Bảo toàn tuyệt đối database schema và các biến môi trường hiện hành trong bước baseline.

---

## 2. Tests

| Test ID | Command / Request | Expected | Actual | PASS/FAIL |
|---|---|---|---|:---:|
| **BASE-T1** | `pnpm --filter @adhome/console build` | `tsc -b && vite build` hoàn thành mã thoát 0 | Build thành công trong 4.81s, xuất `dist/` | **PASS** |
| **BASE-T2** | `pnpm --filter @adhome/landing build` | `tsc -b && vite build && prerenderSeo.mjs` mã thoát 0 | Build thành công trong 3.0s, prerender 12 URLs | **PASS** |
| **BASE-T3** | `pnpm -r typecheck` | TypeScript compiler chạy không lỗi trên workspace | `@adhome/landing` typecheck PASS không lỗi | **PASS** |
| **BASE-T4** | `pnpm -r lint` | Kiểm tra script lint trong workspace packages | **Ghi nhận trung thực:** Không package nào có script `lint` (Mã thoát 1) | **FAIL (Expected / Missing Script)** |
| **BASE-T5** | `node apps/landing/scripts/verifyC4Sprint4.mjs` | 4/4 suites pass, 6/6 distinct screenshots | 100% backend checks pass, Quality Gate `LOCAL_GATE_PASSED` | **PASS** |

---

## 3. Visual Evidence (Ảnh chụp Baseline trước sửa đổi tại HEAD `e3d4fb7`)

| File | Route | Viewport | Scenario | SHA256 | Bytes | CapturedAt |
|---|---|---|---|---|---|---|
| `baseline_desktop_header_sidebar_expanded.png` | `/` (Overview) | 1440x900 | Desktop Header & Sidebar trạng thái mở rộng (Expanded) với Scope tòa nhà, Search, Notifications và User profile | `1d606165baed45b8061ce20f66b51e5ea4512e9b0bc983d548356f9eeb6f1c4a` | 404,274 | 2026-11-01T00:56:44Z |
| `baseline_desktop_header_sidebar_collapsed.png` | `/` (Overview) | 1440x900 | Desktop Header & Sidebar trạng thái thu gọn (Collapsed, Ctrl+B) và nút thu phóng sidebar hiện trạng | `d66a97f50b20bb490a61fa03407955f1be69bc4aa32d3b417ef288ebf2ddfba2` | 331,501 | 2026-11-01T00:56:45Z |
| `baseline_desktop_contracts_table.png` | `/` (Contracts) | 1440x900 | Desktop Phân hệ Hợp đồng: Bảng danh sách hợp đồng hiện trạng, mã hợp đồng dài, nút hành động và các cột dữ liệu | `d009c0b1980ee158c3db0a4eb4ec9aa0914b3a4a11270275ea2a981c2f21626c` | 492,115 | 2026-11-01T00:56:47Z |
| `baseline_mobile_header_nav.png` | `/` (Overview) | 390x844 | Giao diện Mobile: Header di động, chuyển đổi chế độ xem, điều hướng dưới chân trang (Bottom Navigation) | `466bfa5fb503bfd7c31d102e3b2e04eb92f44766bb32d84a7e7041ca73a8ad35` | 136,215 | 2026-11-01T00:56:49Z |
| `baseline_mobile_contracts_cards.png` | `/` (Contracts) | 390x844 | Giao diện Mobile: Danh sách hợp đồng dạng thẻ (Mobile Cards), định dạng tiền tệ và các nút hành động hiện trạng | `7da6e621aa032e057f975eb1ae9c7198bb638c4d283e7a0e2380f6fead14b8a5` | 143,441 | 2026-11-01T00:56:50Z |

---

## 4. Financial / Data Invariants
- **Database Schema:** Không thay đổi Prisma schema.
- **Ledger Invariant:** Không phát sinh bất kỳ giao dịch `CASH_IN` / `CASH_OUT` nào trong quá trình kiểm toán baseline.
- **Isolation Check:** Dữ liệu kiểm thử gắn chặt `orgId: 'org-adhome-anphu'` và building IDs cô lập.

---

## 5. Remaining Issues & Next Tasks
- **Missing Lint Script:** Cần bổ sung script linting tiêu chuẩn trong task `QA-04`.
- **Kế hoạch tiếp theo:**
  - `BASE-02`: Cô lập dữ liệu thử nghiệm và kế hoạch rollback.
  - `BASE-03`: Chuẩn hóa design tokens và visual reference.
  - `BASE-04`: Đọc và áp dụng Animate UI skill có kiểm soát.
  - `UI-01`: Redesign Desktop Header.
  - `UI-02`: Redesign nút thu gọn / mở rộng Sidebar Desktop.

---

## 6. Sign-off
- **Checklist complete:** 6/6 items
- **Build / Typecheck:** PASS (Console & Landing)
- **Screenshots hash verified:** 5/5 distinct hashes, zero collisions, file bytes khớp 100% manifest
- **Git status:** Sẵn sàng commit và push lên `origin/main`.
