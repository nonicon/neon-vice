// Traffic: cars that follow the street grid, stop for trouble ahead, and
// respawn near the player so the city always feels alive.
// v2 (2026-11-18): reviewed, kept — count raised to 12 in config.js.
import { CONFIG } from './config.js';
import { STREETS, nearestRoadPoint } from './city.js';
import { createCar } from './vehicles.js';

const KINDS = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sedan'];
const COLORS = [0x8a8f9a, 0xc8a03a, 0x3a8a6a, 0x9a4a5a, 0x5a7a9a, 0xd8d8d8];

export function initTraffic(G) {
  G.traffic = [];
  for (let i = 0; i < CONFIG.trafficCount; i++) {
    const car = spawnTrafficCar(G, true);
    if (car) G.traffic.push(car);
  }
}

function randomStreetPos(G) {
  const pp = G.player.mesh.position;
  for (let tries = 0; tries < 20; tries++) {
    const s = STREETS[Math.floor(Math.random() * STREETS.length)];
    const along = -140 + Math.random() * 280;
    const x = Math.random() < 0.5 ? s : along;
    const z = x === s ? along : s;
    if (Math.hypot(x - pp.x, z - pp.z) > 25 && Math.hypot(x - pp.x, z - pp.z) < 150) return { x, z };
  }
  const s = STREETS[Math.floor(Math.random() * STREETS.length)];
  return { x: s, z: 40 };
}

function spawnTrafficCar(G, anywhere) {
  const pos = randomStreetPos(G);
  const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
  const car = createCar(G, {
    kind, color: COLORS[Math.floor(Math.random() * COLORS.length)],
    x: pos.x, z: pos.z, heading: 0, traffic: true, driver: 'ai',
  });
  // drive along a street: axis 'x' means moving along x on street z=pos.z etc.
  const onXStreet = STREETS.some((s) => Math.abs(pos.z - s) < 1);
  car.ai = {
    axis: onXStreet ? 'x' : 'z',
    street: onXStreet ? pos.z : pos.x,
    lane: (Math.random() < 0.5 ? -1 : 1) * 2.6,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: 9 + Math.random() * 5,
    wait: 0,
  };
  car.heading = car.ai.axis === 'x' ? (car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.ai.dir > 0 ? 0 : Math.PI);
  return car;
}

function carAhead(G, car, dist) {
  const p = car.group.position;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let nearest = dist;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.group.position.x - p.x, dz = other.group.position.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < nearest && side < 3.2) nearest = along;
  }
  // also stop for peds in the road
  for (const ped of G.peds || []) {
    if (ped.state === 'fall') continue;
    const dx = ped.mesh.position.x - p.x, dz = ped.mesh.position.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < nearest && side < 2.5) nearest = along;
  }
  return nearest;
}

export function updateTraffic(G, dt) {
  const pp = G.player.mesh.position;
  for (let i = G.traffic.length - 1; i >= 0; i--) {
    const car = G.traffic[i];
    if (!car.ai) continue;
    const p = car.group.position;
    // respawn far away cars near the player
    if (Math.hypot(p.x - pp.x, p.z - pp.z) > 210) {
      const pos = randomStreetPos(G);
      p.x = pos.x; p.z = pos.z;
      const onXStreet = STREETS.some((s) => Math.abs(pos.z - s) < 1);
      car.ai.axis = onXStreet ? 'x' : 'z';
      car.ai.street = onXStreet ? pos.z : pos.x;
      car.ai.dir = Math.random() < 0.5 ? 1 : -1;
      car.speed = 0;
      continue;
    }
    if (car.ai.wait > 0) { car.ai.wait -= dt; car.speed = Math.max(0, car.speed - 20 * dt); continue; }
    const ahead = carAhead(G, car, 16);
    const target = ahead < 12 ? 0 : car.ai.speed;
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    const step = car.speed * car.ai.dir * dt;
    if (car.ai.axis === 'x') {
      p.x += step; p.z = car.ai.street + car.ai.lane;
      car.heading = car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      p.z += step; p.x = car.ai.street + car.ai.lane;
      car.heading = car.ai.dir > 0 ? 0 : Math.PI;
    }
    // at an intersection, sometimes turn onto the crossing street
    const onCross = STREETS.some((s) => Math.abs((car.ai.axis === 'x' ? p.x : p.z) - s) < 1.2);
    if (onCross && Math.random() < dt * 0.25) {
      const cross = car.ai.axis === 'x' ? p.x : p.z;
      const snapped = STREETS.reduce((a, b) => Math.abs(b - cross) < Math.abs(a - cross) ? b : a);
      car.ai.axis = car.ai.axis === 'x' ? 'z' : 'x';
      car.ai.street = snapped;
      car.ai.lane = (Math.random() < 0.5 ? -1 : 1) * 2.6;
      car.ai.dir = Math.random() < 0.5 ? 1 : -1;
      if (car.ai.axis === 'x') { p.z = snapped + car.ai.lane; } else { p.x = snapped + car.ai.lane; }
    }
    // keep inside the grid; turn around at the edge
    const along = car.ai.axis === 'x' ? p.x : p.z;
    if (along > 150 || along < -150) car.ai.dir *= -1;
    car.group.rotation.y = car.heading;
    const wheels = car.group.userData.wheels;
    if (wheels) for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.38;
  }
}

export function removeTrafficCar(G, car) {
  const i = G.traffic.indexOf(car);
  if (i >= 0) G.traffic.splice(i, 1);
  const j = G.cars.indexOf(car);
  if (j >= 0) G.cars.splice(j, 1);
  G.scene.remove(car.group);
}
