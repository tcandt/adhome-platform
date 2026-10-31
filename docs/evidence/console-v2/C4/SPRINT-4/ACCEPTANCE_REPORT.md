# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU C4 SPRINT 4
## C4-HUN-01, C4-HUN-02, C4-WAT-01, C4-CLOSE-01 (E2E-17 / E2E-18 / E2E-19 / E2E-20)

**Trạng thái nghiệm thu:** **`LOCAL_GATE_PASSED`**  
**Thời điểm tạo:** 2026-10-31T16:32:37.427Z  
**Mã commit cơ sở:** `02622e02802b074609ccedd1652b6f917a5759c3`  
**Môi trường:** Native Windows 11, PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`), Strict NO Docker  

---

### 1. BẢNG TỔNG HỢP KIỂM THỬ BACKEND (100% PASS)

| Hạng mục mã | Phân hệ nghiệp vụ | Kiểm thử con | Kết quả | Ghi chú kỹ thuật |
| :--- | :--- | :---: | :---: | :--- |
| **C4-HUN-01** | Tiến trình đồng bộ công tơ Hunonic nền | 3/3 | **PASS** | Worker chạy bất đồng bộ qua IntegrationSyncJob, offline/stale meters kích hoạt trạng thái EXCEPTION và ghi nhận exceptionCount. Cơ chế retry xử lý lỗi mạng tạm thời. |
| **C4-HUN-02** | Quản lý phiên bản biểu giá & Quy tắc Zero Retroactive | 3/3 | **PASS** | Cập nhật biểu giá Hunonic, ghi nhận ConsoleAuditLog (`UPDATE_HUNONIC_TARIFF`). Cam kết bất biến: Hóa đơn các kỳ trước giữ nguyên vẹn `policySnapshot` và số tiền. |
| **C4-WAT-01** | Tính toán tiền nước 3 phương thức | 3/3 | **PASS** | Hỗ trợ `PER_PERSON` (khớp với Occupancy source of truth), `PER_M3` (theo chỉ số đồng hồ), và `FIXED_ROOM` (khoán phòng). |
| **C4-CLOSE-01** | Khóa sổ kỳ quyết toán & Đóng băng hóa đơn | 4/4 | **PASS** | Khóa sổ kỳ (`LOCKED`), đóng băng toàn bộ hóa đơn với `policySnapshot` bất biến (`immutable: true`). Chặn đứng mọi hành vi ghi đè chỉ số thủ công hoặc thay công tơ trên kỳ đã khóa. |

---

### 2. BỘ CHỨNG CỨ HÌNH ẢNH CHROMIUM CDP (100% DISTINCT HASHES)

| STT | Tên file ảnh | Kích thước | Độ phân giải | SHA-256 Checksum | Mô tả kịch bản kiểm chứng |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | `c4_s4_desktop_hunonic_sync_jobs_running.png` | 485.0 KB | 1440x900 | `310a1fc063811371...` | Tiến trình đồng bộ công tơ điện Hunonic nền, nhật ký tác vụ bất đồng bộ, cảnh báo Offline/Stale và nút kích hoạt job |
| 2 | `c4_s4_desktop_hunonic_tariff_versioning.png` | 541.1 KB | 1440x900 | `f23ecc56c2c88dbf...` | Cấu hình biểu giá Hunonic, xác minh cloud, cam kết quy tắc bất biến không tính lại hóa đơn kỳ đã khóa sổ |
| 3 | `c4_s4_desktop_water_settlement_per_person.png` | 428.6 KB | 1440x900 | `bec41bef3e339613...` | Tính tiền nước theo đầu người khớp với số lượng khách cư trú thực tế (Occupancy Truth 3 người x 100.000 đ = 300.000 đ) |
| 4 | `c4_s4_desktop_water_settlement_per_m3.png` | 426.1 KB | 1440x900 | `dded9d98ab9060bc...` | Tính tiền nước theo chỉ số đồng hồ thực tế (18 m³ -> 30 m³, tiêu thụ 12 m³ x 25.000 đ = 300.000 đ) |
| 5 | `c4_s4_desktop_settlements_month_close_locked.png` | 486.7 KB | 1440x900 | `e41849fdd4c9076f...` | Kỳ quyết toán tòa nhà S4B đã khóa sổ (LOCKED), toàn bộ hóa đơn đóng băng immutable, nút can thiệp bị vô hiệu hóa |
| 6 | `c4_s4_mobile_settlements_locked_view.png` | 193.5 KB | 390x844 | `5f38b7810e61d564...` | Giao diện mobile hiển thị trạng thái khóa sổ kỳ quyết toán và các thẻ tính toán tiền điện nước gọn gàng không tràn viền |

---

### 3. ĐỐI CHIẾU TIÊU CHUẨN QUALITY GATE (RULE-EVIDENCE-01 ĐẾN 10)

- [x] **RULE-EVIDENCE-01:** Chạy trên môi trường native Windows 11 với PostgreSQL 18 local, tuân thủ nghiêm ngặt NO Docker.
- [x] **RULE-EVIDENCE-02:** Landing RC1 được bảo toàn nguyên vẹn trong suốt quá trình triển khai.
- [x] **RULE-EVIDENCE-03:** Bộ kiểm thử tự động đạt 100% PASS ở tất cả các sub-checks của 4 hạng mục C4-HUN-01, C4-HUN-02, C4-WAT-01, C4-CLOSE-01.
- [x] **RULE-EVIDENCE-04:** Chụp đủ 6 ảnh màn hình qua Chromium CDP với kích thước đều > 25 KB.
- [x] **RULE-EVIDENCE-05:** 100% ảnh có mã băm SHA-256 duy nhất, không có hiện tượng trùng lặp (Zero Collision).
- [x] **RULE-EVIDENCE-06:** Toàn bộ bằng chứng được xuất đầy đủ ra thư mục `docs/evidence/console-v2/C4/SPRINT-4/` và thư mục Artifact.
