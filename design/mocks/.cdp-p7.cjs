// p7 验收截图（CDP 每页直连版）
// 用法：node .cdp-p7.cjs [筛选词]
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const OUT = path.join(__dirname, '.shots-p7');
const BASE = 'http://127.0.0.1:4317/p7-first-stitch.html';

const SPECS = [
  ['d0',        1440, 900,  'still=1&pin=0&debug=1', false],
  ['d35',       1440, 900,  'still=1&pin=0.35', false],
  ['d70',       1440, 900,  'still=1&pin=0.7', false],
  ['d100',      1440, 900,  'still=1&pin=1', false],
  ['d-projects',1440, 900,  'still=1&pin=secProjects', false],
  ['d-essays',  1440, 900,  'still=1&pin=secEssays', false],
  ['d-about',   1440, 900,  'still=1&pin=secAbout', false],
  ['d-lab',     1440, 900,  'still=1&pin=secLab', false],
  ['dtall',     1440, 900,  'still=1&pin=0', true],
  ['m0',        390,  844,  'still=1&pin=0&debug=1', false],
  ['m55',       390,  844,  'still=1&pin=0.55', false],
  ['m100',      390,  844,  'still=1&pin=1', false],
  ['mtall',     390,  844,  'still=1&pin=0', true],
];

function req(method, urlPath){
  return new Promise((resolve, reject) => {
    const r = http.request({host:'127.0.0.1', port:PORT, path:urlPath, method}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve(d)} });
    });
    r.on('error', reject); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws){ this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = ev => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)){ this.pending.get(m.id)(m); this.pending.delete(m.id); } }; }
  send(method, params = {}){
    return new Promise(resolve => { const id = ++this.id; this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close(){ this.ws.close(); }
}

(async () => {
  const profile = process.env.TEMP + '\\edge-p7-cdp-' + Date.now();
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ok = false;
  for (let i = 0; i < 40; i++){ try { await req('GET', '/json/version'); ok = true; break; } catch(_){ await sleep(250); } }
  if (!ok){ console.log('FAIL: no debug port'); process.exit(1); }

  const filter = process.argv[2] || '';
  for (const [name, W, H, query, fullPage] of SPECS){
    if (filter && !name.includes(filter)) continue;
    const page = await req('PUT', `/json/new?${encodeURIComponent('about:blank')}`);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source:
      `const s=document.createElement('style');s.textContent='::-webkit-scrollbar{display:none}html{scrollbar-width:none}';document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s));` });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `${BASE}?${query}&v=${Date.now()}` });

    let ready = false, tries = 0;
    while (!ready && tries < 50){
      await sleep(250); tries++;
      const r = await cdp.send('Runtime.evaluate', { expression:
        `document.readyState==='complete' && document.fonts.status==='loaded'`, returnByValue: true });
      ready = r.result && r.result.result && r.result.result.value === true;
    }
    await sleep(400);
    const diag = await cdp.send('Runtime.evaluate', { expression:
      `JSON.stringify({cls:document.documentElement.className,
        sy:Math.round(scrollY), sh:document.documentElement.scrollHeight,
        ih:innerHeight, iw:innerWidth, err:window.__swarmErr||'?'})`, returnByValue: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!fullPage });
    if (shot.result && shot.result.data){
      fs.writeFileSync(path.join(OUT, 'fs-' + name + '.png'), Buffer.from(shot.result.data, 'base64'));
      console.log('ok', name, diag.result && diag.result.result && diag.result.result.value);
    } else {
      console.log('FAIL', name, JSON.stringify(shot).slice(0, 200));
    }
    cdp.close();
    await sleep(150);
  }

  try { execFileSync('taskkill', ['/PID', edge.pid, '/T', '/F'], { stdio: 'ignore' }); } catch(_){}
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
