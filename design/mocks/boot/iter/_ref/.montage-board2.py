from PIL import Image, ImageDraw, ImageFont
import os
root = r"design\mocks\boot\iter\5-night\.shots"
outdir = r"design\mocks\boot\iter\_ref\board"
os.makedirs(outdir, exist_ok=True)
def font(sz):
    for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simsun.ttc", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()
f_label = font(22); f_sub = font(13); f_cap = font(14)
rows = [
  ("A · 余像", "a-afterimage", ["02-rings.png","05-drawn.png","07-end.png"], ["星与环","光脊展开","静置"]),
  ("B · 开口", "b-opening", ["03-breath.png","05-recede.png","07-end.png"], ["口子呼吸","夜退开","静置"]),
  ("C · 池子", "c-pool", ["04-ripple.png","05-pools.png","07-end.png"], ["涟漪","三池亮起","静置"]),
]
tw, th = 560, 350
lw, hh, gap = 210, 40, 8
W = lw + 3*(tw+gap)
H = hh + 3*(th+gap)
sheet = Image.new("RGB", (W, H), (10,11,20))
d = ImageDraw.Draw(sheet)
for i,(name,dirn,frames,caps) in enumerate(rows):
    y = hh + i*(th+gap)
    d.text((14, y + th//2 - 24), name, font=f_label, fill=(224,220,236))
    d.text((14, y + th//2 + 4), "开屏 5 迭代", font=f_sub, fill=(150,146,170))
    for j,f in enumerate(frames):
        p = os.path.join(root, dirn, f)
        im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
        x = lw + j*(tw+gap)
        sheet.paste(im,(x,y))
        d.text((x+8, y+th-24), caps[j], font=f_cap, fill=(210,206,224))
out = os.path.join(outdir, "five-contact.png")
sheet.save(out)
print(out, sheet.size)
