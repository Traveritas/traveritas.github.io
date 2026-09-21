/* ─────────────────────────────────────────────────────────────
   REM · 玻璃签（来自 p5-paperroom 纸间的玻璃 shader，去阴影版）
   菲涅尔 + 虹彩 + 半兰伯特 + 高光；+z 面丝印
   「它可能马上消失。」。随滚动微倾（入梦失稳）。
   单 mesh 6 draw call、无阴影贴图、无环境贴图。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { makeLoop, liteDpr } from './three-common';

const VS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform vec3 uIridA;
  uniform vec3 uIridB;
  uniform vec3 uLightDir;
  uniform float uOpacity;
  uniform float uHasMap;
  uniform sampler2D uMap;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec3 N = gl_FrontFacing ? vN : -vN;
    float ndv = abs(dot(N, vV));
    float fres = pow(1.0 - ndv, 2.4);
    float diff = pow(dot(N, uLightDir) * 0.5 + 0.5, 2.0);
    float spec = pow(max(dot(reflect(-uLightDir, N), vV), 0.0), 44.0);
    vec3 irid = mix(uIridA, uIridB, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 col = uBase * (0.55 + diff * 0.6) + irid * fres * 0.55 + uRim * spec * 0.85;
    float a = uOpacity + fres * 0.3 + spec * 0.45;
    if (uHasMap > 0.5) {
      vec4 m = texture2D(uMap, vUv);
      col = mix(col, m.rgb * 0.34 + col * 0.3, m.a * 0.85);
      a = max(a, m.a * 0.92);
    }
    gl_FragColor = vec4(col, a);
  }
`;

function silkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 724;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);

  // 细边框 + 角线（印刷家具）
  g.strokeStyle = 'rgba(52, 46, 38, 0.5)';
  g.lineWidth = 2;
  g.strokeRect(30, 30, c.width - 60, c.height - 60);
  g.lineWidth = 1.5;
  const mark = 14;
  g.beginPath();
  g.moveTo(30 - mark, 30);
  g.lineTo(30, 30);
  g.moveTo(30, 30 - mark);
  g.lineTo(30, 30);
  g.moveTo(c.width - 30 + mark, 30);
  g.lineTo(c.width - 30, 30);
  g.moveTo(c.width - 30, 30 - mark);
  g.lineTo(c.width - 30, 30);
  g.moveTo(30 - mark, c.height - 30);
  g.lineTo(30, c.height - 30);
  g.moveTo(30, c.height - 30 + mark);
  g.lineTo(30, c.height - 30);
  g.moveTo(c.width - 30 + mark, c.height - 30);
  g.lineTo(c.width - 30, c.height - 30);
  g.moveTo(c.width - 30, c.height - 30 + mark);
  g.lineTo(c.width - 30, c.height - 30);
  g.stroke();

  // 丝印主文
  g.fillStyle = 'rgba(48, 42, 34, 0.86)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '500 66px "Noto Serif SC", "Songti SC", serif';
  const cx = c.width / 2;
  g.fillText('它可能', cx, 250);
  g.fillText('马上消失。', cx, 342);

  // 小注（mono）
  g.font = '400 22px "IBM Plex Mono", monospace';
  g.fillStyle = 'rgba(48, 42, 34, 0.6)';
  g.fillText('REM · 04:26', cx, 96);
  g.fillText('GLASS SLIP · 玻璃签', cx, c.height - 92);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function initSlip() {
  const canvas = document.getElementById('slip-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    // WebGL 不可用：露出静态回退（.slip-fallback）
    canvas.remove();
    document.querySelector('.slip-fallback')?.classList.add('show');
    return;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0.05, 3.2);
  camera.lookAt(0, 0, 0);

  const uniforms = () => ({
    uBase: { value: new THREE.Color('#dfe8ee') },
    uRim: { value: new THREE.Color('#ffffff') },
    uIridA: { value: new THREE.Color('#d8b4c0') },
    uIridB: { value: new THREE.Color('#b8ccd8') },
    uLightDir: { value: new THREE.Vector3(-5.5, 13, 6).normalize() },
    uOpacity: { value: 0.66 },
    uHasMap: { value: 0 },
    uMap: { value: null as THREE.Texture | null },
  });

  const matPlain = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: uniforms(),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const matMap = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: uniforms(),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const tex = silkTexture();
  matMap.uniforms.uHasMap.value = 1;
  matMap.uniforms.uMap.value = tex;

  const slip = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.42, 0.055),
    [matPlain, matPlain, matPlain, matPlain, matMap, matPlain],
  );
  scene.add(slip);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(liteDpr(canvas));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  makeLoop(canvas, (t: number) => {
    // 滚动微倾：玻璃签随段落进出视口而倾侧（入梦失稳）
    const r = canvas.getBoundingClientRect();
    const c = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    slip.rotation.y = -0.42 + Math.sin(t * 0.13) * 0.1;
    slip.rotation.x = Math.sin(t * 0.17) * 0.03 + c * -0.16;
    slip.rotation.z = -0.03 + Math.sin(t * 0.09) * 0.02 + c * 0.12;
    slip.position.y = Math.sin(t * 0.2) * 0.04;
    renderer.render(scene, camera);
  });
}
