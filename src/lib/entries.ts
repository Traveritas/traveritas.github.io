import { getCollection } from 'astro:content';

/* 三处：路径名 = 集合名；名字定为梦面那一个 */
export const SECS = {
  articles: { t: '断章', en: 'ESSAYS', ave: 'articles-enter' },
  moments: { t: '闪念', en: 'MOMENTS', ave: 'moments-enter' },
  projects: { t: '造物', en: 'PROJECTS', ave: 'projects-enter' },
} as const;
export type Sec = keyof typeof SECS;
export const ORDER: Sec[] = ['articles', 'moments', 'projects'];

/** 某一处的全部条目：新的在前（同一天按 id） */
export async function entriesOf<K extends Sec>(k: K) {
  const all = await getCollection(k, (e: { data: { draft?: boolean } }) => !e.data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || b.id.localeCompare(a.id));
}

/** 三处合在一起、拉平成一行一条（寻找 / 标签页用）：新的在前 */
export async function allEntries() {
  const { plain, firstLine, strip } = await import('./text');
  const out = [];
  for (const sec of ORDER) {
    for (const e of await entriesOf(sec)) {
      const d = e.data as { title?: string; description?: string; tags?: string[]; date: Date };
      out.push({
        sec,
        id: e.id,
        href: `/${sec}/${e.id}/`,
        title: plain(d.title || '') || firstLine(e.body ?? ''),
        desc: plain(d.description || ''),
        tags: d.tags ?? [],
        date: d.date,
        text: strip(e.body ?? '').replace(/\s+/g, ' '),
      });
    }
  }
  return out.sort((a, b) => b.date.valueOf() - a.date.valueOf() || a.id.localeCompare(b.id));
}
export type Flat = Awaited<ReturnType<typeof allEntries>>[number];
