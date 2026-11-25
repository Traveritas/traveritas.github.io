/* ─────────────────────────────────────────────────────────────
   随笔 / 项目 / 瞬间自带的 Ave 台词：frontmatter 里写 ave:，读到这一篇时她说这一句；不写就不说。
   「读到」有两处：首页 / 目录页的漫游里点开、窗长大成阅读形态（主要的那处）；
   以及随笔 / 项目自己那一整页（瞬间没有单独的页）。

     ave: 哇，这里怪热闹的欸？

   或者写全（都可省，只有 text 必填）：

     ave:
       text: 这边很安静。
       dream: 梦态换一句
       face: smile          # 同 src/data/ave-lines.ts 的 AveFace
       mood: soft           # 引擎语调，同 AveMood
       after: 4             # 读到之后几秒（默认 3：阅读形态从窗长大算，整页从开屏面纱打开算）
       at: .md h2           # 贴着哪个元素说

   id = page:<集合>/<条目 id>，声音和「说过没有」都挂在它上面。
   Ave.astro 在构建时把所有条目的这一句收齐、内联进每一页，键是 <集合>/<条目 id>。
   design/ave-voice/render.mjs 扫同样的文件、用同样的 id 预渲染声音（改完跑 npm run ave）。
   ───────────────────────────────────────────────────────────── */

import { z } from 'astro:content';
import type { AveFace, AveMood } from '../data/ave-lines';

const MOODS = ['natural', 'bright', 'curious', 'soft', 'inquiring', 'delighted', 'musing', 'playful', 'wondering'] as const satisfies readonly AveMood[];
const FACES = ['smile', 'happy', 'beam', 'surprised', 'shy', 'hurt', 'sulk', 'yawn'] as const satisfies readonly AveFace[];

/** content.config.ts 里用的 frontmatter 字段 */
export const aveField = z
  .union([
    z.string().min(1),
    z.object({
      text: z.string().min(1),
      dream: z.string().optional(),
      face: z.enum(FACES).optional(),
      mood: z.enum(MOODS).optional(),
      after: z.number().min(0).optional(),
      at: z.string().optional(),
    }),
  ])
  .optional();

/** frontmatter 里 ave: 的两种写法 */
type AveField = string | Omit<AvePageLine, 'id'> | undefined;

export interface AvePageLine {
  id: string;
  text: string;
  dream?: string;
  face?: AveFace;
  mood?: AveMood;
  after?: number;
  at?: string;
}

/** frontmatter 的 ave → 一句台词；没写就是 null */
export function avePageLine(collection: string, entryId: string, ave: AveField): AvePageLine | null {
  if (!ave) return null;
  const line = typeof ave === 'string' ? { text: ave } : ave;
  return { id: `page:${collection}/${entryId}`, ...line };
}
