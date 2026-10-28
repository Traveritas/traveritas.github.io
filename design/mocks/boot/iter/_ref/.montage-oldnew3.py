from PIL import Image
import os
pairs = [
  r"design\mocks\boot\2-grain\.shots\00-start.png",
  r"design\mocks\boot\iter\2-grain\.shots\b-flow-0000.png",
  r"design\mocks\boot\2-grain\.shots\02-lv2.png",
  r"design\mocks\boot\iter\2-grain\.shots\b-flow-0550.png",
]
tw, th, gap = 700, 438, 8
sheet = Image.new("RGB", (tw*2+gap, th*2+gap), (10,11,20))
for i,p in enumerate(pairs):
    row, col = divmod(i, 2)
    im = Image.open(p).convert("RGB").resize((tw,th), Image.LANCZOS)
    sheet.paste(im,(col*(tw+gap), row*(th+gap)))
out = r"design\mocks\boot\iter\_ref\board\old-vs-new-b.png"
sheet.save(out)
print(out, sheet.size)
