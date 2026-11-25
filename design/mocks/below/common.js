/* ─────────────────────────────────────────────────────────────
 below · 两个原型共用的一点点东西：检索页长什么样（三栏的栏头与卡片，真实标题），
 以及地址参数。不碰 somewhere/ 那套底子。
 ───────────────────────────────────────────────────────────── */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const inOut = (p) => -(Math.cos(Math.PI * clamp(p, 0, 1)) - 1) / 2;
export const TAN = Math.tan((14 * Math.PI) / 180);

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

export const HEADS = [
  { no: 'I', t: '随笔', en: 'ESSAYS' },
  { no: 'II', t: '瞬间', en: 'MOMENTS' },
  { no: 'III', t: '项目', en: 'PROJECTS' },
];

/* 真实标题（src/content 里的），日期只取到日 */
export const ITEMS = [
  [
    ['在显影处：三个声部', '2026-10-28'],
    ['字面与光景 · 全样式样张', '2026-10-02'],
  ],
  [
    ['碎碎念', '2026-11-01'],
    ['一些OPUS5.5的成果', '2026-10-07'],
    ['这地方不错欸', '2026-10-04'],
    ['『原初』', '2026-10-03'],
  ],
  [
    ['wᴾₑᵉₑᵗₙ', 'INDEV'],
    ['ℕ𝔼𝕏𝕌𝕊', 'INDEV'],
    ['𝐼𝑛𝑘𝑝𝑟𝑖𝑛𝑡', 'ALPHA'],
    ['𝔸𝕧𝕖𝕣𝕚𝕥𝔸的昼梦叙集', 'INDEV'],
    ['ℱ𝒶𝓃𝒸𝓎𝒯ℯ𝓍𝓉', 'ALPHA'],
    ['Kimi Code 配色编辑器', 'ALPHA'],
  ],
];

/* 三栏的墨色：随笔是浅底，另两栏是夜色 */
export const INK = [
  { fg: '#232830', soft: '#56606d', glass: 'rgba(250,251,253,0.62)', edge: 'rgba(52,62,82,0.24)' },
  { fg: '#ece6f0', soft: '#a99fb6', glass: 'rgba(236,226,240,0.08)', edge: 'rgba(236,226,240,0.2)' },
  { fg: '#e6ebf1', soft: '#a6b4c6', glass: 'rgba(222,236,244,0.07)', edge: 'rgba(222,236,244,0.2)' },
];

/* 检索页的版面（视口 px）：两条 14° 的分界过 (vw/3, vh/2)、(2vw/3, vh/2)；
   卡片沿栏的斜度排（越往上越偏右），每栏从上往下一摞 */
export function layout(vw, vh) {
  const colW = vw / 3;
  const cw = Math.min(colW * 0.66, 290);
  const heads = HEADS.map((h, k) => {
    const y = 92;
    return { ...h, k, x: (k * 2 + 1) / 6 * vw + (vh / 2 - y) * TAN - 70, y };
  });
  const cards = [];
  ITEMS.forEach((col, k) => {
    let y = 150;
    col.forEach(([title, date], i) => {
      const h = k === 1 ? 128 + ((i * 37) % 40) : k === 0 ? 168 : 92;
      const yc = y + h / 2;
      const cx = (k * 2 + 1) / 6 * vw + (vh / 2 - yc) * TAN;
      cards.push({ k, i, title, date, x: cx - cw / 2, y, w: cw, h });
      y += h + 22;
    });
  });
  return { heads, cards };
}

export function options() {
  const q = new URLSearchParams(location.search);
  const a = q.get('arrive');
  return {
    auto: q.has('arrive') ? (a ? Number(a) : 0) : -1,
    px: q.has('px') ? +q.get('px') : 5,
    debug: q.has('debug'),
  };
}

export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 往下的那一下：滚轮 / ↓ / 上划。返回一个只会触发一次的开关 */
export function onDescend(fn) {
  let done = false;
  let acc = 0;
  let ty = null;
  const go = () => {
    if (done) return;
    done = true;
    fn();
  };
  addEventListener('wheel', (e) => {
    if (done) return;
    e.preventDefault();
    if (e.deltaY > 0 && (acc += e.deltaY) > 50) go();
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!done && ['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(); }
  });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') ty = e.clientY; });
  addEventListener('pointermove', (e) => { if (ty !== null && ty - e.clientY > 50) go(); });
  addEventListener('pointerup', () => { ty = null; });
  return { fire: go, get done() { return done; } };
}
