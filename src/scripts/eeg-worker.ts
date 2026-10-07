/* ─────────────────────────────────────────────────────────────
   脑电波的离屏绘制（Eeg.astro 把 <canvas> 的控制权交到这里）。
   为什么搬进 Worker：波形每帧都在变，主线程上无论写 SVG 的 d 还是画 canvas，
   每一帧都要跑一遍主线程渲染（动画更新 + 样式重算 + 分层提交），并把全站本可只在
   合成器上跑的动画（构块场 160 块、漂移）一起逐帧拉回主线程重算 —— 低端机上这就是
   常驻的卡顿。OffscreenCanvas 从 Worker 直接提交给合成器，不经过主线程。
   路径与 SVG 回退端同源（eeg-wave.ts，Path2D 直接描同一串），样式照抄 Eeg.astro 的 CSS。
   首选 WebGL2 落笔（见下方 paintGl）；拿不到 WebGL2 时才用 2D 上下文（paint）。
   ───────────────────────────────────────────────────────────── */

import { createEegWave, EEG_ECHO_COUNT, makeSpine, type Spine } from './eeg-wave';
import { slotWait } from './frame-slot';
import { Scene, makeGl, type Backend } from './home-linescape-gl';

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
      beat: number;
      d: number;
      colors: Colors;
      still: boolean;
      /** 主线程的 performance.timeOrigin：秒针对齐主线程时钟（主页开屏在主线程按同一秒针裁切字形） */
      origin?: number;
    }
  | {
      /* 主页：线沿一条视口坐标里的骨架走（xy ＝ null 回到过中心的 14° 直线）。
         dark ＝ 背景明暗（0 亮 1 暗，暗场里主波往浅处混）；reveal ＝ 开屏「从中心往两端画出」
         的进度（1 ＝ 画满）；dot ＝ 骨架上一粒琥珀点 [弧长比例, 不透明度]（晨醒底线末端） */
      type: 'spine';
      xy: Float32Array | null;
      dark: number;
      reveal: number;
      dot: [number, number] | null;
      /** 振幅倍率（关于页退场收平用），缺省 1 */
      amp?: number;
    }
  | { type: 'size'; W: number; H: number; dpr: number }
  | { type: 'mix'; d: number; colors: Colors }
  | { type: 'hidden'; hidden: boolean };

/* 与 Eeg.astro 里 .eeg-main / .eeg-echo-* 的 CSS 逐项对应（SVG 回退端仍读 CSS） */
const MAIN_STYLE = { width: 1.2, op: 0.62, color: 'umber' as const };
const ECHO_STYLE = [
  { width: 1.15, op: 0.34, color: 'amber' as const, dash: [] as number[] },
  { width: 1.05, op: 0.26, color: 'wake' as const, dash: [] as number[] },
  { width: 0.95, op: 0.19, color: 'dream' as const, dash: [5, 7] },
];

let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
let wave: ReturnType<typeof createEegWave>;
let W = 0;
let H = 0;
let dpr = 1;
let d = 0;
let colors: Colors;
let still = false; // 减动效：只画静帧，不起循环
let hidden = false;
let echoesOn = false;
let lastDraw = 0;
let origin = NaN; // 主线程 timeOrigin；NaN ＝ 用 Worker 自己的时钟
let spine: Spine | null = null;
let spineVer = 0;
let dark = 0;
let reveal = 1;
let dot: [number, number] | null = null;
/* Worker 的 performance 时钟 → 主线程时钟（秒） */
const clock = (ts: number) => (Number.isNaN(origin) ? ts : performance.timeOrigin + ts - origin) / 1000;
let ph = 0;
let mainPath: Path2D | null = null;
const echoPaths: (Path2D | null)[] = Array.from({ length: EEG_ECHO_COUNT }, () => null);

const LIGHT_MAIN = '#d8ccbe';
const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
function rgbOf(h: string) {
  const m = h.match(/\d+(\.\d+)?/g);
  if (h.startsWith('rgb') && m) return m.slice(0, 3).map(Number);
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}
const mixRgb = (A: number[], B: number[], t: number) => A.map((v, i) => Math.round(v + (B[i] - v) * t));
function mixHex(a: string, b: string, t: number) {
  return `rgb(${mixRgb(rgbOf(a), rgbOf(b), t).join(',')})`;
}
function pointAt(s: number): [number, number] {
  const { xy, L } = spine as Spine;
  let j = 1;
  while (j < L.length - 1 && L[j] < s) j++;
  const t = Math.max(0, Math.min(1, (s - L[j - 1]) / (L[j] - L[j - 1] || 1)));
  return [xy[2 * j - 2] + (xy[2 * j] - xy[2 * j - 2]) * t, xy[2 * j - 1] + (xy[2 * j + 1] - xy[2 * j - 1]) * t];
}
function glow(s: number, R: number, a: number) {
  const [x, y] = pointAt(s);
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `rgba(217,160,91,${a})`);
  g.addColorStop(1, 'rgba(217,160,91,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

function paint() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 视口坐标 → 设备像素；再绕视口中心转 14°（＝ SVG 里 <g transform="rotate(14 cx cy)">）
  const cx = W / 2;
  const cy = H * 0.5;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!spine) {
    ctx.translate(cx, cy);
    ctx.rotate((14 * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.miterLimit = 4; // SVG 的默认值（canvas 默认 10）
  // 残影在前、主波压在最上（＝ SVG 里的文档顺序）
  if (echoesOn) {
    for (let i = 0; i < ECHO_STYLE.length; i++) {
      const p = echoPaths[i];
      if (!p) continue;
      const st = ECHO_STYLE[i];
      ctx.globalAlpha = st.op * d; // ＝ opacity: calc(var(--echo-op) * var(--still))
      ctx.strokeStyle = colors[st.color];
      ctx.lineWidth = st.width;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.setLineDash(st.dash);
      ctx.stroke(p);
    }
  }
  if (mainPath) {
    ctx.globalAlpha = MAIN_STYLE.op * (1 + dark * 0.15);
    ctx.strokeStyle = dark > 0.001 ? mixHex(colors[MAIN_STYLE.color], LIGHT_MAIN, dark) : colors[MAIN_STYLE.color];
    ctx.lineWidth = MAIN_STYLE.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (spine && reveal < 1) {
      // 从中心往两端画出：一段居中的实线（路径比骨架略长，按 1.04 估）
      const len = spine.len * 1.04;
      const r = smooth(reveal) * (len / 2 + 40);
      ctx.setLineDash([0, Math.max(0, len / 2 - r), 2 * r, len * 4]);
    } else ctx.setLineDash([]);
    ctx.stroke(mainPath);
    ctx.setLineDash([]);
  }
  if (spine && reveal < 1) {
    // 笔尖：两端各一粒琥珀，画满前淡去
    const r = smooth(reveal) * (spine.len / 2 + 40);
    ctx.globalAlpha = 1 - smooth(Math.max(0, (reveal - 0.85) / 0.15));
    for (const sg of [-1, 1]) glow(spine.len / 2 + sg * r, 10, 0.95);
  }
  if (spine && dot && dot[1] > 0.01) {
    ctx.globalAlpha = dot[1];
    const p = pointAt(spine.len * dot[0]);
    ctx.fillStyle = colors.amber;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── WebGL2 端（首选）：与主页地形共用描线后端（home-linescape-gl.ts）。
   OffscreenCanvas 的 2D 上下文每出一帧，GPU 进程主线程都要回放一遍绘制命令 —— 实测核显上
   光是清屏也要 ~8ms，30fps 下常驻吃掉 GPU 主线程两三成，全站每页都付；WebGL2 只上传几百个顶点。
   画法逐项对照上面的 paint()：同一串路径（eeg-wave.ts 的 d 字符串解析回点列）、同样的线宽 /
   不透明度 / 虚线 / 揭幕窗口 / 笔尖光点；直线版绕视口中心转 14° 在这里对点做。
   描线的接头一律斜接（2D 端主波是圆角）：1px 级的线上两者看不出差别 ── */
let gfx: Backend | null = null;
const scene = new Scene();
let mainStr: string | null = null;
const echoStr: (string | null)[] = Array.from({ length: EEG_ECHO_COUNT }, () => null);
const ROT_C = Math.cos((14 * Math.PI) / 180);
const ROT_S = Math.sin((14 * Math.PI) / 180);
const GLOW_RGB = [217, 160, 91];

/** 一串 d（只有绝对坐标的 M / L / H / V）→ 场景里的一条折线 */
function addPath(str: string): number {
  const pi = scene.begin();
  const rot = !spine;
  const cx = W / 2;
  const cy = H * 0.5;
  let x = 0;
  let y = 0;
  const put = (f: number) => {
    if (!rot) return scene.add(x, y, f);
    const dx = x - cx;
    const dy = y - cy;
    scene.add(cx + dx * ROT_C - dy * ROT_S, cy + dx * ROT_S + dy * ROT_C, f);
  };
  const re = /([MLHV])([^MLHV]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    const v = m[2].trim().split(/[\s,]+/).map(Number);
    if (m[1] === 'M' || m[1] === 'L') {
      x = v[0];
      y = v[1];
      put(m[1] === 'M' ? 1 : 2);
    } else if (m[1] === 'H') {
      x = v[0];
      put(2);
    } else {
      y = v[0];
      put(2);
    }
  }
  return pi;
}

function paintGl() {
  const g = gfx as Backend;
  scene.reset();
  const ops = scene.ops;
  if (echoesOn) {
    for (let i = 0; i < ECHO_STYLE.length; i++) {
      const s = echoStr[i];
      if (!s) continue;
      const st = ECHO_STYLE[i];
      const c = rgbOf(colors[st.color]);
      ops.push({
        t: 'line',
        p: addPath(s),
        w: st.width,
        c: [c[0], c[1], c[2], st.op * d],
        dash: st.dash.length ? [st.dash[0], st.dash[1]] : null,
      });
    }
  }
  if (mainStr) {
    const base = rgbOf(colors[MAIN_STYLE.color]);
    const c = dark > 0.001 ? mixRgb(base, rgbOf(LIGHT_MAIN), dark) : base;
    let win: [number, number] | null = null;
    if (spine && reveal < 1) {
      const len = spine.len * 1.04;
      const r = smooth(reveal) * (len / 2 + 40);
      win = [len / 2 - r, len / 2 + r];
    }
    ops.push({ t: 'line', p: addPath(mainStr), w: MAIN_STYLE.width, c: [c[0], c[1], c[2], MAIN_STYLE.op * (1 + dark * 0.15)], win });
  }
  if (spine && reveal < 1) {
    const r = smooth(reveal) * (spine.len / 2 + 40);
    const a = (1 - smooth(Math.max(0, (reveal - 0.85) / 0.15))) * 0.95;
    for (const sg of [-1, 1]) {
      const [x, y] = pointAt(spine.len / 2 + sg * r);
      ops.push({ t: 'dot', x, y, r: 10, c: [GLOW_RGB[0], GLOW_RGB[1], GLOW_RGB[2], a], soft: true });
    }
  }
  if (spine && dot && dot[1] > 0.01) {
    const [x, y] = pointAt(spine.len * dot[0]);
    const c = rgbOf(colors.amber);
    ops.push({ t: 'dot', x, y, r: 3.2, c: [c[0], c[1], c[2], dot[1]] });
  }
  g.draw(scene);
}

/** 推进到秒针 t；force ＝ 路径没变也重画（换色 / 换尺寸之后） */
function render(t: number, force = false) {
  ph = t;
  lastDraw = performance.now();
  const f = spine ? wave.stepCurve(ph, d, spine, spineVer) : wave.step(ph, d, W, H);
  if (f) {
    if (f.main) {
      mainStr = f.main;
      if (!gfx) mainPath = new Path2D(f.main);
    }
    f.echoes.forEach((s, i) => {
      if (!s) return;
      echoStr[i] = s;
      if (!gfx) echoPaths[i] = new Path2D(s);
    });
    echoesOn = f.echoesOn;
  } else if (!force) return;
  if (gfx) paintGl();
  else paint();
}

function resize(w: number, h: number, r: number) {
  W = w;
  H = h;
  dpr = r;
  if (gfx) return gfx.resize(W, H, dpr);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

/* 帧钟：约 30fps，等到共同时隙再等一个 rAF —— 与主页地形 Worker 落在同一个 vsync 上（frame-slot.ts）。
   梦面不跟地形一起降帧定格：两道阶梯波本就只在拍钟换格时才变，有色两道是连续流动的，
   降帧会把它们也带成一顿一顿的。Worker 里没有 rAF 的环境退回纯定时器 */
const hasRaf = typeof self.requestAnimationFrame === 'function';
function schedule() {
  setTimeout(() => {
    if (hasRaf) self.requestAnimationFrame(tick);
    else tick(performance.now());
  }, slotWait());
}
function tick(ts: number) {
  if (!hidden) render(clock(ts));
  schedule();
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    canvas = m.canvas;
    try {
      gfx = makeGl(canvas, false);
    } catch {
      gfx = null;
    }
    if (!gfx) {
      const c = canvas.getContext('2d');
      if (!c || typeof Path2D !== 'function') {
        self.postMessage({ type: 'fail' });
        return;
      }
      ctx = c;
    }
    wave = createEegWave(m.beat);
    d = m.d;
    colors = m.colors;
    still = m.still;
    if (typeof m.origin === 'number') origin = m.origin;
    resize(m.W, m.H, m.dpr);
    render(clock(performance.now()), true);
    self.postMessage({ type: 'ready' });
    if (still) return;
    schedule();
    // rAF 被节流/停转的环境里由低频定时器兜底补帧（同原先主线程版）
    setInterval(() => {
      if (!hidden && performance.now() - lastDraw > 500) render(clock(performance.now()));
    }, 400);
    return;
  }
  if (!ctx && !gfx) return;
  if (m.type === 'size') {
    resize(m.W, m.H, m.dpr);
    render(ph, true);
  } else if (m.type === 'mix') {
    d = m.d;
    colors = m.colors;
    render(ph, true);
  } else if (m.type === 'spine') {
    spine = m.xy ? makeSpine(m.xy, m.amp ?? 1) : null;
    spineVer++;
    dark = m.dark;
    reveal = m.reveal;
    dot = m.dot;
    render(ph, true);
  } else if (m.type === 'hidden') {
    hidden = m.hidden;
  }
};
