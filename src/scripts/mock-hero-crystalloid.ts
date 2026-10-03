/* ─────────────────────────────────────────────────────────────
   Hero 主体原型渲染器 · 晶体与透镜的四种成形与解构变体
   支持：
     - Variant A: 八面体解构晶 (Octahedron Cleavage · 8 块锥片)
     - Variant B: 非对称断层晶簇 (Sculptural Cleavage Quartz · 5 块地质断层)
     - Variant C: 多层悬浮透镜组 (Planar Optical Lenses · 4 片偏振光阑)
     - Variant D: 晶化百合苞片 (Crystalline Petal Bud · 4 片弧形晶瓣)
   特性：
     - 醒态 (Wake, t=0)：致密凝固、咬合成形、棱线清晰
     - 梦态 (Dream, t=1)：解理错位、失重悬浮、空隙透光
     - 材质：磨砂玻璃 + 半透明树脂 + 菲涅尔虹彩轮廓 + 逆光焦散
     - 纯数学几何与自定义 Shader，零外部材质贴图依赖，轻量稳定
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

export type VariantType = 'octahedron' | 'asymmetric' | 'lenses' | 'petal';

export interface CrystalloidOptions {
  container: HTMLElement;
  initialVariant?: VariantType;
  initialDream?: number; // 0 (Wake) to 1 (Dream)
  autoRotate?: boolean;
  autoBreath?: boolean;
  wireframe?: boolean;
  onDreamChange?: (val: number) => void;
  onVariantChange?: (variant: VariantType) => void;
}

export interface CrystalloidHandle {
  setVariant(variant: VariantType): void;
  setDream(val: number): void;
  getDream(): number;
  setAutoRotate(val: boolean): void;
  setAutoBreath(val: boolean): void;
  setWireframe(val: boolean): void;
  resetView(): void;
  destroy(): void;
}

/* ── 磨砂透光玻璃 Shader ── */
const GLASS_VS = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const GLASS_FS = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uDreamColor;
  uniform vec3 uBacklightColor;
  uniform vec3 uRimColor;
  uniform vec3 uLightDir;
  uniform float uOpacity;
  uniform float uDream;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vec3 N = gl_FrontFacing ? vNormal : -vNormal;
    vec3 V = vViewDir;

    float ndv = abs(dot(N, V));
    float fresnel = pow(1.0 - ndv, 2.3);

    // 半兰伯特漫反射（保持柔和，不出现死黑阴影）
    float diff = pow(dot(N, uLightDir) * 0.5 + 0.5, 1.5);

    // 逆光透射光（模拟光从后方透过磨砂树脂的散射）
    vec3 backDir = -uLightDir;
    float backScatter = pow(max(dot(-V, backDir), 0.0), 2.8) * (1.0 - ndv * 0.5);

    // 镜面高光
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 38.0);

    // 色彩插值（醒面质朴清润，梦面带极微弱的灰粉紫温）
    vec3 base = mix(uBaseColor, uDreamColor, uDream);
    vec3 col = base * (0.64 + diff * 0.36);

    // 逆光与菲涅尔轮廓光
    col += uBacklightColor * backScatter * 0.62;
    col += uRimColor * fresnel * 0.92;
    col += vec3(1.0) * spec * 0.7;

    // 极克制的虹彩微波（只在掠射角泛起）
    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + N.y * 0.45 + uDream * 0.25));
    col = mix(col, col * (0.84 + 0.32 * irid), fresnel * 0.55);

    float alpha = clamp(uOpacity + fresnel * 0.36 + spec * 0.35, 0.0, 0.95);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── 核心微光纤/花蕊 Shader ── */
const CORE_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDream;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float ndv = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float glow = pow(1.0 - ndv, 1.8);
    vec3 col = uColor * (1.0 + glow * 1.6);
    gl_FragColor = vec4(col, clamp(0.4 + glow * 0.6 + uDream * 0.35, 0.0, 1.0));
  }
`;

interface ShardInfo {
  mesh: THREE.Mesh;
  line?: THREE.LineSegments;
  restPos: THREE.Vector3;
  dir: THREE.Vector3;
  distance: number;
  rotAxis: THREE.Vector3;
  rotAngle: number;
  floatPhase: number;
  baseQuat: THREE.Quaternion;
}

export function initCrystalloid(options: CrystalloidOptions): CrystalloidHandle {
  const {
    container,
    initialVariant = 'octahedron',
    initialDream = 0,
    autoRotate = true,
    autoBreath = false,
    wireframe = true,
  } = options;

  let currentVariant: VariantType = initialVariant;
  let dreamValue = initialDream;
  let isAutoRotate = autoRotate;
  let isAutoBreath = autoBreath;
  let showWireframe = wireframe;

  // Three.js 基础设施
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 7.8);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  // 共享材质
  const glassUniforms = {
    uBaseColor: { value: new THREE.Color(0xf1ece7) }, // 醒态清润白暖沙
    uDreamColor: { value: new THREE.Color(0xecdce6) }, // 梦态灰粉紫温
    uBacklightColor: { value: new THREE.Color(0xfff6ee) }, // 逆光透光色
    uRimColor: { value: new THREE.Color(0xfcf8f5) },
    uLightDir: { value: new THREE.Vector3(0.5, 0.7, 1.0).normalize() },
    uOpacity: { value: 0.52 },
    uDream: { value: initialDream },
  };

  const glassMaterial = new THREE.ShaderMaterial({
    vertexShader: GLASS_VS,
    fragmentShader: GLASS_FS,
    uniforms: glassUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xa8998a,
    transparent: true,
    opacity: 0.45,
    linewidth: 1,
  });

  const coreUniforms = {
    uColor: { value: new THREE.Color(0xefbe82) }, // 微温琥珀光
    uDream: { value: initialDream },
  };

  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader: GLASS_VS,
    fragmentShader: CORE_FS,
    uniforms: coreUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // 根旋转节点与分块列表
  const rootGroup = new THREE.Group();
  // 注入全站核心 14° 开屏轴向倾角
  rootGroup.rotation.z = -14 * (Math.PI / 180);
  scene.add(rootGroup);

  let currentShards: ShardInfo[] = [];
  let coreObject: THREE.Object3D | null = null;

  /* ─────────────────────────────────────────────────────────────
     变体构建器
     ───────────────────────────────────────────────────────────── */

  function clearCurrentVariant() {
    while (rootGroup.children.length > 0) {
      const obj = rootGroup.children[0];
      rootGroup.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    }
    currentShards = [];
    coreObject = null;
  }

  // 变体 A: 八面体解构晶 (8 块实心四面体晶片 + 中心 14° 纤细发丝)
  function buildOctahedron() {
    clearCurrentVariant();
    const R = 1.15;
    const H = 1.5; // 纵向略修长挺拔

    // 八个方向符号组合 (sx, sy, sz)
    const signs = [
      [1, 1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [1, 1, -1],
      [1, -1, 1],
      [-1, -1, 1],
      [-1, -1, -1],
      [1, -1, -1],
    ];

    signs.forEach((s, idx) => {
      const [sx, sy, sz] = s;
      const vTop = new THREE.Vector3(0, sy * H, 0);
      const vX = new THREE.Vector3(sx * R, 0, 0);
      const vZ = new THREE.Vector3(0, 0, sz * R);
      const vCenter = new THREE.Vector3(0, 0, 0); // 锥顶在中心

      // 4 面四面体实体几何
      const geom = new THREE.BufferGeometry();
      const positions: number[] = [];

      function addTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }

      // 外三角底面
      addTri(vX, vTop, vZ);
      // 内 3 个侧面（向内汇聚至中心）
      addTri(vCenter, vX, vTop);
      addTri(vCenter, vTop, vZ);
      addTri(vCenter, vZ, vX);

      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.computeVertexNormals();

      const mesh = new THREE.Mesh(geom, glassMaterial);
      const edgeGeom = new THREE.EdgesGeometry(geom, 15);
      const line = new THREE.LineSegments(edgeGeom, lineMaterial);
      line.visible = showWireframe;
      mesh.add(line);

      // 外法向方向
      const outerNormal = new THREE.Vector3(sx / R, sy / H, sz / R).normalize();
      const randAxis = new THREE.Vector3(sy, sz, sx).normalize();

      rootGroup.add(mesh);
      currentShards.push({
        mesh,
        line,
        restPos: new THREE.Vector3(0, 0, 0),
        dir: outerNormal,
        distance: 0.95,
        rotAxis: randAxis,
        rotAngle: (idx % 2 === 0 ? 1 : -1) * 0.42,
        floatPhase: idx * 0.78,
        baseQuat: mesh.quaternion.clone(),
      });
    });

    // 中心悬浮微光发丝
    const needleGeom = new THREE.CylinderGeometry(0.012, 0.012, 2.1, 16);
    const needleMesh = new THREE.Mesh(needleGeom, coreMaterial);
    needleMesh.rotation.z = 14 * (Math.PI / 180);
    rootGroup.add(needleMesh);
    coreObject = needleMesh;
  }

  // 变体 B: 非对称断层晶簇 (5 根六棱晶柱晶簇，醒态紧密咬合，梦态沿解理面滑移)
  function createCrystalSpire(radius: number, colHeight: number, tipHeight: number): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const segments = 6;
    const halfH = colHeight * 0.5;

    // 顶点计算
    const basePts: THREE.Vector3[] = [];
    const topPts: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI * 2) / segments;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      basePts.push(new THREE.Vector3(x, -halfH, z));
      topPts.push(new THREE.Vector3(x, halfH, z));
    }
    const apex = new THREE.Vector3(0, halfH + tipHeight, 0);
    const botApex = new THREE.Vector3(0, -halfH - tipHeight * 0.3, 0);

    function addTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }

    // 柱身六面与顶尖六面
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      // 柱身侧面
      addTri(basePts[i], topPts[i], topPts[next]);
      addTri(basePts[i], topPts[next], basePts[next]);
      // 尖顶面
      addTri(topPts[i], apex, topPts[next]);
      // 底部封口
      addTri(basePts[i], basePts[next], botApex);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  function buildAsymmetric() {
    clearCurrentVariant();

    const spires = [
      {
        r: 0.52,
        ch: 1.8,
        th: 0.6,
        pos: new THREE.Vector3(0, 0.1, 0),
        tilt: new THREE.Euler(0.04, 0.1, -0.05),
        dir: new THREE.Vector3(0.1, 0.6, -0.2).normalize(),
        dist: 0.55,
        rotAxis: new THREE.Vector3(0, 1, 0),
        rotAngle: 0.18,
      },
      {
        r: 0.38,
        ch: 1.4,
        th: 0.5,
        pos: new THREE.Vector3(-0.46, -0.15, 0.22),
        tilt: new THREE.Euler(0.18, 0, 0.14),
        dir: new THREE.Vector3(-0.8, 0.3, 0.4).normalize(),
        dist: 0.85,
        rotAxis: new THREE.Vector3(1, 0, 0.5).normalize(),
        rotAngle: -0.32,
      },
      {
        r: 0.36,
        ch: 1.3,
        th: 0.45,
        pos: new THREE.Vector3(0.48, -0.28, -0.15),
        tilt: new THREE.Euler(-0.16, 0.2, -0.12),
        dir: new THREE.Vector3(0.85, -0.3, -0.2).normalize(),
        dist: 0.9,
        rotAxis: new THREE.Vector3(-0.4, 1, 0).normalize(),
        rotAngle: 0.34,
      },
      {
        r: 0.32,
        ch: 1.0,
        th: 0.4,
        pos: new THREE.Vector3(0.12, -0.5, 0.44),
        tilt: new THREE.Euler(0.22, -0.15, 0),
        dir: new THREE.Vector3(0.2, -0.7, 0.6).normalize(),
        dist: 0.78,
        rotAxis: new THREE.Vector3(0, 0, 1),
        rotAngle: 0.25,
      },
      {
        r: 0.34,
        ch: 1.15,
        th: 0.42,
        pos: new THREE.Vector3(-0.18, -0.42, -0.42),
        tilt: new THREE.Euler(-0.2, -0.1, -0.15),
        dir: new THREE.Vector3(-0.3, -0.6, -0.7).normalize(),
        dist: 0.82,
        rotAxis: new THREE.Vector3(0.5, 0, -1).normalize(),
        rotAngle: -0.26,
      },
    ];

    spires.forEach((cfg, idx) => {
      const geom = createCrystalSpire(cfg.r, cfg.ch, cfg.th);
      const mesh = new THREE.Mesh(geom, glassMaterial);
      mesh.position.copy(cfg.pos);
      mesh.rotation.copy(cfg.tilt);

      const edgeGeom = new THREE.EdgesGeometry(geom, 18);
      const line = new THREE.LineSegments(edgeGeom, lineMaterial);
      line.visible = showWireframe;
      mesh.add(line);

      rootGroup.add(mesh);
      currentShards.push({
        mesh,
        line,
        restPos: cfg.pos.clone(),
        dir: cfg.dir,
        distance: cfg.dist,
        rotAxis: cfg.rotAxis,
        rotAngle: cfg.rotAngle,
        floatPhase: idx * 1.1,
        baseQuat: mesh.quaternion.clone(),
      });
    });

    // 内部微光点核
    const coreGeom = new THREE.SphereGeometry(0.14, 16, 16);
    const coreMesh = new THREE.Mesh(coreGeom, coreMaterial);
    rootGroup.add(coreMesh);
    coreObject = coreMesh;
  }

  // 变体 C: 多层悬浮透镜组 (4 片同心/离轴磨砂光阑透镜)
  function buildLenses() {
    clearCurrentVariant();

    const lensConfigs = [
      { z: 0.16, r: 0.75, h: 0.045, dirZ: 1.45, tilt: new THREE.Euler(0.22, 0, 0) },
      { z: 0.05, r: 1.15, h: 0.055, dirZ: 0.5, tilt: new THREE.Euler(-0.1, 0.15, 0) },
      { z: -0.05, r: 0.95, h: 0.05, dirZ: -0.55, tilt: new THREE.Euler(0.12, -0.18, 0) },
      { z: -0.16, r: 1.35, h: 0.04, dirZ: -1.5, tilt: new THREE.Euler(-0.25, 0, 0) },
    ];

    lensConfigs.forEach((cfg, idx) => {
      const geom = new THREE.CylinderGeometry(cfg.r, cfg.r, cfg.h, 48);
      geom.rotateX(Math.PI / 2); // 平面朝向视线

      const mesh = new THREE.Mesh(geom, glassMaterial);
      mesh.position.set(0, 0, cfg.z);

      const edgeGeom = new THREE.EdgesGeometry(geom, 25);
      const line = new THREE.LineSegments(edgeGeom, lineMaterial);
      line.visible = showWireframe;
      mesh.add(line);

      // 前镜加一枚细刻度同心环
      if (idx === 0) {
        const ringGeom = new THREE.RingGeometry(cfg.r * 0.55, cfg.r * 0.56, 48);
        const ring = new THREE.Mesh(ringGeom, coreMaterial);
        ring.position.z = cfg.h * 0.55;
        mesh.add(ring);
      }

      rootGroup.add(mesh);
      currentShards.push({
        mesh,
        line,
        restPos: new THREE.Vector3(0, 0, cfg.z),
        dir: new THREE.Vector3(0, 0, Math.sign(cfg.dirZ)),
        distance: Math.abs(cfg.dirZ),
        rotAxis: new THREE.Vector3(1, idx % 2 === 0 ? 0.5 : -0.5, 0).normalize(),
        rotAngle: (idx - 1.5) * 0.28,
        floatPhase: idx * 0.9,
        baseQuat: mesh.quaternion.clone(),
      });
    });

    // 穿透四枚透镜的 14° 光学准直细线
    const axisGeom = new THREE.CylinderGeometry(0.008, 0.008, 3.8, 16);
    axisGeom.rotateX(Math.PI / 2);
    const axisMesh = new THREE.Mesh(axisGeom, coreMaterial);
    rootGroup.add(axisMesh);
    coreObject = axisMesh;
  }

  // 变体 D: 晶化百合苞片 (4 片优雅弧面晶瓣，合拢为修长花苞，散开如失重花瓣)
  function buildPetalBud() {
    clearCurrentVariant();

    const petalCount = 4;
    const height = 2.4;

    for (let i = 0; i < petalCount; i++) {
      const angle = (i * Math.PI * 2) / petalCount;
      const geom = new THREE.BufferGeometry();
      const pos: number[] = [];

      // 沿高度构建贝塞尔弧面弯曲网格
      const segmentsY = 14;
      const segmentsX = 6;

      for (let y = 0; y <= segmentsY; y++) {
        const ty = y / segmentsY;
        const curY = (ty - 0.45) * height;

        // 花瓣轮廓半径：中部微鼓，顶部与底部收尖
        const rProfile = Math.sin(ty * Math.PI) * 0.65;
        // 花苞弧度微向内收拢
        const inwardCurve = Math.pow(ty, 1.3) * -0.22;

        for (let x = 0; x <= segmentsX; x++) {
          const tx = (x / segmentsX - 0.5) * 2; // -1 to 1
          const spread = tx * rProfile * 0.55;
          const depth = rProfile * 0.88 + inwardCurve;

          pos.push(spread, curY, depth);
        }
      }

      const indices: number[] = [];
      const rowSize = segmentsX + 1;
      for (let y = 0; y < segmentsY; y++) {
        for (let x = 0; x < segmentsX; x++) {
          const a = y * rowSize + x;
          const b = a + 1;
          const c = (y + 1) * rowSize + x;
          const d = c + 1;
          indices.push(a, c, b);
          indices.push(b, c, d);
        }
      }

      geom.setIndex(indices);
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.computeVertexNormals();

      const mesh = new THREE.Mesh(geom, glassMaterial);
      const baseQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      mesh.quaternion.copy(baseQuat);

      const edgeGeom = new THREE.EdgesGeometry(geom, 22);
      const line = new THREE.LineSegments(edgeGeom, lineMaterial);
      line.visible = showWireframe;
      mesh.add(line);

      // 外展向量与旋转切向轴
      const outDir = new THREE.Vector3(Math.sin(angle), 0.12, Math.cos(angle)).normalize();
      const tanAxis = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).normalize();

      rootGroup.add(mesh);
      currentShards.push({
        mesh,
        line,
        restPos: new THREE.Vector3(0, 0, 0),
        dir: outDir,
        distance: 0.8,
        rotAxis: tanAxis,
        rotAngle: -0.42, // 向外仰开
        floatPhase: i * 1.2,
        baseQuat,
      });
    }

    // 花蕊中心三根纤细光丝
    const pistilGroup = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      const g = new THREE.CylinderGeometry(0.01, 0.014, 1.1, 12);
      g.translate(0, 0.4, 0);
      const pMesh = new THREE.Mesh(g, coreMaterial);
      pMesh.rotation.z = 0.16;
      pMesh.rotation.y = a;
      pistilGroup.add(pMesh);
    }
    rootGroup.add(pistilGroup);
    coreObject = pistilGroup;
  }

  function applyVariant(v: VariantType) {
    currentVariant = v;
    if (v === 'octahedron') buildOctahedron();
    else if (v === 'asymmetric') buildAsymmetric();
    else if (v === 'lenses') buildLenses();
    else if (v === 'petal') buildPetalBud();
    updateShards(dreamValue, 0);
  }

  /* ─────────────────────────────────────────────────────────────
     分块位移与插值计算
     ───────────────────────────────────────────────────────────── */

  function updateShards(t: number, time: number) {
    glassUniforms.uDream.value = t;
    coreUniforms.uDream.value = t;

    // 缓动函数
    const smoothT = t * t * (3 - 2 * t);

    currentShards.forEach((s) => {
      // 漂浮微动效（只在有 dream 展开度时生效）
      const floatOffset = Math.sin(time * 1.2 + s.floatPhase) * 0.045 * smoothT;
      const breathRot = Math.cos(time * 0.9 + s.floatPhase) * 0.05 * smoothT;

      // 目标位移 = restPos + 方向向量 * 展开距离 + 悬浮呼吸
      const targetPos = s.restPos
        .clone()
        .addScaledVector(s.dir, s.distance * smoothT + floatOffset);
      s.mesh.position.copy(targetPos);

      // 目标姿态 = 基础姿态 * 局部旋转脱扣
      const q = new THREE.Quaternion().setFromAxisAngle(s.rotAxis, s.rotAngle * smoothT + breathRot);
      s.mesh.quaternion.copy(s.baseQuat).multiply(q);

      if (s.line) {
        s.line.visible = showWireframe;
      }
    });

    if (coreObject) {
      coreObject.scale.setScalar(0.75 + smoothT * 0.45);
    }
  }

  // 初始化首次构建
  applyVariant(currentVariant);

  /* ─────────────────────────────────────────────────────────────
     交互控制与渲染循环
     ───────────────────────────────────────────────────────────── */

  let isDragging = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let targetRotY = 0;
  let targetRotX = 0;
  let currentRotY = 0;
  let currentRotX = 0;

  const onPointerDown = (e: PointerEvent) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    targetRotY += dx * 0.007;
    targetRotX += dy * 0.007;
    // 限制俯仰角，避免翻跟头
    targetRotX = Math.max(-0.85, Math.min(0.85, targetRotX));
  };

  const onPointerUp = () => {
    isDragging = false;
  };

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // 滚轮缩放控制
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.005;
    camera.position.z = Math.max(5.0, Math.min(12.0, camera.position.z));
  };
  container.addEventListener('wheel', onWheel, { passive: false });

  // 尺寸自适应
  const onResize = () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  };
  window.addEventListener('resize', onResize);

  let animFrameId = 0;
  let clock = new THREE.Clock();

  function renderLoop() {
    animFrameId = requestAnimationFrame(renderLoop);
    const elapsedTime = clock.getElapsedTime();

    // 自动呼吸演化 (醒 ↔ 梦 正弦往复)
    if (isAutoBreath) {
      const breathT = (Math.sin(elapsedTime * 0.6) + 1) * 0.5;
      dreamValue = breathT;
      if (options.onDreamChange) {
        options.onDreamChange(dreamValue);
      }
    }

    // 缓动追踪鼠标旋转
    if (isAutoRotate && !isDragging) {
      targetRotY += 0.0045; // 慢速优雅自转
    }

    currentRotY += (targetRotY - currentRotY) * 0.08;
    currentRotX += (targetRotX - currentRotX) * 0.08;

    rootGroup.rotation.y = currentRotY;
    rootGroup.rotation.x = currentRotX;

    updateShards(dreamValue, elapsedTime);
    renderer.render(scene, camera);
  }

  renderLoop();

  /* ─────────────────────────────────────────────────────────────
     对外把手 (Handle)
     ───────────────────────────────────────────────────────────── */

  return {
    setVariant(v: VariantType) {
      applyVariant(v);
      if (options.onVariantChange) options.onVariantChange(v);
    },
    setDream(val: number) {
      dreamValue = Math.max(0, Math.min(1, val));
      updateShards(dreamValue, clock.getElapsedTime());
    },
    getDream() {
      return dreamValue;
    },
    setAutoRotate(val: boolean) {
      isAutoRotate = val;
    },
    setAutoBreath(val: boolean) {
      isAutoBreath = val;
    },
    setWireframe(val: boolean) {
      showWireframe = val;
      currentShards.forEach((s) => {
        if (s.line) s.line.visible = showWireframe;
      });
    },
    resetView() {
      targetRotX = 0;
      targetRotY = 0;
      camera.position.set(0, 0, 7.8);
    },
    destroy() {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    },
  };
}
