/* ─────────────────────────────────────────────────────────────
   醒梦两态正文 · Sätteri mdast 插件（语法手册见 docs/writing.md）

   块级（Sätteri 原生 directive 解析，需在 astro.config 开
   features.directive）：
     :::dream … :::  → <div data-side="dream">（梦面段落，醒面隐藏）
     :::wake  … :::  → <div data-side="wake">（醒面段落，梦面隐藏）
   未标记的正文两面共读。

   行内（自解析，纯文本、不嵌 markdown，三套语法一次扫描）：
     [[醒来|梦见]] → <span data-morph data-true="醒来" data-dream="梦见">醒来</span>
     ((浮起))      → 逐字 span，梦面各自量化浮起（.float-run，见 global.css）
     {{流过}}      → 按字（西文按词）拆单元，梦面有一道暖光依次流过（.sheen-run）
   后两套可追一段参数：((字|amp=4px,dur=3s)) / {{字|span=260%,hue=55%}}。
   参数走白名单 + 取值形状校验，认不出的键与值一律丢弃 —— 正文里的一个笔误
   不该能写进 style 属性。清单见 FLOAT_PARAMS / SHEEN_PARAMS。

   产出与站内手写双文案同一约定，morph/reality 引擎自动接管：
   长按线到达换面、梦态走神、无 JS 与读屏恒醒面。
   ───────────────────────────────────────────────────────────── */

import { sheenEase, sheenWeight } from './sheen-timing.mjs';

const SIDE_NAMES = new Set(['dream', 'wake']);
/** 行内 code 的正文不在 text 节点里，但以防万一：这些父级下的 text 不拆 */
const LITERAL_PARENTS = new Set(['inlineCode', 'code']);

/** 三套行内语法共用一次扫描：双面文案 / 逐字浮起 / 流光 */
const INLINE = /\[\[([^[\]|]+)\|([^[\]]+)\]\]|\(\(([^()]+)\)\)|\{\{([^{}]+)\}\}/g;

/** 参数白名单：语法里的键 → [CSS 自定义属性, 取值形状]。
    形状按单位收窄（px/em/rem、s/ms、%、deg、纯数），避免任何字符串漏进 style。 */
const FLOAT_PARAMS = {
  amp: ['--float-amp', /^\d+(\.\d+)?(px|em|rem)$/],
  dur: ['--float-dur', /^\d+(\.\d+)?(s|ms)$/],
  stagger: ['--float-stagger', /^-?\d+(\.\d+)?(s|ms)$/],
  tint: ['--float-tint', /^\d+(\.\d+)?%$/],
  sway: ['--float-sway', /^\d+(\.\d+)?$/],
};

const SHEEN_PARAMS = {
  angle: ['--sheen-angle', /^-?\d+(\.\d+)?deg$/],
  hue: ['--sheen-hue', /^\d+(\.\d+)?%$/],
  span: ['--sheen-span', /^\d+(\.\d+)?%$/],
  dur: ['--sheen-dur', /^\d+(\.\d+)?(s|ms)$/],
  // 抽帧档数：构建期烘焙进每个单元的曲线（见 inlineSheenHtml）；这里照旧写出只为留档
  steps: ['--sheen-ease', /^\d+$/, (n) => `steps(${n}, end)`],
};

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** [[醒|梦]] → data-morph 双面 span（与站内手写双文案同构） */
function inlineDualHtml(wake, dream) {
  const w = escapeHtml(wake.trim());
  const d = escapeHtml(dream.trim());
  return `<span data-morph data-true="${w}" data-dream="${d}">${w}</span>`;
}

/** `key=value,key=value` → 已校验的 style 声明串（前缀带空格，可能为空串） */
function paramStyle(table, raw) {
  if (!raw) return '';
  const decls = [];
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const spec = table[pair.slice(0, eq).trim()];
    if (!spec) continue;
    const value = pair.slice(eq + 1).trim();
    if (!spec[1].test(value)) continue;
    decls.push(`${spec[0]}:${spec[2] ? spec[2](value) : value}`);
  }
  return decls.length ? ` style="${decls.join(';')}"` : '';
}

/** ((浮起)) → 包装层 + 一字一盒（--i 供逐字相位错开；参数落在包装层上被继承）。
    带 tint 的一段额外挂 .float-run--tint，并把每个字抄进 data-ch：顶点色由叠在字上的
    琥珀副本（::after）只动 opacity 给出，--float-tint-a 是 tint 的小数形（opacity 要数）。
    不带 tint 的段落因此只有 translate 动画、可以整条交给合成器（见 global.css）。 */
function inlineFloatHtml(body) {
  const [text, params] = splitParams(body);
  let style = paramStyle(FLOAT_PARAMS, params);
  const tint = /--float-tint:(\d+(?:\.\d+)?)%/.exec(style);
  const tinted = tint && parseFloat(tint[1]) > 0;
  if (tinted) style = style.replace(/"$/, `;--float-tint-a:${parseFloat(tint[1]) / 100}"`);
  const chars = Array.from(text)
    .map((ch, i) => {
      const e = escapeHtml(ch);
      return `<span class="float-ch" style="--i:${i}"${tinted ? ` data-ch="${e}"` : ''}>${e}</span>`;
    })
    .join('');
  return `<span class="float-run${tinted ? ' float-run--tint' : ''}"${style}>${chars}</span>`;
}

/** 读出已校验的原始参数值（paramStyle 只产出 style 串，这里要数值） */
function paramValue(table, raw, key) {
  for (const pair of (raw || '').split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 1 || pair.slice(0, eq).trim() !== key) continue;
    const value = pair.slice(eq + 1).trim();
    return table[key][1].test(value) ? value : null;
  }
  return null;
}

/** {{流过}} → 包装层 + 单元（汉字一字一个、西文一词一个；空白原样留作断行点）。
    每个单元带一层琥珀副本（CSS ::after，content 取 data-ch），不透明度曲线在构建期按单元在
    整段里的位置算好（--sh-e，一条 linear() 缓动，见 sheen-timing.mjs）⇒ 只动 opacity，
    动画整条交给合成器。原先动 background-position，走主线程，并会把全站可合成的动画
    逐帧拉回主线程重算。data-c ＝ 单元中心（样式预览页的 span 滑杆拿它重算曲线）。 */
function inlineSheenHtml(body) {
  const [text, params] = splitParams(body);
  const span = parseFloat(paramValue(SHEEN_PARAMS, params, 'span') ?? '300') / 100;
  const steps = parseInt(paramValue(SHEEN_PARAMS, params, 'steps') ?? '0', 10);

  // 切单元：[文字, 权重, 是否单元]；空白不成单元
  const parts = [];
  let word = '';
  const flush = () => {
    if (word) parts.push([word, Array.from(word).reduce((a, ch) => a + sheenWeight(ch), 0), true]);
    word = '';
  };
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      flush();
      parts.push([ch, 0.3, false]);
    } else if (sheenWeight(ch) === 1) {
      flush();
      parts.push([ch, 1, true]);
    } else word += ch;
  }
  flush();

  const total = parts.reduce((a, p) => a + p[1], 0) || 1;
  let at = 0;
  const html = parts
    .map(([s, w, unit]) => {
      const c = (at + w / 2) / total;
      at += w;
      const e = escapeHtml(s);
      if (!unit) return e;
      const cc = Math.round(c * 1e4) / 1e4;
      return `<span class="sheen-u" style="--sh-e:${sheenEase(cc, span, steps)}" data-c="${cc}" data-ch="${e}">${e}</span>`;
    })
    .join('');
  const stepsAttr = steps > 0 ? ` data-steps="${steps}"` : '';
  return `<span class="sheen-run"${stepsAttr}${paramStyle(SHEEN_PARAMS, params)}>${html}</span>`;
}

/** 行内语法的正文与参数以第一个 `|` 分界；正文里要用竖线请写全角 ｜ */
function splitParams(body) {
  const at = body.indexOf('|');
  if (at < 0) return [body, ''];
  return [body.slice(0, at), body.slice(at + 1)];
}

/** 把 text 节点值按三套行内语法拆成 text/html 节点序列；无匹配返回 null */
function splitInline(value) {
  INLINE.lastIndex = 0;
  if (!INLINE.test(value)) return null;
  INLINE.lastIndex = 0;
  const out = [];
  let last = 0;
  let m;
  while ((m = INLINE.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'html', value: inlineDualHtml(m[1], m[2]) });
    else if (m[3] !== undefined) out.push({ type: 'html', value: inlineFloatHtml(m[3]) });
    else out.push({ type: 'html', value: inlineSheenHtml(m[4]) });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

export const twilight = {
  name: 'twilight',
  containerDirective(node, ctx) {
    if (!SIDE_NAMES.has(node.name)) return;
    ctx.setProperty(node, 'data', {
      ...(node.data ?? {}),
      hName: 'div',
      hProperties: { ...(node.data?.hProperties ?? {}), 'data-side': node.name },
    });
  },
  text(node, ctx) {
    const parent = ctx.parent(node);
    if (parent && LITERAL_PARENTS.has(parent.type)) return;
    const parts = splitInline(node.value);
    if (parts) ctx.replaceNode(node, parts);
  },
};
