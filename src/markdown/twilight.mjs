/* ─────────────────────────────────────────────────────────────
   醒梦两态正文 · Sätteri mdast 插件（语法手册见 docs/writing.md）

   块级（Sätteri 原生 directive 解析，需在 astro.config 开
   features.directive）：
     :::dream … :::  → <div data-side="dream">（梦面段落，醒面隐藏）
     :::wake  … :::  → <div data-side="wake">（醒面段落，梦面隐藏）
   未标记的正文两面共读。

   行内（自解析 [[醒|梦]]，纯文本、不嵌 markdown）：
     [[醒来|梦见]] → <span data-morph data-true="醒来" data-dream="梦见">醒来</span>
   产出与站内手写双文案同一约定，morph/reality 引擎自动接管：
   长按线到达换面、梦态走神、无 JS 与读屏恒醒面。
   ───────────────────────────────────────────────────────────── */

const SIDE_NAMES = new Set(['dream', 'wake']);
const INLINE_DUAL = /\[\[([^[\]|]+)\|([^[\]]+)\]\]/g;
/** 行内 code 的正文不在 text 节点里，但以防万一：这些父级下的 text 不拆 */
const LITERAL_PARENTS = new Set(['inlineCode', 'code']);

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

/** 把 text 节点值按双面语法拆成 text/html 节点序列；无匹配返回 null */
function splitDuals(value) {
  INLINE_DUAL.lastIndex = 0;
  if (!INLINE_DUAL.test(value)) return null;
  INLINE_DUAL.lastIndex = 0;
  const out = [];
  let last = 0;
  let m;
  while ((m = INLINE_DUAL.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'html', value: inlineDualHtml(m[1], m[2]) });
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
    const parts = splitDuals(node.value);
    if (parts) ctx.replaceNode(node, parts);
  },
};
