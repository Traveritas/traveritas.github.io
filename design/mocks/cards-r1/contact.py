"""把每个案子的同态截图拼成一张对照表。
   python design/mocks/cards-r1/contact.py
   → .shots/bank-list.png / bank-open.png / bank-mobile.png
   只读 .shots，不碰案子目录。"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, ".shots")
CASES = ["mist", "bevel", "aperture"]
LABEL = {"mist": "A  MIST · 雾片", "bevel": "B  BEVEL · 斜切", "aperture": "C  APERTURE · 开口"}
GUT, PAD, BAR = 36, 48, 56
FONT_PATH = "C:/Windows/Fonts/msyh.ttc"


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def stack(view, vertical=True):
    tiles = []
    for case in CASES:
        path = os.path.join(SHOTS, f"{case}-{view}.png")
        if os.path.exists(path):
            tiles.append((case, Image.open(path).convert("RGB")))
    if not tiles:
        return None
    w, h = tiles[0][1].size
    if vertical:
        cw, ch = w + PAD * 2, (h + BAR) * len(tiles) + GUT * (len(tiles) - 1) + PAD * 2
    else:
        cw, ch = (w + GUT) * len(tiles) - GUT + PAD * 2, h + BAR + PAD * 2
    sheet = Image.new("RGB", (cw, ch), (18, 20, 24))
    d = ImageDraw.Draw(sheet)
    f = font(22)
    for i, (case, im) in enumerate(tiles):
        if vertical:
            x, y = PAD, PAD + i * (h + BAR + GUT)
        else:
            x, y = PAD + i * (w + GUT), PAD
        d.text((x, y - 34), LABEL.get(case, case), fill=(196, 186, 214), font=f)
        sheet.paste(im, (x, y))
    return sheet


for view in ("list", "open", "mobile"):
    sheet = stack(view, vertical=(view != "mobile"))
    if sheet is None:
        continue
    out = os.path.join(SHOTS, f"bank-{view}.png")
    sheet.save(out, optimize=True)
    print(f"{out}  {sheet.size[0]}x{sheet.size[1]}")
