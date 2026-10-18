/* 呼吸 · 悬停（接口见 variants/README.md 第 2 节）

   卡面上的霜被指尖的温度化开一点：整体亮一档，四边化出一层很薄的热雾，
   棱线接住一线光；之后只剩极慢的起伏——不是一次演出，是它本来就在呼吸。

   进 0.6s / 出 0.7s；RM 下退化成静态的亮起。 */
(() => {
  'use strict';

  DriftReg.hover('breathe', {
    label: '呼吸',
    gate: () => true, // 粗块上反馈仍在（暖雾与棱线不靠细节成立）
    css: `
html[data-hover='breathe'] .frag { transition: filter .6s cubic-bezier(.32, .72, 0, 1); }
html[data-hover='breathe'] .frag.hot { filter: brightness(1.05) saturate(1.04); }

/* 霜：中间薄、四边略厚的一层暖雾。悬停时从中间朝四边摊开，只在棱线上留下温度 */
html[data-hover='breathe'] .frag::before {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  pointer-events: none;
  opacity: 0;
  transform: scale(.88);
  background: radial-gradient(50% 50% at 50% 50%, rgb(var(--sweep) / 0) 66%, rgb(var(--sweep) / .09) 88%, rgb(var(--sweep) / .17) 100%);
  box-shadow: inset 0 0 0 1px rgb(var(--lit) / 0), 0 0 30px rgb(var(--sweep) / 0);
  transition: opacity .7s cubic-bezier(.32, .72, 0, 1), transform .7s cubic-bezier(.32, .72, 0, 1), box-shadow .6s cubic-bezier(.32, .72, 0, 1);
}
html[data-hover='breathe'] .frag.hot::before {
  opacity: 1;
  transform: scale(1);
  box-shadow: inset 0 0 0 1px rgb(var(--lit) / .46), 0 0 30px rgb(var(--sweep) / .24);
  animation: drift-breathe 4.2s cubic-bezier(.45, 0, .55, 1) .7s infinite;
}
@keyframes drift-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .74; } }
@media (prefers-reduced-motion: reduce) { html[data-hover='breathe'] .frag.hot::before { animation: none; } }
`,
    /* 起伏落在 scale 上：卡片自己在极小的幅度里鼓一下、收一下 */
    scale(rec, api) {
      return api.RM ? 1.012 : 1.012 + 0.005 * Math.sin(api.t * 0.0012);
    },
  });
})();
