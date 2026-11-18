// Dev tool: headless play-test. Loads the game plain, clicks New Game, drives,
// enters a car, checks wanted/mission/save, pauses, then verifies the new
// systems: gunfire raises wanted, roadblocks persist at 3 stars, and the
// mission 7 checkpoint run + mission 8 two-wave last stand play to the
// complete screen. Fails on console errors or non-localhost requests.
// Usage: node test.mjs [port]
//
// Note: headless Chromium on swiftshader renders ~1 fps, and game time is
// clamped to 0.05s/frame, so game time runs ~20x slower than real time.
// Every state wait below polls instead of sleeping a fixed amount.
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/makefun/tools-playwright/node_modules/playwright-core/package.json');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';

const port = parseInt(process.argv[2] || '8081', 10);
const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: new URL('.', import.meta.url).pathname, stdio: 'pipe' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const fail = (m) => { console.error('FAIL: ' + m); failed = true; };
try {
  await sleep(1500);
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const badReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost') && !u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) badReqs.push(u); });
  const ev = (fn) => page.evaluate(fn);
  // poll an in-page condition until true (or timeout); returns the last value
  async function waitFor(fn, timeoutMs, label) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await ev(fn);
      if (last) return last;
      await sleep(500);
    }
    fail('timeout waiting for ' + label + ' (last: ' + JSON.stringify(last) + ')');
    return last;
  }
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2500);
  let s = await ev(() => ({ hasGame: !!window.__game, state: window.__game && window.__game.state, cars: window.__game && window.__game.cars.length, traffic: window.__game && window.__game.traffic.length, peds: window.__game && window.__game.peds.length }));
  console.log('boot:', JSON.stringify(s));
  if (!s.hasGame) fail('no window.__game');
  if (s.state !== 'title') fail('expected title state, got ' + s.state);

  // New Game via the button
  await page.click('#btn-new');
  await sleep(800);
  s = await ev(() => ({ state: window.__game.state, mission: window.__test.mission(), money: window.__test.money() }));
  console.log('after new game:', JSON.stringify(s));
  if (s.state !== 'play') fail('expected play state after New Game');
  if (s.mission !== 'Back in Solmar') fail('expected mission 1, got ' + s.mission);

  // walk forward a bit (on foot)
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.up('KeyW');
  s = await ev(() => ({ x: window.__game.player.mesh.position.x, z: window.__game.player.mesh.position.z }));
  console.log('walked to:', JSON.stringify(s));

  // teleport next to the starter car and enter it (starter car is by the start spawn at 60,60)
  await ev(() => { window.__test.teleport(64, 60); });
  await page.keyboard.press('KeyE');
  await waitFor(() => window.__game.player.inCar, 15000, 'entering the starter car');
  s = await ev(() => ({ inCar: window.__game.player.inCar, car: window.__game.player.car && window.__game.player.car.name }));
  console.log('enter car:', JSON.stringify(s));
  if (!s.inCar) fail('could not enter car');

  // drive forward
  await page.keyboard.down('KeyW');
  await sleep(2500);
  await page.keyboard.up('KeyW');
  s = await ev(() => ({ speed: window.__game.player.car ? window.__game.player.car.speed : 0, x: window.__game.player.car ? window.__game.player.car.group.position.x : 0, z: window.__game.player.car ? window.__game.player.car.group.position.z : 0 }));
  console.log('drove to:', JSON.stringify(s));
  if (Math.abs(s.speed) < 0.5 && Math.hypot(s.x - 64, s.z - 60) < 0.5) fail('car did not move');
  s = await ev(() => ({ fps: window.__test.fps() }));
  console.log('fps (headless swiftshader):', JSON.stringify(s));
  if (!(s.fps > 0)) fail('fps probe returned ' + s.fps);

  // steal check: exit, teleport to a parked car, enter -> wanted rises
  await ev(() => { window.__test.exitCar(); });
  await sleep(800);
  await ev(() => { window.__test.teleport(20, 22); window.__test.enterNearestCar(); });
  await sleep(900);
  s = await ev(() => ({ inCar: window.__game.player.inCar, wanted: window.__test.wanted() }));
  console.log('steal parked car:', JSON.stringify(s));

  // wanted rising: set wanted 2, wait for cops to spawn
  await ev(() => { window.__test.setWanted(2); });
  await sleep(3000);
  s = await ev(() => ({ wanted: window.__test.wanted(), cops: window.__game.cops.cars.length }));
  console.log('cops spawned:', JSON.stringify(s));
  if (s.cops < 1) fail('no cop cars spawned at wanted 2');

  // mission 1 completes by driving to the garage (next mission starts after a 1s game-time delay; headless runs slow)
  await ev(() => { window.__test.teleport(-60, -40); if (window.__game.player.car) { window.__game.player.car.group.position.set(-60, 0, -40); } });
  await waitFor(() => window.__test.mission() === 'Hot Wheels', 90000, 'mission 1 to complete');
  s = await ev(() => ({ mission: window.__test.mission(), money: window.__test.money(), state: window.__game.state }));
  console.log('mission 1:', JSON.stringify(s));
  if (s.mission !== 'Hot Wheels') fail('mission 1 did not complete, still: ' + s.mission);
  if (s.money < 500) fail('mission reward not paid, money=' + s.money);

  // pause / resume (poll: headless frames are slow, fixed sleeps flake)
  await page.keyboard.press('KeyP');
  await waitFor(() => window.__game.state === 'paused', 20000, 'pause');
  s = await ev(() => window.__game.state);
  console.log('paused:', s);
  if (s !== 'paused') fail('pause failed');
  await page.keyboard.press('KeyP');
  await waitFor(() => window.__game.state === 'play', 20000, 'resume');
  s = await ev(() => window.__game.state);
  if (s !== 'play') fail('resume failed, state=' + s);
  console.log('resumed:', s);

  // gunfire draws the law: clear wanted, shoot once, wanted must rise.
  // Move downtown first: the player is parked at Lena's garage, and the
  // lay-low garage would clear the star again the same frame.
  await ev(() => { window.__test.teleport(0, 0); if (window.__game.player.car) { window.__game.player.car.group.position.set(0, 0, 0); } window.__test.setWanted(0); });
  await sleep(4000);
  await ev(() => { window.__test.shoot(); });
  await waitFor(() => window.__test.wanted() >= 1, 20000, 'gunfire to raise wanted');
  s = await ev(() => ({ wanted: window.__test.wanted() }));
  console.log('gunfire wanted:', JSON.stringify(s));
  if (s.wanted < 1) fail('gunfire did not raise wanted');

  // roadblocks persist at 3 stars: 3 patrol cars + 2 roadblock cars, and the
  // roadblock cars must still be there seconds later (old bug: the
  // spawn/despawn loop removed them on the next frame). Player is downtown,
  // far from the lay-low garage, so the wanted level stays up.
  await ev(() => { window.__test.setWanted(3); });
  await waitFor(() => window.__test.roadblocks() >= 2, 30000, 'roadblocks to spawn');
  await sleep(5000);
  s = await ev(() => ({ wanted: window.__test.wanted(), roadblocks: window.__test.roadblocks(), cops: window.__game.cops.cars.length }));
  console.log('roadblocks:', JSON.stringify(s));
  if (s.roadblocks < 2) fail('roadblocks did not persist, got ' + s.roadblocks);
  if (s.cops < 5) fail('expected 3 patrol + 2 roadblock cop cars, got ' + s.cops);
  await ev(() => { window.__test.setWanted(0); });
  await sleep(3000);

  // save/load: localStorage should hold the save
  s = await ev(() => localStorage.getItem('neon-vice-save-v1'));
  console.log('save exists:', !!s, s ? s.slice(0, 120) : '');
  if (!s) fail('no save in localStorage');

  // mission 7 (Smuggler's Run): hit the beach, downtown, then marina checkpoints
  const moneyBefore7 = await ev(() => window.__test.money());
  await ev(() => { window.__test.startMission(6); });
  await sleep(1000);
  s = await ev(() => ({ mission: window.__test.mission(), stage: window.__test.missionStage() }));
  console.log('mission 7 started:', JSON.stringify(s));
  if (s.mission !== "Smuggler's Run") fail('mission 7 did not start, got ' + s.mission);
  await ev(() => { window.__test.teleport(-165, 0); if (window.__game.player.car) { window.__game.player.car.group.position.set(-165, 0, 0); } });
  await waitFor(() => window.__test.missionStage() === 1, 30000, 'mission 7 checkpoint 1 (beach)');
  await ev(() => { window.__test.teleport(0, 0); if (window.__game.player.car) { window.__game.player.car.group.position.set(0, 0, 0); } });
  await waitFor(() => window.__test.missionStage() === 2, 30000, 'mission 7 checkpoint 2 (downtown)');
  await ev(() => { window.__test.teleport(140, 0); if (window.__game.player.car) { window.__game.player.car.group.position.set(140, 0, 0); } });
  await waitFor(() => window.__test.mission() === 'King of Solmar', 90000, 'mission 7 to complete and mission 8 to start');
  s = await ev(() => ({ mission: window.__test.mission(), money: window.__test.money() }));
  console.log('mission 7 done:', JSON.stringify(s));
  if (s.money < moneyBefore7 + 3500) fail('mission 7 reward not paid, money=' + s.money + ' (was ' + moneyBefore7 + ')');

  // mission 8 (King of Solmar): two waves of 3 hostiles at the marina, then the dock
  s = await ev(() => ({ enemies: window.__test.enemiesAlive(), wanted: window.__test.wanted() }));
  console.log('mission 8 wave 1:', JSON.stringify(s));
  if (s.enemies !== 3) fail('mission 8 wave 1 should spawn 3 hostiles, got ' + s.enemies);
  await ev(() => { window.__test.killEnemies(); });
  await waitFor(() => window.__test.enemiesAlive() === 3, 30000, 'mission 8 wave 2 to spawn');
  console.log('mission 8 wave 2 spawned');
  await ev(() => { window.__test.killEnemies(); });
  await waitFor(() => window.__test.missionStage() === 1, 30000, 'mission 8 dock objective');
  await ev(() => { window.__test.teleport(168, 0); if (window.__game.player.car) { window.__game.player.car.group.position.set(168, 0, 0); } });
  await waitFor(() => window.__game.state === 'complete', 90000, 'story complete screen');
  s = await ev(() => ({ state: window.__game.state, money: window.__test.money() }));
  console.log('story complete:', JSON.stringify(s));
  if (s.state !== 'complete') fail('story did not reach the complete screen, state=' + s.state);
  if (s.money < moneyBefore7 + 3500 + 7500) fail('mission 8 reward not paid, money=' + s.money);

  if (errors.length) fail('console errors:\n' + errors.join('\n'));
  if (badReqs.length) fail('non-localhost requests:\n' + badReqs.join('\n'));
  await browser.close();
} finally { server.kill(); }
console.log(failed ? 'TEST FAILED' : 'TEST PASSED');
process.exit(failed ? 1 : 0);
