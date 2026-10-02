/* ─────────────────────────────────────────────────────────────
   主页开屏 · 线景的地形离屏绘制（原型见 design/mocks/scene-linescape-notes.md）。
   全站那条脑电线（Eeg.astro 的 Worker）在开屏是地平线；这里在它下方画一整片
   「同一根线的回声」：一排排与地平线平行的线，按地面透视由远到近 ——
     · 远处（贴着地平线）线细、密、淡，波长被透视压短，几乎融进雾里；
     · 近处线粗、间距大、起伏大；画面下沿由画布上一张静止的 CSS 遮罩淡出。
   每一排的波形就是主线的那条算式（几何在 home-linescape-terrain.ts，与主线程共用），
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
} from './home-linescape-terrain';

interface Colors {
  umber: string;
  amber: string;
  wake: string;
  dream: string;
}
/* 配色：醒 / 梦两端各一组 rgb（home-linescape.ts 的 PAL）；缺省沿用全站强调色 */
export interface Pal {
  nearW: number[];
  nearD: number[];
  farW: number[];
  farD: number[];
  lightW: number[];
  lightD: number[];
  accentD: number[];
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
      pal?: Pal | null;
    }
  | { type: 'size'; W: number; H: number; dpr: number; mobile: boolean }
  | { type: 'mix'; d: number; colors: Colors }
  /* xy ＝ 地平线（主线骨架，视口坐标）；fold ＝ 收拢度 0 展开 … 1 收回成单根线；
     boot ＝ 主线程揭幕时刻（performance.now，ms；NaN ＝ 还没揭幕）；anchors ＝ 锚点 */
  | { type: 'state'; xy: Float32Array; fold: number; boot: number; anchors: Anchor[] }
  | { type: 'perf' }
  | { type: 'hidden'; hidden: boolean };

let canvas: OffscreenCanvas;
let pal: Pal | null = null;
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

  const ink = pal ? mix(pal.nearW, pal.nearD, d) : parse(colors.umber);
  const far = pal ? mix(pal.farW, pal.farD, d) : mix(parse(colors.wake), parse(colors.dream), d);
  const amber = pal ? pal.accentD : parse(colors.amber);
  const light = pal ? mix(pal.lightW, pal.lightD, d) : mix(LIGHT_W, amber, d);

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

    // 倒影：圆心按地平线镜像（落到地面上按透视压扁），再沿地平线错开 —— 用的是不浮动的圆心
    const dist = (orb.cx - g.xy[0]) * nx + (orb.cy - g.xy[1]) * ny; // 负 ＝ 在地平线上方
    const slip = (mobile ? REFL_SLIP_M : REFL_SLIP_D) * W;
    const rx = orb.cx - 2.2 * dist * nx + tx * slip;
    const ry = orb.cy - 2.2 * dist * ny + ty * slip;
    const ex = R * 0.92;
    const ey = R * 0.24;
    reflBand = new Path2D();
    reflBand.ellipse(rx, ry, ex + 4.5, ey + 2.6, (14 * Math.PI) / 180, 0, TAU);
    reflBand.ellipse(rx, ry, Math.max(0.5, ex - 4.5), Math.max(0.5, ey - 2.6), (14 * Math.PI) / 180, 0, TAU);
  }
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
      maxY > orb.cy &&
      minX < orb.cx + orb.R * 3 &&
      maxX > orb.cx - orb.R * 2
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
    pal = m.pal ?? null;
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
