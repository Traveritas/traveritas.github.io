/* 极简 Markdown → HTML（原型用）：标题（自动序号）/ 段落 / 列表 / 引用 / 代码块 / 图 / 链接 / 粗斜体 / 行内码
   站内写法：[[醒|梦]] → 双面词；:::wake / :::dream 块 → 只在那一面出现；((x)) {{x}} 光景 → 只留字 */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '<span class="mo" data-w="$1" data-d="$2">$1</span>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\(\(([^)|]+)(\|[^)]*)?\)\)/g, '$1').replace(/\{\{([^}|]+)(\|[^}]*)?\}\}/g, '$1');
  return s;
}

export function md(src) {
  const L = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0, h2 = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^:::(wake|dream)\s*$/.exec(l))) {
      const face = m[1], buf = [];
      i++;
      while (i < L.length && !/^:::\s*$/.test(L[i])) buf.push(L[i++]);
      i++;
      out.push(`<div class="face-${face}">${md(buf.join('\n'))}</div>`);
      continue;
    }
    if (/^:::/.test(l)) { i++; continue; }
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{2,4})\s+(.*)$/.exec(l))) {
      const n = m[1].length;
      const num = n === 2 ? `<span class="ord">${String(++h2).padStart(2, '0')}</span>` : '';
      out.push(`<h${n}>${num}${inline(m[2])}</h${n}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < L.length && /^>\s?/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < L.length && /^\s*([-*]|\d+\.)\s+/.test(L[i])) {
        const sub = /^\s{2,}/.test(L[i]);
        items.push(`<li${sub ? ' class="sub"' : ''}>${inline(L[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push(`<table>${body.map((r, k) => `<tr>${cells(r).map((c) => (k ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table>`);
      continue;
    }
    const buf = [];
    while (i < L.length && L[i].trim() && !/^(#{2,4}\s|```|:::|>|\s*([-*]|\d+\.)\s+|\|)/.test(L[i])) buf.push(L[i++]);
    out.push(`<p>${inline(buf.join(''))}</p>`);
  }
  return out.join('\n');
}
