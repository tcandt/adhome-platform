# Phát triển AdHome trên local

Yêu cầu: Node.js 24, dependencies đã cài, PostgreSQL đang chạy.

Từ thư mục gốc repo:

Để mở Console trên máy tính hoặc điện thoại qua LAN/Tailscale:

```powershell
pnpm run dev:console
```

Lệnh này tự khởi động backend ở `127.0.0.1:5173` nếu chưa chạy, đợi API xác thực sẵn sàng, build Console rồi phục vụ bản build ở `0.0.0.0:5174`. Console không nhúng Vite HMR: mất WebSocket khi chuyển qua ứng dụng khác không còn kích hoạt `location.reload()`. Phiên hết hạn vẫn đưa về màn hình đăng nhập trong ứng dụng.

Sau khi sửa mã nguồn, dừng và chạy lại lệnh để build bản mới. Nếu server cùng chế độ đã chạy, lệnh dùng lại server đó; nếu cổng 5174 đang chạy chế độ khác, lệnh yêu cầu dừng Console cũ để tránh vô tình tiếp tục dùng bản có hot reload. Khi chuyển từ server dev cũ, tải lại tab một lần để bỏ client HMR đã nạp trước đó.

Khi muốn thấy thay đổi giao diện ngay sau khi lưu mã, chạy `pnpm dev:console:hot` và mở `http://<IP-máy-tính>:5175` trên điện thoại (ví dụ `http://192.168.1.163:5175`). Chế độ này chạy song song với bản ổn định ở cổng 5174, không cần build lại sau mỗi lần sửa. React Fast Refresh thường cập nhật component mà không tải lại trang và giữ trạng thái đang nhập. Thay đổi cấu hình, module không hỗ trợ HMR, hoặc điện thoại ngắt kết nối Vite khi ở nền vẫn có thể khiến trang tải lại; dùng cổng 5174 để kiểm tra khả năng tiếp tục công việc trên mobile.

Ctrl+C chỉ dừng các server được khởi động bởi lệnh này. Lệnh không đổi mật khẩu hoặc reset dữ liệu. Khi đặt `ADHOME_API_TARGET`, lệnh kiểm tra backend đã chỉ định thay vì tự mở backend local. Server preview này chỉ phục vụ phát triển/kiểm tra local; triển khai public vẫn dùng Console Worker.

Để chạy cả Landing và Console chỉ trên loopback:

```powershell
npm run dev:local
```

- Landing và backend API: http://127.0.0.1:5173
- Console: http://127.0.0.1:5174
- Console chuyển tiếp `/api` tới backend ở cổng 5173.
- Hai server chỉ lắng nghe loopback. Nhấn Ctrl+C để dừng cả hai.
- Nếu cổng 5173/5174 đã có server chạy, launcher báo cổng đang dùng và không khởi động thêm tiến trình. Dùng server hiện có hoặc dừng chúng trước khi chạy lại.
- Launcher local tắt `TRUST_PROXY`, không ảnh hưởng cấu hình production.

Backend đọc `apps/landing/.env`. File này được Git bỏ qua; không commit mật khẩu hay JWT secret. Xem `.env.example` để biết các biến cơ bản. Database local hiện dùng `adhome_v2` trên cổng 5432; không chạy reset hoặc seed lại để giữ dữ liệu hiện có.

Tài khoản phát triển: `admin@adhome.vn`, dùng mật khẩu đã thống nhất riêng. Backend lưu mật khẩu bằng scrypt, không nhúng vào frontend.

Khi cần đổi mật khẩu admin local:

```powershell
$env:ADHOME_ADMIN_NEW_PASSWORD = Read-Host 'Mat khau moi' -MaskInput
node apps/landing/scripts/provisionProductionAdmin.mjs --set-password-from-env
Remove-Item Env:ADHOME_ADMIN_NEW_PASSWORD
```

Worker public hiện độc lập với môi trường local. Khi chuyển lên VPS, triển khai backend và database, cấu hình HTTPS `api.adhome.vn`, rồi đặt `CONSOLE_API_ORIGIN` cho Console Worker. Không đưa database local lên Internet.

## Kiểm tra Hunonic và mã phòng

Chạy `node scripts/test-hunonic-integration.mjs` từ thư mục gốc để kiểm tra luồng đăng nhập v2, mã hóa tài khoản và tạo/sửa mã phòng có dấu `.` hoặc `-`. Kiểm tra dùng API/Prisma giả lập, không truy cập tài khoản Hunonic hay dữ liệu thật.

Trong popup Hunonic, bật tích hợp, nhập số điện thoại/email và mật khẩu, rồi chọn **Lưu & kết nối**. Tài khoản chỉ được lưu sau khi Hunonic xác thực thành công. Máy chủ cần `ADHOME_CREDENTIALS_ENCRYPTION_KEY` (tối thiểu 32 ký tự, giữ ổn định qua các lần khởi động). Mật khẩu đã lưu có thể để trống khi kiểm tra lại cùng tài khoản. Tab **Công tơ → Làm mới** tải thiết bị thực từ Hunonic; các mã `MOCK-` cũ được đánh dấu dữ liệu thử nghiệm.

Luồng đăng nhập tham chiếu: https://github.com/tcandt/api-hunonic (API v2, FormData, MD5 theo giao thức nhà cung cấp và chữ ký Hunonic). Mật khẩu trong kho máy chủ được mã hóa AES-256-GCM; MD5 chỉ dùng khi gửi theo giao thức Hunonic.

Hunonic chỉ hiển thị và đồng bộ các trường thực do provider cung cấp. `power_of_month` là sản lượng tháng, tách riêng khỏi chỉ số tích lũy và không được ghi thành chỉ số dùng tính điện. Tên, `root_id` (mã gán) và ID số Hunonic được giữ riêng trong snapshot đã xác minh theo từng tài khoản; trường thiếu giữ `null`. Job nền trả mã tác vụ, giao diện theo dõi đến trạng thái kết thúc mới báo kết quả và nạp lại danh sách. Dữ liệu thử nghiệm/ánh xạ không còn trong catalog thật được tách khỏi danh sách công tơ có thể gán.

Hunonic history: first import starts at the real provider `timecreate`; later imports reconcile the last 30 days. `/atmwifi/getDataGraph` is requested in windows of at most 30 days because larger ranges are downsampled by the provider. Daily kWh, secondary kWh and solar kWh are stored independently of cumulative billing readings, keyed by account + root ID + date, with atomic file replacement. Failed device history imports retain old values and mark the job partial. Mock/DEV assignment keys are excluded from the catalog. Assignments require explicit Save; the room editor reads the refreshed portfolio without resetting unsaved form fields. Bulk tariffs verify each selected provider device separately and report partial failure.

Hunonic connectivity correction: REST device `state=1` means online and `state=2` means offline. Read this separately from relay `value.turn` and generic `status`. Explicit cloud connectivity takes priority over the age of a measurement; an old reading does not turn an online device offline. Unknown state stays unverified. Both inventory cards and room status use the normalized cloud result refreshed on sync/reload.

Tariff verification uses form-encoded Hunonic v2 requests and accepts the real array/object rate response shapes. Success requires a positive write acknowledgment, a read-back of the device's `data_extra.electricity_group_id`, and a matching saved custom price (or provider EVN tiers). The presence of a rate group alone is insufficient. The UI waits for provider verification and portfolio refresh before showing success; verified custom rates override inherited rates for Hunonic rooms in the portfolio DTO.

Local API middleware is imported by Vite configuration and can remain stale while the Console preview serves fresh assets. The landing API plugin now watches server source files and restarts the configuration bundle. If an already-running instance predates this watcher, restart that API instance once; restarting/reusing only Console does not refresh the backend. The tariff UI uses Animate UI Progress based on completed device requests, with compact expandable error reasons.
