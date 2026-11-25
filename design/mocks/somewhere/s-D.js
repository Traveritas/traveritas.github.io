/* ─────────────────────────────────────────────────────────────
  somewhere · D · 可以往下沉

  这一场只有一件事：往下。那点光全压在头顶（地平线在视口 30% 高处），
  你把画面往上推，就顺着井壁一层层沉下去；越深越冷、越静，
  沉到第五级时，上面那点光只剩头顶一小片。

  几条定下来的做法，写在这里免得后来的人猜：

  · 竖直的方向不交给 cam.z（那是推拉远近），交给「深度」dep（0 = 站在光那一级）。
    一级一层。dep 可以停在半层上，站定之后自己吸附到整级 —— 这就是「沉几层」。

  · 井是收敛的：所有弧都收向地平线那一点。
    眼睛下方是台面 —— 弧朝下弯、看得见踩的地方、点实心；
    眼睛上方（已经沉过去的）是同一批台的反面 —— 弧朝上弯、只见沿口、点是空圈，
    而且它们挡着光，所以在光里是暗的。
    上下两组用同一支秤、只差一个 sign。所以「同一件事以另一种形态再出现」
    不是特效，是同一组几何换了个方向看；上来时先撞见的就是这一批的反面。

  · 光的余量交给一层 DOM 遮罩（#veil）：它不是「整片变黑」，是一扇随深度收拢的口子，
    中间透明、四周吃掉流光，中心钉在地平线上。沉得越深，口子越小、下面越沉。
    为什么不用换 themes：light.js 只在 init 时读一次调色板，中途换不了；
    而「越往下光越少」本来就是「同一片光被挡得更多」，用遮罩做反而更诚实。

  · 台阶画在 #ink（Canvas2D）上，压在遮罩之上。这样口子收得很小时，台阶还看得见，
    不至于沉到底只剩一张黑纸。整页仍然只有背景那一个 WebGL 上下文。

  · 沉下去不是倒放：往上走时中段浮出一级一级的横档（墙上的落脚点），
    遮罩的口子也以另一种形状张回来（更圆、偏暖一点）。两条路不一样。

  · 手感：竖直拖 / 滚轮 / ↑↓ / PgUp PgDn / 空格；Home 回最上面，End 去第五级。
  ───────────────────────────────────────────────────────────── */

import { clamp, lerp } from './shell.js';

/* ══ 每一级的名字 ══
   负数是眼睛上方的级，正数在下方。不是编号也不是目录，是站在那一级会想到的两个字。 */
const WORDS = ['天光', '远岸', '未及', '浮光', '微温', '澄明', '静水', '苔痕', '空阶', '无字', '余响', '尽处'];
const W0 = 3; // WORDS[0] 对应的级号
const wordOf = (i) => WORDS[clamp(i + W0, 0, WORDS.length - 1)];

/* ══ 遮罩那张表 ══
   深度 · 两侧吃掉多少 · 口子横半轴(×视口宽) · 口子竖半轴(×视口高) · 底下压多沉
   一开始口子铺满、几乎不挡（还是整片光，只是往下淡）；沉下去，它一路收窄，
   最后只剩头顶中间那一小片 —— 光没变少，是被井壁挡掉了。 */
const VEIL = [
  [0, 0.01, 1.1, 1.1, 0.03],
  [1, 0.3, 0.88, 1.1, 0.2],
  [2, 0.46, 0.66, 1.1, 0.34],
  [3, 0.58, 0.48, 1.1, 0.46],
  [4, 0.67, 0.34, 1.1, 0.56],
  [5, 0.75, 0.23, 1.1, 0.65],
  [8, 0.9, 0.09, 1.1, 0.8],
];

/* 遮罩的色：从靛慢慢挪到青灰。同一个色族里的偏移，不换色相族。
   第一列同样是深度（pick() 一律把第一列当刻度）。 */
const TINTS = [
  [0, 11, 10, 19],
  [1, 10, 11, 19],
  [2, 9, 12, 18],
  [3, 8, 13, 18],
  [4, 7, 15, 17],
  [5, 6, 17, 17],
  [8, 5, 19, 17],
];

/* 表里线性取一段（第一列是刻度，读出来的那几列才是值） */
function pick(table, d) {
  if (d <= table[0][0]) return table[0].slice(1);
  for (let i = 1; i < table.length; i++) {
    if (d <= table[i][0]) {
      const a = table[i - 1];
      const b = table[i];
      const k = (d - a[0]) / (b[0] - a[0]);
      return b.slice(1).map((v, j) => lerp(a[j + 1], v, k));
    }
  }
  return table[table.length - 1].slice(1);
}

const clampD = (d) => clamp(d, -0.9, 8.5);

/* 确定性哈希：同一级每次一样，位置不用手摆 */
const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ══ 竖直的透视 ══
   井往下看：近的一圈在画面下沿、很宽；越远越窄、越挤向地平线。
   g(m) 是「还剩多远」的比例：1 = 就在脚下，0 = 挤到地平线上去了。
   用 (1+am)^-b 而不是 1/(1+m)：前几级拉得开、后面收得紧，像真的往下看。 */
const A1 = 0.9;
const B1 = 0.85;
const gBelow = (m) => (1 + m * A1) ** -B1;
const yBelow = (m, vh, hz) => hz + (vh * 1.06 - hz) * gBelow(m);
const wBelow = (m, vw) => vw * (0.08 + 1.02 * gBelow(m));
const sBelow = (m, vh) => vh * 0.155 * gBelow(m) ** 1.35;

/* 头顶：同一个道理反过来。
   h(a) = 「还剩多远」的比例，a 小（正头顶，近）→ 1，a 大（远，快贴到光带）→ 0。
   于是近的那一圈顶到画面上沿、很宽；越远的越往地平线收、越窄 —— 和脚下是同一支秤。 */
const A2 = 1.5;
const hAbove = (a) => A2 / (a + A2);
const yAbove = (a, vh, hz) => hz - (hz + vh * 0.12) * hAbove(a);
const wAbove = (a, vw) => vw * (0.07 + 1.05 * hAbove(a));
const sAbove = (a, vh) => -vh * 0.1 * hAbove(a) ** 1.2;

/* 弧上一点的高度（u -1..1 横跨整条弧；sag 正 = 朝下弯） */
const arcY = (y, sag, u) => y + sag * (1 - clamp(u, -1, 1) ** 2);

export function initScene({ world, opt = {} }) {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const veil = document.getElementById('veil');
  const cv = document.getElementById('ink');
  const g = cv.getContext('2d');
  const labs = [...document.querySelectorAll('.d-lab')];
  const scale = document.getElementById('dScale');
  const mk = document.getElementById('dMk');
  const hint = document.getElementById('dHint');
  const stat = document.getElementById('stat');

  /* ══ 状态 ══ */
  let dep = clampD(opt.dive || 0); // 眼睛的深度（连续）
  let target = dep; // 想去哪一级
  let prevDep = dep;
  let rise = 0; // 0 = 停着 / 在沉，1 = 在往上走（平滑）
  let lastInput = 99; // 距上一次动手多久（站定即落位）
  let firstMove = false;
  let arrived = false;

  /* ══ 画布 ══ */
  let W = 0;
  let H = 0;
  let dpr = 1;
  function fit() {
    // 细线用不着 2 倍；上限 1.5，软件渲染下这一层不能太贵
    dpr = clamp(devicePixelRatio || 1, 1, 1.5);
    W = Math.max(1, Math.round(world.vw * dpr));
    H = Math.max(1, Math.round(world.vh * dpr));
    cv.width = W;
    cv.height = H;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();

  /* ══ 每一级上的东西：假的随机，但每级只算一次 ══ */
  const cache = new Map();
  function layerBits(i) {
    let b = cache.get(i);
    if (b) return b;
    const n = 3 + Math.floor(hash(i, 1.7) * 5); // 3–7 个：密度很低，靠位置说话
    const bits = [];
    for (let j = 0; j < n; j++) {
      bits.push({
        u: (hash(i, 11.3 + j) * 2 - 1) * 0.9,
        v: 0.1 + hash(i, 61.1 + j) * 0.8,
        r: 0.5 + hash(i, 91.7 + j) * 1.1,
        ph: hash(i, 31.9 + j) * 6.283,
        sp: 0.05 + hash(i, 41.3 + j) * 0.1,
      });
    }
    // 以后可以点的地方：每级一两处。这一轮只画记号，不接手势。
    const marks = [];
    const mc = 1 + Math.floor(hash(i, 2.3) * 2);
    for (let j = 0; j < mc; j++) {
      marks.push({ u: (hash(i, 211.1 + j) * 2 - 1) * 0.76, v: 0.2 + hash(i, 233.7 + j) * 0.5 });
    }
    b = { bits, marks, lx: (hash(i, 7.1) - 0.5) * 0.6, lg: 0.35 + hash(i, 8.9) * 0.65 };
    cache.set(i, b);
    return b;
  }

  /* ══ 一帧 ══ */
  function render(s) {
    const vw = s.vw;
    const vh = s.vh;
    if (Math.round(vw * dpr) !== W || Math.round(vh * dpr) !== H) fit();
    g.clearRect(0, 0, vw, vh);

    // 转场没走完之前不出场：上面那道斜线还在合拢的时候，这里的东西不该抢戏
    const vis = clamp((s.arrive - 0.5) / 0.42, 0, 1);
    if (vis <= 0.004) return;

    const hz = s.horizon;
    const cx = vw * 0.5 - s.cam.x * vh * 0.5; // 横着拖：井跟着挪
    const deepK = clamp(dep / 5, 0, 1);
    const t = RM ? 0 : s.t;
    const shrift = 1 - deepK * 0.55; // 越深越少动

    /* 光的颜色：越深越冷。亮部很少，所以这几个本身都不亮。 */
    const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    const pale = mixc([0.93, 0.91, 0.87], [0.68, 0.87, 0.86], deepK * 0.85); // 边上的亮
    const dim = mixc([0.6, 0.63, 0.75], [0.44, 0.62, 0.65], deepK * 0.8); // 台沿
    const tint = pick(TINTS, dep);
    // TINTS 是给 CSS 用的 0–255 通道；画布这边要 0–1，先归一化，别再乘一次 255
    const tint01 = tint.map((v) => v / 255);
    const rgba = (c, a) =>
      `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a <= 0 ? 0 : a.toFixed(3)})`;

    /* ——— 井壁：一团很宽的圆雾，压在地平线上。
       一定要是径向的（没有边），不然会变成画面上一个方框。 */
    const mistR = Math.max(vw, vh) * 0.8;
    const mg = g.createRadialGradient(cx, hz, 0, cx, hz, mistR);
    mg.addColorStop(0, rgba(dim, 0.1 * vis * (1 - deepK * 0.45)));
    mg.addColorStop(0.42, rgba(dim, 0.028 * vis * (1 - deepK * 0.45)));
    mg.addColorStop(1, rgba(dim, 0));
    g.fillStyle = mg;
    g.fillRect(0, 0, vw, vh);

    /* ——— 头顶：已经沉过去的那些台 ———
       这里有一条不讲情面的规矩：只画你真正沉过的那几级（i 从 dep 往下数到 0）。
       站在最上面（dep = 0）时头顶什么都没有，就是那一片光；
       沉下去以后，刚才走过的一级一级才翻到头顶上来 —— 这才是「同一件事再出现一次」，
       不是凭空先在那儿摆一圈装饰。

       翻上去以后它们换了形态：弧朝上鼓、看不见台面、只剩沿口，
       于是变成光里的一道暗边（脚下是暗里的一条亮弧），上面的记号成了空圈。 */
    for (let i = Math.ceil(dep) - 1; i >= 0; i--) {
      const a = dep - i; // 沉过去几级
      if (a <= 0.05) continue;
      const yy = yAbove(a, vh, hz);
      const hw = wAbove(a, vw);
      const sag = sAbove(a, vh);
      if (hw < 6 || yy > hz - 3) continue;
      // 刚沉过去的那一级最实，越早沉过去的越淡（它已经退回光里去了）
      const near = clamp(1 - (a - 1) / 5, 0, 1);
      const al = vis * (0.1 + 0.4 * near);
      if (al < 0.008) continue;

      /* 一道压住光的暗边 + 下面一线极淡的高光。
         不填色、不加粗 —— 让它在光里像一根梁，而不是一条划痕。 */
      g.beginPath();
      g.moveTo(cx - hw, yy);
      g.quadraticCurveTo(cx, yy + sag * 2, cx + hw, yy);
      g.lineWidth = 2;
      g.strokeStyle = rgba(tint01, al);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - hw, yy + 2.5);
      g.quadraticCurveTo(cx, yy + sag * 2 + 2.5, cx + hw, yy + 2.5);
      g.lineWidth = 1;
      g.strokeStyle = rgba(pale, al * 0.4);
      g.stroke();

      // 沿口上的记号：从下面看只剩空圈（同一处，脚下的那一级上还是实心方点）
      const bits = layerBits(i);
      const uMax = Math.min(0.95, (vw * 0.46) / hw);
      for (const q of bits.marks) {
        const u = q.u * uMax;
        const x = cx + u * hw;
        const y = arcY(yy, sag, u) + sag * 0.55;
        if (x < 6 || x > vw - 6) continue;
        g.beginPath();
        g.arc(x, y, 2.6, 0, 6.2832);
        g.strokeStyle = rgba(pale, al * 1.2);
        g.lineWidth = 1;
        g.stroke();
      }
    }

    /* ——— 脚下：一级一级的台 ———
       由远到近画（先画远的），每一级是「两条沿口之间那一圈台面」。
       台面压一点暗、沿口给一条亮线 —— 台阶是这么读出来的，不是靠一根一根线。 */
    for (let m = 11; m >= 0.5; m -= 1) {
      const i = Math.round(dep + m);
      const y1 = yBelow(m, vh, hz); // 近的一条沿（这一步的边）
      const y2 = yBelow(m + 1, vh, hz); // 远的一条沿（下一步的边）
      if (y2 > vh + 40) continue;
      const w1 = wBelow(m, vw);
      const w2 = wBelow(m + 1, vw);
      const s1 = sBelow(m, vh);
      const s2 = sBelow(m + 1, vh);
      // 离光越远越暗；最近那一两级要留得住，不然脚下是空的
      const lit = 0.16 + 0.84 * Math.exp(-m * 0.26);
      const al = vis * lit;
      if (al < 0.01) continue;
      const bits = layerBits(i);

      /* 台面：近沿 → 远沿围出来的那一圈。
         光从上面（地平线那口）来，所以越靠里（屏幕上越靠上）越亮，越到沿口越暗 ——
         这一级一级明暗下去，就是「越深越没光」最直接的写法，不用整片压黑。 */
      const bg = g.createLinearGradient(0, y2 + s2 * 0.2, 0, y1 + s1);
      bg.addColorStop(0, rgba(pale, al * 0.1));
      bg.addColorStop(0.55, rgba(pale, al * 0.045));
      bg.addColorStop(1, rgba(tint01, al * 0.55));
      g.beginPath();
      g.moveTo(cx - w1, y1);
      g.quadraticCurveTo(cx, y1 + s1 * 2, cx + w1, y1);
      g.lineTo(cx + w2, y2);
      g.quadraticCurveTo(cx, y2 + s2 * 2, cx - w2, y2);
      g.closePath();
      g.fillStyle = bg;
      g.fill();

      /* 近的那条沿：台阶的边。一条雾 + 一条实线 + 一小池光 */
      g.beginPath();
      g.moveTo(cx - w1, y1);
      g.quadraticCurveTo(cx, y1 + s1 * 2, cx + w1, y1);
      g.lineJoin = 'round';
      if (m < 5.5) {
        g.lineWidth = 6;
        g.strokeStyle = rgba(pale, al * 0.05);
        g.stroke();
      }
      g.lineWidth = 1;
      g.strokeStyle = rgba(dim, al * (0.5 - m * 0.02));
      g.stroke();

      // 沿口上的一小池光：每一级自己的一点点亮，位置固定（不跟着时间走）
      const px0 = cx + bits.lx * w1 * 0.9;
      const lg = g.createLinearGradient(px0 - w1 * 0.5, 0, px0 + w1 * 0.5, 0);
      lg.addColorStop(0, rgba(pale, 0));
      lg.addColorStop(0.5, rgba(pale, al * 0.34 * bits.lg));
      lg.addColorStop(1, rgba(pale, 0));
      g.beginPath();
      g.moveTo(cx - w1, y1);
      g.quadraticCurveTo(cx, y1 + s1 * 2, cx + w1, y1);
      g.strokeStyle = lg;
      g.lineWidth = 1;
      g.stroke();

      /* 台面上的点：远看只是几个像素；越深越不动 */
      const uMax = Math.min(0.95, (vw * 0.47) / w1);
      for (const b of bits.bits) {
        const drift = RM ? 0 : Math.sin(t * b.sp + b.ph) * 0.006 * shrift;
        const u = clamp(b.u + drift, -0.95, 0.95) * uMax;
        const x = cx + u * w1;
        const y = arcY(y1, s1, u) - b.v * Math.min(s1 * 0.55, 30);
        const sz = Math.max(1, Math.round(b.r * (1 - clamp(m / 10, 0, 0.4))));
        g.fillStyle = rgba(pale, al * (0.08 + 0.4 * b.r));
        g.fillRect(Math.round(x), Math.round(y), sz, sz);
      }

      /* 以后能点的地方：一个实心方点 —— 台面上放着东西的地方 */
      for (const q of bits.marks) {
        const u = q.u * uMax;
        const x = cx + u * w1;
        const y = arcY(y1, s1, u) - q.v * Math.min(s1 * 0.55, 26);
        g.fillStyle = rgba(pale, al * 0.62);
        g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      }

      /* 两端各一小截竖向的肋：台沿是有厚度的（窄到一定宽度才看得见） */
      if (w1 < vw * 0.72) {
        const ri = 2 + 6 * clamp(1 - w1 / (vw * 0.72), 0, 1);
        g.beginPath();
        g.moveTo(cx - w1, y1 - ri);
        g.lineTo(cx - w1, y1 + ri * 0.7);
        g.moveTo(cx + w1, y1 - ri);
        g.lineTo(cx + w1, y1 + ri * 0.7);
        g.strokeStyle = rgba(dim, al * 0.3);
        g.stroke();
      }
    }

    /* ——— 往上走的时候，井壁上出现一架窄梯 ———
       这是「上来不是倒放」的那半句：沉下去是顺着台沿一圈一圈滑（环形的、连续的），
       上来时借的是这个（两侧一条竖轨 + 一级一级横档，断开的、有阶的）。
       所以两条路看到的东西形状就不一样 —— 不是把下去的帧倒着播。
       平时不画，只有 rise（正在往上）够大才浮出来。 */
    if (rise > 0.02) {
      // 架在偏右一点的地方：正中间已经有台沿的轴，梯子不能压在轴上
      const lx0 = cx + Math.min(vw * 0.16, 190);
      const rw = Math.min(vw * 0.055, 56);
      const rungs = [];
      for (let k = 1; k <= 8; k++) {
        const m = k + 0.5;
        const yy = yBelow(m, vh, hz);
        if (yy > vh * 0.96) continue;
        // 越往上（越远）越窄：梯子是往上收的，不是一块板
        rungs.push({ m, yy, w: rw * (0.35 + 0.65 * gBelow(m)) });
      }
      if (rungs.length > 2) {
        const top = rungs[rungs.length - 1];
        const bot = rungs[0];
        const al = vis * rise * 0.9;

        // 两条竖轨：从下往上收，收进地平线那一带
        g.beginPath();
        for (const sgn of [-1, 1]) {
          g.moveTo(lx0 + sgn * bot.w, bot.yy);
          g.lineTo(lx0 + sgn * top.w, top.yy);
        }
        g.strokeStyle = rgba(pale, al * 0.55);
        g.lineWidth = 1;
        g.stroke();

        // 横档：越靠下（越近）越实，越往上越淡（收进光里）
        for (const r of rungs) {
          const k2 = clamp((r.yy - top.yy) / Math.max(1, bot.yy - top.yy), 0, 1);
          const a2 = al * (0.18 + 0.82 * k2 * k2);
          g.beginPath();
          g.moveTo(lx0 - r.w, r.yy);
          g.lineTo(lx0 + r.w, r.yy);
          g.strokeStyle = rgba(pale, a2 * 0.8);
          g.lineWidth = 1;
          g.stroke();
        }

        // 梯脚那一小圈：踩到实处了
        g.beginPath();
        g.moveTo(lx0 - bot.w * 1.5, bot.yy);
        g.quadraticCurveTo(lx0, bot.yy + sBelow(bot.m, vh) * 1.2, lx0 + bot.w * 1.5, bot.yy);
        g.strokeStyle = rgba(pale, al * 0.3);
        g.stroke();
      }
    }
  }

  /* ══ DOM：左边三行级名 + 右边那把尺 ══ */
  for (let i = 0; i <= 5; i++) {
    const el = document.createElement('div');
    el.className = 'd-tick';
    el.style.top = `${(i / 5) * 100}%`;
    el.innerHTML = `<b>${i}</b>`;
    scale.appendChild(el);
  }

  function updateDom(s) {
    const vw = s.vw;
    const vh = s.vh;
    const hz = s.horizon;
    const cx = vw * 0.5 - s.cam.x * vh * 0.5;
    const vis = clamp((s.arrive - 0.62) / 0.38, 0, 1);
    const m0 = Math.round(dep);
    const off = clamp(Math.abs(dep - m0), 0, 0.5) * 2; // 0 = 正站在一级上

    // 我这一级 + 下面两级：三行字，贴着各自那条沿的左端
    for (let k = 0; k < 3; k++) {
      const el = labs[k];
      const m = k + 0.5 + (m0 - dep);
      const yy = yBelow(m, vh, hz);
      const w = wBelow(m, vw);
      const sag = sBelow(m, vh);
      const a = vis * (k === 0 ? 0.95 - off * 0.35 : k === 1 ? 0.4 : 0.24);
      // 贴着那条弧的左端；弧宽了就往里收，永远在画面里
      const lx = clamp(cx - Math.min(w * 0.94, vw * 0.46), 26, vw - 96);
      const u = (lx - cx) / w;
      const ly = clamp(arcY(yy, sag, u) - 12, 84, vh - 44);
      if (a < 0.02) {
        el.style.opacity = '0';
        continue;
      }
      el.textContent = wordOf(m0 + k);
      el.className = `d-lab${k === 0 ? ' on' : ''}`;
      el.style.opacity = a.toFixed(3);
      el.style.transform = `translate3d(${Math.round(lx)}px, ${Math.round(ly)}px, 0)`;
    }

    if (vis > 0.01) {
      mk.style.top = `${clamp(dep / 5, 0, 1) * 100}%`;
      mk.style.opacity = String(vis);
      stat.textContent = `沉 ${dep.toFixed(1)} · ${wordOf(m0)} · ${Math.round(vw)}×${Math.round(vh)}`;
    }
  }

  /* ══ 遮罩：深度或方向变了才写一次样式（一次写入 = 一个全屏图层重画） ══ */
  let veilKey = '';
  function updateVeil(s) {
    const vp = pick(VEIL, dep);
    const tint = pick(TINTS, dep);
    // 往上走的时候口子以另一种形状张回来：更圆、偏暖一点（不是倒放的同一帧）
    const ax = vp[1] * (1 + rise * 0.26);
    const ay = vp[2] * (1 + rise * 0.46);
    const tm = tint.map((v, j) => (j === 0 ? v + rise * 3.4 : j === 1 ? v + rise * 1.0 : v - rise * 1.8));
    const key = `${dep.toFixed(3)}|${rise.toFixed(3)}|${Math.round(world.vw)}|${Math.round(world.vh)}`;
    if (key === veilKey) return;
    veilKey = key;
    veil.style.setProperty('--tint', tm.map((v) => v.toFixed(1)).join(','));
    veil.style.setProperty('--k', vp[0].toFixed(3));
    veil.style.setProperty('--bd', vp[3].toFixed(3));
    veil.style.setProperty('--ax', `${(ax * 100).toFixed(1)}vw`);
    veil.style.setProperty('--ay', `${(ay * 100).toFixed(1)}vh`);
    veil.style.setProperty('--cy', `${((s.horizon / Math.max(1, world.vh)) * 100).toFixed(1)}vh`);
  }

  /* ══ 输入 ══ */
  const bump = (dv) => {
    if (!arrived) return;
    target = clampD(target + dv);
    lastInput = 0;
  };
  const moved = () => {
    if (firstMove) return;
    firstMove = true;
    hint?.classList.add('off');
    hint?.classList.remove('go');
  };

  addEventListener(
    'wheel',
    (e) => {
      if (!arrived) return; // 转场那一下归 shell.js
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      bump(dy * 0.0022);
      moved();
    },
    { passive: true },
  );

  let drag = null;
  addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('a,button,[data-ui]')) return;
    drag = { y: e.clientY, dep: target, moved: 0, ok: arrived };
  });
  addEventListener('pointermove', (e) => {
    if (!drag || !drag.ok) return;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dy);
    if (drag.moved > 3) moved();
    // 抓住画面往上推 = 往下走（和进来那一次上划同一个手）
    if (drag.moved > 6) {
      target = clampD(drag.dep - dy / (world.vh * 0.8));
      lastInput = 0;
    }
  });
  const release = () => {
    if (drag && drag.ok && drag.moved > 6) {
      // 松手带一点惯性：继续朝同一个方向滑过去一点
      const slack = target - drag.dep;
      if (Math.abs(slack) > 0.02) target = clampD(target + slack * 0.2);
    }
    drag = null;
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);

  addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input,textarea')) return;
    let used = true;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') bump(1);
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') bump(-1);
    else if (e.key === 'Home' && arrived) {
      target = 0;
      lastInput = 0;
    } else if (e.key === 'End' && arrived) {
      target = 5;
      lastInput = 0;
    } else used = false;
    if (used) {
      e.preventDefault();
      moved();
    }
  });

  /* ══ 每帧 ══
     深度：先跟手（target），再软追（dep，95ms）；停下来半秒就自己吸附到整级。 */
  world.onFrame((s) => {
    const dt = clamp(s.dt, 0, 0.05);
    arrived = s.arrive > 0.86;

    if (!drag) {
      lastInput += dt;
      if (lastInput > 0.5) {
        const snap = Math.round(target);
        if (Math.abs(target - snap) < 0.7) target += (snap - target) * Math.min(1, dt * 3.4);
      }
    }
    dep += (target - dep) * (1 - Math.exp((-dt * 1000) / 95));

    // 在往上还是在往下：平滑成 0–1，决定横档与口子的形状
    const v = dt > 0 ? (dep - prevDep) / dt : 0;
    prevDep = dep;
    const want = clamp(-v * 1.2, 0, 1);
    rise += (want - rise) * (1 - Math.exp((-dt * 1000) / (want > rise ? 110 : 650)));

    /* 竖直的那一格归深度；横向与推拉留给 shell.js 的拖拽，这里只补一点视差。 */
    world.cam.y = -dep * 0.3;

    updateVeil(s);
    const va = clamp((s.arrive - 0.4) / 0.42, 0, 1).toFixed(3);
    if (veil.style.opacity !== va) veil.style.opacity = va;

    render(s);
    updateDom(s);

    // 转完之后把「怎么走」那一行放出来；一动就退场
    if (s.arrive > 0.985 && !firstMove) hint?.classList.add('go');
  });

  /* 地址参数：?dive=3 直接沉到第三级（截图用，和 ?arrive 一个性质） */
  if (opt.dive) {
    dep = target = prevDep = clampD(opt.dive);
    veilKey = '';
  }

  return {
    get depth() {
      return dep;
    },
  };
}
