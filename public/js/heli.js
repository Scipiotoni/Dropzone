// Utility transport helicopter used for insertion and extraction: detailed fuselage, 4-blade articulated main rotor
// with motion blur disc, canted tail rotor, stabilator, open cabin doors with a door gun, landing gear and lights.
// The flight controller flies a scripted approach (cruise, flare, hover/land, depart) with banking and pitching.
import * as THREE from 'three';
import { boxGeo, cylGeo } from './geom.js';
import { worldMats } from './props.js';
import { pbr } from './textures.js';

let HM = null;
function hmats() {
  if (HM) return HM; const M = worldMats();
  HM = { ...M, skin: pbr('paintGreen', { color: 0x8a9478 }), skinDark: pbr('paintGreen', { color: 0x5a6250 }), blade: new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.6, metalness: 0.3 }),
    blur: new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x20303a, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.6, envMapIntensity: 2 }), interior: new THREE.MeshStandardMaterial({ color: 0x3a3c36, roughness: 0.9 }) };
  return HM;
}
export function makeHeli() {
  const M = hmats(); const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, p = body) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
  // fuselage: cabin box with rounded nose and tapered aft section
  add(boxGeo(2.3, 1.75, 4.2, 2), M.skin, 0, 1.55, 0.2);
  add(boxGeo(2.3, 0.3, 4.6, 2), M.skinDark, 0, 0.6, 0.4);                                 // belly
  const nose = add(new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.skin, 0, 1.25, 2.3, Math.PI / 2, 0, 0); nose.scale.set(1, 1.1, 0.75);
  add(boxGeo(2.1, 0.85, 0.9, 2), M.glass, 0, 2.05, 2.55, -0.45);                           // windscreen
  for (const sx of [-1, 1]) { add(boxGeo(0.05, 0.7, 1.0), M.glass, sx * 1.16, 1.95, 1.9); add(boxGeo(0.05, 0.5, 0.5), M.glass, sx * 1.16, 1.35, 2.5, 0, 0, 0); }
  add(boxGeo(1.6, 1.0, 2.2, 2), M.skin, 0, 2.8, 0.2);                                       // engine deck
  for (const sx of [-1, 1]) { add(cylGeo(0.42, 0.38, 1.9, 14).rotateX(Math.PI / 2), M.skinDark, sx * 0.72, 2.95, 0.1); add(cylGeo(0.3, 0.26, 0.5, 12).rotateX(Math.PI / 2), M.machineDark, sx * 0.82, 2.95, -1.0); add(cylGeo(0.3, 0.3, 0.1, 12).rotateX(Math.PI / 2), M.machineDark, sx * 0.72, 2.95, 1.08); }
  // tail boom & fins
  add(cylGeo(0.55, 0.25, 6.4, 12).rotateX(Math.PI / 2), M.skin, 0, 1.95, -4.8);
  add(boxGeo(0.18, 2.0, 1.2, 1.5), M.skin, 0, 2.7, -8.0, 0.35); add(boxGeo(3.2, 0.08, 0.8), M.skinDark, 0, 1.9, -7.6);
  const tailR = new THREE.Group(); tailR.position.set(0.22, 3.2, -8.2); tailR.rotation.z = 0.35; body.add(tailR);
  for (let i = 0; i < 4; i++) add(boxGeo(0.05, 1.5, 0.16), M.blade, 0, 0, 0, i * Math.PI / 4 * 2 / 2, 0, 0, tailR).rotation.x = i * Math.PI / 2;
  add(new THREE.CircleGeometry(0.78, 20).rotateY(Math.PI / 2), M.blur, 0.03, 0, 0, 0, 0, 0, tailR);
  // cabin: open sliding doors, seats, door gun, fast-rope arm
  for (const sx of [-1, 1]) {
    add(boxGeo(0.06, 1.35, 1.6), M.skinDark, sx * 1.18, 1.55, -1.6);                        // slid-back door
    add(boxGeo(0.02, 1.25, 1.7), M.interior, sx * 1.1, 1.5, 0.2).visible = false;
    add(boxGeo(0.4, 0.4, 0.06), M.glass, sx * 1.2, 1.9, -1.6);
    add(cylGeo(0.03, 0.03, 0.8, 6), M.steel, sx * 1.35, 1.6, 0.9); add(cylGeo(0.025, 0.02, 1.1, 8).rotateX(Math.PI / 2), M.steel, sx * 1.5, 1.95, 1.2); add(boxGeo(0.14, 0.2, 0.4), M.steel, sx * 1.48, 1.95, 0.7);
    add(boxGeo(0.06, 0.06, 1.0), M.steel, sx * 1.3, 2.6, -0.3); // rope arm
  }
  add(boxGeo(2.1, 0.1, 3.4), M.plate, 0, 0.78, 0.0); for (let i = 0; i < 3; i++) add(boxGeo(1.8, 0.45, 0.45), M.interior, 0, 1.05, -0.8 + i * 0.7);
  // landing gear
  for (const sx of [-1, 1]) { add(cylGeo(0.06, 0.06, 0.9, 8), M.steel, sx * 1.1, 0.35, 1.6, 0, 0, sx * 0.4); add(cylGeo(0.3, 0.3, 0.2, 14).rotateZ(Math.PI / 2), M.rubber, sx * 1.35, 0.3, 1.6); }
  add(cylGeo(0.2, 0.2, 0.14, 12).rotateZ(Math.PI / 2), M.rubber, 0, 1.55, -7.5); add(cylGeo(0.05, 0.05, 0.5, 6), M.steel, 0, 1.75, -7.5);
  // antennas, sensor ball, lights
  add(new THREE.SphereGeometry(0.22, 12, 10), M.machineDark, 0, 0.65, 2.7); add(new THREE.SphereGeometry(0.12, 10, 8), M.glass, 0, 0.6, 2.86);
  for (const [x, y, z, c] of [[-1.18, 1.0, 0.9, M.emRed], [1.18, 1.0, 0.9, M.emCyan], [0, 3.65, -8.25, M.emWarm], [0, 0.48, -1.0, M.emRed]]) add(new THREE.SphereGeometry(0.07, 8, 6), c, x, y, z);
  // main rotor: mast, hub, 4 blades + blur disc
  add(cylGeo(0.12, 0.12, 0.6, 10), M.steel, 0, 3.55, 0.2);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.9, 0.2); body.add(rotor);
  add(cylGeo(0.35, 0.35, 0.2, 14), M.machineDark, 0, 0, 0, 0, 0, 0, rotor);
  const blades = [];
  for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; rotor.add(arm); const b = add(boxGeo(0.55, 0.05, 7.4), M.blade, 0, 0, 3.9, 0, 0, 0.06, arm); b.rotation.x = 0.02; blades.push(b); add(boxGeo(0.56, 0.06, 0.3), M.yellow, 0, 0, 7.5, 0, 0, 0, arm); }
  const disc = add(new THREE.CircleGeometry(7.7, 48).rotateX(-Math.PI / 2), M.blur, 0, 0.02, 0, 0, 0, 0, rotor); disc.castShadow = false;
  const L = new THREE.SpotLight(0xfff0d0, 0, 80, 0.5, 0.5, 1.2); L.position.set(0, 0.5, 2.5); L.target.position.set(0, -10, 6); g.add(L, L.target);
  g.userData = { body, rotor, tailR, disc, blades, light: L, seat: new THREE.Vector3(0.9, 1.0, -0.2), door: new THREE.Vector3(1.6, 0, -0.2) };
  return g;
}

// scripted flight: legs of {to:Vector3, speed, hover?, land?, wait?}
export class HeliFlight {
  constructor(model, start, yaw) { this.m = model; this.pos = start.clone(); this.yaw = yaw; this.vel = new THREE.Vector3(); this.legs = []; this.rotorRPM = 1; this.pitch = 0; this.roll = 0; this.t = 0; this.done = false; this.phase = 'cruise'; }
  go(legs) { this.legs = legs; this.leg = 0; this.waitT = 0; }
  update(dt, groundFn) {
    this.t += dt; const L = this.legs[this.leg];
    if (L) {
      const to = L.to, d = to.clone().sub(this.pos); const dist = d.length();
      const slow = L.hover || L.land ? Math.min(1, dist / 45) : 1;
      const want = d.clone().normalize().multiplyScalar(Math.min(L.speed * Math.max(0.12, slow), dist * 1.2));
      this.vel.lerp(want, Math.min(1, dt * (L.hover || L.land ? 1.2 : 0.7)));
      if (dist < (L.land ? 0.3 : L.hover ? 0.8 : 12)) {
        this.phase = L.land ? 'landed' : L.hover ? 'hover' : 'cruise';
        if (L.wait !== undefined) { this.waitT += dt; this.vel.multiplyScalar(0.8); if (this.waitT >= L.wait && (!L.until || L.until())) { this.leg++; this.waitT = 0; } }
        else this.leg++;
      }
    } else { this.done = true; this.vel.multiplyScalar(0.98); }
    this.pos.addScaledVector(this.vel, dt);
    const gy = groundFn ? groundFn(this.pos.x, this.pos.z) : -999; if (this.pos.y < gy) this.pos.y = gy;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 1.5) { const wantYaw = Math.atan2(this.vel.x, this.vel.z); let dy = wantYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 0.8); this.roll += (-dy * 0.6 - this.roll) * Math.min(1, dt * 2); }
    else this.roll *= 1 - Math.min(1, dt * 2);
    const fwdSpeed = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    const flare = L && (L.hover || L.land) ? THREE.MathUtils.clamp(-fwdSpeed * 0.02, -0.25, 0) : 0;
    this.pitch += ((THREE.MathUtils.clamp(fwdSpeed * 0.006, 0, 0.22) + flare * 2 + (L?.land || this.phase === 'landed' ? 0 : 0)) - this.pitch) * Math.min(1, dt * 1.5);
    const m = this.m; m.position.copy(this.pos); m.rotation.set(0, this.yaw, 0, 'YXZ'); m.userData.body.rotation.set(this.pitch, 0, this.roll);
    const rpm = this.phase === 'landed' && L?.idle ? 0.6 : 1; this.rotorRPM += (rpm - this.rotorRPM) * dt;
    m.userData.rotor.rotation.y += dt * 28 * this.rotorRPM; m.userData.tailR.rotation.x += dt * 70 * this.rotorRPM;
    for (const b of m.userData.blades) b.visible = this.rotorRPM < 0.75; m.userData.disc.material.opacity = 0.1 + this.rotorRPM * 0.18;
  }
  seatWorld(out) { this.m.updateMatrixWorld(true); return this.m.userData.body.localToWorld(out.copy(this.m.userData.seat)); }
  doorWorld(out) { this.m.updateMatrixWorld(true); return this.m.userData.body.localToWorld(out.copy(this.m.userData.door)); }
}
