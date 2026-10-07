import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { twilight } from './src/markdown/twilight.mjs';
import { ordinal } from './src/markdown/ordinal.mjs';
import { xingmeng } from './src/markdown/shiki-theme.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* sitemap 的 lastmod：按 frontmatter 的 date 给。配置文件里拿不到内容集合，直接读 md 头。
   详情页 = 该篇日期；目录页 = 该集合最新一篇；主页 = 全站最新一篇。草稿不计。 */
function contentDates(collection) {
  const dir = join('src/content', collection);
  const dates = new Map();
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const full = join(dir, name);
    const file = statSync(full).isDirectory() ? join(full, 'index.md') : full;
    if (!/\.mdx?$/.test(file)) continue;
    let head = '';
    try {
      head = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    } catch {
      continue;
    }
    if (/^draft:\s*true\s*$/m.test(head)) continue;
    const d = head.match(/^date:\s*['"]?([^'"\r\n]+)/m)?.[1];
    if (d && !Number.isNaN(Date.parse(d))) dates.set(name.replace(/\.mdx?$/, ''), new Date(d));
  }
  return dates;
}

const newest = (dates) => new Date(Math.max(...dates));
const LASTMOD = new Map();
const allDates = [];
for (const c of ['articles', 'projects', 'moments']) {
  const dates = contentDates(c);
  if (!dates.size) continue;
  if (c !== 'moments') for (const [id, d] of dates) LASTMOD.set(`/${c}/${id}/`, d);
  LASTMOD.set(`/${c}/`, newest(dates.values()));
  allDates.push(...dates.values());
}
if (allDates.length) LASTMOD.set('/', newest(allDates));

// https://astro.build/config
export default defineConfig({
  site: 'https://traveritas.github.io',
  // 钉死 IPv4：不设 host 时 dev server 按 dns.lookup('localhost') 的第一个结果绑定，
  // Mihomo TUN 网卡在位时系统把 ::1 排在前面 → 只绑 IPv6 loopback，浏览器打开
  // 打印出来的 http://localhost:4321 直接 ERR_CONNECTION_REFUSED（petween-desktop 同款坑）。
  server: { host: '127.0.0.1' },
  integrations: [
    // 样式预览（/styleguide/）是工作台不是内容页：不进 sitemap（robots.txt 同档禁收）
    // /new/ 是新主页预览期的旧址（现已跳转到 /）：同样不进 sitemap、robots 禁收
    // 按整段路径匹配：裸 includes('/new') 会误伤 /tags/newsletter/ 这类页面
    sitemap({
      filter: (page) => !/^\/(styleguide|new)\//.test(new URL(page).pathname),
      serialize(item) {
        const d = LASTMOD.get(decodeURI(new URL(item.url).pathname));
        return d ? { ...item, lastmod: d.toISOString() } : item;
      },
    }),
  ],
  markdown: {
    // 醒梦两态正文语法（:::dream/:::wake 块、[[醒|梦]] 行内），见 docs/writing.md
    // + 小节序号：h2 的「定格漂浮」序号在构建期注入（醒梦共用同一套数字，梦面逐枚定格漂浮、醒面不动），
    //   见 src/markdown/ordinal.mjs 与 docs/design/content-typography.md —— 内容页因此仍然零客户端 JS
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [twilight, ordinal],
    }),
    // 代码配色自己写：默认的 github-dark 会用行内样式把代码块压成深色板，
    // 且盖掉 .md pre 的底色。详见 src/markdown/shiki-theme.mjs
    shikiConfig: { theme: xingmeng },
  },
  // 新主页预览期的地址：外面若还留着这个链接，跳回首页
  redirects: { '/new': '/' },
  build: { format: 'directory' },
});
