// tune/f-form-depth 截图验收：桌面各夜段 + 移动端 + 减动效 + 全页 + 控制台错误收集
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4326/';
const OUT = path.join(__dirname, '_shots-tune');
const PORT = 9786;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SCROLL = (sel) => `(()=>{scrollTo({top:document.querySelector('${sel}').getBoundingClientRect().top+scrollY+40,behavior:'instant'});return 'ok'})()`;
const STATE = `JSON.stringify({y:Math.round(scrollY),stage:document.body.dataset.stage||'none',bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),rings:document.getElementById('rings-canvas')?.dataset.loaded||'-',slip:document.getElementById('slip-canvas')?.dataset.loaded||'-',errs:(window.__errs||[]).join(' | ')||'none'})`;
const SHOTS = [
  { n: 'f-top', to: 'top', wait: 3200 },
  { n: 'f-essays', to: SCROLL('#ns-essays'), wait: 4200 },
  { n: 'f-projects', to: SCROLL('#ns-projects'), wait: 4600 },
  { n: 'f-rem', to: SCROLL('#ns-rem'), wait: 4600 },
  { n: 'f-dawn', to: `(()=>{scrollTo({top:9e6,behavior:'instant'});return 'ok'})()`, wait: 4200 },
  { n: 'f-full', to: 'top', full: true, wait: 5200 },
  { n: 'f-m-top', to: 'top', vw: 390, vh: 844, mobile: true, wait: 3200 },
  { n: 'f-m-essays', to: SCROLL('#ns-essays'), vw: 390, vh: 844, mobile: true, wait: 4200 },
  { n: 'f-m-rem', to: SCROLL('#ns-rem'), vw: 390, vh: 844, mobile: true, wait: 4600 },
  { n: 'f-m-dawn', to: `(()=>{scrollTo({top:9e6,behavior:'instant'});return 'ok'})()`, vw: 390, vh: 844, mobile: true, wait: 4200 },
  { n: 'f-m-full', to: 'top', vw: 390, vh: 844, mobile: true, full: true, wait: 5200 },
  { n: 'f-rm-rem', to: SCROLL('#ns-rem'), rm: true, wait: 4600 },
  { n: 'f-rm-full', to: 'top', rm: true, full: true, wait: 5200 },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profileDir = fs.mkdtempSync(require('os').tmpdir() + '/shot-tune-f-');
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profileDir,
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const consoleErrs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleErrs.push('exception: ' + ((d.exception && d.exception.description) || d.text || '?').split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrs.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' ').split('\n')[0]);
    }
  };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(e.message||e.type)});window.addEventListener('unhandledrejection',function(e){window.__errs.push('rej:'+(e.reason&&e.reason.message||e.reason))});})()` });
  for (const s of SHOTS) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    if (s.rm) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    else await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    consoleErrs.length = 0;
    await send('Page.navigate', { url: BASE });
    await sleep(s.wait);
    await send('Runtime.evaluate', { expression: s.to === 'top' ? 'scrollTo({top:0,behavior:"instant"}),"ok"' : s.to });
    await sleep(1600);
    const st = await send('Runtime.evaluate', { expression: STATE, returnByValue: true });
    const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!s.full });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value, '| errs:', consoleErrs.length ? consoleErrs.join(' ;; ') : 'none');
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
})();
