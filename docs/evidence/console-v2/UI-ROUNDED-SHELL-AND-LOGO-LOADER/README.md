# Evidence: UI-ROUNDED-SHELL-AND-LOGO-LOADER

**Nhiệm vụ:**
1. Khử hoàn toàn điểm giao cắt thô vuông góc giữa Header và Sidebar; thay thế bằng góc bo tròn mềm mại `rounded-tl-[24px]` trên main content canvas.
2. Khắc phục lỗi thanh đen khi refresh trang; áp dụng AdHome Logo Fill Loader 0→100 với tiến độ thực cho cả Landing và Console kèm pre-hydration splash 0ms.

## Cấu Trúc Bằng Chứng

- `ACCEPTANCE_REPORT.md`: Báo cáo chi tiết kết quả kiểm thử tự động, tiêu chuẩn kỹ thuật và đánh giá nghiệm thu.
- `checksums-verified.txt`: Danh sách mã băm SHA-256 đối soát cho 10 ảnh giao diện.
- `screenshots-manifest.json`: Siêu dữ liệu máy đọc được về từng ảnh chụp viewport (kích thước, timestamp, scenario).
- `screenshots/`: Thư mục chứa 10 tệp ảnh chụp thực tế bằng Chrome DevTools Protocol.

