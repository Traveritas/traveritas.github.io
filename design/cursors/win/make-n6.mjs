import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* N6 · 星指环心，尾巴探出缺口
   星 0.8，长锋尖仍落在 (16,16)，压一颗 2.2px 菱形；
   尾巴刚好从环的缺口探出去 0.7px。环从缺口两端 0.3px 渐长到对侧 1.15px。 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CX = 16;
const CY = 16;
const R = 10.4;
const GAP = 60;
const START = 225 + GAP / 2;
const SWEEP = 360 - GAP;
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
  <!-- N6 · 星指环心：星 0.8，长锋尖在 (16,16)，压一颗 2.2px 菱形（热点）；
       尾巴从环的缺口探出 0.7px。环从缺口两端 0.3px 渐长到对侧 1.15px。 -->
  <path d="${ring}" fill="#5F5872" fill-opacity="0.9" />
  <g transform="translate(11.19 11.19) rotate(135)">
    <path d="M0,-6.8C0.32,-2.08 1.2,-0.56 3.36,0C1.2,0.56 0.32,1.92 0,4.4C-0.32,1.92 -1.2,0.56 -3.36,0C-1.2,-0.56 -0.32,-2.08 0,-6.8Z"
          fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.88" stroke-width="0.85" stroke-linejoin="round" />
  </g>
  <path d="M16 14.9L17.1 16L16 17.1L14.9 16Z"
        fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.92" stroke-width="0.7" stroke-linejoin="round" />
</svg>
`;

fs.writeFileSync(path.join(here, 'arrow-n6.svg'), svg);
console.log('wrote arrow-n6.svg');
