// Visual effects: GPU point particles (sparks, fire, smoke, dust, blood), tracers, muzzle flashes, bullet-hole decals,
// ejected casings, explosions and the drop-pod re-entry trail.
import * as THREE from 'three';
import { casingMesh } from './guns.js';

function softTex() { const C = document.createElement('canvas'); C.width = C.height = 64; const x = C.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(C); }
function smokeTex() { const C = document.createElement('canvas'); C.width = C.height = 128; const x = C.getContext('2d');
  for (let i = 0; i < 26; i++) { const px = 64 + (Math.random() - 0.5) * 50, py = 64 + (Math.random() - 0.5) * 50, r = 14 + Math.random() * 26; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  return new THREE.CanvasTexture(C); }

class ParticleSystem {
  constructor(max, tex, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.p = []; // particle state
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: innerHeight / 2 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `attribute float size; attribute float rot; attribute vec4 color; varying vec4 vC; varying float vR; varying float vFog; uniform float scale; uniform float fogDensity;
        void main(){ vC = color; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; float d = -mv.z; vFog = 1.0 - exp(-fogDensity*fogDensity*d*d); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; varying vec4 vC; varying float vR; varying float vFog;
        void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR); c = mat2(co,-s,s,co) * c; vec4 t = texture2D(map, c + 0.5); vec4 o = vec4(vC.rgb, vC.a * t.a);
          ${additive ? 'o.rgb *= (1.0 - vFog); o.rgb *= o.a; gl_FragColor = vec4(o.rgb, 1.0);' : 'o.rgb = mix(o.rgb, fogColor, vFog); gl_FragColor = o;'} }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
  }
  emit(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push({ x: o.p.x, y: o.p.y, z: o.p.z, vx: o.v?.x || 0, vy: o.v?.y || 0, vz: o.v?.z || 0, life: o.life, t: 0, s0: o.s0, s1: o.s1 ?? o.s0, c: o.c, a0: o.a0 ?? 1, a1: o.a1 ?? 0, g: o.g ?? 0, drag: o.drag ?? 0, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * (o.spin ?? 1), c1: o.c1, ground: o.ground }); }
  update(dt, fog, groundFn) {
    const P = this.p; let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; q.t += dt; if (q.t >= q.life) continue;
      q.vy -= q.g * dt; const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vy *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.r += q.vr * dt;
      if (q.ground && groundFn) { const gy = groundFn(q.x, q.z); if (q.y < gy) { q.y = gy; q.vy *= -0.3; q.vx *= 0.5; q.vz *= 0.5; } }
      P[w++] = q;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const q = P[i], k = q.t / q.life;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      const c = q.c1 ? _c.copy(q.c).lerp(q.c1, k) : q.c;
      this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = q.a0 + (q.a1 - q.a0) * k;
      this.size[i] = q.s0 + (q.s1 - q.s0) * k; this.rot[i] = q.r;
    }
    const g = this.points.geometry; g.setDrawRange(0, w);
    for (const a of ['position', 'color', 'size', 'rot']) { g.attributes[a].needsUpdate = true; }
    const u = this.points.material.uniforms; u.scale.value = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(35)); if (fog) { u.fogColor.value.copy(fog.color); u.fogDensity.value = fog.density; }
  }
}
const _c = new THREE.Color();
const C = (h) => new THREE.Color(h);
const COLORS = { spark: C(0xffc070), spark2: C(0xff6020), fire: C(0xffa040), fire2: C(0x802010), smoke: C(0x5a5650), dust: C(0x8a7a62), blood: C(0x5a0a08), oil: C(0x1a1a18), flash: C(0xffd090), white: C(0xffffff), red: C(0xff3020), cyan: C(0x60e0ff), concrete: C(0xa49e94), wood: C(0x8a6a44) };

export class Effects {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const soft = softTex(), smoke = smokeTex();
    this.add = new ParticleSystem(2500, soft, true); this.norm = new ParticleSystem(1800, smoke, false);
    scene.add(this.add.points, this.norm.points);
    // tracers
    this.tracers = []; const tg = new THREE.BufferGeometry(); this.tPos = new Float32Array(600 * 6); this.tCol = new Float32Array(600 * 6); this.streaks = [];
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3));
    this.tLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.tLines.frustumCulled = false; scene.add(this.tLines);
    // decals
    const dC = document.createElement('canvas'); dC.width = dC.height = 64; const x = dC.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(10,8,6,0.95)'); gr.addColorStop(0.45, 'rgba(40,36,30,0.6)'); gr.addColorStop(1, 'rgba(60,55,50,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.decalMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(dC), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
    this.decalGeo = new THREE.PlaneGeometry(0.12, 0.12); this.decals = [];
    // casings
    this.casings = [];
    // light flashes
    this.lights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 14, 2); l.userData.t = 0; scene.add(l); this.lights.push(l); }
    // muzzle flash star sprite
    const fC = document.createElement('canvas'); fC.width = fC.height = 128; const fx = fC.getContext('2d'); fx.translate(64, 64);
    for (let i = 0; i < 6; i++) { fx.rotate(Math.PI / 3); const g2 = fx.createLinearGradient(0, 0, 60, 0); g2.addColorStop(0, 'rgba(255,240,200,1)'); g2.addColorStop(1, 'rgba(255,120,30,0)'); fx.fillStyle = g2; fx.beginPath(); fx.moveTo(0, -6); fx.lineTo(60, 0); fx.lineTo(0, 6); fx.fill(); }
    const g3 = fx.createRadialGradient(0, 0, 0, 0, 0, 30); g3.addColorStop(0, 'rgba(255,250,230,1)'); g3.addColorStop(1, 'rgba(255,160,60,0)'); fx.fillStyle = g3; fx.fillRect(-64, -64, 128, 128);
    this.flashMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fC), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.flashes = [];
  }
  groundY(x, z) { return this.world?.terrain ? this.world.terrain.height(x, z) : 0; }
  flashLight(p, intensity = 30, color = 0xffb060, dur = 0.06, dist = 14) { const l = this.lights.reduce((a, b) => (a.userData.t < b.userData.t ? a : b)); l.position.copy(p); l.color.setHex(color); l.intensity = intensity; l.distance = dist; l.userData.t = dur; l.userData.i0 = intensity; l.userData.d = dur; }
  muzzle(muzzleObj, dir, scale = 1, flash = 1) {
    if (flash > 0.3) {
      const g = new THREE.Group(); const s = 0.22 * scale * flash;
      const a = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.6, s * 1.6), this.flashMat); g.add(a);
      for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(s * 2.6, s * 0.9), this.flashMat); b.position.z = -s * 1.1; b.rotation.set(0, Math.PI / 2, r); g.add(b); }
      a.rotation.z = Math.random() * 6; muzzleObj.add(g); this.flashes.push({ g, t: 0.045 });
    }
    const p = muzzleObj.getWorldPosition(new THREE.Vector3());
    if (flash > 0.3) this.flashLight(p, 25 * flash, 0xffb060, 0.05);
    for (let i = 0; i < 3; i++) this.norm.emit({ p, v: dir.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3(0, 0.4, 0)), life: 0.7 + Math.random() * 0.5, s0: 0.08, s1: 0.5, c: COLORS.smoke, a0: 0.25, a1: 0, drag: 2.5 });
  }
  tracer(a, b, color = 0xffc070, speed = 380) { const d = b.clone().sub(a); const L = d.length(); if (L < 1) return; this.tracers.push({ a: a.clone(), dir: d.divideScalar(L), L, t: 0, speed, col: new THREE.Color(color) }); if (this.tracers.length > 199) this.tracers.shift(); }
  // one-frame bullet flight segment (ballistics draws the real trajectory with these)
  streak(a, b, color = 0xffd080, k = 1) { if (this.streaks.length < 380) this.streaks.push([a.x, a.y, a.z, b.x, b.y, b.z, color, k]); }
  impact(p, n, mat = 'concrete', big = 1) {
    const N = n || new THREE.Vector3(0, 1, 0);
    if (mat === 'flesh') { for (let i = 0; i < 8; i++) this.norm.emit({ p, v: rnd(N, 1.5, 1.2), life: 0.5, s0: 0.12, s1: 0.4, c: COLORS.blood, a0: 0.8, a1: 0, g: 4, drag: 3 }); return; }
    if (mat === 'machine') { for (let i = 0; i < 10 * big; i++) this.add.emit({ p, v: rnd(N, 7, 4), life: 0.25 + Math.random() * 0.3, s0: 0.05, s1: 0.01, c: COLORS.spark, c1: COLORS.spark2, g: 12, ground: true }); this.norm.emit({ p, v: rnd(N, 0.5, 0.3), life: 0.8, s0: 0.15, s1: 0.6, c: COLORS.oil, a0: 0.5, a1: 0, drag: 2 }); this.flashLight(p, 6, 0xffa050, 0.04, 5); return; }
    if (mat === 'metal') { for (let i = 0; i < 7; i++) this.add.emit({ p, v: rnd(N, 6, 3), life: 0.2 + Math.random() * 0.25, s0: 0.04, s1: 0.01, c: COLORS.spark, c1: COLORS.spark2, g: 12, ground: true }); }
    const dc = mat === 'wood' ? COLORS.wood : mat === 'dirt' ? COLORS.dust : COLORS.concrete;
    for (let i = 0; i < 5; i++) this.norm.emit({ p, v: rnd(N, 1.8, 1.0), life: 0.6 + Math.random() * 0.6, s0: 0.1, s1: 0.55, c: dc, a0: 0.55, a1: 0, g: 1.5, drag: 2.5 });
    for (let i = 0; i < 4; i++) this.norm.emit({ p, v: rnd(N, 4, 2), life: 0.5, s0: 0.03, s1: 0.03, c: dc, a0: 1, a1: 0.6, g: 9.8, ground: true });
    if (mat !== 'dirt') this.decal(p, N);
  }
  decal(p, n) {
    let d = this.decals.length >= 180 ? this.decals.shift() : null;
    if (!d) { d = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(d); }
    d.position.copy(p).addScaledVector(n, 0.01); d.lookAt(p.clone().add(n)); d.rotateZ(Math.random() * 6); d.scale.setScalar(0.7 + Math.random() * 0.6);
    this.decals.push(d);
  }
  casing(pos, vel, caliber) {
    let c = this.casings.length >= 40 ? this.casings.shift() : null;
    if (c) this.scene.remove(c.m);
    const m = casingMesh(caliber); m.position.copy(pos); this.scene.add(m);
    this.casings.push({ m, v: vel.clone(), w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), t: 0, rest: false });
  }
  explosion(p, size = 1) {
    this.flashLight(p, 120 * size, 0xff9040, 0.25, 30);
    for (let i = 0; i < 40 * size; i++) this.add.emit({ p, v: rnd(UP, 8 * size, 6 * size), life: 0.4 + Math.random() * 0.5, s0: 1.2 * size, s1: 2.5 * size, c: COLORS.fire, c1: COLORS.fire2, a0: 1, a1: 0, drag: 4 });
    for (let i = 0; i < 30 * size; i++) this.add.emit({ p, v: rnd(UP, 18, 10), life: 0.6 + Math.random() * 0.6, s0: 0.06, s1: 0.02, c: COLORS.spark, c1: COLORS.spark2, g: 14, ground: true });
    for (let i = 0; i < 26 * size; i++) this.norm.emit({ p: p.clone().add(rnd(UP, 1, 1)), v: rnd(UP, 3 * size, 2), life: 2.5 + Math.random() * 2, s0: 1.2 * size, s1: 5 * size, c: COLORS.smoke, a0: 0.7, a1: 0, g: -0.6, drag: 1.2 });
  }
  dust(p, n = 30, size = 1) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 4 + Math.random() * 7; this.norm.emit({ p: p.clone().add(new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a))), v: new THREE.Vector3(Math.cos(a) * s, 0.8 + Math.random() * 1.5, Math.sin(a) * s), life: 2 + Math.random() * 1.5, s0: 1 * size, s1: 4 * size, c: COLORS.dust, a0: 0.6, a1: 0, drag: 1.6 }); } }
  trail(p, v) { // re-entry fire trail
    this.add.emit({ p, v: v.clone().multiplyScalar(-0.2).add(rnd(UP, 1, 1)), life: 0.35, s0: 1.4, s1: 0.4, c: COLORS.fire, c1: COLORS.fire2, a0: 1, a1: 0 });
    this.norm.emit({ p, v: rnd(UP, 0.8, 0.5), life: 3, s0: 1.2, s1: 4.5, c: COLORS.smoke, a0: 0.45, a1: 0, drag: 0.6 });
  }
  flare(p, color = COLORS.red) { this.norm.emit({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 2.5 + Math.random(), (Math.random() - 0.5) * 0.4), life: 6, s0: 0.6, s1: 4, c: color, a0: 0.55, a1: 0, drag: 0.3 }); this.add.emit({ p, v: new THREE.Vector3(0, 0.5, 0), life: 0.2, s0: 0.5, s1: 0.2, c: COLORS.red }); }
  laserPuff(p) { this.add.emit({ p, life: 0.06, s0: 0.05, s1: 0.03, c: COLORS.red }); }
  update(dt, fog) {
    this.add.update(dt, fog, (x, z) => this.groundY(x, z)); this.norm.update(dt, fog, (x, z) => this.groundY(x, z));
    // tracers
    let w = 0; const T = this.tracers;
    for (let i = 0; i < T.length; i++) { const t = T[i]; t.t += dt; const head = t.t * t.speed; if (head - 5 > t.L) continue; T[w++] = t; }
    T.length = w;
    for (let i = 0; i < w; i++) { const t = T[i], head = Math.min(t.L, t.t * t.speed), tail = Math.max(0, head - 6);
      const a = t.a, d = t.dir; this.tPos.set([a.x + d.x * tail, a.y + d.y * tail, a.z + d.z * tail, a.x + d.x * head, a.y + d.y * head, a.z + d.z * head], i * 6);
      this.tCol.set([t.col.r * 0.1, t.col.g * 0.1, t.col.b * 0.1, t.col.r * 3, t.col.g * 3, t.col.b * 3], i * 6); }
    let n = w; const c = new THREE.Color();
    for (const st of this.streaks) { if (n >= 599) break; c.setHex(st[6]); const k = st[7]; this.tPos.set([st[0], st[1], st[2], st[3], st[4], st[5]], n * 6); this.tCol.set([c.r * 0.3 * k, c.g * 0.3 * k, c.b * 0.3 * k, c.r * 3 * k, c.g * 3 * k, c.b * 3 * k], n * 6); n++; }
    this.streaks.length = 0; w = n;
    this.tLines.geometry.setDrawRange(0, w * 2); this.tLines.geometry.attributes.position.needsUpdate = true; this.tLines.geometry.attributes.color.needsUpdate = true;
    for (const l of this.lights) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = Math.max(0, l.userData.i0 * l.userData.t / l.userData.d); } else l.intensity = 0; }
    this.flashes = this.flashes.filter((f) => { f.t -= dt; if (f.t <= 0) { f.g.parent?.remove(f.g); f.g.children.forEach((c) => c.geometry.dispose()); return false; } return true; });
    for (const c of this.casings) { if (c.rest) continue; c.t += dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt;
      const gy = this.groundY(c.m.position.x, c.m.position.z) + 0.01; if (c.m.position.y < gy) { c.m.position.y = gy; c.v.multiplyScalar(0.35); c.v.y = Math.abs(c.v.y) * 0.5; c.w.multiplyScalar(0.5); if (c.v.length() < 0.3) { c.rest = true; c.m.rotation.x = Math.PI / 2; } } }
  }
  clear() { for (const d of this.decals) this.scene.remove(d); this.decals = []; for (const c of this.casings) this.scene.remove(c.m); this.casings = []; this.add.p.length = 0; this.norm.p.length = 0; this.tracers.length = 0; }
}
const UP = new THREE.Vector3(0, 1, 0);
function rnd(n, sp, jit) { return new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(jit).addScaledVector(n, sp * (0.4 + Math.random() * 0.6)); }
