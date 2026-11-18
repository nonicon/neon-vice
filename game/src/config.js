// Neon Vice — tuning constants, colours, key bindings. All numbers in one place.
export const CONFIG = {
  city: {
    BLOCK: 40,          // street spacing; streets at multiples of 40
    GRID: 7,            // streets from -140 to +140
    MIN: -140,
    MAX: 140,
    BEACH_X: -150,      // sand starts west of here
    SEA_X: -185,        // sea plane starts west of here
  },
  player: {
    walkSpeed: 6,
    runSpeed: 9.5,
    maxHealth: 100,
    maxArmor: 50,
    radius: 0.6,
  },
  car: {
    accel: 24,
    maxSpeed: 40,
    reverseMax: 12,
    brake: 46,
    turnRate: 2.0,
    drag: 0.6,
    radius: 2.2,
  },
  weapons: {
    pistol: { damage: 34, mag: 12, reserve: 96, range: 60, fireDelay: 0.22 },
  },
  colors: {
    skyDusk: 0x2a1e4f,
    horizon: 0xff7a3c,
    sun: 0xff9a3c,
    road: 0x30303c,
    sidewalk: 0x3d3d48,
    sea: 0x0e4a6b,
    sand: 0xc2a878,
    neonPink: 0xff2e88,
    neonCyan: 0x22d3ee,
    neonGold: 0xffc233,
  },
  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    sprint: 'ShiftLeft', handbrake: 'Space', interact: 'KeyE',
    reload: 'KeyR', camera: 'KeyC', mute: 'KeyM', pause: 'KeyP', horn: 'KeyH',
  },
  wanted: { decaySeconds: 22, copCounts: [0, 1, 2, 3, 4, 5], bustSeconds: 1.6 },
  police: {
    pursuitLookahead: 0.7,  // seconds of player motion cop cars aim ahead of
    stuckSeconds: 2.5,      // no progress for this long counts as stuck
    stuckReverse: 0.9,      // seconds a stuck cop reverses out
    maxStucks: 3,           // stuck recoveries before the cop respawns near the player
    copTopBonus: 1,         // +top speed per wanted star (base 44)
    footSpeedBonus: 0.35,   // +foot-cop speed per wanted star above 1
    gunfireWantedCooldown: 8, // seconds between wanted rises from gunfire
  },
  missions: { rewards: [500, 800, 1200, 1500, 2500, 5000, 3500, 7500] },
  trafficCount: 12,
  pedCount: 16,
};
export default CONFIG;
