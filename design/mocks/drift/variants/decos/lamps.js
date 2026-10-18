/* 路灯：空间里稀疏地漂着几盏极简的灯——一根细杆、一个方块灯头、一圈暖色柔光。
   世界负责陌生，现实物负责熟悉；这盏灯就是那句「现实物 = 认知锚点」。
   近处看得清形状，再远只剩一个暖色的光点，像空间自己记得的一处灯火。 */
(() => {
  'use strict';
  const { rgba, stepPath } = DriftReg;

  /* 位置与大小从 key 再散一次：同一个格子里的几盏不该叠在一处 */
  const R = (key, salt) => {
    let h = 2166136261;
    const s = `${key}|${salt}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const SCAT = 0.35; // 散开幅度（相对格宽），再大就会漂出本格的覆盖范围

  /* 灯是空间里唯一敢暖的东西；杆是结构，取场景的墨色压灰 */
  const GLOW = { essay: [255, 206, 150], project: [255, 194, 128], moment: [255, 198, 148] };
  const POLE = { essay: [86, 98, 116], project: [146, 172, 196], moment: [164, 150, 180] };

  DriftReg.deco('lamps', {
    label: '路灯',
    perTile: 1,
    spread: 1.55,
    alpha: 0.92,
    margin: 110,
    /* 灯杆高 300：大约一张卡的深度，站在空间里正好是「物件」而不是「背景」 */
    shapes: [{ w: 150, h: 300, glow: 122, headW: 56, headH: 26 }],

    paint(ctx, sh, { scene, M }) {
      const gl = GLOW[scene] || GLOW.essay;
      const pl = POLE[scene] || POLE.essay;
      const { w, h, glow, headW, headH } = sh;
      const cx = M + w / 2;
      const headTop = M + 4;
      const hy = headTop + headH / 2; // 灯头中心，也是柔光与光锥的原点
      const bottom = M + h;
      const poleW = 11;

      // 杆：细，但要在 6 单位一像素的档上还留得住
      ctx.fillStyle = rgba(pl, 0.5);
      ctx.fillRect(cx - poleW / 2, headTop + headH - 4, poleW, bottom - headTop - headH + 4);
      ctx.fillStyle = rgba(pl, 0.78);
      ctx.fillRect(cx - poleW / 2, headTop + headH - 4, 2, bottom - headTop - headH + 4);
      // 底座：让它站得住，虽然底下并没有地面
      ctx.fillStyle = rgba(pl, 0.42);
      ctx.fillRect(cx - 22, bottom - 7, 44, 7);

      // 光锥：灯确实在往下照，极淡，只是给形状一个理由
      ctx.beginPath();
      ctx.moveTo(cx - headW / 2, hy + headH / 2);
      ctx.lineTo(cx + headW / 2, hy + headH / 2);
      ctx.lineTo(cx + w * 0.58, bottom);
      ctx.lineTo(cx - w * 0.58, bottom);
      ctx.closePath();
      const cg = ctx.createLinearGradient(0, hy, 0, bottom);
      cg.addColorStop(0, rgba(gl, 0.2));
      cg.addColorStop(0.6, rgba(gl, 0.05));
      cg.addColorStop(1, rgba(gl, 0));
      ctx.fillStyle = cg;
      ctx.fill();

      // 灯头：磨砂的方块，底面最亮
      stepPath(ctx, cx - headW / 2, headTop, headW, headH, 3);
      ctx.fillStyle = rgba([255, 244, 222], 0.92);
      ctx.fill();
      ctx.fillStyle = rgba([255, 232, 172], 0.95);
      ctx.fillRect(cx - headW / 2 + 3, headTop + headH - 6, headW - 6, 6);
      ctx.fillStyle = rgba(pl, 0.3);
      ctx.fillRect(cx - headW / 2 + 3, headTop, headW - 6, 2);

      // 柔光最后压上：灯头附近连杆子都该被照亮
      const rg = ctx.createRadialGradient(cx, hy, 0, cx, hy, glow);
      rg.addColorStop(0, rgba(gl, 0.42));
      rg.addColorStop(0.2, rgba(gl, 0.26));
      rg.addColorStop(0.58, rgba(gl, 0.08));
      rg.addColorStop(1, rgba(gl, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(cx - glow, hy - glow, glow * 2, glow * 2);
    },

    /* 锚点就该稳：只留一点悬着的呼吸，不做飘移 */
    motion(d, t) {
      const p = d.p;
      const k = d.key;
      const ph = R(k, 'ph') * 6.283;
      const sp = 0.00016 * (0.7 + R(k, 'w') * 0.7);
      return {
        dx: (R(k, 'x') - 0.5) * p.Pw * SCAT + Math.cos(t * sp + ph) * 15,
        dy: (R(k, 'y') - 0.5) * p.Ph * SCAT + Math.sin(t * sp * 1.31 + ph * 1.7) * 19,
        rot: Math.sin(t * sp * 0.9 + ph) * 1.1,
        scale: 0.78 + R(k, 's') * 0.52,
        alpha: 0.86 + 0.16 * Math.sin(t * sp * 3.1 + ph * 2),
      };
    },
  });
})();
