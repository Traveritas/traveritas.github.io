/* ─────────────────────────────────────────────────────────────
 somewhere · r-B · 沉没

 一句话：梦线是**水面**，屋子下半截已经在水里，水面正好齐着眼睛。

 所以这里不做「下面压暗 + 加一点蓝」，做的是水的三件事：
 · 折射 —— 同一根竖棱，出水那截是干的、直的；入水那截立刻弯、抖，并分成三道重影。
   墙脚那道横线也一样，整条在水下，于是顺着水慢慢错开。
 · 体 —— 水下不是一块平涂：光从水面漏下来成一束束竖丝（每束还带一道相位不同的重影），
   越深越暗，越深越静；水底另有一层极缓的焦散。
 · 面 —— 水面是一道极薄的高光，紧贴它下面压一道暗（那才是「水面以下」），
   再上面是一点反照；一道亮沿着水面慢慢走过去。

 抬头是从水底下看水面：正中一小片能看穿的水面（Snell 窗），外面一圈圈极缓的同心纹，
 光在上面碎成一段一段。

 注意：梦线正好落在眼高上（0.44 × 3.0 = 1.32，眼高 1.34），
 所以水面在画面里是一条平直的横线——这是照相机站在水里看到的那个高度，不是画歪了。

 一个 WebGL（流光），其余全画在 room.js 给的那张 2D canvas 上，没有第二块画布。
 ───────────────────────────────────────────────────────────── */
import { trace } from './room.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ── 光柱：一次性算好，之后每帧只读。
      位置不匀、粗细不一、亮度不齐，才像漏下来的光，而不是栅栏。 ── */
const WALLS = ['back', 'right', 'front', 'left'];
const SHAFTS = {};
for (let wi = 0; wi < WALLS.length; wi++) {
  let a = (wi + 3) * 7919 || 1;
  const rnd = () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
  const n = 5;
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      s: (i + 0.15 + rnd() * 0.7) / n, // 沿墙的位置（0 左 → 1 右）
      w: 46 + rnd() * 74, // 一束有多宽
      a: 0.4 + rnd() * 0.6, // 亮度权重
      ph: rnd() * TAU, // 折射相位
      amp: 0.6 + rnd() * 0.8, // 抖动幅度
      kink: rnd() < 0.34 ? 1 : 0, // 一小部分会在半路折一下
      reach: 0.5 + rnd() * 0.5, // 这一束能照到多深
    });
  }
  SHAFTS[WALLS[wi]] = list;
}

/* ── 水底焦散：几团极淡的亮，慢一步地晃 ── */
const CAUSTICS = [];
{
  let a = 20261103;
  const rnd = () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
  for (let i = 0; i < 6; i++) {
    CAUSTICS.push({
      u: 0.1 + rnd() * 0.8,
      v: 0.16 + rnd() * 0.7,
      r: 0.1 + rnd() * 0.16,
      a: 0.06 + rnd() * 0.06,
      ph: rnd() * TAU,
      sp: 0.6 + rnd() * 0.9,
    });
  }
}

export function attachRoom(room) {
  let t = 0;
  let last = 0;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', (e) => (reduced = e.matches));

  /* 不在每帧重建的几张表 */
  const seen = [];

  room.onPaint(({ faces, g, arrive, sink, vw, vh }) => {
    const ts = performance.now();
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    if (!reduced) t += dt;
    void arrive;

    /* 房间的可见度跟着下沉走：从远处涨大时是淡的，包住你时才是实的 */
    const op = smooth(0.06, 0.62, sink);
    if (op < 0.004 || !faces.length) return;

    /* ══════ 一遍：体 ══════ */
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (f.k === 'ceil') paintCeiling(f, g, t, op, vw, vh);
      else if (f.k === 'floor') paintFloor(f, g, t, op, vw, vh);
      else if (f.below.length >= 3) paintWater(f, g, t, op, vw, sink);
    }

    /* ══════ 二遍：棱线、墙脚、水面 ══════
       faces 已按远近排好；棱线统一在这一遍画，同一个墙角不会被两面各画一次 */
    seen.length = 0;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (f.k === 'ceil' || f.k === 'floor') continue;
      if (f.above.length >= 3) dryStubs(f, g, op, seen);
      if (f.below.length >= 3) wetEdges(f, g, t, op, seen);
    }
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (f.k === 'ceil' || f.k === 'floor' || f.line.length !== 2) continue;
      surfaceGloss(f, g, t, op, vw);
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   梦线以下：水
   ═══════════════════════════════════════════════════════════ */
/* 水体：每一面自己从水面往下沉进暗里。
   不用一条全屏共用的渐变——那东西在转场时会横着糊过整个屏幕；
   每面各填各的，反而正好：同一水平上的几面墙是同一个明度，水看起来是连着的。 */
function paintWater(f, g, t, op, vw, sink) {
  if (f.k === 'floor') return;
  const span0 = wallSpan(f);
  if (!span0) return;
  /* 这一面在屏幕上真正露出来的那一段（近平面裁过的时候，
     整面墙可能只剩画面里一小片）。转场途中水线会跑到画面外很远的地方，
     所以要把它收进可视范围，否则那一道「水面以下」的暗会横着糊过整个屏幕。 */
  const tTop = clamp(span0.t0, -60, innerHeight + 60);
  const bg = g.createLinearGradient(0, tTop - 2, 0, Math.max(innerHeight, tTop + 40));
  bg.addColorStop(0, `rgba(26,40,46,${(0.9 * op).toFixed(3)})`);
  bg.addColorStop(0.09, `rgba(15,26,33,${(0.94 * op).toFixed(3)})`);
  bg.addColorStop(0.34, `rgba(8,16,22,${(0.955 * op).toFixed(3)})`);
  bg.addColorStop(1, `rgba(4,9,13,${(0.96 * op).toFixed(3)})`);
  if (!trace(g, f.below)) return;
  g.fillStyle = bg;
  g.fill();

  const s0 = clamp((0 - span0.tx0) / (span0.tx1 - span0.tx0 || 1), 0, 1);
  const s1 = clamp((vw - span0.tx0) / (span0.tx1 - span0.tx0 || 1), 0, 1);
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const s = { ...span0, t0: tTop };

  g.save();
  trace(g, f.below);
  g.clip();

  const litH = clamp(s.h * 0.3, 16, 90);
  const darkH = clamp(s.h * 0.2, 12, 44);
  const left = Math.max(-40, s.left);
  const right = Math.min(vw + 40, s.left + s.width);

  /* 1. 贴着水面的那一层：水把光散开，比深处亮一点点 */
  const lit = g.createLinearGradient(0, s.t0, 0, s.t0 + litH);
  lit.addColorStop(0, `rgba(112,162,160,${(0.17 * op).toFixed(3)})`);
  lit.addColorStop(0.42, `rgba(92,138,142,${(0.065 * op).toFixed(3)})`);
  lit.addColorStop(1, 'rgba(92,138,142,0)');
  g.fillStyle = lit;
  g.fillRect(left, s.t0 - 2, right - left, litH + 4);

  /* 2. 光柱：从水面漏下来的一束束。
        不是线，是**体**——很宽、很淡、越往下越散、越往下越暗，到半路就没了。
        每一束走三遍：边、半宽、芯，相位各自错开一点点，于是边界天然带重影。

        光柱要等屋子真的把你包住了才出现（deep 跟着 sink 走）：
        转场途中屋子还小、还远，那时候画光柱只会糊成一团。 */
  const list = SHAFTS[f.k];
  const deep = smooth(0.62, 0.99, sink);
  if (list && deep > 0.01 && hi - lo > 0.001) {
    const opS = op * deep;
    const ampK = clamp(s.h / 360, 0.4, 1.7) * clamp(0.55 + f.near * 0.85, 0.55, 1.45);
    for (let i = 0; i < list.length; i++) {
      const sh = list[i];
      const u = lerp(lo, hi, sh.s);
      const x = lerp(s.tx0, s.tx1, u);
      const yTop = lerp(s.ty0, s.ty1, u);
      const yBot = lerp(s.by0, s.by1, u);
      const reachY = yTop + (yBot - yTop) * sh.reach;
      if (reachY - yTop < 30) continue;
      /* 光柱的宽度要跟着这一面在屏幕上有多高走：
         裁过的那一面在屏幕上能拉到几千像素，一条 120px 的光带在那儿就是一根柱子。 */
      const wTop = clamp((sh.w * (reachY - yTop)) / 210, 6, 130);
      const amp = 3.6 * sh.amp * ampK;

      /* 一束光不是等宽的一条带：水面处窄、往下散开、到半路就淡没了。
         所以画成一片「楔」——三层由宽到窄、由淡到实，最里面那层才是看得见的那一束。 */
      shaftRibbon(g, x, yTop, reachY, wTop, amp, sh.ph, sh.kink, t, sh.a * opS);
    }
  }

  /* 3. 水面以下那一道暗：没有它，这条线读成「分割」；有了它，才是「水面以下」 */
  const dark = g.createLinearGradient(0, s.t0 - 1, 0, s.t0 + darkH);
  dark.addColorStop(0, `rgba(1,3,5,${(0.7 * op).toFixed(3)})`);
  dark.addColorStop(0.5, `rgba(2,4,7,${(0.26 * op).toFixed(3)})`);
  dark.addColorStop(1, 'rgba(2,4,7,0)');
  g.fillStyle = dark;
  g.fillRect(left, s.t0 - 1, right - left, darkH + 3);

  g.restore();
}

/* 这一面「水下一块」的四条边：上边（水线）左右两点、下边（墙脚）左右两点。
   没被近平面裁过时是准的梯形；裁过就退回包围盒。 */
function wallSpan(f) {
  const p = f.below;
  if (p.length === 4) {
    const t0 = Math.min(p[0].y, p[1].y);
    return {
      tx0: p[0].x,
      ty0: p[0].y,
      tx1: p[1].x,
      ty1: p[1].y,
      by0: p[3].y,
      by1: p[2].y,
      t0,
      h: (p[3].y + p[2].y) / 2 - (p[0].y + p[1].y) / 2,
      left: Math.min(p[0].x, p[1].x, p[2].x, p[3].x),
      width: Math.max(p[0].x, p[1].x, p[2].x, p[3].x) - Math.min(p[0].x, p[1].x, p[2].x, p[3].x),
    };
  }
  const bb = f.bbox;
  return {
    tx0: bb.x0,
    ty0: bb.y0,
    tx1: bb.x1,
    ty1: bb.y0,
    by0: bb.y1,
    by1: bb.y1,
    t0: bb.y0,
    h: bb.y1 - bb.y0,
    left: bb.x0,
    width: bb.x1 - bb.x0,
  };
}

/* 一根竖丝：位移在水面处为 0（接得上那半截干棱），往下很快长出来、再慢慢收住。
   两个不同频率叠在一起才抖得不像正弦，第三个更慢的给它「弯」。
   rate 越小越慢越缓——光柱要缓，棱线可以抖得利一点。 */
function wetLine(g, x, yTop, yBot, amp, ph, t, kink, rate = 1) {
  const n = clamp(Math.round((yBot - yTop) / 18), 4, 30);
  const r = rate;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const y = yTop + (yBot - yTop) * (i / n);
    const d = y - yTop;
    const env = Math.min(1, d / 10) * Math.exp(-d / 780);
    let dx =
      Math.sin(d * 0.048 + ph + t * 0.6 * r) * 0.66 * amp +
      Math.sin(d * 0.0163 - ph * 1.6 + t * 0.28 * r) * 0.44 * amp;
    if (kink) dx += Math.sin(d * 0.0041 * (1.6 - r * 0.6) + ph * 2.3 - t * 0.16 * r) * 0.6 * amp;
    const px = x + dx * env;
    if (i) g.lineTo(px, y);
    else g.moveTo(px, y);
  }
  g.stroke();
}

/* 一束光柱：一片往下散开的楔，而不是一条等宽的带。
   水面处窄、往下张成两倍宽；它自己不发亮——是把身后的水照亮一点点，
   所以用 `lighter` 叠，而不是拿一根实心的色条往上盖。
   三层由宽到窄叠着画，每层都是「上面淡、下面更淡、中间最实」的一小段，
   于是边缘是软的，不会读成一块摆在墙上的板。 */
function shaftRibbon(g, x, yTop, yBot, wTop, amp, ph, kink, t, alpha) {
  const n = clamp(Math.round((yBot - yTop) / 22), 6, 26);
  const layers = [
    { k: 1, w: 1.0, a: 0.062, dx: 0, sk: 0 },
    { k: 0.7, w: 0.58, a: 0.055, dx: 0.12, sk: 1.7 },
    { k: 0.38, w: 0.26, a: 0.05, dx: 0.22, sk: 3.1 },
  ];
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let L = 0; L < layers.length; L++) {
    const ly = layers[L];
    /* 每一层的长度不一样，而且不是从水面才开始淡——
       宽的一层拖得长、窄的一层早早收掉，于是同一束光里也有深浅的段落。 */
    const spanK = ly.k * (0.62 + 0.38 * ((L * 0.37 + 0.41) % 1));
    const yEnd = yTop + (yBot - yTop) * spanK;
    const L_ = [];
    const R_ = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const y = yTop + (yEnd - yTop) * k;
      const d = y - yTop;
      /* 出水处窄、往下张开。半边再叠一点自己的抖动，
         于是光柱的两条边不是平行的——同一条光，两边折得不一样。 */
      const half =
        (wTop * ly.w * (0.3 + k * 1.2)) / 2 *
        (1 + Math.sin(d * 0.02 + ph * 1.3 + ly.sk + t * 0.22) * 0.22);
      const env = (1 - k * 0.4) * Math.min(1, d / 8);
      let dx =
        Math.sin(d * 0.026 + ph + t * 0.3) * 0.7 * amp +
        Math.sin(d * 0.0085 - ph * 1.6 + t * 0.15) * 0.5 * amp;
      if (kink) dx += Math.sin(d * 0.0024 + ph * 2.3 - t * 0.1) * 0.75 * amp;
      const cx = x + dx * env + wTop * ly.dx * k;
      L_.push({ x: cx - half, y });
      R_.push({ x: cx + half, y });
    }
    /* 一片楔：沿左边下、沿右边上，填一条「上不见、中段实、下化掉」的渐变。
       整片一次填完，所以中间不会出现一道一道的接缝。 */
    const grd = g.createLinearGradient(0, yTop, 0, yEnd);
    const A = ly.a * alpha;
    grd.addColorStop(0, `rgba(120,174,176,0)`);
    grd.addColorStop(0.1, `rgba(122,176,176,${(A * 0.5).toFixed(3)})`);
    grd.addColorStop(0.3, `rgba(126,180,180,${A.toFixed(3)})`);
    grd.addColorStop(0.46, `rgba(120,172,176,${(A * 0.5).toFixed(3)})`);
    grd.addColorStop(0.58, `rgba(128,182,182,${(A * 0.86).toFixed(3)})`);
    grd.addColorStop(0.74, `rgba(116,166,170,${(A * 0.34).toFixed(3)})`);
    grd.addColorStop(0.9, `rgba(108,156,162,${(A * 0.12).toFixed(3)})`);
    grd.addColorStop(1, `rgba(100,148,156,0)`);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = L_[i];
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    }
    for (let i = n; i >= 0; i--) {
      const p = R_[i];
      g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fillStyle = grd;
    g.fill();
  }
  g.restore();
}

/* 一条横的（墙脚）：整条都在水下，于是沿长度慢慢错开，不是从一端长出来 */
function wetRow(g, x0, x1, y, amp, ph, t) {
  const n = clamp(Math.round((x1 - x0) / 24), 4, 44);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n);
    const d = x - x0;
    const dy =
      (Math.sin(d * 0.02 + ph + t * 0.5) * 0.72 + Math.sin(d * 0.0068 - ph * 1.4 + t * 0.22) * 0.5) * amp;
    if (i) g.lineTo(x, y + dy);
    else g.moveTo(x, y + dy);
  }
  g.stroke();
}

/* ═══════════════════════════════════════════════════════════
   梦线以上：几乎不画，只把水下的棱往上接一小段
   ═══════════════════════════════════════════════════════════ */
function dryStubs(f, g, op, seen) {
  const p = f.above;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if (Math.abs(b.x - a.x) > 1.6 || Math.abs(b.y - a.y) < 14) continue;
    const x = (a.x + b.x) / 2;
    const key = `d${Math.round(x / 3)}`;
    let dup = false;
    for (let k = 0; k < seen.length; k++) if (seen[k] === key) dup = true;
    if (dup) continue;
    seen.push(key);
    const yBot = Math.max(a.y, b.y);
    const yTop = Math.min(a.y, b.y);
    /* 只在靠近水面的那一小段里露头，越往上越没有：上面是流光的地盘 */
    const h = Math.min(yBot - yTop, 200);
    const grd = g.createLinearGradient(0, yBot, 0, yBot - h);
    grd.addColorStop(0, `rgba(200,218,226,${(0.22 * op).toFixed(3)})`);
    grd.addColorStop(0.28, `rgba(182,200,214,${(0.08 * op).toFixed(3)})`);
    grd.addColorStop(1, 'rgba(182,200,214,0)');
    g.strokeStyle = grd;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, yBot);
    g.lineTo(x, yBot - h);
    g.stroke();
  }
}

/* 水面下的棱与墙脚：和光柱同一套抖动，但更重、更长、重影更明显。
   「同一根竖线，在水下那一段会弯」的那一根，就是这里。 */
function wetEdges(f, g, t, op, seen) {
  const p = f.below;

  if (p.length === 4) {
    drawWetVert(p[1], p[2], f, g, t, op, seen);
    drawWetVert(p[3], p[0], f, g, t, op, seen);
    /* 墙脚：p[2]-p[3]。两面墙的墙脚在画面里是同一个水平——只在都很平时才画 */
    const x0 = Math.min(p[2].x, p[3].x);
    const x1 = Math.max(p[2].x, p[3].x);
    if (x1 - x0 > 24 && Math.abs(p[2].y - p[3].y) < Math.abs(x1 - x0) * 0.5) {
      const y = (p[2].y + p[3].y) / 2;
      const amp = clamp((x1 - x0) / 80, 1.6, 7) * clamp(0.5 + f.near * 0.6, 0.5, 1.25);
      /* 墙脚是屋子里最长的一条横线，也是「水在折它」最容易被看见的地方：
         整条在水下，于是它一路慢慢错开、并拉出两道错位的重影。 */
      g.strokeStyle = `rgba(138,186,186,${(0.34 * op).toFixed(3)})`;
      g.lineWidth = 1.8;
      wetRow(g, x0, x1, y, amp, 1.1, t);
      g.strokeStyle = `rgba(224,240,238,${(0.17 * op).toFixed(3)})`;
      g.lineWidth = 0.9;
      wetRow(g, x0, x1, y + 1.6, amp * 1.45, 3.4, t);
      g.strokeStyle = `rgba(120,162,168,${(0.14 * op).toFixed(3)})`;
      g.lineWidth = 1.2;
      wetRow(g, x0, x1, y - 3.2, amp * 0.7, 5.2, t);
    }
    return;
  }

  /* 被近平面裁过：只认「确实是竖边」的那些棱，免得乱画 */
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if (Math.abs(b.x - a.x) > 1.6 || Math.abs(b.y - a.y) < 14) continue;
    drawWetVert(a, b, f, g, t, op, seen);
  }
}

function drawWetVert(a, b, f, g, t, op, seen) {
  /* 近平面裁过之后，被裁的那条边会横跨几千像素（一个点还贴在相机后面）。
     那条不是棱，是裁切造出来的边——它的中点也不在棱上。所以：
     两端都得在相机前方（z>0 是「离相机多远」），并且幅度按看得见的高度封顶。 */
  if (!(a.z > 0.05 && b.z > 0.05)) return;
  if (Math.abs(b.x - a.x) > 1.6) return;
  const spanY = Math.abs(b.y - a.y);
  if (spanY < 14) return;
  const yTop = Math.min(a.y, b.y);
  const yBot = Math.max(a.y, b.y);
  if (yBot < -40 || yTop > innerHeight + 40) return;
  const shown = Math.min(yBot, innerHeight + 40) - Math.max(yTop, -40);
  if (shown < 12) return;

  const x = (a.x + b.x) / 2;
  const key = `w${Math.round(x / 3)}`;
  for (let k = 0; k < seen.length; k++) if (seen[k] === key) return;
  seen.push(key);

  /* 抖多厉害看这一截在屏幕上真正的长度，不看那根名义上的长边 */
  const amp = clamp(shown / 74, 1.6, 7.5) * clamp(0.55 + f.near * 0.5, 0.55, 1.2);

  /* 三道：冷、暖、以及一道整体偏开一点的淡影 —— 「重影」 */
  g.strokeStyle = `rgba(130,176,180,${(0.34 * op).toFixed(3)})`;
  g.lineWidth = 1.8;
  wetLine(g, x, yTop, yBot, amp, 0.35, t, 0);
  g.strokeStyle = `rgba(220,236,236,${(0.19 * op).toFixed(3)})`;
  g.lineWidth = 0.9;
  wetLine(g, x + 1.3, yTop, yBot, amp * 1.3, 2.05, t, 1);
  g.strokeStyle = `rgba(150,192,194,${(0.12 * op).toFixed(3)})`;
  g.lineWidth = 1.2;
  wetLine(g, x - 2.0, yTop, yBot, amp * 0.8, 4.1, t, 0);
}

/* ═══════════════════════════════════════════════════════════
   水面：一道极薄的高光，一道亮慢慢走过去
   ═══════════════════════════════════════════════════════════ */
function surfaceGloss(f, g, t, op) {
  const a = f.line[0];
  const b = f.line[1];
  if (Math.hypot(b.x - a.x, b.y - a.y) < 6) return;
  const yTop = Math.min(a.y, b.y);

  /* 水面不是一条直的横线——水面一直在轻轻地鼓。
     这一点起伏很小（两三个像素），但少了它，那一条就只是「分割线」。 */
  const undulate = (p, o) => {
    const d = p.x * 0.0042 + o;
    return p.y + Math.sin(d + t * 0.42) * 1.1 + Math.sin(d * 2.7 - t * 0.63 + 1.7) * 0.55;
  };
  const wavePath = (off, steps) => {
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = lerp(a.x, b.x, k);
      const y = lerp(a.y, b.y, k) + off;
      const d = x * 0.0038;
      /* 水面一直有一点点鼓：两三个像素，加上很慢的一点点漂。
         没有它，这条线读成「切开」；有了它，才读成「水面」。 */
      const yy =
        y +
        Math.sin(d + t * 0.42) * 2.2 +
        Math.sin(d * 2.7 - t * 0.63 + 1.7) * 1.05 +
        Math.sin(d * 0.61 + t * 0.19) * 1.3;
      if (i) g.lineTo(x, yy);
      else g.moveTo(x, yy);
    }
  };

  /* 水面对之上那点光的一点反照：不是一条带，是一层往上化开的雾 */
  const gl = g.createLinearGradient(0, yTop - 52, 0, yTop + 3);
  gl.addColorStop(0, 'rgba(206,222,232,0)');
  gl.addColorStop(0.55, `rgba(206,222,232,${(0.022 * op).toFixed(3)})`);
  gl.addColorStop(1, `rgba(210,226,234,${(0.075 * op).toFixed(3)})`);
  g.strokeStyle = gl;
  g.lineWidth = 52;
  wavePath(-24, 26);
  g.stroke();

  /* 水面下方一线薄亮：被上面照亮的那一层水皮 */
  g.strokeStyle = `rgba(154,200,202,${(0.05 * op).toFixed(3)})`;
  g.lineWidth = 3.4;
  wavePath(5, 26);
  g.stroke();

  /* 那道薄高光：两端淡、中段实，像水把一条光摊平了。
     亮度沿整条水线缓慢游走——光偶尔扫过去，就是这一点。 */
  const sweep = ((t * 0.05) % 1.4) - 0.2;
  const grd = g.createLinearGradient(a.x, a.y, b.x, b.y);
  const steps = 11;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const d = u - sweep;
    const bump = Math.exp(-(d * d) / 0.02) * 0.5;
    const al = (0.24 + 0.24 * Math.sin(u * Math.PI)) * (0.62 + bump);
    grd.addColorStop(u, `rgba(230,242,244,${clamp(al * op, 0, 0.66).toFixed(3)})`);
  }
  g.strokeStyle = grd;
  g.lineWidth = 1.1;
  wavePath(0, 48);
  g.stroke();

  /* 水下那一侧的极窄一段：紧贴着水皮的一道折，亮但不连续。
     它让上面「有水面」，也让下面「隔着水」。 */
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = `rgba(168,214,212,${(0.1 * op).toFixed(3)})`;
  g.lineWidth = 1.4;
  g.setLineDash([26, 9, 7, 16]);
  g.lineDashOffset = -t * 13;
  wavePath(2.2, 48);
  g.stroke();
  g.restore();

  /* 一条更细的芯：让它读成「水皮」，不是画上去的一条线 */
  g.strokeStyle = `rgba(248,252,252,${(0.2 * op).toFixed(3)})`;
  g.lineWidth = 0.6;
  wavePath(-0.7, 40);
  g.stroke();

  void undulate;
}

/* ═══════════════════════════════════════════════════════════
   天花板：从水底下看水面
   ═══════════════════════════════════════════════════════════ */
function paintCeiling(f, g, t, op, vw, vh) {
  const poly = f.above;
  if (!trace(g, poly)) return;
  const bb = f.bbox;

  /* 把这一面在画面里真正占的那块量出来：抬头时它几乎铺满，
     平视时只剩顶上一条被压扁的窄边。所以平时它几乎不出现，
     一抬头才慢慢「展开」——这个变化本身就是「我在一个盒子里」。 */
  const x0 = Math.max(0, bb.x0);
  const x1 = Math.min(vw, bb.x1);
  const y0 = Math.max(0, bb.y0);
  const y1 = Math.min(vh, bb.y1);
  const cw = Math.max(0, x1 - x0);
  const ch = Math.max(0, y1 - y0);
  if (cw < 2 || ch < 2) return;
  const vis = clamp((ch / vh) * 1.9 + (cw / vw) * 0.15, 0, 1);
  /* 平视时这一面只剩顶上被压扁的一条，那时它就该完全不画——
     否则它的裁切边会在画面顶上留一个硬角。只有抬头，它才展开。 */
  const a = op * smooth(0.5, 0.95, vis);
  if (a < 0.004) return;

  /* 圆心：就在你正看着的那一点。抬头时它在画面中上；平视时这一面只剩一条，
     圆心自然落到画面外。 */
  const cx = vw * 0.5;
  const cy = vh * 0.47;
  const unit = Math.max(vw, vh);
  const squash = 0.66; // 从下往上看这个平面，圈是被压扁的

  g.save();
  trace(g, poly);
  g.clip();

  /* 1. 先整面压暗：从水底下往上看，水皮大部分时候是面镜子——全反射，
        映回来的是这间屋子自己的暗，不是天光。 */
  const base = g.createRadialGradient(cx, cy, unit * 0.08, cx, cy, unit * 1.0);
  base.addColorStop(0, `rgba(16,30,34,${(0.9 * a).toFixed(3)})`);
  base.addColorStop(0.5, `rgba(9,18,23,${(0.93 * a).toFixed(3)})`);
  base.addColorStop(1, `rgba(4,8,11,${(0.95 * a).toFixed(3)})`);
  g.fillStyle = base;
  g.fillRect(x0 - 4, y0 - 4, cw + 8, ch + 8);

  /* 2. 能看穿的那一片：光从水面上透进来，落成一个软边的浅滩。
        它不会比周围「白」，只是比周围「透」——所以只亮一点点。
        明暗差要比墙上的水弱一档：上面是借着水面看天，不是自己发光。 */
  const R = unit * 0.3;
  const win = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
  win.addColorStop(0, `rgba(138,190,188,${(0.2 * a).toFixed(3)})`);
  win.addColorStop(0.32, `rgba(114,168,172,${(0.14 * a).toFixed(3)})`);
  win.addColorStop(0.68, `rgba(90,140,152,${(0.055 * a).toFixed(3)})`);
  win.addColorStop(1, 'rgba(80,126,140,0)');
  g.fillStyle = win;
  g.beginPath();
  g.ellipse(cx, cy, R * 1.9, R * 1.9 * squash, 0, 0, TAU);
  g.fill();

  /* 3. 一圈圈极缓的同心纹：慢、偏、粗细不匀。不是画在纸上的圆，
        是水皮一直在那里，只是你刚抬头才看见它。
        越往外越稀、越淡——但外圈还留一点点，那才是「水面上还有波纹」。 */
  const rings = 19;
  for (let i = 0; i < rings; i++) {
    const k = i / rings;
    const rr = unit * (0.04 + k * k * 0.52 + k * 0.3) + Math.sin(t * 0.14 + i * 0.55) * unit * 0.009;
    /* 每一圈自己慢慢偏一点心，于是圈不再同心——水在动，不是圆规画的 */
    const ox = Math.sin(t * 0.1 + i * 1.13) * unit * 0.014;
    const oy = Math.cos(t * 0.085 + i * 0.77) * unit * 0.01;
    const fade = Math.exp(-k * 1.15) * (0.24 + 0.3 * Math.sin(i * 1.7 + 0.4));
    const segs = 11;
    g.lineWidth = 0.55 + (i % 4) * 0.24;
    for (let s = 0; s < segs; s++) {
      const ph = i * 1.37 + s * 0.83;
      const a0 = (s / segs) * TAU + t * 0.05 + ph * 0.1;
      const a1 = a0 + (TAU / segs) * (0.26 + 0.52 * Math.abs(Math.sin(ph * 2.1)));
      const al = fade * (0.22 + 0.78 * Math.abs(Math.sin(ph * 1.9 + t * 0.2)));
      if (al <= 0.012) continue;
      g.strokeStyle = `rgba(198,232,228,${(clamp(al, 0, 0.4) * a).toFixed(3)})`;
      g.beginPath();
      g.ellipse(cx + ox, cy + oy, rr, rr * squash, 0, a0, a1);
      g.stroke();
    }
  }

  /* 4. 光碎的几处：短、亮、朝着水面散开的方向。
        「光在上面碎开」就是这些短短的、断开的弧。 */
  for (let i = 0; i < 22; i++) {
    const ph = i * 2.31;
    const br = unit * (0.055 + 0.5 * Math.abs(Math.sin(ph * 1.31)));
    const ang = ph * 2.1 + t * 0.05;
    const al = 0.34 * a * (0.3 + 0.7 * Math.abs(Math.sin(ph * 1.7 + t * 0.35)));
    const span = unit * (0.016 + 0.042 * Math.abs(Math.sin(ph * 0.9 + t * 0.24))) / Math.max(br, 60);
    g.strokeStyle = `rgba(232,248,244,${al.toFixed(3)})`;
    g.lineWidth = 0.6 + (i % 3) * 0.4;
    g.beginPath();
    g.ellipse(cx, cy, br, br * squash, 0, ang, ang + span);
    g.stroke();
  }

  g.restore();
}

/* ═══════════════════════════════════════════════════════════
   水底：最暗的一块，几团极缓的焦散在上面挪
   ═══════════════════════════════════════════════════════════ */
function paintFloor(f, g, t, op, vw, vh) {
  const poly = f.below.length ? f.below : f.above;
  if (!trace(g, poly)) return;

  /* 地比墙更「实」一点：它是屋子唯一的底，不能跟着墙一起黑掉 */
  const bb = f.bbox;
  const base = g.createLinearGradient(0, bb.y0, 0, bb.y1);
  base.addColorStop(0, `rgba(11,20,26,${(0.95 * op).toFixed(3)})`);
  base.addColorStop(0.45, `rgba(8,15,20,${(0.97 * op).toFixed(3)})`);
  base.addColorStop(1, `rgba(5,9,13,${(0.98 * op).toFixed(3)})`);
  g.fillStyle = base;
  g.fill();

  g.save();
  trace(g, poly);
  g.clip();

  const x0 = Math.max(0, bb.x0);
  const x1 = Math.min(vw, bb.x1);
  const y0 = Math.max(0, bb.y0);
  const y1 = Math.min(vh, bb.y1);
  const w = Math.max(1, x1 - x0);
  const hh = Math.max(1, y1 - y0);

  /* 水底不是一块平的黑。它是屋子里唯一「接着水」的那一面：
     正中偏后有一片被水面照下来的亮（比四周淡、比四周冷），
     四周再沉下去。有了这一片，地才不是一块贴上去的黑板。 */
  const fw = Math.max(1, x1 - x0);
  const fh = Math.max(1, y1 - y0);
  const pool = g.createRadialGradient(x0 + fw * 0.5, y0 + fh * 0.72, 0, x0 + fw * 0.5, y0 + fh * 0.72, fw * 0.62);
  pool.addColorStop(0, `rgba(48,80,86,${(0.1 * op).toFixed(3)})`);
  pool.addColorStop(0.45, `rgba(30,56,64,${(0.055 * op).toFixed(3)})`);
  pool.addColorStop(1, 'rgba(18,36,44,0)');
  g.fillStyle = pool;
  g.fillRect(x0 - 2, y0 - 2, fw + 4, fh + 4);

  for (let i = 0; i < CAUSTICS.length; i++) {
    const c = CAUSTICS[i];
    /* 很慢地挪，还要慢一步地变形——水底的亮不是「动」，是「晃」 */
    const x = x0 + w * (c.u + Math.sin(t * 0.07 * c.sp + c.ph) * 0.045);
    const y = y0 + hh * (c.v + Math.cos(t * 0.05 * c.sp + c.ph * 1.7) * 0.05);
    const r = Math.max(w, hh * 1.7) * c.r * (1 + Math.sin(t * 0.11 * c.sp + c.ph) * 0.12);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const al = c.a * op * (0.75 + 0.25 * Math.sin(t * 0.13 * c.sp + c.ph * 0.7));
    rg.addColorStop(0, `rgba(132,180,176,${al.toFixed(3)})`);
    rg.addColorStop(0.5, `rgba(104,148,148,${(al * 0.45).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(96,138,140,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.42, 0, 0, TAU);
    g.fill();
  }

  /* 最靠里的一条暗：地往远处收进去，那里一点光都不剩 */
  const far = g.createLinearGradient(0, y0, 0, y0 + hh * 0.55);
  far.addColorStop(0, `rgba(2,4,6,${(0.5 * op).toFixed(3)})`);
  far.addColorStop(1, 'rgba(2,4,6,0)');
  g.fillStyle = far;
  g.fillRect(x0 - 2, y0 - 2, w + 4, hh * 0.55 + 4);
  g.restore();
}
