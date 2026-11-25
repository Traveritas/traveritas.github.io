import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { twilight } from './src/markdown/twilight.mjs';
import { ordinal } from './src/markdown/ordinal.mjs';
import { xingmeng } from './src/markdown/shiki-theme.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* sitemap 的 lastmod：按 frontmatter 的 date 给（与旧站同一个做法）。配置里拿不到内容集合，直接读 md 头。
   详情页 = 该篇日期；目录页 = 该集合最新一篇；主页 = 全站最新一篇。草稿不计 */
function contentDates(collection) {
  const dir = path.join(fileURLToPath(new URL('./src/content', import.meta.url)), collection);
  const dates = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const full = path.join(dir, name);
    const file = fs.statSync(full).isDirectory() ? path.join(full, 'index.md') : full;
    if (!/\.mdx?$/.test(file) || !fs.existsSync(file)) continue;
    const head = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (/^draft:\s*true\s*$/m.test(head)) continue;
    const d = head.match(/^date:\s*['"]?([^'"\r\n]+)/m)?.[1];
    if (d && !Number.isNaN(Date.parse(d))) dates.set(name.replace(/\.mdx?$/, ''), new Date(d));
  }
  return dates;
}
const LASTMOD = new Map();
const allDates = [];
for (const c of ['articles', 'projects', 'moments']) {
  const dates = contentDates(c);
  if (!dates.size) continue;
  for (const [id, d] of dates) LASTMOD.set(`/${c}/${id}/`, d);
  LASTMOD.set(`/${c}/`, new Date(Math.max(...dates.values())));
  allDates.push(...dates.values());
}
if (allDates.length) LASTMOD.set('/', new Date(Math.max(...allDates)));

/* 旧站（漫游那一版）的静态快照：legacy/wander/ → /legacy/wander/（替换前由当时的 next/scripts/legacy-snapshot.mjs 生成，已定格）。
   不进 Astro 的路由：构建完原样拷进 dist，dev 时由这里直接伺服 */
const LEGACY = fileURLToPath(new URL('./legacy', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.opus': 'audio/ogg', '.xml': 'application/xml' };
const legacy = {
  name: 'legacy-snapshot',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        if (!url.startsWith('/legacy/')) return next();
        let f = path.join(LEGACY, url.slice('/legacy/'.length));
        if (!f.startsWith(LEGACY)) return next();
        if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
        if (!fs.existsSync(f)) return next();
        res.setHeader('content-type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(f).pipe(res);
      });
    },
    'astro:build:done': ({ dir }) => {
      fs.cpSync(LEGACY, path.join(fileURLToPath(dir), 'legacy'), { recursive: true });
    },
  },
};

export default defineConfig({
  site: 'https://traveritas.github.io',
  // 钉死 IPv4（Mihomo TUN 在位时 localhost 先解析到 ::1）
  server: { host: '127.0.0.1', port: 4321 },
  markdown: {
    // 醒梦两态正文语法与小节序号（docs/writing.md）
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [twilight, ordinal],
    }),
    shikiConfig: { theme: xingmeng },
  },
  integrations: [
    legacy,
    // 寻找页是工具页，不进 sitemap；/legacy/ 不走 Astro 的路由，本来就不在里面
    sitemap({
      filter: (page) => !/^\/find\//.test(new URL(page).pathname),
      serialize(item) {
        const d = LASTMOD.get(decodeURI(new URL(item.url).pathname));
        return d ? { ...item, lastmod: d.toISOString() } : item;
      },
    }),
  ],
  build: { format: 'directory' },
  // 根目录下还有 legacy/（上一版的打包产物）与 design/（几百个原型页）：Vite 预扫依赖与监视文件都只看 src/，
  // 不然它会把那些 HTML 当入口去爬，dev 起不来
  vite: {
    optimizeDeps: { entries: ['src/**/*.{astro,ts,js}'] },
    server: { watch: { ignored: ['**/legacy/**', '**/design/**', '**/archive/**', '**/docs/**', '**/.shots/**'] } },
  },
  // dev 时底部那条 Astro 工具栏会压在地面上，截图也会带上它
  devToolbar: { enabled: false },
  // 旧站的关于页早已换成 NEXUS 的门；/new 是更早的主页预览地址
  redirects: { '/about': '/gate/', '/new': '/' },
});
