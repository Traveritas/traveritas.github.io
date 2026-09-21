#!/usr/bin/env node
/* 新随笔脚手架：npm run new:article -- "标题" [slug]
   创建 src/content/articles/yyyy-mm-dd-slug.md（默认 draft，写完自行改 false）。 */

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [title, slugArg] = process.argv.slice(2);
if (!title) {
  console.error('用法：npm run new:article -- "标题" [slug]');
  process.exit(1);
}

const now = new Date();
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
// 中文标题 slug 化后为空 → 落到时分保底；显式传 slug 可避免
const slug =
  slugArg ||
  slugify(title) ||
  `w${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

const file = resolve(`src/content/articles/${date}-${slug}.md`);
if (existsSync(file)) {
  console.error(`已存在，未动：${file}`);
  process.exit(1);
}

writeFileSync(
  file,
  `---
title: ${title}
date: ${date}
tags: []
draft: true
---

<!-- 两态速查（删我）：行内换字 [[醒|梦]]；块级换段
:::dream
只在梦面的段落
:::
:::wake
只在醒面的段落
:::
手册：docs/writing.md -->
`,
);

console.log(`已创建 ${file}`);
console.log('两态语法：行内 [[醒|梦]]，块 :::dream…::: / :::wake…::: —— 手册 docs/writing.md');
