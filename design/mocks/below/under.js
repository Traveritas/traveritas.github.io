/* ─────────────────────────────────────────────────────────────
 below · under：检索页的底下

 检索页本身就是一块玻璃板（流光 + 栏头 + 卡片，原样）。往下滚，镜头不离开它：
 先俯身贴近、穿过去（穿过那一下只看得见糊开的光），再在它底下抬起头。
 于是头顶是刚才那一页的背面——字是反的、隔着磨砂；
 光从玻璃透下来落在地上，卡片与栏头在地上投出影子——影子是正的。

 实现：CSS 3D。两块平面（玻璃板 = 检索页的 DOM 原物、地面 = 一张 2D canvas），
 每帧由自己算的相机给 matrix3d。只有一个 WebGL（流光），地面每帧从它拷一份、糊开、压暗，再叠影子。

 世界坐标：x 向右，y 向下，z 朝「页的下沿」。玻璃板在 y = 0，地面在 y = HR。
 进来时相机在板上方 y = −P·K 正往下看（此时板恰好铺满屏幕，与检索页逐像素一致）。
 ───────────────────────────────────────────────────────────── */
import { createLight } from './light.js';
import { clamp, lerp, sstep, inOut, TAN, layout, INK, options, RM, onDescend } from './common.js';

const opt = options();
const PX = opt.px;
const root = document.documentElement;
if (RM) root.classList.add('rm');

const K = 2.2; // 玻璃板在世界里是视口的几倍大（相机在 P·K 处看它恰好 1:1）
const DUR = 5200;
const AT = new URLSearchParams(location.search).has('at') ? +new URLSearchParams(location.search).get('at') : -1; // 截图用：把转场定在某一刻

const scene = document.getElementById('scene');
const sheet = document.getElementById('sheet');
const floor = document.getElementById('floor');
const ground = document.getElementById('ground');
const glow = document.getElementById('glow');
const glc = document.getElementById('light');
const fc = document.getElementById('floorc');
const haze = document.getElementById('haze');
const stat = document.getElementById('stat');
const fg = fc.getContext('2d');
const hg = haze.getContext('2d');

let vw = innerWidth;
let vh = innerHeight;
let P = vh * 0.72; // CSS perspective：竖向视角约 70°（广一点，头顶与脚下同时在画里）
let W, D, HR, EYE;
let L; // 检索页版面

/* ── 检索页：栏头与卡片直接是玻璃板里的 DOM ── */
function buildPage() {
  sheet.querySelectorAll('.pg-head,.pg-card').forEach((e) => e.remove());
  L = layout(vw, vh);
  for (const h of L.heads) {
    const el = document.createElement('div');
    el.className = 'pg-head';
    el.style.cssText = `left:${h.x}px;top:${h.y}px;color:${INK[h.k].fg}`;
    el.innerHTML = `<span class="no">${h.no}</span><b>${h.t}</b><i>${h.en}</i>`;
    sheet.appendChild(el);
  }
  for (const c of L.cards) {
    const ink = INK[c.k];
    const el = document.createElement('div');
    el.className = 'pg-card';
    el.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${ink.glass};border-color:${ink.edge};color:${ink.fg}`;
    el.innerHTML = `<b>${c.title}</b><time style="color:${ink.soft}">${c.date}</time>`;
    sheet.appendChild(el);
  }
}

function size() {
  vw = innerWidth;
  vh = innerHeight;
  P = vh * 0.72;
  scene.style.perspective = `${P}px`;
  for (const el of [sheet, floor, ground]) {
    el.style.width = `${vw}px`;
    el.style.height = `${vh}px`;
  }
  W = vw * K;
  D = vh * K;
  HR = D * 0.16; // 玻璃到地面：很低——像躺在一张很大的玻璃桌底下
  EYE = HR * 0.5; // 眼睛在玻璃下多深：正好一半，上下对称
  fc.width = Math.round(vw / 2);
  fc.height = Math.round(vh / 2);
  haze.width = Math.ceil(vw / PX);
  haze.height = Math.ceil(vh / PX);
  buildPage();
}
size();

const light = createLight(glc, PX, { wind: true });
addEventListener('resize', () => {
  size();
  light?.resize();
});

/* ── 相机 ── */
const cam = { x: 0, y: 0, z: 0, pitch: Math.PI / 2, yaw: 0 };
function basis(pitch, yaw) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ry = (v) => [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy];
  return { r: ry([1, 0, 0]), u: ry([0, -cp, -sp]), f: ry([0, sp, -cp]) };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function planeCSS(b, O, U, V, N) {
  const R = (v) => [dot(b.r, v), -dot(b.u, v), -dot(b.f, v)];
  const t = R([O[0] - cam.x, O[1] - cam.y, O[2] - cam.z]);
  t[0] += vw / 2;
  t[1] += vh / 2;
  t[2] += P;
  return `matrix3d(${R(U)},0,${R(V)},0,${R(N)},0,${t},1)`;
}

/* 进站的路：先俯身贴近（越来越快）→ 穿过 → 在底下慢慢抬头、往后退到板的下沿那一头 */
const A0 = 0.44; // 穿过玻璃的那一刻
function path(a) {
  let y;
  if (a < A0) {
    const t = a / A0;
    y = -P * K * (1 - t ** 2.2);
  } else {
    y = EYE * (1 - (1 - (a - A0) / (1 - A0)) ** 2.4);
  }
  const p = inOut((a - A0 - 0.02) / (0.98 - A0));
  return {
    y,
    z: lerp(0, D * 0.44, inOut((a - 0.47) / 0.53)),
    pitch: lerp(Math.PI / 2, 0.02, p),
  };
}

/* ── 输入：站定之后，指针看、拖拽走、滚轮前后 ── */
const user = { x: 0, z: 0, yaw: 0, pitch: 0 };
const look = { x: 0, y: 0 };
let drag = null;
addEventListener('pointermove', (e) => {
  look.x = (e.clientX / vw) * 2 - 1;
  look.y = (e.clientY / vh) * 2 - 1;
  if (drag && arrive >= 1) {
    user.x = clamp(drag.x - ((e.clientX - drag.cx) / vw) * W * 0.5, -W * 0.44, W * 0.44);
    user.z = clamp(drag.z - ((e.clientY - drag.cy) / vh) * D * 0.4, -D * 0.86, D * 0.04);
  }
});
addEventListener('pointerdown', (e) => {
  drag = { cx: e.clientX, cy: e.clientY, x: user.x, z: user.z };
});
addEventListener('pointerup', () => (drag = null));
addEventListener('wheel', (e) => {
  if (arrive < 1) return;
  user.z = clamp(user.z + e.deltaY * 0.9, -D * 0.86, D * 0.04);
}, { passive: true });

/* ── 进站 ── */
let t0 = -1;
let arrive = 0;
const descend = onDescend(() => {
  t0 = performance.now() - (RM ? DUR : 0);
  root.classList.add('go');
});
if (opt.auto >= 0) setTimeout(descend.fire, opt.auto);

/* ── 地面：透下来的光 + 影子 ── */
function paintFloor(a) {
  const w = fc.width, h = fc.height, s = w / vw;
  fg.filter = 'none';
  fg.globalAlpha = 1;
  fg.fillStyle = '#05060a';
  fg.fillRect(0, 0, w, h);
  // 光：同一张流光，糊开、压暗（光穿过磨砂之后落下来就是这样）
  fg.filter = 'blur(4px) brightness(1.7) saturate(1.2)';
  fg.globalAlpha = 0.95;
  fg.drawImage(glc, 0, 0, w, h);
  fg.filter = 'none';
  fg.globalAlpha = 1;
  fg.fillStyle = 'rgba(5,6,10,0.12)';
  fg.fillRect(0, 0, w, h);
  // 影子：卡片挡掉光——亮处挡得多，暗处几乎看不出（用 multiply 压在光上）
  fg.globalCompositeOperation = 'multiply';
  fg.filter = 'blur(3px)';
  fg.fillStyle = 'rgb(150,150,162)';
  for (const c of L.cards) fg.fillRect(c.x * s + 3, c.y * s + 4, c.w * s, c.h * s);
  fg.filter = 'blur(0.7px)';
  fg.fillStyle = 'rgb(28,29,38)';
  fg.textBaseline = 'top';
  for (const hd of L.heads) {
    fg.font = `600 ${19 * s}px "Noto Serif SC", serif`;
    fg.letterSpacing = `${0.34 * 19 * s}px`;
    fg.fillText(hd.t, (hd.x + 34) * s + 2, hd.y * s + 3);
  }
  // 卡片上的标题也透影：字比卡片挡得更死
  fg.font = `500 ${15 * s}px "Noto Serif SC", serif`;
  fg.letterSpacing = `${0.04 * 15 * s}px`;
  fg.fillStyle = 'rgb(22,23,30)';
  for (const c of L.cards) fg.fillText(c.title, (c.x + 18) * s + 3, (c.y + 18) * s + 4);
  fg.letterSpacing = '0px';
  fg.globalCompositeOperation = 'source-over';
  fg.filter = 'none';
  void a;
}

/* ── 帧 ── */
const clock0 = performance.now();
let frame = 0;
function tick(ts) {
  const t = (ts - clock0) / 1000;
  frame++;
  arrive = AT >= 0 ? AT : t0 < 0 ? 0 : clamp((ts - t0) / DUR, 0, 1);
  if (arrive >= 1) root.classList.add('done');

  const pth = path(arrive);
  const settle = sstep(0.82, 1, arrive);
  const tx = settle * (look.x * 0.32);
  const ty = settle * (-look.y * 0.12);
  user.yaw += (tx - user.yaw) * 0.04;
  user.pitch += (ty - user.pitch) * 0.04;
  cam.x += (user.x * settle - cam.x) * 0.08;
  cam.y = pth.y;
  const zt = pth.z + user.z * settle;
  cam.z = arrive < 1 ? zt : cam.z + (zt - cam.z) * 0.08;
  cam.pitch = pth.pitch + user.pitch;
  cam.yaw = user.yaw;

  const b = basis(cam.pitch, cam.yaw);
  sheet.style.transform = planeCSS(b, [-W / 2, 0, -D / 2], [K, 0, 0], [0, 0, K], [0, -1, 0]);
  floor.style.transform = planeCSS(b, [-W / 2, HR, -D / 2], [K, 0, 0], [0, 0, K], [0, -1, 0]);
  // 地面比玻璃大得多：光只落在玻璃正下方那一片，其余是暗下去的地
  ground.style.transform = planeCSS(b, [-W * 2.5, HR + 0.5, -D * 2.5], [K * 5, 0, 0], [0, 0, K * 5], [0, -1, 0]);
  // 远处那一线：玻璃与地都溶掉的地方，留一点光
  glow.style.top = `${vh / 2 - P * Math.tan(cam.pitch)}px`;
  glow.style.opacity = (sstep(0.7, 1, arrive) * (Math.abs(cam.pitch) < 0.6 ? 1 : 0)).toFixed(3);
  sheet.classList.toggle('under', cam.y > 0);
  sheet.style.visibility = arrive > A0 - 0.012 && arrive < A0 + 0.05 ? 'hidden' : 'visible';

  // 穿过那一下：只剩糊开的光
  const hz = sstep(0.3, A0 - 0.01, arrive) * (1 - sstep(A0 + 0.04, 0.62, arrive));
  haze.style.opacity = hz.toFixed(3);

  if (light) {
    light.draw({
      t,
      pan: { x: 0, y: 0 },
      zoom: 0.35,
      mouse: { x: -9999, y: -9999 },
      dim: 0,
      seam: { p: [[vw / 3, vh / 2], [(vw * 2) / 3, vh / 2]], n: [1 / Math.hypot(1, TAN), TAN / Math.hypot(1, TAN)] },
      split: 1,
      bias: [0, 0, 0],
      lift: [0, 0, 0],
      ring: null,
      face: 0,
    });
    if (hz > 0.002) hg.drawImage(glc, 0, 0, haze.width, haze.height);
    if (arrive > 0.3 && frame % 2 === 0) paintFloor(arrive);
  }
  if (opt.debug) stat.textContent = `${arrive.toFixed(2)} · y ${Math.round(cam.y)} · z ${Math.round(cam.z)}`;
  requestAnimationFrame(tick);
}
paintFloor(0);
requestAnimationFrame(tick);
