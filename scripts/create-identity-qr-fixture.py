from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel

out = Path('.artifacts/rental-workflow/qr')
out.mkdir(parents=True, exist_ok=True)
payload = '000000000001||NGUYEN VAN TEST|20051995|Nam|DIA CHI KIEM THU|01112021'
code = QRCode(None, QRErrorCorrectLevel.M)
code.addData(payload)
code.make()
size = len(code.modules)
image = Image.new('RGB', ((size + 8) * 8, (size + 8) * 8), 'white')
draw = ImageDraw.Draw(image)
for y, row in enumerate(code.modules):
    for x, dark in enumerate(row):
        if dark:
            draw.rectangle(((x + 4) * 8, (y + 4) * 8, (x + 5) * 8 - 1, (y + 5) * 8 - 1), fill='black')
image.save(out / 'identity.png')
Image.new('RGB', (400, 400), 'white').save(out / 'blank.png')
frame = Image.new('RGB', (640, 480), 'white')
image.thumbnail((440, 440), Image.Resampling.NEAREST)
frame.paste(image, ((640 - image.width) // 2, (480 - image.height) // 2))
y, u, v = frame.convert('YCbCr').split()
pixels = y.tobytes() + u.resize((320, 240)).tobytes() + v.resize((320, 240)).tobytes()
with (out / 'camera.y4m').open('wb') as target:
    target.write(b'YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n')
    for _ in range(30):
        target.write(b'FRAME\n' + pixels)
print('Created synthetic QR image, blank image and camera fixture.')
