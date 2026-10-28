/* A · 一颗星的余像 · 总长 2200ms
   0 ── 240   夜里一粒光将亮未亮
   240 ─ 1080 星亮到满，三枚衍射环一枚接一枚撑开；一根细光脊沿 14° 从星心探出来
   1080 ─ 1400 余像（三池位置上的紫雾）浮上来，星慢慢转向 14°
   1360 ─ 2000 光脊长成首页那根脑电线；星把光交出去，自己退掉
   1480 ─ 2060 大字从 blur(14px) 里对上焦；夜在 1280–1950 之间退成首页的靛夜
   2006 ─ 2062 开屏线换回首页线（同形，交接帧不动）
   2062 ─ 2200 首页静置
*/
(function () {
  window.__bootKit.start({
    total: 2200,
    line: [1360, 2000],
    focus: [1480, 2060],
    handoff: [2006, 2062],
    build: function (ctx) {
      var t = ctx.track;
      var E = ctx.ease;
      var night = document.getElementById('a-night');
      var after = document.getElementById('a-after');
      var flare = document.getElementById('a-flare');
      var r1 = document.getElementById('a-r1');
      var r2 = document.getElementById('a-r2');
      var r3 = document.getElementById('a-r3');
      var ghost = document.getElementById('a-ghost');
      var starw = document.getElementById('a-starw');
      var halo = document.getElementById('a-halo');

      t(night, [
        [0, { opacity: '0.99' }],
        [1280, { opacity: '0.99' }, E.io],
        [1950, { opacity: '0' }]
      ]);

      t(after, [
        [0, { opacity: '0', transform: 'scale(0.85)' }],
        [700, { opacity: '0', transform: 'scale(0.85)' }, E.out],
        [1250, { opacity: '0.5', transform: 'scale(1)' }],
        [1600, { opacity: '0.44' }, E.io],
        [1960, { opacity: '0', transform: 'scale(1.04)' }]
      ]);

      t(r1, [
        [0, { opacity: '0', transform: 'scale(0.25)' }],
        [100, { opacity: '0', transform: 'scale(0.25)' }, E.out],
        [320, { opacity: '0.45', transform: 'scale(0.6)' }],
        [760, { opacity: '0.3', transform: 'scale(1.05)' }, E.io],
        [1200, { opacity: '0', transform: 'scale(1.55)' }]
      ]);
      t(r2, [
        [0, { opacity: '0', transform: 'scale(0.2)' }],
        [240, { opacity: '0', transform: 'scale(0.2)' }, E.out],
        [520, { opacity: '0.32', transform: 'scale(0.55)' }],
        [980, { opacity: '0.18', transform: 'scale(1)' }, E.io],
        [1450, { opacity: '0', transform: 'scale(1.5)' }]
      ]);
      t(r3, [
        [0, { opacity: '0', transform: 'scale(0.15)' }],
        [420, { opacity: '0', transform: 'scale(0.15)' }, E.out],
        [760, { opacity: '0.18', transform: 'scale(0.5)' }],
        [1200, { opacity: '0.09', transform: 'scale(0.9)' }, E.io],
        [1600, { opacity: '0', transform: 'scale(1.4)' }]
      ]);

      t(flare, [
        [0, { opacity: '0', transform: 'scaleX(0.05)' }],
        [240, { opacity: '0', transform: 'scaleX(0.05)' }, E.out],
        [700, { opacity: '0.6', transform: 'scaleX(0.3)' }],
        [1150, { opacity: '0.42', transform: 'scaleX(0.55)' }, E.io],
        [1440, { opacity: '0', transform: 'scaleX(0.75)' }]
      ]);

      t(ghost, [
        [0, { opacity: '0', transform: 'translate(0px,0px) rotate(0deg) scale(1)' }],
        [520, { opacity: '0', transform: 'translate(0px,0px) rotate(0deg) scale(1)' }, E.out],
        [880, { opacity: '0.16', transform: 'translate(14px,3.5px) rotate(-3deg) scale(1.25)' }],
        [1260, { opacity: '0.09', transform: 'translate(32px,8px) rotate(-5deg) scale(1.45)' }, E.io],
        [1580, { opacity: '0', transform: 'translate(42px,10.5px) rotate(-6deg) scale(1.55)' }]
      ]);

      t(starw, [
        [0, { opacity: '0', transform: 'rotate(0deg) scale(0.3)' }],
        [220, { opacity: '0', transform: 'rotate(0deg) scale(0.3)' }, E.out],
        [520, { opacity: '0.98', transform: 'rotate(0.5deg) scale(1.06)' }],
        [800, { opacity: '0.92', transform: 'rotate(2deg) scale(1)' }, E.io],
        [1140, { opacity: '1', transform: 'rotate(6deg) scale(1.06)' }],
        [1400, { opacity: '1', transform: 'rotate(12deg) scale(1.08)' }],
        [1720, { opacity: '0.7', transform: 'rotate(14deg) scale(0.9)' }, E.io],
        [1940, { opacity: '0', transform: 'rotate(14deg) scale(0.34)' }]
      ]);

      t(halo, [
        [0, { opacity: '0', transform: 'scale(0.4)' }],
        [300, { opacity: '0', transform: 'scale(0.4)' }, E.out],
        [700, { opacity: '0.75', transform: 'scale(1)' }],
        [1200, { opacity: '0.5', transform: 'scale(1.1)' }, E.io],
        [1780, { opacity: '0', transform: 'scale(1.5)' }]
      ]);
    }
  });
})();

