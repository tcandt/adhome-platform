"""Render the current rental flow as a single, shareable PNG."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/design/rental-codegraph.png"
W, H = 2200, 2600
BG, PANEL, INK, MUTED = "#091522", "#122438", "#f0f7ff", "#b9cddd"
BLUE, CYAN, GREEN, AMBER, VIOLET = "#588cff", "#55d5d5", "#66d9a2", "#ffc76a", "#b99aff"
img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
regular = "C:/Windows/Fonts/arial.ttf"
bold = "C:/Windows/Fonts/arialbd.ttf"
F = {n: ImageFont.truetype(regular, n) for n in (23, 25, 27, 29, 33)}
B = {n: ImageFont.truetype(bold, n) for n in (25, 28, 32, 39, 52)}


def wrapped(text, font, width):
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split():
            test = f"{line} {word}".strip()
            if d.textlength(test, font=font) > width and line:
                lines.append(line)
                line = word
            else:
                line = test
        lines.append(line)
    return lines


def label(x, y, text, font, color=INK, max_width=None, step=37):
    lines = wrapped(text, font, max_width) if max_width else text.split("\n")
    for i, line in enumerate(lines):
        d.text((x, y + i * step), line, font=font, fill=color)
    return y + len(lines) * step


def box(x, y, w, h, title, body, color=BLUE, title_size=32, body_size=27):
    d.rounded_rectangle((x, y, x+w, y+h), radius=25, fill=PANEL, outline="#36506a", width=2)
    d.rounded_rectangle((x, y, x+w, y+10), radius=5, fill=color)
    label(x+28, y+27, title, B[title_size], INK, w-56, 40)
    label(x+28, y+84, body, F[body_size], MUTED, w-56, 37)


def arrow(x1, y1, x2, y2, color=CYAN, width=5):
    d.line((x1, y1, x2, y2), fill=color, width=width)
    if y2 > y1 and x1 == x2:
        d.polygon([(x2-12, y2-12), (x2+12, y2-12), (x2, y2+5)], fill=color)


d.text((70, 49), "SƠ ĐỒ MAPPING · QUY TRÌNH THUÊ PHÒNG", font=B[52], fill=INK)
label(70, 124, "Thuê ngay · Đặt cọc giữ phòng · Đồng bộ sổ sách → hợp đồng → hóa đơn → bàn giao", F[29], MUTED)
d.line((70, 185, W-70, 185), fill="#36506a", width=2)

# Entry routes and rental-model choice.
box(70, 235, 635, 225, "A · THUÊ NGAY", "Chọn phòng trống → thông tin khách → điều khoản → hợp đồng nháp.", CYAN)
box(782, 235, 635, 225, "B · GIỮ PHÒNG", "Phiếu đặt cọc → giữ phòng → chuyển thành hợp đồng khi khách nhận thuê.", AMBER)
box(1494, 235, 635, 225, "C · ĐỒNG BỘ SỔ", "Nhập hợp đồng đang ở, cọc hiện có và công nợ đầu kỳ; không ghi thu cũ lần nữa.", GREEN)
for x in (387, 1099, 1811):
    arrow(x, 460, x, 520)
d.line((387, 520, 1811, 520), fill=CYAN, width=5)
arrow(1099, 520, 1099, 578)
box(450, 580, 1299, 190, "CHỌN HÌNH THỨC THUÊ", "Thuê nguyên căn / nguyên phòng (ENTIRE_ROOM) hoặc thuê ở ghép (SHARED_ROOM). Bước này áp dụng khi tạo hợp đồng từ A, B hoặc C.", VIOLET, 39, 29)

d.line((1099, 770, 1099, 814), fill=CYAN, width=5)
d.line((560, 814, 1639, 814), fill=CYAN, width=5)
arrow(560, 814, 560, 858)
arrow(1639, 814, 1639, 858)
box(70, 860, 980, 290, "THUÊ NGUYÊN CĂN / PHÒNG", "Một khách thuê chính; có thể thêm người ở cùng. Giá thuê và tiền cọc theo toàn bộ phòng/căn. Một hợp đồng và một hóa đơn kỳ đầu.", BLUE, 32, 29)
box(1149, 860, 980, 290, "THUÊ Ở GHÉP", "Một khách thuê chính (PRIMARY), thêm người ở cùng (ROOMMATE), giới hạn bởi maxOccupants. Hiện dùng chung một hợp đồng, một cọc và một hóa đơn; chưa tách theo giường.", VIOLET, 32, 29)
arrow(560, 1150, 560, 1195)
arrow(1639, 1150, 1639, 1195)
box(70, 1197, 980, 245, "MAPPING PHÒNG + HỢP ĐỒNG", "ConsoleRoom.rentalModel = ENTIRE_ROOM; Contract.rentalModel = ENTIRE_ROOM. Thuê ngay: RESERVED; đồng bộ sổ: OCCUPIED.", BLUE, 32, 27)
box(1149, 1197, 980, 245, "MAPPING PHÒNG + HỢP ĐỒNG", "ConsoleRoom.rentalModel = SHARED_ROOM; Contract.rentalModel = SHARED_ROOM. Người cùng phòng lưu tại RoomOccupant.", VIOLET, 32, 27)
d.line((560, 1442, 560, 1490), fill=CYAN, width=5)
d.line((1639, 1442, 1639, 1490), fill=CYAN, width=5)
d.line((560, 1490, 1639, 1490), fill=CYAN, width=5)
arrow(1099, 1490, 1099, 1520)

# Shared downstream path.
box(70, 1522, 635, 245, "1 · A/B: KIỂM TRA NHÁP", "Thuê ngay / giữ phòng: phát hiện sai → sửa khách, người ở cùng, điều khoản và hình thức thuê; cập nhật phòng + hợp đồng.", AMBER)
box(782, 1522, 635, 245, "2 · ĐĂNG KÝ ZALO BOT", "Gợi ý DANGKY <PHÒNG> <SĐT>, cho sao chép; đợi Bot xác minh đúng phòng và số điện thoại.", VIOLET)
box(1494, 1522, 635, 245, "3 · GỬI HÓA ĐƠN", "Tạo hóa đơn kỳ đầu; chỉ báo đã gửi khi Bot API xác nhận thành công.", CYAN)
arrow(705, 1644, 782, 1644)
arrow(1417, 1644, 1494, 1644)
arrow(1811, 1767, 1811, 1820)
box(1494, 1823, 635, 245, "4 · THU TIỀN TẠI HÓA ĐƠN", "Mở hóa đơn để ghi nhận khoản thu. Không thu tiền trong popup hồ sơ thuê.", GREEN)
arrow(1494, 1945, 1417, 1945)
box(782, 1823, 635, 245, "5 · BÀN GIAO TỰ ĐỘNG", "Khi hóa đơn đầu kỳ được thu đủ: hợp đồng ACTIVE, phòng OCCUPIED; bàn giao được ghi nhận tự động.", GREEN)
arrow(782, 1945, 705, 1945)
box(70, 1823, 635, 245, "6 · VẬN HÀNH VỀ SAU", "Đồng bộ sổ đi thẳng bước này. Điện nước, tiền phòng, hợp đồng sắp hết hạn → thông báo Zalo Bot theo mẫu.", CYAN)

d.rounded_rectangle((70, 2120, 2129, 2480), radius=25, fill="#102b35", outline="#33727a", width=2)
label(100, 2150, "QUY TẮC SỔ SÁCH VÀ TRẠNG THÁI", B[32], CYAN)
label(100, 2210, "THUÊ NGAY: hợp đồng DRAFT → hóa đơn đầu kỳ → thu đủ tại hóa đơn → ACTIVE + OCCUPIED + bàn giao.", F[27], INK, 1960, 39)
label(100, 2288, "GIỮ PHÒNG: cọc giữ phòng → chuyển phiếu sang hợp đồng nháp → đối trừ cọc trên hóa đơn đầu kỳ.", F[27], INK, 1960, 39)
label(100, 2366, "ĐỒNG BỘ SỔ: ghi nhận số dư đầu kỳ và trạng thái đang ở; không tạo lại giao dịch thu tiền lịch sử.", F[27], INK, 1960, 39)

label(70, 2534, "Nguồn: docs/design/rental-codegraph.html · Cập nhật 05/11/2026", F[23], MUTED)
OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, optimize=True)
print(OUT)
