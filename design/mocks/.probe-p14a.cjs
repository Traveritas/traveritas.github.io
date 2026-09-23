// p14-a 校验探针：在真实页面上读回量化链的计算值 + 层序/几何/动画是否成立
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p14-a';
const PORT = 9801;
const URL_BASE = 'http://127.0.0.1:8191/design/mocks/p14-a-lattice.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome'),
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result);
  };
  await send('Page.navigate', { url: URL_BASE + '?zone=deep&face=wake&lat=edge&chrome=0' });
  await sleep(2600);

  console.log('— 量化链（醒面 k 应为 0，梦面 k 应为 7）—');
  console.log(await ev(`(()=>{
    const h=document.documentElement, cs=getComputedStyle(h), out=[];
    const read=()=>({mix:cs.getPropertyValue('--reality-mix').trim(),still:cs.getPropertyValue('--still').trim(),
      k:cs.getPropertyValue('--lat-k').trim(),p:cs.getPropertyValue('--lat-p').trim(),
      q:cs.getPropertyValue('--lat-q').trim(),r:cs.getPropertyValue('--lat-r').trim(),
      turn:cs.getPropertyValue('--lat-turn').trim(),ink1:cs.getPropertyValue('--lat-ink1').trim()});
    h.style.setProperty('--reality-mix','1'); out.push('wake '+JSON.stringify(read()));
    h.style.setProperty('--reality-mix','0.5'); out.push('half '+JSON.stringify(read()));
    h.style.setProperty('--reality-mix','0.29'); out.push('mix.29 '+JSON.stringify(read()));
    h.style.setProperty('--reality-mix','0'); out.push('dream '+JSON.stringify(read()));
    h.style.setProperty('--reality-mix','1');
    return out.join('\\n');
  })()`));

  console.log('— 倾角/位移的实际矩阵（应看到 7 级离散值）—');
  console.log(await ev(`(()=>{
    const h=document.documentElement, t=document.querySelector('.lat-tilt'), s=document.querySelector('.lat-sink');
    const out=[];
    for(const v of [1,0.86,0.72,0.58,0.44,0.3,0.16,0]){
      h.style.setProperty('--reality-mix',String(v));
      out.push('mix '+v.toFixed(2)+' -> tilt '+getComputedStyle(t).transform+' | sinkTf '+getComputedStyle(s).transform+' | timing '+getComputedStyle(s).animationTimingFunction);
    }
    h.style.setProperty('--reality-mix','1');
    return out.join('\\n');
  })()`));

  console.log('— 层序 / 几何 —');
  console.log(await ev(`(()=>{
    const g=(s)=>{const e=document.querySelector(s); if(!e)return s+' MISSING';
      const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
      return s+' z='+cs.zIndex+' pos='+cs.position+' rect='+[r.left|0,r.top|0,r.width|0,r.height|0].join(',');};
    return ['.lat-lattice','.lat-tilt','.lat-rail-l','.lat-tick-l','.lat-rail-r','.lat-tick-r','.ps-sheet-base','.eeg','.seam','.ps-note'].map(g).join('\\n');
  })()`));

  console.log('— DOM 顺序（lattice 必须在 .page 与 .eeg 之前）—');
  console.log(await ev(`(()=>{const all=[...document.body.children].map(e=>e.className||e.tagName); return all.join(' | ');})()`));

  console.log('— 页脚/控制台默认态 —');
  console.log(await ev(`(()=>{const u=document.getElementById('p14ui'),p=document.getElementById('p14panel');
    return 'ui='+getComputedStyle(u).display+' panelHidden='+p.hidden+' tabSize='+JSON.stringify(document.getElementById('p14tab').getBoundingClientRect().toJSON());})()`));

  console.log('— 无 JS 醒面真值 + 双面块 —');
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: URL_BASE + '?zone=deep&chrome=0' });
  await sleep(1800);
  console.log(await ev(`(()=>{
    const nav=[...document.querySelectorAll('.site-nav span[data-morph]')].map(e=>e.textContent).join('/');
    const side=[...document.querySelectorAll('[data-side]')].map(e=>e.dataset.side+':'+getComputedStyle(e).display).join(' ');
    const lat=getComputedStyle(document.getElementById('lattice')).display;
    return 'nav='+nav+' | sides='+side+' | lattice='+lat+' | bodyH='+document.body.scrollHeight;
  })()`));
  await send('Emulation.setScriptExecutionDisabled', { value: false });

  console.log('— 隐藏控制台 —');
  await send('Page.navigate', { url: URL_BASE + '?zone=deep&chrome=0&face=wake' });
  await sleep(2000);
  console.log(await ev(`(()=>{const u=document.getElementById('p14ui'); return 'chrome=off -> ui display='+getComputedStyle(u).display;})()`));

  console.log('— RM（prefers-reduced-motion: reduce）—');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: URL_BASE + '?zone=deep&chrome=0' });
  await sleep(2200);
  console.log(await ev(`(()=>{return 'RM state='+JSON.stringify(window.__p14.state())+' | scanAnim='+getComputedStyle(document.querySelector('.lat-scan-l')).animationName+' | sinkAnim='+getComputedStyle(document.querySelector('.lat-sink')).animationName+' | turn='+getComputedStyle(document.querySelector('.lat-tilt')).transform;})()`));
  await send('Emulation.setEmulatedMedia', { features: [] });

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
