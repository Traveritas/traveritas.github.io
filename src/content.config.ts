import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // 跨页互链（素夜：文末「关联篇章」）；href 为站内路径，不做 url 校验
    related: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    status: z.string().default('进行中'),
    depth: z.number().int().min(1).max(8).optional(),
    cover: z.string().url().optional(),
    links: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
    draft: z.boolean().default(false),
    related: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
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
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      // 配图 1–9 张：相对本文件的路径，或 { src, alt }；构建期由 astro:assets 出缩略与大图
      images: z
        .array(z.union([image(), z.object({ src: image(), alt: z.string().default('') })]))
        .max(9)
        .default([]),
    }),
});

export const collections = { articles, projects, moments };
