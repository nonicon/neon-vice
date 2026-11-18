// Pistol combat: third-person crosshair, hitscan shooting, enemy AI that
// shoots back, ammo, health/armor, reload. Gunfire in the open draws the law.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { addWanted } from './vehicles.js';

export function initCombat(G) {
  G.combat = {
    enemies: [],
    fireTimer: 0,
    lastGunWantedAt: -1e9, // wall-clock ms of the last gunfire wanted rise
    enemiesAlive: (gg) => gg.combat.enemies.filter((e) => e.health > 0).length,
    spawnEnemies: (gg, x, z, n) => spawnEnemies(gg, x, z, n),
    spawnEnemiesAt: (gg, positions) => spawnEnemiesAt(gg, positions),
  };
}

function makeEnemyMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.85 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 }));
  head.position.y = 1.68; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.15, 0.3); g.add(gun);
  // red health bar sprite above head
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide }));
  bar.position.y = 2.1; g.add(bar);
  g.userData.bar = bar;
  return g;
}

export function spawnEnemies(G, x, z, n) {
  const positions = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    positions.push([x + Math.cos(a) * 5, z + Math.sin(a) * 5]);
  }
  spawnEnemiesAt(G, positions);
}

export function spawnEnemiesAt(G, positions) {
  for (const [x, z] of positions) {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.combat.enemies.push({ mesh, health: 100, shootTimer: 1 + Math.random(), speed: 3.2 });
  }
}

export function clearEnemies(G) {
  for (const e of G.combat.enemies) G.scene.remove(e.mesh);
  G.combat.enemies = [];
}

function damagePlayer(G, amount) {
  if (G.player.armor > 0) {
    const absorbed = Math.min(G.player.armor, amount * 0.6);
    G.player.armor -= absorbed;
    amount -= absorbed;
  }
  G.player.health -= amount;
  G.effects.shake(0.25);
  if (G.player.health <= 0) {
    G.player.health = 0;
    G.onGameOver();
  }
}

export function shoot(G) {
  if (G.combat.fireTimer > 0) return;
  if (G.player.ammo <= 0) { G.audio.click(); G.hud.toast('Out of ammo — press R to reload'); return; }
  G.combat.fireTimer = CONFIG.weapons.pistol.fireDelay;
  G.player.ammo--;
  G.stats.shotsFired++;
  G.audio.shot();
  G.flags.shotAt = { x: G.player.mesh.position.x, z: G.player.mesh.position.z, t: G.clock.elapsed };
  const cam = G.camera;
  const origin = G.player.mesh.position.clone(); origin.y = 1.5;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  // muzzle point + tracer start
  const muzzle = origin.clone().add(dir.clone().multiplyScalar(1.2));
  G.effects.muzzle(muzzle);
  // find nearest enemy near the aim ray
  let best = null, bestD = CONFIG.weapons.pistol.range;
  for (const e of G.combat.enemies) {
    if (e.health <= 0) continue;
    const ep = e.mesh.position.clone(); ep.y = 1.2;
    const to = ep.clone().sub(origin);
    const along = to.dot(dir);
    if (along < 1 || along > bestD) continue;
    const perp = to.clone().addScaledVector(dir, -along).length();
    if (perp < 1.6) { best = e; bestD = along; }
  }
  if (best) {
    best.health -= CONFIG.weapons.pistol.damage;
    const hitAt = origin.clone().addScaledVector(dir, bestD);
    G.effects.spawnSparks(hitAt, 8);
    G.effects.tracer(muzzle, hitAt);
    if (best.health <= 0) {
      best.mesh.rotation.x = -Math.PI / 2;
      best.mesh.position.y = 0.3;
      G.hud.toast('Hostile down');
      G.effects.spawnSmoke(best.mesh.position, 6);
      setTimeout(() => { G.scene.remove(best.mesh); }, 2500);
    }
  } else {
    const end = origin.clone().addScaledVector(dir, 40);
    G.effects.tracer(muzzle, end);
  }
  // gunfire in the open draws the law (at most +1 star per cooldown window).
  // The cooldown runs on wall-clock time, not game time: headless frames run
  // ~20x slower than real time, and game-time cooldowns would last minutes.
  if (G.wanted.level < 5 && performance.now() - G.combat.lastGunWantedAt > CONFIG.police.gunfireWantedCooldown * 1000) {
    G.combat.lastGunWantedAt = performance.now();
    addWanted(G, 1);
    G.hud.toast('Gunfire drew the law! +1 wanted');
  }
}

export function reload(G) {
  if (G.player.ammo >= CONFIG.weapons.pistol.mag) return;
  const need = CONFIG.weapons.pistol.mag - G.player.ammo;
  const take = Math.min(need, G.player.reserveAmmo);
  if (take <= 0) { G.hud.toast('No reserve ammo'); return; }
  G.player.ammo += take;
  G.player.reserveAmmo -= take;
  G.audio.reload();
}

export function updateEnemies(G, dt) {
  const pp = G.player.mesh.position;
  for (const e of G.combat.enemies) {
    if (e.health <= 0) continue;
    const p = e.mesh.position;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    e.mesh.lookAt(pp.x, p.y, pp.z);
    if (dist > 14) { p.x += (dx / dist) * e.speed * dt; p.z += (dz / dist) * e.speed * dt; }
    // health bar faces camera
    const bar = e.mesh.userData.bar;
    if (bar) { bar.lookAt(G.camera.position); bar.scale.x = Math.max(0.05, e.health / 100); }
    // shoot back
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && dist < 42) {
      e.shootTimer = 1.3 + Math.random() * 0.9;
      const from = p.clone(); from.y = 1.4;
      const to = pp.clone(); to.y = 1.3;
      G.effects.tracer(from, to);
      G.audio.shot();
      if (Math.random() < 0.55) damagePlayer(G, 6 + Math.random() * 5);
    }
  }
}

export function updateCombat(G, dt) {
  if (G.combat.fireTimer > 0) G.combat.fireTimer -= dt;
  updateEnemies(G, dt);
}
