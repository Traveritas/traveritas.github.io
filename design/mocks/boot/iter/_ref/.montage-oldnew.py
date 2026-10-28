from PIL import Image, ImageDraw, ImageFont
import os
def font(sz):
    for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simsun.ttc", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()
fl, fc = font(22), font(15)
pairs = [
  ("旧 · 第一帧（48px 格 + 块内 Bayer）", r"design\mocks\boot\2-grain\.shots\00-start.png"),
  ("新 B · 第一帧（48px 纯平色块）", r"design\mocks\boot\iter\2-grain\.shots\b-flow-0000.png"),
  ("旧 · 600ms", r"design\mocks\boot\2-grain\.shots\02-lv2.png"),
  ("新 B · 550ms", r"design\mocks\boot\iter\2-grain\.shots\b-flow-0550.png"),
]
tw, th = 700, 438
lw, hh = 250, 46
sheet = Image.new("RGB", (lw+tw*2, hh+th*2), (10,11,20))
d = ImageDraw.Draw(sheet)
for i,(label,p) in enumerate(pairs):
    row, col = divmod(i, 2)
    y = hh + row*th
    d.text((12, y+th//2-14), label, font=fl, fill=(214,210,230))
    im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
    sheet.paste(im,(lw+col*tw, y))
out = r"design\mocks\boot\iter\_ref\board\old-vs-new-b.png"
sheet.save(out)
print(out, sheet.size)
