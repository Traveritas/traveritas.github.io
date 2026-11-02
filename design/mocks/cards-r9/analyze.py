"""把 probe2 的帧与 trace 对上，找「卡面是空的」那一帧：卡内区域的局部对比度突然掉下去。"""
import json, sys
import numpy as np
from PIL import Image

D = 'design/mocks/cards-r9/probe'
frames = json.load(open(f'{D}/frames.json'))
trace = json.load(open(f'{D}/trace.json'))

# 每张卡：pid -> [(t, lod, face, o, x, y, w, h)]
by = {}
for r in trace:
    by.setdefault(r[0], []).append(r)

def near(rows, t, tol=30):
    best = None
    for r in rows:
        if abs(r[1] - t) <= tol and (best is None or abs(r[1]-t) < abs(best[1]-t)):
            best = r
    return best

rows = []
for f in frames:
    img = np.asarray(Image.open(f"{D}/f{f['i']:03d}.png").convert('L'), int)
    worst = None
    for pid, rs in by.items():
        r = near(rs, f['t'])
        if not r: continue
        _, t, lod, face, o, x, y, w, h = r
        if w < 80 or h < 40: continue
        x0, y0 = x + 8, y + 8
        x1, y1 = x + w - 8, y + h - 8
        if x0 < 0 or y0 < 0 or x1 > img.shape[1] or y1 > img.shape[0]: continue
        reg = img[y0:y1, x0:x1]
        std = float(reg.std())
        if o > 0.5 and (worst is None or std < worst[1]):
            worst = (pid, round(std, 2), lod, face, o)
    rows.append((f['i'], worst))

# 报「比前后两帧都低很多」的孤立低谷
print('frame  pid  std   lod face  opacity')
suspicious = 0
for k, (i, w) in enumerate(rows):
    if not w: continue
    prev = rows[k-1][1]; nxt = rows[k+1][1] if k+1 < len(rows) else None
    if w[0] != (prev[0] if prev else None) or (nxt and w[0] != nxt[0]):
        pass
    mine = [v for _, v in rows[max(0,k-2):k+3] if v and v[0] == w[0]]
    if len(mine) >= 3:
        others = sorted(x[1] for x in mine)
        med = others[len(others)//2]
        if med > 3 and w[1] < med * 0.62:
            suspicious += 1
            print('!', i, w[0], w[1], 'median', med, 'lod', w[2], 'face', w[3], 'op', w[4])
print('suspicious frames:', suspicious, 'of', len(frames))
