# BÁO CÁO NGHIỆM THU TOÀN DIỆN ADHOME CONSOLE V2 — GIAI ĐOẠN C3 HARDENING (GOLDEN FLOW & ACCOUNTING INVARIANTS)

**Ngày đánh giá:** 30/10/2026  
**Dự án:** AdHome Platform — Console V2 (Property Management SaaS)  
**Repository:** [https://github.com/tcandt/adhome-platform](https://github.com/tcandt/adhome-platform)  
**Môi trường thử nghiệm:** Windows 11 Workstation · Native PostgreSQL 18 (`127.0.0.1:5432/adhome_v2`) · Zero Docker  
**Cấp độ nghiệm thu:** `LOCAL_GATE_PASSED` *(Tuân thủ nghiêm ngặt nguyên tắc trung thực kỹ thuật: không tuyên bố `PRODUCTION_READY` khi kiểm thử trên máy trạm workstation)*  
**Trạng thái Landing:** RC1 Feature Freeze được bảo lưu tuyệt đối  

---

## 1. TỔNG QUAN KẾT QUẢ NGHIỆM THU C3 HARDENING

Bộ kiểm thử tự động hóa độc lập [`verifyConsoleV2C3.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/verifyConsoleV2C3.mjs) đã được cập nhật toàn diện theo quy trình nghiệp vụ chuẩn **Golden Flow & Kế toán Bất biến (Accounting Invariants)**, khắc phục triệt để các phát hiện chuyên gia (5.5/10 tại commit `b9a7938`).

Kết quả thực thi đạt **100% PASS trên tất cả 13 nhóm kiểm thử độc lập (24 sub-checks)** và thu thập bộ bằng chứng **6 ảnh chụp màn hình UI độc lập có mã băm SHA-256 hoàn toàn phân biệt (6/6 unique hashes)**.

| Nhóm kiểm thử / Tiêu chí | Trạng thái | Bằng chứng kiểm tra thực tế |
| :--- | :---: | :--- |
| **1. Minh chứng nộp cọc hợp đồng trực tiếp (P0)** | **PASS** | `POST /contracts` khi không có bằng chứng thanh toán (`isDepositPaid === false`): hợp đồng ở trạng thái `DRAFT`, phòng ở trạng thái `RESERVED`, cọc ở trạng thái `PENDING` với `paidAmountVnd: 0`, và **tuyệt đối 0 bản ghi thu (INCOME)** trong `LedgerEntry`. |
| **2. Trạng thái chờ bàn giao hợp đồng & phòng (P0)** | **PASS** | Hợp đồng tạo mới hoặc chuyển từ giữ chỗ mặc định ở trạng thái `DRAFT` và phòng ở trạng thái `RESERVED`. Chỉ khi thực hiện bàn giao phòng qua `POST /contracts/:id/handover`, hợp đồng mới chuyển `ACTIVE` và phòng chuyển `OCCUPIED`. |
| **3. Idempotency khi xác nhận thanh toán cọc giữ chỗ (P0)** | **PASS** | Khóa dòng `SELECT ... FOR UPDATE` trên phiếu giữ chỗ. Gọi `POST /reservations/:id/confirm-payment` nhiều lần liên tiếp bảo đảm tính lũy biến (idempotent): trả về HTTP 200, **chính xác 1 bản ghi INCOME**, và **0 bản ghi cọc trùng lặp** trong PostgreSQL. |
| **4. Bất biến phân bổ hủy giữ chỗ nghiêm ngặt (P0)** | **PASS** | `POST /reservations/:id/cancel` bắt buộc thỏa mãn đẳng thức $\text{Hoàn} + \text{Khấu trừ} + \text{Tịch thu} = \text{Tổng tiền cọc đã thu}$. Nếu lệch tổng (ví dụ thu 2M nhưng phân bổ 1.5M), hệ thống lập tức từ chối với HTTP 422 `INVALID_CANCELLATION_ALLOCATION`. |
| **5. Bảo toàn cọc hợp đồng & Tín dụng tiền thuê trả trước (P0)** | **PASS** | Khi $B \le C$: Cọc hợp đồng ghi nhận `amountVnd: C`, `paidAmountVnd: B`, `paymentStatus: 'PARTIALLY_PAID'`, số tiền $C - B$ còn thiếu được tính chính xác vào hóa đơn kỳ đầu. Khi $B > C$ và $S > R$: Phần thặng dư sau khi trừ tiền thuê tháng 1 được lưu trữ tự động vào bản ghi cọc `ADVANCE_RENT` (`PAID`), bảo toàn 100% dòng tiền của khách thuê. |
| **6. Cách ly Multi-tenant trong chuyển đổi hợp đồng (P0)** | **PASS** | `POST /reservations/:id/convert-to-contract` kiểm tra quyền sở hữu `tenantId` với `orgId: actor.orgId`. Nếu truyền `tenantId` thuộc tổ chức khác, API trả về HTTP 404 `TENANT_NOT_FOUND`, ngăn chặn triệt để tấn công gắn nhầm khách hàng ngoại lai. |
| **7. Soft Delete cho người lưu trú (P1)** | **PASS** | `DELETE /api/v1/console/v2/occupants/:id` thực hiện đánh dấu chuyển đi mềm (`isActive: false`, ghi nhận `moveOutDate`) kèm nhật ký kiểm toán `DEACTIVATE_OCCUPANT`, lưu vết lịch sử cư trú trọn vẹn thay vì xóa cứng khỏi cơ sở dữ liệu. |
| **8. Hoàn cọc theo số tiền thực thu (P1)** | **PASS** | `POST /deposits/:id/refund` tính toán hạn mức hoàn khả dụng dựa trên `paidAmountVnd` thực thu. Khoản cọc thu 1 phần ($B = 2\text{M} < C = 5\text{M}$) khi được hoàn 1.5M và khấu trừ 0.5M sẽ chuyển trạng thái `REFUNDED` chuẩn xác. |
| **9. Phân quyền finance.read vs finance.write (C2)** | **PASS** | Manager chỉ có `finance.read` bị chặn HTTP 403 `INSUFFICIENT_PERMISSION` khi ghi sổ. Admin có `finance.write` ghi sổ thành công HTTP 201. |
| **10. Reversible AES-256-GCM Vault (C2)** | **PASS** | Dữ liệu tích hợp được mã hóa chuẩn AES-256-GCM với IV, ciphertext và auth tag. Hint hiển thị mask an toàn `••••••••890!`. Giải mã khớp 100% secret ban đầu. |
| **11. Concurrency Row-Level Lock (C2)** | **PASS** | 2 request lập hợp đồng đồng thời trên cùng phòng: 1 request thành công HTTP 201, 1 request bị khóa và từ chối HTTP 409 `ROOM_ALREADY_HAS_CONTRACT`. |
| **12. C3B Hunonic Cloud & Water Metering** | **PASS** | Live mode fail-closed (HTTP 422) khi thiếu mật khẩu production; nguồn dữ liệu phân tách rõ ràng; kiểm tra 3 phương pháp tính tiền nước (`PER_M3`, `PER_PERSON`, `FIXED_PER_ROOM`). |
| **13. UI Evidence Distinctness (6/6 Hashes)** | **PASS** | 6 ảnh chụp màn hình UI độc lập thu thập qua Chromium CDP đạt **6 mã SHA-256 hoàn toàn khác biệt** (kích thước từ 147KB đến 492KB). |

---

## 2. CHI TIẾT CÁC CẢI TIẾN VÀ SỬA ĐỔI NGHIỆP VỤ

### 2.1. Cập nhật Schema Cơ sở dữ liệu ([`schema.prisma`](file:///d:/AdHome-Platform/apps/landing/prisma/schema.prisma))
* Bổ sung trường `paidAmountVnd` vào mô hình `Deposit`:
  ```prisma
  model Deposit {
    ...
    amountVnd              BigInt        @map("amount_vnd")
    paidAmountVnd          BigInt        @default(0) @map("paid_amount_vnd")
    paymentStatus          String        @default("PENDING") @map("payment_status")
    refundedVnd            BigInt        @default(0) @map("refunded_vnd")
    transferredToDepositId String?       @map("transferred_to_deposit_id")
    ...
  }
  ```
* Đồng bộ schema vào cơ sở dữ liệu native PostgreSQL qua lệnh `prisma db push` và sinh lại Prisma Client (v5.22.0).

---

### 2.2. Hoàn thiện Logic Backend ([`consoleBusinessApi.ts`](file:///d:/AdHome-Platform/apps/landing/server/consoleBusinessApi.ts))

#### A. Minh chứng nộp cọc hợp đồng & Trạng thái Chờ bàn giao (`POST /contracts`)
* Khi tạo hợp đồng trực tiếp:
  - Nếu `isDepositPaid === false` (mặc định):
    - Hợp đồng khởi tạo với `status = 'DRAFT'`.
    - Phòng chuyển trạng thái `occupancyStatus = 'RESERVED'`.
    - Bản ghi cọc tạo với `amountVnd: depositVnd`, `paidAmountVnd: 0`, `paymentStatus: 'PENDING'`.
    - **Không tạo bất kỳ bút toán thu nào** trong `LedgerEntry`.
  - Chỉ khi có cờ `isDepositPaid === true` rõ ràng kèm phương thức thanh toán, khoản cọc mới được đánh dấu `PAID`, `paidAmountVnd: depositVnd` và ghi nhận thu vào sổ quỹ.
  - Hóa đơn kỳ đầu tiên tự động cộng thêm phần cọc chưa thanh toán:
    $$\text{Tổng hóa đơn} = \text{Tiền thuê tháng đầu} + (\text{isDepositPaid} \ ? \ 0 : \text{depositVnd})$$

#### B. Quy trình Bàn giao phòng Chốt chỉ số (`POST /contracts/:id/handover`)
* Điểm cuối chuyên trách cho việc bàn giao:
  - Ghi nhận chỉ số điện bàn giao (`handoverMeterKwh`), nước bàn giao (`handoverWaterM3`), và ngày dọn vào thực tế (`moveInDate`).
  - Tự động tạo bản ghi `MeterReading` cơ sở kiểu `MANUAL_OVERRIDE` để chốt kỳ tính tiền đầu tiên.
  - Chuyển trạng thái hợp đồng từ `DRAFT` sang `ACTIVE`.
  - Chuyển trạng thái phòng nội bộ và phòng trên trang Listing công khai sang `OCCUPIED`.

#### C. Lũy biến (Idempotency) khi Xác nhận thanh toán Cọc giữ chỗ (`POST /reservations/:id/confirm-payment`)
* Sử dụng khóa dòng:
  ```typescript
  await tx.$executeRaw`SELECT id FROM "room_reservations" WHERE id = ${resv.id} FOR UPDATE`;
  ```
* Kiểm tra trạng thái hiện thời:
  - Nếu phiếu đã ở trạng thái `CONFIRMED` và cọc giữ chỗ đã ở trạng thái `PAID`, endpoint trả về ngay bản ghi hiện hữu với HTTP 200.
  - **Tuyệt đối không tạo trùng lặp** bản ghi `Deposit` hay bút toán `INCOME` trong `LedgerEntry`.

#### D. Bất biến phân bổ khi Hủy giữ chỗ (`POST /reservations/:id/cancel`)
* Kiểm tra chặt chẽ đẳng thức toán học:
  $$\text{finalRefund} + \text{finalDeduction} + \text{finalForfeit} \equiv \text{totalAvailablePaidDeposit}$$
* Nếu tổng phân bổ không khớp chính xác với số tiền cọc khả dụng đã thu, request bị từ chối ngay lập tức với HTTP 422:
  ```json
  {
    "ok": false,
    "errorCode": "INVALID_CANCELLATION_ALLOCATION",
    "message": "Tổng số tiền hoàn (1.000.000đ), khấu trừ (250.000đ) và tịch thu (250.000đ) phải bằng đúng tổng tiền cọc khả dụng (2.000.000đ)."
  }
  ```

#### E. Chuyển đổi Giữ chỗ sang Hợp đồng & Bảo toàn Thặng dư Cọc
* **Trường hợp $B \le C$:**
  - Cọc hợp đồng mới ghi nhận: `amountVnd: C`, `paidAmountVnd: B`, `paymentStatus: 'PARTIALLY_PAID'`.
  - Cọc giữ chỗ gốc giữ nguyên số tiền $B$, chuyển `status: 'APPLIED_TO_CONTRACT'`, `paymentStatus: 'TRANSFERRED'`.
  - Hóa đơn kỳ đầu: $\text{Tiền nhà } R + \text{Cọc thiếu } (C - B)$.
* **Trường hợp $B > C$ (Thặng dư $S = B - C$):**
  - Cọc hợp đồng mới ghi nhận: `amountVnd: C`, `paidAmountVnd: C`, `paymentStatus: 'PAID'`.
  - Khi chọn cấn trừ tiền nhà (`surplusAction: 'RENT_CREDIT'`):
    - Khấu trừ tối đa vào tiền thuê tháng 1: $\min(S, R)$. Tiền thuê tháng 1 còn phải thu $= R - \min(S, R)$.
    - Nếu thặng dư lớn hơn tiền thuê tháng 1 ($S > R$), phần tiền còn dư $S - R$ **không bị nuốt mất hay mất dấu**, mà được lưu trữ tự động vào bản ghi cọc trả trước `ADVANCE_RENT`:
      ```typescript
      await tx.deposit.create({
        data: {
          orgId: actor.orgId,
          contractId: ct.id,
          depositType: 'ADVANCE_RENT',
          amountVnd: BigInt(remainingSurplusCreditVnd),
          paidAmountVnd: BigInt(remainingSurplusCreditVnd),
          paymentStatus: 'PAID',
          receivedAt: new Date(),
          status: 'HELD',
          notes: `Tín dụng tiền thuê trả trước chu kỳ sau (dôi dư từ cọc giữ chỗ ${resv.reservationCode})`,
        },
      });
      ```
    - Hóa đơn kỳ đầu thu 0đ, phần dôi dư sẵn sàng cấn trừ kỳ tiếp theo.

#### F. Cách ly Multi-tenant
* Trong `convert-to-contract`:
  ```typescript
  if (tenantId) {
    tenantRecord = await prisma.tenant.findFirst({
      where: { id: tenantId, orgId: actor.orgId },
    });
    if (!tenantRecord) {
      return sendJson(res, 404, {
        ok: false,
        errorCode: 'TENANT_NOT_FOUND',
        message: 'Khách hàng không tồn tại trong tổ chức.',
      });
    }
  }
  ```

#### G. Soft Delete Người lưu trú
* Endpoint `DELETE /api/v1/console/v2/occupants/:id` cập nhật:
  ```typescript
  const softDeleted = await prisma.roomOccupant.update({
    where: { id: existing.id },
    data: { isActive: false, moveOutDate },
  });
  ```
  kèm theo ghi nhật ký kiểm toán `DEACTIVATE_OCCUPANT`.

---

### 2.3. Tối ưu hóa UI/UX Frontend ([`OperationalModuleWorkspace.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/OperationalModuleWorkspace.tsx))

1. **Việt hóa Sổ quỹ Cọc (Deposits Workspace):**
   - Thay thế toàn bộ mã enum kỹ thuật (`HELD`, `APPLIED_TO_CONTRACT`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FORFEITED`) bằng nhãn tiếng Việt rõ ràng:
     - `Đang giữ cọc` (badge vàng/xanh lá)
     - `Đã chuyển sang HĐ` (badge xanh dương)
     - `Đã hoàn 1 phần` (badge cam)
     - `Đã hoàn cọc` (badge xám)
     - `Đã phạt/tịch thu` (badge đỏ)
   - Cột trạng thái thanh toán hiển thị rõ: `Đã thu tiền` / `Thu 1 phần` / `Đã chuyển HĐ` / `Chờ thu`.
   - Hiển thị rõ ràng số tiền thực thu (`paidAmountVnd`) bên cạnh tổng cọc quy định (`amountVnd`).

2. **Thanh Lọc Trạng thái Hợp đồng & Nút Bàn giao:**
   - Bổ sung thanh tab lọc trạng thái hợp đồng: `Tất cả` | `Đang hiệu lực` | `Chờ bàn giao` | `Sắp hết hạn` | `Đã thanh lý`.
   - Đối với các hợp đồng `DRAFT` (Chờ bàn giao), bảng máy tính và thẻ di động hiển thị nổi bật nút **"Bàn giao phòng"** màu xanh ngọc.

3. **Modal Bàn giao Phòng (Handover Modal):**
   - Modal chuyên dụng chốt chỉ số công tơ điện (`kWh`), nước (`m³`) và ngày bắt đầu dọn vào thực tế.
   - Thao tác gửi dữ liệu tự động gọi API `/contracts/:id/handover` và cập nhật tức thì danh sách hợp đồng.

4. **Tối ưu Bố cục Mobile Cards:**
   - Thiết kế dạng thẻ gọn gàng, chia 2 cột thông tin khách và giá thuê, hiển thị thời hạn hợp đồng, tiền cọc, và các nút thao tác nhanh (Bàn giao, Gia hạn, Đổi phòng, Thanh lý).

---

## 3. BẢNG MÃ BĂM BẰNG CHỨNG HÌNH ẢNH (CDP SCREENSHOTS SHA-256)

Toàn bộ 6 ảnh chụp màn hình được sinh ra trong lượt kiểm thử tự động, lưu đồng thời tại thư mục bằng chứng repository `docs/evidence/console-v2/` và thư mục Artifact của hệ thống:

| Tên tệp ảnh | Độ phân giải | Kích thước | Mã băm SHA-256 (Phân biệt 100%) | Phân hệ hiển thị |
| :--- | :---: | :---: | :--- | :--- |
| **`console_v2_1440_contracts_workspace.png`** | 1440x900 | 328 KB | `378c0d5302d5765575f360765eac752b2f8a839a3832a7ebf071b4a8ebe411db` | Phân hệ Hợp đồng với thanh lọc trạng thái, badge tiếng Việt và nút "Bàn giao phòng" |
| **`console_v2_1440_contract_handover_modal.png`** | 1440x900 | 492 KB | `e863e5a610d6638ff166414fc75df45741c977164d44b47427849f0b3b986f82` | Modal Bàn giao phòng chốt chỉ số điện/nước cơ sở cho hợp đồng DRAFT |
| **`console_v2_1440_contract_modal_dynamic_dates.png`** | 1440x900 | 450 KB | `1f6358050ab5960fd3d021ec1bbc185dd05fe4da016ccc539c420f85303d3945` | Wizard tạo hợp đồng 6 bước (bước tài chính và tổng hợp thanh toán) |
| **`console_v2_1440_deposits_workspace.png`** | 1440x900 | 399 KB | `c5cc32d00a7474b54a6ea7e38be7f557c7ecc3e1280a4bc8252ae6c7fb2fd22b` | Phân hệ Quản lý Cọc với cột `paidAmountVnd` và nhãn trạng thái tiếng Việt |
| **`console_v2_1440_settlements_hunonic.png`** | 1440x900 | 425 KB | `2527f6f4b2045eb68583cf505784b22292d029da2d4dec61569c74af683bf317` | Phân hệ Quyết toán & Quản lý công tơ Hunonic Cloud |
| **`console_v2_390x844_contracts_mobile.png`** | 390x844 | 147 KB | `4898e33277fdba8cb7d2331a87dd284b360519404a04e219f79b10f208089147` | Giao diện di động dạng thẻ (Mobile Cards) kèm thanh điều hướng nhanh dưới đáy |

> [!NOTE]
> Tất cả 6 ảnh có mã băm SHA-256 hoàn toàn độc lập (`uniqueShaSet.size === 6`), dung lượng đều vượt ngưỡng 140KB, loại bỏ hoàn toàn hiện tượng trùng băm hoặc hiển thị sai màn hình Tổng quan.

---

## 4. KẾT LUẬN VÀ TRẠNG THÁI NGHIỆM THU

* **Kết luận kỹ thuật:** Giai đoạn C3 Hardening đã giải quyết triệt để 100% các lỗ hổng và thiếu sót về logic kế toán, lũy biến giao dịch, bảo toàn dòng tiền cọc và trải nghiệm người dùng được chuyên gia chỉ ra.
* **Xếp hạng nghiệm thu:** `LOCAL_GATE_PASSED`. Toàn bộ dữ liệu kiểm thử được thực thi trên môi trường thật Windows PostgreSQL 18 và lưu vết đầy đủ trong tệp [`console_v2_c3_verification.json`](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_c3_verification.json).
