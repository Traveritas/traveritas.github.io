from PIL import Image, ImageDraw
import os
os.makedirs(r"design\mocks\boot\iter\_ref\board", exist_ok=True)
root = r"design\mocks\boot\iter\5-night\.shots"
rows = [
  ("A · 一颗星的余像", "a-afterimage", ["02-rings.png","05-drawn.png","07-end.png"]),
  ("B · 夜里的一道开口", "b-opening", ["03-breath.png","05-recede.png","07-end.png"]),
  ("C · 星落进池子", "c-pool", ["04-ripple.png","05-pools.png","07-end.png"]),
]
tw, th = 560, 350
lw, hh = 150, 34
sheet = Image.new("RGB", (lw+tw*3, hh+th*3), (10,11,20))
d = ImageDraw.Draw(sheet)
for i,(name,dirn,frames) in enumerate(rows):
    d.text((10, hh+i*th+th//2-6), name, fill=(210,206,224))
    for j,f in enumerate(frames):
        p = os.path.join(root, dirn, f)
        im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
        sheet.paste(im,(lw+j*tw, hh+i*th))
        d.text((lw+j*tw+6, hh+i*th+th-18), f.replace(".png",""), fill=(170,166,190))
out = r"design\mocks\boot\iter\_ref\board\five-contact.png"
sheet.save(out)
print(out, sheet.size)

# 简化：两版各自一条 filmstrip 缩略（给外层板用）
film = [
  ("A 跳", r"design\mocks\boot\iter\2-grain\.shots\contact-film-a-step.png"),
  ("B 连续", r"design\mocks\boot\iter\2-grain\.shots\contact-film-b-flow.png"),
  ("C 混合", r"design\mocks\boot\iter\2-grain\.shots\contact-film-c-hybrid.png"),
]
W = 1782
imgs = [Image.open(p).convert("RGB") for _,p in film]
scaled = [im.resize((W, int(im.height*W/im.width)), Image.LANCZOS) for im in imgs]
H = sum(im.height for im in scaled)
sheet2 = Image.new("RGB",(W,H),(10,11,20))
y=0
for im in scaled:
    sheet2.paste(im,(0,y)); y+=im.height
out2 = r"design\mocks\boot\iter\_ref\board\two-films.png"
sheet2.save(out2)
print(out2, sheet2.size)
