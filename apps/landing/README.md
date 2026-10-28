# AdHome Landing Page (`https://adhome.ductinh.one`)

Trang web cho thuê căn hộ dịch vụ, phòng Studio, 1PN và 2PN mini full nội thất tại **Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk**, đồng thời giới thiệu nền tảng quản lý vận hành **AdHome**.

---

## 1. Cấu trúc thư mục (`Structure`)

```text
apps/landing/
├── index.html                           # SEO meta, OpenGraph, Schema.org ApartmentComplex
├── package.json                         # @adhome/landing (Vite + React + TS + Tailwind)
├── tailwind.config.js                   # Hệ màu phẳng (Editorial / Warm Alabaster & Brand Navy)
├── public/
│   ├── brand/                           # Bộ logo SVG chính thức của AdHome
│   └── images/rooms/                    # Bộ 10 ảnh thực tế căn hộ dịch vụ đồng bộ phong cách
└── src/
    ├── types/
    │   └── room.ts                      # Định nghĩa kiểu dữ liệu RoomListing, BuildingPublicSummary, GalleryPhotoItem
    ├── data/
    │   └── roomsSeed.ts                 # Seed data cho 4 tòa (LK01-31, LK01-32, LK08-24, LK08-25)
    ├── services/
    │   └── roomService.ts               # Lớp truy xuất dữ liệu (tự động lọc phòng public, sẵn sàng nối API)
    ├── components/
    │   ├── Header.tsx                   # Sticky Header + Mobile Navigation Drawer
    │   ├── HeroSection.tsx              # Hero + Quick Availability Summary (4 chỉ số nhanh)
    │   ├── AvailableRoomsSection.tsx    # Danh sách phòng đang trống + Bộ lọc + Skeleton/Empty state
    │   ├── ComingSoonSection.tsx        # Danh sách phòng sắp trống / dự kiến có phòng
    │   ├── WhyChooseAndAmenitiesSection.tsx # Vì sao chọn AdHome + Bảng tiện ích & Biểu phí dịch vụ
    │   ├── PhotoGallerySection.tsx      # Bộ sưu tập hình ảnh thực tế + Lightbox xem ảnh lớn
    │   ├── RentalProcessSection.tsx     # Quy trình thuê phòng 5 bước
    │   ├── PlatformIntroSection.tsx     # Giới thiệu nền tảng vận hành AdHome Console (30%)
    │   ├── LocationAndFaqSection.tsx    # Vị trí Khu đô thị Ân Phú, Tân An, Đắk Lắk + FAQ
    │   ├── RoomDetailModal.tsx          # Modal xem chi tiết căn hộ, nội thất và biểu phí
    │   ├── LeadInquiryModal.tsx         # Modal đặt lịch xem phòng / giữ chỗ trước
    │   └── Footer.tsx                   # Footer thông tin liên hệ & điều hướng
    ├── App.tsx                          # Bố cục tổng thể Landing Page + Mobile Sticky Action Bar
    └── main.tsx                         # Entry point
```

---

## 2. Nguồn dữ liệu (`Data Source`)

Toàn bộ dữ liệu phòng hiện tại nằm tại [`src/data/roomsSeed.ts`](./src/data/roomsSeed.ts) và được truy xuất thông qua [`src/services/roomService.ts`](./src/services/roomService.ts) chứ **không hardcode vào các component giao diện**.

Mỗi bản ghi `RoomListing` tuân thủ schema:
- `id`, `slug`, `roomCode`, `title`, `roomType` (`'Studio' | 'Studio Ban Công' | '1 Phòng Ngủ' | '2PN Mini + PK'`)
- `buildingId`, `buildingCode`, `buildingName`, `buildingAddress`, `floorNumber`, `floorName`
- `area` (m²), `price` (VND/tháng), `currency`, `depositMonths`, `maxOccupants`
- `status`: `'AVAILABLE'` (Đang trống) | `'COMING_SOON'` (Sắp có) | `'RESERVED'` | `'OCCUPIED'`
- `availableFrom`, `availableFromLabel`, `shortDescription`, `detailedDescription`, `highlightNote`
- `amenities`, `furnishedLevel`, `furnishedLabel`, `images`, `featured`, `displayOrder`, `isPublic`

Hàm `fetchPublicRoomListings()` tự động ẩn các phòng có `isPublic: false` hoặc `status === 'OCCUPIED'`.

---

## 3. Cách thêm hoặc chỉnh sửa phòng (`How to Add / Update Rooms`)

1. Mở file [`src/data/roomsSeed.ts`](./src/data/roomsSeed.ts).
2. Thêm một object mới vào mảng `ROOMS_PUBLIC_SEED`:
   - Đặt `status: 'AVAILABLE'` và `isPublic: true` để hiển thị tại khu vực **Phòng đang trống**.
   - Đặt `status: 'COMING_SOON'`, `availableFromLabel: 'Dự kiến trống từ DD/MM/YYYY'` và `isPublic: true` để hiển thị tại khu vực **Phòng sắp trống**.
   - Đặt `featured: true` nếu muốn đánh dấu nổi bật.
3. Các bộ đếm trên Header, Hero Quick Summary và bộ lọc sẽ tự động tính toán lại theo danh sách mới.

---

## 4. Cách thay ảnh (`How to Replace Room Photos`)

1. Đặt file ảnh chụp thực tế mới vào thư mục `apps/landing/public/images/rooms/`.
2. Cập nhật đường dẫn `url: '/images/rooms/<ten-file-anh>'` trong mảng `images` của phòng tương ứng tại [`src/data/roomsSeed.ts`](./src/data/roomsSeed.ts) hoặc trong mảng `GALLERY_PHOTOS_SEED`.
3. Khi đồng bộ với Console về sau, trường `url` có thể nhận trực tiếp URL CDN/Object Storage từ API mà không cần sửa component.

---

## 5. Hướng đồng bộ trực tiếp với AdHome Console về sau (`Console API Sync`)

Lớp dịch vụ [`src/services/roomService.ts`](./src/services/roomService.ts) đã được chuẩn bị sẵn cơ chế gọi API thông qua biến môi trường `VITE_PUBLIC_API_URL`:

- **Lấy danh sách phòng công khai**: `GET ${VITE_PUBLIC_API_URL}/public/rooms`
- **Gửi yêu cầu hẹn xem phòng / đăng ký giữ chỗ**: `POST ${VITE_PUBLIC_API_URL}/public/inquiries`

Khi Backend API của `console-adhome.ductinh.one` sẵn sàng xuất bản dữ liệu phòng trống:
1. Khai báo `VITE_PUBLIC_API_URL=https://console-adhome.ductinh.one/api/v1` trong `.env.production`.
2. `roomService.ts` sẽ tự động lấy dữ liệu thời gian thực từ Console và giữ `roomsSeed.ts` làm dữ liệu dự phòng an toàn (graceful fallback) nếu mất kết nối.

---

## 6. Lệnh chạy phát triển & Build (Không dùng Docker)

Từ thư mục gốc `d:\AdHome-Platform`:

```bash
# Chạy máy chủ phát triển Landing Page (http://127.0.0.1:5173)
pnpm dev:landing

# Kiểm tra kiểu TypeScript và đóng gói bản Production (apps/landing/dist)
pnpm build:landing
```
