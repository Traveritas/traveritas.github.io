const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { start } = require('./serve.cjs');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9391;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const req=(m,p)=>new Promise((res,rej)=>{const r=http.request({host:'127.0.0.1',port:PORT,path:p,method:m},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{try{res(JSON.parse(d))}catch{res(d)}})});r.on('error',rej);r.end();});
(async()=>{
  const server=await start(0);
  const base=`http://127.0.0.1:${server.address().port}/star-v-flora/.blit-probe.html`;
  const profile=path.join(process.env.TEMP,'chrome-bp-'+Date.now());
  const chrome=spawn(CHROME,['--headless=new','--hide-scrollbars','--use-angle=d3d11','--force-color-profile=srgb','--no-first-run','--disable-extensions',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let up=false; for(let i=0;i<60;i++){try{await req('GET','/json/version');up=true;break}catch{await sleep(250)}}
  const t=await req('PUT','/json/new?about:blank');
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r});
  let id=0; const pend=new Map(); const errs=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);} else if(m.method==='Runtime.exceptionThrown'){errs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);} else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){errs.push(m.params.entry.text);} };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:460,height:260,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base}); await sleep(2500);
  const r=await send('Runtime.evaluate',{expression:'JSON.stringify(window.__blit||null)',returnByValue:true});
  console.log('BLIT =', r.result.value);
  console.log(errs.length?'ERRORS: '+errs.join(' | '):'no errors');
  ws.close(); chrome.kill(); server.close(); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
