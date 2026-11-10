# Integration Hub trong Settings

## Mục tiêu và phạm vi

Một tổ chức có nhiều kết nối SePay, payOS, MoMo, ZaloPay, Tingee; mỗi kết nối có nhiều tài khoản nhận tiền. Không thay đổi kết nối Hunonic hoặc kênh thông báo đang có. Không suy diễn việc lưu khóa thành kết nối thành công, và không ghi thu chỉ vì kiểm tra kết nối thành công.

## Các lớp triển khai

1. **Quản trị cấu hình:** danh mục provider và trường khóa riêng, nhiều kết nối/provider, môi trường test/live, phạm vi tòa nhà, thêm nhiều tài khoản trong một lần lưu, bật/tắt, sửa khóa mà không trả khóa về client, nhật ký và kiểm tra quyền.
2. **Kiểm tra kết nối:** adapter chỉ đọc, host cố định, timeout, không redirect, không trả lỗi thô có thể chứa khóa. SePay đọc danh sách tài khoản; payOS đọc một mã link thanh toán do quản trị viên cung cấp. Trạng thái VERIFIED chỉ có nghĩa phép kiểm tra API đã thành công; không chứng nhận webhook hoặc quyền tạo giao dịch. Các adapter kiểm tra API chưa triển khai trả NOT_SUPPORTED và không cho bật cờ API; vẫn nhận webhook khi đã cấu hình đúng.
3. **Webhook (đã có receiver và inbox; chưa có consumer ghi thu):** endpoint webhook công khai riêng từng provider, xác minh chữ ký trên raw body, giới hạn kích thước và rate limit, lưu inbox trước ACK; khóa duy nhất theo provider/merchant/externalTxId; chuẩn hóa số tiền VND, tài khoản, chiều giao dịch và mã hóa đơn. Xác thực webhook và kiểm thử sandbox là điều kiện trước khi đưa vào thu tiền tự động.
4. **Đối soát (bước tiếp theo):** transaction DB khóa hóa đơn, chống ghi trùng xuyên provider dựa trên mã giao dịch ngân hàng đáng tin cậy; xử lý thiếu/dư/không tìm thấy hóa đơn; giao dịch chưa rõ phải chờ duyệt, không tự ghi thu. Liên kết tài khoản với giao dịch và sổ cái.
5. **Vận hành (bước tiếp theo):** retry có backoff, replay inbox có phân quyền, xoay khóa, cảnh báo webhook quá hạn, quan sát lỗi và đối soát cuối ngày. Chỉ tích hợp luồng tạo link/hủy/refund sau khi có mapping payment intent và chính sách nghiệp vụ.

## Quy tắc dữ liệu

- Bảng mới tách khỏi IntegrationConnection cũ để không phá unique orgId/providerId được Hunonic và bootstrap sử dụng.
- Mỗi kết nối có version tăng khi sửa. Kiểm tra API và cập nhật dùng optimistic concurrency để kết quả cũ không xác thực khóa mới.
- Request tạo giữ nguyên `creationId` khi retry, đối chiếu nội dung trước khi trả lại kết nối đã tạo để tránh thêm trùng sau mất phản hồi mạng.
- Tài khoản nhận tiền unique trong một kết nối theo mã ngân hàng + số tài khoản. Không chọn mặc định toàn tổ chức khi chưa có cơ chế định tuyến thanh toán.
- Lưu cấu hình cùng tài khoản và audit trong một transaction. Mã hóa toàn bộ credential JSON bằng vault AES-256-GCM hiện có; API chỉ trả tên các trường khóa đã lưu.
- Đổi thông tin xác thực, môi trường hoặc tài khoản làm mất trạng thái xác thực và tắt kết nối. Bật API yêu cầu VERIFIED và môi trường LIVE. Bộ nhận webhook có cờ riêng, không yêu cầu kiểm tra API đọc dữ liệu; chỉ bật khi đủ khóa xác thực callback.
- Cấu hình cũ vẫn được giữ; không tự di chuyển một secret chung thành credential đầy đủ của provider. UI hiển thị số cấu hình cũ cần chuyển đổi.

## Kiểm chứng / nghiệm thu

- Unit/integration với provider HTTP giả lập: từ chối quyền, tenant isolation, validation, không lộ khóa, HTTP lỗi/timeout/response sai, optimistic concurrency, rollback, không bật kết nối chưa VERIFIED.
- Prisma validate/generate; typecheck/build console; kiểm tra TypeScript server bằng bundler.
- UI mobile 390px, keyboard, reduced motion, lỗi mạng không báo thành công; giữ dữ liệu khi lưu thất bại.
- Trước production: áp dụng SQL additive trong `prisma/sql/integration-hub.sql` bằng quy trình DB của môi trường; nhập khóa thật và chạy kiểm tra thực tế. Không chạy migrate reset hoặc db push trên database chia sẻ để triển khai riêng module này.

## Tài liệu API tham chiếu

- SePay: https://docs.sepay.vn/api-tai-khoan-ngan-hang.html và https://docs.sepay.vn/gioi-thieu-api.html
- payOS: https://payos.vn/docs/api/
- Tingee: https://developers.tingee.vn/docs/config-info/
- MoMo: https://developers.momo.vn/v3/vi/docs/payment/api/payment-api/query/
- ZaloPay: https://docs.zalopay.vn/docs/developer-tools/knowledge-base/callback/

Receiver webhook đã có cho cả năm nhà cung cấp. Tingee/MoMo/ZaloPay chưa có API tạo thanh toán hoặc kiểm tra API đọc dữ liệu. Chi tiết URL tự nhận diện, cơ chế xác thực và kiểm thử hiện tại: [PAYMENT_WEBHOOK_INTEGRATION.md](PAYMENT_WEBHOOK_INTEGRATION.md).
