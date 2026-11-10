# Đánh giá giao diện thêm khách thuê — 03/11/2026

## Điều chỉnh sau phản hồi thực tế 4/10

### Sửa MIME và nhận diện QR từ 10 ảnh bổ sung

- Thay bộ ZXing JavaScript cũ bằng ZXing-C++ WebAssembly 3.1.6 phục vụ từ ứng dụng, kết hợp jsQR, ảnh nhiều kích thước, vùng cắt và tăng tương phản cục bộ.
- Đọc được 7/10 ảnh (2, 4, 5, 6, 8, 9, 10); số căn cước/ngày sinh khớp đối chiếu. Ảnh 1, 3, 7 chưa giải mã được. Không đánh giá đạt 10/10 hoặc coi đã xử lý tất cả ảnh.
- Giữ chunk cũ sau build, HTML không lưu cache, asset thiếu trả 404 thay cho HTML. Kiểm tra HTTP thực: JavaScript đúng MIME, WASM application/wasm, chunk cũ vẫn tải được sau nhiều lần build.
- Kiểm tra popup 1440px và 390px: ảnh thực 2/6/8 tự điền đúng số căn cước/ngày sinh; ảnh tổng hợp, ảnh trắng, chụp ảnh và camera giả lập đạt; camera dừng sau nhận diện, không cần xác nhận. Typecheck/build Console đạt, còn cảnh báo kích thước JavaScript lớn.
- Xem [hướng dẫn và kết quả chi tiết](QR-PHOTO-RECOGNITION.md). Ảnh gốc và nội dung căn cước không được ghi vào repo/log kiểm thử.

### Tự điền sau khi quét QR (18:00)

- QR căn cước hợp lệ tự điền họ tên, số định danh, ngày sinh, giới tính và địa chỉ vào đúng người đang quét. Không yêu cầu bấm xác nhận; không thay số điện thoại hoặc quan hệ với khách chính.
- Dừng camera và đóng cửa sổ quét ngay khi thành công. QR sai/không đọc được không ghi đè dữ liệu nhập. Đóng cửa sổ giữa chừng hủy kết quả đang xử lý.
- Ảnh toàn thẻ được thử thêm vùng cắt chồng lấn và bộ giải mã ZXing (bản có sẵn trong Homeland, kèm giấy phép Apache-2.0) bên cạnh jsQR. Các bộ giải mã đều chạy cục bộ và tải khi cần.
- Kiểm tra tự động đã đổi từ bấm xác nhận sang chờ input tự điền; giữ kiểm tra ảnh, chụp ảnh và camera giả lập. Ảnh căn cước thực không được sao chép vào repo hoặc ảnh chụp kiểm thử.
- Hai ảnh thực được cung cấp vẫn có lần kiểm tra không giải mã được, dù đã thử jsQR/ZXing và cắt vùng. Không dùng nội dung nhìn thấy trên thẻ để giả lập kết quả quét. Chưa xác nhận giải quyết hoàn toàn việc đọc hai ảnh này; khi thất bại vẫn giữ dữ liệu người dùng và báo thử ảnh rõ hơn.

### Nút quay lại và menu QR (17:50)

- Bỏ nút Về phòng ở đầu biểu mẫu; màn chọn nhu cầu có Quay lại sát trái thanh đáy. Hồ sơ thuê hiện có cũng có nút Quay lại để về popup phòng.
- Sửa chiều rộng vùng nhập và thanh đáy: bỏ căn đầu hàng kế thừa khi chuyển grid sang flex; lựa chọn và nút Tiếp tục trải đúng theo chiều ngang popup.
- Icon QR nằm cùng hàng tiêu đề người đứng tên/người cùng ở. Animate UI Menu hiển thị Tải ảnh, Chụp ảnh, Camera ở lớp nổi, không mở rộng form. Kết quả quét/camera dùng Dialog riêng; đóng sẽ giữ nguyên dữ liệu đang nhập.
- Kiểm tra desktop/mobile: không có Về phòng ở trên; nút đáy bám hai mép; menu không đổi vị trí ô nhập; chọn ảnh/chụp ảnh/camera vẫn quét được và dừng camera sau nhận diện. Ảnh menu: `.artifacts/rental-workflow/ui/qr-menu-390.png` và `qr-menu-1440.png`.

### Header, thanh đáy, QR và lỗi hợp đồng (17 giờ)

- Header trong luồng thuê chỉ còn tên phòng và tòa/tầng; ẩn dòng trạng thái/diện tích và câu mô tả lặp. Tên bước giữ kích thước nhỏ.
- Chỉ nội dung bước cuộn; Quay lại/Tiếp tục nằm ngoài vùng cuộn, có khoảng cách đáy theo safe area. Kiểm tra bằng danh sách ba người cùng ở gây tràn thật, so sánh vị trí nút trước/sau cuộn.
- Điều khoản dùng hai cột cho ngày và tiền, danh sách cách tính tiền/phương thức nhận tiền chiếm cả hàng. Input tiền và chọn lựa cùng cỡ 13px.
- Thêm đọc QR căn cước bằng jsQR 1.4.0 sẵn có từ Homeland, lưu nguyên bản cùng giấy phép Apache-2.0 trong `shared/vendor/jsqr`. Thư viện tách thành chunk chỉ tải khi quét. Ảnh xử lý cục bộ, không gửi lên máy chủ. Chỉ điền sau khi người dùng xác nhận dữ liệu.
- Có tải ảnh, chụp ảnh bằng camera thiết bị và camera trực tiếp. Camera trực tiếp yêu cầu HTTPS/localhost; URL LAN HTTP cần dùng chụp ảnh/tải ảnh hoặc chuyển sang HTTPS.
- Kiểm tra parser cho tên tiếng Việt, số căn cước có số 0 đầu, ngày sinh; từ chối QR lạ và dữ liệu không hợp lệ. Kiểm tra trình duyệt bằng QR ảnh tổng hợp và video camera giả lập; kiểm tra dừng camera sau nhận diện. Chưa kiểm tra camera iPhone thật.
- Lỗi tạo hợp đồng do đơn giá bắt buộc có thể null: lấy cấu hình phòng → tòa → tổ chức → mặc định, giữ điện Hunonic tự động bằng 0. Cả nước và phương thức tính nước có dự phòng. Lỗi nội bộ Prisma không trả nguyên văn cho người dùng.
- `node scripts/test-identity-qr.mjs`, `node scripts/test-rental-workflow.mjs`, kiểm tra UI 1440/390px, typecheck console/landing và build console: PASS. Kiểm tra API dùng cơ sở dữ liệu giả lập, chưa tạo hợp đồng thử trong dữ liệu thực.
- Ảnh mới: `.artifacts/rental-workflow/ui/qr-confirm-390.png`, `pinned-footer-390.png`, `direct-terms-390.png` và các bản desktop.

Điểm 8.5/10 bên dưới là đánh giá cũ, đã bị phản hồi thực tế bác bỏ; không dùng làm căn cứ nghiệm thu.

- Đã đối chiếu `homeland-saas/apps/web/components/buildings/RoomPremiumModal.tsx`: chọn nhu cầu, khách và điều khoản dùng modal; cọc giữ phòng chưa cần khai báo tạm trú.
- Luồng mới nằm ngay trong Dialog của phòng, giữ nguyên nền, không điều hướng URL khi nhấn Thêm khách thuê. Quay lại vẫn ở popup phòng; Escape/đóng tuân theo xác nhận dữ liệu chưa lưu.
- Nút dùng chữ 12px, cao 34px; input và select chữ 13px, cao 36px. Các trường ngắn xếp hai cột; họ tên và địa chỉ chiếm cả hàng.
- Khách đang cọc mặc định chọn thỏa thuận cọc; API chặn xuất CT01 khi chưa có hợp đồng. Mẫu xác nhận đã nhận đủ tiền chỉ được xuất sau khi thực nhận đủ cọc.
- Kiểm tra mới PASS 1440px/390px: một Dialog xuyên suốt, mở/quay về không chuyển trang, trường ngắn chung hàng, select 13px, bàn phím, reduced motion, giữ dữ liệu khi lỗi, không báo thành công giả.
- Build và kiểm tra nghiệp vụ/mapping bốn mẫu Word PASS. Ảnh mới trong `.artifacts/rental-workflow/ui/`.
- Không tự nâng điểm thay người sử dụng; cần nghiệm thu trải nghiệm trên thiết bị thật. Chưa khẳng định toàn bộ Homeland đã được sao chép hoặc kiểm tra hết các nhánh nghiệp vụ của hệ thống đó.

## Phạm vi

Áp dụng skill dự án `docs/skills/animate-ui/SKILL.md`. Phiên làm việc không có skill UI/UX độc lập được cài đặt; đánh giá theo các tiêu chí dưới đây. Dùng Button và ShimmeringText thật từ @animate-ui/react, hỗ trợ reduced motion; trạng thái xử lý phụ thuộc yêu cầu máy chủ.

## Thiết kế đã thực hiện

- Phòng trống ở tab Khách ở có một nút Thêm khách thuê; gom lựa chọn giữ phòng, thuê ngay, đồng bộ vào màn hình chọn nhu cầu.
- Tách Khách thuê → Điều khoản → Kiểm tra; thông tin người cùng ở và liên hệ khẩn cấp có phân cấp rõ.
- Nút chính gọn, vùng chạm tối thiểu 44px. Có focus bàn phím, lỗi và trạng thái đang xử lý.
- Hồ sơ chia tab Tài liệu, Khách thuê, Bên cho thuê, Cư trú. Một bộ chọn loại tài liệu, người kê khai và định dạng thay cho nhiều nút xuất trùng nhau.
- CT01/hợp đồng dùng lại dữ liệu đã nhập, chỉ rõ thông tin thiếu và khóa tải khi thiếu dữ liệu cần thiết. Xuất hồ sơ không đồng nghĩa đã nộp đăng ký cư trú.

## Điểm tự đánh giá

Ngưỡng chấp nhận nội bộ: 8/10 và không có lỗi kiểm tra bắt buộc.

| Tiêu chí | Điểm /10 | Cơ sở |
|---|---:|---|
| Phân cấp và giảm nút trùng | 9 | Một điểm bắt đầu, chọn nhu cầu riêng |
| Bố cục và tính nhất quán | 8.5 | Card, khoảng cách, nút chính/phụ thống nhất |
| Quy trình nhập và tài liệu | 8.5 | Ba bước, dùng lại dữ liệu, chỉ rõ trường thiếu |
| Mobile và khả năng tiếp cận | 8 | Kiểm tra 390px, bàn phím, reduced motion |
| Phản hồi và bảo toàn dữ liệu | 8.5 | Không ghi ở bước xem lại; lỗi giữ dữ liệu, không báo thành công |

**Tổng trung bình: 8.5/10.** Đây là điểm nội bộ dựa trên ảnh và kiểm tra, chưa có khảo sát người dùng hay xác minh trên iPhone thật.

## Bằng chứng xác minh

- `pnpm --filter @adhome/console typecheck`: PASS.
- `pnpm --filter @adhome/console build`: PASS; còn cảnh báo kích thước bundle.
- `node scripts/test-rental-workflow.mjs`: PASS cho phân bổ cọc, hủy/hoàn, chuyển hợp đồng, thu tiền và bàn giao; điền bốn mẫu Word được cung cấp.
- `node scripts/test-rental-ui.mjs`: PASS ở 1440px và 390px, reduced motion; focus bàn phím, tab bằng phím mũi tên, không tràn ngang, xem lại không ghi dữ liệu, máy chủ từ chối không báo thành công, dữ liệu nhập được giữ, xem trước hoàn một phần và khấu trừ cọc còn thu 7 triệu.
- UI test dùng phản hồi API mô phỏng; kiểm tra nghiệp vụ ở trên gọi API với dữ liệu kiểm thử riêng.
- Kết quả máy đọc: `.artifacts/rental-workflow/ui/results.json`.
- Ảnh kiểm tra: `.artifacts/rental-workflow/ui/` gồm intent, hold-details, hold-review, cancel-review, conversion-review, documents ở hai kích thước.

## Theo dõi tiếp

Kiểm tra trải nghiệm trên Safari/iPhone thật và lấy phản hồi người vận hành. Chưa có bằng chứng đánh giá tính hợp lệ pháp lý của nội dung tài liệu; bản xuất vẫn cần được kiểm tra trước khi ký/nộp.
