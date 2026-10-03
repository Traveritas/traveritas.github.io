/* 瞬间原型的共用数据：真实断简 + 演示配图（只在 /mock/ 里挂上，真实内容不动）。
   配图张数按断简顺序（新→旧）铺开 1 / 2 / 0 / 3 / 4 / 0 / 9 / 1，覆盖网格的每种排法。 */
import { getCollection, render } from 'astro:content';
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../../assets/mock-moments/*.jpg', { eager: true });
const pics = Object.keys(files)
  .sort()
  .map((k) => files[k].default);

const PLAN = [[0], [1, 2], [], [3, 4, 5], [6, 7, 8, 9], [], [0, 1, 2, 3, 4, 5, 6, 7, 8], [9]];

export async function demoMoments() {
  const entries = (await getCollection('moments', (m) => !m.data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf() || b.id.localeCompare(a.id)
  );
  return Promise.all(
    entries.map(async (m, i) => ({
      id: m.id,
      title: m.data.title,
      date: m.data.date,
      images: m.data.images.length ? m.data.images : (PLAN[i] ?? []).map((k) => pics[k]),
      Content: (await render(m)).Content,
      /* 远近：最新 0 → 最旧 1 */
      age: entries.length > 1 ? i / (entries.length - 1) : 0,
    }))
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
export const md = (d: Date) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
export const full = (d: Date) => `${d.getFullYear()}.${md(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
