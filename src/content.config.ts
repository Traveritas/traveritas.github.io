import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* 标签进 URL（/tags/<标签>/）：不许斜杠与空白 */
const tag = z.string().regex(/^[^/\s]+$/, '标签里不能有斜杠或空白');
/* 链接只认 http(s) 与站内绝对路径：zod 的 .url() 会放行 javascript: */
const href = z.string().regex(/^(https?:\/\/|\/(?!\/))/, '链接须以 http(s):// 或站内路径 / 开头');
const webUrl = z.string().regex(/^https?:\/\/\S+$/, '链接须以 http(s):// 开头');

const articles = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(tag).default([]),
    draft: z.boolean().default(false),
    // 跨页互链（文末「关联篇章」）：站内路径或外链
    related: z.array(z.object({ label: z.string(), href })).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    status: z.string().default('进行中'),
    links: z.array(z.object({ label: z.string(), href: webUrl })).default([]),
    draft: z.boolean().default(false),
    related: z.array(z.object({ label: z.string(), href })).default([]),
    // 深眠注记（素夜：项目页尾的琥珀左边注，醒/梦双声轨）
    note: z.object({ awake: z.string(), dream: z.string() }).optional(),
  }),
});

const moments = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/moments' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().optional(),
      date: z.coerce.date(),
      tags: z.array(tag).default([]),
      draft: z.boolean().default(false),
      // 配图 1–9 张：相对本文件的路径，或 { src, alt }；构建期由 astro:assets 出缩略与大图
      images: z
        .array(z.union([image(), z.object({ src: image(), alt: z.string().default('') })]))
        .max(9)
        .default([]),
    }),
});

export const collections = { articles, projects, moments };
