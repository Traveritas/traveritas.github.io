/* ─────────────────────────────────────────────────────────────
  C · 一条很长的路

  一条向深处收在一个点上的廊。没有速度、没有目标、没有终点。
  你往前推，路就在前面接着长出来——不是你走到了哪里，是路一直在流过去。

  ── 画在哪 ──
  背景仍然是 shell.js 那支流光（正式站同一个 WebGL 上下文，一个都不多建）。
  廊画在它上面的一层 Canvas2D（#road）里：只有线，没有面。
  为什么不用 Three：这条廊要的是「线的收敛」，不是面与光；
  二维描线在这台机器上（swiftshader）比任何 GL 几何都便宜。
  为什么不用 DOM：一帧一百多根线，DOM 会逼着每根线各自合成图层，反而更重。

  ── 为什么只有线、没有墙面 ──
  试过给墙填半透明的面。问题不在性能，在读法：墙面是一大块梯形，
  从灭点一路张到画面边上，两块一左一右挂在那里，整幅画立刻变成「帐篷」或者「两面旗」。
  而这堵墙本来该是「能让光透过去」的——它只是把那一段路的两边圈起来。
  所以这里只留线：柱、墙顶、路沿、地面横线。线与线之间是空的，光就从那里透上来。
  只有线，远处才可以自然化成一片薄光；有面的话，远处必然是一块抹不开的灰。

  ── 空间语法 ──
  一点透视 + 持续前进：
    · 视平线固定在地平线（s.horizon，也就是转场那两条缝落成的光带），
      所有的线都收向同一个灭点。
    · 深度以「一个视口高」为单位，与世界坐标同一套约定（shell.project 也是这么定的）。
    · travel 是「路已经流过去多少」：用户推出来的量 + 一点点自走的漂移。
      站点按整数编号、按编号取内容，所以前面的路永远是新的，却永远走不完。

  ── 一「站」──
  路按固定间距分成站，每一站可以有三样：地面横线、左右的柱、墙顶那一小段。
  柱与墙顶只在「这一段有墙」时出现（左右各自判断），没墙的地方只剩两条路沿——
  「两边是墙或者不是墙」是结构性的，不是靠明暗糊出来的。

  ── 密度的自然后果 ──
  所有横向元素（地面横线、柱）都按「屏幕上的间距」衰减：
  两根之间不到几个像素时就淡掉。于是远处不会糊成一片亮，
  同时「越远越淡、最后交给流光」是这条规则自己长出来的，不是另加一层渐变。

  ── 为什么这么慢 ──
  漂移 0.028 / 秒：走完一站（0.62）要二十多秒。推一格滚轮也只是一小步，
  而且 travel 还要再追一次（一秒多的指数跟随），于是再大的手势也被摊成「路慢慢挪」。
  速度感来自「画面上有东西很快地掠过」，这里没有任何东西掠过。

  ── 关掉动效 ──
  prefers-reduced-motion 下：漂移停掉、边缘停住、那处「不对」也不再出现。
  路、柱、横线都还在——它仍然是一处地方，只是不再自己往前。
  ───────────────────────────────────────────────────────────── */
import { initWorld, options, clamp } from './shell.js';

const opt = options();
const Q = new URLSearchParams(location.search);
/* 截图用的起点：?go=9 相当于「已经往前走了很远」。
   现场用手势推出来的 travel 是同一件事，这个参数只是让截图能停在那一步。 */
const START_GO = Number(Q.get('go') || 0) || 0;

/* ══ 这一片空间的调色 ══
   刻意都收在同一族蓝紫里：地略微偏冷（青灰），地平线那一带略微偏暖（旧纸），
   亮芯压得很低——这一段要的是「远处有一点光」，不是「一道光束」。
   grain 第二项是亮芯强度：这里全部比默认低，于是没有哪一处会跳出来。 */
const themes = {
  sky: [
    [0.040, 0.042, 0.075],
    [0.075, 0.082, 0.135],
    [0.155, 0.16, 0.255],
    [0.60, 0.58, 0.70],
  ],
  band: [
    [0.050, 0.048, 0.076],
    [0.10, 0.094, 0.142],
    [0.235, 0.20, 0.235],
    [0.74, 0.68, 0.65],
  ],
  ground: [
    [0.036, 0.040, 0.058],
    [0.062, 0.075, 0.105],
    [0.115, 0.155, 0.185],
    [0.50, 0.60, 0.63],
  ],
};
const grain = [
  [0.85, 0.14, 26],
  [0.85, 0.22, 30],
  [0.85, 0.13, 26],
];

const world = initWorld({
  canvas: document.getElementById('light'),
  themes,
  grain,
  horizon: 0.58,
  autoArrive: opt.autoArrive,
  face: opt.face,
  px: opt.px,
  wind: false, // 上面那阵风是随笔区的语气，这里不要
});

/* ══ 画布 ══ */
const cvs = document.getElementById('road');
const ctx = cvs.getContext('2d');

/* ══ 几何常数（单位 = 一个视口高） ══
   FLOOR     路面在视平线以下多少（眼睛比路面高这么多）
   WALL_H    墙比路面高多少
   HALF_W    路半宽
   STATION   一站多长

   这三个数一起定这段廊的胖瘦：宽 2×HALF_W = 0.60、高 0.62，近乎正方的一个断面。
   为什么不是更矮的窄廊：太窄，两条路沿会挤在画面中央，看起来像一条水沟；
   太宽，两侧的柱就跑出画面，廊的感觉又没了。0.60 对 0.62 是这个视口比例下
   近处两根柱刚好落在画面内侧、远处又收得拢的尺寸。 */
const FLOOR = 0.17;
/* 墙高 0.46、路半宽 0.30：断面是「宽 0.60、高 0.46」的一段廊，
   近处那两根柱的顶端刚好落在画面上沿附近——再高（试过 0.55）柱顶就整个
   跑出画面，只剩地面到地平线那一段，看起来像几根旗杆插在草地上。 */
const WALL_H = 0.46;
const WALL_TOP = FLOOR - WALL_H; // 视平线以上 0.29
const HALF_W = 0.3;
/* 一站 0.9：0.62 时近处的柱会挤成一道栅栏（两三根都在一两米内，
   看不出「廊」，像围栏）。放疏以后每站之间的地面横线成了主角。 */
const STATION = 0.9;

const NEAR = 0.55; // 线的近端：再近就冲出画面下沿，交给画面本身
const FAR = 14; // 远端截止（其实 7 之后就几乎看不清了）
const KZ = 5.2; // 推一格滚轮（cam.z +0.042）大约往前 0.22 站
const DRIFT = 0.028; // 自己往前流的速度：一站要三十多秒

/* 屏幕上两根线之间小于这个像素数就开始淡——横向元素的抗锯齿，也是「越远越淡」的由来 */
const AA_PX = 7;

/* ══ 三支墨，都在同一族里 ══ */
const COOL = 'rgb(206,210,230)'; // 冷：边线、柱、墙顶
const PALE = 'rgb(240,238,246)'; // 最亮的一档，只给「点」
const WARM = 'rgb(236,226,214)'; // 暖：地平线那点光的回声

/* ══ 小工具 ══ */
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/* 整数 → 0–1，同一个编号永远同一个结果：站点内容稳定，路却一直在换新的一段 */
function hash(n) {
  n = (n | 0) ^ 0x9e3779b9;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
const h = (i, k) => hash(i * 977 + k * 131 + 17);

/* ══ 每帧的相机态 ══ */
let VW = 0,
  VH = 0,
  HY = 0,
  CX = 0,
  DPR = 1;
let camX = 0,
  camY = 0,
  travel = 0,
  travelGoal = 0,
  TT = 0;
let gradRoad = null,
  gradVP = null;
let first = true;

/* 关掉动效：停掉自走，但不动结构 */
const RMQ = matchMedia('(prefers-reduced-motion: reduce)');
let RM = RMQ.matches;
RMQ.addEventListener?.('change', (e) => {
  RM = e.matches;
});

function layout(vw, vh, horizonPx) {
  VW = vw;
  VH = vh;
  CX = vw / 2;
  HY = horizonPx;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = Math.round(vw * DPR);
  cvs.height = Math.round(vh * DPR);
  cvs.style.width = `${vw}px`;
  cvs.style.height = `${vh}px`;

  /* 路面那一点点暗：只在近处，到地平线归零——于是路是「从光里长出来」的。
     近端压到 0.40：不压的话画面下半部一片空，路会像悬在雾上。 */
  gradRoad = ctx.createLinearGradient(0, HY, 0, vh);
  gradRoad.addColorStop(0, 'rgba(8,9,17,0)');
  gradRoad.addColorStop(0.3, 'rgba(8,9,17,0.09)');
  gradRoad.addColorStop(0.7, 'rgba(7,8,15,0.26)');
  gradRoad.addColorStop(1, 'rgba(6,7,13,0.40)');

  /* 灭点那点光：路收敛过去的地方，比别处暖一档 */
  const r = Math.min(vw, vh) * 0.52;
  gradVP = ctx.createRadialGradient(CX, HY, 0, CX, HY, r);
  gradVP.addColorStop(0, 'rgba(242,230,218,0.10)');
  gradVP.addColorStop(0.4, 'rgba(228,216,216,0.038)');
  gradVP.addColorStop(1, 'rgba(228,216,216,0)');
}

/* ══ 投影：焦距取视口高 ══
   横纵同一支焦距，像素是方的；灭点恒在 (CX, HY)：
   拖拽只让近处的东西移，远处不动——这正是平移镜头该有的样子。 */
const PX = (x, d) => CX + (x - camX) * (VH / d);
const PY = (y, d) => HY + (y - camY) * (VH / d);

/* ══ 路的边缘：随时间极轻地歪 ══
   三支周期不同的正弦叠起来（每单位深 0.2–1.7），既不像机械的直线，
   也不会在你眼前晃；关掉动效时 TT 恒为 0，它就定在那里。
   振幅再乘 1/(1+0.09d)：正弦是「世界里的歪」，屏幕上的偏移却要除以深度——
   不衰减的话，远处那点摆动在屏幕上被放大十几像素，路会在灭点前鼓出一个小包。 */
const wobbleK = (d) => 1 / (1 + d * 0.09);
const edgeL = (d) => {
  const k = wobbleK(d);
  return (
    -HALF_W + k * (0.016 * Math.sin(d * 0.62 - TT * 0.09) + 0.007 * Math.sin(d * 1.71 + 1.3 + TT * 0.04) + 0.006 * Math.sin(d * 0.21 + 3.1 - TT * 0.03))
  );
};
const edgeR = (d) => {
  const k = wobbleK(d);
  return (
    HALF_W + k * (0.014 * Math.sin(d * 0.57 + 2.2 - TT * 0.07) + 0.008 * Math.sin(d * 1.49 + 4.4 + TT * 0.05) + 0.005 * Math.sin(d * 0.19 + 0.4 + TT * 0.02))
  );
};

/* ══ 墙在不在：左右各自判断 ══
   三支低频正弦相加（最快的一支约十四站一个来回），所以墙是「一段一段」的：
   有墙的十几站、没有的十几站，交界处是渐变的，不是一刀切。
   左右各给一个相位差，于是经常只有一边有墙——比两边对称更像一处真的地方。
   阈值放在 0.5：两侧都开的时候更多，柱子不会总是只长在同一边；
   偶尔有一段两侧都收起来，只剩两条路沿——那种「忽然开阔」就是这段廊的呼吸。 */
function wallAt(i, side) {
  const o = side < 0 ? 0 : 2.9;
  const v = Math.sin(i * 0.44 + 1.3 + o) * 0.58 + Math.sin(i * 0.17 + 3.7 + o * 1.7) * 0.3 + Math.sin(i * 0.071 + 0.4 + o * 0.6) * 0.16;
  return clamp((v + 0.3) * 1.6, 0, 1);
}

/* 墙顶的高度（世界坐标）。越远越低：这段廊在远处矮下去、最后落到地平线上。
   没有这一步，远处那几段墙顶会一路收到灭点上方，和地平线合成一个尖锐的角。 */
const wallTopY = (d) => WALL_TOP * (1 - smooth(2.2, 9, d) * 0.82);

/* 远端淡出：8 之后开始交给流光，14 全无 */
const fadeFar = (d) => 1 - smooth(8, 14, d);
/* 近端淡入：别让线在画面下沿猛地出现 */
const fadeNear = (d, at) => smooth(at, at + 0.26, d);
/* 转场：远处先浮上来（路从深处朝你长过来），近处后到。
   0.5 → 0.85 这一段是「长」的过程，随深度前移。 */
const birth = (d, arrive) => smooth(0.5 - 0.3 * Math.min(1, d / 7), 0.82 - 0.3 * Math.min(1, d / 7), arrive);

/* 「屏幕间距」抗锯齿系数：两根相邻的线在屏幕上有多远，太近就淡掉。
   注意这里量的是**纵向**间距：一排柱沿深度排开，屏幕上它们之间的空隙是竖直方向的
   （y 在变），不是横向的。用横向量（HALF_W 的收缩）会算得偏小，
   结果近处的柱全被压到几乎看不见——踩过一次。 */
function aaRibNear(d, span) {
  const y0 = PY(WALL_TOP, d),
    y1 = PY(WALL_TOP, d + span);
  return clamp(Math.abs(y1 - y0) / (AA_PX * 2.2), 0, 1);
}
function aaFloorNear(d, span) {
  const y0 = PY(FLOOR, d),
    y1 = PY(FLOOR, d + span);
  return clamp(Math.abs(y1 - y0) / (AA_PX * 1.4), 0, 1);
}

/* ══ 画一根线 / 一个点 ══ */
function seg(x1, y1, x2, y2, a, w, col) {
  if (a <= 0.004) return;
  ctx.strokeStyle = col || COOL;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/* 一根竖线，按屏幕范围裁一次。
   为什么需要这个：最近那一两根柱的顶端会被投到画面外很远的地方
   （y 是负的几千像素）。不裁的话，canvas 仍要处理一条超长的线段，
   在 swiftshader 上这笔开销不小；而且反正看不见。 */
function segV(x, y0, y1, a, w, col) {
  if (a <= 0.004) return;
  const lo = -40,
    hi = VH + 40;
  let ya = Math.max(lo, Math.min(hi, y0));
  let yb = Math.max(lo, Math.min(hi, y1));
  if (ya === yb) return;
  seg(x, ya, x, yb, a, w, col);
}
function dot(x, y, r, a, col) {
  if (a <= 0.004 || r <= 0.2) return;
  ctx.fillStyle = col || PALE;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
/* 地面上的一块长方形（四角按透视投下来）：以后放东西的台位 */
function slab(x0, x1, d0, d1, y, a, col) {
  if (a <= 0.004) return;
  ctx.strokeStyle = col || COOL;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PX(x0, d0), PY(y, d0));
  ctx.lineTo(PX(x1, d0), PY(y, d0));
  ctx.lineTo(PX(x1, d1), PY(y, d1));
  ctx.lineTo(PX(x0, d1), PY(y, d1));
  ctx.closePath();
  ctx.stroke();
}

/* ══ 「不对」的那一段 ══
   每 31 秒有一站会短暂地不成立：地面那道横线的右端不在同一个深度上（像一块被拧过的板），
   外端还垂下去一截。它出现得很慢、消失得也很慢，不吓人，只让你觉得哪里算了不对。
   为什么是这种形式：这一段里没有事件、没有声音；能让「无限」显形的，
   只有它自身偶尔地不成立——不是跑出一个怪物。 */
const ANOM_FIRST = 9.0;
const ANOM_PERIOD = 31;
const ANOM_LEN = 8;
let anomStation = 0;
let anomCycle = -1;
let anomFade = 0;

function updateAnomaly(t, ready) {
  if (RM || !ready || t < ANOM_FIRST) {
    anomFade = 0;
    return;
  }
  const local = (t - ANOM_FIRST) % ANOM_PERIOD;
  if (local > ANOM_LEN) {
    anomFade = 0;
    return;
  }
  const cycle = Math.floor((t - ANOM_FIRST) / ANOM_PERIOD);
  if (cycle !== anomCycle) {
    anomCycle = cycle;
    /* 每个周期换一站：都在前面两三站以内，看得见，却不至于冲到面前 */
    anomStation = Math.round(travel / STATION) + 2 + Math.floor(hash(cycle * 31 + 7) * 2);
  }
  const p = local / ANOM_LEN;
  anomFade = Math.min(smooth(0, 0.2, p), 1 - smooth(0.68, 1, p));
}

/* ══ 每一帧 ══ */
world.onFrame((s) => {
  if (s.vw !== VW || s.vh !== VH) layout(s.vw, s.vh, s.horizon);
  HY = s.horizon;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);

  /* 转场没开始之前什么都不画：那会儿还是检索的三栏 */
  const arrive = smooth(0.08, 0.95, s.arrive);
  if (arrive <= 0.001) return;

  TT = RM ? 0 : s.t;
  /* 拖拽的范围收得很小：这条廊的「走」是往前，不是往两边。
     原来乘 0.55 时，拖一下就能把整条廊甩出画面（灭点还在正中，
     但两条路沿全跑到屏幕外），那看起来像「镜头飞了」，不像「看了一眼旁边」。
     现在最多约半个路宽（±0.34），够看到墙、看到柱的另一侧，路本身不会离场。 */
  camX = clamp(s.cam.x, -2.2, 2.2) * 0.15;
  camY = clamp(s.cam.y, -2.2, 2.2) * 0.08;

  /* travel 追一个目标，而不是直接等于它：
     滚一格、按一下方向键都会给 cam.z 一个不小的跳变，直接吃进来路会「蹦」一下。
     这里用一秒多的指数跟随把它化成「路在往前挪」，于是不管怎么推，画面上都没有速度。
     RM 下这层跟随也停掉（它本身就是在动），只留用户推出来的那段位移。 */
  travelGoal = s.cam.z * KZ + TT * DRIFT + START_GO;
  if (first) {
    travel = travelGoal; // 第一帧就对位，别从 0 一路「冲」向 ?go= 的地方
    first = false;
  }
  travel = RM ? travelGoal : travel + (travelGoal - travel) * (1 - Math.exp(-s.dt * 0.85));

  updateAnomaly(s.t, s.arrive > 0.82);

  /* ── 灭点那点光先铺 ──
     它属于「远处」，永远垫在最底下：所有的线最后都收到这一点上。 */
  ctx.globalAlpha = arrive;
  ctx.fillStyle = gradVP;
  ctx.fillRect(0, 0, VW, VH);

  const i0 = Math.floor((travel + NEAR) / STATION) - 1;
  const i1 = Math.ceil((travel + FAR) / STATION) + 1;

  /* ── 路面：一层很浅的暗，把「路」从流光里托出来 ── */
  ctx.globalAlpha = arrive;
  ctx.beginPath();
  let started = false;
  for (let i = i0; i <= i1; i++) {
    const d = i * STATION - travel;
    if (d <= NEAR || d >= FAR) continue;
    const X = PX(edgeL(d), d),
      Y = PY(FLOOR, d);
    if (!started) {
      ctx.moveTo(X, Y);
      started = true;
    } else ctx.lineTo(X, Y);
  }
  for (let i = i1; i >= i0; i--) {
    const d = i * STATION - travel;
    if (d <= NEAR || d >= FAR) continue;
    ctx.lineTo(PX(edgeR(d), d), PY(FLOOR, d));
  }
  if (started) {
    ctx.closePath();
    ctx.fillStyle = gradRoad;
    ctx.fill();
  }

  /* ── 从远往近：远的先落笔，近的压上来 ──
     每一站要做的事都在这个循环里。远处只剩像素级的一两根，近处才长得出细节。 */
  for (let i = i1; i >= i0; i--) {
    const d = i * STATION - travel; // 这一站的近端
    if (d < NEAR * 0.8 || d > FAR) continue;

    /* 转场、远近两层淡出 */
    const far = fadeFar(d);
    if (far <= 0.02) continue;
    const b = arrive * far * birth(d, s.arrive) * fadeNear(d, NEAR * 0.8);
    if (b <= 0.01) continue;
    /* 屏幕上两根柱/两道横线的间距；太近就淡（见 aaRibNear 的注释） */
    const aaRib = aaRibNear(d, STATION);
    const aaFloor = aaFloorNear(d, STATION);

    const wL = wallAt(i, -1);
    const wR = wallAt(i, 1);

    /* ── 柱 ──
       两侧各一根，从路面立到墙顶。只有「这一段有墙」的那一侧才有柱；没墙的那一侧
       只剩路沿——于是走过一整段没有墙的地方时，这段廊会忽然变得很开，然后又收回来。
       强度 0.30：这是整幅画里第二硬的东西（第一是那两条路沿），再亮就成围栏了。 */
    const yb = PY(FLOOR, d);
    const yt = PY(wallTopY(d), d);
    if (aaRib > 0.02) {
      if (wL > 0.05) segV(PX(edgeL(d), d), yb, yt, b * wL * aaRib * 0.30, 1, COOL);
      if (wR > 0.05) segV(PX(edgeR(d), d), yb, yt, b * wR * aaRib * 0.30, 1, COOL);
    }

    /* ── 柱头 ──
       本来想用「墙顶」把相邻两根柱连成一道连续的上沿。问题：那些小段全都共线，
       屏幕上是同一根斜线，从画面上沿一路切到灭点——比路沿还长，
       整幅画立刻读成「两面绷着的帆」。
       所以墙顶不存在；每根柱自己头顶搭一小块——往路中央探出去一小段，
       再垂下一个更短的头。它是一根柱子的收头，不是一面墙的上沿，
       于是再怎么近也只是一块小东西，不会连成一条线。 */
    if (d < 6 && aaRib > 0.02) {
      const cap = 0.035; // 世界单位，透视会自己把它缩短
      const drop = 0.02;
      const yCapBot = PY(wallTopY(d) + drop, d);
      if (wL > 0.05) {
        const a = b * wL * aaRib * 0.24;
        const x = PX(edgeL(d), d);
        seg(x, yt, x + cap * (VH / d), yt, a, 1, COOL);
        seg(x + cap * (VH / d), yt, x + cap * (VH / d), yCapBot, a * 0.75, 1, COOL);
      }
      if (wR > 0.05) {
        const a = b * wR * aaRib * 0.24;
        const x = PX(edgeR(d), d);
        seg(x, yt, x - cap * (VH / d), yt, a, 1, COOL);
        seg(x - cap * (VH / d), yt, x - cap * (VH / d), yCapBot, a * 0.75, 1, COOL);
      }
    }

    /* ── 地面横线 ──
       每站一道，有的整条、有的只剩半条。整条路的节奏靠它才数得出来：
       人眼数得清，却数不到头——这就是「无限」的来源。 */
    if (d > NEAR * 0.8 && aaFloor > 0.02) {
      const full = h(i, 6) < 0.78;
      const a = b * aaFloor * (0.16 + 0.14 * h(i, 7));
      const xl = full ? edgeL(d) : (h(i, 8) - 0.5) * 1.1 * HALF_W;
      const xr = edgeR(d);
      seg(PX(xl, d), yb, PX(xr, d), yb, a, 1, h(i, 9) < 0.26 ? WARM : COOL);
      /* 两端的记号比线亮一点：像这条路上唯一被反复叮嘱过的两个位置 */
      if (d < 5.5 && full) {
        const r = clamp(0.55 * (VH / d) * 0.006, 0.35, 1.4);
        dot(PX(xl, d), yb, r, b * 0.28, PALE);
        dot(PX(xr, d), yb, r, b * 0.24, PALE);
      }
    }

    /* ── 散落在路上的东西 ──
       每样都是一个「空位」：一根杆、一块贴地的台、墙上一格。
       它们是以后会长出小东西的位置——现在只有轮廓，而且大多空着。 */

    /* ① 一根细杆，少数杆顶有一点光。它比横线高一点点，所以能在整片横线里被认出来。 */
    if (d > 0.7 && h(i, 11) < 0.3) {
      const xt = (h(i, 12) - 0.5) * 1.4 * HALF_W;
      const hh = 0.02 + 0.05 * h(i, 13);
      const a = b * (0.12 + 0.16 * h(i, 14));
      const x1 = PX(xt, d),
        y1 = PY(FLOOR, d),
        y2 = PY(FLOOR - hh, d);
      seg(x1, y1, x1, y2, a, 1, COOL);
      if (h(i, 15) > 0.6) dot(x1, y2, clamp(0.7 * (VH / d) * 0.007, 0.4, 1.6), b * 0.36, WARM);
    }

    /* ② 贴地的矮台：四角一个很小的面，上面空着 */
    if (d > 1.2 && d < 7 && h(i, 16) < 0.07) {
      const side = h(i, 17) < 0.5 ? -1 : 1;
      const xc = side * (0.11 + 0.08 * h(i, 18));
      const hw = 0.035 + 0.02 * h(i, 19);
      const hd = 0.07 + 0.05 * h(i, 20);
      slab(xc - hw, xc + hw, d, d + hd, FLOOR, b * 0.15, COOL);
      /* 台面下一点影子：它是有厚度的，不是画在地上的框 */
      seg(PX(xc - hw, d + hd), PY(FLOOR, d + hd), PX(xc - hw, d + hd), PY(FLOOR - 0.014, d + hd), b * 0.07, 1, COOL);
    }

    /* ③ 墙上的一格空位：有墙才有，离得很开。
       位置贴在墙面本身（x = ±HALF_W）而不是路沿上，否则它会浮在墙外。 */
    if (d > 0.9 && d < 8 && h(i, 21) < 0.13) {
      const side = h(i, 22) < 0.5 ? -1 : 1;
      const w = side < 0 ? wL : wR;
      if (w > 0.5) {
        const xw = side * HALF_W;
        const ybw = FLOOR - 0.075;
        const ytw = wallTopY(d) + 0.1;
        const d2w = d + 0.2;
        const a = b * 0.16 * w;
        seg(PX(xw, d), PY(ybw, d), PX(xw, d), PY(ytw, d), a, 1, COOL);
        seg(PX(xw, d2w), PY(ybw, d2w), PX(xw, d2w), PY(ytw, d2w), a, 1, COOL);
        seg(PX(xw, d), PY(ytw, d), PX(xw, d2w), PY(ytw, d2w), a, 1, COOL);
        seg(PX(xw, d), PY(ybw, d), PX(xw, d2w), PY(ybw, d2w), a * 0.7, 1, COOL);
        const dm = d + 0.1;
        dot(PX(xw, dm), PY((ybw + ytw) / 2, dm), clamp(0.8 * (VH / dm) * 0.006, 0.4, 1.5), b * 0.3 * w, WARM);
      }
    }
  }

  /* ── 左右两条边线 ──
     这一段空间里最长、最安静的两根线。逐小段给透明度：越远越淡，
     最后消失在流光里——路的尽头不是一堵墙，是光。
     近端（d < 1.1）再压一档：那一段线在屏幕上又长又粗，全强度会像一根木条
     横在画面边上；压下去以后它才是「从你脚边滑出去」的。 */
  for (const [fn, aMul, w] of [
    [edgeL, 0.34, 1.4],
    [edgeR, 0.28, 1.2],
  ]) {
    let prev = null;
    for (let d = NEAR; d <= FAR; d += 0.14) {
      const a = arrive * aMul * fadeFar(d) * birth(d, s.arrive) * (0.55 + 0.45 * smooth(0.6, 1.6, d));
      const x = PX(fn(d), d),
        y = PY(FLOOR, d);
      if (prev) seg(prev[0], prev[1], x, y, Math.min(a, prev[2]), w, COOL);
      prev = [x, y, a];
    }
  }

  /* ── 那处「不对」──
     一条地面横线，右端却落在更深的深度上（透视被拧了一下），外端还垂下去一截。
     它刻意压在同一族的暖色里、而且很淡：这是「这里算错了」，不是「这里有危险」。
     位置每 31 秒换到前面两三站之内——你能看见它，但它不会主动凑过来。 */
  if (anomFade > 0.01) {
    const dA = anomStation * STATION - travel;
    if (dA > 0.55 && dA < 8) {
      const d2 = dA * 1.2;
      const a = arrive * anomFade;
      const xl = PX(edgeL(dA), dA),
        yl = PY(FLOOR, dA);
      const xr = PX(edgeR(d2), d2),
        yr = PY(FLOOR, d2);
      seg(xl, yl, xr, yr, a * 0.42, 1, WARM);
      seg(xr, yr, xr, PY(FLOOR * 1.9, d2), a * 0.32, 1, WARM);
      dot(xr, yr, 1.6, a * 0.6, PALE);
    }
  }

  /* ── 灭点 ──
     路收在一点上，那一点上有一点光；它极慢地呼吸（周期 11 秒），
     幅度小到你不确定它有没有动。 */
  const breath = RM ? 0.5 : 0.5 + 0.5 * Math.sin(s.t * 0.57);
  dot(CX, HY, 1.1 + 0.42 * breath, arrive * (0.3 + 0.16 * breath), PALE);

  ctx.globalAlpha = 1;
});

world.start();
