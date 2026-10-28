# AdHome – logo SVG dành cho Sidebar

Thiết kế minh họa vector được dựng lại từ concept AdHome, không phải file SVG xuất trực tiếp từ ảnh tạo bằng AI.

## File

- `adhome-icon.svg`: icon độc lập nền trong suốt, phù hợp Sidebar thu gọn 32–44px; favicon/app icon có thể dùng bản này làm nguồn.
- `adhome-logo-full.svg`: icon và tên thương hiệu + tagline ở bố cục ngang, phù hợp Sidebar mở rộng.
- `adhome-icon-white.svg`: bản gần đơn sắc cho nền màu đậm (nên xem thử trên màu nền thực tế).
- `AdHomeSidebar.tsx`, `AdHomeSidebar.css`: component React minh họa thay logo và co giãn Sidebar.
- `demo.html`: mẫu giao diện tĩnh tương tác, mở trực tiếp bằng trình duyệt mà không cần server.

## Cài đặt trong Vite

Chép SVG vào `public/brand/`, chép TSX/CSS vào thư mục component của bạn. Sau đó dùng:

```tsx
import AdHomeSidebar from "./components/AdHomeSidebar";

export default function App() {
  return <AdHomeSidebar />;
}
```

Bạn có thể tích hợp animation từ Animate UI sau. Bản minh họa dùng CSS transition thuần để tránh phụ thuộc vào phiên bản package.

## UX

- Desktop: Sidebar 260px khi mở, 76px khi thu; icon 44px khi thu.
- Mobile <=768px: Sidebar dạng drawer/off-canvas, có backdrop; **không** thu nhỏ nguyên Sidebar desktop xuống mobile.
- Tối ưu accessibility: mô tả logo, trạng thái `aria-expanded`, labels, `prefers-reduced-motion`.
- Các số liệu trong demo là **giả lập giao diện**, không phải dữ liệu dự án thật.
