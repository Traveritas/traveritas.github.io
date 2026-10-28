from PIL import Image, ImageDraw
import os, glob
root = r"design\mocks\boot\iter\5-night\.smoke"
files = sorted(glob.glob(os.path.join(root, "*.png")))
print("\n".join(os.path.basename(f) for f in files))
rows = [("a-afterimage", [0,900,1700,2200]), ("b-opening", [0,1000,1900,2260]), ("c-pool", [0,1200,1800,2220])]
tw, th = 360, 225
lw = 110; hh = 26
sheet = Image.new("RGB", (lw+tw*4, hh+th*3), (10,11,20))
d = ImageDraw.Draw(sheet)
for j,t in enumerate(rows[0][1]):
    d.text((lw+j*tw+6,7), f"{t}ms", fill=(200,196,214))
for i,(name,ts) in enumerate(rows):
    d.text((8, hh+i*th+th//2-6), name, fill=(200,196,214))
    for j,t in enumerate(ts):
        p = os.path.join(root, f"{name}-{t}.png")
        if not os.path.exists(p):
            print("missing", p); continue
        im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
        sheet.paste(im,(lw+j*tw, hh+i*th))
out = os.path.join(root, "contact.png")
sheet.save(out)
print(out, sheet.size)
