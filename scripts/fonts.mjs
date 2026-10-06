#!/usr/bin/env node
/* 正文字体自切：npm run fonts（dev / build 前自动跑）
   ─────────────────────────────────────────────────────────────
   Noto Serif SC 全字库每个字重上万字形；本站实际只用一千多个字。
   这里按站内源码的实际用字，从 Google Fonts 的可变字体里切出 500 / 600 两个字重，
   再按常用程度分成几包，每包写一条带 unicode-range 的 @font-face：
   页面只下载自己用得到的那几包。

   · 用字：扫 src/ 下全部源码与内容（含注释——多收几百个冷僻字只会落进很少被下载的尾包，
     换来的是「运行时冒出来的字」不会漏：乱码字池、梦面文案、标题推导都写在源码里）。
   · 排序：每页都有的公共部分（布局、全站仪器层、页头页脚、客户端脚本）里的字最先，
     其余按「出现在多少个文件里」由多到少；排序只看注释以外的文字。拉丁字符与标点一律进核心包。
   · 产物：public/fonts/noto-serif-sc/（不进仓库），BaseLayout 用 <link> 引 font.css。
   · 用字与参数都没变时直接跳过；源字体缓存在 .cache/fonts/，首次运行时下载并校验 sha256。
   ───────────────────────────────────────────────────────────── */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import subsetFont from 'subset-font';

const SOURCE = {
  file: '.cache/fonts/NotoSerifSC[wght].ttf',
  // google/fonts 钉在一个提交上：与 @fontsource/noto-serif-sc 同源（它也是从这份可变字体切出来的）
  url: 'https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
  sha256: '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
};
const WEIGHTS = [500, 600];
const CORE_CJK = 360; // 核心包里放多少个最常用的非拉丁字
const CHUNK = 300; // 其余每包多少字
const OUT_DIR = 'public/fonts/noto-serif-sc';
const SCAN = ['src'];
const SCAN_EXT = /\.(astro|md|mdx|ts|mjs|js|css|json)$/;
/* 每页都会渲染的公共部分：这里的字排在最前，进核心包 */
const SHARED = ['src/layouts', 'src/components/chrome', 'src/components/SiteHeader.astro', 'src/components/SiteFooter.astro', 'src/scripts'];
const VERSION = 3; // 改了切法就加一，强制重切

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function ensureSource() {
  if (existsSync(SOURCE.file) && sha256(readFileSync(SOURCE.file)) === SOURCE.sha256) return;
  console.log('[fonts] 下载源字体 Noto Serif SC（约 25MB，只在首次）…');
  const res = await fetch(SOURCE.url);
  if (!res.ok) throw new Error(`[fonts] 下载失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== SOURCE.sha256) throw new Error('[fonts] 源字体校验不符（sha256），拒绝使用');
  mkdirSync('.cache/fonts', { recursive: true });
  writeFileSync(SOURCE.file, buf);
}

/** 去掉代码注释：只用于排序，收字仍收全文 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const isShared = (p) => {
  const rel = relative('.', p).split(sep).join('/');
  return SHARED.some((d) => rel === d || rel.startsWith(d + '/'));
};

/** 每个字 → 排序分：在公共部分（注释以外）出现过的加一大截，其余按出现的文件数累加 */
function collectChars() {
  const score = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (SCAN_EXT.test(name)) {
        const text = readFileSync(p, 'utf8');
        const visible = new Set(/\.mdx?$/.test(name) ? text : stripComments(text));
        const bonus = isShared(p) ? 1000 : 1;
        for (const ch of new Set(text)) {
          const cp = ch.codePointAt(0);
          if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue; // 控制字符
          score.set(ch, (score.get(ch) ?? 0) + (visible.has(ch) ? bonus : 0));
        }
      }
    }
  };
  for (const d of SCAN) walk(d);
  // ASCII 可见字符始终全收：日期、数字、英文都走这套字体
  for (let cp = 0x20; cp < 0x7f; cp++) score.set(String.fromCodePoint(cp), Infinity);
  return score;
}

/* 拉丁字符与全部标点 / 全角符号一律进核心包：浏览器把每个分包当作一款独立字体，
   相邻两字落在不同分包里时，标点挤压（chws，Chrome 的 text-spacing-trim 靠它）就不会跨包生效 */
const isCore = (ch) => {
  const cp = ch.codePointAt(0);
  return cp < 0x2e80 || (cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xfe10 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xffef);
};

function chunk(df) {
  const ranked = [...df].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0)).map(([ch]) => ch);
  const core = ranked.filter(isCore);
  const rest = ranked.filter((ch) => !isCore(ch));
  const chunks = [[...core, ...rest.slice(0, CORE_CJK)]];
  for (let i = CORE_CJK; i < rest.length; i += CHUNK) chunks.push(rest.slice(i, i + CHUNK));
  return chunks;
}

/** 码点 → 紧凑的 unicode-range（相邻的并成区间） */
function unicodeRange(chars) {
  const cps = [...new Set(chars.map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const hex = (n) => n.toString(16).toUpperCase();
    parts.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j + 1;
  }
  return parts.join(', ');
}

async function main() {
  const df = collectChars();
  const chunks = chunk(df);
  const key = sha256(JSON.stringify({ VERSION, WEIGHTS, CORE_CJK, CHUNK, sha: SOURCE.sha256, chunks }));
  const stamp = join(OUT_DIR, '.key');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === key) {
    console.log(`[fonts] 用字未变（${df.size} 字），跳过`);
    return;
  }

  await ensureSource();
  const src = readFileSync(SOURCE.file);
  const t0 = Date.now();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const css = [
    '/* 由 scripts/fonts.mjs 生成，勿手改。Noto Serif SC（SIL OFL 1.1）按站内用字切分。 */',
  ];
  let total = 0;
  for (const weight of WEIGHTS) {
    for (const [i, chars] of chunks.entries()) {
      const woff2 = await subsetFont(src, chars.join(''), { targetFormat: 'woff2', variationAxes: { wght: weight } });
      const name = `${weight}-${i}.${sha256(woff2).slice(0, 8)}.woff2`;
      writeFileSync(join(OUT_DIR, name), woff2);
      total += woff2.length;
      css.push(
        `@font-face {\n  font-family: 'Noto Serif SC';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n` +
          `  src: url('./${name}') format('woff2');\n  unicode-range: ${unicodeRange(chars)};\n}`,
      );
    }
  }
  writeFileSync(join(OUT_DIR, 'font.css'), css.join('\n\n') + '\n');
  writeFileSync(stamp, key);
  console.log(
    `[fonts] ${df.size} 字 → ${WEIGHTS.length} 个字重 × ${chunks.length} 包，共 ${Math.round(total / 1024)}KB，` +
      `用时 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${relative('.', OUT_DIR)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
