// Pedestrians: walk the sidewalks, flee gunfire and speeding cars, fall and
// fade when hit (non-gory). Kept pooled and respawned near the player.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STREETS } from './city.js';
import { addWanted } from './vehicles.js';

const SHIRTS = [0xd8d8d8, 0x4a7ad8, 0xd84a6a, 0x4ad88a, 0xe8c84a, 0x8a5ad8, 0x3a3a3a];
const PANTS = [0x2a2a3a, 0x3a4a5a, 0x5a3a2a, 0x222222];

function makePedMesh(shirt, pants) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 }));
  head.position.y = 1.68; head.castShadow = true; g.add(head);
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22),
      new THREE.MeshStandardMaterial({ color: pants, roughness: 1 }));
    leg.position.set(sx, 0.32, 0); g.add(leg);
  }
  return g;
}

export function initPeds(G) {
  G.peds = [];
  for (let i = 0; i < CONFIG.pedCount; i++) G.peds.push(spawnPed(G, true));
}

function spawnPed(G, anywhere) {
  const pp = G.player.mesh.position;
  let x = 0, z = 0;
  for (let tries = 0; tries < 20; tries++) {
    const s = STREETS[Math.floor(Math.random() * STREETS.length)];
    const along = -140 + Math.random() * 280;
    const off = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 2);
    if (Math.random() < 0.5) { x = along; z = s + off; } else { x = s + off; z = along; }
    if (Math.hypot(x - pp.x, z - pp.z) > 15) break;
  }
  const mesh = makePedMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], PANTS[Math.floor(Math.random() * PANTS.length)]);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const ped = {
    mesh, heading: Math.random() * Math.PI * 2,
    speed: 1.1 + Math.random() * 0.9,
    state: 'walk', fallTimer: 0, fadeTimer: 0,
    target: null, fleeFrom: null, bob: Math.random() * 10,
  };
  ped.mesh.rotation.y = ped.heading;
  return ped;
}

function pickWalkTarget(ped) {
  // walk along the sidewalk: keep one axis near a street offset, move along the other
  const p = ped.mesh.position;
  const nearX = STREETS.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
  const nearZ = STREETS.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a);
  if (Math.abs(p.x - nearX) < Math.abs(p.z - nearZ)) {
    ped.target = { x: nearX + (Math.random() < 0.5 ? -7.5 : 7.5), z: p.z + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 60) };
  } else {
    ped.target = { x: p.x + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 60), z: nearZ + (Math.random() < 0.5 ? -7.5 : 7.5) };
  }
  ped.target.x = Math.max(-145, Math.min(145, ped.target.x));
  ped.target.z = Math.max(-145, Math.min(145, ped.target.z));
}

export function updatePeds(G, dt) {
  const pp = G.player.mesh.position;
  const threat = G.flags.shotAt; // {x, z, t} set by combat
  for (const ped of G.peds) {
    const p = ped.mesh.position;
    if (ped.state === 'fall') {
      ped.fallTimer -= dt;
      if (ped.fallTimer <= 0) {
        // fade out then respawn elsewhere
        ped.mesh.visible = false;
        const np = spawnPed(G);
        ped.mesh.position.copy(np.mesh.position);
        G.scene.remove(np.mesh);
        ped.mesh.visible = true;
        ped.mesh.rotation.x = 0;
        ped.state = 'walk'; ped.target = null; ped.fleeFrom = null;
      }
      continue;
    }
    // flee triggers
    let flee = null;
    if (threat && G.clock.elapsed - threat.t < 3 && Math.hypot(p.x - threat.x, p.z - threat.z) < 26) flee = threat;
    const car = G.player.car;
    if (car && Math.abs(car.speed) > 4) {
      const cp = car.group.position;
      if (Math.hypot(p.x - cp.x, p.z - cp.z) < 7) flee = { x: cp.x, z: cp.z };
    }
    if (flee) { ped.state = 'flee'; ped.fleeFrom = flee; }
    else if (ped.state === 'flee' && Math.hypot(p.x - ped.fleeFrom.x, p.z - ped.fleeFrom.z) > 30) { ped.state = 'walk'; ped.target = null; }

    if (ped.state === 'flee') {
      const dx = p.x - ped.fleeFrom.x, dz = p.z - ped.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.heading = Math.atan2(dx / d, dz / d);
      p.x += (dx / d) * 4.6 * dt; p.z += (dz / d) * 4.6 * dt;
    } else {
      if (!ped.target) pickWalkTarget(ped);
      const dx = ped.target.x - p.x, dz = ped.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) { ped.target = null; continue; }
      ped.heading = Math.atan2(dx / d, dz / d);
      p.x += (dx / d) * ped.speed * dt; p.z += (dz / d) * ped.speed * dt;
    }
    ped.mesh.rotation.y = ped.heading;
    ped.bob += dt * 8;
    ped.mesh.position.y = Math.abs(Math.sin(ped.bob)) * 0.05;
    // respawn if too far from player
    if (Math.hypot(p.x - pp.x, p.z - pp.z) > 220) {
      const np = spawnPed(G);
      p.copy(np.mesh.position);
      G.scene.remove(np.mesh);
      ped.target = null;
    }
  }
}

export function hitPed(G, ped) {
  if (ped.state === 'fall') return;
  ped.state = 'fall';
  ped.fallTimer = 2.2;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.3;
  G.effects.spawnDust(ped.mesh.position, 6);
}

export function checkCarPedCollision(G, car) {
  if (!car || Math.abs(car.speed) < 3) return;
  const cp = car.group.position;
  for (const ped of G.peds) {
    if (ped.state === 'fall') continue;
    const p = ped.mesh.position;
    if (Math.hypot(p.x - cp.x, p.z - cp.z) < 1.9) {
      hitPed(G, ped);
      if (car.driver === 'player') {
        addWanted(G, 1);
        G.hud.toast('Pedestrian hit! +1 wanted');
        G.effects.shake(0.3);
        G.audio.crash();
      }
    }
  }
}
