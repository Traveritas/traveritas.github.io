import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* N5 · 星在环内，长锋指向环心
   星缩到 0.7，尾巴从环的缺口探出去；长锋的尖在 (16,16)，压一颗 2.4px 的菱形。
   环的粗细从缺口两端 0.2px 渐长到对侧 1.15px。 */

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
  <!-- N5 · 星指环心：星缩到 0.7，尾巴从环的缺口探出去；长锋的尖落在 (16,16)，
       压一颗 2.4px 的菱形（热点）。环从缺口两端 0.2px 渐长到对侧 1.15px。 -->
  <path d="${ring}" fill="#5F5872" fill-opacity="0.9" />
  <g transform="translate(11.79 11.79) rotate(135)">
    <path d="M0,-5.95C0.28,-1.82 1.05,-0.49 2.94,0C1.05,0.49 0.28,1.68 0,3.85C-0.28,1.68 -1.05,0.49 -2.94,0C-1.05,-0.49 -0.28,-1.82 0,-5.95Z"
          fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.88" stroke-width="0.8" stroke-linejoin="round" />
  </g>
  <path d="M16 14.8L17.2 16L16 17.2L14.8 16Z"
        fill="#FCFAFE" stroke="#2B2F38" stroke-opacity="0.92" stroke-width="0.7" stroke-linejoin="round" />
</svg>
`;

fs.writeFileSync(path.join(here, 'arrow-n5.svg'), svg);
console.log('wrote arrow-n5.svg');
