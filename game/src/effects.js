// Particles, tracers, muzzle flashes, skid marks, camera shake.
// v2 (2026-11-18): reviewed, kept — pooled particles, no per-frame allocation.
import * as THREE from 'three';

const MAXP = 400;
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.maxLife = new Float32Array(MAXP);
    for (let i = 0; i < MAXP; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._cursor = 0;
    this._flashes = [];
    this.skids = [];
    this._skidGeo = new THREE.PlaneGeometry(0.5, 1.8);
    this._skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.4, depthWrite: false });
    this.shakeAmt = 0;
  }
  _spawn(x, y, z, n, r, g, b, speed, life, up) {
    for (let k = 0; k < n; k++) {
      const i = this._cursor; this._cursor = (this._cursor + 1) % MAXP;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
      this.vel[i * 3 + 1] = Math.sin(e) * s + (up || 0);
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  spawnDust(p, n = 8) { this._spawn(p.x, p.y + 0.2, p.z, n, 0.6, 0.54, 0.44, 2.2, 0.7, 0.6); }
  spawnSparks(p, n = 12) { this._spawn(p.x, p.y + 0.4, p.z, n, 1.0, 0.65, 0.2, 9, 0.5, 2); }
  spawnSmoke(p, n = 10) { this._spawn(p.x, p.y + 0.5, p.z, n, 0.32, 0.32, 0.36, 1.6, 1.4, 1.6); }
  muzzle(p) { this._spawn(p.x, p.y, p.z, 6, 1.0, 0.85, 0.4, 6, 0.12, 0); }
  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._flashes.push({ obj: line, life: 0.09, max: 0.09 });
  }
  addSkid(p, heading) {
    const m = new THREE.Mesh(this._skidGeo, this._skidMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = heading;
    m.position.set(p.x, 0.03, p.z);
    this.scene.add(m); this.skids.push(m);
    if (this.skids.length > 80) { const old = this.skids.shift(); this.scene.remove(old); }
  }
  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  update(dt, camera) {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 2.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] = 0; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      const f = this._flashes[i]; f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); this._flashes.splice(i, 1); }
      else if (f.obj.material) f.obj.material.opacity = f.life / f.max;
    }
    if (camera && this.shakeAmt > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      camera.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt *= Math.pow(0.02, dt);
    } else this.shakeAmt = 0;
  }
}
