# Console reload khi quay lại từ ứng dụng khác

## Nguyên nhân đã tái hiện trên local

Console trước đây được mở bằng Vite dev server trên cổng 5174. HTML nhúng `/@vite/client`, tạo WebSocket `vite-hmr`. Trong phiên bản Vite đang cài, nhánh `vite:ws:disconnect` chờ ping thành công rồi gọi `location.reload()`. Nhánh này độc lập với kiểm tra phiên đăng nhập của Console.

Kiểm thử trên server cũ: nhập email chưa lưu, chuyển trạng thái tài liệu sang hidden và đóng WebSocket `vite-hmr`. Console phát sinh **2 navigation request**, `performance.timeOrigin` đổi và email bị xóa. Console log có `[vite] server connection lost. Polling for restart...`.

Đây là bằng chứng cho môi trường local; chưa có log từ điện thoại thật để khẳng định mọi trường hợp trên mọi URL đều có cùng nguyên nhân.

## Thay đổi

- `pnpm dev:console` và `pnpm dev:console:host` kiểm tra TypeScript, build rồi phục vụ bản build trên cùng cổng 5174, không nhúng client HMR.
- `pnpm dev:console:hot` giữ chế độ phát triển có hot reload khi cần sửa code.
- Launcher không âm thầm dùng lại server đang chạy sai chế độ. Sau khi sửa code cần khởi động lại lệnh stable để build bản mới.
- Kiểm tra phiên khi resume vẫn hoạt động; hết hạn phiên hiện trang đăng nhập bằng React/history, không tải lại tài liệu.

Khi chuyển từ server dev cũ sang stable, tải lại tab một lần để bỏ client HMR đã nạp trong bộ nhớ. Đây là bước chuyển phiên bản, không phải thao tác cần làm sau mỗi lần chuyển ứng dụng.

## Kiểm thử

- `node --test apps/console/scripts/testSessionResume.mjs`: 4 kiểm thử phiên đăng nhập.
- `pnpm --filter @adhome/console build`: TypeScript và production build thành công.
- `apps/console/scripts/testBrowserResume.mjs`: Chromium và WebKit ở viewport mobile 390×844, API mock (không ghi dữ liệu thật). Mỗi engine giữ form thêm tòa nhà qua 16 giây background và offline/online; lỗi mạng khi resume không xóa form; HTTP 401 hiện login ngay trong tài liệu hiện tại. Cả hai engine chỉ có **1 navigation request** và **1 bootstrap**; không có lỗi JavaScript.
- Đã chuyển server local thật ở cổng 5174 sang stable và chạy lại cùng kịch bản tái hiện ban đầu: **0 WebSocket**, **1 navigation request**, `performance.timeOrigin` không đổi, email chưa lưu còn nguyên. HTML trả 200 không chứa `/@vite/client`; API xác thực qua proxy vẫn trả JSON 401 đúng khi chưa đăng nhập. Launcher nhận diện và dùng lại đúng server stable.

Chạy kiểm thử trình duyệt khi Console stable đang hoạt động, với `playwright` có sẵn trong môi trường. Có thể chỉ định URL module dùng chung bằng `ADHOME_PLAYWRIGHT_MODULE`, URL server bằng `ADHOME_CONSOLE_TEST_URL`, và thời gian background bằng `ADHOME_BACKGROUND_TEST_MS` (mặc định 16000 ms).

Kiểm thử mô phỏng trạng thái background/mất mạng và sử dụng engine WebKit; chưa thay thế xác nhận chuyển ứng dụng trên iPhone thật. Nếu hệ điều hành loại bỏ tiến trình tab khỏi bộ nhớ, website không thể ngăn trình duyệt tạo tài liệu mới; chưa có bằng chứng tình huống đó trong lỗi local đã tái hiện ở trên.
