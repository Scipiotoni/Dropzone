// Military vehicles. The driving model is the Odyssey Rush rigid-body sim: raycast spring/damper suspension,
// per-tyre friction circles with surface-dependent grip and rolling resistance, all/rear-wheel drive with a torque
// curve, steering that tightens with speed, handbrake, and impulse-based chassis collisions against terrain and
// world boxes. Controls are the same: W/S throttle & brake/reverse, A/D steer, Space handbrake, V camera, E exit,
// R flip when slow.
import * as THREE from 'three';
import { boxGeo, cylGeo, mergeRigid, collectRefs, hoistStatic } from './geom.js';
import { worldMats } from './props.js';
import { pbr } from './textures.js';
import { audio } from './audio.js';

function vehicle(v) {
  const { mass, rest, wheelR, half, track, axles, arch, steerFront = true, awd = true } = v;
  const k = (mass * 9.81) / (axles.length * 2) / (0.35 * rest);
  const c = 2 * 0.42 * Math.sqrt((k * mass) / (axles.length * 2));
  const wy = -half[1] + arch * wheelR + 0.65 * rest;
  v.spring = Math.round(k); v.damper = Math.round(c); v.wheels = [];
  axles.forEach((z, i) => { const steer = i === 0 && steerFront ? 1 : 0, drive = awd || i > 0 ? 1 : 0; v.wheels.push([-track, wy, z, steer, drive], [track, wy, z, steer, drive]); });
  return v;
}
export const VEHICLES = {
  ltv: vehicle({ name: 'M1151 HMMWV', mass: 2650, hp: 1400, armor: 0.45, fuelCap: 95, fuelUse: 0.09,
    half: [1.1, 0.85, 2.4], com: [0, -0.45, 0.1], track: 0.92, axles: [1.6, -1.6], arch: 0.42, wheelR: 0.47, rest: 0.55, engine: 14500, maxSpeed: 31, steer: 0.55, brake: 26000, offroad: 1.35,
    seats: [[-0.45, 0.0, 0.25], [0.45, 0.0, 0.25], [-0.45, 0.05, -0.75], [0.45, 0.05, -0.75], [0, 0.8, -0.3]], gunSeat: 4, gunPos: [0, 1.45, 0.2], style: 'ltv' }),
  stryker: vehicle({ name: 'Stryker ICV 8×8', mass: 17000, hp: 5200, armor: 0.8, fuelCap: 300, fuelUse: 0.3,
    half: [1.35, 1.2, 3.5], com: [0, -0.5, 0], track: 1.15, axles: [2.5, 1.2, -1.0, -2.3], arch: 0.4, wheelR: 0.58, rest: 0.55, engine: 78000, maxSpeed: 27, steer: 0.4, brake: 170000, offroad: 1.3,
    seats: [[-0.55, 0.3, 2.3], [0.55, 0.9, 0.6], [-0.6, 0.2, -0.6], [0.6, 0.2, -0.6], [-0.6, 0.2, -1.8], [0.6, 0.2, -1.8]], gunSeat: 1, gunPos: [0.3, 1.75, 0.6], style: 'stryker' }),
  technical: vehicle({ name: 'Technical (M2 .50 cal)', mass: 1900, hp: 900, armor: 0.15, fuelCap: 80, fuelUse: 0.07,
    half: [0.95, 0.8, 2.6], com: [0, -0.35, 0.3], track: 0.82, axles: [1.65, -1.55], arch: 0.42, wheelR: 0.43, rest: 0.55, engine: 11500, maxSpeed: 33, steer: 0.55, brake: 18000, offroad: 1.25,
    seats: [[-0.42, 0.0, 0.55], [0.42, 0.0, 0.55], [0, 0.55, -1.4]], gunSeat: 2, gunPos: [0, 1.75, -1.05], style: 'technical' }),
  quad: vehicle({ name: 'ATV Quad', mass: 360, hp: 300, armor: 0.0, fuelCap: 30, fuelUse: 0.04,
    half: [0.6, 0.4, 1.0], com: [0, -0.15, 0], track: 0.6, axles: [0.72, -0.72], arch: 0.2, awd: false, wheelR: 0.34, rest: 0.4, engine: 2600, maxSpeed: 24, steer: 0.62, brake: 3600, offroad: 1.2,
    seats: [[0, 0.12, -0.15]], style: 'quad' }),
  suv: vehicle({ name: 'Civilian SUV', mass: 2100, hp: 800, armor: 0.1, fuelCap: 80, fuelUse: 0.08,
    half: [0.95, 0.85, 2.35], com: [0, -0.35, 0], track: 0.82, axles: [1.45, -1.45], arch: 0.42, wheelR: 0.42, rest: 0.5, engine: 12500, maxSpeed: 36, steer: 0.55, brake: 20000, offroad: 1.0,
    seats: [[-0.42, 0.05, 0.3], [0.42, 0.05, 0.3], [-0.42, 0.05, -0.75], [0.42, 0.05, -0.75]], style: 'suv' }),
  mrap: vehicle({ name: 'MRAP 4×4', mass: 14500, hp: 4200, armor: 0.75, fuelCap: 300, fuelUse: 0.25,
    half: [1.25, 1.35, 3.1], com: [0, -0.6, 0.2], track: 1.05, axles: [2.0, -1.9], arch: 0.4, wheelR: 0.62, rest: 0.6, engine: 62000, maxSpeed: 26, steer: 0.48, brake: 140000, offroad: 1.25,
    seats: [[-0.5, 0.35, 1.4], [0.5, 0.35, 1.4], [-0.55, 0.3, 0.0], [0.55, 0.3, 0.0], [-0.55, 0.3, -1.1], [0.55, 0.3, -1.1]], style: 'mrap' }),
  m35: vehicle({ name: 'M35 Cargo Truck', mass: 6200, hp: 2200, armor: 0.3, fuelCap: 200, fuelUse: 0.18,
    half: [1.2, 1.25, 3.5], com: [0, -0.5, 0.6], track: 0.95, axles: [2.6, -1.0, -2.4], arch: 0.45, wheelR: 0.55, rest: 0.6, engine: 34000, maxSpeed: 24, steer: 0.45, brake: 60000, offroad: 1.3,
    seats: [[-0.45, 0.25, 2.25], [0.45, 0.25, 2.25], [-0.7, 0.3, -0.4], [0.7, 0.3, -0.4], [-0.7, 0.3, -1.6], [0.7, 0.3, -1.6]], style: 'm35' }),
  utv: vehicle({ name: 'Military UTV', mass: 900, hp: 600, armor: 0.1, fuelCap: 45, fuelUse: 0.05,
    half: [0.78, 0.6, 1.5], com: [0, -0.25, 0], track: 0.66, axles: [1.05, -1.0], arch: 0.3, wheelR: 0.38, rest: 0.45, engine: 6400, maxSpeed: 30, steer: 0.62, brake: 9000, offroad: 1.4,
    seats: [[-0.32, 0.05, 0.05], [0.32, 0.05, 0.05], [0, 0.25, -0.85]], style: 'utv' }),
};
export const ENTER_RANGE = 3.8;
const G = 9.81, SUB = 1 / 120;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _qi = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const n3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SURF = { asphalt: { grip: 1.05, roll: 0.012, dust: 0x6a6a68 }, dirt: { grip: 0.82, roll: 0.03, dust: 0x8a7a62 }, grass: { grip: 0.75, roll: 0.035, dust: 0x6a7040 }, rock: { grip: 0.85, roll: 0.02, dust: 0x8a8880 }, built: { grip: 1.0, roll: 0.012, dust: 0x9a948a } };

export class VehicleSim {
  constructor(type, world) {
    const def = (this.def = VEHICLES[type]); this.type = type; this.world = world;
    this.pos = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.vel = new THREE.Vector3(); this.ang = new THREE.Vector3();
    const [hx, hy, hz] = def.half, m = def.mass, k = 1.6;
    this.invI = n3(12 / (m * k * ((2 * hy) ** 2 + (2 * hz) ** 2)), 12 / (m * k * ((2 * hx) ** 2 + (2 * hz) ** 2)), 12 / (m * k * ((2 * hx) ** 2 + (2 * hy) ** 2)));
    this.com = n3(...def.com);
    this.wheels = def.wheels.map((w) => ({ local: n3(w[0], w[1], w[2]), steer: !!w[3], drive: !!w[4], comp: 0, prev: 0, contact: false, spin: 0, spinV: 0, slip: 0, surf: SURF.dirt, point: new THREE.Vector3(), load: 0 }));
    this.nDrive = this.wheels.filter((w) => w.drive).length;
    this.points = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.points.push(n3(sx * hx, sy * hy, sz * hz));
    const per = (len) => Math.max(2, Math.ceil(len / 0.6));
    for (const y of [-hy * 0.4, hy * 0.6]) { const nx = per(hx * 2), nz = per(hz * 2); for (let i = 1; i < nx; i++) { const x = -hx + (2 * hx * i) / nx; this.points.push(n3(x, y, hz), n3(x, y, -hz)); } for (let i = 1; i < nz; i++) { const z = -hz + (2 * hz * i) / nz; this.points.push(n3(hx, y, z), n3(-hx, y, z)); } }
    this.points.push(n3(0, hy, 0), n3(0, -hy, 0), n3(0, -hy, hz * 0.5), n3(0, -hy, -hz * 0.5));
    this.steer = 0; this.rpm = 0; this.throttle = 0; this.fuel = 1; this.impact = 0; this.acc = 0; this.speed = 0; this.maxImpact = 0;
  }
  setState(p, q, vel) { this.pos.copy(p); this.q.copy(q).normalize(); this.vel.copy(vel || n3(0, 0, 0)); this.ang.set(0, 0, 0); }
  ground(x, z, y) { return this.world.col.groundAt(x, z, y, 0.1).y; }
  surface(x, z, onBox) { if (onBox) return SURF.built; const s = this.world.terrain.splatAt(x, z); return s[3] > 0.45 ? SURF.asphalt : s[2] > 0.5 ? SURF.rock : s[1] > s[0] ? SURF.dirt : SURF.grass; }
  normalAt(x, z) { return this.world.terrain.normal(x, z); }
  applyInvI(v, out) { _qi.copy(this.q).invert(); out.copy(v).applyQuaternion(_qi); out.set(out.x * this.invI.x, out.y * this.invI.y, out.z * this.invI.z).applyQuaternion(this.q); return out; }
  impulse(point, J, comW) { this.vel.addScaledVector(J, 1 / this.def.mass); _r.subVectors(point, comW); _c.crossVectors(_r, J); this.applyInvI(_c, _d); this.ang.add(_d); }
  pointVel(point, comW, out) { _r.subVectors(point, comW); return out.crossVectors(this.ang, _r).add(this.vel); }
  contact(point, n, depth, comW, mu = 0.6, e = 0.1) {
    const vp = this.pointVel(point, comW, _a); const vn = vp.dot(n);
    if (vn < 0) {
      _r.subVectors(point, comW); const rn = _b.crossVectors(_r, n); this.applyInvI(rn, _c);
      const k = 1 / this.def.mass + n.dot(_c.cross(_r)); const jn = (-(1 + e) * vn) / k;
      if (-vn > this.impact) this.impact = -vn;
      this.impulse(point, _d.copy(n).multiplyScalar(jn), comW);
      const vp2 = this.pointVel(point, comW, _a); const vt = vp2.addScaledVector(n, -vp2.dot(n)); const vtl = vt.length();
      if (vtl > 1e-4) { const jt = Math.min(mu * jn, vtl / k); this.impulse(point, vt.multiplyScalar(-jt / vtl), comW); }
    }
    if (depth > 0.005) this.pos.addScaledVector(n, Math.min(depth, 0.3) * 0.5);
  }
  step(dt, input) { this.acc += Math.min(dt, 0.1); while (this.acc >= SUB) { this.substep(SUB, input); this.acc -= SUB; } }
  substep(dt, input) {
    const def = this.def, m = def.mass;
    const up = n3(0, 1, 0).applyQuaternion(this.q), fwdBody = n3(0, 0, 1).applyQuaternion(this.q);
    const comW = this.com.clone().applyQuaternion(this.q).add(this.pos);
    const F = n3(0, -G * m, 0), T = n3(0, 0, 0);
    const addForce = (f, at) => { F.add(f); _r.subVectors(at, comW); T.add(_c.crossVectors(_r, f)); };
    const vLongBody = this.vel.dot(fwdBody); this.speed = vLongBody;
    let thr = 0, brake = 0; const w = input.throttle;
    if (w > 0) { if (vLongBody < -1.2) brake = 1; else thr = w; } else if (w < 0) { if (vLongBody > 1.2) brake = 1; else thr = w; }
    const canDrive = this.fuel > 0 && !this.broken; if (!canDrive) thr = 0;
    this.throttle = thr; this.braking = !!brake || !!input.handbrake;
    const steerTarget = input.steer * def.steer / (1 + Math.abs(vLongBody) * 0.045);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 6);
    const maxV = thr >= 0 ? def.maxSpeed : def.maxSpeed * 0.35; const curve = Math.max(0, 1 - (Math.abs(vLongBody) / maxV) ** 2);
    const L = def.rest + def.wheelR; let contacts = 0;
    for (const wh of this.wheels) {
      const mount = wh.local.clone().applyQuaternion(this.q).add(this.pos);
      let t = -1; const f = (tt) => { const y = mount.y - up.y * tt; return y - this.ground(mount.x - up.x * tt, mount.z - up.z * tt, mount.y + 0.2); };
      if (f(0) < 0) t = 0; else { let prev = 0; for (let s = 1; s <= 4; s++) { const tt = (L * s) / 4; if (f(tt) < 0) { let a = prev, b = tt; for (let k = 0; k < 5; k++) { const mm = (a + b) / 2; if (f(mm) < 0) b = mm; else a = mm; } t = b; break; } prev = tt; } }
      wh.prev = wh.comp;
      if (t < 0) { wh.contact = false; wh.comp = 0; wh.load = 0; wh.spinV *= 0.995; if (wh.drive && canDrive) wh.spinV += thr * 40 * dt; continue; }
      contacts++; wh.contact = true; wh.comp = L - t;
      const P = wh.point.copy(mount).addScaledVector(up, -t);
      const tg = this.world.terrain.height(P.x, P.z); const onBox = P.y > tg + 0.08;
      const n = onBox ? n3(0, 1, 0) : this.normalAt(P.x, P.z);
      const surf = this.surface(P.x, P.z, onBox); wh.surf = surf;
      const compVel = (wh.comp - wh.prev) / dt; let Fs = def.spring * wh.comp + def.damper * compVel;
      if (wh.comp > def.rest * 0.92) Fs += (wh.comp - def.rest * 0.92) * def.spring * 8;
      Fs = Math.max(0, Fs); wh.load = Fs; addForce(up.clone().multiplyScalar(Fs), P);
      const fwd = (wh.steer ? n3(Math.sin(this.steer), 0, Math.cos(this.steer)) : n3(0, 0, 1)).applyQuaternion(this.q);
      fwd.addScaledVector(n, -fwd.dot(n)).normalize(); const side = new THREE.Vector3().crossVectors(n, fwd).normalize();
      const vp = this.pointVel(P, comW, new THREE.Vector3()); const vLong = vp.dot(fwd), vLat = vp.dot(side); const N = Fs;
      let grip = surf.grip * (onBox ? 1 : def.offroad || 1); if (input.handbrake && !wh.steer) grip *= 0.45;
      let Fx = 0;
      if (wh.drive && canDrive) Fx += (thr * def.engine * curve) / this.nDrive;
      if (brake) Fx -= Math.max(-def.brake / 4, Math.min(def.brake / 4, vLong * N * 4));
      if (input.handbrake && !wh.steer) Fx -= Math.max(-def.brake / 3, Math.min(def.brake / 3, vLong * N * 4));
      if (!thr && !brake && Math.abs(vLong) < 1.5) Fx -= vLong * N * 1.5;
      Fx -= surf.roll * N * Math.tanh(vLong * 2);
      let Fy = -vLat * N * 2.4; const maxF = grip * N; const mag = Math.hypot(Fx, Fy); wh.slip = 0;
      if (mag > maxF && mag > 0) { const s = maxF / mag; wh.slip = 1 - s; Fx *= s; Fy *= s; }
      addForce(fwd.clone().multiplyScalar(Fx).addScaledVector(side, Fy), P);
      const target = vLong / def.wheelR + (wh.drive && wh.slip > 0.2 ? thr * 25 : 0); wh.spinV += (target - wh.spinV) * Math.min(1, dt * 20);
    }
    this.grounded = contacts;
    const sp = this.vel.length(); F.addScaledVector(this.vel, -1.1 * sp);
    this.vel.addScaledVector(F, dt / m); this.applyInvI(T, _d); this.ang.addScaledVector(_d, dt); this.ang.multiplyScalar(Math.exp(-0.25 * dt));
    // chassis collisions against terrain and world boxes
    this.impact = 0; const rad = Math.hypot(...def.half) + 1; const near = this.world.col.near(this.pos.x, this.pos.z, rad, this._near || (this._near = []));
    for (const p of this.points) {
      const P = p.clone().applyQuaternion(this.q).add(this.pos);
      const g = this.world.terrain.height(P.x, P.z);
      if (P.y < g) { const nn = this.normalAt(P.x, P.z); this.contact(P, nn, (g - P.y) * nn.y, comW, 0.5, 0.05); }
      for (const c of near) {
        if (!c.solid || c.noRay || c.vehicle === this || (c.y1 - c.y0) > 200) continue;
        const [lx, lz] = this.world.col.toLocal(c, P.x, P.z); const cy = (c.y0 + c.y1) / 2, hyc = (c.y1 - c.y0) / 2, ly = P.y - cy;
        const px = c.hw - Math.abs(lx), py = hyc - Math.abs(ly), pz = c.hd - Math.abs(lz);
        if (px <= 0 || py <= 0 || pz <= 0) continue;
        let nl; if (py < px && py < pz) nl = [0, Math.sign(ly) || 1, 0]; else if (px < pz) nl = [Math.sign(lx) || 1, 0, 0]; else nl = [0, 0, Math.sign(lz) || 1];
        const [wx, wz] = this.world.col.toWorldDir(c, nl[0], nl[2]);
        this.contact(P, n3(wx, nl[1], wz), Math.min(px, py, pz), comW, 0.4, 0.15);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    const wq = _qt.set(this.ang.x, this.ang.y, this.ang.z, 0).multiply(this.q);
    this.q.x += 0.5 * wq.x * dt; this.q.y += 0.5 * wq.y * dt; this.q.z += 0.5 * wq.z * dt; this.q.w += 0.5 * wq.w * dt; this.q.normalize();
    let ws = 0; for (const wh of this.wheels) if (wh.drive) ws += Math.abs(wh.spinV); ws /= this.nDrive;
    this.rpm += (Math.min(1.2, (ws * def.wheelR) / def.maxSpeed + Math.abs(thr) * 0.25) - this.rpm) * Math.min(1, dt * 8);
    for (const wh of this.wheels) wh.spin += wh.spinV * dt;
    if (this.impact > this.maxImpact) this.maxImpact = this.impact;
    this.fuel = Math.max(0, this.fuel - Math.abs(thr) * def.fuelUse * dt / def.fuelCap);
  }
  flip() { const fwd = n3(0, 0, 1).applyQuaternion(this.q); const yaw = Math.atan2(fwd.x, fwd.z); this.q.setFromAxisAngle(n3(0, 1, 0), yaw); this.pos.y = this.world.terrain.height(this.pos.x, this.pos.z) + 1.8; this.vel.set(0, 0, 0); this.ang.set(0, 0, 0); }
}

// ------------------------------------------------------------------ detailed military vehicle models
let VM = null;
function vmats() {
  if (VM) return VM; const M = worldMats();
  VM = { ...M, olive: pbr('paintGreen', { color: 0xa0a890 }), tan: pbr('paintWhite', { color: 0xb8a07a }), canvas: pbr('sandbag', { metal: 0, color: 0x8a8a60 }),
    tire: pbr('rubber', { metal: 0 }), glassDark: new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6, transparent: true, opacity: 0.75 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2d0, emissiveIntensity: 0.2 }), tail: new THREE.MeshStandardMaterial({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.2 }) };
  return VM;
}
export function makeVehicleModel(type, variant = 0) {
  const def = VEHICLES[type]; const M = vmats(); const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const paint = variant % 2 ? M.tan : M.olive;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const [hx, hy, hz] = def.half;
  if (type === 'ltv') {
    add(boxGeo(2.2, 0.6, 4.6, 1.5), paint, 0, -0.25, 0);                                    // lower body / sills
    add(boxGeo(2.15, 0.25, 1.6, 1.5), paint, 0, 0.13, 1.45, -0.06);                           // hood
    for (let i = 0; i < 6; i++) add(boxGeo(1.3, 0.02, 0.06), M.machineDark, 0, 0.27, 0.95 + i * 0.16);   // hood vents
    add(boxGeo(1.9, 0.8, 0.1), M.machineDark, 0, -0.15, 2.3);                                 // grille
    for (let i = 0; i < 7; i++) add(boxGeo(0.05, 0.55, 0.12), M.steel, -0.7 + i * 0.23, -0.12, 2.33);
    add(boxGeo(2.1, 0.85, 2.3, 1.5), paint, 0, 0.62, -0.35);                                  // armoured cab
    add(boxGeo(2.0, 0.5, 0.06), M.glassDark, 0, 0.72, 0.8, -0.18);                            // windscreen (two panes)
    add(boxGeo(0.06, 0.55, 0.08), paint, 0, 0.72, 0.82, -0.18);
    for (const sx of [-1, 1]) { add(boxGeo(0.05, 0.42, 0.85), M.glassDark, sx * 1.06, 0.72, 0.15); add(boxGeo(0.05, 0.42, 0.75), M.glassDark, sx * 1.06, 0.72, -0.85); add(boxGeo(0.06, 0.06, 0.12), M.steel, sx * 1.08, 0.35, 0.4); add(boxGeo(0.12, 0.25, 0.04), M.machineDark, sx * 1.22, 0.85, 0.75); }
    add(boxGeo(2.15, 0.65, 1.0, 1.5), paint, 0, 0.0, -1.95);                                  // rear cargo deck
    add(cylGeo(0.42, 0.42, 0.25, 16).rotateX(Math.PI / 2), M.tire, 0, 0.55, -2.35);          // spare? (rear)
    for (const sx of [-0.6, 0.6]) add(boxGeo(0.35, 0.45, 0.16), M.green, sx, 0.45, -2.42);  // jerry cans
    add(cylGeo(0.62, 0.62, 0.12, 20), paint, 0, 1.12, -0.35); add(boxGeo(1.0, 0.5, 0.06), paint, 0, 1.4, 0.15, -0.1);  // turret ring + gun shield
    const mg = add(cylGeo(0.035, 0.03, 1.4, 8).rotateX(Math.PI / 2), M.steel, 0, 1.45, 0.5); add(boxGeo(0.18, 0.18, 0.5), M.steel, 0, 1.45, -0.05); add(boxGeo(0.2, 0.15, 0.25), M.green, 0.18, 1.32, 0.0);
    for (const sx of [-1, 1]) { add(boxGeo(0.25, 0.14, 0.06), M.head, sx * 0.75, 0.0, 2.33); add(boxGeo(0.12, 0.12, 0.05), M.tail, sx * 0.95, 0.05, -2.47); }
    add(boxGeo(2.25, 0.18, 0.18), M.steel, 0, -0.45, 2.35); add(boxGeo(2.2, 0.15, 0.15), M.steel, 0, -0.45, -2.45);   // bumpers
    for (const sx of [-1, 1]) add(boxGeo(0.06, 0.06, 1.2), M.steel, sx * 0.4, 1.1, 1.6, -0.6); // antenna mounts
    add(cylGeo(0.01, 0.006, 2.2, 4), M.steel, -0.9, 2.0, -2.2, 0.15, 0, 0);
    body.position.y = 0.1;
  } else if (type === 'mrap') {
    // V-hull, tall armoured capsule with thick ballistic glass and a rear door
    add(boxGeo(2.4, 0.5, 6.0, 2), M.machineDark, 0, -0.95, 0);
    const hull = new THREE.Shape([new THREE.Vector2(-0.5, -0.55), new THREE.Vector2(0.5, -0.55), new THREE.Vector2(1.25, 0.1), new THREE.Vector2(1.25, 1.2), new THREE.Vector2(1.05, 1.45), new THREE.Vector2(-1.05, 1.45), new THREE.Vector2(-1.25, 1.2), new THREE.Vector2(-1.25, 0.1)]);
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 4.2, bevelEnabled: false }); hg.translate(0, 0, -2.6); hg.scale(1, 1, 1); for (let i = 0; i < hg.attributes.uv.count; i++) hg.attributes.uv.setXY(i, hg.attributes.uv.getX(i) * 0.5, hg.attributes.uv.getY(i) * 0.5);
    add(hg, paint, 0, -0.35, 0);
    add(boxGeo(2.3, 0.9, 1.6, 2), paint, 0, -0.1, 2.25);                                        // engine bay
    add(boxGeo(2.1, 0.75, 0.08), M.glassDark, 0, 0.75, 1.62, -0.35);                          // thick windscreen
    for (const sx of [-1, 1]) { add(boxGeo(0.08, 0.5, 0.6), M.glassDark, sx * 1.27, 0.65, 1.0); add(boxGeo(0.06, 0.32, 0.4), M.glassDark, sx * 1.27, 0.6, -0.5); add(boxGeo(0.06, 0.32, 0.4), M.glassDark, sx * 1.27, 0.6, -1.4); add(boxGeo(0.16, 0.08, 1.1), M.steel, sx * 1.3, 0.1, -0.9); }
    for (let i = 0; i < 9; i++) add(boxGeo(1.6, 0.05, 0.08), M.machineDark, 0, -0.05, 3.06, 0, 0, 0).position.y = -0.35 + i * 0.08;
    add(boxGeo(1.0, 1.3, 0.08), paint, 0, 0.35, -2.62); add(boxGeo(0.4, 0.3, 0.06), M.glassDark, 0, 0.75, -2.67); // rear door + port
    add(cylGeo(0.7, 0.7, 0.2, 18), paint, 0, 1.2, -0.2); add(boxGeo(1.2, 0.55, 0.08), paint, 0, 1.55, 0.35, -0.1); add(cylGeo(0.04, 0.035, 1.5, 8).rotateX(Math.PI / 2), M.steel, 0, 1.6, 0.9);
    for (const sx of [-1, 1]) { add(boxGeo(0.3, 0.15, 0.06), M.head, sx * 0.85, 0.0, 3.06); add(boxGeo(0.14, 0.14, 0.05), M.tail, sx * 1.1, -0.2, -2.67); add(boxGeo(0.5, 0.4, 0.7), M.steel, sx * 1.3, -0.65, 2.35); }
    for (const sx of [-1, 1]) for (const z of [0.4, -1.0]) add(boxGeo(0.06, 0.7, 0.9), M.steel, sx * 1.29, 0.1, z); // door outlines
  } else if (type === 'm35') {
    add(boxGeo(1.3, 0.25, 7.0), M.machineDark, 0, -0.7, 0);                                   // ladder frame
    add(boxGeo(2.1, 0.8, 1.6, 2), paint, 0, -0.1, 2.85); add(boxGeo(1.6, 0.06, 1.6), paint, 0, 0.32, 2.85, -0.08);   // hood + fenders
    for (const sx of [-1, 1]) add(boxGeo(0.45, 0.12, 1.5), paint, sx * 0.95, -0.35, 2.85);
    add(boxGeo(1.7, 0.7, 0.06), M.machineDark, 0, -0.1, 3.66); for (let i = 0; i < 6; i++) add(boxGeo(0.04, 0.6, 0.08), M.steel, -0.6 + i * 0.24, -0.1, 3.69);
    add(boxGeo(2.2, 1.05, 1.3, 2), paint, 0, 0.55, 1.5);                                      // cab
    add(boxGeo(2.0, 0.5, 0.06), M.glassDark, 0, 0.75, 2.16, -0.05);
    for (const sx of [-1, 1]) { add(boxGeo(0.06, 0.45, 0.9), M.glassDark, sx * 1.11, 0.72, 1.5); add(boxGeo(0.1, 0.3, 0.04), M.machineDark, sx * 1.25, 0.75, 2.2); }
    add(boxGeo(2.4, 0.15, 4.4), M.wood, 0, -0.3, -1.2);                                       // cargo bed
    for (const sx of [-1, 1]) add(boxGeo(0.06, 0.55, 4.4), paint, sx * 1.18, 0.0, -1.2);
    add(boxGeo(2.4, 0.55, 0.06), paint, 0, 0.0, -3.4);
    for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(1.2, 0.035, 6, 20, Math.PI), M.steel, 0, 0.25, -3.2 + i * 1.0, 0, Math.PI / 2, 0); // canvas hoops
    const cv = new THREE.CylinderGeometry(1.21, 1.21, 4.3, 20, 1, true, -Math.PI / 2, Math.PI); cv.rotateX(Math.PI / 2); cv.rotateZ(Math.PI / 2); for (let i = 0; i < cv.attributes.uv.count; i++) cv.attributes.uv.setXY(i, cv.attributes.uv.getX(i) * 3, cv.attributes.uv.getY(i) * 2);
    const canvasMat = M.canvas.clone(); canvasMat.side = THREE.DoubleSide; add(cv, canvasMat, 0, 0.25, -1.2);
    for (const sx of [-1, 1]) { add(boxGeo(0.25, 0.14, 0.06), M.head, sx * 0.7, -0.05, 3.67); add(boxGeo(0.14, 0.14, 0.05), M.tail, sx * 1.0, -0.4, -3.44); add(cylGeo(0.25, 0.25, 0.7, 14).rotateX(Math.PI / 2), M.steel, sx * 1.0, -0.55, 0.5); }
    add(cylGeo(0.06, 0.06, 1.2, 8), M.steel, 0.95, 1.0, 1.0);                                 // exhaust stack
  } else if (type === 'stryker') {
    add(boxGeo(2.7, 1.3, 6.6, 2), paint, 0, -0.05, 0);                                       // hull
    add(boxGeo(2.6, 0.6, 1.4, 2), paint, 0, -0.25, 3.3, 0.5);                                 // sloped glacis
    add(boxGeo(2.5, 0.25, 6.4, 2), paint, 0, 0.72, -0.1);                                     // roof
    for (const sx of [-1, 1]) { add(boxGeo(0.1, 0.9, 6.2), M.steel, sx * 1.38, -0.05, -0.05); for (let i = 0; i < 9; i++) add(boxGeo(0.12, 0.35, 0.5), M.machineDark, sx * 1.42, 0.3, -2.8 + i * 0.7); } // slat armour + stowage
    add(boxGeo(0.7, 0.35, 0.5), M.glassDark, -0.75, 0.6, 2.75, -0.5);                         // driver's vision block
    const rws = new THREE.Group(); rws.position.set(0.3, 1.0, 0.6); body.add(rws); g.userData.turret = rws;
    add(boxGeo(0.7, 0.5, 0.8, 2), M.machineDark, 0, 0.25, 0, 0, 0, 0, rws); add(cylGeo(0.05, 0.045, 1.4, 10).rotateX(Math.PI / 2), M.steel, 0, 0.35, 0.95, 0, 0, 0, rws); add(boxGeo(0.25, 0.25, 0.3), M.glassDark, 0.3, 0.45, 0.2, 0, 0, 0, rws);
    add(boxGeo(1.6, 1.0, 0.1), paint, 0, -0.05, -3.32); for (const sx of [-1, 1]) { add(boxGeo(0.25, 0.12, 0.06), M.head, sx * 1.0, 0.25, 3.5); add(boxGeo(0.14, 0.14, 0.05), M.tail, sx * 1.2, 0.1, -3.33); }
    for (let i = 0; i < 4; i++) add(cylGeo(0.012, 0.008, 2.4, 4), M.steel, -1.1 + i * 0.1, 2.0, -3.0, 0.1 * i, 0, 0);  // antennas
  } else if (type === 'technical') {
    const pm = [M.white, M.red, M.blue][variant % 3];
    add(boxGeo(1.9, 0.55, 5.1, 1.5), pm, 0, -0.25, 0); add(boxGeo(1.85, 0.22, 1.4, 1.5), pm, 0, 0.12, 1.85, -0.06);
    add(boxGeo(1.85, 0.75, 1.5, 1.5), pm, 0, 0.45, 0.6); add(boxGeo(1.75, 0.45, 0.05), M.glassDark, 0, 0.55, 1.36, -0.4); for (const sx of [-1, 1]) add(boxGeo(0.05, 0.38, 1.1), M.glassDark, sx * 0.93, 0.52, 0.6);
    add(boxGeo(1.9, 0.08, 2.2), M.rust, 0, 0.05, -1.4); for (const sx of [-1, 1]) add(boxGeo(0.06, 0.45, 2.2), pm, sx * 0.93, 0.25, -1.4); add(boxGeo(1.9, 0.45, 0.06), pm, 0, 0.25, -2.52);
    add(cylGeo(0.04, 0.04, 0.9, 6), M.steel, 0, 0.55, -1.05); add(boxGeo(0.55, 0.22, 0.6), M.steel, 0, 1.05, -1.05); add(cylGeo(0.035, 0.03, 1.35, 8).rotateX(Math.PI / 2), M.steel, 0, 1.1, -0.2); add(boxGeo(0.7, 0.45, 0.05), M.steel, 0, 1.2, -0.6);
    for (const sx of [-1, 1]) add(boxGeo(0.25, 0.12, 0.05), M.head, sx * 0.65, 0.0, 2.56); add(boxGeo(2.0, 0.16, 0.16), M.steel, 0, -0.45, 2.6);
    for (let i = 0; i < 3; i++) add(boxGeo(0.5, 0.3, 0.35), M.green, -0.5 + i * 0.5, 0.25, -2.1);
  } else if (type === 'quad') {
    add(boxGeo(0.9, 0.3, 1.6, 1), paint, 0, -0.05, 0); add(boxGeo(0.95, 0.12, 0.6, 1), paint, 0, 0.22, 0.6); add(boxGeo(0.95, 0.12, 0.6, 1), paint, 0, 0.22, -0.65);
    add(boxGeo(0.4, 0.15, 0.6), M.rubber, 0, 0.25, -0.1); add(cylGeo(0.02, 0.02, 0.8, 6).rotateZ(Math.PI / 2), M.steel, 0, 0.6, 0.55); add(cylGeo(0.03, 0.03, 0.4, 6), M.steel, 0, 0.42, 0.55, -0.3);
    for (const sx of [-1, 1]) add(boxGeo(0.12, 0.08, 0.05), M.head, sx * 0.25, 0.25, 0.92); add(boxGeo(0.7, 0.15, 0.35), M.green, 0, 0.36, -0.75);
  } else if (type === 'suv') {
    const pm = [M.white, M.red, M.blue, M.green, M.yellow][variant % 5];
    add(boxGeo(1.9, 0.7, 4.7, 1.5), pm, 0, -0.15, 0); add(boxGeo(1.85, 0.75, 3.0, 1.5), pm, 0, 0.55, -0.45); add(boxGeo(1.9, 0.12, 1.4, 1.5), pm, 0, 0.22, 1.7, -0.08);
    add(boxGeo(1.75, 0.55, 0.05), M.glassDark, 0, 0.62, 1.07, -0.5); add(boxGeo(1.7, 0.45, 0.05), M.glassDark, 0, 0.62, -1.96);
    for (const sx of [-1, 1]) { add(boxGeo(0.05, 0.45, 2.6), M.glassDark, sx * 0.93, 0.62, -0.45); add(boxGeo(0.25, 0.12, 0.05), M.head, sx * 0.65, 0.05, 2.36); add(boxGeo(0.12, 0.2, 0.05), M.tail, sx * 0.85, 0.2, -2.36); }
    add(boxGeo(1.6, 0.06, 2.4), M.steel, 0, 0.96, -0.45); for (const sx of [-0.6, 0.6]) add(boxGeo(0.06, 0.06, 2.4), M.steel, sx, 1.0, -0.45);
  } else if (type === 'utv') {
    add(boxGeo(1.5, 0.35, 2.9, 1.2), paint, 0, -0.2, 0); add(boxGeo(1.4, 0.3, 0.8, 1.2), paint, 0, 0.05, 1.05, -0.1);
    for (const sx of [-1, 1]) { add(cylGeo(0.035, 0.035, 1.2, 8), M.steel, sx * 0.68, 0.55, 0.45, 0.25, 0, 0); add(cylGeo(0.035, 0.035, 1.2, 8), M.steel, sx * 0.68, 0.55, -0.55, -0.2, 0, 0); add(cylGeo(0.035, 0.035, 1.1, 8).rotateX(Math.PI / 2), M.steel, sx * 0.68, 1.12, -0.05); }
    add(cylGeo(0.035, 0.035, 1.36, 8).rotateZ(Math.PI / 2), M.steel, 0, 1.12, 0.45); add(cylGeo(0.035, 0.035, 1.36, 8).rotateZ(Math.PI / 2), M.steel, 0, 1.12, -0.55);
    for (const sx of [-0.32, 0.32]) { add(boxGeo(0.45, 0.12, 0.45), M.rubber, sx, 0.05, -0.05); add(boxGeo(0.45, 0.5, 0.1), M.rubber, sx, 0.3, -0.27); }
    add(boxGeo(1.3, 0.4, 0.7), M.green, 0, 0.1, -1.0); for (const sx of [-0.45, 0, 0.45]) add(boxGeo(0.3, 0.3, 0.5), M.sandbag, sx, 0.42, -1.0);
    for (const sx of [-1, 1]) add(boxGeo(0.18, 0.1, 0.05), M.head, sx * 0.5, 0.0, 1.46);
    add(cylGeo(0.18, 0.18, 0.06, 14).rotateX(-1.2), M.machineDark, -0.32, 0.45, 0.35);  // steering wheel
  }
  // wheels: pivot (steer + suspension) -> spin group with tyre, rim and lug detail
  const wheels = [];
  if (def.gunPos) { const mz = new THREE.Object3D(); mz.position.set(def.gunPos[0], def.gunPos[1], def.gunPos[2] + 0.9); body.add(mz); g.userData.gunMuzzle = mz; }
  for (const w of def.wheels) {
    const pivot = new THREE.Group(); pivot.position.set(w[0], w[1] - def.rest * 0.65, w[2]); g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const W = def.wheelR, Wd = W * 0.6;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(W, W, Wd, 22).rotateZ(Math.PI / 2), M.tire); tyre.castShadow = true; spin.add(tyre);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const lug = new THREE.Mesh(boxGeo(Wd * 1.02, 0.05, 0.08), M.tire); lug.position.set(0, Math.cos(a) * W, Math.sin(a) * W); lug.rotation.x = -a; spin.add(lug); }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.55, W * 0.55, Wd * 1.02, 16).rotateZ(Math.PI / 2), paint); spin.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.2, W * 0.2, Wd * 1.08, 10).rotateZ(Math.PI / 2), M.steel); spin.add(hub);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Wd * 1.1, 6).rotateZ(Math.PI / 2), M.steel); b.position.set(0, Math.cos(a) * W * 0.36, Math.sin(a) * W * 0.36); spin.add(b); }
    wheels.push({ pivot, spin, def: w });
  }
  Object.assign(g.userData, { wheels, body, paint });
  // one shared headlight SpotLight (owned by the game) is parked on this anchor while someone drives at night:
  // thirty idle SpotLights would sit in every fragment shader's light loop
  const ha = new THREE.Object3D(); ha.position.set(0, 0.2, hz); g.add(ha); g.userData.headAnchor = ha;
  const keep = collectRefs(g.userData); hoistStatic(g, keep); mergeRigid(g, keep);
  return g;
}

// one live vehicle in the world (sim when driven locally, interpolated view otherwise)
export class Vehicle {
  constructor(game, id, type, pos, yaw, variant = 0) {
    this.game = game; this.W = game.world; this.id = id; this.type = type; this.def = VEHICLES[type]; this.hp = this.def.hp; this.alive = true;
    this.model = makeVehicleModel(type, variant); this.W.root.add(this.model);
    this.sim = new VehicleSim(type, this.W);
    const q = new THREE.Quaternion().setFromAxisAngle(n3(0, 1, 0), yaw);
    const y = this.W.terrain.height(pos.x, pos.z) + this.def.half[1] + this.def.wheelR + 0.4;
    this.sim.setState(n3(pos.x, y, pos.z), q, n3(0, 0, 0));
    this.pos = this.sim.pos; this.q = this.sim.q; this.netPos = this.pos.clone(); this.netQ = this.q.clone();
    this.seats = new Array(this.def.seats.length).fill(null); // 'me' | peer id
    this.driverRemote = null; this.settleT = 2; this.smokeT = 0;
    this.col = this.W.col.box(pos.x, pos.z, this.def.half[0] * 2, this.def.half[2] * 2, y - this.def.half[1], y + this.def.half[1], yaw, 'metal', { vehicle: this.sim, walk: true });
  }
  get yaw() { const f = n3(0, 0, 1).applyQuaternion(this.q); return Math.atan2(f.x, f.z); }
  driverIsMe() { return this.seats[0] === 'me'; }
  update(dt, input) {
    if (!this.alive) { this.model.position.copy(this.pos); return; }
    const local = this.driverIsMe() || (!this.seats[0] && !this.driverRemote && this.settleT > 0);
    if (local) {
      const inp = this.driverIsMe() && input ? { throttle: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0), steer: (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0), handbrake: input.down('Space') } : { throttle: 0, steer: 0, handbrake: true };
      this.W.col.remove(this.col);
      this.sim.step(dt, inp);
      this.W.col.add(this.col);
      if (!this.driverIsMe()) this.settleT -= dt;
      // crash damage
      if (this.sim.maxImpact > 10 && this.driverIsMe()) { const dmg = (this.sim.maxImpact - 10) ** 2 * this.def.mass / 600; this.damage(dmg); this.game.shake(Math.min(1.2, dmg / 120)); audio.explosion(this.pos, 0.12); }
      this.sim.maxImpact = 0;
    } else { // remote driver: interpolate toward the network state
      const k = Math.min(1, dt * 12); this.pos.lerp(this.netPos, k); this.q.slerp(this.netQ, k);
    }
    // collider + model
    const yaw = this.yaw; Object.assign(this.col, { x: this.pos.x, z: this.pos.z, y0: this.pos.y - this.def.half[1], y1: this.pos.y + this.def.half[1], yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) });
    this.W.col.remove(this.col); this.W.col.add(this.col);
    const m = this.model; m.position.copy(this.pos); m.quaternion.copy(this.q);
    const up = n3(0, 1, 0).applyQuaternion(this.q); const L = this.def.rest + this.def.wheelR;
    m.userData.wheels.forEach((w, i) => {
      const wh = this.sim.wheels[i]; let comp;
      if (local) comp = wh.comp; else { const mp = _a.set(w.def[0], w.def[1], w.def[2]).applyQuaternion(this.q).add(this.pos); const gy = this.W.terrain.height(mp.x, mp.z); comp = Math.max(0, Math.min(this.def.rest, L - (mp.y - gy) / Math.max(0.3, up.y))); wh.spin += (this.netSpeed || 0) / this.def.wheelR * dt; }
      w.pivot.position.y = w.def[1] - this.def.rest + comp; w.pivot.rotation.y = w.def[3] ? (local ? this.sim.steer : this.netSteer || 0) : 0; w.spin.rotation.x = wh.spin;
    });
    const driven = !!(this.seats[0] || this.driverRemote);
    
    // damage smoke / dust
    if (this.hp < this.def.hp * 0.35) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.12; this.game.fx.norm.emit({ p: _b.set(0, this.def.half[1], this.def.half[2] * 0.7).applyQuaternion(this.q).add(this.pos), v: n3(0, 1.5, 0), life: 2.5, s0: 0.5, s1: 2.2, c: new THREE.Color(this.hp < this.def.hp * 0.15 ? 0x222222 : 0x777777), a0: 0.6, a1: 0, drag: 0.5 }); } }
    if (local) for (const wh of this.sim.wheels) { if (!wh.contact) continue; const spd = Math.abs(wh.spinV * this.def.wheelR); if (Math.random() < ((spd > 4 ? 0.25 : 0) + wh.slip * 1.5) * dt * 20) this.game.fx.norm.emit({ p: wh.point.clone(), v: n3((Math.random() - 0.5) * 2, 1 + spd * 0.05, (Math.random() - 0.5) * 2), life: 1.6, s0: 0.3, s1: 1.6, c: new THREE.Color(wh.surf.dust), a0: 0.4, a1: 0, drag: 1.2 }); }
    // run over hostiles
    if (local && this.driverIsMe() && Math.abs(this.sim.speed) > 5) {
      const qi = this.q.clone().invert();
      for (const e of this.game.enemies) { if (!e.alive || e.type === 'strider' || e.pos.distanceTo(this.pos) > 7) continue; const l = e.pos.clone().sub(this.pos).applyQuaternion(qi); if (Math.abs(l.x) < this.def.half[0] + 0.5 && Math.abs(l.z) < this.def.half[2] + 0.5 && l.y > -this.def.half[1] - 2.5 && l.y < this.def.half[1] + 1) { e.damage(Math.abs(this.sim.speed) * 12, { tag: 'torso', point: e.pos.clone().setY(e.pos.y + 1) }, this.pos, true); this.sim.vel.multiplyScalar(0.9); } }
    }
  }
  damage(n, point) {
    if (!this.alive) return; this.hp -= n;
    if (!this.driverIsMe() && this.driverRemote) this.game.net?.event('vh', [this.id, Math.round(n)]);
    if (this.hp <= 0) this.explode();
  }
  explode() {
    this.alive = false; this.hp = 0; this.game.fx.explosion(this.pos.clone(), 2); audio.explosion(this.pos, 1.5); this.game.shake(1);
    this.model.traverse((o) => { if (o.isMesh && o.material && !o.material.userData.burnt) { const m = o.material.clone(); m.color = new THREE.Color(0x2a2622); m.userData.burnt = true; m.map = null; o.material = m; } });
    this.game.onVehicleDestroyed(this);
  }
  netState() { return [this.id, Math.round(this.pos.x * 100), Math.round(this.pos.y * 100), Math.round(this.pos.z * 100), +this.q.x.toFixed(3), +this.q.y.toFixed(3), +this.q.z.toFixed(3), +this.q.w.toFixed(3), +this.sim.steer.toFixed(2), +this.sim.speed.toFixed(1), Math.round(this.hp)]; }
  applyNet(a, peer) { this.netPos.set(a[1] / 100, a[2] / 100, a[3] / 100); this.netQ.set(a[4], a[5], a[6], a[7]).normalize(); this.netSteer = a[8]; this.netSpeed = a[9]; if (a[10] < this.hp) this.hp = a[10]; if (this.hp <= 0 && this.alive) this.explode(); if (this.first !== false) { this.pos.copy(this.netPos); this.q.copy(this.netQ); this.first = false; } }
  seatWorld(i, out = new THREE.Vector3()) { const s = this.def.seats[i]; return out.set(s[0], s[1], s[2]).applyQuaternion(this.q).add(this.pos); }
  freeSeat(prefDriver = true) { for (let i = 0; i < this.seats.length; i++) if (!this.seats[i] && !(i === 0 && this.driverRemote)) return i; return -1; }
  remove() { this.W.root.remove(this.model); this.W.col.remove(this.col); }
}
