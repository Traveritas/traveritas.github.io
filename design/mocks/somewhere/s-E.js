/* ─────────────────────────────────────────────────────────────
  E · 一处室内

  这间屋子不是摆在流光上的一个 3D 盒子，是从流光里**圈出来**的一间：
  底下那一片（正式站那支着色器）本来就在流动，房间只是替它画上一个界——
  墙把光挡掉一部分、留一部分漏过去，于是屋里的光仍然在动，仍然是同一个场。

  所以这一层（2D 画布）只用四种东西：
    1. 带透明度的暗面。像磨砂树脂：压住光，但不遮死光。透明度都在 0.25–0.55 之间，
       剩下的那一半永远是底下流过来的光——房间的墙面纹理就是那支着色器的抖动，
       不是另画一层贴图。这是「它还是那个流光场，只是被围起来了」的全部秘密。
    2. 加法混合的几处亮。屋里只有一个光源：后墙脚漏出来的那一道。
       其余几处亮（墙角折线、长台前沿、地上一根线的尽头）都是这道光的回声。
    3. 三件极简的构件：贴后墙的长台 / 左墙高处一块搁板 / 地上一根线。
       它们不是装饰，是三个「以后可以往上放东西」的平面——这一轮不做交互，
       但要让看的人一眼知道东西会长在哪、能长多少。
    4. 一层很淡的压暗，把视线留在屋子中间那一小片光上。

  ══ 为什么屋子要斜 14°（YAW）══
  正对着的盒子，两侧墙等速后退，读起来就是一条走廊（那是 C 的方向）。
  斜一点，眼睛立刻认得出「我站在屋里，看着一个角」——左右两侧不等距，
  后墙在画面里成一个梯形，屋子才有了一个「朝向」。
  角度取整站的 14°，和检索页那两条缝同一个角：这间屋子是同一个世界转过来的。

  ══ 为什么眼位低、后墙脚卡在地平线上 ══
  地面占屏幕一半以上、天花板从上面压下来，体量才像「一间」而不是「一块背景」。
  后墙脚的高度是**反推**的：屏幕 y = 0.5 + (FLOOR_Y − eyeY)/FAR_Z，要它等于 0.58，
  于是 FLOOR_Y = eyeY + 0.08·FAR_Z。这与屋子多大无关——换屋子大小，墙脚还是落在地平线上。
  于是转场结束落在 0.58 的那条光带，接着就成了墙角漏出来的那道光：
  两段是同一根线，不是两件事拼在一起。

  ══ 为什么眼位偏左（eyeLX）══
  站在中轴上，后墙左右对称，一眼就是「一个盒子」。
  偏左站，左边墙角贴脸、右边墙角很远——「我在屋里」这句话是靠投影说出来的，不是靠文案。
  ───────────────────────────────────────────────────────────── */
import { initWorld, options, clamp, lerp, ease } from './shell.js';

const opt = options();
/* 关了动效，屋子就不自己呼吸、尘也不飘；底下那片光照旧在流——那是底子的事，这一层不替它决定 */
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ 一、这一片光：同一族紫灰，亮部极少 ══
   天、地平线一带、地，三段色相差别不超过 15°，明度一档压一档——
   只有地平线那一带留一点暖芯，屋里唯一的那个光源就在那里。 */
const themes = {
  sky: [[0.062, 0.058, 0.104], [0.132, 0.124, 0.198], [0.255, 0.236, 0.335], [0.58, 0.55, 0.68]],
  band: [[0.06, 0.055, 0.088], [0.145, 0.122, 0.178], [0.3, 0.24, 0.32], [0.86, 0.75, 0.72]],
  /* 地：比天亮一档。这间屋子的光从墙脚漏进来、落在地上，
     所以「地」这一段是全屏最亮的一片可以踩的东西；也让脚边那截透过来的光看得见。 */
  ground: [[0.058, 0.062, 0.088], [0.132, 0.138, 0.184], [0.24, 0.26, 0.315], [0.5, 0.54, 0.6]],
};

const world = initWorld({
  canvas: document.getElementById('light'),
  themes,
  /* 抖动弱一点、亮芯压低：屋里的光不该满屏都是亮点 */
  grain: [
    [0.78, 0.16, 22],
    [0.88, 0.24, 20],
    [0.76, 0.1, 16],
  ],
  horizon: 0.58,
  autoArrive: opt.autoArrive,
  face: opt.face,
  px: opt.px,
  wind: false, // 那阵风是随笔区的；屋里没有风
});

/* ══ 二、屋子的度量（单位 = 一个视口高，与 world.project 同一套） ══ */
/* 转 14°：与检索页那两条缝同一个角。宽屏上用满 14°——
   斜着看，后墙在画面里成梯形，左右两侧不等距，「我站在屋里看着一个角」这个意思才成立。
   窄屏（竖屏）上收小到 6°：屏幕本来就只剩一面墙宽，再斜 14° 后墙会整个偏出画外。
   角度是一间屋子的「朝向」，取景变了朝向跟着变，比硬把屋子塞进画框自然。 */
let yaw = (14 * Math.PI) / 180;
let COS = Math.cos(yaw);
let SIN = Math.sin(yaw);
const ZPIVOT = 1.35; // 绕这根竖轴转，屋子不会整体偏出画面

const EYE_Y = 0.3; // 眼位高度（低：地占得多，天花板压下来）
let eyeLX = -0.8; // 偏左站：左边墙角贴脸、右边墙角很远（见文件头）。窄屏时收到居中，见 measure
const RH = 1.7; // 净高。1.7 个视口高 = 后墙上沿刚好顶到画面上沿附近，
// 于是这间屋子在画面里是「满的」——不是一块贴在黑暗里的板。

let RW = 3.4; // 屋宽（按视口宽高比重算，见 measure）
let FAR_Z = 2.8; // 后墙多远
let EYE_LZ = -1.0; // 站在离后墙多远的地方（跟着屋子深浅一起定，见 measure）
const BACK_DIST = 3.8; // 始终站在离后墙这么远：屋子深浅变了，看进去的角度不变
let FLOOR_Y = EYE_Y + 0.08 * FAR_Z; // 地面：后墙脚正好落在地平线上（见文件头）
let CEIL_Y = FLOOR_Y - RH; // 顶
let X0 = 0,
  X1 = 0;

/* 屋子局部 → 世界（绕竖轴转 yaw） */
function toWorld(x, z) {
  const dz = z - ZPIVOT;
  return [x * COS - dz * SIN, ZPIVOT + x * SIN + dz * COS];
}
/* 世界 → 屋子局部（夹相机时用） */
function toLocal(x, z) {
  const dz = z - ZPIVOT;
  return [x * COS + dz * SIN, ZPIVOT - x * SIN + dz * COS];
}
/* 屋子局部 → 屏幕 CSS px */
function P(x, y, z) {
  const [wx, wz] = toWorld(x, z);
  return world.project(wx, y, wz);
}
/* 把一段局部 z 夹到相机前面：投影在 d→0 附近会炸，任何时候都不许越过这条线 */
const NEAR = 0.4;
const zNear = (lzCam, z) => Math.max(z, lzCam + NEAR);

/* 屋子按屏幕比例量一次：竖屏（手机）窄一点、深一点，于是两侧墙贴住画面边缘——
   手机上是「被围住」，横屏上才看得见墙角。后墙脚永远落在地平线上，与深度无关。 */
function measure() {
  const a = world.vw / world.vh;
  const wide = clamp((a - 0.5) / 1.1, 0, 1);
  const narrow = 1 - wide;
  /* 朝向：宽屏用满 14°，窄屏收到 6°（见文件头） */
  yaw = lerp((6 * Math.PI) / 180, (14 * Math.PI) / 180, wide);
  COS = Math.cos(yaw);
  SIN = Math.sin(yaw);
  /* 屋宽跟着视口的水平视场走，不按「宽屏 / 窄屏」分两档——
     投影把一切乘上视口高，所以窄屏的水平视场只有一个视口高的 0.46 倍：
     横屏里刚好装下一间三米多的屋子，竖屏里连一半都装不下。
     按宽高比自己推：竖屏收窄到 1.6，横屏放到 3.6。 */
  RW = clamp(a * 2.1 + 0.28, 1.6, 3.6);
  FAR_Z = lerp(3.2, 2.85, wide);
  /* 竖屏要退得远一点、站得居中一点：窄屏本来就只剩一面墙，再偏左连字都切在画外。 */
  EYE_LZ = FAR_Z - (BACK_DIST + narrow * 0.55);
  eyeLX = lerp(-0.3, -0.78, clamp((a - 0.62) / 0.9, 0, 1));
  X0 = -RW / 2;
  X1 = RW / 2;
  FLOOR_Y = EYE_Y + 0.08 * FAR_Z;
  CEIL_Y = FLOOR_Y - RH;
  /* 换视口（转手机 / 拉窗口）时屋子会重新量，屋子一变，人站的位置也得跟着挪——
     不然转一下屏，人就贴着新墙站或者站到墙外去了。
     这里把相机放回「新屋子里的默认眼位」，跟进场时同一个位置。 */
  if (placed) {
    const [wx, wz] = toWorld(eyeLX, EYE_LZ);
    world.cam.x = wx;
    world.cam.z = wz;
    world.cam.vx = world.cam.vy = 0;
  }
}
let placed = false;

/* ══ 三、相机关在屋里 ══
   shell.js 的拖拽直接改 cam.x / cam.y，不设边界。这里每帧收一次：
   撞墙就停，连速度一起清掉（不然会贴着墙抖）。
   夹在**屋子自己的坐标**里，转了 14° 也照样对得上。
   拖拽本身不拦：拖动是屏幕方向的平移，本来就是对的；
   只有「往前/往后」这件事得沿屋子自己的轴走，所以滚轮与 +/- 自己接管。 */
const WALK = 0.34;
/* 往前最多走到「离后墙 BACK_DIST 的一半」——不许更近。
   试过让它一直推到底：再往前一步，后墙就撑满整个画面，
   长台、搁板、墙角全部出画，屋里又只剩一片光，屋子白建了。
   停在半途，走到最深时后墙仍占画面大半、长台还横在眼前：这才是「往里走了一截」。 */
const zMin = () => Math.min(EYE_LZ - 0.5, 0);
const zMax = () => FAR_Z - BACK_DIST * 0.52;

function holdCam() {
  const cam = world.cam;
  const [lx0, lz0] = toLocal(cam.x, cam.z);
  const lx = clamp(lx0, X0 + WALK, X1 - WALK);
  const lz = clamp(lz0, zMin(), zMax());
  const ly = clamp(cam.y, CEIL_Y + 0.68, FLOOR_Y - 0.34);
  if (lx !== lx0 || lz !== lz0) {
    const [wx, wz] = toWorld(lx, lz);
    cam.x = wx;
    cam.z = wz;
    cam.vx = cam.vy = 0;
  }
  if (ly !== cam.y) {
    cam.y = ly;
    cam.vy = 0;
  }
  return lz;
}

/* 沿屋子自己的轴前进/后退（滚轮一格 ≈ 十六分之一间屋子）。 */
function stepForward(dz) {
  const [lx, lz] = toLocal(world.cam.x, world.cam.z);
  const [wx, wz] = toWorld(lx, clamp(lz + dz, zMin(), zMax()));
  world.cam.x = wx;
  world.cam.z = wz;
  if (help) help.style.opacity = '0';
}

/* ══ 四、滚轮与按键 ══
   shell.js 给的是全站漫游的增益，对一间只有三米多的屋子太钝：一格滚轮只挪 0.04 个单位。
   所以转场结束以后自己接管——捕获阶段先一步拿到事件，停掉 shell 那一个。
   转场期间不接管：那一下「往下」要交给 shell 起转。 */
let takenInput = false;
addEventListener(
  'wheel',
  (e) => {
    if (!takenInput) return; // 还在转场：让 shell 自己处理
    e.preventDefault();
    e.stopImmediatePropagation();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32; // 按行滚的浏览器
    /* 往下滚 = 走进屋里（跟 shell 一样的方向约定：scroll down 是往里走）；
       增益：一格滚轮 ≈ 屋子进深的 1/12。走进去要「几步就到后墙」，
       而不是像 shell 默认那样滚五十下才挪一点。 */
    stepForward(dy * 0.0042);
  },
  { passive: false, capture: true },
);
addEventListener(
  'keydown',
  (e) => {
    if (!takenInput) return;
    if (e.key === '+' || e.key === '=' || e.key === 'PageDown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      stepForward(0.16);
    } else if (e.key === '-' || e.key === '_' || e.key === 'PageUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      stepForward(-0.16);
    }
  },
  { capture: true },
);

/* ══ 五、房间那层画布 ══
   1/2 分辨率再像素放大：一条边落在屏幕上是 2px 的方步，而底下流光是 5px 一格。
   屋子比光「密」一档——这层比那层更像实体，但又明显是同一支笔画的，
   于是墙和光既不是两种语言，也不会被认成同一张网点。 */
const RS = 2;
const canvas = document.getElementById('room');
const ctx = canvas.getContext('2d');
const lineMain = document.getElementById('line-main');
const help = document.getElementById('help');

let cw = 1,
  ch = 1;
function fitCanvas(vw, vh) {
  cw = Math.max(1, Math.ceil(vw / RS));
  ch = Math.max(1, Math.ceil(vh / RS));
  canvas.width = cw;
  canvas.height = ch;
}

const q = (p) => ({ x: p.x / RS, y: p.y / RS });

function poly(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/* 一条面：先压暗，再按「离光的方向」给一层渐变。
   平板一块的死黑会立刻变成 3D demo；有一点从暗到稍亮的洗染，才像被光照着的墙。 */
function veil(pts, rgb, alpha, from, to) {
  if (alpha <= 0.004) return;
  poly(pts);
  if (from && to && (Math.abs(from.x - to.x) > 1 || Math.abs(from.y - to.y) > 1)) {
    const g = ctx.createLinearGradient(from.x / RS, from.y / RS, to.x / RS, to.y / RS);
    g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},${(alpha * 0.42).toFixed(3)})`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
  }
  ctx.fill();
}

/* 一条加法混合的渐变带：不给边框，只给一层光 */
function glowPoly(pts, a, b, stops) {
  poly(pts);
  ctx.save();
  ctx.clip();
  /* 渐变轴短到不足一个像素时浏览器会当纯色处理，这里垫一个最小值 */
  let dx = (b.x - a.x) / RS;
  let dy = (b.y - a.y) / RS;
  if (Math.abs(dx) + Math.abs(dy) < 2) dx = 2;
  const g = ctx.createLinearGradient(a.x / RS, a.y / RS, a.x / RS + dx, a.y / RS + dy);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

function glowLine(a, b, width, stops) {
  const dx = (b.x - a.x) / RS;
  const dy = (b.y - a.y) / RS;
  const g = ctx.createLinearGradient(a.x / RS, a.y / RS, a.x / RS + (Math.abs(dx) + Math.abs(dy) < 2 ? 2 : dx), a.y / RS + dy);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.strokeStyle = g;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x / RS, a.y / RS);
  ctx.lineTo(b.x / RS, b.y / RS);
  ctx.stroke();
}

/* 一团柔和的加法亮斑：只用来做「不是灯的灯」和光晕 */
function glowSpot(c, r, rgb, a) {
  if (r < 1 || a <= 0.004) return;
  const g = ctx.createRadialGradient(c.x / RS, c.y / RS, 0, c.x / RS, c.y / RS, r / RS);
  g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x / RS, c.y / RS, r / RS, 0, Math.PI * 2);
  ctx.fill();
}

/* ══ 六、尘 ══
   二十几点，落在屋子自己的坐标里，于是它们跟着相机错位——屋里的深度有一半是它们给的。
   一次循环画完，不是二十几个 DOM。 */
const dust = [];
{
  let s = 17;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 24; i++) dust.push({ x: r(), y: r(), z: r(), ph: r() * 6.283, sp: 0.4 + r() * 0.9, br: 0.07 + r() * 0.12 });
}

/* ══ 七、每帧 ══ */
world.onFrame((st) => {
  const vw = st.vw;
  const vh = st.vh;
  if (canvas.width !== Math.max(1, Math.ceil(vw / RS)) || canvas.height !== Math.max(1, Math.ceil(vh / RS))) {
    fitCanvas(vw, vh);
    measure();
  }
  takenInput = st.arrive > 0.5;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, cw, ch);

  /* 转场之前这里什么都不画：那三栏还是检索的样子 */
  if (st.arrive <= 0.004) {
    if (lineMain) lineMain.style.opacity = '0';
    return;
  }
  draw(st, holdCam());
});

/* 屋子不是淡进来，是「从远处合拢」：
   后墙先落定，两侧墙朝你伸过来，地跟顶最后一路铺到你脚下。
   于是转场结束的那一刻，正好是屋子把你关进去的那一刻。 */
const A = (arr, d) => ease(clamp((arr - d) / (1 - d), 0, 1));

function draw(st, lzCam) {
  const vh = st.vh;
  const arr = st.arrive;
  if (arr <= 0.004) return;
  const aFar = A(arr, 0.02);
  const aSide = A(arr, 0.2);
  const aGeo = A(arr, 0.4);

  /* 近处那一刀：沿屋子自己的 z、在相机前面 NEAR 处切。
     必须跟相机同一套坐标——屋子绕竖轴转过 14°，世界的 cam.z 差着一次旋转。
     转场时这一刀从远处收回来，就是「地一路铺到脚边」那一下。 */
  const znGeo = Math.min(FAR_Z, zNear(lzCam, lerp(FAR_Z, lzCam + NEAR, aGeo)));

  /* 后墙四个角 / 侧墙近边四个角 */
  const fTL = P(X0, CEIL_Y, FAR_Z);
  const fTR = P(X1, CEIL_Y, FAR_Z);
  const fBL = P(X0, FLOOR_Y, FAR_Z);
  const fBR = P(X1, FLOOR_Y, FAR_Z);
  const nTL = P(X0, CEIL_Y, znGeo);
  const nTR = P(X1, CEIL_Y, znGeo);
  const nBL = P(X0, FLOOR_Y, znGeo);
  const nBR = P(X1, FLOOR_Y, znGeo);

  /* ══ 面 ══
     明度顺序就是光的顺序：后墙（被墙脚那道光照着）最亮，左墙次之，
     地再压一档，右墙最暗，顶最暗——顶与右墙离光源最远。
     这几个差必须拉得开：五个面若都在同一个黑上，屋子就只是一块贴上去的暗。

     地是唯一用了 destination-out 的一处：靠你脚边那一段，地压下去，
     底下的流光透出来。这不是「一块反光的地板」——是这块地薄到你几乎看得见下面那片光。
     屋子越是往你这边，越薄；四角那圈仍然实。这是「被围起来的流光，不是凭空造的房间」。 */
  veil([q(fTL), q(fTR), q(fBR), q(fBL)], '22,20,33', 0.2 * aFar, q(fTL), q(fBL)); // 后墙
  if (aSide > 0.004) veil([q(fTL), q(nTL), q(nBL), q(fBL)], '18,16,28', 0.32 * aSide, q(nTL), q(nBL)); // 左墙
  if (aSide > 0.004) veil([q(fTR), q(nTR), q(nBR), q(fBR)], '9,8,15', 0.6 * aSide, q(nTR), q(nBR)); // 右墙
  if (aGeo > 0.004) {
    veil([q(fBL), q(fBR), q(nBR), q(nBL)], '24,22,35', 0.44 * aGeo, q(fBL), q(nBL));
    /* 靠脚边那一段地：擦掉暗面，让流光自己当反光 */
    const midZ = lerp(FAR_Z, znGeo, 0.45);
    const mL = P(X0 + 0.05, FLOOR_Y, midZ);
    const mR = P(X1 - 0.05, FLOOR_Y, midZ);
    const fL = P(X0, FLOOR_Y, znGeo);
    const fR = P(X1, FLOOR_Y, znGeo);
    ctx.save();
    poly([q(mL), q(mR), q(fR), q(fL)]);
    ctx.clip();
    ctx.globalCompositeOperation = 'destination-out';
    /* 从后墙往脚边走：一点点越来越薄 */
    const gg = ctx.createLinearGradient(0, (mL.y + mR.y) / 2 / RS, 0, (fL.y + fR.y) / 2 / RS);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.45, 'rgba(0,0,0,0.3)');
    gg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (aGeo > 0.004) veil([q(fTL), q(fTR), q(nTR), q(nTL)], '7,6,12', 0.66 * aGeo, q(nTL), q(fTL)); // 顶：最暗

  /* ══ 屋子「薄」的那一处 ══
     后墙偏右有一块地方，墙没有立住：把这一块的暗面擦掉（destination-out），
     底下那片流光原样漏进来。它不是画在墙上的一个亮块——**它就是墙缺了一块**，
     所以它会跟着光一起动，会是这一整间屋子里唯一「活」的面。
     没有边、没有框：用一团放射状的擦除，边缘化到零，于是它只是「这里更薄」，
     而不是「这里贴了一张纸」。 */
  const paneA = aFar * A(arr, 0.6);
  if (paneA > 0.01) {
    const cc = P(X1 - 0.78, FLOOR_Y - 1.0, FAR_Z);
    const rr = Math.max(52, cc.s * vh * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    /* 两团错开一点，叠出一个略微偏斜的椭圆——一块斑，不是一块窗 */
    for (const [ox, oy, k, a] of [
      [0, 0, 1, 0.9],
      [rr * 0.22, -rr * 0.16, 0.66, 0.5],
    ]) {
      const g = ctx.createRadialGradient(
        (cc.x + ox) / RS,
        (cc.y + oy) / RS,
        0,
        (cc.x + ox) / RS,
        (cc.y + oy) / RS,
        (rr * k) / RS,
      );
      g.addColorStop(0, `rgba(0,0,0,${(a * paneA).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(0,0,0,${(a * 0.72 * paneA).toFixed(3)})`);
      g.addColorStop(0.72, `rgba(0,0,0,${(a * 0.24 * paneA).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc((cc.x + ox) / RS, (cc.y + oy) / RS, (rr * k) / RS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    /* 薄处上沿接住一线光：一截不完整的亮边，说明这里有一层东西，但没有框住它 */
    ctx.globalCompositeOperation = 'lighter';
    const ea = P(X1 - 1.24, FLOOR_Y - 1.34, FAR_Z);
    const eb = P(X1 - 0.42, FLOOR_Y - 1.38, FAR_Z);
    glowLine(ea, eb, 1, [
      [0, 'rgba(206,194,212,0)'],
      [0.42, `rgba(216,204,222,${(0.5 * paneA).toFixed(3)})`],
      [1, 'rgba(206,194,212,0)'],
    ]);
    /* 薄处自己也接一层极淡的抬亮：光从墙外透进来，落在这块薄的地方 */
    glowSpot(cc, rr * 0.9, '198,186,206', 0.09 * paneA);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ══ 构件 ══
     屋子要「空但不像没做完」，靠的是几个已经在那儿、正等着被放东西的平面。 */
  const aFix = A(arr, 0.55);

  /* ① 贴后墙的长台。台面就是以后放东西的第一处位置（一排小东西摆上去正合适）。
        它挡光——所以正面比地更压一点；台面朝上，接得住墙脚那道光。 */
  if (aFix > 0.004) {
    const lxA = X0 + 0.3;
    const lxB = X0 + RW * 0.46;
    const LD = 0.48;
    const yT = FLOOR_Y - 0.17;
    const pA = P(lxA, yT, FAR_Z);
    const pB = P(lxB, yT, FAR_Z);
    const pC = P(lxB, yT, FAR_Z - LD);
    const pD = P(lxA, yT, FAR_Z - LD);
    const qA = P(lxA, FLOOR_Y, FAR_Z - LD);
    const qB = P(lxB, FLOOR_Y, FAR_Z - LD);
    veil([q(pD), q(pC), q(qB), q(qA)], '9,8,15', 0.52 * aFix); // 正面
    veil([q(pD), q(qA), q(pA)], '8,8,14', 0.46 * aFix); // 左端面（透视里只剩一角）
    veil([q(pA), q(pB), q(pC), q(pD)], '26,23,36', 0.2 * aFix); // 台面：朝上，亮一档
    ctx.globalCompositeOperation = 'lighter';
    glowLine(pD, pC, 1.4, [
      [0, 'rgba(206,186,178,0)'],
      [0.22, `rgba(210,190,182,${(0.4 * aFix).toFixed(3)})`],
      [0.8, `rgba(214,194,186,${(0.52 * aFix).toFixed(3)})`],
      [1, 'rgba(206,186,178,0)'],
    ]);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ② 左墙高处一块搁板：朝纵深退，是屋里最直接的「深度尺」，
        也是以后可以往上排东西的第二处位置。 */
  /* ② 后墙右侧一块搁板：它贴着后墙、朝你伸出来一点。
        为什么不做成从左墙伸出来的长条——试过，它会被挤到画面左上角外面，
        只剩一块悬空的斜片。贴着后墙、在视线高度偏上的位置，
        它才读得出「墙上有东西、而且它有厚度」，也不会被侧墙的进深吃掉。
        这是以后可以往上排东西的第二处位置。 */
  if (aFix > 0.004) {
    const sx = X1 - 0.34;
    const sy = FLOOR_Y - 0.74;
    const zA = FAR_Z;
    const zB = FAR_Z - 0.42;
    const out = X1 - 1.36;
    const e0 = P(sx, sy, zA);
    const e1 = P(out, sy, zA);
    const e2 = P(out, sy, zB);
    const e3 = P(sx, sy, zB);
    const d0 = P(sx, sy + 0.055, zA);
    const d1 = P(out, sy + 0.055, zA);
    veil([q(e0), q(e1), q(e2), q(e3)], '34,31,48', 0.44 * aFix); // 板面：朝上，最亮的一块平
    veil([q(e1), q(e2), q(d1), q(d0)], '6,5,11', 0.6 * aFix); // 板的前沿侧面：给厚度
    ctx.globalCompositeOperation = 'lighter';
    /* 前沿一道，最清楚 */
    glowLine(e1, e2, 1.4, [
      [0, `rgba(220,212,244,${(0.62 * aFix).toFixed(3)})`],
      [1, `rgba(196,188,226,${(0.3 * aFix).toFixed(3)})`],
    ]);
    /* 贴墙那条缝也亮一线：板与墙之间总有那么一道 */
    glowLine(e0, e3, 1, [
      [0, `rgba(200,192,228,${(0.24 * aFix).toFixed(3)})`],
      [1, 'rgba(200,192,228,0)'],
    ]);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ══ 光：加法混合 ══ */
  ctx.globalCompositeOperation = 'lighter';

  /* 后墙脚那一带光——整间屋子的光源。
     它不是新长出来的一片亮：转场落下来的那条地平线就在这里，是同一条光换了个解释。
     上下各让半截、左右收到墙以内，于是它是从墙脚溢出来，不是贴在墙上的一条线。 */
  const bandHi = P(X0, FLOOR_Y - 0.2, FAR_Z);
  const bandLo = P(X0, FLOOR_Y + 0.16, FAR_Z);
  glowPoly(
    [q(P(X0, FLOOR_Y - 0.2, FAR_Z)), q(P(X1, FLOOR_Y - 0.2, FAR_Z)), q(P(X1, FLOOR_Y + 0.16, FAR_Z)), q(P(X0, FLOOR_Y + 0.16, FAR_Z))],
    bandHi,
    bandLo,
    [
      [0, 'rgba(150,140,160,0)'],
      [0.26, 'rgba(200,178,172,0.13)'],
      [0.46, 'rgba(228,202,190,0.3)'],
      [0.68, 'rgba(200,178,172,0.11)'],
      [1, 'rgba(150,140,160,0)'],
    ],
  );
  /* 这道光往地上摊出去一点：光是从墙脚漏的，地上近处该接得住 */
  glowPoly(
    [q(fBL), q(fBR), q(nBR), q(nBL)],
    q(P(X0 + RW * 0.5, FLOOR_Y, FAR_Z)),
    q(P(X0 + RW * 0.5, FLOOR_Y, FAR_Z - 1.5)),
    [
      [0, 'rgba(206,186,180,0.1)'],
      [0.5, 'rgba(190,170,175,0.035)'],
      [1, 'rgba(170,160,180,0)'],
    ],
  );

  /* 墙角那道亮边：左侧墙角（离光最近的一条竖直折线）。
     其余几条只给一点点——屋子才不会变成线框。 */
  glowLine(fTL, fBL, 1, [
    [0, `rgba(202,192,222,${(0.34 * aFar).toFixed(3)})`],
    [0.55, `rgba(202,192,222,${(0.26 * aFar).toFixed(3)})`],
    [1, 'rgba(202,192,222,0)'],
  ]);
  glowLine(fTR, fBR, 1, [
    [0, 'rgba(172,164,194,0)'],
    [0.72, `rgba(172,164,194,${(0.12 * aFar).toFixed(3)})`],
    [1, 'rgba(172,164,194,0)'],
  ]);
  /* 顶与后墙的交线：屋子最高的那条界，说明「上面封住了」 */
  glowLine(fTL, fTR, 1, [
    [0, `rgba(176,168,202,${(0.15 * aFar).toFixed(3)})`],
    [1, `rgba(176,168,202,${(0.06 * aFar).toFixed(3)})`],
  ]);
  /* 侧墙与顶、与地的交界朝画外走：有了它们，屋子才不像立在虚空里的一块板 */
  if (aSide > 0.004) {
    glowLine(fTL, nTL, 1, [
      [0, `rgba(170,162,196,${(0.13 * aSide).toFixed(3)})`],
      [1, `rgba(170,162,196,${(0.03 * aSide).toFixed(3)})`],
    ]);
    glowLine(fTR, nTR, 1, [
      [0, `rgba(150,144,172,${(0.07 * aSide).toFixed(3)})`],
      [1, 'rgba(150,144,172,0)'],
    ]);
  }
  /* 地朝纵深去的两条侧边：很淡，但少了它们地就没有进深 */
  glowLine(fBL, nBL, 1, [
    [0, `rgba(156,150,182,${(0.1 * aGeo).toFixed(3)})`],
    [1, 'rgba(156,150,182,0)'],
  ]);
  glowLine(fBR, nBR, 1, [
    [0, `rgba(142,136,166,${(0.06 * aGeo).toFixed(3)})`],
    [1, 'rgba(142,136,166,0)'],
  ]);

  /* 地上一根线：从地上一处没有理由的地方起，斜着朝画外走。
     它不在任何两面的交线上，两头都不断言什么——屋里唯一「不该在那里」的平静。
     以后屋里的东西会顺着它排开。 */
  const aLine = aGeo * aFix;
  if (aLine > 0.01) {
    const xa = X0 + RW * 0.26;
    const za = FAR_Z - 1.05;
    const xb = X0 + RW * 0.82;
    const zb = lzCam + NEAR + 0.4;
    const zEnd = zNear(lzCam, zb);
    const t = clamp((za - zEnd) / (za - zb || 1), 0, 1);
    const pa = P(xa, FLOOR_Y + 0.001, za);
    const pb = P(lerp(xa, xb, t), FLOOR_Y + 0.001, zEnd);
    glowLine(pa, pb, 3.2, [
      [0, `rgba(178,168,200,${(0.085 * aLine).toFixed(3)})`],
      [1, `rgba(178,168,200,${(0.045 * aLine).toFixed(3)})`],
    ]);
    glowLine(pa, pb, 1, [
      [0, `rgba(198,188,214,${(0.38 * aLine).toFixed(3)})`],
      [0.55, `rgba(202,192,218,${(0.2 * aLine).toFixed(3)})`],
      [1, `rgba(198,188,214,${(0.06 * aLine).toFixed(3)})`],
    ]);
    /* 线的起点一小点光：不是灯的灯 */
    glowSpot(pa, Math.max(8, pa.s * vh * 0.02), '224,212,220', 0.42 * aLine);
  }

  /* 尘：一次循环，二十几个点 */
  const tt = STILL ? 0 : st.t;
  for (const d of dust) {
    let y0 = (d.y - tt * 0.005 * d.sp) % 1;
    if (y0 < 0) y0 += 1;
    const my = FLOOR_Y - 0.1 - y0 * (FLOOR_Y - CEIL_Y - 0.26);
    const mx = X0 + 0.18 + d.x * (RW - 0.36) + Math.sin(tt * 0.12 + d.ph) * 0.07;
    const mz = lzCam + 0.7 + d.z * Math.max(0.3, FAR_Z - lzCam - 1.0);
    const p = P(mx, my, zNear(lzCam, mz));
    const a = d.br * aGeo * clamp(1.7 - p.d * 0.28, 0, 1);
    if (a < 0.012) continue;
    ctx.fillStyle = `rgba(216,208,226,${a.toFixed(3)})`;
    ctx.fillRect(Math.round(p.x / RS), Math.round(p.y / RS), 1, 1);
  }

  /* 一圈很淡的压暗：把视线留在屋子中间那一小片光上。
     画在墙之后、字之前——它压的是面，不压字。 */
  ctx.globalCompositeOperation = 'source-over';
  const vc = P(X0 + RW * 0.44, FLOOR_Y - 0.5, FAR_Z);
  const vcy = vc.y + vh * 0.08;
  const vg = ctx.createRadialGradient(vc.x / RS, vcy / RS, (vh * 0.2) / RS, vc.x / RS, vcy / RS, (vh * 0.98) / RS);
  vg.addColorStop(0, 'rgba(5,4,10,0)');
  vg.addColorStop(0.62, 'rgba(5,4,10,0.09)');
  vg.addColorStop(1, 'rgba(5,4,10,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cw, ch);

  /* ══ 字 ══
     字在 DOM 里——这层画布是放大过的，字画进去会糊成一团灰。
     位置钉在墙上那个世界坐标上，跟着墙的透视走；字号只跟一点点：
     完全不缩放会像贴在屏幕上（不是墙上的话），完全跟着缩放又会糊。 */
  if (lineMain) {
    const p = P(X0 + RW * 0.3, FLOOR_Y - 0.62, FAR_Z);
    const k = clamp(p.s * FAR_Z, 0.82, 1.24);
    /* 字是「写在墙上的」，但读它的人得看得见整句：
       预计位置若跑出画面（窄屏上最容易），就往里收，保证整句都在视口内。
       收的是字，不是墙——墙照旧切在画外，那是对的。 */
    const halfW = (lineMain.offsetWidth * k) / 2;
    const tx = clamp(p.x, halfW + 18, world.vw - halfW - 18);
    const ty = clamp(p.y, 40, vh - 60);
    lineMain.style.transform =
      `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) ` + `scale(${k.toFixed(3)}) translate(-50%,-50%)`;
    lineMain.style.opacity = String(clamp((arr - 0.55) / 0.4, 0, 1) * 0.92);
  }
  if (help) help.style.opacity = String(clamp((arr - 0.62) / 0.38, 0, 1) * 0.85);
}

/* ══ 八、进场 ══
   shell 的相机默认在原点，露出来之前先把它放到屋里那个位置。
   必须先 measure() 再用 eyeLX / EYE_LZ 定位：这两个值是按屏幕比例算出来的。 */
measure();
fitCanvas(world.vw, world.vh);
{
  const [wx, wz] = toWorld(eyeLX, EYE_LZ);
  world.cam.x = wx;
  world.cam.z = wz;
  world.cam.y = EYE_Y;
}
placed = true; // 之后每次 reconnect / measure 都会把相机放回新屋子的默认眼位

addEventListener('pointerdown', () => {
  if (help) help.style.opacity = '0';
});

world.start();
