/* 凹口半径的独立读数：node design/mocks/star-t-width/probe-notch.mjs
   输出制表符分隔的表，notes.md 里的数字就是这里印出来的。 */
import { RATIOS, R0, PROD, notchRadius, fillRatio, px } from './src.js';

const cell = (v, d = 3) => v.toFixed(d);
const head = ['halfWidth/r', 'halfWidth', '内角(单位)', '内角/支长', '200px', '400px', '96px', '48px', '剪影填充率', '内角方位'];
console.log(head.join('\t'));

const rows = [];
for (const k of RATIOS) {
  const o = notchRadius({ halfWidth: k * R0 });
  const fill = fillRatio({ halfWidth: k * R0 });
  const row = {
    k,
    w: k * R0,
    notch: o.notch,
    notchR: o.notch / R0,
    p200: px(o.notch, 200),
    p400: px(o.notch, 400),
    p96: px(o.notch, 96),
    p48: px(o.notch, 48),
    fill,
    at: o.atDeg,
  };
  rows.push(row);
  console.log(
    [
      cell(row.k, 2),
      cell(row.w, 3),
      cell(row.notch, 4),
      cell(row.notchR, 4),
      cell(row.p200, 2),
      cell(row.p400, 2),
      cell(row.p96, 2),
      cell(row.p48, 2),
      cell(fill, 3),
      `${cell(row.at, 1)}°`,
    ].join('\t'),
  );
}

const prod = notchRadius({ halfWidth: PROD.halfWidth });
console.log('');
console.log(`现役 halfWidth=1.9：内角 ${prod.notch.toFixed(4)} 单位 = 200px 上 ${px(prod.notch, 200).toFixed(2)}px`);
console.log(`（star-solid/notes.md 写的是 2.8135 单位 / 200px 上 14.07px）`);
