// Procedural Solmar: street grid, buildings with lit windows, beach + sea,
// marina, palms, streetlights, billboards, landmark club / bank / garage.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export const STREETS = [-140, -100, -60, -20, 20, 60, 100, 140];
const BLOCKS = [-120, -80, -40, 0, 40, 80, 120];
const PALETTE = [0x7a7f93, 0x9a8aaa, 0x6a8a9a, 0xaa9a7a, 0x8a7a9a, 0x5f6a7a, 0x9a7a7a];

function makeWindowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3d4d'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) for (let x = 8; x < 120; x += 16) {
    const lit = Math.random() < 0.45;
    g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd27a' : '#9adfff') : '#14161f';
    g.fillRect(x, y, 10, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeSignTexture(lines, fg, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(lines, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildCity(THREE_, scene, rng) {
  const colliders = [];
  const addCollider = (cx, cz, hw, hd) => colliders.push({ x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd });
  const winTex = makeWindowTexture();

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshStandardMaterial({ color: 0x2e2e3a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  // Roads + sidewalks + dashes
  const roadMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.road, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.sidewalk, roughness: 1 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xc8b25a });
  const roadGeoX = new THREE.PlaneGeometry(310, 11);
  const roadGeoZ = new THREE.PlaneGeometry(11, 310);
  const walkGeoX = new THREE.PlaneGeometry(310, 3);
  const walkGeoZ = new THREE.PlaneGeometry(3, 310);
  const dashGeo = new THREE.PlaneGeometry(2.4, 0.35);
  for (const s of STREETS) {
    const rx = new THREE.Mesh(roadGeoX, roadMat); rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.01, s); rx.receiveShadow = true; scene.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMat); rz.rotation.x = -Math.PI / 2; rz.position.set(s, 0.01, 0); rz.receiveShadow = true; scene.add(rz);
    for (const off of [-7, 7]) {
      const wx = new THREE.Mesh(walkGeoX, walkMat); wx.rotation.x = -Math.PI / 2; wx.position.set(0, 0.015, s + off); scene.add(wx);
      const wz = new THREE.Mesh(walkGeoZ, walkMat); wz.rotation.x = -Math.PI / 2; wz.position.set(s + off, 0.015, 0); scene.add(wz);
    }
  }
  const dashPositions = [];
  for (const s of STREETS) {
    for (let d = -145; d <= 145; d += 12) {
      dashPositions.push({ x: d, z: s, rot: 0 });
      dashPositions.push({ x: s, z: d, rot: Math.PI / 2 });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    dashPositions.forEach((dp, i) => {
      e.set(-Math.PI / 2, 0, dp.rot);
      q.setFromEuler(e);
      v.set(dp.x, 0.02, dp.z);
      m4.compose(v, q, sc);
      dashes.setMatrixAt(i, m4);
    });
  }
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // Buildings (skip landmark blocks)
  const landmarkBlocks = new Set(['100,60', '60,-100', '-60,-60']);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (landmarkBlocks.has(bx + ',' + bz)) continue;
    const distC = Math.hypot(bx, bz);
    const tall = distC < 70;
    const n = rng() < 0.7 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      // keep every footprint inside the block (half-width <= 16 - |offset|)
      // so buildings never intrude onto the roads around the block
      const w = n === 2 ? 10 + rng() * 4 : 16 + rng() * 12;
      const d = n === 2 ? 10 + rng() * 4 : 16 + rng() * 12;
      const cx = bx + (n === 2 ? (k === 0 ? -8 : 8) : 0) + (rng() - 0.5) * 4;
      const cz = bz + (rng() - 0.5) * 4;
      const h = tall ? 18 + rng() * 30 : 6 + rng() * 12;
      const mat = new THREE.MeshStandardMaterial({ color: PALETTE[Math.floor(rng() * PALETTE.length)], map: winTex, roughness: 0.85 });
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, h, d); b.position.set(cx, h / 2, cz);
      b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      addCollider(cx, cz, w / 2, d / 2);
      if (rng() < 0.4) {
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 1 }));
        roof.scale.set(w * 0.35, 2.5, d * 0.35); roof.position.set(cx, h + 1.25, cz); scene.add(roof);
      }
    }
  }

  // Landmarks
  function landmark(cx, cz, w, h, d, color, signText, signColor, signBg) {
    const mat = new THREE.MeshStandardMaterial({ color, map: winTex, roughness: 0.8 });
    const b = new THREE.Mesh(boxGeo, mat);
    b.scale.set(w, h, d); b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true;
    scene.add(b); addCollider(cx, cz, w / 2, d / 2);
    if (signText) {
      const tex = makeSignTexture(signText, signColor, signBg);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
      sign.position.set(cx, h + 1.2, cz + d / 2 + 0.15); scene.add(sign);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.5),
        new THREE.MeshBasicMaterial({ color: signColor, transparent: true, opacity: 0.35 }));
      glow.position.set(cx, h + 1.2, cz + d / 2 + 0.05); scene.add(glow);
    }
    return b;
  }
  landmark(100, 60, 30, 14, 24, 0x3a1f4d, "KANE'S CLUB", '#ff2e88', '#12081a');
  landmark(60, -100, 26, 20, 22, 0x6a6a72, 'SOLMAR BANK', '#ffc233', '#1a1408');
  landmark(-60, -60, 28, 7, 20, 0x1f4a4a, "LENA'S GARAGE", '#22d3ee', '#06181c');

  // Beach + sea (west)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 340),
    new THREE.MeshStandardMaterial({ color: CONFIG.colors.sand, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-192, 0.0, 0); sand.receiveShadow = true; scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 340),
    new THREE.MeshStandardMaterial({ color: CONFIG.colors.sea, roughness: 0.25, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-330, -0.05, 0); scene.add(sea);

  // Marina (east): docks + boats
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  for (const dz of [-24, 0, 24]) {
    const dock = new THREE.Mesh(boxGeo, dockMat);
    dock.scale.set(34, 0.6, 5); dock.position.set(168, 0.3, dz); dock.castShadow = true; scene.add(dock);
  }
  const waterE = new THREE.Mesh(new THREE.PlaneGeometry(70, 340),
    new THREE.MeshStandardMaterial({ color: CONFIG.colors.sea, roughness: 0.25, metalness: 0.2 }));
  waterE.rotation.x = -Math.PI / 2; waterE.position.set(200, -0.05, 0); scene.add(waterE);
  for (let i = 0; i < 3; i++) {
    const hull = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: [0xd8d8d8, 0x2244aa, 0xcc5533][i], roughness: 0.6 }));
    hull.scale.set(9, 1.4, 3); hull.position.set(168, 0.6, [-14, 10, 34][i]); scene.add(hull);
    const cab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    cab.scale.set(3.5, 1.4, 2.2); cab.position.set(168, 1.9, [-14, 10, 34][i]); scene.add(cab);
  }

  // Palms
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 1 });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 5, 6), trunkMat);
    trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 5.4, Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  for (let i = 0; i < 18; i++) palm(-158 - rng() * 14, -150 + i * 17 + rng() * 6);
  for (let i = 0; i < 10; i++) palm(STREETS[Math.floor(rng() * STREETS.length)] + 8, -140 + rng() * 280);

  // Streetlights (emissive bulbs, no real lights for perf)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  let lights = 0;
  for (const sx of STREETS) for (const sz of STREETS) {
    if ((sx + sz) % 80 !== 0 || lights >= 40) continue;
    lights++;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6), poleMat);
    pole.position.set(sx + 7.5, 2.75, sz + 7.5); scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat);
    bulb.position.set(sx + 7.5, 5.6, sz + 7.5); scene.add(bulb);
  }

  // Billboards
  const bbTexts = [['SOLMAR', '#22d3ee'], ['NEON VICE', '#ff2e88'], ['PALM BEACH', '#ffc233'], ['KANE CLUB', '#ff2e88']];
  const bbPos = [[-20, -140], [60, 140], [-140, 40], [140, -60]];
  bbTexts.forEach((bt, i) => {
    const tex = makeSignTexture(bt[0], bt[1], '#0c0c18');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(bbPos[i][0], 9, bbPos[i][1]);
    board.rotation.y = i % 2 === 0 ? 0 : Math.PI / 2;
    scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.5, 6), poleMat);
    post.position.set(bbPos[i][0], 3.2, bbPos[i][1]); scene.add(post);
    addCollider(bbPos[i][0], bbPos[i][1], 0.6, 0.6);
  });

  return {
    colliders,
    spawns: {
      garage: { x: -60, z: -40 }, club: { x: 100, z: 40 }, bank: { x: 60, z: -80 },
      marina: { x: 140, z: 0 }, beach: { x: -165, z: 0 }, downtown: { x: 0, z: 0 },
      start: { x: 60, z: 60 }, dock: { x: 168, z: 0 },
    },
    landmarks: { club: { x: 100, z: 60 }, bank: { x: 60, z: -100 }, garage: { x: -60, z: -60 } },
  };
}

export function isOnRoad(x, z) {
  for (const s of STREETS) if (Math.abs(x - s) < 6.5 || Math.abs(z - s) < 6.5) return true;
  return false;
}
export function nearestRoadPoint(x, z) {
  let best = null, bd = 1e9;
  for (const s of STREETS) {
    const d1 = Math.abs(z - s); if (d1 < bd) { bd = d1; best = { x, z: s }; }
    const d2 = Math.abs(x - s); if (d2 < bd) { bd = d2; best = { x: s, z }; }
  }
  return best;
}
