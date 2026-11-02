from PIL import Image

im = Image.open(r"design/mocks/refs/shots/probe.png").convert("RGB")

# (label, left, top) of cards placed in probe.html
cards = [
    ("v4-light", 120, 150), ("v4-mid", 585, 150), ("v4-dark", 1050, 150),
    ("v1-light", 120, 400), ("v1-mid", 585, 400), ("v1-dark", 1050, 400),
    ("v2-light", 120, 650), ("v2-mid", 585, 650), ("v2-dark", 1050, 650),
    ("v3-mid", 585, 150),
]
W, H, M, S = 270, 118, 10, 3  # card box, margin, scale

for label, x, y in cards:
    box = (x - M, y - M, x + W + M, y + H + M)
    c = im.crop(box).resize(((W + 2 * M) * S, (H + 2 * M) * S), Image.NEAREST)
    c.save(f"design/mocks/refs/shots/_crop-{label}.png")

# one comparison sheet for the mid column (hardest ground)
order = ["v4-mid", "v1-mid", "v2-mid", "v3-mid"]
crops = [Image.open(f"design/mocks/refs/shots/_crop-{k}.png") for k in order]
w, h = crops[0].size
sheet = Image.new("RGB", (w, h * len(crops) + 6 * (len(crops) - 1)), (40, 42, 46))
for i, c in enumerate(crops):
    sheet.paste(c, (0, i * (h + 6)))
sheet.save("design/mocks/refs/shots/_sheet-mid.png")
print("sheet", sheet.size)
