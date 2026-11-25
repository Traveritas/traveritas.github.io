/* ─────────────────────────────────────────────────────────────
 somewhere · r 组：房间的几何与视角（四个变体共用）

 只管三件事——盒子在哪、怎么转、屏幕上落在哪。画成什么样交给各自的 paint。

 为什么是「转」而不是「走」：这一轮要的是能待着的房间。走会把注意力交给移动，
 转只是换一面墙看，人一直在原地——墙上的东西才看得进去。

 世界坐标：右手系，y 朝上，相机在盒子中心、离地 eye 米；yaw = 0 时朝 −z（看后墙）。
 房间的宽由视口现算（见 rebuild）：保证四个墙角都留在画面里，宽屏就是宽屋子，竖屏是窄屋子。

 每一面都切成两半：梦线以下（below）与以上（above）。
 **线以上各家自己决定画不画**——不画，底下的流光就从那一片透进来。

 给 paint 的 face：
   { k, name, below, above, line, depth, center, bbox, near }
   · below / above：裁好、投影好的屏幕多边形（可能为空）；每点带 u/v（这一面的 0–1 局部坐标）
   · line：梦线在这一面上的屏幕段 [a, b]（只有四面墙有）
   · depth：平均距离（越小越近）；faces 已按远近排好序
   · near：这一面离相机多近（0–1，1 = 贴着相机）
 ───────────────────────────────────────────────────────────── */
import { clamp } from './shell2.js';

const NEAR = 0.04;
const DEG = Math.PI / 180;

export function createRoom(opts) {
  const {
    h = 3.0, // 高
    d = 4.6, // 深
    eye = 1.34, // 眼高
    hfov = 49, // 平视时横向半视野（度）：房间的宽按它反算，墙角才在画里
    vfovMax = 100, // 竖屏时纵向视野上限（度），免得鱼眼
    steps = 4,
    phase = Math.PI / 4, // 每一站看的是**墙角**：两个面在这儿碰头，屋子立刻成立
    pitchUp = 52,
    dream = 0.44, // 梦线高度（占房高的比例）
    autoArrive = false,
    dur = 3000,
    quality = 0.65, // 按视口的几分之一画，CSS 拉满（像素格与底下流光同一手感）
  } = opts;

  const root = document.documentElement;
  const layer = document.createElement('canvas');
  layer.className = 'rx-room';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const g = layer.getContext('2d');

  let vw = innerWidth;
  let vh = innerHeight;
  const q = quality;

  /* ══ 几何（随视口重建） ══ */
  let F = 1; // 焦距（px）
  let W = 1;
  let H = h;
  let D = d / 2;
  let Y = h * dream;
  const STEP = (Math.PI * 2) / steps;
  let FACES = [];

  function rebuild() {
    /* 焦距：横向取 hfov，但纵向不超过 vfovMax；两者取更"远"的那个焦点，
       于是宽屏横向够宽、竖屏不会变成鱼眼。 */
    const fH = vw / 2 / Math.tan(hfov * DEG);
    const fV = vh / 2 / Math.tan((vfovMax * DEG) / 2);
    F = Math.max(fH, fV);
    const halfH = Math.atan(vw / 2 / F);
    /* 墙角在 (W, ·, ±D)：要落在横向视野里，W / D ≤ tan(halfH)，留 8% 余量 */
    W = 0.92 * D * Math.tan(halfH);
    H = h;
    Y = H * dream;

    const c = [
      { k: 'back', name: '后墙', c: [[-W, H, -D], [W, H, -D], [W, 0, -D], [-W, 0, -D]] },
      { k: 'right', name: '右墙', c: [[W, H, -D], [W, H, D], [W, 0, D], [W, 0, -D]] },
      { k: 'front', name: '前墙', c: [[W, H, D], [-W, H, D], [-W, 0, D], [W, 0, D]] },
      { k: 'left', name: '左墙', c: [[-W, H, D], [-W, H, -D], [-W, 0, -D], [-W, 0, D]] },
      { k: 'ceil', name: '天花板', c: [[-W, H, -D], [W, H, -D], [W, H, D], [-W, H, D]] },
      { k: 'floor', name: '地', c: [[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D]] },
    ];
    for (const f of c) {
      const [tl, tr, br, bl] = f.c;
      if (f.k === 'ceil') {
        f.wAbove = f.c.slice();
        f.wBelow = [];
      } else if (f.k === 'floor') {
        f.wAbove = [];
        f.wBelow = f.c.slice();
      } else {
        const a0 = [tl[0], Y, tl[2]];
        const a1 = [tr[0], Y, tr[2]];
        f.wAbove = [tl, tr, a1, a0];
        f.wBelow = [a0, a1, br, bl];
      }
      // 梦线的两个端点（世界坐标）
      f.wLine = f.k === 'ceil' || f.k === 'floor' ? null : [[tl[0], Y, tl[2]], [tr[0], Y, tr[2]]];
    }
    FACES = c;
  }

  function resize() {
    vw = innerWidth;
    vh = innerHeight;
    layer.width = Math.max(1, Math.round(vw * q));
    layer.height = Math.max(1, Math.round(vh * q));
    layer.style.width = `${vw}px`;
    layer.style.height = `${vh}px`;
    rebuild();
  }
  resize();
  addEventListener('resize', resize);

  /* ══ 下沉：整个盒子朝你推过来、涨大，直到把你包住 ══ */
  let sink = 0;
  const box = { s: 0.46, oz: -6.2, oy: -0.9 };
  function setSink(u) {
    sink = clamp(u, 0, 1);
    box.s = 0.46 + (1 - 0.46) * sink;
    box.oz = -6.2 * (1 - sink);
    box.oy = -0.9 * (1 - sink);
  }

  /* ══ 视角 ══ */
  let yaw = phase;
  let yawT = phase;
  let pitch = 0;
  let pitchT = 0;
  let mx = 0;
  let my = 0;
  let mxs = 0;
  let mys = 0;

  function cam(p, y, pt) {
    const x0 = p[0] * box.s;
    const y0 = p[1] * box.s + box.oy - eye;
    const z0 = p[2] * box.s + box.oz;
    const cy = Math.cos(-y);
    const sy = Math.sin(-y);
    const x1 = x0 * cy - z0 * sy;
    const z1 = x0 * sy + z0 * cy;
    const cp = Math.cos(-pt);
    const sp = Math.sin(-pt);
    return { x: x1, y: y0 * cp - z1 * sp, z: y0 * sp + z1 * cp };
  }

  function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ain = a.z < -NEAR;
      const bin = b.z < -NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (-NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: -NEAR, u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
      }
    }
    return out;
  }

  /* ══ 时间线 ══ */
  let frame = 0;
  let arriveT = -1;
  let arrive = 0;
  let last = performance.now();
  const paints = [];

  const begin = () => {
    if (arriveT >= 0) return;
    arriveT = performance.now();
    root.dataset.arrived = 'go';
  };
  if (autoArrive === true) setTimeout(begin, 0);
  else if (typeof autoArrive === 'number') setTimeout(begin, autoArrive);

  /* 截图用：?view=1..4 直接站在某一面，?look=up 抬头（不参与现场体验） */
  {
    const q2 = new URLSearchParams(location.search);
    const v = +(q2.get('view') || 0);
    if (v >= 1 && v <= steps) {
      yaw = yawT = phase + (v - 1) * STEP;
      root.dataset.view = String(v);
    }
    if (q2.get('look') === 'up') {
      pitch = pitchT = pitchUp * DEG;
      root.dataset.look = 'up';
    }
  }

  const stepIdx = () => (((Math.round(yawT / STEP) % steps) + steps) % steps);
  const turn = (dir) => {
    if (arriveT < 0) return;
    yawT = (Math.round(yawT / STEP) + dir) * STEP;
    root.dataset.view = String(stepIdx() + 1);
  };
  const lookUp = () => {
    if (arriveT < 0) return;
    pitchT = pitchT > 0.04 ? 0 : pitchUp * DEG;
    root.dataset.look = pitchT > 0.04 ? 'up' : 'level';
  };

  /* 点屏幕：左右各 32% 转，上边 22% 抬头，中间不动 */
  addEventListener('click', (e) => {
    if (e.target.closest('a, [data-ui]')) return;
    const x = e.clientX / vw;
    const y = e.clientY / vh;
    if (y < 0.22) return lookUp();
    if (x < 0.32) return turn(-1);
    if (x > 0.68) return turn(1);
  });
  addEventListener('pointermove', (e) => {
    mx = (e.clientX / vw - 0.5) * 7;
    my = (e.clientY / vh - 0.5) * -5;
  });
  addEventListener('keydown', (e) => {
    if (arriveT < 0) {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        begin();
      }
      return;
    }
    if (e.key === 'ArrowLeft') turn(-1);
    else if (e.key === 'ArrowRight') turn(1);
    else if (e.key === 'ArrowUp') lookUp();
    else if (e.key === 'ArrowDown') {
      pitchT = 0;
      root.dataset.look = 'level';
    } else if (e.key === 'r' || e.key === 'R') {
      yawT = phase;
      pitchT = 0;
      root.dataset.view = '1';
      root.dataset.look = 'level';
    }
  });
  let pending = 0;
  addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      if (arriveT < 0) {
        pending += Math.max(0, dy);
        if (pending > 56) begin();
        return;
      }
      pending += dy;
      if (Math.abs(pending) > 90) {
        turn(pending > 0 ? 1 : -1);
        pending = 0;
      }
    },
    { passive: false },
  );

  /* ══ 一帧 ══ */
  function apply() {
    g.setTransform(q, 0, 0, q, 0, 0);
    g.clearRect(0, 0, vw, vh);

    const yawNow = yaw + mxs * DEG;
    const pitchNow = pitch + mys * DEG;

    /* ══ 相机与投影（必须定义在下面用之前） ══
       前两位作者都想「从屏幕上的面反推相机」，一个把自己绕进去、一个反解出的数错到 x=22803。
       那一类工作不该由画法来做：这里把这一帧的相机原样交出去，
       把世界点（房间坐标，y 朝上、地面为 0）直接投到屏幕上。 */
    const toCam = (p) => cam(p, yawNow, pitchNow);
    const projectWorld = (p) => {
      const c = toCam(p);
      if (c.z > -NEAR) return null; // 在相机后面：不画
      return { x: vw / 2 + (c.x * F) / -c.z, y: vh / 2 - (c.y * F) / -c.z, z: -c.z };
    };
    /* 一条世界空间里的线段：任一端在相机后面就裁到近平面 */
    const projectSeg = (a, b) => {
      let ca = toCam(a);
      let cb = toCam(b);
      const ain = ca.z < -NEAR;
      const bin = cb.z < -NEAR;
      if (!ain && !bin) return null;
      if (!ain) {
        const t = (-NEAR - ca.z) / (cb.z - ca.z);
        ca = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: -NEAR };
      } else if (!bin) {
        const t = (-NEAR - cb.z) / (ca.z - cb.z);
        cb = { x: cb.x + (ca.x - cb.x) * t, y: cb.y + (ca.y - cb.y) * t, z: -NEAR };
      }
      return [
        { x: vw / 2 + (ca.x * F) / -ca.z, y: vh / 2 - (ca.y * F) / -ca.z },
        { x: vw / 2 + (cb.x * F) / -cb.z, y: vh / 2 - (cb.y * F) / -cb.z },
      ];
    };
    /* 世界空间的多边形 → 屏幕多边形（自动近平面裁剪） */
    const projectPoly = (pts) => {
      if (!pts.length) return [];
      const cl = clipNear(pts.map(toCam));
      if (cl.length < 3) return [];
      return cl.map((p) => ({ x: vw / 2 + (p.x * F) / -p.z, y: vh / 2 - (p.y * F) / -p.z, z: -p.z }));
    };

    const screen = (worldPts, uv) => {
      const cs = worldPts.map((p, i) => ({
        ...cam(p, yawNow, pitchNow),
        u: uv ? uv[i][0] : 0,
        v: uv ? uv[i][1] : 0,
      }));
      const cl = clipNear(cs);
      if (cl.length < 3) return [];
      return cl.map((p) => ({ x: vw / 2 + (p.x * F) / -p.z, y: vh / 2 - (p.y * F) / -p.z, z: -p.z, u: p.u, v: p.v }));
    };

    const faces = [];
    for (const def of FACES) {
      /* 可见性只交给近平面裁剪。房间内表面不能拿「面心在相机前方」去剔：
         左右墙的面心正好落在相机所在的平面上（z ≈ 0），一剔就整面消失，
         而它其实该以两片楔形出现在画面两边。 */
      const belowPoly = projectPoly(def.wBelow);
      const abovePoly = projectPoly(def.wAbove);
      if (!belowPoly.length && !abovePoly.length) continue;

      let line = [];
      if (def.wLine) {
        const [a, b] = def.wLine;
        const ca = cam(a, yawNow, pitchNow);
        const cb = cam(b, yawNow, pitchNow);
        if (ca.z < -NEAR && cb.z < -NEAR) {
          line = [
            { x: vw / 2 + (ca.x * F) / -ca.z, y: vh / 2 - (ca.y * F) / -ca.z },
            { x: vw / 2 + (cb.x * F) / -cb.z, y: vh / 2 - (cb.y * F) / -cb.z },
          ];
        }
      }

      const all = [...belowPoly, ...abovePoly];
      let depth = 0;
      for (const p of all) depth += p.z;
      depth /= all.length;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of all) {
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
      faces.push({
        k: def.k,
        name: def.name,
        below: belowPoly,
        above: abovePoly,
        line,
        depth,
        near: clamp(1 - (depth - 0.3) / 4, 0, 1),
        center: all.reduce((s, p) => ({ x: s.x + p.x / all.length, y: s.y + p.y / all.length }), { x: 0, y: 0 }),
        bbox: { x0, y0, x1, y1 },
      });
    }

    faces.sort((a, b) => b.depth - a.depth);

    const ctx = {
      frame,
      vw,
      vh,
      faces,
      g,
      arrive,
      sink,
      dreamY: Y,
      /** 房间内部尺寸（宽、高、深）。随视口重算，别缓存到外面 */
      W,
      H,
      D,
      F,
      quality: q,
      /** 这一帧的相机（弧度）：yaw 绕 y，pitch 抬头为正 */
      yaw: yawNow,
      pitch: pitchNow,
      eye,
      project: projectWorld,
      projectSeg,
      projectPoly,
    };
    for (const p of paints) p(ctx);
  }

  function tick(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    frame++;
    arrive = arriveT < 0 ? 0 : clamp((ts - arriveT) / dur, 0, 1);
    if (arrive >= 1) root.dataset.arrived = 'done';
    setSink(clamp((arrive - 0.05) / 0.85, 0, 1) ** 1.12);

    const e = 1 - Math.exp(-dt / 0.26);
    yaw += (yawT - yaw) * e;
    pitch += (pitchT - pitch) * e;
    mxs += (mx - mxs) * (1 - Math.exp(-dt / 0.12));
    mys += (my - mys) * (1 - Math.exp(-dt / 0.12));

    apply();
    requestAnimationFrame(tick);
  }

  return {
    layer,
    g,
    begin,
    turn,
    lookUp,
    setSink,
    onPaint: (fn) => paints.push(fn),
    start: () => requestAnimationFrame(tick),
    get vw() {
      return vw;
    },
    get vh() {
      return vh;
    },
    get arrived() {
      return arriveT >= 0;
    },
    get size() {
      return { w: W * 2, h: H, d: D * 2 };
    },
    get dreamY() {
      return Y;
    },
  };
}

/* 屏幕多边形：描边 / 填充 / 裁切 */
export function trace(g, poly) {
  if (poly.length < 3) return false;
  g.beginPath();
  poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  return true;
}

/* 在屏幕上按「沿这一面底边的一条线」取点：t 从 0（左）到 1（右）。
   给等高线、贴地的排线用——只在四角都还在的时候准，被裁过就退化成整段。 */
export function baseRow(face, t) {
  const p = face.below.length >= 4 ? face.below : face.above;
  if (p.length < 4) return null;
  const lerp2 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  return [lerp2(p[0], p[1], t), lerp2(p[3], p[2], t)];
}
