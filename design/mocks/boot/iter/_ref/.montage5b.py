from PIL import Image, ImageDraw
import os, glob, re
root = r"design\mocks\boot\iter\5-night\.smoke"
rows = {"a-afterimage": ["0","300","600","900","1080","1400","1700","2000","2200"],
        "b-opening": ["0","320","600","900","1200","1400","1700","1900","2260"],
        "c-pool": ["0","240","600","1000","1350","1500","1700","1900","2220"]}
tw, th = 280, 175
lw, hh = 104, 24
n = max(len(v) for v in rows.values())
sheet = Image.new("RGB", (lw+tw*n, hh+th*len(rows)), (10,11,20))
d = ImageDraw.Draw(sheet)
for i,(name,ts) in enumerate(rows.items()):
    d.text((8, hh+i*th+th//2-6), name, fill=(200,196,214))
    for j,t in enumerate(ts):
        p = os.path.join(root, f"{name}-{t}.png")
        if not os.path.exists(p):
            d.text((lw+j*tw+8, hh+i*th+8), f"missing {t}", fill=(120,120,130)); continue
        im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
        sheet.paste(im,(lw+j*tw, hh+i*th))
        d.text((lw+j*tw+4, hh+i*th+th-14), t+"ms", fill=(200,196,214))
out = os.path.join(root, "contact-new.png")
sheet.save(out)
print(out, sheet.size)
