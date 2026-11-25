/* 旧站（漫游那一版）存成静态快照，挂在 /legacy/wander/ 下
   node next/scripts/legacy-snapshot.mjs   （先在仓库根目录 npm run build，读的是根目录的 dist/）
   → next/legacy/wander/（入库；next 构建时由 astro.config.mjs 的 legacy 集成原样拷进 dist，dev 时直接伺服）

   旧站里的站内路径都是从根写起的（/articles/、/_astro/…、主页判断用 `/`），这里一律加上前缀：
   · HTML / CSS / JS 里引号或 url( 后面紧跟的 /<旧站顶层目录> 与单独的 /
   · 例外：工具栏里按「/」键聚焦检索的判断（key===`/`）
   另外每页加 noindex、去掉 canonical，sitemap 不带。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../dist');
const OUT = path.resolve(here, '../legacy/wander');
const BASE = '/legacy/wander';

if (!fs.existsSync(path.join(SRC, 'index.html'))) throw new Error('先在仓库根目录 npm run build');
const TOP = fs.readdirSync(SRC).filter((n) => !/^sitemap/.test(n));
const seg = TOP.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// 引号 / url( 之后的 /<顶层目录>（后面跟 / . ? # 引号 括号 或结束），以及单独的 /（后面直接是引号）
const RE = new RegExp(`(["'\`]|url\\(\\s*["']?)/(?:(${seg})(?=[/?#"'\`)\\s]|$)|(?=["'\`?#]))`, 'g');

function rewrite(s) {
  return s.replace(RE, (m, lead, name, off, all) => {
    // key===`/`：那是按键，不是路径
    if (!name && all.slice(Math.max(0, off - 5), off) === 'key==') return m;
    return `${lead}${BASE}/${name ?? ''}`;
  });
}

const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.svg', '.webmanifest', '.txt']);
let n = 0;
fs.rmSync(OUT, { recursive: true, force: true });
(function walk(rel) {
  for (const name of fs.readdirSync(path.join(SRC, rel))) {
    const r = path.join(rel, name);
    if (!rel && (/^sitemap/.test(name) || name === 'robots.txt')) continue;
    const from = path.join(SRC, r), to = path.join(OUT, r);
    if (fs.statSync(from).isDirectory()) {
      walk(r);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const ext = path.extname(name).toLowerCase();
    if (!TEXT.has(ext)) {
      fs.copyFileSync(from, to);
      continue;
    }
    let s = rewrite(fs.readFileSync(from, 'utf8'));
    if (ext === '.html') {
      s = s.replace(/<link rel="canonical"[^>]*>/, '').replace('<head>', '<head><meta name="robots" content="noindex">');
    }
    fs.writeFileSync(to, s);
    n++;
  }
})('');
console.log(`legacy/wander：改写 ${n} 个文本文件 ← ${path.relative(process.cwd(), SRC)}`);
