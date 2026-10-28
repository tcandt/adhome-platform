# ADHOME LANDING PAGE — GATE 02 AUDIT, WIREFRAME & DESIGN TOKENS

## 1. Visual Diagnosis of Previous Version (Gate 01 Screenshots)
Captured before code changes:
- `docs/evidence/landing-gate02/before_1440_hero.png`
- `docs/evidence/landing-gate02/before_1440_full.png`
- `docs/evidence/landing-gate02/before_1920_hero.png`
- `docs/evidence/landing-gate02/before_390_hero.png`
- `docs/evidence/landing-gate02/before_390_full.png`

### Core Problems Identified:
1. **Header overcrowding:** The navy top bar + 7 menu links with count badges + 2 CTA buttons forced text wrapping in the desktop navbar and squeezed the AdHome logo.
2. **Hero visual noise:** Contained a status badge, 4 checkmark bullets, 2 CTAs, audience footnote, a framed card with 2 overlapping badges, 3 mini thumbnails, and a 4-box KPI strip immediately underneath. On mobile (`390px`), users saw only text and bullets above the fold—no apartment photo and no rooms.
3. **Room Card density:** Each card had 3–4 image overlays, highlight text, multi-line title, 3 icon specs, a 2-line description, 6 amenity tags, price, and 2 competing buttons (`Chi tiết` + `Quan tâm`).
4. **Section repetition:** Amenities and benefits were repeated across the Hero, Room Cards, 6 Why-Choose cards, 9 Amenity cards, 8 Gallery cards, and 5 Rental Process cards (totaling 40+ cards on one page).
5. **Unverified live claims:** Hardcoded "4 tòa · 34 phòng" and "Đồng bộ 10 phút trước" inside UI components, and didn't distinguish AI illustrative photos from verified unit photos.

---

## 2. Section Audit (Keep / Merge / Remove / Move)

| Previous Section / Element | Action | Gate 02 Redesign Decision |
|---|---|---|
| Top Navy Announcement Bar | **REMOVE** | Removed so Header is single-tier, calm, and spacious. |
| Sticky Header (7 links + 2 CTAs + badges) | **KEEP & SIMPLIFY** | Reduced to 5 links (`Trang chủ`, `Phòng cho thuê`, `Phòng sắp có`, `Về AdHome`, `Liên hệ`) + 1 primary CTA (`Xem phòng trống`). |
| Hero Bullet List + 3 Mini Thumbnails + 4-Box KPI Strip | **REMOVE** | Replaced with a single concise metadata line and a large, unencumbered hero photograph visible immediately on both desktop and mobile. |
| Available Rooms (`Phòng đang trống`) | **KEEP & REFINE** | Shows 3–6 featured rooms on `/` with minimal card hierarchy (Photo, Status, Short Name, Area/Type/Furnished, Price, 1 CTA) + `"Xem tất cả phòng trống"` link to `/phong-trong` (full list, filter, sort, pagination, mobile Filter Sheet). |
| Coming Soon (`Phòng sắp có`) | **KEEP & COMPACT** | Redesigned from large vertical cards into compact horizontal 2-column rows showing tentative date (`Dự kiến`) and `"Nhận thông báo khi có phòng"`. |
| `WhyChooseAndAmenitiesSection` (15 cards) | **MERGE** | Merged with Gallery & 3-step rental summary into a single editorial section: **Không gian sống & tiện nghi**. |
| `PhotoGallerySection` (8 cards) | **MERGE** | Curated into 4 distinct interior/amenity detail photographs inside **Không gian sống & tiện nghi** (labeled `Ảnh minh họa tiêu chuẩn`). |
| `RentalProcessSection` (5 icon cards) | **MERGE & CONDENSE** | Condensed into a clean 3-step horizontal strip inside **Không gian sống & tiện nghi**. |
| `PlatformIntroSection` (Mockup Console table) | **MOVE & SIMPLIFY** | Moved near the bottom (`Về AdHome`), removing SaaS dashboard tables and unverified realtime sync claims; focused on tenant benefits. |
| `LocationAndFaqSection` | **KEEP & STREAMLINE** | Combined into a balanced 2-column block: KĐT Ân Phú location details on the left, concise FAQ accordion on the right. |
| `Footer` | **KEEP & CLEAN** | Clean 3-column footer with verified contact details and navigation. |

---

## 3. New Editorial Wireframe (`/` and `/phong-trong`)

```text
================================================================================
[ STICKY HEADER (76px) ]
  Logo AdHome        Trang chủ   Phòng cho thuê   Phòng sắp có   Về AdHome   Liên hệ       [ Xem phòng trống ]
================================================================================

[ 01. HERO SECTION (12-col Editorial Split) ]
  Col 1–5:
    KHU ĐÔ THỊ ÂN PHÚ · TÂN AN, ĐẮK LẮK
    "Căn hộ dịch vụ full nội thất tại Khu đô thị Ân Phú" (44–52px)
    Subtitle ngắn gọn 2 dòng về không gian sống yên tĩnh, đầy đủ tiện nghi.
    [ Xem phòng đang trống ]   [ Liên hệ tư vấn ]
     Studio · 1PN · 2PN   |   28m² – 45m²   |   Từ 4.500.000đ/tháng
  Col 6–12:
    Large 16:10 Architectural Photograph (with subtle "Ảnh minh họa không gian" tag)
--------------------------------------------------------------------------------

[ 02. PHÒNG ĐANG TRỐNG (Featured 6 Rooms on Home / Full Catalog at /phong-trong) ]
  Heading: Phòng đang trống tại Ân Phú        Tabs: Tất cả | Studio | 1PN | 2PN
  Grid 3 Columns (Desktop) / 2 (Tablet) / 1 (Mobile):
  +-----------------------------------+
  | [ 4:3 Photo ]                     |
  | [Đang trống]     [Ảnh minh họa]   |
  +-----------------------------------+
  | Phòng 31-06 · Studio Ban Công     |
  | 32m² · Tầng 3 · Full nội thất     |
  | --------------------------------- |
  | 5.000.000đ/tháng   [Xem chi tiết] |
  +-----------------------------------+
  Footer action: [ Xem tất cả phòng trống (/phong-trong) -> ]
--------------------------------------------------------------------------------

[ 03. PHÒNG SẮP CÓ (Compact 2-Column Horizontal Rows) ]
  Heading: Phòng sắp có (Dự kiến theo lịch kết thúc hợp đồng)
  +----------------------------------------------------------------------------+
  | [Thumb]  Phòng 31-04 · Căn 2PN Mini (45m²)      Dự kiến: 10/11/2026        |
  |          Tòa LK01-31 · 6.500.000đ/tháng         [Nhận thông báo khi có phòng]|
  +----------------------------------------------------------------------------+
--------------------------------------------------------------------------------

[ 04. KHÔNG GIAN SỐNG & TIỆN NGHI (Merged Living Space + Curated Lookbook + 3 Steps) ]
  Left / Top: 4 giá trị cốt lõi + Biểu phí dịch vụ minh bạch
  Right / Grid: 4 ảnh chi tiết không trùng lặp (Bếp riêng, Góc làm việc, Phòng tắm, Nhà xe)
  Bottom Strip: Quy trình thuê 3 bước (1. Chọn phòng & hẹn lịch -> 2. Xem thực tế -> 3. Ký HĐ & nhận phòng)
--------------------------------------------------------------------------------

[ 05. VỊ TRÍ KHU ĐÔ THỊ ÂN PHÚ & CÂU HỎI THƯỜNG GẶP (2-Column Editorial) ]
  Col 1–6: Vị trí KĐT Ân Phú, Phường Tân An, Đắk Lắk + Kết nối di chuyển + Bản đồ
  Col 7–12: 5 Câu hỏi thường gặp (Accordion mượt)
--------------------------------------------------------------------------------

[ 06. VỀ NỀN TẢNG ADHOME (Compact, Tenant-First Platform Note) ]
  Giới thiệu ngắn gọn lợi ích cho khách thuê (Tra cứu phòng, minh bạch thông tin, đặt lịch xem, nhận thông báo)
--------------------------------------------------------------------------------

[ 07. FOOTER ]
================================================================================
```

---

## 4. Design System Tokens (Gate 02)

- **Layout & Grid:**
  - Max Container Width: `1220px` (`max-w-[1220px]`)
  - Grid: `12 columns`, gap `24px` (`gap-6`) on desktop, `16px` (`gap-4`) on mobile
  - Section Vertical Rhythm: `64px` (`py-16`) mobile, `88px` (`lg:py-22`) desktop
- **Typography Scale:**
  - Hero Title: `44px–52px` (`lg:text-[48px] leading-[1.12] tracking-[-0.02em]`) desktop, `32px–36px` mobile
  - Section Heading: `28px–34px` (`sm:text-[32px] leading-[1.2] tracking-[-0.015em]`)
  - Card Title: `17px` (`text-[17px] font-semibold leading-snug`)
  - Body Copy: `15px–16px` (`text-[15px] sm:text-base leading-relaxed`)
- **Flat Color Palette:**
  - Canvas Background: `#FAF9F5` (Warm Off-White)
  - Secondary Section Surface: `#F3F1EC` (Warm Stone)
  - Card / Elevated Surface: `#FFFFFF` (Pure White)
  - Primary Typography: `#111827` (Deep Charcoal / Navy)
  - Secondary Typography: `#4B5563`
  - Muted Typography: `#6B7280`
  - Primary Accent: `#2563EB` (Brand Blue), Hover `#1D4ED8`
  - Border Token: `#E6E4DD` (1px subtle warm border)
  - Radius Token: `8px` (`rounded-lg`) for buttons/inputs, `10px` (`rounded-[10px]`) for cards
  - Shadow Token: `0 1px 3px rgba(17, 24, 39, 0.04)` (ultra-light, border-first hierarchy)
