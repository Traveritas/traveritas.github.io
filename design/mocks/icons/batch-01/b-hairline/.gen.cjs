/* ─────────────────────────────────────────────────────────────
   b-hairline · 一根发丝线 —— 生成器（辅助文件，index.html 不依赖它）
   用法: node design/mocks/icons/batch-01/b-hairline/.gen.cjs
   产出: design/mocks/icons/batch-01/b-hairline/index.html

   几何约定
   · 24×24 视图框，内容大致落在 3..21
   · 所有直线取 14n° 或 14n+90°，且 0° / 90° 被排除在外
     （也就是整张格子转过 14°：横线右端抬 14°，竖线下端偏右 14°）
   · 弧只有一档半径族 3.2 / 5.2 / 7.4（花瓣允许 ±0.25 手抖）
   · 点只有两档 1.0 / 1.7
   · 主笔 pen=main：线宽 1，起收两端各收进 1.0 单位到 45% 不透明度
     小样笔 pen=small：线宽 1.12，不收笔（渐隐在小尺寸只会吃掉笔画），
                      开口放大 1.7 倍，去掉叠影，换面的滑移量加大
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const R2D = 180 / Math.PI;
const v = (d) => [Math.cos(d / R2D), -Math.sin(d / R2D)]; // 正角=屏幕上逆时针（右端抬起）
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sc = (a, k) => [a[0] * k, a[1] * k];
const pt = (c, r, d) => add(c, sc(v(d), r));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (a, b) => sc(sub(b, a), 1 / len(a, b));
const along = (a, b, t) => add(a, sc(sub(b, a), t));
const nudge = (a, b, d) => add(a, sc(unit(a, b), d));
const n = (x) => Number(x.toFixed(3));

/* ── 图元 ────────────────────────────────────────────────────
   {k:'c', parts:[{p:[x,y]}, {k:'L',p:[x,y]} | {k:'A',c,r,a0,a1}, ...]}  一条链（可含弧）
   {k:'d', c:[x,y], r}   实心点
   每条链默认带收笔；o 为不透明度（梦面的分叉用）                       */

function chainD(parts) {
  let d = `M ${n(parts[0].p[0])} ${n(parts[0].p[1])}`;
  for (let i = 1; i < parts.length; i++) {
    const s = parts[i];
    if (s.k === 'L') d += ` L ${n(s.p[0])} ${n(s.p[1])}`;
    else {
      const p1 = pt(s.c, s.r, s.a1);
      d += ` A ${n(s.r)} ${n(s.r)} 0 ${s.a1 - s.a0 > 180 ? 1 : 0} 0 ${n(p1[0])} ${n(p1[1])}`;
    }
  }
  return d;
}

/** 收笔：把链的首尾各收进 trim（弧按弧长折算角度） */
function trimChain(parts, trim) {
  const ps = parts.map((s) => ({ ...s, c: s.c ? [...s.c] : undefined, p: s.p ? [...s.p] : undefined }));
  if (trim <= 0 || ps.length < 2) return ps;
  const a = ps[1];
  if (a.k === 'L') ps[0].p = nudge(ps[0].p, a.p, trim);
  else a.a0 += (trim / a.r) * R2D;
  const last = ps[ps.length - 1];
  if (last.k === 'L') {
    const prev = ps[ps.length - 2];
    const from = !prev.k || prev.k === 'L' ? prev.p : pt(prev.c, prev.r, prev.a1);
    last.p = nudge(last.p, from, trim);
  } else last.a1 -= (trim / last.r) * R2D;
  return ps;
}

function primsToSvg(prims, { pen, op = 1, only }) {
  const out = [];
  const trim = pen === 'main' ? 1.0 : 0;
  for (const p of prims) {
    if (p.o !== undefined && op !== 1) continue;
    const opa = p.o !== undefined ? p.o : op;
    if (p.k === 'd') {
      out.push(`<circle cx="${n(p.c[0])}" cy="${n(p.c[1])}" r="${n(p.r)}" fill="currentColor"/>`);
      continue;
    }
    if (pen === 'main' && opa === 1) {
      // 底层：整条，45% 不透明；上层：收进 1.0 单位，100% —— 起收两端自然变淡
      out.push(`<path class="t" d="${chainD(p.parts)}"/>`);
      out.push(`<path d="${chainD(trimChain(p.parts, trim))}"/>`);
    } else {
      out.push(
        `<path d="${chainD(trimChain(p.parts, trim))}"${opa !== 1 ? ` stroke-opacity="${opa}"` : ''}/>`
      );
    }
  }
  return out.join('');
}

/* ── 十枚图标 ─────────────────────────────────────────────── */

/* 1 站点标记 · 一线百合：三瓣各是一段半圆，长短不等、彼此留口；茎从下方升起，在花下停住 */
function bMark(o) {
  const H = [11.65, 11.6];
  const stemT = add(H, sc(v(284), 2.2));
  const stemB = add(stemT, sc(v(-76), o.pen === 'small' ? 6.1 : 6.5));
  const petals = [
    { th: 90, d: 3.3, r: 3.45 },
    { th: 210, d: 2.95, r: 3.3 },
    { th: 330, d: 3.15, r: 3.5 },
  ];
  const out = [{ k: 'c', parts: [{ p: stemB }, { k: 'L', p: stemT }] }];
  for (const p of petals) {
    const c = add(H, sc(v(p.th), p.d));
    out.push({
      k: 'c',
      parts: [{ p: pt(c, p.r, p.th - 90) }, { k: 'A', c, r: p.r, a0: p.th - 90, a1: p.th + 90 }],
    });
    if (o.dream) {
      const c2 = add(H, sc(v(p.th + 7), p.d + 0.2));
      const r2 = p.r + 0.5;
      out.push({
        k: 'c',
        o: 0.42,
        parts: [{ p: pt(c2, r2, p.th - 96) }, { k: 'A', c: c2, r: r2, a0: p.th - 96, a1: p.th + 84 }],
      });
    }
  }
  if (o.dream) out.push({ k: 'c', o: 0.5, parts: [{ p: stemT }, { k: 'L', p: add(stemT, sc(v(104), 2.4)) }] });
  return out;
}

/* 2 主页 · 门：一笔从右脚起，沿右柱上行、过拱顶、沿左柱落下；门槛在门下另起一笔。
     梦里门槛断成两截——地面先散。 */
function bHome(o) {
  const C = [12.2, 9.9];
  const r = 5.2;
  const P346 = pt(C, r, 346);
  const P194 = pt(C, r, 194);
  const footR = add(P346, sc(v(-104), 7.4));
  const footL = add(P194, sc(v(-76), 7.4));
  const th0 = [8.8, 20.5];
  const thL = o.pen === 'small' ? 4.7 : 5.0;
  const th1 = add(th0, sc(v(14), thL));
  const out = [
    { k: 'c', parts: [{ p: footR }, { k: 'L', p: P346 }, { k: 'A', c: C, r, a0: 346, a1: 554 }, { k: 'L', p: footL }] },
  ];
  if (!o.dream) out.push({ k: 'c', parts: [{ p: th0 }, { k: 'L', p: th1 }] });
  else {
    const m = along(th0, th1, 0.52);
    const dr = o.pen === 'small' ? 1.35 : 0.85;
    out.push({ k: 'c', o: 0.62, parts: [{ p: th0 }, { k: 'L', p: nudge(m, th0, dr) }] });
    out.push({ k: 'c', o: 0.62, parts: [{ p: nudge(m, th1, dr) }, { k: 'L', p: th1 }] });
  }
  return out;
}

/* 3 随笔 · 断章：三条 14° 的线，左边齐在一根 104° 的页边线上（页边不是竖的）；第三条断成两截 */
function bEssays(o) {
  const M0 = [4.4, 9.2];
  const m = [0, 1, 2].map((i) => add(M0, sc(v(-76), i * 4.4)));
  const L = [14.6, 10.4, 8.4];
  const out = [];
  for (let i = 0; i < 2; i++) out.push({ k: 'c', parts: [{ p: m[i] }, { k: 'L', p: add(m[i], sc(v(14), L[i])) }] });
  const a = m[2];
  const b = add(a, sc(v(14), L[2]));
  const cut = along(a, b, 0.52);
  const h = o.gap / 2;
  const p1 = nudge(cut, a, h);
  const p2 = nudge(cut, b, h);
  const lift = o.dream ? add(sc(v(104), 0.7), sc(v(14), 0.25)) : [0, 0];
  out.push({ k: 'c', parts: [{ p: a }, { k: 'L', p: p1 }] });
  out.push({ k: 'c', parts: [{ p: add(p2, lift) }, { k: 'L', p: add(b, lift) }] });
  return out;
}

/* 4 瞬间 · 闪念：一颗落定的点，三条长度不一的光须（都在格子上）。梦里点还没定下来，须的长短也变了 */
function bMoment(o) {
  const D = [12.3, 13.5];
  const rays = [
    { a: 14, r0: 3.0, r1: 6.4, k: 1.12 },
    { a: 104, r0: 3.0, r1: 6.6, k: 0.82 },
    { a: 194, r0: 3.0, r1: 5.6, k: 0.9 },
  ];
  const out = [];
  if (o.dream) {
    const rr = o.pen === 'small' ? 2.0 : 1.7;
    out.push({ k: 'c', parts: [{ p: pt(D, rr, 0) }, { k: 'A', c: D, r: rr, a0: 0, a1: 360 }] });
  } else out.push({ k: 'd', c: D, r: o.pen === 'small' ? 1.65 : 1.5 });
  for (const r of rays) {
    const r1 = r.r1 * (o.dream ? r.k : 1) - (o.dream && o.pen === 'small' ? 0.7 : 0);
    out.push({ k: 'c', parts: [{ p: pt(D, r.r0, r.a) }, { k: 'L', p: pt(D, r1, r.a) }] });
  }
  return out;
}

/* 5 项目 · 造物：一个转过 14° 的方框，左上角没有合上；里面一条 14° 的横线，且不在正中（42%） */
function bProject(o) {
  const C = [12.2, 12.1];
  const u = v(14), w = v(104);
  const P00 = add(add(C, sc(u, -5.6)), sc(w, -5.0));
  const P10 = add(add(C, sc(u, 5.6)), sc(w, -5.0));
  const P11 = add(add(C, sc(u, 5.6)), sc(w, 5.0));
  const P01 = add(add(C, sc(u, -5.6)), sc(w, 5.0));
  const gap = o.dream ? (o.pen === 'small' ? 3.0 : 2.6) : o.gap;
  const topEnd = nudge(P01, P11, gap);
  const leftStart = nudge(P01, P00, gap);
  const lo = along(P00, P01, 0.42);
  const hi = along(P10, P11, 0.42);
  const i0 = nudge(lo, hi, 0.65);
  const i1 = nudge(hi, lo, 0.65);
  const drop = o.dream ? sc(v(-104), 0.5) : [0, 0];
  return [
    { k: 'c', parts: [{ p: P00 }, { k: 'L', p: P10 }, { k: 'L', p: P11 }, { k: 'L', p: topEnd }] },
    { k: 'c', parts: [{ p: leftStart }, { k: 'L', p: P00 }] },
    { k: 'c', parts: [{ p: add(i0, drop) }, { k: 'L', p: add(i1, drop) }] },
  ];
}

/* 6 NEXUS · 界门：一条横楣，两根向内收的柱，门中一线；门没有地面 */
function bNexus(o) {
  const l0 = [6.08, 9.4], l1 = [18.12, 6.4];
  const gap = o.gap;
  const lintelEnd = nudge(l1, l0, gap);
  const jR0 = nudge(l1, add(l1, sc(v(-104), 1)), gap);
  const jR1 = add(l1, sc(v(-104), o.dream ? 11.7 : 12.5));
  const jL1 = add(l0, sc(v(-76), 11.0));
  const mid0 = nudge([11.761, 9.258], [9.425, 18.632], 0);
  const shift = o.dream ? sc(v(14), 0.6) : [0, 0];
  const out = [
    { k: 'c', parts: [{ p: l0 }, { k: 'L', p: lintelEnd }] },
    { k: 'c', parts: [{ p: l0 }, { k: 'L', p: jL1 }] },
    { k: 'c', parts: [{ p: jR0 }, { k: 'L', p: jR1 }] },
    { k: 'c', parts: [{ p: add(mid0, shift) }, { k: 'L', p: add([9.425, 18.632], shift) }] },
  ];
  if (o.dream) out.push({ k: 'c', o: 0.32, parts: [{ p: jL1 }, { k: 'L', p: add(jL1, sc(v(-76), 1.6)) }] });
  return out;
}

/* 7 寻找 · 检索：一枚不闭合的环，柄从口子的另一侧起笔（两者不接触） */
function bSearch(o) {
  const C = [11.4, 10.2];
  const r = 5.2;
  const span = o.dream ? (o.pen === 'small' ? 292 : 300) : 320;
  const a0 = 304, a1 = 304 + span;
  const hOut = o.dream ? 0.8 : 0;
  const h0 = add(C, sc(v(-76), 6.4 + hOut));
  const h1 = add(h0, sc(v(-76), 3.6));
  const out = [{ k: 'c', parts: [{ p: pt(C, r, a0) }, { k: 'A', c: C, r, a0, a1 }] }];
  out.push({ k: 'c', parts: [{ p: h0 }, { k: 'L', p: h1 }] });
  if (o.dream) out.push({ k: 'c', o: 0.34, parts: [{ p: add(h0, sc(v(-76), 0.7)) }, { k: 'L', p: add(h1, sc(v(-76), 0.7)) }] });
  return out;
}

/* 8 换面 · 醒梦：一枚圆沿 14° 的缝切成两段不等长的弧，各自错开一点；醒时几乎合拢，梦里滑开 */
function bSwitch(o) {
  const C0 = [12.2, 11.9];
  const r = 5.2;
  const s = o.pen === 'small' ? (o.dream ? 2.2 : 1.5) : o.dream ? 1.4 : 0.5;
  const CA = add(C0, sc(v(104), s));
  const CB = add(C0, sc(v(104), -s));
  const A = { k: 'c', parts: [{ p: pt(CA, r, 12) }, { k: 'A', c: CA, r, a0: 12, a1: 188 }] };
  const B = { k: 'c', parts: [{ p: pt(CB, r, 194) }, { k: 'A', c: CB, r, a0: 194, a1: 366 }] };
  const out = [A, B];
  if (o.dream) {
    out.push({ k: 'c', o: 0.32, parts: [{ p: pt(CA, r, 20) }, { k: 'A', c: CA, r, a0: 20, a1: 196 }] });
    out.push({ k: 'c', o: 0.32, parts: [{ p: pt(CB, r, 202) }, { k: 'A', c: CB, r, a0: 202, a1: 374 }] });
  }
  return out;
}

/* 9 本页 · 导览轨：右侧一根 104° 的轨，三颗节点，节点往左挂三条长短不一的 14° 线（对应标题层级） */
function bPage(o) {
  const S = [15.9, 20.6];
  const L = 16.0;
  const E = add(S, sc(v(104), L));
  const nodes = [
    { t: 0.05, r: 0.95, tick: 4.0 },
    { t: 0.5, r: 1.6, tick: 2.8 },
    { t: 0.95, r: 0.95, tick: 1.8 },
  ];
  const out = [{ k: 'c', parts: [{ p: S }, { k: 'L', p: E }] }];
  nodes.forEach((nd, i) => {
    const c = add(S, sc(v(104), L * nd.t));
    const off = o.dream ? sc(v(-14), (i - 1) * 0.42) : [0, 0];
    out.push({ k: 'd', c: add(c, off), r: o.pen === 'small' ? nd.r * 1.1 : nd.r });
    const t0 = add(add(c, off), sc(v(194), o.pen === 'small' ? 1.9 : 2.2));
    const t1 = add(t0, sc(v(194), nd.tick * (o.pen === 'small' ? 1.45 : 1)));
    out.push({ k: 'c', parts: [{ p: t0 }, { k: 'L', p: t1 }] });
  });
  if (o.dream) {
    const c = add(S, sc(v(104), L * 0.28));
    out.push({ k: 'c', o: 0.36, parts: [{ p: add(c, sc(v(-14), 0.9)) }, { k: 'L', p: add(add(c, sc(v(194), 4.2)), sc(v(-14), 0.9)) }] });
  }
  return out;
}

/* 10 环境声 · 环境：三道同心弧从同一个源向外散，开角各不相同、都朝 14° */
function bAmbient(o) {
  const C = [8.4, 13.6];
  const arcs = [
    { r: 3.2, th: 14, span: 88, op: 1 },
    { r: 5.2, th: 10, span: 96, op: 0.8 },
    { r: 7.4, th: 18, span: 104, op: 0.55 },
  ];
  const out = [];
  arcs.forEach((a, i) => {
    const grow = o.dream ? i * 0.35 : 0;
    const th = a.th + (o.dream ? (i - 1) * 3 : 0);
    const r = a.r + grow;
    out.push({
      k: 'c',
      o: a.op,
      parts: [{ p: pt(C, r, th - a.span / 2) }, { k: 'A', c: C, r, a0: th - a.span / 2, a1: th + a.span / 2 }],
    });
    if (o.dream) {
      out.push({
        k: 'c',
        o: 0.3,
        parts: [{ p: pt(C, r + 0.6, th - a.span / 2 + 6) }, { k: 'A', c: C, r: r + 0.6, a0: th - a.span / 2 + 6, a1: th + a.span / 2 + 2 }],
      });
    }
  });
  return out;
}

/* ── 手抖 ────────────────────────────────────────────────────
   每条笔画整体偏最多 ±0.12 单位：角度不动、格子不破，
   但笔画之间不再严格对位。弧的两端再各自偏 ±1.1°。            */
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function jitter(prims, seed) {
  const r = rng(seed);
  return prims.map((p) => {
    const dx = (r() * 2 - 1) * 0.12;
    const dy = (r() * 2 - 1) * 0.12;
    const da = (r() * 2 - 1) * 1.1;
    if (p.k === 'd') return { ...p, c: [p.c[0] + dx * 0.7, p.c[1] + dy * 0.7] };
    const parts = p.parts.map((s, i) => {
      if (s.k === 'A') {
        const last = i === p.parts.length - 1;
        return {
          ...s,
          c: [s.c[0] + dx, s.c[1] + dy],
          a0: s.a0 + (i === 1 ? da : 0),
          a1: s.a1 - (last ? da * 0.85 : 0),
        };
      }
      return { ...s, p: [s.p[0] + dx, s.p[1] + dy] };
    });
    return { ...p, parts };
  });
}

/* ── 名册 ─────────────────────────────────────────────────── */
const ICONS = [
  { id: 'mark', zh: '站点标记', dz: '—', note: '一线百合', build: bMark },
  { id: 'home', zh: '主页', dz: '—', note: '门与门槛', build: bHome },
  { id: 'essays', zh: '随笔', dz: '断章', note: '三条线，第三条断了', build: bEssays },
  { id: 'moment', zh: '瞬间', dz: '闪念', note: '落定的点与光须', build: bMoment },
  { id: 'project', zh: '项目', dz: '造物', note: '转过 14° 的方框', build: bProject },
  { id: 'nexus', zh: 'NEXUS', dz: '界门', note: '没有地面的门', build: bNexus },
  { id: 'search', zh: '寻找', dz: '检索', note: '环与柄不同轴', build: bSearch },
  { id: 'switch', zh: '换面', dz: '醒 ⇄ 梦', note: '圆沿 14° 的缝滑开', build: bSwitch },
  { id: 'page', zh: '本页', dz: '导览轨', note: '小巧思 · 轨上的节点', build: bPage },
  { id: 'ambient', zh: '环境声', dz: '环境', note: '小巧思 · 三道弧', build: bAmbient },
];

function primsOf(id, { dream = false, pen = 'main' } = {}) {
  const i = ICONS.findIndex((x) => x.id === id);
  const ic = ICONS[i];
  const raw = ic.build({ dream, pen, gap: pen === 'small' ? 1.7 : 1.0 });
  return jitter(raw, i * 977 + (dream ? 3 : 0));
}

function svgFor(id, { dream = false, pen = 'main', cls = '' } = {}) {
  const prims = primsOf(id, { dream, pen });
  const body = primsToSvg(prims, { pen });
  const ghost =
    dream && pen === 'main'
      ? `<g class="ghost" transform="translate(${n(-0.2419 * 1.0)} ${n(-0.9703 * 1.0)})">${primsToSvg(
          prims,
          { pen }
        )}</g>`
      : '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}${ghost}</svg>`;
}

const cell = (id, { dream = false, pen = 'main', size = 64, cls = '', stroke = null } = {}) =>
  `<span class="ico s${size} ${dream ? 'dream' : 'wake'} ${cls}"${stroke ? ` style="color:${stroke}"` : ''}><span class="mist"></span>${svgFor(
    id,
    { dream, pen }
  )}</span>`;

/* ── 版面 ─────────────────────────────────────────────────── */
const LAB = {
  mark: '01',
  home: '02',
  essays: '03',
  moment: '04',
  project: '05',
  nexus: '06',
  search: '07',
  switch: '08',
  page: 'A',
  ambient: 'B',
};

const rows64 = ICONS.map(
  (ic) => `<tr>
    <td class="idx">${LAB[ic.id]}</td>
    <td class="nm"><span class="zh">${ic.zh}</span><span class="en">${ic.id}${ic.dz !== '—' ? ' · ' + ic.dz : ''}</span><span class="nt">${ic.note}</span></td>
    <td class="ic-cell">${cell(ic.id, { size: 64, dream: false })}</td>
    <td class="ic-cell">${cell(ic.id, { size: 64, dream: true })}</td>
  </tr>`
).join('\n');

const smallRow = (pen, size, dream, stroke) =>
  ICONS.map((ic) => cell(ic.id, { pen, size, dream, stroke })).join('');

/* 一格语境：左下角那颗星 + 绕星的一圈 + 一页正文（含导览轨） */
function scene() {
  const cx = 132,
    cy = 108,
    R = 68; // 星心与轨道半径（px，坐标自舞台左下起算）
  const seats = [
    { id: 'mark', th: 25 },
    { id: 'essays', th: 85 },
    { id: 'project', th: 145 },
    { id: 'search', th: 205 },
    { id: 'switch', th: 265 },
    { id: 'ambient', th: 325 },
  ];
  const ring = seats
    .map((s) => {
      const x = cx + R * Math.cos((s.th * Math.PI) / 180) - 12;
      const y = cy + R * Math.sin((s.th * Math.PI) / 180) - 12;
      return `<div class="seat" style="left:${n(x)}px;bottom:${n(y)}px">${cell(s.id, { size: 24 })}</div>`;
    })
    .join('');
  const textLines = [96, 88, 93, 72, 90, 84, 62, 95, 79]
    .map((w, i) => `<i style="width:${w}%;opacity:${i === 4 ? 0.3 : 0.16}"></i>`)
    .join('');
  return `    <div class="orbit" style="left:${cx - R}px;bottom:${cy - R}px;width:${2 * R}px;height:${2 * R}px"></div>
      <div class="star" style="left:${cx - 22}px;bottom:${cy - 22}px">
        <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
          <g transform="rotate(-14 22 22)">
            <path d="M22 3 L22 41 M5.5 12.5 L38.5 31.5 M38.5 12.5 L5.5 31.5"/>
          </g>
        </svg>
      </div>
      ${ring}
      <div class="page">
        <div class="rail">${cell('page', { size: 24 })}</div>
        <div class="lines">${textLines}</div>
      </div>
      <div class="note">
        <b>本页 · 导览轨</b>
        阅读页左侧那根轨，在这套里就是本页的图标：三颗节点，中间那颗沉一点，往左挂三条长短不一的线。
        <br><br>
        <b>左下角</b>
        六芒星是开关，其余几枚绕星排在一圈上。正文的行、轨、以及穿过整页的那条线，都是同一条 14° 发丝线。
      </div>`;
}
function lattice() {
  const W = 168,
    C = W / 2;
  const lines = [];
  for (let k = 0; k < 13; k++) {
    for (const base of [14 * k, 14 * k + 90]) {
      if (base % 90 === 0) continue; // 0° 与 90° 不在格子里
      const d = v(base);
      const p0 = add([C, C], sc(d, -C * 1.42));
      const p1 = add([C, C], sc(d, C * 1.42));
      lines.push(`<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" />`);
    }
  }
  return `<svg class="lattice" viewBox="0 0 ${W} ${W}" fill="none" stroke="currentColor" stroke-width="0.5" aria-hidden="true">
    <g opacity=".2">${lines.join('')}</g>
    <g class="lat-amber" stroke-width="1.2" opacity=".85">
      <line x1="${n(C - 62)}" y1="${n(C + 15.5)}" x2="${n(C + 62)}" y2="${n(C - 15.5)}" />
      <line x1="${n(C - 15.5)}" y1="${n(C - 62)}" x2="${n(C + 15.5)}" y2="${n(C + 62)}" />
    </g>
    <circle cx="${C}" cy="${C}" r="62" stroke-width="0.6" opacity=".16"/>
  </svg>`;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>b-hairline · 一根发丝线 — 图标 mockup</title>
<style>
:root{
  --bg:#f0f3f6; --bg-sunken:#e5ebf2; --fg:#232830; --fg-soft:#56606d; --fg-faint:#858f9d;
  --line:rgba(35,40,48,.12); --line-2:rgba(35,40,48,.07);
  --wake:#a7b1ba; --dream:#9389ae; --umber:#4f4a66; --amber:#9a86c4;
  --night:#171a21; --night-fg:#c9d0da; --night-dream:#a99fc4; --night-line:rgba(201,208,218,.14);
  --font-display:'Songti SC','Source Han Serif SC','Noto Serif SC',SimSun,Georgia,serif;
  --font-body:system-ui,-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei UI','Microsoft YaHei',sans-serif;
  --font-mono:ui-monospace,'Cascadia Mono',Consolas,'JetBrains Mono',monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-body);
  font-size:14px;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:64px 40px 96px}
h1,h2,h3{font-family:var(--font-display);font-weight:400;margin:0;letter-spacing:.01em}
h1{font-size:40px;line-height:1.25}
h2{font-size:22px;line-height:1.4}
h3{font-size:15px;line-height:1.5}
p{margin:0 0 12px}
.mono{font-family:var(--font-mono);font-size:11px;letter-spacing:.04em}
.kick{font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-faint)}
.lede{max-width:62ch;color:var(--fg-soft);font-size:15px}
hr{border:0;border-top:1px solid var(--line);margin:0}
section{padding:56px 0 8px}
.shead{display:flex;align-items:baseline;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:28px}
.shead .num{font-family:var(--font-mono);font-size:11px;color:var(--fg-faint)}
.shead h2{flex:1}
.shead .hint{font-family:var(--font-mono);font-size:11px;color:var(--fg-faint)}

/* 头图 */
.hero{display:grid;grid-template-columns:1fr 200px;gap:48px;align-items:start;margin-bottom:40px}
.hero .spec{margin-top:22px;border-top:1px solid var(--line)}
.hero .spec div{display:grid;grid-template-columns:96px 1fr;gap:14px;padding:9px 0;border-bottom:1px solid var(--line-2);font-size:13px;color:var(--fg-soft)}
.hero .spec b{font-family:var(--font-mono);font-size:11px;font-weight:400;color:var(--fg-faint);letter-spacing:.06em;padding-top:3px}
.latbox{color:var(--fg);text-align:center}
.lattice{width:168px;height:168px;color:var(--fg)}
.lattice .lat-amber{stroke:var(--amber)}
.latcap{font-family:var(--font-mono);font-size:10px;color:var(--fg-faint);margin-top:8px;line-height:1.7}

/* 图标基座 */
.ico{position:relative;display:inline-grid;place-items:center;line-height:0;color:var(--fg-soft)}
.ico.dream{color:var(--dream)}
.ico .ic{width:100%;height:100%;display:block;position:relative;z-index:1}
.ico .mist{position:absolute;inset:4%;border-radius:50%;pointer-events:none;opacity:0;
  background:radial-gradient(circle,currentColor 0%,transparent 66%);filter:blur(2.5px)}
.ico.dream .mist{opacity:.17}
.ico .ghost{opacity:.34}
.ico.s64{width:64px;height:64px}
.ico.s40{width:40px;height:40px}
.ico.s24{width:24px;height:24px}
.ico.s16{width:16px;height:16px}
.ico.s160{width:160px;height:160px}
.ico .t{stroke-opacity:.45}
.ico.pen-small .ic{stroke-width:1.12}
.ico.pen-small .t{stroke-opacity:1}

/* 触点图 */
table.touch{width:100%;border-collapse:collapse}
table.touch th{font-family:var(--font-mono);font-size:10px;font-weight:400;letter-spacing:.12em;
  text-transform:uppercase;color:var(--fg-faint);text-align:center;padding:0 0 10px}
table.touch th.l{text-align:left}
table.touch td{border-top:1px solid var(--line-2);padding:14px 8px;vertical-align:middle}
table.touch tr:last-child td{border-bottom:1px solid var(--line-2)}
td.idx{font-family:var(--font-mono);font-size:10px;color:var(--fg-faint);width:26px}
td.nm{width:270px}
td.nm .zh{display:block;font-family:var(--font-display);font-size:17px}
td.nm .en{display:block;font-family:var(--font-mono);font-size:10px;color:var(--fg-faint);letter-spacing:.06em}
td.nm .nt{display:block;font-size:12px;color:var(--fg-soft);line-height:1.6}
td.ic-cell{text-align:center;width:150px}
.colwake{color:var(--fg-soft)}

/* 小样 */
.smallgrid{display:grid;grid-template-columns:132px 1fr;gap:0 20px;align-items:center;
  border:1px solid var(--line);border-radius:2px}
.smallgrid .lab{font-family:var(--font-mono);font-size:10px;color:var(--fg-faint);
  letter-spacing:.08em;padding:18px 0 18px 18px;line-height:1.7}
.smallgrid .row{display:flex;align-items:center;gap:14px;padding:16px 18px 16px 0;flex-wrap:wrap}
.smallgrid .day{background:var(--bg)}
.smallgrid .night{background:var(--night);color:var(--night-fg)}
.smallgrid .night .ico{color:var(--night-fg)}
.smallgrid .night .ico.dream{color:var(--night-dream)}
.sep{border-top:1px solid var(--line);grid-column:1/-1}
.nightsep{border-top:1px solid var(--line)}

/* 放大 */
.zoom{display:grid;grid-template-columns:repeat(2,1fr);gap:32px}
.zoom .card{border:1px solid var(--line);border-radius:2px;padding:26px;position:relative;overflow:hidden}
.zoom .card .cap{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px}
.zoom .card .cap .zh{font-family:var(--font-display);font-size:17px}
.zoom .card .cap .m{font-family:var(--font-mono);font-size:10px;color:var(--fg-faint)}
.zoom .pair{display:flex;gap:40px;align-items:flex-start}
.zoom .filament .ic{stroke-width:1px}
.zoom .filament .ic path{vector-effect:non-scaling-stroke}
.zoom .filament .t{stroke-opacity:.45}
.zoom .tick{position:absolute;font-family:var(--font-mono);font-size:10px;color:var(--fg-faint)}
.anat{border:1px solid var(--line);border-radius:2px;padding:26px;margin-top:32px}
.anat .three{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:20px}
.anat .three figure{margin:0}
.anat .three svg{width:100%;height:96px;color:var(--fg-soft);display:block}
.anat .three figcaption{font-size:12px;color:var(--fg-soft);margin-top:10px;line-height:1.65}
.anat .three figcaption b{font-family:var(--font-mono);font-size:10px;font-weight:400;color:var(--fg-faint);display:block;letter-spacing:.06em;margin-bottom:2px}

/* 单色 */
.mono-panel{border:1px solid var(--line);border-radius:2px;padding:26px}
.mono-panel .r{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid var(--line-2)}
.mono-panel .r:last-child{border-bottom:0}
.mono-panel .tag{font-family:var(--font-mono);font-size:10px;color:var(--fg-faint);width:150px;letter-spacing:.06em}
.mono-panel .ico{color:var(--fg)}
.mono-panel .ico.dream{color:var(--fg)}

/* 语境 */
.scene{border:1px solid var(--line);border-radius:2px;overflow:hidden;position:relative;background:var(--bg-sunken)}
.scene .seam{position:absolute;left:-6%;right:-6%;top:52%;height:1px;background:var(--line);
  transform:rotate(-14deg);transform-origin:50% 50%}
.scene .stage{position:relative;height:376px}
.scene .star{position:absolute;width:44px;height:44px;color:var(--fg-soft)}
.scene .orbit{position:absolute;border:1px solid var(--line);border-radius:50%}
.scene .seat{position:absolute;width:24px;height:24px}
.scene .page{position:absolute;left:300px;top:62px;display:flex;gap:26px}
.scene .rail{width:24px;height:24px;margin-top:118px}
.scene .lines{display:flex;flex-direction:column;gap:14px;width:392px}
.scene .lines i{display:block;height:1px;background:var(--fg);transform:rotate(-14deg);
  transform-origin:0 50%;margin-bottom:9px}
.scene .note{position:absolute;right:30px;top:34px;max-width:250px;font-size:12px;color:var(--fg-soft);line-height:1.75}
.scene .note b{font-family:var(--font-mono);font-size:10px;font-weight:400;color:var(--fg-faint);display:block;letter-spacing:.06em;margin-bottom:6px}

/* 尾 */
.foot{margin-top:72px;padding-top:22px;border-top:1px solid var(--line);display:grid;
  grid-template-columns:1fr 1fr;gap:32px;color:var(--fg-soft);font-size:12.5px}
.foot b{font-family:var(--font-mono);font-size:10px;font-weight:400;color:var(--fg-faint);
  display:block;letter-spacing:.06em;margin-bottom:6px}
.foot ul{margin:0;padding-left:16px}
.foot li{margin-bottom:5px}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="kick">batch-01 · b-hairline · 图标风格 mockup</div>
    <h1 style="margin-top:14px">一根发丝线</h1>
    <p class="lede" style="margin-top:18px">
      整组图标由一根等宽的细线画成：线在转过 14° 的格子上走，走到该合拢的地方不合拢——留一道
      1 单位的口子，那就是笔离开纸面的位置。起收两端各收进一点，像一条还没被写完的线。
    </p>
    <div class="hero" style="margin-top:34px">
      <div class="spec">
        <div><b>线宽</b><span>框的 1/24（24 视图框里是 1 单位）</span></div>
        <div><b>直线</b><span>14n° 与 14n+90°，0° 与 90° 不在格子里</span></div>
        <div><b>弧</b><span>只一档半径族：3.2 / 5.2 / 7.4</span></div>
        <div><b>点</b><span>只两档：1.0 / 1.7</span></div>
        <div><b>起收</b><span>两端各收进 1 单位到 45% 不透明度</span></div>
        <div><b>开口</b><span>每枚至少一道 1 单位的断口（笔抬起的位置）</span></div>
        <div><b>手抖</b><span>每条笔画整体偏 ±0.12 单位（角度不动，格子不破）</span></div>
      </div>
      <div class="latbox">
        ${lattice()}
        <div class="latcap">14° 格子<br>深色：全部直线可取的方向<br>紫：横 / 竖两支</div>
      </div>
    </div>
  </header>

  <section>
    <div class="shead"><span class="num">01</span><h2>触点图</h2><span class="hint">64px · 醒 / 梦 两列对照</span></div>
    <table class="touch">
      <thead><tr><th class="l"></th><th class="l">名</th><th>醒 · wake</th><th>梦 · dream</th></tr></thead>
      <tbody>
${rows64}
      </tbody>
    </table>
  </section>

  <section>
    <div class="shead"><span class="num">02</span><h2>小样</h2><span class="hint">24px 用主笔 · 16px 用小样笔 · 昼面与夜间深底各一排</span></div>
    <div class="smallgrid">
      <div class="lab">24px 主笔<br>昼面 #f0f3f6</div>
      <div class="row day">${smallRow('main', 24, false)}</div>
      <div class="lab">24px 主笔<br>梦面</div>
      <div class="row day">${smallRow('main', 24, true)}</div>
      <div class="sep"></div>
      <div class="lab">16px 小样笔<br>昼面</div>
      <div class="row day">${smallRow('small', 16, false)}</div>
      <div class="lab">16px 小样笔<br>梦面</div>
      <div class="row day">${smallRow('small', 16, true)}</div>
      <div class="sep"></div>
      <div class="lab" style="color:var(--night-fg)">16px 小样笔<br>夜间深底</div>
      <div class="row night">${smallRow('small', 16, false)}</div>
      <div class="lab" style="color:var(--night-dream)">16px 小样笔<br>夜间 · 梦面</div>
      <div class="row night">${smallRow('small', 16, true)}</div>
    </div>
    <p class="mono" style="color:var(--fg-faint);margin-top:14px">
      小样笔与主笔的关系：线宽 1 → 1.12（光学补偿）；取消收笔渐隐（16px 下渐隐只会吃掉笔画）；
      设计开口放大到 1.7 倍（1 单位在 16px 上只有 0.67px，渲染后不可见）；去掉叠影（1px 的叠影只会糊）；
      换面的滑移量从 0.35 提到 1.05。形状与角度完全不变。
    </p>
  </section>

  <section>
    <div class="shead"><span class="num">03</span><h2>放大细节</h2><span class="hint">160px · 左：原比例（线宽随框放大）· 右：非等比线宽（真 1px 发丝）</span></div>
    <div class="zoom">
      <div class="card">
        <div class="cap"><span class="zh">换面</span><span class="m">圆 · 沿 14° 的缝滑开</span></div>
        <div class="pair">
          ${cell('switch', { size: 160, dream: false })}
          ${cell('switch', { size: 160, dream: false, cls: 'filament' })}
        </div>
      </div>
      <div class="card">
        <div class="cap"><span class="zh">主页</span><span class="m">一笔 · 从右脚起，到左脚止</span></div>
        <div class="pair">
          ${cell('home', { size: 160, dream: false })}
          ${cell('home', { size: 160, dream: false, cls: 'filament' })}
        </div>
      </div>
      <div class="card">
        <div class="cap"><span class="zh">站点标记</span><span class="m">三瓣的弧不等长 · 花与茎之间抬笔</span></div>
        <div class="pair">
          ${cell('mark', { size: 160, dream: false })}
          ${cell('mark', { size: 160, dream: false, cls: 'filament' })}
        </div>
      </div>
      <div class="card">
        <div class="cap"><span class="zh">瞬间 · 梦面</span><span class="m">点未定 · 光须分叉 · 一层雾</span></div>
        <div class="pair">
          ${cell('moment', { size: 160, dream: true })}
          ${cell('moment', { size: 160, dream: true, cls: 'filament' })}
        </div>
      </div>
    </div>
    <div class="anat">
      <h3>这支笔是什么</h3>
      <div class="three">
        <figure>
          <svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-linecap="round">
            <g transform="rotate(-14 60 48)">
              <path d="M 14 48 L 106 48" stroke-opacity=".45"/>
              <path d="M 24 48 L 96 48"/>
            </g>
            <line x1="24" y1="84" x2="96" y2="84" stroke-dasharray="2 3" stroke-opacity=".4" stroke-width=".7"/>
          </svg>
          <figcaption><b>起笔 / 收笔</b>两端各收进 1 单位、落到 45% 不透明度；中间仍是等宽的一根。</figcaption>
        </figure>
        <figure>
          <svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-linecap="round">
            <g transform="rotate(-14 60 48)">
              <path d="M 16 60 L 62 60"/>
              <path d="M 70 60 L 104 60"/>
            </g>
            <path d="M 62 60 l 8 0" stroke-opacity=".35" stroke-width=".7" stroke-dasharray="2 2" transform="rotate(-14 60 48)"/>
          </svg>
          <figcaption><b>抬笔</b>该合拢处不合拢，留一道 1 单位的口子。这道口子在小尺寸下放大到 1.7 倍。</figcaption>
        </figure>
        <figure>
          <svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-linecap="round">
            <circle cx="24" cy="48" r="12.8"/>
            <circle cx="60" cy="48" r="20.8" stroke-opacity=".8"/>
            <circle cx="100" cy="48" r="29.6" stroke-opacity=".55"/>
          </svg>
          <figcaption><b>弧</b>只有三档半径 3.2 / 5.2 / 7.4（图上 ×4）。转角因此有同一个家族感。</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section>
    <div class="shead"><span class="num">04</span><h2>单色退让</h2><span class="hint">只有一种墨色时，两态还剩什么</span></div>
    <div class="mono-panel">
      <div class="r"><span class="tag">醒 · 40px</span>${smallRow('main', 40, false, 'var(--fg)')}</div>
      <div class="r"><span class="tag">梦 · 40px</span>${smallRow('main', 40, true, 'var(--fg)')}</div>
      <div class="r"><span class="tag">醒 · 16px 小样笔</span>${smallRow('small', 16, false, 'var(--fg)')}</div>
      <div class="r"><span class="tag">梦 · 16px 小样笔</span>${smallRow('small', 16, true, 'var(--fg)')}</div>
    </div>
    <p class="mono" style="color:var(--fg-faint);margin-top:14px">
      单色时梦面靠三件事成立：叠影（同一笔画沿 104° 偏移 1 单位、34% 不透明度）、雾、以及结构本身的松动。
      16px 单色下只剩结构松动（断章的一片抬起、门的门槛飘走、换面滑得更开），所以两态的差别都做在 1px 以上。
    </p>
  </section>

  <section>
    <div class="shead"><span class="num">05</span><h2>一格语境</h2><span class="hint">贴在左下角那颗星旁边 · 压在一条 14° 发丝线上</span></div>
    <div class="scene">
      <div class="seam"></div>
      <div class="stage">
${scene()}
      </div>
    </div>
  </section>

  <footer class="foot">
    <div>
      <b>不是 Feather / Material</b>
      <ul>
        <li>没有一条轴对齐的线：0° 与 90° 被排除在外。</li>
        <li>形状不闭合。每枚都有一道笔抬起来留下的断口。</li>
        <li>笔画等宽但两端会淡，闭合成环的地方留着 6° 的错位。</li>
        <li>弧只有三档半径，转角因此同族；没有一处是"标准圆角"。</li>
      </ul>
    </div>
    <div>
      <b>梦面差在哪</b>
      <ul>
        <li>色：醒是冷灰 #56606d，梦是薄暮 #9389ae。</li>
        <li>叠影：同一笔画沿 104° 偏移 1 单位，34%。</li>
        <li>雾：笔画之间垫一层 17% 的淡雾。</li>
        <li>形态：断口变大、碎片漂移、点还没定下来、换面滑开。</li>
      </ul>
    </div>
  </footer>

</div>
</body>
</html>
`;

const out = path.join(__dirname, 'index.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`✓ ${path.relative(process.cwd(), out)}  ${(html.length / 1024).toFixed(1)} KB`);

/* ── 自检：角度是否都在格子上、是否都在框内 ── */
const pm = (x, m) => (((x % m) + m) % m);
const allowed = (a) => {
  const x = pm(a, 180); // 直线的方向不分正反
  const d1 = pm(x, 14), d2 = pm(x - 90, 14);
  const near = (d) => d < 0.05 || d > 13.95;
  return { onLat: near(d1) || near(d2), axis: pm(x, 90) < 0.05 || pm(x, 90) > 89.95 };
};
const warn = [];
for (const ic of ICONS) {
  for (const pen of ['main', 'small']) {
    for (const dream of [false, true]) {
      const prims = primsOf(ic.id, { dream, pen });
      const tag = `${ic.id}/${pen}/${dream ? 'dream' : 'wake'}`;
      for (const p of prims) {
        if (p.k === 'd') {
          if (p.c[0] < 1.2 || p.c[0] > 22.8 || p.c[1] < 1.2 || p.c[1] > 22.8) warn.push(`${tag}: 点在框外`);
          continue;
        }
        const parts = p.parts;
        const pts = [];
        parts.forEach((s, i) => {
          if (!s.k || s.k === 'L') pts.push(s.p);
          else {
            pts.push(pt(s.c, s.r, s.a0), pt(s.c, s.r, s.a1));
            for (let d = Math.ceil(s.a0 / 45) * 45; d < s.a1; d += 45) pts.push(pt(s.c, s.r, d));
          }
          if (i > 0 && s.k === 'L' && (!parts[i - 1].k || parts[i - 1].k === 'L')) {
            const prev = parts[i - 1].p;
            const a = (Math.atan2(-(s.p[1] - prev[1]), s.p[0] - prev[0]) * R2D + 360) % 360;
            const { onLat, axis } = allowed(a);
            if (!onLat || axis) warn.push(`${tag}: 直线 ${a.toFixed(2)}° 不在格子 (${ic.id})`);
          }
        });
        for (const q of pts)
          if (q[0] < 1.2 || q[0] > 22.8 || q[1] < 1.2 || q[1] > 22.8)
            warn.push(`${tag}: 出框 ${q.map((z) => z.toFixed(2))}`);
      }
    }
  }
}
if (warn.length) console.log('  ⚠ ' + warn.length + ' 条：\n    ' + [...new Set(warn)].slice(0, 20).join('\n    '));
else console.log('  · 角度与边界自检通过');

module.exports = { ICONS, svgFor, cell, primsOf };
