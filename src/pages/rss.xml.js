import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const articles = (await getCollection('articles', (a) => !a.data.draft))
    .map(({ id, data }) => ({ id, ...data }))
    .sort((a, b) => b.date.valueOf() - a.date.valueOf());

  return rss({
    title: 'Traveritas 的随笔',
    description: '随笔、项目，与一些尚在成形的东西。',
    site: context.site,
    items: articles.map((a) => ({
      title: a.title,
      description: a.description,
      pubDate: a.date,
      link: `/articles/${a.id}/`,
    })),
    customData: '<language>zh-CN</language>',
  });
}
