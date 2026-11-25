/* ─────────────────────────────────────────────────────────────
 below · giant：这一页的零件，放大成世界（静态对照图）

 刚才还在点的检索页，往下一滚，它的零件全都成了巨构，泡在一片浅水里：
   · 卡片 = 一栋栋立着的楼（标题刻在楼面上，日期是门牌），有的斜着、有的半沉；
   · 三个栏头 = 悬在半空的大字招牌；
   · 左下角那颗六芒星工具栏 = 天上一座慢慢转的星形天文台；
   · 鼠标指针 = 斜插在远处水里的一座灯塔，尖上一点光。
 NPC 住在卡片楼里，东西摆在栏头的字上——以后再说。这张只看「尺度荒唐」成不成立。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, GRAIN } from './light.js';
import { ITEMS, HEADS, INK, options } from './common.js';

const THREE = window.THREE;
const opt = options();
const q = new URLSearchParams(location.search);
const DAY = q.get('sky') === 'day';
if (DAY) document.documentElement.classList.add('day');
const SKY = DAY ? DREAM.essay : DREAM.home;
for (const k of ['essay', 'moment', 'project']) {
  DREAM[k] = SKY.map((c) => c.slice());
  GRAIN[k] = DAY ? [0.42, 0.16, 40] : [1, 0.3, 26];
}
const C3 = (c) => new THREE.Color(...c);
const P = DAY
  ? { deep: [0.62, 0.66, 0.74], fog: [0.8, 0.83, 0.88], hemi: [[0.95, 0.96, 1], [0.5, 0.52, 0.6]], star: [0.98, 0.98, 1], beam: [1, 0.96, 0.88] }
  : { deep: [0.05, 0.05, 0.09], fog: [0.11, 0.11, 0.2], hemi: [[0.62, 0.58, 0.84], [0.1, 0.1, 0.18]], star: [0.86, 0.82, 0.96], beam: [1, 0.86, 0.66] };
document.getElementById('tag').innerHTML = '<b>零件巨构</b>刚才还在点的那一页，成了脚下的地方';

const glc = document.getElementById('light');
const light = createLight(glc, opt.px, { wind: false });
const skyTex = new THREE.CanvasTexture(glc);
skyTex.magFilter = skyTex.minFilter = THREE.NearestFilter;
skyTex.generateMipmaps = false;

let vw = innerWidth, vh = innerHeight;
const cv = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(vw, vh, false);
const scene = new THREE.Scene();
scene.background = skyTex;
scene.fog = new THREE.Fog(C3(P.fog), 30, 150);
const camera = new THREE.PerspectiveCamera(vw < vh ? 90 : 62, vw / vh, 0.1, 400);
camera.position.set(0, 1.7, 22);
camera.rotation.order = 'YXZ';
camera.rotation.set(0.16, 0, 0);
scene.add(new THREE.HemisphereLight(C3(P.hemi[0]), C3(P.hemi[1]), 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 0.5);
sun.position.set(-0.4, 1, 0.6);
scene.add(sun);
const mirror = new THREE.Group();
mirror.scale.y = -1;
scene.add(mirror);
const pairs = [];
function both(o) {
  scene.add(o);
  const m = o.clone(true);
  m.traverse((x) => {
    if (!x.material) return;
    const dim = (mt) => { const c = mt.clone(); c.side = THREE.DoubleSide; c.color?.multiplyScalar(0.7); return c; };
    x.material = Array.isArray(x.material) ? x.material.map(dim) : dim(x.material);
  });
  mirror.add(m);
  pairs.push([o, m]);
  return o;
}

/* 水 */
const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: C3(P.deep), transparent: true, opacity: DAY ? 0.42 : 0.62, depthWrite: false }));
water.rotation.x = -Math.PI / 2;
water.renderOrder = 5;
scene.add(water);

/* 卡片的面：画在 canvas 上（与检索页那张卡同一个样子，只是放大成楼） */
const FONT = '"Noto Serif SC", "Songti SC", SimSun, serif';
function cardFace(title, date, ink, w, h) {
  const c = document.createElement('canvas');
  const k = 120;
  c.width = Math.round(w * k / 4);
  c.height = Math.round(h * k / 4);
  const g = c.getContext('2d');
  const s = c.width / 300;
  g.fillStyle = ink.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = ink.edgeC;
  g.lineWidth = 2 * s;
  g.strokeRect(s, s, c.width - 2 * s, c.height - 2 * s);
  g.fillStyle = ink.fg;
  g.font = `500 ${22 * s}px ${FONT}`;
  g.fillText(title, 26 * s, 50 * s);
  g.globalAlpha = 0.6;
  g.font = `400 ${11 * s}px Consolas, monospace`;
  g.fillText(date, 26 * s, c.height - 24 * s);
  // 楼的「窗」：卡片里的空白处，一排排极淡的格子
  g.globalAlpha = 0.07;
  for (let y = 80 * s; y < c.height - 50 * s; y += 18 * s) for (let x = 26 * s; x < c.width - 26 * s; x += 22 * s) g.fillRect(x, y, 12 * s, 9 * s);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const INKS = [
  { bg: '#e9ecf2', fg: '#232830', edgeC: 'rgba(52,62,82,.3)', side: [0.8, 0.82, 0.88] },
  { bg: '#2d2440', fg: '#ece6f0', edgeC: 'rgba(236,226,240,.3)', side: [0.2, 0.16, 0.28] },
  { bg: '#1a2638', fg: '#e6ebf1', edgeC: 'rgba(222,236,244,.3)', side: [0.12, 0.17, 0.26] },
];
void INK;

/* 三栏 → 三片街区：随笔在左、瞬间在中、项目在右，往远处排；每栋楼一张卡 */
const R = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
ITEMS.forEach((col, k) => {
  col.forEach(([title, date], i) => {
    const w = k === 2 ? 9 : 11, h = k === 0 ? 16 : k === 1 ? 13 : 9;
    const ink = INKS[k];
    const tex = cardFace(title, date, ink, w, h);
    const mats = [
      new THREE.MeshStandardMaterial({ color: C3(ink.side), roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: C3(ink.side), roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: C3(ink.side.map((c) => c * 1.1)), roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: C3(ink.side), roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: DAY ? 0.15 : 0.35 }),
      new THREE.MeshStandardMaterial({ color: C3(ink.side), roughness: 0.9 }),
    ];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), mats);
    const x = (k - 1) * 26 + (R() - 0.5) * 8 + (i % 2 ? 6 : -6) * (k === 1 ? 0.5 : 1);
    const z = -8 - i * 15 - R() * 6 - (k === 1 ? 4 : 0);
    const sink = R() < 0.35 ? R() * h * 0.35 : 0; // 有的半沉
    m.position.set(x, h / 2 - sink, z);
    m.rotation.set((R() - 0.5) * 0.06, (R() - 0.5) * 0.5 - (k - 1) * 0.25, R() < 0.25 ? (R() - 0.5) * 0.35 : 0);
    both(m);
  });
});

/* 栏头：悬在半空的大字招牌 */
HEADS.forEach((h, k) => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = DAY ? '#2a3040' : '#ece8f4';
  g.font = `italic 400 90px ${FONT}`;
  g.globalAlpha = 0.6;
  g.fillText(h.no, 30, 170);
  g.globalAlpha = 1;
  g.font = `600 170px ${FONT}`;
  g.letterSpacing = '50px';
  g.fillText(h.t, 220, 190);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: true, side: THREE.DoubleSide }));
  m.position.set((k - 1) * 26 + 2, 26, -24);
  m.rotation.y = -(k - 1) * 0.25;
  both(m);
});

/* 六芒星天文台：两只三角环错开，在天上慢慢转 */
const star = new THREE.Group();
const starMat = new THREE.MeshStandardMaterial({ color: C3(P.star), roughness: 0.6, emissive: C3(P.star), emissiveIntensity: DAY ? 0.1 : 0.3 });
for (let t = 0; t < 2; t++) {
  const tri = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 + (t ? Math.PI : 0) + Math.PI / 2, a1 = ((i + 1) / 3) * Math.PI * 2 + (t ? Math.PI : 0) + Math.PI / 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * 14, Math.sin(a0) * 14, 0), p1 = new THREE.Vector3(Math.cos(a1) * 14, Math.sin(a1) * 14, 0);
    const len = p0.distanceTo(p1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.9), starMat);
    bar.position.copy(p0.clone().add(p1).multiplyScalar(0.5));
    bar.rotation.z = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    tri.add(bar);
  }
  tri.rotation.x = t ? 0.5 : -0.5; // 三轴：两只三角各偏一点，转起来是立体的
  star.add(tri);
}
star.position.set(-30, 58, -120);
scene.add(star);

/* 鼠标指针灯塔 */
const sh = new THREE.Shape();
[[0, 0], [0, -17], [4.2, -13], [7, -19.5], [9.4, -18.4], [6.7, -12.1], [12, -12.1], [0, 0]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
const cursor = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: C3(DAY ? [0.97, 0.97, 0.99] : [0.88, 0.86, 0.94]), roughness: 0.7 }));
cursor.scale.setScalar(1.6);
cursor.position.set(44, 30, -95);
cursor.rotation.set(0.1, -0.5, -0.35);
both(cursor);
const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: C3(P.beam) }));
tip.position.set(44, 30, -95);
scene.add(tip);

/* 近处：一个人站在随笔那栋楼脚下（尺度锚） */
const person = new THREE.Group();
const pm = new THREE.MeshStandardMaterial({ color: C3(DAY ? [0.98, 0.97, 0.96] : [0.84, 0.8, 0.9]), emissive: 0xffffff, emissiveIntensity: 0.12 });
const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.45, 7), pm);
pb.position.y = 0.73;
const ph = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), pm);
ph.position.y = 1.66;
person.add(pb, ph);
person.position.set(-7, 0, 6);
both(person);

let clock = 0, last = performance.now();
function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  clock += dt;
  star.rotation.z += dt * 0.05;
  star.rotation.y = Math.sin(clock * 0.1) * 0.3;
  tip.scale.setScalar(1 + Math.sin(clock * 2) * 0.15);
  light?.draw({ t: clock * 0.7, pan: { x: 0, y: 0.1 }, zoom: 0.35, mouse: { x: -9999, y: -9999 }, dim: 0, seam: { p: [[-1e6, -1e6], [-1e6, -1e6]], n: [0, 1] }, split: 1, bias: [0, 0, 0], lift: [0, 0, 0], ring: null, face: 0 });
  skyTex.needsUpdate = true;
  for (const [a, b] of pairs) { b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
document.fonts.load(`600 40px ${FONT}`).finally(() => requestAnimationFrame(tick));
