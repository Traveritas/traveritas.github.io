// p9-s-plainnight 截图自验收 + 冒烟：四视图桌面 / 文章页中滚 / 移动三张 / reduced 一张
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p9-s-plainnight.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p9-s';
const PORT = 9795; // 独占端口
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SHOTS = [
  { n: 'p9s-d-articles',      u: '#/articles' },
  { n: 'p9s-d-article',       u: '#/articles/motif-exploration-log' },
  { n: 'p9s-d-article-mid',   u: '?view=article&slug=motif-exploration-log&scroll=0.55' },
  { n: 'p9s-d-projects',      u: '#/projects' },
  { n: 'p9s-d-project-01',    u: '#/projects/personal-website' },
  { n: 'p9s-d-project-01b',   u: '?view=project&slug=personal-website&scroll=0.9' },
  { n: 'p9s-d-project-02',    u: '#/projects/xingmeng-visual-motifs' },
  { n: 'p9s-d-project-02b',   u: '?view=project&slug=xingmeng-visual-motifs&scroll=0.9' },
  { n: 'p9s-d-project-02m',   u: '?view=project&slug=xingmeng-visual-motifs&scroll=0.62' },
  { n: 'p9s-m-articles',      u: '#/articles',  vw: 390, vh: 844, mobile: true },
  { n: 'p9s-m-article',       u: '#/articles/motif-exploration-log', vw: 390, vh: 844, mobile: true },
  { n: 'p9s-m-projects',      u: '#/projects',  vw: 390, vh: 844, mobile: true },
  { n: 'p9s-rm-article',      u: '?view=article&slug=hello-xingmeng&reduced=1' },
];
// 冒烟：hash 往返 / 列表行进详情 / 醒来卡导航 / 互链跳转 / aria-current 联动
const SMOKE = [
  { n: 'boot→articles',        act: `location.hash='#/articles'`,                exp: s => s.view === 'articles' && s.nav === '随笔' },
  { n: 'articles→article',     act: `location.hash='#/articles/motif-exploration-log'`, exp: s => s.view === 'article' && s.slug === 'motif-exploration-log' && s.nav === '随笔' },
  { n: 'wake-prev(较早)',      act: `document.getElementById('arPrev').click()`, exp: s => s.view === 'article' && s.slug === 'building-with-agents' },
  { n: 'wake-next(较晚)',      act: `document.getElementById('arNext').click()`, exp: s => s.view === 'article' && s.slug === 'motif-exploration-log' },
  { n: 'article→projects',     act: `location.hash='#/projects'`,                exp: s => s.view === 'projects' && s.nav === '项目' },
  { n: '列表行→详情',          act: `document.querySelector('#view-projects .prj-ledger a').click()`, exp: s => s.view === 'project' && s.slug === 'personal-website' && s.nav === '项目' },
  { n: '另一项链接',           act: `document.getElementById('pjNextLink').click()`, exp: s => s.view === 'project' && s.slug === 'xingmeng-visual-motifs' },
  { n: '互链:项目→文章',       act: `document.querySelector('#pjXfile a').click()`, exp: s => s.view === 'article' && s.slug === 'motif-exploration-log' && s.nav === '随笔' },
  { n: '互链:文章→项目',       act: `document.getElementById('arXlink').click()`, exp: s => s.view === 'project' && s.slug === 'xingmeng-visual-motifs' && s.nav === '项目' },
  { n: '头部导航回随笔',       act: `document.querySelector('.site-nav a[data-nav="articles"]').click()`, exp: s => s.view === 'articles' && s.nav === '随笔' },
  { n: 'hash往返回项目',       act: `location.hash='#/projects';location.hash='#/projects/personal-website'`, exp: s => s.view === 'project' && s.slug === 'personal-website' },
  { n: '全页无横溢/无报错',    act: `location.hash='#/articles'`,                exp: s => !s.overflowX && s.err === 'none' },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.p9s-prof'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result && r.result.result.value;
  };
  console.log('── screenshots ──');
  for (const s of SHOTS) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + s.u });
    await sleep(2800);
    await sleep(1200);
    const st = await evalJs('(window.__p9s&&__p9s.state())+" err="+(window.__swarmErr||"none")');
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st);
  }
  console.log('── smoke ──');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '#/articles' });
  await sleep(2200);
  let fails = 0;
  for (const sm of SMOKE) {
    await evalJs(sm.act);
    await sleep(700);
    const raw = await evalJs('window.__p9s&&__p9s.state()');
    let ok = false, got = raw;
    try { const s = JSON.parse(raw); ok = sm.exp(s); got = 'view=' + s.view + ' slug=' + s.slug + ' nav=' + s.nav + ' ovf=' + s.overflowX + ' err=' + s.err; } catch (e) {}
    if (!ok) fails++;
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + sm.n + ' | ' + got);
  }
  console.log(fails ? ('SMOKE FAILURES: ' + fails) : 'SMOKE ALL PASS');
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.p9s-prof'), { recursive: true, force: true }); } catch (e) {}
})();
