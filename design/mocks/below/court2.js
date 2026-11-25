/* ─────────────────────────────────────────────────────────────
 below · court2：院落 · 点击式

 和 court.js 的区别：
 1. 不再自由走动。每间院子站在一处，看四面墙：点屏幕左右两侧换面，视角随鼠标微微浮动；
    点门洞走到下一间（面朝不变）；点东西碰它；点上方（或滚轮往上 / Esc）抬头，回到检索页。
 2. 墙不打光。每面墙是一扇窗：透过它看到的是同一片流光（#light 那张画布，按屏幕坐标取）——
    换一套更浅的色、像素格放大一档。墙与墙之间只靠一点明度差与一圈细轮廓分开。
    于是它读起来不是「有体积的石墙」，而是一张会动的拼贴；与主页大字「流光的一扇窗」同一个手法。
    ?wall=plain 换回 court.js 那种按高度打光的墙，做对照。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';
import { clamp, lerp, sstep, inOut, TAN, layout, INK, options, RM } from './common.js';

const THREE = window.THREE;
const opt = options();
const q = new URLSearchParams(location.search);
const AT = q.has('at') ? +q.get('at') : -1;
const DAY = q.get('sky') === 'day';
const PLAIN = q.get('wall') === 'plain';
const root = document.documentElement;
if (DAY) root.classList.add('day');
const DUR = 4.2; // 进 / 出一趟（秒）

/* ══ 色 ══ */
const T = DAY
  ? {
      sky: DREAM.essay.map((c) => c.slice()), grain: [0.42, 0.16, 40],
      lum: [0.7, 0.9], lo: [0.6, 0.63, 0.7], hi: [0.98, 0.98, 1.0], edge: [0.42, 0.46, 0.56], edgeA: 0.5,
      wall: [0.8, 0.8, 0.84], skyTint: [0.84, 0.87, 0.92], fog: [0.8, 0.83, 0.88],
      deep: [0.56, 0.6, 0.68], hi2: [1, 1, 1], mirror: 0.9, alpha: [0.14, 0.6],
      say: ['#232830', 'rgba(250,251,253,0.55)', 'rgba(52,62,82,0.2)'],
    }
  : {
      sky: DREAM.home.map((c) => c.slice()), grain: [1, 0.3, 26],
      lum: [0.07, 0.34], lo: [0.34, 0.32, 0.42], hi: [0.84, 0.79, 0.88], edge: [0.9, 0.86, 0.95], edgeA: 0.42,
      wall: [0.44, 0.42, 0.52], skyTint: [0.29, 0.27, 0.44], fog: [0.11, 0.11, 0.19],
      deep: [0.05, 0.05, 0.09], hi2: [0.82, 0.76, 0.88], mirror: 0.8, alpha: [0.16, 0.72],
      say: ['#eee8f2', 'rgba(20,18,34,0.42)', 'rgba(232,226,240,0.18)'],
    };
for (const k of ['essay', 'moment', 'project']) {
  WAKE[k] = T.sky.map((c) => c.slice());
  GRAIN[k] = T.grain.slice();
}
root.style.setProperty('--say-fg', T.say[0]);
root.style.setProperty('--say-bg', T.say[1]);
root.style.setProperty('--say-edge', T.say[2]);
const V3 = (c) => new THREE.Vector3(...c);
const C3 = (c) => new THREE.Color(...c);

/* ══ 流光（天，也是墙里那片光的来源） ══ */
const glc = document.getElementById('light');
const light = createLight(glc, opt.px, { wind: false });
let vw = innerWidth, vh = innerHeight;

/* ══ 检索页（起点 / 回去的地方） ══ */
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
buildPage();

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
scene.fog = new THREE.Fog(C3(T.fog), 9, 40);
const mirrorRoot = new THREE.Group();
mirrorRoot.scale.y = -1;
scene.add(mirrorRoot);

const skyTex = new THREE.CanvasTexture(glc);
skyTex.magFilter = THREE.NearestFilter;
skyTex.minFilter = THREE.NearestFilter;
skyTex.generateMipmaps = false;
const bufSize = new THREE.Vector2();

function resize() {
  vw = innerWidth;
  vh = innerHeight;
  renderer.setSize(vw, vh, false);
  renderer.getDrawingBufferSize(bufSize);
  camera.aspect = vw / vh;
  camera.fov = vw < vh ? 92 : 70;
  camera.updateProjectionMatrix();
  light?.resize();
  buildPage();
}

/* ══ 院子 ══ */
const ROOMS = [
  { x0: -7, x1: 7, z0: -6, z1: 7, h: 3.0 }, // 0 落脚的院
  { x0: -7, x1: 7, z0: -22, z1: -6, h: 4.6 }, // 1 北边高院
  { x0: 7, x1: 17, z0: -14, z1: -1, h: 2.6 }, // 2 东边矮院
  { x0: -17, x1: -7, z0: -17, z1: -6, h: 3.4 }, // 3 西边空院（留给以后）
  { x0: -3, x1: 3, z0: -28, z1: -22, h: 2.4 }, // 4 最里面一小间
];
for (const r of ROOMS) r.at = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const DOORS = [
  { ax: 'z', at: -6, a: -1, b: 1 },
  { ax: 'x', at: 7, a: -4, b: -2 },
  { ax: 'x', at: 7, a: -12, b: -10 },
  { ax: 'x', at: -7, a: -14, b: -12 },
  { ax: 'z', at: -22, a: -1, b: 1 },
];
const roomAt = (x, z) => ROOMS.findIndex((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
const isDoor = (ax, at, u) => DOORS.some((d) => d.ax === ax && d.at === at && u >= d.a && u < d.b);
const WALLS = [];
const T_W = 0.3;
const LINTEL = 2.5;

const wallUniforms = () => ({
  uSky: { value: skyTex }, uRes: { value: bufSize }, uLum: { value: new THREE.Vector2(...T.lum) },
  uLo: { value: V3(T.lo) }, uHi: { value: V3(T.hi) }, uFog: { value: V3(T.fog) },
  uBase: { value: V3(T.wall) }, uTint: { value: V3(T.skyTint) },
  uMirror: { value: 0 }, uDim: { value: T.mirror }, uPlain: { value: PLAIN ? 1 : 0 }, uLow: { value: DAY ? 0.7 : 0.38 },
});
const wallMat = new THREE.ShaderMaterial({
  uniforms: wallUniforms(),
  vertexShader: `varying vec3 vW; varying vec3 vN;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D uSky; uniform vec2 uRes, uLum; uniform vec3 uLo, uHi, uFog, uBase, uTint;
    uniform float uMirror, uDim, uPlain, uLow; varying vec3 vW; varying vec3 vN;
    void main(){
      vec3 c;
      float d = distance(cameraPosition, vW);
      if (uPlain > 0.5) {
        float up = smoothstep(0.0, 4.8, abs(vW.y));
        float face = abs(vN.y) > 0.5 ? 1.22 : (abs(vN.x) > 0.5 ? 0.9 : 1.0);
        c = uBase * (uLow + (1.0 - uLow) * up) * face + uTint * 0.16 * up;
        c = mix(c, uFog, smoothstep(6.0, 34.0, d) * 0.8);
      } else {
        // 一扇窗：按屏幕坐标取那片流光，放大一档（像素格变粗），换一套浅色
        vec2 s = gl_FragCoord.xy / uRes;
        vec2 u = (s - 0.5) * 0.56 + 0.5 + vec2(0.17, -0.09);
        vec3 k = texture2D(uSky, u).rgb;
        float l = smoothstep(uLum.x, uLum.y, dot(k, vec3(0.299, 0.587, 0.114)));
        c = mix(uLo, uHi, l);
        // 面与面只差一点明度：朝 x 的、朝 z 的、朝上的（压顶）
        c *= abs(vN.y) > 0.5 ? 1.1 : (abs(vN.x) > 0.5 ? 0.9 : 1.0);
        c = mix(c, uFog, smoothstep(10.0, 40.0, d) * 0.45);
      }
      if (uMirror > 0.5) c *= uDim;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const wallMatM = new THREE.ShaderMaterial({ uniforms: { ...wallUniforms(), uMirror: { value: 1 } }, vertexShader: wallMat.vertexShader, fragmentShader: wallMat.fragmentShader, side: THREE.DoubleSide });
const edgeMat = new THREE.LineBasicMaterial({ color: C3(T.edge), transparent: true, opacity: PLAIN ? 0 : T.edgeA, fog: true });
const edgeMatM = new THREE.LineBasicMaterial({ color: C3(T.edge), transparent: true, opacity: PLAIN ? 0 : T.edgeA * 0.45, fog: true });

function addBox(cx, cy, cz, sx, sy, sz, collide) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const eg = new THREE.EdgesGeometry(geo);
  for (const [parent, mat, em] of [[scene, wallMat, edgeMat], [mirrorRoot, wallMatM, edgeMatM]]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    parent.add(m);
    const e = new THREE.LineSegments(eg, em);
    e.position.set(cx, cy, cz);
    parent.add(e);
  }
  if (collide) WALLS.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
}
(function buildWalls() {
  const X0 = -18, X1 = 18, Z0 = -29, Z1 = 8;
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
})();

/* ══ 水 ══ */
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
    uTime: { value: 0 }, uRip: { value: ripples }, uDeep: { value: V3(T.deep) }, uHi: { value: V3(T.hi2) },
    uFog: { value: V3(T.fog) }, uA: { value: new THREE.Vector2(...T.alpha) },
  },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uRip[${RIP}]; uniform vec3 uDeep, uHi, uFog; uniform vec2 uA; varying vec3 vW;
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      float a = mix(uA.x, uA.y, pow(clamp(V.y, 0.0, 1.0), 0.7));
      float ring = 0.0;
      for (int i = 0; i < ${RIP}; i++) {
        float age = uTime - uRip[i].z;
        if (age < 0.0 || age > 6.0) continue;
        float d = distance(vW.xz, uRip[i].xy);
        ring += exp(-pow((d - age * 0.9) * 7.0, 2.0)) * exp(-age * 0.75) * smoothstep(0.0, 0.3, age);
      }
      vec3 c = uDeep + uHi * ring * 0.55;
      c = mix(c, uFog, smoothstep(8.0, 34.0, distance(cameraPosition, vW)) * 0.5);
      gl_FragColor = vec4(c, clamp(a + ring * 0.25, 0.0, 1.0));
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 42), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0, -10.5);
water.renderOrder = 10;
scene.add(water);

/* ══ 东西：注册表 ══
   build() → { obj, hits, update?(dt, t, ctx), click?(ctx) }；ctx.room 是人此刻所在的那间 */
const frost = (c, e = 0) => new THREE.MeshStandardMaterial({ color: C3(c), roughness: 0.85, metalness: 0, emissive: C3(c), emissiveIntensity: e, transparent: true, opacity: 0.95 });
const say = (text) => {
  const p = document.createElement('p');
  p.className = 'say';
  p.innerHTML = text;
  document.body.appendChild(p);
  return p;
};
const pv = new THREE.Vector3();
function pin(el, pos, on) {
  pv.copy(pos).project(camera);
  const vis = on && pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1;
  el.classList.toggle('on', vis);
  if (vis) el.style.transform = `translate(${((pv.x + 1) / 2) * vw}px, ${((1 - pv.y) / 2) * vh}px) translate(-50%, -100%)`;
}

const THINGS = [
  {
    id: 'walker', // 北院：绕着人站的那一处慢慢走；同一间里、离得不远就停下转过来说一句
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
      const path = [[-4, -9.5], [4, -10.5], [4.5, -18.5], [-4, -18]];
      let wi = 0, wait = 0, acc = 0, talk = 0;
      g.position.set(-4, 0, -9.5);
      return {
        obj: g, hits: [body, head],
        update(dt, t, ctx) {
          head.position.y = 1.66 + Math.sin(t * 1.3) * 0.03;
          const here = ctx.room === 1 && !ctx.moving;
          talk = here ? talk + dt : 0;
          if (here && talk > 0.6) {
            const want = Math.atan2(ctx.cam.x - g.position.x, ctx.cam.z - g.position.z);
            g.rotation.y += (((want - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.05;
          } else if (wait > 0) wait -= dt;
          else {
            const dx = path[wi][0] - g.position.x, dz = path[wi][1] - g.position.z, d = Math.hypot(dx, dz);
            if (d < 0.1) { wi = (wi + 1) % path.length; wait = 1.5 + Math.random() * 2; }
            else {
              const s = Math.min(d, dt * 0.55);
              g.position.x += (dx / d) * s;
              g.position.z += (dz / d) * s;
              g.rotation.y = Math.atan2(dx, dz);
              if ((acc += s) > 0.6) { acc = 0; ripple(g.position.x, g.position.z, t); }
            }
          }
          pin(el, new THREE.Vector3(g.position.x, 2.15, g.position.z), here && talk > 1.2);
        },
        click(ctx) {
          li = (li + 1) % lines.length;
          el.innerHTML = lines[li];
          talk = Math.max(talk, 1.2);
          ripple(g.position.x, g.position.z, ctx.t);
        },
      };
    },
  },
  {
    id: 'ball', // 东院：点它，从你这边被踢开；在水上滚出一路涟漪，碰墙弹回
    build() {
      const R = 0.32;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), frost(DAY ? [0.98, 0.97, 0.95] : [0.86, 0.78, 0.74], 0.12));
      m.position.set(14.2, R, -10.8);
      const v = new THREE.Vector2();
      const axis = new THREE.Vector3();
      let acc = 0;
      return {
        obj: m, hits: [m],
        update(dt, t) {
          const sp = v.length();
          if (sp < 0.01) return;
          const p = { x: m.position.x + v.x * dt, z: m.position.z + v.y * dt };
          const px = p.x, pz = p.z;
          if (collide(p, R)) {
            const n = new THREE.Vector2(p.x - px, p.z - pz).normalize();
            v.sub(n.clone().multiplyScalar(2 * v.dot(n))).multiplyScalar(0.7);
            ripple(p.x, p.z, t);
          }
          // 别滚到人站的那一处上（点击式里人不会被撞开）
          const st = ROOMS[2].at, dx = p.x - st[0], dz = p.z - st[1], d = Math.hypot(dx, dz);
          if (d < 1) { p.x = st[0] + (dx / d); p.z = st[1] + (dz / d); v.set(dx / d, dz / d).multiplyScalar(sp * 0.7); }
          axis.set(v.y, 0, -v.x).normalize();
          m.rotateOnWorldAxis(axis, (sp * dt) / R);
          m.position.x = p.x;
          m.position.z = p.z;
          v.multiplyScalar(Math.exp(-dt * 0.5));
          if ((acc += sp * dt) > 0.45) { acc = 0; ripple(p.x, p.z, t); }
        },
        click(ctx) {
          const dx = m.position.x - ctx.cam.x, dz = m.position.z - ctx.cam.z, d = Math.hypot(dx, dz) || 1;
          v.set(dx / d + (Math.random() - 0.5) * 0.6, dz / d + (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(4.4);
          ripple(m.position.x, m.position.z, ctx.t);
        },
      };
    },
  },
  {
    id: 'relic', // 最里面一小间：一件东西（占位）
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), frost(T.wall.map((c) => c * 0.9)));
      base.position.y = 0.425;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), frost(DAY ? [1, 0.96, 0.9] : [0.96, 0.82, 0.7], 0.55));
      gem.position.y = 1.45;
      g.add(base, gem);
      g.position.set(0, 0, -26.6);
      const el = say('一件东西<small>占位 · 以后放真的</small>');
      let spin = 0.4;
      return {
        obj: g, hits: [gem, base],
        update(dt, t, ctx) {
          spin += (0.4 - spin) * dt * 0.8;
          gem.rotation.y += spin * dt;
          gem.position.y = 1.45 + Math.sin(t * 0.9) * 0.05;
          pin(el, new THREE.Vector3(g.position.x, 2.05, g.position.z), ctx.room === 4 && !ctx.moving);
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
  const m = th.obj.clone(true);
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

/* ══ 人：站在某间的那一处，看四面之一 ══
   face：0 北（−z）、1 西、2 南、3 东；yaw = face · 90°（往左转 = +90°） */
const EYE = 1.6;
/* 站在哪：看哪一面，就退到这间院子靠另一头的地方，隔着整间院子看过去 */
function standAt(room, face) {
  const r = ROOMS[room], f = mod4(face);
  const fx = f === 1 ? -1 : f === 3 ? 1 : 0, fz = f === 0 ? -1 : f === 2 ? 1 : 0;
  const half = fx ? (r.x1 - r.x0) / 2 : (r.z1 - r.z0) / 2;
  const back = clamp(half - 1.6, 0, 4);
  return [r.at[0] - fx * back, r.at[1] - fz * back];
}
const me = { room: 0, face: 0, x: 0, z: 0, yaw: 0 };
let move = null; // { kind: 'turn' | 'walk', t0, dur, … }
function mod4(n) { return ((n % 4) + 4) % 4; }
[me.x, me.z] = standAt(0, 0);
const sway = { x: 0, y: 0, tx: 0, ty: 0 };

/* 这一面墙上的门 → [{ door, to, a: Vector3[4]（门洞四角） }] */
function doorsAhead(room = me.room, face = me.face) {
  const r = ROOMS[room];
  const f = mod4(face);
  const ax = f === 0 || f === 2 ? 'z' : 'x';
  const at = f === 0 ? r.z0 : f === 2 ? r.z1 : f === 1 ? r.x0 : r.x1;
  const [u0, u1] = ax === 'z' ? [r.x0, r.x1] : [r.z0, r.z1];
  return DOORS.filter((d) => d.ax === ax && d.at === at && d.a >= u0 && d.b <= u1).map((d) => {
    const mid = (d.a + d.b) / 2;
    const out = f === 0 || f === 1 ? -0.5 : 0.5;
    const to = ax === 'z' ? roomAt(mid, at + out) : roomAt(at + out, mid);
    const P = (u, y) => (ax === 'z' ? new THREE.Vector3(u, y, at) : new THREE.Vector3(at, y, u));
    return { d, to, mid, ax, at, out, quad: [P(d.a, 0), P(d.b, 0), P(d.b, LINTEL), P(d.a, LINTEL)] };
  });
}
function screenRect(quad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of quad) {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    const sx = ((pv.x + 1) / 2) * vw, sy = ((1 - pv.y) / 2) * vh;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x0, y0, x1, y1 };
}
function turn(dir) {
  if (move) return;
  const from = me.face;
  me.face += dir;
  const [x1, z1] = standAt(me.room, me.face);
  move = { kind: 'turn', t0: clock, dur: RM ? 0.01 : 1.1, y0: from * (Math.PI / 2), y1: me.face * (Math.PI / 2), x0: me.x, z0: me.z, x1, z1 };
}
function walkThrough(dr) {
  if (move || dr.to < 0) return;
  const r2 = ROOMS[dr.to];
  const P = (u, off) => (dr.ax === 'z' ? [u, dr.at + off] : [dr.at + off, u]);
  const pts = [[me.x, me.z], P(dr.mid, -dr.out * 1.1), P(dr.mid, dr.out * 1.1), standAt(dr.to, me.face)];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  move = { kind: 'walk', t0: clock, dur: RM ? 0.01 : Math.max(1.4, len / 2.6), pts, len, to: dr.to, acc: 0, lx: me.x, lz: me.z };
}
/* 沿折线按弧长取点 */
function along(pts, len, s) {
  let d = s * len;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || i === pts.length - 1) {
      const k = l ? clamp(d / l, 0, 1) : 1;
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    }
    d -= l;
  }
  return pts[pts.length - 1];
}

/* ══ 检索页 ⇄ 院子 ══ */
let arrive = AT >= 0 ? AT : 0;
let want = arrive >= 1 ? 1 : 0;
const goIn = () => { want = 1; root.classList.add('go'); };
const goUp = () => { if (!move) want = 0; };

/* ══ 输入 ══ */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ZONE = { side: 0.22, top: 0.16 };
const edgeL = document.getElementById('edgeL');
const edgeR = document.getElementById('edgeR');
const edgeT = document.getElementById('edgeT');
const doorTag = document.getElementById('doorTag');
let hover = null;

/* 指针下面是什么：东西 > 门洞 > 上方 > 两侧 */
function whatIsAt(x, y) {
  if (arrive < 1 || move) return null;
  ndc.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(hitList, false)[0];
  if (h && h.object.userData.thing) return { kind: 'thing', th: h.object.userData.thing };
  if (y < vh * ZONE.top) return { kind: 'up' };
  for (const dr of doorsAhead()) {
    const r = screenRect(dr.quad);
    if (r && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return { kind: 'door', dr, r };
  }
  if (x < vw * ZONE.side) return { kind: 'left' };
  if (x > vw * (1 - ZONE.side)) return { kind: 'right' };
  return null;
}
function act(w) {
  if (!w) return;
  if (w.kind === 'thing') w.th.click?.(ctx);
  else if (w.kind === 'up') goUp();
  else if (w.kind === 'door') walkThrough(w.dr);
  else if (w.kind === 'left') turn(1);
  else if (w.kind === 'right') turn(-1);
}
addEventListener('pointermove', (e) => {
  sway.tx = (e.clientX / vw) * 2 - 1;
  sway.ty = (e.clientY / vh) * 2 - 1;
  hover = whatIsAt(e.clientX, e.clientY);
});
let down = null;
cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return (down = null);
  down = null;
  act(whatIsAt(e.clientX, e.clientY));
});
addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY > 30 && arrive <= 0.001) goIn();
  else if (e.deltaY < -30 && arrive >= 1) goUp();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (arrive <= 0.001 && ['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); return goIn(); }
  if (arrive < 1) return;
  if (e.key === 'ArrowLeft') turn(1);
  else if (e.key === 'ArrowRight') turn(-1);
  else if (e.key === 'ArrowUp') { const d = doorsAhead()[0]; if (d) walkThrough(d); }
  else if (e.key === 'Escape' || e.key === 'PageUp') goUp();
});
let ty0 = null;
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') ty0 = e.clientY; }, { passive: true });
addEventListener('pointermove', (e) => { if (ty0 !== null && arrive <= 0.001 && ty0 - e.clientY > 50) { ty0 = null; goIn(); } }, { passive: true });
addEventListener('pointerup', () => (ty0 = null));
if (opt.auto >= 0) setTimeout(goIn, opt.auto);

const ctx = { t: 0, cam: { x: 0, z: 0 }, room: 0, moving: false };

/* ══ 帧 ══ */
let clock = 0;
let last = performance.now();
let teach = 0; // 刚落地时把三处可点的地方亮一下
const stat = document.getElementById('stat');
function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  clock += dt;
  if (AT < 0) arrive = clamp(arrive + (want ? 1 : -1) * (RM ? 1 : dt / DUR), 0, 1);
  root.classList.toggle('done', arrive >= 1);
  if (arrive <= 0) root.classList.remove('go');

  const unify = sstep(0.05, 0.55, arrive);
  const bow = inOut((arrive - 0.22) / 0.78);
  // 检索页的栏头与卡片：进的时候往上飘走，回来的时候原路落下
  pageEl.style.display = arrive >= 0.7 ? 'none' : '';
  if (arrive < 0.7) {
    [...pageEl.children].forEach((el, i) => {
      const k = +el.dataset.k || 0;
      const lag = ((i * 0.137) % 1) * 0.12;
      const p = sstep(0.02 + lag, 0.5 + lag, arrive);
      el.style.opacity = (1 - p).toFixed(3);
      el.style.transform = p > 0.001 ? `translate3d(${((k - 1) * 30 * p).toFixed(1)}px, ${(-vh * 0.55 * p * p).toFixed(1)}px, 0) scale(${(1 - 0.25 * p).toFixed(3)})` : '';
      el.style.filter = p > 0.01 ? `blur(${(p * 4).toFixed(2)}px)` : '';
    });
  }

  // 转身 / 穿门
  let yaw = me.face * (Math.PI / 2);
  if (move) {
    const k = clamp((clock - move.t0) / move.dur, 0, 1);
    const e = inOut(k);
    if (move.kind === 'turn') {
      yaw = lerp(move.y0, move.y1, e);
      me.x = lerp(move.x0, move.x1, e);
      me.z = lerp(move.z0, move.z1, e);
    }
    else {
      const [x, z] = along(move.pts, move.len, e);
      me.x = x;
      me.z = z;
      if ((move.acc += Math.hypot(x - move.lx, z - move.lz)) > 0.8) { move.acc = 0; ripple(x, z, clock); }
      move.lx = x;
      move.lz = z;
      if (k >= 1) me.room = move.to;
    }
    if (k >= 1) move = null;
  }
  me.yaw = yaw;

  // 视角随鼠标微微浮动
  const live1 = arrive >= 1 ? 1 : 0;
  sway.x += (sway.tx * live1 - sway.x) * 0.05;
  sway.y += (sway.ty * live1 - sway.y) * 0.05;
  const pitch = lerp(Math.PI / 2 - 0.02, 0, bow) - sway.y * 0.06 * sstep(0.9, 1, arrive) + 0.1 * bow; // 站定时视线微微上抬，留出天
  camera.position.set(me.x, EYE, me.z);
  camera.rotation.set(pitch, yaw - sway.x * 0.09, 0);
  camera.updateMatrixWorld();

  ctx.t = clock;
  ctx.cam.x = me.x;
  ctx.cam.z = me.z;
  ctx.room = arrive >= 1 ? me.room : -1;
  ctx.moving = !!move;
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

  // 可点处的提示：悬停时亮；刚落地时三处一起亮一下
  if (arrive >= 1) teach += dt; else teach = 0;
  const showAll = teach > 0.4 && teach < 2.6;
  const hk = move ? null : hover?.kind;
  edgeL.classList.toggle('on', arrive >= 1 && (hk === 'left' || showAll));
  edgeR.classList.toggle('on', arrive >= 1 && (hk === 'right' || showAll));
  edgeT.classList.toggle('on', arrive >= 1 && (hk === 'up' || showAll));
  root.classList.toggle('hot', !!hk);
  if (hk === 'door') {
    const r = screenRect(hover.dr.quad);
    if (r) {
      doorTag.classList.add('on');
      doorTag.style.transform = `translate(${(r.x0 + r.x1) / 2}px, ${r.y0 - 8}px) translate(-50%, -100%)`;
    }
  } else doorTag.classList.remove('on');

  if (light) {
    light.draw({
      t: clock * 0.7,
      pan: { x: yaw * 0.45, y: pitch * 0.55 },
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
    skyTex.needsUpdate = true;
  }
  renderer.render(scene, camera);
  if (opt.debug) stat.textContent = `${arrive.toFixed(2)} · 第 ${me.room} 间 · 面 ${mod4(me.face)}`;
  requestAnimationFrame(tick);
}

/* 截图用：?room=1&face=2 直接站到某一间的某一面 */
if (q.has('room')) {
  me.room = +q.get('room');
}
if (q.has('face')) me.face = +q.get('face');
[me.x, me.z] = standAt(me.room, me.face);
resize();
addEventListener('resize', resize);
requestAnimationFrame(tick);
