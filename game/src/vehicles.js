// Car models (boxes) + arcade physics + enter/exit/steal.
// v2 (2026-11-18): reviewed, kept — police top speed is now raised per star in police.js.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CAR_DEFS = {
  sedan: { color: 0x3a6ad8, name: 'Vuelo', accel: 1.0, top: 38 },
  sport: { color: 0xd82a4a, name: 'Comet GT', accel: 1.25, top: 46 },
  taxi: { color: 0xe8b820, name: 'Taxi', accel: 0.95, top: 36 },
  pickup: { color: 0x4a7a3a, name: 'Bison', accel: 0.9, top: 34 },
  van: { color: 0x8a8a92, name: 'Mule Van', accel: 0.8, top: 30 },
  cop: { color: 0x11131a, name: 'Interceptor', accel: 1.15, top: 44 },
};

export function makeCarMesh(kind, colorHex) {
  const g = new THREE.Group();
  const color = colorHex ?? (CAR_DEFS[kind] ? CAR_DEFS[kind].color : 0x888888);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.15, -0.25); cabin.castShadow = true; g.add(cabin);
  if (kind === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }));
    bed.position.set(0, 0.95, -1.3); g.add(bed);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
    sign.position.set(0, 1.55, -0.25); g.add(sign);
  }
  if (kind === 'cop') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.5, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.5, 0.15); g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 4.32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62; g.add(stripe);
  }
  // headlights / taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), hl);
    h.position.set(sx, 0.68, 2.16); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tl);
    t.position.set(sx, 0.68, -2.16); g.add(t);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.kind = kind;
  return g;
}

export function createCar(G, opts) {
  const kind = opts.kind || 'sedan';
  const def = CAR_DEFS[kind] || CAR_DEFS.sedan;
  const group = makeCarMesh(kind, opts.color);
  group.position.set(opts.x || 0, 0, opts.z || 0);
  group.rotation.y = opts.heading || 0;
  G.scene.add(group);
  const car = {
    group, kind, name: def.name, color: def.color,
    heading: opts.heading || 0, speed: 0, steerVis: 0,
    accelMul: def.accel, topSpeed: def.top,
    parked: !!opts.parked, isCop: kind === 'cop', isTraffic: !!opts.traffic,
    driver: opts.driver || 'none', // 'player' | 'ai' | 'cop' | 'none'
    ai: null, stuckTimer: 0, lastPos: { x: opts.x || 0, z: opts.z || 0 },
  };
  G.cars.push(car);
  return car;
}

function collideBuildings(G, car) {
  const r = CONFIG.car.radius;
  const p = car.group.position;
  for (const c of G.city.colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1));
    const nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      const push = r - d;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
      if (Math.abs(car.speed) > 6) {
        car.speed *= 0.45;
        if (car.driver === 'player') { G.effects.spawnSparks(p, 8); G.audio.crash(); G.effects.shake(0.35); G.player.health = Math.max(1, G.player.health - 2); }
      } else car.speed *= 0.7;
      return true;
    }
  }
  return false;
}

export function driveCar(G, car, dt, controls) {
  // controls: {throttle -1..1, steer -1..1, brake bool, handbrake bool}
  const cfg = CONFIG.car;
  const top = car.topSpeed;
  if (controls.throttle > 0) car.speed += controls.throttle * cfg.accel * car.accelMul * dt;
  else if (controls.throttle < 0) {
    if (car.speed > 0.5) car.speed -= cfg.brake * dt; // brake
    else car.speed += controls.throttle * cfg.accel * 0.55 * dt; // reverse
  }
  if (controls.brake) car.speed -= Math.sign(car.speed) * cfg.brake * dt * 0.5;
  if (controls.handbrake) { car.speed *= Math.pow(0.25, dt); }
  // drag + rolling resistance
  car.speed -= car.speed * cfg.drag * dt * 0.35;
  if (Math.abs(car.speed) < 0.05 && controls.throttle === 0) car.speed = 0;
  car.speed = Math.max(-cfg.reverseMax, Math.min(top, car.speed));
  const spd = Math.abs(car.speed);
  const turn = controls.steer * cfg.turnRate * dt * Math.min(1, spd / 9) * (car.speed >= 0 ? 1 : -1);
  car.heading += turn;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const p = car.group.position;
  p.x += fx * car.speed * dt;
  p.z += fz * car.speed * dt;
  // world bounds
  p.x = Math.max(-240, Math.min(230, p.x));
  p.z = Math.max(-175, Math.min(175, p.z));
  collideBuildings(G, car);
  // visuals
  car.group.rotation.y = car.heading;
  car.group.rotation.z = -controls.steer * Math.min(0.06, spd * 0.0015);
  const wheels = car.group.userData.wheels;
  if (wheels) {
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += (car.speed * dt) / 0.38;
      if (i < 2) wheels[i].rotation.y = controls.steer * 0.4;
    }
  }
  if (controls.handbrake && spd > 8 && Math.random() < 0.5) {
    G.effects.addSkid(p, car.heading);
    if (Math.random() < 0.3) G.effects.spawnSmoke(p, 2);
  }
  return car.speed;
}

export function tryEnterNearestCar(G) {
  const pp = G.player.mesh.position;
  let best = null, bd = 5.2;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const d = Math.hypot(car.group.position.x - pp.x, car.group.position.z - pp.z);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return null;
  if (best.isCop) { G.hud.toast('Too hot — that one has a cop in it'); return null; }
  const wasParked = best.parked;
  best.parked = false;
  best.driver = 'player';
  best.isTraffic = false;
  G.player.inCar = true; G.player.car = best;
  G.player.mesh.visible = false;
  G.audio.click();
  if (!wasParked) {
    // stealing an occupied car
    addWanted(G, 1);
    G.stats.carsStolen++;
    G.hud.toast('Car stolen! +1 wanted');
    G.effects.spawnDust(best.group.position, 6);
  } else {
    G.hud.toast(best.name + ' — yours now');
  }
  return best;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  const p = car.group.position;
  const sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
  G.player.mesh.position.set(p.x + sx * 2.6, 0, p.z + sz * 2.6);
  G.player.mesh.visible = true;
  G.player.heading = car.heading;
  G.player.mesh.rotation.y = car.heading;
  car.driver = 'none'; car.parked = true; car.speed = 0;
  G.player.inCar = false; G.player.car = null;
  G.audio.click();
}

export function addWanted(G, n) {
  G.wanted.level = Math.max(0, Math.min(5, G.wanted.level + n));
  G.wanted.hiddenTimer = 0;
  G.wanted.lastSeen = G.clock.elapsed;
}
