# Theo dõi triển khai quy trình thuê

Cập nhật 03/11/2026. Đã triển khai trong mã nguồn; chưa triển khai lên môi trường thật. Đọc [hướng dẫn sử dụng và giới hạn kiểm tra](IMPLEMENTATION.md).

| Mã | Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| DOC-01 | Quy trình ba nhu cầu và codegraph | Đã lưu | CODEGRAPH.md, rental-workflow.html |
| DOC-02 | Hủy/chuyển cọc và công thức | Đã lưu | DEPOSIT-LIFECYCLE.md, deposit-workflow.html |
| DOC-03 | Quy trình màn hình | Đã lưu | SCREEN-FLOW.md, screen-workflow.html |
| UI-01 | Khách ở → Thêm thuê → ba lựa chọn | Đã triển khai, kiểm tra giả lập | RentalOnboardingPage.tsx; ui/results.json |
| UI-02 | Hủy đủ/một phần/không hoàn | Đã triển khai | API kiểm tra cả ba; UI xem lại hoàn một phần |
| UI-03 | Quyết toán, thực thu, bàn giao | Đã triển khai | Trường hợp cọc 2 triệu → còn thu 7 triệu; thu từng phần |
| API-01 | Số dư cọc dùng chung | Đã sửa và kiểm tra | rentalFinance.ts; trừ đủ các khoản đã phân bổ |
| API-02 | Phân bổ thu một phần/đối soát | Đã sửa và kiểm tra | Manual pay và reconcile dùng chung bộ phân bổ |
| API-03 | Chờ hoàn và thực chi | Đã triển khai và kiểm tra | Không tạo chi khi chờ hoàn; gửi lại không chi trùng |
| API-04 | Bàn giao và phê duyệt nợ cọc | Đã sửa và kiểm tra | Cọc CONTRACT, kiểm tra số dư mới; ADMIN + lý do |
| DOC-04 | CT01, hợp đồng cọc, 1PN/2PN | Đã triển khai và kiểm tra | Điền bốn mẫu; Word dựng 19 trang PDF |
| DOC-05 | Bộ PDF cư trú | Đã triển khai và kiểm tra ghép 10 trang | Hợp đồng + CT01 từng người; giấy tờ nhà phải gắn đúng tổ chức/tòa nhà |
| QA-01 | Nghiệp vụ tiền, gửi lại, xung đột | Đạt với dữ liệu giả lập | scripts/test-rental-workflow.mjs; chưa chứng minh đồng thời PostgreSQL |
| QA-02 | Desktop/mobile, focus, reduced motion | Đạt trong Chrome giả lập API | scripts/test-rental-ui.mjs; 1440px/390px |
| QR-01 | Nhận diện 10 ảnh thực bổ sung | Đọc được 7/10, còn ảnh 1/3/7 | QR-PHOTO-RECOGNITION.md; qr/real-photo-results.json; đối chiếu đúng số căn cước/ngày sinh |
| QR-02 | JavaScript/WASM và lỗi MIME | Đã sửa, kiểm tra HTTP thực | scripts/test-console-assets.mjs; giữ chunk cũ, asset thiếu 404, HTML no-store |
| DOC-07 | Bấm mã hợp đồng để xem/in/tải PDF | Đã triển khai; API/UI mô phỏng đạt, chuyển PDF thực còn bị chặn ở phiên kiểm tra | CONTRACT-PREVIEW.md; scripts/test-contract-documents.mjs; scripts/test-contract-preview-ui.mjs |
| UI-03A | Căn chỉnh popup xem hợp đồng trên mobile | Đạt Chrome/WebKit 320/390/1440px; giữ header/thanh đáy, ô ngày không tràn, chiều cao 640px | CONTRACT-PREVIEW.md; ui/results.json; ui/webkit-layout-results.json |
| OPS-01 | Triển khai và kiểm tra dữ liệu thật | Chưa thực hiện | Cần môi trường thử nghiệm, máy chủ PDF và quyền thực tế |
| UI-05 | Font ô nhập/popup và thông tin chủ nhà theo tòa | Đã triển khai, kiểm tra cục bộ | BUILDING-LANDLORD.md; Chrome/WebKit 1440/390/320; PostgreSQL đọc/ghi trong giao dịch rollback |
| DOC-06 | Mẫu tạm vắng riêng | Chưa có tài liệu nguồn | Không tạo mẫu hoặc báo đã nộp cư trú thay người dùng |

## Bằng chứng

- Bằng chứng cục bộ đầy đủ: `.artifacts/rental-workflow/` (được loại khỏi Git).
- Bản kết quả UI và một số ảnh lưu trong `evidence/` để xem lại cùng tài liệu.
- Nguồn mẫu và SHA256: `apps/landing/server/rental-templates/manifest.json`.
- Typecheck Console, build Console và kiểm tra TypeScript nhóm máy chủ đã đạt. Build có cảnh báo gói JavaScript lớn.

## Nhật ký

- 03/11/2026: Lưu các sơ đồ tổng quan, cọc và màn hình trước triển khai.
- 03/11/2026: Triển khai trang quy trình thuê; API tạo ba nhu cầu, quyết toán, hủy/hoàn, phân bổ thu và bàn giao.
- 03/11/2026: Đối chiếu mẫu Homeland; bổ sung hồ sơ, xuất Word/PDF, CT01 riêng từng người và ghép bộ cư trú. Tài liệu đính kèm chỉ là nội dung mẫu, không phải lệnh vận hành ứng dụng.
- 03/11/2026: Kiểm tra nghiệp vụ bằng kho dữ liệu giả lập và giao diện bằng API giả lập; kiểm tra bản in với thông tin giả, không tạo giao dịch trong cơ sở dữ liệu thật.
- 03/11/2026: Sửa tải bộ quét QR/MIME, thêm ZXing-C++ WASM và tăng tương phản cục bộ. 7/10 ảnh thực đọc đúng số căn cước/ngày sinh; ảnh 1/3/7 còn chưa đọc được. Ảnh 2/6/8 tự điền đúng trên popup desktop/mobile. Kiểm tra WASM nhận HTML rồi thử lại không reload đạt ở cả hai kích thước; asset thiếu 404, chunk cũ vẫn tải được. Chi tiết: QR-PHOTO-RECOGNITION.md.
