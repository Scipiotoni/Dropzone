// Low-poly (faceted) tactical operators with fabric/camo textures, layered gear, two-bone arm IK on the weapon
// and a procedural locomotion system (walk / run / strafe / crouch / jump / reload / death).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEX } from './textures.js';

const gc = new Map();
const G = (k, f) => { if (!gc.has(k)) { const g = f(); g.userData.shared = true; gc.set(k, g); } return gc.get(k); };
const box = (w, h, d, r = 0.01) => G(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
const taper = (r0, r1, len, seg = 7) => G(`t${r0},${r1},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1); g.translate(0, -len / 2, 0); return g; });
const sph = (r, w = 7, h = 5) => G(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
const capg = (r, cov, w = 9) => G(`c${r},${cov},${w}`, () => new THREE.SphereGeometry(r, w, 5, 0, Math.PI * 2, 0, Math.PI * cov));

const matCache = new Map();
function fab(color, tex = 'fabric', ns = 0.8) {
  const k = color + tex; if (matCache.has(k)) return matCache.get(k);
  const t = TEX[tex];
  const m = new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normalMap, roughness: 0.92, metalness: 0, flatShading: true });
  m.normalScale.set(ns, ns); m.userData.shared = true; matCache.set(k, m); return m;
}
function solid(color, rough = 0.85, metal = 0) {
  const k = 's' + color + rough + metal; if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true }); m.userData.shared = true; matCache.set(k, m); return m;
}

export const STYLES = {
  player: { skin: 0xc89a78, uniform: 0x6a6a52, uniTex: 'camo', pants: 0x5e5c48, pantsTex: 'camo', gear: 0x6a6448, gearDark: 0x45412e, helmet: 0x5a5a48, boots: 0x3a3026, gloves: 0x2a2a26, visor: 0x1a2a2a, accent: 0xd8902a, mask: false },
  raider: { skin: 0xb88a68, uniform: 0x3a3632, uniTex: 'fabric', pants: 0x2e2c2a, pantsTex: 'fabric', gear: 0x4a2a22, gearDark: 0x2a1a16, helmet: 0x2a2a2a, boots: 0x1a1816, gloves: 0x1a1a1a, visor: 0x3a1a10, accent: 0xb82a1a, mask: true },
  raiderB: { skin: 0x8a6a50, uniform: 0x5a5040, uniTex: 'fabric', pants: 0x3a3a3e, pantsTex: 'camo', gear: 0x3a3a3a, gearDark: 0x222222, helmet: 0x6a5a40, boots: 0x2a2018, gloves: 0x3a3028, visor: 0x2a2a10, accent: 0xb82a1a, mask: true },
};

function mk(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const joint = (p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };

const UP_LEN = 0.29, LO_LEN = 0.27;
export class Operator {
  constructor(styleName = 'player', opts = {}) {
    const S = STYLES[styleName];
    this.root = new THREE.Group();
    const rig = this.rig = joint(this.root, 0, 0, 0);
    const M = this.M = {
      skin: solid(S.skin, 0.75), uni: fab(S.uniform, S.uniTex), uniD: fab(new THREE.Color(S.uniform).multiplyScalar(0.75).getHex(), S.uniTex),
      pants: fab(S.pants, S.pantsTex), gear: fab(S.gear, 'fabric', 1.2), gearD: fab(S.gearDark, 'fabric', 1.2), helmet: fab(S.helmet, 'fabric', 0.4),
      boots: solid(S.boots, 0.7), sole: solid(0x141210, 0.9), gloves: solid(S.gloves, 0.8), visor: solid(S.visor, 0.15, 0.8), metal: solid(0x3a3a3a, 0.4, 0.8),
      accent: solid(S.accent, 0.6), strap: solid(0x2a2620, 0.9), pad: solid(0x2e2e2a, 0.7),
    };
    // ---- legs
    const hips = this.hips = joint(rig, 0, 0.94, 0);
    mk(box(0.3, 0.16, 0.2, 0.05), M.pants, hips, 0, -0.03, 0);
    mk(box(0.32, 0.05, 0.22, 0.02), M.gearD, hips, 0, 0.04, 0);                         // belt
    mk(box(0.06, 0.045, 0.012, 0.005), M.metal, hips, 0, 0.04, -0.112);                 // buckle
    mk(box(0.06, 0.1, 0.06, 0.015), M.gear, hips, 0.15, -0.02, 0.03);                   // dump pouch
    const leg = (sx) => {
      const hp = joint(hips, sx * 0.085, -0.05, 0);
      mk(sph(0.08), M.pants, hp);
      mk(taper(0.08, 0.064, 0.42), M.pants, hp);
      mk(box(0.05, 0.13, 0.11, 0.015), M.uniD, hp, sx * 0.075, -0.2, 0, 0, 0, sx * 0.06); // cargo pocket
      if (sx > 0) { mk(box(0.07, 0.16, 0.05, 0.015), M.gearD, hp, 0.07, -0.1, -0.02); mk(box(0.05, 0.05, 0.04), M.strap, hp, 0.07, -0.18, 0.0); } // thigh holster
      const kn = joint(hp, 0, -0.43, 0);
      mk(sph(0.062), M.pants, kn);
      mk(box(0.11, 0.12, 0.06, 0.025), M.pad, kn, 0, -0.02, -0.055, -0.1);              // knee pad
      mk(taper(0.062, 0.05, 0.4), M.pants, kn);
      const an = joint(kn, 0, -0.41, 0);
      mk(taper(0.058, 0.056, 0.14), M.boots, an, 0, 0.12, 0);                             // boot shaft
      mk(box(0.11, 0.09, 0.26, 0.03), M.boots, an, 0, -0.03, -0.05);
      mk(box(0.115, 0.03, 0.27, 0.01), M.sole, an, 0, -0.075, -0.05);
      for (let i = 0; i < 3; i++) mk(box(0.07, 0.008, 0.012, 0.003), M.strap, an, 0, 0.02 + i * 0.03, -0.055, 0.3); // laces
      return { hp, kn, an };
    };
    this.lL = leg(-1); this.lR = leg(1);
    // ---- torso
    const spine = this.spine = joint(hips, 0, 0.07, 0);
    mk(box(0.27, 0.22, 0.18, 0.06), M.uni, spine, 0, 0.1, 0);
    const chest = this.chest = joint(spine, 0, 0.2, 0);
    mk(box(0.34, 0.3, 0.2, 0.07), M.uni, chest, 0, 0.13, 0);
    // plate carrier + pouches
    this.vest = joint(chest, 0, 0, 0);
    mk(box(0.31, 0.29, 0.07, 0.02), M.gear, this.vest, 0, 0.12, -0.105);             // front plate bag
    mk(box(0.31, 0.3, 0.06, 0.02), M.gear, this.vest, 0, 0.13, 0.105);               // back plate bag
    for (const sx of [-1, 1]) { mk(box(0.06, 0.05, 0.24, 0.015), M.gear, this.vest, sx * 0.13, 0.31, 0, 0, 0, 0); mk(box(0.04, 0.2, 0.2, 0.015), M.gearD, this.vest, sx * 0.17, 0.08, 0); } // shoulder straps + cummerbund
    for (let i = -1; i <= 1; i++) { mk(box(0.075, 0.12, 0.05, 0.012), M.gearD, this.vest, i * 0.085, 0.03, -0.155); mk(box(0.07, 0.025, 0.055, 0.008), M.gear, this.vest, i * 0.085, 0.095, -0.157); } // triple mag pouch
    mk(box(0.2, 0.06, 0.03, 0.01), M.gearD, this.vest, 0, 0.21, -0.148);              // admin pouch
    mk(box(0.05, 0.03, 0.006, 0.003), M.accent, this.vest, -0.08, 0.26, -0.142);       // patch
    mk(box(0.03, 0.08, 0.03, 0.008), M.strap, this.vest, -0.115, 0.2, -0.14, 0, 0, 0.2); // radio
    mk(G('ant', () => new THREE.CylinderGeometry(0.004, 0.003, 0.2, 4)), M.strap, this.vest, -0.13, 0.3, 0.1, 0.2);
    // backpack
    this.pack = joint(chest, 0, 0.12, 0.17);
    this.setPack(opts.pack ?? 1);
    // ---- neck & head
    const neck = joint(chest, 0, 0.29, 0);
    mk(taper(0.055, 0.05, 0.09), M.skin, neck, 0, 0.09, 0);
    const head = this.head = joint(neck, 0, 0.08, 0);
    mk(G('head', () => { const g = new THREE.SphereGeometry(0.11, 8, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) p.setX(i, p.getX(i) * (1 + y * 2.2)); p.setY(i, y * 1.15); } g.computeVertexNormals(); return g; }), M.skin, head, 0, 0.11, 0);
    mk(G('nose', () => new THREE.ConeGeometry(0.018, 0.045, 4)), M.skin, head, 0, 0.1, -0.105, -1.3, Math.PI / 4);
    for (const sx of [-1, 1]) mk(sph(0.024, 5, 4), M.skin, head, sx * 0.1, 0.11, 0.01, 0, 0, 0, 0.45, 1, 0.7);
    if (S.mask) { // respirator
      mk(box(0.15, 0.1, 0.07, 0.03), M.gearD, head, 0, 0.06, -0.085);
      for (const sx of [-1, 1]) mk(G('filt', () => new THREE.CylinderGeometry(0.032, 0.032, 0.035, 8)), M.metal, head, sx * 0.07, 0.04, -0.115, Math.PI / 2 - 0.3, 0, sx * 0.5);
      mk(box(0.18, 0.06, 0.05, 0.02), M.visor, head, 0, 0.13, -0.1);                   // lenses
    } else {
      mk(box(0.15, 0.08, 0.05, 0.02), M.uniD, head, 0, 0.055, -0.088);                 // shemagh / face wrap
      mk(box(0.17, 0.05, 0.03, 0.015), M.visor, head, 0, 0.135, -0.11);                // eye pro
    }
    // helmet: FAST-style shell with rails, NVG shroud, counterweight
    mk(capg(0.135, 0.52), M.helmet, head, 0, 0.115, 0.005, -0.15, 0, 0, 1, 0.95, 1.05);
    for (const sx of [-1, 1]) { mk(box(0.012, 0.035, 0.11, 0.004), M.metal, head, sx * 0.132, 0.12, 0.0); mk(box(0.02, 0.08, 0.04, 0.008), M.gearD, head, sx * 0.12, 0.05, 0.0); }
    mk(box(0.05, 0.035, 0.025, 0.008), M.metal, head, 0, 0.2, -0.11);               // NVG shroud
    mk(box(0.07, 0.05, 0.05, 0.01), M.gearD, head, 0, 0.17, 0.13);                   // counterweight pouch
    mk(box(0.012, 0.012, 0.012, 0.004), M.accent, head, -0.04, 0.24, 0.07);           // IR strobe
    // ---- arms
    const arm = (sx) => {
      const sh = joint(chest, sx * 0.19, 0.24, 0.0);
      mk(sph(0.072), M.uni, sh);
      mk(taper(0.07, 0.058, UP_LEN), M.uni, sh);
      mk(box(0.06, 0.08, 0.1, 0.01), M.uniD, sh, sx * 0.06, -0.08, 0);                // shoulder pocket
      const el = joint(sh, 0, -UP_LEN, 0);
      mk(sph(0.058), M.uni, el);
      mk(taper(0.058, 0.044, LO_LEN), M.uni, el);
      mk(box(0.07, 0.07, 0.07, 0.02), M.pad, el, 0, -0.01, 0.03);                       // elbow pad
      const wr = joint(el, 0, -LO_LEN, 0);
      mk(box(0.07, 0.1, 0.045, 0.018), M.gloves, wr, 0, -0.05, 0);
      mk(box(0.025, 0.055, 0.025, 0.008), M.gloves, wr, sx * -0.035, -0.03, -0.02, 0.2, 0, sx * 0.4);
      return { sh, el, wr };
    };
    this.aL = arm(-1); this.aR = arm(1);
    // gun mount: pivot at the right shoulder pocket; pitch applied here
    this.aim = joint(chest, 0.08, 0.2, -0.05);
    this.gunSlot = joint(this.aim, 0, 0, -0.08);
    this.gun = null;
    this.phase = 0; this.t = 0; this.blend = { crouch: 0, air: 0, sprint: 0, aim: 0 };
    this.dead = 0;
    this.root.traverse((o) => { if (o.isMesh) o.userData.char = this; });
  }
  setPack(tier) {
    while (this.pack.children.length) this.pack.remove(this.pack.children[0]);
    if (!tier) return;
    const M = this.M, s = [0, 0.8, 1, 1.25][tier];
    mk(box(0.3 * s, 0.36 * s, 0.16 * s, 0.04), M.gear, this.pack, 0, -0.02, 0.05 * s);
    mk(box(0.24 * s, 0.14 * s, 0.07, 0.03), M.gearD, this.pack, 0, -0.1 * s, 0.14 * s);
    for (const sx of [-1, 1]) mk(box(0.06, 0.2 * s, 0.08, 0.02), M.gearD, this.pack, sx * 0.16 * s, -0.04, 0.06);
    if (tier >= 2) mk(G('roll', () => { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8); g.rotateZ(Math.PI / 2); return g; }), M.uniD, this.pack, 0, 0.2 * s, 0.06);
    if (tier >= 3) { mk(box(0.04, 0.5, 0.04, 0.01), M.metal, this.pack, 0.13, 0.0, 0.15); mk(box(0.04, 0.5, 0.04, 0.01), M.metal, this.pack, -0.13, 0.0, 0.15); }
  }
  setVest(tier) { this.vest.visible = tier > 0; this.vest.scale.set(1 + (tier - 1) * 0.06, 1, 1 + (tier - 1) * 0.12); }
  attachGun(gm) {
    if (this.gun) this.gunSlot.remove(this.gun.group);
    this.gun = gm; if (!gm) return;
    // place gun so the pistol grip sits at the slot origin (in front of the right shoulder)
    gm.group.position.copy(gm.grip).multiplyScalar(-1);
    this.gunSlot.add(gm.group);
  }
  // two-bone IK: point the shoulder->elbow->wrist chain at a target (in chest space)
  ik(arm, target, pole) {
    const S = arm.sh.position, a = UP_LEN, b = LO_LEN + 0.06;
    const d = _v1.copy(target).sub(S); let L = d.length(); L = Math.min(Math.max(L, 0.1), a + b - 0.001); d.normalize();
    const cosA = (a * a + L * L - b * b) / (2 * a * L), ang = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const side = _v2.copy(pole).sub(_v3.copy(d).multiplyScalar(pole.dot(d))).normalize();
    const elbowDir = _v4.copy(d).multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
    const E = _v5.copy(S).addScaledVector(elbowDir, a);
    arm.sh.quaternion.setFromUnitVectors(DOWN, elbowDir);
    const lower = _v6.copy(S).addScaledVector(d, L).sub(E).normalize();
    _q1.setFromUnitVectors(DOWN, lower); _q2.copy(arm.sh.quaternion).invert();
    arm.el.quaternion.copy(_q2.multiply(_q1));
    arm.wr.rotation.set(-0.3, 0, 0);
  }
  /** st: {speed, fwd, side, crouch, air, sprint, aim(0/1), pitch, reload(0..1 or -1), dt} */
  update(dt, st) {
    this.t += dt; const B = this.blend, k = 1 - Math.exp(-dt * 10);
    B.crouch += ((st.crouch ? 1 : 0) - B.crouch) * k; B.air += ((st.air ? 1 : 0) - B.air) * k; B.sprint += ((st.sprint ? 1 : 0) - B.sprint) * k; B.aim += ((st.aim ? 1 : 0) - B.aim) * k;
    if (st.dead) { this.dead = Math.min(1, this.dead + dt * 2.2); }
    const sp = st.speed || 0; this.phase += sp * dt * (B.sprint > 0.5 ? 1.25 : 1.75);
    const ph = this.phase, amp = Math.min(1, sp / 3) * (0.55 + B.sprint * 0.35) * (1 - B.crouch * 0.3);
    const fwd = st.fwd ?? 1, side = st.side ?? 0;
    // legs
    const legPose = (L, p) => {
      const s = Math.sin(p);
      L.hp.rotation.x = s * amp * 0.8 * fwd + B.crouch * 1.0 + B.air * 0.5;
      L.hp.rotation.z = s * amp * 0.35 * side;
      L.kn.rotation.x = -(Math.max(0, Math.cos(p)) * amp * 1.1 + B.crouch * 1.7 + B.air * 0.8);
      L.an.rotation.x = B.crouch * 0.7 + Math.max(0, -Math.cos(p)) * amp * 0.3;
    };
    legPose(this.lL, ph); legPose(this.lR, ph + Math.PI);
    this.hips.position.y = 0.94 - B.crouch * 0.32 + Math.abs(Math.cos(ph)) * amp * 0.05 - amp * 0.03;
    this.hips.rotation.y = Math.sin(ph) * amp * 0.12;
    // torso: lean into sprint, bend for pitch
    const pitch = st.pitch || 0;
    const spX = -B.sprint * 0.3 - B.crouch * 0.25 + pitch * 0.2, chX = pitch * 0.3;
    this.spine.rotation.x = spX; this.chest.rotation.x = chX;
    this.chest.rotation.y = -this.hips.rotation.y * 0.8 + (1 - B.sprint) * 0.25;
    this.head.rotation.y = -(1 - B.sprint) * 0.25; this.head.rotation.x = pitch * 0.35;
    // weapon carriage: aim up/down from the shoulder; low-ready while sprinting
    const aimPitch = pitch - spX - chX;
    this.aim.rotation.set(aimPitch * (1 - B.sprint) - B.sprint * 0.75, -(1 - B.sprint) * 0.25 + B.sprint * 0.6, B.sprint * 0.3);
    const ads = B.aim;
    this.aim.position.set(0.08 - ads * 0.06, 0.2 + ads * 0.04, -0.05 - ads * 0.02);
    // recoil kick
    this.kick = (this.kick || 0) * Math.exp(-dt * 14);
    this.gunSlot.position.z = -0.08 + this.kick * 0.05; this.gunSlot.rotation.x = this.kick * 0.15;
    // reload: dip the magazine
    if (this.gun) {
      const g = this.gun, r = st.reload ?? -1;
      if (g.mag) { const out = r >= 0 ? Math.sin(Math.min(1, r) * Math.PI) : 0; g.mag.position.copy(g.magRest); g.mag.position.y -= out * 0.18; g.mag.visible = !(r > 0.35 && r < 0.6); }
      if (g.pump) { g.pump.position.copy(g.pumpRest); g.pump.position.z += (this.pumpT || 0) * 0.08; }
      this.pumpT = Math.max(0, (this.pumpT || 0) - dt * 3);
      // hands on the gun via IK
      this.root.updateMatrixWorld(true);
      _m1.copy(this.chest.matrixWorld).invert();
      const gripW = _w1.copy(g.grip).applyMatrix4(g.group.matrixWorld).applyMatrix4(_m1);
      this.ik(this.aR, gripW, _pole.set(0.6, -1, 0.3));
      if (g.fore && !(r >= 0 && r < 0.7)) {
        const foreW = _w2.copy(g.fore).applyMatrix4(g.group.matrixWorld).applyMatrix4(_m1);
        this.ik(this.aL, foreW, _pole.set(-0.8, -1, 0.2));
      } else if (r >= 0 && g.mag) {
        const magW = _w2.set(0, -0.12, 0).add(g.magRest).applyMatrix4(g.group.matrixWorld).applyMatrix4(_m1);
        this.ik(this.aL, magW, _pole.set(-0.8, -1, 0.2));
      } else { // pistol: support hand cups the grip
        const supW = _w2.copy(g.grip).add(_v7.set(-0.03, -0.01, -0.01)).applyMatrix4(g.group.matrixWorld).applyMatrix4(_m1);
        this.ik(this.aL, supW, _pole.set(-0.8, -1, 0.2));
      }
    } else {
      for (const [a, sx] of [[this.aL, -1], [this.aR, 1]]) { a.sh.rotation.set(Math.sin(ph + (sx > 0 ? Math.PI : 0)) * amp * 0.6, 0, sx * 0.12); a.el.rotation.set(-0.3 - amp * 0.3, 0, 0); }
    }
    // death: topple
    if (this.dead > 0) { const d = this.dead; this.rig.rotation.x = d * d * 1.5; this.rig.position.y = -d * 0.1; this.rig.position.z = d * 0.5; }
  }
}
const DOWN = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
