// Neon Vice — boot, game loop, screen state machine, camera, player control,
// save/load wiring, screenshot staging. The glue that holds the modules.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mulberry32, hashSeed } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { buildCity } from './city.js';
import { createCar, driveCar, tryEnterNearestCar, exitCar, addWanted } from './vehicles.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { initPeds, updatePeds, checkCarPedCollision } from './pedestrians.js';
import { initPolice, updatePolice, clearWanted } from './police.js';
import { initMissions, startMission, updateMissions, initPickups, updatePickups, MISSIONS } from './missions.js';
import { initCombat, shoot, reload, updateCombat } from './combat.js';
import { buildHUD, updateHUD } from './hud.js';
import { loadSave, saveGame, hasSave } from './save.js';
import { applyShot, autopilotDrive } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

// Hoisted temporaries: the per-frame hot loop allocates nothing.
const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a6ad8, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.34), jacket);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 }));
  head.position.y = 1.7; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.74; g.add(hair);
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 1 });
  for (const sx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
    leg.position.set(sx, 0.32, 0); g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
    arm.position.set(sx * 2.1, 1.05, 0); g.add(arm);
  }
  return g;
}

function collideCircle(G, p, r) {
  for (const c of G.city.colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1));
    const nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d);
    }
  }
}

const G = {
  THREE, scene: null, camera: null, renderer: null,
  rng: mulberry32(hashSeed('neon-vice-' + SEED)),
  clock: { elapsed: 0 },
  fps: 0,
  state: 'title',
  player: {
    mesh: null, heading: 0, health: 100, armor: 50, money: 0,
    ammo: 12, reserveAmmo: 96, inCar: false, car: null, walkBob: 0,
  },
  cars: [], traffic: [], peds: [], cops: { cars: [], foot: [], roadblocks: [] },
  wanted: { level: 0, hiddenTimer: 0, bustTimer: 0, roadblockDone: 0 },
  mission: { index: 0, state: 'idle', stage: 0, timer: 0, target: null, delay: 0 },
  stats: { carsStolen: 0, shotsFired: 0, missionsDone: 0, bestMoney: 0 },
  flags: { muted: false, shotAt: null },
  camYaw: 0, camDist: 9, camFar: false,
  shotMode: null, autopilot: false, shotTimer: 0, _wp: 0,
};

G._createCar = (opts) => createCar(G, opts);

function boot() {
  const canvas = document.getElementById('game');
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer.outputColorSpace = THREE.SRGBColorSpace;

  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(CONFIG.colors.skyDusk);
  G.scene.fog = new THREE.Fog(0x2a1e4f, 90, 320);

  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);
  G.camera.position.set(60, 40, 60);

  const hemi = new THREE.HemisphereLight(0x9a8ad8, 0x3a2a3a, 1.5);
  G.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a3c, 2.2);
  sun.position.set(-80, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 400;
  G.scene.add(sun);
  G.scene.add(new THREE.AmbientLight(0x606080, 0.9));

  G.city = buildCity(THREE, G.scene, G.rng);
  G.effects = new Effects(G.scene);
  G.audio = new AudioSys();
  G.input = new Input(canvas);

  // player
  G.player.mesh = makePlayerMesh();
  G.player.mesh.position.set(G.city.spawns.start.x, 0, G.city.spawns.start.z);
  G.scene.add(G.player.mesh);

  initTraffic(G);
  initPeds(G);
  initPolice(G);
  initCombat(G);
  initMissions(G);
  initPickups(G);

  // starter car parked by the garage
  createCar(G, { kind: 'sedan', color: 0x3a6ad8, x: G.city.spawns.start.x + 4, z: G.city.spawns.start.z, heading: Math.PI / 2, parked: true, driver: 'none' });
  // a few parked cars around the city for stealing
  const parkedSpots = [[20, 22], [-20, -18], [140, 18], [-100, -58], [60, 62], [-60, 102], [140, -18], [-20, 138]];
  const parkedKinds = ['sedan', 'taxi', 'pickup', 'van', 'sedan', 'sport', 'taxi', 'pickup'];
  parkedSpots.forEach(([x, z], i) => createCar(G, { kind: parkedKinds[i], x, z, heading: (i % 4) * Math.PI / 2, parked: true, driver: 'none' }));

  // game actions used by the HUD buttons
  G.startGame = (fromSave) => startGame(fromSave);
  G.togglePause = () => togglePause();
  G.toTitle = () => toTitle();
  G.onGameOver = () => gameOver('WASTED', 'Rico went down in Solmar. The city keeps moving without him.');
  G.onBusted = () => gameOver('BUSTED', 'The Solmar PD caught Rico. Time served — or time to run again.');
  G.save = () => doSave();

  buildHUD(G);
  updateTitleSave();

  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });
  const gesture = () => G.audio.ensure();
  window.addEventListener('keydown', gesture, { once: true });
  window.addEventListener('mousedown', gesture, { once: true });

  if (SHOT) applyShot(G, SHOT);
  else { G.state = 'title'; G.hud.showScreen('title'); }

  window.__game = G;
  window.__shotReady = false;
  window.__test = {
    startGame: (s) => startGame(!!s),
    setWanted: (n) => { G.wanted.level = n; },
    teleport: (x, z) => { G.player.mesh.position.set(x, 0, z); if (G.player.car) G.player.car.group.position.set(x, 0, z); },
    enterNearestCar: () => tryEnterNearestCar(G),
    exitCar: () => { if (G.player.inCar) exitCar(G); },
    state: () => G.state,
    wanted: () => G.wanted.level,
    money: () => G.player.money,
    mission: () => (G.mission.def ? G.mission.def.title : 'none'),
    missionStage: () => G.mission.stage,
    missionIndex: () => G.mission.index,
    startMission: (i) => startMission(G, i),
    shoot: () => shoot(G),
    killEnemies: () => { for (const e of G.combat.enemies) e.health = 0; },
    enemiesAlive: () => G.combat.enemiesAlive(G),
    roadblocks: () => G.cops.roadblocks.length,
    fps: () => Math.round(G.fps * 10) / 10,
  };

  G.renderer.setAnimationLoop(loop);
}

function updateTitleSave() {
  const s = loadSave();
  if (s) {
    G.hud.setTitleSave('Saved game: $' + (s.money || 0).toLocaleString('en-US') + ' • ' + (s.missionsDone || 0) + ' missions done');
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = 'inline-block';
  } else {
    G.hud.setTitleSave('No saved game yet — start a new story.');
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = 'none';
  }
}

function doSave() {
  G.stats.bestMoney = Math.max(G.stats.bestMoney, G.player.money);
  saveGame({
    money: G.player.money,
    missionsDone: G.stats.missionsDone,
    bestMoney: G.stats.bestMoney,
    carsStolen: G.stats.carsStolen,
    pos: G.player.mesh.position,
  });
}

function resetWorld() {
  // remove cop cars and foot cops; traffic and parked cars stay
  if (G.shotCops) {
    for (const c of G.shotCops) {
      const j = G.cars.indexOf(c); if (j >= 0) G.cars.splice(j, 1);
      G.scene.remove(c.group);
    }
    G.shotCops = null;
  }
  for (const cop of [...G.cops.cars]) {
    const j = G.cars.indexOf(cop); if (j >= 0) G.cars.splice(j, 1);
    G.scene.remove(cop.group);
  }
  G.cops.cars = [];
  G.cops.roadblocks = [];
  for (const cop of [...G.cops.foot]) G.scene.remove(cop.mesh);
  G.cops.foot = [];
  if (G.combat) { for (const e of G.combat.enemies) G.scene.remove(e.mesh); G.combat.enemies = []; }
  clearWanted(G);
  G.player.health = 100; G.player.armor = 50;
  G.player.ammo = 12; G.player.reserveAmmo = 96;
  G.player.inCar = false; G.player.car = null;
  G.player.mesh.visible = true;
  G.player.mesh.position.set(G.city.spawns.start.x, 0, G.city.spawns.start.z);
  G.player.heading = 0; G.player.mesh.rotation.y = 0;
  G.camYaw = 0;
  G._wp = 0;
}

function startGame(fromSave) {
  const s = fromSave ? loadSave() : null;
  resetWorld();
  G.player.money = s ? (s.money || 0) : 0;
  G.stats.missionsDone = s ? (s.missionsDone || 0) : 0;
  G.stats.bestMoney = s ? (s.bestMoney || 0) : 0;
  G.stats.carsStolen = s ? (s.carsStolen || 0) : 0;
  if (s && s.pos) G.player.mesh.position.set(s.pos[0], 0, s.pos[2]);
  G.audio.ensure();
  G.audio.musicStart();
  G.state = 'play';
  G.hud.showScreen('play');
  const idx = Math.min(G.stats.missionsDone, MISSIONS.length - 1);
  startMission(G, idx);
  G.hud.toast(s ? 'Welcome back to Solmar, Rico.' : 'Welcome to Solmar, Rico. Get to Lena\'s garage.', 4);
}

function gameOver(title, sub) {
  if (G.state !== 'play') return;
  G.state = title === 'BUSTED' ? 'busted' : 'gameover';
  doSave();
  G.audio.musicStop();
  G.audio.siren(false);
  G.hud.setOver(title, sub + '  Money kept: $' + Math.floor(G.player.money).toLocaleString('en-US'));
  G.hud.showScreen(G.state);
  if (document.pointerLockElement) document.exitPointerLock();
}

function togglePause() {
  if (G.state === 'play') {
    G.state = 'paused';
    G.hud.showScreen('paused');
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (G.state === 'paused') {
    G.state = 'play';
    G.hud.showScreen('play');
  }
}

function toTitle() {
  doSave();
  G.state = 'title';
  G.audio.musicStop();
  G.audio.siren(false);
  resetWorld();
  updateTitleSave();
  G.hud.showScreen('title');
  if (document.pointerLockElement) document.exitPointerLock();
}

function pressed(code) {
  return G.input.wasPressed(code);
}

function updatePlayer(dt) {
  const K = CONFIG.keys;
  const inp = G.input;
  const p = G.player;

  if (pressed(K.interact)) {
    if (p.inCar) exitCar(G);
    else tryEnterNearestCar(G);
  }
  if (pressed(K.camera)) G.camFar = !G.camFar;
  if (pressed(K.mute)) { const m = G.audio.toggleMute(); G.hud.toast(m ? 'Sound muted' : 'Sound on'); }
  if (pressed(K.horn) && p.inCar) G.audio.horn();
  if (pressed(K.reload) && !p.inCar) reload(G);
  if (inp.consumeClick() && !p.inCar && G.state === 'play') shoot(G);

  // mouse look
  const { dx } = inp.takeMouse();
  G.camYaw -= dx * 0.0032;
  G.camYaw = Math.max(-1.2, Math.min(1.2, G.camYaw));

  if (p.inCar && p.car) {
    const throttle = (inp.isDown(K.forward) ? 1 : 0) + (inp.isDown(K.back) ? -1 : 0);
    const steer = (inp.isDown(K.left) ? -1 : 0) + (inp.isDown(K.right) ? 1 : 0);
    const controls = G.autopilot
      ? autopilotDrive(G, dt)
      : { throttle, steer, brake: false, handbrake: inp.isDown(K.handbrake) };
    driveCar(G, p.car, dt, controls);
    checkCarPedCollision(G, p.car);
    p.mesh.position.copy(p.car.group.position);
    G.audio.engine(Math.abs(p.car.speed) / p.car.topSpeed, dt);
    // hint when stopped near a car
    G.hud.setHint('');
  } else {
    // on foot: move relative to camera (temps hoisted, no per-frame allocation)
    const camDir = _camDir;
    G.camera.getWorldDirection(camDir); camDir.y = 0; camDir.normalize();
    const camRight = _camRight;
    camRight.crossVectors(camDir, _up).negate();
    const f = (inp.isDown(K.forward) ? 1 : 0) - (inp.isDown(K.back) ? 1 : 0);
    const r = (inp.isDown(K.right) ? 1 : 0) - (inp.isDown(K.left) ? 1 : 0);
    const move = _move;
    move.set(0, 0, 0).addScaledVector(camDir, f).addScaledVector(camRight, r);
    if (move.lengthSq() > 0) {
      move.normalize();
      const speed = inp.isDown(K.sprint) ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
      p.heading = Math.atan2(move.x, move.z);
      p.mesh.position.x += move.x * speed * dt;
      p.mesh.position.z += move.z * speed * dt;
      p.walkBob += dt * speed * 1.6;
      p.mesh.position.y = Math.abs(Math.sin(p.walkBob)) * 0.06;
    } else p.mesh.position.y = 0;
    p.mesh.rotation.y = p.heading;
    collideCircle(G, p.mesh.position, CONFIG.player.radius);
    p.mesh.position.x = Math.max(-240, Math.min(230, p.mesh.position.x));
    p.mesh.position.z = Math.max(-175, Math.min(175, p.mesh.position.z));
    G.audio.engine(0, dt);
    // hint when near a car
    let near = false;
    for (const car of G.cars) {
      if (car.driver === 'player') continue;
      if (Math.hypot(car.group.position.x - p.mesh.position.x, car.group.position.z - p.mesh.position.z) < 4.5) { near = true; break; }
    }
    G.hud.setHint(near ? 'Press E to enter the car' : '');
  }
}

function updateCamera(dt) {
  const p = G.player;
  const focus = p.inCar && p.car ? p.car.group.position : p.mesh.position;
  const heading = p.inCar && p.car ? p.car.heading : p.heading;
  const dist = p.inCar ? (G.camFar ? 13 : 9) : (G.camFar ? 9 : 6);
  const height = p.inCar ? 4.2 : 3.2;
  const ang = heading + Math.PI + G.camYaw;
  const desired = _desired;
  desired.set(
    focus.x + Math.sin(ang) * dist,
    height,
    focus.z + Math.cos(ang) * dist,
  );
  const k = 1 - Math.pow(0.001, dt);
  G.camera.position.lerp(desired, Math.min(1, k * 1.4));
  const look = _look;
  look.set(focus.x, (p.inCar ? 1.4 : 1.6), focus.z);
  const fwd = _fwd;
  fwd.set(Math.sin(heading), 0, Math.cos(heading));
  look.addScaledVector(fwd, p.inCar ? 7 : 3);
  G.camera.lookAt(look);
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, G._last ? (now - G._last) / 1000 : 0.016);
  if (G._lastWall) {
    const wallDt = Math.max(1, now - G._lastWall);
    const inst = 1000 / wallDt;
    G.fps = G.fps ? G.fps * 0.92 + inst * 0.08 : inst;
  }
  G._last = now; G._lastWall = now;
  G.clock.elapsed += dt;

  if (G.state === 'title') {
    // slow orbit over downtown for the title backdrop
    const t = G.clock.elapsed * 0.05;
    G.camera.position.set(Math.cos(t) * 95, 42, Math.sin(t) * 95);
    G.camera.lookAt(0, 4, 0);
    updateTraffic(G, dt);
    updatePeds(G, dt);
    G.effects.update(dt, G.camera);
  } else if ((G.state === 'play' || G.state === 'paused') && (pressed(CONFIG.keys.pause) || pressed('Escape'))) {
    togglePause();
  } else if (G.state === 'play') {
    updatePlayer(dt);
    if (G.shotCops) for (const c of G.shotCops) driveCar(G, c, dt, { throttle: 0.55, steer: 0, brake: false, handbrake: false });
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateCombat(G, dt);
    updatePickups(G, dt);
    updateCamera(dt);
    G.effects.update(dt, G.camera);
    updateHUD(G);
  } else if (G.state === 'paused') {
    // frozen world; HUD stays
  }
  // screenshot staging: signal readiness after a few seconds of real play
  if (G.shotMode) {
    G.shotTimer += dt;
    if (G.shotTimer > 3 && !window.__shotReady) window.__shotReady = true;
  }
  G.input.clearPressed();
  G.renderer.render(G.scene, G.camera);
}

boot();
