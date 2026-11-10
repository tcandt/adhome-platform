# Integration Hub — bàn giao triển khai

**Cập nhật webhook:** receiver của cả năm provider đã được triển khai sau bản quản trị cấu hình ban đầu. URL tự nhận diện từ domain đang dùng; không cần cài domain thủ công. Xem [PAYMENT_WEBHOOK_INTEGRATION.md](PAYMENT_WEBHOOK_INTEGRATION.md) cho hướng dẫn và phạm vi mới nhất.

## Đường dẫn và chức năng hiện có

Console → Cài đặt & Thiết lập → **Tích hợp ngân hàng**.

| Chức năng | Trạng thái |
|---|---|
| Danh mục SePay, payOS, MoMo, ZaloPay, Tingee | Đã có |
| Nhiều kết nối cho cùng một provider | Đã có |
| Một lần lưu nhiều tài khoản nhận tiền | Đã có, tối đa 50 tài khoản/kết nối |
| Nhiều kết nối hoạt động độc lập | Đã có cờ bật/tắt; chưa có consumer nhận tiền |
| Môi trường LIVE/SANDBOX | Theo năng lực provider, không giả lập sandbox cho adapter LIVE |
| Phạm vi toàn tổ chức hoặc một tòa nhà | Đã có; mới là cấu hình, chưa định tuyến thanh toán |
| Mã hóa khóa, RBAC, tenant isolation, audit | Đã có |
| Kiểm tra SePay | API đọc danh sách tài khoản, không tự nhập danh sách vào tài khoản khai báo |
| Kiểm tra payOS | API đọc mã link đã tồn tại, không kiểm tra Checksum Key |
| Kiểm tra API MoMo/ZaloPay/Tingee | Chưa có; có thể bật bộ nhận webhook riêng |
| Webhook / IPN | Đã có xác thực, ACK theo từng provider, inbox mã hóa, chống trùng và URL riêng |
| Payment intent / tạo link / tự ghi thu | Chưa triển khai |
| Kết nối Hunonic và kênh thông báo cũ | Giữ nguyên luồng hiện tại |

## Hợp đồng API

Tất cả endpoint nằm dưới `/api/v1/console/v2/settings/payment-connections`, dùng auth/CSRF của Console và quyền `settings.manage`. Response có `Cache-Control: no-store`.

| Method / đường dẫn | Nghiệp vụ |
|---|---|
| `GET /` | Danh mục provider, kết nối, tài khoản, 20 audit gần nhất, provider cũ cần chuyển cấu hình |
| `POST /` | Tạo kết nối và danh sách tài khoản trong cùng transaction |
| `PATCH /:id` | Lưu cấu hình/tài khoản với `version` hiện tại; tắt kết nối và xóa xác thực cũ |
| `POST /:id/test` | Kiểm tra API chỉ đọc với `version`; payOS yêu cầu `reference` |
| `POST /:id/enabled` | Bật/tắt API với `version`, `isEnabled`; bật chỉ khi LIVE và VERIFIED |
| `POST /:id/webhook` | Bật/tắt bộ nhận webhook, độc lập kiểm tra API; yêu cầu đủ khóa callback |
| `POST /:id/register-webhook` | Đăng ký/cập nhật URL với payOS bằng confirm-webhook |

Ví dụ tạo SePay (các giá trị dưới đây là placeholder):

```json
{
  "creationId": "ec978dcf-c3a1-4c02-82b3-8667f633cf54",
  "providerId": "SEPAY",
  "name": "Thu tiền An Phú",
  "environment": "LIVE",
  "buildingId": null,
  "webhookAuth": "HMAC_SHA256",
  "credentials": { "apiToken": "<optional-api-token>", "webhookSecret": "<webhook-secret>" },
  "accounts": [
    { "bankCode": "VCB", "accountNumber": "00123456", "accountName": "CHU TAI KHOAN" },
    { "bankCode": "MB", "accountNumber": "00987654", "accountName": "CHU TAI KHOAN" }
  ]
}
```

`creationId` là UUID hoặc 32 ký tự hex sinh trên client và giữ nguyên cho cùng một yêu cầu tạo. Gửi lại cùng nội dung trả lại kết nối cũ; cùng mã nhưng khác nội dung trả 409. Nếu hai request tạo đồng thời đụng unique, một request có thể bị từ chối; tải lại hoặc gửi lại cùng nội dung, không sinh mã mới cho retry. `PATCH` dùng `credentials: {}` để giữ khóa cũ, hoặc truyền từng trường cần thay thế. API không trả giá trị credential, kể cả Client ID; chỉ trả danh sách tên trường đã lưu.

Kiểm tra thất bại từ provider lưu `ERROR`, tắt kết nối và ghi audit. Payload kiểm tra sai không làm mất kết quả xác thực trước đó. Kết quả đến muộn sau khi cấu hình đã đổi trả 409; không ghi trạng thái VERIFIED cho khóa mới. Nút lưu/chờ chỉ kết thúc sau phản hồi và đọc lại danh sách. Không có progress timer giả lập.

## Cơ sở dữ liệu và triển khai

Schema mới là `PaymentProviderConnection` và `PaymentReceivingAccount`; không đổi unique của `IntegrationConnection` cũ.

Database local `127.0.0.1:5432/adhome_v2` đã được áp dụng SQL bổ sung trong phiên phát triển. Không thay đổi tài khoản đăng nhập hoặc secret đã có.

Với môi trường khác, dùng quy trình triển khai DB của môi trường và áp dụng **một lần**:

```powershell
pnpm --filter @adhome/landing exec prisma validate
pnpm --filter @adhome/landing exec prisma db execute --file prisma/sql/integration-hub.sql --schema prisma/schema.prisma
pnpm --filter @adhome/landing exec prisma generate
pnpm --filter @adhome/console build
```

SQL là transaction additive, không chứa thao tác xóa bảng/cấu hình cũ. Không dùng `db push` hoặc `migrate reset` để triển khai riêng thay đổi này. Không chạy SQL lại nếu hai bảng đã có.

Máy chủ cần `ADHOME_CREDENTIALS_ENCRYPTION_KEY` (ít nhất 32 ký tự) hiện có của vault. Không xoay khóa này nếu chưa có quy trình mã hóa lại credential. Restart backend theo quy trình môi trường để PrismaClient mới nhận model mới; refresh trang Console để nhận bản build.

Trên máy Windows hiện tại, `prisma generate` gặp EPERM khi thay DLL query engine đang được một tiến trình giữ. Các file client được sinh trước bước thay DLL đã dùng được trong kiểm thử PostgreSQL. Chưa cưỡng ép dừng tiến trình giữ DLL. Cần chạy lại generate khi engine không còn bị giữ, trước khi đóng gói môi trường triển khai mới.

## Kiểm thử đã chạy

- `prisma validate`: PASS.
- TypeScript cho hai module server mới: PASS.
- Console `tsc -b` và Vite production build: PASS; Vite vẫn cảnh báo bundle chính trên 500 kB.
- Oxlint các file mới: PASS.
- `node scripts/test-payment-integrations.mjs`: PASS trên PostgreSQL local thật, tạo tổ chức test riêng và dọn sau test. Kiểm tra multi-provider, multi-bank, retry tạo kết nối, xung đột phiên bản, tenant isolation, RBAC, vault, rollback khi audit lỗi, lỗi provider, race đổi khóa và không phát sinh phiếu thu. HTTP provider được giả lập; chưa sử dụng khóa thật.
- `node scripts/test-payment-integrations-ui.mjs`: PASS ở 1440px và 390px, reduced motion. API được giả lập ở trình duyệt; kiểm tra form, lỗi lưu, chờ request thật, trạng thái bật, lỗi API, không hydrate secret, Escape/khôi phục focus, không tràn ngang. Cần Playwright/Chrome và Console trên 5174. Chạy test server trước để tạo bundle registry dùng cho test UI. Có thể dùng `ADHOME_PLAYWRIGHT_MODULE` để trỏ đến Playwright cài ngoài repo.
- Ảnh và kết quả UI sinh tại `.artifacts/payment-integrations/` (không commit).

## Thứ tự phát triển tiếp theo

1. Receiver và inbox đã có cho năm provider. Tiếp theo cần merchant/account matching, sandbox test thực tế và payment intent trước khi gắn sổ cái.
2. Payment intent và routing theo kết nối/tài khoản/tòa nhà; đồng bộ giao diện thu tiền hiện tại để không chỉ gán nhãn provider cho thu thủ công.
3. Đối soát giao dịch qua ledger bằng transaction, khóa duy nhất externalTxId, khóa hóa đơn, chống trùng xuyên provider và review thu thiếu/dư.
4. Adapter MoMo/ZaloPay/Tingee theo tài khoản đối tác thực tế, test sandbox, ký request và xác minh callback; chỉ mở chức năng đã đạt test.
5. Quan sát vận hành, retry/replay có phân quyền, rotation credential, cảnh báo và quy trình sự cố.

Chi tiết thiết kế và tài liệu provider: `INTEGRATION_HUB.md`. Không đánh dấu phần nhận tiền là hoàn tất chỉ từ kết quả kiểm tra API hoặc lưu cấu hình thành công.
