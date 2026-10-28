/* B · 夜里的一道开口 · 总长 2260ms
   0 ── 320   夜是满的，什么也没有
   320 ─ 900  一道口子从中心沿 14° 划开：两条边是一对起伏的发丝，口子里亮起一线光，星在光里
   900 ─ 1320 呼吸：口子张开一息、再收一息；光晕跟着明暗
   1320 ─ 1900 夜像雾一样退；口子张到最开，光从里面漏出来；两条边开始向中间合
   1500 ─ 2040 那线光凝成开屏线、沿 14° 展开（首页的脑电线）
   1900 ─ 2045 两条边合拢成一根发丝；夜退尽；大字在 1640–2110 对焦
   2040 ─ 2095 开屏线换回首页线（同形）
   2095 ─ 2260 首页静置
*/
(function () {
  window.__bootKit.start({
    total: 2260,
    line: [1500, 2040],
    focus: [1640, 2110],
    handoff: [2046, 2101],
    build: function (ctx) {
      var t = ctx.track;
      var E = ctx.ease;
      var NX = -Math.sin((14 * Math.PI) / 180);
      var NY = Math.cos((14 * Math.PI) / 180);

      var night = document.getElementById('b-night');
      var mist = document.getElementById('b-mist');
      var spill = document.getElementById('b-spill');
      var cut = document.getElementById('b-cut');
      var ea = document.getElementById('b-edge-a');
      var eb = document.getElementById('b-edge-b');
      var starw = document.getElementById('b-starw');
      var halo = document.getElementById('b-halo');

      /* 口子的长度与两条边：形状直接抄首页线，viewBox 跟着视口走 */
      function syncGeom() {
        var len = ctx.lineLength();
        cut.style.setProperty('--w', len.toFixed(1) + 'px');
        var d = ctx.lineD();
        var vb = '0 0 ' + ctx.W() + ' ' + ctx.H();
        [ea, eb].forEach(function (el) {
          el.setAttribute('viewBox', vb);
          el.querySelector('path').setAttribute('d', d);
        });
      }
      syncGeom();
      ctx.onResize(syncGeom);

      function et(k, d) {
        return 'translate(' + (NX * d).toFixed(2) + 'px,' + (NY * d).toFixed(2) + 'px) rotate(14deg) scaleX(' +
          k.toFixed(5) + ') rotate(-14deg)';
      }
      /* [毫秒, 长度系数, 离开轴的距离 px, 不透明度, 缓动] */
      var EDGE = [
        [0, 0.004, 0, 0],
        [320, 0.02, 0, 0],
        [520, 0.16, 1.5, 0.35, E.out],
        [900, 0.5, 6, 0.6],
        [1050, 0.52, 7, 0.6],
        [1200, 0.53, 8, 0.6],
        [1320, 0.54, 7, 0.6],
        [1500, 0.56, 9, 0.55],
        [1680, 0.6, 12, 0.45],
        [1900, 0.99, 0.9, 0.32],
        [2045, 1, 0.6, 0]
      ];
      function edgeKeys(sign) {
        return EDGE.map(function (r) {
          return [r[0], { transform: et(r[1], sign * r[2]), opacity: String(r[3]) }, r[4]];
        });
      }
      t(ea, edgeKeys(1));
      t(eb, edgeKeys(-1));

      /* 口子里的光：与两条边同一个长度系数，法向上随呼吸张合 */
      t(cut, [
        [0, { opacity: '0', transform: 'scale(0.004, 0.18)' }],
        [360, { opacity: '0', transform: 'scale(0.004, 0.18)' }, E.out],
        [900, { opacity: '0.95', transform: 'scale(0.5, 0.9)' }],
        [1150, { opacity: '1', transform: 'scale(0.52, 1)' }],
        [1320, { opacity: '0.92', transform: 'scale(0.54, 0.86)' }],
        [1550, { opacity: '0.86', transform: 'scale(0.56, 1.15)' }, E.io],
        [1850, { opacity: '0', transform: 'scale(0.6, 1.35)' }]
      ]);

      t(spill, [
        [0, { opacity: '0', transform: 'scale(0.55)' }],
        [360, { opacity: '0', transform: 'scale(0.55)' }, E.out],
        [900, { opacity: '0.55', transform: 'scale(1)' }],
        [1250, { opacity: '0.42', transform: 'scale(1.06)' }],
        [1900, { opacity: '0', transform: 'scale(1.18)' }]
      ]);

      t(night, [
        [0, { opacity: '0.99' }],
        [1370, { opacity: '0.99' }, E.io],
        [2030, { opacity: '0' }]
      ]);

      t(mist, [
        [0, { opacity: '0.55', transform: 'scale(1)' }],
        [1350, { opacity: '0.55', transform: 'scale(1)' }, E.io],
        [2010, { opacity: '0', transform: 'scale(1.05)' }]
      ]);

      t(starw, [
        [0, { opacity: '0', transform: 'rotate(0deg) scale(0.4)' }],
        [300, { opacity: '0', transform: 'rotate(0deg) scale(0.4)' }, E.out],
        [700, { opacity: '1', transform: 'rotate(0deg) scale(1)' }],
        [1150, { opacity: '1', transform: 'rotate(2deg) scale(1.06)' }],
        [1500, { opacity: '1', transform: 'rotate(6deg) scale(1)' }, E.io],
        [1900, { opacity: '0', transform: 'rotate(14deg) scale(0.7)' }]
      ]);

      t(halo, [
        [0, { opacity: '0', transform: 'scale(0.5)' }],
        [360, { opacity: '0', transform: 'scale(0.5)' }, E.out],
        [820, { opacity: '0.85', transform: 'scale(1)' }],
        [1300, { opacity: '0.7', transform: 'scale(1.08)' }, E.io],
        [1900, { opacity: '0', transform: 'scale(1.5)' }]
      ]);
    }
  });
})();


