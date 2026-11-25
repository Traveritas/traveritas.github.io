/* 页面脚本：读 .shots/data.json，画姿态地图 / 运动 / 帧条 / 尺寸。
   所有分数、矩阵都来自 .numbers.mjs 的扫描结果，页面不重算。 */

import {
  StarLayer, mountTiles, mountStrip, measure, quatFromMatrix, makeReadMaterial,
  MOTIONS, poseOf, poseList, schedule,
  HOLD_CHOICES, STEP_CHOICES, BREATH,
} from './src.js';
import { viewMatrix } from './posecore.mjs';

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };

const state = { holdMs: 110, steps: 12, material: 'resin' };
let DATA = null;

/* ── 姿态地图 ────────────────────────────────────────────────
   核心判断依据是「这一格好不好看」，所以地图上必须是**真的星**，不是色块。
   961 个 <canvas> 会撞上 Chrome 的 16 个 WebGL 上下文上限，
   所以整张地图是**一个** canvas、一个渲染器，靠 viewport + scissor 逐格画。
   （star-crystal 的 notes 记过这个坑：layer 会把 viewport 铺满整张画布，
     多格共用时必须自己管好 viewport，画完再还原。） */

const MAP = { cell: 64, gap: 2 };
let mapCanvas = null;
let mapTiles = [];

function buildMap() {
  const { gridAxis, grid } = DATA;
  const n = gridAxis.length;
  const { cell, gap } = MAP;
  const W = n * (cell + gap) - gap;
  const H = W;
  const wrap = $('#mapwrap');

  wrap.style.width = `${W + 26}px`;
  wrap.style.height = `${H + 26}px`;

  const cv = el('canvas');
  cv.className = 'mapc';
  cv.style.position = 'absolute';
  cv.style.left = '22px';
  cv.style.top = '22px';
  wrap.appendChild(cv);
  mapCanvas = cv;

  /* 数据区：按当前阅片尺寸缩放到 cell 格。
     这里刻意换掉材质 —— 64px 一格上玻璃材质几乎全透，六十几个剪影会糊成雾，
     判断不了好坏。地图用的是判读用的实心材质（见 makeReadMaterial）。 */
  const layer = new StarLayer(cv, { size: cell, material: state.material });
  layer.stop();
  layer.scene.remove(layer.edgeMesh);
  layer.edgeMesh = null;
  layer.mesh.material = makeReadMaterial();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  layer.renderer.setPixelRatio(dpr);
  layer.renderer.setSize(W, H, false);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;

  /* 好/坏标记：只标「不该停」与「最好」两档，其余让画面自己说 */
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const score = grid[r].cells[c][0];
      const left = 22 + c * (cell + gap);
      const top = 22 + r * (cell + gap);
      if (score < 55) {
        const b = el('div', 'badv');
        b.style.left = `${left}px`;
        b.style.top = `${top}px`;
        b.style.width = `${cell}px`;
        b.style.height = `${cell}px`;
        wrap.appendChild(b);
      } else if (score >= 95) {
        const b = el('div', 'goodv');
        b.style.left = `${left}px`;
        b.style.top = `${top}px`;
        b.style.width = `${cell}px`;
        b.style.height = `${cell}px`;
        wrap.appendChild(b);
      }
      /* 分数写在每格右下角：地图要能「对着数字看画」，
         点名的几格（26 / 51 / 79 / 100）必须能直接读出来。 */
      const s = el('div', 'maps');
      s.textContent = String(score);
      s.style.left = `${left}px`;
      s.style.top = `${top + cell - 12}px`;
      wrap.appendChild(s);
    }
  }

  /* 轴标 */
  for (let r = 0; r < n; r += 5) {
    const t = el('div', 'maplabel', `p${gridAxis[r]}`);
    t.style.left = '0px';
    t.style.top = `${22 + r * (cell + gap) + cell / 2 - 6}px`;
    wrap.appendChild(t);
  }
  for (let c = 0; c < n; c += 5) {
    const t = el('div', 'maplabel', `y${gridAxis[c]}`);
    t.style.left = `${22 + c * (cell + gap) + cell / 2 - 10}px`;
    t.style.top = `${H + 22}px`;
    wrap.appendChild(t);
  }

  /* 点击命中：一层透明网格盖上去，指针事件由它接 */
  const hits = el('div', 'hittable');
  hits.style.left = '22px';
  hits.style.top = '22px';
  hits.style.width = `${W}px`;
  hits.style.height = `${H}px`;
  hits.style.gridTemplateColumns = `repeat(${n}, ${cell}px)`;
  hits.style.gridTemplateRows = `repeat(${n}, ${cell}px)`;
  hits.style.gap = `${gap}px`;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const h = el('div', 'hit');
      const yaw = gridAxis[c];
      const pitch = gridAxis[r];
      h.addEventListener('click', () => pick(yaw, pitch));
      hits.appendChild(h);
    }
  }
  wrap.appendChild(hits);

  const marker = el('div', 'pickv');
  marker.style.left = '22px';
  marker.style.top = '22px';
  marker.style.width = `${cell}px`;
  marker.style.height = `${cell}px`;
  wrap.appendChild(marker);
  mapTiles = { layer, marker, n, W, H };

  paintMap();
}

function paintMap() {
  if (!mapTiles) return;
  const { layer, W, H, n } = mapTiles;
  const { cell, gap } = MAP;
  const r2 = layer.renderer;
  r2.setScissorTest(true);
  r2.clear();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const yaw = DATA.gridAxis[c];
      const pitch = DATA.gridAxis[r];
      const cx = c * (cell + gap);
      const gy = H - (r * (cell + gap)) - cell; /* WebGL 原点在左下 */
      r2.setViewport(cx, gy, cell, cell);
      r2.setScissor(cx, gy, cell, cell);
      const q = quatFromMatrix(viewMatrix(yaw, pitch));
      layer.mesh.quaternion.copy(q);
      if (layer.edgeMesh) layer.edgeMesh.quaternion.copy(q);
      r2.render(layer.scene, layer.camera);
    }
  }
  r2.setScissorTest(false);
  r2.setViewport(0, 0, W, H);
}

/* 最近的格子（yaw/pitch 未必正好落在 3° 网格上，例如 35.264°） */
function nearestIndex(v) {
  const ax = DATA.gridAxis;
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < ax.length; i++) {
    const d = Math.abs(ax[i] - v);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

let pickLayer = null;
function pick(yaw, pitch) {
  if (!pickLayer) return;
  pickLayer.showMatrix(viewMatrix(yaw, pitch));
  const ci = nearestIndex(yaw);
  const ri = nearestIndex(pitch);
  const score = DATA.grid[ri]?.cells[ci]?.[0];
  $('#pickcap').textContent = `yaw ${yaw}° · pitch ${pitch}° · ${score != null ? score : '?'} 分`;
  if (mapTiles) {
    const { cell: csz, gap } = MAP;
    mapTiles.marker.style.left = `${22 + ci * (csz + gap)}px`;
    mapTiles.marker.style.top = `${22 + ri * (csz + gap)}px`;
  }
}

/* ── 点名角度表 ──────────────────────────────────────────── */
function buildProbe() {
  const tb = $('#probe');
  const head = el('tr');
  ['yaw', 'pitch', '分数', '六支半径均衡', '读法'].forEach((h) => head.appendChild(el('th', null, h)));
  tb.appendChild(head);
  for (const f of DATA.fatal) {
    const tr = el('tr');
    if (f.score >= 95) tr.className = 'is-key';
    [String(f.yaw), String(f.pitch), String(f.score), f.balance.toFixed(3), f.why].forEach((v, i) => {
      const td = el('td', i < 4 ? 'num' : null, v);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }
}

/* ── 运动卡片 ────────────────────────────────────────────── */
const CARDS = [
  { key: 'hinge', pick: false },
  { key: 'yaw', pick: false },
  { key: 'osc', pick: true },
  { key: 'windmill', pick: true },
  { key: 'ladder', pick: false },
  { key: 'settle', pick: false },
];

const motionLayers = [];
function buildMotions() {
  const host = $('#motions');
  host.innerHTML = '';
  motionLayers.length = 0;

  for (const card of CARDS) {
    const spec = MOTIONS[card.key];
    const d = DATA.motions[card.key];
    const box = el('div', 'mcard' + (card.pick ? ' is-pick' : ''));

    const hd = el('div', 'hd');
    hd.appendChild(el('span', 'nm', spec.label));
    hd.appendChild(el('span', 'sc', card.pick ? '推荐' : `${d.min}–${d.max}`));
    box.appendChild(hd);

    const cv = el('canvas');
    box.appendChild(cv);
    const nt = el('div', 'nt', spec.note);
    box.appendChild(nt);
    host.appendChild(box);

    /* 每张卡片一个 StarLayer，按当前 holdMs/steps 动起来。
       它们都在视口内才跑（IntersectionObserver）。 */
    const layer = new StarLayer(cv, {
      size: 200, motion: card.key, steps: state.steps, holdMs: state.holdMs, material: state.material,
    });
    motionLayers.push({ key: card.key, layer, cv, nt, box });

    const io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (e.isIntersecting) layer.start();
        else layer.stop();
      }
    }, { rootMargin: '120px' });
    io.observe(cv);
  }
}

function scoresFor(key) {
  /* 按当前 steps 现算一遍分数（数据里那套是按 12 步算的） */
  const steps = state.steps;
  const list = poseList(key, steps);
  return list.map((m) => {
    const v = scoreOfMatrix(m);
    return v;
  });
}

/* 页面里现算一个姿态的分数。
   之前在页面里用 961 格的查找表近似（把任意矩阵折到最近的 3° 格），
   实测这个近似会**给出假分数** —— 摆动的 ±18° 被折进相邻格之后报出「最低 54」，
   而逐度实测是 80。数字不能这么给，所以改成真算：
   posecore 的 measureMask 是纯函数，一次调用在 96px 掩码上约 1 ms。 */
import { buildStar, rasterizeM, measureMask, scoreOf } from './posecore.mjs';

const SCORE_MESH = buildStar();

function scoreOfMatrix(m) {
  const { mask } = rasterizeM(SCORE_MESH, m, { size: 96 });
  const res = measureMask(SCORE_MESH, mask, 96, 0, 0, { matrix: m });
  return scoreOf(res);
}

/* ── 控件 ────────────────────────────────────────────────── */
function buildSegs() {
  const hold = $('#holdseg');
  HOLD_CHOICES.forEach((h) => {
    const b = el('button', null, String(h));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(h === state.holdMs));
    b.addEventListener('click', () => {
      state.holdMs = h;
      hold.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === String(h))));
      applyState();
    });
    hold.appendChild(b);
  });

  const step = $('#stepseg');
  STEP_CHOICES.forEach((s) => {
    const b = el('button', null, String(s));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === state.steps));
    b.addEventListener('click', () => {
      state.steps = s;
      step.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === String(s))));
      applyState();
    });
    step.appendChild(b);
  });

  const mat = $('#matseg');
  for (const [v, label] of [['resin', '树脂'], ['resinEdge', '深边']]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === state.material));
    b.addEventListener('click', () => {
      state.material = v;
      mat.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      applyState();
    });
    mat.appendChild(b);
  }
  updateHints();
}

function updateHints() {
  const steps = state.steps;
  const perRev = (steps * state.holdMs + (BREATH - 1) * state.holdMs) / 1000;
  $('#holdhint').textContent =
    `一圈 ${perRev.toFixed(2)} s（最后一格停 ${BREATH}×）；每秒 ${(1000 / state.holdMs).toFixed(1)} 次重绘`;
}

function applyState() {
  updateHints();
  for (const { key, layer, nt } of motionLayers) {
    layer.set({ steps: state.steps, holdMs: state.holdMs, material: state.material });
    /* 当前步数下有没有踩到坏格 */
    const list = poseList(key, state.steps);
    const sc = list.map(scoreOfMatrix);
    const bad = sc.filter((v) => v < 55).length;
    const low = Math.min(...sc);
    const base = MOTIONS[key].note;
    nt.innerHTML = '';
    nt.appendChild(document.createTextNode(base + ' '));
    const tag = el('span', bad ? 'warn' : 'mono', bad ? `${bad}/${sc.length} 格 < 55（最低 ${low}）` : `${sc.length} 格全部 ≥ 55（最低 ${low}）`);
    nt.appendChild(tag);
  }
  /* 姿态地图与帧条也跟着换材质 */
  if (mapTiles) { mapTiles.layer.set({ material: state.material }); paintMap(); }
  for (const s of frameStrips) s.setMaterial(state.material);
  if (sizeStrip.ref) sizeStrip.ref.setMaterial(state.material);
  if (darkStrip.ref) darkStrip.ref.setMaterial(state.material);
  if (pickLayer) pickLayer.set({ material: state.material });
}

/* ── 粒度表 ──────────────────────────────────────────────── */
function buildGrain() {
  const tb = $('#graintable');
  const head = el('tr');
  ['运动', '步数', '格数', '最低分', '相邻 IoU', '最像的一对', ''].forEach((h) => head.appendChild(el('th', null, h)));
  tb.appendChild(head);
  for (const g of DATA.grain) {
    const tr = el('tr');
    const verdict = g.meanIoU > 0.95 ? '太像，读不出翻动' : g.meanIoU > 0.85 ? '偏像，接近呼吸' : g.meanIoU > 0.55 ? '读得出换面' : '差得够远，但可能太跳';
    [g.motion, String(g.steps), String(g.n), String(g.min), g.meanIoU.toFixed(3), g.minIoU.toFixed(3), verdict].forEach((v, i) => {
      tr.appendChild(el('td', i >= 1 && i <= 5 ? 'num' : null, v));
    });
    tb.appendChild(tr);
  }
  $('#grainnote').textContent =
    '相邻 IoU 是这一格与下一格剪影的重合度。0.95 以上两格几乎一样，定格读成一个静止的点；' +
    '0.55–0.85 才是「看得出换了面、又不会闪」的区间。保持时长 holdMs 决定节奏，步数决定每次换多大幅度。';
}

/* ── 静止帧条 ──────────────────────────────────────────────
   两条决赛运动各一行。每行是**一张** canvas（viewport 分区），
   不是 6 张 —— 上下文预算已经被 6 张运动卡用掉大半了。 */
const frameStrips = [];
function buildFrames() {
  const host = $('#frames');
  host.innerHTML = '';
  frameStrips.length = 0;
  for (const key of ['osc', 'windmill']) {
    const spec = MOTIONS[key];
    const card = el('div', 'fcard');
    card.appendChild(el('div', 'hd', spec.label));
    const d = DATA.motions[key];
    card.appendChild(el('div', 'sub', `${d.n} 格 · 分数 ${d.min}–${d.max} · 均值 ${d.mean}`));
    const row = el('div', 'frow');
    card.appendChild(row);
    host.appendChild(card);

    const list = poseList(key, 6).map((m) => ({ matrix: m, size: 124 }));
    const cv = el('canvas');
    row.appendChild(cv);
    const strip = mountStrip(cv, list, { gap: 8, material: state.material });
    frameStrips.push(strip);
  }
}

/* ── 尺寸 + 深底 ─────────────────────────────────────────── */
const sizeStrip = { ref: null };
function buildSizes() {
  const host = $('#sizes');
  const old = host.querySelector('canvas');
  if (old) old.remove();
  const list = [240, 144, 96, 64].map((size) => ({ matrix: viewMatrix(45, 35.264), size }));
  const cv = el('canvas');
  /* 插到最前面，后面的小标签保持不动 */
  host.insertBefore(cv, host.firstChild);
  sizeStrip.ref = mountStrip(cv, list, { gap: 26, material: state.material });
  /* 标签已经写在 HTML 里，这里只把画布对齐到它们上方 */
  cv.style.marginBottom = '0.2rem';
}

const darkStrip = { ref: null };
function buildDark() {
  const host = $('#darkrow');
  const old = host.querySelector('canvas');
  if (old) old.remove();
  const poses = [[45, 35.264], [30, 30], [45, 0], [0, 0]];
  const list = poses.map(([yaw, pitch]) => ({ matrix: viewMatrix(yaw, pitch), size: 168 }));
  const cv = el('canvas');
  cv.style.borderRadius = '4px';
  host.insertBefore(cv, host.firstChild);
  darkStrip.ref = mountStrip(cv, list, { gap: 22, material: state.material, bg: 0x2a2b38 });
}

/* ── 自检 ─────────────────────────────────────────────────── */
window.__star = {
  data: () => DATA,
  state: () => ({ ...state }),
  /* 量一遍两档材质的代价 */
  async measure() {
    const r = await measure({ size: 240 });
    console.log('measure', r);
    return r;
  },
  /* 页面里报一遍：每张运动卡片当前停在几格、最低分 */
  audit() {
    return motionLayers.map(({ key, layer }) => ({
      key,
      steps: layer.numSteps(),
      k: layer.currentK,
      matrix: layer.currentMatrix,
    }));
  },
  pick,
};

/* ── 启动 ────────────────────────────────────────────────── */
(async () => {
  DATA = await fetch('./.shots/data.json').then((r) => r.json());
  buildMap();
  buildProbe();
  buildSegs();
  buildMotions();
  buildGrain();
  buildFrames();
  buildSizes();
  buildDark();

  /* 姿态地图右侧那个大格子：钉住 iso */
  const pv = $('#pick');
  pickLayer = new StarLayer(pv, { size: 200, material: state.material });
  pick(45, 35.264);

  const d = DATA.distribution;
  $('#mapstat').textContent =
    `961 格里 ${d.good} 格（${((d.good / d.tiles) * 100).toFixed(0)}%）≥ 70，中位数 ${d.median}，` +
    `最低 ${d.min}。高分格全部贴着体对角视线（离最近的那条 ${DATA.diagAngle.good.min}–${DATA.diagAngle.good.max}°，均值 ${DATA.diagAngle.good.mean}°），` +
    `低分格离它 ${DATA.diagAngle.bad.min}–${DATA.diagAngle.bad.max}°。`;

  document.fonts.ready.then(() => {});
})().catch((e) => {
  console.error('boot failed', e);
  document.body.insertAdjacentHTML('beforeend',
    `<pre style="color:#a3452f;padding:2rem;white-space:pre-wrap">启动失败：${e && e.message}\n${e && e.stack}</pre>`);
});