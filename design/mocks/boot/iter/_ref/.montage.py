from PIL import Image, ImageDraw
import os, glob

root = r"design\mocks\boot\iter\_ref\.grain-review"
out = os.path.join(root, "contact-desktop.png")
variants = ["a-step", "b-flow", "c-hybrid"]
times = [0, 300, 550, 800, 1100, 1400, 1750, 1990]
tw, th = 320, 200
label_w = 92
head_h = 26
sheet = Image.new("RGB", (label_w + tw*len(times), head_h + th*len(variants)), (10,11,20))
d = ImageDraw.Draw(sheet)
for j,t in enumerate(times):
    d.text((label_w + j*tw + 6, 7), f"{t}ms", fill=(200,196,214))
for i,v in enumerate(variants):
    d.text((8, head_h + i*th + th//2 - 6), v, fill=(200,196,214))
    for j,t in enumerate(times):
        p = os.path.join(root, f"{v}-{t:04d}.png")
        im = Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (label_w + j*tw, head_h + i*th))
sheet.save(out)
print(out, sheet.size)

# mobile sheet
mroot = root
mout = os.path.join(root, "contact-mobile.png")
mtimes = [0, 800, 1400, 1990]
mw, mh = 195, 422
ms = Image.new("RGB", (label_w + mw*len(mtimes), head_h + mh*len(variants)), (10,11,20))
dm = ImageDraw.Draw(ms)
for j,t in enumerate(mtimes):
    dm.text((label_w + j*mw + 6, 7), f"{t}ms", fill=(200,196,214))
for i,v in enumerate(variants):
    dm.text((8, head_h + i*mh + mh//2 - 6), v, fill=(200,196,214))
    for j,t in enumerate(mtimes):
        p = os.path.join(mroot, f"m-{v}-{t:04d}.png")
        im = Image.open(p).convert("RGB").resize((mw, mh), Image.LANCZOS)
        ms.paste(im, (label_w + j*mw, head_h + i*mh))
ms.save(mout)
print(mout, ms.size)
