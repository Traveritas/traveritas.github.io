/* 涟漪 · 悬停（接口见 variants/README.md 第 2 节）

   从指针跨进卡面的那个位置起，三圈硬边的涟漪朝外扩散，到卡边消失，
   只在棱上留下一道很淡的湿痕。

   位置在 enter 里量一次、写成 CSS 变量；往外走的是手写的离散台阶——
   这个原型的像素感是硬的，渐变会把那点硬气磨掉。 */
(() => {
  'use strict';

  DriftReg.hover('ripple', {
    label: '涟漪',
    gate: () => true, // 涟漪是落点的事，粗块上也一样成立
    css: `
html[data-hover='ripple'] .frag {
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(var(--sweep) / 0);
  transition: box-shadow .5s cubic-bezier(.32, .72, 0, 1) .3s;
}
html[data-hover='ripple'] .frag.hot { box-shadow: inset 0 0 0 1px rgb(var(--sweep) / .3); }

/* 三圈：硬边、无过渡。整层以落点为中心放大，环就一圈圈往外走 */
html[data-hover='ripple'] .frag::before {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  pointer-events: none;
  opacity: 0;
  transform-origin: var(--rx, 50%) var(--ry, 50%);
  transform: scale(.34);
  background-image: radial-gradient(circle at var(--rx, 50%) var(--ry, 50%),
    rgb(var(--sweep) / 0) 0 21%,
    rgb(var(--sweep) / .5) 21% 24.5%,
    rgb(var(--sweep) / 0) 24.5% 39%,
    rgb(var(--sweep) / .38) 39% 42.5%,
    rgb(var(--sweep) / 0) 42.5% 57%,
    rgb(var(--sweep) / .27) 57% 60.5%,
    rgb(var(--sweep) / 0) 60.5%);
}
html[data-hover='ripple'] .frag.hot::before { animation: drift-ripple 1.7s steps(1, end) forwards; }
@keyframes drift-ripple {
  0% { transform: scale(.34); opacity: 0; }
  10% { transform: scale(.34); opacity: .8; }
  24% { transform: scale(.58); opacity: .78; }
  38% { transform: scale(.84); opacity: .72; }
  52% { transform: scale(1.12); opacity: .62; }
  66% { transform: scale(1.45); opacity: .48; }
  80% { transform: scale(1.85); opacity: .3; }
  92% { transform: scale(2.3); opacity: .14; }
  100% { transform: scale(2.7); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  html[data-hover='ripple'] .frag.hot::before { animation: none; transform: scale(.72); opacity: .55; }
}
`,
    /* 指针落在卡面上的哪一点：换成卡面内的百分比，交给 CSS 当涟漪的圆心 */
    enter(rec, api) {
      const s = rec.s || 1;
      const M = rec.it.M || 0;
      const pw = rec.it.cw - 2 * M;
      const ph = rec.it.ch - 2 * M;
      const x = Math.min(pw, Math.max(0, (api.mouse.x - (rec.x - (rec.it.cw * s) / 2 + M * s)) / s));
      const y = Math.min(ph, Math.max(0, (api.mouse.y - (rec.y - (rec.it.ch * s) / 2 + M * s)) / s));
      rec.el.style.setProperty('--rx', `${((x / pw) * 100).toFixed(2)}%`);
      rec.el.style.setProperty('--ry', `${((y / ph) * 100).toFixed(2)}%`);
    },
  });
})();
