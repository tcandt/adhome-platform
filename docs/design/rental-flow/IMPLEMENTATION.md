# Hướng dẫn sử dụng quy trình thuê và xuất hồ sơ

Cập nhật 03/11/2026. Đã triển khai trong mã nguồn AdHome; chưa triển khai lên môi trường thật. Sơ đồ thiết kế cũ được giữ để đối chiếu. Tài liệu này mô tả phần đang chạy và giới hạn kiểm tra.

## 1. Mở màn hình

Vào **Tòa nhà & phòng → chọn phòng → Khách ở → Thêm thuê**. Chọn một trong ba nhu cầu, nhập thông tin, xem lại rồi xác nhận. Có thể mở lại hồ sơ từ chính phòng đó.

Địa chỉ nội bộ: `?module=buildings&rentalRoom=<roomId>`. Thông tin chưa xác nhận chỉ nằm trên màn hình; tải lại sẽ mất bản nháp. Có cảnh báo khi đóng trang có chỉnh sửa chưa lưu.

| Nhu cầu | Kết quả xác nhận | Tiền thực tế |
|---|---|---|
| Đồng bộ dữ liệu | Khách, hợp đồng ACTIVE, người ở, phòng OCCUPIED | Tiếp nhận số cọc lịch sử và công nợ; không ghi thu mới cho cọc cũ |
| Đặt cọc giữ phòng | Phiếu giữ chỗ, phòng RESERVED | Chỉ ghi thu bằng số tiền đã thực nhận, cho phép thu chưa đủ |
| Thuê ở ngay | Hợp đồng DRAFT, hóa đơn đầu kỳ, phòng RESERVED | Chưa ghi thu; thực hiện Thu tiền rồi Bàn giao riêng |

Đồng bộ là nhập thông tin khách cũ thủ công, không kết nối lấy dữ liệu tự động từ Homeland. Ngày đã trả đến được lưu làm thông tin tiếp quản; trước khi phát hành hóa đơn các kỳ tiếp theo cần kiểm tra khoản đã trả và điều chỉnh kỳ tính tiền trong quy trình hóa đơn hiện có.

## 2. Khách cọc tiếp tục thuê

1. Mở hồ sơ giữ phòng, chọn **Tiếp tục thuê**.
2. Kiểm tra khách chính, người cùng ở, ngày bắt đầu/kết thúc, giá thuê và cọc hợp đồng.
3. Xem bảng quyết toán do máy chủ tính. Chọn tiền dư trừ thuê/bảo lưu hoặc chờ hoàn riêng.
4. Xác nhận lập hợp đồng. Phiếu cọc chuyển trạng thái, hợp đồng chờ bàn giao; chưa thu lại tiền cọc cũ.
5. Chọn **Thu tiền**, nhập đúng số tiền thực nhận. Thu từng phần ưu tiên bổ sung cọc, sau đó tiền thuê.
6. Chọn **Bàn giao nhận phòng**, nhập ngày nhận, chỉ số điện/nước, người giao/nhận. Khi được máy chủ xác nhận mới chuyển sang ACTIVE/OCCUPIED.

Ví dụ: cọc khả dụng 2.000.000, cọc hợp đồng 4.500.000, thuê kỳ đầu 4.500.000 → cần thu mới 7.000.000. Thu mới 1.000.000 thì cọc đang có 3.000.000, công nợ còn 6.000.000. Thu tiếp 6.000.000 thì đủ cọc và hết nợ hóa đơn đó.

Thiếu cọc sẽ chặn bàn giao. Chỉ ADMIN được phê duyệt ngoại lệ và phải nhập lý do. Khoản nợ thuê còn lại được hiển thị riêng.

## 3. Hủy cọc và hoàn tiền

Chọn **Hủy cọc → Hoàn đủ / Hoàn một phần / Không hoàn → nhập lý do → Xem lại**.

Luôn phân bổ hết cọc khả dụng vào: tiền hoàn khách + chi phí khấu trừ + tiền giữ lại/phạt. Khấu trừ và phạt là phân bổ tiền đã có, không tạo thêm thu tiền mặt.

- **Chưa chi**: tạo khoản chờ hoàn, chưa ghi chi tiền. Phòng được giải phóng sau khi hủy thành công.
- **Đã thực chi**: chỉ chọn sau khi thật sự hoàn khách; máy chủ ghi khoản chi.
- Khoản chờ hoàn có nút **Xác nhận đã chi hoàn** trên hồ sơ. Gửi lại cùng yêu cầu không tạo chi lần hai.

Phiếu đã hủy không chuyển tiếp thành hợp đồng; nếu khách quay lại, tạo hồ sơ thuê mới. Khoản hoàn đang chờ vẫn cần được xử lý.

## 4. Hồ sơ và mẫu biểu

Chọn **Thông tin và xuất hồ sơ**. Kiểm tra thông tin của khách, người cùng ở, bên cho thuê, địa chỉ căn hộ, cơ quan tiếp nhận, ngày ký, tài khoản ngân hàng và người quản lý. Lưu hồ sơ trước khi rời trang để dùng lại.

| Biểu mẫu | Nguồn | Cách sử dụng |
|---|---|---|
| Hợp đồng cọc | HD-COC-GIU-PHONG.docx | Word; chỉ xuất khi đã thực nhận đủ cọc vì mẫu có câu xác nhận đã nhận đủ |
| Hợp đồng 1PN | HOP_DONG_1PN.docx | Word/PDF, điền thông tin hai bên và số tiền theo hợp đồng |
| Hợp đồng 2PN | HOP_DONG_2PN.docx | Word/PDF, chọn mẫu tại màn hình Hồ sơ |
| CT01 | CT01.docx | Mỗi người một Word/PDF; đủ 12 chữ số định danh, ngày sinh, giới tính, địa chỉ và cơ quan tiếp nhận |
| Bộ hồ sơ cư trú | Hợp đồng + CT01 từng người | Ghép thành một PDF, có thể thêm giấy tờ nhà khi được cấu hình đúng tòa nhà |

Khách chính mặc định là chủ hộ trong CT01. Với người cùng ở cần nhập quan hệ với khách chính; CT01 của họ dùng tên và số định danh của khách chính ở mục chủ hộ. Kiểm tra lại khi hộ đăng ký thực tế khác cách khai này.

Tiền bằng chữ được tạo từ số tiền, không nhập lại thủ công. Số tiền thuê và cọc của hợp đồng lấy từ dữ liệu đã lưu. Với phiếu giữ phòng, kiểm tra hai khoản dự kiến khi nhận phòng trong phần Hồ sơ; quyết toán chuyển thuê sẽ tính lại theo ngày vào ở thực tế.

Mẫu giữ phòng và hợp đồng có điều khoản, địa danh, phụ lục nội thất, hình nội quy Homeland có sẵn trong tài liệu gốc. Các nội dung cố định được giữ theo mẫu; người vận hành phải đọc bản xuất trước khi ký, đặc biệt phụ lục nội thất của từng căn hộ. Cơ quan tiếp nhận CT01 và số liên hệ quản lý được lấy từ thông tin nhập, không dùng liên hệ mẫu cũ.

Chưa có mẫu tạm vắng riêng trong bộ tài liệu đính kèm. Xuất CT01/bộ PDF chỉ tạo hồ sơ; không tự nộp lên cổng cư trú hoặc đánh dấu đã đăng ký với công an. CT01_backup và các file test được giữ làm tài liệu đối chiếu, không dùng làm mẫu chính.

## 5. Cài đặt máy chủ và quyền

- Mẫu nằm trong `apps/landing/server/rental-templates/`, không nằm ở thư mục public. Có thể đặt `ADH_RENTAL_TEMPLATE_DIR` trỏ tới thư mục mẫu riêng khi triển khai.
- Xuất PDF cần LibreOffice trên máy chủ (có thể chỉ định `ADH_DOC_SOFFICE`), hoặc Microsoft Word trên Windows có phiên chạy phù hợp. Không có bộ chuyển đổi thì trả lỗi rõ ràng, vẫn có thể tải Word.
- Giấy phép kinh doanh và giấy tờ nhà chỉ được ghép khi `ADH_OWNERSHIP_EVIDENCE_ORG_ID` và `ADH_OWNERSHIP_EVIDENCE_BUILDING_ID` khớp phòng đang xử lý, đồng thời người dùng chủ động chọn đính kèm. Chưa cấu hình thì không xuất các giấy tờ này.
- Máy chủ kiểm tra tổ chức, phạm vi tòa nhà và quyền thao tác. Tạo/sửa hồ sơ cần `contracts.manage`; ghi nhận thực thu/hoàn cần `finance.write`. Các thao tác dùng cơ chế phiên đăng nhập và chống giả mạo yêu cầu hiện có.
- Hồ sơ biểu mẫu lưu bằng bản ghi kiểm toán `RENTAL_DOCUMENT/SAVE_RENTAL_PROFILE`, không cần thay đổi cấu trúc cơ sở dữ liệu trong lần triển khai này. Thông tin cá nhân không được xuất vào nhật ký kiểm tra công khai.

## 6. Bản đồ mã nguồn đang dùng

| Phần | Tệp |
|---|---|
| Điểm vào từ phòng | apps/console/src/features/buildings/UnifiedBuildingCanvas.tsx; modals/RoomProfileModal.tsx |
| Các màn hình nhập, xem lại, giao dịch và hồ sơ | apps/console/src/features/buildings/RentalOnboardingPage.tsx |
| Đọc hồ sơ, báo giá, tạo thuê, lưu và xuất tài liệu | apps/landing/server/rentalWorkflowApi.ts |
| Số dư cọc, quyết toán, phân bổ thu | apps/landing/server/rentalFinance.ts |
| Hủy/chuyển cọc, thanh toán và bàn giao | apps/landing/server/consoleBusinessApi.ts |
| Điền mẫu, PDF và ghép bộ cư trú | apps/landing/server/rentalDocuments.ts; rentalDocPdf.ps1 |
| Kiểm tra nghiệp vụ và màn hình | scripts/test-rental-workflow.mjs; scripts/test-rental-ui.mjs |

## 7. Kết quả kiểm tra

- Console typecheck và build thành công. Build còn cảnh báo kích thước gói JavaScript lớn.
- Kiểm tra TypeScript nhóm máy chủ thay đổi thành công.
- Kiểm tra API thật với kho dữ liệu giả lập: ba nhu cầu, chặn trùng phòng, cách ly tổ chức, ba kiểu hủy, chờ hoàn rồi thực chi, gửi lại yêu cầu, chuyển cọc, thu một phần, thu đủ và bàn giao. Chưa phải kiểm tra tích hợp PostgreSQL hoặc chứng minh xử lý đồng thời trên cơ sở dữ liệu thật.
- Trình duyệt Chrome 1440px/390px, reduced motion: xem lại chưa ghi, nhập liệu còn nguyên khi máy chủ từ chối, không báo thành công giả, kiểm tra focus bàn phím và không tràn ngang. Có thêm xem lại hủy một phần, quyết toán chuyển thuê 7 triệu, màn hình hồ sơ.
- Bộ PDF cư trú ghép đã được kiểm tra đủ 10 trang (hợp đồng 1PN và CT01 một người). Bốn mẫu Word xuất được; đã dùng Microsoft Word chuyển PDF và xem 19 trang. CT01 2 trang, cọc 2 trang, 1PN 8 trang, 2PN 7 trang. Bộ dựng tài liệu chuẩn thiếu LibreOffice trên máy này nên dùng bản PDF do Word dựng để kiểm tra bố cục.
- Bằng chứng cục bộ: `.artifacts/rental-workflow/`, ảnh màn hình trong `ui/`, kết quả `ui/results.json`. Tất cả dữ liệu kiểm tra là giả lập. Thư mục bằng chứng được loại khỏi Git.

Trước khi vận hành thật cần kiểm tra một vòng bằng tài khoản và cơ sở dữ liệu thử nghiệm: đăng nhập → tạo cọc → chuyển thuê → thu → bàn giao → xuất hồ sơ; xác nhận cấu hình máy chủ PDF, quyền người dùng và đúng giấy tờ tòa nhà. Không coi các kiểm tra giả lập là đã triển khai hoặc đã nghiệm thu dữ liệu thật.

## 8. Chạy lại kiểm tra

- `node scripts/test-rental-workflow.mjs`: nghiệp vụ API và bốn mẫu Word, không cần kết nối cơ sở dữ liệu.
- Thêm `--pdf` để kiểm tra chuyển bốn mẫu thành PDF; `--bundle` để kiểm tra ghép bộ cư trú. Cần máy chủ có bộ chuyển đổi như mục 5.
- `node scripts/test-rental-ui.mjs`: cần Console chạy ở `http://127.0.0.1:5174`, Playwright và Chrome. Có thể đặt `ADHOME_PLAYWRIGHT_MODULE` bằng URL module Playwright khi dùng bộ thư viện chung. Các API trong bài kiểm tra này được giả lập tại trình duyệt.
