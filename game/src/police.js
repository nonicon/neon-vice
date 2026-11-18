// Wanted stars + police pursuit. Cop cars chase and ram with predictive
// steering and stuck recovery; foot cops chase on foot; busted when caught
// on foot; wanted decays when hidden; roadblocks at high wanted; a "lay low"
// garage clears stars.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCar, driveCar } from './vehicles.js';
import { nearestRoadPoint } from './city.js';

export function initPolice(G) {
  G.cops = { cars: [], foot: [], roadblocks: [] };
  G.wanted = { level: 0, hiddenTimer: 0, bustTimer: 0, roadblockDone: 0, velX: 0, velZ: 0, _lastX: 0, _lastZ: 0, _lastT: -1 };
}

function spawnCopCar(G) {
  const pp = G.player.inCar ? G.player.car.group.position : G.player.mesh.position;
  const a = Math.random() * Math.PI * 2;
  const d = 55 + Math.random() * 35;
  const pos = nearestRoadPoint(pp.x + Math.cos(a) * d, pp.z + Math.sin(a) * d);
  const car = createCar(G, { kind: 'cop', x: pos.x, z: pos.z, heading: 0, driver: 'cop' });
  // pursuit gets faster as the heat rises
  car.topSpeed = 44 + G.wanted.level * CONFIG.police.copTopBonus;
  car.ai = { stuck: 0, stuckTimer: 0, lastX: pos.x, lastZ: pos.z, reverseTimer: 0, stuckCount: 0, roadblock: false };
  G.cops.cars.push(car);
  return car;
}

function spawnFootCop(G) {
  const pp = G.player.mesh.position;
  const a = Math.random() * Math.PI * 2;
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.85 }));
  body.position.y = 1.05; body.castShadow = true; mesh.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 }));
  head.position.y = 1.68; mesh.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a2a5a }));
  cap.position.y = 1.88; mesh.add(cap);
  mesh.position.set(pp.x + Math.cos(a) * 12, 0, pp.z + Math.sin(a) * 12);
  G.scene.add(mesh);
  const cop = { mesh, heading: 0, speed: 5.2, state: 'chase' };
  G.cops.foot.push(cop);
  return cop;
}

function removeCopCar(G, car) {
  const i = G.cops.cars.indexOf(car); if (i >= 0) G.cops.cars.splice(i, 1);
  const r = G.cops.roadblocks.indexOf(car); if (r >= 0) G.cops.roadblocks.splice(r, 1);
  const j = G.cars.indexOf(car); if (j >= 0) G.cars.splice(j, 1);
  G.scene.remove(car.group);
}
function removeFootCop(G, cop) {
  const i = G.cops.foot.indexOf(cop); if (i >= 0) G.cops.foot.splice(i, 1);
  G.scene.remove(cop.mesh);
}

function patrolCount(G) {
  let n = 0;
  for (const c of G.cops.cars) if (!c.ai || !c.ai.roadblock) n++;
  return n;
}
function lastPatrolCar(G) {
  for (let i = G.cops.cars.length - 1; i >= 0; i--) {
    if (!G.cops.cars[i].ai || !G.cops.cars[i].ai.roadblock) return G.cops.cars[i];
  }
  return null;
}

export function updatePolice(G, dt) {
  const level = G.wanted.level;
  const pp = G.player.inCar ? G.player.car.group.position : G.player.mesh.position;
  const wantedCount = CONFIG.wanted.copCounts[level] || 0;

  // track player velocity for predictive pursuit (ignore teleports)
  if (G.wanted._lastT >= 0 && dt > 0) {
    const dx = pp.x - G.wanted._lastX, dz = pp.z - G.wanted._lastZ;
    const moved = Math.hypot(dx, dz);
    if (moved < 60) {
      const vx = dx / dt, vz = dz / dt;
      const sp = Math.hypot(vx, vz);
      const cl = sp > 40 ? 40 / sp : 1;
      G.wanted.velX = vx * cl; G.wanted.velZ = vz * cl;
    } else { G.wanted.velX = 0; G.wanted.velZ = 0; }
  }
  G.wanted._lastX = pp.x; G.wanted._lastZ = pp.z; G.wanted._lastT = G.clock.elapsed;

  // spawn / despawn PATROL cop cars to match wanted level (roadblock cars
  // are extra and never counted here — previously the loop removed them
  // on the next frame, so roadblocks never persisted)
  while (patrolCount(G) < wantedCount) spawnCopCar(G);
  while (patrolCount(G) > wantedCount) { const c = lastPatrolCar(G); if (!c) break; removeCopCar(G, c); }
  // foot cops only when player is on foot and wanted; faster as heat rises
  const wantFoot = (!G.player.inCar && level >= 1) ? Math.min(2, level) : 0;
  while (G.cops.foot.length < wantFoot) spawnFootCop(G);
  while (G.cops.foot.length > wantFoot) removeFootCop(G, G.cops.foot[G.cops.foot.length - 1]);

  // siren when any cop is active
  G.audio.siren(G.cops.cars.length > 0 || G.cops.foot.length > 0);

  // cop car pursuit: predictive steering toward where the player will be,
  // ram on contact, reverse out when stuck against a building
  const look = CONFIG.police.pursuitLookahead;
  const tx = pp.x + G.wanted.velX * look, tz = pp.z + G.wanted.velZ * look;
  for (const cop of [...G.cops.cars]) {
    if (cop.ai && cop.ai.roadblock) continue; // roadblock cars hold position
    const p = cop.group.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 2.2));
    const ai = cop.ai || (cop.ai = { stuckTimer: 0, lastX: p.x, lastZ: p.z, reverseTimer: 0, stuckCount: 0 });
    // stuck detection: pursuing but barely moving
    if (ai.reverseTimer > 0) {
      ai.reverseTimer -= dt;
      driveCar(G, cop, dt, { throttle: -0.8, steer: -steer, brake: false, handbrake: false });
    } else {
      const throttle = dist > 6 ? 1 : 0.6;
      driveCar(G, cop, dt, { throttle, steer, brake: false, handbrake: false });
      ai.stuckTimer += dt;
      if (ai.stuckTimer >= CONFIG.police.stuckSeconds) {
        const moved = Math.hypot(p.x - ai.lastX, p.z - ai.lastZ);
        ai.lastX = p.x; ai.lastZ = p.z; ai.stuckTimer = 0;
        if (moved < 2) {
          ai.stuckCount++;
          if (ai.stuckCount >= CONFIG.police.maxStucks) {
            const pos = nearestRoadPoint(pp.x + 60, pp.z + 40);
            p.x = pos.x; p.z = pos.z; cop.speed = 0;
            ai.stuckCount = 0; ai.lastX = p.x; ai.lastZ = p.z;
          } else ai.reverseTimer = CONFIG.police.stuckReverse;
        } else ai.stuckCount = 0;
      }
    }
    // ram: push the player's car and slow it
    const pdist = Math.hypot(pp.x - p.x, pp.z - p.z);
    if (G.player.inCar && pdist < 4.6) {
      const pc = G.player.car;
      pc.speed *= Math.pow(0.6, dt * 3);
      if (Math.abs(pc.speed) > 5 && Math.random() < dt * 2) {
        G.effects.spawnSparks(pc.group.position, 6);
        G.audio.crash(); G.effects.shake(0.3);
        G.player.health = Math.max(1, G.player.health - 1);
      }
    }
    // despawn if hopelessly far (patrol cars only)
    if (pdist > 260) { const pos = nearestRoadPoint(pp.x + 60, pp.z + 40); p.x = pos.x; p.z = pos.z; cop.speed = 0; }
  }

  // foot cops chase the player on foot
  const footSpeed = 5.2 + CONFIG.police.footSpeedBonus * Math.max(0, level - 1);
  for (const cop of G.cops.foot) {
    const p = cop.mesh.position;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    cop.heading = Math.atan2(dx, dz);
    cop.speed = footSpeed;
    if (dist > 1.6) { p.x += (dx / dist) * cop.speed * dt; p.z += (dz / dist) * cop.speed * dt; }
    cop.mesh.rotation.y = cop.heading;
  }

  // busted: on foot, a foot cop (or cop car) stays close for bustSeconds
  if (!G.player.inCar && level > 0) {
    let close = false;
    for (const cop of G.cops.foot) if (Math.hypot(cop.mesh.position.x - pp.x, cop.mesh.position.z - pp.z) < 2.6) close = true;
    for (const cop of G.cops.cars) if (Math.hypot(cop.group.position.x - pp.x, cop.group.position.z - pp.z) < 3.2) close = true;
    if (close) {
      G.wanted.bustTimer += dt;
      if (G.wanted.bustTimer > CONFIG.wanted.bustSeconds) { G.onBusted(); return; }
    } else G.wanted.bustTimer = 0;
  } else G.wanted.bustTimer = 0;

  // roadblock at wanted >= 3: park two cop cars across the road ahead once per level
  if (level >= 3 && G.wanted.roadblockDone < level) {
    G.wanted.roadblockDone = level;
    // ahead of the player: along the car's heading when driving, along the
    // player's facing when on foot (roadblocks used to need a car at all)
    const pc = G.player.car;
    const bx0 = G.player.inCar && pc ? pc.group.position.x : pp.x;
    const bz0 = G.player.inCar && pc ? pc.group.position.z : pp.z;
    const hd = G.player.inCar && pc ? pc.heading : G.player.heading;
    {
      const fx = Math.sin(hd), fz = Math.cos(hd);
      const bx = bx0 + fx * 45, bz = bz0 + fz * 45;
      for (const side of [-4, 4]) {
        const car = createCar(G, { kind: 'cop', x: bx + fz * side, z: bz - fx * side, heading: hd + Math.PI / 2, driver: 'cop' });
        car.ai = { stuckTimer: 0, lastX: bx, lastZ: bz, reverseTimer: 0, stuckCount: 0, roadblock: true };
        G.cops.cars.push(car);
        G.cops.roadblocks.push(car);
      }
      G.hud.toast('Roadblock ahead!');
    }
  }
  if (level < 3) {
    G.wanted.roadblockDone = 0;
    // clear roadblocks once the heat drops — they are parked props, not patrol
    while (G.cops.roadblocks.length > 0) removeCopCar(G, G.cops.roadblocks[0]);
  }

  // wanted decay: hidden when no cop within 45 for decaySeconds
  if (level > 0) {
    let nearest = 1e9;
    for (const cop of G.cops.cars) nearest = Math.min(nearest, Math.hypot(cop.group.position.x - pp.x, cop.group.position.z - pp.z));
    for (const cop of G.cops.foot) nearest = Math.min(nearest, Math.hypot(cop.mesh.position.x - pp.x, cop.mesh.position.z - pp.z));
    const playerSpeed = G.player.inCar ? Math.abs(G.player.car.speed) : 0;
    if (nearest > 45 && playerSpeed < 12) {
      G.wanted.hiddenTimer += dt;
      if (G.wanted.hiddenTimer > CONFIG.wanted.decaySeconds) {
        G.wanted.level--; G.wanted.hiddenTimer = 0;
        G.hud.toast(G.wanted.level === 0 ? 'You lost them — wanted cleared' : 'Wanted level dropped to ' + G.wanted.level);
      }
    } else G.wanted.hiddenTimer = 0;
  }

  // lay-low garage: drive into Lena's garage area with no cop near -> clear stars.
  // (Not during the escape mission — losing the cops IS that mission.)
  const escaping = G.mission.state === 'active' && G.mission.def && G.mission.def.type === 'escape';
  const g = G.city.spawns.garage;
  if (level > 0 && !escaping && Math.hypot(pp.x - g.x, pp.z - g.z) < 12) {
    let nearest = 1e9;
    for (const cop of G.cops.cars) nearest = Math.min(nearest, Math.hypot(cop.group.position.x - pp.x, cop.group.position.z - pp.z));
    if (nearest > 40) {
      G.wanted.level = 0; G.wanted.hiddenTimer = 0;
      G.hud.toast("Lena's garage — you laid low, wanted cleared");
      G.audio.pickup();
    }
  }
}

export function clearWanted(G) { G.wanted.level = 0; G.wanted.hiddenTimer = 0; G.wanted.bustTimer = 0; }
