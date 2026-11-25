/* ─────────────────────────────────────────────────────────────
   三轴正交六芒星 · 三维水晶原语（design/mocks/star-v2/src.js）

   形体：三个互相垂直的方双锥（每块 = 8 张平面围成的凸体，沿一条轴两极出尖），
        它们的并集就是六支沿 ±x ±y ±z 的星。六个尖在 r = 1 上，根部半宽 2.2/16，
        于是支长 : 根部半宽 = 16 : 2.2。星心是六支真互插的一块实心交汇体 ——
        交接处没有补面、没有空洞，交给着色器里的包含判定去解。

   材质：整页只有一张全屏片元着色器。`env()`、丁香色吸收、三色色散、体内全反射、
        棱上高光、薄膜虹彩，逐行照搬 `src/scripts/nexus-slice.ts` 的 FS；
        几何从「一个凸体」换成「三个凸块的并集」（下一步的做法沿用
        `design/mocks/star-nexus-bake/` 里已经跑通的那一套：跨过界面后若仍在并集里，
        那是两块的交叠面，不折射、不记棱）。

   背景：星体后面有一条横穿的细线与一行淡色字。它们画进一张 2D 画布当纹理，
        着色器按**出射光线**的方向去采它 —— 于是星体背后的东西会被折弯、错位、被几张
        晶面切成几段，色散让断口边上带一点颜色。没打中星体的像素按同一个映射直接取纹理，
        所以星体之外的字是原样、锐的（不是被超采样糊过一道）。

   运动：不是定轴自转。轴本身沿 a(u) = normalize(sin 2πu, sin(4πu+φ), cos 2πu) 走，
       姿态是 OFFSET · R(a(u), 2πu)。u = 0 与 u = 1 都精确取 OFFSET 本身，所以第一格
       与最后一格逐位相等，落定帧就是 poseAt(0)。第三轮把 OFFSET 从单位阵换成
       「原来 u = 0.2 的那一格」—— 体对角正位上六支对称、法线只有三种朝向，
       24 张面塌成三档调子；换格之后有十二种。轨迹本身一格没动。
       整段离散成 16 格，每格跳变、不插值、不加缓动；播完不留定时器、不调 rAF。
       静止的证据是像素逐字节相同（不是 rAF 计数 —— 那个数页面之外也会推）。
    ───────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

/* ═══ 一、形体 ═══════════════════════════════════════════════ */

export const SHAPE = Object.freeze({
  arms: 6,
  blocks: 3,
  facesPerArm: 4,
  tip: 1,
  /* 第二轮：0.1375 → 0.30。细支上两侧面几乎平行（棱处的二面角只有 ~29°），
     折射几乎不改变方向；吸收 exp(−kabs·L) 又因光程只有 0.1 量级而形同虚设 ——
     出射色基本就是环境色本身（近白），B−R 到不了 +6。厚度翻倍之后 L 也翻倍，
     棱角变宽、星心那块三支互插的实心体变大。面数与拓扑完全不变（仍是方双锥 8 面）。 */
  rootHalf: 0.3,
});
/** 截面菱形的斜率（= 支长 / 根部半宽 ≈ 3.846） */
const KH = SHAPE.tip / SHAPE.rootHalf;

/**
 * 三个凸块（体空间）。每块 = { n·p ≤ w } 八张平面的交，即一枚方双锥：
 * 顶点 (±1,0,0)、(0,±r0,0)、(0,0,±r0)。三块各管一条轴，两块对尖 → 六支。
 * 返回 [[nx,ny,nz,w] × 8, ...]，共 3 块 24 张平面。
 *
 * 第四轮把它写成 mode 的默认值（kind:'quad', theta:45, 保持原面积），
 * 所以这里出来的数与前几轮逐位相同；形状对照页用 buildBlocksOpts 另开变体。
 */
export function buildBlocks() {
  return buildBlocksOpts({ kind: 'quad', theta: 45, area: null });
}

/* ── 形状变体（第四轮） ────────────────────────────────────────
   一支的截面由「横向法向的方向集合」决定：
     quad：四个法向在 θ / 180−θ / 180+θ / −θ 上。θ = 45° 就是现役的菱形截面
           （顶点落在 ±y、±z 轴上）；θ 收小 → 两组二面角一钝一锐，钝的那两条脊「压平」。
     tri ：三个法向隔 120°，截面是三角形 → 每支 3 张面。它只在绕轴的 120° 循环下不变，
           90° 旋转会破 —— 立方对称降一档。
   area 给 null 时取现役截面的面积，于是三个变体是「同样多的料」的对照。 */

/** 2D 半平面裁剪（凸多边形 × 一个半平面） */
function clip2(poly, c, h) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = c[0] * a[0] + c[1] * a[1] - h;
    const db = c[0] * b[0] + c[1] * b[1] - h;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
/** 截面多边形（横向平面内），半宽 h */
export function sectionPoly(dirs, h) {
  let poly = [[-8, -8], [8, -8], [8, 8], [-8, 8]];
  for (const c of dirs) poly = clip2(poly, c, h);
  return poly;
}
const polyArea = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
/** 横向法向的方向集合。
    quad：把正方的四条法向整体绕轴转 phase（θ=45 时截面是正方形，phase 只改它的朝向）；
    θ≠45 时截面成一个斜方（两条脊钝、两条脊尖）。
    tri ：三条法向隔 120°，截面是三角形。 */
function dirsOf(kind, thetaDeg, phaseDeg = 0) {
  const ph = (phaseDeg * Math.PI) / 180;
  if (kind === 'tri')
    return [0, 1, 2].map((m) => {
      const a = Math.PI / 2 + ph + (m * 2 * Math.PI) / 3;
      return [Math.cos(a), Math.sin(a)];
    });
  const t = (thetaDeg * Math.PI) / 180;
  return [
    [Math.cos(t + ph), Math.sin(t + ph)],
    [Math.cos(Math.PI - t + ph), Math.sin(Math.PI - t + ph)],
    [Math.cos(Math.PI + t + ph), Math.sin(Math.PI + t + ph)],
    [Math.cos(-t + ph), Math.sin(-t + ph)],
  ];
}
/** 现役（A 列）截面面积：正方形两条对角线都是 2·rootHalf，面积 = 2·rootHalf² = 0.18。
    三个变体都按这个面积归一 —— 对照的是「同样多的料，切成几面」。 */
export const AREA_A = 2 * SHAPE.rootHalf * SHAPE.rootHalf;

/**
 * @param {{kind?:'quad'|'tri', theta?:number, phase?:number, area?:number|null}} o
 * @returns 三块的面表，每块 2·|dirs| 张（quad 8 张，tri 6 张）
 */
export function buildBlocksOpts(o = {}) {
  const kind = o.kind ?? 'quad';
  const theta = o.theta ?? 45;
  const phase = o.phase ?? 0;
  const targetArea = o.area ?? AREA_A;
  const dirs = dirsOf(kind, theta, phase);
  // 解 KH：截面半宽 h = 1/KH，面积随 KH 单调递减
  let lo = 0.05;
  let hi = 60;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (polyArea(sectionPoly(dirs, 1 / mid)) > targetArea) lo = mid;
    else hi = mid;
  }
  const KHx = (lo + hi) / 2;
  const blocks = [];
  for (let ax = 0; ax < 3; ax++) {
    const j = (ax + 1) % 3;
    const k = (ax + 2) % 3;
    const faces = [];
    for (const sign of [1, -1]) {
      for (const c of dirs) {
        const d = [0, 0, 0];
        d[ax] = sign;
        d[j] = KHx * c[0];
        d[k] = KHx * c[1];
        const L = Math.hypot(d[0], d[1], d[2]);
        faces.push([d[0] / L, d[1] / L, d[2] / L, 1 / L]);
      }
    }
    blocks.push(faces);
  }
  return blocks;
}

/* ═══ 二、姿态 ═══════════════════════════════════════════════ */

const mul3 = (A, B) => {
  const C = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
};
const apply3 = (M, v) => [
  M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
  M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
  M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
];
const norm3 = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};
/** Rodrigues：绕单位轴 a 转 θ（右手，行主序 3×3） */
export function rot3(a, th) {
  const [x, y, z] = norm3(a);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

export const REST = Object.freeze({ yaw: 45, pitch: 35.264 });

/* 世界 → 视：与 toolstar.ts 同一套约定（先绕 y 转 yaw，再绕 x 转 pitch，
   屏幕 x 向右、y 向上、z 朝向观者）。yaw 45 / pitch 35.264 时视轴正对体对角线。 */
function viewOf(yawDeg, pitchDeg) {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  return [cy, 0, sy, sy * sp, cp, -cy * sp, -sy * cp, sp, cy * cp];
}
const V_REST = viewOf(REST.yaw, REST.pitch);

/** 落定视角的「体 → 视」矩阵（V_REST · R）。形状对照量六尖投影要用它。 */
export const mulView = (R) => mul3(V_REST, R);

/** 旋转轴随 u 漂移的那条曲线（φ = 1.9） */
export const PHI = 1.9;
export const axisAt = (u) => norm3([Math.sin(TAU * u), Math.sin(2 * TAU * u + PHI), Math.cos(TAU * u)]);

/* ── 落定姿态（第五轮：撤回第三轮的 72° 偏移，改为绕视轴倾斜 δ） ─────
   第三轮把整条轨迹左乘 OFFSET = R(a(0.2), 2π·0.2)（72°，绕 (0.688,−0.691,0.223)），
   是为了治「六支法线同向、24 张面塌成两三档调子」。它确实治好了那个，
   代价是六个尖在画面上两两重叠：径向剖面只剩 4 个峰（82/172/262/352），
   而作者要的原语是六芒星。第五轮把那个 72° 偏移撤掉。

   现在落定姿态 = 体对角正位 · 绕视轴倾斜 δ（roll）。
   绕视轴滚只让画面里的星绕中心转，不改变形状 —— 所以 δ 扫下来
   峰数 / 角间距 / 峰半径全不变（量在 shape-audit.mjs 的 δ 扫描表）。
   δ 的作用只是把六芒星在画面上转到一个朝向；δ = 0 就是纯体对角。

   OFFSET / OFFSET_U 仍然导出：第三轮的笔记与旧读数要对得上，但它已不参与 poseAt。 */
export const OFFSET_U = 0.2;
export const OFFSET = rot3(axisAt(OFFSET_U), TAU * OFFSET_U);

/** 落定姿态绕视轴倾斜的角度（度）。第五轮扫描选定 0°。 */
export const REST_TILT_DEG = 0;

/** 绕视轴滚 δ：R' = V_RESTᵀ · Rz(δ) · V_REST —— 世界空间里就是「绕眼睛到原点那根轴转」。
    绕视轴滚只让画面里的星绕中心转，不改变形状；δ 只决定六芒星在画面上转到哪个朝向。 */
export function restRoll(deg) {
  const d = (deg * Math.PI) / 180;
  const c = Math.cos(d);
  const s = Math.sin(d);
  const Rz = [c, -s, 0, s, c, 0, 0, 0, 1];
  const VT = [
    V_REST[0], V_REST[3], V_REST[6],
    V_REST[1], V_REST[4], V_REST[7],
    V_REST[2], V_REST[5], V_REST[8],
  ];
  return mul3(VT, mul3(Rz, V_REST));
}

/** 落定姿态矩阵（体 → 世界）。第五轮起 = 体对角正位 · 绕视轴 δ。 */
export const REST_POSE = restRoll(REST_TILT_DEG);

/** 轨迹上第 i / N 格的姿态（体 → 世界）。
    首末两格精确取 REST_POSE 本身 —— 不让浮点尾巴留在落定帧上，
    于是 poseAt(0) 与 poseAt(1) 逐位相等，末格与静止帧是同一张画面。
    中间各格是 REST_POSE · R(a(u), 2πu)：偏移是左乘，所以相邻两格之间的相对旋转
    R_kᵀ R_{k+1} 逐位不变（每格 22.5°–92.5°、相邻轴在漂，量在 .probe.json）。 */
export function poseAt(u) {
  const k = Math.round(u);
  if (Math.abs(u - k) < 1e-9) return REST_POSE.slice();
  return mul3(REST_POSE, rot3(axisAt(u), TAU * u));
}

/** 体空间的面表 → 视空间（相机不动，转的是面） */
export function blocksInView(blocks, R) {
  const M = mul3(V_REST, R);
  return blocks.map((faces) =>
    faces.map((f) => {
      const n = apply3(M, [f[0], f[1], f[2]]);
      return [n[0], n[1], n[2], f[3]];
    }),
  );
}

/** 正交投影下，(x,y) 这一列是否穿过星体 —— 探针量剪影、点击判定都用它。
    对每块解出 z 的可行区间（逐面夹取），三块里有一块非空就算穿过。 */
export function covered(blocksView, x, y) {
  for (const faces of blocksView) {
    let lo = -Infinity;
    let hi = Infinity;
    let ok = true;
    for (const [nx, ny, nz, w] of faces) {
      const r = w - nx * x - ny * y;
      if (Math.abs(nz) < 1e-9) {
        if (r < 0) {
          ok = false;
          break;
        }
      } else if (nz > 0) hi = Math.min(hi, r / nz);
      else lo = Math.max(lo, r / nz);
    }
    if (ok && lo <= hi) return true;
  }
  return false;
}

/** 一条射线（视空间）是否打中星体：与着色器里 entryT 同一套符号口径 */
export function rayHits(blocksView, o, d) {
  for (const faces of blocksView) {
    let t0 = -Infinity;
    let t1 = Infinity;
    let ok = true;
    for (const [nx, ny, nz, w] of faces) {
      const dn = nx * d[0] + ny * d[1] + nz * d[2];
      const num = w - (nx * o[0] + ny * o[1] + nz * o[2]);
      if (dn > 1e-7) t1 = Math.min(t1, num / dn);
      else if (dn < -1e-7) t0 = Math.max(t0, num / dn);
      else if (num < 0) {
        ok = false;
        break;
      }
    }
    if (ok && t1 > Math.max(t0, 1e-6)) return true;
  }
  return false;
}

/* ═══ 三、着色器 ═════════════════════════════════════════════ */

const MAXP = 3; // 最多三块
const MAXF = 8; // 每块最多八面

/* ── 渲染旋钮 ──
   全部集中在这里，`tone.mjs`（离线色调账）也 import 这一份，
   于是「量出来的」与「画出来的」用的是同一批数，不可能悄悄分家。 */
export const RENDER = Object.freeze({
  /* 相机：拉得远、视角窄，近乎正交 —— 落定那张要读得出是六芒星（透视一强，
     朝观者的三个尖被放大、背面三个缩小，六个角就长短不一）。CAM_Z 12 时
     前后尖的尺度比 ≈ 1.10，还看得出厚度。

     第三轮：tan 0.091 → 0.086。星占 400px 画布 16.9% → 21.4%。
     上限是被**动画**卡住的，不是被落定帧：逐个算 16 格里六个尖的投影半径
     （透视，ndc r = |v_xy| / ((camZ − v_z)·tan)），最坏一格是 u = 0.3125，
     tan 0.086 时 r = 0.972 —— 再近一步（0.082）就到 1.020，支尖开始被画框切掉。
     落定姿态本身只到 r ≈ 0.60，所以画面上还留着大片空白。 */
  camZ: 12,
  tan: 0.086,
  /** 圆角棱的宽度（体单位）。支加粗到 0.26 之后按棱宽同比放大（原 0.014 是按 0.1375 定的） */
  edgeW: 0.026,
  /** 两张暗卡的增益（nexus 是 1.0）。
      第二轮是 3.5 —— 那个数是为「体对角正位」调的：那一格六支对称、法线近乎同向，
      亮面全朝一个方向，只能靠重卡把暗尾压到 155 以上。第三轮换了落定姿态，
      暗面自己就出来了，3.5 会把 P5 直接压到 59（量过）。回到 1.05。 */
  card: 1.05,
  ior: 1.52,
  /** 底上那条线与那行字透过星体的强度 */
  feat: 1.0,
  /** 体内磨砂度（nexus: 0.45 − 0.12·dream） */
  rough: 0.45,
  irid: 0.16,
  /** 光核。nexus: 0.5 + 0.95·dream。第一轮星心被它洗成一片 255 —— 收细 */
  core: 0.5,
  /** 光核往 trans 里掺的比例（nexus 0.55）。星心三支互插处 g 最大，掺太多就是一块白 */
  glowMix: 0.30,
  /** 色散：出射时 R/B 用的 ior 偏移（nexus: 0.006 醒 / 0.018 梦）。
     色散只在这一个数上，第一轮 0.006 小到只剩轮廓上一条 1px 彩边 */
  disp: 0.014,
  /** 冷色环：盖住出射最密集的那一圈的后方地平带。
      强度只负责「压暗多少」，色相是下面的 uRingTint —— 两者分开，
      因为第三轮加粗/换姿态之后需要压得更狠，但 B−R 不能被一起推到 20 以上。 */
  cool: 0.52,
  /** 冷环的色相（乘子）。0.90/0.96/1.18 那种「B 放大 18%」的做法会把 B−R 顶穿；
      改成「R、G 各压一点、B 只留 1.04」：压亮度的手段从「提蓝」换成「压红绿」。 */
  ringTint: [0.845, 0.925, 1.04],
  /** 下半球与暗卡的冷度：参考那颗晶体的暗部是浅紫灰，不是暖灰 */
  coolLow: 0.55,
  /** 暗尾（已经很暗的那些方向）再推一层冷的强度。
      第三轮从 0.75 降到 0.30：冷环本身已经把亮度压下来了，
      再叠一层暗尾推冷会把 B−R 顶到 18 以上（目标上限 14）。 */
  coolDark: 0.30,
  /** 星后那块底到原点的距离（视空间）。底必须在**有限**距离上 ——
      第一轮当成无穷远（只按出射方向取样），星内那一段取回的是画面别处，
      看到的是「变淡」不是「错位」。放在 1.6（星半径 1.0，正好贴在外侧）时，
      出射点到底面路程约 7.6，出射角与入射角差 16°–23°（中位），
      落到画面上就是几十像素的横向错开 —— 而且相邻像素会相向跳，自然切出几段。 */
  back: 1.6,
});

/* three 的 RawShaderMaterial + GLSL3 会自己补 `#version 300 es`，所以这两段不要写 version 行；
   module 模式下 precision 也得自己写（内置材质才由 three 补）。 */
const VS = `precision highp float;
in vec3 position;
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = `precision highp float;
#define MAXP ${MAXP}
#define MAXF ${MAXF}
out vec4 o;

uniform vec2  uRes;              // 帧缓冲尺寸（设备像素）
uniform vec2  uTan;              // tan(fov/2) 的两轴
uniform vec3  uCam;              // 视空间相机位置
uniform vec4  uPl[MAXP * MAXF];  // 视空间里的半空间：xyz·p ≤ w
uniform int   uOff[MAXP];
uniform int   uCnt[MAXP];
uniform int   uNP;
uniform sampler2D uBg;           // 星体后面的那张底（细线 + 一行字）
uniform vec3  uBgAvg;            // 底上的平色；纹理减掉它才是「图样」
uniform float uFeat;             // 图样透过星体的增益
uniform float uDream;
uniform float uCore;
uniform vec3  uCoreC;
uniform float uRough;
uniform float uEdgeW;
uniform float uIor;
uniform float uCard;
uniform float uIrid;
uniform float uCool;      // 冷色环强度
uniform vec3  uRingTint;  // 冷色环的色相（乘子）
uniform float uCoolDark;  // 暗尾推冷的强度
uniform float uCoolLow;   // 下半球 / 暗部的冷度
uniform float uGlowMix;   // 光核掺进 trans 的比例
uniform float uDisp;      // 出射色散（R/B 的 ior 偏移）
uniform float uBack;      // 星后那块底到原点（视空间 z = −uBack）的距离
uniform float uFlat;      // 1 = 纯剪影：打过星体的像素直接填成 uFlatCol，不看材质
uniform vec3  uFlatCol;
uniform int   uSS;

/* ── 环境：nexus-slice.ts 的 env() 为底，两处为本形体改的 ──────────────
   淡丁香天顶、近白地平亮带、偏紫的下半球；左上柔光箱与左侧暗卡给轮廓，
   右后一盏很淡的粉白小灯。r 越大带越糊：表面反射用 0，体内透射用较大值。

   改动一：两张暗卡乘 uCard —— 这颗星是凹的、支又细，同一张卡在它身上露出的
           面积比 NEXUS 那颗凸晶体小得多，不补就只有一片灰（上一轮 notes §2 的量）。
   改动二：下半球往冷里推（uCoolLow），并加一道很宽的冷色环（uCool）。
           第一轮实测 B−R 只有 +3（目标 +6…+14），因为这颗星的可见面几乎都朝上、
           照到的是暖地平带；参考那颗晶体暗部是**浅紫灰**。这两处只动色相，不动明度。 */
vec3 env(vec3 d, float r){
  float w = 1.0 + 3.0 * r;
  float y = d.y;
  float cg = uCard;
  vec3 top = vec3(0.90, 0.895, 0.97), hor = vec3(1.0, 0.975, 0.965);
  // 下半球：冷一点的紫灰（nexus 是 (0.78,0.745,0.80)，偏暖）
  vec3 low = mix(vec3(0.78, 0.745, 0.80), vec3(0.735, 0.745, 0.845), uCoolLow);
  top = mix(top, vec3(0.94, 0.90, 0.95), uDream);
  vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.65 * w, y)) : mix(hor, low, smoothstep(0.0, 0.5 * w, -y));
  c += vec3(0.12, 0.10, 0.09) * exp(-pow(y / (0.06 * w), 2.0));
  c *= mix(1.0, 0.92, smoothstep(0.15, 0.95, d.z));
  float k = 1.0 - r * 0.6;
  c *= 1.0 - 0.30 * cg * k * smoothstep(1.0 - 0.20 * w, 0.97, dot(d, normalize(vec3(-0.95, 0.05, -0.30))));
  c *= 1.0 - 0.15 * cg * k * smoothstep(1.0 - 0.25 * w, 0.97, dot(d, normalize(vec3(0.85, -0.25, 0.45))));
  float key = smoothstep(1.0 - 0.10 * w, 0.975, dot(d, normalize(vec3(-0.50, 0.70, 0.50))));
  c += vec3(1.0, 0.99, 0.97) * 0.75 * k * key;
  c += vec3(1.0, 0.94, 0.96) * 0.30 * k * smoothstep(1.0 - 0.07 * w, 0.99, dot(d, normalize(vec3(0.75, 0.25, -0.60))));
  /* 冷环：一道很宽、很淡的薄暮。它要盖住的正是这颗星**出射方向最密集的那一圈** ——
     实测出射光线的 y 中位数 0.02、z 中位数 −0.95，也就是说绝大多数折射出来的光
     都打向「后方地平带」，而那里原本是最暖、最亮的 (1.03, 0.99, 0.97)。
     这就是第一轮 B−R 只有 +3、且整体贴顶的根子：出射色几乎全是那条暖亮带。
     这里把它压暗一点、推冷一点 —— 只动色相与一点点明度，不加任何新的光源。 */
  float ring = smoothstep(0.85, 0.0, abs(y - 0.02)) * (0.35 + 0.65 * smoothstep(0.3, -0.9, d.z));
  c = mix(c, c * uRingTint, ring * uCool);
  /* 暗尾的冷：参考那颗晶体的暗部是**浅紫灰**，不是暖灰。这一项只乘在已经很暗的方向上
     （c 的亮度 < 0.8 的那些），所以它把 P5 那一端推冷、推深，几乎不碰中间与亮部。 */
  float dark = (1.0 - smoothstep(0.62, 0.92, dot(c, vec3(0.2126, 0.7152, 0.0722))));
  c = mix(c, c * vec3(0.880, 0.930, 1.120), dark * uCoolDark);
  return c;
}

bool inPiece(vec3 p, int k){
  int off = uOff[k], cnt = uCnt[k];
  for (int i = 0; i < MAXF; i++){
    if (i >= cnt) break;
    vec4 pl = uPl[off + i];
    if (dot(pl.xyz, p) > pl.w + 1e-5) return false;
  }
  return true;
}
bool inAny(vec3 p){
  for (int k = 0; k < MAXP; k++){
    if (k >= uNP) break;
    if (inPiece(p, k)) return true;
  }
  return false;
}

/* 入口：每块做半空间裁剪得 [t0,t1]，取所有块里最早的 t0。
   dn > 0 表示 n·p 沿射线增大 —— 从内穿到外，是出射；dn < 0 才是进入。 */
float entryT(vec3 ro, vec3 rd, out vec3 nIn, out int kIn){
  float best = 1e9; nIn = vec3(0.0, 0.0, 1.0); kIn = -1;
  for (int k = 0; k < MAXP; k++){
    if (k >= uNP) break;
    int off = uOff[k], cnt = uCnt[k];
    float t0 = -1e9, t1 = 1e9; vec3 n0 = vec3(0.0, 0.0, 1.0);
    for (int i = 0; i < MAXF; i++){
      if (i >= cnt) break;
      vec4 pl = uPl[off + i];
      float dn = dot(pl.xyz, rd);
      float num = pl.w - dot(pl.xyz, ro);
      if (dn > 1e-7){ float t = num / dn; if (t < t1) t1 = t; }
      else if (dn < -1e-7){ float t = num / dn; if (t > t0){ t0 = t; n0 = pl.xyz; } }
    }
    if (t0 > t1 || t1 <= 1e-6) continue;
    if (t0 < best){ best = t0; nIn = n0; kIn = k; }
  }
  return best;
}

/* 面上一点到这一块最近的棱的距离（沿面量），nb = 那条棱另一侧的面法向 */
float edgeDist(vec3 p, vec3 n, int k, out vec3 nb){
  float best = 1e9; nb = n;
  int off = uOff[k], cnt = uCnt[k];
  for (int i = 0; i < MAXF; i++){
    if (i >= cnt) break;
    vec4 pl = uPl[off + i];
    float c = dot(pl.xyz, n);
    if (c > 0.9995) continue;
    float e = (pl.w - dot(pl.xyz, p)) / sqrt(max(1e-4, 1.0 - c * c));
    if (e < best){ best = e; nb = pl.xyz; }
  }
  return best;
}
/* 圆角棱：靠近棱时法线朝邻面弯过去。tb 一并带出来，棱上的高光按它加一道。
   uEdgeW 按支宽定（这一版支细，比 nexus 的 0.028 窄）。 */
vec3 roundN(vec3 p, vec3 n, int k, out float tb){
  vec3 nb;
  float e = edgeDist(p, n, k, nb);
  tb = 1.0 - smoothstep(0.0, uEdgeW, e);
  return normalize(mix(n, normalize(n + nb), tb * tb));
}

/* 光核：一条线段对一团高斯的贡献 × 线段长 */
float glowSeg(vec3 A, vec3 B){
  vec3 ab = B - A;
  float t = clamp(dot(uCoreC - A, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec3 q = A + ab * t - uCoreC;
  return exp(-dot(q, q) / 0.12) * length(ab);
}

/* 体内沿 T 从 p 出发最近的那张界面 */
float nextExit(vec3 p, vec3 T, out vec3 Ne, out int pid){
  float tm = 1e9; pid = -1; Ne = vec3(0.0, 0.0, 1.0);
  for (int k = 0; k < MAXP; k++){
    if (k >= uNP) break;
    if (!inPiece(p, k)) continue;
    int off = uOff[k], cnt = uCnt[k];
    for (int i = 0; i < MAXF; i++){
      if (i >= cnt) break;
      vec4 pl = uPl[off + i];
      float dn = dot(pl.xyz, T);
      if (dn > 1e-6){
        float t = (pl.w - dot(pl.xyz, p)) / dn;
        if (t < tm){ tm = t; Ne = pl.xyz; pid = k; }
      }
    }
  }
  return max(tm, 0.0);
}

/* 方向 → 屏幕 ndc（**底在有限距离上**）。
   第一轮把底当成无穷远：只按出射方向取纹理，于是星内那一段的取回点离入射点
   动辄 400–550px，等于把画面另一头的像素糊进来 —— 看着只是「变淡」，不是「错位」。
   真实的东西在后方 z = −uBack 处，射线 T 从出射点 Q 走到底面，落点按透视投影，
   于是偏移量 = (Q + T·t)/(z 到 −uBack) 与入射那条视线之差 —— 这才是能看出错位的量。 */
vec2 ndcHit(vec3 Q, vec3 T, float back){
  float t = (-back - Q.z) / min(T.z, -1e-3);   // 底面在视空间 z = −back；t 取正
  vec3 p = Q + T * t;
  return vec2(p.x / (back * uTan.x), p.y / (back * uTan.y));
}
/* 没打中星体的像素：底就在那里，直接按视线取 */
vec2 ndcDir(vec3 T){ return vec2(T.x / -T.z / uTan.x, T.y / -T.z / uTan.y); }

/* 底上的图样（那条线与那行字）透过星体看到的调制。
   偏移量来自「出射点 + 出射方向 × 到后方平面的距离」与「入射那条视线」在底上的落点之差。
   出射光线背朝观者时（体内全反射之后常见）淡出，否则会采到底面之外去拉出一片噪点。 */
vec3 featMod(vec3 Q, vec3 T){
  if (uFeat <= 0.0) return vec3(1.0);
  float w = smoothstep(0.02, 0.28, -T.z);
  vec3 c = texture(uBg, ndcHit(Q, T, uBack) * 0.5 + 0.5).rgb;
  /* mix 在 t > 1 时会外推（GLSL 如此），这里夹到 0…1：uFeat 只放大差异，不许反算出负色 */
  return mix(vec3(1.0), clamp(c / uBgAvg, 0.0, 2.0), clamp(w * uFeat, 0.0, 1.0));
}

/* 一道视线穿过这颗星的颜色。hit = 0 表示没打中。 */
vec3 shade(vec3 ro, vec3 rd, out float hit){
  hit = 0.0;
  vec3 nIn; int kIn;
  float t0 = entryT(ro, rd, nIn, kIn);
  if (kIn < 0 || t0 > 1e8) return vec3(0.0);
  hit = 1.0;
  /* 纯剪影（?set=shape 的第二行）：打过就填死一个颜色，不走材质。
     放在这里而不是另写一个着色器，是为了保证三列与主页面用的是同一份几何求交。 */
  if (uFlat > 0.5) return uFlatCol;

  vec3 I = rd, V = -rd;
  vec3 P = ro + rd * max(t0, 1e-5);

  float tbEdge = 0.0;
  vec3 Nb = roundN(P, nIn, kIn, tbEdge);
  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 refl = env(reflect(I, Nb), 0.0);

  float ior = uIor;
  vec3 T = refract(I, Nb, 1.0 / ior);
  if (dot(T, T) < 1e-8) T = reflect(I, Nb);

  float L = 0.0, g = 0.0, inner = 0.0;
  vec3 trans = vec3(0.0);
  bool done = false;
  /* 色散：出射时 R / B 各用 ior ∓ uDisp。第一轮是 nexus 原值 0.006，
     在这么细的支上只显出轮廓外一条 1px 彩边，像描边瑕疵 ——
     要的是棱线两侧与透过星体看到的后方线都带色，所以放大到 0.014。 */
  float disp = uDisp;
  vec3 Pp = P;

  for (int b = 0; b < 4; b++){
    vec3 Ne; int pid;
    float dt = nextExit(Pp, T, Ne, pid);
    if (pid < 0) break;
    vec3 Q = Pp + T * dt;
    L += dt;
    g += glowSeg(Pp, Q);
    if (b == 0){
      vec3 dummy;
      inner = exp(-pow(edgeDist(Q, Ne, pid, dummy) / 0.010, 2.0));
    }
    vec3 Qs = Q + T * 1e-4;
    if (inAny(Qs)){ Pp = Qs; continue; }   // 交叠面：仍在体内，不折射

    vec3 Tg = refract(T, -Ne, ior);
    if (dot(Tg, Tg) > 0.0){
      vec3 Tr = refract(T, -Ne, ior - disp);
      vec3 Tb = refract(T, -Ne, ior + disp);
      if (dot(Tr, Tr) == 0.0) Tr = Tg;
      if (dot(Tb, Tb) == 0.0) Tb = Tg;
      float Fe = 0.04 + 0.96 * pow(1.0 - clamp(dot(Ne, Tg), 0.0, 1.0), 5.0);
      trans = vec3(env(Tr, uRough).r, env(Tg, uRough).g, env(Tb, uRough).b) * (1.0 - Fe);
      /* 星体后面的那条线与那行字：三色各按自己的出射方向去采 → 断口上带一点色散。
         Q 是出射点本身（不是方向），底在有限距离上，于是偏移就是真视差。 */
      if (uFeat > 0.0) trans *= vec3(featMod(Q, Tr).r, featMod(Q, Tg).g, featMod(Q, Tb).b);
      done = true;
      break;
    }
    T = reflect(T, -Ne);
    Pp = Qs;
  }
  if (!done) trans = env(T, uRough) * 0.85;

  // 吸收：丁香色，梦里偏一点粉；光程越长越深
  vec3 kabs = mix(vec3(0.060, 0.064, 0.012), vec3(0.030, 0.058, 0.030), uDream);
  trans *= exp(-kabs * L) * 1.03;
  trans *= 1.0 - inner * 0.16;
  // 光核：沿光程积分后饱和，一团近白的微温
  float gc = 1.0 - exp(-g * uCore);
  vec3 glow = mix(vec3(1.0, 0.975, 0.955), vec3(1.0, 0.955, 0.965), uDream);
  trans = mix(trans, glow * 1.05, gc * uGlowMix);

  // 薄膜虹彩，只上在反射里
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + 1.8 * (1.0 - ndv)));
  refl *= mix(vec3(1.0), film, uIrid);
  vec3 col = mix(trans, refl, F);

  vec3 Lk = normalize(vec3(-0.50, 0.70, 0.50));
  float spec = pow(max(dot(Nb, normalize(Lk + V)), 0.0), 260.0);
  col += vec3(1.0) * spec * (0.9 + 0.6 * tbEdge); // 棱上的高光比面上更利（nexus 原式）
  return col;
}

void main(){
  int ss = uSS < 1 ? 1 : uSS;
  vec3 acc = vec3(0.0);
  float cov = 0.0;
  for (int j = 0; j < 2; j++){
    if (j >= ss) break;
    for (int i = 0; i < 2; i++){
      if (i >= ss) break;
      vec2 off = (vec2(float(i), float(j)) + 0.5) / float(ss) - 0.5;
      vec2 ndc = (gl_FragCoord.xy + off) / uRes * 2.0 - 1.0;
      vec3 rd = normalize(vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
      float hit;
      vec3 c = shade(uCam, rd, hit);
      if (hit > 0.5){ acc += c; cov += 1.0; }
    }
  }
  // 底只采一次（像素正中）：星体之外的字因此是原样、锐的，超采样只用来削星体的边
  vec2 cndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 bgc = texture(uBg, cndc * 0.5 + 0.5).rgb;
  float n = float(ss * ss);
  vec3 col = cov > 0.0 ? mix(bgc, acc / cov, cov / n) : bgc;
  o = vec4(col, 1.0);
}`;

/* ═══ 四、页面 ═══════════════════════════════════════════════ */

const N_STEPS = 16; // 整段轨迹离散成 16 格
const DWELL = 170; // 每格停留（ms）；16 × 170 ≈ 2.72s
/* 第四轮把这些与材质常量一起导出，形状对照页（shape.js）要用**同一份**着色器与
   同一个相机重搭三列 —— 不是另一套数，是同一个模块里的同一个字符串。 */
export { MAXP, MAXF, VS, FS, N_STEPS, DWELL };
export const CAM_Z = RENDER.camZ;
export const TAN = RENDER.tan;
const TEXT = '这行字在星体之后';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* rAF 计数：这一页自己一次都不调用 rAF（首帧同步画完，走格用 setTimeout）。
   把全局那一个包一层只是为了**观察**，不是为了证明 —— 实测触发一次，
   这个数从 830 涨到 967，而同一页面静止两秒两次截图逐字节相同。
   也就是说有页面之外的东西（浏览器自身的合成/帧调度、扩展、缓存的别的页面）
   也在调它。所以 `state().raf` 只是一个计数器，**不能**拿来当「静止」的证据；
   静止的证据是像素逐字节相同（见 notes.md）。 */
let rafCalls = 0;
if (typeof window !== 'undefined' && !window.__rafPatched) {
  const raw = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    rafCalls++;
    return raw(fn);
  };
  window.__rafPatched = true;
}

const readyP = (() => {
  let fire;
  const p = new Promise((r) => (fire = r));
  p._fire = fire;
  return p;
})();

/** 早期就挂上，调用方不必等模块转起来 */
const api = {
  ready: readyP,
  setTime: (u) => api._setTime(u),
  trigger: () => api._trigger(),
  rest: () => api._rest(),
  stats: null,
  /** 读数：当前姿态参数 u、是否在播、计时器数、以及一个**仅供参考**的全局 rAF 计数。
      raf 这个数会被页面之外的东西推高，不能当「静止」的证据 —— 见上面那段注释与 notes。 */
  state: () => ({ u: api._u, running: api._running === true, timers: api._timers, raf: rafCalls }),
};
if (typeof window !== 'undefined') window.__star = api;
api._setTime = () => {};
api._trigger = () => {};
api._rest = () => {};
api._u = 0;
api._running = false;
api._timers = 0;

if (typeof document !== 'undefined') boot().catch(fail);

/** 起不来就把话说在页面上（并把 ready 放行）—— 别让 ready 永远悬着 */
function fail(err) {
  const msg = String((err && err.message) || err);
  api.stats = api.stats || { faces: 0, tris: 0, blocks: 0, halfspaces: 0 };
  api.error = msg;
  const el = document.getElementById('stat');
  if (el) el.textContent = `起不来：${msg}`;
  const st = document.getElementById('stage');
  if (st) st.style.background = 'repeating-linear-gradient(45deg,#f0f3f6 0 8px,#e5ebf2 8px 16px)';
  console.error('[star-v2]', err);
  readyP._fire(api.stats);
}

async function boot() {
  const qs = new URLSearchParams(location.search);
  const sizeQ = +(qs.get('size') || 0);
  if (sizeQ > 0) document.documentElement.style.setProperty('--stage', `${Math.round(sizeQ)}px`);

  /* ?set=shape → 形状对照页（第四轮）。默认路径一个字不动。 */
  if (qs.get('set') === 'shape') {
    const { initShapeSheet } = await import('./shape.js');
    await initShapeSheet();
    return;
  }

  const THREE = await import('three');
  const dream = qs.get('dream') === '1' ? 1 : 0;
  const ssQ = +(qs.get('ss') || 0);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const freeze = qs.has('freeze');

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('c');
  const statEl = document.getElementById('stat');

  const blocks = buildBlocks();
  const faces = blocks.reduce((a, b) => a + b.length, 0);
  api.stats = {
    faces, // 全星 24 张晶面（三个凸块各 8 面；六支每支 4 面）
    tris: faces, // 每张面本身就是一个三角形
    blocks: blocks.length,
    halfspaces: faces,
    arms: SHAPE.arms,
    facesPerArm: SHAPE.facesPerArm,
    tip: SHAPE.tip,
    rootHalf: +SHAPE.rootHalf.toFixed(4),
    bbox: [2, 2, 2],
  };

  /* ── 渲染器 ──
     片元里写的就是帧缓冲里的数：底那一层是在 2D 画布上用同一批色号画的（canvas 存的是
     sRGB 编码的值，纹理按 NoColorSpace 采进来不做转换），所以这里既不做输出编码、
     也不让 ColorManagement 插手 —— 两边才对得上。 */
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.position.set(0, 0, CAM_Z);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const plArr = new Float32Array(MAXP * MAXF * 4);
  const offArr = new Int32Array(MAXP);
  const cntArr = new Int32Array(MAXP);
  const bgTex = new THREE.Texture();
  bgTex.minFilter = THREE.LinearFilter;
  bgTex.magFilter = THREE.LinearFilter;
  bgTex.generateMipmaps = false;
  bgTex.wrapS = THREE.ClampToEdgeWrapping;
  bgTex.wrapT = THREE.ClampToEdgeWrapping;

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const unhex = (s) => {
    let h = String(s).replace('#', '').trim();
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const BG = unhex(cssVar('--bg') || '#f0f3f6');
  const UMBER = cssVar('--umber') || '#4f4a66';

  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VS,
    fragmentShader: FS,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTan: { value: new THREE.Vector2(TAN, TAN) },
      uCam: { value: new THREE.Vector3(0, 0, CAM_Z) },
      uPl: { value: plArr },
      uOff: { value: offArr },
      uCnt: { value: cntArr },
      uNP: { value: blocks.length },
      uBg: { value: bgTex },
      uBgAvg: { value: new THREE.Vector3(BG[0] / 255, BG[1] / 255, BG[2] / 255) },
      uFeat: { value: RENDER.feat },
      uDream: { value: dream },
      uCore: { value: RENDER.core + 0.95 * dream },
      uCoreC: { value: new THREE.Vector3(0, 0.04, 0) },
      uRough: { value: RENDER.rough - 0.12 * dream },
      uEdgeW: { value: RENDER.edgeW },
      uIor: { value: RENDER.ior },
      uCard: { value: RENDER.card },
      uIrid: { value: RENDER.irid },
      uCool: { value: RENDER.cool },
      uRingTint: { value: new THREE.Vector3(...RENDER.ringTint) },
      uCoolDark: { value: RENDER.coolDark },
      uCoolLow: { value: RENDER.coolLow },
      uGlowMix: { value: RENDER.glowMix },
      uDisp: { value: RENDER.disp },
      uBack: { value: RENDER.back },
      uFlat: { value: 0 },
      uFlatCol: { value: new THREE.Vector3(0x2b / 255, 0x2f / 255, 0x36 / 255) },
      uSS: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  /* 星体后面那张底：一条横穿的细线 + 一行淡色字。
     画在同一尺寸的 2D 画布上当纹理。着色器按**出射光线打到底面上的落点**去采它：
     没打中星体的像素按入射视线直接取（所以星外是原样、锐的），打中的按折射后的
     落点取 —— 于是星内那几段被折弯、错位、被晶面切开，而「错开多少」是个真视差量。
     位置是从剪影量出来的：ndc_y ±0.28 那两条水平线会被晶面切成三段
     （−0.56…−0.24 / −0.14…0.15 / 0.24…0.56），所以细线在 +0.28、字在 −0.28。 */
  function makeBackdrop(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    g.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
    g.fillRect(0, 0, px, px);
    const at = (ndc) => px * (0.5 - ndc * 0.5); // ndc_y +0.16 → 画布 y 0.42·px
    // 细线（ndc_y +0.16）
    const y = at(0.28);
    const th = Math.max(1, px / 460);
    const grd = g.createLinearGradient(px * 0.03, 0, px * 0.97, 0);
    grd.addColorStop(0, 'rgba(154,134,196,0)');
    grd.addColorStop(0.13, 'rgba(154,134,196,0.46)');
    grd.addColorStop(0.87, 'rgba(154,134,196,0.46)');
    grd.addColorStop(1, 'rgba(154,134,196,0)');
    g.fillStyle = grd;
    g.fillRect(px * 0.03, y - th / 2, px * 0.94, th);
    // 一行字（ndc_y −0.16）：字距放宽，整行横跨过半幅 —— 单字小、错位才看得清
    const fs = Math.max(6.5, px * 0.04);
    g.font = `500 ${fs.toFixed(2)}px "Noto Serif SC", serif`;
    try {
      g.letterSpacing = `${(px * 0.02).toFixed(2)}px`;
    } catch {
      /* 老浏览器没有 canvas letterSpacing */
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = toRgba(UMBER, 0.58);
    g.fillText(TEXT, px * 0.5, at(-0.16));
    return cv;
  }
  function toRgba(hex, a) {
    const c = unhex(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    const css = Math.max(80, Math.round(Math.min(r.width, r.height) || 400));
    const dev = Math.max(120, Math.min(900, Math.round(css * Math.min(2, devicePixelRatio || 1))));
    if (canvas.width !== dev || canvas.height !== dev) {
      canvas.width = dev;
      canvas.height = dev;
      renderer.setSize(dev, dev, false);
      bgTex.image = makeBackdrop(dev);
      bgTex.needsUpdate = true;
    }
    mat.uniforms.uRes.value.set(dev, dev);
    // 超采样只在小画幅上开：960² 以上单采样的边已经比截图的一个像素细
    mat.uniforms.uSS.value = ssQ > 0 ? Math.min(2, ssQ) : dev <= 560 ? 2 : 1;
    return dev;
  }

  /* ── 画一帧 ── */
  let cur = blocksInView(blocks, poseAt(0));
  function draw(u) {
    const view = blocksInView(blocks, poseAt(u));
    let k = 0;
    let fi = 0;
    for (let i = 0; i < view.length; i++) {
      offArr[i] = fi;
      cntArr[i] = view[i].length;
      for (const f of view[i]) {
        plArr[k++] = f[0];
        plArr[k++] = f[1];
        plArr[k++] = f[2];
        plArr[k++] = f[3];
        fi++;
      }
    }
    cur = view;
    mat.uniforms.uOff.value = offArr;
    mat.uniforms.uCnt.value = cntArr;
    mat.uniforms.uPl.value = plArr;
    renderer.render(scene, camera);
  }

  /* ── 定格：走格，不插值、不加缓动 ──
     整段 16 格，每格 setTimeout 停 DWELL 再跳下一格；播完清定时器、不留 rAF。
     计时用累加式的间隔（锚在起播时刻），长时间睡死中途也不漂。 */
  let u = 0;
  let timer = 0;
  let running = false;
  let t0 = 0;
  let stepIdx = 0;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    running = false;
    api._running = false;
    api._timers = 0;
  };
  function tick() {
    timer = 0;
    api._timers = 0;
    stepIdx++;
    // 第 k 格是 u = k/16（k = 1…16）。u = 1 与 u = 0 逐位相同 —— 最后一格正是静止正位。
    u = stepIdx / N_STEPS;
    draw(u);
    if (stepIdx >= N_STEPS) {
      // 播完：参数摆回 0（姿态逐位相同），计时器归零，不跑 rAF
      u = 0;
      api._u = 0;
      running = false;
      api._running = false;
      return;
    }
    api._u = u;
    const at = t0 + stepIdx * DWELL;
    timer = setTimeout(tick, Math.max(0, at - performance.now()));
    api._timers = 1;
  }
  function go() {
    if (still || freeze || running) return; // 减少动效 / ?freeze：只留正位那一帧；播着的时候不重入
    stop();
    running = true;
    api._running = true;
    t0 = performance.now();
    stepIdx = 1;
    u = 1 / N_STEPS;
    api._u = u;
    draw(u);
    timer = setTimeout(tick, DWELL);
    api._timers = 1;
  }
  function setTime(v) {
    stop();
    u = clamp01(+v || 0);
    api._u = u;
    draw(u);
  }
  function rest() {
    stop();
    u = 0;
    api._u = 0;
    draw(0);
  }
  api._setTime = setTime;
  api._trigger = go;
  api._rest = rest;

  /* ── 点击星体 / 空格 ── */
  function hits(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, r.width);
    const tol = 6 * dpr; // 六个像素的容差：贴着支尖点也算
    for (const [ox, oy] of [
      [0, 0],
      [tol, 0],
      [-tol, 0],
      [0, tol],
      [0, -tol],
      [tol * 0.7, tol * 0.7],
      [-tol * 0.7, tol * 0.7],
      [tol * 0.7, -tol * 0.7],
      [-tol * 0.7, -tol * 0.7],
    ]) {
      const px = (cx - r.left) * dpr + ox;
      const py = (cy - r.top) * dpr + oy;
      const nx = (px / canvas.width) * 2 - 1;
      const ny = 1 - (py / canvas.height) * 2;
      const d = norm3([nx * TAN, ny * TAN, -1]);
      if (rayHits(cur, [0, 0, CAM_Z], d)) return true;
    }
    return false;
  }
  stage.addEventListener('click', (e) => {
    if (hits(e.clientX, e.clientY)) go();
  });
  addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return;
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    go();
  });

  /* ── 起首帧 ── */
  try {
    await document.fonts.ready;
    await document.fonts.load(`500 20px "Noto Serif SC"`, TEXT);
  } catch {
    /* 取不到字体就用兜底衬线 */
  }
  resize();
  new ResizeObserver(() => {
    resize();
    draw(u);
  }).observe(stage);
  draw(0);
  if (statEl) {
    const s = api.stats;
    statEl.textContent =
      `faces ${s.faces} · tris ${s.tris} · blocks ${s.blocks} · halfspaces ${s.halfspaces}` +
      ` · 六尖 r = ${s.tip.toFixed(3)} · 根部半宽 ${s.rootHalf}` +
      (still ? ' · 减少动效：直接落定' : '');
  }
  /* 首帧已经画完（draw 与 renderer.render 都是同步的），这里不留任何 rAF：
     本页自己一次都不调 rAF，触发那一段也只用 setTimeout 走格。
     注意：`state().raf` 是**全局** requestAnimationFrame 的调用数，页面之外的东西
     也会推它，所以它不能证明「静止」。静止的证据是像素逐字节相同 —— 见 notes.md。 */
  readyP._fire(api.stats);
}