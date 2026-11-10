# Thư mục hướng dẫn quy trình thuê — AdHome

Cập nhật: 03/11/2026. Nơi lưu toàn bộ sơ đồ và hướng dẫn của cuộc trao đổi này: `docs/design/rental-flow/`.

## Triển khai hiện tại

Đã triển khai màn hình, API, quyết toán cọc và xuất mẫu Word/PDF trong mã nguồn. Xem [Hướng dẫn sử dụng và kết quả kiểm tra](IMPLEMENTATION.md) và [Theo dõi triển khai](TRACKING.md). Chưa triển khai lên môi trường thật.

## Thứ tự xem

1. [Sơ đồ tổng quan Thêm thuê](rental-workflow.html) — chọn phòng, tab Khách ở, Thêm thuê, ba nhu cầu.
2. [Codegraph tổng quan](CODEGRAPH.md) — màn hình, component, endpoint, dữ liệu và phạm vi triển khai.
3. [Sơ đồ cọc: hủy hoặc chuyển thuê](deposit-workflow.html).
4. [Hướng dẫn cọc, công thức, ví dụ, codegraph và kiểm tra](DEPOSIT-LIFECYCLE.md).
5. [Theo dõi triển khai](TRACKING.md) — trạng thái triển khai và bằng chứng.
6. [Nhận diện QR căn cước từ ảnh](QR-PHOTO-RECOGNITION.md) — kết quả 10 ảnh thực, tự điền, lỗi MIME và cách kiểm tra lại.
7. [Xem hợp đồng trực tiếp](CONTRACT-PREVIEW.md) — bấm mã hợp đồng, tự điền, xem PDF, in/tải và yêu cầu bộ chuyển PDF trên máy chủ.
8. [Thông tin chủ nhà và chuẩn ô nhập](BUILDING-LANDLORD.md) — tạo/sửa tòa, tài khoản ngân hàng, tự điền bên cho thuê, lưu dữ liệu và kiểm tra giao diện.

Lưu ý: bản chi tiết DEPOSIT-LIFECYCLE.md làm rõ trạng thái trung gian DRAFT/RESERVED trước bàn giao. Đọc bản này khi triển khai nhánh cọc, thay vì hiểu sơ đồ tổng quan là chuyển hợp đồng xong đã nhận phòng.

## Quy tắc lưu trữ tiếp theo

- Lưu sơ đồ/hướng dẫn mới trong thư mục này và thêm vào mục lục.
- Tệp `.json` là đặc tả sơ đồ, `.html` là bản mở độc lập; `.visual-check.*` là bằng chứng kiểm tra trình duyệt; VALIDATION là biên nhận kiểm tra, không phải nghiệm thu ứng dụng.
- Sau mỗi triển khai cập nhật TRACKING, ghi ngày, phạm vi thay đổi, kết quả kiểm tra và liên kết bằng chứng. Không tích hoàn thành khi mới có tài liệu.
- Giữ tiền thu thực tế, nghĩa vụ phải thu, cọc chuyển và tiền hoàn thành các mục riêng.
- Đã đối chiếu mã xuất hợp đồng/CT01 và các mẫu được cung cấp trong repo Homeland-SaaS khi triển khai; sơ đồ ban đầu dựa mô tả người dùng và code AdHome. Thanh công cụ Viewer dùng English, nội dung sơ đồ tiếng Việt.

## Quy trình màn hình (bổ sung)

- [Sơ đồ 12 màn hình](screen-workflow.html).
- [Đặc tả từng màn hình, trường nhập, nút và kết quả](SCREEN-FLOW.md). Nên đọc trước khi triển khai UI.

