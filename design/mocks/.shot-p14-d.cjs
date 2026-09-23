// p14-d「星野标尺」截图 + 像素实测（CDP 9804 · headless Chrome）
// 用法：node design/mocks/.shot-p14-d.cjs [shots|probe|legib|perf|dock|all]
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8154/design/mocks/p14-d-reticle.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p14-d';
const PORT = 9804;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

(async () => {
  const mode = process.argv[2] || 'all';
  fs.mkdirSync(OUT, { recursive: true });
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

  const evalJS = async (expr, awaitP = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true });
    if (r.result && r.result.exceptionDetails) console.log('ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result && r.result.result && r.result.result.value;
  };
  const cap = async () => (await send('Page.captureScreenshot', { format: 'png' })).result.data;
  const save = (name, data) => { const p = path.join(OUT, name + '.png'); fs.writeFileSync(p, Buffer.from(data, 'base64')); return fs.statSync(p).size; };

  // 打开一页：切尺寸/媒体模拟 → 导航 → 等字体 → 复位态 → 相位定格 → 藏调试件
  async function open(s) {
    await send('Emulation.setDeviceMetricsOverride', { width: s.vw || 1440, height: s.vh || 900, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'prefers-reduced-motion', value: s.rm ? 'reduce' : 'no-preference' },
        { name: 'prefers-reduced-transparency', value: 'no-preference' },
      ],
    });
    const url = BASE + (s.q ? '?' + s.q : '');
    await send('Page.navigate', { url });
    await sleep(700);
    await evalJS('document.fonts.ready.then(()=>1)', true);
    await sleep(260);
    await evalJS('__p14.zone("' + (s.zone || 'deep') + '");__p14.layer("' + (s.layer || 'under') + '");__p14.jit("' + (s.jit || 'small') + '")');
    if (s.face) await evalJS('__p14.setReality("' + s.face + '")');
    if (s.rm) await evalJS('__p14.setReality("wake")');
    if (s.scroll != null) await evalJS('scrollTo(0,' + s.scroll + ')');
    await sleep(s.settle || 420);
    await evalJS('__p14.phase(' + (s.phase == null ? 2600 : s.phase) + ')');
    if (s.ui !== true) await evalJS('document.getElementById("dock").hidden=true');
    await sleep(160);
  }
  async function shot(s) {
    await open(s);
    const st = await evalJS('JSON.stringify(__p14.state())');
    const size = save(s.n, await cap());
    console.log(s.n, size, st);
  }

  // 滚动到某元素的偏移（段顶 − 视口比例）
  const scrollToEl = async (sel, frac) => {
    await evalJS('(function(){var e=document.querySelector("' + sel + '");scrollTo(0, e.getBoundingClientRect().top+scrollY-Math.round(innerHeight*' + frac + '));})()');
    await sleep(500);
  };

  if (mode === 'shots' || mode === 'all' || mode === 'quick') {
    await shot({ n: '01-deep-hero-dream', q: 'ui=0', zone: 'deep', face: 'dream', scroll: 0 });
    if (mode === 'quick') { ws.close(); try { ch.kill(); } catch (e) {} return; }
    await shot({ n: '02-deep-hero-wake', q: 'ui=0', zone: 'deep', face: 'wake', scroll: 0 });
    // 随便笔段（账目式列表）
    await open({ zone: 'deep', face: 'dream', scroll: 0 });
    await scrollToEl('#ns-essays', 0.22); await evalJS('__p14.phase(2600)'); await sleep(150);
    console.log('03', await evalJS('JSON.stringify(__p14.state())'), save('03-deep-content-dream', await cap()));
    await evalJS('__p14.setReality("wake")'); await sleep(300);
    save('04-deep-content-wake', await cap());
    // 纸面（关于段）
    await open({ zone: 'paper', face: 'dream', scroll: 0 });
    await scrollToEl('#ns-dawn', 0.3); await evalJS('__p14.phase(2600)'); await sleep(150);
    console.log('05', await evalJS('JSON.stringify(__p14.state())'), save('05-paper-dream', await cap()));
    // 光面 + 醒（首屏）
    await shot({ n: '06-light-wake', q: 'ui=0', zone: 'light', face: 'wake', scroll: 0 });
    // 移动端 390
    await shot({ n: '07-mobile390-dream', q: 'ui=0&layer=through', zone: 'deep', face: 'dream', scroll: 0, vw: 390, vh: 844, mobile: true, layer: 'through', settle: 700 });
    // RM
    await shot({ n: '08-rm-wake', q: 'ui=0', zone: 'deep', face: 'wake', scroll: 0, rm: true });
    // 无层基线（同机位同相位）
    await open({ zone: 'deep', face: 'dream', scroll: 0 });
    await scrollToEl('#ns-essays', 0.22); await evalJS('__p14.phase(2600)'); await sleep(150);
    await evalJS('__p14.layer("off")'); await sleep(260);
    save('09-baseline-off', await cap());
    // 抽帧两档（同机位、同相位）
    for (const [nm, jit] of [['10-jit-small', 'small'], ['11-jit-large', 'large']]) {
      await open({ zone: 'deep', face: 'dream', scroll: 0, jit });
      await scrollToEl('#ns-essays', 0.22); await evalJS('__p14.phase(2600)'); await sleep(150);
      await evalJS('__p14.jit("' + jit + '")'); await sleep(260);
      console.log(nm, await evalJS('JSON.stringify(__p14.state())'), save(nm, await cap()));
    }
    // 首屏 · through（层在纸之上、脑电与缝线之下）
    await shot({ n: '12-hero-through', q: 'ui=0&layer=through', zone: 'deep', face: 'dream', scroll: 0, layer: 'through' });
    // 额外：无 JS（醒面真值 + 标尺在场，不白屏）
    await open({ zone: 'light', face: 'wake', scroll: 0, ui: true });
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Page.navigate', { url: BASE + '?ui=0' });
    await sleep(2200);
    save('21-nojs-light', await cap());
    await send('Emulation.setScriptExecutionDisabled', { value: false });
    // 额外：RM 的内容段（标尺仍在、全部阶跃位移关闭）
    await open({ zone: 'deep', face: 'wake', scroll: 0, rm: true });
    await scrollToEl('#ns-essays', 0.22); await sleep(300);
    save('20-rm-content', await cap());
    // 额外：两个 through 对照（层在纸之上时，光/夜的醒梦两面）
    await shot({ n: '18-hero-through-wake', q: 'ui=0&layer=through', zone: 'deep', face: 'wake', scroll: 0, layer: 'through' });
    await shot({ n: '19-light-through-wake', q: 'ui=0&layer=through', zone: 'light', face: 'wake', scroll: 0, layer: 'through' });
    // 额外：文章正文段（.prose）
    await open({ zone: 'deep', face: 'dream', scroll: 0 });
    await scrollToEl('#ns-prose', 0.18); await evalJS('__p14.phase(2600)'); await sleep(150);
    save('15-prose-dream', await cap());
    // 额外：调试件默认形态（不隐藏，仅用于自检其是否够小）
    await open({ zone: 'deep', face: 'dream', scroll: 0, ui: true });
    save('16-dock-default', await cap());
    await open({ zone: 'deep', face: 'dream', scroll: 0, ui: true });
    await evalJS('document.getElementById("dockBtn").click()');
    await sleep(200);
    save('17-dock-open', await cap());
  }

  // ── 像素实测：背景层最亮处 / 相邻墨色（ΔL 比） ──
  const PROBE = dataUrl => `(async()=>{
    const img=new Image();img.src=${JSON.stringify('data:image/png;base64,')}+${JSON.stringify(dataUrl)};
    await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
    const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    const L=(r,gg,b)=>0.2126*lin(r)+0.7152*lin(gg)+0.0722*lin(b);
    const px=(x,y)=>{const q=g.getImageData(x,y,1,1).data;return [q[0],q[1],q[2]];};
    // 1) 标尺窗口：42rem 左量线的刻度+本体（x 由几何给出）
    const R=__p14.rects();
    const vl=R.vl[0]||[360,384];
    const win=[Math.max(0,vl[0]-2),Math.min(img.width-1,vl[1]+2)];
    // 2) 找一条「该列上无任何文字/卡片」的 40px 横带：块要同时横向压到这一列才算挡
    const blocks=[...document.querySelectorAll('main .stitch-head, main p, main h1, main h2, main h3, main li, main blockquote, main .chip-glass, main .vtag, main .vword, main .wake-anchor, main .ledger a, main .waso-note, main .tag-row, main .wake-card')]
      .map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight
        &&r.right>win[0]-10&&r.left<win[1]+10);
    let band=null;
    let y0=Math.round(innerHeight*0.30);
    const hero=document.querySelector('#ns-hero');
    if(hero){const hb=hero.getBoundingClientRect().bottom;if(hb>y0)y0=Math.round(hb)+130;}  /* 避开千层纸的纸缘与影子 */
    for(let y=y0;y+40<innerHeight*0.95;y+=4){
      if(!blocks.some(r=>r.bottom>y-2&&r.top<y+42)){band=[y,y+40];break;}
    }
    if(!band)band=[Math.round(innerHeight*0.72),Math.round(innerHeight*0.72)+40];
    let mark=0,markAt=null,hist={};
    for(let x=win[0];x<=win[1];x++)for(let y=band[0];y<band[1];y++){
      const q=px(x,y),l=L(q[0],q[1],q[2]);
      const k=q[0]+','+q[1]+','+q[2];hist[k]=(hist[k]||0)+1;
      if(l>mark){mark=l;markAt=[x,y];}
    }
    const top=Object.entries(hist).sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
    const ground=L(top[0],top[1],top[2]);
    // 标尺最显著处：离底色最远的那颗像素（深底更亮、淡底更暗，两向都取）
    let lo=1,loAt=null;
    for(let x=win[0];x<=win[1];x++)for(let y=band[0];y<band[1];y++){
      const q=px(x,y),l=L(q[0],q[1],q[2]);if(l<lo){lo=l;loAt=[x,y];}}
    if(Math.abs(lo-ground)>Math.abs(mark-ground)){mark=lo;markAt=loAt;}
    // 2b) 琥珀节点窗口（测量站中心 ±7px）——背景层里最亮的东西就是它
    let nMark=0,nAt=null,nCtr=null,nLo=1,nLoAt=null;
    const st=R.st.filter(s=>s[0]>40&&s[0]<img.width-40&&s[1]>70&&s[1]<img.height-70)
      .sort((a,b)=>Math.abs(a[1]-(band[0]+band[1])/2)-Math.abs(b[1]-(band[0]+band[1])/2))[0];
    if(st){nCtr=st;
      for(let x=st[0]-7;x<=st[0]+7;x++)for(let y=st[1]-7;y<=st[1]+7;y++){
        if(x<0||y<0||x>=img.width||y>=img.height)continue;
        const q=px(x,y),l=L(q[0],q[1],q[2]);
        if(l>nMark){nMark=l;nAt=[x,y];}if(l<nLo){nLo=l;nLoAt=[x,y];}}
      if(Math.abs(nLo-ground)>Math.abs(nMark-ground)){nMark=nLo;nAt=nLoAt;}}
    // 3) 相邻正文墨色：标尺附近（横向 ±340px、纵向下半屏）的文字块里，离底色最远的那颗像素
    //    ——深底取最亮、淡底取最暗，一律朝「离底色更远」的方向取，保证是保守读数
    let inkHi=0,inkHiAt=null,inkLo=1,inkLoAt=null,inkBox=null,sampled=0;
    const near=[...document.querySelectorAll('main p, main li, main h2, main h1, main blockquote, main .ledger-title, main .ledger-desc, main .chip-title, main .chip-desc, main .axis-l')]
      .map(e=>e.getBoundingClientRect())
      .filter(r=>r.width>16&&r.height>6&&r.bottom>band[0]-40&&r.top<innerHeight-4&&Math.abs(r.left-win[1])<340)
      .slice(0,10);
    for(const r of near){
      const x0=Math.max(0,Math.round(r.left)),x1=Math.min(img.width-1,Math.round(r.right));
      const y0=Math.max(0,Math.round(r.top)),y1=Math.min(img.height-1,Math.round(r.bottom));
      if(!inkBox)inkBox=[x0,y0,x1,y1];
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
        const q=px(x,y),l=L(q[0],q[1],q[2]);sampled++;
        if(l>inkHi){inkHi=l;inkHiAt=[x,y];}
        if(l<inkLo){inkLo=l;inkLoAt=[x,y];}
      }
    }
    const inkHiD=Math.abs(inkHi-ground),inkLoD=Math.abs(inkLo-ground);
    const ink=inkHiD>inkLoD?inkHi:inkLo,inkAt=inkHiD>inkLoD?inkHiAt:inkLoAt;
    const denom=Math.abs(ink-ground);
    const ratio=denom>0?Math.abs(mark-ground)/denom:null;
    const nRatio=denom>0&&nMark>0?Math.abs(nMark-ground)/denom:null;
    return {band,win,ground:[top[0],top[1],top[2]],groundL:+ground.toFixed(4),
      blockRects:blocks.map(r=>[Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]),
      mark:+mark.toFixed(4),markRgb:markAt?px(markAt[0],markAt[1]):null,markAt,
      nodeCtr:nCtr,nodeMark:+nMark.toFixed(4),nodeRgb:nAt?px(nAt[0],nAt[1]):null,nodeAt:nAt,
      ink:+ink.toFixed(4),inkRgb:inkAt?px(inkAt[0],inkAt[1]):null,inkBox,inkBlocks:near.length,sampled,
      ratioPct:ratio==null?null:+(ratio*100).toFixed(1),
      nodeRatioPct:nRatio==null?null:+(nRatio*100).toFixed(1),
      limitPct:35};
  })()`;

  if (mode === 'probe' || mode === 'all') {
    const cases = [
      { tag: 'deep · 随笔段 · 梦', zone: 'deep', face: 'dream', el: '#ns-essays' },
      { tag: 'deep · 随笔段 · 醒', zone: 'deep', face: 'wake', el: '#ns-essays' },
      { tag: 'light · 随笔段 · 醒(through)', zone: 'light', face: 'wake', layer: 'through', el: '#ns-essays' },
      { tag: 'paper · 关于段 · 梦', zone: 'paper', face: 'dream', el: '#ns-dawn' },
    ];
    const out = [];
    for (const cs of cases) {
      await open({ zone: cs.zone, face: cs.face, layer: cs.layer, scroll: 0 });
      if (cs.el) await scrollToEl(cs.el, 0.22);
      await evalJS('__p14.phase(2600)'); await sleep(150);
      const data = await cap();
      save('_probe-' + cs.tag.replace(/[^\w\u4e00-\u9fa5]+/g, '_'), data);
      const r = await evalJS(PROBE(data), true);
      console.log('PROBE', cs.tag, JSON.stringify(r));
      out.push({ tag: cs.tag, ...r });
    }
    fs.writeFileSync(path.join(OUT, '_probe.json'), JSON.stringify(out, null, 2));
  }

  // ── 梦态可辨识度：静场后只改标尺相位，量「位移 / 受影响像素 / ΔL」 ──
  if (mode === 'legib' || mode === 'all') {
    const diff = (a, b, lineX) => `(async()=>{
      const mk=async(dd)=>{const i=new Image();i.src='data:image/png;base64,'+dd;await i.decode();
        const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
        const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(i,0,0);return {g,w:i.width,h:i.height};};
      const A=await mk(${JSON.stringify(a)}),B=await mk(${JSON.stringify(b)});
      const g=A.g;const da=g.getImageData(0,0,A.w,A.h).data,db=B.g.getImageData(0,0,B.w,B.h).data;
      const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
      const L=(r,gg,bb)=>0.2126*lin(r)+0.7152*lin(gg)+0.0722*lin(bb);
      const at=(data,x,y)=>{const i=(y*A.w+x)*4;return L(data[i],data[i+1],data[i+2]);};
      // 无正文横带（文字块外扩 14px 后仍空），只在这里比像素
      const blocks=[...document.querySelectorAll('main p, main h1, main h2, main li, main .chip-glass, main .wake-anchor, main .ledger a, main blockquote')]
        .map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight);
      let band=null;
      for(let y=Math.round(innerHeight*0.10);y+70<innerHeight*0.95;y+=5){
        if(!blocks.some(r=>r.bottom>y-14&&r.top<y+84)){band=[y,y+70];break;}
      }
      if(!band)band=[Math.round(innerHeight*0.86),Math.round(innerHeight*0.86)+70];
      let n=0,max=0,sum=0,hist={'<0.01':0,'0.01-0.02':0,'0.02-0.05':0,'0.05-0.10':0,'>0.10':0};
      for(let y=band[0];y<band[1];y++)for(let x=0;x<A.w;x++){
        const d=Math.abs(at(da,x,y)-at(db,x,y));
        if(d>0.002){n++;sum+=d;if(d>max)max=d;
          hist[d<0.01?'<0.01':d<0.02?'0.01-0.02':d<0.05?'0.02-0.05':d<0.10?'0.05-0.10':'>0.10']++;}
      }
      // 位移实测：在 42rem 左量线两侧 ±7px 窗口内逐行求「最亮点」的 x，比较两相位
      const X=${lineX};
      let dm=0,dmax=0,sameX=0;
      for(let y=band[0];y<band[1];y++){
        let ax=X,ay=-1,bx=X,by=-1;
        for(let x=X-7;x<=X+7;x++){const la=at(da,x,y),lb=at(db,x,y);
          if(la>ay){ay=la;ax=x;}if(lb>by){by=lb;bx=x;}}
        const dpx=Math.abs(ax-bx);dm+=dpx;if(dpx>dmax)dmax=dpx;if(dpx===0)sameX++;
      }
      const rows=band[1]-band[0];
      return {band, rows, changedPx:n, changedRatio:+(n/(rows*A.w)).toFixed(4),
        maxDL:+max.toFixed(4), meanDL_of_changed:+(sum/Math.max(1,n)).toFixed(4), hist,
        shift_meanPx:+(dm/rows).toFixed(2), shift_maxPx:dmax, rowsUnmoved:sameX};
    })()`;
    for (const jit of ['small', 'large', 'off']) {
      await open({ zone: 'deep', face: 'dream', scroll: 0, jit: jit === 'off' ? 'small' : jit, layer: jit === 'off' ? 'off' : 'under' });
      await scrollToEl('#ns-essays', 0.22);
      const lineX = await evalJS('Math.round(parseFloat(getComputedStyle(document.querySelector(".vl[data-edge=\\"42\\"]")).left)+26-1)');
      await evalJS('__p14.isolate(600)'); await sleep(200);
      const a = await cap();
      await evalJS('__p14.isolate(3400)'); await sleep(200);
      const b = await cap();
      save('_jitphase-' + jit + '-a', a); save('_jitphase-' + jit + '-b', b);
      const d = await evalJS(diff(a, b, lineX), true);
      console.log('LEGIB', jit, 'lineX=' + lineX, JSON.stringify(d));
      fs.writeFileSync(path.join(OUT, '_legib-' + jit + '.json'), JSON.stringify(d, null, 2));
    }
    // 25% 缩图 + 3x 近观裁片（同机位）
    await open({ zone: 'deep', face: 'dream', scroll: 0 });
    await scrollToEl('#ns-essays', 0.22); await evalJS('__p14.phase(2600)'); await sleep(150);
    const data = await cap();
    save('03-deep-content-dream', data);
    const R = await evalJS('JSON.stringify(__p14.rects())');
    const rects = JSON.parse(R);
    const vl = rects.vl[0] || [360, 384];
    const zoom = `(async()=>{
      const i=new Image();i.src='data:image/png;base64,'+${JSON.stringify(data)};await i.decode();
      const q=(canvas)=>{const c=document.createElement('canvas');c.width=canvas[0];c.height=canvas[1];
        const g=c.getContext('2d');return {c,g};};
      const a=q([360,225]);a.g.imageSmoothingQuality='high';
      a.g.drawImage(i,0,0,i.width,i.height,0,0,360,225);
      const s=a.c.toDataURL('image/png');
      const b=q([${(vl[1] - vl[0] + 150) * 3},${360}]);
      b.g.imageSmoothingEnabled=false;
      const sx=Math.max(0,${Math.round(vl[0])} - 60), sy=Math.round(innerHeight*0.30);
      b.g.drawImage(i,sx,sy,${Math.round(vl[1] - vl[0]) + 150},360,0,0,b.c.width,b.c.height);
      return {quarter:s,crop:b.c.toDataURL('image/png'),sx,sy};
    })()`;
    const z = await evalJS(zoom, true);
    if (z) {
      fs.writeFileSync(path.join(OUT, '13-legibility-25.png'), Buffer.from(z.quarter.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(OUT, '14-legibility-zoom.png'), Buffer.from(z.crop.split(',')[1], 'base64'));
      console.log('LEGIB images written, crop from', z.sx, z.sy);
    } else console.log('LEGIB zoom failed');
  }

  // ── 性能：8× CPU 降速、滚动 5 秒、p95 与最长帧（有层 vs 无层） ──
  if (mode === 'perf' || mode === 'all') {
    const run = async (layer) => {
      await send('Emulation.setCPUThrottlingRate', { rate: 8 });
      await open({ zone: 'deep', face: 'dream', scroll: 0, layer });
      await evalJS('__p14.resume();scrollTo(0,0)');
      await sleep(800);
      await evalJS('window.__perf = __p14.perf(5000)');
      const y0 = await evalJS('Math.round(scrollY)');
      const t0 = Date.now(); let n = 0;
      while (Date.now() - t0 < 5000) {            // 不等回复地投滚轮，约 60 次/秒
        send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 110, pointerType: 'mouse' });
        n++; await sleep(16);
      }
      const r = await evalJS('window.__perf', true);
      const y1 = await evalJS('Math.round(scrollY)');
      await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const out = { layer, ...r, wheels: n, from: y0, to: y1, scrolled: y1 - y0, fps: +(r.frames / (r.span / 1000)).toFixed(1) };
      console.log('PERF', JSON.stringify(out));
      return out;
    };
    const on = await run('under');
    const off = await run('off');
    fs.writeFileSync(path.join(OUT, '_perf.json'), JSON.stringify({ on, off }, null, 2));
  }

  // ── 性能归因：8× 降速下逐族关掉，看是谁贵（有层 / 无层 / 关横线 / 关站 / 关竖线 / 关抽帧） ──
  if (mode === 'perfv') {
    const run = async (label, layer, hideCss, jit) => {
      await send('Emulation.setCPUThrottlingRate', { rate: 8 });
      await open({ zone: 'deep', face: 'dream', scroll: 0, layer, jit: jit || 'small' });
      if (hideCss) await evalJS('(function(){var s=document.createElement("style");s.textContent=' + JSON.stringify(hideCss) + ';document.head.appendChild(s);})()');
      await evalJS('__p14.resume();scrollTo(0,0)');
      await sleep(800);
      await evalJS('window.__perf = __p14.perf(5000)');
      const t0 = Date.now(); let n = 0;
      while (Date.now() - t0 < 5000) {
        send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 110, pointerType: 'mouse' });
        n++; await sleep(16);
      }
      const r = await evalJS('window.__perf', true);
      await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const out = { label, layer, hide: !!hideCss, jit: jit || 'small', ...r, fps: +(r.frames / (r.span / 1000)).toFixed(1) };
      console.log('PERFV', JSON.stringify(out));
      return out;
    };
    const res = [];
    res.push(await run('层关闭（基线）', 'off'));
    res.push(await run('全层在', 'under'));
    res.push(await run('关横量线', 'under', '.hl{display:none!important}'));
    res.push(await run('关测量站', 'under', '.station{display:none!important}'));
    res.push(await run('关竖量线', 'under', '.vl{display:none!important}'));
    res.push(await run('关标尺小签', 'under', '.rt-lab{display:none!important}'));
    res.push(await run('关抽帧（层在）', 'under', '', 'none'));
    res.push(await run('层关闭（复测）', 'off'));
    fs.writeFileSync(path.join(OUT, '_perfv.json'), JSON.stringify(res, null, 2));
  }

  // ── 性能 A/B：三次重复取中位（有层 / 无层 / 有层但小签不参与抽帧） ──
  if (mode === 'perf3') {
    const once = async (label, layer, css) => {
      await open({ zone: 'deep', face: 'dream', scroll: 0, layer });
      if (css) await evalJS('(function(){var s=document.createElement("style");s.textContent=' + JSON.stringify(css) + ';document.head.appendChild(s);})()');
      await evalJS('__p14.resume();scrollTo(0,0)');
      await sleep(700);
      await evalJS('window.__perf = __p14.perf(5000)');
      const t0 = Date.now(); let n = 0;
      while (Date.now() - t0 < 5000) {
        send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 110, pointerType: 'mouse' });
        n++; await sleep(16);
      }
      const r = await evalJS('window.__perf', true);
      return { label, fps: +(r.frames / (r.span / 1000)).toFixed(1), p95: r.p95, max: r.max, median: r.median, frames: r.frames, wheels: n };
    };
    const variants = [
      ['层关闭', 'off', ''],
      ['有层（全）', 'under', ''],
      ['有层 · 小签不抽帧', 'under', '.rt-lab{animation:none!important}'],
      ['层关闭（复测）', 'off', ''],
    ];
    await send('Emulation.setCPUThrottlingRate', { rate: 8 });
    const rows = [];
    for (let rep = 0; rep < 3; rep++) {
      for (const [label, layer, css] of variants) {
        const r = await once(label, layer, css);
        rows.push({ rep, ...r });
        console.log('PERF3', rep, JSON.stringify(r));
      }
    }
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const summary = [...new Set(rows.map(r => r.label))].map(l => {
      const g = rows.filter(r => r.label === l);
      return { label: l, fps_median: med(g.map(r => r.fps)), p95_median: med(g.map(r => r.p95)), max_median: med(g.map(r => r.max)), runs: g.length };
    });
    console.log('PERF3 SUMMARY', JSON.stringify(summary));
    fs.writeFileSync(path.join(OUT, '_perfv.json'), JSON.stringify({ rows, summary }, null, 2));
  }

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
  console.log('done', mode);
})();
