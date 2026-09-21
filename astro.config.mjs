import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { twilight } from './src/markdown/twilight.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://traveritas.github.io',
  integrations: [sitemap()],
  markdown: {
    // 醒梦两态正文语法（:::dream/:::wake 块、[[醒|梦]] 行内），见 docs/writing.md
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [twilight],
    }),
  },
  build: { format: 'directory' },
});
