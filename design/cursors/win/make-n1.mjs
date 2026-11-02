import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* N1 · 星指环心
   星的长锋落在圆心上，锋尖压一颗小菱形（热点）；环是一整圈带缺口的轨道，
   缺口朝星，环的粗细从缺口两端的 0.2px 渐渐长到对侧的 1.15px——
   是一条被拉过的线，不是一枚等宽的圈。 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CX = 16;
const CY = 16;
const R = 10.4;
const GAP = 60; // 度
const START = 225 + GAP / 2; // 255°
const SWEEP = 360 - GAP; // 300°
const W_MIN = 0.2;
const W_MAX = 1.15;
const STEPS = 120;

const rad = (d) => (d * Math.PI) / 180;
const pt = (d, r) => [CX + r * Math.cos(rad(d)), CY + r * Math.sin(rad(d))];
const f = (n) => Math.round(n * 100) / 100;

const outer = [];
const inner = [];
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  const d = 180 * (1 - Math.abs(2 * t - 1)); // 0 在缺口两端，180 在对侧
  const w = W_MIN + (W_MAX - W_MIN) * Math.pow(d / 180, 1.5);
  const ang = START + SWEEP * t;
  outer.push(pt(ang, R + w / 2).map(f));
  inner.push(pt(ang, R - w / 2).map(f));
}

const ring =
  `M${outer[0][0]} ${outer[0][1]}` +
  outer.slice(1).map(([x, y]) => `L${x} ${y}`).join('') +
  inner.reverse().map(([x, y]) => `L${x} ${y}`).join('') +
  'Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <!-- N1 · 星指环心：长锋落在圆心，锋尖压一颗小菱形（热点 16,16）。
       环从缺口两端 0.2px 渐长到对侧 1.15px，是被拉过的一道轨，不是等宽的圈。 -->
  <path d="${ring}" fill="#5F5872" fill-opacity="0.9" />
  <g transform="translate(10 10) rotate(135)">
    <path d="M0,-8.5C0.4,-2.6 1.5,-0.7 4.2,0C1.5,0.7 0.4,2.4 0,5.5C-0.4,2.4 -1.5,0.7 -4.2,0C-1.5,-0.7 -0.4,-2.6 0,-8.5Z"
          fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.88" stroke-width="0.9" stroke-linejoin="round" />
  </g>
  <path d="M16 14.3L17.7 16L16 17.7L14.3 16Z"
        fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.92" stroke-width="0.8" stroke-linejoin="round" />
</svg>
`;

fs.writeFileSync(path.join(here, 'arrow-n1.svg'), svg);
console.log('wrote arrow-n1.svg', 'ring points', outer.length * 2);
