from PIL import Image, ImageChops
import os, json
root = r"design\mocks\boot\iter\_ref\.accept"
cases = ["2-grain-a-step","2-grain-b-flow","2-grain-c-hybrid","5-night-a-afterimage","5-night-b-opening","5-night-c-pool"]
for c in cases:
    end = Image.open(os.path.join(root, c+"-end.png")).convert("RGB")
    nob = Image.open(os.path.join(root, c+"-noboot.png")).convert("RGB")
    if end.size != nob.size:
        print(c, "size mismatch", end.size, nob.size); continue
    diff = ImageChops.difference(end, nob)
    bbox = diff.getbbox()
    hist = diff.convert("L").histogram()
    total = end.width*end.height
    bad = sum(hist[8:])  # pixels with channel diff >= 8
    print(f"{c}: maxdiff={max(i for i,v in enumerate(hist) if v)} bbox={bbox} px>=8: {bad} ({bad/total*100:.3f}%)")
