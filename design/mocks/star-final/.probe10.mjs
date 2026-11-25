/* 临时探针 10：几何自检 —— 投影出来的剪影对不对
   ① 直边 + curve=0 时，一支的轮廓必须与 drawStar() 的四个点逐点相等
   ② 曲边时，尖端的半角必须是 t-arc 量到的那个数
   ③ 六支的尖端半径必须都等于 13.064（r·√(2/3)）
   ④ 内角半径必须与 star-t-width 的闭式解一致
*/
import {
  syncOpts,
  prodOpts,
  frames,
  M_REST,
  stationAt,
  halfW,
  notchRadius,
  L_ISO,
  build,
  outlinePoly,
  rasterizePolys,
  rasterTone,
} from './src.js';

const straight = syncOpts({ curve: 0 });
console.log('— ① 直边一支的四点（担 rescence 现役） —');
const fr = frames(M_REST).find((f) => f.key === 'z+');
const A = { s: 0, W: 1.9 };
for (const t of [0, 1]) {
  const st = stationAt(t, { ...straight, halfWidth: 1.9, r: 16 });
  console.log(` t=${t} s=${st.s.toFixed(4)} (期望 ${(t * 16).toFixed(4)})  W=${st.W.toFixed(4)} (期望 ${(1.9 * (1 - t)).toFixed(4)})`);
}
void A;
void fr;

console.log('\n— ③ 六支尖端半径 —');
for (const cfg of [syncOpts({ curve: 0 }), syncOpts({})]) {
  const tail = stationAt(1, cfg);
  console.log(
    'curve', cfg.curve,
    'tip 三维 s', tail.s.toFixed(4),
    '屏幕半径', (tail.s * Math.sqrt(2 / 3)).toFixed(4),
    '期望 13.064',
    'W', tail.W.toFixed(4),
  );
}

console.log('\n— ④ 内角 —');
for (const [name, cfg] of [
  ['直边 w=4.16', syncOpts({ curve: 0 })],
  ['曲 w=4.16', syncOpts({})],
  ['直边 w=1.9', prodOpts({ curve: 0 })],
]) {
  console.log(name, 'notch', notchRadius(cfg).toFixed(4));
}

console.log('\n— ② 尖端半角（投影） —');
for (const curve of [0, 0.04]) {
  const cfg = syncOpts({ curve });
  const a = stationAt(0.999, cfg);
  const b = stationAt(1, cfg);
  const dScreen = (b.s - a.s) * Math.sqrt(2 / 3);
  console.log('curve', curve, '半角', ((Math.atan2(a.W, dScreen) * 180) / Math.PI).toFixed(2), '°');
}
console.log('参考：现役 w=1.9 直边 8.3°，w=1.9 凹0.04 → 5.0°（t-arc 的原读数）');
for (const curve of [0, 0.04]) {
  const cfg = { ...prodOpts({}), curve, tS: syncOpts({}).tS };
  const a = stationAt(0.999, cfg);
  const b = stationAt(1, cfg);
  const dScreen = (b.s - a.s) * Math.sqrt(2 / 3);
  console.log(' w=1.9 curve', curve, '半角', ((Math.atan2(a.W, dScreen) * 180) / Math.PI).toFixed(2), '°');
}

console.log('\n— 剪影面积（应与「六片风筝并集」同量级） —');
for (const [name, cfg] of [
  ['prod', prodOpts({})],
  ['sync 直', syncOpts({ curve: 0 })],
  ['sync 曲', syncOpts({})],
]) {
  const mask = rasterizePolys(outlinePoly(cfg, M_REST, 40), 256);
  let area = 0;
  for (const v of mask) area += v;
  console.log(name.padEnd(9), 'area(px@256)', area, ' 归一化填充率', (area / (256 * 256)).toFixed(4));
}

console.log('\n— 明暗光栅的覆盖（能看到几支） —');
const t = rasterTone(syncOpts({}), M_REST, 128);
let cov = 0;
for (const v of t.cov) cov += v;
console.log('cov px', cov, 'of', 128 * 128);
const tones = new Set();
for (let i = 0; i < t.cov.length; i++) if (t.cov[i]) tones.add(Math.round(t.tone[i] * 100));
console.log('调子出现的档', [...tones].sort((a, b) => a - b).join(','));
void build;
void halfW;
void L_ISO;