/* 截图：node next/shots.cjs [名字片段]（先 cd next && npx astro dev）→ next/_shots/
   与原型 design/mocks/remake/shots.cjs 同一组画面，地址换成真站的路径 */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), '@playwright', 'mcp', 'node_modules', 'playwright-core'));
const OUT = path.join(__dirname, '_shots'); fs.mkdirSync(OUT, { recursive: true });
const B = process.env.BASE || 'http://127.0.0.1:4325';
(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--use-gl=angle'] });
  const log = [];
  const only = process.argv[2];
  const run = async (name, url, { face = 'dream', vp = { width: 1440, height: 900 }, act, wait, quiet = true } = {}) => {
    if (only && !name.includes(only)) return;
    const p = await br.newPage({ viewport: vp });
    p.on('pageerror', (e) => log.push(name + ' ' + e));
    p.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && log.push(name + ' ' + m.text()));
    if (quiet) await p.addInitScript(() => { try { localStorage.setItem('xm-ave', 'off'); } catch {} });
    await p.goto(B + url + (face === 'wake' ? '?face=wake' : ''), { waitUntil: 'networkidle' });
    await p.waitForTimeout(wait ?? 2700);
    if (act) await act(p);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('ok', name);
    await p.close();
  };
  const go = async (p) => { await p.click('.ts-star'); await p.waitForTimeout(700); await p.click('.ts-tool[data-t="go"]'); await p.mouse.move(250, 700); await p.waitForTimeout(1000); };
  await run('00-boot-b', '/', { wait: 900 });
  await run('01-home', '/');
  await run('02-home-hover', '/', { act: async (p) => { await p.mouse.move(560, 500); await p.waitForTimeout(1400); } });
  await run('03-orbit', '/', { act: async (p) => { await p.click('.ts-star'); await p.waitForTimeout(1200); } });
  await run('03b-orbit-go', '/', { act: go });
  await run('03c-ave', '/', { quiet: false, wait: 7000 });
  await run('04-essays', '/articles/');
  await run('05-moments', '/moments/');
  await run('06-projects', '/projects/');
  await run('06b-projects-scroll', '/projects/', { act: async (p) => { await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(900); } });
  await run('07-read-essay', '/articles/style-specimen/');
  await run('09-read-moment', '/moments/2026-10-07-nexus-dev/');
  await run('10-read-project', '/projects/nexus/');
  await run('11-home-wake', '/', { face: 'wake' });
  await run('12-moments-wake', '/moments/', { face: 'wake' });
  await run('13-read-wake', '/articles/style-specimen/', { face: 'wake' });
  // 换页：点主页的门 → 地面变粗、晶体飞过去、新页站起来（同一张画布，没有整页重载）
  await run('14-transition', '/', { act: async (p) => { await p.click('.door[href="/projects/"]'); await p.waitForTimeout(380); } });
  await run('15-transition-b', '/', { act: async (p) => { await p.click('.door[href="/projects/"]'); await p.waitForTimeout(1400); } });
  // 寻找 / 标签 / 阅读页的「本页」
  await run('19-find', '/find/');
  await run('20-find-q', '/find/?q=NEXUS');
  await run('21-find-typed', '/', { act: async (p) => { await p.click('.ts-star'); await p.waitForTimeout(600); await p.click('.ts-tool[data-t="find"]'); await p.waitForTimeout(500); await p.keyboard.type('像素'); await p.keyboard.press('Enter'); await p.waitForTimeout(1800); } });
  await run('22-tag', '/tags/' + encodeURIComponent('醒梦') + '/');
  await run('23-read-page-tool', '/articles/style-specimen/', { act: async (p) => { await p.click('.ts-star'); await p.waitForTimeout(600); await p.click('.ts-tool[data-t="page"]'); await p.waitForTimeout(900); } });
  // 从名录点进一篇（跨页常驻）：「本页」要出现、目录要是这一篇的
  await run('24-list-to-read-tool', '/articles/', { act: async (p) => { await p.click('.pane--ch'); await p.waitForTimeout(1600); await p.click('.ts-star'); await p.waitForTimeout(600); await p.click('.ts-tool[data-t="page"]'); await p.waitForTimeout(900); } });
  await run('25-home-tools', '/', { act: async (p) => { await p.click('.ts-star'); await p.waitForTimeout(1000); } });
  await run('16-m-home', '/', { vp: { width: 390, height: 844 } });
  await run('17-m-list', '/moments/', { vp: { width: 390, height: 844 } });
  await run('18-m-read', '/articles/style-specimen/', { vp: { width: 390, height: 844 } });
  fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n'));
  console.log(log.join('\n') || 'no errors');
  await br.close();
})();
