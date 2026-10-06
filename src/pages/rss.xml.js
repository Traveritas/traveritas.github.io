import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { excerpt } from '../lib/excerpt';

export async function GET(context) {
  const articles = (await getCollection('articles', (a) => !a.data.draft))
    .map(({ id, body, data }) => ({ id, body, ...data }))
    .sort((a, b) => b.date.valueOf() - a.date.valueOf() || b.id.localeCompare(a.id));

  return rss({
    title: 'Traveritas 的随笔',
    description: '随笔、项目，与一些尚在成形的东西。',
    site: context.site,
    items: articles.map((a) => ({
      title: a.title,
      description: a.description ?? excerpt(a.body ?? ''),
      pubDate: a.date,
      link: `/articles/${a.id}/`,
    })),
    customData: '<language>zh-CN</language>',
  });
}
