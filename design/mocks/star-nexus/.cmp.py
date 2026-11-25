import collections, statistics
from PIL import Image

BG = (240, 243, 246)

def load_on_bg(path, bg=BG):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        base = Image.new("RGBA", im.size, bg + (255,))
        base.alpha_composite(im)
        im = base.convert("RGB")
    else:
        im = im.convert("RGB")
    return im

def report(path, label, step=1):
    im = load_on_bg(path)
    w, h = im.size
    px = im.load()
    cnt = collections.Counter()
    tones = []
    for y in range(0, h, step):
        for x in range(0, w, step):
            c = px[x, y]
            if abs(c[0]-BG[0]) + abs(c[1]-BG[1]) + abs(c[2]-BG[2]) > 12:
                cnt[(c[0]//8*8, c[1]//8*8, c[2]//8*8)] += 1
                tones.append((c[0]+c[1]+c[2])/3)
    print(f"=== {label}   size={w}x{h}  ink%={100*len(tones)/(w*h):.1f}")
    if not tones:
        return
    tones.sort()
    print("  lum  p05/median/p95:", round(tones[int(len(tones)*0.05)],1),
          round(statistics.median(tones),1), round(tones[int(len(tones)*0.95)],1))
    print("  darkest 5%:", round(statistics.mean(tones[:max(1,len(tones)//20)]),1),
          " brightest 5%:", round(statistics.mean(tones[-max(1,len(tones)//20):]),1))
    ch = [sum(c[i] for c in cnt.elements())/len(tones) for i in range(3)]
    print("  mean rgb:", tuple(round(v) for v in ch))
    for k, v in cnt.most_common(8):
        print("   ", k, v)

import sys
report(r"public\nexus-slice\wake.webp", "NEXUS wake.webp (on #f0f3f6)")
if len(sys.argv) > 1:
    report(sys.argv[1], sys.argv[1])