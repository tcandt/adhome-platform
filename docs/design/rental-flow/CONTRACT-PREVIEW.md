# Xem hợp đồng trực tiếp

Cập nhật 03/11/2026.

## Quy trình màn hình

1. Bấm mã hợp đồng tại danh sách Hợp đồng (desktop/mobile), bảng Occupancy, tab Hợp đồng của phòng hoặc Hồ sơ thuê.
2. Cửa sổ xem mở ngay trên màn hình hiện tại; nếu đang trong popup phòng thì giữ nguyên popup đó phía sau.
3. Lấy hồ sơ theo đúng ID hợp đồng được chọn, gồm cả hợp đồng cũ/đã thanh lý. Không tự chọn hợp đồng mới nhất của phòng.
4. Tự điền thông tin khách thuê, bên cho thuê, căn hộ, ngày ký, tài khoản và điều khoản từ hồ sơ đã lưu. Chọn mẫu 1PN/2PN đã lưu; hồ sơ mới dùng loại phòng để gợi ý mẫu.
5. Đủ dữ liệu: yêu cầu máy chủ điền mẫu Word rồi chuyển thành PDF, hiển thị trực tiếp trong popup.
6. Thiếu dữ liệu: mở phần Thông tin với danh sách cần bổ sung. Trường nhập chia hai cột; địa chỉ dùng cả hàng. Không tự tạo ngày ký cho hợp đồng cũ chưa có ngày ký.
7. **Xem trước** tạo PDF từ dữ liệu đang nhập và không lưu. **Lưu & xem PDF** lưu hồ sơ trước, sau đó tạo PDF; hồ sơ thuê phía sau được cập nhật cùng dữ liệu mới. Nếu tạo PDF lỗi sau khi lưu, thông báo phân biệt rõ việc đã lưu.
8. Thanh công cụ có **Mở PDF trong tab mới**, **In hợp đồng**, **Tải PDF**. Chỉ cho in/tải khi có PDF hợp lệ; in tác động vào bản PDF. Có phương án mở tab mới khi trình duyệt không hỗ trợ in trong iframe.
9. Đóng/Escape quay về màn hình cũ, hủy yêu cầu đang chờ và thu hồi URL tạm trong trình duyệt.

Trong Hồ sơ & tài liệu, chọn Hợp đồng thuê căn hộ rồi **Xem PDF** để xem cả thông tin đang nhập mà chưa cần tải file.

## Tự điền và tính đúng dữ liệu

- Tham chiếu `homeland-saas/apps/web/components/contracts/PreviewContractModal.tsx` và `apps/web/app/api/export-contract/route.ts`: xuất mẫu Word đã điền sang PDF và xem trong popup.
- Dùng lại `rentalDocuments.ts` và hai mẫu hợp đồng người dùng đã cung cấp. Không thay nội dung hợp đồng bằng trang HTML mô phỏng.
- Giá thuê, tiền cọc, ngày bắt đầu/kết thúc lấy từ hợp đồng trên máy chủ; không tin giá trị tiền do trình duyệt gửi vào hồ sơ tài liệu. Số tiền bằng chữ tạo từ cùng số tiền đó.
- Thông tin bên cho thuê có thể gợi ý từ hồ sơ cùng tòa, cùng tổ chức. Không dùng lại khách thuê từ hợp đồng khác.
- Chỉ mở xem không ghi hồ sơ, không đổi trạng thái hợp đồng, không tạo khoản thu/chi.
- API kiểm tra quyền `contracts.manage`, tổ chức và phạm vi tòa nhà. PDF trả `application/pdf`, `inline`, `private, no-store`.
- Bản đang xem được tạo từ dữ liệu hiện tại, chưa phải bản hợp đồng đã ký hoặc bản lưu bất biến.

## API và mã nguồn

| Thành phần | Vai trò |
|---|---|
| `GET /api/v1/console/v2/contracts/:id/document` | Lấy thông tin tự điền và danh sách thiếu |
| `POST /api/v1/console/v2/contracts/:id/document` | Tạo PDF từ hồ sơ gửi vào hoặc hồ sơ đã lưu; không ghi hồ sơ |
| `POST /api/v1/console/v2/contracts/:id/document/profile` | Lưu hồ sơ cho đúng ID hợp đồng |
| `apps/landing/server/contractDocumentsApi.ts` | Quyền truy cập, truy vấn hợp đồng, hồ sơ và xuất PDF |
| `apps/console/src/shared/ui/ContractDocumentDialog.tsx` | Link mã hợp đồng, popup PDF, chỉnh hồ sơ, in/tải |
| `apps/console/src/shared/ui/ContractDocumentDialog.css` | Bố cục desktop/mobile, header và thanh thao tác |

## Căn chỉnh popup sau phản hồi ảnh iPhone

- Ghim header, thanh công cụ và nút đáy bằng bố cục flex có vùng nội dung cuộn riêng; giữ nút Xem trước bên trái, Lưu & xem PDF bên phải.
- Khóa chiều rộng biểu mẫu và cột nhập; không cho nội dung tạo thanh cuộn ngang. Nhãn dài vẫn giữ các ô cùng hàng thẳng nhau.
- Chuẩn hóa ô ngày Safari về cùng chiều cao với ô khác; giới hạn phần hiển thị ngày trong cột. Input/select, nhãn và nút dùng chung 13px trên desktop/mobile; giữ tỷ lệ chữ 100% trong popup. Không vô hiệu hóa khả năng phóng to của trình duyệt. Xem [Thông tin chủ nhà và chuẩn ô nhập](BUILDING-LANDLORD.md).
- Thông tin thiếu gộp thành một mục thu gọn có thể mở bằng bàn phím. Lỗi kiểm tra dữ liệu 422 không tạo thêm thanh đỏ Thử lại trùng lặp; lỗi máy chủ/tải PDF vẫn hiển thị riêng.
- Kiểm tra vị trí header/thanh công cụ/thanh đáy trước, giữa và cuối khi cuộn; không tràn ngang ở 1440px, 390px, 320px và chiều cao mobile 640px. Đã kiểm tra Chrome và WebKit (locale vi-VN); chưa xác minh trên Safari/iPhone thật.
- Chạy `ADHOME_WEBKIT_LAYOUT=1` với Playwright có WebKit tương ứng để kiểm tra riêng ô ngày và bố cục, không phụ thuộc bộ xem PDF trên Windows. Kết quả: `.artifacts/contract-preview/ui/webkit-layout-results.json`.

## Kiểm tra và giới hạn

- `node scripts/test-contract-documents.mjs`: đạt với kho dữ liệu giả lập, gồm hợp đồng cũ có hợp đồng mới cùng phòng, điền hồ sơ, dữ liệu thiếu, ngày không hợp lệ, quyền tổ chức/tòa và chỉ lưu khi có yêu cầu.
- `node scripts/test-contract-preview-ui.mjs`: đạt ở 1440px/390px/320px với reduced motion, API mô phỏng và PDF kiểm thử đã có. Kiểm tra bấm mã, iframe PDF, tải đúng tệp, gọi in đúng iframe, phần bổ sung, lưu, popup lồng nhau, cập nhật hồ sơ cha, lỗi chuyển đổi, MIME sai, Escape và không tự ghi; kiểm tra bố cục và vị trí ghim ở cả cửa sổ thấp 640px.
- Ảnh/kết quả kiểm tra: `.artifacts/contract-preview/ui/`. Chỉ dùng thông tin kiểm thử.
- `node scripts/test-rental-workflow.mjs`: nghiệp vụ tiền và điền bốn mẫu Word cũ tiếp tục đạt. Console typecheck/build đạt; build còn cảnh báo gói JavaScript lớn.
- **Chưa xác minh được phép thử chuyển Word sang PDF thực trong phiên này.** Máy kiểm tra không có LibreOffice ở đường dẫn mặc định; Word COM báo `80070520` (không có phiên đăng nhập phù hợp). Dịch vụ duyệt tự động từ chối thực thi phép thử ngoài phiên hạn chế vì lỗi 429, không phải kết luận thao tác không an toàn. Không dùng PDF mẫu để khẳng định bộ chuyển thực đã hoạt động.
- Máy chủ phải có LibreOffice (`ADH_DOC_SOFFICE` trỏ tới `soffice`) hoặc Microsoft Word trên Windows với phiên chạy phù hợp. Khi chưa chuyển được, API trả 503, popup báo lỗi và không mở/in/tải một PDF giả.
- Sau khi máy chủ có bộ chuyển đổi, chạy `node scripts/test-contract-documents.mjs --pdf` để xuất hai mẫu thực và kiểm tra PDF. Chưa kiểm tra việc in trên máy in vật lý hoặc Safari/iPhone thật.
