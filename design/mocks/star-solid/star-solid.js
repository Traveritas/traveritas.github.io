/* ─────────────────────────────────────────────────────────────
   星 · 实心六芒星原语（solid six-point star）
   ─────────────────────────────────────────────────────────────
   一颗三轴正交六芒星：±x ±y ±z 六支，按 yaw / pitch 旋转后做正交投影。
   支长固定、投影半径随姿势在 9.24–16 之间摆动 —— 所以整周里只有
   yaw ≡ 45° (mod 90°) 那一格是「六支等长、互成 60°」的正六芒星，
   也就是现役工具条用的那一格（正等轴视角）。

   这一份把 src/scripts/toolstar.ts 里 drawStar() 的手画逻辑抽成参数化的原语，
   外加三种「更像实体」的渲染分支。默认分支与原版逐字节一致（见 notes.md）。

   API
   ───
   octaStar({
     yaw, pitch,               // 度。yaw 绕竖直轴，pitch 把水平面压下去
     r,                        // 支长（用户单位；工具条里 16）
     halfWidth,                // 每条支在原点处的半宽（1.9）
     notch,                    // 支尾越过原点往回伸的长度（1.4）
     opacityFar, opacityNear,  // 最远 / 最近的支的不透明度（0.38 / 0.88）
     variant,                  // 'flat' | 'ridge' | 'pyramid' | 'silhouette'
     faceted,                  // 布尔糖：true ⇒ variant: 'pyramid'
     light,                    // 视空间光向（左上偏前）
     fold,                     // ridge：脊线两侧翻起的深度（0 = 完全平）
     facetMin, facetMax,       // ridge / pyramid：一个面的明暗区间
     edgeWidth, edgeOpacity,   // pyramid：面棱宽（用户单位）与不透明度
     lineWidth, lineOpacity,   // silhouette：轴线宽与不透明度
     bodyOpacity,              // silhouette：整块的不透明度
     hub,                      // 中心圆半径（flat 默认 1.7；别的默认 0）
   }) → {
     paths: [{ d, opacity, z, role, stroke? }],  // 远 → 近
     variant, opts,
     tips: [{ x, y, z, axis, sign, radius }],
     breadth: { max, min, spread },
     hub,
   }

   paths[i].role 说明怎么画：
     'spike'  现役那支四角风筝（flat）——fill-opacity = opacity
     'facet'  一片三角面（ridge / pyramid）——fill-opacity = opacity
     'edge'   只描边（pyramid 的面棱 / silhouette 的轴线）——stroke-width = stroke，stroke-opacity = opacity
     'body'   一整块剪影（silhouette，nonzero 让六支自动并集）——fill-opacity = opacity
     'hub'    中心圆（颜色交给调用方；工具条里是 --amber）
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;

/** asin(1/√3)：正等轴视角的魔法角 = 35.2643897° */
export const ISO_PITCH = Math.asin(1 / Math.sqrt(3)) / DEG;

/** 现役工具条里写死的字面量（是 35.264 的近似，不是精确值） */
export const TOOLBAR_PITCH = 35.264;

export const VARIANTS = ['flat', 'ridge', 'pyramid', 'silhouette'];

/** 与 drawStar() 逐字节一致的那一组参数（yaw 45° = 唯一像六芒星的那一格） */
export const TOOLBAR_PRESET = Object.freeze({
  yaw: 45,
  pitch: TOOLBAR_PITCH,
  r: 16,
  halfWidth: 1.9,
  notch: 1.4,
  opacityFar: 0.38,
  opacityNear: 0.88,
  variant: 'flat',
});

/** 视空间光向：左上前。三条轴都没被它偏袒（对六支一视同仁） */
const LIGHT_DEFAULT = Object.freeze([-0.42, 0.62, 0.66]);

/* ── 向量小工具 ───────────────────────────────────────────── */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  unit: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 老代码一律 toFixed(2)，这里保持不变（preset 才能逐字节对齐） */
const f = (n) => n.toFixed(2);
/** 视空间 (x, y↑, z 朝外) → 屏幕 (x, y↓)，并乘上 r */
const toScreen = (v, r) => [v[0] * r, -v[1] * r];
/** 已经乘过 r 的视空间点 → 屏幕点 */
const proj = (p) => [p[0], -p[1]];
/** 屏幕方向 → 视空间里投影成这个方向的一个单位向量（z 取 0） */
const fromScreenDir = (sx, sy) => V.unit([sx, -sy, 0]);

/* ── 姿势：六个轴端点的视空间向量 ─────────────────────────── */
/**
 * 与 drawStar() 同一套旋转：先绕竖直轴 yaw，再绕屏幕水平轴 pitch。
 * 返回单位向量 (x, y↑, z 朝观者)；z = +1 最近、−1 最远。
 */
export function pose(yawDeg, pitchDeg) {
  const yaw = yawDeg * DEG;
  const pit = pitchDeg * DEG;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pit);
  const sp = Math.sin(pit);
  const out = [];
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) {
    for (const sign of [1, -1]) {
      const x0 = axis[0] * sign;
      const y0 = axis[1] * sign;
      const z0 = axis[2] * sign;
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      out.push({ v: [x1, y2, z2], axis: axis.join(''), sign, z: z2 });
    }
  }
  return out;
}

/** 一支的骨架：屏幕端点、屏幕单位方向、脊线两侧的两个「肩」 */
function skeleton(spike, o, r) {
  const a = spike.v;
  const [px, py] = toScreen(a, r);
  const L = Math.hypot(px, py);
  if (L < 0.6) return null; // 这支几乎正对镜头（原版也跳过）
  const ux = px / L;
  const uy = py / L;
  // 屏幕上与支垂直的方向 → 视空间（z = 0，仍在屏幕平面里）
  const side = fromScreenDir(-uy, ux);
  return { a, px, py, L, ux, uy, side, w: o.halfWidth, tail: o.notch, r };
}

/* ── flat：现役那一支四角风筝 ─────────────────────────────── */
/* 四个角：原点两侧各偏 halfWidth、投影端点、越过原点 notch 的支尾。
   与原版一式一样，连 toFixed(2) 的位数都一样。 */
function flatPaths(spikes, o, r) {
  const out = [];
  const w = o.halfWidth;
  const t = o.notch;
  for (const s of spikes) {
    const k = skeleton(s, o, r);
    if (!k) continue;
    const op = o.opacityFar + ((o.opacityNear - o.opacityFar) * (s.z + 1)) / 2;
    out.push({
      d:
        `M${f(-k.uy * w)} ${f(k.ux * w)}` +
        `L${f(k.px)} ${f(k.py)}` +
        `L${f(k.uy * w)} ${f(-k.ux * w)}` +
        `L${f(-k.ux * t)} ${f(-k.uy * t)}Z`,
      opacity: +op.toFixed(3),
      z: s.z,
      role: 'spike',
    });
  }
  return out;
}

/* ── ridge：把风筝沿脊线折成两片 ─────────────────────────── */
/* 脊线是「支尾 → 端点」那一根；两侧的肩同时朝观者抬起 fold，于是
   每一支成了两片互相夹角的面，轮廓一点不变（节点同样是 12 条、d 可以原地改）。
   明暗只由面的法线决定 —— 左肩抬起、右肩抬起，两面就一明一暗。 */
function ridgePaths(spikes, o, r, light) {
  const out = [];
  const w = o.halfWidth;
  const t = o.notch;
  const h = o.fold;
  const lo = o.facetMin;
  const hi = o.facetMax;
  for (const s of spikes) {
    const k = skeleton(s, o, r);
    if (!k) continue;
    const tip = V.mul(k.a, r);
    const tail = V.mul(k.a, -t);
    // 「翻起」的方向：与支垂直、与屏幕平面里的侧向垂直 ⇒ 大致朝观者
    let lift = V.unit(V.cross(k.a, k.side));
    if (lift[2] < 0) lift = V.mul(lift, -1);
    const depthT = (s.z + 1) / 2;
    for (const sg of [1, -1]) {
      const shoulder = V.add(V.mul(k.side, w * sg), V.mul(lift, h));
      const pS = proj(shoulder);
      const pT = proj(tip);
      const pL = proj(tail);
      // 法线：朝外（离开脊线那一侧）
      let n = V.unit(V.cross(V.sub(V.mul(k.side, w * sg), tip), V.sub(tail, tip)));
      if (n[2] < 0) n = V.mul(n, -1);
      const shade = clamp(V.dot(n, light), 0, 1);
      // 七成看面朝哪边、三成看这支离观者多近
      const mix = 0.7 * shade + 0.3 * depthT;
      out.push({
        d: `M${f(pS[0])} ${f(pS[1])}L${f(pT[0])} ${f(pT[1])}L${f(pL[0])} ${f(pL[1])}Z`,
        opacity: +(lo + (hi - lo) * clamp(mix, 0, 1)).toFixed(3),
        z: s.z + (sg > 0 ? 0.0004 : 0),
        role: 'facet',
      });
    }
  }
  return out;
}

/* ── pyramid：真正的四面锥（背面剔除 + 面棱） ─────────────── */
/* 底面是一枚正方形，落在**垂直于支**的平面里；四个侧面从底面四角收到端点。
   这样每一支是一块真正的锥体：相邻两面的夹角看得见，背面会被剔掉。
   这是四种里唯一「面数随姿势变」的一种（剔掉几面要看姿势），因此只能整块重画。 */
function pyramid(spike, o, r) {
  const k = skeleton(spike, o, r);
  if (!k) return null;
  const a = k.a;
  const apex = V.mul(a, r);
  const centre = V.mul(a, -k.tail);
  let lift = V.unit(V.cross(a, k.side));
  if (lift[2] < 0) lift = V.mul(lift, -1);
  // 底面四点：沿 side 与 lift 各 ±halfWidth（凸出量为 solid —— 1 是正四棱锥，
  // 小一点则四面更「胖」，投影上的侧棱更靠近中轴）
  const s0 = k.w;
  const s1 = k.w * o.baseDepth;
  const corners = [
    V.add(centre, V.add(V.mul(k.side, s0), V.mul(lift, s1))),
    V.add(centre, V.add(V.mul(k.side, -s0), V.mul(lift, s1))),
    V.add(centre, V.add(V.mul(k.side, -s0), V.mul(lift, -s1))),
    V.add(centre, V.add(V.mul(k.side, s0), V.mul(lift, -s1))),
  ];
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const b0 = corners[i];
    const b1 = corners[(i + 1) % 4];
    let n = V.unit(V.cross(V.sub(b0, apex), V.sub(b1, apex)));
    // 朝外定向：面法线该离开中轴
    if (V.dot(n, V.sub(V.mul(V.add(b0, b1), 0.5), centre)) < 0) n = V.mul(n, -1);
    faces.push({ n, p: [proj(apex), proj(b0), proj(b1)], z: (apex[2] + b0[2] + b1[2]) / (3 * r) });
  }
  return { faces };
}

function pyramidPaths(spikes, o, r, light) {
  const out = [];
  const lo = o.facetMin;
  const hi = o.facetMax;
  const faces = [];
  for (const s of spikes) {
    const py = pyramid(s, o, r);
    if (!py) continue;
    for (const fa of py.faces) if (fa.n[2] > 0.02) faces.push(fa);
  }
  faces.sort((a, b) => a.z - b.z);
  for (const fa of faces) {
    const shade = clamp(V.dot(fa.n, light), 0, 1);
    const depthT = clamp((fa.z + 1) / 2, 0, 1);
    const t = clamp(0.72 * shade + 0.28 * depthT, 0, 1);
    const d = tri(fa.p);
    out.push({ d, opacity: +(lo + (hi - lo) * t).toFixed(3), z: fa.z, role: 'facet' });
    if (o.edgeWidth > 0) out.push({ d, opacity: o.edgeOpacity, z: fa.z + 0.0006, role: 'edge', stroke: o.edgeWidth });
  }
  return out;
}

const tri = (p) => `M${f(p[0][0])} ${f(p[0][1])}L${f(p[1][0])} ${f(p[1][1])}L${f(p[2][0])} ${f(p[2][1])}Z`;

/* ── silhouette：六支并成一块 + 六道轴线 ─────────────────── */
function silhouettePaths(spikes, o, r) {
  const w = o.halfWidth;
  const t = o.notch;
  let body = '';
  let lines = '';
  for (const s of spikes) {
    const k = skeleton(s, o, r);
    if (!k) continue;
    let quad = [
      [-k.uy * w, k.ux * w],
      [k.px, k.py],
      [k.uy * w, -k.ux * w],
      [-k.ux * t, -k.uy * t],
    ];
    // 统一绕向：nonzero 才会把重叠处并成一块（方向不一致会互相挖空）
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const p = quad[i];
      const q = quad[(i + 1) % 4];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (area < 0) quad = quad.reverse();
    body += `M${quad.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`;
    const inner = [k.px * (1 - (t / r) * 1.06), k.py * (1 - (t / r) * 1.06)];
    lines += `M${f(-k.ux * t)} ${f(-k.uy * t)}L${f(inner[0])} ${f(inner[1])}`;
  }
  const out = [{ d: body, opacity: o.bodyOpacity, z: -1, role: 'body' }];
  if (o.lineWidth > 0) out.push({ d: lines, opacity: o.lineOpacity, z: 1, role: 'edge', stroke: o.lineWidth });
  return out;
}

/* ── 中心那一点 ─────────────────────────────────────────── */
/* 两段半圆弧：比 <circle r="1.7"> 少一个节点，仍是正圆。
   工具条那条是 <circle class="ts-hub"> 由 CSS 上色，这里给 role: 'hub' 让调用方决定。 */
function circlePath(rad) {
  return `M${f(-rad)} 0A${f(rad)} ${f(rad)} 0 1 0 ${f(rad)} 0A${f(rad)} ${f(rad)} 0 1 0 ${f(-rad)} 0Z`;
}

/* ── 主函数 ─────────────────────────────────────────────── */
export function octaStar(opts = {}) {
  const o = { ...TOOLBAR_PRESET, ...opts };
  if (opts.faceted) o.variant = 'pyramid';
  const variant = VARIANTS.includes(o.variant) ? o.variant : 'flat';
  const r = o.r;
  const light = V.unit(o.light || LIGHT_DEFAULT);

  const defaults = {
    fold: +(r * 0.14).toFixed(2),
    // 明暗区间拉开到 0.08–0.94：脊线两侧的反差要足够大，才看得出「有厚度」。
    // 收窄到 0.14–0.86 时侧面与正面太接近，星会退回剪纸的观感（见 notes.md 的 A/B）
    facetMin: 0.08,
    facetMax: 0.94,
    baseDepth: 0.34,
    edgeWidth: +(r * 0.045).toFixed(2),
    edgeOpacity: 0.24,
    bodyOpacity: 0.2,
    lineWidth: +(r * 0.05).toFixed(2),
    lineOpacity: 0.4,
  };
  for (const key of Object.keys(defaults)) {
    if (o[key] == null || (typeof o[key] === 'number' && Number.isNaN(o[key]))) o[key] = defaults[key];
  }

  const spikes = pose(o.yaw, o.pitch);
  const tips = spikes.map((s) => {
    const [x, y] = toScreen(s.v, r);
    return { x, y, z: s.z, axis: s.axis, sign: s.sign, radius: Math.hypot(x, y) };
  });

  let paths;
  if (variant === 'ridge') paths = ridgePaths(spikes, o, r, light);
  else if (variant === 'pyramid') paths = pyramidPaths(spikes, o, r, light);
  else if (variant === 'silhouette') paths = silhouettePaths(spikes, o, r);
  else paths = flatPaths(spikes, o, r);

  const hubR = 'hub' in opts ? opts.hub : variant === 'flat' ? 1.7 : 0;
  if (hubR > 0) paths.push({ d: circlePath(hubR), opacity: 1, z: 2, role: 'hub' });
  paths.sort((a, b) => a.z - b.z);

  const radii = tips.map((t) => t.radius);
  return {
    paths,
    variant,
    opts: o,
    tips,
    hub: hubR,
    breadth: { max: Math.max(...radii), min: Math.min(...radii), spread: Math.max(...radii) - Math.min(...radii) },
  };
}

/* ── SVG 片段（给 innerHTML / 每帧替换用） ───────────────── */
export function toMarkup(result, { color = 'currentColor', hub = 'currentColor', attrs = true } = {}) {
  return result.paths
    .map((p) => {
      if (p.role === 'hub') return `<path d="${p.d}" fill="${hub}"/>`;
      if (p.role === 'edge')
        return `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${p.stroke}" stroke-opacity="${p.opacity}" stroke-linejoin="round"${attrs ? ' data-role="edge"' : ''}/>`;
      const rule = p.role === 'body' ? ' fill-rule="nonzero"' : '';
      return `<path d="${p.d}" fill="${color}" fill-opacity="${p.opacity}"${rule}${attrs ? ` data-role="${p.role}"` : ''}/>`;
    })
    .join('');
}

/* ── 校验用：drawStar() 那一段原样搬过来 ─────────────────── */
/** 返回 drawStar() 会写进 .ts-star-g 的那串字符串（到 hub 之前）。 */
export function legacyDrawStar({ yaw = 45, pitch = TOOLBAR_PITCH, r = 16, halfWidth = 1.9, notch = 1.4 } = {}) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const spikes = [];
  for (const [ax, ay, az] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) {
    for (const s of [1, -1]) {
      const x0 = ax * s;
      const y0 = ay * s;
      const z0 = az * s;
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      spikes.push({ x: x1 * r, y: -y2 * r, z: z2 });
    }
  }
  spikes.sort((a, b) => a.z - b.z);
  let out = '';
  for (const q of spikes) {
    const L = Math.hypot(q.x, q.y);
    if (L < 0.6) continue;
    const ux = q.x / L;
    const uy = q.y / L;
    const w = halfWidth;
    const op = (0.38 + (0.5 * (q.z + 1)) / 2).toFixed(3);
    out += `<path d="M${(-uy * w).toFixed(2)} ${(ux * w).toFixed(2)}L${q.x.toFixed(2)} ${q.y.toFixed(2)}L${(uy * w).toFixed(2)} ${(-ux * w).toFixed(2)}L${(-ux * notch).toFixed(2)} ${(-uy * notch).toFixed(2)}Z" fill="currentColor" fill-opacity="${op}"/>`;
  }
  return out;
}