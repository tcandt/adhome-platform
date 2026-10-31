# ADHOME CONSOLE V2 — BÁO CÁO NGHIỆM THU REMEDIATION
## Task: C3.2-VISUAL-EVIDENCE-REMEDIATION (Quality Gate Enforcement)

---

### A. Thông tin kiểm thử & Phiên bản
- **Mã công việc (Task ID):** `C3.2-VISUAL-EVIDENCE-REMEDIATION`
- **Tên công việc:** Sửa lỗi giao diện UI/UX và tái tạo bộ bằng chứng trực quan thực tế (RULE-EVIDENCE-01 đến 10)
- **Cột mốc (Milestone):** AdHome Console V2 — C3.2 SaaS & Hunonic Hardening
- **Ngày hoàn thành:** 2026-10-31T10:22:18.184Z
- **Mã Commit Git:** `4e9c31f62b7f21c27720c670dcd568e1a4143551`
- **Nhánh Git (Branch):** `main`
- **Môi trường kiểm thử:** Native Windows 11 · PostgreSQL 18 Local (`127.0.0.1:5432/adhome_v2`) · Headless Chromium CDP (1440×900 & 390×844)
- **Trạng thái nghiệm thu:** **`LOCAL_GATE_PASSED`** / **`VISUAL_VERIFIED`**

---

### B. Những thay đổi đã thực hiện

1. **Card hợp đồng trên Mobile (UI-01):**
   - Di chuyển menu ba chấm `ActionMenu` lên góc phải header của card thay vì đặt hàng loạt nút bấm bị ngắt chữ ở đáy card.
   - Định dạng giá trị tiền thuê hàng tháng thành một dòng duy nhất với `whitespace-nowrap tabular-nums`, triệt tiêu hoàn toàn lỗi rớt dòng `4.000.000 đ`.
   - Với hợp đồng `DRAFT`, cung cấp nút bấm chạm toàn chiều rộng `Bàn giao phòng`, tiện dụng trên thiết bị di động.

2. **Bảng hợp đồng trên Desktop (UI-02):**
   - Loại bỏ hoàn toàn các nút bấm thao tác trực tiếp inline (`Gia hạn`, `Đổi phòng`, `Thanh lý`) gây rối mắt trên từng dòng.
   - Chuẩn hóa toàn bộ hành động nghiệp vụ vào duy nhất menu ba chấm `ActionMenu`.

3. **Thành phần MoneyInput trong Wizard hợp đồng (UI-03):**
   - Tích hợp thành phần `MoneyInput` chuẩn hóa cho các trường: Tiền giữ phòng, Tiền thuê hàng tháng, Tiền cọc hợp đồng yêu cầu.
   - Hiển thị dấu phân cách hàng nghìn trực quan (`5.000.000 đ`) thay vì số thô `5000000`.

4. **Trực quan hóa cấu hình tiền điện & Hunonic (HUN-01 & HUN-02):**
   - Chế độ `HUNONIC_AUTO`: Tự động ẩn input đơn giá tại phòng, hiển thị thông tin công tơ gán và nút liên kết mở bảng cấu hình Hunonic.
   - Chế độ `MANUAL`: Hiển thị trường nhập đơn giá thủ công chuẩn VND/kWh.
   - Bổ sung chụp toàn diện **đủ 5 tab** của popup Hunonic Settings: (1) Kết nối API & Crypto Vault, (2) Quản lý công tơ, (3) Biểu giá điện EVN bậc thang, (4) Lịch đồng bộ, (5) Nhật ký & Chuẩn đoán.

5. **Trực quan hóa 3 phương pháp tính tiền nước (WAT-01):**
   - Chế độ `PER_PERSON`: Hiển thị đơn vị `VND/người/tháng` và nhân theo số khách lưu trú hợp lệ.
   - Chế độ `PER_M3`: Hiển thị thông báo cấu hình giá chung toàn tòa nhà.
   - Chế độ `FIXED_PER_ROOM`: Hiển thị đơn vị `VND/phòng/tháng`.

6. **Tính toàn vẹn bằng chứng (RULE-EVIDENCE-05):**
   - Toàn bộ ảnh được chụp từ Chromium CDP thật, sinh ra tệp PNG thực tế trên ổ đĩa.
   - Tính toán mã SHA-256 trực tiếp từ raw bytes của tệp, đảm bảo 100% khớp nối giữa `screenshots-manifest.json`, `test-results.json` và báo cáo Markdown.

---

### C. Kết quả kiểm thử nghiệp vụ (Backend & Integration)

| Mã kiểm thử | Tiêu chí kỳ vọng | Kết quả thực tế | Đánh giá |
| :--- | :--- | :--- | :---: |
| **TEST-AUTH-01** | Xác thực tài khoản Admin & cấp phát token | HTTP 200, JWT token hợp lệ | **PASS** |
| **TEST-CSRF-02** | Bắt buộc header `X-Requested-With` cho các mutation | Chặn 403 khi thiếu CSRF header | **PASS** |
| **TEST-WAT-01** | Tính tiền nước phương pháp `PER_PERSON` | 2 người × 100.000đ = 200.000đ | **PASS** |
| **TEST-WAT-02** | Tính tiền nước phương pháp `PER_M3` | 20m³ × 25.000đ = 500.000đ | **PASS** |
| **TEST-WAT-03** | Tính tiền nước phương pháp `FIXED_PER_ROOM` | Cố định 150.000đ/phòng | **PASS** |
| **TEST-HUN-01** | Tải snapshot công tơ Hunonic qua adapter | HTTP 200, trả về danh sách công tơ | **PASS** |
| **TEST-HUN-02** | Kích hoạt tác vụ đồng bộ nền qua API | HTTP 202, tạo sync job thành công | **PASS** |
| **TEST-EVID-03** | 100% mã SHA-256 của ảnh chụp là duy nhất | 15/15 mã băm phân biệt | **PASS** |

---

### D. Danh mục bằng chứng trực quan (Visual Evidence Matrix)

| STT | Tên tệp ảnh | Viewport | Dung lượng | SHA-256 Checksum | Kịch bản kiểm thử |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | `desktop_contracts_table_clean_actions.png` | 1440x900 | 251.524 B | `d05bcebc1d8485fa...` | Bảng hợp đồng đã chuẩn hóa, loại bỏ nút dư thừa, chỉ dùng menu 3 chấm |
| 2 | `desktop_contracts_table_menu_open.png` | 1440x900 | 269.635 B | `df3bd0e741d943aa...` | Menu 3 chấm được mở ra hiển thị Gia hạn, Đổi phòng, Thanh lý, Bàn giao |
| 3 | `mobile_contracts_cards_clean.png` | 390x844 | 145.300 B | `3d5b36f04628eb7d...` | Card hợp đồng Mobile căn chỉnh chuẩn, số tiền không bị xuống dòng, không ngắt chữ |
| 4 | `desktop_wizard_step3_money_input.png` | 1440x900 | 412.538 B | `c03dad9b5059609f...` | Các trường số tiền trong Wizard hiển thị định dạng chuẩn VND với MoneyInput (5.000.000 đ) |
| 5 | `desktop_room_modal_electric_hunonic_auto.png` | 1440x900 | 653.201 B | `a459c597add4d3db...` | Chế độ HUNONIC_AUTO tự động ẩn trường nhập đơn giá thủ công và hiển thị mapping công tơ |
| 6 | `desktop_room_modal_electric_manual.png` | 1440x900 | 646.721 B | `286c6f7656bb3c10...` | Chế độ MANUAL hiển thị trường nhập đơn giá điện thủ công định dạng chuẩn VND/kWh |
| 7 | `desktop_room_modal_water_per_person.png` | 1440x900 | 647.122 B | `10b95bcbad534959...` | Phương pháp PER_PERSON hiển thị đơn vị VND/người/tháng với MoneyInput |
| 8 | `desktop_room_modal_water_per_m3.png` | 1440x900 | 644.430 B | `cd87581f66515766...` | Phương pháp PER_M3 hiển thị ghi chú cấu hình biểu giá chung trong cài đặt tòa nhà |
| 9 | `desktop_room_modal_water_fixed_per_room.png` | 1440x900 | 646.999 B | `4ad5a8c50f12f485...` | Phương pháp FIXED_PER_ROOM hiển thị đơn vị VND/phòng/tháng |
| 10 | `desktop_hunonic_tab1_api_connection.png` | 1440x900 | 546.795 B | `5aee0b284609bbd1...` | Cấu hình kết nối API Hunonic Cloud, trạng thái Crypto Vault và kiểm tra kết nối |
| 11 | `desktop_hunonic_tab2_meter_mapping.png` | 1440x900 | 551.108 B | `1301945818656b5c...` | Danh sách công tơ thông minh, địa chỉ MAC, mapping phòng và trạng thái online |
| 12 | `desktop_hunonic_tab3_tariffs.png` | 1440x900 | 518.960 B | `94db4fd31061beb6...` | Cấu hình biểu giá điện: Biểu giá EVN bậc thang vs Đơn giá cố định có MoneyInput |
| 13 | `desktop_hunonic_tab4_sync_schedule.png` | 1440x900 | 556.831 B | `7e7cec91867294ea...` | Cấu hình chu kỳ đồng bộ tự động và nút kích hoạt đồng bộ nền tức thời |
| 14 | `desktop_hunonic_tab5_diagnostics.png` | 1440x900 | 586.833 B | `c7f0a72ecdc49325...` | Nhật ký đồng bộ, lịch sử snapshot, trạng thái payload và chuẩn đoán lỗi |
| 15 | `desktop_settlements_workspace_hunonic_sync.png` | 1440x900 | 430.271 B | `eca421fd7490743c...` | Màn hình Tổng hợp dịch vụ điện nước tự động, nút đồng bộ nền và bản chụp snapshot |

---

### Chi tiết các ảnh chụp bằng chứng (Chromium CDP)

### Evidence 1: Desktop Contracts Workspace (`1440x900`)
- **Tập tin:** `screenshots/desktop_contracts_table_clean_actions.png`
- **Mã SHA-256:** `d05bcebc1d8485fae99f5b51097c8c52baf7ad15aecb65b58f58c5d3d88d87ed`
- **Dung lượng:** 251.524 bytes
- **Mô tả nghiệp vụ:** Bảng hợp đồng đã chuẩn hóa, loại bỏ nút dư thừa, chỉ dùng menu 3 chấm

![Desktop Contracts Workspace](screenshots/desktop_contracts_table_clean_actions.png)

---

### Evidence 2: Desktop Contracts Table with Action Menu Open (`1440x900`)
- **Tập tin:** `screenshots/desktop_contracts_table_menu_open.png`
- **Mã SHA-256:** `df3bd0e741d943aa862ad60a3635117fcc5b8867e8b149566a621f36aad36ee8`
- **Dung lượng:** 269.635 bytes
- **Mô tả nghiệp vụ:** Menu 3 chấm được mở ra hiển thị Gia hạn, Đổi phòng, Thanh lý, Bàn giao

![Desktop Contracts Table with Action Menu Open](screenshots/desktop_contracts_table_menu_open.png)

---

### Evidence 3: Mobile Contracts Cards View (`390x844`)
- **Tập tin:** `screenshots/mobile_contracts_cards_clean.png`
- **Mã SHA-256:** `3d5b36f04628eb7d678d42068f9207007fc489f02a0cd02906582a9cb697e864`
- **Dung lượng:** 145.300 bytes
- **Mô tả nghiệp vụ:** Card hợp đồng Mobile căn chỉnh chuẩn, số tiền không bị xuống dòng, không ngắt chữ

![Mobile Contracts Cards View](screenshots/mobile_contracts_cards_clean.png)

---

### Evidence 4: Contract Creation Wizard Step 4 (`1440x900`)
- **Tập tin:** `screenshots/desktop_wizard_step3_money_input.png`
- **Mã SHA-256:** `c03dad9b5059609f19473300f62dea863cdab7799802f63d442268d19fe5235a`
- **Dung lượng:** 412.538 bytes
- **Mô tả nghiệp vụ:** Các trường số tiền trong Wizard hiển thị định dạng chuẩn VND với MoneyInput (5.000.000 đ)

![Contract Creation Wizard Step 4](screenshots/desktop_wizard_step3_money_input.png)

---

### Evidence 5: Room Settings - Electric HUNONIC_AUTO (`1440x900`)
- **Tập tin:** `screenshots/desktop_room_modal_electric_hunonic_auto.png`
- **Mã SHA-256:** `a459c597add4d3db85eab3694e37eb2ffc3f4278d42d07243eb1bf4916483522`
- **Dung lượng:** 653.201 bytes
- **Mô tả nghiệp vụ:** Chế độ HUNONIC_AUTO tự động ẩn trường nhập đơn giá thủ công và hiển thị mapping công tơ

![Room Settings - Electric HUNONIC_AUTO](screenshots/desktop_room_modal_electric_hunonic_auto.png)

---

### Evidence 6: Room Settings - Electric MANUAL (`1440x900`)
- **Tập tin:** `screenshots/desktop_room_modal_electric_manual.png`
- **Mã SHA-256:** `286c6f7656bb3c1054e07d94165263fd9db3c6a73e55e58d825eba8e3a0f5aa8`
- **Dung lượng:** 646.721 bytes
- **Mô tả nghiệp vụ:** Chế độ MANUAL hiển thị trường nhập đơn giá điện thủ công định dạng chuẩn VND/kWh

![Room Settings - Electric MANUAL](screenshots/desktop_room_modal_electric_manual.png)

---

### Evidence 7: Room Settings - Water PER_PERSON (`1440x900`)
- **Tập tin:** `screenshots/desktop_room_modal_water_per_person.png`
- **Mã SHA-256:** `10b95bcbad534959cc635ff1697e5cbe4b32e22cc26a320882de0b9c67f73a22`
- **Dung lượng:** 647.122 bytes
- **Mô tả nghiệp vụ:** Phương pháp PER_PERSON hiển thị đơn vị VND/người/tháng với MoneyInput

![Room Settings - Water PER_PERSON](screenshots/desktop_room_modal_water_per_person.png)

---

### Evidence 8: Room Settings - Water PER_M3 (`1440x900`)
- **Tập tin:** `screenshots/desktop_room_modal_water_per_m3.png`
- **Mã SHA-256:** `cd87581f66515766f31ff2eddda269c9b0fe276fe6cf8f650127560e09b8a98a`
- **Dung lượng:** 644.430 bytes
- **Mô tả nghiệp vụ:** Phương pháp PER_M3 hiển thị ghi chú cấu hình biểu giá chung trong cài đặt tòa nhà

![Room Settings - Water PER_M3](screenshots/desktop_room_modal_water_per_m3.png)

---

### Evidence 9: Room Settings - Water FIXED_PER_ROOM (`1440x900`)
- **Tập tin:** `screenshots/desktop_room_modal_water_fixed_per_room.png`
- **Mã SHA-256:** `4ad5a8c50f12f48516cfd8ed9c7fd3324ad7b397882031cd1a80b65776ed66cb`
- **Dung lượng:** 646.999 bytes
- **Mô tả nghiệp vụ:** Phương pháp FIXED_PER_ROOM hiển thị đơn vị VND/phòng/tháng

![Room Settings - Water FIXED_PER_ROOM](screenshots/desktop_room_modal_water_fixed_per_room.png)

---

### Evidence 10: Hunonic Modal - Tab 1 API Connection (`1440x900`)
- **Tập tin:** `screenshots/desktop_hunonic_tab1_api_connection.png`
- **Mã SHA-256:** `5aee0b284609bbd1e8ee8e8d88a51793d1164deb34c67ca22fec88d6d2a152b3`
- **Dung lượng:** 546.795 bytes
- **Mô tả nghiệp vụ:** Cấu hình kết nối API Hunonic Cloud, trạng thái Crypto Vault và kiểm tra kết nối

![Hunonic Modal - Tab 1 API Connection](screenshots/desktop_hunonic_tab1_api_connection.png)

---

### Evidence 11: Hunonic Modal - Tab 2 Meter Mapping (`1440x900`)
- **Tập tin:** `screenshots/desktop_hunonic_tab2_meter_mapping.png`
- **Mã SHA-256:** `1301945818656b5cffa1e0e8af3883f55b43fe031e9ccc2ac2a6ea3b485a1868`
- **Dung lượng:** 551.108 bytes
- **Mô tả nghiệp vụ:** Danh sách công tơ thông minh, địa chỉ MAC, mapping phòng và trạng thái online

![Hunonic Modal - Tab 2 Meter Mapping](screenshots/desktop_hunonic_tab2_meter_mapping.png)

---

### Evidence 12: Hunonic Modal - Tab 3 Electricity Tariffs (`1440x900`)
- **Tập tin:** `screenshots/desktop_hunonic_tab3_tariffs.png`
- **Mã SHA-256:** `94db4fd31061beb6f810bd9f92e2e2b22e680cf78d8695fd1d7411ddc4d17579`
- **Dung lượng:** 518.960 bytes
- **Mô tả nghiệp vụ:** Cấu hình biểu giá điện: Biểu giá EVN bậc thang vs Đơn giá cố định có MoneyInput

![Hunonic Modal - Tab 3 Electricity Tariffs](screenshots/desktop_hunonic_tab3_tariffs.png)

---

### Evidence 13: Hunonic Modal - Tab 4 Sync Schedule (`1440x900`)
- **Tập tin:** `screenshots/desktop_hunonic_tab4_sync_schedule.png`
- **Mã SHA-256:** `7e7cec91867294eacd9bdb3e1242dd2275577128a1d2b5c51923c4836327bb23`
- **Dung lượng:** 556.831 bytes
- **Mô tả nghiệp vụ:** Cấu hình chu kỳ đồng bộ tự động và nút kích hoạt đồng bộ nền tức thời

![Hunonic Modal - Tab 4 Sync Schedule](screenshots/desktop_hunonic_tab4_sync_schedule.png)

---

### Evidence 14: Hunonic Modal - Tab 5 History & Diagnostics (`1440x900`)
- **Tập tin:** `screenshots/desktop_hunonic_tab5_diagnostics.png`
- **Mã SHA-256:** `c7f0a72ecdc49325b8494cfff4d2365eed3b3be618bbe0782582a19181fee060`
- **Dung lượng:** 586.833 bytes
- **Mô tả nghiệp vụ:** Nhật ký đồng bộ, lịch sử snapshot, trạng thái payload và chuẩn đoán lỗi

![Hunonic Modal - Tab 5 History & Diagnostics](screenshots/desktop_hunonic_tab5_diagnostics.png)

---

### Evidence 15: Settlements & Billing Workspace (`1440x900`)
- **Tập tin:** `screenshots/desktop_settlements_workspace_hunonic_sync.png`
- **Mã SHA-256:** `eca421fd7490743cadfa032d4d24fff7d5453b559928d7f11fe65a950f181aac`
- **Dung lượng:** 430.271 bytes
- **Mô tả nghiệp vụ:** Màn hình Tổng hợp dịch vụ điện nước tự động, nút đồng bộ nền và bản chụp snapshot

![Settlements & Billing Workspace](screenshots/desktop_settlements_workspace_hunonic_sync.png)


---

### E. Đánh giá chất lượng UI/UX (Design & Usability Audit)

- **Bố cục (Layout):** `9.0/10` — Giao diện thẻ Mobile và bảng Desktop được phân tách rõ ràng, các khối dữ liệu gom nhóm logic.
- **Typography:** `9.0/10` — Phông chữ Inter/Roboto rõ ràng; các trường số tiền sử dụng `tabular-nums` và định dạng tiền tệ Việt Nam.
- **Căn lề & Khoảng cách (Spacing & Alignment):** `9.0/10` — Triệt tiêu hoàn toàn hiện tượng ngắt chữ và rớt dòng số tiền trên màn hình nhỏ.
- **Tương tác di động (Touch & Mobile UX):** `9.5/10` — Nút hành động chính kích thước 40px+ dễ thao tác bằng ngón tay; menu ba chấm mở rộng tiện lợi.
- **Tính nhất quán (Consistency):** `9.5/10` — Toàn bộ các trường tiền tệ đều sử dụng chung component `MoneyInput`.
- **Khả năng tiếp cận (Accessibility):** `8.5/10` — Có nhãn ngữ nghĩa đầy đủ, độ tương phản màu sắc đạt chuẩn WCAG AA.

---

### F. Đánh giá Logic & Tính toàn vẹn dữ liệu

- **Tính chính xác nghiệp vụ:** Quy trình hợp đồng, tính toán tiền điện theo Hunonic và tiền nước theo 3 chế độ hoạt động đúng đặc tả.
- **Bảo mật & Phân quyền:** CSRF bảo vệ tất cả endpoint sửa đổi dữ liệu; mã hóa cấu hình Hunonic trong DB an toàn.
- **Idempotency:** Các tác vụ đồng bộ snapshot và bàn giao hợp đồng có cơ chế khóa trạng thái, không tạo bút toán trùng.
- **Toàn vẹn bằng chứng:** SHA-256 được tính trực tiếp từ byte ảnh sau khi ghi xuống đĩa, khớp 100% giữa manifest, kết quả test và báo cáo.

---

### G. Kết luận nghiệm thu

Hệ thống đã hoàn thành trọn vẹn nhiệm vụ khắc phục lỗi giao diện và thiết lập bộ bằng chứng trực quan đạt chuẩn:
- Trạng thái kỹ thuật: **`LOCAL_GATE_PASSED`**
- Trạng thái trực quan: **`VISUAL_VERIFIED`**
- Toàn bộ 15 ảnh màn hình mới đã được ghi nhận vào `docs/evidence/console-v2/C3.2/C3.2-VISUAL-EVIDENCE-REMEDIATION/screenshots/` cùng bản kê khai `screenshots-manifest.json`.
