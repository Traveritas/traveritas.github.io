/* 开屏 mock 5 · 迭代版装配脚本（只在本地造页面用；产物是三个独立的 index.html，不依赖它运行）
   node design/mocks/boot/iter/5-night/_build.cjs
   共用：_parts/shell.html（头 + 假首页 + 公共接缝引擎）
   每个候选：_parts/<x>.css / <x>.dom / <x>.top / <x>.js */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PART = path.join(HERE, '_parts');
const read = (p) => fs.readFileSync(path.join(PART, p), 'utf8');

const CANDIDATES = [
  { dir: 'a-afterimage', key: 'a', title: '开屏 5 · A 一颗星的余像' },
  { dir: 'b-opening', key: 'b', title: '开屏 5 · B 夜里的一道开口' },
  { dir: 'c-pool', key: 'c', title: '开屏 5 · C 星落进池子' },
];

/* 无 JS 时的兜底线：按 1440×900 的坐标画一根固定的波形（有 JS 后会被首页自己的线覆盖） */
function fallbackLine() {
  const W = 1440, H = 900;
  const TAN = Math.tan((14 * Math.PI) / 180);
  const ANG = Math.atan(TAN);
  const half = Math.hypot(W, H) / 2 + 40;
  let d = '';
  for (let i = 0; i <= 110; i++) {
    const s = i / 110;
    const t = (s * 2 - 1) * half;
    const x = W / 2 + Math.cos(ANG) * t;
    const y = H / 2 + Math.sin(ANG) * t;
    const wob = 3.6 * (Math.sin(t * 0.5 + 1.1) * 0.6 + Math.sin(t * 1.9 + 0.4) * 0.4);
    const ox = -Math.sin(ANG) * wob;
    const oy = Math.cos(ANG) * wob;
    d += (i ? 'L' : 'M') + (x + ox).toFixed(1) + ' ' + (y + oy).toFixed(1);
  }
  return d;
}

const shell = read('shell.html');
const FALLBACK = fallbackLine();

for (const c of CANDIDATES) {
  const html = shell
    .replace('__TITLE__', c.title)
    .replace('__FALLBACK_D__', FALLBACK)
    .replace('/*__CSS__*/', read(`${c.key}.css`).trim())
    .replace('<!--__DOM__-->', read(`${c.key}.dom`).trim())
    .replace('<!--__TOP__-->', read(`${c.key}.top`).trim())
    .replace('/*__JS__*/', read(`${c.key}.js`).trim());
  const out = path.join(HERE, c.dir);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
  console.log(`${c.dir}/index.html  ${(html.length / 1024).toFixed(1)} KB  ${html.split('\n').length} 行`);
}
