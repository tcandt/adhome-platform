# Thông tin chủ nhà và chuẩn ô nhập

Cập nhật 03/11/2026. Đã triển khai và kiểm tra cục bộ.

## Màn hình

1. Mở danh sách chọn tòa nhà, nhấn dấu cộng để thêm tòa; hoặc vào cấu hình tòa → Chỉnh sửa tòa nhà.
2. Nhập thông tin tòa, quản lý và số tầng như trước.
3. Mục **Thông tin chủ nhà** gồm họ tên, điện thoại, CCCD/CMND, địa chỉ chủ nhà.
4. Mục **Tài khoản ngân hàng** gồm số tài khoản, ngân hàng, họ tên chủ tài khoản.
5. Nhấn lưu. Khi API trả lỗi, popup giữ nguyên nội dung để sửa/thử lại. Khi đang lưu, khóa gửi lặp và đóng popup.
6. Mở lại tòa để xem/chỉnh sửa. Các trường chủ nhà không bắt buộc khi tạo tòa; hồ sơ hợp đồng vẫn yêu cầu bổ sung các thông tin cần thiết trước khi xuất.

Các trường có nhãn riêng, bố trí hai cột; tên chủ tài khoản chiếm toàn hàng. Điện thoại, CCCD và số tài khoản lưu dạng văn bản để giữ số 0 đầu. CCCD có 12 chữ số hoặc CMND cũ 9 chữ số.

## Tự điền hồ sơ thuê

- Thông tin chủ nhà được lưu theo từng tòa; quản lý phụ trách là thông tin riêng.
- Khi tạo hồ sơ thuê/cọc hoặc mở mã hợp đồng, điền phần bên cho thuê từ tòa tương ứng.
- Thông tin có nội dung đã lưu trên hợp đồng được ưu tiên. Giá thuê và tiền cọc vẫn lấy từ hợp đồng.
- Tòa chưa từng cấu hình chủ nhà tiếp tục dùng dữ liệu mặc định từ hồ sơ cũ của cùng tòa.
- Sau khi cấu hình chủ nhà theo tòa, không lấy lại các trường đã xóa từ hồ sơ cũ. Chuỗi trống trong hồ sơ hợp đồng được bổ sung bằng mặc định theo tòa nếu có.
- Chỉ quyền quản lý tòa hoặc hợp đồng nhận thông tin chủ nhà trong dữ liệu danh sách tòa. Đọc/ghi giới hạn theo tổ chức và phạm vi tòa đã được cấp quyền.

## Chuẩn giao diện

| Thành phần | Cỡ chữ / kích thước |
|---|---|
| Ô nhập, ngày, danh sách chọn, textarea | 13px, cùng cỡ nhãn/nút trên desktop và mobile |
| Nhãn và nút trong popup / quy trình thuê | 13px |
| Tiêu đề popup tòa nhà và nhóm thông tin | 14px, đậm vừa |
| Ô nhập popup tòa và hợp đồng | Cao 38px |
| Nút đáy popup tòa | Tối thiểu 36px, không xuống dòng |

Popup tạo/sửa tòa dùng Animate UI Dialog và Button. Header và footer đứng ngoài vùng nội dung cuộn. Mobile giữ safe area; nút xóa dùng biểu tượng kèm tên truy cập và chú thích. Không mô phỏng tiến độ bằng thời gian. Giữ tùy chọn giảm chuyển động và khả năng zoom trình duyệt.

## Dữ liệu và triển khai

- Cột `buildings.landlord_profile`: JSONB, mặc định `{}`. Trường frontend/API: `landlord`, gồm `fullName`, `address`, `idNumber`, `phone`, `accountNumber`, `bank`, `accountName`.
- POST lưu cùng giao dịch tạo tòa; PATCH giữ trường không gửi và cho phép xóa bằng chuỗi trống. Các thuộc tính ngoài danh sách được bỏ qua, kiểu/độ dài không hợp lệ bị từ chối.
- Đã áp dụng cập nhật cột vào PostgreSQL cục bộ. Các truy vấn tham số hóa hỗ trợ cả backend đang dùng Prisma client trước thay đổi, vì vậy không cần dừng tiến trình để sử dụng các trường mới.
- Khi cài đặt môi trường khác, chạy từ gốc dự án:

```powershell
pnpm --filter @adhome/landing exec prisma db execute --file prisma/updates/20261103_building_landlord.sql --schema prisma/schema.prisma
pnpm --filter @adhome/landing exec prisma generate --schema prisma/schema.prisma
```

Lệnh đầu chỉ thêm cột nếu chưa có. Chạy tạo Prisma client khi backend đã dừng để Windows không khóa thư viện; sau đó khởi động lại theo hướng dẫn dự án. Phiên làm việc này chưa tạo lại Prisma client: thư viện đang bị tiến trình backend giữ; bước duyệt tự động cho thao tác dừng backend lỗi 429. Các đường đọc/ghi mới đã kiểm tra được với client đang có.

## Bằng chứng

- `node scripts/test-building-landlord.mjs --database`: handler tạo/sửa, cập nhật từng trường, xóa, bỏ qua trường, kiểm tra dữ liệu, phân quyền; đọc/ghi PostgreSQL thật bằng bản ghi tạm trong giao dịch rollback.
- `node scripts/test-building-landlord-ui.mjs`: Chrome/WebKit ở 1440px, 390px, 320px; tạo/sửa/mở lại, giữ dữ liệu khi lỗi, chặn đóng lúc đang lưu, font thống nhất, header/footer ghim, không tràn ngang, reduced motion.
- `node scripts/test-contract-documents.mjs`: mặc định theo tòa và ưu tiên thông tin hợp đồng đã lưu, cùng các kiểm tra hợp đồng trước đó.
- `node scripts/test-contract-preview-ui.mjs`: Chrome/WebKit; ô ngày 38px/14px, không tràn cột và thanh thao tác ghim.
- `node scripts/test-rental-workflow.mjs`: nghiệp vụ thuê/cọc và điền bốn mẫu Word tiếp tục đạt.
- Ảnh và kết quả: `.artifacts/building-landlord/`, `.artifacts/contract-preview/ui/`.
- Giao diện kiểm tra qua API giả lập; đọc/ghi PostgreSQL kiểm tra riêng. Chưa nghiệm thu trên iPhone thật hoặc môi trường triển khai chính thức; giới hạn bộ chuyển PDF giữ như tài liệu hợp đồng.
