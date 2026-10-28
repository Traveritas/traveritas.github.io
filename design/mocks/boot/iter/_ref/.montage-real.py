from PIL import Image, ImageDraw, ImageFont
import os
root = r"design\mocks\boot\iter\_ref\real-boot"
outs = []
frames = ["boot-0000.png","boot-0400.png","boot-0900.png","boot-1600.png"]
tw, th = 480, 300
gap = 8
sheet = Image.new("RGB",(tw*4+gap*3, th),(10,11,20))
for i,f in enumerate(frames):
    im = Image.open(os.path.join(root,f)).convert("RGB").resize((tw,th), Image.LANCZOS)
    sheet.paste(im,(i*(tw+gap),0))
out = r"design\mocks\boot\iter\_ref\board\real-boot-strip.png"
sheet.save(out)
print(out, sheet.size)
