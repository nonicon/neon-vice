// HUD: health/armor/money/stars/objective/speed/clock/ammo, minimap canvas,
// toasts, crosshair, and the title / pause / game-over / complete screens.
import { STREETS } from './city.js';
import { MISSIONS } from './missions.js';

let els = null;
let toastTimer = null;
let mmTick = 0;

function el(tag, id, parent, html) {
  const d = document.createElement(tag);
  if (id) { d.id = id; d.className = id; }
  if (html != null) d.innerHTML = html;
  if (parent) parent.appendChild(d);
  return d;
}

export function buildHUD(G) {
  const root = document.getElementById('hud');
  root.innerHTML = '';

  const top = el('div', 'hud-top', root);
  const left = el('div', 'hud-left', top);
  els = {};
  els.healthWrap = el('div', 'bar-wrap', left);
  el('div', 'bar-label', els.healthWrap, 'HEALTH');
  els.healthBar = el('div', 'health-bar', els.healthWrap);
  els.healthFill = el('div', 'health-fill', els.healthBar);
  els.armorWrap = el('div', 'bar-wrap', left);
  el('div', 'bar-label', els.armorWrap, 'ARMOR');
  els.armorBar = el('div', 'armor-bar', els.armorWrap);
  els.armorFill = el('div', 'armor-fill', els.armorBar);
  els.money = el('div', 'hud-money', left, '$0');
  els.stars = el('div', 'hud-stars', left, '');
  const center = el('div', 'hud-center', top);
  els.objective = el('div', 'hud-objective', center, '');
  els.subObjective = el('div', 'hud-sub', center, '');
  const right = el('div', 'hud-right', top);
  els.clock = el('div', 'hud-clock', right, '18:40');
  els.speed = el('div', 'hud-speed', right, '0 mph');
  els.weapon = el('div', 'hud-weapon', right, '');
  els.fps = el('div', 'hud-fps', right, '');

  els.crosshair = el('div', 'crosshair', root, '+');
  els.toast = el('div', 'hud-toast', root, '');
  els.hint = el('div', 'hud-hint', root, '');

  // minimap (bottom-right)
  const mmWrap = el('div', 'minimap-wrap', root);
  els.minimap = el('canvas', 'minimap', mmWrap);
  els.minimap.width = 190; els.minimap.height = 190;
  el('div', 'minimap-n', mmWrap, 'N');

  // --- screens ---
  const title = el('div', 'screen-title', root);
  els.titleScreen = title;
  el('h1', null, title, 'NEON VICE');
  el('div', 'title-sub', title, 'An open-world crime story in Solmar');
  el('div', 'title-story', title,
    'Rico Vega is back in Solmar. Lena Cruz has one last job — and Dario Kane owns the city. ' +
    'Drive, steal, run from the law, and take the town back, one mission at a time.');
  const menu = el('div', 'title-menu', title);
  els.continueBtn = el('button', 'btn-continue', menu, 'CONTINUE');
  els.newBtn = el('button', 'btn-new', menu, 'NEW GAME');
  els.titleSave = el('div', 'title-save', title, '');
  el('div', 'title-controls', title,
    '<b>WASD</b> drive / walk &nbsp; <b>Shift</b> sprint &nbsp; <b>Space</b> handbrake<br>' +
    '<b>E</b> enter / exit / steal car &nbsp; <b>Mouse</b> aim &nbsp; <b>Click</b> shoot<br>' +
    '<b>R</b> reload &nbsp; <b>C</b> camera &nbsp; <b>H</b> horn &nbsp; <b>M</b> mute &nbsp; <b>P / Esc</b> pause');

  const pause = el('div', 'screen-pause', root);
  els.pauseScreen = pause;
  el('h1', null, pause, 'PAUSED');
  el('div', 'pause-sub', pause, 'Solmar waits for no one. Well — right now it does.');
  els.resumeBtn = el('button', 'btn-resume', pause, 'RESUME');
  els.quitBtn = el('button', 'btn-quit', pause, 'QUIT TO TITLE');
  el('div', 'title-controls', pause,
    '<b>WASD</b> drive / walk &nbsp; <b>E</b> enter / steal car &nbsp; <b>Click</b> shoot<br>' +
    '<b>R</b> reload &nbsp; <b>C</b> camera &nbsp; <b>M</b> mute &nbsp; <b>P / Esc</b> resume');

  const over = el('div', 'screen-over', root);
  els.overScreen = over;
  els.overTitle = el('h1', null, over, 'WASTED');
  els.overSub = el('div', 'over-sub', over, '');
  els.retryBtn = el('button', 'btn-retry', over, 'TRY AGAIN');

  const done = el('div', 'screen-done', root);
  els.doneScreen = done;
  el('h1', null, done, 'NEON VICE');
  els.doneSub = el('div', 'done-sub', done, '');
  els.againBtn = el('button', 'btn-again', done, 'PLAY AGAIN');

  els.continueBtn.addEventListener('click', () => G.startGame(true));
  els.newBtn.addEventListener('click', () => G.startGame(false));
  els.resumeBtn.addEventListener('click', () => G.togglePause());
  els.quitBtn.addEventListener('click', () => G.toTitle());
  els.retryBtn.addEventListener('click', () => G.startGame(false));
  els.againBtn.addEventListener('click', () => G.startGame(false));

  G.hud = {
    update: (gg) => updateHUD(gg),
    toast: (msg, dur) => toast(msg, dur),
    setObjective: (t) => { if (els.objective) els.objective.textContent = t; },
    setSub: (t) => { if (els.subObjective) els.subObjective.textContent = t; },
    setHint: (t) => { if (els.hint) els.hint.textContent = t; },
    showScreen: (name) => showScreen(name),
    setOver: (title, sub) => { els.overTitle.textContent = title; els.overSub.textContent = sub; },
    setDone: (sub) => { els.doneSub.innerHTML = sub; },
    setTitleSave: (t) => { els.titleSave.textContent = t; },
  };
  showScreen('title');
  return G.hud;
}

function showScreen(name) {
  if (!els) return;
  const hud = document.getElementById('hud');
  if (hud) hud.classList.toggle('title-mode', name === 'title');
  const map = { title: els.titleScreen, paused: els.pauseScreen, gameover: els.overScreen, busted: els.overScreen, complete: els.doneScreen };
  for (const k of ['titleScreen', 'pauseScreen', 'overScreen', 'doneScreen']) els[k].style.display = 'none';
  els.crosshair.style.display = 'none';
  if (name === 'play') return;
  const s = map[name];
  if (s) s.style.display = 'flex';
}

function toast(msg, dur) {
  if (!els || !els.toast) return;
  els.toast.textContent = msg;
  els.toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, (dur || 3) * 1000);
}

function drawMinimap(G) {
  const c = els.minimap;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.fillStyle = 'rgba(10,10,24,0.82)';
  ctx.fillRect(0, 0, W, H);
  const scale = W / 340; // world -170..170
  const toX = (x) => (x + 170) * scale;
  const toY = (z) => (z + 170) * scale;
  // sea (west of x=-150) + beach band (-150..-140); old code used toX(-185),
  // which is off-canvas and drew nothing
  ctx.fillStyle = '#0e4a6b'; ctx.fillRect(0, 0, toX(-150), H);
  ctx.fillStyle = '#c2a878'; ctx.fillRect(toX(-150), 0, toX(-140) - toX(-150), H);
  // streets
  ctx.strokeStyle = '#555566'; ctx.lineWidth = 3;
  for (const s of STREETS) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(W, toY(s)); ctx.stroke();
  }
  // mission marker
  if (G.mission && G.mission.state === 'active' && G.mission.target) {
    const pulse = 4 + Math.sin(G.clock.elapsed * 4) * 2;
    ctx.fillStyle = '#ffc233';
    ctx.beginPath(); ctx.arc(toX(G.mission.target.x), toY(G.mission.target.z), pulse + 3, 0, Math.PI * 2); ctx.fill();
  }
  // traffic (white), peds (grey)
  ctx.fillStyle = '#dddddd';
  for (const car of G.traffic || []) { ctx.fillRect(toX(car.group.position.x) - 1.5, toY(car.group.position.z) - 1.5, 3, 3); }
  ctx.fillStyle = '#888888';
  for (const ped of G.peds || []) { if (ped.state !== 'fall') ctx.fillRect(toX(ped.mesh.position.x) - 1, toY(ped.mesh.position.z) - 1, 2, 2); }
  // cops (red)
  ctx.fillStyle = '#ff3344';
  for (const cop of (G.cops ? G.cops.cars : [])) { ctx.beginPath(); ctx.arc(toX(cop.group.position.x), toY(cop.group.position.z), 3.5, 0, Math.PI * 2); ctx.fill(); }
  // player arrow
  const pp = G.player.inCar ? G.player.car.group.position : G.player.mesh.position;
  const heading = G.player.inCar ? G.player.car.heading : G.player.heading;
  ctx.save();
  ctx.translate(toX(pp.x), toY(pp.z));
  ctx.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

export function updateHUD(G) {
  if (!els) return;
  els.healthFill.style.width = Math.max(0, G.player.health) + '%';
  els.armorFill.style.width = Math.max(0, G.player.armor) + '%';
  els.money.textContent = '$' + Math.floor(G.player.money).toLocaleString('en-US');
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted.level ? '★' : '☆';
  els.stars.innerHTML = '<span class="stars-on">' + stars + '</span>';
  els.stars.style.color = G.wanted.level > 0 ? '#ffd21f' : '#666677';
  const mins = 18 * 60 + 40 + Math.floor(G.clock.elapsed / 5);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  els.clock.textContent = hh + ':' + mm + '  •  SOLMAR';
  if (G.player.inCar && G.player.car) {
    const mph = Math.round(Math.abs(G.player.car.speed) * 2.237);
    els.speed.textContent = mph + ' mph';
  } else {
    els.speed.textContent = 'ON FOOT';
  }
  els.weapon.textContent = G.player.inCar ? G.player.car.name + '  •  E to exit' : 'PISTOL  ' + G.player.ammo + ' / ' + G.player.reserveAmmo;
  els.fps.textContent = (G.fps ? Math.round(G.fps) : 0) + ' FPS';
  if (G.mission && G.mission.def && G.mission.state === 'active') {
    els.subObjective.textContent = 'Mission ' + G.mission.def.id + ' of ' + MISSIONS.length;
  } else if (G.mission && G.mission.state === 'done') {
    els.subObjective.textContent = 'Mission complete';
  }
  els.crosshair.style.display = (!G.player.inCar && G.state === 'play') ? 'block' : 'none';
  // minimap is a 190x190 canvas redraw: every 3rd frame is plenty
  mmTick++;
  if (mmTick % 3 === 0) drawMinimap(G);
}
