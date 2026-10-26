/* 拾得 · 物件清单（原型用的占位物件）

   一件物件：
     id     唯一、不再改（存档按它记）
     name   名字
     odds   每一次判定遇见它的机会是 1/odds
     text   { wake, dream } 两态各一句；正式版走 [[醒|梦]]
     art    (ctx, size) => void —— 原型里用画布画的占位；正式版换成 src（平面图 / 预渲染序列帧）
     extra  以后的扩展位，原型里不用：
              voice  朗读（接隔壁的文字转语音）
              oc     与某个 OC 相关
              more   额外描述 / 彩蛋
              fx     这一件自己的特效（覆盖默认的外壳或环境）
   以后随手加一件 = 在这里加一项。 */
(() => {
  const TAU = Math.PI * 2;

  /* 占位画法：低饱和、一层淡填色 + 一道细边，大小按 size（物件那一层的边长） */
  const soft = (ctx, fill, edge) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.stroke();
  };

  const ITEMS = [
    {
      id: 'pebble', name: '石子', odds: 5,
      text: { wake: '河滩上随处都有的那种，握久了是温的。', dream: '它记得自己曾经是一座山，只是不太确定是哪一座。' },
      art(ctx, S) {
        ctx.beginPath();
        ctx.ellipse(S / 2, S / 2, S * 0.3, S * 0.22, -0.3, 0, TAU);
        soft(ctx, 'rgba(176,186,198,.82)', 'rgba(230,236,242,.7)');
        ctx.beginPath();
        ctx.ellipse(S * 0.43, S * 0.42, S * 0.1, S * 0.05, -0.4, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fill();
      },
    },
    {
      id: 'leaf', name: '一片叶', odds: 8,
      text: { wake: '叶脉比叶子本身还清楚。', dream: '它从来没有长在哪棵树上，却知道风的方向。' },
      art(ctx, S) {
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.rotate(-0.6);
        ctx.beginPath();
        ctx.moveTo(-S * 0.34, 0);
        ctx.quadraticCurveTo(0, -S * 0.26, S * 0.34, 0);
        ctx.quadraticCurveTo(0, S * 0.26, -S * 0.34, 0);
        soft(ctx, 'rgba(164,184,168,.78)', 'rgba(226,238,228,.7)');
        ctx.beginPath();
        ctx.moveTo(-S * 0.4, 0);
        ctx.lineTo(S * 0.3, 0);
        for (let k = -2; k <= 2; k++) { ctx.moveTo(k * S * 0.09, 0); ctx.lineTo(k * S * 0.09 + S * 0.07, -S * 0.08); ctx.moveTo(k * S * 0.09, 0); ctx.lineTo(k * S * 0.09 + S * 0.07, S * 0.08); }
        ctx.strokeStyle = 'rgba(236,244,238,.6)';
        ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'marble', name: '玻璃珠', odds: 50,
      text: { wake: '里面封着一道扭过去的蓝。', dream: '从这一边看进去，是另一边的天气。' },
      art(ctx, S) {
        const g = ctx.createRadialGradient(S * 0.42, S * 0.4, S * 0.02, S / 2, S / 2, S * 0.26);
        g.addColorStop(0, 'rgba(255,255,255,.75)');
        g.addColorStop(1, 'rgba(150,176,206,.35)');
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S * 0.26, 0, TAU);
        soft(ctx, g, 'rgba(226,236,246,.8)');
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU * 1.2;
          const r = S * (0.03 + 0.17 * (i / 40));
          ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r * 0.6);
        }
        ctx.strokeStyle = 'rgba(132,160,214,.8)';
        ctx.stroke();
      },
    },
    {
      id: 'bell', name: '无舌的铃', odds: 400,
      text: { wake: '摇起来没有声音，但手会听见。', dream: '它响过一次，在还没有耳朵的时候。' },
      art(ctx, S) {
        ctx.beginPath();
        ctx.moveTo(S * 0.3, S * 0.66);
        ctx.quadraticCurveTo(S * 0.33, S * 0.3, S * 0.5, S * 0.28);
        ctx.quadraticCurveTo(S * 0.67, S * 0.3, S * 0.7, S * 0.66);
        ctx.closePath();
        soft(ctx, 'rgba(196,184,160,.75)', 'rgba(244,236,220,.75)');
        ctx.beginPath();
        ctx.arc(S * 0.5, S * 0.24, S * 0.04, 0, TAU);
        ctx.strokeStyle = 'rgba(244,236,220,.75)';
        ctx.stroke();
      },
    },
    {
      id: 'key', name: '钥匙', odds: 3000,
      text: { wake: '齿很浅，像是给一扇很轻的门。', dream: '门在它被造出来以后才有。' },
      art(ctx, S) {
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.rotate(-0.7);
        ctx.beginPath();
        ctx.arc(-S * 0.2, 0, S * 0.1, 0, TAU);
        ctx.moveTo(-S * 0.1, -S * 0.02);
        ctx.lineTo(S * 0.3, -S * 0.02);
        ctx.lineTo(S * 0.3, S * 0.07);
        ctx.lineTo(S * 0.24, S * 0.07);
        ctx.lineTo(S * 0.24, S * 0.02);
        ctx.lineTo(S * 0.18, S * 0.02);
        ctx.lineTo(S * 0.18, S * 0.06);
        ctx.lineTo(S * 0.13, S * 0.06);
        ctx.lineTo(S * 0.13, S * 0.02);
        ctx.lineTo(-S * 0.1, S * 0.02);
        soft(ctx, 'rgba(186,176,206,.72)', 'rgba(238,232,248,.8)');
        ctx.restore();
      },
    },
    {
      id: 'feather', name: '羽', odds: 100000,
      text: { wake: '比它看起来还要轻一点。', dream: '落下来要用很久，久到它决定不落了。' },
      art(ctx, S) {
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.rotate(0.5);
        ctx.beginPath();
        ctx.moveTo(0, -S * 0.36);
        ctx.quadraticCurveTo(S * 0.15, -S * 0.1, S * 0.03, S * 0.28);
        ctx.quadraticCurveTo(-S * 0.14, -S * 0.08, 0, -S * 0.36);
        soft(ctx, 'rgba(226,230,238,.6)', 'rgba(255,255,255,.75)');
        ctx.beginPath();
        ctx.moveTo(0, -S * 0.34);
        ctx.quadraticCurveTo(S * 0.03, 0, S * 0.02, S * 0.38);
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'moon', name: '一小片月', odds: 100000000,
      text: { wake: '边缘是亮的，中间是更亮的。', dream: '它不是月亮的一部分。月亮是它的一部分。' },
      art(ctx, S) {
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
        g.addColorStop(0, 'rgba(255,248,236,.5)');
        g.addColorStop(1, 'rgba(255,248,236,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S * 0.2, 0, TAU);
        ctx.arc(S * 0.58, S * 0.46, S * 0.17, 0, TAU, true);
        soft(ctx, 'rgba(250,240,222,.92)', 'rgba(255,252,244,.9)');
      },
    },
  ];

  window.CollectItems = ITEMS;
})();
