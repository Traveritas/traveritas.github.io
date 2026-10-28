from PIL import Image, ImageChops
import os
root = r"design\mocks\boot\iter\_ref\.accept-b2"
a = Image.open(os.path.join(root,"end.png")).convert("RGB")
b = Image.open(os.path.join(root,"reduced.png")).convert("RGB")
d = ImageChops.difference(a,b); h = d.convert("L").histogram(); total=a.width*a.height
bad = sum(h[8:])
print("end vs reduced: maxdiff", max(i for i,v in enumerate(h) if v), "px>=8", bad, f"{bad/total*100:.3f}%", "bbox", d.getbbox())

