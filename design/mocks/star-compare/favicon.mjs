// 由 star-t-smooth 的构造器生成标签页图标：node design/mocks/star-compare/favicon.mjs [legacy|frost-wide] → public/favicon-star.svg
import { star } from '../star-t-smooth/src.js';
import { writeFileSync } from 'node:fs';
const which = process.argv[2] || 'legacy';
const FROST = { sides: 6, fold: 1.0, fillet: 0.14, tip: { kind: 'flat', len: 0.5 }, tones: { steps: 4, min: 0.24, max: 0.9, depth: 0.24 }, hub: { mode: 'split', radius: 4.6, split: 0.55 }, halfWidth: 4.16 };
const res = star(which === 'legacy' ? { legacy: true } : FROST);
const paths = res.paths.map((p) => `<path d="${p.d}" fill-opacity="${(0.35 + p.tone * 0.65).toFixed(2)}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14.4 -14.4 28.8 28.8">
  <!-- 三轴正交六尖星（±x ±y ±z，正等轴视角），与左下工具栏那颗同形。由 design/mocks/star-compare/favicon.mjs 生成（${which}） -->
  <style>g { fill: #4a4566; } @media (prefers-color-scheme: dark) { g { fill: #e4e0f0; } }</style>
  <g>${paths}</g>
</svg>
`;
writeFileSync(new URL('../../../public/favicon-star.svg', import.meta.url), svg);
console.log('ok', which, res.paths.length, 'paths');
