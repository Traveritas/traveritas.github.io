from PIL import Image, ImageChops
import os
root = r"design\mocks\boot\iter\_ref\.accept"
for c in ["2-grain-a-step","2-grain-b-flow","2-grain-c-hybrid"]:
    end = Image.open(os.path.join(root, c+"-end.png")).convert("RGB")
    ref = Image.open(os.path.join(root, c+"-reduced.png")).convert("RGB")
    diff = ImageChops.difference(end, ref)
    hist = diff.convert("L").histogram()
    total = end.width*end.height
    bad = sum(hist[8:])
    print(f"{c}: reduced baseline maxdiff={max(i for i,v in enumerate(hist) if v)} px>=8: {bad} ({bad/total*100:.3f}%) bbox={diff.getbbox()}")
