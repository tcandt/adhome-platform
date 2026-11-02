# ADHOME CONSOLE V2 & LANDING — BÁO CÁO NGHIỆM THU KỸ THUẬT: UI-ROUNDED-SHELL-AND-LOGO-LOADER

**Ngày nghiệm thu:** 02/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi nghiệm thu:**
1. **Loại bỏ điểm giao cắt Header/Sidebar & Bo tròn góc Workspace Canvas:**
   - Xóa bỏ đường viền vuông góc cắt thô giữa Header và Sidebar (khu vực khoanh tròn ở ảnh phản hồi của người dùng).
   - Phần trên cùng (y = 0 đến 64px) là dải trắng phẳng liền mạch chứa Logo AdHome, Toggle Sidebar [≡], Thanh tìm kiếm trung tâm Ctrl+K, Thông báo và Profile Admin; không có đường kẻ dọc cắt giữa Logo và Toggle.
   - Vùng nội dung chính (`main` content canvas) được định hình với góc bo tròn mềm mại `rounded-tl-[24px]` cùng đường viền `border-t border-l border-slate-200/90 dark:border-slate-800/90 bg-[#F8FAFC] dark:bg-[#0B0F19]`, chuẩn xác theo bản vẽ phác thảo tay.
2. **Khắc phục lỗi thanh đen khi refresh & Triển khai Logo Fill Loader Tối Giản theo chuẩn Animate UI:**
   - Xóa bỏ vĩnh viễn hiện tượng thanh đen / khung chớp giật khi F5 reload trên màn hình điện thoại và máy tính.
   - Bổ sung pre-hydration inline SVG splash trong thẻ `<div id="root">` tại cả `apps/console/index.html` và `apps/landing/index.html`, hiển thị ngay lập tức trong 0ms trước khi JavaScript tải xong.
   - **Tối giản hóa theo chuẩn Animate UI:** Loại bỏ hoàn toàn thanh tiến độ ngang (`horizontal progress bar`) và dòng trạng thái chữ dài dòng (`statusText / percentage`).
   - Logo chuyển đổi từ lớp nền trắng xám (0%) lên màu logo thực (100%) theo tiến trình đo lường thực tế (`UI-12` & `UI-13`) bám sát các pha kết nối thực: PostgreSQL, xác thực Admin, đồng bộ danh mục bất động sản, không dùng timer ảo.

---

## 1. Kết Quả Kiểm Thử Chất Lượng Tự Động (Quality Gates)

| Mã kiểm thử | Hạng mục kiểm tra | Tiêu chuẩn đánh giá | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :--- | :---: |
| **QA-ROUND-01** | Khử điểm giao cắt (Crosshair seam) | Loại bỏ `border-r` Sidebar Container & `border-b` Header | Dải top 64px phẳng liền mạch 100%, không đường cắt thô | **PASS** |
| **QA-ROUND-02** | Bo tròn Canvas Content (`rounded-tl`) | Khung nội dung `rounded-tl-[24px]` với `border-t border-l` | Đường cong bo tròn mềm mại, chuyển tiếp hoàn hảo | **PASS** |
| **QA-LOADER-01** | Khử thanh đen khi refresh (Pre-hydration) | Inline SVG splash trong `<div id="root">` ở cả Console & Landing | 0ms render không flash, không thanh đen unstyled | **PASS** |
| **QA-LOADER-02** | Boot Progress Orchestrator (`UI-12`) | Đo lường tiến độ các pha mạng thực: Auth $\rightarrow$ Portfolio $\rightarrow$ Ready | Phản ánh chính xác pha vận hành thực, không timer giả | **PASS** |
| **QA-LOADER-03** | AdHome Logo Fill Loader Tối Giản (`UI-13`) | 2 lớp SVG (Silhouette trắng xám + Gradient Fill) từ đáy lên đỉnh | Logo chuyển đổi mượt mà, loại bỏ thanh ngang và text dài | **PASS** |
| **QA-03 / C2-00** | Mobile Touch Targets | 26/26 controls trên Mobile $\ge 44\times 44\text{px}$ | 26/26 Passed, 0 vi phạm | **PASS** |
| **QA-04** | Multi-Viewport Table Matrix | 1280, 1366, 1440, 1920px có scrollWidth $\le$ innerWidth | Không tràn ngang viewport, sticky column ghim chuẩn | **PASS** |
| **QA-06** | Focus Trap & Escape Sheet | Mobile Bottom Sheet giữ focus trap, Escape đóng và hoàn trả focus | Phục hồi 100% focus về nút trigger kích hoạt | **PASS** |
| **QA-07** | Disk Evidence Integrity | 12/12 tệp PNG trên ổ đĩa khớp 100% SHA-256 manifest | 12/12 tệp toàn vẹn, 0 tệp unmanaged | **PASS** |
| **SEC-01** | Production Admin Invariant | Tài khoản production `admin@adhome.vn` tuyệt đối bất biến | 100% bất biến, không bị biến đổi | **PASS** |

---

## 2. Bảng Đối Chiếu Bằng Chứng Hình Ảnh (SHA-256 Manifest)

Thư mục lưu trữ bằng chứng: `docs/evidence/console-v2/UI-ROUNDED-SHELL-AND-LOGO-LOADER/screenshots/`

| Tệp hình ảnh | Viewport | Kích thước (bytes) | Mã băm SHA-256 |
| :--- | :---: | :---: | :--- |
| `minimalist_logo_loader_mobile_390x844.png` | 390×844 | 68,258 | `c6957a8f5199b4eed9c1fa6195f3daee151868dd6042ba29d78f145275ab5f8c` |
| `minimalist_logo_loader_console_mobile.png` | 390×844 | 56,081 | `60f0af55a2ed29b38f5981ebc1371e10a1a96489228ccc52477e5a402bacc8e8` |
| `redesign_desktop_1440_header_expanded.png` | 1440×900 | 384,936 | `178fc177666dca163982c2443b8eea0e500f78a489847b1cb9d0a86bd6281a27` |
| `redesign_desktop_1440_header_collapsed.png` | 1440×900 | 344,536 | `9fad85f9c5b3eaee6a5ddcef8ec017fedb9af748133191caf7f43af15c81ce15` |
| `redesign_desktop_1280_header_contracts.png` | 1280×720 | 342,116 | `6c347acc581756122be12c07e470032b929b9bab5f7a2fb6ab12409d8b1094dc` |
| `redesign_desktop_1920_header_overview.png` | 1920×1080 | 436,434 | `1110fb836296849f05f70f8c277eaf0f8761bfbbf06f88e334a6c5f1edb6a26a` |
| `redesign_desktop_1280_contracts_table_expanded.png` | 1280×720 | 340,866 | `87498460babeff05627b0e85749ee1a91f25d3cbb49e0419717f1d84772ab37f` |
| `redesign_desktop_1280_contracts_table_collapsed.png` | 1280×720 | 284,267 | `168b50432985cda1c8db8cc915da88dad4baeffb4d4efeb094cb6db29991a067` |
| `redesign_desktop_contracts_table_polished.png` | 1440×900 | 457,821 | `d02bfe61f7e7b7606367a2767178421fca5f21a70c84edc854cb286e62d17256` |
| `redesign_desktop_contracts_menu_open.png` | 1440×900 | 474,864 | `c929a44f9f21734213a684992751922369a2ed7b230cb0efdb9911f83ab64c82` |
| `redesign_mobile_390x844_contracts_cards.png` | 390×844 | 135,859 | `aa8ecd3185b902b156e37b70e174f8de0fb986cfdb85ea795ac903b2a52dcf9d` |
| `redesign_mobile_390x844_actions_bottom_sheet.png` | 390×844 | 107,886 | `641efee205d055483b54fe77bec10be641d66846bc3c89b8849972f561ed73eb` |

---

## 3. Kết Luận Nghiệm Thu

1. **Khử hoàn toàn điểm giao cắt thô:** Không còn bất kỳ đường viền thừa nào giữa Logo và Toggle; toàn bộ vùng đầu trang mang lại cảm giác thoáng đãng, đồng bộ và cao cấp.
2. **Góc bo cong Canvas đạt chuẩn thiết kế:** Khung làm việc chính uốn cong mềm mại (`24px`), tách biệt nội dung với nền tảng mà không làm đứt gãy bố cục.
3. **Logo Loader Tối Giản Tinh Tế:** Loại bỏ hoàn toàn thanh tiến độ ngang và văn bản dài dòng; trải nghiệm loading đạt tính thẩm mỹ cao của Animate UI, logo lấp đầy từ trắng xám sang màu thực tế theo tiến trình mạng 100% đo lường được.
