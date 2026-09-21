// 会话 W 截图批处理：串行 Edge headless
const { execFileSync } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const path = require('path');
const outDir = path.join(__dirname, '.shots');
const prof = path.join(process.env.TEMP || '.', 'edge-prof-w');

const cases = process.argv.slice(2).length ? process.argv.slice(2).map(s => { const [n,q,wh] = s.split('|'); const [w,h] = (wh||'1440,900').split(',').map(Number); return [n,q,w,h]; }) : [
  ['c-pin0',    'still=1&pin=0',      1440, 900],
  ['c-pin0235', 'still=1&pin=0.235',  1440, 900],
  ['c-pin05',   'still=1&pin=0.5',    1440, 900],
  ['c-pin0775', 'still=1&pin=0.775',  1440, 900],
  ['c-pin095',  'still=1&pin=0.95',   1440, 900],
  ['c-intro035','still=1&intro=0.35&pin=0', 1440, 900],
  ['c-hover',   'still=1&pin=0.235&hover=0', 1440, 900],
  ['c-m0',      'still=1&pin=0',      390, 844],
  ['c-m055',    'still=1&pin=0.55',   390, 844],
  ['c-rm',      'rm=1&pin=0.3',       1440, 900],
];

for (const [name, q, w, h] of cases){
  const url = `http://127.0.0.1:8244/p5-casement.html?${q}&v=${Date.now()}${Math.random().toFixed(5)}`;
  const args = ['--headless=new','--disable-extensions','--no-first-run','--hide-scrollbars',
    `--force-device-scale-factor=1`,`--user-data-dir=${prof}`,`--window-size=${w},${h}`,
    '--virtual-time-budget=9000', `--screenshot=${path.join(outDir, name + '.png')}`, url];
  try {
    execFileSync(EDGE, args, { stdio: ['ignore','pipe','ignore'], timeout: 60000 });
    console.log(name, 'ok');
  } catch(e){ console.log(name, 'FAIL', e.status || e.message); }
}
