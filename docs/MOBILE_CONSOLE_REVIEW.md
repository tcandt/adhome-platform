# Mobile Console — cập nhật và kiểm tra local

## Thay đổi

- Header: Menu → tìm kiếm → thông báo → avatar. Bộ lọc tòa nhà nằm trong nội dung.
- Sidebar chỉ mở từ header. Bottom navigation có bốn tác vụ thường xuyên, lọc theo quyền.
- KPI phòng: hai cột; tài chính toàn chiều ngang; có kỳ tài chính và thao tác nhanh.
- Avatar mở hồ sơ, đổi nền, đăng xuất. Drawer giữ nhóm menu và trạng thái mục đang mở.
- `Tổng hợp & Cron` đổi thành `Tổng hợp kỳ`; cấu hình Cron đã có trong Cài đặt.
- Khôi phục khả năng zoom trình duyệt, thêm safe-area cho header/bottom bar và nội dung.
- Biểu mẫu hợp đồng có nhãn dialog, focus trap, Escape, khóa cuộn và trả focus khi đóng.

## Định nghĩa dữ liệu

- Tổng số phòng theo trạng thái: 44 = 16 đang sử dụng + 23 trống + 5 giữ chỗ.
- 9 hợp đồng hiệu lực là số bản ghi hợp đồng đang hiệu lực trong phạm vi. Trạng thái 16 phòng đang sử dụng được tính riêng; thay đổi này không tự sửa dữ liệu hoặc giả định hai chỉ số phải bằng nhau.
- Còn phải thu = tổng giá trị hóa đơn kỳ đã chọn trừ khoản đã thu, không nhỏ hơn 0. 14,9 triệu là số dư chưa thu; 8,1 triệu là khoản đã thu của hóa đơn kỳ này.
- Công tơ lấy trạng thái từng phòng: 15 ONLINE, 1 OFFLINE, 27 UNCONFIGURED, 1 STALE ở dữ liệu kiểm tra. UNCONFIGURED không chứng minh thiết bị chưa lắp. Tổng 44 là số phòng, không khẳng định có 44 công tơ đã lắp.

## Kiểm tra

- Production build thành công. Bundle JS khoảng 287 KB gzip; Vite còn cảnh báo chunk trên 500 KB trước gzip.
- Browser Chromium headless với backend/PostgreSQL local thật, tài khoản admin: 375/390/430px không tràn ngang; KPI 2 cột; một bộ lọc; header đúng thứ tự; bottom bar 57px khi safe-area bằng 0.
- Kiểm tra avatar/theme, drawer, thông báo, bộ lọc/Escape, tìm kiếm/Escape, mở wizard hợp đồng, API 503/retry và chuyển về desktop.
- Loading/empty được mô phỏng trong browser, không thay đổi database.
- Ảnh và report cục bộ: `.artifacts/mobile-console-review/`.
- Lint không có lỗi; còn cảnh báo unused trong các phân hệ hiện hữu.

## Giới hạn nghiệm thu

- Chưa xác minh trên iPhone/Safari thật; safe-area được cấu hình bằng CSS env, chưa đo trên thiết bị.
- Chưa chạy kiểm toán accessibility đầy đủ, Lighthouse mobile hoặc mô phỏng mạng chậm.
- Chưa thực hiện ghi hợp đồng/thu tiền thật trong đợt kiểm tra giao diện này.
- Chỉ cập nhật local, chưa deploy bản mobile này lên Worker.
