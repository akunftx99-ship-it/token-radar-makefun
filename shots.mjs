// Screenshot the radar's routes with the local Chrome: the board, one protocol's detail view, the model
// page. Usage: node shots.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/.npm-global/lib/node_modules/');
const puppeteer = require('puppeteer');

const base = process.argv[2] ?? 'http://127.0.0.1:8099';
const out = process.argv[3] ?? 'shots-out';
const chrome = '/home/ubuntu/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome';
mkdirSync(out, { recursive: true });

const shots = [
  { file: '1-board.jpg', hash: '#/', w: 1440, h: 1000, wait: '.table-wrap tbody tr' },
  { file: '2-detail.jpg', hash: '#/p/steakhouse-financial', w: 1440, h: 1240, wait: '.detail .steps li' },
  { file: '3-model.jpg', hash: '#/model', w: 1440, h: 1080, wait: '.formula' },
];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

const only = process.argv[4] ? process.argv[4].split(',') : null;
for (const s of shots) {
  if (only && !only.includes(s.file)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/dashboard/index.html${s.hash}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector(s.wait, { timeout: 15000 });
  await page.waitForFunction('window.__radarReady === true', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 350));
  const rows = await page.$$eval('.table-wrap tbody tr', (n) => n.length).catch(() => 0);
  await page.screenshot({ path: join(out, s.file), type: 'jpeg', quality: 92, captureBeyondViewport: false });
  console.log(JSON.stringify({ file: s.file, hash: s.hash, rows, errors }));
  await page.close();
}

await browser.close();
