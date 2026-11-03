/* 拼对比板：把各方向同一帧的 2× 放大图并排摆（截掉多余的边，只留对话框那一段）。
   node design/mocks/ave-r1/board.cjs [帧名...]
   → design/mocks/ave-r1/board/<帧名>.png   （纵向叠：0 现行在最上，下面各方向一行） */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const SHOTS = path.join(DIR, 'shots');
const OUT = path.join(DIR, 'board');

const ROWS = [
  ['0 现行', '0-current'],
  ['A 纸', 'a-paper'],
  ['B 树脂', 'b-resin'],
  ['C 雾', 'c-mist'],
  ['D 像素场', 'd-pixel'],
];
const FRAMES = process.argv.slice(2).length ? process.argv.slice(2) : ['01-list', '02-speak', '03-night', '05-narrow'];

fs.mkdirSync(OUT, { recursive: true });
// 每帧用「整页截图上的同一块矩形」来比：各方向的框宽不同，只裁框会把背景裁得不一样
const CROP = {
  '01-list': [940, 700, 1440, 880],
  '02-speak': [940, 700, 1440, 880],
  '03-night': [940, 700, 1440, 880],
  '04-anchored': [470, 390, 1010, 570],
  '05-narrow': [60, 660, 390, 800],
};
const py = `
import sys, os
from PIL import Image, ImageDraw, ImageFont
CROPS = ${JSON.stringify(CROP)}
rows = ${JSON.stringify(ROWS)}
frames = ${JSON.stringify(FRAMES)}
shots = ${JSON.stringify(SHOTS)}
out = ${JSON.stringify(OUT)}
font = None
for f in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyhl.ttc', 'C:/Windows/Fonts/simsun.ttc']:
    if os.path.exists(f):
        try:
            font = ImageFont.truetype(f, 15); break
        except Exception: pass
for fr in frames:
    cells = []
    for label, key in rows:
        p = os.path.join(shots, key, fr + '.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        box = ${JSON.stringify({})}.get(fr) if False else None
        c = CROPS.get(fr)
        if c:
            im = im.crop(tuple(c))
        # 裁完放大 2×，细节才看得清（1× 的整页截图放小了读不出边）
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        cells.append((label, im))
    if not cells:
        continue
    pad, lab = 14, 26
    # 过宽的行按比例缩到 900px，免得整板读不了
    lim = 1000
    fixed = []
    for label, im in cells:
        if im.width > lim:
            im = im.resize((lim, round(im.height * lim / im.width)), Image.LANCZOS)
        fixed.append((label, im))
    cells = fixed
    w = max(im.width for _, im in cells) + pad * 2
    h = sum(im.height + lab + pad for _, im in cells) + pad
    board = Image.new('RGB', (w, h), (246, 247, 249))
    d = ImageDraw.Draw(board)
    y = pad
    for label, im in cells:
        if font: d.text((pad, y), label, fill=(60, 68, 80), font=font)
        board.paste(im, (pad, y + lab))
        y += im.height + lab + pad
    board.save(os.path.join(out, fr + '.png'))
    print(os.path.join(out, fr + '.png'))
`;
try {
  execFileSync('python', ['-c', py], { stdio: 'inherit' });
} catch (e) {
  console.error('需要 python + Pillow', e.message);
  process.exit(1);
}
