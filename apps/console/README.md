# AdHome Console Worker

- Worker: `adhome-console`, domain: `console.adhome.vn`.
- Cấu hình riêng: `/wrangler.console.jsonc`.
- Cloudflare Builds: root `/`, build `pnpm run build:console:worker`, deploy `npx wrangler deploy --config wrangler.console.jsonc`.
- Deploy local: `pnpm run deploy:console:worker` sau khi đăng nhập `npx wrangler login`.
- Đặt runtime variable `CONSOLE_API_ORIGIN` thành HTTPS origin của backend Node/PostgreSQL đang chạy, không kèm đường dẫn `/api/v1`. Không trỏ lại domain console hoặc landing Worker.
- Worker chuyển tiếp `/api/v1/console/*`, giữ Authorization, cookie và header CSRF để backend kiểm tra quyền. Cookie backend cần host-only hoặc dùng domain tương thích với `console.adhome.vn`.
- Chưa cấu hình backend: API trả JSON 503, frontend vẫn được phục vụ. Build này không triển khai backend hoặc database.
