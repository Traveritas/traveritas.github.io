/* ─────────────────────────────────────────────────────────────
 somewhere · r-C · 空房间

 一间屋子。梦线以下是真的空：两面墙、一个地、一条墙角。没有家具、没有窗、
 没有第二个装饰。整张下半画面只放三样东西——

   ① 一块光斑
      落在墙角下方那一段墙上，慢慢地挪。它有一块「平」的芯：中间一大片
      几乎同样亮，然后才收——所以它读得出形状，不会糊成一团雾；但收的
      那一段是分几层软硬叠的，所以又指不出边界在哪。上沿收得快、下沿拖
      得长：光是从上斜着落到墙上的。左右两半被墙角的两个面分成两种亮度。
   ② 地上一道细长的反光
      在墙脚线上、正对着那块光斑。光斑往左挪，这道反光就顺着墙脚线滑到
      左边那条墙脚上——「地是个面」是它说出来的。它很细、很长、两头化掉，
      比墙上的光斑淡一个量级：地上是反的，不是自己发的。
   ③ 墙角一团更浓的暗
      三面相交那一点最浓，往上、往两边化开。墙角不画线，靠「这儿比别处
      暗」认出来。

 梦线以上一律不画，流光自己透出来。

 两种笔怎么分开：上面是流光的颗粒（底子给的抖动噪点），下面是一整片没有
 噪点的平滑渐变。分的是「有颗粒 / 没有颗粒」，不是颜色。

 梦线不是「切」是「浸」：每一面墙从自己的上沿几乎全透明，往下很快变成实体，
 于是流光不是被挡在外面，是顺着墙往下渗。全画面没有一条画出来的横线。

 天花板：平视时它在画面顶上只剩一条窄边，不画，留着流光——屋子是往上化开
 的。抬头到它占住画面，才当一面墙立起来：实体、它的暗、贴着轮廓的一圈更深
 的边（盒子在那儿合上）、以及那团光在顶上蹭过、拖出的一道更淡的痕。同时四面
 墙与顶相接的那条棱上也压一道软影——抬头那一下，「我在一个盒子里」是这条棱
 说出来的。

 只有一套色（底 / 中 / 光带 / 亮芯），三个槽填同一份。没有第二条色带。
 ───────────────────────────────────────────────────────────── */
import { initFlow, options, clamp } from './shell2.js';
import { createRoom } from './room.js';
import { createApproach, hint } from './approach.js';

const opt = options();
const root = document.documentElement;

/* 动效偏好：关掉之后光斑停在算好的相位上，房间还是这间房间 */
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mq.matches;
if (mq.addEventListener) mq.addEventListener('change', (e) => (reduced = e.matches));

/* 一套色：靛夜偏紫，亮芯压得很低 */
const theme = [
  [0.046, 0.048, 0.082],
  [0.096, 0.098, 0.152],
  [0.232, 0.212, 0.312],
  [0.67, 0.61, 0.77],
];

const flow = initFlow({
  canvas: document.getElementById('light'),
  theme,
  grain: [0.85, 0.3, 28],
  face: opt.face,
  px: opt.px,
  autoArrive: opt.autoArrive,
  dur: 3000,
});

const room = createRoom({
  autoArrive: opt.autoArrive,
  dur: 3000,
  dream: 0.44, // 梦线在房高 44%（1.32 m，眼高 1.34 m：就压在视线那一条上）
  h: 3.0,
  d: 4.6,
  eye: 1.34,
});

const approach = createApproach(document.body);
hint('向下');

/* ══ 色 ══
   墙和地不是纯黑：纯黑会把屏幕的黑边显出来。带一点蓝，压到几乎不反光。 */
const WALL = [9, 10, 19];
const FLOOR = [3, 4, 10];
const CEIL = [5, 6, 13];
const SHADE = [0, 1, 5]; // 「暗」本身：只往蓝黑里压，不往灰里压
const GLOW = [229, 225, 250]; // 光的色：冷一点。偏暖就成了灯，这间屋子没有灯

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a <= 0 ? 0 : a >= 1 ? 1 : a.toFixed(4)})`;

/* ══ 小工具 ══ */
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

/* 接进当前路径（room.js 的 trace 每次都 beginPath，这里要把几块拼成一块） */
function addPath(g, pts) {
  if (!pts || pts.length < 3) return false;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  return true;
}

/* 软瓣：坐标缩成椭圆，再填一个 0→1 的径向渐变。
   stops 决定这块东西的**形状**：头几个 stop 都接近满值，就是一块「平」的芯；
   末尾几个 stops 挤在一起，边界就收得快。 */
function lobe(g, cx, cy, rx, ry, col, stops, rot = 0) {
  if (!(rx > 0.6) || !(ry > 0.6)) return;
  g.save();
  g.translate(cx, cy);
  if (rot) g.rotate(rot);
  g.scale(rx, ry);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [t, a] of stops) if (a > 0.0012) gr.addColorStop(clamp(t, 0, 0.998), rgba(col, a));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/* 屏幕外直接丢：这些多边形被近平面一裁，坐标能到 ±5 万 */
const onScreen = (f, vw, vh) => f.bbox.x1 > -8 && f.bbox.x0 < vw + 8 && f.bbox.y1 > -8 && f.bbox.y0 < vh + 8;

/* 多边形裁到视口矩形里（只用来量一面露出了多少） */
function clipRect(poly, x0, y0, x1, y1) {
  const cutV = (pts, cx, keepGreater) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ia = keepGreater ? a.x >= cx : a.x <= cx;
      const ib = keepGreater ? b.x >= cx : b.x <= cx;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (cx - a.x) / (b.x - a.x || 1e-6);
        out.push({ x: cx, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  };
  const cutH = (pts, cy, keepGreater) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ia = keepGreater ? a.y >= cy : a.y <= cy;
      const ib = keepGreater ? b.y >= cy : b.y <= cy;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (cy - a.y) / (b.y - a.y || 1e-6);
        out.push({ x: a.x + (b.x - a.x) * t, y: cy });
      }
    }
    return out;
  };
  let p = poly;
  p = cutV(p, x0, true);
  p = cutV(p, x1, false);
  p = cutH(p, y0, true);
  p = cutH(p, y1, false);
  return p;
}

function polyArea(p) {
  if (!p || p.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/* ══ 一条边的「上沿 / 下沿」 ══
   没被近平面裁过时顺序是 上左、上右、下右、下左；裁过之后点数会变，
   这时退回包围盒——只影响软渐变的落点，看不出来。 */
function edgesOf(poly) {
  if (!poly || poly.length < 3) return null;
  if (poly.length === 4) return { top: [poly[0], poly[1]], bot: [poly[3], poly[2]] };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of poly) {
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  return { top: [{ x: x0, y: y0 }, { x: x1, y: y0 }], bot: [{ x: x0, y: y1 }, { x: x1, y: y1 }] };
}

/* 墙角：屏幕上那条竖棱。
   世界竖线在平视时投影出来还是竖的，所以取 below 多边形里「最靠近画面中间
   的那条接近竖直的边」。上端落在梦线上，下端落在墙脚上。 */
function findCorner(faces, vw) {
  let best = null;
  for (const f of faces) {
    if (f.k === 'ceil' || f.k === 'floor') continue;
    const p = f.below;
    if (!p || p.length < 3) continue;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dy < 24 || dx > dy * 0.08) continue;
      const x = (a.x + b.x) / 2;
      if (x < -vw * 0.3 || x > vw * 1.3) continue;
      const d = Math.abs(x - vw * 0.5);
      if (!best || d < best.d) best = { x, top: Math.min(a.y, b.y), bot: Math.max(a.y, b.y), d };
    }
  }
  return best;
}

/* ══ 画 ══ */
const T0 = performance.now();
/* 静止相位：让光斑正好压在墙角的竖棱上。
   这是这一间屋子最重要的一帧——光斑在这里被两个面折成两种亮度，
   屋子有多深是这一下说出来的。正中摆构图，偏了就不是偶遇。 */
const TS = 82;

room.onPaint(({ faces, g, sink, vw, vh }) => {
  /* 下沉到位之前不画：先前是流光，往下才渐显 */
  const a = smoothstep(0.05, 0.62, sink);
  if (a < 0.004) return;

  const T = reduced ? TS : (performance.now() - T0) / 1000 + TS;

  const corner = findCorner(faces, vw);
  const cx = corner ? corner.x : vw * 0.5;
  const yLine = corner ? corner.top : vh * 0.5;
  const yFoot = corner ? corner.bot : vh * 0.78;
  const wallH = Math.max(48, yFoot - yLine);

  /* ── 光斑的心 ──
     两个不同周期的慢摆叠出来：不会对称地来回（那是摆动），也不会匀速
     （那是机械）。竖直方向摆得更小——光比人稳。 */
  const dxm = Math.sin(T * 0.0374) * 0.075 * vw + Math.sin(T * 0.0143 + 1.7) * 0.028 * vw;
  const dym = Math.sin(T * 0.0241 + 0.9) * 0.022 * vh + Math.sin(T * 0.0093 + 2.4) * 0.010 * vh;
  const lx = cx + dxm;
  /* 压得比较低：一是光斑不能顶到梦线上被硬切，二是它离地越近，
     地上那道反光才越说得通 */
  const ly = yLine + wallH * 0.68 + dym;
  const lw = clamp(vw * 0.072, 54, 126); // 半宽
  const lh = clamp(wallH * 0.3, 38, 92); // 半高

  /* ═════ 一、墙与地 ═════ */
  for (const f of faces) {
    if (!onScreen(f, vw, vh)) continue;
    const p = f.below;
    if (!p || p.length < 3) continue;

    g.save();
    g.beginPath();
    if (!addPath(g, p)) {
      g.restore();
      continue;
    }
    g.clip();

    if (f.k === 'floor') {
      /* 地：墙脚一带略提（光从墙上漫下来落在这儿），往画面前沿一路沉下去。
         地永远是这间屋子里最深的那一面。 */
      const gr = g.createLinearGradient(0, yFoot - 10, 0, Math.min(vh + 10, yFoot + wallH * 1.5));
      gr.addColorStop(0, rgba(FLOOR, 0.93 * a));
      gr.addColorStop(0.28, rgba(FLOOR, 0.98 * a));
      gr.addColorStop(1, rgba(FLOOR, 0.996 * a));
      g.fillStyle = gr;
      g.fill();
      /* 用同一个渐变描一遍边：两个面共用的那条棱因此不会漏出一丝底色
         （下面的流光比墙亮，一漏就是一道白边）。 */
      g.strokeStyle = gr;
      g.lineWidth = 1.6;
      g.stroke();
    } else if (f.k === 'ceil') {
      /* 天花板：平视时它只在画面顶上留一条窄边，不画。抬头到它占住画面才立。 */
      const cf = smoothstep(0.14, 0.46, polyArea(clipRect(p.concat(f.above), 0, 0, vw, vh)) / (vw * vh)) * a;
      if (cf > 0.004) {
        g.fillStyle = rgba(CEIL, 0.92 * cf);
        g.fill();
      }
    } else {
      /* 墙：从这一面**自己的**上沿起，先几乎全透明，往下很快变成实体。
         流光就是从这条化开的地方渗进来的，所以梦线不画线，只留浓淡。 */
      const e = edgesOf(p);
      const yTop = (e.top[0].y + e.top[1].y) / 2;
      const fade = clamp(wallH * 0.95, 56, 200);
      const gr = g.createLinearGradient(0, yTop - 1, 0, yTop + fade);
      gr.addColorStop(0, rgba(WALL, 0.05 * a));
      gr.addColorStop(0.24, rgba(WALL, 0.43 * a));
      gr.addColorStop(0.6, rgba(WALL, 0.85 * a));
      gr.addColorStop(1, rgba(WALL, 0.963 * a));
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = gr;
      g.lineWidth = 1.6;
      g.stroke();
    }
    g.restore();
  }

  /* ═════ 二、光斑 ═════
     压在墙角上：左半分落在这一面，右半分落在那一面，两半亮度不同，
     墙角就是在这儿折断的。 */
  const b1 = Math.sin(T * 0.0307) * 0.055;
  const b2 = Math.cos(T * 0.0233 + 1.1) * 0.05;
  const b3 = Math.sin(T * 0.0409 + 0.4) * 0.06;

  for (const f of faces) {
    if (f.k === 'ceil' || f.k === 'floor') continue;
    if (!onScreen(f, vw, vh)) continue;
    const p = f.below;
    if (!p || p.length < 3) continue;

    g.save();
    g.beginPath();
    /* 只裁在梦线以下：以上一律不画，交回流光 */
    if (!addPath(g, p)) {
      g.restore();
      continue;
    }
    g.clip();

    /* 两面受光不同：左墙按 0.66 压下去。差得不算小——这样墙角一眼就看得见；
       但也不算大——不至于读成「一束光被切开」。 */
    const k = (corner && f.center.x < cx ? 0.66 : 1) * a;

    /* 外晕：很宽、很淡，只负责让墙有一点起伏 */
    lobe(g, lx, ly - lh * 0.1, lw * 2.2, lh * 2.3, GLOW, [
      [0, 0.02 * k],
      [0.36, 0.0145 * k],
      [0.72, 0.005 * k],
      [1, 0],
    ]);
    /* 主体：一大片几乎同样亮的芯，到 0.5 才开始收，0.92 之前收干净。
       芯平，形状才立得住；收得快，边界才不会糊。 */
    lobe(g, lx + lw * b1, ly + lh * b2 * 0.4, lw * 0.96, lh * 0.88, GLOW, [
      [0, 0.105 * k],
      [0.46, 0.101 * k],
      [0.66, 0.078 * k],
      [0.84, 0.028 * k],
      [0.94, 0.005 * k],
      [1, 0],
    ]);
    /* 第二个核，偏右上、更小：把亮的地方从椭圆里拽出来，形状不规整 */
    lobe(g, lx + lw * 0.44 + lw * b3, ly - lh * 0.44 + lh * b2 * 0.5, lw * 0.46, lh * 0.38, GLOW, [
      [0, 0.075 * k],
      [0.44, 0.068 * k],
      [0.68, 0.036 * k],
      [0.9, 0.006 * k],
      [1, 0],
    ]);
    /* 下沿：再拖一层更软更薄的，于是上沿收得快、下沿化得长 */
    lobe(g, lx + lw * 0.06, ly + lh * 0.88, lw * 0.74, lh * 0.72, GLOW, [
      [0, 0.034 * k],
      [0.34, 0.026 * k],
      [0.7, 0.0095 * k],
      [1, 0],
    ]);

    g.restore();
  }

  /* ═════ 三、墙角那团更浓的暗 ═════ */
  g.save();
  g.beginPath();
  let any = false;
  for (const f of faces) {
    if (!onScreen(f, vw, vh)) continue;
    if (addPath(g, f.below)) any = true;
  }
  if (any) {
    g.clip();
    /* 三面相交那一点最浓 */
    lobe(g, cx, yFoot + wallH * 0.02, clamp(lw * 1.15, 62, 176), clamp(wallH * 0.5, 52, 132), SHADE, [
      [0, 0.4 * a],
      [0.3, 0.29 * a],
      [0.66, 0.085 * a],
      [1, 0],
    ]);
    /* 竖着再压一道：墙角才「深下去」，而不只是「脏了一块」 */
    lobe(g, cx, yLine + wallH * 0.6, clamp(lw * 0.26, 14, 40), wallH * 0.62, SHADE, [
      [0, 0.2 * a],
      [0.34, 0.14 * a],
      [0.74, 0.032 * a],
      [1, 0],
    ]);
  }
  g.restore();

  /* ═════ 四、地上一道细长的反光 ═════
     只裁在地面上：它是地的，不是墙脚的一条亮边。位置压在那块光斑的正下方，
     方向跟着墙脚线走——光斑偏了、偏到另一面墙上，它就滑过去。 */
  let foot = null;
  for (const f of faces) {
    if (f.k === 'ceil' || f.k === 'floor') continue;
    const p = f.below;
    if (!p || p.length < 4) continue;
    const b0 = p[3];
    const b1 = p[2];
    const x0 = Math.min(b0.x, b1.x);
    const x1 = Math.max(b0.x, b1.x);
    if (lx >= x0 && lx <= x1 && Math.abs(b1.y - b0.y) > 1) {
      foot = { a: b0, b: b1 };
      break;
    }
  }
  const floor = faces.find((f) => f.k === 'floor');
  if (foot && floor && floor.below.length >= 3 && onScreen(floor, vw, vh)) {
    const ddx = foot.b.x - foot.a.x;
    const u = clamp((lx - foot.a.x) / (ddx || 1e-6), 0, 1);
    const sx = foot.a.x + ddx * u;
    const sy = foot.a.y + (foot.b.y - foot.a.y) * u;
    const rot = Math.atan2(foot.b.y - foot.a.y, ddx);

    const half = clamp(lw * 1.5, 74, 215); // 长
    const th = clamp(wallH * 0.075, 8, 24); // 短：细

    g.save();
    g.beginPath();
    if (addPath(g, floor.below)) {
      g.clip();
      g.translate(sx, sy);
      g.rotate(rot);

      /* 先在墙脚外面留一点很淡的光，别让它孤零零贴在棱上 */
      lobe(g, 0, th * 2.4, half * 1.0, th * 1.9, GLOW, [
        [0, 0.016 * a],
        [0.4, 0.011 * a],
        [0.78, 0.0032 * a],
        [1, 0],
      ]);
      /* 那一道本身：又细又长，两头化掉。它比墙上的光斑淡，
         但不能淡到看不见——地上只有这一样东西，它得撑得住。 */
      lobe(g, 0, th * 1.2, half, th * 0.52, GLOW, [
        [0, 0.075 * a],
        [0.26, 0.066 * a],
        [0.56, 0.034 * a],
        [0.8, 0.009 * a],
        [0.94, 0.0018 * a],
        [1, 0],
      ]);
      /* 芯：再窄一半、再实一点，于是「一道」有边界，不会糊成一片雾 */
      lobe(g, 0, th * 1.02, half * 0.44, th * 0.15, GLOW, [
        [0, 0.085 * a],
        [0.34, 0.06 * a],
        [0.72, 0.013 * a],
        [0.92, 0.002 * a],
        [1, 0],
      ]);
    }
    g.restore();
  }

  /* ═════ 五、天花板 ═════
     抬头到它占住画面，才当一面墙立起来。 */
  const ceil = faces.find((f) => f.k === 'ceil');
  if (ceil && ceil.above.length >= 3 && onScreen(ceil, vw, vh)) {
    const vis = clipRect(ceil.above, 0, 0, vw, vh);
    const cov = polyArea(vis) / (vw * vh);
    const cf = smoothstep(0.14, 0.46, cov) * a;
    if (cf > 0.006) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const q of vis) {
        if (q.x < x0) x0 = q.x;
        if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y;
        if (q.y > y1) y1 = q.y;
      }
      g.save();
      g.beginPath();
      if (addPath(g, vis)) {
        g.clip();

        /* 顶面本身：比墙再深一档——它离光最远 */
        g.fillStyle = rgba(CEIL, 0.94 * cf);
        g.fill();

        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const hw = Math.max(40, (x1 - x0) / 2);
        const hh = Math.max(30, (y1 - y0) / 2);

        /* 贴着轮廓的一圈更深：不画线，用几道由宽到窄、由淡到浓的描边叠出来，
           叠到最里面那一两道就是「盒子的边」。没有它，顶面只是一片黑。 */
        const rings = [
          [hh * 0.34, 0.09],
          [hh * 0.2, 0.12],
          [hh * 0.1, 0.15],
          [hh * 0.05, 0.17],
        ];
        for (const [w, al] of rings) {
          g.strokeStyle = rgba(SHADE, al * cf);
          g.lineWidth = w;
          g.stroke();
        }

        /* 四个角再压一点：盒子是靠角站住的 */
        for (const q of vis) {
          lobe(g, q.x, q.y, hw * 0.4, hh * 0.4, SHADE, [
            [0, 0.16 * cf],
            [0.4, 0.1 * cf],
            [0.78, 0.024 * cf],
            [1, 0],
          ]);
        }

        /* 中心反而浅一点：顶不是一块死黑，它有极轻的起伏 */
        lobe(g, mx, my, hw * 1.05, hh * 1.0, GLOW, [
          [0, 0.02 * cf],
          [0.4, 0.013 * cf],
          [0.78, 0.0034 * cf],
          [1, 0],
        ]);

        /* 那团光在顶上蹭过、拖出的一道更淡的痕：不是一块光斑，是一条拖过去的。
           它比墙上的淡得多——光在墙上，顶上只留它经过时的一点。
           贴着画面下沿那条「墙与顶的棱」横着拉，才读成拖过去而不是浮着。 */
        const s = Math.sin(T * 0.0413) * 0.14;
        const sw = Math.sin(T * 0.0173 + 2.2) * 0.08;
        lobe(g, mx + s * hw, y1 - hh * 0.26 + sw * hh * 0.4, hw * 0.66, hh * 0.13, GLOW, [
          [0, 0.036 * cf],
          [0.34, 0.028 * cf],
          [0.7, 0.0105 * cf],
          [0.9, 0.0026 * cf],
          [1, 0],
        ]);
        lobe(g, mx - s * hw * 0.66, y1 - hh * 0.52, hw * 0.46, hh * 0.08, GLOW, [
          [0, 0.02 * cf],
          [0.42, 0.014 * cf],
          [0.8, 0.0032 * cf],
          [1, 0],
        ]);
      }
      g.restore();

      /* 四面墙与顶相接的那条棱：抬头时压一道软影。
         「我在一个盒子里」是这条棱说出来的——不是靠把天花板画黑。
         沿着这条棱拉一条线性渐变带，只让它往墙那侧化开；裁在四面墙自己身上，
         免得糊到顶面去。 */
      const wallAbove = [];
      for (const f of faces) {
        if (f.k === 'ceil' || f.k === 'floor') continue;
        if (f.above && f.above.length >= 3) wallAbove.push(f);
      }
      if (wallAbove.length) {
        g.save();
        g.beginPath();
        let any2 = false;
        for (const f of wallAbove) if (addPath(g, f.above)) any2 = true;
        if (any2) g.clip();

        for (const f of wallAbove) {
          const e = edgesOf(f.above);
          const a0 = e.top[0];
          const a1 = e.top[1];
          if (Math.hypot(a1.x - a0.x, a1.y - a0.y) < 12) continue;
          const mx2 = (a0.x + a1.x) / 2;
          const my2 = (a0.y + a1.y) / 2;
          const deep = clamp(wallH * 0.34, 34, 110);

          const gr2 = g.createLinearGradient(0, my2 - 2, 0, my2 + deep);
          gr2.addColorStop(0, rgba(SHADE, 0.36 * cf));
          gr2.addColorStop(0.26, rgba(SHADE, 0.17 * cf));
          gr2.addColorStop(1, rgba(SHADE, 0));
          g.fillStyle = gr2;
          g.fillRect(Math.min(a0.x, a1.x) - 2, my2 - 2, Math.abs(a1.x - a0.x) + 4, deep + 4);
        }
        g.restore();

        /* 棱上再收一道更深的，让这条交线自己也看得见 */
        g.save();
        g.beginPath();
        let any3 = false;
        for (const f of wallAbove) if (addPath(g, f.above)) any3 = true;
        if (any3) {
          g.clip();
          for (const f of wallAbove) {
            const e = edgesOf(f.above);
            g.beginPath();
            g.moveTo(e.top[0].x, e.top[0].y);
            g.lineTo(e.top[1].x, e.top[1].y);
            g.strokeStyle = rgba(SHADE, 0.34 * cf);
            g.lineWidth = clamp(wallH * 0.045, 3, 11);
            g.stroke();
          }
        }
        g.restore();
      }
    }
  }
});

/* ══ 进站那一段 ══ */
flow.onFrame((s) => {
  approach.update(s.sink, s.vw);
  root.dataset.arrive = s.arrive.toFixed(2);
});

flow.start();
room.start();
