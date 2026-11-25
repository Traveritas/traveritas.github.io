/* ─────────────────────────────────────────────────────────────
   星 · 晶体（design/mocks/star-nexus/src.js）｜ 端口 4674

   一颗六尖的星，材质照搬 src/scripts/nexus-slice.ts 的片元着色器。
   NEXUS 那枚晶体的质感不来自任何 PBR 参数，它来自四件事同时成立：

     ① 一间设计过的淡色环境 env(d, r)：丁香天顶、近白的地平亮带、偏紫的下半球、
        左上柔光箱、两块暗卡给轮廓，右后一盏很淡的粉白小灯；r（粗糙度）把亮带摊开 ——
        同一个函数既供表面反射（r=0，清楚）也供体内透射（r 大，化开）。
     ② 沿光程的吸收 trans *= exp(-k·L)，k 是丁香的：走得越长越深，这就是「里面有厚度」。
     ③ 体内一团近白的光核：沿每一段光程积分 exp(-d²/0.12)，再 1-exp(-g·uCore) 饱和。
     ④ 圆角棱：算出点到最近一条邻棱的距离，把法线朝那张面弯过去 —— 棱是软的，不是硬切的。
     外加 ior 1.52 的折射、至多三次体内全反射、出射时按三个略不同的 ior 采样（色散），
     反射上只挂 0.16 的薄膜虹彩，最后一道 pow(...,260) 的镜面。

   ── 非凸性 ──────────────────────────────────────────────────
   NEXUS 的切面永远是凸的，所以它一个 exitT() 扫 24 个半空间就够了。六角星有六个凹口，
   出射面不能这么找。这里是「凸体并集」的精确解，不是 SDF 步进：

     · 每一支沿轴切成 seg 段；每一段是一个**凸的棱台**（8 张侧面 + 2 个端面 = 10 个半空间）。
       凸性是逐块保证的，所以一条光线对一块凸体只有 [ta, tb] 一个区间，解得精确、无歧义。
     · 因为块是凸的，「P 在块内 ⇒ 该块对 P 之后可见的那一段就是 [0, tb] 连续的一段」，
       于是 **并集的出射 = 所有「包含 P」的块里 tb 的最大值**。这一条是整个做法的支点：
       六支在星心附近互插的那一团由它自动解掉 —— 光线从 A 支穿进 B 支体里时，
       A 的出射被 B 的 tb 盖过，不在那儿折；那儿本来也没有面。
     · 出射面法线取那一块的那个出射面的法线；全反射、色散、吸收、光核全接 NEXUS 的原做法。
     · 先按包围球把「P 不在其中」的块整块剔掉，真正吃 10 个半空间的通常只有一两块。

   ── 截面：倒角菱形（八边形）───────────────────────────────
   菱形截面（顶点在 ±i1 / ±i2 上）四个角倒掉，就成了八边形：四张主面 + 四张倒角面。
   这一条是为了「读成晶体」而不是「读成折纸」—— NEXUS 那枚切面有二十四张脸，
   光靠明暗的连续过渡是分不出脸的；多一张面，棱线就多一处折，光才咬得住。
   倒角量 `bev` 0 = 纯菱形（四张面），1 = 几乎成圆。截面在「交换两个坐标」下不变，
   所以整颗星对立方群逐点不变，体对角视角的剪影是**正**六芒星。

   ── 为什么用正交投影 ────────────────────────────────────────
   六个支尖在体对角视角下等距、相邻六十度，这是三维里的事实。但**透视**会把它们
   拆成 3+3：近侧三个支尖投得大、远侧三个投得小（实测 dist 4.3 时半径比 0.685 : 0.523，
   差 31%）。要六支在画面上真等距，只有正交。NEXUS 用透视是因为它那团切面很紧凑，
   而这一页要判的恰恰是「六支相不相等」，所以这里选了正交 —— 这是与 NEXUS 有意的不同。

   ── 参数 ────────────────────────────────────────────────────
     粗细 w      根部截面的大小（菱形半对角；面积 2w²）
     弧线 prof   母线的型：直 / 凹 / 深凹 / 凸（f(0)=1、f(1)=0；按段采成折线，
                 所以凸母线依然是凸棱台的并集，精确性不丢）
     倒角 bev    截面的倒角量 0..1（0 纯菱形、1 近圆）
     平滑 round  圆角棱的宽度（世界单位）

   ── 醒梦 ────────────────────────────────────────────────────
   读 documentElement 上的 --reality-mix（reality.ts 每换一面写一次），转成 uDream
   （0 醒 · 1 梦）进 env() 的天顶、吸收色与光核色 —— 与 nexus-slice.ts 同一个口子：
     top = mix(top, vec3(0.94,0.90,0.95), uDream);
     k   = mix(vec3(0.060,0.064,0.012), vec3(0.030,0.058,0.030), uDream);
   本页另有一对按钮直接写 --reality-mix，所以「跟着走」能被亲眼验。

   ── 定格 ────────────────────────────────────────────────────
   翻一次是 12 格离散姿态（每格一跳，格间不补间）；到站 cancelAnimationFrame、
   清掉 setTimeout，一个 rAF 都不再排。页面上有帧计数器与「静置取证」按钮。

   ── 成本 ────────────────────────────────────────────────────
   一张画布摊 N 格（Chrome 每页约 16 个 WebGL2 上下文）。单格位图长边钳在 MAX_PX 820
   （NEXUS 是 900），整张画布 1500。量法用块计时（N 帧连续画 + 一次 gl.finish）。
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ── 硬上限 ─────────────────────────────────────────────────── */
export const MAXP = 24; // 凸体上限：6 支 × 每支 4 段
export const SEG = 4; // 每支沿轴切几段（母线的折线段数）
export const NOCT = 8; // 截面边数（倒角菱形）
export const NPPL = NOCT + 2; // 每块的半空间数：8 侧面 + 2 端面
export const MAX_PX = 820; // 单格位图长边上限（NEXUS 的 MAX_PX 是 900）
export const CANVAS_MAX = 1500; // 整张画布长边上限
export const BOUNCES = 4; // 体内至多几段（入射 + 3 次全反射）

/* ── 母线：f(0)=1 根部满宽，f(1)=0 支尖 ───────────────────── */
export const PROFILES = {
  straight: { label: '直', f: (u) => 1 - u, note: '母线是一条直线，每支就是标准锥' },
  waist: { label: '凹', f: (u) => (1 - u) * (1 - 1.2 * u * (1 - u)), note: '中段收进三成，腰在离根四成处' },
  waistDeep: { label: '深凹', f: (u) => (1 - u) * (1 - 2.2 * u * (1 - u)), note: '中段收进五成半' },
  belly: { label: '凸', f: (u) => (1 - u) * (1 + 2.4 * u * (1 - u)), note: '中段鼓出六成，到尖才收' },
};
export const PROFILE_KEYS = Object.keys(PROFILES);

/* 采用的那一档：粗细 0.26、母线取凹、每支两段、倒角 0.30、圆角棱 0.016
   两段的理由：整颗要读成「一颗晶体」而不是「一颗细碎的玻璃刺猬」。段多了
   每支上就多一圈切出来的棱，光在那一圈上折两次，画面上是一串小台阶；
   NEXUS 那枚切面总共二十来张脸，光靠这么几张就把深度说清楚了。 */
export const BASE = Object.freeze({ w: 0.26, prof: 'waist', seg: 2, bev: 0.3, round: 0.016 });
export const fillCfg = (p) => ({ ...BASE, ...(p || {}) });

/* ── 姿态：体对角视角（唯一让六个支尖等距、相邻 60° 的一格）── */
export const REST = { az: 45, el: Math.asin(1 / Math.sqrt(3)) / DEG }; // 35.264°

/* ── 相机：正交。半高 1.18 —— 支尖在画面上到 0.79，留两成余白 ── */
export const HALF = 1.18;

/* ══════════════════════════════════════════════════════════
   1. 几何：六支 → 24 块凸棱台
   ══════════════════════════════════════════════════════════ */

/* 三支的定基：x→(y,z)、y→(z,x)、z→(x,y) 是绕体对角线 (1,1,1) 的循环，
   加上截面在「交换两个坐标」下不变，整颗星对立方群逐点不变 ——
   体对角视角的剪影因此是**正**六芒星，不是「差不多」。 */
const OTHER = [
  [1, 2],
  [2, 0],
  [0, 1],
];

/** 截面：菱形（|u|+|v| ≤ 1）的四个角倒掉，切到 |u|,|v| ≤ A = 1 − bev。
 *  0°/90°/180°/270° 落在主面上（距轴 1）；45°/135°… 落在倒角面上（|u| = |v| = A）。
 *  bev 0.05 时几乎是菱形，0.92 时几乎是方形。截面在「交换 u 与 v」下不变 ——
 *  这是整颗星对立方群逐点不变、体对角剪影是**正**六芒星的几何前提。 */
function octagon(bev) {
  const A = 1 - clamp(bev, 0.05, 0.92);
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const th = (k * Math.PI) / 4;
    const cu = Math.cos(th);
    const cv = Math.sin(th);
    pts.push(k % 2 === 0 ? [cu, cv] : [cu * A * Math.SQRT2, cv * A * Math.SQRT2]);
  }
  const nrm = [];
  for (let i = 0; i < 8; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % 8];
    const ex = c[0] - a[0];
    const ey = c[1] - a[1];
    const L = Math.hypot(ex, ey) || 1;
    /* 逆时针 ⇒ 外法向是边方向右转 90° */
    nrm.push([ey / L, -ex / L]);
  }
  return { pts, nrm };
}

/** 三点定平面，返回归一化的 [nx,ny,nz,d]，令 n·p ≤ d 是内侧 */
function planeOf(a, b, c, inward) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const L = Math.hypot(n[0], n[1], n[2]);
  if (L < 1e-12) return null;
  n = [n[0] / L, n[1] / L, n[2] / L];
  let d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
  /* 让法向朝外：块心一定在平面内侧 */
  const s = n[0] * inward[0] + n[1] * inward[1] + n[2] * inward[2] - d;
  if (s > 0) {
    n = [-n[0], -n[1], -n[2]];
    d = -d;
  }
  return [n[0], n[1], n[2], d];
}

/**
 * 造这一份几何。planes 是 [MAXP][NPPL][4]（n·p ≤ d），法线朝外；凸体并集的出射
 * 只看 tb 最大，所以法向朝外/朝内的约定在这里是**明确**的，不是碰运气。
 */
export function buildSolid(cfgIn) {
  const cfg = fillCfg(cfgIn);
  const F = PROFILES[cfg.prof] || PROFILES.straight;
  const w = cfg.w;
  const seg = clamp(cfg.seg | 0, 1, SEG);
  const oct = octagon(cfg.bev);

  const planes = new Float32Array(MAXP * NPPL * 4);
  const spheres = new Float32Array(MAXP * 4);
  const faceN = new Float32Array(MAXP * NPPL * 3); // 世界坐标的法向（给圆角棱用）
  const pos = [];
  const nor = [];
  const piece = [];
  let np = 0;

  const tri = (a, b, c, n, pk) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const L = Math.hypot(cr[0], cr[1], cr[2]);
    if (L < 1e-12) return;
    const s = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const q = s ? [a, c, b] : [a, b, c];
    for (const p of q) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      piece.push(pk);
    }
  };

  for (let ax = 0; ax < 3; ax++) {
    const [i1, i2] = OTHER[ax];
    for (const sgn of [1, -1]) {
      for (let k = 0; k < seg; k++) {
        const u0 = k / seg;
        const u1 = (k + 1) / seg;
        const t0 = u0;
        const t1 = u1;
        const W0 = w * F.f(u0);
        /* 支尖那一段的末端会收敛成一点（f(1)=0），端面退化成一个点就没有平面可言。
           给末端一个极小但非零的半宽：截出来的端面在画面上是半点大小，看不出被切过，
           而十张面齐了，这一块才是一个真的凸体。丢一块不丢面 —— 面是着色器拿块
           索引去查半空间的，查不到就会一路读到空。 */
        const W1 = Math.max(w * F.f(u1), w * 2e-4);
        const WT0 = Math.max(W0, w * 2e-4);

        /* 环上的点：截面的 (u,v) 投到 (ax, i1, i2) 三根轴上 */
        const ringAt = (t, W) =>
          oct.pts.map(([a, b]) => {
            const p = [0, 0, 0];
            p[ax] = sgn * t;
            p[i1] = a * W;
            p[i2] = b * W;
            return p;
          });
        const r0 = ringAt(t0, WT0);
        const r1 = ringAt(t1, W1);
        let cx = [0, 0, 0];
        for (let i = 0; i < NOCT; i++) {
          cx[0] += (r0[i][0] + r1[i][0]) / (2 * NOCT);
          cx[1] += (r0[i][1] + r1[i][1]) / (2 * NOCT);
          cx[2] += (r0[i][2] + r1[i][2]) / (2 * NOCT);
        }

        const pls = [];
        /* 侧面：每一条边在 [t0,t1] 上扫出一张（可能是斜的）平面 */
        for (let i = 0; i < NOCT; i++) {
          const j = (i + 1) % NOCT;
          const pl = planeOf(r0[i], r0[j], r1[j], cx);
          if (pl) pls.push(pl);
        }
        /* 两个端面。支尖那一段的末端已经补成半点大小，所以这两张一定拿得到；
           万一还是没有（真的退化），整块连三角形一起丢掉 —— 块号必须连续，
           否则着色器拿块号去查半空间会查到隔壁。 */
        const capA = planeOf(r1[0], r1[1], r1[2], cx);
        const capB = planeOf(r0[0], r0[1], r0[2], cx);
        if (pls.length !== NOCT || !capA || !capB) continue;
        pls.push(capA, capB);

        for (let i = 0; i < NOCT; i++) {
          const j = (i + 1) % NOCT;
          tri(r0[i], r0[j], r1[j], pls[i], np);
          tri(r0[i], r1[j], r1[i], pls[i], np);
        }
        for (let i = 2; i < NOCT; i++) tri(r1[0], r1[i - 1], r1[i], capA, np);
        for (let i = 2; i < NOCT; i++) tri(r0[0], r0[i], r0[i - 1], capB, np);

        /* 写进数组：法向朝外（planeOf 已经保证了） */
        for (let i = 0; i < NPPL; i++) {
          planes.set(pls[i], (np * NPPL + i) * 4);
          faceN.set([pls[i][0], pls[i][1], pls[i][2]], (np * NPPL + i) * 3);
        }
        /* 包围球（剔块用）：块心与最远角点，留 2‰ 的余量 */
        let rad = 0;
        for (const p of r0.concat(r1)) rad = Math.max(rad, Math.hypot(p[0] - cx[0], p[1] - cx[1], p[2] - cx[2]));
        spheres.set([cx[0], cx[1], cx[2], rad * 1.002], np * 4);
        np++;
      }
    }
  }

  return {
    cfg,
    nPieces: np,
    pos: new Float32Array(pos),
    nor: new Float32Array(nor),
    piece: new Float32Array(piece),
    planes,
    faceN,
    spheres,
    tris: pos.length / 9,
  };
}

/* ══════════════════════════════════════════════════════════
   2. 着色器
   ══════════════════════════════════════════════════════════ */

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in float aPiece;
uniform mat4 uView, uProj;
out vec3 vW; out vec3 vN; flat out float vPiece;
void main(){
  vec4 v = uView * vec4(aPos, 1.0);
  vW = v.xyz;
  vN = mat3(uView) * aNor;
  vPiece = aPiece;
  gl_Position = uProj * vec4(v.xyz, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler2D;
#define MAXP ${MAXP}
#define NPPL ${NPPL}
#define NOCT ${NOCT}
in vec3 vW;
in vec3 vN;
flat in float vPiece;
/* 半空间表放在纹理里：24 块 × 10 张 = 240 个 vec4，塞不进 uniform 数组
   （ES3 保证的 fragment uniform 只有 224 个 vec4），texelFetch 取，不插值。 */
uniform sampler2D uPl;     // RGBA32F，宽 NPPL、高 MAXP：n·p ≤ d（视空间，n 朝外）
uniform vec4 uBs[MAXP];    // 每块的包围球（剔块用，保守）
uniform int uNP;
uniform vec3 uRay;         // 入射方向（视空间；正交相机 ⇒ 常数）
uniform float uDream;      // 0 醒 · 1 梦
uniform float uCore;       // 光核强度
uniform vec3 uCoreC;       // 光核位置（视空间）
uniform float uRough;      // 体内磨砂度
uniform float uRound;      // 圆角棱的宽度
uniform int uDbg;          // 诊断：0 正常，其余只输出某一项（见 main 末尾）
uniform float uAbs;        // 吸收的倍数（1 ＝ nexus-slice.ts 原值）
uniform vec3 uTint;        // env() 的色相补偿（见 env 上面那段）
out vec4 o;

vec4 pl(int k, int i){ return texelFetch(uPl, ivec2(i, k), 0); }

/* 环境：淡丁香天顶、近白的地平亮带、偏紫的下半球；左上柔光箱与左侧暗卡给轮廓，
   右后一盏很淡的粉白小灯。r：粗糙度 0..1 —— 表面反射用 0（清楚），
   体内透射用较大值（光斑化开、暗卡变浅）。这一段与 nexus-slice.ts 的 env() 逐字对齐，
   只加了一个 uTint：见下面「与 NEXUS 的一处不同」。 */
vec3 envBase(vec3 d, float r){
  float w = 1.0 + 3.0 * r;
  float y = d.y;
  vec3 top = vec3(0.90, 0.895, 0.97), hor = vec3(1.0, 0.975, 0.965), low = vec3(0.78, 0.745, 0.80);
  top = mix(top, vec3(0.94, 0.90, 0.95), uDream);
  vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.65 * w, y)) : mix(hor, low, smoothstep(0.0, 0.5 * w, -y));
  c += vec3(0.12, 0.10, 0.09) * exp(-pow(y / (0.06 * w), 2.0));
  c *= mix(1.0, 0.92, smoothstep(0.15, 0.95, d.z));
  float k = 1.0 - r * 0.6;
  c *= 1.0 - 0.30 * k * smoothstep(1.0 - 0.20 * w, 0.97, dot(d, normalize(vec3(-0.95, 0.05, -0.30))));
  c *= 1.0 - 0.15 * k * smoothstep(1.0 - 0.25 * w, 0.97, dot(d, normalize(vec3(0.85, -0.25, 0.45))));
  float key = smoothstep(1.0 - 0.10 * w, 0.975, dot(d, normalize(vec3(-0.50, 0.70, 0.50))));
  c += vec3(1.0, 0.99, 0.97) * 0.75 * k * key;
  c += vec3(1.0, 0.94, 0.96) * 0.30 * k * smoothstep(1.0 - 0.07 * w, 0.99, dot(d, normalize(vec3(0.75, 0.25, -0.60))));
  return c;
}
/* 与 NEXUS 的一处**有意**的不同：把 env() 的色相往蓝紫推一点点。
   实测（.cmp.py，同一张 #f0f3f6 底、同一套像素统计）：
     NEXUS wake.webp  星内平均 rgb(206,200,216) —— B 比 R 高 10
     这颗星未调时    星内平均 rgb(210,202,206) —— B 比 R 低 4
   差的不是明度（两者的 5% 与 95% 分位几乎重合：160/251 对 158/255），是**色相**：
   整颗偏暖了。原因不在 env() 本身（它逐字抄的），而在几何：那枚切面是紧凑的凸体，
   光穿过它时大多打到地平亮带与丁香天顶；六支星的尖又细又长，视线在尖上几乎与面
   平行，出射光线大半落进下半球（low = vec3(0.78,0.745,0.80)，比上半球暖）。
   所以这里补一道很淡的蓝紫染色，量值按上面两组数对齐，不改 env() 的任何一项。 */
vec3 env(vec3 d, float r){
  vec3 c = envBase(d, r);
  c *= uTint;
  return c;
}

/* 一块凸棱台与射线的参数区间；nb = 出射面法向（朝外）。凸块的好处：
   整个可见段就是 [ta, tb] 一个区间，没有第二个解法。 */
bool pieceAt(vec3 P, vec3 T, int k, out float ta, out float tb, out vec3 nb){
  ta = -1e9; tb = 1e9; nb = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NPPL; i++){
    vec4 p = pl(k, i);
    float dn = dot(p.xyz, T);
    float g = p.w - dot(p.xyz, P);
    if (dn > 1e-6){
      float t = g / dn;
      if (t < tb){ tb = t; nb = p.xyz; }
    } else if (dn < -1e-6){
      float t = g / dn;
      if (t > ta) ta = t;
    } else if (g < 0.0) return false;
  }
  return ta <= tb;
}

/* 并集的出射：P 在并集内部，出射 = 所有「包含 P」的块里 tb 的最大值。
   这不是近似 —— 块是凸的，P 之后它在块内的可见段就是 [0, tb] 连续的一段；
   从 A 支穿进 B 支时 A 的 tb 被 B 的 tb 盖过，光线不在那儿折（那儿本来也没有面）。
   先用包围球把不含 P 的块整块剔掉。 */
bool exitUnion(vec3 P, vec3 T, out float tOut, out vec3 nOut, out int kOut){
  tOut = -1.0; nOut = vec3(0.0, 1.0, 0.0); kOut = -1;
  bool found = false;
  for (int k = 0; k < MAXP; k++){
    if (k >= uNP) break;
    vec4 bs = uBs[k];
    vec3 dp = P - bs.xyz;
    if (dot(dp, dp) > bs.w * bs.w) continue;
    float ta, tb; vec3 nb;
    if (!pieceAt(P, T, k, ta, tb, nb)) continue;
    /* P 在并集里，凡是「P 在块内」的块才算数（ta ≤ 0）。容差 4e-3：
       全反射之后起步的点会被推出去一点点，而并集的边界上 P 恰好贴着两张面，
       浮点抖动不该被当成「这块不含 P」。容差太小会让出射时有时无（画面上一道道
       断掉的黑线正是这么来的）。 */
    if (ta > 4e-3) continue;
    if (!found || tb > tOut){ tOut = tb; nOut = nb; kOut = k; found = true; }
  }
  return found;
}

/* 面上点到最近一条棱（沿该面量）的距离，nb = 那条棱另一侧的面法向。
   圆角棱就是靠它把法线朝邻面弯过去。只数这一块**自己的八张侧面**
   （i < NOCT）：两个端面是切出来的假面，全埋在并集内部，算进来会在每支中段
   画出一圈假棱。 */
float edgeDist(vec3 P, vec3 N, int k, out vec3 nb){
  float best = 1e9; nb = N;
  for (int i = 0; i < NOCT; i++){
    vec4 p = pl(k, i);
    float c = dot(p.xyz, N);
    if (c > 0.9995) continue;
    float e = (p.w - dot(p.xyz, P)) / sqrt(max(1e-4, 1.0 - c * c));
    if (e < best){ best = e; nb = p.xyz; }
  }
  return best;
}

/* 光核：沿一段光程积分，离核越近越亮 */
float glowSeg(vec3 A, vec3 B){
  vec3 ab = B - A;
  float t = clamp(dot(uCoreC - A, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec3 q = A + ab * t - uCoreC;
  return exp(-dot(q, q) / 0.12) * length(ab);
}

void main(){
  vec3 N = normalize(vN);
  vec3 I = normalize(uRay);
  vec3 V = -I;
  int ki = int(vPiece + 0.5);

  // 圆角棱：靠近棱时法线朝邻面弯过去
  vec3 nb;
  float e = edgeDist(vW, N, ki, nb);
  float tb = 1.0 - smoothstep(0.0, max(uRound, 1e-4), e);
  vec3 Nb = normalize(mix(N, normalize(N + nb), tb * tb));

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 refl = env(reflect(I, Nb), 0.0);

  // 透射：入射 → 至多三次体内全反射 → 出射
  float ior = 1.52;
  vec3 T = refract(I, Nb, 1.0 / ior);
  vec3 P = vW + T * 2e-4;
  float L = 0.0, g = 0.0, inner = 0.0;
  vec3 trans = vec3(0.0);
  bool done = false;
  float disp = mix(0.006, 0.018, uDream);
  for (int b = 0; b < ${BOUNCES}; b++){
    float t; vec3 Ne; int ke;
    if (!exitUnion(P, T, t, Ne, ke)) break;
    vec3 Q = P + T * t;
    L += t; g += glowSeg(P, Q);
    if (b == 0){
      vec3 dummy;
      inner = exp(-pow(edgeDist(Q, Ne, ke, dummy) / 0.010, 2.0));
    }
    vec3 Tg = refract(T, -Ne, ior);
    if (dot(Tg, Tg) > 0.0){
      vec3 Tr = refract(T, -Ne, ior - disp);
      vec3 Tb = refract(T, -Ne, ior + disp);
      if (dot(Tr, Tr) == 0.0) Tr = Tg;
      if (dot(Tb, Tb) == 0.0) Tb = Tg;
      float Fe = 0.04 + 0.96 * pow(1.0 - clamp(dot(Ne, Tg), 0.0, 1.0), 5.0);
      trans = vec3(env(Tr, uRough).r, env(Tg, uRough).g, env(Tb, uRough).b) * (1.0 - Fe);
      done = true;
      break;
    }
    T = reflect(T, -Ne);
    P = Q + T * 2e-4;
  }
  if (!done) trans = env(T, uRough) * 0.85;

  // 吸收：丁香色，梦里偏一点粉；光程越长越深
  vec3 kk = mix(vec3(0.060, 0.064, 0.012), vec3(0.030, 0.058, 0.030), uDream) * uAbs;
  trans *= exp(-kk * L) * 1.03;
  trans *= 1.0 - inner * 0.16;
  // 光核：沿光程积分后饱和，一团近白的微温
  float gc = 1.0 - exp(-g * uCore);
  vec3 glow = mix(vec3(1.0, 0.975, 0.955), vec3(1.0, 0.955, 0.965), uDream);
  trans = mix(trans, glow * 1.05, gc * 0.6);

  /* 薄膜虹彩，只上在反射里 */
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + 1.8 * (1.0 - ndv)));
  refl *= mix(vec3(1.0), film, 0.16);
  vec3 col = mix(trans, refl, F);
  vec3 Lk = normalize(vec3(-0.50, 0.70, 0.50));
  float spec = pow(max(dot(Nb, normalize(Lk + V)), 0.0), 260.0);
  col += vec3(1.0) * spec * (0.9 + 0.6 * tb);

  /* 诊断（uDbg ≠ 0）：只把某一项摆出来，好判断是谁在发浑 */
  if (uDbg == 1) col = env(reflect(I, Nb), 0.0);
  else if (uDbg == 2) col = trans;
  else if (uDbg == 3) col = vec3(F);
  else if (uDbg == 4) col = env(T, uRough);
  else if (uDbg == 5) col = vec3(Nb * 0.5 + 0.5);
  else if (uDbg == 6) col = vec3(tb, e * 8.0, 0.0);
  else if (uDbg == 7) col = vec3(float(ki) / 24.0, 0.0, 0.0);
  else if (uDbg == 8) col = vec3(pl(ki, 0).w, pl(ki, 1).w, pl(ki, 8).w);
  else if (uDbg == 9) col = vec3(L, g, inner);
  else if (uDbg == 10) col = vec3(1.0 - exp(-kk * L));

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* ══════════════════════════════════════════════════════════
   3. 矩阵
   ══════════════════════════════════════════════════════════ */
function ortho(half, asp, n, f) {
  return new Float32Array([1 / (half * asp), 0, 0, 0, 0, 1 / half, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
}
function lookAt(e, c, up) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (v) => {
    const L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = nrm(sub(e, c));
  const x = nrm(cross(up, z));
  const y = cross(z, x);
  return {
    m: new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]),
      -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]),
      -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]),
      1,
    ]),
    x,
    y,
    z,
  };
}

/** az/el → 相机位置（+y 为天顶）；体对角是 az 45° / el 35.264° */
export function camPos(az, el, dist) {
  const a = az * DEG;
  const e = clamp(el, -89, 89) * DEG;
  const ce = Math.cos(e);
  return [ce * Math.cos(a) * dist, Math.sin(e) * dist, ce * Math.sin(a) * dist];
}

const raf2 = new Float32Array(9);
const trans3 = new Float32Array(3);
/**
 * 世界坐标的半空间 n·p ≤ d 搬到视空间。
 * 视变换是 x_v = R·x_w + t，于是 n_w·(Rᵀ(x_v − t)) ≤ d ⇒ n_v·x_v ≤ d + n_v·t。
 * **这个 `+ n_v·t` 不能漏**：相机在 6 之外，漏了它整副半空间就停在视空间原点，
 * 而网格在 z ≈ −6，两者对不上，exitUnion 一路返回「找不到出射」，画面就成了无折射的平板。
 */
function planeToView(planes, n, out) {
  for (let k = 0; k < n; k++) {
    const o = k * 4;
    const x = planes[o];
    const y = planes[o + 1];
    const z = planes[o + 2];
    const nx = raf2[0] * x + raf2[1] * y + raf2[2] * z;
    const ny = raf2[3] * x + raf2[4] * y + raf2[5] * z;
    const nz = raf2[6] * x + raf2[7] * y + raf2[8] * z;
    out[o] = nx;
    out[o + 1] = ny;
    out[o + 2] = nz;
    out[o + 3] = planes[o + 3] + nx * trans3[0] + ny * trans3[1] + nz * trans3[2];
  }
}
function sphereToView(sph, n, out) {
  for (let k = 0; k < n; k++) {
    const o = k * 4;
    const x = sph[o];
    const y = sph[o + 1];
    const z = sph[o + 2];
    out[o] = raf2[0] * x + raf2[1] * y + raf2[2] * z + trans3[0];
    out[o + 1] = raf2[3] * x + raf2[4] * y + raf2[5] * z + trans3[1];
    out[o + 2] = raf2[6] * x + raf2[7] * y + raf2[8] * z + trans3[2];
    out[o + 3] = sph[o + 3];
  }
}
/** 世界坐标的点 → 视空间 */
function pointToView(p) {
  return [
    raf2[0] * p[0] + raf2[1] * p[1] + raf2[2] * p[2] + trans3[0],
    raf2[3] * p[0] + raf2[4] * p[1] + raf2[5] * p[2] + trans3[1],
    raf2[6] * p[0] + raf2[7] * p[1] + raf2[8] * p[2] + trans3[2],
  ];
}

/* ══════════════════════════════════════════════════════════
   4. 醒梦：读 --reality-mix（reality.ts 每换一面写一次）
   ══════════════════════════════════════════════════════════ */
/** --reality-mix 是 0 梦…1 醒；着色器的 uDream 是 0 醒…1 梦，所以要翻一下 */
export function mixNow() {
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reality-mix'));
    return Number.isFinite(v) ? clamp(1 - v, 0, 1) : 0;
  } catch {
    return 0;
  }
}

const stages = [];
let mixRaf = 0;

function tickMix() {
  mixRaf = 0;
  let busy = false;
  for (const s of stages) busy = s.stepDream(1 / 60) || busy;
  for (const s of stages) s.draw();
  if (busy) mixRaf = requestAnimationFrame(tickMix);
}
function fireMix() {
  const v = mixNow();
  for (const s of stages) s.retarget(v);
  if (!mixRaf) mixRaf = requestAnimationFrame(tickMix);
}
function watchMix() {
  if (typeof MutationObserver === 'undefined') return;
  /* reality.ts 写的是 documentElement 的 style（--reality-mix 与四个强调色），
     所以盯属性就够；再顺带听它自己派的 xm:reality 事件。 */
  new MutationObserver(fireMix).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  addEventListener('xm:reality', fireMix);
}

/* ══════════════════════════════════════════════════════════
   5. 舞台：一张画布摊 N 格
   ══════════════════════════════════════════════════════════ */
const GEO_CACHE = new Map();
function geoFor(cfg) {
  const key = `${cfg.w}|${cfg.prof}|${cfg.seg}|${cfg.bev}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = buildSolid(cfg);
    GEO_CACHE.set(key, g);
  }
  return g;
}

export const state = {
  reduced: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  renderer: '',
  fallback: '',
};

export class Stage {
  constructor(host) {
    this.host = host;
    this.cells = [];
    this.frames = 0;
    this.raf = 0;
    this.dream = mixNow();
    this.target = this.dream;
    this.ok = false;
    const cv = document.createElement('canvas');
    cv.className = 'stage-canvas';
    host.appendChild(cv);
    this.canvas = cv;
    const gl = cv.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) {
      state.fallback = state.fallback || 'no-webgl2';
      host.dataset.gl = 'off';
      return; // 留在静帧图上
    }
    this.gl = gl;
    /* failIfMajorPerformanceCaveat 不一定拦得住软件渲染（SwiftShader 照样给上下文），
       按渲染器名再挡一道 */
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rname = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    state.renderer = rname || state.renderer;
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rname)) {
      state.fallback = 'software-renderer';
      host.dataset.gl = 'off';
      return;
    }

    let bad = '';
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        bad = 'shader: ' + (gl.getShaderInfoLog(sh) || '');
        console.error(bad);
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (bad || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      state.fallback = bad || 'link';
      host.dataset.gl = 'off';
      return;
    }
    this.prog = prog;
    this.U = {};
    for (const n of ['uView', 'uProj', 'uPl', 'uBs', 'uNP', 'uRay', 'uDream', 'uCore', 'uCoreC', 'uRough', 'uRound', 'uDbg', 'uAbs', 'uTint'])
      this.U[n] = gl.getUniformLocation(prog, n);
    this.dbg = 0;
    this.abs = 1;
    /* 默认就是按实测对齐的那一组：R 收一点、B 抬一点，色相偏蓝紫 1.5% 上下 */
    this.tint = [0.985, 0.993, 1.045];
    this.plView = new Float32Array(MAXP * NPPL * 4);
    this.bsView = new Float32Array(MAXP * 4);
    this.tex = null;
    this.ok = true;
    host.dataset.gl = 'on';
    stages.push(this);
    this.resize();
    this.draw();
  }

  /** 加一格。el 是页面上那个透明的占位 div（负责接指针事件）。 */
  addCell(el, spec = {}) {
    const cfg = fillCfg(spec.cfg);
    const c = {
      el,
      cfg,
      geo: geoFor(cfg),
      orb: { az: spec.az ?? REST.az, el: spec.el ?? REST.el, zoom: 1 },
      home: { az: spec.az ?? REST.az, el: spec.el ?? REST.el, zoom: 1 },
      mix: spec.mix ?? null, // 写死的醒度（null = 跟着页面走）
      drag: null,
      rect: { x: 0, y: 0, w: 1, h: 1 },
      vao: null,
      count: 0,
    };
    this.cells.push(c);
    if (this.ok) this.upload(c);
    this.wire(c);
    this.requestDraw();
    return c;
  }

  upload(c) {
    const gl = this.gl;
    const g = c.geo;
    if (c.vao) gl.deleteVertexArray(c.vao);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const nV = g.pos.length / 3;
    const buf = new Float32Array(nV * 7);
    for (let i = 0; i < nV; i++) {
      buf[i * 7] = g.pos[i * 3];
      buf[i * 7 + 1] = g.pos[i * 3 + 1];
      buf[i * 7 + 2] = g.pos[i * 3 + 2];
      buf[i * 7 + 3] = g.nor[i * 3];
      buf[i * 7 + 4] = g.nor[i * 3 + 1];
      buf[i * 7 + 5] = g.nor[i * 3 + 2];
      buf[i * 7 + 6] = g.piece[i];
    }
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    c.vao = vao;
    c.count = nV;
  }

  /** 半空间表进纹理：宽 NPPL、高 MAXP，RGBA32F，NEAREST + texelFetch */
  ensureTex() {
    if (this.tex) return;
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* 行优先：第 k 行是第 k 块的 NPPL 张面 */
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NPPL, MAXP, 0, gl.RGBA, gl.FLOAT, null);
    this.tex = t;
  }

  wire(c) {
    const el = c.el;
    const down = (e) => {
      if (e.button !== 0) return;
      c.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, az: c.orb.az, el: c.orb.el };
      el.setPointerCapture?.(e.pointerId);
      el.dataset.drag = '1';
    };
    const move = (e) => {
      if (!c.drag || e.pointerId !== c.drag.id) return;
      c.orb.az = c.drag.az + (e.clientX - c.drag.x) * 0.55;
      /* el 钳在 ±89°：越过天顶 up 会翻，观感是「翻了个跟斗」 */
      c.orb.el = clamp(c.drag.el - (e.clientY - c.drag.y) * 0.5, -89, 89);
      this.requestDraw();
    };
    const up = (e) => {
      if (!c.drag) return;
      c.drag = null;
      delete el.dataset.drag;
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        c.orb.zoom = clamp(c.orb.zoom * (1 + clamp(e.deltaY, -240, 240) * 0.0011), 0.42, 2.6);
        this.requestDraw();
      },
      { passive: false },
    );
    el.addEventListener('dblclick', () => {
      c.orb = { ...c.home, az: c.home.az + Math.round((c.orb.az - c.home.az) / 360) * 360 };
      this.requestDraw();
    });
  }

  /** @param {number} v 目标 uDream（0 醒…1 梦） */
  retarget(v) {
    if (this.cells.some((c) => c.mix === null)) this.target = clamp(v, 0, 1);
    if (state.reduced) {
      this.dream = this.target;
      this.draw();
      return;
    }
    this.requestDraw();
  }

  /** 逐帧逼近目标醒度；返回是否还在动 */
  stepDream(dt) {
    const d = this.target - this.dream;
    if (Math.abs(d) < 1e-4) {
      this.dream = this.target;
      return false;
    }
    this.dream += Math.sign(d) * Math.min(Math.abs(d), dt / 1.2);
    return true;
  }

  resize() {
    if (!this.ok) return;
    const gl = this.gl;
    const r = this.host.getBoundingClientRect();
    let maxCell = 64;
    for (const c of this.cells) {
      const b = c.el.getBoundingClientRect();
      maxCell = Math.max(maxCell, b.width, b.height);
    }
    let dpr = Math.min(devicePixelRatio || 1, MAX_PX / maxCell);
    dpr = Math.min(dpr, CANVAS_MAX / Math.max(1, r.width || 1), CANVAS_MAX / Math.max(1, r.height || 1));
    dpr = clamp(dpr, 0.4, 2);
    this.dpr = dpr;
    const W = Math.max(2, Math.round((r.width || 1) * dpr));
    const H = Math.max(2, Math.round((r.height || 1) * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    for (const c of this.cells) {
      const b = c.el.getBoundingClientRect();
      c.rect = { x: (b.left - r.left) * dpr, y: (r.bottom - b.bottom) * dpr, w: b.width * dpr, h: b.height * dpr };
    }
    gl.viewport(0, 0, W, H);
  }

  requestDraw() {
    if (!this.ok) return;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  draw() {
    if (!this.ok) return;
    const gl = this.gl;
    this.resize();
    this.ensureTex();
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.U.uPl, 0);
    for (const c of this.cells) {
      const d = c.rect;
      if (d.w < 4 || d.h < 4) continue;
      gl.viewport(d.x, d.y, d.w, d.h);
      gl.scissor(d.x, d.y, d.w, d.h);
      gl.enable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const cam = camPos(c.orb.az, c.orb.el, 6);
      const L = lookAt(cam, [0, 0, 0], [0, 1, 0]);
      /* 视矩阵左上 3×3（列主序）→ 世界→视的转置，用来搬法向与位置 */
      raf2[0] = L.m[0];
      raf2[1] = L.m[4];
      raf2[2] = L.m[8];
      raf2[3] = L.m[1];
      raf2[4] = L.m[5];
      raf2[5] = L.m[9];
      raf2[6] = L.m[2];
      raf2[7] = L.m[6];
      raf2[8] = L.m[10];
      /* 视矩阵的平移（列主序在第 13/14/15 项） */
      trans3[0] = L.m[12];
      trans3[1] = L.m[13];
      trans3[2] = L.m[14];

      const proj = ortho(HALF / c.orb.zoom, d.w / d.h, 0.1, 40);
      planeToView(c.geo.planes, c.geo.nPieces * NPPL, this.plView);
      sphereToView(c.geo.spheres, c.geo.nPieces, this.bsView);

      /* 半空间表上传（每个格子一块，nPieces ≤ MAXP，按 NPPL 行宽打包） */
      const px4 = new Float32Array(NPPL * MAXP * 4);
      for (let k = 0; k < c.geo.nPieces; k++)
        for (let i = 0; i < NPPL; i++) {
          const src = (k * NPPL + i) * 4;
          const dst = (k * NPPL + i) * 4;
          /* 一块的行宽只取 NPPL 张 —— 与 texelFetch(ivec2(i,k)) 完全对齐 */
          px4[dst] = this.plView[src];
          px4[dst + 1] = this.plView[src + 1];
          px4[dst + 2] = this.plView[src + 2];
          px4[dst + 3] = this.plView[src + 3];
        }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NPPL, MAXP, gl.RGBA, gl.FLOAT, px4);

      const dm = c.mix === null ? this.dream : c.mix;
      gl.uniformMatrix4fv(this.U.uView, false, L.m);
      gl.uniformMatrix4fv(this.U.uProj, false, proj);
      gl.uniform4fv(this.U.uBs, this.bsView);
      gl.uniform1i(this.U.uNP, c.geo.nPieces);
      /* 正交相机：视空间里入射方向恒是 −z */
      gl.uniform3fv(this.U.uRay, [0, 0, -1]);
      gl.uniform1f(this.U.uDream, dm);
      gl.uniform1f(this.U.uCore, 0.5 + 0.95 * dm);
      /* 光核位置：nexus 是 (0, 0.04+0.1d, 0)。这里必须走完整的点到视变换 ——
         相机在 6 之外，「星心 = 视空间原点」是不成立的（星心在 z ≈ −6）。 */
      const core = pointToView([0, 0.04 + 0.1 * dm, 0]);
      gl.uniform3fv(this.U.uCoreC, core);
      gl.uniform1f(this.U.uRough, 0.45 - 0.12 * dm);
      gl.uniform1f(this.U.uRound, c.cfg.round);
      gl.uniform1i(this.U.uDbg, this.dbg);
      gl.uniform1f(this.U.uAbs, this.abs);
      gl.uniform3fv(this.U.uTint, this.tint);
      gl.bindVertexArray(c.vao);
      gl.drawArrays(gl.TRIANGLES, 0, c.count);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.SCISSOR_TEST);
    this.frames++;
  }

  drawOnce() {
    this.draw();
  }
}

/* ══════════════════════════════════════════════════════════
   6. 定格：翻一次，然后一帧都不再画
   ══════════════════════════════════════════════════════════ */
export const TUMBLE = {
  steps: 12,
  holdMs: 105,
  breath: 3,
  /* 起手：从偏 208° / 27° 的地方转回正位 —— 转角够大，转得出「翻过一次」 */
  from: { az: REST.az - 208, el: REST.el - 27 },
  to: REST,
};

export class TumbleClock {
  constructor(stage, cell, o = {}) {
    this.stage = stage;
    this.cell = cell;
    this.steps = o.steps ?? TUMBLE.steps;
    this.holdMs = o.holdMs ?? TUMBLE.holdMs;
    this.breath = o.breath ?? TUMBLE.breath;
    this.busy = false;
    this.step = 0;
    this.raf = 0;
    this.timer = 0;
    this.ticks = 0;
    this.onTick = o.onTick || (() => {});
  }

  _pose(k) {
    const a = TUMBLE.from;
    const b = TUMBLE.to;
    return { az: a.az + (b.az - a.az) * k, el: a.el + (b.el - a.el) * k };
  }

  _tick() {
    if (!this.busy) return;
    this.step++;
    const k = Math.min(1, this.step / this.steps);
    const p = this._pose(k);
    this.cell.orb.az = p.az;
    this.cell.orb.el = p.el;
    this.stage.drawOnce();
    this.ticks++;
    this.onTick({ step: this.step, frames: this.stage.frames });
    if (this.step >= this.steps) return this._finish();
    const hold = this.step === this.steps - 1 ? this.holdMs * this.breath : this.holdMs;
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this._tick();
      });
    }, hold);
  }

  _finish() {
    this.busy = false;
    this.cell.orb.az = TUMBLE.to.az;
    this.cell.orb.el = TUMBLE.to.el;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stage.drawOnce();
    this.onTick({ step: 'rest', frames: this.stage.frames, done: true });
  }

  start() {
    if (this.busy) return { started: false, reason: 'busy' };
    if (state.reduced) {
      /* 减弱动效：只画正位一张，不播过程，一个 rAF 都不排 */
      this.cell.orb.az = TUMBLE.to.az;
      this.cell.orb.el = TUMBLE.to.el;
      this.stage.drawOnce();
      this.onTick({ step: 'rm', frames: this.stage.frames, done: true, reduce: true });
      return { started: false, reason: 'reduced-motion' };
    }
    this.busy = true;
    this.step = 0;
    this.ticks = 0;
    const p0 = this._pose(0);
    this.cell.orb.az = p0.az;
    this.cell.orb.el = p0.el;
    this._tick();
    return { started: true };
  }

  stop() {
    this.busy = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = 0;
    this.raf = 0;
  }

  state() {
    return {
      busy: this.busy,
      raf: this.raf,
      timer: this.timer,
      step: this.step,
      ticks: this.ticks,
      frames: this.stage.frames,
      pose: { az: +this.cell.orb.az.toFixed(2), el: +this.cell.orb.el.toFixed(2) },
      reduce: state.reduced,
    };
  }
}

/* ══════════════════════════════════════════════════════════
   7. 块计时：N 帧连续画 + 一次真同步，取中位数
   ══════════════════════════════════════════════════════════ */
/**
 * 同步的写法是关键。`gl.finish()` 在这一页上量不出东西：headless + ANGLE/D3D11
 * 在没有待查对象时它差不多是空转，读数会给出 0.03 ms 这种不可能的数（一万四千个
 * 像素、每个还要跑 24 块凸体 × 4 段，不可能三十微秒画完）。`readPixels` 一定要等
 * 批次落地才有像素可回，是这一页唯一可信的栅栏 —— 所以用读一个像素当同步。
 * 预热 4 帧，是为了让着色器编译与第一次上传不进计时。
 */
export function blockTime(stage, { frames = 40, blocks = 5 } = {}) {
  if (!stage || !stage.ok) return { ms: null };
  const gl = stage.gl;
  const sync = () => {
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  for (let i = 0; i < 4; i++) stage.drawOnce();
  sync();
  const runs = [];
  for (let b = 0; b < blocks; b++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) stage.drawOnce();
    sync();
    runs.push((performance.now() - t0) / frames);
  }
  const sorted = runs.slice().sort((a, b) => a - b);
  const c0 = stage.cells[0];
  return {
    ms: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    runs: runs.map((r) => +r.toFixed(3)),
    px: `${stage.canvas.width}×${stage.canvas.height}`,
    cellPx: c0 ? `${Math.round(c0.rect.w)}×${Math.round(c0.rect.h)}` : '',
    pieces: c0 ? c0.geo.nPieces : 0,
    tris: c0 ? c0.geo.tris : 0,
    frames,
    blocks,
  };
}

/* ══════════════════════════════════════════════════════════
   8. 挂载
   ══════════════════════════════════════════════════════════ */
function mount() {
  watchMix();
  const made = [];
  for (const host of document.querySelectorAll('.stage')) {
    const cells = [...host.querySelectorAll('.cell')];
    if (!cells.length) continue;
    const st = new Stage(host);
    if (!st.ok) continue;
    for (const el of cells) {
      const cfg = {
        w: +(el.dataset.w || BASE.w),
        prof: el.dataset.prof || BASE.prof,
        seg: +(el.dataset.seg || SEG),
        bev: el.dataset.bev === undefined ? BASE.bev : +el.dataset.bev,
        round: el.dataset.round === undefined ? BASE.round : +el.dataset.round,
      };
      const c = st.addCell(el, {
        cfg,
        az: el.dataset.az ? +el.dataset.az : undefined,
        el: el.dataset.el !== undefined ? +el.dataset.el : undefined,
        mix: el.dataset.mix !== undefined ? +el.dataset.mix : null,
      });
      if (!el.querySelector('.cell-tag') && el.dataset.tag) {
        const t = document.createElement('span');
        t.className = 'cell-tag';
        t.textContent = el.dataset.tag;
        el.appendChild(t);
      }
      made.push({ st, c, el });
    }
    new ResizeObserver(() => {
      st.resize();
      st.draw();
    }).observe(host);
  }

  const mainHost = document.querySelector('.stage[data-main]');
  const mainStage = mainHost ? stages.find((s) => s.host === mainHost) || null : null;
  let clock = null;
  if (mainStage) {
    clock = new TumbleClock(mainStage, mainStage.cells[0], {
      onTick: (t) => {
        const out = document.querySelector('[data-flip-state]');
        if (out) out.textContent = t.done ? `到站 · 共 ${mainStage.frames} 帧` : `第 ${t.step}/${TUMBLE.steps} 格`;
      },
    });
    setTimeout(() => clock.start(), 260);
  }

  /* 醒梦按钮：直接写 --reality-mix（reality.ts 写的也是这一个变量） */
  const root = document.documentElement;
  const setMix = (v) => {
    root.style.setProperty('--reality-mix', (+clamp(v, 0, 1)).toFixed(3));
    const lbl = document.querySelector('[data-mix-label]');
    if (lbl) lbl.textContent = v >= 0.999 ? '醒面 1.000' : v <= 0.001 ? '梦面 0.000' : `醒度 ${(+v).toFixed(3)}`;
    fireMix();
  };
  for (const b of document.querySelectorAll('[data-set-mix]'))
    b.addEventListener('click', () => {
      setMix(+b.dataset.setMix);
      for (const o of document.querySelectorAll('[data-set-mix]')) o.setAttribute('aria-pressed', String(o === b));
    });
  setMix(1);

  const noStage = !mainStage;
  window.__star = {
    frames: () => (mainStage ? mainStage.frames : 0),
    flip: () => (clock ? clock.start() : { started: false, reason: 'no-stage' }),
    state: () => (clock ? clock.state() : { reason: 'no-stage', fallback: state.fallback }),
    pose: () =>
      mainStage
        ? {
            az: +mainStage.cells[0].orb.az.toFixed(3),
            el: +mainStage.cells[0].orb.el.toFixed(3),
            zoom: +mainStage.cells[0].orb.zoom.toFixed(3),
          }
        : null,
    probeIdle: async (ms = 2000) => {
      const st = mainStage;
      const before = st ? st.frames : 0;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, ms));
      return {
        before,
        after: st ? st.frames : 0,
        delta: (st ? st.frames : 0) - before,
        elapsed: Math.round(performance.now() - t0),
        raf: st ? st.raf : 0,
        timer: clock ? clock.timer : 0,
        busy: clock ? clock.busy : false,
        mixRaf,
      };
    },
    setMix,
    /** 当前 uDream（0 醒 · 1 梦），页面上写的是 --reality-mix = 1 − 它 */
    mix: () => mixNow(),
    measure: (o) => blockTime(mainStage, o),
    cost: null,
    dbg: (v) => {
      for (const s of stages) s.dbg = v | 0;
      for (const s of stages) s.draw();
      return v;
    },
    abs: (v) => {
      for (const s of stages) s.abs = +v;
      for (const s of stages) s.draw();
      return v;
    },
    /** 把主星单独按一个醒度渲一张、取回像素（诊断用，别在页面里长住） */
    pixels: (o = {}) => {
      if (!mainStage) return null;
      const c = mainStage.cells[0];
      const keep = { dbg: mainStage.dbg, mix: c.mix, orb: { ...c.orb } };
      if (o.dbg !== undefined) mainStage.dbg = o.dbg | 0;
      if (o.mix !== undefined) c.mix = +o.mix;
      if (o.az !== undefined) c.orb.az = +o.az;
      if (o.el !== undefined) c.orb.el = +o.el;
      if (o.zoom !== undefined) c.orb.zoom = +o.zoom;
      mainStage.draw();
      const gl = mainStage.gl;
      const d = c.rect;
      const w = Math.max(1, Math.round(d.w));
      const h = Math.max(1, Math.round(d.h));
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(Math.round(d.x), Math.round(d.y), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      mainStage.dbg = keep.dbg;
      c.mix = keep.mix;
      Object.assign(c.orb, keep.orb);
      mainStage.draw();
      /* 只留 rgb，压成 base64 之外的普通数组会太大 —— 给统计量就够 */
      /* 画布清成 (0,0,0,0)，所以按 alpha 判「是不是星」 */
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const hist = new Array(8).fill(0);
      for (let i = 0; i < w * h; i++) {
        if (buf[i * 4 + 3] < 128) continue;
        n++;
        const R = buf[i * 4];
        const G = buf[i * 4 + 1];
        const B = buf[i * 4 + 2];
        r += R;
        g += G;
        b += B;
        hist[Math.min(7, Math.floor(((R + G + B) / 3 / 256) * 8))]++;
      }
      return n
        ? { w, h, ink: n, share: +((n / (w * h)) * 100).toFixed(1), mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], hist }
        : { w, h, ink: 0 };
    },
    readPixels: (x, y, w, h) => {
      if (!mainStage) return null;
      const gl = mainStage.gl;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return Array.from(buf);
    },
    caps: { MAX_PX, CANVAS_MAX, MAXP, SEG, NOCT, BOUNCES, HALF },
    cells: made.map((m) => ({ tag: m.el.dataset.tag || '', cfg: m.c.config, pcs: m.c.geo.nPieces })),
    renderer: () => state.renderer,
    fallback: () => state.fallback,
    noStage,
    stages,
  };
  document.documentElement.dataset.gl = state.fallback ? 'off' : 'on';
  window.__ready = true;

  /* 页面上的几个读数按钮 */
  const framesBtn = document.querySelector('[data-frames]');
  if (framesBtn)
    framesBtn.addEventListener('click', () => {
      const out = document.querySelector('[data-frames-out]') || document.querySelector('[data-flip-state]');
      const st = clock ? clock.state() : null;
      if (out)
        out.textContent = `已画 ${window.__star.frames()} 帧 · 翻动 ${st && st.busy ? `进行中（第 ${st.step}/${TUMBLE.steps} 格）` : '已停'} · 排队的 rAF ${mainStage ? mainStage.raf : 0}`;
    });

  const costBtn = document.querySelector('[data-cost]');
  if (costBtn)
    costBtn.addEventListener('click', () => {
      const box = document.querySelector('[data-cost-out]');
      if (!mainStage) {
        if (box) box.textContent = '没有 WebGL2，测不了';
        return;
      }
      if (box) box.textContent = '量…';
      setTimeout(() => {
        const r = blockTime(mainStage, { frames: 40, blocks: 5 });
        if (box) box.textContent = `中位 ${r.ms} ms/帧 · 位图 ${r.px} · 单格 ${r.cellPx} · ${r.pieces} 块凸体 / ${r.tris} 三角`;
        window.__star.cost = r;
      }, 30);
    });

  const idleBtn = document.querySelector('[data-idle]');
  if (idleBtn)
    idleBtn.addEventListener('click', async () => {
      const out = document.querySelector('[data-idle-out]');
      const proof = await window.__star.probeIdle(2000);
      if (out)
        out.textContent = `静置 ${proof.elapsed} ms：帧数 ${proof.before} → ${proof.after}（Δ ${proof.delta}）· rAF ${proof.raf} · timer ${proof.timer}`;
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}