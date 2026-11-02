# Safari landing boot — 2026-11-02

## Hiện tượng và giới hạn xác định nguyên nhân

Ảnh iPhone cho thấy logo đơn trên nền splash. HTML production có splash tĩnh trong `#root`; khi JavaScript không tải hoặc không khởi động, splash cũ không có timeout hay hướng khôi phục. Loader React còn phụ thuộc hai callback animation để kết thúc.

Không tái hiện được lỗi iPhone chính xác: bản production trước sửa mở được bằng WebKit desktop mô phỏng mobile và Chromium. Chưa có console/network log từ thiết bị iPhone, nên chưa thể xác định lỗi tải chunk/cache hay phiên bản Safari cụ thể là nguyên nhân trực tiếp.

Public API rooms trả HTTP 503 trên cả WebKit và Chromium vì backend chưa kết nối. Trong kiểm thử, 503 không làm kẹt splash; không quy lỗi Safari cho API này.

## Sửa

- HTML có watchdog 10 giây và xử lý error/rejection để hiện tải lại trang, liên hệ thay vì chỉ logo. Link tải lại thêm query mới.
- Public page thoát giai đoạn boot sau tối đa 5 giây tính từ React mount, độc lập API/animation. Phần phòng vẫn báo trạng thái lỗi/loading thật.
- Loader có timeout hoàn tất dự phòng 1,4 giây sau khi bắt đầu docking, hoàn tất một lần và khôi phục logo header.
- MediaQueryList hỗ trợ cả addEventListener và addListener.
- Telemetry không được chặn React mount.

## Kiểm tra

Production build và lint các file sửa thành công. WebKit 390×844 kiểm tra năm tình huống: bình thường, legacy media query listener, API không trả lời, Web Animations bị hủy, JS chunk tải lỗi. Bốn tình huống đầu hiển thị nội dung; tình huống cuối hiển thị hướng khôi phục. Không có uncaught page error trong các kiểm tra này.

Artifacts: `.artifacts/safari-boot/regression.json`, ảnh cùng thư mục; test harness nằm trong `.artifacts/safari-regression.mjs`.

Deploy Worker `adhome-platform`: version `b473d4a7-a512-4765-a8fa-1cb8fe440d32`. Domain trả HTTP 200 với script `index-BdKpVpLK.js` và recovery markup mới. Cần xác nhận cuối trên iPhone thật của người dùng.
