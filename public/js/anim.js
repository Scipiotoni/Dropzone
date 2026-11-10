// Keyframed weapon animation: reloads (box mags, AK rock-in, HK slap, pistol slide release, belt-fed LMG,
// pump tube loading, bolt-action cycling), draw / holster, inspect and firing blowback.
// A pose drives the gun model's moving parts plus left/right hand targets in gun-local space,
// which the first-person viewmodel and the third-person IK rig both follow.
import * as THREE from 'three';

const ss = (t) => t * t * (3 - 2 * t);
// track: [[t, value], ...] (value number or array) -> eased interpolation
function sample(track, t) {
  if (!track) return null;
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i];
    if (t <= t1) { const [t0, v0] = track[i - 1]; const k = ss((t - t0) / Math.max(1e-6, t1 - t0)); if (Array.isArray(v0)) return v0.map((a, j) => a + (v1[j] - a) * k); if (typeof v0 === 'string') return k < 0.5 ? v0 : v1; return v0 + (v1 - v0) * k; }
  }
  return track[track.length - 1][1];
}
// hand tracks are [[t, anchorName]] — blended between anchors over the segment
function sampleHand(track, t) {
  if (!track) return null;
  let i = 0; while (i < track.length - 1 && t > track[i + 1][0]) i++;
  if (i >= track.length - 1) return { a: track[track.length - 1][1], b: track[track.length - 1][1], k: 1 };
  const [t0, a] = track[i], [t1, b] = track[i + 1];
  const blend = Math.min(0.12, (t1 - t0));
  const k = t < t1 - blend ? 0 : ss((t - (t1 - blend)) / blend);
  return { a, b, k };
}

// gun: [rx, ry, rz, x, y, z] offsets; mag: [x, y, z, rx] offset from rest; vis: mag visible
const CLIPS = {
  rifle: { // AR-15 / MPX / HK417 / M14: tilt, drop mag, pouch, seat, slap bolt catch / charge
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.12, [0.12, 0.15, 0.45, -0.02, 0.01, 0]], [0.62, [0.18, 0.12, 0.5, -0.02, 0.02, 0]], [0.74, [0.05, 0.05, 0.15, -0.01, 0, 0.01]], [0.86, [0, -0.05, -0.15, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]],
    mag: [[0, [0, 0, 0, 0]], [0.16, [0, 0, 0, 0]], [0.3, [0, -0.3, 0.02, 0.3]], [0.42, [0, -0.32, 0.05, 0.4]], [0.5, [0, -0.2, 0.02, 0.1]], [0.6, [0, -0.035, 0, 0]], [0.66, [0, 0, 0, 0]]],
    vis: [[0, 1], [0.31, 0], [0.42, 1]],
    lh: [[0, 'fore'], [0.1, 'mag'], [0.3, 'pouch'], [0.42, 'mag'], [0.68, 'magwell'], [0.76, 'charger'], [0.9, 'fore']],
    charger: [[0, 0], [0.76, 0], [0.8, 1], [0.84, 0]],
  },
  ak: { // AK: hook the mag out with the new one, rock it in front-first, rack the charging handle overhand
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.12, [0.1, -0.15, -0.5, 0.0, 0.01, 0]], [0.66, [0.14, -0.15, -0.55, 0.01, 0.02, 0]], [0.78, [0.05, -0.3, -0.8, 0.02, 0, 0.0]], [0.9, [0, -0.05, -0.1, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]],
    mag: [[0, [0, 0, 0, 0]], [0.16, [0, 0, 0, 0]], [0.28, [0, -0.04, -0.06, -0.6]], [0.38, [0, -0.3, -0.04, -0.4]], [0.5, [0, -0.15, -0.06, -0.5]], [0.6, [0, -0.02, -0.03, -0.35]], [0.68, [0, 0, 0, 0]]],
    vis: [[0, 1], [0.38, 0], [0.45, 1]],
    lh: [[0, 'fore'], [0.1, 'mag'], [0.38, 'pouch'], [0.45, 'mag'], [0.7, 'magwell'], [0.78, 'charger'], [0.92, 'fore']],
    charger: [[0, 0], [0.78, 0], [0.82, 1], [0.86, 0]],
  },
  hk: { // MP5 / UMP: lock the cocking lever back first, swap mag, HK slap
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.1, [0.05, 0.2, 0.25, 0, 0, 0]], [0.2, [0.12, 0.15, 0.45, -0.02, 0.01, 0]], [0.65, [0.15, 0.12, 0.5, -0.02, 0.02, 0]], [0.8, [0.02, 0.25, 0.3, 0, 0, 0]], [0.86, [-0.05, 0.2, 0.25, 0, 0.01, 0.01]], [1, [0, 0, 0, 0, 0, 0]]],
    mag: [[0, [0, 0, 0, 0]], [0.26, [0, 0, 0, 0]], [0.38, [0, -0.3, 0.02, 0.3]], [0.5, [0, -0.2, 0.02, 0.1]], [0.62, [0, -0.03, 0, 0]], [0.68, [0, 0, 0, 0]]],
    vis: [[0, 1], [0.39, 0], [0.48, 1]],
    lh: [[0, 'fore'], [0.06, 'charger'], [0.2, 'mag'], [0.38, 'pouch'], [0.48, 'mag'], [0.7, 'charger'], [0.9, 'fore']],
    charger: [[0, 0], [0.08, 0], [0.16, 1], [0.78, 1], [0.82, 0]],
  },
  pistol: { // mag drops free, new mag from the belt, slide release / rack
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.1, [0.25, 0.1, 0.25, -0.02, 0.03, 0.03]], [0.6, [0.3, 0.1, 0.3, -0.02, 0.03, 0.03]], [0.75, [0.1, -0.1, -0.2, 0, 0.01, 0.01]], [0.82, [0.05, -0.05, -0.1, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]],
    mag: [[0, [0, 0, 0, 0]], [0.12, [0, 0, 0, 0]], [0.25, [0, -0.35, 0.02, 0.2]], [0.4, [0, -0.3, 0.03, 0.2]], [0.52, [0, -0.12, 0.02, 0]], [0.6, [0, -0.03, 0, 0]], [0.66, [0, 0, 0, 0]]],
    vis: [[0, 1], [0.25, 0], [0.38, 1]],
    lh: [[0, 'support'], [0.14, 'pouch'], [0.38, 'mag'], [0.66, 'slideTop'], [0.84, 'support']],
    slide: [[0, 0], [0.7, 0], [0.75, 1], [0.8, 0]],
  },
  lmg: { // M249: open feed cover, swap pouch, lay belt, close cover, charge
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.08, [0.15, 0.2, 0.35, -0.02, 0.02, 0.02]], [0.88, [0.15, 0.2, 0.35, -0.02, 0.02, 0.02]], [1, [0, 0, 0, 0, 0, 0]]],
    cover: [[0, 0], [0.08, 0], [0.16, 1], [0.72, 1], [0.8, 0]],
    mag: [[0, [0, 0, 0, 0]], [0.22, [0, 0, 0, 0]], [0.34, [-0.05, -0.3, 0.05, 0.4]], [0.46, [-0.05, -0.2, 0.05, 0.2]], [0.58, [0, -0.02, 0, 0]], [0.6, [0, 0, 0, 0]]],
    vis: [[0, 1], [0.34, 0], [0.42, 1]],
    lh: [[0, 'fore'], [0.06, 'cover'], [0.18, 'mag'], [0.34, 'pouch'], [0.42, 'mag'], [0.62, 'cover'], [0.82, 'charger'], [0.94, 'fore']],
    charger: [[0, 0], [0.84, 0], [0.88, 1], [0.92, 0]],
  },
  pumpShell: { // one shell into the tube through the loading port
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.2, [0.1, 0, -0.55, 0, 0.02, 0]], [0.8, [0.1, 0, -0.55, 0, 0.02, 0]], [1, [0.05, 0, -0.35, 0, 0.01, 0]]],
    lh: [[0, 'pump'], [0.3, 'pouch'], [0.55, 'port'], [0.8, 'pump']],
  },
  pumpRack: { gun: [[0, [0, 0, 0, 0, 0, 0]], [0.5, [0.06, 0, 0.05, 0, 0, 0.015]], [1, [0, 0, 0, 0, 0, 0]]], pump: [[0, 0], [0.4, 1], [0.8, 0]], lh: [[0, 'pump']] },
  boltCycle: { // lift, back, forward, down — right hand leaves the grip
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.15, [0.06, -0.1, -0.25, 0, 0, 0]], [0.85, [0.06, -0.1, -0.25, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]],
    bolt: [[0, [0, 0]], [0.2, [1, 0]], [0.42, [1, 1]], [0.62, [1, 0]], [0.8, [0, 0]]],
    rh: [[0, 'grip'], [0.12, 'bolt'], [0.86, 'grip']],
  },
  boltLoad: { // open bolt, thumb rounds into the internal magazine, close
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.1, [0.15, -0.1, -0.4, 0, 0.02, 0.02]], [0.9, [0.15, -0.1, -0.4, 0, 0.02, 0.02]], [1, [0, 0, 0, 0, 0, 0]]],
    bolt: [[0, [0, 0]], [0.1, [1, 0]], [0.18, [1, 1]], [0.82, [1, 1]], [0.88, [1, 0]], [0.95, [0, 0]]],
    rh: [[0, 'grip'], [0.06, 'bolt'], [0.2, 'grip'], [0.8, 'bolt'], [0.96, 'grip']],
    lh: [[0, 'fore'], [0.2, 'pouch'], [0.35, 'port'], [0.45, 'pouch'], [0.58, 'port'], [0.68, 'pouch'], [0.78, 'port'], [0.9, 'fore']],
  },
  draw: { gun: [[0, [-0.9, 0.4, 0.6, 0.05, -0.25, 0.05]], [0.7, [0.08, -0.05, -0.05, 0, 0.01, 0]], [1, [0, 0, 0, 0, 0, 0]]], lh: [[0, 'pouch'], [0.55, 'fore']] },
  holster: { gun: [[0, [0, 0, 0, 0, 0, 0]], [1, [-0.9, 0.4, 0.6, 0.05, -0.25, 0.05]]], lh: [[0, 'fore'], [0.5, 'pouch']] },
  inspect: {
    gun: [[0, [0, 0, 0, 0, 0, 0]], [0.18, [0.2, 0.6, 0.9, -0.04, 0.03, 0.03]], [0.45, [0.2, 0.7, 1.0, -0.04, 0.04, 0.03]], [0.62, [0.1, -0.5, -0.8, 0.02, 0.03, 0.02]], [0.85, [0.05, -0.6, -0.9, 0.02, 0.03, 0.02]], [1, [0, 0, 0, 0, 0, 0]]],
    charger: [[0, 0], [0.5, 0], [0.56, 0.5], [0.62, 0]], lh: [[0, 'fore'], [0.48, 'charger'], [0.66, 'fore']],
  },
};
export const ANIM_NAMES = Object.keys(CLIPS);

export class WeaponAnimator {
  constructor() { this.clip = null; this.t = 0; this.dur = 1; this.onDone = null; this.blow = 0; this.empty = false; this.pose = { gun: [0, 0, 0, 0, 0, 0], mag: [0, 0, 0, 0], vis: 1, lh: null, rh: null, charger: 0, slide: 0, bolt: [0, 0], cover: 0, pump: 0 }; }
  play(name, dur, onDone) { this.clip = CLIPS[name]; this.name = name; this.t = 0; this.dur = Math.max(0.05, dur); this.onDone = onDone || null; }
  stop() { this.clip = null; this.name = null; }
  get busy() { return !!this.clip; }
  fire() { this.blow = 1; }
  update(dt) {
    this.blow = Math.max(0, this.blow - dt * 22);
    const P = this.pose;
    if (this.clip) {
      this.t += dt / this.dur; const t = Math.min(1, this.t), C = this.clip;
      P.gun = sample(C.gun, t) || [0, 0, 0, 0, 0, 0]; P.mag = sample(C.mag, t) || [0, 0, 0, 0]; P.vis = C.vis ? sample(C.vis, t) : 1;
      P.lh = sampleHand(C.lh, t); P.rh = sampleHand(C.rh, t);
      P.charger = sample(C.charger, t) || 0; P.slide = Math.max(sample(C.slide, t) || 0, 0); P.bolt = sample(C.bolt, t) || [0, 0]; P.cover = sample(C.cover, t) || 0; P.pump = sample(C.pump, t) || 0;
      if (this.t >= 1) { const cb = this.onDone; this.clip = null; this.name = null; if (cb) cb(); }
    } else { P.gun = [0, 0, 0, 0, 0, 0]; P.mag = [0, 0, 0, 0]; P.vis = 1; P.lh = null; P.rh = null; P.charger = 0; P.slide = 0; P.bolt = [0, 0]; P.cover = 0; P.pump = 0; }
    return P;
  }
  // apply moving parts to a built gun model
  apply(gm) {
    const P = this.pose, pa = gm.parts || {};
    if (gm.mag) { gm.mag.position.copy(gm.magRest).add(_v.set(P.mag[0], P.mag[1], P.mag[2])); gm.mag.rotation.x = P.mag[3]; gm.mag.visible = P.vis > 0.5; }
    if (pa.charger) { pa.charger.obj.position.copy(pa.charger.rest); pa.charger.obj.position.z += P.charger * pa.charger.travel; }
    if (pa.boltc) { pa.boltc.obj.position.copy(pa.boltc.rest); pa.boltc.obj.position.z += Math.max(P.charger, this.blow) * pa.boltc.travel; }
    if (pa.slide) { pa.slide.obj.position.copy(pa.slide.rest); pa.slide.obj.position.z += Math.max(this.blow, P.slide, this.empty && !this.clip ? 1 : 0) * pa.slide.travel; }
    if (pa.bolt) { pa.bolt.obj.position.copy(pa.bolt.rest); pa.bolt.obj.position.z += P.bolt[1] * pa.bolt.travel; pa.bolt.handle.rotation.z = P.bolt[0] * 1.3; }
    if (pa.cover) pa.cover.obj.rotation.x = P.cover * 1.1;
    if (gm.pump) { gm.pump.position.copy(gm.pumpRest); gm.pump.position.z += P.pump * 0.08; }
  }
  // world-agnostic: hand target in gun-local coords
  handTarget(gm, h, side, out) {
    const A = gm.anchors;
    const get = (name, o) => {
      if (name === 'mag' && gm.mag) return o.copy(gm.mag.position).add(_w.set(0, -0.06, 0));
      if (name === 'support') return o.copy(A.grip).add(_w.set(-0.028, -0.005, -0.012));
      const a = A[name] || (side === 'l' ? A.fore : A.grip); return o.copy(a);
    };
    if (!h) return side === 'l' ? out.copy(A.fore) : out.copy(A.grip);
    get(h.a, out); if (h.k > 0) out.lerp(get(h.b, _u), h.k);
    if (h.a === 'bolt' || h.b === 'bolt') { const pa = gm.parts?.bolt; if (pa) out.z += this.pose.bolt[1] * pa.travel; }
    if (h.a === 'charger' || h.b === 'charger') { const pa = gm.parts?.charger; if (pa) out.z += this.pose.charger * pa.travel; }
    return out;
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
export function clipFor(id, WEAPONS) { return WEAPONS[id].anim || 'rifle'; }
