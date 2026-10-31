// Lead 视觉巡检：node scripts/shot.mjs [home roster intro play reveal finale sheet]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'preview', 'lead');

const known = ['home', 'roster', 'intro', 'play', 'reveal', 'finale', 'sheet', 'admin'];
const args = process.argv.slice(2).filter((a) => known.includes(a));
const screens = args.length ? args : ['home', 'roster', 'intro', 'play', 'reveal', 'finale', 'sheet'];

const waitFor = { home: 1300, roster: 1100, intro: 1500, play: 1200, reveal: 2000, finale: 1600, sheet: 1800, admin: 1500 };

const server = await startServer({ port: 5180 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await fs.mkdir(OUT, { recursive: true });
let failed = 0;
for (const s of screens) {
  try {
    await page.goto(`${server.url}/?screen=${s}`, { waitUntil: 'load' });
    await page.waitForTimeout(waitFor[s] || 1200);
    await page.screenshot({ path: path.join(OUT, s + '.png') });
    console.log('[shot]', s);
  } catch (err) {
    failed++;
    console.error('[shot] failed', s, err.message);
  }
}

if (errors.length) {
  console.log('--- console errors ---');
  errors.slice(0, 30).forEach((e) => console.log(e));
} else {
  console.log('no console errors');
}

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
