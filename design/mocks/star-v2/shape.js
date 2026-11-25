/* ─────────────────────────────────────────────────────────────
   形状对照表（第四轮 · design/mocks/star-v2/shape.js）

   打开方式：`?set=shape`。A / B / C 三列并排 + 一行纯剪影，每列 260px。

   这一轮**只比形**：材质函数、色散、tone、back、相机距离、16 格、170ms、
   `__star` 接口、落定姿态矩阵全部不动 —— 这里用的 VS / FS / RENDER 就是从
   src.js 里 import 的同一份，不是复制的另一套。唯一的差别是「喂进去的面表」，
   以及 C·棱宽 那一列临时把 uEdgeW 调宽（它只改棱的宽窄，几何与 A 逐位相同）。

   读数全部来自 shape-stats.mjs（同一个模块，node 侧的 shape-audit.mjs 也用它），
   所以页面上的数与离线账里的数是同一份代码算的。
   ───────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import {
  poseAt,
  RENDER,
  AREA_A,
  MAXP,
  MAXF,
  VS,
  FS,
  CAM_Z,
  TAN,
} from './src.js';
import { COLS, readings, DELTA_ROWS } from './shape-stats.mjs';
const SHAPE_DELTA_ROWS = DELTA_ROWS;

const PX_CSS = 260; // 每列画布边长（BRIEF 指定的同画幅）
const DPR = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
const DEV = Math.round(PX_CSS * DPR);

function cssVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}
function unhex(s) {
  let h = String(s).replace('#', '').trim();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * 一个 260px 的格子。
 * mode='crystal' 走与主页面同一张 FS；mode='silhouette' 把同一份面表填成单一深色。
 * col.edgeW 非空时临时改 uEdgeW（只有 C·棱宽 那一列用）。
 */
function makeCell(THREE, canvas, col, mode, bg) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.position.set(0, 0, CAM_Z);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));

  const plArr = new Float32Array(MAXP * MAXF * 4);
  const offArr = new Int32Array(MAXP);
  const cntArr = new Int32Array(MAXP);

  const bgTex = new THREE.Texture();
  bgTex.minFilter = THREE.LinearFilter;
  bgTex.magFilter = THREE.LinearFilter;
  bgTex.generateMipmaps = false;
  const flat = document.createElement('canvas');
  flat.width = flat.height = 4;
  const fg = flat.getContext('2d');
  fg.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  fg.fillRect(0, 0, 4, 4);
  bgTex.image = flat;
  bgTex.needsUpdate = true;

  const sil = mode === 'silhouette';
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VS,
    fragmentShader: FS,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(DEV, DEV) },
      uTan: { value: new THREE.Vector2(TAN, TAN) },
      uCam: { value: new THREE.Vector3(0, 0, CAM_Z) },
      uPl: { value: plArr },
      uOff: { value: offArr },
      uCnt: { value: cntArr },
      uNP: { value: 3 },
      uBg: { value: bgTex },
      uBgAvg: { value: new THREE.Vector3(bg[0] / 255, bg[1] / 255, bg[2] / 255) },
      uFeat: { value: sil ? 0 : RENDER.feat },
      uDream: { value: 0 },
      uCore: { value: sil ? 0 : RENDER.core },
      uCoreC: { value: new THREE.Vector3(0, 0.04, 0) },
      uRough: { value: RENDER.rough },
      /* C·棱宽那一列：只把棱的宽窄改宽，几何一个字不动 */
      uEdgeW: { value: col.edgeW ?? RENDER.edgeW },
      uIor: { value: RENDER.ior },
      uCard: { value: RENDER.card },
      uIrid: { value: sil ? 0 : RENDER.irid },
      uCool: { value: RENDER.cool },
      uRingTint: { value: new THREE.Vector3(...RENDER.ringTint) },
      uCoolDark: { value: RENDER.coolDark },
      uCoolLow: { value: RENDER.coolLow },
      uGlowMix: { value: RENDER.glowMix },
      uDisp: { value: RENDER.disp },
      uBack: { value: RENDER.back },
      uFlat: { value: sil ? 1 : 0 },
      /* 剪影行的颜色按 BRIEF 给的 #2b2f36 */
      uFlatCol: { value: new THREE.Vector3(0x2b / 255, 0x2f / 255, 0x36 / 255) },
      uSS: { value: 2 },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const view = col._view;
  let k = 0;
  let fi = 0;
  for (let i = 0; i < view.length; i++) {
    offArr[i] = fi;
    cntArr[i] = view[i].length;
    for (const f of view[i]) {
      plArr[k++] = f[0];
      plArr[k++] = f[1];
      plArr[k++] = f[2];
      plArr[k++] = f[3];
      fi++;
    }
  }

  canvas.width = canvas.height = DEV;
  renderer.setSize(DEV, DEV, false);
  renderer.render(scene, camera);
}

/* ═══ 页面 ═════════════════════════════════════════════════════ */

/** δ 扫描表（第五轮主任务）。数据从 delta-sweep 的同一套算法在页面里重算 —— 
    这里只做几何与亮度统计，不重复实现着色。 */
function deltaTable() {
  const rows = SHAPE_DELTA_ROWS;
  return `<table class="sheet-sweep">
    <thead><tr>
      <th>δ</th><th>峰数</th><th>峰角间距最大偏差</th><th>峰半径最大偏差</th><th>可辨明暗档数</th><th>8 级分箱占比</th>
    </tr></thead><tbody>
    ${rows
      .map(
        (r) => `<tr class="${r.pick ? 'is-chosen' : ''}">
      <td>${r.delta}°</td>
      <td>${r.peakCount}</td>
      <td>${r.gapMaxDev}°</td>
      <td>${r.radiusMaxDevPct}%</td>
      <td>${r.toneLevels}${r.pick ? ' ← 选中' : ''}</td>
      <td>${r.tonePct.join(' / ')}</td>
    </tr>`,
      )
      .join('')}
    </tbody></table>`;
}
function deltaNote() {
  const pick = SHAPE_DELTA_ROWS.find((r) => r.pick);
  return `判据（BRIEF-5）：峰数 6、角间距最大偏差 ≤ 3°、峰半径最大偏差 ≤ 3%，
    在此前提下取「可辨明暗档数」最多的那个；<b>δ = 0 已满足就取 0</b>。
    五个 δ 的峰数、角间距、峰半径、明暗档数<b>完全相同</b> —— 因为绕视轴的 roll 只是让画面里的星自转，
    不改变任何一张面与视轴的夹角。核对：δ=20 的剖面转 −20° 后与 δ=0 的最大差 = <b>0</b>。
    所以取 <b>δ = ${pick ? pick.delta : 0}°</b>（体对角正位）。
    明暗档数 2 是可接受的：按作者最新口径，<b>明暗塌陷不再是否决条件，剪影才是</b>。`;
}

export async function initShapeSheet() {
  const THREE = await import('three');
  const BG = unhex(cssVar('--bg') || '#f0f3f6');
  const R = readings();
  const sweep = R.sweep;

  const root = document.getElementById('stage');
  const meta = document.querySelector('.meta');
  if (root) root.hidden = true;
  if (meta) meta.hidden = true;
  document.body.classList.add('is-sheet');

  const wrap = document.createElement('div');
  wrap.className = 'sheet';

  const head = document.createElement('header');
  head.className = 'sheet-head';
  head.innerHTML = `
    <h1>形状对照 · 同一条轨迹 / 同一个落定姿态 / 同一台相机 / 260px</h1>
    <p><b>第五轮：落定姿态已回到「能看见六芒星」。</b>第三轮那个 72° 偏移（绕
       <code>(0.688,−0.691,0.223)</code>）把六个尖在画面上压成 4 个方向，已经撤回；
       现在是体对角正位（δ = 0），径向剖面 6 个峰、角间距偏差 0°、峰半径偏差 0.002%。</p>
    <p>第一行是<b>纯剪影</b>（单一深色 <code>#2b2f36</code>，关掉图样与光核），
       <b>判断只看这一行</b>；第二行是水晶，<b>材质行仅供参考</b> —— 明暗塌陷不再是否决条件。
       三列按<b>截面积相等</b>归一（AREA_A = ${AREA_A}），比的是「同样多的料切成几面」。
       材质函数、色散、tone、back、相机距离、edgeW 全部冻结。</p>`;
  wrap.appendChild(head);

  /* δ 扫描表（第五轮主任务） */
  const deltaBox = document.createElement('section');
  deltaBox.className = 'sheet-row';
  deltaBox.innerHTML = `
    <h2>δ 扫描 —— 落定姿态绕视轴倾斜（选 δ 的依据）</h2>
    ${deltaTable()}
    <p class="sheet-note">${deltaNote()}</p>`;
  wrap.appendChild(deltaBox);

  /* theta 扫描小表 */
  const sweepBox = document.createElement('section');
  sweepBox.className = 'sheet-row';
  const okOnes = sweep.filter((s) => s.pass);
  const minRidges = okOnes.length ? Math.min(...okOnes.map((s) => s.visibleRidges)) : null;
  const chosen = okOnes.find((s) => s.visibleRidges === minRidges);
  sweepBox.innerHTML = `
    <h2>theta 扫描（选 C·几何 的依据）</h2>
    <table class="sheet-sweep">
      <thead><tr>
        <th>theta</th><th>独立法向</th><th>锐棱数</th><th>六尖 r</th><th>尖偏差</th><th>凹口/尖</th><th>六重破缺</th><th>可用</th>
      </tr></thead>
      <tbody>
      ${sweep
        .map(
          (s) => `<tr class="${chosen && s.theta === chosen.theta ? 'is-chosen' : ''}">
        <td>${s.theta}°</td>
        <td>${s.distinctDirs}${s.degenerate ? '（退化）' : ''}</td>
        <td>${s.visibleRidges}</td>
        <td>${s.tipMin}–${s.tipMax}</td>
        <td>${s.tipDeviationPct}%</td>
        <td>${s.notchOverTip}</td>
        <td>${s.sixFoldDev}</td>
        <td>${s.pass ? '✓' : '✗'}</td>
      </tr>`,
        )
        .join('')}
      </tbody>
    </table>
    <p class="sheet-note">规则：<b>锐棱数最少 且 六尖偏差 ≤ 2%</b>。
      theta=0 退化（四条法向两两重合，尖伸到 2.0、偏差 100%）先排除。
      <b>注意：换回体对角姿态之后，这条规则会选中 theta = 45°（也就是 A 自己，20 条）。</b>
      第四轮选中的 15° 是在旧的 72° 偏移姿态下量的（那时它 19 条、A 22 条）；
      姿态一换，三个 theta 的锐棱数整体重排（15°→24、30°→21、45°→20）。
      也就是说<b>「哪个 theta 最干净」依赖姿态</b>，不是截面的固有属性。
      本轮按 BRIEF-5「A/B/C 三列就是全部、不许再新增变体」，保留 C = theta 15° 的定义不变，
      只如实报它在当前姿态下已经不再占优。</p>`;
  wrap.appendChild(sweepBox);

  /* B 列那 16.2% 偏在哪：三项分解（数字来自 delta-sweep.mjs 的 bBreakdown） */
  const bNote = document.createElement('section');
  bNote.className = 'sheet-row';
  bNote.innerHTML = `
    <h2>B 列（三角截面）的偏差具体偏在哪</h2>
    <table class="sheet-sweep">
      <thead><tr><th>项</th><th>A</th><th>B</th><th>差</th><th>判</th></tr></thead>
      <tbody>
        <tr><td>臂半径（六个芒尖）</td><td>0.8165 ×6</td><td>0.8165 ×6</td><td>0.00%</td><td>没变</td></tr>
        <tr><td>凹口半径</td><td>0.3264 ×6</td><td>0.3836–0.4244</td><td>17.55% ~ 30.03%</td><td><b>凹口变浅（主因）</b></td></tr>
        <tr><td>凹口/尖 比值</td><td>0.3997</td><td>0.4698</td><td>+17.5%</td><td>缺口浅了</td></tr>
        <tr><td>尖角锐度（两侧 3° 半径跌幅）</td><td>11.2% / 16.1%（六个全同）</td><td>11.2%/16.1% ×3 + 11.6%/9.9% ×3</td><td>两半不同</td><td><b>六个尖分成两种</b></td></tr>
      </tbody>
    </table>
    <p class="sheet-note"><b>结论：B 的偏差不是臂宽变了，也不是尖角整体变钝，而是两件事 ——</b>
      ① <b>凹口变浅</b>（+17.6%~+30.0%）：三角截面把支根撑得更开，缺口被填掉一截，
      这是 16.2% 像素差的主因；
      ② <b>六个尖真的分成两种</b>：30°/90°/150° 那三个尖两侧跌幅是 11.2%/16.1%，
      210°/270°/330° 那三个是 11.6%/9.9% —— 左右不对称的方向反了。
      臂半径完全一致（都是 0.8165），所以「尖到原点的距离」这一项不会发现它，
      必须看<b>尖两侧的斜率</b>才看得出来。这正是三角截面破掉 90° 旋转的可见后果。</p>`;
  wrap.appendChild(bNote);

  const rows = [
    { key: 'silhouette', title: '第一行 · 纯剪影（单一深色 #2b2f36，260px）—— 判断看这一行' },
    { key: 'crystal', title: '第二行 · 水晶（材质行仅供参考，不参与判断）' },
  ];
  for (const row of rows) {
    const sec = document.createElement('section');
    sec.className = 'sheet-row';
    sec.dataset.row = row.key;
    const h = document.createElement('h2');
    h.textContent = row.title;
    sec.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'sheet-grid';
    for (const col of R.columns) {
      const def = COLS.find((c) => c.id === col.id);
      const cell = document.createElement('figure');
      cell.className = 'sheet-cell';
      const cv = document.createElement('canvas');
      cv.style.width = cv.style.height = `${PX_CSS}px`;
      cell.appendChild(cv);
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${def.label}</b><span>${def.sub}</span>
        <dl>
          <dt>面数</dt><dd>${col.faces}（每支 ${col.facesPerArm}）</dd>
          <dt>剪影峰数</dt><dd>${col.peakCount}</dd>
          <dt>峰角间距偏差</dt><dd>${col.gapMaxDev}°</dd>
          <dt>峰半径偏差</dt><dd>${col.peakRadiusMaxDevPct}%</dd>
          <dt>锐棱数</dt><dd>${col.visibleRidges}</dd>
          <dt>与 A 剪影差</dt><dd>${col.id === 'A' ? '—' : col.diffVsA + '%'}</dd>
          <dt>凹口/尖</dt><dd>${col.notchOverTip}</dd>
          <dt>六尖 r</dt><dd>${col.tipMin} – ${col.tipMax}</dd>
          <dt>尖面形态</dt><dd>${col.tipShape.per[0].faces} 面（${col.tipShape.per[0].gaps.join('/')}°）· 种数 ${col.tipShape.kinds}</dd>
          <dt>立方对称破缺</dt><dd>${col.cubic.x} / ${col.cubic.y} / ${col.cubic.z}</dd>
        </dl>`;
      cell.appendChild(cap);
      grid.appendChild(cell);
      makeCell(THREE, cv, col, row.key, BG);
    }
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  const style = document.createElement('style');
  style.textContent = `
    body.is-sheet { display: block; padding: 4vh 2vw 8vh; }
    .sheet { max-width: 1240px; margin: 0 auto; display: grid; gap: 2.4rem; }
    .sheet-head h1 { margin: 0 0 .5rem; font-size: 1.05rem; font-weight: 500; letter-spacing: .02em; }
    .sheet-head p { margin: 0; font-size: 12.5px; line-height: 1.8; color: var(--fg-faint); max-width: 52em; }
    .sheet-head code { font: 11.5px ui-monospace, Consolas, monospace; }
    .sheet-row h2 { margin: 0 0 .8rem; font-size: 11px; font-weight: 400; letter-spacing: .12em;
      text-transform: uppercase; color: var(--fg-faint); }
    .sheet-grid { display: grid; grid-template-columns: repeat(4, ${PX_CSS}px); gap: 1.4rem; justify-content: start; }
    .sheet-cell { margin: 0; display: grid; gap: .6rem; }
    .sheet-cell canvas { display: block; background: var(--bg); }
    .sheet-cell.is-edgew canvas { outline: 1px dashed rgba(35,40,48,.22); outline-offset: 3px; }
    .sheet-cell figcaption { font: 11px/1.6 ui-monospace, 'Cascadia Mono', Consolas, monospace;
      color: var(--fg-faint); display: grid; gap: .1rem; }
    .sheet-cell figcaption b { color: var(--fg-soft); font-weight: 500; }
    .sheet-cell dl { display: grid; grid-template-columns: auto 1fr; gap: 0 .55rem; margin: .5rem 0 0; }
    .sheet-cell dt { color: var(--fg-faint); }
    .sheet-cell dd { margin: 0; color: var(--fg-soft); }
    .sheet-sweep { border-collapse: collapse; font: 11.5px ui-monospace, Consolas, monospace; color: var(--fg-soft); }
    .sheet-sweep th, .sheet-sweep td { padding: .3rem .9rem .3rem 0; text-align: left; font-weight: 400;
      border-bottom: 1px solid var(--rule); }
    .sheet-sweep th { color: var(--fg-faint); font-size: 10.5px; letter-spacing: .06em; }
    .sheet-sweep tr.is-chosen td { color: var(--fg); font-weight: 500; }
    .sheet-note { margin: .7rem 0 0; font-size: 12px; line-height: 1.75; color: var(--fg-faint); max-width: 60em; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(wrap);

  window.__shape = { readings: R, sweep, cols: COLS, ready: true };
  if (window.__star?.ready) window.__star.ready._fire?.(window.__star.stats);
  return R;
}