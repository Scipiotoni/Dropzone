// Sci-fi machine models: chamfered ceramic armour over gunmetal frames, pistons, ducted fans, lenses and glowing
// sensors. Detail comes from geometry (extruded bevelled plates, lathe-turned housings, greebles) rather than
// textures; every rigid group is merged per material afterwards, so a detailed machine still costs ~10-20 draw calls.
import * as THREE from 'three';
import { mergeRigid, collectRefs, hoistStatic } from './geom.js';

let MM = null;
function haloTex() {
  const C = document.createElement('canvas'); C.width = C.height = 64; const x = C.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(C); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function mmats() {
  if (MM) return MM;
  const std = (color, roughness, metalness, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o });
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const ht = haloTex();
  const halo = (color, op = 0.9) => new THREE.SpriteMaterial({ map: ht, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
  MM = {
    shell: std(0xdcd5c4, 0.38, 0.06),      // ceramic armour, off-white
    shellB: std(0xa9a395, 0.46, 0.08),     // weathered plates
    dark: std(0x2b2e33, 0.34, 0.78),       // gunmetal frame
    black: std(0x111214, 0.55, 0.35),      // seals, joints, ducts
    accent: std(0xd4461a, 0.42, 0.12),     // hazard markings
    yellow: std(0xe0a51e, 0.4, 0.12),
    chrome: std(0xb8bec4, 0.14, 1.0),      // piston rods
    lens: std(0x050303, 0.04, 0.95),
    eye: glow(0xff2a10), eyeCalm: glow(0xffb020), hot: glow(0xff8a2a), core: glow(0x3ae2ff), red: glow(0xff3018),
    halo: halo(0xff3a18), haloCalm: halo(0xffaa30, 0.7), haloCore: halo(0x40d8ff, 0.8), haloHot: halo(0xff8a2a, 0.8),
    blur: new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
    beam: new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  return MM;
}

// ---------- geometry kit
// chamfered plate: w (x) by h (y) outline, d thick (z), bevelled edges -> crisp faceted sci-fi panel
export function plate(w, h, d, c = 0.25, bevel = 0.012) {
  const cw = Math.min(w, h) * c, x = w / 2, y = h / 2, s = new THREE.Shape();
  s.moveTo(-x + cw, -y); s.lineTo(x - cw, -y); s.lineTo(x, -y + cw); s.lineTo(x, y - cw); s.lineTo(x - cw, y); s.lineTo(-x + cw, y); s.lineTo(-x, y - cw); s.lineTo(-x, -y + cw); s.closePath();
  const b = Math.min(bevel, d * 0.4, w * 0.2, h * 0.2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
}
// plate lying flat (thickness along y), length along z
export const slab = (w, len, t, c, bevel) => plate(w, len, t, c, bevel).rotateX(-Math.PI / 2);
// tapered plate (trapezoid), length along -z from the origin: used for limbs
export function taperPlate(w0, w1, len, t, bevel = 0.015) {
  const s = new THREE.Shape(); s.moveTo(-w0 / 2, 0); s.lineTo(w0 / 2, 0); s.lineTo(w1 / 2, len * 0.92); s.lineTo(w1 * 0.3, len); s.lineTo(-w1 * 0.3, len); s.lineTo(-w1 / 2, len * 0.92); s.closePath();
  const b = Math.min(bevel, t * 0.4); const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, t - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
  g.translate(0, 0, -(t - 2 * b) / 2); g.rotateX(-Math.PI / 2); return g; // spans z 0..-len, thickness along y
}
// lathe from [r, y] pairs (y ascending)
export const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
export const latheZ = (pts, seg = 16) => lathe(pts, seg).rotateX(-Math.PI / 2); // axis along -z (front)
export const cylZ = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
export const cylX = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const tor = (R, r, seg = 20, rs = 6) => new THREE.TorusGeometry(R, r, rs, seg);
export function tube(points, r, seg = 12) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, 6, false); }

// part helper: mesh with transform, shadows on for solid materials
export function mk(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  const solid = !(mat.isMeshBasicMaterial || mat.transparent); m.castShadow = solid; m.receiveShadow = solid; parent.add(m); return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
export function halo(mat, parent, size, x = 0, y = 0, z = 0) { const s = new THREE.Sprite(mat); s.scale.setScalar(size); s.position.set(x, y, z); parent.add(s); return s; }
// piston between two local points: chrome rod + dark sleeve
function piston(parent, a, b, r = 0.03) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), mid = A.clone().lerp(B, 0.5), L = A.distanceTo(B);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  const M = mmats(); const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, L * 0.55, 8), M.dark); void mid; s.position.copy(A.clone().lerp(B, 0.27)); s.quaternion.copy(q); s.castShadow = true; parent.add(s);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L * 0.55, 8), M.chrome); rod.position.copy(A.clone().lerp(B, 0.72)); rod.quaternion.copy(q); parent.add(rod);
  void mid;
}
// row of cooling fins
function vents(parent, mat, n, w, h, d, x, y, z, ry = 0) { for (let i = 0; i < n; i++) mk(new THREE.BoxGeometry(w, h, d), mat, parent, x + Math.cos(ry) * (i - (n - 1) / 2) * w * 2.2, y, z - Math.sin(ry) * (i - (n - 1) / 2) * w * 2.2, 0, ry); }
// glowing sensor eye: lens + iris ring + pupil + bezel, facing -z
function eyeAssembly(parent, r, M, x = 0, y = 0, z = 0) {
  const g = grp(parent, x, y, z);
  mk(latheZ([[r * 1.2, -0.02 * r], [r * 1.25, 0.25 * r], [r * 1.05, 0.4 * r], [r * 0.95, 0.3 * r]], 20), M.dark, g);      // bezel
  mk(latheZ([[0, 0.05 * r], [r * 0.95, 0.15 * r], [r * 0.95, 0.3 * r]], 20), M.lens, g);                                   // dark glass
  mk(tor(r * 0.62, r * 0.09, 20, 4), M.eye, g, 0, 0, -0.32 * r);                                                          // iris ring
  const pupil = mk(new THREE.SphereGeometry(r * 0.3, 12, 8), M.eye, g, 0, 0, -0.25 * r);
  return { g, pupil };
}

function finish(root, owner) { const keep = collectRefs(owner); hoistStatic(root, keep); mergeRigid(root, keep); return owner; }

// ================================================================== Gnat hunter drone
export function buildDrone() {
  const M = mmats(); const root = new THREE.Group(); const body = grp(root);
  // spindle fuselage along z with grooves
  mk(latheZ([[0, -0.46], [0.1, -0.44], [0.19, -0.34], [0.21, -0.14], [0.18, -0.11], [0.22, -0.07], [0.23, 0.16], [0.18, 0.2], [0.2, 0.26], [0.12, 0.4], [0.03, 0.46]], 10), M.dark, body);
  // beetle carapace: two chamfered shell plates + spine
  for (const sx of [-1, 1]) {
    mk(slab(0.26, 0.66, 0.045, 0.3, 0.012), M.shell, body, sx * 0.12, 0.17, 0.02, 0, 0, -sx * 0.42);
    mk(slab(0.04, 0.5, 0.05, 0.3, 0.01), M.accent, body, sx * 0.235, 0.105, 0.04, 0, 0, -sx * 0.42);
    mk(slab(0.2, 0.32, 0.04, 0.35, 0.01), M.shellB, body, sx * 0.17, 0.0, 0.2, 0, 0, -sx * 1.15);           // flank armour
  }
  mk(slab(0.06, 0.62, 0.06, 0.4, 0.012), M.dark, body, 0, 0.215, 0.02);
  vents(body, M.black, 5, 0.012, 0.03, 0.14, 0, 0.25, 0.27);
  // head: sensor housing with an angry brow over one big eye, mandible blades
  const head = grp(body, 0, -0.02, -0.42);
  mk(latheZ([[0.05, 0.12], [0.15, 0.1], [0.17, 0.0], [0.15, -0.08], [0.1, -0.11]], 14), M.dark, head);
  const eye = eyeAssembly(head, 0.085, M, 0, -0.01, -0.11);
  mk(slab(0.3, 0.16, 0.035, 0.35, 0.01), M.shell, head, 0, 0.1, -0.06, -0.55);                                  // brow
  for (const sx of [-1, 1]) {
    mk(slab(0.05, 0.12, 0.03, 0.4), M.accent, head, sx * 0.1, 0.085, -0.12, -0.55, 0, sx * 0.35);
    const mand = grp(head, sx * 0.13, -0.07, -0.02); mand.rotation.set(0.15, sx * 0.35, 0);
    mk(taperPlate(0.06, 0.02, 0.24, 0.025), M.dark, mand); mk(new THREE.ConeGeometry(0.012, 0.06, 4).rotateX(-Math.PI / 2), M.chrome, mand, 0, 0, -0.26);
  }
  for (const [sx, y] of [[-1, 0.04], [1, 0.04]]) mk(new THREE.SphereGeometry(0.018, 8, 6), M.red, head, sx * 0.12, y, -0.1); // secondary sensors
  // swept insect arms + ducted fans (nacelles)
  const rotors = [], thrusters = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const arm = grp(body, sx * 0.16, 0.02, sz * 0.14); arm.rotation.y = Math.atan2(sx * 0.46, sz * 0.38) + Math.PI; arm.rotation.z = 0;
    mk(taperPlate(0.11, 0.06, 0.52, 0.05), M.dark, arm, 0, 0, 0, 0.16);
    mk(taperPlate(0.08, 0.04, 0.42, 0.03), M.shell, arm, 0, 0.035, -0.04, 0.16);
    const nac = grp(body, sx * 0.62, -0.06, sz * 0.48); nac.rotation.set(sz * 0.12, 0, -sx * 0.14);
    mk(lathe([[0.25, -0.06], [0.3, -0.05], [0.31, 0.03], [0.29, 0.06], [0.26, 0.06], [0.25, 0.0]], 24), M.shell, nac);  // duct
    mk(tor(0.275, 0.012, 24, 4).rotateX(Math.PI / 2), M.accent, nac, 0, 0.065, 0);
    mk(tor(0.255, 0.01, 24, 4).rotateX(Math.PI / 2), M.red, nac, 0, -0.065, 0);                                        // under-glow
    mk(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), M.dark, nac);                                                  // motor
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; mk(new THREE.BoxGeometry(0.2, 0.012, 0.022), M.black, nac, Math.cos(a) * 0.15, -0.02, Math.sin(a) * 0.15, 0, -a, 0); }
    const rot = grp(nac, 0, 0.025, 0);
    mk(new THREE.CylinderGeometry(0.24, 0.24, 0.004, 24), M.blur, rot);
    for (let k = 0; k < 3; k++) mk(new THREE.BoxGeometry(0.23, 0.006, 0.045), M.black, rot, 0, 0, 0, 0.3, k / 3 * Math.PI * 2, 0).geometry.translate(0.12, 0, 0);
    thrusters.push(halo(M.haloHot, nac, 0.35, 0, -0.1, 0));
    rotors.push(rot);
  }
  // under-slung plasma twin gun (pitches toward the target)
  const gun = grp(body, 0, -0.2, -0.18);
  mk(slab(0.16, 0.2, 0.08, 0.35, 0.01), M.dark, gun);
  for (const sx of [-1, 1]) {
    mk(cylZ(0.024, 0.42, 10), M.dark, gun, sx * 0.05, -0.03, -0.2);
    for (let k = 0; k < 3; k++) mk(tor(0.032, 0.008, 10, 4), M.black, gun, sx * 0.05, -0.03, -0.12 - k * 0.06);
    mk(cylZ(0.02, 0.03, 10), M.hot, gun, sx * 0.05, -0.03, -0.42);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.03, -0.44); gun.add(muzzle);
  const beam = mk(new THREE.CylinderGeometry(0.007, 0.007, 1, 4).rotateX(Math.PI / 2).translate(0, 0, -0.5), M.beam, gun, 0, -0.03, -0.44); beam.visible = false; // targeting laser
  // tail antennae with blinking tips + folded landing legs
  const blink = [];
  for (const sx of [-1, 1]) { mk(new THREE.CylinderGeometry(0.006, 0.01, 0.4, 5), M.dark, body, sx * 0.06, 0.24, 0.42, -0.9, 0, sx * 0.25); blink.push(mk(new THREE.SphereGeometry(0.016, 6, 5), M.red, body, sx * 0.11, 0.37, 0.6)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = grp(body, sx * 0.13, -0.16, sz * 0.15); l.rotation.set(sz * 0.3, 0, sx * 0.5); mk(new THREE.BoxGeometry(0.025, 0.2, 0.025), M.dark, l, 0, -0.1, 0); mk(new THREE.BoxGeometry(0.022, 0.16, 0.022), M.black, l, sx * 0.05, -0.24, 0, 0, 0, -sx * 0.9); }
  const eyeHalo = halo(M.halo, head, 0.6, 0, -0.01, -0.2);
  const o = { root, body, head, eye: eye.pupil, eyeHalo, rotors, thrusters, gun, muzzle, blink, beam };
  return finish(root, o);
}

// ================================================================== Skitter: six-legged hunter
export function buildCrawler() {
  const M = mmats(); const root = new THREE.Group(); const body = grp(root, 0, 0.65, 0);
  // thorax frame + segmented carapace
  mk(slab(0.62, 0.7, 0.26, 0.3, 0.03), M.dark, body, 0, 0, -0.05);
  for (let i = 0; i < 3; i++) { mk(slab(0.7 - i * 0.06, 0.3, 0.07, 0.35, 0.015), i === 1 ? M.shellB : M.shell, body, 0, 0.16 + i * 0.012, -0.32 + i * 0.22, 0.12); }
  for (const sx of [-1, 1]) { mk(slab(0.05, 0.6, 0.16, 0.3, 0.01), M.accent, body, sx * 0.34, 0.02, -0.05, 0, 0, sx * 0.25); vents(body, M.black, 4, 0.012, 0.08, 0.1, sx * 0.3, 0.13, 0.12, Math.PI / 2); }
  // abdomen: ribbed shell around the exposed core (weak point)
  const abd = grp(body, 0, 0.08, 0.5); abd.rotation.x = -0.25;
  mk(latheZ([[0.05, 0.42], [0.22, 0.36], [0.3, 0.16], [0.31, -0.02], [0.24, -0.16], [0.1, -0.24]], 12), M.shell, abd, 0, 0, 0, 0, 0, 0, 1, 0.75, 1);
  for (let i = 0; i < 3; i++) mk(tor(0.3 - i * 0.03, 0.025, 14, 4), M.dark, abd, 0, 0, 0.0 + i * 0.12, 0, 0, 0, 1, 0.78, 1);
  const core = mk(new THREE.SphereGeometry(0.12, 14, 10), M.core, abd, 0, 0.2, 0.12);
  for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(0.02, 0.06, 0.26), M.dark, abd, -0.09 + i * 0.06, 0.29, 0.12);
  halo(M.haloCore, abd, 0.6, 0, 0.24, 0.12);
  // head: wedge with a cluster of four eyes and twin laser emitters
  const head = grp(body, 0, 0.05, -0.48);
  mk(slab(0.4, 0.3, 0.2, 0.3, 0.025), M.dark, head);
  mk(slab(0.44, 0.24, 0.06, 0.35, 0.012), M.shell, head, 0, 0.11, 0.02, -0.25);
  mk(new THREE.SphereGeometry(0.05, 12, 8), M.eye, head, -0.07, 0.02, -0.15);
  mk(new THREE.SphereGeometry(0.05, 12, 8), M.eye, head, 0.07, 0.02, -0.15);
  for (const sx of [-1, 1]) { mk(new THREE.SphereGeometry(0.026, 8, 6), M.eye, head, sx * 0.15, 0.05, -0.12); mk(tor(0.055, 0.01, 12, 4), M.black, head, sx * 0.07, 0.02, -0.15); }
  for (const sx of [-1, 1]) { mk(cylZ(0.028, 0.36, 10), M.dark, head, sx * 0.12, -0.08, -0.25); mk(cylZ(0.022, 0.03, 10), M.hot, head, sx * 0.12, -0.08, -0.44); mk(slab(0.03, 0.18, 0.05, 0.4), M.chrome, head, sx * 0.2, -0.1, -0.16, 0, sx * 0.3); }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.08, -0.46); head.add(muzzle);
  const eyeHalo = halo(M.halo, head, 0.55, 0, 0.02, -0.2);
  // six legs, tripod gait
  const legs = [];
  for (const [sx, sz, ph] of [[-1, -0.3, 0], [1, -0.3, Math.PI], [-1, 0.02, Math.PI], [1, 0.02, 0], [-1, 0.32, 0], [1, 0.32, Math.PI]]) {
    // symmetric joint parts live on the parent segment so each leg costs only ~4 draw calls
    mk(new THREE.SphereGeometry(0.08, 10, 8), M.black, body, sx * 0.33, -0.02, sz);
    const hip = grp(body, sx * 0.33, -0.02, sz);
    const up = grp(hip); up.rotation.order = 'YXZ'; up.rotation.set(0, -sx * (Math.PI / 2 + sz * 1.6), 0);
    mk(taperPlate(0.12, 0.08, 0.58, 0.08), M.dark, up); mk(taperPlate(0.1, 0.06, 0.48, 0.04), M.shell, up, 0, 0.05, -0.04);
    mk(cylZ(0.016, 0.42, 6), M.dark, up, 0, -0.06, -0.29); mk(cylX(0.055, 0.12, 10), M.dark, up, 0, 0, -0.58);
    const kn = grp(up, 0, 0, -0.58);
    const lo = grp(kn); mk(taperPlate(0.08, 0.035, 0.82, 0.06), M.dark, lo); mk(taperPlate(0.06, 0.02, 0.5, 0.03), M.accent, lo, 0, 0.04, -0.08);
    mk(new THREE.ConeGeometry(0.03, 0.18, 6).rotateX(-Math.PI / 2), M.dark, lo, 0, 0, -0.9);
    legs.push({ hip, up, kn, lo, sx, sz, ph });
  }
  const eye = new THREE.Object3D(); eye.position.set(0, 0.03, -0.17); head.add(eye);
  const o = { root, body, head, eye, eyeHalo, core, muzzle, legs };
  finish(root, o); head.children.forEach((m) => { if (m.isMesh && m.material === M.eye) o.eyeMesh = m; });
  return o;
}

// ================================================================== Tick: kamikaze crawler mine
export function buildTick() {
  const M = mmats(); const root = new THREE.Group(); const body = grp(root, 0, 0.32, 0);
  mk(lathe([[0.04, -0.12], [0.2, -0.1], [0.24, -0.02], [0.22, 0.06], [0.14, 0.13], [0.05, 0.15]], 12), M.shell, body);
  mk(tor(0.23, 0.02, 16, 4).rotateX(Math.PI / 2), M.dark, body, 0, -0.02, 0);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; mk(slab(0.07, 0.12, 0.02, 0.4), M.accent, body, Math.cos(a) * 0.17, 0.09, Math.sin(a) * 0.17, 0, -a + Math.PI / 2, 0.55); }
  const light = mk(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.eye, body, 0, 0.14, 0);
  const eye = mk(new THREE.SphereGeometry(0.03, 8, 6), M.eye, body, 0, 0.0, -0.22);
  const glow = halo(M.halo, body, 0.5, 0, 0.18, 0);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4; const hip = grp(body, Math.cos(a) * 0.18, -0.04, Math.sin(a) * 0.18); hip.rotation.y = -a - Math.PI / 2;
    const up = grp(hip); up.rotation.x = 0.7; mk(taperPlate(0.05, 0.03, 0.22, 0.03), M.dark, up);
    const kn = grp(up, 0, 0, -0.22); kn.rotation.x = -1.9; mk(taperPlate(0.035, 0.012, 0.3, 0.025), M.black, kn);
    legs.push({ hip, up, kn, ph: i % 2 ? Math.PI : 0 });
  }
  const o = { root, body, light, eye, glow, legs };
  return finish(root, o);
}

// ================================================================== Juggernaut Strider: reverse-jointed walker
export function buildStrider() {
  const M = mmats(); const root = new THREE.Group();
  const pelvis = grp(root, 0, 4.5, 0);
  mk(slab(2.0, 1.5, 0.9, 0.3, 0.06), M.dark, pelvis);
  mk(slab(1.6, 1.0, 0.25, 0.35, 0.04), M.shellB, pelvis, 0, -0.5, -0.1, 0.25);
  const torso = grp(pelvis, 0, 0.55, 0);
  // hull: layered armour over a dark frame
  mk(slab(2.6, 2.3, 1.6, 0.22, 0.08), M.dark, torso, 0, 0.85, 0.1);
  mk(slab(2.9, 2.0, 0.22, 0.3, 0.05), M.shell, torso, 0, 1.75, 0.05, -0.06);                         // top deck
  mk(slab(2.4, 1.0, 0.18, 0.3, 0.04), M.shell, torso, 0, 1.6, -1.05, -0.5);                          // glacis
  mk(slab(2.0, 0.5, 0.16, 0.3, 0.04), M.shellB, torso, 0, 0.35, -1.0, 0.45);                         // chin
  for (const sx of [-1, 1]) {
    mk(plate(2.0, 1.3, 0.18, 0.3, 0.04).rotateY(Math.PI / 2), M.shell, torso, sx * 1.38, 0.9, 0.1, 0, 0, sx * 0.08);
    mk(plate(1.6, 0.25, 0.06, 0.3).rotateY(Math.PI / 2), M.accent, torso, sx * 1.48, 1.25, 0.1, 0, 0, sx * 0.08);
    vents(torso, M.black, 6, 0.03, 0.4, 0.5, sx * 1.47, 0.6, 0.6, Math.PI / 2);
  }
  mk(slab(0.3, 1.6, 0.1, 0.4), M.yellow, torso, 0.7, 1.87, 0.2, -0.06); mk(slab(0.3, 1.6, 0.1, 0.4), M.yellow, torso, -0.7, 1.87, 0.2, -0.06);
  // sensor face: sunken cowl, visor slit, main eye, sensor cluster
  const face = grp(torso, 0, 1.0, -1.15);
  mk(plate(1.5, 0.75, 0.5, 0.3, 0.04), M.black, face);
  mk(new THREE.BoxGeometry(1.1, 0.07, 0.05), M.eye, face, 0, 0.18, -0.26);
  const eyeA = eyeAssembly(face, 0.2, M, 0, -0.08, -0.25);
  for (const [x, y] of [[-0.5, -0.12], [0.5, -0.12], [-0.38, 0.0], [0.38, 0.0]]) { mk(new THREE.SphereGeometry(0.06, 10, 8), M.eye, face, x, y, -0.27); mk(tor(0.08, 0.015, 12, 4), M.dark, face, x, y, -0.27); }
  mk(slab(1.7, 0.5, 0.12, 0.35, 0.03), M.shell, face, 0, 0.42, -0.25, -0.7);                        // heavy brow
  const eyeHalo = halo(M.halo, face, 1.6, 0, -0.08, -0.5);
  // back: caged reactor core (weak point), cooling vanes, exhaust stacks, antennae
  const coreG = grp(torso, 0, 0.95, 1.05);
  const core = mk(new THREE.SphereGeometry(0.42, 18, 12), M.core, coreG);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mk(new THREE.BoxGeometry(0.08, 0.08, 0.7), M.dark, coreG, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.05); }
  mk(tor(0.55, 0.07, 20, 6), M.dark, coreG, 0, 0, 0.35); mk(tor(0.55, 0.05, 20, 6), M.dark, coreG, 0, 0, -0.2);
  halo(M.haloCore, coreG, 2.0, 0, 0, 0.3);
  for (const sx of [-1, 1]) { mk(lathe([[0.16, 0], [0.18, 0.1], [0.15, 1.0], [0.19, 1.1], [0.17, 1.15]], 12), M.dark, torso, sx * 0.85, 1.7, 0.75, -0.3); mk(new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2), M.hot, torso, sx * 0.85, 2.82, 1.08, -0.3); }
  for (const sx of [-1, 1]) mk(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 5), M.dark, torso, sx * 1.1, 2.4, 0.5, 0.2, 0, sx * -0.15);
  // chaingun arm (right): shroud, 6 barrels, ammo feed
  const gunArm = grp(torso, 1.85, 1.05, -0.1);
  mk(slab(0.9, 1.1, 0.25, 0.3, 0.04), M.shell, gunArm, 0, 0.72, -0.05, 0, 0, -0.2);              // pauldron
  mk(slab(0.75, 1.3, 0.75, 0.3, 0.05), M.dark, gunArm, 0, 0, -0.1);
  const barrels = grp(gunArm, 0, -0.05, -1.25);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; mk(cylZ(0.065, 1.7, 8), M.dark, barrels, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0); }
  mk(cylZ(0.3, 0.25, 16), M.shellB, barrels, 0, 0, 0.55); mk(cylZ(0.28, 0.08, 16), M.black, barrels, 0, 0, -0.6); mk(cylZ(0.24, 0.06, 16), M.black, barrels, 0, 0, -0.2);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -0.88; barrels.add(muzzle);
  mk(tube([[0.25, 0.1, 0.3], [0.5, 0.3, 0.9], [-0.2, 0.5, 1.3], [-1.0, 0.3, 1.4]], 0.07, 14), M.black, gunArm);
  // rocket pod (left): 3x3 tubes with glowing rims
  const pod = grp(torso, -1.85, 1.6, 0.15);
  mk(slab(1.0, 1.4, 1.0, 0.25, 0.05), M.shell, pod); mk(plate(0.9, 0.9, 0.1, 0.25), M.dark, pod, 0, 0, -0.72);
  for (let i = 0; i < 9; i++) { const x = (i % 3 - 1) * 0.27, y = (Math.floor(i / 3) - 1) * 0.27; mk(cylZ(0.1, 0.12, 10), M.black, pod, x, y, -0.76); mk(tor(0.1, 0.014, 12, 4), M.red, pod, x, y, -0.82); }
  mk(slab(1.02, 0.15, 0.2, 0.3), M.accent, pod, 0, 0.5, 0.2);
  // reverse-jointed legs: hip -> thigh (back) -> knee -> shin (forward) -> ankle -> three-toed foot
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = grp(pelvis, sx * 1.2, -0.1, 0); mk(new THREE.SphereGeometry(0.5, 14, 10), M.black, hip); mk(cylX(0.55, 0.3, 14), M.dark, hip, sx * 0.2, 0, 0);
    const th = grp(hip);
    mk(new THREE.BoxGeometry(0.5, 2.3, 0.6).translate(0, -1.15, 0), M.dark, th);
    mk(plate(0.7, 1.9, 0.18, 0.3, 0.04).translate(0, -1.0, 0), M.shell, th, sx * 0.12, 0, -0.38, 0, sx * 0.15);
    mk(plate(0.12, 1.5, 0.1, 0.3).translate(0, -1.0, 0), M.accent, th, sx * 0.3, 0, -0.45, 0, sx * 0.15);
    piston(th, [sx * 0.32, -0.3, 0.3], [sx * 0.32, -2.0, 0.3], 0.07);
    const kn = grp(th, 0, -2.3, 0); mk(cylX(0.36, 0.7, 14), M.black, kn); mk(cylX(0.2, 0.8, 10), M.chrome, kn);
    const sh = grp(kn);
    mk(new THREE.BoxGeometry(0.42, 2.6, 0.48).translate(0, -1.3, 0), M.dark, sh);
    mk(plate(0.55, 2.0, 0.16, 0.3, 0.04).translate(0, -1.1, 0), M.shellB, sh, 0, 0, -0.3);
    piston(sh, [sx * 0.28, -0.2, 0.25], [sx * 0.28, -2.3, 0.2], 0.06);
    const ft = grp(sh, 0, -2.6, 0); mk(cylX(0.24, 0.55, 10), M.black, ft);
    for (const a of [-0.45, 0, 0.45]) { const toe = grp(ft, 0, -0.15, 0); toe.rotation.y = a; mk(taperPlate(0.34, 0.12, 1.0, 0.22), M.dark, toe, 0, -0.08, -0.05); mk(new THREE.ConeGeometry(0.08, 0.3, 5).rotateX(-Math.PI / 2 - 0.4), M.chrome, toe, 0, -0.16, -1.1); }
    const heel = grp(ft, 0, -0.15, 0); mk(taperPlate(0.24, 0.08, 0.7, 0.18), M.dark, heel, 0, -0.08, 0, 0, Math.PI);
    legs.push({ hip, th, kn, sh, ft, sx });
  }
  const o = { root, pelvis, torso, eye: eyeA.pupil, eyeHalo, core, gunArm, barrels, muzzle, pod, legs };
  return finish(root, o);
}

// ================================================================== Sentinel pylon turret
export function buildSentinel() {
  const M = mmats(); const root = new THREE.Group();
  mk(new THREE.CylinderGeometry(0.75, 0.85, 0.18, 6), M.dark, root, 0, 0.09, 0);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * 6.28; const leg = grp(root, Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55); leg.rotation.y = -a;
    mk(slab(0.6, 0.22, 0.12, 0.3), M.shell, leg, 0.25, 0.05, 0, 0, 0, -0.35); mk(new THREE.ConeGeometry(0.06, 0.4, 5), M.chrome, leg, 0.55, -0.12, 0, Math.PI);
    piston(leg, [0.05, 0.6, 0], [0.45, 0.1, 0], 0.03);
  }
  mk(lathe([[0.4, 0.15], [0.32, 0.3], [0.22, 0.4], [0.2, 1.3], [0.28, 1.4], [0.3, 1.6], [0.24, 1.7]], 14), M.dark, root);
  for (let i = 0; i < 3; i++) mk(tor(0.215, 0.018, 16, 4).rotateX(Math.PI / 2), M.red, root, 0, 0.6 + i * 0.25, 0);
  const ring = grp(root, 0, 1.15, 0);
  mk(tor(0.42, 0.04, 24, 4).rotateX(Math.PI / 2), M.shell, ring); for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; mk(new THREE.BoxGeometry(0.08, 0.12, 0.08), M.dark, ring, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42); mk(new THREE.SphereGeometry(0.025, 6, 5), M.eyeCalm, ring, Math.cos(a) * 0.47, 0, Math.sin(a) * 0.47); }
  const head = grp(root, 0, 2.0, 0);
  mk(slab(0.8, 0.95, 0.5, 0.28, 0.04), M.dark, head);
  mk(slab(0.9, 0.85, 0.12, 0.3, 0.03), M.shell, head, 0, 0.3, 0.02, -0.08);
  for (const sx of [-1, 1]) { mk(plate(0.8, 0.42, 0.1, 0.3).rotateY(Math.PI / 2), M.shell, head, sx * 0.44, 0.0, 0.0, 0, 0, sx * 0.1); mk(plate(0.7, 0.12, 0.04, 0.3).rotateY(Math.PI / 2), M.accent, head, sx * 0.5, 0.1, 0.0, 0, 0, sx * 0.1); }
  const eyeA = eyeAssembly(head, 0.12, M, 0, 0.04, -0.47);
  mk(slab(0.5, 0.2, 0.05, 0.4), M.shell, head, 0, 0.19, -0.48, -0.5);
  // rail gun barrel with cooling fins and a hot tip
  mk(slab(0.18, 0.5, 0.18, 0.3), M.dark, head, 0.26, -0.16, -0.45);
  mk(cylZ(0.05, 0.8, 10), M.dark, head, 0.26, -0.16, -0.85);
  for (let k = 0; k < 4; k++) mk(new THREE.BoxGeometry(0.16, 0.16, 0.02), M.black, head, 0.26, -0.16, -0.62 - k * 0.09);
  mk(cylZ(0.035, 0.04, 10), M.hot, head, 0.26, -0.16, -1.26);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.26, -0.16, -1.28); head.add(muzzle);
  const beam = mk(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), M.beam, head, 0, 0.04, -0.55);
  const eyeHalo = halo(M.halo, head, 0.7, 0, 0.04, -0.6);
  const o = { root, head, ring, eye: eyeA.pupil, eyeHalo, muzzle, beam };
  return finish(root, o);
}

// ================================================================== big derelict machine (static landmark, merged into the batcher)
// returns [geometry, material] pairs in the site's local frame
export function derelictParts(scale = 3) {
  const s = buildStrider(); const root = s.root; root.scale.setScalar(scale);
  s.pelvis.rotation.set(-0.9, 0.2, 0.35); s.pelvis.position.y = 1.2; s.legs[0].th.rotation.x = -1.2; s.legs[0].kn.rotation.x = 1.6; s.legs[1].th.rotation.x = 0.6; s.legs[1].kn.rotation.x = 0.3; s.gunArm.rotation.x = 0.8; s.pod.rotation.z = 0.5;
  root.updateMatrixWorld(true); const out = [];
  const dead = mmats();
  root.traverse((m) => { if (!m.isMesh) return; let mat = m.material; if (mat === dead.eye || mat === dead.red || mat === dead.core || mat === dead.hot) mat = dead.black; out.push([m.geometry.clone().applyMatrix4(m.matrixWorld), mat]); });
  return out;
}

// ================================================================== energy shield bubble (players and raiders)
// hex-cell shimmer with a fresnel rim; only visible for a moment after a hit (flash()), so it costs nothing at rest
export function makeShieldBubble(h = 1.95, r = 0.62) {
  const geo = new THREE.SphereGeometry(1, 24, 16); geo.scale(r, h / 2, r); geo.translate(0, h / 2 - 0.05, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { amt: { value: 0 }, col: { value: new THREE.Color(0x4cc8ff) }, time: { value: 0 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float amt, time; uniform vec3 col; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float hexEdge(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5; p = abs(fract(p) - 0.5); return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0); }
      void main(){
        vec2 uv = vec2(atan(vP.z, vP.x) * 2.6, vP.y * 5.0 - time * 0.6);
        float e = smoothstep(0.12, 0.0, hexEdge(uv));
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float a = (rim * 0.9 + e * 0.55 + 0.05) * amt;
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 5; m.userData.keep = true; m.frustumCulled = false;
  m.userData.flash = (k = 1, color = 0x4cc8ff) => { mat.uniforms.amt.value = Math.max(mat.uniforms.amt.value, k); mat.uniforms.col.value.setHex(color); m.visible = true; };
  m.userData.tick = (dt, t) => { const u = mat.uniforms; if (u.amt.value <= 0) return; u.amt.value = Math.max(0, u.amt.value - dt * 2.2); u.time.value = t; m.visible = u.amt.value > 0.01; };
  return m;
}
