import sys
from PIL import Image

BG = (240, 243, 246)

def load_on_bg(path):
    im = Image.open(path).convert("RGBA")
    base = Image.new("RGBA", im.size, BG + (255,))
    base.alpha_composite(im)
    return base.convert("RGB")

def bbox_of(im, tol=10):
    px = im.load(); w, h = im.size
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if abs(c[0]-BG[0]) + abs(c[1]-BG[1]) + abs(c[2]-BG[2]) > tol:
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    return (x0, y0, x1+1, y1+1)

def square_crop(path, size=560, pad=1.06):
    im = load_on_bg(path)
    b = bbox_of(im)
    cx = (b[0]+b[2])/2; cy = (b[1]+b[3])/2
    half = max(b[2]-b[0], b[3]-b[1])/2 * pad
    # 先在底色画布上居中贴好，再裁正方形 —— 直接 crop 越界会得到黑边
    W = max(im.size[0], int(half*2)+2)
    canvas = Image.new("RGB", (W, max(im.size[1], int(half*2)+2)), BG)
    canvas.paste(im, ((W-im.size[0])//2, 0))
    bx = W/2 - half
    by = im.size[1]/2 - half
    im2 = canvas.crop((int(bx), int(by), int(bx+half*2), int(by+half*2))).resize((size, size), Image.LANCZOS)
    return im2

paths = sys.argv[1:]
labels = []
outs = []
for p in paths:
    outs.append(square_crop(p))
    labels.append(p.replace("\\", "/").split("/")[-1])

size = 560
gap = 12
n = len(outs)
strip = Image.new("RGB", (n*(size+gap)+gap, size+gap*2), (225, 229, 234))
for i, o in enumerate(outs):
    strip.paste(o, (gap + i*(size+gap), gap))
dst = r"design\mocks\star-nexus\.shots\pair.png"
strip.save(dst)
print("saved", dst, strip.size, labels)