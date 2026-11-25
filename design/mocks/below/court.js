/* ─────────────────────────────────────────────────────────────
 below · court：无顶的院落

 上面：一整片单色的流光（天）。进来时它是检索页的三栏——你正抬头看着它；
   往下滚，三种夜色并成一种，你慢慢低下头，院墙从画面下沿升起来。
 下面：几间相连的方院，没有屋顶，门洞相通，墙高各不相同；地面是一层很浅的水。
   水把天和墙倒映下来（半透明的水面 + 水下一份倒置的墙；天就是透过水看到的那片流光）。
 东西：注册表 THINGS，一样东西一行：放在哪、长什么样、每帧做什么、靠近时、点它时。

 两层画布：#light 是流光（正式站那支着色器），#world 是 Three.js（透明底）。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';
import { clamp, lerp, sstep, inOut, TAN, layout, INK, options, RM, onDescend } from './common.js';

const THREE = window.THREE;
const opt = options();
const q = new URLSearchParams(location.search);
const AT = q.has('at') ? +q.get('at') : -1;
const DAY = q.get('sky') === 'day';
const root = document.documentElement;
if (DAY) root.classList.add('day');
const DUR = 4600;

/* ══ 色 ══ */
const T = DAY
  ? {
      sky: DREAM.essay.map((c) => c.slice()), grain: [0.42, 0.16, 40],
      wall: [0.8, 0.8, 0.84], skyTint: [0.84, 0.87, 0.92], fog: [0.76, 0.8, 0.86],
      deep: [0.56, 0.6, 0.68], hi: [1, 1, 1], mirror: 0.9, alpha: [0.14, 0.6],
      say: ['#232830', 'rgba(250,251,253,0.55)', 'rgba(52,62,82,0.2)'],
    }
  : {
      sky: DREAM.home.map((c) => c.slice()), grain: [1, 0.3, 26],
      wall: [0.44, 0.42, 0.52], skyTint: [0.29, 0.27, 0.44], fog: [0.1, 0.1, 0.18],
      deep: [0.05, 0.05, 0.09], hi: [0.82, 0.76, 0.88], mirror: 0.82, alpha: [0.16, 0.72],
      say: ['#eee8f2', 'rgba(20,18,34,0.42)', 'rgba(232,226,240,0.18)'],
    };
for (const k of ['essay', 'moment', 'project']) {
  WAKE[k] = T.sky.map((c) => c.slice()); // 借醒/梦混合槽：face 0→1 = 三栏 → 一种天色
  GRAIN[k] = T.grain.slice();
}
root.style.setProperty('--say-fg', T.say[0]);
root.style.setProperty('--say-bg', T.say[1]);
root.style.setProperty('--say-edge', T.say[2]);
const V3 = (c) => new THREE.Vector3(...c);
const C3 = (c) => new THREE.Color(...c);

/* ══ 流光（天） ══ */
const glc = document.getElementById('light');
const light = createLight(glc, opt.px, { wind: false });
let vw = innerWidth, vh = innerHeight;

/* ══ 检索页（起点）：只有栏头与卡片，转场时往上飘走 ══ */
const pageEl = document.getElementById('page');
function buildPage() {
  pageEl.innerHTML = '';
  const L = layout(vw, vh);
  for (const h of L.heads) {
    const el = document.createElement('div');
    el.className = 'pg-head';
    el.style.cssText = `left:${h.x}px;top:${h.y}px;color:${INK[h.k].fg}`;
    el.innerHTML = `<span class="no">${h.no}</span><b>${h.t}</b><i>${h.en}</i>`;
    pageEl.appendChild(el);
  }
  for (const c of L.cards) {
    const ink = INK[c.k];
    const el = document.createElement('div');
    el.className = 'pg-card';
    el.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${ink.glass};border-color:${ink.edge};color:${ink.fg}`;
    el.innerHTML = `<b>${c.title}</b><time style="color:${ink.soft}">${c.date}</time>`;
    el.dataset.k = c.k;
    el.dataset.i = c.i;
    pageEl.appendChild(el);
  }
}
buildPage();
const pageKids = () => [...pageEl.children];

/* ══ Three ══ */
const cv = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, vw / vh, 0.05, 90);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(C3(T.skyTint).multiplyScalar(1.6), C3(T.deep), 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 0.35);
sun.position.set(0.3, 1, 0.2);
scene.add(sun);
scene.fog = new THREE.Fog(C3(T.fog), 7, 36);
const mirrorRoot = new THREE.Group(); // 水下那一份：整组 y 翻过来
mirrorRoot.scale.y = -1;
scene.add(mirrorRoot);

function resize() {
  vw = innerWidth;
  vh = innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.fov = vw < vh ? 92 : 70; // 竖屏：横向视野别太窄
  camera.updateProjectionMatrix();
  light?.resize();
  buildPage();
}
resize();
addEventListener('resize', resize);

/* ══ 院子：方格上的几间房，墙长在「两边不是同一间」的格线上，门洞在约定处留空 ══ */
const ROOMS = [
  { x0: -5, x1: 5, z0: -5, z1: 5, h: 3.2 }, // 0 落脚的院
  { x0: -5, x1: 5, z0: -17, z1: -5, h: 5.2 }, // 1 北边高院
  { x0: 5, x1: 13, z0: -11, z1: -1, h: 2.6 }, // 2 东边矮院
  { x0: -12, x1: -5, z0: -13, z1: -5, h: 3.8 }, // 3 西边空院（留给以后）
  { x0: -2, x1: 2, z0: -21, z1: -17, h: 2.4 }, // 4 最里面一小间
];
/* 门：ax = 'x' 表示竖线 x = at 上、沿 z 的 [a, b) 一段；'z' 同理 */
const DOORS = [
  { ax: 'z', at: -5, a: -1, b: 1 },
  { ax: 'x', at: 5, a: -4, b: -2 },
  { ax: 'x', at: 5, a: -9, b: -7 },
  { ax: 'x', at: -5, a: -11, b: -9 },
  { ax: 'z', at: -17, a: -1, b: 1 },
];
const roomAt = (x, z) => ROOMS.findIndex((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
const isDoor = (ax, at, u) => DOORS.some((d) => d.ax === ax && d.at === at && u >= d.a && u < d.b);
const WALLS = []; // 碰撞用的 AABB
const T_W = 0.3;
const LINTEL = 2.5;

const wallMat = new THREE.ShaderMaterial({
  uniforms: {
    uBase: { value: V3(T.wall) }, uSky: { value: V3(T.skyTint) }, uFog: { value: V3(T.fog) },
    uMirror: { value: 0 }, uDim: { value: T.mirror }, uLo: { value: DAY ? 0.7 : 0.38 },
  },
  vertexShader: `varying vec3 vW; varying vec3 vN;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uBase, uSky, uFog; uniform float uMirror, uDim, uLo; varying vec3 vW; varying vec3 vN;
    void main(){
      float y = abs(vW.y);
      float up = smoothstep(0.0, 4.8, y);                 // 天从上面照下来：越高越亮
      float face = abs(vN.y) > 0.5 ? 1.22 : (abs(vN.x) > 0.5 ? 0.9 : 1.0);
      vec3 c = uBase * (uLo + (1.0 - uLo) * up) * face + uSky * 0.16 * up;
      c *= 0.9 + 0.1 * smoothstep(0.0, 0.25, y);          // 墙脚贴水那一线略暗
      float d = distance(cameraPosition, vW);
      c = mix(c, uFog, smoothstep(6.0, 34.0, d) * 0.8);
      if (uMirror > 0.5) c *= uDim;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const wallMatM = wallMat.clone();
wallMatM.uniforms.uMirror.value = 1;
wallMatM.side = THREE.DoubleSide;

function addBox(cx, cy, cz, sx, sy, sz, collide) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const m = new THREE.Mesh(geo, wallMat);
  m.position.set(cx, cy, cz);
  scene.add(m);
  const mm = new THREE.Mesh(geo, wallMatM);
  mm.position.set(cx, cy, cz);
  mirrorRoot.add(mm);
  if (collide) WALLS.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
}
/* 墙头一道压顶：比墙宽一点、薄薄一层，让墙在天底下有一条清楚的上沿 */
function addCap(cx, top, cz, sx, sz) {
  const geo = new THREE.BoxGeometry(sx + 0.14, 0.1, sz + 0.14);
  const m = new THREE.Mesh(geo, wallMat);
  m.position.set(cx, top + 0.05, cz);
  scene.add(m);
  const mm = new THREE.Mesh(geo, wallMatM);
  mm.position.set(cx, top + 0.05, cz);
  mirrorRoot.add(mm);
}
function buildWalls() {
  const X0 = -13, X1 = 14, Z0 = -22, Z1 = 6;
  // 沿一条格线把墙段 / 门段收成一段一段
  const runLine = (ax, at, u0, u1, idA, idB) => {
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const len = cur.b - cur.a, mid = (cur.a + cur.b) / 2;
      if (cur.door) {
        const hh = cur.h - LINTEL;
        if (hh > 0.05) {
          if (ax === 'x') addBox(at, LINTEL + hh / 2, mid, T_W, hh, len, false);
          else addBox(mid, LINTEL + hh / 2, at, len, hh, T_W, false);
        }
      } else if (ax === 'x') addBox(at, cur.h / 2, mid, T_W, cur.h, len, true);
      else addBox(mid, cur.h / 2, at, len, cur.h, T_W, true);
      if (ax === 'x') addCap(at, cur.h, mid, T_W, len);
      else addCap(mid, cur.h, at, len, T_W);
      cur = null;
    };
    for (let u = u0; u < u1; u++) {
      const a = idA(u), b = idB(u);
      if (a === b) { flush(); continue; }
      const h = Math.max(a >= 0 ? ROOMS[a].h : 0, b >= 0 ? ROOMS[b].h : 0);
      const door = isDoor(ax, at, u);
      if (cur && cur.h === h && cur.door === door && cur.b === u) cur.b = u + 1;
      else { flush(); cur = { a: u, b: u + 1, h, door }; }
    }
    flush();
  };
  for (let x = X0; x <= X1; x++) runLine('x', x, Z0, Z1, (z) => roomAt(x - 0.5, z + 0.5), (z) => roomAt(x + 0.5, z + 0.5));
  for (let z = Z0; z <= Z1; z++) runLine('z', z, X0, X1, (x) => roomAt(x + 0.5, z - 0.5), (x) => roomAt(x + 0.5, z + 0.5));
}
buildWalls();

/* ══ 水面：半透明，透过它看见水下倒置的墙与那片天；涟漪在着色器里画 ══ */
const RIP = 16;
const ripples = Array.from({ length: RIP }, () => new THREE.Vector3(0, 0, -99));
let ripI = 0;
function ripple(x, z, t) {
  ripples[ripI].set(x, z, t);
  ripI = (ripI + 1) % RIP;
}
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 }, uRip: { value: ripples }, uDeep: { value: V3(T.deep) }, uHi: { value: V3(T.hi) },
    uFog: { value: V3(T.fog) }, uA: { value: new THREE.Vector2(...T.alpha) },
  },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uRip[${RIP}]; uniform vec3 uDeep, uHi, uFog; uniform vec2 uA; varying vec3 vW;
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      float ndv = clamp(V.y, 0.0, 1.0);
      float a = mix(uA.x, uA.y, pow(ndv, 0.7));          // 掠射角时更像镜子，往脚下看更像水
      float ring = 0.0;
      for (int i = 0; i < ${RIP}; i++) {
        float age = uTime - uRip[i].z;
        if (age < 0.0 || age > 6.0) continue;
        float d = distance(vW.xz, uRip[i].xy);
        float r = age * 0.9;
        ring += exp(-pow((d - r) * 7.0, 2.0)) * exp(-age * 0.75) * smoothstep(0.0, 0.3, age);
      }
      vec3 c = uDeep + uHi * ring * 0.55;
      float d = distance(cameraPosition, vW);
      c = mix(c, uFog, smoothstep(8.0, 34.0, d) * 0.5);
      gl_FragColor = vec4(c, clamp(a + ring * 0.25, 0.0, 1.0));
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 32), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0, -8);
water.renderOrder = 10;
scene.add(water);

/* ══ 东西：注册表。一样东西一行 ══
   build(ctx) → { obj, hits?, update?(dt, t, ctx), near?(d, ctx), click?(ctx) }
   obj 放进场景；水下会自动多一份倒影。hits 是点击能点中的网格。 */
const frost = (c, e = 0) => new THREE.MeshStandardMaterial({ color: C3(c), roughness: 0.85, metalness: 0, emissive: C3(c), emissiveIntensity: e, transparent: true, opacity: 0.94 });
const say = (text) => {
  const p = document.createElement('p');
  p.className = 'say';
  p.innerHTML = text;
  document.body.appendChild(p);
  return p;
};
const proj = new THREE.Vector3();
function pin(el, pos, on) {
  proj.copy(pos).project(camera);
  const vis = on && proj.z < 1 && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.2;
  el.classList.toggle('on', vis);
  if (vis) el.style.transform = `translate(${((proj.x + 1) / 2) * vw}px, ${((1 - proj.y) / 2) * vh}px) translate(-50%, -100%)`;
}

const THINGS = [
  /* 一位住在北院的（占位）：慢慢绕一圈；人走近就停下、转过来，说一句；点它换一句 */
  {
    id: 'walker',
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.45, 7), frost(DAY ? [0.95, 0.95, 0.97] : [0.78, 0.74, 0.86], 0.08));
      body.position.y = 0.73;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), frost(DAY ? [1, 0.98, 0.96] : [0.92, 0.86, 0.9], 0.35));
      head.position.y = 1.66;
      g.add(body, head);
      const lines = ['你也是从上面下来的？', '水一直这么浅。', '<small>占位 · 以后换成真的话</small>……'];
      let li = 0;
      const el = say(lines[0]);
      const path = [[-2.5, -8], [2.8, -9], [2.5, -14], [-2.6, -13.5]];
      let wi = 0, wait = 0, stepAcc = 0;
      const tgt = new THREE.Vector3();
      g.position.set(-2.5, 0, -8);
      return {
        obj: g, hits: [body, head],
        update(dt, t, ctx) {
          const near = ctx.dist(g.position) < 3.4;
          head.position.y = 1.66 + Math.sin(t * 1.3) * 0.03;
          if (near) {
            const want = Math.atan2(ctx.cam.x - g.position.x, ctx.cam.z - g.position.z);
            g.rotation.y += (((want - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.06;
          } else if (wait > 0) wait -= dt;
          else {
            tgt.set(path[wi][0], 0, path[wi][1]);
            const dx = tgt.x - g.position.x, dz = tgt.z - g.position.z, d = Math.hypot(dx, dz);
            if (d < 0.1) { wi = (wi + 1) % path.length; wait = 1.5 + Math.random() * 2; }
            else {
              const s = Math.min(d, dt * 0.55);
              g.position.x += (dx / d) * s;
              g.position.z += (dz / d) * s;
              g.rotation.y = Math.atan2(dx, dz);
              if ((stepAcc += s) > 0.6) { stepAcc = 0; ripple(g.position.x, g.position.z, t); }
            }
          }
          pin(el, new THREE.Vector3(g.position.x, 2.15, g.position.z), near);
        },
        click(ctx) {
          li = (li + 1) % lines.length;
          el.innerHTML = lines[li];
          ripple(g.position.x, g.position.z, ctx.t);
        },
      };
    },
  },
  /* 东院里的一个球（占位玩具）：走过去会被碰开，点它踢一脚；在水上滚出一路涟漪，碰墙弹回 */
  {
    id: 'ball',
    build() {
      const R = 0.32;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), frost(DAY ? [0.98, 0.97, 0.95] : [0.86, 0.78, 0.74], 0.12));
      m.position.set(9, R, -6);
      const v = new THREE.Vector2();
      let acc = 0;
      const axis = new THREE.Vector3();
      return {
        obj: m, hits: [m],
        update(dt, t, ctx) {
          const dx = m.position.x - ctx.cam.x, dz = m.position.z - ctx.cam.z, d = Math.hypot(dx, dz);
          if (d < 0.75 && ctx.speed > 0.2) v.set(dx / d, dz / d).multiplyScalar(ctx.speed * 1.4);
          const sp = v.length();
          if (sp < 0.01) return;
          const p = { x: m.position.x + v.x * dt, z: m.position.z + v.y * dt };
          const hit = collide(p, R);
          if (hit) { // 撞墙：沿法线反弹
            const n = new THREE.Vector2(p.x - (m.position.x + v.x * dt), p.z - (m.position.z + v.y * dt)).normalize();
            v.sub(n.clone().multiplyScalar(2 * v.dot(n))).multiplyScalar(0.7);
            ripple(p.x, p.z, t);
          }
          axis.set(v.y, 0, -v.x).normalize();
          m.rotateOnWorldAxis(axis, (sp * dt) / R);
          m.position.x = p.x;
          m.position.z = p.z;
          v.multiplyScalar(Math.exp(-dt * 0.55));
          if ((acc += sp * dt) > 0.45) { acc = 0; ripple(p.x, p.z, t); }
        },
        click(ctx) {
          const dx = m.position.x - ctx.cam.x, dz = m.position.z - ctx.cam.z, d = Math.hypot(dx, dz) || 1;
          v.set(dx / d, dz / d).multiplyScalar(4.2);
          ripple(m.position.x, m.position.z, ctx.t);
        },
      };
    },
  },
  /* 最里面一小间：一件东西（占位）。悬在台上慢慢转；走近显一行字；点它转快一下 */
  {
    id: 'relic',
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), frost(T.wall.map((c) => c * 0.9)));
      base.position.y = 0.425;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), frost(DAY ? [1, 0.96, 0.9] : [0.96, 0.82, 0.7], 0.55));
      gem.position.y = 1.45;
      g.add(base, gem);
      g.position.set(0, 0, -19.4);
      const el = say('一件东西<small>占位 · 以后放真的</small>');
      let spin = 0.4;
      return {
        obj: g, hits: [gem, base],
        update(dt, t, ctx) {
          spin += (0.4 - spin) * dt * 0.8;
          gem.rotation.y += spin * dt;
          gem.position.y = 1.45 + Math.sin(t * 0.9) * 0.05;
          pin(el, new THREE.Vector3(g.position.x, 2.05, g.position.z), ctx.dist(g.position) < 3);
        },
        click(ctx) {
          spin = 6;
          ripple(g.position.x + 0.6, g.position.z + 0.6, ctx.t);
          ripple(g.position.x - 0.6, g.position.z + 0.6, ctx.t + 0.25);
        },
      };
    },
  },
];

const live = THINGS.map((def) => {
  const th = def.build();
  scene.add(th.obj);
  const m = th.obj.clone(true); // 倒影：与本体同步变换
  mirrorRoot.add(m);
  m.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.side = THREE.DoubleSide;
      o.material.color?.multiplyScalar(T.mirror);
    }
  });
  th.mirror = m;
  for (const h of th.hits || []) h.userData.thing = th;
  return th;
});
const hitList = live.flatMap((th) => th.hits || []);

/* ══ 碰撞：圆对墙段的 AABB，推出去。返回是否碰到了 ══ */
function collide(p, r) {
  let hit = false;
  for (const w of WALLS) {
    const cx = clamp(p.x, w.x0, w.x1), cz = clamp(p.z, w.z0, w.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      const d = Math.sqrt(d2) || 1e-4;
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    }
  }
  return hit;
}

/* ══ 人 ══ */
const EYE = 1.6;
const me = { x: 0, z: 2.6, yaw: 0, pitch: 0, speed: 0 };
const look = { yaw: 0, pitch: 0 };
let goal = null;
const keys = new Set();
addEventListener('keydown', (e) => {
  if (arrive < 1) return;
  keys.add(e.key.toLowerCase());
  goal = null;
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, moved: 0 };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (arrive >= 1) {
    ndc.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    root.classList.toggle('hot', ray.intersectObjects(hitList, false).length > 0);
  }
  if (!drag || arrive < 1) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  look.yaw = drag.yaw + dx * 0.0042;
  look.pitch = clamp(drag.pitch + dy * 0.0036, -1.1, 1.2);
});
cv.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (!d || d.moved > 5 || arrive < 1) return;
  ndc.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...hitList, water], false);
  if (!hits.length) return;
  const th = hits[0].object.userData.thing;
  if (th) {
    const dist = hits[0].distance;
    if (dist < 5.5) th.click?.(ctx);
    else goal = { x: hits[0].point.x, z: hits[0].point.z, stop: 1.8 }; // 远了先走过去
  } else {
    goal = { x: hits[0].point.x, z: hits[0].point.z, stop: 0.1 };
    ripple(goal.x, goal.z, clock);
  }
});

/* ══ 进站：抬头看着检索页 → 颜色并成一种 → 低下头，院墙从下面升起来 ══ */
let t0 = -1;
let arrive = 0;
const descend = onDescend(() => {
  t0 = performance.now() - (RM ? DUR : 0);
  root.classList.add('go');
});
if (opt.auto >= 0) setTimeout(descend.fire, opt.auto);

const ctx = {
  t: 0,
  cam: { x: 0, z: 0 },
  speed: 0,
  dist: (p) => Math.hypot(p.x - me.x, p.z - me.z),
};

/* ══ 帧 ══ */
let clock = 0;
let last = performance.now();
let stepAcc = 0;
const stat = document.getElementById('stat');
function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  clock += dt;
  arrive = AT >= 0 ? AT : t0 < 0 ? 0 : clamp((ts - t0) / DUR, 0, 1);
  if (arrive >= 1) root.classList.add('done');

  const unify = sstep(0.05, 0.55, arrive);
  const bow = inOut((arrive - 0.22) / 0.78); // 低头的进度
  // 检索页的栏头与卡片：往上飘走、淡掉（它们在天上）
  if (arrive < 0.7) {
    pageKids().forEach((el, i) => {
      const k = +el.dataset.k || 0;
      const lag = ((i * 0.137) % 1) * 0.12;
      const p = sstep(0.02 + lag, 0.5 + lag, arrive);
      el.style.opacity = (1 - p).toFixed(3);
      el.style.transform = `translate3d(${((k - 1) * 30 * p).toFixed(1)}px, ${(-vh * 0.55 * p * p).toFixed(1)}px, 0) scale(${(1 - 0.25 * p).toFixed(3)})`;
      el.style.filter = p > 0.01 ? `blur(${(p * 4).toFixed(2)}px)` : '';
    });
  }
  pageEl.style.display = arrive >= 0.7 ? 'none' : '';

  // 走
  let mx = 0, mz = 0;
  if (arrive >= 1) {
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (f || s) {
      mx = -Math.sin(me.yaw) * f + Math.cos(me.yaw) * s;
      mz = -Math.cos(me.yaw) * f - Math.sin(me.yaw) * s;
    } else if (goal) {
      const dx = goal.x - me.x, dz = goal.z - me.z, d = Math.hypot(dx, dz);
      if (d < goal.stop) goal = null;
      else { mx = dx / d; mz = dz / d; }
    }
  }
  const ml = Math.hypot(mx, mz);
  const sp = 2.3;
  const px = me.x, pz = me.z;
  if (ml > 0) {
    const p = { x: me.x + (mx / ml) * sp * dt, z: me.z + (mz / ml) * sp * dt };
    collide(p, 0.32);
    me.x = p.x;
    me.z = p.z;
    if (goal && Math.hypot(me.x - px, me.z - pz) < sp * dt * 0.2) goal = null; // 卡住了就停
  }
  const moved = Math.hypot(me.x - px, me.z - pz);
  me.speed = dt > 0 ? moved / dt : 0;
  if ((stepAcc += moved) > 0.75) { stepAcc = 0; ripple(me.x, me.z, clock); }

  // 看：转场时从仰视（正上方）低下来；之后拖拽
  me.yaw += (look.yaw - me.yaw) * 0.18;
  me.pitch += (look.pitch - me.pitch) * 0.18;
  const pitch = lerp(Math.PI / 2 - 0.02, 0, bow) + me.pitch * sstep(0.95, 1, arrive);
  camera.position.set(me.x, EYE + Math.sin(clock * 1.7) * 0.004 * me.speed, me.z);
  camera.rotation.set(pitch, me.yaw, 0);

  ctx.t = clock;
  ctx.cam.x = me.x;
  ctx.cam.z = me.z;
  ctx.speed = me.speed;
  for (const th of live) {
    th.update?.(dt, clock, ctx);
    th.mirror.position.copy(th.obj.position);
    th.mirror.quaternion.copy(th.obj.quaternion);
    th.obj.children.forEach((c, i) => {
      const mc = th.mirror.children[i];
      if (mc) { mc.position.copy(c.position); mc.quaternion.copy(c.quaternion); }
    });
  }
  waterMat.uniforms.uTime.value = clock;

  if (light) {
    light.draw({
      t: clock * 0.7,
      // 天跟着头转：往左看，天往右走；低头，天往上走
      pan: { x: me.yaw * 0.45, y: pitch * 0.55 },
      zoom: 0.35,
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
  renderer.render(scene, camera);
  if (opt.debug) stat.textContent = `${arrive.toFixed(2)} · ${me.x.toFixed(1)}, ${me.z.toFixed(1)}`;
  requestAnimationFrame(tick);
}
/* 截图用：?pos=x,z,yaw 直接站到某处 */
if (q.has('pos')) {
  const [x, z, y] = q.get('pos').split(',').map(Number);
  me.x = x; me.z = z; look.yaw = me.yaw = y || 0;
}
if (q.has('pitch')) look.pitch = me.pitch = +q.get('pitch');
requestAnimationFrame(tick);
