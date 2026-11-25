/* 交互自检：真拖一下、真滚一下，看姿态有没有动、动了之后是不是又停住。
   node design/mocks/star-nexus/.orbit.cjs */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4674/star-nexus/';
const DP = 9974;
const OUT = path.join(__dirname, '.shots');
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-orbit-${process.pid}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id); this.waiting.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => { if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
    });
  }
}

(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu-sandbox', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 150; i++) { try { const r = await fetch(`http://127.0.0.1:${DP}/json/version`); wsUrl = (await r.json()).webSocketDebuggerUrl; break; } catch { await sleep(200); } }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: URL });
  const ev = async (x) => {
    const r = await S('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  for (let i = 0; i < 100; i++) { try { if (await ev('window.__ready===true')) break; } catch {} await sleep(200); }
  await sleep(2600); // 让翻动跑完

  const pose0 = await ev('window.__star.pose()');
  const frames0 = await ev('window.__star.frames()');

  /* 真拖：CDP 的鼠标事件会到达页面的 pointerdown/move/up */
  const box = await ev(`(() => { const c = document.querySelector('#solid .cell'); const r = c.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 8; i++)
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 22, y: box.y + i * 9, button: 'left', buttons: 1 });
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 176, y: box.y + 72, button: 'left', buttons: 0 });
  await sleep(500);
  const pose1 = await ev('window.__star.pose()');
  const frames1 = await ev('window.__star.frames()');

  /* 滚轮 */
  await S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -240 });
  await sleep(500);
  const pose2 = await ev('window.__star.pose()');

  /* 拖完再静置，看是不是又停了 */
  const proof = await ev('window.__star.probeIdle(1500)');

  const out = { pose0, frames0, pose1, frames1, pose2, proof };
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(OUT, 'orbit.json'), JSON.stringify(out, null, 1));

  ws.close(); proc.kill(); await sleep(400);
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(700);
  for (let i = 0; i < 8; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(400); } }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });