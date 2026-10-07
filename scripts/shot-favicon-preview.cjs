const path = require('path');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML = path.resolve(__dirname, '..', 'design', 'mocks', 'favicon-gradient-preview.html');
const OUT = path.resolve(__dirname, '..', 'design', 'mocks', 'favicon-gradient-preview.png');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1040, height: 1800, deviceScaleFactor: 2 });
  await page.goto('file:///' + HTML.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.screenshot({ path: OUT });
  console.log('Saved to ' + OUT);
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
