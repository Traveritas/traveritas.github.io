/* 摘要回退：frontmatter 没写 description 时，从正文开头取一段纯文本。
   只取醒面：[[醒|梦]] 取醒、:::dream 块整段略过；行内光景 ((…)) / {{…}} 去掉参数留字。
   用在 <meta name="description"> 与 RSS，不用在目录行（目录行没写描述就不显示）。 */

export function excerpt(md: string, max = 90): string {
  const text = md
    .replace(/^```[\s\S]*?^```/gm, '') // 代码块
    .replace(/^:::dream[\s\S]*?^:::\s*$/gm, '') // 梦面块
    .replace(/^:::\w*\s*$/gm, '') // 其余块的围栏行
    .replace(/<[^>]+>/g, '') // 原始 HTML
    .replace(/\[\[([^|\]]*)\|[^\]]*\]\]/g, '$1') // [[醒|梦]]
    .replace(/\(\(([^|)]*)(?:\|[^)]*)?\)\)/g, '$1') // ((浮起|参数))
    .replace(/\{\{([^|}]*)(?:\|[^}]*)?\}\}/g, '$1') // {{流光|参数}}
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接
    .replace(/^\s*\|.*\|\s*$/gm, '') // 表格行
    .replace(/^#{1,6}\s+.*$/gm, '') // 标题不进摘要
    .replace(/^\s*(?:>|[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, '') // 引用 / 列表记号
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() + '…' : text;
}
