# ADHOME CONSOLE V2 — TỔNG HỢP HỒ SƠ BẰNG CHỨNG KIỂM TOÁN & NGHIỆM THU

Thư mục này lưu trữ toàn bộ hồ sơ bằng chứng kiểm thử (Evidence Bundles), ảnh chụp màn hình giao diện (Screenshots), bảng băm SHA-256 (Checksums), và biên bản nghiệm thu kỹ thuật (Acceptance Reports) của hệ thống **AdHome Console V2**.

> **Quy tắc quản lý bằng chứng:** Mỗi lần thay đổi giao diện hoặc nghiệm thu kiến trúc mới, một thư mục chuyên biệt sẽ được khởi tạo kèm toàn bộ ảnh chụp thực tế từ Chrome CDP và biên bản nghiệm thu đối chiếu chi tiết.

---

## Danh mục các đợt bằng chứng (Evidence Batches)

| STT | Tên thư mục đợt thay đổi | Mã Commit HEAD | Thời điểm | Nội dung nghiệm thu chính | Trạng thái |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **05** | [**`UI-REDESIGN-e60b23d/`**](UI-REDESIGN-e60b23d/README.md) | [`e60b23d`](https://github.com/tcandt/adhome-platform/commit/e60b23df6e3ace3d3bc7b92a5b072e22426d12b9) | 02/11/2026 | **Kiến trúc App Shell Floating Toggle (`UI-SIDEBAR-02`):** Nút toggle độc lập ngoài DOM ($44\times 44\text{px}$, $Y=10\text{px}$ cố định, $X=256\leftrightarrow 80\text{px}$, giữ nguyên focus); **Header 64px phẳng 2 vùng (`UI-HEADER-03`)** kèm Safe zone `pl-16`; **Toolbar phân hệ 2 tầng xác định**; Bộ test `QA-HEADER-01` 8 assertions 100% PASS; 10 ảnh CDP. | **PASS (MỚI NHẤT)** |
| 04 | [**`UI-REDESIGN/`**](UI-REDESIGN/ACCEPTANCE_REPORT.md) | `8615eff` | 01/11/2026 | Đợt Redesign giao diện Desktop & Mobile: Tối giản Header, thu gọn Sidebar 72px, ghim cột Thao tác bảng hợp đồng (`QA-04`), Touch targets Mobile 44px+ (`QA-03`), Bottom Sheet (`QA-06`). | **C2-00 CONDITIONAL** |
| 03 | [**`C4/`**](C4/) | `35ad47e` | 31/10/2026 | Hoàn thiện Sprint 0, 1, 2, 3, 4: Hunonic IoT Sync, Sổ quỹ Ledger, Hóa đơn điện tử, Bàn giao phòng. | **PASS** |
| 02 | [**`C3.2/`**](C3.2/) | `2d472d1` | 31/10/2026 | Báo cáo kiểm thử tải chịu tải dài hạn (Sustained Load Test) và kiểm tra tính toàn vẹn cơ sở dữ liệu. | **PASS** |
| 01 | [**`BASE-01/`**](BASE-01/) | `e3d4fb7` | 01/11/2026 | Hồ sơ kiểm toán cơ sở BASE-01: Sao lưu - phục hồi DB, kiểm tra an toàn dữ liệu khách thuê, xác minh quyền riêng tư. | **PASS** |

---

## Chi tiết đợt thay đổi mới nhất: `UI-REDESIGN-e60b23d/`
- Thư mục chi tiết: [`UI-REDESIGN-e60b23d/`](UI-REDESIGN-e60b23d/)
- Báo cáo nghiệm thu: [`ACCEPTANCE_REPORT.md`](UI-REDESIGN-e60b23d/ACCEPTANCE_REPORT.md)
- Manifest ảnh: [`screenshots-manifest.json`](UI-REDESIGN-e60b23d/screenshots-manifest.json)
- Bảng mã băm: [`checksums-verified.txt`](UI-REDESIGN-e60b23d/checksums-verified.txt)
- Thư mục ảnh chụp: [`screenshots/`](UI-REDESIGN-e60b23d/screenshots/)
