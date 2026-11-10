# Quản lý dữ liệu Console

- Nhật ký nghiệp vụ và đăng nhập dùng hai API phân trang riêng, 20 dòng/trang, tối đa 30 trang. Dịch vụ tự cắt còn 600 bản ghi mới nhất cho mỗi tổ chức và mỗi loại nhật ký khi khởi động, sau đó mỗi 24 giờ. Hồ sơ thuê loại `RENTAL_DOCUMENT` được lưu riêng khỏi trang nhật ký và không bị tác vụ cắt nhật ký xóa.
- Quản lý dữ liệu chỉ dành cho `ADMIN`. Sao lưu dữ liệu nghiệp vụ theo tổ chức thành file mã hóa AES-256-GCM tại `ADHOME_DATA_BACKUP_DIR` hoặc `<WorkingDirectory>/data/backups`. File tải xuống có thể nhập lại trên máy chủ dùng **cùng** `ADHOME_CREDENTIALS_ENCRYPTION_KEY`.
- Phục hồi thay thế dữ liệu nghiệp vụ hiện có trong một giao dịch. Trước khi phục hồi hoặc xóa, API tự tạo bản sao lưu có mã để quay lại. Giao diện yêu cầu xem trước và nhập câu xác nhận.
- Xóa khách hàng xóa toàn bộ hồ sơ thuê, hợp đồng, hóa đơn, thu chi và khách trong tổ chức; giữ tòa nhà, phòng và công tơ. Xóa tòa nhà xóa toàn bộ dữ liệu nghiệp vụ trong tổ chức. Nếu một kết nối thanh toán đang gắn với tòa nhà, API chặn xóa tòa nhà để giữ nguyên Cài đặt.
- Hồ sơ thuê lưu trong `ConsoleAuditLog` với loại `RENTAL_DOCUMENT` được sao lưu/phục hồi cùng dữ liệu nghiệp vụ. Các nhật ký bảo mật khác được giữ riêng.
- Cài đặt, tài khoản quản trị, cấu hình tích hợp, cấu hình thông báo và lịch tác vụ không nằm trong bản sao lưu nghiệp vụ và không bị xóa/phục hồi bởi chức năng này. Dữ liệu khách có thể còn trong nhật ký bảo mật hoặc sự kiện webhook được lưu để đối soát; thao tác xóa hồ sơ không phải xóa toàn bộ dấu vết cá nhân ở các nguồn đó.
- Zalo Bot dùng cơ sở dữ liệu riêng; chức năng này chỉ tác động cơ sở dữ liệu Console và không sao lưu, phục hồi hoặc xóa bản ghi của Bot.
- Album ảnh phòng lưu file gốc tại `<WorkingDirectory>/uploads/room-images` trên máy chủ Console API. Bản sao lưu nghiệp vụ chỉ chứa thông tin ảnh trong cơ sở dữ liệu; khi sao lưu hoặc chuyển máy chủ, cần sao lưu và khôi phục thêm thư mục ảnh này để ảnh trong Console và Landing tiếp tục hiển thị.
