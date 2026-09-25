/* ─────────────────────────────────────────────────────────────
   醒梦的代码配色（Shiki 主题）

   为什么自己写一个主题而不是用 github-light / github-dark：
   · 那两个主题会把颜色与底写成**行内样式**，直接盖掉 .md pre 的一切底色
     （现状：代码块是一块 #24292e 的深色板，落在浅底站点上非常突兀，
     而且全站还没有一篇正文用过代码围栏，所以一直没露出来）。
   · 自己写就能把 token 颜色**指到站内令牌上**：var(--umber) 这类字符串
     会被原样写进行内样式，于是代码的颜色跟着醒梦两态（reality.ts 逐帧改写的
     --umber / --ghost-ink）与夜色（--fg / --fg-soft）一起走，不需要另立一套色板。

   墨色只用站内已有的四枚，且**琥珀一次都不出现**（它属于锚点与进度）：
     · 注释        → --fg-soft      退到背景里
     · 关键字      → --umber        借链接那枚墨
     · 字符串 / 类型 → --ghost-ink  残影的暖墨（梦色压深的位置）
     · 数字与其余  → --fg           中性（数字靠 tabular 自己对齐）

   底交给 CSS：editor.background 写成与 .md pre 同一个 color-mix 面板色。
   注意不能写 `transparent` —— 主题的值会作为**行内** background-color 落到 <pre> 上，
   行内样式压过样式表，于是 .md pre 自己的底反而看不见了（实测踩过一次）。
   ───────────────────────────────────────────────────────────── */

export const xingmeng = {
  name: 'xingmeng-night',
  type: 'light',
  colors: {
    'editor.background': 'color-mix(in srgb, var(--fg) 4%, transparent)',
    'editor.foreground': 'var(--fg)',
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: 'var(--fg-soft)' },
    },
    {
      scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
      settings: { foreground: 'var(--umber)' },
    },
    /* 放在关键字之后：运算符与标点回到中性，免得满屏都是那枚最深的墨 */
    {
      scope: ['keyword.operator'],
      settings: { foreground: 'var(--fg)' },
    },
    {
      scope: [
        'string',
        'string.quoted',
        'punctuation.definition.string',
        'entity.name.type',
        'entity.name.class',
        'support.type',
        'support.class',
      ],
      settings: { foreground: 'var(--ghost-ink)' },
    },
  ],
};
