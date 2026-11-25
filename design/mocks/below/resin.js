/* ─────────────────────────────────────────────────────────────
 below · resin：凝住的树脂

 往下滚，检索页那片流光开始变慢、变稠，最后停住；三栏的三种夜色在停住的过程中化成一种树脂色。
 停住的那一刻，原来流在里面的东西都被留在了原处：
   · 两条 14° 的分界：在检索页上它们只是两条线——其实它们是「过眼睛的两张平面」，正对着看才是线。
     镜头一离开原来那一点，它们就露出面来，成了凝在树脂里的两张薄膜；
   · 卡片与栏头：各自在凝住之前往下沉了一点、偏了一点角度，停在不同深度；
   · 气泡：凝的时候析出来的，一粒一粒地出现。
 站定之后：拖拽绕着看（像转一块树脂），滚轮往里走。流光不再流——这里是全站唯一静止的一片光。

 只有一个 WebGL（流光）；其余全在一张 2D canvas 上，自己投影、自己排远近。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';
import { clamp, lerp, sstep, inOut, TAN, rng, layout, INK, options, RM, onDescend } from './common.js';

const opt = options();
const root = document.documentElement;
const q = new URLSearchParams(location.search);
const AT = q.has('at') ? +q.get('at') : -1;
const DUR = 6000;

/* ── 色：进来时是检索的三栏（DREAM），凝住后三栏同一种树脂色（借着色器的醒/梦混合槽：WAKE = 树脂） ── */
const RESIN = [[0.085, 0.068, 0.07], [0.2, 0.155, 0.15], [0.5, 0.385, 0.33], [0.92, 0.78, 0.6]];
for (const k of ['essay', 'moment', 'project']) {
  WAKE[k] = RESIN.map((c) => c.slice());
  GRAIN[k] = [0.9, 0.32, 28];
}
void DREAM;

const glc = document.getElementById('light');
const cv = document.getElementById('things');
const g = cv.getContext('2d');
const stat = document.getElementById('stat');
const light = createLight(glc, opt.px, { wind: false });

let vw, vh, F, L;
const R = rng(20261103);
let cards = [];
let bubbles = [];
let films = [];

function size() {
  vw = innerWidth;
  vh = innerHeight;
  F = vh * 0.95; // 焦距：检索页那一面就在 z = −F，于是投影出来与原页一一重合
  cv.width = vw;
  cv.height = vh;
  L = layout(vw, vh);
  build();
}

/* 世界坐标：x 右、y 下、z 朝观者；原页那一面在 z = −F，屏幕点 (sx, sy) ↔ (sx − vw/2, sy − vh/2, −F) */
function build() {
  const r = rng(7);
  const W = (sx) => sx - vw / 2;
  const H = (sy) => sy - vh / 2;
  cards = [];
  for (const c of L.cards) {
    cards.push({
      kind: 'card', c, ink: INK[c.k], w: c.w, h: c.h,
      x: W(c.x + c.w / 2), y: H(c.y + c.h / 2),
      // 凝住之前各自沉了多少、偏了多少
      dz: lerp(-1.1, 0.55, r()) * F, dy: lerp(0.02, 0.3, r()) * vh, dx: lerp(-0.08, 0.08, r()) * vw,
      ry: lerp(-0.7, 0.7, r()), rx: lerp(-0.4, 0.4, r()), rz: lerp(-0.14, 0.14, r()),
      lag: r() * 0.25,
    });
  }
  for (const h of L.heads) {
    cards.push({
      kind: 'head', c: h, ink: INK[h.k], w: 220, h: 26,
      x: W(h.x + 110), y: H(h.y - 6),
      dz: lerp(-0.5, 0.3, r()) * F, dy: lerp(0, 0.12, r()) * vh, dx: 0,
      ry: lerp(-0.4, 0.4, r()), rx: lerp(-0.2, 0.2, r()), rz: 0, lag: r() * 0.2,
    });
  }
  // 两张薄膜：过原来眼睛的平面，含那条分界线
  films = [1, 2].map((k) => {
    const s = (vw * k) / 3;
    const y0 = -0.4 * vh, y1 = 1.4 * vh;
    const a = [W(s + (vh / 2 - y0) * TAN), H(y0), -F];
    const b = [W(s + (vh / 2 - y1) * TAN), H(y1), -F];
    return { a, b, tint: k === 1 ? [226, 218, 238] : [176, 200, 216] };
  });
  bubbles = [];
  for (let i = 0; i < 260; i++) {
    const z = -lerp(0.35, 3.2, r() ** 0.8) * F;
    const sc = -z / F;
    bubbles.push({
      p: [lerp(-0.9, 0.9, r()) * vw * sc, lerp(-0.8, 0.8, r()) * vh * sc, z],
      r: (r() < 0.06 ? lerp(5, 11, r()) : lerp(0.8, 3.2, r() ** 2)) * sc,
      t: lerp(0.45, 0.97, r()),
    });
  }
}
size();
addEventListener('resize', () => {
  size();
  light?.resize();
});

/* ── 相机：绕原页中心那一点转（pivot = (0,0,−F)），起点正是检索页的眼睛 ── */
const cam = { yaw: 0, pitch: 0, dist: 0, pos: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], d: [0, 1, 0] };
const user = { yaw: 0, pitch: 0, dist: 0 };
const sway = { x: 0, y: 0, tx: 0, ty: 0 };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

function setCam(yaw, pitch, dist) {
  const pv = [0, 0, -F];
  cam.pos = [pv[0] + dist * Math.sin(yaw) * Math.cos(pitch), pv[1] - dist * Math.sin(pitch), pv[2] + dist * Math.cos(yaw) * Math.cos(pitch)];
  cam.f = norm(sub(pv, cam.pos));
  cam.r = norm(cross([0, -1, 0], cam.f));
  cam.d = cross(cam.r, cam.f);
}
function proj(p) {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.f);
  return { x: vw / 2 + (F * dot(d, cam.r)) / z, y: vh / 2 + (F * dot(d, cam.d)) / z, z };
}
/* 绕 y、x、z 转一个本地向量 */
function rot(v, ry, rx, rz) {
  let [x, y, z] = v;
  let c = Math.cos(rz), s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(rx); s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ry); s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

/* ── 输入 ── */
let drag = null;
addEventListener('pointermove', (e) => {
  sway.tx = (e.clientX / vw) * 2 - 1;
  sway.ty = (e.clientY / vh) * 2 - 1;
  if (drag && arrive >= 1) {
    user.yaw = clamp(drag.yaw - ((e.clientX - drag.x) / vw) * 2.2, -1.25, 1.0);
    user.pitch = clamp(drag.pitch + ((e.clientY - drag.y) / vh) * 1.2, -0.55, 0.55);
  }
});
addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: user.yaw, pitch: user.pitch }; });
addEventListener('pointerup', () => (drag = null));
addEventListener('wheel', (e) => {
  if (arrive < 1) return;
  user.dist = clamp(user.dist - e.deltaY * 0.0009 * F, -0.95 * F, 0.7 * F);
}, { passive: true });

let t0 = -1;
let arrive = 0;
const descend = onDescend(() => {
  t0 = performance.now() - (RM ? DUR : 0);
  root.classList.add('go');
});
if (opt.auto >= 0) setTimeout(descend.fire, opt.auto);

/* ── 画 ── */
const SERIF = '"Noto Serif SC", "Songti SC", SimSun, serif';
const MONO = '"IBM Plex Mono", Consolas, monospace';
const RES = [214, 184, 160]; // 树脂里的光（与 RESIN 亮芯同族），远处的东西往它偏

function drawCard(it, fz, fog) {
  const { c, ink } = it;
  const k = clamp((fz - it.lag) / (1 - it.lag), 0, 1);
  const e = inOut(k);
  const C = [it.x + it.dx * e, it.y + it.dy * e, -F + it.dz * e];
  const ax = rot([it.w, 0, 0], it.ry * e, it.rx * e, it.rz * e);
  const ay = rot([0, it.h, 0], it.ry * e, it.rx * e, it.rz * e);
  const tl = [C[0] - ax[0] / 2 - ay[0] / 2, C[1] - ax[1] / 2 - ay[1] / 2, C[2] - ax[2] / 2 - ay[2] / 2];
  const p0 = proj(tl);
  const p1 = proj([tl[0] + ax[0], tl[1] + ax[1], tl[2] + ax[2]]);
  const p2 = proj([tl[0] + ay[0], tl[1] + ay[1], tl[2] + ay[2]]);
  if (p0.z < 20 || p1.z < 20 || p2.z < 20) return;
  const a = clamp(1 - fog * Math.max(0, p0.z / F - 1) * 0.45, 0.12, 1);
  g.save();
  g.globalAlpha = a;
  g.setTransform((p1.x - p0.x) / it.w, (p1.y - p0.y) / it.w, (p2.x - p0.x) / it.h, (p2.y - p0.y) / it.h, p0.x, p0.y);
  if (it.kind === 'card') {
    // 凝住以后：浅底那一栏的卡也褪成树脂里的一片薄玻璃
    g.fillStyle = c.k === 0 && fz > 0 ? `rgba(250,246,240,${lerp(0.62, 0.16, fz)})` : ink.glass;
    g.fillRect(0, 0, it.w, it.h);
    g.strokeStyle = fz > 0.3 ? `rgba(240,228,214,${lerp(0.2, 0.34, fz)})` : ink.edge;
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, it.w - 1, it.h - 1);
    g.fillStyle = c.k === 0 ? (fz > 0.4 ? '#efe6dc' : ink.fg) : ink.fg;
    g.font = `500 15px ${SERIF}`;
    g.textBaseline = 'top';
    g.fillText(c.title, 18, 17);
    g.font = `400 10px ${MONO}`;
    g.globalAlpha = a * 0.7;
    g.fillText(c.date, 18, it.h - 26);
  } else {
    g.fillStyle = c.k === 0 && fz > 0.4 ? '#efe6dc' : ink.fg;
    g.textBaseline = 'alphabetic';
    g.font = `italic 400 13px ${SERIF}`;
    g.globalAlpha = a * 0.6;
    g.fillText(c.no, 0, 22);
    g.globalAlpha = a;
    g.font = `600 19px ${SERIF}`;
    g.letterSpacing = '6.5px';
    g.fillText(c.t, c.no.length * 8 + 12, 22);
    g.letterSpacing = '0px';
  }
  g.restore();
}

function drawFilm(f, ti, tj, fz) {
  const P = (t, e) => proj([e[0] * t, e[1] * t, e[2] * t]);
  const A0 = P(ti, f.a), A1 = P(tj, f.a), B0 = P(ti, f.b), B1 = P(tj, f.b);
  if (A0.z < 20 || A1.z < 20) return;
  const [r, gg, b] = f.tint;
  g.beginPath();
  g.moveTo(A0.x, A0.y); g.lineTo(A1.x, A1.y); g.lineTo(B1.x, B1.y); g.lineTo(B0.x, B0.y); g.closePath();
  const fog = clamp(1.4 - A0.z / F * 0.5, 0.25, 1);
  g.fillStyle = `rgba(${r},${gg},${b},${(0.075 * fz * fog).toFixed(3)})`;
  g.fill();
  // 原来那条分界：在膜上留成一道更亮的线
  if (ti <= 1 && tj >= 1) {
    const M0 = P(1, f.a), M1 = P(1, f.b);
    g.strokeStyle = `rgba(${r},${gg},${b},${(0.34 * fz).toFixed(3)})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(M0.x, M0.y); g.lineTo(M1.x, M1.y); g.stroke();
  }
  g.strokeStyle = `rgba(${r},${gg},${b},${(0.12 * fz * fog).toFixed(3)})`;
  g.beginPath(); g.moveTo(A0.x, A0.y); g.lineTo(A1.x, A1.y); g.moveTo(B0.x, B0.y); g.lineTo(B1.x, B1.y); g.stroke();
}

function drawBubble(bu, a) {
  const p = proj(bu.p);
  if (p.z < 20) return;
  const grow = sstep(bu.t, bu.t + 0.06, a);
  if (grow <= 0) return;
  const rr = (bu.r * F) / p.z * grow;
  if (rr < 0.35 || p.x < -20 || p.x > vw + 20 || p.y < -20 || p.y > vh + 20) return;
  const fog = clamp(1.25 - (p.z / F) * 0.32, 0.15, 1);
  g.strokeStyle = `rgba(${RES[0] + 30},${RES[1] + 40},${RES[2] + 50},${(0.5 * fog).toFixed(3)})`;
  g.lineWidth = rr > 4 ? 1 : 0.8;
  g.beginPath();
  g.arc(p.x, p.y, Math.max(rr, 0.6), 0, Math.PI * 2);
  g.stroke();
  if (rr > 1.6) {
    g.fillStyle = `rgba(255,248,236,${(0.55 * fog).toFixed(3)})`;
    g.beginPath();
    g.arc(p.x - rr * 0.35, p.y - rr * 0.35, Math.max(0.6, rr * 0.18), 0, Math.PI * 2);
    g.fill();
  }
}

/* ── 帧 ── */
const clock0 = performance.now();
let last = clock0;
let tS = 0; // 着色器的时间：会慢下来、停住
function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  arrive = AT >= 0 ? AT : t0 < 0 ? 0 : clamp((ts - t0) / DUR, 0, 1);
  if (arrive >= 1) root.classList.add('done');

  const speed = RM ? 0 : lerp(1, 0.0, sstep(0.02, 0.6, arrive));
  tS += dt * speed;
  const unify = sstep(0.18, 0.78, arrive); // 三种夜色 → 一种树脂色
  const fz = sstep(0.22, 0.9, arrive); // 东西被留在原处的进度
  const reveal = inOut((arrive - 0.45) / 0.55); // 镜头离开原来那一点

  const settle = sstep(0.9, 1, arrive);
  sway.x += (sway.tx - sway.x) * 0.03;
  sway.y += (sway.ty - sway.y) * 0.03;
  const yaw = 0.38 * reveal + user.yaw * settle + sway.x * 0.05 * settle;
  const pitch = -0.1 * reveal + user.pitch * settle + sway.y * 0.03 * settle;
  const dist = F * (1 + 0.2 * reveal) + user.dist * settle;
  setCam(yaw, pitch, dist);

  if (light) {
    light.draw({
      t: 40 + tS,
      pan: { x: yaw * 0.32, y: -pitch * 0.32 },
      zoom: 0.35 + (F * 1.2 - dist) / F * 0.5 + unify * 0.12,
      mouse: { x: -9999, y: -9999 },
      dim: 0,
      seam: { p: [[vw / 3, vh / 2], [(vw * 2) / 3, vh / 2]], n: [1 / Math.hypot(1, TAN), TAN / Math.hypot(1, TAN)] },
      split: 1,
      bias: [0, 0, 0],
      lift: [0, 0, 0],
      ring: null,
      face: unify,
    });
  }

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, vw, vh);
  // 远近排序：卡、薄膜的每一段、气泡放一起
  const list = [];
  for (const it of cards) list.push({ z: proj([it.x, it.y, -F + it.dz * inOut(fz)]).z, f: () => drawCard(it, fz, fz) });
  if (fz > 0.01) {
    const T = [0.35, 0.55, 0.75, 0.9, 1, 1.15, 1.4, 1.7, 2.1, 2.6];
    for (const f of films)
      for (let i = 0; i < T.length - 1; i++) {
        const mid = (T[i] + T[i + 1]) / 2;
        const m = [(f.a[0] + f.b[0]) / 2 * mid, (f.a[1] + f.b[1]) / 2 * mid, -F * mid];
        list.push({ z: proj(m).z, f: () => drawFilm(f, T[i], T[i + 1], fz) });
      }
  }
  list.sort((a, b) => b.z - a.z);
  for (const it of list) it.f();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (arrive > 0.4) for (const bu of bubbles) drawBubble(bu, arrive);

  if (opt.debug) stat.textContent = `${arrive.toFixed(2)} · v ${speed.toFixed(2)} · yaw ${yaw.toFixed(2)}`;
  requestAnimationFrame(tick);
}
document.fonts.load(`500 15px ${SERIF}`).finally(() => requestAnimationFrame(tick));
