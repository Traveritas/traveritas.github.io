from PIL import Image
import sys

plate = r"design/mocks/cards-r5/shared/plate-1440.png"
im = Image.open(plate).convert("RGB")
W, H = im.size
print("plate", W, H)

# sample points: left light column, purple mid, deep blue right
pts = {
    "left_light": (200, 400),
    "left_light2": (100, 700),
    "purple": (700, 300),
    "purple2": (760, 700),
    "dark": (1150, 300),
    "dark2": (1200, 750),
}
for k, (x, y) in pts.items():
    print(k, im.getpixel((x, y)), "#%02x%02x%02x" % im.getpixel((x, y)))

# column averages avoiding rain/star specks: use median of a patch
def med(x, y, s=20):
    px = [im.getpixel((i, j)) for i in range(x - s, x + s, 2) for j in range(y - s, y + s, 2)]
    px.sort(key=lambda p: p[0] + p[1] + p[2])
    return px[len(px) // 2]

for k, (x, y) in pts.items():
    m = med(x, y)
    print("median", k, m, "#%02x%02x%02x" % m)

# zoom crops upscaled 5x nearest to inspect halftone / dither
crops = {
    "light": (300, 600),
    "purple": (700, 500),
    "dark": (1180, 400),
    "edge_purple_dark": (980, 500),
}
for k, (x, y) in crops.items():
    c = im.crop((x - 24, y - 24, x + 24, y + 24)).resize((480, 480), Image.NEAREST)
    c.save(f"design/mocks/refs/shots/_zoom-{k}.png")
    print("saved zoom", k)
