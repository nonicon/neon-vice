// Deterministic screenshot staging: ?shot=<name>&seed=1 plays the real rules
// forward from a seeded fresh world with a simple autopilot, so each shot is
// a genuine frame of play. window.__shotReady is set by main.js.
// v2 (2026-11-18): reviewed, kept — shots still cover chase / mission / city / title.
import { startMission } from './missions.js';
import { createCar, addWanted } from './vehicles.js';

const WAYPOINTS = [
  { x: 20, z: -60 }, { x: 20, z: 60 }, { x: 60, z: 60 }, { x: 60, z: -60 },
];

export function applyShot(G, name) {
  G.shotMode = name;
  G.autopilot = false;
  G.shotTimer = 0;
  if (name === 'start') {
    G.state = 'title';
    G.hud.showScreen('title');
    return;
  }
  // all play shots start a fresh game (no save)
  G.startGame(false);
  if (name === 'chase') {
    // 3-star chase downtown: player in a red sport car on street x=20, cops behind
    const car = createCar(G, { kind: 'sport', color: 0xd82a4a, x: 20, z: -60, heading: 0, parked: true, driver: 'none' });
    G.player.mesh.position.set(20, 0, -60);
    G.player.inCar = true; G.player.car = car; car.driver = 'player'; car.parked = false;
    G.player.mesh.visible = false;
    startMission(G, 2); // Getaway Driver — objective visible on HUD (adds 2 stars)
    addWanted(G, 1); // total 3 stars
    // two cop cars ahead on the same street, driving away — the camera sees the
    // pursuit ahead while the police-spawned cars chase from behind (minimap)
    const c1 = createCar(G, { kind: 'cop', x: 16, z: 10, heading: 0, driver: 'cop' });
    const c2 = createCar(G, { kind: 'cop', x: 24, z: 18, heading: 0, driver: 'cop' });
    G.shotCops = [c1, c2];
    G._wp = 1; // drive north up street x=20 toward (20,60)
    G.autopilot = true;
    G.hud.setObjective('Mission 3: Getaway Driver — lose the 3-star wanted level');
  } else if (name === 'mission') {
    // on-foot shootout at Kane's club: player south of the club, facing it
    G.player.mesh.position.set(100, 0, 18);
    G.player.heading = 0;
    G.player.mesh.rotation.y = 0;
    G.player.health = 78;
    G.player.ammo = 8;
    G.player.reserveAmmo = 60;
    startMission(G, 3); // Club Takeover
    G.camYaw = 0;
  } else if (name === 'city') {
    // cruising downtown in a sedan along street x=60
    const car = createCar(G, { kind: 'sedan', color: 0x3a6ad8, x: 60, z: 60, heading: Math.PI, parked: true, driver: 'none' });
    G.player.mesh.position.set(60, 0, 60);
    G.player.inCar = true; G.player.car = car; car.driver = 'player'; car.parked = false;
    G.player.mesh.visible = false;
    startMission(G, 0);
    G._wp = 3; // drive south down street x=60 toward (60,-60)
    G.autopilot = true;
  }
  G.state = 'play';
  G.hud.showScreen('play');
}

// Autopilot: steer the player's car toward cycling downtown waypoints.
export function autopilotDrive(G, dt) {
  const car = G.player.car;
  if (!car) return { throttle: 0, steer: 0, brake: false, handbrake: false };
  const p = car.group.position;
  if (!G._wp) G._wp = 0;
  const wp = WAYPOINTS[G._wp % WAYPOINTS.length];
  if (Math.hypot(wp.x - p.x, wp.z - p.z) < 10) G._wp++;
  const target = WAYPOINTS[G._wp % WAYPOINTS.length];
  const dx = target.x - p.x, dz = target.z - p.z;
  const want = Math.atan2(dx, dz);
  let dh = want - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dh * 1.8));
  return { throttle: 0.85, steer, brake: false, handbrake: false };
}
