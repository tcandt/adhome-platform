# AdHome Landing Page (`https://adhome.ductinh.one`) — Editorial Redesign Gate 02

Trang web cho thuê căn hộ dịch vụ, phòng Studio, 1PN và 2PN mini full nội thất tại **Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk**, đồng thời giới thiệu nền tảng quản lý vận hành **AdHome**.

---

## 1. Cấu trúc thư mục (`Structure`)

```text
apps/landing/
├── index.html                           # SEO meta, OpenGraph, Schema.org ApartmentComplex
├── package.json                         # @adhome/landing (Vite + React + TS + Tailwind)
├── tailwind.config.js                   # Hệ màu phẳng (Warm Off-White #F8F7F4, White, Navy #0F172A, Brand Blue #1E5EFF)
├── public/
│   ├── brand/                           # Bộ logo SVG chính thức của AdHome
│   └── images/rooms/                    # Bộ 10 ảnh căn hộ dịch vụ đồng bộ phong cách
└── src/
    ├── types/
    │   └── room.ts                      # Định nghĩa kiểu dữ liệu RoomListing, BuildingPublicSummary, GalleryPhotoItem
    ├── data/
    │   └── roomsSeed.ts                 # Seed data cho danh sách căn hộ và khu nhà tại KĐT Ân Phú
    ├── services/
    │   └── roomService.ts               # Lớp truy xuất dữ liệu (tự động lọc phòng public, không fallback dữ liệu mẫu khi cấu hình Production API)
    ├── components/
    │   ├── Header.tsx                   # Sticky Header tối giản (5 mục điều hướng + 1 CTA chính + Mobile Sheet)
    │   ├── HeroSection.tsx              # Hero tinh gọn: ảnh căn hộ lớn, tiêu đề 2-3 dòng, 1 CTA chính + 1 CTA phụ
    │   ├── RoomCard.tsx                 # Thẻ phòng chuẩn 6 phần tử (Ảnh lớn, Trạng thái, Tên ngắn, Thông số, Giá thuê, 1 CTA)
    │   ├── AvailableRoomsSection.tsx    # Hiển thị 3–6 phòng nổi bật trên trang chủ + nút điều hướng tới /phong-trong
    │   ├── AllRoomsPage.tsx             # Trang danh sách đầy đủ (/phong-trong): bộ lọc, sắp xếp, phân trang, Mobile Filter Sheet
    │   ├── ComingSoonSection.tsx        # Danh sách phòng sắp có: thẻ ngang 2 cột gọn gàng, ghi rõ ngày dự kiến
    │   ├── LivingSpaceSection.tsx       # Không gian sống & tiện nghi (gộp tiện ích + ảnh chi tiết + quy trình 3 bước)
    │   ├── LocationAndFaqSection.tsx    # Vị trí Khu đô thị Ân Phú, Tân An, Đắk Lắk + FAQ gọn nhẹ
    │   ├── PlatformIntroSection.tsx     # Giới thiệu nền tảng AdHome hướng tới lợi ích người thuê
    │   ├── RoomDetailModal.tsx          # Modal xem chi tiết căn hộ, nội thất và biểu phí
    │   ├── LeadInquiryModal.tsx         # Modal đặt lịch xem phòng / đăng ký nhận thông báo phòng sắp có
    │   └── Footer.tsx                   # Footer thông tin liên hệ & điều hướng
    ├── App.tsx                          # Điều hướng SPA (/ và /phong-trong) + quản lý Modal
    └── main.tsx                         # Entry point
```

---

## 2. Nguồn dữ liệu & Tính xác thực (`Data Source & Authenticity`)

Toàn bộ dữ liệu phòng hiện tại nằm tại [`src/data/roomsSeed.ts`](./src/data/roomsSeed.ts) và được truy xuất thông qua [`src/services/roomService.ts`](./src/services/roomService.ts).

Mỗi bản ghi `RoomListing` bao gồm:
- `id`, `slug`, `roomCode`, `title`, `roomType` (`'Studio' | 'Studio Ban Công' | '1 Phòng Ngủ' | '2PN Mini + PK'`)
- `buildingId`, `buildingCode`, `buildingName`, `buildingAddress`, `floorNumber`, `floorName`
- `area` (m²), `price` (VND/tháng), `currency`, `depositMonths`, `maxOccupants`
- `status`: `'AVAILABLE'` (Đang trống) | `'COMING_SOON'` (Sắp có) | `'RESERVED'` | `'OCCUPIED'`
- `availableFrom`, `availableFromLabel`, `shortDescription`, `detailedDescription`, `highlightNote`
- `amenities`, `furnishedLevel`, `furnishedLabel`, `images`, `isIllustrativeImage` (`true` nếu là ảnh minh họa, `false` nếu là ảnh chụp thực tế của phòng), `featured`, `displayOrder`, `isPublic`

---

## 3. Cách thay ảnh thực tế (`How to Replace Room Photos`)

1. Đặt file ảnh chụp thực tế mới vào thư mục `apps/landing/public/images/rooms/`.
2. Cập nhật đường dẫn `url: '/images/rooms/<ten-file-anh>'` trong mảng `images` của phòng tương ứng tại [`src/data/roomsSeed.ts`](./src/data/roomsSeed.ts) và chuyển `isIllustrativeImage: false` khi đã sử dụng ảnh chụp thực tế của đúng căn hộ đó (nhãn `"Ảnh minh họa"` sẽ tự động ẩn).

---

## 4. Hướng đồng bộ với AdHome Console (`Console API Sync`)

Lớp dịch vụ [`src/services/roomService.ts`](./src/services/roomService.ts) gọi API thông qua biến môi trường `VITE_PUBLIC_API_URL`:

- **Lấy danh sách phòng công khai**: `GET ${VITE_PUBLIC_API_URL}/public/rooms`
- **Gửi yêu cầu hẹn xem phòng / đăng ký nhận thông báo**: `POST ${VITE_PUBLIC_API_URL}/public/inquiries`

**Nguyên tắc an toàn dữ liệu trên Production:**
- Khi chưa cấu hình `VITE_PUBLIC_API_URL` (giai đoạn chạy độc lập), hệ thống sử dụng dữ liệu từ `roomsSeed.ts`.
- Khi đã cấu hình `VITE_PUBLIC_API_URL` trên Production, nếu API gặp sự cố, hệ thống hiển thị thông báo lỗi minh bạch và **không tự động fallback về dữ liệu mẫu** để tránh hiển thị nhầm phòng demo cho khách thuê thật.

---

## 5. Lệnh chạy phát triển & Build (Không dùng Docker)

Từ thư mục gốc `d:\AdHome-Platform`:

```bash
# Chạy máy chủ phát triển Landing Page (http://127.0.0.1:5173)
pnpm dev:landing

# Kiểm tra kiểu TypeScript và đóng gói bản Production (apps/landing/dist)
pnpm build:landing
```
