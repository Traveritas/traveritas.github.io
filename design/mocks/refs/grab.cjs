/* 抓参考页正文（调研用，不装依赖）。
   node design/mocks/refs/grab.cjs <url> [maxChars]
   拽 HTML → 去 script/style/nav → 解实体 → 印纯文本；<pre> 里的内容原样保留。
   用途：web_fetch 端点在余额问题上挂了，用本机网络取源码。 */
const args = process.argv.slice(2);
const useChrome = args.includes('--chrome');
const rest = args.filter((a) => a !== '--chrome');
const url = rest[0];
const max = +(rest[1] || 60000);
if (!url) {
  console.error('用法: node design/mocks/refs/grab.cjs <url> [maxChars] [--chrome]');
  process.exit(1);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* --chrome：走本机 Chrome 的 --dump-dom，能拿到 JS 渲染后的正文（有的站 curl 只给空壳） */
const fetchWithChrome = (u) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-grab-'));
  return execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=9000',
      '--dump-dom',
      u,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
};

(async () => {
  let res = { ok: true, status: 200, text: () => Promise.resolve('') };
  let html;
  if (useChrome) {
    html = fetchWithChrome(url);
  } else {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
    html = await res.text();
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  // <pre> / <code> 保留结构，其余标签清掉
  html = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/(p|div|li|h[1-6]|pre|tr)>/gi, '\n');
  html = html.replace(/<[^>]+>/g, '');
  const text = decode(html)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  console.log(`# ${url}  (HTTP ${res.status}, ${text.length} chars)`);
  console.log(text.slice(0, max));
})();
