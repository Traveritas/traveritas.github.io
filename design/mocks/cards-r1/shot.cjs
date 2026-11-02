/* cards-r1 · 截图
   node design/mocks/cards-r1/shot.cjs            → 每个案子三张
   node design/mocks/cards-r1/shot.cjs mist       → 只截 mist
   出到 design/mocks/cards-r1/.shots/<案子>-{list,open,mobile}.png
   用本机 Chrome 的 headless 模式，不装任何依赖。 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(ROOT, '.shots');
const VIEWS = [
  { name: 'list', w: 1440, h: 900, hash: '' },
  { name: 'open', w: 1440, h: 900, hash: '#open' },
  { name: 'mobile', w: 390, h: 844, hash: '' },
];
const only = process.argv.slice(2);

fs.mkdirSync(OUT, { recursive: true });
const cases = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared')
  .map((d) => d.name)
  .filter((n) => fs.existsSync(path.join(ROOT, n, 'index.html')))
  .filter((n) => !only.length || only.includes(n));

if (!cases.length) {
  console.error('没有找到带 index.html 的案子目录');
  process.exit(1);
}
if (!fs.existsSync(CHROME)) {
  console.error('找不到 Chrome：' + CHROME);
  process.exit(1);
}

/* 每个进程一份临时 profile：三个人同时跑也不会互相抢锁 */
const profile = path.join(os.tmpdir(), 'cards-r1-chrome-' + process.pid);
/* 必须异步：服务就起在本进程里，spawnSync 会把事件循环卡住，Chrome 取不到页面。 */
const shot = (url, file, w, h) =>
  new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--user-data-dir=' + profile,
      `--window-size=${w},${h}`,
      '--virtual-time-budget=4000',
      '--screenshot=' + file,
      url,
    ];
    const child = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (b) => (err += b));
    const timer = setTimeout(() => child.kill(), 30000);
    child.on('exit', () => {
      clearTimeout(timer);
      if (fs.existsSync(file)) resolve(file);
      else reject(new Error('截图失败 ' + url + '\n' + err.split('\n').slice(-4).join('\n')));
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });

(async () => {
  process.env.PORT = process.env.PORT || '4641';
  let server;
  try {
    server = await start(+process.env.PORT);
  } catch (e) {
    server = await start(0); // 端口被占就换一个
  }
  const port = server.address().port;
  console.log('serve → http://localhost:' + port);
  try {
    for (const name of cases) {
      for (const v of VIEWS) {
        const file = path.join(OUT, `${name}-${v.name}.png`);
        const url = `http://localhost:${port}/${name}/index.html${v.hash}`;
        await shot(url, file, v.w, v.h);
        console.log('  ' + path.relative(process.cwd(), file));
      }
    }
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
