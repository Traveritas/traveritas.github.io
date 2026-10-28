/* C · 星落进池子 · 总长 2220ms
   0 ── 240   夜；一粒星在上方亮起来
   240 ─ 880  星落下来，尾迹在它身后
   880 ─ 1500 落点泛起光，涟漪一圈圈沿 14° 散开；三池依次被点亮（瞬间池最先、项目池其次、随笔池最后）
   1500 ─ 1850 星沉进轴心，尾迹与光都收掉
   1520 ─ 2040 首页的线从轴心往外浮起
   1330 ─ 1960 夜退成首页的靛夜；三池在 1950–2030 把光交还给首页的池
   1640 ─ 2110 大字对上焦
   2040 ─ 2095 开屏线换回首页线（同形）
   2095 ─ 2220 首页静置
*/
(function () {
  window.__bootKit.start({
    total: 2220,
    line: [1520, 2040],
    focus: [1640, 2110],
    handoff: [2046, 2101],
    build: function (ctx) {
      var t = ctx.track;
      var E = ctx.ease;

      var night = document.getElementById('c-night');
      var essay = document.getElementById('c-essay');
      var moment = document.getElementById('c-moment');
      var project = document.getElementById('c-project');
      var fall = document.getElementById('c-fall');
      var trail = document.getElementById('c-trail');
      var starw = document.getElementById('c-starw');
      var halo = document.getElementById('c-halo');
      var impact = document.getElementById('c-impact');
      var r1 = document.getElementById('c-r1');
      var r2 = document.getElementById('c-r2');
      var r3 = document.getElementById('c-r3');

      /* 星落下来 */
      t(fall, [
        [0, { opacity: '0', transform: 'translate3d(0,-26vh,0)' }],
        [240, { opacity: '1', transform: 'translate3d(0,-26vh,0)' }, 'cubic-bezier(.5,.02,.78,.55)'],
        [880, { opacity: '1', transform: 'translate3d(0,0,0)' }]
      ]);
      t(trail, [
        [0, { opacity: '0' }],
        [260, { opacity: '0' }, E.out],
        [420, { opacity: '0.7' }],
        [840, { opacity: '0.85' }],
        [980, { opacity: '0' }]
      ]);

      /* 落点 */
      t(impact, [
        [0, { opacity: '0', transform: 'scale(0.3)' }],
        [860, { opacity: '0', transform: 'scale(0.3)' }, E.out],
        [980, { opacity: '0.85', transform: 'scale(0.9)' }],
        [1250, { opacity: '0', transform: 'scale(1.6)' }]
      ]);

      /* 涟漪：三圈，远近错开、一圈比一圈慢 */
      t(r1, [
        [0, { opacity: '0', transform: 'scale(0.05)' }],
        [860, { opacity: '0', transform: 'scale(0.05)' }, E.out],
        [1050, { opacity: '0.55', transform: 'scale(0.55)' }],
        [1600, { opacity: '0.34', transform: 'scale(1.4)' }, E.io],
        [1960, { opacity: '0', transform: 'scale(1.9)' }]
      ]);
      t(r2, [
        [0, { opacity: '0', transform: 'scale(0.05)' }],
        [930, { opacity: '0', transform: 'scale(0.05)' }, E.out],
        [1150, { opacity: '0.24', transform: 'rotate(2deg) scale(0.6)' }],
        [1650, { opacity: '0.15', transform: 'rotate(2deg) scale(1.6)' }, E.io],
        [1980, { opacity: '0', transform: 'rotate(2deg) scale(2.1)' }]
      ]);
      t(r3, [
        [0, { opacity: '0', transform: 'scale(0.05)' }],
        [1010, { opacity: '0', transform: 'scale(0.05)' }, E.out],
        [1300, { opacity: '0.18', transform: 'rotate(-3deg) scale(0.7)' }],
        [1700, { opacity: '0.1', transform: 'rotate(-3deg) scale(1.7)' }, E.io],
        [2000, { opacity: '0', transform: 'rotate(-3deg) scale(2.3)' }]
      ]);

      /* 三池：瞬间池最先，项目池其次，随笔池最后 */
      t(moment, [
        [0, { opacity: '0', transform: 'scale(1.08)' }],
        [900, { opacity: '0', transform: 'scale(1.08)' }, E.out],
        [1180, { opacity: '0.95', transform: 'scale(1)' }],
        [1600, { opacity: '0.8' }, E.io],
        [1950, { opacity: '0' }]
      ]);
      t(project, [
        [0, { opacity: '0', transform: 'scale(1.08)' }],
        [1180, { opacity: '0', transform: 'scale(1.08)' }, E.out],
        [1480, { opacity: '0.85', transform: 'scale(1)' }],
        [1750, { opacity: '0.6' }, E.io],
        [1990, { opacity: '0' }]
      ]);
      t(essay, [
        [0, { opacity: '0', transform: 'scale(1.06)' }],
        [1420, { opacity: '0', transform: 'scale(1.06)' }, E.out],
        [1720, { opacity: '0.8', transform: 'scale(1)' }],
        [1900, { opacity: '0.55' }, E.io],
        [2030, { opacity: '0' }]
      ]);

      /* 星：落地时亮一下，然后沉进轴心；光交给那根线 */
      t(starw, [
        [0, { opacity: '1', transform: 'rotate(0deg) scale(0.82)' }],
        [760, { opacity: '1', transform: 'rotate(0deg) scale(0.82)' }, E.soft],
        [980, { opacity: '1', transform: 'rotate(2deg) scale(1.16)' }],
        [1200, { opacity: '1', transform: 'rotate(5deg) scale(1)' }, E.io],
        [1500, { opacity: '1', transform: 'rotate(10deg) scale(0.86)' }],
        [1850, { opacity: '0', transform: 'rotate(14deg) scale(0.24)' }]
      ]);
      t(halo, [
        [0, { opacity: '0', transform: 'scale(0.5)' }],
        [700, { opacity: '0', transform: 'scale(0.5)' }, E.out],
        [980, { opacity: '0.9', transform: 'scale(1)' }],
        [1450, { opacity: '0.6', transform: 'scale(1.1)' }, E.io],
        [1900, { opacity: '0', transform: 'scale(1.5)' }]
      ]);

      /* 夜退成首页的靛夜 */
      t(night, [
        [0, { opacity: '0.99' }],
        [1500, { opacity: '0.99' }, E.io],
        [1980, { opacity: '0' }]
      ]);
    }
  });
})();




