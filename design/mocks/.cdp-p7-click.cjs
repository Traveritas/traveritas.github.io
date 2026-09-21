// 一次性验证：非 still 模式下点击首屏 → .fell 落针出现且计数文案更新
const { spawn, execFileSync } = require('child_process');
const http = require('http');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const URL0 = 'http://127.0.0.1:4317/p7-first-stitch.html?v=' + Date.now();

function getJSON(p, method){ return new Promise((res, rej) => {
  const r = http.request({host:'127.0.0.1',port:PORT,path:p,method:method||'GET'}, rr => { let d=''; rr.on('data',c=>d+=c); rr.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); });
  r.on('error', rej); r.end();
});}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, ['--headless','--disable-gpu','--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-p7-click-${Date.now()}`, 'about:blank'],
    { stdio: 'ignore' });
  for (let i=0;i<40;i++){ try{ await getJSON('/json/version'); break; }catch(_){ await sleep(250); } }
  const page = await getJSON('/json/new?' + encodeURIComponent(URL0), 'PUT').catch(()=>null);
  const page2 = page && page.webSocketDebuggerUrl ? page : (await getJSON('/json')).find(t => t.url.startsWith('http://127.0.0.1:4317')) || (await getJSON('/json'))[0];
  const ws = new WebSocket(page2.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id:i, method, params})); });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  for (let i=0;i<80;i++){ await sleep(250);
    const r = await send('Runtime.evaluate', { expression:
      `typeof window.__swarmErr !== 'undefined' && document.readyState !== 'loading'`, returnByValue:true });
    if (r.result.result.value) break;
  }
  await sleep(600);
  // 三次点击首屏不同位置（合成事件，坐标在 hero 内、避开链接）
  const click = async (x,y) => send('Runtime.evaluate', { returnByValue:true, expression:
    `(function(){var h=document.getElementById('hero');var r=h.getBoundingClientRect();
     var e=new MouseEvent('click',{bubbles:true,clientX:${x},clientY:${y}});
     h.dispatchEvent(e);})()` });
  await click(1050, 560); await sleep(150);
  await click(1180, 640); await sleep(150);
  await click(930, 700); await sleep(300);
  const diag = await send('Runtime.evaluate', { returnByValue:true, expression:
    `JSON.stringify({href:location.href, title:document.title, rs:document.readyState,
      hasHero:!!document.getElementById('hero'),
      fells:document.querySelectorAll('.fell').length,
      on:document.querySelectorAll('.fell.on').length,
      count:(document.getElementById('stitchCount')||{}).textContent||null,
      cls:document.documentElement.className,
      err:window.__swarmErr||'?'})` });
  console.log('CLICK-TEST', JSON.stringify(diag.result).slice(0, 500));
  ws.close();
  try{ execFileSync('taskkill', ['/PID', edge.pid, '/T', '/F'], {stdio:'ignore'}); }catch(_){}
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
