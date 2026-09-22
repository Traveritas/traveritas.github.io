// 夜读性活体扫描：token 密集扫 + 换面两侧静稳态 + 逐段全量元素普查（含透明背景合成）
// 换面已改为全屏幕布（NightVeil）下瞬时换色，A 段正常情况下不该再有任何低值带：
// 出现带＝有元素在某处沉底，回 B/C 定位。
// 用法：node design/.sweep-night.cjs [port]
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT_ARG = process.argv[2] || '4416';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9811;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) =>
  new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
  });

(async () => {
  const ch = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + path.join(__dirname, '.shots-night/.chrome-live'),
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try {
      list = await getJSON('http://127.0.0.1:' + CDP + '/json');
      if (list && list.some((t) => t.type === 'page')) break;
    } catch (e) {}
    await sleep(250);
  }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 160));
  };
  const send = (m, p = {}) => new Promise((r) => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async (fn) => {
    const r = await send('Runtime.evaluate', { expression: fn, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ': ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300));
    return r.result?.result?.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + PORT_ARG + '/' });
  await sleep(3500);
  for (let k = 0; k < 30; k++) {
    const st = await ev(`window.__fx ? __fx.state().reality : 'nofx'`);
    if (st === 'dream') break;
    await sleep(500);
  }
  await sleep(1500);

  // 页内工具：对比度、有效背景（沿祖先合成透明层）
  await ev(`window.__tools = (() => {
    const parse = (css) => {
      const s = (css || '').trim();
      let m = s.match(/^#([0-9a-f]{6})$/i);
      if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
      m = s.match(/rgba?\\(([^)]+)\\)/);
      if (m) {
        const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }
      m = s.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)/);
      if (m) {
        // color(srgb …) 的坐标是 gamma 编码的 sRGB 值，直接 ×255
        return { r: Math.round(+m[1] * 255), g: Math.round(+m[2] * 255), b: Math.round(+m[3] * 255), a: m[4] ? +m[4] : 1 };
      }
      return null;
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    /* 渐变近似：元素自身渐变取各停靠 rgba 的均值；
       body 的 floatwin 面纱按元素文档 y 在 900px 渐变带上折算 alpha */
    const gradOf = (el) => {
      const img = getComputedStyle(el).backgroundImage;
      if (!img || img === 'none' || !img.includes('gradient')) return null;
      const stops = [...img.matchAll(/rgba?\\(([^)]+)\\)/g)].map((m) => {
        const p = m[1].split(/[\\s,/]+/).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }).filter((s) => !isNaN(s.a));
      if (!stops.length) return null;
      return { r: stops.reduce((s, x) => s + x.r, 0) / stops.length, g: stops.reduce((s, x) => s + x.g, 0) / stops.length, b: stops.reduce((s, x) => s + x.b, 0) / stops.length, a: stops.reduce((s, x) => s + x.a, 0) / stops.length };
    };
    const veilAt = (docY) => {
      // body 渐变：#e3e9ef 0% / #eae3e6 44% / rgba(237,218,211,.55) 68% / 透明 100%，带高 ~900px
      const H = Math.min(innerHeight, 900), t = Math.min(Math.max(docY / H, 0), 1);
      let a, col;
      if (t <= 0.44) { a = 1; col = [227 + (234 - 227) * (t / 0.44), 233 + (227 - 233) * (t / 0.44), 239 + (230 - 239) * (t / 0.44)]; }
      else if (t <= 0.68) { const k = (t - 0.44) / 0.24; a = 1 - 0.45 * k; col = [234 + (237 - 234) * k, 227 + (218 - 227) * k, 230 + (211 - 230) * k]; }
      else { const k = (t - 0.68) / 0.32; a = 0.55 * (1 - k); col = [237, 218, 211]; }
      return { r: col[0], g: col[1], b: col[2], a };
    };
    const effBg = (el) => {
      let bg = { r: 0, g: 0, b: 0, a: 0 };
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) bg = bg.a === 0 ? c : over(bg, c);
        const g = n === document.body ? null : gradOf(n);
        if (g && g.a > 0) bg = bg.a === 0 ? g : over(bg, g);
        if (bg.a >= 1) break;
      }
      const docY = el.getBoundingClientRect().top + scrollY;
      if (bg.a < 1) {
        const bc = parse(getComputedStyle(document.body).backgroundColor) || { r: 23, g: 27, b: 32, a: 1 };
        bg = bg.a === 0 ? bc : over(bg, bc);
        const v = veilAt(docY);
        if (v.a > 0) bg = over(v, bg);
      }
      return bg;
    };
    const opMul = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= getComputedStyle(n).opacity; return o; };
    return { parse, lum, ratio, effBg, opMul, over };
  })();`);

  // ── A. token 密集扫描（--fg/--fg-soft 对 body 实底）──
  const tokenSweep = await ev(`(async () => {
    const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const out = { fgMin: 99, softMin: 99, fgBands: [], softBands: [], steps: 0 };
    const push = (arr, v) => { const l = arr[arr.length - 1]; if (l && out.steps - l.to <= 2) { l.to = out.steps; l.min = Math.min(l.min, v); } else arr.push({ to: out.steps, min: v, pct: +(100 * (window.__lastY / max)).toFixed(1) }); };
    for (let y = 0; y <= max; y += max / 140) {
      window.__lastY = y;
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 25)));
      out.steps++;
      const cs = getComputedStyle(document.documentElement);
      const bgr = __tools.parse(getComputedStyle(document.body).backgroundColor);
      // 正文色取 body（html 无 color 规则，会读到初始黑）；body 无 color 过渡
      const fg = __tools.parse(getComputedStyle(document.body).color);
      const soft = __tools.parse(cs.getPropertyValue('--fg-soft'));
      // root 的 color 即 --fg
      const rf = __tools.ratio(fg, bgr), rs = __tools.ratio(soft, bgr);
      if (rf < 4.5) { out.fgMin = Math.min(out.fgMin, rf); push(out.fgBands, rf); }
      if (rs < 4.5) { out.softMin = Math.min(out.softMin, rs); push(out.softBands, rs); }
    }
    return out;
  })()`);
  console.log('A. token 扫描（140 步，梦态）: fg 最低 ' + tokenSweep.fgMin.toFixed(2) + ' / soft 最低 ' + tokenSweep.softMin.toFixed(2));
  const fmtB = (bs) => bs.map((b) => `步${b.to}(≈${b.pct}%)↓${b.min.toFixed(2)}`).join(' ');
  if (tokenSweep.fgBands.length) console.log('   fg<4.5 带: ' + fmtB(tokenSweep.fgBands));
  if (tokenSweep.softBands.length) console.log('   soft<4.5 带: ' + fmtB(tokenSweep.softBands));
  if (tokenSweep.fgBands.length || tokenSweep.softBands.length)
    console.log('   （换面是全屏幕布下瞬时换色，没有过渡态；出现低值带即真有元素沉底，看 B/C 定位）');

  // ── B. 换面两侧静稳态：触发点前/后各停一次，等淡变落定 ──
  // 换面边界从 src/data/night.ts 的 ZONES 解析（别手抄，会随设计漂移）
  const nightSrc = fs.readFileSync(path.join(__dirname, '../src/data/night.ts'), 'utf8');
  const ZBLOCK = /ZONES[^=]*=\s*\[([\s\S]*?)\]\s*;/.exec(nightSrc);
  const CROSSINGS = [
    ...(ZBLOCK ? ZBLOCK[1].matchAll(/enter:\s*\{\s*section:\s*'([a-z-]+)',\s*vh:\s*(-?[\d.]+)\s*\}/g) : []),
  ].map((m) => ({ section: m[1], vh: +m[2] }));
  const zoneProbe = await ev(`(async () => {
    const vh = innerHeight;
    const crossings = ${JSON.stringify(CROSSINGS)};
    const trig = crossings.map((c) => document.getElementById(c.section).getBoundingClientRect().top + scrollY - vh * c.vh);
    const out = [];
    for (const t of trig) {
      for (const d of [-250, 250]) {
        scrollTo({ top: Math.max(t + d, 0), behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 450)));
        const cs = getComputedStyle(document.documentElement);
        const bgr = __tools.parse(getComputedStyle(document.body).backgroundColor);
        const fg = __tools.parse(getComputedStyle(document.body).color), soft = __tools.parse(cs.getPropertyValue('--fg-soft'));
        out.push((d < 0 ? '前' : '后') + ' y' + Math.round(t + d) + ' [' + document.body.dataset.zone + ']' +
          ' fg ' + __tools.ratio(fg, bgr).toFixed(2) + ' soft ' + __tools.ratio(soft, bgr).toFixed(2));
      }
    }
    return out.join('\\n   ');
  })()`);
  console.log('B. 换面两侧静稳态（淡变落定后）:\n   ' + zoneProbe);

  // ── C. 逐段元素普查（全量可见文本元素，含祖先透明合成与 opacity）──
  const SLOTS = [
    ['首屏顶', 0], ['首屏腰·暗面', 0.13], ['随笔段', 0.28], ['台账段', 0.45], ['试验场', 0.62], ['晨醒段', 0.86], ['深夜', 0.5],
  ];
  for (const [name, pct] of SLOTS) {
    const res = await ev(`(async () => {
      const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
      scrollTo({ top: max * ${pct}, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 340)));
      const bad = [];
      const seen = new Map();
      for (const el of document.querySelectorAll('body *')) {
        // 直接持有文本的元素
        let hasText = false;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) { hasText = true; break; }
        if (!hasText) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < 60 || r.top > innerHeight - 60 || r.width < 4) continue;
        const f = __tools.parse(cs.color);
        if (!f) continue;
        const o = __tools.opMul(el);
        if (o < 0.15) continue; // 真·隐形才跳过；半隐（纸面墨字/漂移装饰）按合成后的实际对比度算
        const bg = __tools.effBg(el);
        // 祖先链上的不透明度会同时削弱字色——必须合成进去，否则半隐文本会被高估
        const fEff = o < 0.999 ? __tools.over({ ...f, a: (f.a ?? 1) * o }, bg) : f;
        const cr = __tools.ratio(fEff, bg);
        const fs = parseFloat(cs.fontSize);
        const big = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
        const bar = big ? 3 : 4.5;
        if (cr < bar) {
          const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
          const key = el.tagName.toLowerCase() + (cls ? '.' + cls : '') + '|' + el.textContent.trim().slice(0, 10);
          if (!seen.has(key)) { seen.set(key, 1); bad.push(key.split('|')[0] + ' 「' + el.textContent.trim().slice(0, 14) + '」 ' + cr.toFixed(2) + (big ? '(大)' : '') + ' op' + o.toFixed(2) + ' fs' + fs.toFixed(0)); }
        }
      }
      return bad.slice(0, 14);
    })()`);
    console.log('C. ' + name + ' (' + Math.round(pct * 100) + '%): ' + (res.length ? '\n   ' + res.join('\n   ') : '全部达标'));
  }

  // ── D. 醒态抽查（Shift+Space 闩锁后 token + 首屏元素）──
  await ev(`scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(400);
  const key = (type) => send('Input.dispatchKeyEvent', { type, modifiers: 8, code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await key('keyDown'); await sleep(2600); await key('keyUp'); await sleep(1400);
  const wakeState = await ev(`__fx.state()`);
  const wakeTok = await ev(`(async () => {
    const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    let fgMin = 99, softMin = 99;
    for (let y = 0; y <= max; y += max / 70) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 25)));
      const cs = getComputedStyle(document.documentElement);
      const bgr = __tools.parse(getComputedStyle(document.body).backgroundColor);
      fgMin = Math.min(fgMin, __tools.ratio(__tools.parse(getComputedStyle(document.body).color), bgr));
      softMin = Math.min(softMin, __tools.ratio(__tools.parse(cs.getPropertyValue('--fg-soft')), bgr));
    }
    return { fgMin, softMin };
  })()`);
  console.log('D. 醒态(' + wakeState.reality + '): fg 最低 ' + wakeTok.fgMin.toFixed(2) + ' / soft 最低 ' + wakeTok.softMin.toFixed(2));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '无页面异常');
  try { ch.kill(); } catch (e) {}
  ws.close();
})().catch((e) => { console.error(e); process.exit(1); });
