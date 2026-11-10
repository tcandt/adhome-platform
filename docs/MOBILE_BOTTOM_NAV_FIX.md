# Thanh điều hướng dưới trên điện thoại

Cập nhật 03/11/2026 theo ảnh lỗi thanh điều hướng trôi khỏi màn hình khi cuộn trên iPhone.

## Thay đổi

- MobileBottomNav vẫn dùng `position: fixed; bottom: 0` nhưng được đặt trực tiếp dưới body bằng React portal, tránh bị vùng cắt nội dung hoặc lớp hiệu ứng của trang ảnh hưởng đến vị trí cố định.
- MobileShell dùng chiều cao tối thiểu theo viewport động (`min-h-dvh`); chỉ cắt phần tràn ngang trong nội dung chính.
- Giữ khoảng trống đáy nội dung và safe area cho iPhone. Giữ focus bàn phím cho các nút sau khi tách thanh điều hướng khỏi shell.

## Kiểm tra

- Build Console và TypeScript thành công.
- Chrome mobile giả lập 390px: cuộn đầu/giữa/cuối rồi quay lên, thanh điều hướng luôn bám đáy (844px); đổi chiều cao viewport 844px/650px vẫn bám đáy, không tràn ngang.
- Nút More mở/đóng được bảng điều hướng; nút Tòa nhà chuyển phân hệ bình thường. API được giả lập, không thay đổi dữ liệu thật.
- Đã xác nhận địa chỉ LAN cổng 5174 phục vụ gói mới, HTTP 200. Người dùng cần tải lại trang để nhận bản sửa.
- WebKit cục bộ bị treo khi chạy nên không dùng làm bằng chứng. Chưa xác nhận thao tác cuộn trực tiếp trên iPhone thật.

Bằng chứng cục bộ nằm trong `.artifacts/mobile-nav/`, được loại khỏi Git.
