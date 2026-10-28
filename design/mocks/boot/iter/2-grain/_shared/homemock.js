/* 假首页的三个旋钮（照 _shared/home-fragment.html 的 HomeMock 搬过来，改了两处：
   1) 波形线的抖动相位不再读 performance.now()，改由调用方传入秒数 —— 否则同一毫秒
      的 seek 会画出不同的线，截图没法逐帧比对。
   2) 线的几何按当前视口算（viewBox = 视口 px），手机上 14° 不会因为 preserveAspectRatio
      被拉成 40° —— 真首页就是按视口几何画的。）

   HomeMock.line(v, tSec)   v：脑电线「从中心往两端画出」的 0–1；tSec：抖动相位（秒）
   HomeMock.focus(v)        v：大字对焦 0–1（0 = blur 14px + 透明）
   HomeMock.stop()          三案都不自走 rAF，留成空实现以防别处调 */

(function () {
  'use strict';

  window.HomeMock = (() => {
    const svg = document.getElementById('h-eeg');
    const brand = document.querySelector('#home .h-brand');
    const path = document.getElementById('h-eeg-path');
    const TAN = Math.tan((14 * Math.PI) / 180);
    const ANG = Math.atan(TAN);
    const COS = Math.cos(ANG);
    const SIN = Math.sin(ANG);
    let reveal = 1;
    let phase = 0;

    function draw() {
      const W = Math.max(1, innerWidth);
      const H = Math.max(1, innerHeight);
      if (svg.getAttribute('viewBox') !== '0 0 ' + W + ' ' + H) {
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      }
      const half = Math.hypot(W, H) / 2 + 40;
      const n = 220;
      let d = '';
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        const t = (s * 2 - 1) * half;
        const x = W / 2 + COS * t;
        const y = H / 2 + SIN * t;
        const wob = 3.6 * (Math.sin(t * 0.5 + phase) * 0.6 + Math.sin(t * 1.9) * 0.4);
        d += (i ? 'L' : 'M') + (x - SIN * wob).toFixed(1) + ' ' + (y + COS * wob).toFixed(1);
      }
      path.setAttribute('d', d);
      const edge = 50 - reveal * 50;
      const m =
        'linear-gradient(90deg, transparent ' + edge + '%, #000 ' + edge + '%, #000 ' +
        (50 + reveal * 50) + '%, transparent ' + (50 + reveal * 50) + '%)';
      path.style.maskImage = m;
      path.style.webkitMaskImage = m;
    }

    draw();

    return {
      line(v, tSec) {
        reveal = v < 0 ? 0 : v > 1 ? 1 : v;
        phase = tSec || 0;
        draw();
      },
      focus(v) {
        const f = v < 0 ? 0 : v > 1 ? 1 : v;
        brand.style.filter = f >= 1 ? '' : 'blur(' + ((1 - f) * 14).toFixed(2) + 'px)';
        brand.style.opacity = String(f);
      },
      stop() {},
    };
  })();
})();
