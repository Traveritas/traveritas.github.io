/* 把原站的工具栏 / Ave / 声音照原样搬进原型
   node design/mocks/remake/chrome/build-chrome.mjs（先 npm run build，标记取自 dist/）
   → chrome.js（esbuild 打包，reality 换成 reality-shim.ts）
   → chrome.css（tokens.css + Toolstar / Ave 组件里的样式，原样）
   → chrome.html（dist 主页里渲染好的 #ts 与 #ave，链接改成原型的路由） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const require = createRequire(path.join(root, 'package.json'));
const esbuild = require('esbuild');

/* ── JS ── */
const patch = {
  'src/scripts/ave.ts': (s) =>
    s
      // 原型是单页：「在哪一页」由 app.js 给
      .replace('const here = () => location.pathname;', 'const here = () => ((window as any).__rmPath ? (window as any).__rmPath() : location.pathname);') +
    `
/* 原型：换到一处（不是读某一篇）时，照 initAve 里进页那一段挑一句 */
export function aveEnterRoute(read: boolean) {
  if (read) return;
  const enter = AVE_LINES.filter((l) => l.when.on === 'enter' && pathHits(l.when.path) && visitorOk(l) && fresh(l)).sort(
    (a, b) => ('path' in b.when ? b.when.path!.length : 0) - ('path' in a.when ? a.when.path!.length : 0),
  )[0];
  if (enter && enter.when.on === 'enter') setTimeout(() => cue(enter), (enter.when.after ?? ENTER_AFTER) * 1000);
}
`,
  // 原型没有检索：寻找回车 / 点标签就去断章
  'src/scripts/toolstar.ts': (s) => s.replace('const toIndex = (q: string) => (location.href = `/articles/?q=${encodeURIComponent(q)}`);', "const toIndex = (_q: string) => (location.hash = '#/essays');"),
};
const plugin = {
  name: 'remake',
  setup(b) {
    b.onResolve({ filter: /^\.\/reality$/ }, () => ({ path: path.join(here, 'reality-shim.ts') }));
    b.onLoad({ filter: /src[\\/]scripts[\\/](ave|toolstar)\.ts$/ }, (a) => {
      const rel = path.relative(root, a.path).split(path.sep).join('/');
      return { contents: patch[rel](fs.readFileSync(a.path, 'utf8')), loader: 'ts' };
    });
  },
};
await esbuild.build({
  entryPoints: [path.join(here, 'entry.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: path.join(here, '..', 'chrome.js'),
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [plugin],
  logLevel: 'warning',
});

/* ── CSS ── */
const styleOf = (f) => {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  const m = /<style is:global>([\s\S]*?)<\/style>/.exec(s);
  return `/* ── ${f} ── */\n${m[1]}`;
};
fs.writeFileSync(
  path.join(here, '..', 'chrome.css'),
  [
    '/* 生成物：chrome/build-chrome.mjs，别手改。原站的令牌与工具栏 / Ave 样式，原样 */',
    fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8'),
    styleOf('src/components/chrome/Toolstar.astro'),
    styleOf('src/components/chrome/Ave.astro'),
  ].join('\n'),
);

/* ── 标记 ── */
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
function grab(open, tag) {
  const i = html.indexOf(open);
  if (i < 0) throw new Error('找不到 ' + open);
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = i;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(i, m.index + m[0].length);
  }
  throw new Error('没闭合 ' + open);
}
const ROUTES = { '/': '#/', '/articles/': '#/essays', '/moments/': '#/moments', '/projects/': '#/projects' };
let ts = grab('<div class="ts" id="ts"', 'div').replace(/href="(\/[^"]*)"/g, (m, h) => (ROUTES[h] ? `href="${ROUTES[h]}"` : m));
// 双面字：三处的名字定为梦面（断章 / 闪念 / 造物），其余跟着原型的昼夜换（app.js 认 .mo）
const FIXED = new Set(['随笔', '瞬间', '项目']);
ts = ts
  .replace(/<a class="ts-item ts-ray" href="\/legacy\/thread\/"[^>]*>[\s\S]*?<\/a>/, '')
  .replace(/<span data-morph data-true="([^"]*)" data-dream="([^"]*)">[^<]*<\/span>/g, (m, w, d) =>
    FIXED.has(w) ? d : `<span class="mo" data-w="${w}" data-d="${d}">${w}</span>`);
const ave = grab('<aside id="ave"', 'aside');
fs.writeFileSync(path.join(here, '..', 'chrome.html'), ts + '\n' + ave + '\n');
console.log('chrome.js / chrome.css / chrome.html');
