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
    status: z.enum(['构想中', '进行中', '已完成']).default('进行中'),
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
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles, projects, moments };
