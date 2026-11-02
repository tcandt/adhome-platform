# Phát triển AdHome trên local

Yêu cầu: Node.js 24, dependencies đã cài, PostgreSQL đang chạy.

Từ thư mục gốc repo:

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
