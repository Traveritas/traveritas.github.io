import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* S1 · 星环在身，长锋指外
   星身缩在环里，长锋从环的缺口穿出去，锋尖 (5,4) 就是热点；
   环的缺口对准长锋，粗细从缺口两端 0.3px 沿星轴渐长到尾巴方向 1.15px。
   星身偏在环心，环是它的晕，不是靶。 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CX = 14.19;
const CY = 13.19;
const R = 9;
const GAP = 90;
const GAP_CENTER = 225;
const START = GAP_CENTER + GAP / 2; // 270°
const SWEEP = 360 - GAP; // 270°
const W_MIN = 0.3;
const W_MAX = 1.15;
const STEPS = 120;

const rad = (d) => (d * Math.PI) / 180;
const pt = (d, r) => [CX + r * Math.cos(rad(d)), CY + r * Math.sin(rad(d))];
const f = (n) => Math.round(n * 100) / 100;

const outer = [];
const inner = [];
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  const d = 180 * (1 - Math.abs(2 * t - 1));
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
  <!-- S1 · 星环在身，长锋指外：星身缩在环里，长锋从缺口穿出，锋尖 (5,4) 是热点；
       环的缺口对准长锋，粗细从缺口两端 0.3px 渐长到尾巴方向 1.15px。 -->
  <path d="${ring}" fill="#5F5872" fill-opacity="0.9" />
  <g transform="translate(${CX} ${CY}) rotate(-45)">
    <path d="M0,-13C0.6,-4 2.3,-1.1 5.2,0C2.3,1.1 0.6,3.6 0,6.5C-0.6,3.6 -2.3,1.1 -5.2,0C-2.3,-1.1 -0.6,-4 0,-13Z"
          fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.88" stroke-width="0.9" stroke-linejoin="round" />
  </g>
  <path d="M5 2.8L6.2 4L5 5.2L3.8 4Z"
        fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.92" stroke-width="0.7" stroke-linejoin="round" />
</svg>
`;

fs.writeFileSync(path.join(here, 'arrow-s1.svg'), svg);
console.log('wrote arrow-s1.svg');
