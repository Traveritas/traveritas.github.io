/* ─────────────────────────────────────────────────────────────
  B · 走近才成形

  这片地方的规矩只有一条：**离焦平面的远近 = 成形的程度**。

  远处是上百个几乎一样的影子，在雾里各占一两格像素；
  等谁落进焦平面（d≈1，也就是离你一个视口远），它才开始有边、有结构、
  最后有名字；你走过去，它又散回雾里。所以任何时候只有一件是清楚的。

  两层，各管一头：
  · #board  1/3 分辨率的 2D 画布。所有东西都先画在这上面，被 CSS 拉满整屏、
            pixelated，于是每一格就是一块粗颗粒——「还没成形」就是这个样式。
            这是借站里 faces.js 的办法：清楚那一档才有分辨率，远档是降采样出来的像素。
  · #stage  只有落进焦平面的那一件有 DOM。它和画布上那块像素**同位置同尺寸**，
            两边交叉淡掉——所以看到的不是「放大」，是「一块雾立起来，变成了它」。

  为什么不是每件一个 DOM + filter blur：一百五十个元素各带一个 filter，
  软件渲染下这条链每帧重算，会直接掉成幻灯片；而远的东西本来也不需要边缘。

  布局：东西都站在同一张地上（世界 y = GROUND），所以落脚点一路收向地平线；
  近的大、在中央偏下，远的一路收成地平线上的一排小点。远近的秩序就出来了。
  反过来，如果不在同一张地上，它们会浮在半空，这片场子就没有「往里」了。
   ───────────────────────────────────────────────────────────── */
import { initWorld, options, clamp, rng } from './shell.js';

const opt = options();
const root = document.documentElement;
const board = document.getElementById('board');
const stage = document.getElementById('stage');
const stat = document.getElementById('stat');
const horizonEl = document.getElementById('horizon');
const bctx = board.getContext('2d', { alpha: true });

/* 雾画布的降采样倍数。1/3 是量出来的：1440×900 只要 480×300，
   一帧一百五十来件也就几百个 fillRect；再细颗粒就没了，再粗就只剩噪点。 */
const BR = 3;

/* 动效偏好：关掉雾里的浮走，只留相机跟着人走（转场时长 shell.js 自己处理） */
const RM = matchMedia('(prefers-reduced-motion: reduce)');

/* ══ 调色 ══════════════════════════════════════════════════════
   三段只有明度差，色相都在薄暮紫那一族：天偏靛、地平线那一带偏紫、
   地偏冷灰。亮芯压得低（梦面本来就只有一点点亮），
   于是整片场子最亮的地方只是一层很淡的柔白，不会跳出来。
   每段四色：底 / 中 / 光带 / 亮芯，sRGB 0–1。 */
const themes = {
  sky: [
    [0.043, 0.046, 0.082],
    [0.083, 0.086, 0.146],
    [0.2, 0.185, 0.3],
    [0.6, 0.575, 0.735],
  ],
  band: [
    [0.05, 0.045, 0.075],
    [0.105, 0.088, 0.145],
    [0.34, 0.26, 0.35],
    [0.86, 0.76, 0.8],
  ],
  ground: [
    [0.033, 0.039, 0.061],
    [0.07, 0.086, 0.118],
    [0.15, 0.19, 0.25],
    [0.5, 0.575, 0.63],
  ],
};

const world = initWorld({
  canvas: document.getElementById('light'),
  themes,
  // 抖动留满、亮芯压低、量化 26–30 阶：跟检索那边同一个质感
  grain: [
    [0.9, 0.26, 30],
    [0.72, 0.22, 26],
    [0.86, 0.24, 28],
  ],
  // 地平线给 0.5：project() 算出来的无限远处正好落在视口正中，
  // 只有让流光场的地平线也在这里，地上的东西落脚点才对得上那一道光。
  horizon: 0.5,
  autoArrive: opt.autoArrive,
  face: opt.face,
  px: opt.px,
  wind: false,
});

let VW = world.vw;
let VH = world.vh;
const ASPECT = VW / Math.max(1, VH);

/* 横向摆位统一按「半个视口宽」为单位（-1 = 左缘，1 = 右缘）。
   project() 里屏幕 x = VW/2 + (x/z)·VH，所以 x = u·(VW/2)·z/VH = u·0.5·ASPECT·z。
   早先图省事拿「视口高的倍数」当横向单位，桌面宽高比 1.6 时看不出来，
   到 390×844 就全错：同样的 -0.42 在窄屏上相当于 -0.42 个屏高 = 半个屏幕之外，
   东西直接挂在左缘外。现在这一处统一，宽窄屏是同一套比例。 */
const HALF = (u, z) => u * 0.5 * ASPECT * z;

/* 地面：世界 y 上的一条水平面。落脚点在屏幕上 = 视口中线 + GROUND·VH/d，
   越远越贴地平线，近的自然往下掉——透视不需要另做。 */
const GROUND = 0.2;

/* ══ 东西 ══════════════════════════════════════════════════════
   三种形态，都只是一块渐隐的面加一条结构线：立着的一面、一段收上去的柱、
   贴着地的一道。它们不是图标——是「一件东西的剪影」，所以离得远时彼此几乎一样。
   w / h 是世界单位（1 = 一个视口高），DOM 那一侧再乘当前缩放。
   bw / bh 是 DOM 设计盒的像素尺寸，只影响字号的换算，不影响世界里的实际大小。 */
const LOOK = {
  frame: { w: 0.26, h: 0.34, bw: 260, bh: 340, name: '立着的一面', tag: '背面朝这边' },
  brink: { w: 0.21, h: 0.3, bw: 210, bh: 300, name: '收上去的一段', tag: '上面还没有' },
  sill: { w: 0.36, h: 0.11, bw: 360, bh: 110, name: '贴着地的一道', tag: '横在这里' },
};
const KIND = ['frame', 'brink', 'sill'];

/* 会成形的那几件。横向摆位按**它成形那一刻**的屏幕位置定：成形时 d = 1，
   于是屏幕偏移正好是 u（见 HALF）。这样往里走、某一件落进焦平面的时候，
   它就在画面里你摆好的那个位置；如果按 HALF(u, z) 摆，往前走一段，
   透视会把两侧的物件一路推出画面——成形那一刻人只看见半件东西挂在边上。

   代价是远的时候它们会往中轴收（d = z 越大越收），但这正好是想要的：
   远处本来就该挤在中间，越走越张开。
   [横向摆位 u（-1 左缘 … 1 右缘）, 深度, 形态, 离地偏移（世界单位，正 = 更高）] */
const BAND_SPEC = [
  [0.02, 1.02, 0, 0],
  [-0.5, 1.62, 1, 0.1],
  [0.44, 1.95, 0, -0.04],
  [-0.58, 2.4, 2, 0],
  [0.3, 2.75, 1, 0.16],
  [-0.16, 3.05, 2, 0],
];

const band = BAND_SPEC.map(([u, z, k, lift]) => {
  const L = LOOK[KIND[k]];
  return {
    z,
    kind: KIND[k],
    x: HALF(u, 1),
    // 底沿踩在地上：中心比地面高半个身量。lift 让它悬起来一点
    y: GROUND - L.h / 2 - lift,
    p: { x: 0, y: 0, s: 0, blur: 1, d: 99 },
    rawForm: 0,
    form: 0,
    target: 0,
  };
});

/* 雾里那些：两百来个影子，永远不会成形。

   摆位要小心两件事，否则会画成一条地平线上的城市：
   · 横向按屏幕位置给（世界 x = 屏幕偏移 · z），不按同一个世界宽度给——
     按世界宽度给，近的会摊到两边、远的挤在中线，正好凑成一条横带。
   · 纵向别都踩在地上。踩地上的自然收到地平线上，这一层要有；
     但只有这一层，远处就只剩一道虚线。所以七成站地上，
     三成悬在半空，把视口上半也铺上影子，密度的感觉才出来。

   **尺寸是这里最要紧的一档**。早先给 0.05–0.12 个视口高，结果每粒都有一二十像素，
   两百粒并排就成了一堵方块墙——那正是「杂乱的点阵」。
   现在远的只有两三个像素，近的也压在一二十以内：远处是一层细密的糙面，
   凑近才看得出那是一粒粒立着的东西。密而不乱，靠的就是这个尺寸差。

   深度故意不均匀：七成在 4.5 以后（一路收成远处的小点），
   其余散在 2.2–4.5（中景）。2.2 以前不放东西——近处空着，这件事本身是构图的一部分。 */
const DUST_N = VW < 700 ? 130 : 196;
const dust = [];
const R = rng(97);
for (let i = 0; i < DUST_N; i++) {
  const far = R() < 0.7;
  const z = far ? 4.5 + Math.pow(R(), 0.7) * 6.6 : 2.2 + R() * 2.3;
  const h = far ? 0.017 + R() * 0.036 : 0.03 + R() * 0.05;
  const onGround = R() < 0.7;
  // 横向按同一个单位（半个视口宽）给，收在 ±0.88 —— 远处的影子不该有一半挂在屏外
  const u = (R() * 2 - 1) * 0.88;
  dust.push({
    z,
    h,
    x: HALF(u, z),
    // 悬空的按屏幕纵向位置给：世界 y = 屏幕偏移 · z，于是它在画面上就停在那个高度
    y: onGround ? GROUND - h / 2 : (R() * 2 - 1) * 0.46 * z,
    hue: Math.floor(R() * 3) % 3,
    // 每粒自己的明暗：四档灰度，远处不该有一百种深浅
    a: 0.26 + Math.floor(R() * 4) * 0.15,
    ph: R() * Math.PI * 2, // 浮走的相位，别让整片一起呼吸
    p: { x: 0, y: 0, s: 0, blur: 1, d: 99 },
  });
}

/* 三个色，其实是同一族的三个明度台阶；远看分不出，近看才有差别 */
const HUE = ['198,192,226', '178,186,216', '208,200,222'];

/* 画序定一次：z 大的先画，近的压在上面，远近自然分开 */
const ALL = [...dust, ...band].sort((a, b) => b.z - a.z);
for (const it of ALL) it.isBand = it.form !== undefined;

/* ══ 成形的那几件：DOM ══
   节点一次建好，之后只改 transform / opacity / clip-path，不碰 layout。 */
for (const it of band) {
  const L = LOOK[it.kind];
  const el = document.createElement('div');
  el.className = 'b-item';
  const halo = document.createElement('div');
  halo.className = 'b-halo';
  const body = document.createElement('div');
  body.className = 'b-body';
  body.dataset.kind = it.kind;
  body.style.width = `${L.bw}px`;
  body.style.height = `${L.bh}px`;
  body.innerHTML = '<i class="b-shape"></i><i class="b-core"></i><i class="b-write"></i>';
  const name = document.createElement('div');
  name.className = 'b-name';
  name.innerHTML = `${L.name}<em>${L.tag}</em>`;
  el.append(halo, body, name);
  stage.appendChild(el);
  it.el = el;
  it.body = body;
  it.halo = halo;
  it.core = body.querySelector('.b-core');
  it.write = body.querySelector('.b-write');
  it.nameEl = name;
  it.baseW = L.bw;
  it.baseH = L.bh;
}

/* ══ 走路 ══════════════════════════════════════════════════════
   shell.js 已经接了拖拽（平移）与滚轮（cam.z）。滚轮那一档慢得像挪，
   所以这里再叠一点同样的方向——手感接近「往前走一段」，而不是「把画面推近」。
   只叠一个固定的比例，不做与速度相关的东西（这片地方不该有速度感）。 */
let ready = false;
const ZMIN = -0.55;
const ZMAX = 2.6;
function walk(dz) {
  world.cam.z = clamp(world.cam.z + dz, ZMIN, ZMAX);
}

/* 截图用：?cz=1.2 先站到某处，省得脚本再去模拟滚轮。
   只读我自己的地址参数，不动 shell.js 那一套。 */
const presetZ = new URLSearchParams(location.search).get('cz');
if (presetZ !== null && presetZ !== '' && Number.isFinite(+presetZ)) {
  world.cam.z = clamp(+presetZ, ZMIN, ZMAX);
}

addEventListener(
  'wheel',
  (e) => {
    if (!ready) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    walk(dy * 0.0006);
  },
  { passive: true },
);

addEventListener('keydown', (e) => {
  if (!ready) return;
  if (e.key === 'w' || e.key === 'W' || e.key === 'PageUp') walk(0.12);
  else if (e.key === 's' || e.key === 'S' || e.key === 'PageDown') walk(-0.12);
});

/* 角落那行操作提示：宽窄两版分开写。
   390 上写全句会被裁掉一半，所以窄屏只留最短的那半句。 */
const coarse = matchMedia('(pointer: coarse)').matches;
const narrow = VW < 620;
stat.textContent = coarse || narrow ? '轻点 / 上推　往里' : '滚轮 · W　往里走　·　拖拽　左右';

const ptrs = new Map();
const avgY = () => {
  let s = 0;
  for (const v of ptrs.values()) s += v;
  return s / ptrs.size;
};
let tap = null;
let pinch = null;

addEventListener(
  'pointerdown',
  (e) => {
    if (!coarse || !ready) return;
    ptrs.set(e.pointerId, e.clientY);
    if (ptrs.size === 2) {
      pinch = { y: avgY(), z: world.cam.z };
      tap = null;
    } else if (ptrs.size === 1) {
      tap = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  },
  true,
);

addEventListener(
  'pointermove',
  (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, e.clientY);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
    if (ptrs.size >= 2 && pinch) world.cam.z = clamp(pinch.z - (avgY() - pinch.y) * 0.0026, ZMIN, ZMAX);
  },
  { passive: true },
);

addEventListener('pointerup', (e) => {
  if (tap && performance.now() - tap.t < 420) walk(0.16);
  tap = null;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
});
addEventListener('pointercancel', (e) => {
  tap = null;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
});

/* ══ 画 ════════════════════════════════════════════════════════ */
const SIZE = { w: 0, h: 0 };

function fitBoard() {
  const w = Math.max(2, Math.round(VW / BR));
  const h = Math.max(2, Math.round(VH / BR));
  if (board.width === w && board.height === h) return;
  board.width = w;
  board.height = h;
  SIZE.w = w;
  SIZE.h = h;
}

/* 一格一格地填：坐标先落到格子上，别让三倍放大把边缘抹成灰 */
function cell(x, y, w, h) {
  bctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/* 雾里的那些：一个方块 + 顶上亮一格。
   远得只剩一格时，它和旁边那几十个完全一样——这正是要的。 */
function drawDust(it, a, rise) {
  const p = it.p;
  if (p.d < 1.0 || p.d > 26) return;
  if (p.x < -120 || p.x > VW + 120 || p.y < -120 || p.y > VH + 120) return;
  const near = clamp((p.d - 1.0) / 0.9, 0, 1); // 擦身而过时别糊满屏
  const far = clamp((26 - p.d) / 9, 0, 1); // 太远就沉回雾里
  const al = Math.floor(a * it.a * 0.42 * near * far * 5) / 5;
  if (al < 0.08) return;
  const hp = clamp((it.h * p.s * VH) / BR, 1, 60);
  const wp = Math.max(1, hp * 0.62);
  const x = p.x / BR - wp / 2;
  const y = p.y / BR - hp / 2 + rise;
  const c = HUE[it.hue];
  bctx.fillStyle = `rgba(${c},${al})`;
  cell(x, y, wp, hp);
  bctx.fillStyle = `rgba(${c},${Math.min(0.8, al * 1.7)})`;
  cell(x, y, wp, 1);
}

/* 带上的六件：画成「那座东西的雾」，和 DOM 那版同位置同尺寸，但**不是方块**。

   一块还没成形的东西不该有直角。所以这里一行一行地画：整块面由「上亮下沉」
   压出梯度，顶上再补一排高低不齐的小格当边——远处看是一团雾，
   放大三倍才看出那些台阶是格子。

   远处（hp 只剩一两格）它自然退化成一格，和旁边那几十个影子分不出，
   这正是「远处都一样」那句话。 */
function drawBand(it, a, rise) {
  const L = LOOK[it.kind];
  const p = it.p;
  if (p.d < 0.42) return;
  const keep = 1 - it.form * 0.94;
  if (keep < 0.05) return;
  const hp = (L.h * p.s * VH) / BR;
  const wp = (L.w * p.s * VH) / BR;
  if (hp < 1 || hp > 2600) return;
  if (p.x < -VW * 0.9 || p.x > VW * 1.9 || p.y < -VH * 0.9 || p.y > VH * 1.9) return;

  const near = clamp((p.d - 0.42) / 0.5, 0, 1);
  /* 走近到快贴身时，这块雾必须散掉。它是「远处那一片」的一部分，
     你走到它跟前它就该没了——成形的那一件由 DOM 接手，另外五件就此散回雾里。
     没有这一条，路过的东西会在画面边上撑成一大块发亮的板。 */
  const pass = clamp((p.d - 0.62) / 0.42, 0, 1);
  const al = a * 0.5 * near * pass * keep;
  if (al < 0.02) return;

  const x = p.x / BR - wp / 2;
  const y = p.y / BR - hp / 2 + rise;
  const c = '206,200,232';
  /* 一层就够：一整块面，依「上亮下沉」压成两三档，再在顶上加一枚亮格。
     早先试过逐行画宽窄（想做毛边），结果 1/3 分辨率下相邻行的取整错位
     连成了一条条横纹，整片看起来像布。现在只在顶上做锯齿，
     面的左右两边交给下沿那一档——远看是雾，近看才知道是格子。 */
  const rows = Math.max(1, Math.min(90, Math.round(hp)));
  const rh = hp / rows;
  for (let r = 0; r < rows; r++) {
    const u = r / rows;
    const prof = 0.14 + 0.86 * Math.pow(1 - u, 2.4);
    // 每行左右各缩进去半格到一格，取整后才会在边上落下真实的缺口
    const j2 = 0.86 + 0.14 * Math.sin(it.z * 9.7 + r * 0.9);
    const wRow = wp * j2;
    const y0 = Math.round(y + r * rh);
    const y1 = Math.round(y + (r + 1) * rh);
    bctx.fillStyle = `rgba(${c},${(al * prof * 0.3).toFixed(3)})`;
    bctx.fillRect(Math.round(x + (wp - wRow) / 2), y0, Math.max(1, Math.round(wRow)), Math.max(1, y1 - y0));
  }
  /* 顶沿：一排高低不一的小格，像还没补齐的一行字。
     远处（hp 只剩一两格）它自然退成一格——和旁边那些影子分不出，
     这就是「远处都一样」。 */
  const cols = clamp(Math.round(wp), 1, 26);
  const cw = wp / cols;
  bctx.fillStyle = `rgba(${c},${Math.min(0.6, al * 1.25)})`;
  for (let i = 0; i < cols; i++) {
    const t = Math.sin(it.z * 5.3 + i * 1.7);
    if (t < -0.35) continue; // 缺口：顶沿不是一条齐的线
    cell(x + i * cw, y, cw, 1);
  }
}

/* 成形度：焦平面是 d = 1。|ln d| < 0.5 这一段里才有得看，
   越靠中间越实；出了这一段就只是雾。
   顺带一个好事：DOM 那件的缩放始终落在 0.55–1.5 之间，
   所以成形永远不会变成「放大」，而是「换一件东西成形」。 */
const FORM_T = 0.5;
function formOf(d) {
  if (d <= 0) return 0;
  const q = Math.abs(Math.log(d));
  if (q >= FORM_T) return 0;
  return 1 - q / FORM_T;
}
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* 谁在成形：分数最高的那件拿 DOM，其余一律散着。

   分数不是 pure 的成形度，还乘一个「离画面中央有多远」的权重。
   为什么要有这一项：往里走的时候，偏在两侧的东西会因为透视一路被推向屏幕外，
   于是「成形」那一刻它常常半个身子已经出画，名字也被裁掉。
   加了这个权重之后，成形的基本上是画面里站得住的那些——构图是选出来的，不是撞出来的。

   新的要明显超过旧的才换位，否则两件分数贴近时会来回闪。 */
let lead = null;
function pickLead(sceneA) {
  let best = null;
  let bestScore = 0;
  for (const it of band) {
    const p = it.p;
    const on = p.x > -VW * 0.8 && p.x < VW * 1.8 && p.y > -VH * 0.8 && p.y < VH * 1.6;
    it.rawForm = on ? formOf(p.d) * sceneA : 0;
    // 中央权重：屏幕正中 1，到边上掉到 0.45。掉得不狠，
    // 不然成形的永远只有正中那一件，别处的就再也没机会了
    const ex = clamp(Math.abs(p.x - VW / 2) / (VW / 2), 0, 1.6);
    const score = it.rawForm * (1 - 0.34 * Math.min(1, ex) ** 2);
    it.score = score;
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  const cur = lead ? lead.score : 0;
  if (!lead || cur < 0.02 || (best && bestScore > cur + 0.07)) lead = best;
  if (lead && lead.rawForm < 0.012) lead = null;
  for (const it of band) it.target = it === lead ? smooth(0.12, 1, it.rawForm) : 0;
}

function paintDOM(dt) {
  const k = 1 - Math.exp(-dt * 6);
  for (const it of band) {
    it.form += (it.target - it.form) * k;
    if (it.form < 0.004) it.form = 0;
    const f = it.form;
    const el = it.el;
    if (f <= 0) {
      if (el.style.opacity !== '0') el.style.opacity = '0';
      continue;
    }
    const p = it.p;
    // 世界高度 → 屏幕上多少像素 → 相对 DOM 设计盒的比例
    const s = (LOOK[it.kind].h * p.s * VH) / it.baseH;
    const bw = it.baseW * s;
    const bh = it.baseH * s;

    el.style.opacity = Math.min(1, f * 1.6).toFixed(3);
    el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;

    // 主体：自上而下「写」出来。这才是成形那一下——
    // 不是变大，是一条边先落定，内容再走到它该在的地方。
    const w = smooth(0.1, 0.96, f);
    it.body.style.transform = `translate3d(${(-bw / 2).toFixed(1)}px,${(-bh / 2).toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    it.body.style.clipPath = `inset(0 0 ${((1 - w) * 100).toFixed(1)}% 0)`;
    it.body.style.opacity = smooth(0.02, 0.5, f).toFixed(3);

    // 结构线：不是边框的一条，而是「里面的东西开始有了」的那一条。
    // 它比面晚半步，等面先立住
    it.core.style.opacity = smooth(0.55, 0.98, f).toFixed(3);

    // 那道光：正好走在「正在写」的位置上，写完就没了
    it.write.style.transform = `translateY(${(w * it.baseH).toFixed(1)}px)`;
    it.write.style.opacity = (smooth(0.04, 0.18, f) * Math.min(1, 4.2 * f * (1 - f))).toFixed(3);

    // 外晕：不算成形的时候最旺，定下来只剩一点体温。
    // 收得很紧（1.15 倍身量）——松了就成了舞台上打的一束光，那就太亮了。
    const halo = 0.3 * Math.min(1, 4 * f * (1 - f)) + 0.05 * f;
    it.halo.style.opacity = halo.toFixed(3);
    const hs = 1.15 * Math.max(bw, bh);
    it.halo.style.width = `${hs.toFixed(0)}px`;
    it.halo.style.height = `${hs.toFixed(0)}px`;

    // 字：最后才有，而且只有这一件。
    // 横向要对齐在件下面，但整行必须留在画面里——成形的那件常常偏在一侧，
    // 照搬件的中线会把名字推到屏幕外去。所以按屏幕坐标算它该在哪，
    // 钳回视口内，再换回相对锚点的偏移（这一层的 transform 只是相对量）。
    it.nameEl.style.opacity = smooth(0.76, 1, f).toFixed(3);
    if (!it.nameW) it.nameW = it.nameEl.offsetWidth || 0;
    const want = p.x - bw / 2 + 2;
    const left = clamp(want, 14, Math.max(14, VW - it.nameW - 14));
    it.nameEl.style.transform = `translate3d(${(left - p.x).toFixed(1)}px,${(bh / 2 + Math.max(10, bh * 0.05)).toFixed(1)}px,0)`;
  }
}
world.onFrame((s) => {
  VW = s.vw;
  VH = s.vh;
  fitBoard();
  horizonEl.style.top = `${s.horizon.toFixed(1)}px`;

  /* 投影：位置与 d 是画布和 DOM 共用的同一份。
     这里没有用 project() 的 blur —— 它量的是 |ln d|，和 formOf() 是同一件事，
     但「成形」这件事要的是「谁最靠近焦平面」，还要带一点回滞和交叉淡入，
     所以成形度在这里自己算（见 formOf / pickLead）。
     blur 留给将来做「一件东西的边有多软」，现在用不上。 */
  for (const it of ALL) it.p = s.project(it.x, it.y, it.z);

  // 转场期间：东西由浅到满地浮上来，同时整体从下方上来一小段
  const sceneA = clamp((s.arrive - 0.16) / 0.6, 0, 1);
  const rise = (1 - sceneA) * 20;
  ready = s.arrive > 0.995;

  // 雾里的浮走：周期十几秒，关掉动效就整片停住
  const t = s.t;
  const drift = !RM.matches;

  bctx.clearRect(0, 0, SIZE.w, SIZE.h);
  if (sceneA > 0.004) {
    bctx.globalCompositeOperation = 'lighter';
    for (const it of ALL) {
      let dy = rise;
      if (drift) dy += Math.sin(t * 0.24 + (it.ph || it.z * 2.7)) * 0.7;
      if (it.isBand) drawBand(it, sceneA, dy);
      else drawDust(it, sceneA, dy);
    }
    bctx.globalCompositeOperation = 'source-over';
  }

  pickLead(sceneA);
  paintDOM(s.dt);
});

world.start();
