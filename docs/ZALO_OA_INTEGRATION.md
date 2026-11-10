# Tích hợp Zalo OA cho cư dân

## Kiểm tra đăng ký ngày 04/11/2026

Kiểm tra tiếp qua SSH Tailscale `tcandt@100.87.155.6`: host key khớp với `server.adhome.vn`, dịch vụ `adhome-zalo-webhook` đang `active`. `https://api.adhome.vn/healthz` và `GET /api/v1/zalo/webhook` đều trả 200. Truy vấn trực tiếp PostgreSQL trên VPS sau tin thử và sau khi bấm **Gửi sự kiện** trong Zalo Developers cho thấy `zalo_webhook_inbox` vẫn có **0** bản ghi. Sự kiện thử của trang Developers dùng recipient ID ví dụ khác OA AdHome nên không thể chứng minh luồng thực. Trang Webhook có URL đúng và `user_send_text` đang bật. Trong Zalo Developers > Official Account > Quản lý OA, App có OA AdHome liên kết nhưng **Danh sách OA đã cấp quyền: 0**; tại Thiết lập chung, Official Account Callback URL còn trống. Chưa có OAuth token, do đó chưa thể gửi phản hồi tự động. Không triển khai hàng đợi local lên VPS cho đến khi hoàn thiện callback, quyền OA và bộ gửi có xác nhận từ Zalo.

Đã gửi từ tài khoản Zalo của chủ tài khoản tin `DANGKY P24.01 0567867889` tới OA **AdHome - Adhomevn**. Cuộc trò chuyện hiển thị tin và trạng thái **Đã nhận**. Chưa có bằng chứng đọc từ PostgreSQL xác nhận webhook đã ghi lần thử này: tài khoản SSH hiện tại không có quyền đọc database, còn `sudo -n` yêu cầu xác thực tương tác. Không được coi trạng thái Zalo **Đã nhận** là xác minh cư dân thành công.

Hồ sơ phòng `P24.01` có hợp đồng `DRAFT`, vì vậy kết quả nghiệp vụ dự kiến là `NO_MATCH` và không tạo liên kết. OA vẫn hiển thị **Bạn chưa cấp quyền cho bất kỳ ứng dụng nào** trong Quản lý liên kết. Do chưa có OA OAuth token và bộ gửi tin, cuộc trò chuyện chưa nhận được phản hồi tự động. Mã local đã thêm `zalo_reply_outbox` để xếp hàng một kết quả cho mỗi sự kiện đăng ký trong cùng giao dịch; thay đổi này **chưa triển khai lên VPS** và không tự gửi tin. Cần cấp quyền OpenAPI cho App, hoàn thiện OAuth/token và bộ gửi, triển khai schema/code, rồi kiểm tra bằng bản ghi DB và tin trả về trước khi công bố tính năng hoạt động.

Trạng thái kiểm tra ngày 04/11/2026: OA **AdHome - Adhomevn** (OA ID `3489044514324126353`) đang hoạt động và đã xác thực. OA đang dùng **Gói OA Cơ bản**; ZBS **NGUYENDUCTINH** (ID `ZBS-321736`) đã liên kết OA ngày 04/11/2026. OA vẫn báo chưa cấp quyền cho ứng dụng nào. Chủ tài khoản đã tạo Zalo App ID `1666153918084949772`; cần cấp quyền cho đúng OA. Thẻ `ZALO_OA` trong Cài đặt AdHome hiện chỉ lưu nhãn và token; chưa có liên kết cư dân, bộ gửi tin hay đối soát trạng thái gửi. Receiver webhook riêng đã triển khai như mô tả bên dưới; chưa được coi là kênh thông báo hoàn chỉnh.

Kiểm tra trực tiếp sau khi tạo App: tên hiển thị là **AdHome** và App đã được chủ tài khoản cho phép kích hoạt ngày 04/11/2026; Zalo xác nhận trạng thái **Đang hoạt động**. Ngày 04/11/2026 đã thêm bản ghi TXT `@` tại Cloudflare cho `adhome.vn` với nội dung `zalo-platform-site-verification=Ej2_DllI5m4afSG5eDH47t3Bo3MSlHDkEJSm`; Zalo báo **Xác thực thành công** và danh sách domain xác thực hiển thị `adhome.vn` (1/20). Đã lưu phạm vi quyền yêu cầu theo mục đích tích hợp: gửi tin qua SĐT, quản lý Message Template, gửi tin nhắn và nhận các nhóm sự kiện webhook tương ứng; đã bỏ quyền mua sản phẩm, quản lý OA/người dùng/nhóm, cửa hàng, bài viết, quảng cáo và gọi thoại. Chủ tài khoản đã cho phép liên kết App với OA; Zalo báo **Liên kết thành công**. Danh sách OA **đã cấp quyền** vẫn là **0**: liên kết và cấp quyền OpenAPI là hai bước khác nhau.

Chủ tài khoản đã hoàn tất tạo và liên kết ZBS. Zalo App đã lưu email, số điện thoại liên hệ do chủ tài khoản chỉ định và domain ứng dụng `adhome.vn`. Webhook đã đăng ký nhưng chưa có callback OAuth và OA chưa cấp quyền OpenAPI. Backend Node/Prisma đầy đủ của AdHome vẫn chỉ chạy local; Cloudflare Workers cho `adhome.vn` và `console.adhome.vn` phục vụ giao diện.

## API công khai và trạng thái triển khai

Ngày 04/11/2026: VPS 101 có IP LAN tĩnh `192.168.1.193`, PostgreSQL 18 (`adhome_prod`) và dịch vụ nhận webhook Node ở loopback `127.0.0.1:8081`. Cloudflare Tunnel `adhome-server-101` đã định tuyến `api.adhome.vn` tới dịch vụ này; `https://api.adhome.vn/healthz` trả HTTP 200 với database hoạt động và khóa webhook đã cấu hình. `server.adhome.vn` đi qua Cloudflare Tunnel tới SSH; trên máy Windows đã cấu hình `ssh server.adhome.vn` với `cloudflared` ProxyCommand và khóa riêng, kiểm thử đăng nhập thành công. SSH trực tiếp TCP tới IP Cloudflare cổng 22 không phải cách kết nối tunnel.

Zalo Developers đã xác thực domain `api.adhome.vn`, lưu webhook URL `https://api.adhome.vn/api/v1/zalo/webhook` và bật riêng sự kiện `user_send_text`. Zalo cảnh báo IP edge Cloudflare được nhận diện tại Mỹ, có thể giới hạn một số trường dữ liệu trả về. Đã kiểm thử cục bộ sự kiện có chữ ký hợp lệ (200), gửi trùng (200, một bản ghi) và chữ ký sai (401); chưa có sự kiện thực từ OA được kiểm chứng. OA Secret Key chỉ nằm trong tệp môi trường mode 600 trên VPS, không lưu trong repo.

Receiver đã xử lý `DANGKY`, có bảng liên kết duy nhất và lịch sử kết quả trên VPS. Ngày 04/11/2026 đã chuyển bản sao 8 bảng nghiệp vụ cần đối chiếu từ PostgreSQL local `adhome_v2` sang `adhome_prod` trên VPS: 2 tổ chức, 11 tòa nhà, 78 phòng, 34 cư dân, 22 phiếu giữ phòng, 15 hợp đồng; 10 hợp đồng đang ở trạng thái hiệu lực. Đã sao lưu database VPS trước khi nhập. Bản sao này **chưa đồng bộ tự động** với local, nên thay đổi phòng, số điện thoại hay hợp đồng sau thời điểm chuyển phải được đồng bộ trước khi dùng xác minh thực tế. **Chưa có** OAuth/refresh token OA, gửi phản hồi hay gửi ZBS. Không coi kênh thông báo đã hoạt động. Backend console hiện có cũng chưa được triển khai tại `api.adhome.vn`; hostname này hiện chỉ phục vụ receiver và health check. OA vẫn cần cấp quyền OpenAPI cho App trước khi gửi tin. Mã và hướng dẫn triển khai ở `apps/zalo-webhook-api/`.

Landing Worker `adhome-platform` đã được cấu hình `PUBLIC_API_ORIGIN=https://api.adhome.vn`; receiver VPS phục vụ `GET /api/v1/public/rooms` từ bản sao PostgreSQL. Kiểm tra qua `https://adhome.vn/api/v1/public/rooms` trả 200, 12 bản ghi công khai, trong đó 9 phòng AVAILABLE. API chỉ chọn các trường public, không chọn tên/SĐT cư dân. Dữ liệu chưa đồng bộ tự động nên không coi danh sách này luôn mới. Hồ sơ có SĐT thử nghiệm `0567867889` đang gắn phòng `P24.01` nhưng hợp đồng ở trạng thái `DRAFT`; luồng `DANGKY` đúng phải trả `NO_MATCH` cho tới khi hợp đồng được kích hoạt. Chưa có lần gửi tin thật từ tài khoản Zalo được xác nhận.

### Kiến trúc dự kiến cho backend đầy đủ

Dùng `api.adhome.vn` cho backend đầy đủ sau khi tách và triển khai an toàn phần Node/Prisma đang gắn vào Vite. Hiện Cloudflare Tunnel tự tạo CNAME cho `api` và chuyển HTTPS edge tới dịch vụ receiver qua loopback HTTP; không mở PostgreSQL hoặc Node ra Internet. `adhome.vn` và `console.adhome.vn` tiếp tục phục vụ giao diện qua Workers. Chỉ cấu hình `PUBLIC_API_ORIGIN` và `CONSOLE_API_ORIGIN` bằng `https://api.adhome.vn` sau khi toàn bộ API mà giao diện cần đã triển khai và kiểm thử.

Webhook `https://api.adhome.vn/api/v1/zalo/webhook` đã tồn tại. OAuth callback `https://api.adhome.vn/api/v1/zalo/oauth/callback` chưa có và chưa được khai báo. Cần triển khai OAuth, lưu token mã hóa, sao lưu PostgreSQL và đối chiếu cư dân trước khi bật luồng xác minh hoặc gửi thông báo.

Trình tự triển khai: (1) cấp VPS và PostgreSQL, tạo DNS/TLS; (2) triển khai backend và migration riêng cho token OAuth, liên kết cư dân có unique constraint theo OA/UID và OA/tenant, webhook inbox chống lặp cùng notification outbox; (3) kiểm tra health/API qua HTTPS và kiểm tra request webhook sai chữ ký bị từ chối, callback sai `state` bị từ chối; (4) cấu hình URL trên Zalo Developers rồi cấp quyền OA; (5) đổi OAuth code lấy token, lưu token mã hóa và xác nhận OA thực sự có quyền OpenAPI; (6) gửi thử bằng mẫu ZBS đã duyệt và kiểm tra phản hồi từ Zalo. Chỉ báo kênh hoạt động sau bước (6).

## Điều kiện mở kết nối

1. Kiểm tra Zalo App ID `1666153918084949772` vừa tạo, cấp quyền OA OpenAPI cho app và liên kết app với OA ID `3489044514324126353`.
2. Kiểm tra gói OA có quyền OpenAPI, tạo/liên kết ZBS Account, chuẩn bị các mẫu ZBS Template Message được duyệt cho từng loại thông báo. Không bật gửi hàng loạt bằng Tin Tư vấn; loại này phụ thuộc tương tác gần đây và không thay thế mẫu giao dịch.
3. Thiết lập webhook HTTPS công khai trên Zalo App, OA Secret Key và OAuth v4. Access token OA có hạn 25 giờ; refresh token phải được xoay sau mỗi lần dùng. Khóa chỉ lưu mã hóa phía server, không đưa vào URL, log hay response.

## Luồng xác minh cư dân

- Khách nhắn tin theo cú pháp `DANGKY <mã phòng> <số điện thoại>` đến OA. Chỉ xử lý sự kiện `user_send_text` có chữ ký `X-ZEvent-Signature` hợp lệ, đúng App ID/OA ID, timestamp còn hiệu lực và `msg_id` chưa xử lý.
- Chuẩn hóa số điện thoại, tìm đúng **một** hợp đồng đang hiệu lực hoặc phiếu giữ phòng hợp lệ khớp mã phòng và số điện thoại. Không trả lời tiết lộ phòng/số điện thoại nào sai. Trường hợp nhiều hồ sơ khớp phải chuyển kiểm tra thủ công.
- Ghi liên kết `(OA ID, Zalo UID) → tenant ID` bằng giao dịch và ràng buộc duy nhất ở cơ sở dữ liệu; đồng thời ràng buộc một tenant không gắn nhiều UID trong cùng OA. Gửi lại cùng cặp chỉ báo “đã xác minh”; UID hoặc tenant đã gắn cặp khác phải từ chối. Không tự chuyển liên kết khi đổi phòng hoặc đổi SĐT; cần quy trình quản trị có nhật ký để gỡ xác minh.
- Chỉ coi xác minh hoàn tất sau khi giao dịch cơ sở dữ liệu thành công. Tin phản hồi qua OA cần được gửi và kiểm tra kết quả API riêng; lỗi gửi không được tạo thành công giả.

## Thông báo

| Nguồn dữ liệu đã xác nhận | Loại thông báo dự kiến | Điều kiện gửi |
|---|---|---|
| Chỉ số điện/nước đã chốt | Số điện, nước và kỳ tính | Có chỉ số thật, đúng phòng/hợp đồng |
| Hóa đơn đã phát hành | Tiền phòng, phí, hạn thanh toán | Hóa đơn không bị hủy |
| Giao dịch đã đối soát | Số tiền đã thanh toán, dư nợ | Chỉ sau phản hồi server và đọc lại trạng thái |
| Hợp đồng/đặt cọc đã lưu | Xác nhận đặt cọc, sắp hết hạn | Hồ sơ hợp lệ và sự kiện được xác nhận |
| Hóa đơn còn dư nợ | Nhắc hẹn thanh toán | Lịch gửi, giới hạn tần suất, dừng khi đã thanh toán |

Mỗi thông báo cần outbox có khóa chống gửi trùng, trạng thái `PENDING/SENT/FAILED`, số lần thử lại và kết quả từ Zalo. Chỉ gửi cho UID đã xác minh, đang gắn với hợp đồng/phiếu giữ phòng tương ứng; kiểm tra lại dữ liệu ngay trước lúc gửi. Mỗi sự kiện phải gắn với template ZBS đã được duyệt và đúng mục đích; không tự ghép văn bản tự do cho tin ngoài cửa sổ Tư vấn.

## Tài liệu chính thức

- [Khởi tạo app và cấp quyền OA](https://oa.zalo.me/home/documents/guides/Khoi-tao-ung-dung-va-cap-quyen_117071366476220195)
- [OAuth v4 và vòng đời token](https://stc-developers.zdn.vn/docs/v2/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new)
- [Webhook tin nhắn và chữ ký](https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan)
- [Các loại tin OA và ZBS](https://oa.zalo.me/home/documents/guides/tong-quan-cac-loai-tin-nhan-tren-zalo-official-account-_3651713298729094511)
