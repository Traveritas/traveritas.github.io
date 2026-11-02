import numpy as np

def lin(c):
    c = np.array(c, dtype=float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def Lstar(rgb):
    y = (lin(rgb) * np.array([0.2126, 0.7152, 0.0722])).sum()
    return 116 * (y ** (1/3)) - 16 if y > 0.008856 else 903.3 * y

def alpha_for(base, target_dL):
    want = Lstar(base) + target_dL
    lo, hi = 0.0, 1.0
    for _ in range(50):
        a = (lo + hi) / 2
        if Lstar(np.array(base) * (1 - a) + 255 * a) < want:
            lo = a
        else:
            hi = a
    return a

cols = {
    'essay   (light)': (186.9, 198.5, 217.6),
    'moment  (plum) ': (38.3, 30.2, 49.4),
    'project (night)': (17.2, 27.2, 45.0),
}
for name, bg in cols.items():
    face_a = alpha_for(bg, 3.4)
    face = np.array(bg) * (1 - face_a) + 255 * face_a
    print(f'{name} bg L*={Lstar(bg):5.2f}  face+a={face_a:.3f} -> rgb {tuple(face.round().astype(int))} L*={Lstar(face):5.2f}')
    for label, d in [('top', 12.0), ('left', 9.0), ('right', 6.0), ('bottom', 5.0)]:
        a = alpha_for(face, d)
        out = face * (1 - a) + 255 * a
        print(f'    rim-{label:7s} +{d:4.1f} L*  alpha {a:.3f} -> rgb {tuple(out.round().astype(int))} L*={Lstar(out):5.2f}')
