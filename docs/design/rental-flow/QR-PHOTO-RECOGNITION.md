# Nhan dien QR can cuoc tu anh

Cap nhat: 03/11/2026.

## Hanh vi man hinh

1. Tai anh, chup anh hoac mo camera tu icon QR ben canh nguoi can dien.
2. Hien trang thai dang doc; chua thay doi thong tin da nhap.
3. Giai ma va kiem tra dinh dang can cuoc, ngay sinh, gioi tinh va dia chi.
4. Neu hop le: tu dien ho ten, so can cuoc, ngay sinh, gioi tinh, dia chi; giu so dien thoai va quan he; dung camera va dong cua so quet. Khong co buoc xac nhan.
5. Neu khong doc duoc: giu nguyen bieu mau, bao loi va cho chon anh khac. Dong cua so se huy ket qua dang xu ly.

## Cach xu ly anh

- ZXing-C++ qua zxing-wasm 3.1.6, ket hop jsQR 1.4.
- Thu anh toan canh o nhieu kich thuoc; thu cac vung cat chong lan o nhieu ti le.
- Tang tuong phan cuc bo bang nguong sang thich nghi, thu anh dao mau va xoay theo kha nang bo giai ma.
- Chi tu dien khi giai ma duoc du lieu QR hop le. Khong dung OCR, du doan thong tin hoac ma hoa cung noi dung anh.
- Anh va noi dung QR duoc xu ly trong trinh duyet. Khong gui anh den dich vu ngoai, khong luu thong tin can cuoc vao log/bang ket qua kiem thu.

## Ket qua bo 10 anh nguoi dung cung cap

| Anh | Ket qua | Doi chieu so can cuoc va ngay sinh |
|---|---|---|
| 1 | Chua giai ma duoc | Khong tu dien |
| 2 | Doc duoc | Khop |
| 3 | Chua giai ma duoc | Khong tu dien |
| 4 | Doc duoc | Khop |
| 5 | Doc duoc | Khop |
| 6 | Doc duoc | Khop |
| 7 | Chua giai ma duoc | Khong tu dien |
| 8 | Doc duoc | Khop |
| 9 | Doc duoc | Khop |
| 10 | Doc duoc | Khop |

Tong: 7/10 anh, trong do anh 5 va 9 trung noi dung. Anh doc duoc mat khoang 2-15 giay tren Chrome may kiem thu. Dien thoai co the cham hon. Day la ket qua tren bo anh nay, khong phai cam ket ty le nhan dien tren moi anh. Chua xac minh camera Safari/iPhone that.

Da kiem tra tai anh that 2, 6, 8 vao popup o 1440px va 390px: so can cuoc/ngay sinh tu dien dung, khong can xac nhan; giu popup phong. Kiem tra anh tong hop, anh trang, chup anh va camera gia lap deu dat; camera dung sau nhan dien. Typecheck va build Console dat (con canh bao kich thuoc JavaScript lon).

Kiem tra gia lap WASM tra HTML o 1440px/390px dat: bao loi de hieu, giu du lieu dang nhap, thong bao khong tran ngang; tai lai anh thanh cong ngay trong popup, khong reload trang. Ket qua: `.artifacts/rental-workflow/ui/qr-recovery-results.json`.

## Sua loi tai JavaScript thanh HTML

- JavaScript va WASM duoc phuc vu tu ung dung, khong phu thuoc CDN.
- Giu chunk co ten bam cu sau build de tab dang mo van tai duoc bo quet.
- Preview tra 404 cho asset khong ton tai, khong tra HTML cua SPA. HTML dung Cache-Control: no-store; WASM dung application/wasm.
- Loi tai bo quet duoc doi thanh thong bao de hieu; khong tu tai lai trang lam mat du lieu dang nhap. Sau loi WASM, lan thu tiep theo khoi tao lai bo quet voi duong dan cuc bo.
- Neu phuc vu bang web server khac Vite, can giu quy tac asset 404, MIME va cache tuong duong. Khong xoa chunk cu trong khi van con tab dang su dung chung.

## Tai hien kiem tra

- `node scripts/test-identity-qr.mjs`: dinh dang, chu Viet, so 0 dau, ngay khong hop le, QR khong phai can cuoc.
- `node scripts/test-console-assets.mjs`: HTML no-store, JavaScript hien tai/cu, WASM, asset khong ton tai. Dat `ADHOME_UI_URL` neu doi cong.
- `node scripts/test-identity-photos.mjs`: dat `ADHOME_IDENTITY_PHOTOS` toi thu muc anh goc; tuy chon `ADHOME_QR_EXPECTED` la JSON theo so anh de doi chieu thong tin. Script chi luu ket qua boolean va thoi gian tai `.artifacts/rental-workflow/qr/real-photo-results.json`.
- `node scripts/test-rental-ui.mjs`: dat `ADHOME_QR_FIXTURE=1` de kiem tra tai anh, chup anh, camera gia lap, tu dien, dung camera, desktop/mobile va reduced motion. Dat `ADHOME_QR_ASSET_FAILURE=1` de kiem tra loi tai WASM va thu lai khong reload.
- `ADHOME_PLAYWRIGHT_MODULE` cho phep tro den Playwright co san tren may. Anh kiem thu tong hop tao boi `scripts/create-identity-qr-fixture.py`.

## Tep trien khai

- `apps/console/src/shared/ui/decodeIdentityQr.ts`
- `apps/console/src/shared/ui/identityQr.ts`
- `apps/console/src/shared/ui/IdentityQrScanner.tsx`
- `apps/console/src/shared/vendor/zxing-wasm/`
- `apps/console/vite.config.ts`
