/* ─────────────────────────────────────────────────────────────
  somewhere 原型 · 共用底子（五份场景都挂在这上面）

  · 流光场：直接用正式站那支着色器（本目录 light.js，是 src/scripts/wander/light.js 的副本），
    所以底色、抖动、量化都跟首页 / 检索是同一片光，不是另画一张。
  · 转场：进来时是检索的样子——两条 14° 的缝把屏幕分成三栏——然后两条缝收拢、各自转过 90°，
    落在地平线上下，变成「天 / 地平线上那一条光 / 地」三段。全程同一个着色器、同一组调色板，
    只是缝在动。转完以后什么栏都没有了，只剩这片空间。
  · 相机：拖拽平移、滚轮推拉（与漫游同一个手感）。
  · 投影：world.project(x, y, z) → 屏幕位置、缩放、失焦量。「走近才成形」全靠它。

  用法：
    const world = initWorld({ canvas, themes: { sky, band, ground }, horizon: 0.58 });
    world.onFrame((s) => { ... });   // s: { t, dt, vw, vh, cam, pointer, arrive, project, horizon, accent }
    world.start();

  themes：三段各 4 色（底 / 中 / 光带 / 亮芯，sRGB 0–1）。转场前它们正好是三栏的三套夜色，
  转完就成了天、地平线、地——换的是缝的方位，不是色板。
  ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const outQuart = (p) => 1 - (1 - p) ** 4;

/* 确定性随机：同一个种子每次一样 */
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

/* 泊松盘采样（带种子）：互相离得开、又不规整。数量与范围随便给，位置不用手摆。 */
export function poisson(w, h, r, seed = 7) {
  const R = rng(seed);
  const cs = r / Math.SQRT2;
  const gw = Math.ceil(w / cs) + 1;
  const gh = Math.ceil(h / cs) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const add = (x, y) => {
    const i = pts.length;
    pts.push({ x, y });
    grid[Math.floor(y / cs) * gw + Math.floor(x / cs)] = i;
    active.push(i);
  };
  add(R() * w, R() * h);
  while (active.length) {
    const ai = Math.floor(R() * active.length);
    const p = pts[active[ai]];
    let ok = false;
    for (let k = 0; k < 24; k++) {
      const a = R() * Math.PI * 2;
      const d = r * (1 + R());
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      let bad = false;
      const gx = Math.floor(x / cs);
      const gy = Math.floor(y / cs);
      for (let yy = -2; yy <= 2 && !bad; yy++)
        for (let xx = -2; xx <= 2 && !bad; xx++) {
          const j = grid[(gy + yy) * gw + (gx + xx)];
          if (j >= 0) {
            const q = pts[j];
            if ((q.x - x) ** 2 + (q.y - y) ** 2 < r * r) bad = true;
          }
        }
      if (!bad) {
        add(x, y);
        ok = true;
        break;
      }
    }
    if (!ok) active.splice(ai, 1);
  }
  return pts;
}

/* 三条带的色写进着色器的三个区（0=上/左，1=中，2=下/右）。
   createLight 只在 init 时读一次 DREAM / WAKE / GRAIN，所以必须在 initWorld 之前改。 */
function applyThemes(themes, grain, face) {
  const keys = ['sky', 'band', 'ground'];
  const slots = ['essay', 'moment', 'project'];
  const desat = (c, k) => {
    const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return c.map((v) => clamp(v + (g - v) * k, 0, 1));
  };
  keys.forEach((k, i) => {
    const set = themes[k];
    DREAM[slots[i]] = set.map((c) => c.slice());
    // 醒面：同一组色去饱和一点、亮一点（与正式站醒梦两面同一个方向）
    WAKE[slots[i]] = set.map((c) => desat(c, 0.55 + face * 0.2).map((v) => clamp(v * 1.04, 0, 1)));
    GRAIN[slots[i]] = (grain?.[i] || [0.9, 0.3, 26]).slice();
  });
}

export function initWorld(opts) {
  const {
    canvas,
    themes,
    grain = null,
    horizon = 0.58, // 转完以后地平线在视口高度的哪里
    face = 0, // 0 = 梦（默认），1 = 醒
    autoArrive = false, // 截图用：true 立刻转，数字 = 等这么多 ms
    wind = false, // 上边那一带要不要那阵风（正式站只有随笔区有）
    px = 5,
  } = opts;

  applyThemes(themes, grain, face);
  const light = createLight(canvas, px, { wind });
  const root = document.documentElement;
  root.dataset.somewhere = 'on';

  let vw = innerWidth;
  let vh = innerHeight;

  /* ══ 相机 ══ */
  const cam = { x: 0, y: 0, z: 0, vx: 0, vy: 0 };
  const pointer = { x: vw / 2, y: vh / 2, nx: 0, ny: 0, inside: false, down: false };
  /* 背景的平移：和正式站一样是重弹簧（ω 2.2、ζ 0.9）追镜头的一小部分，起步慢、停得晚 */
  const bg = { ox: 0, oy: 0, vx: 0, vy: 0 };
  function stepBg(dt) {
    const k = 2.2 * 2.2;
    const c = 2 * 0.9 * 2.2;
    const tx = cam.x * 0.08;
    const ty = cam.y * 0.08;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      bg.vx += (-k * (bg.ox - tx) - c * bg.vx) * h;
      bg.vy += (-k * (bg.oy - ty) - c * bg.vy) * h;
      bg.ox += bg.vx * h;
      bg.oy += bg.vy * h;
    }
    return { x: (bg.ox / vh) * 0.72, y: (bg.oy / vh) * 0.72 };
  }

  /* 世界坐标 → 屏幕：1 单位 = 1 个视口高；z 与 cam.z 相同 = 焦平面（缩放 1）。
     blur 是「离焦多远」（0–1），用来决定画多糊、要不要出细节。 */
  function project(x, y, z) {
    const d = Math.max(0.12, z - cam.z);
    const k = 1 / d;
    return {
      x: vw / 2 + (x - cam.x) * k * vh,
      y: vh / 2 + (y - cam.y) * k * vh,
      s: k,
      blur: clamp(Math.abs(Math.log(d)) * 0.9, 0, 1),
      d,
    };
  }

  /* ══ 转场 ══
     两条缝：起初竖着（两条 14° 的斜缝，把屏幕分成三栏），转 76° 之后横着躺在地平线上，
     于是三栏变成「天 / 地平线上那一带光 / 地」。收拢与转共用一条时间线，后半程才转。
     缝的法向 n 由角度 θ 给：θ = 14° 就是检索里那条缝的角度（与 light.js 的 uTan 同一支）。 */
  const TAN = Math.tan((14 * Math.PI) / 180);
  const TH0 = Math.atan(TAN); // 14°
  const BAND = opts.band ?? 90; // 地平线上那一带的全高（px）
  let arriveT = -1;
  const DUR = 1800;

  const begin = () => {
    if (arriveT >= 0) return;
    arriveT = tNow;
    root.dataset.arrived = 'go';
  };
  if (autoArrive === true) setTimeout(begin, 0);
  else if (typeof autoArrive === 'number') setTimeout(begin, autoArrive);

  function seamGeom() {
    const e = arriveT < 0 ? 0 : ease(clamp((tNow - arriveT) / DUR, 0, 1));
    const r = ease(clamp((e - 0.3) / 0.7, 0, 1)); // 先收拢，后半程才转
    const th = lerp(TH0, Math.PI / 2, r); // 14° → 90°：缝从竖着躺成横着
    const yh = vh * horizon;
    /* 支点：起点在屏幕上（竖缝 x = 1/3、2/3）；终点让「竖着过支点」正好落在地平线上下两条缝上
       —— 缝是一条过支点、法向为 n 的线：n·(q − p) = 0，所以 q_y = p_y 时 p_x 任意，
       取 p_y = yh ∓ BAND/2、p_x = 0（法向横向分量为 0 就是一条横线）。 */
    const p0 = [lerp(vw / 3, 0, e), lerp(vh * 0.5, yh - BAND / 2, e)];
    const p1 = [lerp((vw * 2) / 3, 0, e), lerp(vh * 0.5, yh + BAND / 2, e)];
    return { p: [p0, p1], n: [Math.cos(th), Math.sin(th)] };
  }

  /* ══ 转场前的那三栏：只放三个栏头，缝一收就跟着退下去 ══ */
  const arrival = document.createElement('div');
  arrival.className = 'sw-arrival';
  arrival.innerHTML = ['随笔', '瞬间', '项目']
    .map((t, i) => `<b data-i="${i}">${t}</b>`)
    .join('');
  document.body.appendChild(arrival);
  const colHeads = [...arrival.querySelectorAll('b')];

  /* ══ 输入 ══ */
  let drag = null;
  let pendingPull = 0;
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('a,button,[data-ui]')) return;
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: 0, sy: e.clientY };
    pointer.down = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = (e.clientX / vw) * 2 - 1;
    pointer.ny = (e.clientY / vh) * 2 - 1;
    pointer.inside = true;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (arriveT < 0) {
      if (drag.moved > 70 && drag.sy - e.clientY > 40) begin(); // 上划 = 往下走
      return;
    }
    cam.x = drag.cx - dx / (vh * 0.9);
    cam.y = drag.cy - dy / (vh * 0.9);
  });
  addEventListener('pointerup', (e) => {
    if (drag && drag.moved > 4 && arriveT >= 0) {
      cam.vx = -(e.clientX - drag.x) / (vh * 0.9) * 3;
      cam.vy = -(e.clientY - drag.y) / (vh * 0.9) * 3;
    }
    pointer.down = false;
    drag = null;
  });
  addEventListener('pointerleave', () => {
    pointer.inside = false;
    drag = null;
  });
  addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      if (arriveT < 0) {
        if (dy > 0) {
          pendingPull += dy;
          if (pendingPull > 60) begin();
        }
        return;
      }
      cam.z = clamp(cam.z + dy * 0.00042, -0.55, 2.6);
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (arriveT < 0) {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        begin();
      }
      return;
    }
    const st = 0.06;
    if (e.key === 'ArrowLeft') cam.x -= st;
    if (e.key === 'ArrowRight') cam.x += st;
    if (e.key === 'ArrowUp') cam.y -= st;
    if (e.key === 'ArrowDown') cam.y += st;
    if (e.key === '+' || e.key === '=') cam.z = clamp(cam.z + 0.2, -0.55, 2.6);
    if (e.key === '-') cam.z = clamp(cam.z - 0.2, -0.55, 2.6);
  });
  addEventListener('resize', () => {
    vw = innerWidth;
    vh = innerHeight;
    light?.resize();
  });

  /* ══ 帧 ══ */
  const hooks = [];
  let tNow = performance.now();
  let last = tNow;
  const clockStart = tNow;
  let frame = 0;
  let arrive = 0;

  function tick(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    tNow = ts;
    const t = (ts - clockStart) / 1000;
    frame++;

    arrive = arriveT < 0 ? 0 : ease(clamp((ts - arriveT) / DUR, 0, 1));
    if (arrive > 0.98) root.dataset.arrived = 'done';

    // 三个栏头：随转场往后退、淡掉
    const fade = clamp(1 - arrive * 2.6, 0, 1);
    arrival.style.opacity = String(fade);
    if (fade > 0.01) {
      colHeads.forEach((b, i) => {
        const x = ((i * 2 + 1) / 6) * vw - (i * 34) * arrive;
        b.style.transform = `translate3d(${x.toFixed(1)}px, ${(96 - arrive * 120).toFixed(1)}px, 0)`;
      });
    }

    if (!drag) {
      cam.x += cam.vx * dt;
      cam.y += cam.vy * dt;
      const k = Math.exp((-dt * 1000) / 340);
      cam.vx *= k;
      cam.vy *= k;
      if (Math.abs(cam.vx) + Math.abs(cam.vy) < 0.004) cam.vx = cam.vy = 0;
    }

    const s = { t, dt, frame, vw, vh, cam, pointer, arrive, project, horizon: vh * horizon, root };
    for (const h of hooks) h(s);

    const pan = stepBg(dt);
    if (light) {
      light.draw({
        t,
        pan,
        zoom: cam.z + 0.35,
        mouse: { x: pointer.x, y: pointer.y },
        dim: 0,
        seam: seamGeom(),
        split: 1,
        bias: [0, 0, 0],
        lift: [0, 0, 0],
        ring: null,
        face,
        grain: null,
      });
    }
    requestAnimationFrame(tick);
  }

  return {
    cam,
    pointer,
    project,
    begin,
    paint: (fn) => fn(0.24), // 预留：给场景自己调一次色（当前不需要，留个口）
    onFrame: (fn) => {
      hooks.push(fn);
      return () => hooks.splice(hooks.indexOf(fn), 1);
    },
    start: () => requestAnimationFrame(tick),
    get vw() {
      return vw;
    },
    get vh() {
      return vh;
    },
    get horizonY() {
      return vh * horizon;
    },
    get face() {
      return face;
    },
    light,
  };
}

/* 地址参数：?arrive / ?arrive=900 自己转（截图用）、?face=wake 看醒面、?px=4 换像素格 */
export function options() {
  const q = new URLSearchParams(location.search);
  const a = q.get('arrive');
  return {
    autoArrive: q.has('arrive') ? (a ? Number(a) : true) : false,
    face: q.get('face') === 'wake' ? 1 : 0,
    px: q.has('px') ? +q.get('px') : 5,
  };
}
