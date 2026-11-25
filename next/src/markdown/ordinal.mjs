/* ─────────────────────────────────────────────────────────────
   小节序号 · 定格漂浮（Ordinal · Stepped Float）

   正文 h2 的序号由本插件在**构建期**注入 —— 内容页因此仍然零客户端 JS。

   为什么还要有这个插件：`::before { content: counter(sec, decimal-leading-zero) }`
   本来就能给出零填充的两位数字，但它吐出的是一整块不可分割的文本 —— 没有可逐枚
   点名的子元素，于是「一枚数字一跳」的错相无从谈起（整块一起跳只是闪烁，不是漂浮，
   也就谈不上参照品牌字标）。所以这里只做一件事：把数字拆成**一枚一个 span**，
   其余全部交给 CSS（样式见 global.css 的「小节序号 · 定格漂浮」一节）。

   醒与梦共用同一套字：序号是标题那一行的延续（随笔宋体 / 项目黑体），两面的差别
   只有动与不动 —— 动画常驻，振幅乘 --still：醒面收到 0（位移为零）、梦面每枚数字按
   1px 整像素阶跃定格漂浮，与品牌字标（brand.ts）和正文 ((浮起)) 同一条曲线。
   序号因此不需要固定盒，也不需要第二层：浮动只走 translate，不改变任何占位。

   无 JS / 读屏 / 减动效：醒面就是它唯一的呈现（--still 恒 0 ⇒ 位移为零，
   动画仍在跑但不显形；减动效偏好下 CSS 直接停摆）。
   数字是**真文本**，读屏照常读出「01 <标题>」，与旧写法的 counter 内容等价。

   计数用 ctx.data（文档级数据袋）而不是模块闭包：Astro 会并行编译多篇内容，
   闭包里的计数器会被别的文档串号。
   ───────────────────────────────────────────────────────────── */

/** 零填充位数：01…09 与 10 同宽，标题的缩进不随章节数变化 */
const MIN_DIGITS = 2;

const SEC_KEY = 'ordinal:sec';

/** 序数 → 记号：一枚数字一个 span（--i 供逐枚错相，与品牌字标的字符同构） */
export function ordinalMarkup(n) {
  const digits = String(n).padStart(MIN_DIGITS, '0');
  const spans = [...digits]
    .map((d, i) => `<span class="ord-digit" style="--i:${i}">${d}</span>`)
    .join('');
  return `<span class="ord">${spans}</span>`;
}

export const ordinal = {
  name: 'ordinal',

  /** 每篇文档开篇清零（ctx.data 是文档级的，这里只是把意图写明） */
  before(_root, ctx) {
    ctx.data[SEC_KEY] = 0;
  },

  heading(node, ctx) {
    /* 只编号 h2（小节）。h3 眼下没有正文在用，且它的记号该由「小节」组件的
       下一层承担 —— 这份留白是有意的，不是遗漏。 */
    if (node.depth !== 2) return;
    const n = (ctx.data[SEC_KEY] ?? 0) + 1;
    ctx.data[SEC_KEY] = n;
    ctx.prependChild(node, { type: 'html', value: ordinalMarkup(n) });
  },
};
