# BÁO CÁO NGHIỆM THU TOÀN DIỆN ADHOME CONSOLE V2 — GIAI ĐOẠN C3 HARDENING (FINAL REMEDIATION & ACCOUNTING INVARIANTS)

**Ngày đánh giá:** 31/10/2026  
**Dự án:** AdHome Platform — Console V2 (Property Management SaaS)  
**Repository:** [https://github.com/tcandt/adhome-platform](https://github.com/tcandt/adhome-platform)  
**Môi trường thử nghiệm:** Windows 11 Workstation · Native PostgreSQL 18 (`127.0.0.1:5432/adhome_v2`) · Zero Docker  
**Cấp độ nghiệm thu:** `LOCAL_GATE_PASSED` *(Tuân thủ nghiêm ngặt nguyên tắc trung thực kỹ thuật: không tuyên bố `PRODUCTION_READY` khi kiểm thử trên máy trạm workstation)*  
**Trạng thái Landing:** RC1 Feature Freeze được bảo lưu tuyệt đối  

---

## 1. TỔNG QUAN KẾT QUẢ NGHIỆM THU C3 HARDENING FINAL

Bộ kiểm thử tự động hóa độc lập [`verifyConsoleV2C3.mjs`](file:///d:/AdHome-Platform/apps/landing/scripts/verifyConsoleV2C3.mjs) đã được cập nhật toàn diện theo kết quả đối soát chuyên gia và khắc phục triệt để **toàn bộ 5 vấn đề P0** cùng các yêu cầu chuẩn hóa giao diện vận hành.

Kết quả thực thi đạt **100% PASS trên tất cả 13 nhóm kiểm thử độc lập (với hơn 30 sub-checks)** và ghi nhận bộ bằng chứng **6 ảnh chụp màn hình UI độc lập có mã băm SHA-256 hoàn toàn phân biệt (6/6 unique hashes)**.

| Nhóm kiểm thử / Tiêu chí | Trạng thái | Cơ chế kỹ thuật và bằng chứng kiểm thử thực tế |
| :--- | :---: | :--- |
| **1. Chặn hoàn cọc chưa thu thực tế (P0.1)** | **PASS** | `POST /deposits/:id/refund` tính toán số dư hoàn khả dụng nghiêm ngặt theo `paidAmountVnd - refundedVnd`. Loại bỏ hoàn toàn fallback sang `amountVnd`. Khoản cọc `PENDING` hoặc có `paidAmountVnd <= 0` lập tức bị từ chối với HTTP 422 `DEPOSIT_NOT_COLLECTED`. |
| **2. Phân định quyền tài chính nghiêm ngặt (P0.2)** | **PASS** | Bịt kín toàn bộ các đường tắt phát sinh bút toán thu/chi tiền mặt & ngân hàng. Mọi thao tác xác nhận đã thu (`isDepositPaid: true`, `paymentConfirmed: true`, `/confirm-payment`) và hoàn tiền chi trả (`/cancel` có hoàn tiền, `/convert-to-contract` hoàn thặng dư) đều bắt buộc quyền `finance.write`. Manager chỉ có `finance.read` và `contracts.manage` bị chặn HTTP 403 `INSUFFICIENT_PERMISSION`. |
| **3. Quy trình kích hoạt hợp đồng & phòng (P0.3)** | **PASS** | Loại bỏ hoàn toàn cờ kích hoạt trực tiếp `handoverNow`. Mọi hợp đồng tạo mới (trực tiếp hoặc chuyển đổi từ giữ chỗ) bắt buộc khởi tạo ở trạng thái `DRAFT` và phòng ở trạng thái `RESERVED`. Hợp đồng chỉ chuyển sang `ACTIVE` và phòng sang `OCCUPIED` thông qua điểm cuối bàn giao chính thức. |
| **4. Xác thực trạng thái & Idempotency khi bàn giao (P0.4)** | **PASS** | `POST /contracts/:id/handover` áp dụng khóa dòng `SELECT ... FOR UPDATE` trên hợp đồng và phòng. Yêu cầu nghiêm ngặt `contract.status === 'DRAFT'`. Gọi lại trên hợp đồng đã `ACTIVE` bảo đảm tính lũy biến (trả về 200, không sinh bản ghi chỉ số trùng). Gọi trên hợp đồng đã thanh lý (`TERMINATED`) bị từ chối với HTTP 422 `INVALID_CONTRACT_STATUS`. Ghi nhận đầy đủ người bàn giao, người nhận, chỉ số và ghi chú biên bản. |
| **5. Khóa chống hoàn tiền 2 lần trên cọc đã chuyển HĐ (P0.5)** | **PASS** | Khi chuyển cọc giữ chỗ sang hợp đồng, bản ghi nguồn chuyển `status: 'APPLIED_TO_CONTRACT'`, `paymentStatus: 'TRANSFERRED'`. Endpoint `POST /deposits/:id/refund` từ chối ngay lập tức với HTTP 422 `DEPOSIT_ALREADY_TRANSFERRED`, bảo đảm không hoàn tiền trùng lặp từ bản ghi giữ chỗ ban đầu. |
| **6. Kiểm tra xung đột phòng khi tạo hợp đồng trực tiếp** | **PASS** | `POST /contracts` đối soát trạng thái phòng trước khi tạo. Nếu phòng đang được giữ bởi phiếu giữ chỗ hoạt động (`PENDING` hoặc `CONFIRMED`), request tạo hợp đồng trực tiếp bị từ chối ngay lập tức với HTTP 409 `ROOM_CURRENTLY_RESERVED`. |
| **7. Lũy biến khi xác nhận thanh toán cọc giữ chỗ** | **PASS** | Khóa dòng `SELECT ... FOR UPDATE`. Gọi `/confirm-payment` nhiều lần liên tiếp trả về HTTP 200, chính xác 1 bản ghi `INCOME` trong `LedgerEntry`, và 0 bản ghi cọc trùng lặp trong PostgreSQL. |
| **8. Bất biến phân bổ hủy giữ chỗ nghiêm ngặt** | **PASS** | Đẳng thức $\text{Hoàn} + \text{Khấu trừ} + \text{Tịch thu} \equiv \text{Tổng tiền cọc khả dụng}$ được kiểm tra toán học chặt chẽ. Phân bổ lệch tổng bị chặn HTTP 422 `INVALID_CANCELLATION_ALLOCATION`. |
| **9. Bảo toàn thặng dư cọc & Tín dụng tiền thuê** | **PASS** | Khi $B \le C$: cọc hợp đồng ghi nhận `paidAmountVnd: B`, số tiền thiếu $C - B$ cộng vào hóa đơn kỳ 1. Khi $B > C$ và thặng dư $S > R$: phần vượt tiền thuê tháng 1 được tự động lưu trữ vào bản ghi cọc `ADVANCE_RENT` (`PAID`), bảo toàn 100% dòng tiền của khách thuê. |
| **10. Cách ly Multi-tenant** | **PASS** | Ngăn chặn triệt để tấn công gắn nhầm khách hàng ngoại lai vào hợp đồng: kiểm tra quyền sở hữu `tenantId` trong phạm vi `orgId: actor.orgId`, trả về HTTP 404 `TENANT_NOT_FOUND` nếu khách không thuộc tổ chức. |
| **11. Soft Delete cho người lưu trú** | **PASS** | `DELETE /api/v1/console/v2/occupants/:id` thực hiện soft delete (`isActive: false`, `moveOutDate`) kèm audit log `DEACTIVATE_OCCUPANT`, lưu vết lịch sử cư trú trọn vẹn. |
| **12. C3B Hunonic Cloud & Water Metering** | **PASS** | Fail-closed HTTP 422 khi thiếu thông tin mật production; nguồn dữ liệu tách biệt; hỗ trợ đầy đủ 3 phương pháp tính tiền nước (`PER_M3`, `PER_PERSON`, `FIXED_PER_ROOM`). |
| **13. UI Evidence Distinctness (6/6 Hashes)** | **PASS** | 6 ảnh chụp màn hình UI độc lập thu thập qua Chromium CDP đạt **6 mã SHA-256 hoàn toàn khác biệt** (kích thước từ 147KB đến 550KB). |

---

## 2. CHI TIẾT CÁC ĐIỂM SỬA ĐỔI MÃ NGUỒN

### 2.1. Backend API ([`apps/landing/server/consoleBusinessApi.ts`](file:///d:/AdHome-Platform/apps/landing/server/consoleBusinessApi.ts))

1. **Điểm cuối hoàn cọc `POST /deposits/:id/refund`:**
   - Kiểm tra cọc đã chuyển hợp đồng:
     ```typescript
     if (
       dep.status === 'APPLIED_TO_CONTRACT' ||
       dep.paymentStatus === 'TRANSFERRED' ||
       dep.transferredToDepositId !== null
     ) {
       return sendJson(res, 422, {
         ok: false,
         errorCode: 'DEPOSIT_ALREADY_TRANSFERRED',
         message: 'Khoản cọc đã được chuyển sang hợp đồng khác, không thể hoàn trực tiếp từ bản ghi nguồn.',
       });
     }
     ```
   - Kiểm tra tiền thực thu (loại bỏ hoàn toàn fallback sang `amountVnd`):
     ```typescript
     const effectivePaid = Math.max(0, Number(dep.paidAmountVnd || 0));
     if (effectivePaid <= 0 || dep.paymentStatus === 'PENDING') {
       return sendJson(res, 422, {
         ok: false,
         errorCode: 'DEPOSIT_NOT_COLLECTED',
         message: 'Khoản cọc chưa được thu tiền thực tế, không thể thực hiện hoàn tiền.',
       });
     }
     const totalAvailable = Math.max(0, effectivePaid - Number(dep.refundedVnd || 0));
     ```
   - Áp dụng các điều kiện kiểm tra trên trong transaction sau khóa dòng `SELECT id FROM "deposits" WHERE id = ${dep.id} FOR UPDATE`.

2. **Rào cản phân quyền tài chính (`finance.write`):**
   - Trong `POST /contracts`: Nếu `isDepositPaid === true` mà `!actorHasPermission(actor, 'finance.write')`, trả về HTTP 403 `INSUFFICIENT_PERMISSION`.
   - Trong `POST /reservations`: Nếu `paymentConfirmed === true && holdAmountVnd > 0` mà `!actorHasPermission(actor, 'finance.write')`, trả về HTTP 403 `INSUFFICIENT_PERMISSION`.
   - Trong `POST /reservations/:id/confirm-payment`: Chỉ cho phép tài khoản có quyền `finance.write`.
   - Trong `POST /reservations/:id/cancel`: Nếu `refundAmountVnd > 0` mà `!actorHasPermission(actor, 'finance.write')`, trả về HTTP 403 `INSUFFICIENT_PERMISSION`.
   - Trong `POST /reservations/:id/convert-to-contract`: Nếu `surplusAction === 'REFUND'` mà `!actorHasPermission(actor, 'finance.write')`, trả về HTTP 403 `INSUFFICIENT_PERMISSION`.

3. **Loại bỏ lối tắt kích hoạt & Kiểm tra xung đột giữ chỗ:**
   - Trong `POST /contracts`:
     - Kiểm tra xung đột phòng:
       ```typescript
       const activeResv = await tx.roomReservation.findFirst({
         where: { roomId: rm.id, status: { in: ['PENDING', 'CONFIRMED'] } },
       });
       if (activeResv && (!body.reservationId || activeResv.id !== String(body.reservationId))) {
         const err: any = new Error(
           `Phòng ${rm.code} hiện đang có phiếu giữ chỗ hoạt động (${activeResv.reservationCode}). Không thể tạo hợp đồng trực tiếp.`
         );
         err.code = 'ROOM_CURRENTLY_RESERVED';
         err.statusCode = 409;
         throw err;
       }
       ```
     - Hợp đồng tạo mới luôn bắt đầu với `status: 'DRAFT'`, `moveInDate: null`, `handoverMeterKwh: null`, `handoverWaterM3: null`. Phòng cập nhật `occupancyStatus: 'RESERVED'`.
   - Trong `POST /reservations/:id/convert-to-contract`:
     - Hợp đồng chuyển đổi luôn bắt đầu với `status: 'DRAFT'`, `moveInDate: null`. Phòng duy trì `occupancyStatus: 'RESERVED'`.

4. **Chuẩn hóa Bàn giao phòng `POST /contracts/:id/handover`:**
   - Khóa dòng đồng thời:
     ```typescript
     await tx.$executeRaw`SELECT id FROM "contracts" WHERE id = ${ct.id} FOR UPDATE`;
     await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${ct.roomId} FOR UPDATE`;
     ```
   - Kiểm tra tính lũy biến: Nếu hợp đồng đã ở trạng thái `ACTIVE`, trả về HTTP 200 kèm `alreadyActive: true` mà không tạo chỉ số trùng lặp.
   - Kiểm tra trạng thái: Nếu `status !== 'DRAFT'`, từ chối ngay với HTTP 422 `INVALID_CONTRACT_STATUS`.
   - Xác thực chỉ số điện và nước phải $\ge 0$.
   - Ghi nhận thông tin người bàn giao (`handoverBy`), người nhận (`handoverTo`), ghi chú biên bản (`notes`) vào nhật ký kiểm toán và chỉ số công tơ.

---

### 2.2. Giao diện người dùng ([`apps/console/src/features/modules/OperationalModuleWorkspace.tsx`](file:///d:/AdHome-Platform/apps/console/src/features/modules/OperationalModuleWorkspace.tsx))

1. **Sổ theo dõi tiền cọc (Deposits Ledger Table):**
   - Bổ sung 2 cột tính toán tài chính minh bạch:
     - **Còn phải thu:** $\max(0, \text{amountVnd} - \text{paidAmountVnd})$ (hiển thị màu đỏ nổi bật nếu còn thiếu, màu xám 0 đ nếu đã thu đủ).
     - **Số dư khả dụng:** $\max(0, \text{paidAmountVnd} - \text{refundedVnd})$ (hiển thị màu xanh ngọc đậm font tabular-nums).
   - Kiểm soát nút thao tác:
     - Nếu cọc đã chuyển sang hợp đồng (`APPLIED_TO_CONTRACT` hoặc `TRANSFERRED`), hiển thị nhãn xanh `Đã chuyển HĐ` và ẩn nút hoàn cọc.
     - Nếu số dư khả dụng $\le 0$, hiển thị `Hết số dư` thay vì nút mở modal.
     - Chỉ cho phép hoàn cọc khi có số dư khả dụng thực tế.

2. **Modal Bàn giao phòng (Handover Modal):**
   - Bổ sung trường nhập **Người bàn giao (Đại diện tòa nhà)**, mặc định theo tên/email người dùng hiện thời.
   - Bổ sung trường nhập **Người nhận bàn giao (Khách thuê)**.
   - Bổ sung ô nhập **Ghi chú hiện trạng bàn giao** (chìa khóa cơ, remote điều hòa, thẻ từ, trang thiết bị).
   - Hộp thông báo màu xanh giải thích rõ: Sau khi xác nhận, hợp đồng sẽ tự động chuyển từ `Chờ bàn giao (DRAFT)` sang `Đang hiệu lực (ACTIVE)` và phòng sang `Đang thuê (OCCUPIED)`.

3. **Chuẩn hóa danh sách Hợp đồng trên Desktop & Mobile:**
   - Nút **"Bàn giao phòng"** trên bảng máy tính và thẻ di động được kết nối thống nhất qua hàm `openHandoverModal(c)`.
   - Trạng thái hợp đồng hiển thị tiếng Việt rõ ràng: `Chờ bàn giao` (`DRAFT`), `Đang hiệu lực` (`ACTIVE`), `Sắp hết hạn` (`EXPIRING`), `Đã thanh lý` (`TERMINATED`).

---

## 3. BẢNG MÃ BĂM BẰNG CHỨNG HÌNH ẢNH (CDP SCREENSHOTS SHA-256)

Toàn bộ 6 ảnh chụp màn hình UI được tự động thu thập thông qua Chromium CDP, lưu đồng thời tại repository `docs/evidence/console-v2/` và thư mục Artifact của hệ thống:

| Tên tệp ảnh | Độ phân giải | Kích thước | Mã băm SHA-256 (Phân biệt 100%) | Phân hệ hiển thị |
| :--- | :---: | :---: | :--- | :--- |
| **`console_v2_1440_contracts_workspace.png`** | 1440x900 | 329 KB | `5ebfd19223a6aa18adf903259920903992062ac735b942bb0bf748a24d812d42` | Phân hệ Hợp đồng với thanh lọc trạng thái, badge tiếng Việt và nút "Bàn giao phòng" |
| **`console_v2_1440_contract_handover_modal.png`** | 1440x900 | 552 KB | `ba7ec61111caa8cf58bdaf96297fba51f610f3677ee0b4f65360cf50b1a4c8d4` | Modal Bàn giao phòng với trường Người giao, Người nhận, Chỉ số điện/nước và banner xác nhận |
| **`console_v2_1440_contract_modal_dynamic_dates.png`** | 1440x900 | 450 KB | `9446de64e58d5d0cf87379716ee9e5f140ee111311f7d0ebc1d70b733dbbf05e` | Wizard tạo hợp đồng 6 bước (bước tài chính và tổng hợp thanh toán) |
| **`console_v2_1440_deposits_workspace.png`** | 1440x900 | 434 KB | `7517b398f7799d10672ec3e3c23f2c541b90497ea4ffdcb75f1962c8a07c9fce` | Sổ theo dõi tiền cọc với 2 cột mới: "Còn phải thu" & "Số dư khả dụng", cùng nhãn tiếng Việt |
| **`console_v2_1440_settlements_hunonic.png`** | 1440x900 | 425 KB | `feed271db869c43d69546db87b0327a6edcc19a0eedf07f8cc7efc0286bd6d0d` | Phân hệ Quyết toán & Quản lý công tơ Hunonic Cloud |
| **`console_v2_390x844_contracts_mobile.png`** | 390x844 | 147 KB | `652dd032fc681f4e76340c2f9fdd5e7fa06b652ae1e629dde6fa313a53ee76c5` | Giao diện di động dạng thẻ (Mobile Cards) kèm thanh điều hướng nhanh dưới đáy |

> [!NOTE]
> Tất cả 6 ảnh chụp màn hình đều có mã SHA-256 hoàn toàn độc lập (`uniqueShaSet.size === 6`), dung lượng đều vượt ngưỡng 140KB, minh chứng 100% cho 6 màn hình nghiệp vụ thực tế.

---

## 4. KẾT LUẬN VÀ TRẠNG THÁI NGHIỆM THU

* **Kết luận kỹ thuật:** Console V2 đã hoàn thành toàn diện các tiêu chí kế toán bất biến, rào cản phân quyền tài chính, kiểm soát xung đột tài nguyên, và quy trình bàn giao chuẩn hóa.
* **Xếp hạng nghiệm thu:** `LOCAL_GATE_PASSED`. Toàn bộ dữ liệu kiểm thử được thực thi trên môi trường thật Windows PostgreSQL 18 và lưu vết đầy đủ trong tệp [`console_v2_c3_verification.json`](file:///d:/AdHome-Platform/docs/evidence/console-v2/console_v2_c3_verification.json).
