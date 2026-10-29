# AdHome Landing Page (`https://adhome.vn`) — Gate 03: Production Readiness

Trang web cho thuê căn hộ dịch vụ, phòng Studio, 1PN và 2PN mini full nội thất tại **Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk**, đồng thời giới thiệu nền tảng quản lý vận hành **AdHome**.

---

## 1. Cấu trúc thư mục (`Structure`)

```text
apps/landing/
├── index.html                           # SEO meta, Preload LCP WebP, Schema.org ApartmentComplex
├── package.json                         # @adhome/landing (Vite + React + TS + Tailwind + Prerender SEO)
├── tailwind.config.js                   # Bảng màu phẳng chuẩn WCAG AA (#F8F7F4, #FFFFFF, #0F172A, #1E5EFF)
├── data/
│   ├── verified-public-rooms.json       # Kho dữ liệu phòng công khai đã xác minh (đồng bộ từ Console)
│   └── public-inquiries.json            # Kho lưu trữ yêu cầu hẹn xem phòng / nhận thông báo
├── server/
│   └── publicApiPlugin.ts               # Public Listings & Lead Persistence API (/api/v1/public/*)
├── scripts/
│   ├── prerenderSeo.mjs                 # Prerender tĩnh /phong-trong, /phong/:slug, sitemap.xml & robots.txt
│   └── e2eGate03.mjs                    # Bộ kiểm thử E2E, Accessibility & Core Web Vitals (CDP)
├── public/
│   ├── brand/                           # Bộ logo SVG chính thức của AdHome
│   ├── images/rooms/                    # Bộ 13 ảnh căn hộ định dạng WebP (1024w & 640w responsive)
│   ├── sitemap.xml                      # Sitemap tự động sinh cho /, /phong-trong và /phong/:slug
│   └── robots.txt                       # Cấu hình robots.txt chuẩn SEO
└── src/
    ├── types/
    │   └── room.ts                      # Định nghĩa RoomListing, DataMode, LeadInquiryPayload/Result
    ├── data/
    │   └── roomsSeed.ts                 # Dữ liệu khởi tạo và chế độ Demo xem trước
    ├── services/
    │   ├── roomService.ts               # Tách biệt LIVE MODE / DEMO MODE, kiểm tra dữ liệu & lưu Lead
    │   └── seoService.ts                # Cập nhật Title, Meta Description, Canonical, OG & JSON-LD theo route
    ├── components/
    │   ├── Header.tsx                   # Sticky Header tối giản (5 mục điều hướng + 1 CTA + Mobile Sheet)
    │   ├── HeroSection.tsx              # Hero tinh gọn, tối ưu LCP WebP & line-height tiếng Việt
    │   ├── RoomCard.tsx                 # Thẻ phòng chuẩn 6 phần tử, ảnh đại diện riêng biệt từng phòng
    │   ├── AvailableRoomsSection.tsx    # Hiển thị 6 phòng nổi bật trên trang chủ + điều hướng /phong-trong
    │   ├── AllRoomsPage.tsx             # Trang danh sách đầy đủ (/phong-trong): lọc, sắp xếp, phân trang
    │   ├── RoomDetailPage.tsx           # Trang chi tiết từng phòng (/phong/:slug): album ảnh, chia sẻ URL, SEO
    │   ├── ComingSoonSection.tsx        # Danh sách phòng dự kiến sắp có (thẻ ngang 2 cột)
    │   ├── LivingSpaceSection.tsx       # Không gian sống & tiện nghi + quy trình thuê 3 bước
    │   ├── LocationAndFaqSection.tsx    # Vị trí Khu đô thị Ân Phú, Tân An, Đắk Lắk + FAQ
    │   ├── PlatformIntroSection.tsx     # Giới thiệu nền tảng AdHome hướng tới lợi ích người thuê
    │   ├── RoomDetailModal.tsx          # Modal xem nhanh (Full-screen sheet trên mobile) + mở /phong/:slug
    │   ├── LeadInquiryModal.tsx         # Form liên hệ chuẩn hóa DD/MM/YYYY, chống spam/trùng, không giả lập lưu
    │   └── Footer.tsx                   # Footer thông tin liên hệ & điều hướng
    ├── App.tsx                          # Điều hướng SPA (/, /phong-trong, /phong/:slug)
    └── main.tsx                         # Entry point
```

---

## 2. Chế độ dữ liệu (`LIVE MODE` vs `DEMO MODE`) & Public API

Hệ thống phân tách chặt chẽ giữa **LIVE MODE** (mặc định trên Production) và **DEMO MODE** (`?mode=demo` hoặc `VITE_DATA_MODE=demo`):

- **`LIVE MODE`**:
  - Lấy dữ liệu từ `GET /api/v1/public/rooms` (chỉ xuất bản phòng có `isPublic === true`, `status === 'AVAILABLE' | 'COMING_SOON'` và `sourceVerified === true`).
  - Hỗ trợ Console cập nhật giá thuê, album ảnh, trạng thái và ngày dự kiến trống qua `PATCH /api/v1/public/rooms/:slug`.
  - Khi API lỗi, hệ thống hiển thị thông báo lỗi minh bạch và **tuyệt đối không tự chuyển sang dữ liệu mẫu (`roomsSeed.ts`)**.
- **`DEMO MODE`**:
  - Chỉ kích hoạt khi truyền tường minh `?mode=demo` hoặc `VITE_DATA_MODE=demo`.
  - Hiển thị băng thông báo dữ liệu mẫu chưa xác minh và gắn nhãn `"Minh họa · ..."` trên trạng thái phòng.
  - Khi người dùng gửi form liên hệ trong `DEMO MODE`, hệ thống cảnh báo rõ yêu cầu **chưa được lưu vào cơ sở dữ liệu** (không giả lập thành công).

---

## 3. Lệnh chạy phát triển, Build Prerender & Kiểm thử E2E (Không dùng Docker)

Từ thư mục gốc `d:\AdHome-Platform`:

```bash
# 1. Chạy máy chủ phát triển Landing Page kèm Public API (http://127.0.0.1:5173)
pnpm dev:landing

# 2. Kiểm tra kiểu TypeScript, đóng gói bản Production và Prerender SEO (apps/landing/dist)
pnpm build:landing

# 3. Chạy kiểm thử tự động E2E, Accessibility & Core Web Vitals Gate 03
cd apps/landing && node scripts/e2eGate03.mjs
```
