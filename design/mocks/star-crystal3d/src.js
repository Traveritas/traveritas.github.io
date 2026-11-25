/* ─────────────────────────────────────────────────────────────
   星 · 晶体折射（design/mocks/star-crystal3d）｜ 端口 4673
   结构：六支沿 ±x ±y ±z —— 拓扑与 star-gl / star-final 完全一致，一个数没改。

   这一份的成本全花在**材质与光**上，几何故意做得便宜（六边截面、11 站、
   不收坡、六支互插，交给深度缓冲）。五档材质：

      frosted   磨砂树脂（站点自己的语言）：opacity 0.72、高粗糙、fresnel 边缘
      crystal   近白晶面：粗糙 0.08 + 清漆 + 虹彩（薄膜干涉），环境贴图压暗地面
      refract   真折射：transmission 1 + ior 1.72 + thickness + dispersion，
                必须配**不透明画布、清屏色＝页面底色**，场景里还要有一块衬底
      dusk      蓝紫薄暮：近白晶面往 --amber / --dream 偏、再压一档饱和
      shell     我加的：core（不透明利晶）+ shell（半透明磨砂壳），两层微差

   三条从前面几轮继承、这一轮全部复验过的实测：
     · transmission 在透明画布上会塌成死白 —— 它折射的是「同一个场景」，
       alpha 画布里什么也没有。所以折射档强制不透明画布；
     · transmission 非零即全价 —— 想「透一点」用 opacity；
     · 白晶体在白底上等于白纸 —— 环境贴图必须有一块压暗的地面，
       否则一页白纸上放着一页白纸。这一轮的地面取 #454e5c。

   颜色一律从醒度算：--reality-mix 决定插值位置，--amber/--umber/--wake/--dream
   由 reality.ts 在每一个换面帧里覆写。这里每帧读一次 CSS 计算值，
   所以星永远跟着醒度走，不是冻在一个颜色上。页面上有滑块覆写 --reality-mix
   与那四个变量（走的正是 reality.ts 的插值表），所以「跟着走」能被亲眼验。

   定格：姿态量化，一格画一次，到站后 cancelAnimationFrame，
   连 setTimeout 也不再排 —— 页面上有帧计数器与「静置 2 秒」的取证按钮。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const DEG = Math.PI / 180;

/* ── 底色 ─────────────────────────────────────────────────── */
export const GROUND = { light: '#f0f3f6', deep: '#2a2b38' };

/* ── 姿态：960 格里唯一「六支等长、互成 60°」的那一格 ─────── */
/* yaw 45° / pitch 35.264°。八个体对角姿态的剪影两两 IoU 1.0000，
   所以这八个里挑哪个只是「往哪边转过去」的叙事问题，不是形状问题。 */
export const REST = { yaw: 45, pitch: 35.264 };

/* ── 光 ───────────────────────────────────────────────────── */
/* t-smooth 扫 2160 格得出的方向：光必须在屏幕平面之外。若光在屏幕平面里，
   它总与某一对支的肩方向平行，那一对支的左右两肩同色 —— 整支没有折。
   这一轮把「坏光」也真渲染出来，页面上并排看。 */
const LIGHT_SETS = {
  good: [{ dir: [0.78, 0.42, 0.45], i: 1.9 }],
  /* 屏幕正上、几乎无 z：垂直那两支退成一整片 */
  screenUp: [{ dir: [0.0, 1.0, 0.02], i: 1.9 }],
  /* 纯屏幕侧向：六对同序，死板 */
  inPlane: [{ dir: [1.0, 0.0, 0.0], i: 1.9 }],
  /* 斜前方（v-gem 早期用的那个）：好一些，但明暗序有重复 */
  frontLeft: [{ dir: [-0.34, 0.52, 0.79], i: 1.9 }],
};

/* ══════════════════════════════════════════════════════════
   1. 几何
   ══════════════════════════════════════════════════════════ */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 六支的在体坐标定基。x → (y, z)、y → (z, x)、z → (x, y) 是绕 (1,1,1) 的循环，
    加上正多边形截面在 nu↔de 交换下不变，整颗星对体对角线有精确三重对称 ——
    等轴视角下剪影因此是**正**六芒星，不是「差不多」的六芒星。 */
const FRAMES = [
  { a: [1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { a: [-1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { a: [0, 1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { a: [0, -1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { a: [0, 0, 1], side: [1, 0, 0], ed: [0, 1, 0] },
  { a: [0, 0, -1], side: [1, 0, 0], ed: [0, 1, 0] },
];

const DEFAULT_CFG = {
  r: 1.0, // 支长（归一化到外接球 1）
  /* 半宽从 0.148 加到 0.26：这一轮真扫过一遍（.shots/vary-geo.png）。
     0.148 时六支太细，整颗读成一枚纸折的飞镖；0.24–0.28 才在 200px 上「有体量」，
     宽到 0.30 起六支开始并拢、缺口被吃掉。 */
  halfWidth: 0.26,
  /* 脊高 0.56 → 0.95。脊是「读成晶体」第一要紧的那一项（t-smooth §3②）：
     0.5 起才看得见，0.75–1.5 是甜区。0.56 落在甜区下沿，棱面明暗差不够。 */
  fold: 0.95,
  sides: 6, // 截面边数
  /* 沿轴站。根部密（不收坡，满宽），尖端附近再密一点让收尖不刺 */
  stations: [0, 0.07, 0.16, 0.27, 0.4, 0.53, 0.65, 0.76, 0.85, 0.92, 0.965],
};

/**
 * 造一颗六尖星。非索引 BufferGeometry + **平法线**（每片一个值）：
 * 面上的明暗是「整片一个调子」，量化之后读得出「这是几个面」，
 * 而不是逐三角形抖动。
 */
export function buildStar(patch = {}) {
  const cfg = { ...DEFAULT_CFG, ...patch };
  const pos = [];
  const nor = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  const n = Math.max(3, Math.round(cfg.sides));
  const ring = [];
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    ring.push([Math.cos(th), Math.sin(th)]);
  }

  /* 站：s 沿轴，W 该处半宽。根满宽（不收坡），尖端收成一点。
     1 − t 的 0.88 次幂让尖端稍钝 —— 1 次幂会让六支读成六根针。 */
  const ts = [...cfg.stations, 1];
  const rows = ts.map((t) => ({ t, s: cfg.r * t, W: Math.max(0, cfg.halfWidth * Math.pow(1 - t, 0.88)) }));

  const P = (fr, row, sp) => {
    const c = sp[0] * row.W;
    const d = sp[1] * row.W * cfg.fold;
    return [
      fr.a[0] * row.s + fr.side[0] * c + fr.ed[0] * d,
      fr.a[1] * row.s + fr.side[1] * c + fr.ed[1] * d,
      fr.a[2] * row.s + fr.side[2] * c + fr.ed[2] * d,
    ];
  };

  for (const fr of FRAMES) {
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < ring.length; j++) {
        const j2 = (j + 1) % ring.length;
        const q = [P(fr, rows[i], ring[j]), P(fr, rows[i], ring[j2]), P(fr, rows[i + 1], ring[j2]), P(fr, rows[i + 1], ring[j])];
        ab.set(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]);
        ac.set(q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]);
        if (ab.clone().cross(ac).lengthSq() < 1e-14) continue; // 尖端重合格

        const nuMid = (ring[j][0] + ring[j2][0]) / 2;
        const deMid = (ring[j][1] + ring[j2][1]) / 2;
        const nrm = V3(
          fr.side[0] * nuMid + fr.ed[0] * deMid * cfg.fold,
          fr.side[1] * nuMid + fr.ed[1] * deMid * cfg.fold,
          fr.side[2] * nuMid + fr.ed[2] * deMid * cfg.fold,
        ).normalize();

        const dif = (p, r) => Math.abs(p[0] - r[0]) + Math.abs(p[1] - r[1]) + Math.abs(p[2] - r[2]) < 1e-9;
        const push = (p) => {
          pos.push(p[0], p[1], p[2]);
          nor.push(nrm.x, nrm.y, nrm.z);
        };
        push(q[0]);
        push(q[1]);
        push(q[2]);
        if (!dif(q[2], q[3])) {
          push(q[0]);
          push(q[2]);
          push(q[3]);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  g.userData = { triangles: pos.length / 9, cfg };
  return g;
}

/* ══════════════════════════════════════════════════════════
   2. 程序化环境贴图 —— 「白底上读成晶体」的前提
   ══════════════════════════════════════════════════════════ */

/**
 * 一张等距圆柱的 canvas，画成「一间有窗的暗室」：
 *   天顶近白 → 地平线一条亮带 → **地面压到 #454e5c**，
 *   中间三扇冷白窗、两块深墙。
 *
 * 为什么地面必须暗：白晶体在白底上，能借的只有**棱面之间的明暗差**，
 * 而那个差只能来自环境本身。全亮的环境里每张脸都亮到接近底色，
 * 整颗星就变成纸上的一页纸 —— 第一版原型正是翻在这上面。
 *
 * 窗画成**竖条**而不是圆点：圆的投到棱面上读成一颗颗珠子，竖条读成「房间」。
 */
export function buildEnvTexture(o = {}) {
  const floor = new THREE.Color(o.floor || '#454e5c');
  const horizon = new THREE.Color(o.horizon || '#e9edf2');
  const sky = new THREE.Color(o.sky || '#fdfefe');
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `#${sky.getHexString()}`);
  g.addColorStop(0.34, `#${sky.clone().lerp(horizon, 0.6).getHexString()}`);
  g.addColorStop(0.49, `#${horizon.getHexString()}`);
  g.addColorStop(0.545, `#${horizon.clone().lerp(floor, 0.66).getHexString()}`);
  g.addColorStop(1, `#${floor.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* 暗墙：低频的竖直块，让「绕一圈」有节奏。棱面转过时有台阶才读得出折。 */
  ctx.globalAlpha = 0.46;
  for (const [x, w, c] of [
    [0.05, 0.11, '#3b4150'],
    [0.5, 0.14, '#474e5d'],
    [0.85, 0.1, '#404757'],
  ]) {
    ctx.fillStyle = c;
    ctx.fillRect(x * W, H * 0.22, w * W, H * 0.47);
  }
  ctx.globalAlpha = 1;

  /* 窗：三扇高亮竖条 */
  const winX = [0.235, 0.63, 0.79];
  const winCount = o.windows ?? 3;
  for (let i = 0; i < winCount; i++) {
    const x = winX[i % winX.length] * W;
    const w = W * (0.024 + 0.012 * ((i * 7) % 3));
    const y = H * (0.15 + 0.045 * (i % 2));
    const h = H * 0.31;
    const wg = ctx.createLinearGradient(0, y, 0, y + h);
    wg.addColorStop(0, '#ffffff');
    wg.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = wg;
    ctx.fillRect(x, y, w, h);
  }

  /* 地平线上一道横光：正位时水平那几支的肩会吃到它 */
  const hg = ctx.createLinearGradient(0, H * 0.455, 0, H * 0.535);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, H * 0.455, W, H * 0.08);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ══════════════════════════════════════════════════════════
   3. 颜色：从醒度算，跟着 CSS 走
   ══════════════════════════════════════════════════════════ */

/** reality.ts 的 ACCENT 表，照抄。每项是 [梦端, 醒端]，按 --reality-mix 插值。
    换色怎么推值见 design/accent-contrast.cjs；这里只消费，不发明。
    注意 `--wake` **不在这张表里** —— 它在 reality.ts 里是常量（缝的颜色），
    不随醒度变化。所以它只能从 CSS 读，不能插值。 */
export const ACCENT = {
  '--amber': ['#9a86c4', '#a7b1ba'],
  '--umber': ['#4f4a66', '#556270'],
  '--ghost-ink': ['#817ba3', '#8e9aa6'],
  '--dream': ['#9389ae', '#a39c92'],
};

/** 与 reality.ts 的 mixRgb 同一条插值。--wake 不在表里（它是常量），单独读 CSS。 */
export function accentAt(mix) {
  const o = {};
  for (const k in ACCENT) {
    const [d, w] = ACCENT[k];
    o[k] = new THREE.Color(d).lerp(new THREE.Color(w), mix);
  }
  o['--wake'] = new THREE.Color(cssVar('--wake', '#a7b1ba'));
  return o;
}

function cssVar(name, fb) {
  if (typeof getComputedStyle === 'undefined') return fb;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}

/** 当前醒度 0..1（0 = 梦，1 = 醒）。读 CSS，读不到就当醒面。 */
export function realityMix() {
  const v = parseFloat(cssVar('--reality-mix', '1'));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/**
 * 把醒度翻成一组「晶体的调子」。
 *
 * 关键的一步是 **亮端不用 --amber 本身，而是 --amber 往底色提**：
 * 直接拿强调色当亮端，整颗星只有五十来级亮度差，白底上读成一块均匀的紫
 * （star-gl §4.4 撞过这一下，星内亮度标准差 14.7，而现役平风筝是 25.7）。
 * 所以亮端＝强调色往 ground 提 0.66，暗端＝umber 沉下去但保留颜色，
 * 中间插一层 dream 调的过渡 —— 六片之间才有冷暖层次，而不是六个亮度台阶。
 *
 * @param {'light'|'deep'} groundKey
 * @param {number} [mix] 省略时读 CSS 里的 --reality-mix
 */
export function tonePalette(groundKey = 'light', mix) {
  const m = mix === undefined ? realityMix() : mix;
  const acc = accentAt(m);
  const ground = new THREE.Color(GROUND[groundKey]);
  const deep = groundKey === 'deep';

  /* 体色：amber 与 dream 之间，再往醒面推一点（醒＝冷灰，梦＝薄暮） */
  const body = acc['--amber'].clone().lerp(acc['--dream'], 0.34).lerp(acc['--wake'], 0.1);

  return {
    /** 最亮的面 */
    hi: body.clone().lerp(ground, deep ? 0.52 : 0.68),
    /** 中间面 */
    mid: body.clone().lerp(ground, deep ? 0.26 : 0.4),
    /** 最暗的面 */
    lo: acc['--umber'].clone().lerp(ground, deep ? 0.16 : 0.34),
    /** 树脂 / 折射的体色 */
    body: body.clone().lerp(ground, deep ? 0.12 : 0.26),
    /** 棱线 / 带子的墨色 */
    ink: acc['--umber'].clone().lerp(ground, 0.12),
    ground,
    mix: m,
  };
}

/* ══════════════════════════════════════════════════════════
   4. 材质 —— 交付物就是这一节
   ══════════════════════════════════════════════════════════ */

export const MAT_KEYS = ['frosted', 'crystal', 'refract', 'dusk', 'shell'];
export const MAT_NOTE = {
  frosted: '磨砂树脂',
  crystal: '近白晶面',
  refract: '真折射',
  dusk: '蓝紫薄暮',
  shell: '核 + 壳',
};
export const MAT_SUB = {
  frosted: 'opacity .72 · roughness .52 · fresnel',
  crystal: 'roughness .08 · clearcoat 1 · iridescence .20',
  refract: 'transmission 1 · ior 1.72 · dispersion',
  dusk: 'amber→dream · sheen · iridescence .34',
  shell: 'core + shell（两层同相、微差）',
};

/** 这一档要不要不透明画布（清屏色＝页面底色） */
export function needsOpaqueCanvas(key) {
  return key === 'refract';
}

/**
 * **分档明暗（tonal steps）** —— 这一轮最大的一次观感修正。
 *
 * 第一版的晶体是连续着色的，结果在 #f0f3f6 上读成「纸折的东西」：
 * 面与面之间的过渡是渐变的，眼睛看不到「这里有几张脸」。
 * 这个站自己的语言恰恰是**离散**的 —— t-smooth 的结论是明暗量化到 4 档、
 * 跨度 0.10–0.92 最稳；star-gl 用的是四档；`brand.ts` 与 `Eeg.astro` 是零阶保持。
 *
 * 所以这里也量化：算出这一片自己的调子 t，压成 STEPS 档，再映射到
 * [lo, hi] 两个端点色之间。片内是平的（flat normal 已经在几何里保证了），
 * 片与片之间是**跳台阶**而不是渐变 —— 这才读得出「棱面」。
 *
 * 用 onBeforeCompile 注入，而不是自己写一整个 ShaderMaterial：
 * 我们还要 MeshPhysicalMaterial 的清漆、虹彩、环境反射，重写一遍等于重造轮子。
 */
function tonalize(mat, { steps = 4, lo = 0.1, hi = 0.96 } = {}) {
  mat.userData.tonal = { steps, lo, hi };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uToneSteps = { value: steps };
    shader.uniforms.uToneLo = { value: lo };
    shader.uniforms.uToneHi = { value: hi };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uToneSteps;
         uniform float uToneLo;
         uniform float uToneHi;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           /* 取这一片的调子：漫反射项的亮度（已经含了环境与三盏灯）。
              用 max 分量而不是平均，颜色越偏越不会被均值抹平。 */
           float raw = max(max(totalDiffuse.r, totalDiffuse.g), totalDiffuse.b);
           /* 先归一到 [0,1]：面上的 dot(n,L) 大多挤在 0.35–0.9 之间，
              不归一化的话量化台阶会全部落在亮的一头。 */
           float t = clamp(raw, 0.0, 1.0);
           float q = floor(t * uToneSteps) / max(1.0, uToneSteps - 1.0);
           q = clamp(q, 0.0, 1.0);
           float target = mix(uToneLo, uToneHi, q);
           /* 只把「漫反射那一部分」拉到目标亮度，高光 / 反射原样保留 —— 
              否则棱面上那几粒亮点会被量化吃掉，晶体就不闪了。 */
           vec3 diffusePart = totalDiffuse;
           vec3 specPart = outgoingLight - totalDiffuse;
           float cur = max(max(diffusePart.r, diffusePart.g), diffusePart.b);
           if (cur > 0.0005) diffusePart *= (target / cur);
           outgoingLight = diffusePart + specPart;
         }
         #include <opaque_fragment>`,
      );
  };
  mat.needsUpdate = true;
  return mat;
}

/**
 * 三盏灯：主光（方向由 LIGHT_SETS 给）+ 补光 + 轮廓光 + 环境。
 *
 * `plain: true` 时**只剩主光加一点环境** —— 「光向对照」那一节必须这样。
 * 这是对着第一版渲染图改的：第一版四格都带了同一盏固定的补光与轮廓光，
 * 三个不同方向的主光被它们一摊，四颗星看上去几乎一样，失败根本没显出来。
 * 要让「那两支是平的」被看见，就得让主光说了算。
 */
function makeLights(spec, pal, ground, plain = false) {
  const g = new THREE.Group();
  const deep = ground === 'deep';
  for (const L of spec) {
    const d = new THREE.DirectionalLight(0xffffff, L.i ?? 1.9);
    d.position.set(L.dir[0], L.dir[1], L.dir[2]).normalize().multiplyScalar(10);
    g.add(d);
  }
  if (plain) {
    g.add(new THREE.AmbientLight(0xffffff, deep ? 0.14 : 0.18));
    return g;
  }
  /* 补光：从侧下方回一点，免得暗面掉成一片死色。颜色取 pal.hi，让暗面也带体色。 */
  const fill = new THREE.DirectionalLight(new THREE.Color(pal.hi), deep ? 0.85 : 0.7);
  fill.position.set(-6, -3.4, 4.6);
  g.add(fill);
  /* 轮廓光：从左后上方掠过，让边缘那一圈发亮 —— 在白底上这是「有厚度」的证据 */
  const rim = new THREE.DirectionalLight(new THREE.Color(pal.hi), deep ? 1.15 : 0.9);
  rim.position.set(-3.5, 6, -6.5);
  g.add(rim);
  g.add(new THREE.AmbientLight(new THREE.Color(pal.lo).lerp(new THREE.Color(0xffffff), 0.52), deep ? 0.28 : 0.34));
  return g;
}

/**
 * 造一档材质。返回 { group, materials, apply(pal) } —— apply 只改颜色，
 * 不重建几何、不重编着色器（醒度每帧都在变，这里必须是零成本）。
 *
 * @param {string} key
 * @param {{env:THREE.Texture, ground:string, pal:object, geo:THREE.BufferGeometry, lights?:Array}} ctx
 */
export function makeMaterial(key, ctx) {
  const { env, ground, geo } = ctx;
  const deep = ground === 'deep';
  const envI = deep ? 0.92 : 1.0;
  const group = new THREE.Group();
  const materials = [];

  /* 每一档都用同一个「按调到色」的收口，apply 里只碰 color 与 opacity */
  const recipes = [];

  if (key === 'frosted') {
    /* 站点自己的语言：半透明树脂，边缘提亮，几乎不反光。
       transmission 恒为 0 —— 不是审美取舍，是实测：非零即全价（多一个 pass）。
       闭合实体用 FrontSide；transparent + DoubleSide 会被拆成两个 pass 而画面不变。 */
    const core = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.54,
      metalness: 0,
      transparent: true,
      opacity: deep ? 0.62 : 0.74,
      transmission: 0,
      clearcoat: 0.24,
      clearcoatRoughness: 0.52,
      envMap: env,
      envMapIntensity: envI * 0.8,
      side: THREE.FrontSide,
    });
    const halo = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0,
      transparent: true,
      opacity: deep ? 0.22 : 0.26,
      transmission: 0,
      envMap: env,
      envMapIntensity: envI * 1.25,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    recipes.push({ mat: core, role: 'body', to: (p) => p.body.clone().lerp(p.ground, 0.1) });
    recipes.push({ mat: halo, role: 'halo', to: (p) => p.hi.clone().lerp(new THREE.Color(0xffffff), 0.4) });
    const m1 = new THREE.Mesh(geo, core);
    const m2 = new THREE.Mesh(geo, halo);
    m2.scale.setScalar(1.06);
    group.add(m1, m2);
    materials.push(core, halo);
  }

  if (key === 'crystal') {
    /* 近白晶面：低粗糙 + 清漆 + 薄膜虹彩。
       体色取 pal.mid 而不是 pal.hi —— 这是对着渲染图改出来的：
       用 pal.hi 时最亮那张脸与底色几乎同值，白底上那块面直接「没」了，
       整颗星看起来缺一角。mid 稳定比底色深一档，最亮的脸也还是看得见。
       明暗再量化到 4 档（tonalize）：连续渐变在 #f0f3f6 上读成纸折的东西，
       跳台阶才读得出「这里有几张脸」。 */
    const mat = tonalize(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: deep ? 0.05 : 0.085,
        metalness: 0,
        transmission: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        iridescence: deep ? 0.3 : 0.2,
        iridescenceIOR: 1.34,
        iridescenceThicknessRange: [180, 540],
        envMap: env,
        envMapIntensity: envI * 1.3,
        specularIntensity: 1,
        side: THREE.FrontSide,
      }),
      { steps: 4, lo: 0.34, hi: 1.0 },
    );
    recipes.push({ mat, role: 'body', to: (p) => p.mid });
    group.add(new THREE.Mesh(geo, mat));
    materials.push(mat);
  }

  if (key === 'refract') {
    /* 真折射。四条硬约束：
       ① 画布必须不透明、清屏色＝页面底色（否则折射「空」，塌成死白）；
       ② 场景里要有一块衬底，否则折射出来的是清屏色，几乎无信息；
       ③ thickness 要够，不然折射只发生在表面薄薄一层；
       ④ dispersion 是真色散，只在 transmission > 0 时有意义。
       代价：一个 transmissive pass（整场景再画一遍，只是剔掉这颗星）。 */
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: deep ? 0.03 : 0.05,
      metalness: 0,
      transmission: 1,
      ior: 1.72,
      thickness: 1.4,
      dispersion: 3.4,
      attenuationDistance: deep ? 2.2 : 3.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.06,
      envMap: env,
      envMapIntensity: envI * 1.15,
      side: THREE.FrontSide,
    });
    recipes.push({ mat, role: 'body', to: (p) => p.hi });
    recipes.push({ mat, role: 'atten', to: (p) => p.body });
    group.add(new THREE.Mesh(geo, mat));
    materials.push(mat);

    /* 衬底：一块带色的板 + 两道斜带，摆在星后面。折射要有东西可折 ——
       这些也算在这一档的成本里（多几个 draw call、多几块面的填充）。
       它们同时是「这一档吃掉了透明」的实物证据：画布必须先铺满底色。 */
    const boardMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    recipes.push({ mat: boardMat, role: 'board', to: (p) => p.body.clone().lerp(p.ground, 0.5) });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 6.8), boardMat);
    board.position.z = -2.6;
    materials.push(boardMat);

    const bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    recipes.push({ mat: bandMat, role: 'band', to: (p) => p.ink.clone().lerp(p.ground, 0.18) });
    materials.push(bandMat);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 0.075 + i * 0.03), bandMat);
      b.position.set(0, -1.15 + i * 1.1, -2.55);
      b.rotation.z = 0.24 - i * 0.17;
      group.add(b);
    }
    group.add(board);
  }

  if (key === 'dusk') {
    /* 蓝紫薄暮：近白晶面往 --dream 那一侧偏，饱和度再压一档。
       目的是让这颗星「属于这个站」，而不是一块通用的水晶。
       同样量化成 4 档 —— 这一档的意义在于颜色，不在于要不要平。 */
    const mat = tonalize(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0,
        transmission: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        sheen: 0.5,
        sheenRoughness: 0.62,
        sheenColor: 0xffffff,
        iridescence: 0.34,
        iridescenceIOR: 1.28,
        iridescenceThicknessRange: [240, 620],
        envMap: env,
        envMapIntensity: envI * 1.12,
        side: THREE.FrontSide,
      }),
      { steps: 4, lo: 0.32, hi: 1.0 },
    );
    recipes.push({ mat, role: 'body', to: (p) => p.mid.clone().lerp(p.body, 0.34) });
    recipes.push({ mat, role: 'sheen', set: (p, m) => m.sheenColor.copy(p.hi.clone().lerp(p.body, 0.5)) });
    group.add(new THREE.Mesh(geo, mat));
    materials.push(mat);
  }

  if (key === 'shell') {
    /* 我加的一档：核（不透明的利晶）+ 壳（半透明磨砂）。
       核给「里面有东西」，壳给「外面有一层雾」。两层色相只差一点点 ——
       差太多就读成两件东西套在一起，这是这一档唯一的技术难点。 */
    const coreMat = tonalize(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.16,
        iridescenceIOR: 1.3,
        envMap: env,
        envMapIntensity: envI * 1.22,
        side: THREE.FrontSide,
      }),
      { steps: 4, lo: 0.3, hi: 1.0 },
    );
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0,
      transparent: true,
      opacity: deep ? 0.22 : 0.3,
      transmission: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMap: env,
      envMapIntensity: envI * 0.95,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    recipes.push({ mat: coreMat, role: 'core', to: (p) => p.mid });
    recipes.push({ mat: shellMat, role: 'shell', to: (p) => p.hi.clone().lerp(new THREE.Color(0xffffff), 0.2) });
    group.add(new THREE.Mesh(geo, coreMat));
    const sh = new THREE.Mesh(geo, shellMat);
    sh.scale.setScalar(1.045);
    group.add(sh);
    materials.push(coreMat, shellMat);
  }

  const lights = makeLights(ctx.lights || LIGHT_SETS.good, ctx.pal, ground, !!ctx.plain);
  group.add(lights);

  const apply = (pal) => {
    for (const r of recipes) {
      if (r.set) r.set(pal, r.mat);
      else r.mat.color.copy(r.to(pal));
    }
    /* 灯的颜色也跟着体色走：暗面与轮廓光要带同一份调子，否则青一块紫一块 */
    const fill = lights.children.find((l) => l.isDirectionalLight && l.position.x < 0 && l.position.y < 0);
    if (fill) fill.color.copy(pal.hi);
    const rim = lights.children.find((l) => l.isDirectionalLight && l.position.z < 0 && l.position.y > 0);
    if (rim) rim.color.copy(pal.hi);
  };
  apply(ctx.pal);

  return { key, group, materials, apply, recipes };
}

/* ══════════════════════════════════════════════════════════
   5. 舞台：一个画布、一个渲染器、N 个视角格
   ══════════════════════════════════════════════════════════ */

const CAM_R = 4.6;

/**
 * 一张画布上摊开 N 格（viewport + scissor）。Chrome 每页约 16 个 WebGL 上下文，
 * 这一页有几十颗星 —— 必须共用。
 *
 * 一格的清屏色由**这个 Stage 的 ground** 决定。所以浅底与深底是两张画布，
 * 不能混在一张里（折射档要不透明清屏，清屏色只能是一个值）。
 */
export class Stage {
  /**
   * @param {HTMLElement} host 画布容器（position: relative）
   * @param {{ground?:'light'|'deep', dprCap?:number}} o
   */
  constructor(host, o = {}) {
    this.host = host;
    this.ground = o.ground || 'light';
    this.dprCap = o.dprCap ?? 2;
    this.cells = [];
    this.frames = 0; // 累计 render 次数 —— 零帧取证就读它
    this.calls = 0;
    this.tris = 0;
    this.env = buildEnvTexture();

    const cv = document.createElement('canvas');
    cv.className = 'stage-canvas';
    host.appendChild(cv);
    this.canvas = cv;

    this.renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      /* alpha 由 needsOpaque() 决定；构造时先给 true，加了折射格之后再切 */
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'default',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* 白底上不要 ACES / AgX：它们把近白压成灰，白晶体的亮面会整体掉下去。
       NoToneMapping 保留亮度台阶 —— 这是白底上能读清楚的原因之一。 */
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this._clock = 0;
    this._raf = 0;
    this.opaque = false;
    this._syncClear();
  }

  /** 画布是否必须不透明（只有折射档需要） */
  needsOpaque() {
    return this.cells.some((c) => needsOpaqueCanvas(c.materialKey));
  }

  _syncClear() {
    this.opaque = this.needsOpaque();
    /* three 的 alpha 是构造参数，改不了；开一次 blit 就行 ——
       canvas 的 alpha 由 clearColor 的 alpha 决定合成结果。
       不透明路径靠把清屏色画成不透明来占位，视觉上与页面底色无缝。 */
    this.renderer.setClearColor(new THREE.Color(GROUND[this.ground]), this.opaque ? 1 : 0);
    this.canvas.dataset.opaque = this.opaque ? '1' : '0';
  }

  setGround(g) {
    this.ground = g;
    this._syncClear();
    this.dirty = true;
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  /**
   * 加一格。
   * @param {{materialKey:string, ground?:string, pose?:{yaw:number,pitch:number},
   *          orbit?:boolean, mix?:number|null, env?:object, lights?:Array, geo?:object, drift?:object}} spec
   */
  addCell(spec) {
    const c = {
      materialKey: spec.materialKey,
      ground: spec.ground || this.ground,
      pose: { ...(spec.pose || REST) },
      orbit: spec.orbit !== false,
      mix: spec.mix ?? null,
      drift: spec.drift || null,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(26, 1, 0.1, 100),
      el: null,
    };
    c.camera.position.set(0, 0, CAM_R);
    const pal = tonePalette(c.ground, c.mix === null ? undefined : c.mix);
    c.ctx = { env: spec.env || this.env, ground: c.ground, pal, geo: spec.geo || buildStar(), lights: spec.lights, plain: spec.plain };
    c.mat = makeMaterial(c.materialKey, c.ctx);
    c.scene.add(c.mat.group);
    this.cells.push(c);
    this._syncClear();
    return c;
  }

  /** 重算调色板（醒度变了）—— 只改颜色，不重建几何、不重编着色器 */
  repaint() {
    for (const c of this.cells) {
      if (c.fixedPalette) continue;
      const pal = tonePalette(c.ground, c.mix === null ? undefined : c.mix);
      c.ctx.pal = pal;
      c.mat.apply(pal);
    }
    this.requestDraw();
  }

  /** 画一次。t 只用于 idle drift 那一格。 */
  draw(t = 0) {
    const rec = this.renderer;
    const w = this.canvas.width / rec.getPixelRatio();
    const h = this.canvas.height / rec.getPixelRatio();
    const hostR = this.host.getBoundingClientRect();

    rec.autoClear = false;
    rec.setScissorTest(false);
    rec.setViewport(0, 0, w, h);
    /* 先铺满底色：折射档的 transmissive pass 会采样这层底色，透明档则保持 alpha=0 */
    rec.setClearColor(new THREE.Color(GROUND[this.ground]), this.opaque ? 1 : 0);
    rec.clear(true, true, true);

    for (const c of this.cells) {
      if (!c.el) continue;
      const r = c.el.getBoundingClientRect();
      const x = r.left - hostR.left;
      const y = r.top - hostR.top;
      if (r.width < 2 || r.height < 2) continue;
      const glY = h - (y + r.height);
      rec.setViewport(x, glY, r.width, r.height);
      rec.setScissorTest(true);
      rec.setScissor(x, glY, r.width, r.height);
      /* 每格自己再清一次：透明档在别的格留下的像素不能漏进来 */
      rec.clear(true, true, true);

      c.camera.aspect = r.width / r.height;
      c.camera.updateProjectionMatrix();
      let yaw = c.pose.yaw;
      let pitch = c.pose.pitch;
      if (c.drift && t) {
        yaw += c.drift.yaw * Math.sin(t * c.drift.w);
        pitch += c.drift.pitch * Math.sin(t * c.drift.w * 0.83 + 1.1);
      }
      c.mat.group.rotation.set(pitch * DEG, yaw * DEG, 0, 'XYZ');
      rec.render(c.scene, c.camera);
      this.calls += rec.info.render.calls;
      this.tris += rec.info.render.triangles;
      this.frames++;
      rec.info.reset();
    }
    rec.setScissorTest(false);
    rec.setViewport(0, 0, w, h);
  }

  /** 拖：改这一格自己的姿态。松手不动 —— 停在哪就是哪。 */
  wireOrbit(cell, el) {
    let active = null;
    const down = (e) => {
      if (!cell.orbit) return;
      active = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: cell.pose.yaw, pitch: cell.pose.pitch };
      el.setPointerCapture?.(e.pointerId);
      el.dataset.dragging = '1';
    };
    const move = (e) => {
      if (!active || e.pointerId !== active.id) return;
      cell.pose.yaw = active.yaw + (e.clientX - active.x) * 0.55;
      /* pitch 钳在 ±89°：越过天顶会让 up 翻转，观感上是「翻了个跟斗」 */
      cell.pose.pitch = Math.max(-89, Math.min(89, active.pitch + (e.clientY - active.y) * 0.5));
      this.requestDraw();
    };
    const up = (e) => {
      if (!active) return;
      active = null;
      delete el.dataset.dragging;
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** 只画一次（不排 rAF） */
  drawOnce(t = 0) {
    this.draw(t);
  }

  /** 排一帧（拖拽 / 尺寸变化时用，画完就停） */
  requestDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw(this._clock);
    });
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    for (const c of this.cells) c.mat.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.env.dispose();
    this.canvas.remove();
    this.cells.length = 0;
    const i = state.stages.indexOf(this);
    if (i >= 0) state.stages.splice(i, 1);
  }
}

/* ══════════════════════════════════════════════════════════
   6. 挂载
   ══════════════════════════════════════════════════════════ */

/**
 * 页面里每个格子都长这样（figure 本身是定位锚点，canvas 在 host 上）：
 *   <figure class="cell" data-mat="frosted"></figure>
 */
export function mountCells(stage, cells, o = {}) {
  const list = [...cells];
  for (const el of list) {
    const key = el.dataset.mat || 'crystal';
    const cell = stage.addCell({
      materialKey: key,
      ground: el.dataset.ground || stage.ground,
      pose: el.dataset.yaw ? { yaw: +el.dataset.yaw, pitch: +(el.dataset.pitch || REST.pitch) } : { ...REST },
      orbit: el.dataset.orbit !== 'off',
      mix: el.dataset.mix === undefined ? null : +el.dataset.mix,
      lights: el.dataset.lights ? LIGHT_SETS[el.dataset.lights] : undefined,
      /* 光向对照那一节的格子只给主光（data-plain）：补光与轮廓光会把差别摊平 */
      plain: el.dataset.plain === '1',
    });
    cell.el = el;
    if (el.dataset.mix !== undefined) cell.fixedPalette = false; // mix 是写死的，但仍随滑块刷新
    el.dataset.starCell = '1';
    stage.wireOrbit(cell, el);
    /* 格子角上的小字：材质名，第一次挂载时才写，避免页面里手抄一遍 */
    if (o.label !== false && !el.querySelector('.cell-mat')) {
      const tag = document.createElement('span');
      tag.className = 'cell-mat';
      tag.textContent = MAT_NOTE[key] || key;
      el.appendChild(tag);
    }
  }
  const ro = new ResizeObserver(() => {
    stage.resize();
    stage.requestDraw();
  });
  ro.observe(stage.host);
  stage.resize();
  stage.drawOnce();
  return { stage, cells: list, ro };
}

/* ══════════════════════════════════════════════════════════
   7. 定格：一次翻动，然后完全静止
   ══════════════════════════════════════════════════════════ */

/**
 * 照 brand.ts 的语法：`CYCLE_WORDS` 7 步轮转、每步 `CADENCE_MS = 1000`，
 * 走满一轮之后的那个保持格 ×3（`BREATH_PAUSE_MS = 3000`）。
 * `SiteHeader.astro` 的 `brand-pixel-float` 是 `step-end`，`Eeg.astro` 是每 0.25 s
 * 采样一次并零阶保持 —— 这个仓库里的「定格」＝运动在离散的保持步骤里推进，不补间。
 *
 * 所以这一颗：姿态量化到 STEPS 格，每格 HOLD_MS 一步跳过去，到站即停。
 * 到站之后 cancelAnimationFrame、清掉 setTimeout、连一个 rAF 都不再排。
 */
export const TUMBLE = {
  steps: 12,
  holdMs: 110,
  breath: 3,
  /** 起手姿态：从偏 208° / 27° 的地方转回正位 —— 转角够大，转得出「翻过一次」 */
  from: { yaw: REST.yaw - 208, pitch: REST.pitch - 27 },
  to: REST,
};

export class TumbleClock {
  /**
   * @param {Stage} stage
   * @param {{cell:object, steps?:number, holdMs?:number, breath?:number, onTick?:Function}} o
   */
  constructor(stage, o = {}) {
    this.stage = stage;
    this.cell = o.cell;
    this.steps = o.steps ?? TUMBLE.steps;
    this.holdMs = o.holdMs ?? TUMBLE.holdMs;
    this.breath = o.breath ?? TUMBLE.breath;
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.busy = false;
    this.step = 0;
    this.raf = 0;
    this.timer = 0;
    this.plannedTimers = 0;
    this.live = 0;
    this.ticks = 0;
    this.onTick = o.onTick || (() => {});
    this.cell.pose = { ...TUMBLE.to };
    this._alive = false;
  }

  /** 一格：排一次 rAF，画一帧，再按 holdMs 排下一次。这样每格都真的画到。 */
  _tick() {
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this._alive) return;
      const k = this.step / this.steps;
      /* 离散插值：格与格之间不补间 —— 这是「定格」的全部意思 */
      this.cell.pose = {
        yaw: TUMBLE.from.yaw + (TUMBLE.to.yaw - TUMBLE.from.yaw) * k,
        pitch: TUMBLE.from.pitch + (TUMBLE.to.pitch - TUMBLE.from.pitch) * k,
      };
      this.stage.drawOnce();
      this.ticks++;
      this.onTick({ step: this.step, frames: this.stage.frames, pose: { ...this.cell.pose } });
      this.step++;
      if (this.step > this.steps) return this._finish();
      const hold = this.step === this.steps ? this.holdMs * this.breath : this.holdMs;
      this.timer = setTimeout(() => {
        this.timer = 0;
        this.live--;
        this._tick();
      }, hold);
      this.live++;
      this.plannedTimers++;
    });
  }

  _finish() {
    this._alive = false;
    this.busy = false;
    this.cell.pose = { ...TUMBLE.to };
    this.stage.drawOnce(); // 落到正位这一帧必须画出来
    this.onTick({ step: 'rest', frames: this.stage.frames, done: true });
  }

  start() {
    if (this.busy) return { started: false, reason: 'busy' };
    if (this.reduce) {
      /* reduced-motion：只画正位一张，不播过程，一个 rAF 都不排 */
      this.cell.pose = { ...TUMBLE.to };
      this.stage.drawOnce();
      this.onTick({ step: 'rm', frames: this.stage.frames, done: true, reduce: true });
      return { started: false, reason: 'reduced-motion' };
    }
    this.busy = true;
    this._alive = true;
    this.step = 0;
    this.ticks = 0;
    this.cell.pose = { ...TUMBLE.from };
    this._tick();
    return { started: true };
  }

  /** 停表：rAF 与 setTimeout 全部清掉 */
  stop() {
    this._alive = false;
    this.busy = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.live = 0;
  }

  /** 静置 ms 之后看帧数差了多少 —— 「零帧」的取证 */
  async probeIdle(ms = 2000) {
    const before = this.stage.frames;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, ms));
    return {
      before,
      after: this.stage.frames,
      delta: this.stage.frames - before,
      elapsed: Math.round(performance.now() - t0),
      raf: this.raf,
      timer: this.timer,
      busy: this.busy,
    };
  }

  state() {
    return {
      busy: this.busy,
      raf: this.raf,
      timer: this.timer,
      live: this.live,
      step: this.step,
      ticks: this.ticks,
      frames: this.stage.frames,
      pose: { ...this.cell.pose },
      reduce: this.reduce,
    };
  }
}

/* ══════════════════════════════════════════════════════════
   8. 块计时 —— 逐帧 gl.finish 在这个尺寸上是纯噪声
   ══════════════════════════════════════════════════════════ */

/**
 * 一块 N 帧连续画、块末 `gl.finish()` 一次，整块计时 ÷ N，跑 blocks 块取中位数。
 * 这是 star-v-gem §5 量出来的唯一稳定口径：逐帧 finish 的读数会在 0.03 与 11.8
 * 之间跳（headless 里 performance.now() 被量化，核显上 finish 又有长空转尾部）。
 */
export function blockTime(stage, { frames = 40, blocks = 5 } = {}) {
  const gl = stage.renderer.getContext();
  const runs = [];
  for (let i = 0; i < 4; i++) stage.draw(0); // 预热：着色器编译不进计时
  gl.finish();
  stage.calls = 0;
  stage.tris = 0;
  stage.frames = 0;
  for (let b = 0; b < blocks; b++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) stage.draw(0);
    gl.finish();
    runs.push((performance.now() - t0) / frames);
  }
  runs.sort((a, b) => a - b);
  const cells = stage.cells.length;
  return {
    ms: +runs[Math.floor(runs.length / 2)].toFixed(3),
    runs: runs.map((r) => +r.toFixed(3)),
    callsPerFrame: +(stage.calls / stage.frames).toFixed(2),
    trisPerFrame: Math.round(stage.tris / stage.frames),
    cells,
    frames,
    blocks,
  };
}

/* ══════════════════════════════════════════════════════════
   9. 光向诊断 —— 「两支同色」要能被量出来
   ══════════════════════════════════════════════════════════ */

/**
 * 在当前姿态下量「六支各自有没有折」。
 *
 * 一条踩过的坑，记在这里：**分组必须用有符号的 dot**。
 * 第一版用 `Math.abs(c.dot(f))` 把每片面归到最近的那一支，结果 +x 与 −x 的
 * 面一起被算进了同一支 —— 于是六支里有三支永远是空的，读数全是 0，
 * 而且换任何光向读数都不变。这是个假读数，比没有读数更糟。
 * 改成有符号之后每支才真正拿到自己的面。
 *
 * 第二个口径：只统计**朝向观者**的那些面（n.z > 0.15）。
 * 一支背面那半圈棱面在屏幕上根本不可见，把它们算进极值里，
 * 落差就恒等于「这支转过一圈」的量，与光无关 —— 那同样是个假读数。
 *
 * @param {number[]} lightDir 视空间方向
 * @param {{yaw:number,pitch:number}} pose
 */
export function lightReport(lightDir, pose = REST) {
  const geo = buildStar();
  const pos = geo.getAttribute('position').array;
  const nor = geo.getAttribute('normal').array;
  const L = new THREE.Vector3(...lightDir).normalize();
  /* 绕序必须与 Stage.draw() 里那一句一致：XYZ。
     yaw 45° / pitch 35.264° 只有在 XYZ 下才是「六支等长、互成 60°」的正六芒星
     （YXZ 下六个端点半径 0.707–0.913、相邻夹角 45/63.4/71.6，不是六芒星）。
     这个数是用六个 ±轴向端点算出来验过的，见 notes.md §2。 */
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch * DEG, pose.yaw * DEG, 0, 'XYZ'));
  const nm = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().makeRotationFromQuaternion(q));

  const framesV = FRAMES.map((f) => new THREE.Vector3(...f.a));
  const perSpike = framesV.map(() => []);
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(V3(pos[i + k * 3], pos[i + k * 3 + 1], pos[i + k * 3 + 2]));
    c.multiplyScalar(1 / 3);
    /* 有符号：这一片的面心在哪个支的方向上 */
    let best = 0;
    let bd = -2;
    for (let k = 0; k < 6; k++) {
      const d = c.dot(framesV[k]);
      if (d > bd) (bd = d), (best = k);
    }
    if (bd < 0.1) continue; // 星心那一圈不归任何一支
    n.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize();
    if (n.z <= 0.15) continue; // 背面不参与
    perSpike[best].push(n.dot(L));
  }

  const tone = perSpike.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN));
  const spine = perSpike.map((a) => (a.length ? Math.max(...a) - Math.min(...a) : NaN));
  const ok = spine.filter((v) => Number.isFinite(v));

  /**
   * 「两支同色」的直接量：把六支的平均调子丢进**渲染时真正用的那 4 档**，
   * 数一下还剩几个不同的档。渲染是把 t 在 [0,1] 上等分成 4 档（见 tonalize），
   * 所以两支持平到同一档里，它们在屏幕上是**同一个颜色** —— 折就没了。
   * 这个数比「最小支内落差」更贴近眼睛看到的东西，两个都报。
   */
  const BINS = 4;
  const bins = tone
    .filter((v) => Number.isFinite(v))
    .map((v) => {
      const t = Math.max(0, Math.min(0.9999, v * 0.5 + 0.5)); // dot(n,L) ∈ [−1,1] → [0,1]
      return Math.floor(t * BINS);
    });
  const distinctTones = new Set(bins).size;

  return {
    minSpine: ok.length ? +Math.min(...ok).toFixed(3) : null,
    maxSpine: ok.length ? +Math.max(...ok).toFixed(3) : null,
    meanSpine: ok.length ? +(ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(3) : null,
    /** 支内落差 < 0.06 的支数 —— 这一项大于 0 就是「那几支没有折」 */
    flat: ok.filter((v) => v < 0.06).length,
    /** 六支的调子在 4 档里占了几档（6 支最多 4 档；越小＝越多支同色） */
    distinctTones,
    bins,
    /** 每支可见面数（读数为 0 时先看这里，确认不是分组又错了） */
    faces: perSpike.map((a) => a.length),
    spine: spine.map((v) => (Number.isFinite(v) ? +v.toFixed(3) : null)),
    tone: tone.map((v) => (Number.isFinite(v) ? +v.toFixed(3) : null)),
  };
}

export const LIGHTS = LIGHT_SETS;

/* ══════════════════════════════════════════════════════════
   10. 全局状态
   ══════════════════════════════════════════════════════════ */

export const state = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  stages: [],
  clocks: {},
};

/* ══════════════════════════════════════════════════════════
   11. 离线测算：不依赖页面布局，开一个离屏画布逐档量
   ══════════════════════════════════════════════════════════ */

/**
 * 逐档量「一页里只放这颗星」的成本：480×480 缓冲、DPR 1、每档 5 块 × 40 帧。
 * 走的是真的 Stage，所以 calls / triangles 是驱动报的数，不是估的。
 */
export async function measureAll({ size = 480, frames = 40, blocks = 5 } = {}) {
  const out = [];
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-9999px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(host);
  for (const groundKey of ['light', 'deep']) {
    for (const key of MAT_KEYS) {
      const stage = new Stage(host, { ground: groundKey, dprCap: 1 });
      stage.resize();
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;inset:0;width:${size}px;height:${size}px`;
      host.appendChild(el);
      const cell = stage.addCell({ materialKey: key });
      cell.el = el;
      stage.drawOnce();
      const m = blockTime(stage, { frames, blocks });
      /* 定格模式下每秒占用＝合成成本 ÷ 保持时长。9.1 次/秒就是 110 ms 一格。 */
      out.push({ ground: groundKey, mat: key, ...m, msPerSec110: +(m.ms * (1000 / 110)).toFixed(2) });
      el.remove();
      stage.dispose();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  host.remove();
  return out;
}