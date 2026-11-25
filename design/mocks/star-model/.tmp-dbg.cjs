const { spawn } = require('child_process');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const DP=9501, PROF=process.env.TEMP+'/dbg2-'+process.pid;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=spawn(CHROME,['--headless=new','--remote-debugging-port='+DP,'--user-data-dir='+PROF,'--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
 let wsUrl;
 for(let i=0;i<100;i++){try{const j=await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json();wsUrl=j.webSocketDebuggerUrl;break;}catch{await sleep(200);}}
 const ws=new WebSocket(wsUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0; const wait=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id);}});
 const send=(method,params={},sessionId)=>new Promise(res=>{const i=++id;wait.set(i,res);ws.send(JSON.stringify({id:i,method,params,sessionId}));});
 const {result:{targetId}}=await send('Target.createTarget',{url:'about:blank'});
 const {result:{sessionId}}=await send('Target.attachToTarget',{targetId,flatten:true});
 const S=(m,pr)=>send(m,pr,sessionId);
 await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable');
 await S('Page.navigate',{url:'http://localhost:4672/star-model/'});
 for(let i=0;i<80;i++){const r=await S('Runtime.evaluate',{expression:'window.__ready===true',returnByValue:true}); if(r.result?.result?.value)break; await sleep(250);}
 const ev=async e=>{const r=await S('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); return r.result?.result?.value ?? JSON.stringify(r.result?.exceptionDetails);};
 console.log('probe fetch status:', await ev(`fetch('/probe.json',{cache:'no-store'}).then(r=>r.status)`));
 console.log('probe rows groups:', await ev(`fetch('/probe.json',{cache:'no-store'}).then(r=>r.json()).then(j=>[...new Set(j.rows.map(x=>x.group))].join(','))`));
 console.log('row keys:', await ev(`fetch('/probe.json',{cache:'no-store'}).then(r=>r.json()).then(j=>JSON.stringify(j.rows[0]))`));
 ws.close(); p.kill();
 try{require('child_process').execSync(`taskkill /PID ${p.pid} /T /F`,{stdio:'ignore'});}catch{}
})();
