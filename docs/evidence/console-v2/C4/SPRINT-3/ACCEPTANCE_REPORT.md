# ADHOME CONSOLE V2 — ACCEPTANCE REPORT (C4 SPRINT 3)
**Task ID:** `C4-SPRINT-3-REMEDIATION`  
**Date:** 2026-10-31T15:49:07.031Z  
**Gate Status:** **`LOCAL_GATE_PASSED`**  
**Base Commit SHA:** `0fbe9bcbe529b6f169bceba317941222d557a414`  
**Database:** Local PostgreSQL 18 (`127.0.0.1:5432/adhome_v2`)  
**Scope:** `C4-IMPORT-01`, `C4-IMPORT-02`, `C4-OCC-01` (End-to-End Scenarios `E2E-14`, `E2E-15`, `E2E-16`)

---

## 1. Executive Summary & Verification Highlights

| Task / Domain | Requirements & Business Rules Verified | Status |
|---|---|:---:|
| **`C4-IMPORT-01`**<br>Wizard nhập khách sổ giấy | Hỗ trợ nhập liệu lô hợp đồng từ sổ cũ: Tòa & phòng, thông tin khách thuê, ngày bắt đầu/kết thúc, ngày chốt thu tiền (`paidThrough`), tiền cọc đầu kỳ và danh sách người ở ghép. | **PASS** |
| **`C4-IMPORT-02`**<br>Opening Balances & Dry-run | Đối soát số dư đầu kỳ qua `POST /api/v1/console/v2/import/tenants/preview`. Cam kết **bảo toàn tài chính (`E2E-15`)**: Khoản cọc ghi nhận nghĩa vụ `HELD`, **0 đ dòng tiền thu mới (`CASH_IN`)** trong sổ cái hiện tại. Chặn xuất hóa đơn lịch sử (`E2E-14`). Idempotency replay an toàn (`E2E-16`). | **PASS** |
| **`C4-OCC-01`**<br>Occupancy làm Source-of-Truth | Phòng chuyển sang `OCCUPIED`, liên kết đúng `Tenant`, hợp đồng `ACTIVE` và `RoomOccupant`. API `GET /api/v1/console/v2/occupancy` xác nhận **tính nhất quán 100% (`isConsistent: true`)** cho cả mô hình `ENTIRE_ROOM` và `SHARED_ROOM`. | **PASS** |

---

## 2. Detailed Test Results & Invariants Enforced

### 2.1. `C4-IMPORT-01` — Wizard Data Validation & Preview
- [x] **previewResolvesRoomsAndCalculatesLiabilities**: PASS ({"statusCode":200,"totalRows":2,"validRows":2,"totalOpeningDepositVnd":10200000})
- [x] **validationRejectsInvalidPhoneAndInvertedDates**: PASS ({"status":"INVALID","errors":["Số điện thoại không hợp lệ (yêu cầu số di động Việt Nam 10 chữ số).","Ngày bắt đầu hợp đồng phải nhỏ hơn hoặc bằng ngày kết thúc."]})

### 2.2. `C4-IMPORT-02` — Commit, Opening Balances, Zero Cash-In & Idempotency
- [x] **commitCreatesContractsAndReturnsSummary**: PASS ({"totalOpeningDepositVnd":10500000,"totalRoomsOccupied":2,"tenantsCreated":0,"contractsCreated":2,"financialPolicy":"ZERO_CURRENT_PERIOD_CASH_IN_PRESERVED","reconciliationNotes":"Khoản cọc lịch sử được chuyển thành nghĩa vụ HELD. Không phát sinh dòng tiền thu mới (CASH_IN) vào sổ cái hiện tại."})
- [x] **financialIntegrityZeroCashInOpeningBalanceLiability**: PASS ({"depositsCount":2,"allDepositsHeldAndPaid":true,"zeroCashInGenerated":true,"ledgerDelta":0,"paymentTxDelta":0})
- [x] **historicalBillingGuardZeroPastInvoices**: PASS ({"invoicesCount":0})
- [x] **idempotencyAndDuplicatePreventionGuard**: PASS ({"replayStatus":200,"isReplay":true,"contractsCountNow":2,"tenantsCountNow":1})
- [x] **auditTrailBatchRecorded**: PASS ({"action":"IMPORT_HISTORICAL_TENANT_BATCH","summary":"Hoàn tất nhập lô dữ liệu sổ cũ S3-COMMIT-BATCH-1793461730483 (2 hợp đồng, 10.500.000 đ cọc đầu kỳ)"})

### 2.3. `C4-OCC-01` — Occupancy Source of Truth & Consistency
- [x] **importedRoomsTransitionToOccupied**: PASS ({"room301Status":"OCCUPIED","room302Status":"OCCUPIED"})
- [x] **primaryTenantAndOccupantsLinked**: PASS ({"room301Tenant":"Trần Đình Trọng","room302Tenant":"Hoàng Kim Chi","room302OccupantsCount":2})
- [x] **occupancySourceOfTruthConsistency100Percent**: PASS ({"totalRooms":5,"occupiedRooms":2,"availableRooms":3,"allConsistent":true})

---

## 3. Visual Evidence & High-Fidelity Screenshots (Chromium CDP)

| # | Filename | Viewport | Size (Bytes) | SHA-256 Checksum | Scenario Description |
|---|---|:---:|:---:|:---:|---|
| 1 | `c4_s3_desktop_import_step1_input.png` | 1440x900 | 490,985 | `d353b5a24a3a4bd9...` | Giao diện nhập liệu danh sách khách thuê sổ cũ với phòng, giá thuê, cọc đầu kỳ và ngày paidThrough |
| 2 | `c4_s3_desktop_import_step2_dryrun_preview.png` | 1440x900 | 602,100 | `6494e753e89a7d8b...` | Bảng đối soát số dư đầu kỳ (Opening Liability HELD, 0 đ CASH_IN, paidThrough) và kiểm tra tính hợp lệ |
| 3 | `c4_s3_desktop_import_step3_committed_report.png` | 1440x900 | 546,586 | `6524b941f6ea1a0e...` | Báo cáo hoàn tất chuyển đổi lô dữ liệu với mã tham chiếu batchKey và số lượng hợp đồng/phòng OCCUPIED |
| 4 | `c4_s3_desktop_occupancy_source_of_truth.png` | 1440x900 | 455,182 | `7662dd36af4e90c3...` | Bảng theo dõi lấp đầy phòng với trạng thái OCCUPIED/AVAILABLE, hợp đồng, người ở và huy hiệu Khớp 100% |
| 5 | `c4_s3_desktop_contracts_workspace_imported.png` | 1440x900 | 486,864 | `00198507532b60df...` | Danh sách hợp đồng thuê thể hiện hợp đồng mới chuyển đổi có ghi chú paidThrough và tiền cọc HELD |
| 6 | `c4_s3_mobile_import_wizard.png` | 390x844 | 172,341 | `4bb8fb5fedd014bf...` | Giao diện di động 390x844 hiển thị wizard chuyển đổi dữ liệu sổ cũ responsive với điều hướng cảm ứng |

**Checksum Distinctness Verification:** `100% DISTINCT (ZERO COLLISION)`

---

## 4. Financial Reconciliation Confirmation
- **Opening Deposit Liabilities (`HELD`):** 10,500,000 đ ghi nhận đầy đủ nghĩa vụ hoàn cọc trong tương lai.
- **Current Period Cash-In Ledger Delta:** `+0 đ` (Bảo toàn doanh thu và dòng tiền thực tế).
- **Historical Invoices Emitted:** `0` (Hóa đơn đầu tiên chỉ bắt đầu từ kỳ tiếp theo sau `paidThrough`).
- **Duplicate Prevention:** Replay cùng `batchKey` hoặc trùng số điện thoại không sinh bản ghi thừa.
