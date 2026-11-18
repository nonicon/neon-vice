// Story chain of 8 missions + objective beacon + rewards + progression.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { addWanted } from './vehicles.js';
import { clearWanted } from './police.js';

export const MISSIONS = [
  { id: 1, title: 'Back in Solmar', type: 'drive',
    brief: "Lena Cruz: 'Rico! You're back. Get to my garage — we need to talk.'",
    target: 'garage', radius: 8, reward: 500, timer: 0 },
  { id: 2, title: 'Hot Wheels', type: 'steal',
    brief: "Lena: 'Dario Kane's crew parks a Comet GT by the club. Steal it and bring it here.'",
    target: 'garage', stealAt: 'club', radius: 8, reward: 800, timer: 0 },
  { id: 3, title: 'Getaway Driver', type: 'escape',
    brief: "Lena: 'The cops saw you lift that car. Lose them — break line of sight and stay quiet.'",
    target: 'downtown', radius: 10, reward: 1200, timer: 0 },
  { id: 4, title: 'Club Takeover', type: 'shootout',
    brief: "Lena: 'Kane's boys hold his club. Go in on foot and clear them out.'",
    target: 'club', radius: 14, reward: 1500, timer: 0, enemies: 4 },
  { id: 5, title: 'The Big Score', type: 'timed',
    brief: "Lena: 'A bank van is leaving Solmar Bank. Reach the bank before it pulls out — 90 seconds!'",
    target: 'bank', radius: 9, reward: 2500, timer: 90 },
  { id: 6, title: 'Neon Vice', type: 'finale',
    brief: "Lena: 'Kane knows. The whole city is after you. Reach the marina and get out of Solmar!'",
    target: 'marina', radius: 10, reward: 5000, timer: 0 },
  { id: 7, title: "Smuggler's Run", type: 'checkpoints',
    brief: "Lena: 'Kane's couriers run product along the beach. Hit all three drop points before the heat arrives — 150 seconds!'",
    target: 'beach', checkpoints: ['beach', 'downtown', 'marina'], radius: 9, reward: 3500, timer: 150 },
  { id: 8, title: 'King of Solmar', type: 'laststand',
    brief: "Lena: 'It ends tonight. Kane's last crew holds the marina. Clear them out, then take the boat and leave Solmar a legend.'",
    target: 'dock', radius: 8, reward: 7500, timer: 0, enemies: 6 },
];

export function initMissions(G) {
  G.mission = { index: 0, state: 'idle', stage: 0, timer: 0, targetCar: null, delay: 0, wave: 0, totalLeft: 0 };
  // beacon: pulsing cylinder + ring at the objective
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  G.beacon = new THREE.Mesh(geo, mat);
  G.beacon.visible = false;
  G.scene.add(G.beacon);
  const ringGeo = new THREE.RingGeometry(2.5, 3.6, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  G.beaconRing = new THREE.Mesh(ringGeo, ringMat);
  G.beaconRing.rotation.x = -Math.PI / 2;
  G.beaconRing.visible = false;
  G.scene.add(G.beaconRing);
}

function targetPos(G, name) {
  const s = G.city.spawns[name] || G.city.spawns.downtown;
  return { x: s.x, z: s.z };
}

export function startMission(G, idx) {
  const def = MISSIONS[idx];
  if (!def) { G.mission.state = 'done'; return; }
  G.mission.index = idx;
  G.mission.state = 'active';
  G.mission.stage = 0;
  G.mission.timer = def.timer || 0;
  G.mission.targetCar = null;
  G.mission.wave = 0;
  G.mission.totalLeft = def.enemies || 0;
  G.mission.def = def;
  const t = targetPos(G, def.target);
  G.mission.target = t;
  G.hud.setObjective('Mission ' + def.id + ': ' + def.title);
  G.hud.toast(def.title + ' — ' + def.brief, 5);
  if (def.type === 'steal') {
    // park the target Comet GT near the club
    const c = G._createCar({ kind: 'sport', color: 0xffd700, x: G.city.spawns.club.x - 8, z: G.city.spawns.club.z + 6, heading: Math.PI / 2, parked: true, driver: 'none' });
    G.mission.targetCar = c;
    G.mission.target = { x: c.group.position.x, z: c.group.position.z };
    G.hud.setObjective('Mission 2: Steal the gold Comet GT at the club');
  }
  if (def.type === 'escape') {
    addWanted(G, 2);
    G.hud.setObjective('Mission 3: Lose the wanted level (2 stars)');
  }
  if (def.type === 'shootout') {
    // enemies on the street in front of the club (spawns.club is the street point)
    const cx = G.city.spawns.club.x, cz = G.city.spawns.club.z;
    G.combat.spawnEnemiesAt(G, [[cx, cz - 6], [cx - 2, cz], [cx + 2, cz + 2], [cx, cz + 6]]);
    G.hud.setObjective('Mission 4: Clear out Kane\'s club (' + (def.enemies || 4) + ' hostiles)');
  }
  if (def.type === 'timed') {
    addWanted(G, 1);
    G.hud.setObjective('Mission 5: Reach Solmar Bank — ' + def.timer + 's left');
  }
  if (def.type === 'finale') {
    addWanted(G, 4);
    G.hud.setObjective('Mission 6: Escape to the marina — 4 stars!');
  }
  if (def.type === 'checkpoints') {
    addWanted(G, 2);
    G.mission.stage = 0;
    G.mission.target = targetPos(G, def.checkpoints[0]);
    G.hud.setObjective('Mission 7: Hit the beach drop point (1/3) — ' + def.timer + 's left');
  }
  if (def.type === 'laststand') {
    addWanted(G, 3);
    G.mission.wave = 0;
    G.mission.totalLeft = 6;
    const mx = G.city.spawns.marina.x, mz = G.city.spawns.marina.z;
    G.combat.spawnEnemiesAt(G, [[mx - 6, mz - 4], [mx + 5, mz - 2], [mx, mz + 6]]);
    G.hud.setObjective('Mission 8: Clear the marina (6 hostiles)');
  }
  updateBeacon(G);
}

export function updateBeacon(G) {
  const m = G.mission;
  if (!m || m.state !== 'active' || !m.target) { G.beacon.visible = false; G.beaconRing.visible = false; return; }
  G.beacon.visible = true; G.beaconRing.visible = true;
  G.beacon.position.set(m.target.x, 15, m.target.z);
  G.beaconRing.position.set(m.target.x, 0.06, m.target.z);
  const pulse = 1 + Math.sin(G.clock.elapsed * 3) * 0.15;
  G.beacon.scale.set(pulse, 1, pulse);
  G.beaconRing.scale.set(pulse, pulse, 1);
}

function completeMission(G) {
  const def = G.mission.def;
  G.player.money += def.reward;
  G.stats.missionsDone = Math.max(G.stats.missionsDone, def.id);
  G.hud.toast('Mission complete: ' + def.title + '  +$' + def.reward, 4);
  G.audio.fanfare();
  G.effects.spawnSparks(G.player.mesh.position, 16);
  G.mission.state = 'done';
  G.beacon.visible = false; G.beaconRing.visible = false;
  G.hud.setObjective('Mission complete — next job coming up…');
  G.save();
  if (def.id >= MISSIONS.length) {
    G.state = 'complete';
    G.hud.setDone('You took Solmar back, Rico. 8 missions done, $' + Math.floor(G.player.money).toLocaleString('en-US') + ' earned. Kane is finished — the city is yours.');
    G.hud.showScreen('complete');
    G.save();
    return;
  }
  G.mission.delay = 1.0;
}

function failMission(G, reason) {
  G.hud.toast('Mission failed: ' + reason + ' — try again', 4);
  G.mission.delay = 2;
  G.mission.state = 'failed';
  clearWanted(G);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (m.state === 'done' || m.state === 'failed') {
    if (m.delay > 0) {
      m.delay -= dt;
      if (m.delay <= 0) startMission(G, m.state === 'failed' ? m.index : m.index + 1);
    }
    return;
  }
  if (m.state !== 'active') return;
  const def = m.def;
  const pp = G.player.inCar ? G.player.car.group.position : G.player.mesh.position;
  updateBeacon(G);

  if (def.timer > 0) {
    m.timer -= dt;
    G.hud.setObjective('Mission ' + def.id + ': ' + def.title + ' — ' + Math.ceil(Math.max(0, m.timer)) + 's left');
    if (m.timer <= 0) { failMission(G, 'out of time'); return; }
  }

  const distToTarget = m.target ? Math.hypot(pp.x - m.target.x, pp.z - m.target.z) : 1e9;

  switch (def.type) {
    case 'drive':
      if (distToTarget < def.radius) completeMission(G);
      break;
    case 'steal':
      if (m.stage === 0) {
        if (G.player.inCar && G.player.car === m.targetCar) {
          m.stage = 1;
          const t = targetPos(G, def.target);
          m.target = t;
          G.hud.setObjective('Mission 2: Deliver the Comet GT to Lena\'s garage');
          G.hud.toast('Got it! Now deliver it to the garage.');
        }
      } else if (distToTarget < def.radius) completeMission(G);
      break;
    case 'escape':
      if (G.wanted.level === 0) completeMission(G);
      break;
    case 'shootout': {
      const left = G.combat.enemiesAlive(G);
      G.hud.setObjective('Mission 4: Clear out Kane\'s club (' + left + ' hostiles left)');
      if (left === 0) completeMission(G);
      break;
    }
    case 'timed':
      if (distToTarget < def.radius) completeMission(G);
      break;
    case 'finale':
      if (distToTarget < def.radius) completeMission(G);
      break;
    case 'checkpoints': {
      // drive through each drop point in order before the timer runs out
      const names = def.checkpoints;
      if (distToTarget < def.radius) {
        m.stage++;
        if (m.stage >= names.length) { completeMission(G); break; }
        m.target = targetPos(G, names[m.stage]);
        G.hud.toast('Drop point ' + m.stage + '/' + names.length + ' hit — next: ' + names[m.stage]);
        G.audio.pickup();
      } else {
        G.hud.setObjective('Mission 7: Hit the ' + names[m.stage] + ' drop point (' + (m.stage + 1) + '/' + names.length + ') — ' + Math.ceil(Math.max(0, m.timer)) + 's left');
      }
      break;
    }
    case 'laststand': {
      // two waves of 3 at the marina, then reach the boat at the dock
      const left = G.combat.enemiesAlive(G);
      if (m.stage === 0) {
        m.totalLeft = left + (m.wave === 0 ? 3 : 0);
        G.hud.setObjective('Mission 8: Clear the marina (' + m.totalLeft + ' hostiles left)');
        if (left === 0) {
          if (m.wave === 0) {
            m.wave = 1;
            const mx = G.city.spawns.marina.x, mz = G.city.spawns.marina.z;
            G.combat.spawnEnemiesAt(G, [[mx - 8, mz + 2], [mx + 8, mz + 4], [mx - 2, mz - 8]]);
            G.hud.toast("Second wave! Kane's last crew is here.");
          } else {
            m.stage = 1;
            m.target = targetPos(G, 'dock');
            G.hud.setObjective('Mission 8: Get to the boat at the dock!');
            G.hud.toast('Marina clear — get to the boat!');
          }
        }
      } else if (distToTarget < def.radius) completeMission(G);
      break;
    }
    default:
      if (distToTarget < def.radius) completeMission(G);
  }
}

// Side jobs: cash pickups scattered around the city (collected by driving/walking over them).
export function initPickups(G) {
  G.pickups = [];
  const spots = [
    [-120, -20], [-20, 100], [100, -20], [20, -120], [-100, 60], [60, 120],
    [-40, -100], [120, 100], [-140, -100], [40, 40], [-80, 20], [140, 60],
  ];
  const geo = new THREE.CylinderGeometry(0.9, 0.9, 0.25, 12);
  for (const [x, z] of spots) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x35d05a });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.5, z);
    m.rotation.x = Math.PI / 2;
    G.scene.add(m);
    G.pickups.push({ mesh: m, x, z, taken: false, spin: Math.random() * 6 });
  }
}
export function updatePickups(G, dt) {
  const pp = G.player.inCar ? G.player.car.group.position : G.player.mesh.position;
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    pk.spin += dt * 2;
    pk.mesh.rotation.y = pk.spin;
    pk.mesh.position.y = 0.5 + Math.sin(pk.spin * 1.5) * 0.15;
    if (Math.hypot(pp.x - pk.x, pp.z - pk.z) < 2.4) {
      pk.taken = true; pk.mesh.visible = false;
      G.player.money += 100;
      G.audio.pickup();
      G.hud.toast('Cash pickup +$100');
      G.effects.spawnSparks(pk.mesh.position, 8);
    }
  }
}
