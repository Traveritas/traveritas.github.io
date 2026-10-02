/* ─────────────────────────────────────────────────────────────
   原型 · 线景（/mock/scene-linescape/）的地形离屏绘制。
   全站那条脑电线（Eeg.astro 的 Worker）在开屏是地平线；这里在它下方画一整片
   「同一根线的回声」：一排排与地平线平行的线，按地面透视由远到近 ——
     · 远处（贴着地平线）线细、密、淡，波长被透视压短，几乎融进雾里；
     · 近处线粗、间距大、起伏大；画面下沿由画布上一张静止的 CSS 遮罩淡出。
   每一排的波形就是主线的那条算式（几何在 scene-linescape-terrain.ts，与主线程共用），
   只是读得更晚：越近的一排相位越落后 ⇒ 波从地平线一排排传到眼前。
   近处的山脊遮住远处的线（destination-out 擦掉每排以下的一条带，擦到 9 成）。
   梦态：同一片地形换一种读法 —— 每排按格量化、零阶保持，起伏变成一级级台地。

   两个变体（天空里只留一样东西，且都与线有关）：
     · a「线圈 + 光」：同一根线绕成的一枚闭合大圆，下半截沉到地平线以下，
       近处的排从它前面经过、把它遮住；圆后一团柔光（CSS 预渲染），经过光里的线略被照亮。
       圆在地形上有倒影 —— 错开一截，且圆轻轻浮动时倒影纹丝不动。
     · b「回声飘起」：最远的几排越过地平线，继续向天空极淡地延伸、渐隐（蜃景）。
   锚点（等高线标注 / 测量点）：附近的波形压平；标注处线断开一小段，留给 DOM 上的小字。
   预算：30fps；行数 ≤ 34、步长按透视给、视口裁剪，一帧约 5–6k 点。
   ───────────────────────────────────────────────────────────── */

import {
  CALM,
  TAU,
  WAVE_AMP,
  cl,
  frameAt,
  hillAt,
  makeGeo,
  orbOf,
  rowAt,
  rowsFor,
  sstep,
  waveAt,
  worldX,
  type Anchor,
  type Geo,
  type Orb,
} from './scene-linescape-stem-terrain';

interface Colors {
  umber: string;
  amber: string;
  wake: string;
  dream: string;
}

type Msg =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      W: number;
      H: number;
      dpr: number;
      mobile: boolean;
      d: number;
      colors: Colors;
      still: boolean;
      origin: number;
      variant: 'a' | 'b';
    }
  | { type: 'size'; W: number; H: number; dpr: number; mobile: boolean }
  | { type: 'mix'; d: number; colors: Colors }
  /* xy ＝ 地平线（主线骨架，视口坐标）；fold ＝ 收拢度 0 展开 … 1 收回成单根线；
     boot ＝ 主线程揭幕时刻（performance.now，ms；NaN ＝ 还没揭幕）；anchors ＝ 锚点 */
  | { type: 'state'; xy: Float32Array; fold: number; boot: number; anchors: Anchor[] }
  | { type: 'perf' }
  | { type: 'hidden'; hidden: boolean };

let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
let W = 0;
let H = 0;
let dpr = 1;
let mobile = false;
let variant: 'a' | 'b' = 'a';
let d = 0;
let colors: Colors;
let still = false;
let hidden = false;
let mainOrigin = 0;
let geo: Geo | null = null;
let orb: Orb | null = null;
let anchors: Anchor[] = [];
let fold = 0;
let boot = NaN;
let running = false;
let timer = 0;
const rowPts: number[] = [];
let perfSum = 0;
let perfN = 0;
let perfMax = 0;
let NPT = 0; // 每帧点数（截图脚本读）

/* 圆的回声圈：[向内收(px), 读波延迟(s), 波幅倍数, 不透明度倍数, 线宽, 偏向光色]
   主圈最实；内侧两圈细而淡、波更晚到，像同一根线在圆上绕了几次；最外一圈极淡、几乎不动，像光晕的边 */
const ORB_ECHO: [number, number, number, number, number, number][] = [
  [0, 0, 1, 1, 1, 0],
  [5, 0.6, 0.8, 0.55, 0.75, 0.3],
  [11, 1.3, 0.6, 0.32, 0.6, 0.6],
  [-7, 2.1, 0.35, 0.22, 0.6, 1],
];

/* 茎的线束：[横向偏移(px，桌面), 线宽, 不透明度倍数, 读波延迟(s)]
   间距不均、中间粗两侧细；外侧几根到冠下会张开 */
const STEM: [number, number, number, number][] = [
  [-15, 0.4, 0.3, 2.1],
  [-9.5, 0.5, 0.45, 1.6],
  [-5.2, 0.7, 0.65, 1.0],
  [-2.2, 0.9, 0.85, 0.45],
  [0, 1.1, 1, 0],
  [1.8, 0.9, 0.85, 0.3],
  [4.6, 0.7, 0.65, 0.8],
  [9, 0.5, 0.45, 1.3],
  [16, 0.4, 0.28, 1.9],
];
const STEM_OMAX = 16;

/* 远处几株：[地平线上 x（视口宽比例）, 高度（主茎的比例）, 线数, 线距, 不透明度倍数, 花苞半径(0 ＝ 无), 偏斜, 相位]
   避开左上的问句；越远（越靠地平线上方的左侧）越矮 */
const STALKS: [number, number, number, number, number, number, number, number][] = [
  [0.505, 0.3, 2, 3.2, 0.55, 0, -0.06, 0.7],
  [0.6, 0.48, 3, 3.6, 0.7, 0, 0.03, 1.9],
  [0.835, 0.62, 3, 4, 0.75, 0, 0.05, 2.6],
  [0.9, 0.36, 2, 3.4, 0.6, 0, -0.04, 3.3],
  [0.965, 0.22, 2, 3, 0.5, 0, 0.02, 4.1],
];
const STALKS_M: [number, number, number, number, number, number, number, number][] = [
  [0.3, 0.38, 2, 3, 0.6, 0, -0.05, 0.7],
  [0.86, 0.55, 3, 3.6, 0.7, 0, 0.04, 2.1],
];

/* 主线程时钟（ms）：入场节拍、波的秒针都与主线程（以及主线那个 Worker）对齐 */
const mainNow = () => performance.timeOrigin + performance.now() - mainOrigin;

function parse(c: string): number[] {
  const m = c.match(/\d+(\.\d+)?/g);
  if (c.startsWith('rgb') && m) return m.slice(0, 3).map(Number);
  const x = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${cl(a).toFixed(3)})`;

/* 光的颜色：醒面一线冷蓝（不是白 —— 浅底上白线会直接消失），梦面琥珀 */
const LIGHT_W = [104, 128, 164];

/* 圆环倒影：沿地平线错开（视口宽的比例） */
const REFL_SLIP_D = 0.1;
const REFL_SLIP_M = 0.16;

function geoReady() {
  if (!xyLast) return;
  geo = makeGeo(W, H, mobile, xyLast);
  orb = variant === 'a' ? orbOf(geo) : null;
}
let xyLast: Float32Array | null = null;

/* 某一排上的锚点：calm ＝ 压平系数（0 压平 … 1 原样），inGap ＝ 是否落在标注的断口里 */
function anchorAt(list: Anchor[], s: number): [number, boolean] {
  let calm = 1;
  let gap = false;
  for (const a of list) {
    const ds = s - a.s;
    calm *= 1 - Math.exp(-((ds / CALM) ** 2));
    if (a.gap > 0 && Math.abs(ds) < a.gap) gap = true;
  }
  return [calm, gap];
}

function paint(now: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  NPT = 0;
  if (!geo || fold >= 0.999) return;
  const g = geo;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const ph = now / 1000;
  const since = Number.isNaN(boot) ? -1 : (now - boot) / 1000;
  // 入场：线从中心往两端画出（约 1.3s）之后，地形从地平线一排排往下铺开
  const unfold = still ? 1 : since < 0 ? 0 : sstep((since - 1.05) / 2.4);
  const skyIn = still ? 1 : since < 0 ? 0 : sstep((since - 2.0) / 2.2);
  const open = 1 - sstep(fold);

  const ink = parse(colors.umber);
  const far = mix(parse(colors.wake), parse(colors.dream), d);
  const amber = parse(colors.amber);
  const light = mix(LIGHT_W, amber, d);

  const K = rowsFor(mobile);
  const f = [0, 0, 0, 0];
  const { nx, ny, tx, ty } = g;

  /* ── a：圆环与它的倒影 ── */
  let reflBand: Path2D | null = null;
  const orbPaths: Path2D[] = [];
  let lightGrad: [number, number, number] | null = null;
  if (orb) {
    // 浮动只留极轻的呼吸（原 ±4px 显得晃）
    const bob = still ? 0 : Math.sin(ph * 0.33) * 1.2;
    const cx = orb.cx;
    const cy = orb.cy + bob - fold * 30;
    const R = orb.R;
    // 圆周 ＝ 同一根线：沿圆周的弧长当 u，波形与主线同一条算式；
    // 首尾按弧长线性交叉淡化（waveAt 不是 2π 周期的，直接绕一圈会在接缝处错开）
    const C = TAU * R;
    const U = C / 600;
    // 波幅压到主线的约三分之一：圆是远处的东西，只该微微颤
    const amp = WAVE_AMP * (0.22 + 0.36 * d);
    const n = Math.max(120, Math.round(C / 6));
    // 几圈回声：与地形一样是同一根线的回声 —— 向内依次收一点、读波更晚、更淡
    for (let j = 0; j < ORB_ECHO.length; j++) {
      const [dr, lag, ka] = ORB_ECHO[j];
      const p = new Path2D();
      const pj = ph - lag;
      const rj = R - dr * (1 + d * 0.6);
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * TAU;
        const u = (th / TAU) * U;
        const b = i / n;
        const w = ((1 - b) * waveAt(u, pj, amp) + b * waveAt(u - U, pj, amp)) * ka;
        const r = rj + w;
        const x = cx + Math.cos(th) * r;
        const y = cy + Math.sin(th) * r;
        if (i) p.lineTo(x, y);
        else p.moveTo(x, y);
      }
      orbPaths.push(p);
      NPT += n;
    }
    lightGrad = [orb.cx, orb.cy, R * 1.45];

    /* 倒影：茎与冠一起倒进地形 —— 从茎根往地面里按透视压短，再沿地平线错开一截；
       用的是不浮动的圆心，圆轻轻呼吸时倒影纹丝不动 */
    const lift = Math.hypot(orb.cx - orb.bx, orb.cy - orb.by);
    const slip = (mobile ? REFL_SLIP_M : REFL_SLIP_D) * W;
    const ex = R * 0.92;
    const ey = R * 0.24;
    const Ls = (lift - R) * 0.3; // 茎的倒影（压短）
    const sx = orb.bx + tx * slip;
    const sy = orb.by + ty * slip;
    const rx = sx + nx * (Ls + ey);
    const ry = sy + ny * (Ls + ey);
    const hw = (mobile ? 3.5 : 5) * (1 + d * 0.4);
    reflBand = new Path2D();
    reflBand.ellipse(rx, ry, ex + 4.5, ey + 2.6, (14 * Math.PI) / 180, 0, TAU);
    reflBand.ellipse(rx, ry, Math.max(0.5, ex - 4.5), Math.max(0.5, ey - 2.6), (14 * Math.PI) / 180, 0, TAU);
    // 茎的倒影：一条窄带（与环带不相交，evenodd 下各自成立）
    const L0 = 10;
    const L1 = Ls - 4;
    if (L1 > L0) {
      reflBand.moveTo(sx + nx * L0 - tx * hw, sy + ny * L0 - ty * hw);
      reflBand.lineTo(sx + nx * L0 + tx * hw, sy + ny * L0 + ty * hw);
      reflBand.lineTo(sx + nx * L1 + tx * hw * 0.6, sy + ny * L1 + ty * hw * 0.6);
      reflBand.lineTo(sx + nx * L1 - tx * hw * 0.6, sy + ny * L1 - ty * hw * 0.6);
      reflBand.closePath();
    }
  }

  /* ── stem：巨茎 —— 一束极细的平行线从远处地平线（茎根）沿这个世界的「竖直」升起，
     顶端没入圆、在接近圆时向外微张（花萼感），终点溶进圆心那团光。
     与地形同一种线：横向带主线同源的极弱波动，越往上越弱；茎根埋进地平线的雾，中段最实，
     近冠处渐隐进光。醒面冷而直，梦面暖、更软、更弯。 ── */
  /* ── 远处的几株：从地平线别处升起、更矮更细更淡（越远越矮），顶端或收成一粒小环（花苞），
     或微微张开后散掉。只是陪衬：让那根主茎读成「一片巨大植物里最高的一株」，而不是一件孤立的器物 ── */
  const drawStalks = () => {
    if (!orb) return;
    const list = mobile ? STALKS_M : STALKS;
    const lift0 = Math.hypot(orb.cx - orb.bx, orb.cy - orb.by);
    const grow = still ? 1 : sstep(skyIn * 1.1);
    const sc = mobile ? 0.72 : 1;
    for (const [fx, hf, nl, sp, al, bud, lean, lag0] of list) {
      const s0 = (fx * W - g.xy[0]) / (g.tx || 1);
      frameAt(g, s0, f);
      const bx = f[0] + nx * 6;
      const by = f[1] + ny * 6;
      const h = lift0 * hf;
      const a0 = (0.2 + 0.06 * d) * al * skyIn * open;
      if (a0 < 0.004) continue;
      const topX = bx - nx * h + tx * lean * h;
      const topY = by - ny * h + ty * lean * h;
      const len = Math.hypot(topX - bx, topY - by);
      const ux = (topX - bx) / len;
      const uy = (topY - by) / len;
      const vx = -uy;
      const vy = ux;
      const gr = ctx.createLinearGradient(bx, by, topX, topY);
      const col = mix(far, ink, 0.4);
      const tcol = mix(col, light, 0.35 + 0.35 * d);
      gr.addColorStop(0, rgba(col, 0));
      gr.addColorStop(0.15, rgba(col, a0 * 0.4));
      gr.addColorStop(0.55, rgba(mix(col, tcol, 0.5), a0));
      gr.addColorStop(0.9, rgba(tcol, a0 * 0.7));
      gr.addColorStop(1, rgba(tcol, bud ? a0 * 0.6 : 0));
      ctx.strokeStyle = gr;
      const n = 40;
      for (let j = 0; j < nl; j++) {
        const o = (j - (nl - 1) / 2) * sp * sc;
        const p = new Path2D();
        for (let i = 0; i <= n; i++) {
          const v = (i / n) * grow;
          const wv = waveAt((v * len) / 420, ph - lag0 - j * 0.4 - v, WAVE_AMP * 0.25) * (1 - v);
          // 无苞的：顶上微张
          const sp2 = bud ? 1 - 0.6 * sstep((v - 0.8) / 0.2) : 1 + 2.2 * sstep((v - 0.78) / 0.22);
          const ll = o * sp2 + Math.sin(Math.PI * v) * (2 + 6 * d) + wv;
          const x = bx + ux * len * v + vx * ll;
          const y = by + uy * len * v + vy * ll;
          if (i) p.lineTo(x, y);
          else p.moveTo(x, y);
        }
        ctx.lineWidth = j === (nl - 1) / 2 || nl === 2 ? 0.7 : 0.5;
        ctx.stroke(p);
        NPT += n;
      }
      // 花苞：一粒小环，同一根线绕成，轻微呼吸
      if (bud && grow > 0.95) {
        const r = bud * sc * (1 + (still ? 0 : Math.sin(ph * 0.4 + lag0) * 0.04));
        const ccx = topX + ux * r * 0.9;
        const ccy = topY + uy * r * 0.9;
        ctx.strokeStyle = rgba(tcol, a0 * 0.9);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(ccx, ccy, r, 0, TAU);
        ctx.stroke();
        NPT += 24;
      }
    }
  };

  const drawStem = () => {
    if (!orb) return;
    const bx = orb.bx + nx * 8; // 往地面里埋一点：根部交给近排的遮挡和雾
    const by = orb.by + ny * 8;
    const cx = orb.cx;
    const cy = orb.cy - fold * 30;
    const len = Math.hypot(cx - bx, cy - by);
    const ux = (cx - bx) / len;
    const uy = (cy - by) / len;
    // 横向 ＝ 地平线切向（与 u 垂直）
    const vx = -uy;
    const vy = ux;
    const sc = mobile ? 0.72 : 1;
    const grow = still ? 1 : sstep(skyIn * 1.2); // 入场：茎由根往上长出
    const amp = WAVE_AMP * (0.3 + 0.45 * d);
    const bow = (mobile ? 4 : 7) + (mobile ? 6 : 10) * d; // 一道很缓的弧：植物，不是杆；梦面更弯
    const a0 = (0.26 + 0.06 * d) * skyIn * open;
    if (a0 < 0.004) return;
    const inCrown = 1 - orb.R / len; // 进入圆的那一处（沿茎的比例）
    const baseCol = mix(far, ink, 0.55);
    const topCol = mix(ink, light, 0.55 + 0.3 * d);
    const n = 96;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';

    // 茎心一道很宽、极淡的光：像光沿茎往上送到圆心
    {
      const gr = ctx.createLinearGradient(bx, by, cx, cy);
      gr.addColorStop(0, rgba(light, 0));
      gr.addColorStop(0.35, rgba(light, 0.035 * skyIn * open * (1 + d)));
      gr.addColorStop(inCrown, rgba(light, 0.07 * skyIn * open * (1 + d)));
      gr.addColorStop(1, rgba(light, 0));
      ctx.strokeStyle = gr;
      ctx.lineWidth = (mobile ? 12 : 18) * (1 + 0.5 * d);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const v = (i / n) * grow;
        const b = Math.sin(Math.PI * v) * bow;
        const x = bx + ux * len * v + vx * b;
        const y = by + uy * len * v + vy * b;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    /* 每根线：茎 —— 平行上升（横向带极弱的波，越往上越弱）；到冠下约 0.35R 处以一段
       贝塞尔转弯，切进圆周，再沿圆周向上走一段弧，渐隐。外侧的线切入得更高、走得更远：
       整只圆像是这束茎线张开后绕成的，光盛在中间。茎心那根只到圆的下沿，把光送进去。 */
    const Rr = orb.R * 0.985;
    const aTop = len + orb.R;
    const tB = (len - orb.R) / aTop;
    const tC = len / aTop;
    const P = (aa: number, ll: number, out: number[]) => {
      out[0] = bx + ux * aa + vx * ll;
      out[1] = by + uy * aa + vy * ll;
    };
    const q = [0, 0];
    for (const [off, w, al, lag] of STEM) {
      const o = off * sc * 1.5;
      const rel = Math.abs(off) / STEM_OMAX;
      const sg = Math.sign(off);
      const a1 = len - Rr - orb.R * 1.0; // 开始转弯：早一点、缓一点，像喇叭口的花被，而不是一根柄
      const p = new Path2D();
      // 茎段
      const n1 = 64;
      const aMax = Math.min(a1, aTop * grow);
      for (let i = 0; i <= n1; i++) {
        const aa = (i / n1) * aMax;
        const v = aa / len;
        const wv = waveAt(aa / 420, ph - lag - v * 1.1, amp) * Math.pow(1 - v, 1.3);
        const ll = o + Math.sin(Math.PI * Math.min(1, v)) * bow + wv;
        P(aa, ll, q);
        if (i) p.lineTo(q[0], q[1]);
        else p.moveTo(q[0], q[1]);
      }
      let pts = n1;
      if (aTop * grow > a1) {
        if (sg === 0) {
          // 茎心：直送到圆的下沿
          P(len - Rr * 0.6, 0, q);
          p.lineTo(q[0], q[1]);
        } else {
          const f0 = ((14 + rel * 34) * Math.PI) / 180; // 切入角（从圆底量起）
          const f1 = f0 + ((30 + rel * 105) * Math.PI) / 180; // 弧走到哪
          const ea = len - Rr * Math.cos(f0);
          const el = sg * Rr * Math.sin(f0);
          // 圆在切入点的切向（φ 增大方向）
          const ta = Math.sin(f0);
          const tl = sg * Math.cos(f0);
          const k = (ea - a1) * 0.55;
          const sl = o + Math.sin(Math.PI * (a1 / len)) * bow;
          const c1a = a1 + k;
          const c1l = sl;
          const c2a = ea - ta * k;
          const c2l = el - tl * k;
          const n2 = 18;
          for (let i = 1; i <= n2; i++) {
            const t = i / n2;
            const mt = 1 - t;
            const aa = mt * mt * mt * a1 + 3 * mt * mt * t * c1a + 3 * mt * t * t * c2a + t * t * t * ea;
            const ll = mt * mt * mt * sl + 3 * mt * mt * t * c1l + 3 * mt * t * t * c2l + t * t * t * el;
            P(aa, ll, q);
            p.lineTo(q[0], q[1]);
          }
          const n3 = Math.round(10 + rel * 30);
          for (let i = 1; i <= n3; i++) {
            const ph2 = f0 + ((f1 - f0) * i) / n3;
            P(len - Rr * Math.cos(ph2), sg * Rr * Math.sin(ph2), q);
            p.lineTo(q[0], q[1]);
          }
          pts += n2 + n3;
        }
      }
      NPT += pts;
      const a = a0 * al;
      const gr = ctx.createLinearGradient(bx, by, bx + ux * aTop, by + uy * aTop);
      gr.addColorStop(0, rgba(baseCol, 0));
      gr.addColorStop(0.08, rgba(baseCol, a * 0.3));
      // 两道雾横过茎（透明度凹下去）：远处巨物被雾层切开，才读得出高
      gr.addColorStop(0.19, rgba(baseCol, a * 0.6));
      gr.addColorStop(0.25, rgba(baseCol, a * 0.18));
      gr.addColorStop(0.31, rgba(mix(baseCol, topCol, 0.25), a * 0.75));
      gr.addColorStop(0.38, rgba(mix(baseCol, topCol, 0.4), a));
      gr.addColorStop(Math.min(tB - 0.06, 0.47), rgba(mix(baseCol, topCol, 0.55), a * 0.3));
      gr.addColorStop(tB, rgba(mix(baseCol, topCol, 0.85), a * 0.85));
      gr.addColorStop(tC, rgba(topCol, a * 0.45));
      gr.addColorStop(Math.min(0.99, tC + (1 - tC) * 0.6), rgba(topCol, a * 0.08));
      gr.addColorStop(1, rgba(topCol, 0));
      ctx.strokeStyle = gr;
      ctx.lineWidth = w * (1 + 0.15 * d);
      ctx.stroke(p);
    }
  };
  const drawOrb = () => {
    if (!orbPaths.length) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    const base = (0.34 + 0.08 * d) * skyIn * open;
    orbPaths.forEach((p, j) => {
      const [, , , al, lw, lit] = ORB_ECHO[j];
      ctx.strokeStyle = rgba(mix(ink, light, 0.25 + lit * (0.3 + 0.4 * d)), base * al);
      ctx.lineWidth = lw;
      ctx.stroke(p);
    });
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 锚点按排分组
  const byRow = new Map<number, Anchor[]>();
  for (const a of anchors) {
    if (a.k < 0) continue;
    const l = byRow.get(a.k);
    if (l) l.push(a);
    else byRow.set(a.k, [a]);
  }

  /* ── b：蜃景 —— 最远的十来排越过地平线向天上延伸、渐隐（翻到地平线另一侧，偏移放大） ── */
  if (variant === 'b') {
    const NM = mobile ? 9 : 12;
    for (let j = 0; j < NM; j++) {
      const r = rowAt(g, j + 1);
      const a = 0.3 * Math.pow(1 - j / NM, 1.5) * skyIn * open * open;
      if (a < 0.005) continue;
      const lift = (r.o * 3.2 + 5 + j * 1.5) * (0.4 + 0.6 * skyIn) * open;
      const shimmer = still ? 0 : Math.sin(ph * 0.27 + j * 0.9) * 2.2;
      const path = new Path2D();
      let started = false;
      let cur = 1;
      const step = cl(r.step * 1.6, 8, 22);
      for (let s = 0; s <= g.len + step; s += step) {
        const ss = Math.min(s, g.len);
        cur = frameAt(g, ss, f, cur);
        const xw = worldX(g, r, ss);
        const y = -(lift + shimmer) + (waveAt(xw / 600, ph - r.lag, r.A + 1.2) + hillAt(g, r, xw) * 0.6) * 0.8;
        const X = f[0] + f[2] * y;
        const Y = f[1] + f[3] * y;
        if (X < -30 || X > W + 30) {
          if (started) break;
          continue;
        }
        if (started) path.lineTo(X, Y);
        else {
          path.moveTo(X, Y);
          started = true;
        }
        NPT++;
      }
      ctx.strokeStyle = rgba(far, a);
      ctx.lineWidth = 0.5 + j * 0.02;
      ctx.stroke(path);
    }
  }

  drawStalks(); // 远处几株更矮的茎：同一片「植物」，给主茎尺度
  drawStem(); // 茎在最远处：根部由之后每一排的遮挡带擦掉
  for (let k = 0; k < K; k++) {
    if (orb && k === orb.kFront) drawOrb(); // 圆立在这一深度：更近的排从它前面经过
    const r = rowAt(g, k);
    const { t, p, hill, lag, width } = r;
    // 入场：远的先到，近的后到；收拢：所有排一起贴回地平线
    const ek = sstep(unfold * 1.6 - (k / (K - 1)) * 0.6);
    if (ek <= 0.001) continue;
    const o = r.o * ek * open;
    const A = r.A * (1 + 0.5 * d);
    const q = d * (1.2 + 7 * p); // 梦态量化格（px）
    // 雾：远处淡入地平线；整体再乘入场 / 收拢
    const fog = sstep((t - 0.1) / 0.42);
    const alpha = (0.08 + 0.66 * fog) * ek * open * open;
    if (alpha < 0.004) continue;
    const col = mix(far, ink, sstep(p * 1.6));
    const al = byRow.get(k) ?? [];

    const path = new Path2D();
    rowPts.length = 0;
    let lastY = NaN;
    let minX = 1e9;
    let maxX = -1e9;
    let minY = 1e9;
    let maxY = -1e9;
    /* 视口裁剪：每排近乎一条斜直线，只进出视口一次 —— 进之前的点只记住最后一个当起笔，
       出去之后再画一个点就收笔 */
    const M = 24;
    let inside = false;
    let px = 0;
    let py = 0;
    let pY = 0;
    let has = false;
    let pen = false; // 标注断口：抬笔
    const add = (X: number, Yv: number, draw: boolean) => {
      if (draw && pen) path.lineTo(X, Yv);
      else if (draw) path.moveTo(X, Yv);
      pen = draw;
      rowPts.push(X, Yv);
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Yv < minY) minY = Yv;
      if (Yv > maxY) maxY = Yv;
    };
    let cur = 1;
    let s = 0;
    while (s <= g.len + r.step) {
      const ss = Math.min(s, g.len);
      cur = frameAt(g, ss, f, cur);
      const [calm, inGap] = al.length ? anchorAt(al, ss) : [1, false];
      const xw = worldX(g, r, ss);
      let y = waveAt(xw / 600, ph - lag, A) * calm - hillAt(g, r, xw);
      y *= ek * open;
      if (q > 0.3 && calm > 0.5) y = Math.round(y / q) * q;
      const Y = o + y;
      const X = f[0] + f[2] * Y;
      const Yv = f[1] + f[3] * Y;
      const inNow = X > -M && X < W + M && Yv > -M && Yv < H + M;
      if (inNow && !inside) {
        if (has) {
          add(px, py, true); // 入画前的最后一个点当起笔，线从画框外进来
          lastY = pY;
        }
        inside = true;
      }
      if (inside) {
        if (q > 0.3 && calm > 0.5 && !Number.isNaN(lastY) && Math.abs(Y - lastY) > 0.01) {
          // 梦态：零阶保持 —— 先沿旧高度走到这一格，再竖直落到新高度（台地）
          add(f[0] + f[2] * lastY, f[1] + f[3] * lastY, !inGap);
        }
        add(X, Yv, !inGap);
        lastY = Y;
        if (!inNow) break; // 出画：收笔
      }
      px = X;
      py = Yv;
      pY = Y;
      has = true;
      // 锚点附近步子收细（断口边缘与压平段要落得准）
      let near = false;
      for (const a of al) if (Math.abs(ss - a.s) < CALM * 2.2) near = true;
      s += near ? 3 : r.step;
    }
    if (rowPts.length < 4) continue;
    NPT += rowPts.length / 2;

    /* 遮挡：只擦本排以下一条带（厚度 ＝ 这一排可能的最大起伏 + 余量）—— 能被它挡住的
       也只有这条带里的远排（以及 a 里圆环沉下去的那半截） */
    const band = hill * 1.1 + A * 2.2 + 14;
    const under = new Path2D();
    const np = rowPts.length;
    under.moveTo(rowPts[0], rowPts[1]);
    for (let i = 2; i < np; i += 2) under.lineTo(rowPts[i], rowPts[i + 1]);
    for (let i = np - 2; i >= 0; i -= 2) under.lineTo(rowPts[i] + nx * band, rowPts[i + 1] + ny * band);
    under.closePath();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 0.9 * ek;
    ctx.fillStyle = '#000';
    ctx.fill(under);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 描线：a 里经过圆后那团光的线略被照亮（以光心为圆心的径向渐变，越近越偏光色、略提亮）
    if (lightGrad && maxX > lightGrad[0] - lightGrad[2] && minX < lightGrad[0] + lightGrad[2]) {
      const [lx, ly, lr] = lightGrad;
      const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      const lit = mix(col, light, 0.62);
      gr.addColorStop(0, rgba(lit, alpha * 1.25 + 0.06 * skyIn));
      gr.addColorStop(0.55, rgba(mix(col, light, 0.3 * skyIn), alpha * 1.1));
      gr.addColorStop(1, rgba(col, alpha));
      ctx.strokeStyle = gr;
    } else ctx.strokeStyle = rgba(col, alpha);
    ctx.lineWidth = width;
    ctx.stroke(path);

    /* 倒影（a）：地形线穿过倒影环带的那几小段 —— 梦面被照亮（琥珀），醒面反而断开
       （只剩一圈空缺）。醒面没有异色（reality.ts 把 --amber 混成冷灰），倒影便以「缺席」出现 */
    if (
      reflBand &&
      orb &&
      skyIn > 0.01 &&
      maxY > orb.by - orb.R &&
      minX < orb.bx + orb.R * 3 &&
      maxX > orb.bx - orb.R * 2
    ) {
      ctx.save();
      ctx.clip(reflBand, 'evenodd');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = rgba([0, 0, 0], 0.92 * skyIn);
      ctx.lineWidth = width + 1.2;
      ctx.stroke(path);
      ctx.globalCompositeOperation = 'source-over';
      if (d > 0.02) {
        ctx.strokeStyle = rgba(amber, Math.min(0.95, alpha * 1.3 + 0.2) * skyIn * d);
        ctx.lineWidth = width + 0.4;
        ctx.stroke(path);
      }
      ctx.restore();
    }
  }
  if (orb && orb.kFront >= K) drawOrb();
  ctx.globalAlpha = 1;
}

function loop() {
  timer = 0;
  if (!running) return;
  if (!hidden) {
    const a = performance.now();
    paint(mainNow());
    const ms = performance.now() - a;
    perfSum += ms;
    perfN++;
    if (ms > perfMax) perfMax = ms;
  }
  timer = setTimeout(() => {
    if (typeof self.requestAnimationFrame === 'function') self.requestAnimationFrame(loop);
    else loop();
  }, 24) as unknown as number;
}
function setRunning(on: boolean) {
  if (still) {
    paint(mainNow());
    return;
  }
  if (on === running) return;
  running = on;
  if (on) loop();
  else paint(mainNow()); // 收拢到底：画一帧空白就停
}

function resize(w: number, h: number, r: number) {
  W = w;
  H = h;
  dpr = r;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    canvas = m.canvas;
    const c = canvas.getContext('2d');
    if (!c || typeof Path2D !== 'function') return;
    ctx = c;
    d = m.d;
    colors = m.colors;
    still = m.still;
    mainOrigin = m.origin;
    mobile = m.mobile;
    variant = m.variant;
    resize(m.W, m.H, m.dpr);
    return;
  }
  if (!ctx) return;
  if (m.type === 'size') {
    mobile = m.mobile;
    resize(m.W, m.H, m.dpr);
    geoReady();
    if (!running) paint(mainNow());
  } else if (m.type === 'mix') {
    d = m.d;
    colors = m.colors;
    if (!running) paint(mainNow());
  } else if (m.type === 'state') {
    xyLast = m.xy;
    anchors = m.anchors ?? [];
    geoReady();
    fold = m.fold;
    boot = m.boot;
    setRunning(fold < 0.999);
    if (!running) paint(mainNow());
  } else if (m.type === 'perf') {
    // 截图脚本用：报告并清零每帧绘制耗时
    self.postMessage({ type: 'perf', pts: NPT, avg: perfN ? perfSum / perfN : 0, max: perfMax, n: perfN });
    perfSum = 0;
    perfN = 0;
    perfMax = 0;
  } else if (m.type === 'hidden') {
    hidden = m.hidden;
  }
};
