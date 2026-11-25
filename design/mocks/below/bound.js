/* ─────────────────────────────────────────────────────────────
 below · bound：除了墙，还能用什么界定一处地方（三张对照）

 ?kind=glass   磨砂玻璃：一片片立在水上的磨砂玻璃（悬着，不着水）。隔一层看到的是影子，隔两层只剩一点光。
               做法：玻璃从远到近逐片烘焙——每片玻璃取的是「它身后、已经被更远的玻璃磨过一遍」的画面再糊一次。
 ?kind=light   光幕：天上的流光一缕缕垂到水面，帘与帘之间是空地。
 ?kind=isles   方台：没有任何竖着的东西，水上散着高低不同的方台，东西摆在台上。
 ?sky=day      白天（随笔那一栏的浅色做天）

 天：#light（正式站那支流光着色器）画在一张不显示的画布上，作为 Three 场景的背景贴图——同一个场景里，
 于是玻璃能「透过」它、水能倒映它。所有材质都贴在物体本身上，不再按屏幕坐标取样。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, GRAIN } from './light.js';
import { clamp, options } from './common.js';

const THREE = window.THREE;
const opt = options();
const q = new URLSearchParams(location.search);
const KIND = q.get('kind') || 'glass';
const DAY = q.get('sky') === 'day';
if (DAY) document.documentElement.classList.add('day');

const SKY = DAY ? DREAM.essay.map((c) => c.slice()) : DREAM.home.map((c) => c.slice());
for (const k of ['essay', 'moment', 'project']) {
  DREAM[k] = SKY.map((c) => c.slice());
  GRAIN[k] = DAY ? [0.42, 0.16, 40] : [1, 0.3, 26];
}
const P = DAY
  ? { deep: [0.62, 0.66, 0.74], frost: [0.93, 0.94, 0.97], rim: [1, 1, 1], solid: [0.9, 0.9, 0.93], thing: [0.98, 0.97, 0.96], warm: [1, 0.95, 0.88], fog: [0.82, 0.85, 0.9], mirror: 0.88, a: [0.12, 0.55], c0: [0.75, 0.8, 0.9], c1: [1, 1, 1] }
  : { deep: [0.05, 0.05, 0.09], frost: [0.46, 0.43, 0.56], rim: [0.92, 0.88, 0.98], solid: [0.5, 0.48, 0.58], thing: [0.82, 0.77, 0.88], warm: [0.96, 0.82, 0.7], fog: [0.1, 0.1, 0.18], mirror: 0.78, a: [0.16, 0.7], c0: [0.29, 0.27, 0.44], c1: [0.86, 0.78, 0.86] };
const V3 = (c) => new THREE.Vector3(...c);
const C3 = (c) => new THREE.Color(...c);
document.getElementById('tag').innerHTML = {
  glass: '<b>磨砂玻璃</b>隔一层是影子，隔两层只剩一点光',
  light: '<b>光幕</b>天上的光一缕缕垂下来，帘与帘之间是空地',
  isles: '<b>方台</b>没有竖着的东西，水上散着高低不同的台子',
}[KIND];

/* ══ 天 ══ */
const glc = document.getElementById('light');
const light = createLight(glc, opt.px, { wind: false });
const skyTex = new THREE.CanvasTexture(glc);
skyTex.magFilter = THREE.NearestFilter;
skyTex.minFilter = THREE.NearestFilter;
skyTex.generateMipmaps = false;

/* ══ Three ══ */
let vw = innerWidth, vh = innerHeight;
const cv = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(vw, vh, false);
const scene = new THREE.Scene();
scene.background = skyTex;
scene.fog = new THREE.Fog(C3(P.fog), 10, 46);
const camera = new THREE.PerspectiveCamera(vw < vh ? 88 : 66, vw / vh, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(C3(P.c0).multiplyScalar(1.7), C3(P.deep), 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 0.4);
sun.position.set(0.4, 1, 0.3);
scene.add(sun);
const mirrorRoot = new THREE.Group();
mirrorRoot.scale.y = -1;
scene.add(mirrorRoot);
const mirrored = []; // [本体, 倒影]

function addBoth(obj) {
  scene.add(obj);
  const m = obj.clone(true);
  m.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.side = THREE.DoubleSide;
      if (o.material.color) o.material.color.multiplyScalar(P.mirror);
      if (o.material.uniforms?.uMirror) o.material.uniforms.uMirror.value = 1;
    }
  });
  mirrorRoot.add(m);
  mirrored.push([obj, m]);
  return obj;
}

/* ══ 水 ══ */
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uDeep: { value: V3(P.deep) }, uA: { value: new THREE.Vector2(...P.a) }, uFog: { value: V3(P.fog) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uDeep, uFog; uniform vec2 uA; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW);
        float a = mix(uA.x, uA.y, pow(clamp(V.y, 0.0, 1.0), 0.7));
        float d = distance(cameraPosition, vW);
        a *= 1.0 - smoothstep(30.0, 60.0, d) * 0.6;
        gl_FragColor = vec4(uDeep, a); }`,
  }),
);
water.rotation.x = -Math.PI / 2;
water.renderOrder = 5;
scene.add(water);

/* ══ 三样占位的东西（三张图里都一样） ══ */
const frost = (c, e = 0) => new THREE.MeshStandardMaterial({ color: C3(c), roughness: 0.85, emissive: C3(c), emissiveIntensity: e });
function figure() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.45, 7), frost(P.thing, 0.1));
  body.position.y = 0.73;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), frost(P.thing, 0.35));
  head.position.y = 1.66;
  g.add(body, head);
  return g;
}
function relic() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), frost(P.warm, 0.6));
  gem.position.y = 1.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), frost(P.solid));
  base.position.y = 0.45;
  g.add(gem, base);
  return g;
}
function ball() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), frost(P.thing, 0.12));
  m.position.y = 0.32;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
const place = (o, x, y, z, r = 0) => { o.position.set(x, y, z); o.rotation.y = r; return addBoth(o); };

/* ══ 小噪声（光幕用） ══ */
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;

/* ══ 三种界 ══ */
const glass = []; // { mesh, rt }
let quarter;

if (KIND === 'glass') {
  camera.position.set(0, 1.6, 7);
  camera.rotation.set(0.06, 0, 0);
  // [x, z, 宽, 高, 转角]：悬在水上一点，不着水
  const PANES = [
    [-3.4, 2.6, 3.2, 3.3, 0.35],
    [3.6, 1.2, 3.8, 3.7, -0.42],
    [-0.9, -2.2, 3.8, 3.1, 0.08],
    [2.0, -5.6, 4.6, 3.9, -0.18],
    [-3.6, -7.8, 5.6, 4.2, 0.32],
    [4.8, -10.5, 4.4, 3.6, -0.55],
    [0.4, -12.5, 6.5, 4.6, 0.05],
  ];
  quarter = () => [Math.max(2, Math.round(vw / 4)), Math.max(2, Math.round(vh / 4))];
  const glassMat = () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uBlur: { value: null }, uRes: { value: new THREE.Vector2() }, uFrost: { value: V3(P.frost) }, uRim: { value: V3(P.rim) }, uMirror: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uBlur; uniform vec2 uRes; uniform vec3 uFrost, uRim; uniform float uMirror; varying vec2 vUv;
        void main(){
          vec3 b = texture2D(uBlur, gl_FragCoord.xy / uRes).rgb;
          vec3 c = mix(b, uFrost, 0.22);                         // 磨砂：糊开的身后 + 一层薄薄的乳白
          c += uFrost * 0.06 * (1.0 - vUv.y);                    // 下沿略亮（离水近）
          float e = min(min(vUv.x, 1.0 - vUv.x) * 3.0, min(vUv.y, 1.0 - vUv.y) * 4.0);
          c = mix(uRim, c, smoothstep(0.0, 0.035, e) * 0.85 + 0.15); // 一圈很细的亮边
          float a = 1.0;
          if (uMirror > 0.5) { c *= 0.85; a = 0.38 * smoothstep(0.0, 0.5, vUv.y); } // 倒影：淡、往水深处褪掉（翻过来后 vUv.y 大的一头贴水）
          gl_FragColor = vec4(c, a);
        }`,
    });
  for (const [x, z, w, h, r] of PANES) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat());
    mesh.position.set(x, h / 2 + 0.14, z);
    mesh.rotation.y = r;
    addBoth(mesh);
    glass.push({ mesh, mirror: mirrored[mirrored.length - 1][1], rt: null });
  }
  place(ball(), 1.2, 0, 1.8);          // 前面，什么都没隔：清楚
  place(figure(), 0.2, 0, -4.2, 0.4);  // 隔一层：影子
  place(relic(), -1.2, 0, -10.4);      // 隔两三层：一点光
  place(figure(), 3.2, 0, -8.5, -0.5);
} else if (KIND === 'light') {
  camera.position.set(0, 1.6, 7);
  camera.rotation.set(0.12, 0, 0);
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uC0: { value: V3(P.c0) }, uC1: { value: V3(P.c1) }, uMirror: { value: 0 }, uK: { value: DAY ? 0.35 : 0.9 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT, uMirror, uK; uniform vec3 uC0, uC1; varying vec2 vUv; varying vec3 vW; ${NOISE}
      void main(){
        float y = abs(vW.y);
        float u = vW.x * 0.9 + vW.z * 0.9;
        float strand = smoothstep(0.42, 0.85, fbm(vec2(u * 3.2, y * 0.18 + uT * 0.25)));   // 一缕一缕往下淌
        float body = fbm(vec2(u * 0.7, y * 0.08 + uT * 0.08));
        float a = (strand * 0.6 + body * 0.25);
        a *= smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);                 // 两侧软
        a *= smoothstep(1.0, 0.55, vUv.y);                                                 // 往上融进天
        a *= 0.75 + 0.5 * smoothstep(0.35, 0.0, vUv.y);                                    // 落到水面处更亮
        vec3 c = mix(uC0, uC1, strand) * a * uK;
        if (uMirror > 0.5) c *= 0.55;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  // 一圈光幕围出一块空地（前方），缝隙处是路
  const C = [
    [-4.2, 1, 3.6, 1.2], [4.4, 0.6, 3.2, -1.25], [-2.6, -4.4, 4.2, 0.35], [3.0, -4.8, 3.6, -0.3],
    [-6.5, -9, 5, 0.9], [0.2, -11, 5.5, 0.05], [6.4, -10, 4.2, -0.8], [-2.8, -16, 6, 0.2], [4.5, -17, 5, -0.25],
  ];
  for (const [x, z, w, r] of C) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 14, 1, 1), curtainMat);
    m.position.set(x, 7, z);
    m.rotation.y = r;
    addBoth(m);
  }
  place(ball(), 1.0, 0, 2.2);
  place(figure(), 0.3, 0, -6.6, 0.3);
  place(relic(), 0.6, 0, -14.4);
  place(figure(), -4.6, 0, -12.5, 0.8);
} else {
  camera.position.set(0, 0.5 + 1.6, 7.5);
  camera.rotation.set(-0.06, 0, 0);
  const slabMat = new THREE.MeshStandardMaterial({ color: C3(P.solid), roughness: 0.9, emissive: C3(P.solid), emissiveIntensity: 0.08 });
  const edgeMat = new THREE.LineBasicMaterial({ color: C3(P.rim), transparent: true, opacity: 0.45 });
  // [x, z, 宽, 深, 高出水面]
  const S = [
    [0, 7.5, 5, 5, 0.5], [-4.2, -1.5, 4.2, 4.2, 0.9], [3.6, -4.5, 3.2, 3.2, 0.3], [-1, -11.5, 6, 5, 1.4],
    [7.5, -12, 4, 4, 0.6], [-9, -8, 3.6, 3.6, 0.4], [4.4, 2.6, 2.4, 2.4, 0.2], [-6, -18, 5, 4, 0.8],
    [8, -22, 6, 5, 1.1], [1, -24, 3, 3, 0.35], [-12, -2, 3, 3, 0.6],
  ];
  const top = {};
  S.forEach(([x, z, w, d, h], i) => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(w, h + 0.6, d); // 往水下多伸一截
    const b = new THREE.Mesh(geo, slabMat);
    b.position.y = (h - 0.6) / 2;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    e.position.y = b.position.y;
    g.add(b, e);
    place(g, x, 0, z);
    top[i] = h;
  });
  place(figure(), -4.2, top[1], -1.8, 0.5);
  place(ball(), 3.4, top[2], -4.3);
  place(relic(), -1, top[3], -12);
  place(figure(), 8, top[8], -22.5, -0.6);
}

/* ══ 模糊（玻璃用）：四分之一分辨率、可分离高斯，来回两趟 ══ */
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsScene = new THREE.Scene();
const blurMat = new THREE.ShaderMaterial({
  uniforms: { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D uSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 s = vec3(0.0); float W = 0.0;
      for (int i = -6; i <= 6; i++){ float w = exp(-float(i * i) / 18.0); s += texture2D(uSrc, vUv + uDir * float(i)).rgb * w; W += w; }
      gl_FragColor = vec4(s / W, 1.0); }`,
});
fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat));
const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
let rtFull, rtTmp;
function blurInto(src, dst) {
  const [w, h] = quarter();
  for (let k = 0; k < 2; k++) {
    blurMat.uniforms.uSrc.value = k === 0 ? src.texture : dst.texture;
    blurMat.uniforms.uDir.value.set(1.6 / w, 0);
    renderer.setRenderTarget(rtTmp);
    renderer.render(fsScene, fsCam);
    blurMat.uniforms.uSrc.value = rtTmp.texture;
    blurMat.uniforms.uDir.value.set(0, 1.6 / h);
    renderer.setRenderTarget(dst);
    renderer.render(fsScene, fsCam);
  }
}

/* ══ 帧 ══ */
const bufSize = new THREE.Vector2();
let clock = 0, last = performance.now();
const sway = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { sway.tx = (e.clientX / vw) * 2 - 1; sway.ty = (e.clientY / vh) * 2 - 1; });
const baseRot = camera.rotation.clone();
function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  clock += dt;
  sway.x += (sway.tx - sway.x) * 0.04;
  sway.y += (sway.ty - sway.y) * 0.04;
  camera.rotation.set(baseRot.x - sway.y * 0.04, baseRot.y - sway.x * 0.06, 0);

  light?.draw({
    t: clock * 0.7, pan: { x: camera.rotation.y * 0.45, y: camera.rotation.x * 0.55 }, zoom: 0.35,
    mouse: { x: -9999, y: -9999 }, dim: 0, seam: { p: [[-1e6, -1e6], [-1e6, -1e6]], n: [0, 1] },
    split: 1, bias: [0, 0, 0], lift: [0, 0, 0], ring: null, face: 0,
  });
  skyTex.needsUpdate = true;
  scene.traverse((o) => { if (o.material?.uniforms?.uT) o.material.uniforms.uT.value = clock; });
  for (const [a, b] of mirrored) { b.position.copy(a.position); b.quaternion.copy(a.quaternion); }

  if (glass.length) {
    renderer.getDrawingBufferSize(bufSize);
    const [w, h] = quarter();
    if (!rtFull || rtFull.width !== bufSize.x) {
      rtFull = mkRT(bufSize.x, bufSize.y);
      rtTmp = mkRT(w, h);
      for (const g of glass) g.rt = mkRT(w, h);
    }
    // 从远到近：每片玻璃取「它身后（含更远的玻璃）」的画面，糊开
    const order = glass
      .map((g) => ({ g, d: g.mesh.position.distanceTo(camera.position) }))
      .sort((a, b) => b.d - a.d)
      .map((o) => o.g);
    for (const g of glass) { g.mesh.visible = false; g.mirror.visible = false; }
    for (const g of order) {
      renderer.setRenderTarget(rtFull);
      renderer.render(scene, camera);
      blurInto(rtFull, g.rt);
      for (const m of [g.mesh, g.mirror]) {
        m.material.uniforms.uBlur.value = g.rt.texture;
        m.material.uniforms.uRes.value.copy(bufSize);
        m.visible = true;
      }
    }
    renderer.setRenderTarget(null);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
addEventListener('resize', () => {
  vw = innerWidth; vh = innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  light?.resize();
  rtFull = null;
});
void clamp;
requestAnimationFrame(tick);
