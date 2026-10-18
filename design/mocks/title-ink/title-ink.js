/* ─────────────────────────────────────────────────────────────
   对照板：九种「让字在那片夜色上读得清」的做法，各占一行，横穿同一条底。

   三块板：
     A 标定夜色带（pools.js 的 field）—— 那片空间真实会用到的底色范围，一维、对每行完全相同
     B 黑→白全亮度带 —— 把每种做法的「失明点」直接摊开
     C 真实一帧 —— 从跑着的主页上抓下来的流光画布（assets/field-frame.png），
       底下那张真的会漂；取墨那一行的墨按这一帧的真实像素算，不是按公式

   行里的字都是同一串、同一字号，只有取色方式不同。
   ───────────────────────────────────────────────────────────── */
import { paneGradient, inkGradient, lumAt, rampLum, CROSS, BASE } from './pools.js';

const WORD = 'Traveritas AveritA';

const ROWS = [
  { key: 'ink', name: '字随底换墨', note: '浅墨 / 深墨二选一 · 基线', cls: 't-ink' },
  { key: 'diff-light', name: '差集 · 近白墨', note: 'mix-blend-mode: difference', cls: 't-diff-light' },
  { key: 'diff-amber', name: '差集 · 琥珀墨', note: 'mix-blend-mode: difference', cls: 't-diff-amber' },
  { key: 'excl-light', name: '排除 · 近白墨', note: 'mix-blend-mode: exclusion', cls: 't-excl-light' },
  { key: 'screen-light', name: '滤色 · 近白墨', note: 'mix-blend-mode: screen', cls: 't-screen' },
  { key: 'multiply-dark', name: '正片叠底 · 深墨', note: 'mix-blend-mode: multiply', cls: 't-multiply' },
  { key: 'window-invert', name: '反相窗', note: '底的第二份拷贝 · invert + hue-rotate', cls: 't-window t-window--invert' },
  { key: 'window-push', name: '推色窗', note: '底的第二份拷贝 · contrast + saturate', cls: 't-window t-window--push' },
  { key: 'hybrid', name: '差集 + 一圈柔晕', note: '无 JS：中灰那一段由晕兜住', cls: 't-hybrid' },
  { key: 'halo-amber', name: '单一琥珀墨 + 柔晕', note: '不让字换色，让底在字背后让路', cls: 't-halo t-halo--amber' },
];

const $ = (sel, root = document) => root.querySelector(sel);

/* ── 真实一帧：读进 canvas，供取墨那一行按真实像素取亮度 ── */
let FRAME = null;
async function loadFrame() {
  const img = new Image();
  img.src = './assets/field-frame.png';
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const LUT = new Float32Array(256).map((_, i) => lin(i));
  FRAME = {
    w: cv.width,
    h: cv.height,
    url: img.src,
    lum(fx, fy) {
      const x = Math.min(cv.width - 1, Math.max(0, Math.round(fx * cv.width)));
      const y = Math.min(cv.height - 1, Math.max(0, Math.round(fy * cv.height)));
      const i = (y * cv.width + x) * 4;
      return 0.2126 * LUT[d[i]] + 0.7152 * LUT[d[i + 1]] + 0.0722 * LUT[d[i + 2]];
    },
  };
}

function band(row, board) {
  const sec = document.createElement('section');
  sec.className = 'band';
  sec.dataset.key = row.key;
  sec.dataset.board = board;
  /* 字本身留在 .word 的文本节点上（它负责撑出字格），其余按做法挂叠层：
     窗那一族挂一片「底的拷贝」；差集 + 柔晕挂一份晕、一份差集（两层不能是同一个元素，
     否则 text-shadow 也会一起被差集算进去）。 */
  const extra = row.cls.includes('t-hybrid')
    ? `<i class="hb">${WORD}</i><i class="hf">${WORD}</i>`
    : row.cls.includes('t-window')
      ? '<i class="win"></i>'
      : '';
  sec.innerHTML = `<div class="cap"><b>${row.name}</b><span>${row.note}</span></div><div class="slot"><p class="word ${row.cls}">${WORD}${extra}</p></div>`;
  return sec;
}

function buildBoard(id, capHtml, rows, paneCls) {
  const el = document.createElement('section');
  el.className = 'board';
  el.id = id;
  el.innerHTML = `<div class="board-cap">${capHtml}</div><div class="pane ${paneCls}"><div class="bands"></div></div>`;
  const bands = $('.bands', el);
  for (const r of rows) bands.appendChild(band(r, id));
  return el;
}

/* 黑→白带上的刻度。只写实测出来的失明点，不写凭印象的「中灰」：
   · 差集 / 排除 / 反相 / 推对比 —— 都在通道 50%（线性亮度只有 0.22）处消失
   · 滤色 —— 在纯白处消失
   · 正片叠底 —— 在纯黑处消失
   · 字随底换墨的分界（底 L≈0.19）压在通道 50% 略偏左，这正是它存在的理由 */
function rulerEl() {
  const chOf = (L) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (rampLum(m) < L) lo = m; else hi = m; }
    return lo * 100;
  };
  const marks = [
    [0, '通道 0 · 纯黑', false, 0],
    [0, '正片叠底在此消失', true, 1],
    [25, '25', false, 0],
    [50, '通道 50% · L≈0.22', false, 0],
    [50, '差集 / 排除 / 反相 / 推对比在此消失', true, 1],
    [chOf(CROSS), `字随底换墨的分界 · 底 L≈${CROSS.toFixed(2)}`, true, 2],
    [75, '75', false, 0],
    [100, '通道 255 · 纯白', false, 0],
    [100, '滤色在此消失', true, 1],
  ];
  const el = document.createElement('div');
  el.className = 'ruler';
  el.innerHTML = `<div class="cap"><b>通道值 →</b><span>线性亮度不是线性的</span></div><div class="ruler-track">${marks
    .map(([p, t, mark, row]) => `<i class="${mark ? 'mark' : ''}" style="left:${p.toFixed(2)}%" data-row="${row}" data-t="${t}"></i>`)
    .join('')}</div>`;
  return el;
}

/* ── 遮罩：把字画进 canvas，取它的 dataURL 当 mask-image ──
   用 canvas 而不是 SVG 里的 <text>：字体与排版由同一个浏览器算，不会与 HTML 那行错位。
   注意 PNG 遮罩走的是 alpha 通道（不是亮度），所以底必须留空，只画白色的字。 */
function maskFor(word, w, h) {
  const dpr = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * dpr));
  cv.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const cs = getComputedStyle($('.word'));
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  try { ctx.letterSpacing = cs.letterSpacing; } catch {}
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(word);
  const A = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.88;
  const D = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.22;
  const baseline = (h - (A + D)) / 2 + A; // 与单行块内文字同一套半行距算法
  ctx.fillText(word, 0, baseline);
  return cv.toDataURL('image/png');
}

function layout() {
  const probe = $('.word');
  if (!probe) return;
  const wR0 = probe.getBoundingClientRect();
  const mask = maskFor(WORD, Math.ceil(wR0.width), Math.ceil(wR0.height));

  /* 板子的底只铺一次（整块板）；每一行的字在板里各有自己的位置，
     所以取墨要取的那一列、窗要抠的那一片，都得逐行算。 */
  for (const pane of document.querySelectorAll('.pane')) {
    const pR = pane.getBoundingClientRect();
    const isRamp = pane.classList.contains('pane--ramp');
    const isFrame = pane.classList.contains('pane--frame');
    const ref = $('.word', pane);
    const r0 = ref.getBoundingClientRect();
    const t0 = (r0.left - pR.left) / pR.width;
    const t1 = (r0.right - pR.left) / pR.width;

    if (pane.classList.contains('pane--field')) pane.style.backgroundImage = paneGradient(t0, t1);
    /* 黑→白只铺在字格那一段（两侧切齐），这样字横穿的是完整的 0 → 255，
       而且一眼能看出这条带子到哪儿为止 */
    if (isRamp) {
      const a = (t0 * 100).toFixed(2), z = (t1 * 100).toFixed(2);
      pane.style.backgroundImage = `linear-gradient(90deg, #0b0c14 ${a}%, #000 ${a}%, #fff ${z}%, #0b0c14 ${z}%)`;
    }
    if (isFrame) {
      pane.style.backgroundImage = `url(${FRAME.url})`;
      pane.style.backgroundSize = `${Math.ceil(pR.width)}px ${Math.ceil(pR.height)}px`;
    }

    for (const word of pane.querySelectorAll('.word')) {
      const wR = word.getBoundingClientRect();
      const left = wR.left - pR.left;
      const top = wR.top - pR.top;

      /* 取墨那一行的墨：B 板按黑→白解析式，A 板按标定函数，C 板按这一帧的真实像素 */
      const lumFn = isRamp ? rampLum : isFrame
        ? (t) => {
            const fx = t0 + t * (t1 - t0);
            let L = 0;
            for (const f of [0.3, 0.5, 0.7]) L += FRAME.lum(fx, (top + wR.height * f) / pR.height);
            return L / 3;
          }
        : lumAt;
      if (word.classList.contains('t-ink')) word.style.backgroundImage = inkGradient(lumFn, { n: 24 });

      /* 窗那一族：底的第二份拷贝对齐到这一行字的位置，再按字遮罩 */
      const win = word.querySelector('.win');
      if (!win) continue;
      win.style.backgroundImage = isFrame ? `url(${FRAME.url})` : pane.style.backgroundImage;
      win.style.backgroundSize = isFrame
        ? `${Math.ceil(pR.width)}px ${Math.ceil(pR.height)}px`
        : `${Math.ceil(pR.width)}px 100%`;
      win.style.backgroundPosition = `${-left}px ${isFrame ? -top : 0}px`;
      win.style.webkitMaskImage = `url(${mask})`;
      win.style.maskImage = `url(${mask})`;
    }
  }

  const track = $('.ruler-track');
  if (track) track.style.width = `${Math.ceil(wR0.width)}px`;
}

async function main() {
  const root = $('#boards');
  root.appendChild(buildBoard('board-a',
    '<b>A · 标定夜色带</b>　底色取自 light.js 实测调色板：暗靛 → 随笔池（近白）→ 瞬间池（琥珀）→ 项目池（青）→ 主页池（淡粉紫）。一维、对每一行完全相同，每行的字都横穿全部四种池。',
    ROWS, 'pane--field'));
  const b = buildBoard('board-b',
    '<b>B · 黑 → 白全亮度带</b>　同一批做法扫过全部底色。哪一种做法在哪个亮度上消失，看它那一行断在哪里；下面的刻度只标实测出来的失明点。',
    ROWS, 'pane--ramp');
  root.appendChild(b);
  $('.pane', b).after(rulerEl());

  await document.fonts.ready;
  await loadFrame().catch(() => {});
  if (FRAME) {
    root.appendChild(buildBoard('board-c',
      '<b>C · 真实一帧</b>　从跑着的主页上抓下来的流光画布（<code>assets/field-frame.png</code>，288×180 放大）。底会漂，所以这一帧只是一个样本；取墨那一行的墨按这一帧的真实像素算。',
      ROWS, 'pane--frame'));
  }
  layout();
  addEventListener('resize', layout);
  window.__t = { layout, ROWS, CROSS, hasFrame: !!FRAME };
}

main().catch((e) => {
  window.__t = { error: String(e) };
  throw e;
});
