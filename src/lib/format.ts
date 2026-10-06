/* 几个页面共用的小格式化：日期、八阶成形、字数。构建期用，不进客户端。 */

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026.09.28 */
export const fmtDate = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

/** 八阶成形 / 浮现度：frontmatter 写了 depth 就用它，否则按状态取 2 / 5 / 8 */
export const depthOf = (status: string, depth?: number) =>
  depth ?? ({ 构想中: 2, 进行中: 5, 已完成: 8 } as Record<string, number>)[status] ?? 5;

/** 字数：剥掉 markdown 语法后按非空白字符计 */
export function countChars(md: string): number {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\s+/g, '').length;
}
