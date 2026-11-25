/* ─────────────────────────────────────────────────────────────
   星 · 晶体（第三版）—— 有真实棱面的结晶实体，剪影仍读成六芒星
   目录：design/mocks/star-v-gem/ ｜ 端口 4661

   与上一版（star-crystal/）的根本区别：上一版是「六支细四棱锥共心」，
   投影出来是一枚蒺藜 —— 任何视角都像一个带刺的球，某些角度看甚至塌成
   一条竖线。这一版改从「实体多面体」出发，逐个验证哪些能同时读成
   「六芒星」和「水晶」。

   一条从一开始就必须说清的事实（它决定了整个候选表）：
   **凸多面体的正交剪影恒为凸形。** 所以正八面体的剪影只可能是凸六边形
   或方形，永远不可能是六芒星 —— 六芒星有六个内凹的缺口。
   想让剪影读成六芒星，几何**必须非凸**。
   于是候选自然分成两族：
     · 凸族（octa / octaCut / bud / stella）—— 只能靠六个「朝向」的棱面
       让人读出六向，剪影是六边形；
     · 非凸族（starBi / slab / blunt）—— 剪影可以真的是六芒星。
   这一份原型把两族并排放，让观感自己说话。

   材质四档，全部按 star-crystal/notes.md 的三条实测结论来：
     · transmission 在透明画布上会塌成死白 → 折射档必须配不透明画布，
       清屏色＝页面底色；
     · transmission 非零即全价 → 想「透一点」用 opacity；
     · 白晶体在白底上等于白纸 → 环境贴图必须带压暗的地面和几个亮窗。

   运动是定格：姿态量化到 360/steps，每格持有 holdMs，一圈之后那个保持格
   再加长 3.2 倍（照 brand.ts 的 7 步轮转 + 3 秒呼吸）。setTimeout 链，
   不用 rAF。一切尺寸按 CSS px 喂，DPR 封顶 2。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const DEG = Math.PI / 180;

/* ── 底色 ─────────────────────────────────────────────────── */
export const PAGE = { light: '#f0f3f6', deep: '#2a2b38' };
export const PAGE_HEX = { light: 0xf0f3f6, deep: 0x2a2b38 };

/* ── 姿态与时钟的常量 ─────────────────────────────────────── */
/* 一整圈之后的那个保持格加长倍数：同 brand.ts「7 步轮转 + 3 秒呼吸」（3×） */
const BREATH = 3.2;
/* 基准视：正等轴。与 toolstar.ts drawStar() 的 yaw 45° / pitch 35.264° 同一角度，
   也是这颗星唯一「六支等长、互成 60°」的那一格。 */
const ISO_PITCH = 35.264;
const ISO_YAW = 45;
/* 星芒双锥的「正对」基准：只偏 13°/9°，让棱面有明暗但不离开正面 */
const FACE_PITCH = 13;
const FACE_YAW = 9;

const Y_UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_DIAG = new THREE.Vector3(1, 1, 0).normalize();

/* ── 多面体装配小工具 ─────────────────────────────────────── */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function faceCentre(poly) {
  const c = new THREE.Vector3();
  for (const p of poly) c.add(p);
  return c.multiplyScalar(1 / poly.length);
}

/**
 * 把「多边形列表」装配成一份**非索引**的 BufferGeometry。
 * 非索引 + computeVertexNormals ⇒ 每个三角形各得一枚法线 ⇒ 棱面是利的。
 * 这就是全套候选共用的「flat normals」。
 *
 * @param {THREE.Vector3[][]} polys 每个多边形按环序给出
 * @param {object} o
 * @param {'auto'|'given'} o.orient  auto：按面心朝外定向（凸体用）；given：调用方自己保证绕向
 */
function geometryFromPolys(polys, { orient = 'auto' } = {}) {
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (const poly of polys) {
    const ref = faceCentre(poly);
    for (let i = 1; i < poly.length - 1; i++) {
      const p0 = poly[0];
      const p1 = poly[i];
      const p2 = poly[i + 1];
      n.crossVectors(a.copy(p1).sub(p0), b.copy(p2).sub(p0));
      const flip = orient === 'auto' && n.dot(ref) < 0;
      if (flip) pos.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
      else pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 归一化到外接球半径 1，让各几何在同一个相机里尺寸可比 */
function unitize(g) {
  g.computeBoundingSphere();
  const r = g.boundingSphere.radius || 1;
  if (Math.abs(r - 1) > 1e-6) {
    g.scale(1 / r, 1 / r, 1 / r);
    g.computeBoundingSphere();
  }
  return g;
}

const AXES = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];

/* ── 几何 ①：正八面体（利）───────────────────────────────── */
/**
 * 六个顶点在 ±x ±y ±z —— 与站点那颗星的六支是同一组方向。
 * 剪影：凸六边形（正等轴视角下是正六边形）。
 * 六个棱面在正对视角下汇聚到中心那一点，是它最像「结晶」的一格。
 */
export function geoOcta() {
  const polys = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    polys.push([V(sx, 0, 0), V(0, sy, 0), V(0, 0, sz)]);
  }
  return unitize(geometryFromPolys(polys));
}

/* ── 几何 ②：截顶八面体（六个角各切一平面）───────────────── */
/**
 * 每个顶点切掉一小块 ⇒ 顶点变成正方形小平面，原来的三角面变成六边形。
 * 参数 cut 是切口离顶点的比例：0.18 时仍是一颗「八面体」，只是尖变成了台；
 * 0.34 就接近正截顶八面体，开始像一颗圆浑的石头。
 * 面数 6×2 + 8×4 = 44 个三角形。
 */
export function geoOctaCut(cut = 0.2) {
  const polys = [];
  const near = (p, q) => p.clone().add(q.clone().sub(p).multiplyScalar(cut));

  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      const apex = AXES[i].clone().multiplyScalar(s);
      const j = (i + 1) % 3;
      const k = (i + 2) % 3;
      /* 顶点处的方口：四个邻点按 j, k, -j, -k 的环序，才是一个正经的四边环 */
      polys.push([
        AXES[j].clone().multiplyScalar(s),
        AXES[k].clone().multiplyScalar(s),
        AXES[j].clone().multiplyScalar(-s),
        AXES[k].clone().multiplyScalar(-s),
      ].map((nb) => near(apex, nb)));
    }
  }

  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const A = V(sx, 0, 0);
    const B = V(0, sy, 0);
    const C = V(0, 0, sz);
    const AB0 = near(A, B); const AB1 = near(B, A);
    const BC0 = near(B, C); const BC1 = near(C, B);
    const CA0 = near(C, A); const CA1 = near(A, C);
    polys.push([AB0, AB1, BC0, BC1, CA0, CA1]);
  }

  return unitize(geometryFromPolys(polys));
}

/* ── 几何 ③：六棱双锥（晶苞，favicon 那一族）─────────────── */
/**
 * 六边形腰环 + 上下两个尖。站点自己的晶体身份就是这一枚（public/favicon.svg）。
 * girdle 是腰环的厚度：真实宝石有一圈「腰」，那一条窄带会在光里亮一下，
 * 也是它读起来像「被切过的石头」而不是「两个金字塔对扣」的原因。
 * taper 是腰环的收分：favicon 的线稿是一个压扁的菱形，腰以上比腰以下短得多，
 * 所以这里让上面收得快、下面收得慢 —— 只用一个尖高会让它读成「纺锤」。
 */
export function geoBud({ girdle = 0.04, topY = 0.72, botY = 1.0, radius = 1.0, sides = 6 } = {}) {
  const polys = [];
  const ring = (y) => {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const th = Math.PI / 2 + (i * 2 * Math.PI) / sides;
      out.push(V(Math.cos(th) * radius, y, Math.sin(th) * radius));
    }
    return out;
  };
  const front = ring(girdle);
  const back = ring(-girdle);
  const top = V(0, topY, 0);
  const bot = V(0, -botY, 0);

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    polys.push([front[i], front[j], top]);
    polys.push([back[j], back[i], bot]);
    polys.push([back[i], back[j], front[j], front[i]]);
  }
  return unitize(geometryFromPolys(polys));
}

/* ── 几何 ④：星形八面体（两个互穿的正四面体）─────────────── */
/**
 * 八个尖、四个正确交错的三角面。剪影里是一组交叠的细长尖角。
 * 它是「结构」还是「刺」—— 这一版专门拿来验的就是这句话。
 */
export function geoStella() {
  const base = [V(1, 1, 1), V(1, -1, -1), V(-1, 1, -1), V(-1, -1, 1)];
  const polys = [];
  for (const s of [1, -1]) {
    const t = base.map((p) => p.clone().multiplyScalar(s));
    /* 四个面：每个面省掉一个顶点；origin 在两个四面体内部，朝外定向即可 */
    for (let skip = 0; skip < 4; skip++) {
      polys.push(t.filter((_, i) => i !== skip));
    }
  }
  return unitize(geometryFromPolys(polys));
}

/* ── 几何 ⑤：截角六尖体（原版六支，尖端切平 + 棱边倒角）──── */
/**
 * 这是「上一版为什么不好看」的对照：同样的六支放射，但
 *   · 根部加粗到几乎连成一团（r 0.48），中心因此有体量；
 *   · 每支沿轴收得慢，末端留一个**平的切口**而不是一个尖；
 *   · 腰部用 12 边形而不是 8 边形，棱更细，光扫过时是一片一片的。
 * 如果「倒角」真的能救回六尖体，它应该在这里就被救回来。
 */
export function geoBlunt({ tip = 1.0, sides = 12, rootR = 0.40 } = {}) {
  const polys = [];
  /* 收分刻意做慢：到 0.86 处才收到一半，之后 0.14 的长度里收到 0.06。
     如果一路线性收细，六支就是六根针；如果收得太快又成了六根桩。
     末端那一圈半径 0.06 才是那道「切平的尖」—— 它必须小到仍然像尖、
     却又是一个平面，光扫过去时才会整片一起亮。 */
  const stations = [
    { d: 0.0, r: rootR },
    { d: 0.34, r: rootR * 0.97 },
    { d: 0.60, r: rootR * 0.82 },
    { d: 0.78, r: rootR * 0.56 },
    { d: 0.90, r: rootR * 0.32 },
    { d: 0.965, r: rootR * 0.16 },
    { d: 1.0, r: rootR * 0.15 },
  ];

  for (const axis of AXES) {
    for (const s of [1, -1]) {
      const dir = axis.clone().multiplyScalar(s);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir);
      const ex = V(1, 0, 0).applyQuaternion(q);
      const ey = V(0, 1, 0).applyQuaternion(q);
      const at = (u, v, d) => new THREE.Vector3()
        .addScaledVector(ex, u).addScaledVector(ey, v).addScaledVector(dir, d * tip);

      const rings = stations.map((st) => {
        const out = [];
        for (let i = 0; i < sides; i++) {
          const th = (i * 2 * Math.PI) / sides;
          out.push(at(Math.cos(th) * st.r, Math.sin(th) * st.r, st.d));
        }
        return out;
      });

      for (let k = 0; k < rings.length - 1; k++) {
        const A = rings[k];
        const B = rings[k + 1];
        for (let i = 0; i < sides; i++) {
          const j = (i + 1) % sides;
          polys.push([A[i], A[j], B[j], B[i]]);
        }
      }
      /* 尖端切平：最后一环直接封一个面 */
      polys.push(rings[rings.length - 1].slice());
      /* 根部封口：会被别的支挡掉，但它保证没有漏光的洞 */
      polys.push(rings[0].slice().reverse());
    }
  }

  /* 非凸：朝外定向不能用面心。每一支的面心相对「本支的轴」朝外，用轴当参考。 */
  const g = geometryFromPolys(polys, { orient: 'given' });
  /* 上面的绕向是按环序（逆时针）给的，侧面的环序对外侧是正的；
     端盖用 reverse 补反向。非凸几何不走 auto 定向，这里只做一次健全性缩放。 */
  return unitize(g);
}

/* ── 星形轮廓：站点那颗星的截面 ───────────────────────────── */
/**
 * 12 个顶点交替 R / r，角度每 30° 一个，第一个尖朝正上。
 * 这就是「六芒星」的截面本身（六个尖 + 六个内凹缺口）。
 */
export function starPolygon({ R = 1, r = 0.58, points = 6 } = {}) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const th = Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? R : r;
    out.push([Math.cos(th) * rad, Math.sin(th) * rad]);
  }
  return out;
}

/* ── 几何 ⑥：星芒双锥（我的方案）─────────────────────────── */
/**
 * 截面＝六芒星轮廓，前后各一个尖。所以：
 *   · 正对镜头时，剪影就是六芒星 —— 六个尖，六个缺口，一个不差；
 *   · 同一个视角下每个尖都拉出一片长三角形棱面，十二片绕着眼前那颗尖
 *     散开，这是真宝石的「星刻面」（star cut）排布，不是细针；
 *   · 侧过来时它是一枚两端带尖的厚透镜，不会塌成一条线（apexY 决定这点）。
 *
 * 关键的一个参数是尖高 apexY。它同时控制两件互相拉扯的事：
 *   apexY 小（0.3）→ 正对时几乎是平板，六芒星最准，但一转过 40° 就没有体量；
 *   apexY 大（0.9）→ 侧过去像一枚橄榄核，但正对时六个尖被拉得很扁。
 * 0.52 是两边都还能接受的位置：正对时尖角仍有 30° 以上的面，侧看厚度约 0.5R。
 *
 * 另有一个 bilobe 开关：把每个尖在腰环处再往外推一点，让尖与尖之间的缺口
 * 收成一道窄缝而不是一个大三角。它让「六个尖」更分开，但也让正对时的星
 * 更像一把锯。默认关。
 */
export function geoStarBipyramid({ R = 1, r = 0.58, apexY = 0.52, girdle = 0.055, bilobe = 0 } = {}) {
  const poly = starPolygon({ R, r });
  const polys = [];

  const front = poly.map(([x, y], i) => {
    const k = i % 2 === 0 ? 1 + bilobe : 1;
    return V(x * k, y * k, girdle);
  });
  const back = poly.map(([x, y], i) => {
    const k = i % 2 === 0 ? 1 + bilobe : 1;
    return V(x * k, y * k, -girdle);
  });
  const apexF = V(0, 0, apexY);
  const apexB = V(0, 0, -apexY);
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    /* 前冠：从眼前的尖扇形散到每一段腰棱 */
    polys.push([apexF, front[i], front[j]]);
    /* 后冠：绕向相反 */
    polys.push([apexB, back[j], back[i]]);
    /* 腰带：一圈薄壁，让最宽处有一道亮线 */
    polys.push([back[i], back[j], front[j], front[i]]);
  }

  return unitize(geometryFromPolys(polys, { orient: 'given' }));
}

/* ── 几何 ⑦：星形棱板（六芒星挤出成板 + 前后倒角）────────── */
/**
 * 六芒星截面沿 z 挤成一块板，但前后不是直角收口，而是缩两圈：
 * 最宽一圈（腰）→ 缩到 0.90 → 缩到 0.50 的台面。
 * 于是每一面有 24 片倒角棱面 + 12 片冠面，最宽处一圈腰线吃光最亮。
 * 正对时剪影仍是六芒星；侧对时只剩薄薄一片 —— 这是它的弱点，留着作对照。
 */
export function geoStarSlab({ R = 1, r = 0.58, halfThick = 0.46 } = {}) {
  const poly = starPolygon({ R, r });
  const polys = [];
  const ring = (scale, z) => poly.map(([x, y]) => V(x * scale, y * scale, z));

  const waist = ring(1.0, 0);
  const bevelF = ring(0.9, halfThick * 0.42);
  const crownF = ring(0.5, halfThick);
  const waist2 = ring(1.0, 0);
  const bevelB = ring(0.9, -halfThick * 0.42);
  const crownB = ring(0.5, -halfThick);
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    polys.push([waist[i], waist[j], bevelF[j], bevelF[i]]);
    polys.push([bevelF[i], bevelF[j], crownF[j], crownF[i]]);
    polys.push([crownB[i], crownB[j], bevelB[j], bevelB[i]]);
    polys.push([bevelB[i], bevelB[j], waist2[j], waist2[i]]);
  }
  polys.push(crownF.slice());
  polys.push(crownB.slice().reverse());

  return unitize(geometryFromPolys(polys, { orient: 'given' }));
}

/* ── 候选表 ───────────────────────────────────────────────── */

export const GEOMETRIES = {
  octa: { label: '正八面体', note: '凸 · 六顶点在 ±x±y±z', build: () => geoOcta() },
  octaCut: { label: '截顶八面体', note: '凸 · 六个角切平', build: () => geoOctaCut(0.2) },
  bud: { label: '六棱双锥', note: '凸 · favicon 那一族', build: () => geoBud() },
  stella: { label: '星形八面体', note: '凸包非凸 · 两个四面体', build: () => geoStella() },
  blunt: { label: '截角六尖体', note: '非凸 · 原版六支，尖端切平', build: () => geoBlunt() },
  starBi: { label: '星芒双锥', note: '非凸 · 六芒星截面 + 前后双尖', build: () => geoStarBipyramid() },
  slab: { label: '星形棱板', note: '非凸 · 六芒星挤出 + 倒角', build: () => geoStarSlab() },
};

export const GEO_ORDER = ['octa', 'octaCut', 'bud', 'stella', 'blunt', 'starBi', 'slab'];

let geoCache = null;
/** 惰性建一次，全场共用（每个画布各自 new Mesh 但共享 geometry 实例即可，
    因为不同渲染器共享 BufferGeometry 是安全的：数据只在 JS 侧）。 */
export function geometry(key) {
  if (!geoCache) {
    geoCache = {};
    for (const k of GEO_ORDER) geoCache[k] = GEOMETRIES[k].build();
  }
  return geoCache[key];
}

/* ── 程序化环境贴图 ───────────────────────────────────────── */
/**
 * 一张 1024×512 的等距柱面图：天顶白 → 地平线亮 → **地面压到 #3a4250**，
 * 中间撒几个窗和暗墙。白晶体在白底上唯一的进出通道就是「有几张脸亮、
 * 有几张脸暗」，而那个明暗只能来自环境本身。
 * 上一版把地面压到 #454e5c 就够用；这一版再暗一档，因为几何更大块、
 * 棱面更少，需要更硬的明暗台阶才看得出来。
 */
function buildEnvMap(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#ffffff');
  sky.addColorStop(0.20, '#f8fafd');
  sky.addColorStop(0.40, '#dfe6f0');
  sky.addColorStop(0.50, '#ffffff');
  sky.addColorStop(0.58, '#c8d1de');
  sky.addColorStop(0.74, '#7c8798');
  sky.addColorStop(0.88, '#4d5666');
  sky.addColorStop(1.0, '#333a47');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  const blob = (x, y, r, color, alpha) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = alpha;
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };
  /* 两扇亮窗 + 一块薄暮紫 + 几面暗墙 */
  blob(250, 128, 200, '#ffffff', 1.0);
  blob(772, 104, 150, '#ffffff', 0.95);
  blob(540, 296, 250, '#cfc7e4', 0.5);
  blob(912, 214, 180, '#5a6474', 0.6);
  blob(378, 232, 140, '#6d7787', 0.45);
  blob(40, 430, 320, '#2b323d', 0.75);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return rt;
}

/* ── 材质四档 ─────────────────────────────────────────────── */

/* 边缘光：把 fresnel 加到自发光项。磨砂树脂和淡彩体在浅底上靠它立住边。 */
function patchRim(mat, color, power, strength) {
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('vViewPosition')) return;
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimPow = { value: power };
    shader.uniforms.uRimStr = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uRimColor;\nuniform float uRimPow;\nuniform float uRimStr;\nvoid main() {',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize( vViewPosition );
          float rimF = 1.0 - clamp( dot( normal, vdir ), 0.0, 1.0 );
          totalEmissiveRadiance += uRimColor * pow( rimF, uRimPow ) * uRimStr;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${power}-${strength}`;
  return mat;
}

export const MAT_ORDER = ['crystal', 'resin', 'edge', 'refract'];
export const MAT_LABEL = {
  crystal: '近白晶面',
  resin: '磨砂薄紫树脂',
  edge: '淡彩体 + 棱线',
  refract: '折射（不透明底）',
};

export function needsOpaqueCanvas(mat) {
  return mat === 'refract';
}
export function wantsEdgeLines(mat) {
  return mat === 'edge';
}

export function makeMaterial(key) {
  if (key === 'refract') {
    /* 折射：只有画布不透明、清屏色＝页面底色时才成立（star-crystal 的 A/B/C/D 四组证据）。
       transmission 非零即全价，所以这里索性用满。 */
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: 1,
      ior: 1.72,
      thickness: 1.0,
      attenuationColor: new THREE.Color(0xd9d3ea),
      attenuationDistance: 2.4,
      iridescence: 0.3,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [180, 520],
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    });
  }
  if (key === 'resin') {
    /* 站点自己的材质语言：磨砂、半透明、朝 --umber / --dream 偏一点点。
       不用 transmission（非零即全价），用 opacity 拿同一个观感。 */
    return patchRim(
      new THREE.MeshPhysicalMaterial({
        color: 0xd9d6e6,
        metalness: 0,
        roughness: 0.4,
        transparent: true,
        opacity: 0.74,
        ior: 1.45,
        iridescence: 0.2,
        iridescenceIOR: 1.25,
        clearcoat: 0.45,
        clearcoatRoughness: 0.42,
        sheen: 0.75,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color(0xe6e3f0),
        envMapIntensity: 1.0,
        /* FrontSide 而不是 DoubleSide：three 会把「透明 + 双面」的网格拆成
           背面一遍、正面一遍，也就是 2 个 draw call。这些几何都是闭合实体，
           背面本来就被正面挡掉，双面买不到任何东西，白付一整个 pass。 */
        side: THREE.FrontSide,
      }),
      0xcfc8e2,
      2.2,
      0.55,
    );
  }
  if (key === 'edge') {
    /* 淡彩体 + 一圈发丝棱线 —— 站点在 2D 里造晶体的老办法（Ave.astro 的直边 clip-path
       加一道细描边）。体稍微压深一点，棱线交给 LineSegments 叠上去。 */
    return patchRim(
      new THREE.MeshPhysicalMaterial({
        color: 0xdde3ee,
        metalness: 0,
        roughness: 0.2,
        opacity: 0.96,
        transparent: true,
        clearcoat: 0.85,
        clearcoatRoughness: 0.16,
        iridescence: 0.14,
        iridescenceIOR: 1.3,
        envMapIntensity: 1.1,
        side: THREE.FrontSide,
      }),
      0xbfc8d8,
      2.6,
      0.35,
    );
  }
  /* crystal：近白、极低粗糙、清漆、很轻的虹彩。
     虹彩压到 0.18 —— 全站只有一个异质色（薄暮紫），它只能当棱边偏冷，不能自己长彩虹。 */
  return new THREE.MeshPhysicalMaterial({
    color: 0xfbfcff,
    metalness: 0,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.18,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [180, 520],
    specularIntensity: 1,
    envMapIntensity: 1.32,
    side: THREE.FrontSide,
  });
}

/* 棱线材质：一条深墨色的发丝线，取自 --umber */
function makeEdgeLineMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0x4f4a66,
    transparent: true,
    opacity: 0.34,
    depthTest: true,
  });
}

/* ── 定格时钟 ─────────────────────────────────────────────── */

const schedCache = new Map();

/** 一圈的保持时长表：最后一格之后多停 BREATH 倍（呼吸停歇） */
export function schedule(steps, holdMs) {
  const key = `${steps}:${holdMs}`;
  let s = schedCache.get(key);
  if (s) return s;
  const holds = new Array(steps).fill(holdMs);
  holds[steps - 1] = holdMs * BREATH;
  const starts = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    starts.push(t);
    t += holds[i];
  }
  s = { steps, holdMs, holds, starts, total: t };
  schedCache.set(key, s);
  return s;
}

/** elapsed → { k, left }：第 k 格，这一格还剩 left 毫秒 */
export function stepAt(s, elapsed) {
  const e = ((elapsed % s.total) + s.total) % s.total;
  let k = 0;
  for (let i = s.steps - 1; i >= 0; i--) {
    if (e >= s.starts[i]) { k = i; break; }
  }
  return { k, left: s.starts[k] + s.holds[k] - e };
}

export function axisVector(name) {
  if (name === 'diag') return AXIS_DIAG;
  if (name === 'y') return Y_UP;
  return AXIS_X;
}

/* 摆（rock）：不整圈翻，只在 ±ARC 之间来回。
   整圈翻的代价是每圈有两次「正侧对镜头」，那时剪影必然收成一条厚线 ——
   这是任何薄晶体的几何事实，不是材质能救的。
   ARC = 38 是从 `.shots/50-sweep.png` 那张倾角扫描里量出来的：
   0–40° 六个尖还立得住，50° 起开始糊，80–90° 已经是一枚压扁的菱形。
   摆不经过那一格，六芒星的读感在整个周期里都在。 */
const ROCK_ARC = 38;

/* 一圈里 yaw 走多少度。刻意不取 90 的倍数：
   正八面体对称群下绕 x 转 90° 会与自身重合，yaw 不动的话 steps=8 的一圈里
   只有 2 个不重样的姿态。偏一点，四个四分之一圈才各自不同。
   对星芒双锥还有第二个用处：只用 46° 的 yaw 晃，一整圈里它都不会侧到 90°，
   所以「六芒星」这个读感在整圈里都还在 —— 正中与侧看之间来回，而不是翻成一条线。 */
const YAW_PER_REV = 52;
/* 摆的模式下 yaw 收一半：摆本身只走 38°，若 yaw 还给满 52°，
   两个转角叠在一起，末尾几格的剪影会歪成不对称的星而不是正六芒。 */
const YAW_PER_REV_ROCK = 26;

/** 各几何的基准姿态（quaternion 之前的 Euler） */
export function baseQuat(geoKey, mode = 'iso') {
  if (mode === 'own') {
    /* 各自最好看的那一格。三族各说一句：
       · 凸族（octa / octaCut / stella）就是正等轴那一格，六边形剪影最匀；
       · 晶苞要站着 —— 竖起来才像一枚苞，斜躺就只是一颗石头；
       · 星芒双锥与棱板要几乎正对镜头，因为它们的卖点就是「正对时是六芒星」。 */
    if (geoKey === 'bud') return new THREE.Quaternion().setFromEuler(new THREE.Euler(8 * DEG, 0, 0, 'YXZ'));
    if (geoKey === 'starBi' || geoKey === 'slab') {
      return new THREE.Quaternion().setFromEuler(new THREE.Euler(FACE_PITCH * DEG, FACE_YAW * DEG, 0, 'YXZ'));
    }
  }
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(ISO_PITCH * DEG, ISO_YAW * DEG, 0, 'YXZ'));
}

/**
 * 某一格的总姿态。tumble 绕 axis 转一圈，yaw 每圈只走 46°。
 *
 * @param {object} o
 * @param {string} o.geo       几何键
 * @param {string} [o.base]    'iso' | 'own'
 * @param {string} [o.axis]    'x' | 'diag' | 'y'
 * @param {number} o.steps
 * @param {number} [o.holdMs]
 * @param {number} [o.k]       直接指定第几格（否则用 elapsed）
 * @param {number} [o.elapsed]
 * @param {boolean} [o.smooth] 连续（只为对照）
 * @param {string} [o.motion]  'flip'（整圈翻）| 'rock'（±62° 来回）
 * @param {number[]} [o.euler] 显式欧拉角（度），对验收单帧用
 */
export function poseQuat(o, out = new THREE.Quaternion()) {
  if (o.euler) {
    return out.setFromEuler(new THREE.Euler(o.euler[0] * DEG, o.euler[1] * DEG, o.euler[2] * DEG, 'YXZ'));
  }
  const steps = o.steps ?? 12;
  const holdMs = o.holdMs ?? 110;
  let k;
  let frac = 0;
  if (o.smooth) {
    const s = schedule(steps, holdMs);
    const t = ((o.elapsed ?? 0) % s.total + s.total) % s.total;
    frac = t / s.total;
    k = frac * steps;
  } else if (o.k != null) {
    k = o.k;
    frac = k / steps;
  } else {
    const s = schedule(steps, holdMs);
    k = stepAt(s, o.elapsed ?? 0).k;
    frac = k / steps;
  }
  const rock = o.motion === 'rock';
  const arc = o.arc ?? ROCK_ARC;
  /* rock：一圈里先往前 arc 度、再退回来，所以用 sin 而不是线性 */
  const tumble = rock ? arc * Math.sin(frac * 2 * Math.PI) : frac * 360;
  const yaw = frac * (rock ? YAW_PER_REV_ROCK : YAW_PER_REV);
  const qTumble = new THREE.Quaternion().setFromAxisAngle(axisVector(o.axis || 'x'), tumble * DEG);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(Y_UP, yaw * DEG);
  return out.copy(qYaw).multiply(qTumble).multiply(baseQuat(o.geo, o.base || 'iso'));
}

/* ── 一个 WebGL 上下文 ──────────────────────────────────────
   同一张画布用 viewport / scissor 画 N 格（star-crystal 的 mountGrid 是这个技法
   的雏形）。每格自带一块底色，所以一格一清屏。 */

const EDGE_CACHE = new Map();
function edgeGeometry(key) {
  if (!EDGE_CACHE.has(key)) {
    const g = new THREE.EdgesGeometry(geometry(key), 18);
    EDGE_CACHE.set(key, g);
  }
  return EDGE_CACHE.get(key);
}

export class Stage {
  constructor(canvas, { alpha = false } = {}) {
    this.opaque = !alpha;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(alpha ? 0 : 1);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.envRT = buildEnvMap(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.environment = this.envRT.texture;

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    this.camera.position.set(0, 0, 5.6);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3.2, 4.4, 4.6);
    const fill = new THREE.DirectionalLight(0xdce4f2, 0.8);
    fill.position.set(-4.2, -1.6, 2.4);
    const rim = new THREE.DirectionalLight(0x9a86c4, 0.85);
    rim.position.set(-1.6, 2.2, -4.4);
    this.scene.add(key, fill, rim);

    this.materials = {};
    for (const k of MAT_ORDER) this.materials[k] = makeMaterial(k);
    this.lineMat = makeEdgeLineMaterial();

    this.mesh = new THREE.Mesh(geometry('octa'), this.materials.crystal);
    this.lines = new THREE.LineSegments(edgeGeometry('octa'), this.lineMat);
    this.lines.visible = false;
    this.scene.add(this.mesh, this.lines);
    this.calls = 0;
  }

  /**
   * 画一格。
   * @param {object} cell
   * @param {number[]} rect  [x, y(左下), w, h] 设备像素
   * @param {string} cell.geo
   * @param {string} cell.mat
   * @param {string} cell.bg   'light' | 'deep'
   * @param {THREE.Quaternion} cell.q
   */
  paint(rect, cell) {
    const r = this.renderer;
    const [x, y, w, h] = rect;
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    const hex = PAGE_HEX[cell.bg] ?? PAGE_HEX.light;
    r.setClearColor(hex, 1);
    r.setClearAlpha?.(1);
    this.mesh.geometry = geometry(cell.geo);
    this.mesh.material = this.materials[cell.mat] || this.materials.crystal;
    this.mesh.quaternion.copy(cell.q);
    const useLines = wantsEdgeLines(cell.mat);
    this.lines.visible = useLines;
    if (useLines) {
      this.lines.geometry = edgeGeometry(cell.geo);
      this.lines.quaternion.copy(cell.q);
    }
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    this.calls = r.info.render.calls;
  }

  done() {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
  }

  /**
   * 读回画布，逐格算「与底色差多少」。判据必须是「像素和本格底色差多少」
   * 而不是 alpha —— 不透明画布的 alpha 恒为 255，用 alpha 会得到
   * 「全都画上了」的假阳性（star-crystal 的原型自检骗过自己一次）。
   * @param {{rect:number[], bg:number}[]} cells
   */
  probe(cells) {
    const gl = this.renderer.getContext();
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const srgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const out = [];
    for (const { rect, bg } of cells) {
      const [x0, y0, cw, ch] = rect.map((v) => Math.round(v));
      const [br, bg2, bb] = srgb(bg ?? PAGE_HEX.light);
      let lit = 0;
      let peak = 0;
      let minX = cw;
      let maxX = -1;
      let minY = ch;
      let maxY = -1;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = ((y0 + y) * w + (x0 + x)) * 4;
          const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg2) + Math.abs(px[i + 2] - bb);
          if (d > 10) {
            lit++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          if (d > peak) peak = d;
        }
      }
      out.push({
        coverage: +(lit / (cw * ch)).toFixed(3),
        contrast: Math.round(peak),
        box: maxX >= 0 ? [minX, ch - 1 - maxY, maxX - minX + 1, maxY - minY + 1] : null,
      });
    }
    return { buffer: `${w}x${h}`, calls: this.calls, cells: out };
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    this.lineMat.dispose();
    this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ── 方格表（静态）─────────────────────────────────────────
   rows: [{ cells: [{ geo, mat, bg, size, k?, steps?, holdMs?, base?, axis?, label? }] }]
   每行按 cell.size 顺排，行高＝该行最大 size。 */

export function mountGrid(canvas, spec) {
  const { rows, gap = 16, pad = 0 } = spec;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0;
  let H = 0;
  let rowH = [];
  let layout = [];
  let stage = null;

  const layoutOf = (rowsNow) => {
    const rowW = rowsNow.map((row) => row.cells.reduce((a, c) => a + c.size, 0) + gap * (row.cells.length - 1));
    const width = Math.max(...rowW) + pad * 2;
    const heights = rowsNow.map((row) => Math.max(...row.cells.map((c) => c.size)));
    const height = heights.reduce((a, h) => a + h, 0) + gap * (rowsNow.length - 1) + pad * 2;
    const out = [];
    let cy = pad;
    rowsNow.forEach((row, ri) => {
      let cx = pad;
      for (const c of row.cells) {
        out.push({ ...c, left: cx, top: cy, offsetY: (heights[ri] - c.size) / 2 });
        cx += c.size + gap;
      }
      cy += heights[ri] + gap;
    });
    return { width, height, heights, out };
  };

  const paint = () => {
    if (!stage) return;
    const q = new THREE.Quaternion();
    for (const c of layout) {
      poseQuat(c, q);
      /* WebGL 原点在左下 */
      const gy = H - (c.top + c.offsetY) - c.size;
      c.rect = [c.left * dpr, gy * dpr, c.size * dpr, c.size * dpr];
      stage.paint(c.rect, { ...c, q });
    }
    stage.done();
  };

  const apply = (rowsNow) => {
    const l = layoutOf(rowsNow);
    W = l.width;
    H = l.height;
    rowH = l.heights;
    layout = l.out;
    /* 首次建栈；之后只改画布尺寸，绝不丢弃重建 ——
       每次重建 WebGL 上下文都有上限（Chrome 大约 16 个），换一次材质就更贵一次。 */
    if (!stage) stage = new Stage(canvas, { alpha: false });
    stage.renderer.setPixelRatio(dpr);
    stage.renderer.setSize(W, H, false);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    /* 先把整张画布清成页面底色：alpha:false 的上下文在没画过的地方是不透明的，
       格子之间那几条缝会露出未初始化的颜色（黑）。 */
    stage.renderer.setScissorTest(false);
    stage.renderer.setViewport(0, 0, canvas.width, canvas.height);
    stage.renderer.setClearColor(PAGE_HEX.light, 1);
    stage.renderer.clear();
    paint();
  };

  apply(rows);

  return {
    get stage() { return stage; },
    get layout() { return layout; },
    get width() { return W; },
    get height() { return H; },
    redraw: paint,
    /** 换一组行（尺寸不同也可以），复用同一个上下文 */
    update(rowsNow) { apply(rowsNow); },
    /* 读回：先 paint（保证内容在），读完再 paint 一次还原画面 */
    probe() {
      paint();
      const res = stage.probe(layout.map((c) => ({ rect: c.rect, bg: PAGE_HEX[c.bg] ?? PAGE_HEX.light })));
      paint();
      return { ...res, layout: layout.map((c) => ({ geo: c.geo, mat: c.mat, bg: c.bg, size: c.size, k: c.k })) };
    },
    dispose() { if (stage) stage.dispose(); stage = null; },
  };
}

/* ── 单个活动层（定格 / 连续对照用）──────────────────────── */

export class GemLayer {
  constructor(canvas, opts = {}) {
    this.opts = {
      geo: 'starBi',
      mat: 'resin',
      bg: 'light',
      steps: 12,
      holdMs: 110,
      axis: 'x',
      base: 'own',
      motion: 'rock',
      mode: 'step',
      size: 200,
      ...opts,
    };
    this.stage = new Stage(canvas, { alpha: true });
    this.canvas = canvas;
    this.elapsed = 0;
    this.running = false;
    this.timer = 0;
    this.raf = 0;
    this.t0 = 0;
    this.frozen = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.applySize(this.opts.size);
    this.draw(0);
  }

  applySize(size) {
    this.opts.size = size;
    this.stage.renderer.setPixelRatio(this.dpr);
    this.stage.renderer.setSize(size, size, false);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  set(partial = {}) {
    const prev = { ...this.opts };
    let need = false;
    if (partial.size && partial.size !== prev.size) { this.applySize(partial.size); need = true; }
    Object.assign(this.opts, partial);
    if (['geo', 'mat', 'bg', 'steps', 'holdMs', 'axis', 'base', 'motion', 'mode'].some((k) => k in partial)) need = true;
    if (need) {
      if (this.running) this.restart();
      else this.draw(this.elapsed);
    }
  }

  draw(elapsed) {
    this.elapsed = elapsed;
    const q = poseQuat(this.opts, new THREE.Quaternion());
    const px = this.opts.size * this.dpr;
    this.stage.paint([0, 0, px, px], { ...this.opts, q });
    this.stage.done();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now() - this.elapsed;
    this.restart();
  }

  restart() {
    this.stopTimer();
    if (!this.running) return;
    if (this.opts.mode === 'smooth') {
      const loop = (now) => {
        if (!this.running) return;
        this.draw(now - this.t0);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
      return;
    }
    /* 定格：不用 rAF。每格画一次，下一次唤醒按这一格剩余多久排。 */
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const s = schedule(this.opts.steps, this.opts.holdMs);
      const { left } = stepAt(s, now - this.t0);
      this.draw(now - this.t0);
      this.timer = setTimeout(tick, Math.max(8, left + 6));
    };
    tick();
  }

  stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = 0;
    this.raf = 0;
  }

  stop() {
    this.running = false;
    this.stopTimer();
  }

  freeze(k) {
    this.stop();
    this.draw(schedule(this.opts.steps, this.opts.holdMs).starts[k] ?? 0);
  }

  dispose() { this.stop(); this.stage.dispose(); }
}

/* ── 测算 ─────────────────────────────────────────────────── */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 逐个「几何 × 材质」量一遍。
 *
 * 为什么是「整块计时」而不是「逐帧计时」：
 * 单张 gl.finish 的读数被 performance.now() 的量化（headless 里约 100 µs）
 * 和驱动队列的空转一起放大，同一个几何能在三轮里给出 0.55 / 5.99 / 3.3。
 * 这里改成「一次计时里连画 BLOCK 帧、每帧之间 finish」，再除以 BLOCK——
 * 噪声被摊薄 BLOCK 倍。整块跑 REPEAT 次取中位数。
 *
 * 尺寸与 star-crystal 对齐：480×480 缓冲、DPR 1。
 */
const BLOCK = 40;
const REPEAT = 5;

export async function measure({ size = 480, geos = GEO_ORDER, mats = MAT_ORDER } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const stage = new Stage(canvas, { alpha: false });
  stage.renderer.setPixelRatio(1);
  stage.renderer.setSize(size, size, false);
  const gl = stage.renderer.getContext();
  const q = new THREE.Quaternion();
  poseQuat({ geo: 'octa', steps: 12, smooth: true, elapsed: 0 }, q);
  const rect = [0, 0, size, size];
  const rows = [];

  const mid = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };

  for (const geo of geos) {
    for (const mat of mats) {
      /* 预热：shader 编译 / program link / 环境贴图的 mip 生成都不进计时 */
      for (let i = 0; i < 4; i++) {
        stage.paint(rect, { geo, mat, bg: 'light', q });
        stage.done();
        gl.finish();
      }
      /* info 会被下一次 render 重置，所以在预热之后读 */
      const calls = stage.renderer.info.render.calls;
      const tris = stage.renderer.info.render.triangles;

      /* 只用 GPU 路径：每帧之间 finish，块内总时间 ÷ BLOCK */
      const blocks = [];
      for (let r = 0; r < REPEAT; r++) {
        const t = performance.now();
        for (let i = 0; i < BLOCK; i++) {
          stage.paint(rect, { geo, mat, bg: 'light', q });
          stage.done();
          gl.finish();
        }
        blocks.push((performance.now() - t) / BLOCK);
      }

      /* CPU 提交路径：不 finish，命令队列会自己压住，但能看出 JS 侧的量级 */
      const cpuBlocks = [];
      for (let r = 0; r < REPEAT; r++) {
        const t = performance.now();
        for (let i = 0; i < BLOCK; i++) {
          stage.paint(rect, { geo, mat, bg: 'light', q });
          stage.done();
        }
        cpuBlocks.push((performance.now() - t) / BLOCK);
        gl.finish();
      }

      rows.push({
        geo,
        mat,
        cpu: +mid(cpuBlocks).toFixed(3),
        gpu: +mid(blocks).toFixed(3),
        calls,
        tris,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /* 定格一档的实际占用：每 holdMs 画一次，其余时间完全不提交 */
  const perHold = [60, 90, 110, 160].map((hold) => ({ hold, drawsPerSec: +(1000 / hold).toFixed(1) }));

  stage.dispose();
  canvas.remove();
  return { rows, perHold, size, block: BLOCK, repeat: REPEAT };
}

/* 页面自检口 */
export function footprint(tris) {
  return tris;
}