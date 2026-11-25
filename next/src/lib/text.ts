/* 名录里用到的纯文本：统一字形（花体只留在条目自己的页里）、字数、首行 */

/** 名录里统一字形（NFKC）：𝔖𝔬 𝔉𝔞𝔫𝔠𝔶~ 这类只在它自己的页里花着 */
export const plain = (s = '') => s.normalize('NFKC');

/** 去掉站内语法与 markdown 记号，只留读得到的字；双面词取醒面 */
export function strip(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^:::.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\(\(([^)|]+)(\|[^)]*)?\)\)/g, '$1')
    .replace(/\{\{([^}|]+)(\|[^}]*)?\}\}/g, '$1')
    .replace(/[*_`>#|]/g, '');
}

/** 字数（与原型同一种数法：去掉空白与记号） */
export const chars = (md = '') => md.replace(/\s|[#*`>\-\[\]()|:{}]/g, '').length;
export const minutes = (n: number) => Math.max(1, Math.round(n / 400));

/** 第一行有字的那一行 */
export const firstLine = (md = '') => strip(md).split('\n').find((l) => l.trim())?.trim() ?? '';

export const pad = (n: number) => String(n).padStart(2, '0');
export const dot = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
