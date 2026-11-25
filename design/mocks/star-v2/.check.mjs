/* .check.mjs —— 着色器与 JS 的一致性自检（离线）
   node design/mocks/star-v2/.check.mjs

   量三件事，都是「不可能靠眼睛在沙箱里看出来、但一定会炸」的那一类：
     1. FS 里声明的每个 uniform 在 JS 里都有值（少一个就是静默的 0）；
     2. FS 里用到的每个函数都定义过、每行括号配平（GLSL 编译失败会整页黑）；
     3. RENDER 里的数与 tone.mjs 读到的数一致（离线账不能和画面对不上）。
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(HERE, 'src.js'), 'utf8');

const i = src.indexOf('const FS = `');
const j = src.indexOf('`;', i);
const FS = src.slice(i + 'const FS = `'.length, j);
const VS = src.slice(src.indexOf('const VS = `') + 'const VS = `'.length, src.indexOf('`;', src.indexOf('const VS = `')));

const bad = [];
const ok = [];

/* 1. uniform 声明 ↔ JS 里给的 uniform 对象 */
const decl = [...FS.matchAll(/uniform\s+\w+\s+(u[A-Za-z]\w*)/g)].map((m) => m[1]);
const ub = src.slice(src.indexOf('uniforms: {'));
const end = ub.indexOf('\n    },\n  });');
const provided = [...ub.slice(0, end < 0 ? 4000 : end).matchAll(/^\s+(u[A-Za-z]\w*):/gm)].map((m) => m[1]);
const missing = decl.filter((d) => !provided.includes(d));
const extra = provided.filter((k) => !decl.includes(k));
if (missing.length) bad.push(`FS 声明了但 JS 没给：${missing.join(', ')}`);
else ok.push(`uniform 全配齐（${decl.length} 个）`);
if (extra.length) bad.push(`JS 给了但 FS 没声明：${extra.join(', ')}`);

/* 2. FS 里调用的函数是否都定义过 + 括号配平 */
const calls = new Set([...FS.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]));
const builtin = new Set(
  ('vec2 vec3 vec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 float int bool sampler2D ' +
    'normalize length dot cross reflect refract mix clamp smoothstep min max abs pow exp sqrt ' +
    'sin cos tan acos asin atan floor ceil fract mod sign step texture transpose ' +
    'if for while return').split(' '),
);
const defined = new Set([...FS.matchAll(/\b(?:float|vec[234]|mat[234]|bool|int|void)\s+([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]));
const undef = [...calls].filter((c) => !builtin.has(c) && !defined.has(c) && c !== 'main' && !/^u[A-Z]/.test(c));
if (undef.length) bad.push(`FS 调了未定义的函数：${undef.join(', ')}`);
else ok.push('FS 里调用的函数都有定义');
for (const [name, sh] of [['VS', VS], ['FS', FS]]) {
  const open = (sh.match(/\{/g) || []).length;
  const close = (sh.match(/\}/g) || []).length;
  if (open !== close) bad.push(`${name} 花括号不配平：${open} 开 / ${close} 闭`);
  const po = (sh.match(/\(/g) || []).length;
  const pc = (sh.match(/\)/g) || []).length;
  if (po !== pc) bad.push(`${name} 圆括号不配平：${po} 开 / ${pc} 闭`);
}
if (!bad.length) ok.push('VS / FS 括号配平');

/* 3. 着色器里引用的旋钮名（uCool 之类）在 RENDER 里都有对应，且 tone.mjs 读的是同一份 */
const { RENDER } = await import('./src.js');
const wantRender = ['camZ', 'tan', 'edgeW', 'card', 'ior', 'feat', 'rough', 'irid', 'core', 'glowMix', 'disp', 'cool', 'ringTint', 'coolDark', 'coolLow', 'back'];
const lost = wantRender.filter((k) => RENDER[k] === undefined);
if (lost.length) bad.push(`RENDER 缺旋钮：${lost.join(', ')}`);
else ok.push(`RENDER 旋钮齐全（${wantRender.length} 个）`);

const tone = readFileSync(path.join(HERE, 'tone.mjs'), 'utf8');
const unread = wantRender.filter((k) => !new RegExp(`RENDER\\.${k}\\b`).test(tone) && !new RegExp(`\\b${k}:\\s*RENDER\\.${k}\\b`).test(tone));
if (unread.length) bad.push(`tone.mjs 没从 RENDER 读：${unread.join(', ')}`);
else ok.push('tone.mjs 的每个旋钮都来自 RENDER（离线账与画面同源）');

/* 4. 一些必须成立的硬条件（BRIEF 不许改的） */
const apiKeys = [...src.matchAll(/^\s{2}(ready|setTime|trigger|rest|stats):/gm)].map((m) => m[1]);
const need = ['ready', 'setTime', 'trigger', 'rest', 'stats'];
const lack = need.filter((k) => !apiKeys.includes(k) && !new RegExp(`\\b${k}\\b`).test(src));
if (lack.length) bad.push(`__star 缺：${lack.join(', ')}`);
else ok.push('__star 的 ready / setTime / trigger / rest / stats 都在');
if (/requestAnimationFrame\s*\(/.test(src) && !/__rafPatched/.test(src)) bad.push('页面里出现了裸 rAF');
else ok.push('不自起 rAF（首帧同步画完，走格用 setTimeout）');
if (/N_STEPS = \d+/.test(src)) ok.push(`定格格数：${/N_STEPS = (\d+)/.exec(src)[1]}`);
if (/DWELL = \d+/.test(src)) ok.push(`每格停留：${/DWELL = (\d+)/.exec(src)[1]} ms`);

console.log(bad.length ? '✗ 有问题：\n  ' + bad.join('\n  ') : '✓ 全部通过');
for (const o of ok) console.log('  · ' + o);
process.exit(bad.length ? 1 : 0);