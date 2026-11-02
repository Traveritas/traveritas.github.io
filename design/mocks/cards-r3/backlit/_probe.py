import numpy as np
from PIL import Image

im = np.asarray(Image.open('design/mocks/cards-r3/shared/plate-1440.png').convert('RGB')).astype(float)

def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def Lstar(rgb):
    y = (lin(rgb) * np.array([0.2126, 0.7152, 0.0722])).sum()
    return 116 * (y ** (1/3)) - 16 if y > 0.008856 else 903.3 * y

regions = {
    'left-card1': (140, 150, 500, 330),
    'left-card2': (140, 380, 500, 590),
    'left-plain': (100, 600, 300, 800),
    'mid-card1': (630, 150, 875, 350),
    'mid-card2': (630, 390, 875, 600),
    'right-card1': (1030, 150, 1395, 350),
    'right-card2': (1030, 390, 1395, 600),
    'right-plain': (1030, 700, 1395, 850),
}
for name, (x0, y0, x1, y1) in regions.items():
    r = im[y0:y1, x0:x1]
    m = r.reshape(-1, 3).mean(0)
    lo = r.reshape(-1, 3).min(0)
    hi = r.reshape(-1, 3).max(0)
    L = Lstar(m)
    print(f'{name:12s} mean=({m[0]:5.1f},{m[1]:5.1f},{m[2]:5.1f})  L*={L:5.2f}  min={lo.astype(int)} max={hi.astype(int)}')
    for target in (2.0, 2.5, 3.0, 4.0, 5.0):
        # alpha such that result L* = L + target (white compositing)
        want = L + target
        lo_, hi_ = 0.0, 1.0
        for _ in range(40):
            a = (lo_ + hi_) / 2
            res = m * (1 - a) + 255 * a
            if Lstar(res) < want:
                lo_ = a
            else:
                hi_ = a
        print(f'    dL* +{target:.1f} -> alpha {a:.3f}  rgb {tuple((m*(1-a)+255*a).round().astype(int))}')
