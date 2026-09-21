// 交互验证：按住任意处 → 检验态；松手 → 回梦 + 醒来计数 +1
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p7-doorcheck.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => { http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error',rej); });
(async () => {
  const ch = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--remote-debugging-port=9783','--user-data-dir='+path.join(OUT,'.p7hold'),'--window-size=1440,900','about:blank'],{stdio:'ignore'});
  let list=null;
  for(let k=0;k<80;k++){ try{ list=await getJSON('http://127.0.0.1:9783/json'); if(list&&list.some(t=>t.type==='page'))break; }catch(e){} await sleep(250); }
  const ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  let id=0; const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(m,p={})=>new Promise(r=>{const k=++id;pend.set(k,r);ws.send(JSON.stringify({id:k,method:m,params:p}));});
  await new Promise(r=>{ws.onopen=r;});
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:BASE});
  await sleep(2800);
  // 按住背景 (620,430) —— 非链接、非锚点区域
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:620,y:430,button:'left',clickCount:1});
  await sleep(1400);
  const st1=await send('Runtime.evaluate',{expression:'__p7.state()',returnByValue:true});
  const cap1=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(OUT,'p7door-hold.png'),Buffer.from(cap1.result.data,'base64'));
  console.log('holding:',st1.result.result.value);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:620,y:430,button:'left',clickCount:1});
  await sleep(1600);
  const st2=await send('Runtime.evaluate',{expression:'__p7.state()',returnByValue:true});
  const cap2=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(OUT,'p7door-release.png'),Buffer.from(cap2.result.data,'base64'));
  console.log('released:',st2.result.result.value);
  ws.close(); try{ch.kill();}catch(e){}
  await sleep(400);
  try{fs.rmSync(path.join(OUT,'.p7hold'),{recursive:true,force:true});}catch(e){}
})();
