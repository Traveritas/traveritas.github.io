/* ─────────────────────────────────────────────────────────────
 below · tumble：会翻的房间

 往下滚：检索页的卡片往上飘走，一间方房间从天上扣下来，把你罩在里面，落地时水晃一下。
 点左右：不是你转身——是整间房往那边翻一面。墙变成地，水哗地流到新的地上，散着的东西跟着滚落；
        住在墙上的那位站不稳，晃一晃，嘟囔一句。
 点上方：房间升回天上，卡片落回来，又是检索页。

 · 房间是一个立方体（边长 2H），绕视线方向（z）转；人和重力都不动。
 · 散着的东西在房间坐标里算：只需把重力转进房间坐标，它们就会自己滑、滚、落到新的地上。
 · 水面永远水平：每帧按体积守恒（二维截面面积不变）重新求水位，外加一点晃荡；用房间六个面裁掉墙外的部分。
 · 「长在」某一面的东西（墙上那位、天花板上倒挂的那件）是房间的子节点，跟着翻——翻到它那一面做地时，它才是正的。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';
import { clamp, lerp, sstep, inOut, TAN, layout, INK, options, RM } from './common.js';

const THREE = window.THREE;
const opt = options();
const q = new URLSearchParams(location.search);
const AT = q.has('at') ? +q.get('at') : -1;
const NIGHT = q.get('sky') !== 'day'; // 默认夜里；?sky=day 白天
const root = document.documentElement;
if (!NIGHT) root.classList.add('day');
const DUR = 3.6;
const H = 3.5; // 房间半边长

const T = NIGHT
  ? {
      sky: DREAM.home, grain: [1, 0.3, 26],
      faces: { nx: [0.5, 0.48, 0.6], px: [0.46, 0.46, 0.58], ny: [0.42, 0.4, 0.5], py: [0.52, 0.5, 0.6], b: [0.48, 0.46, 0.58], f: [0.48, 0.46, 0.58] },
      edge: [0.9, 0.86, 0.96], water: [0.46, 0.56, 0.86], thing: [0.84, 0.8, 0.9], warm: [0.96, 0.82, 0.7],
      hemi: [[0.6, 0.56, 0.8], [0.12, 0.12, 0.2]],
      ui: ['#eee8f2', 'rgba(20,18,34,0.45)', 'rgba(232,226,240,0.2)', 'rgba(236,232,244,0.75)', 'rgba(240,236,248,0.08)'],
    }
  : {
      sky: DREAM.essay, grain: [0.42, 0.16, 40],
      faces: { nx: [0.8, 0.84, 0.86], px: [0.84, 0.82, 0.9], ny: [0.78, 0.79, 0.86], py: [0.9, 0.87, 0.88], b: [0.88, 0.88, 0.92], f: [0.88, 0.88, 0.92] },
      edge: [0.46, 0.5, 0.6], water: [0.66, 0.72, 0.82], thing: [0.97, 0.96, 0.96], warm: [1, 0.9, 0.78],
      hemi: [[0.78, 0.8, 0.88], [0.36, 0.38, 0.48]],
      ui: ['#232830', 'rgba(250,251,253,0.6)', 'rgba(52,62,82,0.2)', 'rgba(40,46,60,0.6)', 'rgba(40,46,60,0.06)'],
    };
for (const k of ['essay', 'moment', 'project']) {
  WAKE[k] = T.sky.map((c) => c.slice());
  GRAIN[k] = T.grain.slice();
}
['--say-fg', '--say-bg', '--say-edge', '--edge-fg', '--edge-bg'].forEach((v, i) => root.style.setProperty(v, T.ui[i]));
const C3 = (c) => new THREE.Color(...c);

/* ══ 天（流光） → 场景背景 ══ */
const glc = document.getElementById('light');
const light = createLight(glc, opt.px, { wind: false });
const skyTex = new THREE.CanvasTexture(glc);
skyTex.magFilter = THREE.NearestFilter;
skyTex.minFilter = THREE.NearestFilter;
skyTex.generateMipmaps = false;

/* ══ 检索页 ══ */
let vw = innerWidth, vh = innerHeight;
const pageEl = document.getElementById('page');
function buildPage() {
  pageEl.innerHTML = '';
  const L = layout(vw, vh);
  for (const h of L.heads) {
    const el = document.createElement('div');
    el.className = 'pg-head';
    el.style.cssText = `left:${h.x}px;top:${h.y}px;color:${INK[h.k].fg}`;
    el.innerHTML = `<span class="no">${h.no}</span><b>${h.t}</b><i>${h.en}</i>`;
    el.dataset.k = h.k;
    pageEl.appendChild(el);
  }
  for (const c of L.cards) {
    const ink = INK[c.k];
    const el = document.createElement('div');
    el.className = 'pg-card';
    el.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${ink.glass};border-color:${ink.edge};color:${ink.fg}`;
    el.innerHTML = `<b>${c.title}</b><time style="color:${ink.soft}">${c.date}</time>`;
    el.dataset.k = c.k;
    pageEl.appendChild(el);
  }
}

/* ══ Three ══ */
const cv = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.background = skyTex;
const camera = new THREE.PerspectiveCamera(74, vw / vh, 0.05, 80);
camera.rotation.order = 'YXZ';
camera.position.set(0, -H + 1.6, 2.4);
scene.add(new THREE.HemisphereLight(C3(T.hemi[0]), C3(T.hemi[1]), 1.05));
const sun = new THREE.DirectionalLight(0xffffff, NIGHT ? 0.7 : 0.4);
sun.position.set(0.5, 1, 0.8);
scene.add(sun);

function resize() {
  vw = innerWidth;
  vh = innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.fov = vw < vh ? 96 : 74;
  camera.updateProjectionMatrix();
  light?.resize();
  buildPage();
}

/* ══ 房间 ══ */
const roomG = new THREE.Group();
scene.add(roomG);
const wallMat = (c) => new THREE.MeshStandardMaterial({ color: C3(c), roughness: 0.95, metalness: 0 });
function face(geo, c, pos, rot) {
  const m = new THREE.Mesh(geo, wallMat(c));
  m.position.set(...pos);
  m.rotation.set(...rot);
  roomG.add(m);
  return m;
}
const S = 2 * H;
const plane = new THREE.PlaneGeometry(S, S);
function holed(r, cx = 0, cy = 0) {
  const sh = new THREE.Shape();
  sh.moveTo(-H, -H); sh.lineTo(H, -H); sh.lineTo(H, H); sh.lineTo(-H, H); sh.lineTo(-H, -H);
  const hole = new THREE.Path();
  hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return new THREE.ShapeGeometry(sh, 48);
}
face(plane, T.faces.ny, [0, -H, 0], [-Math.PI / 2, 0, 0]); // 起初的地
face(plane, T.faces.py, [0, H, 0], [Math.PI / 2, 0, 0]); // 起初的天花板
face(plane, T.faces.px, [H, 0, 0], [0, -Math.PI / 2, 0]); // 右墙
face(holed(1.5, 0.6, -0.4), T.faces.nx, [-H, 0, 0], [0, Math.PI / 2, 0]); // 左墙：一个圆洞（翻到底下时，脚下是天）
face(holed(2.1, 0, 0.5), T.faces.b, [0, 0, -H], [0, 0, 0]); // 背墙：一扇圆窗
face(plane, T.faces.f, [0, 0, H], [0, Math.PI, 0]); // 身后那面
const edgeMat = new THREE.LineBasicMaterial({ color: C3(T.edge), transparent: true, opacity: 0.55 });
roomG.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S, S, S)), edgeMat));
function rim(r, pos, rot) {
  const pts = [];
  for (let i = 0; i <= 64; i++) pts.push(new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2) * r, Math.sin((i / 64) * Math.PI * 2) * r, 0));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat);
  l.position.set(...pos);
  l.rotation.set(...rot);
  roomG.add(l);
}
rim(2.1, [0, 0.5, -H + 0.01], [0, 0, 0]);
rim(1.5, [-H + 0.01, -0.4, -0.6], [0, Math.PI / 2, 0]);

/* 起初那块地上一圈浅浅的方格：翻到别处去时，一看就知道哪面是哪面 */
{
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: C3(T.faces.ny.map((c) => c * 0.9)), roughness: 1 });
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if ((i + j) % 2) continue;
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), m);
    t.rotation.x = -Math.PI / 2;
    t.position.set(i, -H + 0.005, j);
    g.add(t);
  }
  roomG.add(g);
}

/* ══ 东西 ══ */
const frost = (c, e = 0) => new THREE.MeshStandardMaterial({ color: C3(c), roughness: 0.8, emissive: C3(c), emissiveIntensity: e });
const hits = [];
const say = (html) => {
  const p = document.createElement('p');
  p.className = 'say';
  p.innerHTML = html;
  document.body.appendChild(p);
  return p;
};
const pv = new THREE.Vector3();
function pin(el, obj, dy, on) {
  obj.getWorldPosition(pv);
  pv.y += dy;
  pv.project(camera);
  const vis = on && pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
  el.classList.toggle('on', vis);
  if (vis) el.style.transform = `translate(${((pv.x + 1) / 2) * vw}px, ${((1 - pv.y) / 2) * vh}px) translate(-50%, -100%)`;
}

// 右墙上住着的那位（占位）：脚踩在右墙上。房间一翻就晃一晃，嘟囔一句；翻到右墙做地时，它才站正
const npc = new THREE.Group();
const npcBody = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.45, 7), frost(T.thing, 0.1));
body.position.y = 0.73;
const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), frost(T.thing, 0.35));
head.position.y = 1.66;
npcBody.add(body, head);
npc.add(npcBody);
npc.position.set(H, -2.2, -1.0);
npc.rotation.z = Math.PI / 2;
roomG.add(npc);
const npcSay = say('');
const GRUMBLE = ['又来。', '我本来站得好好的。', '……', '<small>占位 · 以后换成真的话</small>你翻它做什么'];
const UPRIGHT = '终于站正了。';
let npcWob = 0, npcTalk = 0, gi = 0;
for (const m of [body, head]) { m.userData.click = () => { npcSay.innerHTML = '你也是从上面下来的？'; npcTalk = 2.6; npcWob = 0.4; }; hits.push(m); }

// 天花板上倒挂着的一件东西（占位）：翻过去它就正了
const relic = new THREE.Group();
const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), frost(T.warm, 0.6));
gem.position.y = 1.55;
const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.8), frost(T.faces.py.map((c) => c * 0.94)));
base.position.y = 0.475;
relic.add(gem, base);
relic.position.set(-1.1, H, -1.7);
relic.rotation.x = Math.PI;
roomG.add(relic);
let relicSpin = 0.5;
gem.userData.click = () => (relicSpin = 7);
hits.push(gem);

/* 散着的东西：在房间坐标里算物理 */
const bodies = [];
function loose(mesh, p, r, floaty = false) {
  mesh.position.set(...p);
  roomG.add(mesh);
  const b = { mesh, p: mesh.position, v: new THREE.Vector3(), r, floaty, spin: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2) };
  bodies.push(b);
  mesh.userData.click = () => kick(b);
  hits.push(mesh);
  return b;
}
const ball = loose(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), frost(T.thing, 0.12)), [1.2, -H + 0.45, -0.6], 0.45, true);
void ball;
const DICE = [[-1.6, -0.2], [-0.6, -1.9], [0.4, 0.4], [2.2, -1.8], [-2.3, -2.4], [0.9, -2.8]];
DICE.forEach(([x, z], i) => {
  const s = 0.34 + (i % 3) * 0.07;
  const geo = i % 2 ? new THREE.BoxGeometry(s, s, s) : new THREE.TetrahedronGeometry(s * 0.75, 0);
  const tint = i === 3 ? T.warm : T.thing.map((c) => c * (0.92 + (i % 3) * 0.03));
  const m = loose(new THREE.Mesh(geo, frost(tint, 0.08)), [x, -H + s / 2, z], s / 2);
  m.mesh.rotation.set(i, i * 2, 0);
});

/* ══ 水：水平面 + 房间六面裁切；水位按体积守恒求，外加晃荡 ══ */
const DEPTH = 0.42;
const AREA = S * DEPTH; // 截面面积（二维），转到哪都不变
const clipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
const waterMat = new THREE.MeshStandardMaterial({
  color: C3(T.water), roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.36,
  emissive: C3(T.water), emissiveIntensity: 0.05, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes,
});
const waterG = new THREE.Group();
const waterM = new THREE.Mesh(new THREE.PlaneGeometry(30, 30, 1, 1), waterMat);
waterM.rotation.x = -Math.PI / 2;
waterG.add(waterM);
waterG.renderOrder = 10;
waterM.renderOrder = 10;
scene.add(waterG);
/* 水线：水面与房间四壁相交的那一圈（看得出「有水」全靠它） */
const wl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 5 }, () => new THREE.Vector3())),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
wl.renderOrder = 11;
scene.add(wl);
function waterline(L, tilt, oy) {
  // 二维截面：转过 theta 的正方形，与直线 y = L + tan(tilt)·x 的两个交点
  const c = Math.cos(theta), s2 = Math.sin(theta), k = Math.tan(tilt);
  const V = [[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, y]) => [x * c - y * s2, x * s2 + y * c]);
  const P = [];
  for (let i = 0; i < 4; i++) {
    const a = V[i], b = V[(i + 1) % 4];
    const fa = a[1] - (L + k * a[0]), fb = b[1] - (L + k * b[0]);
    if (fa * fb < 0) { const t = fa / (fa - fb); P.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  if (P.length < 2) { wl.visible = false; return; }
  wl.visible = true;
  const z = H - 0.02, sh = 0.97;
  const pts = [[P[0], -z], [P[1], -z], [P[1], z], [P[0], z], [P[0], -z]];
  const pos = wl.geometry.attributes.position;
  pts.forEach(([[x, y], zz], i) => pos.setXYZ(i, x * sh, y + oy + 0.01, zz));
  pos.needsUpdate = true;
}

function levelFor(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const V = [[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const below = (L) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const a = V[i], b = V[(i + 1) % 4];
      const ain = a[1] <= L, bin = b[1] <= L;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (L - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, L]); }
    }
    let A = 0;
    for (let i = 0; i < out.length; i++) { const p = out[i], q2 = out[(i + 1) % out.length]; A += p[0] * q2[1] - q2[0] * p[1]; }
    return Math.abs(A) / 2;
  };
  let lo = Math.min(...V.map((v) => v[1])), hi = lo + S;
  for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (below(m) < AREA) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const slosh = { a: 0, v: 0 };

/* ══ 翻 ══ */
let theta = 0;
let tumble = null; // { t0, from, to }
let omega = 0, omegaPrev = 0;
function flip(dir) {
  if (tumble || arrive < 1) return;
  const from = theta;
  tumble = { t0: clock, from, to: from + dir * (Math.PI / 2), dur: RM ? 0.01 : 1.15 };
  npcWob = 1;
  npcSay.innerHTML = GRUMBLE[gi++ % GRUMBLE.length];
  npcTalk = 0; // 翻完再说
}
function kick(b) {
  // 从人这边踢开：世界方向 → 房间坐标
  b.mesh.getWorldPosition(pv);
  const d = pv.clone().sub(camera.position);
  d.y = 0;
  d.normalize();
  d.y = 0.55;
  d.multiplyScalar(5.5);
  const c = Math.cos(-theta), s = Math.sin(-theta);
  b.v.set(d.x * c - d.y * s, d.x * s + d.y * c, d.z);
}

/* ══ 进出 ══ */
let arrive = AT >= 0 ? AT : 0;
let want = arrive >= 1 ? 1 : 0;
const goIn = () => { want = 1; root.classList.add('go'); };
const goUp = () => { if (!tumble) want = 0; };
let landed = false;

/* ══ 输入 ══ */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const edgeL = document.getElementById('edgeL'), edgeR = document.getElementById('edgeR'), edgeT = document.getElementById('edgeT');
function whatIsAt(x, y) {
  if (arrive < 1) return null;
  ndc.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(hits, false)[0];
  if (h) return { kind: 'thing', o: h.object };
  if (y < vh * 0.16) return { kind: 'up' };
  if (x < vw * 0.22) return { kind: 'left' };
  if (x > vw * 0.78) return { kind: 'right' };
  return null;
}
let hover = null;
addEventListener('pointermove', (e) => {
  sway.tx = (e.clientX / vw) * 2 - 1;
  sway.ty = (e.clientY / vh) * 2 - 1;
  hover = whatIsAt(e.clientX, e.clientY);
});
let down = null;
cv.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
cv.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return (down = null);
  down = null;
  const w = whatIsAt(e.clientX, e.clientY);
  if (!w) return;
  if (w.kind === 'thing') w.o.userData.click?.();
  else if (w.kind === 'up') goUp();
  else if (w.kind === 'left') flip(1);
  else if (w.kind === 'right') flip(-1);
});
addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY > 30 && arrive <= 0.001) goIn();
  else if (e.deltaY < -30 && arrive >= 1) goUp();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (arrive <= 0.001 && ['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); return goIn(); }
  if (arrive < 1) return;
  if (e.key === 'ArrowLeft') flip(1);
  else if (e.key === 'ArrowRight') flip(-1);
  else if (e.key === 'Escape' || e.key === 'ArrowUp') goUp();
});
let ty0 = null;
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') ty0 = e.clientY; }, { passive: true });
addEventListener('pointermove', (e) => { if (ty0 !== null && arrive <= 0.001 && ty0 - e.clientY > 50) { ty0 = null; goIn(); } }, { passive: true });
addEventListener('pointerup', () => (ty0 = null));
if (opt.auto >= 0) setTimeout(goIn, opt.auto);
/* 截图 / 测试：?flips=1,1,-1 进站后依次翻 */
const FLIPS = q.has('flips') ? q.get('flips').split(',').map(Number) : [];

/* ══ 物理（房间坐标） ══ */
const G = 9.8;
function physics(dt, L) {
  const gx = -G * Math.sin(theta), gy = -G * Math.cos(theta);
  const ux = Math.sin(theta), uy = Math.cos(theta); // 世界「上」在房间坐标里
  const n = 3, h = dt / n;
  for (let k = 0; k < n; k++) {
    for (const b of bodies) {
      b.v.x += gx * h;
      b.v.y += gy * h;
      const yw = b.p.x * ux + b.p.y * uy + roomG.position.y; // 世界高度
      const sub = L + roomG.position.y - (yw - b.r);
      if (sub > 0) {
        const damp = Math.exp(-h * 3.2);
        b.v.multiplyScalar(damp);
        if (b.floaty) { const f = Math.min(sub, b.r * 1.6) * 11 * h; b.v.x += ux * f; b.v.y += uy * f; }
      }
      b.p.addScaledVector(b.v, h);
      for (const ax of ['x', 'y', 'z']) {
        const lim = H - b.r;
        if (b.p[ax] > lim) { b.p[ax] = lim; if (b.v[ax] > 0) { b.v[ax] *= -0.32; damp2(b, ax); } }
        if (b.p[ax] < -lim) { b.p[ax] = -lim; if (b.v[ax] < 0) { b.v[ax] *= -0.32; damp2(b, ax); } }
      }
    }
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j];
        const d = c.p.clone().sub(a.p), dist = d.length(), min = a.r + c.r;
        if (dist > 0 && dist < min) {
          d.divideScalar(dist);
          const push = (min - dist) / 2;
          a.p.addScaledVector(d, -push);
          c.p.addScaledVector(d, push);
          const rel = c.v.clone().sub(a.v).dot(d);
          if (rel < 0) { a.v.addScaledVector(d, rel * 0.7); c.v.addScaledVector(d, -rel * 0.7); }
        }
      }
  }
  for (const b of bodies) {
    const sp = b.v.length();
    if (sp > 0.02) {
      b.mesh.rotation.x += (b.v.z / b.r) * dt * 0.8 + b.spin.x * dt * Math.min(1, sp);
      b.mesh.rotation.z -= (b.v.x / b.r) * dt * 0.8 - b.spin.z * dt * Math.min(1, sp) * 0;
    }
  }
}
function damp2(b, ax) {
  // 碰面时，沿面的速度也摩擦掉一些
  for (const o of ['x', 'y', 'z']) if (o !== ax) b.v[o] *= 0.9;
}

/* ══ 帧 ══ */
let clock = 0, last = performance.now(), teach = 0, flipT = 0;
const sway = { x: 0, y: 0, tx: 0, ty: 0 };
const stat = document.getElementById('stat');
function tick(ts) {
  const dt = Math.min(0.04, (ts - last) / 1000);
  last = ts;
  clock += dt;
  if (AT < 0) arrive = clamp(arrive + (want ? 1 : -1) * (RM ? 1 : dt / DUR), 0, 1);
  root.classList.toggle('done', arrive >= 1);
  if (arrive <= 0) root.classList.remove('go');

  // 检索页：卡片往上飘走 / 落回
  const unify = sstep(0.05, 0.5, arrive);
  pageEl.style.display = arrive >= 0.65 ? 'none' : '';
  if (arrive < 0.65) {
    [...pageEl.children].forEach((el, i) => {
      const k = +el.dataset.k || 0;
      const lag = ((i * 0.137) % 1) * 0.1;
      const p = sstep(0.02 + lag, 0.45 + lag, arrive);
      el.style.opacity = (1 - p).toFixed(3);
      el.style.transform = p > 0.001 ? `translate3d(${((k - 1) * 30 * p).toFixed(1)}px, ${(-vh * 0.6 * p * p).toFixed(1)}px, 0) scale(${(1 - 0.25 * p).toFixed(3)})` : '';
      el.style.filter = p > 0.01 ? `blur(${(p * 4).toFixed(2)}px)` : '';
    });
  }

  // 房间从天上扣下来（离开时原路升回去）
  const k = clamp((arrive - 0.3) / 0.5, 0, 1);
  roomG.position.y = k < 1 ? 15 * (1 - k * k) : 0.18 * Math.sin((Math.PI * (arrive - 0.8)) / 0.2) * (want ? 1 : 0);
  roomG.visible = arrive > 0.3;
  const nowLanded = arrive >= 0.8;
  if (nowLanded && !landed) { slosh.v += want ? 2.2 : 0; npcWob = 0.8; }
  landed = nowLanded;

  // 翻
  omegaPrev = omega;
  if (tumble) {
    const e = clamp((clock - tumble.t0) / tumble.dur, 0, 1);
    const nt = lerp(tumble.from, tumble.to, inOut(e));
    omega = (nt - theta) / Math.max(dt, 1e-4);
    theta = nt;
    if (e >= 1) { tumble = null; omega = 0; npcTalk = 2.8; flipT = clock; }
  } else omega = 0;
  roomG.rotation.z = theta;
  if (arrive >= 1 && !tumble && FLIPS.length && clock - flipT > 1.6) { flip(FLIPS.shift()); }

  // 水
  const L = levelFor(theta);
  slosh.v += (-34 * slosh.a - 2.4 * slosh.v) * dt - (omega - omegaPrev) * 0.55; // 房间转得一急，水就晃
  slosh.a = clamp(slosh.a + slosh.v * dt, -0.45, 0.45);
  waterG.position.set(0, L + roomG.position.y, 0);
  waterG.rotation.z = slosh.a;
  waterG.visible = landed;
  waterline(L, slosh.a, roomG.position.y);
  if (!landed) wl.visible = false;
  wl.material.opacity = 0.85 * sstep(0.8, 0.9, arrive) * (NIGHT ? 0.8 : 1);
  waterMat.opacity = 0.36 * sstep(0.8, 0.9, arrive);
  const c = Math.cos(theta), s = Math.sin(theta);
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([x, y], i) => {
    const n = new THREE.Vector3(x * c - y * s, x * s + y * c, 0);
    clipPlanes[i].set(n, H - n.y * roomG.position.y);
  });
  clipPlanes[4].set(new THREE.Vector3(0, 0, 1), H);
  clipPlanes[5].set(new THREE.Vector3(0, 0, -1), H);

  if (landed && arrive >= 0.8) physics(dt, L);

  // 东西
  npcWob *= Math.exp(-dt * 1.6);
  npcBody.rotation.z = Math.sin(clock * 11) * npcWob * 0.32;
  npcBody.rotation.x = Math.sin(clock * 7.3) * npcWob * 0.18;
  npcTalk = Math.max(0, npcTalk - dt);
  const upright = Math.abs(((theta / (Math.PI / 2)) % 4 + 4) % 4 - 3) < 0.01; // 右墙做地
  if (upright && npcTalk > 2.7) npcSay.innerHTML = UPRIGHT;
  pin(npcSay, head, 0.45, arrive >= 1 && !tumble && npcTalk > 0);
  relicSpin += (0.5 - relicSpin) * dt * 0.8;
  gem.rotation.y += relicSpin * dt;

  // 看
  sway.x += (sway.tx * (arrive >= 1 ? 1 : 0) - sway.x) * 0.05;
  sway.y += (sway.ty * (arrive >= 1 ? 1 : 0) - sway.y) * 0.05;
  const bow = inOut((arrive - 0.2) / 0.8);
  camera.rotation.set(lerp(1.25, -0.16, bow) - sway.y * 0.05, -sway.x * 0.08, 0);

  // 提示
  if (arrive >= 1) teach += dt; else teach = 0;
  const all = teach > 0.5 && teach < 2.8;
  const hk = tumble ? null : hover?.kind;
  edgeL.classList.toggle('on', arrive >= 1 && (hk === 'left' || all));
  edgeR.classList.toggle('on', arrive >= 1 && (hk === 'right' || all));
  edgeT.classList.toggle('on', arrive >= 1 && (hk === 'up' || all));
  root.classList.toggle('hot', !!hk);

  light?.draw({
    t: clock * 0.7, pan: { x: sway.x * 0.05, y: camera.rotation.x * 0.4 }, zoom: 0.35,
    mouse: { x: -9999, y: -9999 }, dim: 0,
    seam: { p: [[vw / 3, vh / 2], [(vw * 2) / 3, vh / 2]], n: [1 / Math.hypot(1, TAN), TAN / Math.hypot(1, TAN)] },
    split: 1, bias: [0, 0, 0], lift: [0, 0, 0], ring: null, face: unify,
  });
  skyTex.needsUpdate = true;
  renderer.render(scene, camera);
  if (opt.debug) stat.textContent = `${arrive.toFixed(2)} · θ ${(theta / (Math.PI / 2)).toFixed(2)} · 水位 ${L.toFixed(2)}`;
  requestAnimationFrame(tick);
}
resize();
addEventListener('resize', resize);
requestAnimationFrame(tick);
