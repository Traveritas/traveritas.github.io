/* ─────────────────────────────────────────────────────────────
   深眠 · 圆圈群（来自 p5-linescape 线野）
   7 枚细管圆环各拴一根风吹垂线，同色雾熔进夜里；
   极慢自旋 + 浮沉；其一淡金（全场景唯一异质色）。
   约 10 draw calls、30fps 节流、DPR≤1.5、静帧退让。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { makeLoop, liteDpr } from './three-common';

interface RingDef {
  r: number;
  tube: number;
  x: number;
  y: number;
  z: number;
  spin: number;
  gold: boolean;
  tilt: [number, number, number];
  phase: number;
}

const DEFS: RingDef[] = [
  { r: 1.5, tube: 0.05, x: -6.4, y: 4.2, z: -12.5, spin: 0.016, gold: false, tilt: [0.45, 0.2, 0.1], phase: 0.0 },
  { r: 2.1, tube: 0.06, x: -1.8, y: 7.4, z: -16.0, spin: -0.012, gold: false, tilt: [0.2, 0.5, -0.3], phase: 1.7 },
  { r: 2.9, tube: 0.07, x: 4.4, y: 5.6, z: -18.5, spin: 0.010, gold: false, tilt: [-0.3, 0.15, 0.4], phase: 3.1 },
  { r: 1.8, tube: 0.055, x: -8.6, y: 8.8, z: -19.5, spin: 0.013, gold: true, tilt: [0.1, 0.35, 0.2], phase: 4.4 },
  { r: 3.8, tube: 0.08, x: 0.6, y: 11.2, z: -24.0, spin: -0.009, gold: false, tilt: [0.35, -0.2, -0.15], phase: 5.5 },
  { r: 2.3, tube: 0.06, x: 7.6, y: 9.4, z: -21.5, spin: 0.011, gold: false, tilt: [-0.15, 0.4, 0.25], phase: 6.8 },
  { r: 5.0, tube: 0.085, x: -3.4, y: 14.4, z: -28.0, spin: -0.007, gold: false, tilt: [0.25, 0.1, -0.35], phase: 8.2 },
];

const TETHER_PTS = 12;

export function initRings() {
  const canvas = document.getElementById('rings-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.remove();
    return;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x171b24, 9, 30);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
  camera.position.set(0, 4.2, 11);
  camera.lookAt(0, 5.2, -12);

  scene.add(new THREE.HemisphereLight(0x39414c, 0x141821, 0.95));
  const dir = new THREE.DirectionalLight(0xcfd6e4, 0.5);
  dir.position.set(-5, 10, 5);
  scene.add(dir);

  const mobile = canvas.clientWidth < 720;
  const defs = mobile ? DEFS.slice(0, 4) : DEFS;

  const matSlate = new THREE.MeshStandardMaterial({
    color: 0x3a424d,
    roughness: 0.82,
    metalness: 0.05,
  });
  const matGold = new THREE.MeshStandardMaterial({
    color: 0xa97f3e,
    roughness: 0.55,
    metalness: 0.15,
  });

  const rings: { mesh: THREE.Mesh; def: RingDef }[] = [];
  const tethers: { line: THREE.Line; def: RingDef; pos: Float32Array }[] = [];

  for (const def of defs) {
    const geo = new THREE.TorusGeometry(def.r, def.tube, 8, 72);
    const mesh = new THREE.Mesh(geo, def.gold ? matGold : matSlate);
    mesh.rotation.set(def.tilt[0], def.tilt[1], def.tilt[2]);
    scene.add(mesh);
    rings.push({ mesh, def });

    const pos = new Float32Array(TETHER_PTS * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(
      tg,
      new THREE.LineBasicMaterial({ color: 0x4a525e, transparent: true, opacity: 0.5, fog: true }),
    );
    scene.add(line);
    tethers.push({ line, def, pos });
  }

  let px = 0;
  let pxTarget = 0;
  canvas.parentElement?.addEventListener('pointermove', (e) => {
    pxTarget = ((e as PointerEvent).clientX / innerWidth - 0.5) * 0.7;
  });

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
    for (const { mesh, def } of rings) {
      mesh.rotation.z = def.tilt[2] + t * def.spin;
      mesh.position.set(
        def.x + Math.sin(t * 0.06 + def.phase) * 0.45,
        def.y + Math.sin(t * 0.14 + def.phase) * 0.32,
        def.z,
      );
    }
    for (const { line, def, pos } of tethers) {
      const topY = def.y - def.r * 0.9 + Math.sin(t * 0.14 + def.phase) * 0.32;
      const botY = -0.4;
      for (let i = 0; i < TETHER_PTS; i++) {
        const f = i / (TETHER_PTS - 1);
        const y = botY + (topY - botY) * f;
        const bend = Math.sin(t * 0.5 + f * 2.2 + def.phase) * 0.22 * f;
        pos[i * 3] = def.x + bend;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = def.z + bend * 0.4;
      }
      (line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    px += (pxTarget - px) * 0.04;
    camera.position.x = px;
    camera.lookAt(px * 0.4, 5.2, -12);
    renderer.render(scene, camera);
  });
}
