/* 几个页面共用的小格式化：日期、字数。构建期用，不进客户端。 */

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026.09.28 */
export const fmtDate = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

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
