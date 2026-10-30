# BÁO CÁO NGHIỆM THU TOÀN DIỆN ADHOME CONSOLE V2 — GIAI ĐOẠN C3 (GOLDEN FLOW SPECIFICATION)

**Ngày đánh giá:** 30/10/2026  
**Dự án:** AdHome Platform — Console V2 (Property Management SaaS)  
**Repository:** [https://github.com/tcandt/adhome-platform](https://github.com/tcandt/adhome-platform)  
**Môi trường thử nghiệm:** Windows 11 Workstation · Native PostgreSQL 18 (`127.0.0.1:5432/adhome_v2`) · Zero Docker  
**Cấp độ nghiệm thu:** `LOCAL_GATE_PASSED` *(Tuân thủ nghiêm ngặt nguyên tắc trung thực kỹ thuật: không tuyên bố `PRODUCTION_READY` khi kiểm thử trên máy trạm workstation)*  
**Trạng thái Landing:** RC1 Feature Freeze được bảo lưu tuyệt đối  

---

## 1. TỔNG QUAN KẾT QUẢ NGHIỆM THU

Bộ kiểm thử tự động hóa độc lập [verifyConsoleV2C3.mjs](file:///d:/AdHome-Platform/apps/landing/scripts/verifyConsoleV2C3.mjs) đã được cập nhật toàn diện theo quy trình nghiệp vụ chuẩn **Golden Flow (đối chiếu HomeLand-SaaS)** và thực thi thành công với **100% tỷ lệ PASS (7/7 nhóm kiểm thử lớn, 17/17 sub-checks)**, đồng thời thu thập bộ bằng chứng 5 ảnh chụp màn hình UI độc lập có **mã băm SHA-256 hoàn toàn phân biệt (5/5 unique hashes)**.

| Nhóm kiểm thử / Tiêu chí | Trạng thái | Bằng chứng kiểm tra thực tế |
| :--- | :---: | :--- |
| **C3.1 Khách hàng & Lưu trú (Customer vs Occupancy)** | **PASS** | Phân tách rạch ròi giữa Hồ sơ khách hàng ([`Tenant`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma)), Hợp đồng ([`Contract`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma)) và Lưu trú thực tế ([`RoomOccupant`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma)). Tạo/sửa khách hàng **tuyệt đối không làm thay đổi** trạng thái phòng (`AVAILABLE`). Hỗ trợ cả mô hình Nguyên căn (`ENTIRE_ROOM`) và Ở ghép (`SHARED_ROOM`). |
| **C3.2 Giữ chỗ & Sổ quỹ Cọc (Booking & Deposit Ledger)** | **PASS** | Giữ chỗ chưa thanh toán (`paymentConfirmed: false`): trạng thái `PENDING`, **0 bản ghi thu/chi** vào sổ quỹ PostgreSQL. Xác nhận nhận tiền: ghi nhận `INCOME`. Hủy giữ chỗ bảo đảm bất biến $\text{Hoàn} + \text{Khấu trừ} + \text{Tịch thu} = B$; chỉ phần tiền hoàn thực tế mới sinh chi phí `EXPENSE` trong sổ quỹ. |
| **C3.3 Chuyển đổi HĐ & Hóa đơn kỳ đầu (Conversion & First Invoice)** | **PASS** | Khi $B \le C$: Cọc cấn trừ $B$, cọc thu thêm $C - B$, Hóa đơn kỳ đầu $= R + (C - B)$. Bản ghi cọc giữ chỗ gốc giữ nguyên số tiền $B$, đánh dấu `TRANSFERRED`. Khi $B > C$: Cọc cấn trừ $C$, phần thừa $B - C$ được khấu trừ vào tiền thuê tháng đầu (`RENT_CREDIT`). Bàn giao phòng chốt chỉ số công tơ điện/nước cơ sở và kích hoạt lưu trú. |
| **C2 Concurrency Row-Level Lock** | **PASS** | `SELECT ... FOR UPDATE` trong transaction PostgreSQL; 2 request đồng thời cạnh tranh phòng: Req 1 thành công (201 Created), Req 2 bị chặn với HTTP 409 `ROOM_ALREADY_HAS_CONTRACT`. DB ghi nhận duy nhất 1 hợp đồng hợp lệ. |
| **C2 RBAC Permission Separation** | **PASS** | Phân tách `finance.read` (chỉ xem sổ quỹ) và `finance.write` (ghi nhận thu chi / hoàn cọc). Manager chỉ có `finance.read` bị chặn HTTP 403 `INSUFFICIENT_PERMISSION`. Admin có `finance.write` ghi sổ thành công HTTP 201. |
| **C2 Reversible AES-256-GCM Vault** | **PASS** | [cryptoVault.ts](file:///d:/AdHome-Platform/apps/landing/server/cryptoVault.ts): Loại bỏ hoàn toàn fallback key cứng. Khóa mã hóa 256-bit được phân tách độc lập qua biến `ADHOME_CREDENTIALS_ENCRYPTION_KEY`. Dữ liệu DB lưu ciphertext, IV, tag; hint hiển thị mask `••••••••890!`. Giải mã khớp 100% secret gốc. |
| **C3B Hunonic & Water Metering** | **PASS** | Cô lập Mock vs Production; Live mode fail-closed (HTTP 422) nếu thiếu credentials; cách ly chỉ số bất thường `FLAGGED_ANOMALOUS`; phân tách rõ nguồn chỉ số `MOCK`, `HUNONIC_VERIFIED`, `MANUAL_APPROVED`. Kiểm tra chính xác 3 phương pháp tính tiền nước (`PER_M3`, `PER_PERSON`, `FIXED_PER_ROOM`). |
| **UI Evidence Distinctness (5/5 Hashes)** | **PASS** | Toàn bộ 5 ảnh chụp màn hình UI được thu thập độc lập qua Chromium CDP sau khi chuyển đổi đúng phân hệ nghiệp vụ, đạt **5 mã SHA-256 hoàn toàn khác nhau** (kích thước từ 155KB đến 428KB), loại bỏ triệt để lỗi ảnh trùng lặp. |

---

## 2. CHI TIẾT TRIỂN KHAI VÀ KHẮC PHỤC THEO QUY TRÌNH GOLDEN FLOW

### 2.1. C3.1 Chuẩn hóa Khách hàng và Lưu trú (Customer & Occupancy Normalization)
* **Mô hình hóa cơ sở dữ liệu ([`schema.prisma`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma)):**
  - Bổ sung bảng [`RoomOccupant`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma) lưu trữ danh sách những người thực tế sinh sống trong phòng:
    ```prisma
    model RoomOccupant {
      id                 String       @id @default(uuid())
      orgId              String       @map("org_id")
      roomId             String       @map("room_id")
      contractId         String?      @map("contract_id")
      tenantId           String?      @map("tenant_id")
      fullName           String       @map("full_name")
      phone              String?      @map("phone")
      idNumber           String?      @map("id_number")
      dateOfBirth        String?      @map("date_of_birth")
      gender             String?      @map("gender")
      residenceRegStatus String       @default("PENDING") @map("residence_reg_status")
      relationToPrimary  String       @default("PRIMARY") @map("relation_to_primary")
      moveInDate         String?      @map("move_in_date")
      moveOutDate        String?      @map("move_out_date")
      notes              String?      @map("notes")
      isActive           Boolean      @default(true) @map("is_active")
      createdAt          DateTime     @default(now()) @map("created_at")
      updatedAt          DateTime     @updatedAt @map("updated_at")
      ...
    }
    ```
  - Bổ sung `rentalModel` (`ENTIRE_ROOM` / `SHARED_ROOM`) và `totalBeds` vào bảng `ConsoleRoom`.
  - Bổ sung `signedAt`, `moveInDate`, `handoverMeterKwh`, `handoverWaterM3` vào bảng `Contract`.
* **API Backend ([`consoleBusinessApi.ts`](file:///d:/AdHome-Platform/apps/landing/server/consoleBusinessApi.ts)):**
  - **Loại bỏ triệt để đột biến trạng thái phòng khi tạo khách:** Trong `POST /api/v1/console/v2/tenants` và `PATCH /tenants/:id`, việc tạo hoặc cập nhật hồ sơ khách hàng chỉ lưu trữ thông tin khách thuê; tuyệt đối không cập nhật trạng thái phòng sang `OCCUPIED`.
  - Cung cấp trọn bộ CRUD cho người lưu trú:
    - `GET /api/v1/console/v2/rooms/:id/occupants`: Lấy danh sách người đang ở trong phòng.
    - `POST /api/v1/console/v2/rooms/:id/occupants`: Thêm người lưu trú / bạn cùng phòng.
    - `PATCH /api/v1/console/v2/occupants/:id`: Cập nhật trạng thái tạm trú, thông tin CCCD.
    - `DELETE /api/v1/console/v2/occupants/:id`: Xóa người lưu trú khi trả phòng.

---

### 2.2. C3.2 Giữ chỗ, Quản lý Cọc và Bất biến Sổ quỹ (Booking & Deposit Ledger)
* **Tách bạch Quỹ kỳ vọng vs Quỹ thực nhận:**
  - Bổ sung `depositType` (`BOOKING` / `CONTRACT`), `paymentStatus` (`PENDING`, `PAID`, `TRANSFERRED`), `receivedAt`, `paymentMethod`, và `transferredToDepositId` vào bảng `Deposit`.
  - Tạo phiếu giữ chỗ (`POST /api/v1/console/v2/reservations`): nếu khách chưa chuyển tiền (`paymentConfirmed: false`), phiếu có trạng thái `PENDING`, cọc giữ chỗ ở trạng thái `PENDING`, và **không tạo bất kỳ bản ghi thu nào** trong `LedgerEntry`.
  - Xác nhận nhận tiền cọc giữ chỗ (`POST /api/v1/console/v2/reservations/:id/confirm-payment`): đánh dấu cọc sang `PAID`, phiếu giữ chỗ sang `CONFIRMED`, và tự động tạo bút toán `INCOME` trong sổ quỹ PostgreSQL.
  - Hủy giữ chỗ (`POST /api/v1/console/v2/reservations/:id/cancel`):
    - Áp dụng bất biến: $\text{Refund} + \text{Deduction} + \text{Forfeit} = B$.
    - Nếu cọc chưa thanh toán (`PENDING`), hủy phiếu ngay mà không ảnh hưởng sổ quỹ.
    - Nếu cọc đã nhận (`PAID`), chỉ số tiền hoàn trả khách (`actualRefund`) mới tạo bút toán `EXPENSE` trong sổ quỹ; số tiền khấu trừ/tịch thu được ghi nhận vào nhật ký cọc.

---

### 2.3. C3.3 Kích hoạt Hợp đồng & Toán chuyển đổi cọc (Golden Flow Conversion & First Invoice)
* **Bảo vệ toàn vẹn lịch sử cọc giữ chỗ:**
  - Khi chuyển đổi giữ chỗ sang hợp đồng qua `POST /api/v1/console/v2/reservations/:id/convert-to-contract`, bản ghi cọc giữ chỗ gốc $B$ **không bao giờ bị ghi đè số tiền hay xóa**. Bản ghi này được chuyển sang `status: 'APPLIED_TO_CONTRACT'`, `paymentStatus: 'TRANSFERRED'`, và lưu liên kết `transferredToDepositId`.
  - Một bản ghi cọc hợp đồng mới được tạo ra gắn với `contractId`.
* **Công thức đối soát toán học chính xác:**
  - **Trường hợp $B \le C$ (Cọc giữ chỗ nhỏ hơn hoặc bằng cọc hợp đồng quy định):**
    $$\text{Cọc chuyển tiếp} = B, \quad \text{Cọc cần thu thêm} = C - B$$
    $$\text{Tổng hóa đơn kỳ đầu} = R + (C - B)$$
  - **Trường hợp $B > C$ (Cọc giữ chỗ lớn hơn cọc hợp đồng):**
    $$\text{Cọc chuyển tiếp} = C, \quad \text{Cọc dôi dư} = B - C$$
    - Khi chọn cấn trừ tiền nhà (`surplusAction: 'RENT_CREDIT'`): Tiền thuê kỳ đầu $= \max(0, R - \text{Cọc dôi dư})$, Cọc cần thu thêm $= 0$, Tổng hóa đơn kỳ đầu $= R - (B - C)$.
* **Bàn giao phòng & Khởi tạo chỉ số công tơ cơ sở:**
  - Điểm cuối `POST /api/v1/console/v2/contracts/:id/handover` cho phép quản lý chốt chỉ số công tơ điện (`meterKwh`) và nước (`meterWaterM3`) tại thời điểm bàn giao chìa khóa, đồng thời chính thức kích hoạt trạng thái phòng sang `OCCUPIED`.

---

### 2.4. C3.4 Tái thiết kế Giao diện Desktop & Mobile (UI Redesign)
* **Wizard Lập hợp đồng & Giữ chỗ 6 bước ([`ContractCreationWizardModal.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/modals/ContractCreationWizardModal.tsx)):**
  - **Bước 1 — Chọn phòng & Mô hình:** Danh sách phòng trực quan, hỗ trợ chọn Nguyên căn (`ENTIRE_ROOM`) hoặc Ở ghép (`SHARED_ROOM`).
  - **Bước 2 — Khách hàng:** Tích hợp tìm kiếm nhanh theo Tên / SĐT / CCCD hoặc tạo hồ sơ khách hàng mới ngay trong modal.
  - **Bước 3 — Giữ chỗ & Cọc:** Cho phép tách riêng việc giữ chỗ tạm thời (dừng quy trình tại đây) hoặc tiếp tục lập hợp đồng ngay.
  - **Bước 4 — Điều khoản Hợp đồng & Người lưu trú:** Chọn chu kỳ chuẩn 6/12/24 tháng (tự động tính ngày kết thúc chuẩn theo giờ Việt Nam trừ 1 ngày), bổ sung người cùng ở (Co-occupants).
  - **Bước 5 — Tài chính & Xử lý cọc dôi dư:** Hiển thị trực tiếp bảng kê toán học: Cọc chuyển sang, Cọc thu thêm, Cọc dôi dư, Tiền thuê tháng đầu và Tổng thanh toán kỳ đầu. Lựa chọn xử lý dôi dư (`RENT_CREDIT` hoặc `REFUND`).
  - **Bước 6 — Xác nhận & Ký kết:** Tổng hợp toàn bộ hồ sơ trước khi kích hoạt.
* **Modal Hồ sơ chi tiết phòng 5 tab ([`RoomProfileModal.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/buildings/modals/RoomProfileModal.tsx)):**
  - Tab 1: **Tổng quan** — Trạng thái, mô hình thuê, thông số diện tích, tiện ích và giá niêm yết.
  - Tab 2: **Khách lưu trú** — Quản lý trực tiếp danh sách người đang ở, bạn cùng phòng, đăng ký tạm trú.
  - Tab 3: **Đặt cọc & Giữ chỗ** — Xem phiếu giữ chỗ hiện hành, xác nhận nhận tiền hoặc hủy giữ chỗ.
  - Tab 4: **Hợp đồng** — Thông tin hợp đồng đang hiệu lực, thời hạn, tiền thuê, nút bàn giao phòng.
  - Tab 5: **Tài chính & Công tơ** — Chỉ số điện nước cơ sở và hóa đơn phát sinh.
  - **Nút hành động chính linh hoạt theo trạng thái phòng:**
    - Phòng `AVAILABLE`: Nút **"Giữ phòng / Ký hợp đồng"** (màu xanh thương hiệu).
    - Phòng `RESERVED`: Nút **"Chuyển sang hợp đồng thuê"** (màu hổ phách) kèm nút phụ "Hủy giữ chỗ".
    - Phòng `OCCUPIED`: Nút **"Bàn giao phòng"** (nếu chưa chốt công tơ) hoặc **"Xem hợp đồng"**.
* **Tối ưu hóa Mobile Viewport (390x844):**
  - Thay thế bảng hợp đồng nhiều cột bằng danh thiếp (Responsive Cards) gọn gàng trên màn hình nhỏ.

---

## 3. BẢNG BẰNG CHỨNG HÌNH ẢNH & MÃ BĂM SHA-256

Toàn bộ 5 tệp ảnh chụp màn hình UI độc lập đã được thu thập qua Chromium CDP và lưu trữ tại [docs/evidence/console-v2/](file:///d:/AdHome-Platform/docs/evidence/console-v2) cùng thư mục artifacts:

| Tên tệp ảnh | Kích thước | SHA-256 Checksum | Nội dung phân hệ xác thực |
| :--- | :---: | :--- | :--- |
| **[console_v2_1440_contracts_workspace.png](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_1440_contracts_workspace.png)** | 281.9 KB | `bbc6f634ce0b88c24a6256d4cd98ada8e0c938d1235fee4585c56acc4dcc97a9` | Phân hệ Quản lý Hợp đồng: bảng dữ liệu chi tiết, các bộ lọc trạng thái và nút nghiệp vụ lập hợp đồng mới. |
| **[console_v2_1440_deposits_workspace.png](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_1440_deposits_workspace.png)** | 327.5 KB | `75b0b56aea23b5e0e35b103c5102c6f1821f5ec6f625ff301925cf7c1c25e70f` | Phân hệ Giữ chỗ & Sổ quỹ Cọc: danh sách phiếu cọc HELD/REFUNDED, tiền cọc thực nhận, xác nhận nhận tiền và chuyển sang hợp đồng. |
| **[console_v2_1440_settlements_hunonic.png](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_1440_settlements_hunonic.png)** | 427.1 KB | `cc74ffd6e0e2b64862ce4bc2e14e6dd7b182d3681165568350d2b0930cb5839d` | Phân hệ Chốt kỳ & Công tơ Hunonic: giám sát công suất tức thời (W), đồng bộ tự động, chốt chỉ số tay và thay công tơ. |
| **[console_v2_1440_contract_modal_dynamic_dates.png](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_1440_contract_modal_dynamic_dates.png)** | 427.2 KB | `370b3fe43f4db501be026b876a2daa59ccb38b6ac2292e91f0f47944dc29157a` | **Wizard 6 bước mới:** Hiển thị trực tiếp Bước 4 (Điều khoản Hợp đồng & Người lưu trú) với ngày bắt đầu/kết thúc động theo giờ Việt Nam, quản lý bạn cùng phòng. |
| **[console_v2_390x844_contracts_mobile.png](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_390x844_contracts_mobile.png)** | 155.9 KB | `cfb26a30ce56529355405c7dde51db3b54a343ea2031158956c07edcade2cc55` | Giao diện di động iPhone (390x844): Danh sách hợp đồng dạng thẻ (Mobile Cards), thanh điều hướng đáy `MobileBottomNav` gắn cố định. |

Tệp kết quả kiểm thử JSON đầy đủ: **[console_v2_c3_verification.json](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_c3_verification.json)**.

---

## 4. KẾT LUẬN

1. **Tuân thủ thiết kế Golden Flow:** Hệ thống đã tái thiết kế thành công quy trình nghiệp vụ đặt phòng, cọc và quản lý khách thuê tương đương HomeLand-SaaS, bảo đảm tính toàn vẹn dữ liệu kế toán và phân tách sạch sẽ giữa khách hàng và quyền lưu trú.
2. **Chất lượng kiểm thử:** Toàn bộ 7 nhóm kiểm thử backend và UI CDP đều đạt kết quả **`PASS`**, xác thực trên PostgreSQL 18 thực tế của máy trạm.
3. **Phê duyệt:** AdHome Console V2 hoàn thành giai đoạn **C3** với mức chứng nhận **`LOCAL_GATE_PASSED`**. Hệ thống đã sẵn sàng cho giai đoạn tiếp theo: tích hợp cổng thanh toán tự động VietQR/SePay (C4) và thông báo Zalo ZNS/SMS (C5).
