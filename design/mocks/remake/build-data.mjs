/* 把 src/content 的三类内容读成 data.json（原型用，不进构建）
   node design/mocks/remake/build-data.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const C = path.join(root, 'src/content');

function read(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  return m ? { fm: YAML.parse(m[1]) || {}, body: m[2] } : { fm: {}, body: raw };
}
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const urlOf = (abs) => '/' + path.relative(root, abs).split(path.sep).join('/');

function collect(dir) {
  const out = [];
  for (const name of fs.readdirSync(path.join(C, dir))) {
    if (name.startsWith('_')) continue;
    const p = path.join(C, dir, name);
    const file = fs.statSync(p).isDirectory() ? path.join(p, 'index.md') : p;
    if (!file.endsWith('.md') || !fs.existsSync(file)) continue;
    const { fm, body } = read(file);
    if (fm.draft) continue;
    const slug = name.replace(/\.md$/, '');
    const base = path.dirname(file);
    const fix = (s) => (s.startsWith('./') || !s.startsWith('/') ? urlOf(path.resolve(base, s)) : s);
    out.push({
      slug,
      title: fm.title || '',
      description: fm.description || '',
      date: iso(fm.date),
      tags: fm.tags || [],
      status: fm.status || '',
      links: fm.links || [],
      ave: typeof fm.ave === 'string' ? { text: fm.ave } : fm.ave || null,
      images: (fm.images || []).map((im) => (typeof im === 'string' ? { src: fix(im), alt: '' } : { src: fix(im.src), alt: im.alt || '' })),
      body: body.replace(/!\[([^\]]*)\]\((\.\/[^)]+)\)/g, (_, a, s) => `![${a}](${fix(s)})`),
      chars: body.replace(/\s|[#*`>\-\[\]()|:{}]/g, '').length,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const { AVE_LINES } = await import('../../../src/data/ave-lines.ts');
const data = { essays: collect('articles'), moments: collect('moments'), projects: collect('projects'), ave: AVE_LINES };
fs.writeFileSync(path.join(here, 'data.json'), JSON.stringify(data));
console.log(Object.entries(data).map(([k, v]) => `${k} ${v.length}`).join(' · '));
