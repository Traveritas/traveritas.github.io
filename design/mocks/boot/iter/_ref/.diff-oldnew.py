from PIL import Image, ImageChops
old = Image.open(r"design\mocks\boot\2-grain\.shots\06-end.png").convert("RGB")
new = Image.open(r"design\mocks\boot\iter\2-grain\.shots\b-flow-1990.png").convert("RGB")
print("sizes", old.size, new.size)
diff = ImageChops.difference(old, new)
hist = diff.convert("L").histogram()
total = old.width*old.height
bad = sum(hist[8:])
print("maxdiff", max(i for i,v in enumerate(hist) if v), "px>=8", bad, f"{bad/total*100:.3f}%", "bbox", diff.getbbox())
# 大字区域单独看
brand_old = old.crop((100,150,720,320)); brand_new = new.crop((100,150,720,320))
d2 = ImageChops.difference(brand_old, brand_new).convert("L").histogram()
print("brand maxdiff", max(i for i,v in enumerate(d2) if v), "px>=8", sum(d2[8:]))
