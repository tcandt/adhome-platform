# ADHOME LANDING PAGE — GATE 03 VERIFICATION, A11Y & PERFORMANCE REPORT

## 1. Automated E2E Test Matrix (13/13 Passed)

| # | Kiểm thử nghiệm thu (Gate 03) | Trạng thái | Chi tiết xác minh |
| :- | :--- | :--- | :--- |
| 1 | **Home Page 6 Unique Featured Room Card Covers & Zero Hero Image Duplication** | PASS | `Displayed=6, UniqueCovers=6, HeroDuplicated=false` |
| 2 | **Image Optimization (WebP + 100% Alt Attributes)** | PASS | `Total=17, WebP/SVG=17, MissingAlt=0` |
| 3 | **Dedicated Catalog Route (/phong-trong) & Canonical Metadata** | PASS | `Canonical=https://adhome.ductinh.one/phong-trong, Page1Cards=6` |
| 4 | **Shareable Room Detail Route (/phong/:slug) SEO, Album & Schema.org Apartment JSON-LD** | PASS | `Title="Phòng 31-06 · Studio Ban Công (32m² · 5.000.000đ/tháng) — KĐT Ân Phú | AdHome", Canonical=https://adhome.ductinh.one/phong/studio-ban-cong-31-06-lk01-31-an-phu, AlbumThumbnails=3` |
| 5 | **Room Share URL Copy Action** | PASS | `ButtonText="Đã sao chép liên kết phòng"` |
| 6 | **Lead Form Auto-Detects Room ID (P.31-06 / rm-31-06) & Formats Date as DD/MM/YYYY** | PASS | `RoomContext="Phòng 31-06 · Studio Ban CôngMã P.31-06 · 32m² · Tòa LK01-315.000.000đ/tháng", DateDisplay="28/10/2026"` |
| 7 | **Lead Form Rejects Invalid Vietnamese Phone & Past Move-In Date** | PASS | `Both phone and past-date validation errors displayed accurately` |
| 8 | **LIVE MODE API Failure Does Not Fallback to Seed Data** | PASS | `Explicit error displayed, zero seed rooms leaked` |
| 9 | **Demo Mode Lead Submission Never Fakes Success (Warns Unsaved)** | PASS | `Banner="Chưa lưu được yêu cầu trực tuyếnTrang đang chạy ở Chế độ Dữ liệu mẫu (Demo Mode) không kết nối máy chủ lưu trữ..."` |
| 10 | **Live Mode Lead Submission Persists to Backend Store & Displays Reference Code** | PASS | `SavedCount=1, Ref=ADH-0101, RoomId=rm-31-06` |
| 11 | **Anti-Duplicate Lead Submission Guard (HTTP 409 Conflict)** | PASS | `Status=409, ErrorCode=DUPLICATE_SUBMISSION` |
| 12 | **Console Dynamic Room Update API (Price, Images, Status, Expected Date)** | PASS | `UpdatedPrice=5150000` |
| 13 | **Mobile 390x844 Full-Screen Quick View Sheet & Body Scroll Lock** | PASS | `Overflow=hidden, Sheet=390x844` |

## 2. Core Web Vitals & Performance Metrics (Production Build `http://127.0.0.1:8081`)

- **TTFB (Time to First Byte):** `3 ms`
- **FCP (First Contentful Paint):** `408 ms`
- **DOMContentLoaded:** `297 ms`
- **Window Load Event:** `298 ms`
- **CLS (Cumulative Layout Shift):** `0.00` (explicit `aspect-[16/10]` / `aspect-[4/3]` containers + `width`/`height` attributes on all images)
- **Image Optimization:** 100% of room & gallery photos converted to responsive **WebP** (`-640w.webp` and `1024w .webp`), reducing total image payload by **92%** (`~9.3 MB -> ~779 KB`).

## 3. Accessibility & SEO Verification

- **Missing `alt` attributes:** `0` (0 missing across 17 images)
- **Color Contrast:** Primary ink `#0F172A` (`16.8:1`), secondary body `#334155` (`9.6:1`), muted metadata `#475569` (`6.9:1` on `#F8F7F4`) — all exceed WCAG 2.1 AA (`4.5:1`).
- **Static SEO Prerendering:**
  - `dist/index.html`
  - `dist/phong-trong/index.html`
  - `dist/phong/<slug>/index.html` (12 prerendered room detail HTML files with room-specific `<title>`, `<meta name="description">`, `<link rel="canonical">`, OpenGraph tags, and `Apartment` JSON-LD)
  - `dist/sitemap.xml` (14 canonical URLs) & `dist/robots.txt`
