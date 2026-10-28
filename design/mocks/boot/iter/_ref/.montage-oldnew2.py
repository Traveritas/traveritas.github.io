from PIL import Image, ImageDraw, ImageFont
import os
def font(sz):
    for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simsun.ttc", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()
fl, fs, fc = font(22), font(14), font(16)
pairs = [
  ("旧 · 0ms", "48px 格 + 块内 Bayer", r"design\mocks\boot\2-grain\.shots\00-start.png"),
  ("新 B · 0ms", "48px 纯平色块", r"design\mocks\boot\iter\2-grain\.shots\b-flow-0000.png"),
  ("旧 · 600ms", "细密印刷颗粒", r"design\mocks\boot\2-grain\.shots\02-lv2.png"),
  ("新 B · 550ms", "连续收细、盒均值", r"design\mocks\boot\iter\2-grain\.shots\b-flow-0550.png"),
]
tw, th = 660, 413
lw, hh, gap = 330, 44, 8
sheet = Image.new("RGB", (lw+2*tw+gap, hh+2*(th+gap)), (10,11,20))
d = ImageDraw.Draw(sheet)
for i,(label,sub,p) in enumerate(pairs):
    row, col = divmod(i, 2)
    y = hh + row*(th+gap)
    d.text((16, y+th//2-24), label, font=fl, fill=(226,222,240))
    d.text((16, y+th//2+4), sub, font=fs, fill=(150,146,170))
    im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
    sheet.paste(im,(lw+col*(tw+gap), y))
out = r"design\mocks\boot\iter\_ref\board\old-vs-new-b.png"
sheet.save(out)
print(out, sheet.size)
