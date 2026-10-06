import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getCollection, render } from 'astro:content';
import { excerpt } from '../lib/excerpt';

/* 阅读器里没有 CSS，也没有长按换面：只给醒面。
   :::dream 块整块去掉（块内可能还有 div，按层数配对）；[[醒|梦]] 本来就只把醒面写进正文。 */
function wakeOnly(html: string): string {
  const open = '<div data-side="dream">';
  let out = '';
  let i = 0;
  for (;;) {
    const start = html.indexOf(open, i);
    if (start < 0) return out + html.slice(i);
    out += html.slice(i, start);
    let depth = 0;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = start;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(html))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) break;
    }
    i = m ? tag.lastIndex : html.length;
  }
}

/* 站内的 /… 链接与图片在阅读器里要写成绝对地址 */
const absolutize = (html: string, site: URL) =>
  html.replace(/(\s(?:href|src))="\/(?!\/)/g, `$1="${new URL('/', site).href}`);

export async function GET(context: APIContext) {
  const site = context.site!;
  const container = await AstroContainer.create();
  const articles = (await getCollection('articles', (a) => !a.data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf() || b.id.localeCompare(a.id),
  );

  const items = await Promise.all(
    articles.map(async (a) => {
      const { Content } = await render(a);
      const html = await container.renderToString(Content);
      return {
        title: a.data.title,
        description: a.data.description ?? excerpt(a.body ?? ''),
        content: absolutize(wakeOnly(html), site),
        pubDate: a.data.date,
        link: `/articles/${a.id}/`,
      };
    }),
  );

  return rss({
    title: 'Traveritas 的随笔',
    description: '随笔、项目，与一些尚在成形的东西。',
    site,
    items,
    customData: '<language>zh-CN</language>',
  });
}
