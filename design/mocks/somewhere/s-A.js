/* ─────────────────────────────────────────────────────────────
  s-A · 远处的地形

  一片永远够不着的远方：层层的脊与台地，最近的一层也在很远处。
  手可以平移、可以推，但那片地形不会因为你走近而变大——它就在那里。

  ── 三层东西 ──
  1. #light  流光场（shell.js 的 initWorld）。全片唯一一个 GL，不再起第二个。
  2. #plate  远景「版画」：六道脊 + 四道台地 + 几粒停在肩上的点光。
             只在你动了镜头之后重画（外加半秒一次极轻的呼吸）；静止时它是死图，
             省下的帧全留给近景那片雾。
  3. #near   近景：贴地的薄雾、几道细线、几十粒浮尘。每帧都动。

  ── 为什么用视差而不是透视 ──
  这一片要的是「够不着」。所以地形不接 world.project()：project 会随 cam.z 放大，
  一旦放大就变成「你走近了」，前提就破了。这里自己算一条极浅的平移：
  某层在屏幕上的位移 = cam.x × 这层自己的系数（最远 0.03、最近 0.17）；
  推（cam.z）只让地形整体抬高几个像素、近处的雾再贴近一点，永远不缩放。
  于是「再推也没有更近」是可感的，不是设定出来的。

  ── 怎么不变成「一张渐变壁纸加几个三角」 ──
  · 脊线用 ridged 多重分形（1 − |2n−1| 再乘以上一层，得到尖顶宽谷），
    不是正弦也不是随机折线；再乘一条很慢的「在场率」包络。
    包络到零的地方脊线自己沉回地平线，被流光吃掉——于是每道脊都不是一条通到底的带，
    而是几个鼓包从雾里升起来、又沉回去。鼓包之间能看见后面那道脊：遮挡是真的。
  · 每层只给一种笔法：有身体又有亮边的叫脊，只有一条线没有身体的叫轮廓，
    只有一块深色没有边的叫剪影。三种笔法交替，画面才不会均匀。
  · 近处必须不空：地平线以下有四道台地的边、一层贴地的雾、几道横着的细线——
    它们是空的，但视线有东西可停。

  ── 小交互以后长在哪 ──
  台地上那几道亮边是「搁架」，脊肩上那几粒不动的点光就是「那儿有个东西」。这一轮
  它们只是在那儿，不可点也不提示；位置已经按层归好（每粒点光知道自己属于哪一层、
  世界坐标在哪），以后加东西就是把新的粒挂回同一个数组，不用重排画面。
  ───────────────────────────────────────────────────────────── */
import { initWorld, options, clamp, lerp } from './shell.js';

const opt = options();
const q = new URLSearchParams(location.search);

/* 视口高 = 1 世界单位。和 shell.js 的投影同一把尺。 */
const HORIZON = 0.58;

/* 动效关掉时：不漂、不呼吸，但地形、层叠、遮挡一样不少——关了动效它还得是一处地方。 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ 调色 ══
   和底子自检同一族：靛夜的天、地平线上偏玫瑰的一线光、地是冷青。
   只是一律再压一点：亮部更少、饱和更低。这一片是远，远就意味着灰。 */
const THEMES = {
  sky: [[0.046, 0.048, 0.086], [0.086, 0.09, 0.152], [0.196, 0.192, 0.298], [0.8, 0.775, 0.885]],
  band: [[0.05, 0.045, 0.068], [0.128, 0.098, 0.136], [0.286, 0.208, 0.248], [0.88, 0.715, 0.615]],
  ground: [[0.031, 0.039, 0.054], [0.07, 0.092, 0.117], [0.148, 0.226, 0.26], [0.6, 0.755, 0.775]],
};
/* 抖动 / 亮芯 / 量化阶：天那一段把抖动压低一点，免得整片天上都是网点 */
const GRAIN = [
  [0.84, 0.24, 30],
  [0.95, 0.3, 26],
  [0.9, 0.28, 28],
];

const world = initWorld({
  canvas: document.getElementById('light'),
  themes: THEMES,
  grain: GRAIN,
  horizon: HORIZON,
  autoArrive: opt.autoArrive,
  face: opt.face,
  px: opt.px,
  wind: false, // 那一阵风是随笔区的，这里不要
});

/* 截图与自检用：?z=1.2 先把镜头推到那儿、?x=0.8 先往右平一段。
   正式走位仍然是拖拽与滚轮；这两个参数只是让截图能停在「已经走了一段」的位置。 */
{
  const z = q.get('z');
  const x = q.get('x');
  if (z) world.cam.z = clamp(+z || 0, -0.55, 2.6);
  if (x) world.cam.x = +x || 0;
}

const plate = document.getElementById('plate');
const near = document.getElementById('near');
const P = plate.getContext('2d');
const N = near.getContext('2d');

/* 两张 2D 都按低一档画、再拉满屏：远景是剪影，近景是雾与细线，本来就没有「锐」这回事；
   省下的填充面积全换成帧数。远景留得比近景细，因为亮边最细能到多细由它决定。 */
const PS = 0.62;
const NS = 0.5;

/* ══ 噪声 ══
   一维值噪声 + ridged 多重分形。不用 shell.js 的 rng：这里要的是「同一条脊线在任意 x
   都能算出来」，随机序列做不到，得是函数。 */
function hash1(i, seed) {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function n1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f); // smoothstep：格点处导数为零，脊线不会一格一折
  return lerp(hash1(i, seed), hash1(i + 1, seed), u);
}
/* ridged 多重分形：每一层先 1 − |2n−1|（在 n = 0.5 处成脊），再平方把顶峰收尖，
   再乘以上一层的值——于是高峰只长在高峰上，山势成串而不均匀铺开。
   普通 fbm 出来的是丘陵；远山要的是这个「乘」出来的锐。 */
function ridgeMultifractal(x, seed, oct) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let prev = 1;
  let nrm = 0;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(2 * n1(x * freq, seed + i * 1319) - 1);
    v = v * v;
    sum += v * amp * prev;
    nrm += amp;
    prev = 0.35 + 0.65 * v;
    amp *= 0.5;
    freq *= 2.05;
  }
  return clamp(sum / (nrm * 0.72), 0, 1.35);
}
/* 很慢的一条「在场率」：这一段地形在不在。0 = 彻底沉回地平线，被流光吃掉。
   频率按「每屏三起三落」给：太高就碎成一排小丘，太低就变成一条通到底的带。
   用 smoothstep 的软门槛，于是鼓包是从雾里长出来的，不是被剪出来的。 */
function presence(x, seed) {
  const v = 0.55 * n1(x * 0.9, seed + 4111) + 0.3 * n1(x * 2.1, seed + 8123) + 0.15 * n1(x * 4.7, seed + 6221);
  const t = clamp((v - 0.34) / 0.24, 0, 1);
  return t * t * (3 - 2 * t);
}
const PRES_X = 2.0; // presence 的横坐标缩放：乘在 wu 上，得到「一屏三起落」

/* ══ 山脊（地平线之上） ══
   k    远近度：0 = 最远、1 = 最近。最近的一层也只是很远处的一层，不是前景。
   amp  脊顶最高能高出地平线多少（单位 = 视口高）
   a    身体的不透明度；edge 是那道亮边
   body 没有身体的那一层就只剩一条轮廓线，穿在别的脊后面 */
const RIDGES = [
  { seed: 3719, k: 0.0, freq: 3.4, amp: 0.088, base: 0.0, a: 0.26, edge: 0.0, body: true, ink: 0, ph: 1.7 },
  { seed: 8231, k: 0.16, freq: 3.0, amp: 0.152, base: 0.0, a: 0.4, edge: 0.12, body: true, ink: 0, ph: 8.3 },
  { seed: 1597, k: 0.33, freq: 2.7, amp: 0.215, base: 0.002, a: 0.0, edge: 0.3, body: false, ink: 1, ph: 3.1 }, // 只有一条亮边
  { seed: 6421, k: 0.5, freq: 2.35, amp: 0.175, base: 0.004, a: 0.6, edge: 0.0, body: true, ink: 1, ph: 12.6 }, // 只有剪影
  { seed: 9091, k: 0.72, freq: 2.0, amp: 0.29, base: 0.008, a: 0.78, edge: 0.34, body: true, ink: 1, ph: 5.9 },
  { seed: 2377, k: 1.0, freq: 1.62, amp: 0.355, base: 0.014, a: 0.95, edge: 0.46, body: true, ink: 2, ph: 0.4 },
];
/* ══ 台地（地平线之下） ══
   每道是一条亮边、一截往下很快淡掉的身体——远看是一片很大的平野被光一层层切开。
   不做成实心：地平线以下也得是流光的，压黑了就成了一条黑腰带。
   spill 是「边沿往上溢出去的那点光」：一道台地的边会把光射进它自己上方的空气里，
   这一层溢光是它读成「有厚度的一级台阶」而不是「一根横线」的全部原因。 */
const TERRACES = [
  { seed: 5501, k: 0.3, y: 0.634, wave: 0.014, a: 0.34, edge: 0.2, spill: 0.05, fade: 0.075, ph: 2.1 },
  { seed: 1103, k: 0.52, y: 0.698, wave: 0.021, a: 0.42, edge: 0.24, spill: 0.065, fade: 0.095, ph: 7.4 },
  { seed: 7717, k: 0.74, y: 0.782, wave: 0.029, a: 0.52, edge: 0.29, spill: 0.085, fade: 0.12, ph: 11.2 },
  { seed: 3313, k: 1.0, y: 0.888, wave: 0.038, a: 0.64, edge: 0.34, spill: 0.11, fade: 0.15, ph: 4.6 },
];
/* 停在脊肩与台地边上的点光：不闪、不动，只跟着它那一层视差走。
   这一轮它们只是在那儿；以后每一粒背后就是一件能碰的东西。
   tick 是它脚下一道极短的竖痕——有了这一痕，它读成「站在那里的一个点」，
   而不是镜头上的灰尘。整片空间「以后能往里加东西」的全部提示就靠这个。 */
const MOTES = [
  { layer: 'r1', wu: 0.46, r: 1.9, a: 0.62, halo: 18, tick: 0 },
  { layer: 'r3', wu: -0.34, r: 2.7, a: 0.72, halo: 26, tick: 5 },
  { layer: 'r5', wu: 0.58, r: 3.4, a: 0.82, halo: 34, tick: 7 },
  { layer: 'r5', wu: -0.74, r: 2.5, a: 0.66, halo: 24, tick: 5 },
  { layer: 't1', wu: 0.12, r: 3.0, a: 0.68, halo: 28, tick: 7 },
  { layer: 't2', wu: -0.52, r: 3.6, a: 0.7, halo: 30, tick: 8 },
];

/* 颜色：一切都在靛 / 冷青这一族里，只靠明度分远近。
   关键的一条：远处的山比天更淡（空气里的水汽把轮廓冲淡了），最近的一层才压成深影。
   所以这一族是从「淡雾蓝」一路走到「近黑」——三档之间正好差出可见的一层。
   最深的一档也不是纯黑：纯黑会把底下的流光压死。 */
const INK = [
  [78, 82, 108], // 最远：几乎就是一缕更蓝的雾
  [40, 42, 64], // 中景
  [11, 13, 26], // 最近：深影
];
const INK_LOW = [8, 12, 20]; // 台地的身体：更冷、更沉
const EDGE = [222, 216, 240]; // 脊的亮边：淡薰
const EDGE_LOW = [188, 212, 216]; // 台地的亮边：淡青
const MOTE = [240, 236, 252];

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a <= 0 ? 0 : a.toFixed(3)})`;

/* ══ 坐标 ══
   世界横坐标 wu 以视口高为单位；某层的世界坐标落屏时再乘它自己的视差系数。
   所有层、所有点光都走这几个函数，于是近景远景点光不会各算一套而错位。 */
let VW = 0;
let VH = 0;
let HY = 0;
/* 窄屏补偿（见 ridgeH）。宽屏 = 1；竖屏按「一屏宽度相当于多少屏高」往上补一点，
   上限 1.9——再补山就顶到天上去了，反而失掉「远处」的尺度。 */
let tall = 1;

const par = (k) => lerp(0.03, 0.17, k); // 视差系数：远层几乎不动
const toScreen = (k, wu) => (wu - world.cam.x * par(k)) * VH;
const toWorld = (k, sx) => sx / VH + world.cam.x * par(k);
/* 推（cam.z）只给几像素的抬升，关掉动效时连这点浮都不要 */
const lift = (k) => world.cam.z * 3.4 * k;

/* 脊高（单位 VH，0 = 沉回地平线）。包络把「有山」与「没山」两段接起来。 */
function ridgeH(L, wu) {
  const r = ridgeMultifractal(wu * L.freq + L.ph, L.seed, 5);
  const pres = presence(wu * PRES_X + L.ph * 0.3, L.seed + 4111);
  // 云气吃掉的那几段直接压回地平线：不用再擦一遍画布，山自己就溶进流光里了
  const eat = 1 - eatAt(wu * PRES_X + L.ph * 0.4, L.seed + 61) * 0.94;
  // base：这一层最远也高过地平线多少。近层要给一点底数，
  // 否则它会在「没山」的地方整条掉到地平线以下，读成突然断掉的台阶。
  // tall：窄屏的补偿。竖屏时视口高远大于一屏的「世界宽度」，
  // 地形按 VH 摆会被压成一条薄带；乘一个由宽高比得到的数，它才还在一个尺度上。
  return (L.base + L.amp * Math.pow(r, 1.15) * pres) * eat * tall;
}
/* 脊顶被吃掉多少（0–1）：一条比地形本身慢得多的云气。
   拿到 1 的地方，山脊连同那条亮边一起化进流光——这是「地形只出现在局部、
   被流光吃掉一半」那一条的实现，也是整个画面不变成剪影壁纸的关键。
   频率故意给得很低（一屏不到两起伏），于是它读成一大片天气，不是一地碎石。 */
function eatAt(wu, seed) {
  const v = 0.5 * n1(wu * 0.85 + 3.3, seed + 2027) + 0.3 * n1(wu * 1.9, seed + 5099) + 0.2 * n1(wu * 4.1, seed + 7207);
  const t = clamp((v - 0.4) / 0.26, 0, 1);
  return t * t * (3 - 2 * t);
}
/* 台地那条边在屏幕上的 y。几乎水平、只歪一点点：这不是透视线，
   是一片很远的平野的边——歪太多就成了透视线，那就不是「远处」了。 */
function terraceY(L, wu) {
  const w = (n1(wu * 1.7 + L.ph, L.seed + 71) - 0.5) * 2;
  const w2 = (n1(wu * 4.6 + L.ph, L.seed + 913) - 0.5) * 2;
  return (L.y + L.wave * (0.62 * w + 0.38 * w2)) * VH + lift(L.k) * 0.7;
}
const ridgeY = (L, wu) => HY - ridgeH(L, wu) * VH + lift(L.k);

/* 按远近排一次序。远 → 近画，近的自然盖住远的——遮挡不是画上去的。 */
const LAYERS = [
  ...RIDGES.map((L, i) => ({ ...L, id: `r${i}`, low: false, depth: L.k })),
  ...TERRACES.map((L, i) => ({ ...L, id: `t${i}`, low: true, depth: 1.08 + L.k * 0.55 })),
].sort((a, b) => a.depth - b.depth);

const STEP = 3; // 每 3 个 CSS px 取一点；剪影本来就是软的，再密也只是白算

function strokePoly(pts, style, width) {
  P.beginPath();
  P.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]);
  P.strokeStyle = style;
  P.lineWidth = width;
  P.lineJoin = 'round';
  P.lineCap = 'butt';
  P.stroke();
}

/* 横向的一条渐变：沿 x 取若干点，每点给一个不透明度。
   亮边与身体都靠它来「慢慢熄灭」——不会在屏幕边上被生硬切断。 */
function horizGradient(n, alphaAt) {
  const g = P.createLinearGradient(0, 0, VW, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.addColorStop(t, alphaAt(t, i));
  }
  return g;
}

/* 画一层：身体 + 亮边 + 停在这一层上的点光。 */
function drawLayer(L) {
  const pts = [];
  for (let x = -STEP * 2; x <= VW + STEP * 2; x += STEP) {
    const wu = toWorld(L.k, x);
    pts.push([x, L.low ? terraceY(L, wu) : ridgeY(L, wu)]);
  }
  if (!pts.length) return;

  const eat = (wu) => (L.low ? 0 : eatAt(wu * PRES_X + L.ph * 0.4, L.seed + 61));

  /* 台地的溢光：把同一条边往上平移几个像素、一遍比一遍宽一遍比一遍淡地描几次。
     这就是「这道边照亮了它上面的空气」——一级台地能读出厚度，靠的全是这几笔。 */
  if (L.low && L.spill > 0.001) {
    for (let k = 3; k >= 1; k--) {
      const up = 0.008 * VH * k;
      const sg = horizGradient(16, (t) => {
        const wu = toWorld(L.k, t * VW);
        const e = presence(wu * PRES_X + L.ph * 0.3 + 4.7, L.seed + 55);
        return rgba(EDGE_LOW, (L.spill * e * 0.5) / k);
      });
      const sh = pts.map((p) => [p[0], p[1] - up]);
      strokePoly(sh, sg, 1.2 + k * 1.6);
    }
  }

  /* 身体：从脊线一直填到地平线（台地则填到它自己那条淡掉的底）。
     竖向用一条渐变，越靠下越透：山的脚下要重新交还给流光，
     不然地平线上那道光就会被一条深色横边压死。 */
  const ink = L.low ? INK_LOW : INK[L.ink];
  if (L.body) {
    const gTop = Math.min(...pts.map((p) => p[1]));
    const gBot = L.low ? gTop + L.fade * VH : HY + 0.008 * VH;
    if (gBot - gTop > 0.5) {
      const g = P.createLinearGradient(0, gTop, 0, gBot);
      if (L.low) {
        g.addColorStop(0, rgba(ink, L.a));
        g.addColorStop(0.22, rgba(ink, L.a * 0.6));
        g.addColorStop(0.58, rgba(ink, L.a * 0.18));
        g.addColorStop(1, rgba(ink, 0));
      } else {
        // 脊：上端接近实心，往下逐渐交还给流光；到地平线处几乎全透
        g.addColorStop(0, rgba(ink, L.a));
        g.addColorStop(0.4, rgba(ink, L.a * 0.9));
        g.addColorStop(0.76, rgba(ink, L.a * 0.42));
        g.addColorStop(1, rgba(ink, L.a * 0.06));
      }
      P.beginPath();
      P.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]);
      P.lineTo(pts[pts.length - 1][0], gBot);
      P.lineTo(pts[0][0], gBot);
      P.closePath();
      P.fillStyle = g;
      P.fill();
    }
  }

  /* 亮边：不是每层都有。有身体的叫「脊」，只有这一线的就是「轮廓」。
     用的是另一条在场率，比身体更早熄灭——于是同一道脊上会有「有东西」与
     「只剩一线」两种段落。再加一点慢速的起伏，免得整条边亮度均匀得像描边。 */
  if (L.edge > 0.001) {
    const edgeC = L.low ? EDGE_LOW : EDGE;
    const g = horizGradient(16, (t) => {
      const wu = toWorld(L.k, t * VW);
      const e = presence(wu * PRES_X + L.ph * 0.3 + 4.7, L.seed + 55);
      const flick = 0.55 + 0.45 * n1(wu * 6.2 + L.ph, L.seed + 31);
      // 被云气吃掉的地方，那条亮边也跟着断
      return rgba(edgeC, L.edge * Math.pow(e, 1.35) * flick * (1 - eat(wu) * 0.92));
    });
    strokePoly(pts, g, L.low ? 1.35 : 1.15);
  }

  /* 这一层上的点光：画在它之后、下一层之前，于是近层会把它盖住——遮挡是真的。
     但那还不够：要是它正好落在更近那道山的身体里，盖上之后就什么都看不见了。
     所以每粒光都就地找一小段能看见的凹口再站定（见 seek）。被挡住的就不画——
     于是这几粒光永远出现在真正敞开的凹口里。这也是以后往里放东西的第一条规则。 */
  for (const M of MOTES) {
    if (M.layer !== L.id) continue;
    const at = seek(L, M);
    if (at === null) continue;
    const sx = toScreen(L.k, at);
    if (sx < -60 || sx > VW + 80) continue;
    mote(sx, L.low ? terraceY(L, at) - 1.5 : ridgeY(L, at) - 2, M);
  }
}

/* 就地找一段能看见的位置：从想要的地方往两边各试几步，取第一处「脊在这里确实鼓着、
   没有被云气吃掉、也不被更近的层挡住」的横向坐标。
   这样点光就不会因为地形是随机的而随机消失——它总是站在一个能看见的地方。 */
function seek(L, M) {
  const STEPU = 0.035;
  for (let i = 0; i < 14; i++) {
    for (const sgn of i === 0 ? [0] : [-1, 1]) {
      const wu = M.wu + sgn * i * STEPU;
      if (!L.low && ridgeH(L, wu) < 0.055) continue;
      if (!L.low && eatAt(wu * PRES_X + L.ph * 0.4, L.seed + 61) > 0.5) continue;
      // 站定之前也要求脚底下是平的：脊线这一小段不能太陡，否则那道光会像飘着
      if (!L.low) {
        const slope = Math.abs(ridgeH(L, wu + 0.02) - ridgeH(L, wu - 0.02));
        if (slope > 0.05) continue;
      }
      if (hidden(L, wu, L.low ? 'low' : 'ridge')) continue;
      return wu;
    }
  }
  return null;
}

/* 这一粒光会不会被更近的层挡住。判据很简单：更近那一层在这个横向位置上有身体
   （或有一条可见的台地边），而它的「顶」比这粒光更高——那就挡住。
   台地的边在屏幕下方，所以它只挡它自己上方的那几层脊，不挡同一水平的东西。 */
function hidden(L, wu, kind) {
  const y = kind === 'low' ? terraceY(L, wu) : ridgeY(L, wu);
  for (const O of LAYERS) {
    if (O.depth <= L.depth) continue;
    if (O.low) {
      // 更近的台地只要那条边在光的下方，就不挡它
      if (terraceY(O, wu) > y) continue;
      return true;
    }
    // 更近的脊：它在这一点上有身体，且脊顶高过（y 更小）这粒光，就挡住
    if (!O.body) continue;
    if (ridgeY(O, wu) < y - 3) return true;
  }
  return false;
}

function mote(x, y, M) {
  /* 光晕 + 芯 + 一小道竖痕。竖痕让它有「落脚点」——一粒悬空的光只是噪点，
     一粒立在脊线上、脚下拖出一小截的光，才读成「那里有个东西，以后可以过去」。 */
  if (M.tick > 0) {
    const tg = P.createLinearGradient(0, y, 0, y + M.tick * 2.4);
    tg.addColorStop(0, rgba(MOTE, M.a * 0.42));
    tg.addColorStop(1, rgba(MOTE, 0));
    P.strokeStyle = tg;
    P.lineWidth = 0.8;
    P.beginPath();
    P.moveTo(x, y + M.r * 0.5);
    P.lineTo(x, y + M.tick * 2.4);
    P.stroke();
  }
  const hg = P.createRadialGradient(x, y, 0, x, y, M.halo);
  hg.addColorStop(0, rgba(MOTE, M.a * 0.3));
  hg.addColorStop(0.32, rgba(MOTE, M.a * 0.1));
  hg.addColorStop(1, rgba(MOTE, 0));
  P.fillStyle = hg;
  P.beginPath();
  P.arc(x, y, M.halo, 0, Math.PI * 2);
  P.fill();
  P.fillStyle = rgba(MOTE, M.a * 0.86);
  P.beginPath();
  P.arc(x, y, M.r, 0, Math.PI * 2);
  P.fill();
}

let plateCam = { x: NaN, z: NaN };
let plateAt = -1e9;

function drawPlate(now) {
  if (VW <= 0 || VH <= 0) return;
  P.setTransform(PS, 0, 0, PS, 0, 0);
  P.clearRect(0, 0, VW, VH);
  for (const L of LAYERS) drawLayer(L);
  plateCam = { x: world.cam.x, z: world.cam.z };
  plateAt = now;
}

/* ══ 近景 ══
   远近交界处那片雾、贴地的几道细线、几十粒浮尘。
   它们存在的唯一理由：近处空无一人，可视线不能空着。 */
const DUST = [];
{
  /* 一条固定种子的线性同余就够：要「不规整」，但不要每次刷新都不一样。 */
  let s = 20261103;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 42; i++) {
    DUST.push({
      x: R(),
      y: R(),
      r: 0.7 + R() * 1.4,
      sp: 0.004 + R() * 0.011,
      ph: R() * Math.PI * 2,
      a: 0.1 + R() * 0.2,
      depth: 0.4 + R() * 0.9,
    });
  }
}
/* 贴地的几道细线：各有一个长度、一个漂移速度、一点倾斜。
   它们不排成网格，也不指向任何地方——只是一片平野上偶尔醒过来的一道亮。
   lift 是这条线离地平线多远（占可用地面高度的比例）：越靠下的线越亮越粗，
   于是这几条线自己就构成了近处的「远近」——地面不是一块空板。 */
const LINES = [
  { t: 0.06, len: 0.5, sp: 0.03, ph: 0.0, a: 0.1, tilt: -0.0009, lift: 1.5 },
  { t: 0.17, len: 0.34, sp: -0.022, ph: 1.9, a: 0.15, tilt: 0.0012, lift: 1.3 },
  { t: 0.31, len: 0.66, sp: 0.017, ph: 3.4, a: 0.16, tilt: -0.0006, lift: 1.1 },
  { t: 0.5, len: 0.28, sp: -0.034, ph: 5.1, a: 0.19, tilt: 0.0017, lift: 1.15 },
  { t: 0.72, len: 0.44, sp: 0.012, ph: 2.2, a: 0.22, tilt: -0.0012, lift: 1.25 },
];

function drawNear(t) {
  if (VW <= 0 || VH <= 0) return;
  const tt = reduce ? 0 : t;
  N.setTransform(NS, 0, 0, NS, 0, 0);
  N.clearRect(0, 0, VW, VH);

  /* 雾：几团压得很扁的软光贴着地平线。一团一个椭圆化的径向渐变，比逐层叠矩形便宜，
     边缘也不会出现一道硬边。它们只在推近的时候往下、往近处挪一点点。 */
  const camx = world.cam.x * 0.24 * VH;
  const pull = world.cam.z * 22;
  for (let i = 0; i < 5; i++) {
    const ph = i * 2.31;
    const cx = VW * (0.1 + i * 0.21) + camx - Math.sin(tt * 0.06 + ph) * 55;
    const cy = HY + (3 + i * 6 + pull) * (VH / 900) + Math.cos(tt * 0.05 + ph) * 3;
    // 推近时雾被吹散一点：光弱下去、铺开去。远处那几道脊却一寸没动——
    // 这一对反差是整片空间唯一的手感。
    const rw = VW * (0.2 + 0.06 * Math.sin(ph)) * (1 + 0.06 * Math.sin(tt * 0.09 + ph) + world.cam.z * 0.05);
    const rh = VH * 0.05 * (1 + 0.12 * Math.sin(tt * 0.07 + ph * 1.7));
    const br = (0.026 + 0.01 * Math.sin(tt * 0.11 + ph)) * clamp(1 - world.cam.z * 0.16, 0.45, 1.2); // 呼吸：很慢、很浅
    N.save();
    N.translate(cx, cy);
    N.scale(1, rh / rw);
    const g = N.createRadialGradient(0, 0, 0, 0, 0, rw);
    g.addColorStop(0, `rgba(196,204,226,${br.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(186,196,222,${(br * 0.38).toFixed(3)})`);
    g.addColorStop(1, 'rgba(178,192,220,0)');
    N.fillStyle = g;
    N.beginPath();
    N.arc(0, 0, rw, 0, Math.PI * 2);
    N.fill();
    N.restore();
  }

  /* 细线：一条横着的渐变，两端自己熄灭。
     线在走、渐变的中心也跟着走，读起来是「一段亮在移动」，不是一条被裁掉的长线。
     t 是它在地面那一段里的相对位置（0 = 贴着地平线，1 = 贴着屏幕底边）。
     我把屏幕留给地面的那一段再往下多切一点，让地面占到约 2/3 屏高——
     近处要是只有一条窄带，整片空间仍然是空的。 */
  const gTop = HY + 0.004 * VH;
  const gBot = VH * 1.02;
  /* 推近（cam.z）时，近处的细线要真的往脚下流过去：越靠下的线走得越快、越长。
     这是「够不着」的对照面——远处一寸没动，近处你却在动。
     同一组手势因此有了一件可感的事：推，近处的雾散开一点，山一点没变。 */
  const push = world.cam.z;
  for (const L of LINES) {
    const sp = push * (0.06 + L.t * 0.5);
    const base = gTop + (gBot - gTop) * Math.pow(L.t, 1.35) * (L.lift * 0.62);
    const y = base + Math.sin(tt * 0.11 + L.ph) * (1.4 + L.t * 2.6) + sp * VH * 0.05;
    const cx = (((L.sp * tt * 3 + L.ph * 0.17 - world.cam.x * 0.3) % 1.4) + 1.4) % 1.4 - 0.2;
    const half = ((L.len + Math.abs(sp) * 0.5) * VW) / 2;
    const xa = cx * VW - half;
    const xb = cx * VW + half;
    const dy = L.tilt * VW * 0.5;
    const g = N.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, 'rgba(212,214,232,0)');
    g.addColorStop(0.4, `rgba(212,214,232,${(L.a * 0.5).toFixed(3)})`);
    g.addColorStop(0.58, `rgba(222,224,240,${L.a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(212,214,232,0)');
    N.strokeStyle = g;
    N.lineWidth = 0.8 + L.t * 0.5;
    N.beginPath();
    N.moveTo(xa, y - dy);
    N.lineTo(xb, y + dy);
    N.stroke();
  }

  /* 浮尘：散的，不排成带。地平线之上也放一些，但那边压得更淡——
     天本来就是亮的，不该再添东西去抢。 */
  for (const d of DUST) {
    const bx = (((d.x + tt * d.sp - world.cam.x * 0.05 * d.depth) % 1) + 1) % 1;
    const by = d.y + Math.sin(tt * 0.23 + d.ph) * 0.006;
    const sx = bx * (VW + 80) - 40;
    const sy = by * VH;
    const tw = 0.6 + 0.4 * Math.sin(tt * 0.7 + d.ph * 3);
    const hi = sy < HY ? 0.4 : 1;
    N.fillStyle = `rgba(228,226,240,${(d.a * tw * hi).toFixed(3)})`;
    N.beginPath();
    N.arc(sx, sy, d.r, 0, Math.PI * 2);
    N.fill();
  }
}

/* ══ 尺寸 ══
   只在真的变了的时候重设（重设会清掉画布，也会重新分配显存）。 */
function fit() {
  const w = world.vw;
  const h = world.vh;
  if (w === VW && h === VH) return;
  VW = w;
  VH = h;
  HY = h * HORIZON;
  /* 窄屏补偿：一屏有多宽（以屏高为单位）。宽屏 16:9 是 1.6，竖屏 390×844 只有 0.46。
     山脊的高度是按屏高给的，宽度却按屏宽铺——窄屏于是显得山小、天多。
     所以给一个由宽高比得到的系数，把脊顶按「一屏变窄了多少」抬回来一部分。 */
  const aspect = w / h;
  tall = clamp(Math.pow(1.55 / Math.max(0.3, aspect), 0.55), 1, 1.9);
  for (const [el, s] of [
    [plate, PS],
    [near, NS],
  ]) {
    el.width = Math.max(1, Math.round(w * s));
    el.height = Math.max(1, Math.round(h * s));
  }
  plateCam = { x: NaN, z: NaN }; // 强制重画
  if (VW > 0) drawPlate(0);
}

/* ══ 走没走过 ══
   动过手就把提示收起来，不再回来。推哪怕一点点也算。 */
let walked = false;
world.onFrame((s) => {
  fit();

  /* 转场期间把自己的东西淡进来：先出远景（它是从远处浮起来的），
     雾与尘稍晚一点——先有山，再有地上的东西。 */
  const a1 = clamp((s.arrive - 0.3) / 0.5, 0, 1);
  const a2 = clamp((s.arrive - 0.44) / 0.5, 0, 1);
  plate.style.opacity = (a1 * 0.98).toFixed(3);
  near.style.opacity = a2.toFixed(3);
  if (a1 <= 0) return;

  /* 版画：动了才重画；不动的时候每半秒醒一次，让脊上的光有极轻的呼吸。
     动效关掉时连呼吸都不要，于是静止时它真的是一张死图。 */
  const moved = Math.abs(world.cam.x - plateCam.x) > 0.0004 || Math.abs(world.cam.z - plateCam.z) > 0.002;
  if (moved || plateCam.x !== plateCam.x || (!reduce && s.t - plateAt > 0.5)) drawPlate(s.t);

  drawNear(s.t);

  if (!walked && Math.abs(world.cam.x) + Math.abs(world.cam.z) > 0.03) {
    walked = true;
    document.body.classList.add('sa-walked');
  }
});

world.start();
