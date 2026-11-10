# Tích hợp webhook thanh toán theo tài liệu chính thức

Đối chiếu tài liệu ngày 03/11/2026. Phạm vi hiện tại: nhận, xác thực và lưu bền callback riêng từng kết nối. Chưa có payment intent, tạo đơn thanh toán, tự ghi thu, consumer/replay inbox hoặc tự tất toán hóa đơn.

## URL tự nhận diện

Trong Settings → Tích hợp ngân hàng, sau khi lưu kết nối, URL hiển thị ngay dưới thẻ:

```text
https://console.adhome.vn/api/v1/webhooks/payments/sepay/<connection-id>
https://console.adhome.vn/api/v1/webhooks/payments/payos/<connection-id>
https://console.adhome.vn/api/v1/webhooks/payments/momo/<connection-id>
https://console.adhome.vn/api/v1/webhooks/payments/zalopay/<connection-id>
https://console.adhome.vn/api/v1/webhooks/payments/tingee/<connection-id>
```

`connection-id` được tạo khi lưu, không phải khóa bí mật. Mỗi kết nối có URL riêng và xác thực bằng khóa đúng nhà cung cấp. Hai kết nối cùng provider không dùng chung URL.

Console gửi origin trang đang mở đến API; server chỉ chấp nhận domain chính thức `console.adhome.vn` và `adhome.vn`, rồi xét Origin/Referer/Host đã kiểm tra. Khi chạy localhost/LAN, dùng domain quản lý `https://console.adhome.vn`. Không cần setting domain thủ công hoặc biến ADHOME_PUBLIC_API_ORIGIN; không tin domain tùy ý trong Host/X-Forwarded-Host. Endpoint dùng POST từ server nhà cung cấp, không cần cookie đăng nhập Console hoặc CSRF header.

Tạo URL không chứng minh endpoint public đã được triển khai. Hạ tầng cần đưa `/api/v1/webhooks/payments/*` của domain hiện tại tới backend API, giữ nguyên body/headers và không yêu cầu login/WAF challenge. Khi callback hợp lệ được lưu thành công, Settings mới cập nhật thời điểm nhận. Local HTTP đã được kiểm thử; chưa kiểm tra giao dịch/khóa thật trên hai domain production.

## SePay

- **Tài liệu:** [Tạo webhook](https://developer.sepay.vn/vi/sepay-webhooks/tao-webhook), [payload và ACK](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook), [xác thực](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc).
- API Token là khóa AdHome gọi API đọc tài khoản; **không phải** khóa SePay gọi webhook. Nhận webhook không yêu cầu API Token.
- Trong AdHome nhập `Webhook Secret / Webhook API Key`, chọn HMAC-SHA256 hoặc API Key, lưu rồi bật nhận webhook.
- Trong SePay → Tích hợp → Webhooks: thêm webhook, dán URL, chọn JSON, tiền vào, tài khoản/VA/bộ lọc; bật retry. Ở bước Bảo mật chọn đúng cách xác thực và nhập cùng khóa vừa dùng tại AdHome.
- HMAC: ký `${timestamp}.${raw_body}` bằng SHA256; `X-SePay-Signature` có prefix `sha256=`, `X-SePay-Timestamp` là Unix seconds. AdHome so sánh constant-time và kiểm tra thời gian ±300 giây. Không stringify lại body trước khi kiểm tra.
- API Key: header `Authorization: Apikey <webhook-key>`, không dùng Bearer API Token. Endpoint không hỗ trợ chế độ Không xác thực hoặc OAuth webhook.
- ACK sau commit: HTTP 200 với `{"success":true}`. Khóa chống trùng là `id` trong một kết nối; payload gửi thử với id=0 được ghi TEST_RECEIVED theo fingerprint, không ghi thu.
- Test mode và Live phải tạo thành các kết nối riêng với bộ khóa và URL riêng. Gửi thử thành công chưa xác nhận tài khoản đã nhận tiền thật.

## payOS

- **Tài liệu:** [Webhook payload](https://payos.vn/docs/du-lieu-tra-ve/webhook/), [quy tắc signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/), [API confirm-webhook](https://payos.vn/docs/api/).
- Nhập Client ID, API Key và Checksum Key của đúng kênh; lưu, bật nhận webhook. Dán URL tại my.payos.vn hoặc bấm **Đăng ký URL với payOS**.
- Nút đăng ký gọi POST `https://api-merchant.payos.vn/confirm-webhook`, body có `webhookUrl`, header `x-client-id` và `x-api-key`. Đây là thao tác thêm/cập nhật URL thật của kênh; chỉ báo thành công nếu provider trả code 00 và URL khớp. Không tự gọi khi lưu form.
- Kiểm tra HMAC-SHA256 trên object `data` theo key alphabet, xử lý null và array theo tài liệu, dùng Checksum Key. Trường ngoài `data` không được dùng để quyết định giao dịch thành công.
- ACK: HTTP 200. Khóa chống trùng gồm paymentLinkId/reference/code trong từng kết nối. Mẫu confirm-webhook cũng được lưu inbox, **không được coi là khoản thu thật**; trước khi triển khai consumer phải khớp payment intent đã tạo.
- Kiểm tra API đọc link chỉ xác nhận Client ID/API Key; không thay thế kiểm tra callback bằng Checksum Key.

## MoMo

- **Tài liệu:** [IPN v2](https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/notification/), [công thức chữ ký v2](https://developers.momo.vn/v3/vi/docs/payment/api/delivery/).
- Nhập Partner Code, Access Key và Secret Key đúng SANDBOX/LIVE; lưu và bật nhận webhook. Khi tích hợp API tạo thanh toán v2, truyền URL vào `ipnUrl`. `redirectUrl` là trang quay về, không xác nhận thanh toán.
- Adapter này hỗ trợ IPN thanh toán v2 có resultCode. Không áp dụng cấu trúc v1 cũ dùng notifyUrl/errorCode.
- HMAC-SHA256, Secret Key, theo thứ tự: accessKey, amount, extraData, message, orderId, orderInfo, orderType, partnerCode, payType, requestId, responseTime, resultCode, transId. Partner Code phải trùng cấu hình.
- ACK: HTTP **204, body rỗng**, chỉ sau commit. Lưu cả kết quả thành công và kết quả khác, không biến resultCode khác 0 thành khoản thu. Chống trùng theo orderId/transId/resultCode để không bỏ lỡ chuyển trạng thái.
- Chưa triển khai API tạo đơn MoMo; Settings cung cấp URL và receiver để bước tích hợp đó dùng đúng ipnUrl.

## ZaloPay

- **Tài liệu:** [Callback, Key 2 và response codes](https://docs.zalopay.vn/docs/developer-tools/knowledge-base/callback/).
- Nhập App ID, Key 1 và Key 2 đúng môi trường; lưu và bật nhận webhook. Đăng ký trên Merchant Portal hoặc truyền URL trong `callback_url` khi tạo đơn. Không dùng redirecturl để xác nhận thu tiền.
- Adapter hiện hỗ trợ callback **type=1 (Order)**. Agreement/QuickPay và các loại khác cần adapter riêng.
- `data` là chuỗi JSON; tính HMAC-SHA256 trực tiếp trên chuỗi đó với **Key 2**, không parse rồi stringify trước khi ký. Kiểm tra app_id trong data.
- ACK thành công: HTTP 200, `return_code=1`, `return_message=success`. MAC sai: return_code=-1. Lỗi lưu tạm thời: return_code=0 để provider gửi lại.
- Chống trùng theo app_trans_id/zp_trans_id trong kết nối. Chưa có API tạo đơn hoặc ghi thu tự động.

## Tingee

- **Tài liệu:** [Payment Callback QR/VA](https://developers.tingee.vn/en/docs/webhook/webhook-payment-callback/), [SDK xác thực](https://developers.tingee.vn/docs/sdk/webhook/), [cấu hình Credentials](https://developers.tingee.vn/en/docs/config-info/).
- Nhập Client ID và Secret Token/Secret Key; lưu và bật nhận webhook. Trong BaaS Portal → Developers/API Credentials → Webhook: dán URL, chọn sự kiện Payment Callback QR/VA, cách chứng thực có chữ ký API Credentials. Endpoint không hỗ trợ chế độ None/API Key không chữ ký.
- HMAC-SHA512: timestamp + dấu `:` + JSON body; header `x-signature`, `x-request-timestamp` theo `yyyyMMddHHmmssSSS` UTC+7. Thực hiện canonicalization JSON.stringify(body) như ví dụ Node chính thức; kiểm tra clientId trong payload. Không dùng x-request-id để chống trùng vì request ID thay đổi khi retry.
- ACK: HTTP 200 với code 00; sự kiện đã lưu trả code 02. MAC sai trả code 09. Chống trùng theo transactionCode/chiều giao dịch. Không áp cửa sổ thời gian tự suy đoán ngoài tài liệu lên timestamp Tingee; retry được chống trùng bằng DB.
- Phải chọn đúng tài khoản gốc hoặc VA theo loại liên kết ngân hàng. Không phải ngân hàng nào cũng gửi biến động khi chuyển vào tài khoản gốc. Adapter không nhận Direct Debit, lifecycle liên kết hoặc loại webhook khác.

## Trạng thái và dữ liệu

- Cờ bật API và cờ nhận webhook độc lập. Webhook không cần API đọc dữ liệu VERIFIED; chỉ cần đủ khóa xác thực webhook và người quản trị chủ động bật.
- Lưu/sửa cấu hình làm tắt cả hai và xóa thời điểm xác thực hiện tại; các sự kiện cũ vẫn giữ để đối soát.
- Inbox lưu raw payload được mã hóa bằng vault hiện có. Client chỉ thấy loại sự kiện, số tiền, thời điểm và trạng thái; không trả raw payload, header xác thực hoặc khóa.
- Khóa DB theo kết nối để tuần tự hóa nhận callback với đổi/tắt cấu hình, unique eventKey để chống retry đồng thời. Nội dung định danh tài chính mâu thuẫn với sự kiện cùng ID bị từ chối.
- ACK chỉ sau commit DB. DB lỗi không giả ACK thành công. Payload giới hạn 128 KiB, body timeout 10 giây, rate limit ingress 300 request/phút/IP, không tự chấp nhận Content-Encoding lạ.
- Chưa có consumer ghi sổ. Một signature hợp lệ không chứng minh đúng hóa đơn, đúng tài khoản nhận, nguồn production hay giao dịch chưa được provider khác báo. Những kiểm tra này phải có trước khi phát triển tự ghi thu.

## Triển khai và kiểm thử

Áp dụng `prisma/sql/payment-webhooks.sql` **một lần sau** integration-hub.sql, sinh lại Prisma Client và restart API để nạp model mới. Database local đã áp dụng hai SQL; local API đã restart và các callback đã được kiểm thử qua HTTP thực trên cổng 5173.

```powershell
pnpm --filter @adhome/landing exec prisma validate
pnpm --filter @adhome/landing exec prisma db execute --file prisma/sql/payment-webhooks.sql --schema prisma/schema.prisma
pnpm --filter @adhome/landing exec prisma generate
pnpm --filter @adhome/console build
node scripts/test-payment-integrations.mjs
node scripts/test-payment-webhooks.mjs
# Optional local HTTP smoke test with an already running API:
$env:ADHOME_WEBHOOK_HTTP_URL='http://127.0.0.1:5173'
node scripts/test-payment-webhooks.mjs
```

Không chạy SQL lại trên local vì đã có bảng/cột. Trên Windows, generate hiện vẫn bị một tiến trình khác giữ DLL engine; file client đã sinh trước bước rename engine và được kiểm thử bằng PostgreSQL/HTTP thật. Không cưỡng ép dừng các tiến trình không thuộc API local. Khi đóng gói môi trường mới cần chạy generate thành công trong môi trường sạch.

Các test chạy bằng khóa fixture, không gọi provider bằng khóa thật và không thay đổi cấu hình production: test vector payOS chính thức, raw bytes SePay, API Key khác API Token, MAC sai, payload sửa, timestamp SePay cũ, tenant identifiers, retry đồng thời, DB lỗi không ACK, đăng ký payOS giả lập, giới hạn body, origin allowlist, không phát sinh phiếu thu. UI desktop/mobile/reduced motion kiểm tra URL riêng, hướng dẫn SePay và công tắc webhook độc lập.
