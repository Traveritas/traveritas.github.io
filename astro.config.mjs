import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { twilight } from './src/markdown/twilight.mjs';
import { xingmeng } from './src/markdown/shiki-theme.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://traveritas.github.io',
  integrations: [
    // 样式预览（/styleguide/）是工作台不是内容页：不进 sitemap（robots.txt 同档禁收）
    sitemap({ filter: (page) => !page.includes('/styleguide') }),
  ],
  markdown: {
    // 醒梦两态正文语法（:::dream/:::wake 块、[[醒|梦]] 行内），见 docs/writing.md
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [twilight],
    }),
    // 代码配色自己写：默认的 github-dark 会用行内样式把代码块压成深色板，
    // 且盖掉 .md pre 的底色。详见 src/markdown/shiki-theme.mjs
    shikiConfig: { theme: xingmeng },
  },
  build: { format: 'directory' },
});
