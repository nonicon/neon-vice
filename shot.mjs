// Dev tool: take one deterministic screenshot. Usage:
//   node shot.mjs <shot-name> <out.jpg> [port]
// v2 (2026-11-18): reviewed, kept — deterministic ?shot=&seed=1 staging.
// Serves game/ with serve.ts, loads ?shot=<name>&seed=1 in headless Chromium,
// waits for window.__shotReady, fails on console errors or non-localhost requests.
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/makefun/tools-playwright/node_modules/playwright-core/package.json');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const shot = process.argv[2];
const out = process.argv[3];
const port = parseInt(process.argv[4] || '8080', 10);
if (!shot || !out) { console.error('usage: node shot.mjs <shot> <out.jpg> [port]'); process.exit(2); }

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: new URL('.', import.meta.url).pathname, stdio: 'pipe' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
try {
  await sleep(1500);
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const badReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost') && !u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) badReqs.push(u); });
  await page.goto(`http://localhost:${port}/?shot=${shot}&seed=1`, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, undefined, { timeout: 120000 });
  } catch (e) {
    const state = await page.evaluate(() => ({ ready: window.__shotReady, hasGame: !!window.__game, state: window.__game ? window.__game.state : 'n/a', elapsed: window.__game ? +window.__game.clock.elapsed.toFixed(2) : -1, shotTimer: window.__game ? +window.__game.shotTimer.toFixed(2) : -1 }));
    console.error('TIMEOUT waiting for __shotReady:', JSON.stringify(state), 'err:', e && e.message);
    failed = true;
  }
  await sleep(400);
  await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
  console.log('saved', out);
  if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); failed = true; }
  if (badReqs.length) { console.error('NON-LOCALHOST REQUESTS:\n' + badReqs.join('\n')); failed = true; }
  await browser.close();
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
