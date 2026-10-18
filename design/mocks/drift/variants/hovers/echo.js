/* 重影 · 悬停（接口见 variants/README.md 第 2 节）

   卡片投出一层极淡的错位重影：向下右偏几像素、更低的不透明度，
   像记忆里那一次投下的影子——慢慢追上来一点，又落回去，再回来。

   卡面用 background-image: inherit 直接借本体那张图，所以换档、换场景都跟着走；
   错开的量按档位给（粗档一像素就是十几世界单位，写死几像素等于没有）。 */
(() => {
  'use strict';

  DriftReg.hover('echo', {
    label: '重影',
    gate: () => true, // 粗档的重影按它自己的像素格给错位量，一样看得见
    css: `
html[data-hover='echo'] .frag::before {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  pointer-events: none;
  opacity: 0;
  background-image: inherit;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
/* 错开的量：清楚档是几像素，粗档要按它自己的像素格给，否则看不见 */
html[data-hover='echo'] .frag.hot { --ex: 1.1%; --ey: 2.3%; }
html[data-hover='echo'] .frag.hot[data-lod='1'] { --ex: 2.4%; --ey: 5%; }
html[data-hover='echo'] .frag.hot[data-lod='2'] { --ex: 3.8%; --ey: 8%; }
html[data-hover='echo'] .frag.hot[data-lod='3'] { --ex: 5.4%; --ey: 11.4%; }
html[data-hover='echo'] .frag.hot::before {
  filter: saturate(.82);
  animation: drift-echo 4.6s cubic-bezier(.42, 0, .58, 1) infinite;
}
/* 暗场景里重影要自己亮一点才浮得出来 */
html[data-hover='echo'][data-scene='project'] .frag.hot::before,
html[data-hover='echo'][data-scene='moment'] .frag.hot::before { filter: saturate(.82) brightness(1.22); }
@keyframes drift-echo {
  0% { opacity: 0; transform: translate(0, 0); }
  16% { opacity: .32; transform: translate(var(--ex), var(--ey)); }
  44% { opacity: .2; transform: translate(calc(var(--ex) * .42), calc(var(--ey) * .42)); }
  70% { opacity: .28; transform: translate(calc(var(--ex) * .86), calc(var(--ey) * .86)); }
  100% { opacity: 0; transform: translate(0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-hover='echo'] .frag.hot::before { animation: none; opacity: .26; transform: translate(var(--ex), var(--ey)); }
}
`,
  });
})();
