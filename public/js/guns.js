// Detailed, part-by-part firearm models with physically based materials and modular attachments.
// Convention: bore axis along -Z (muzzle forward), y = 0 on the bore line, +Z toward the stock.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEX } from './textures.js';
import { WEAPONS, MODS, DEFAULT_MODS } from './items.js';

let M = null;
function mats() {
  if (M) return M;
  const std = (t, o = {}) => { const tx = TEX[t]; const m = new THREE.MeshStandardMaterial({ map: tx.map, normalMap: tx.normalMap, roughnessMap: tx.roughnessMap, metalnessMap: tx.roughnessMap, metalness: o.metal ?? 1, roughness: 1, color: o.color ?? 0xffffff, envMapIntensity: o.env ?? 1.2, aoMap: tx.roughnessMap, aoMapIntensity: 0.7 }); m.normalScale.set(o.ns ?? 0.6, o.ns ?? 0.6); return m; };
  M = {
    steel: std('steel'), receiver: std('anodized'), poly: std('polymer'), fde: std('fde'), wood: std('woodStock', { env: 0.6 }), fdePoly: std('polymer', { color: 0xc8a878 }),
    odPoly: std('polymer', { color: 0x9aa070 }), plum: std('polymer', { color: 0x9a5a40 }), akWood: std('woodStock', { env: 0.5, color: 0xd09a70 }), blued: std('steel', { color: 0x9aa0b0, ns: 0.4 }),
    glassFiber: std('polymer', { color: 0x6a7050 }), parkStock: std('fde', { color: 0x8a9070 }), dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7, metalness: 0.3 }),
    bright: new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.25, metalness: 1 }), brass: new THREE.MeshStandardMaterial({ color: 0xb8902a, roughness: 0.3, metalness: 1 }),
    shellRed: new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5, metalness: 0.0 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.02, metalness: 1, transparent: true, opacity: 0.35, envMapIntensity: 2 }),
    lensSolid: new THREE.MeshStandardMaterial({ color: 0x20303a, roughness: 0.05, metalness: 1, envMapIntensity: 2.5 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), dotGreen: new THREE.MeshBasicMaterial({ color: 0x3aff6a, toneMapped: false }),
    tritium: new THREE.MeshBasicMaterial({ color: 0x9aff5a, toneMapped: false }), orange: new THREE.MeshStandardMaterial({ color: 0xe06a1a, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95, metalness: 0 }),
    laserLens: new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), lightLens: new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }),
  };
  for (const m of Object.values(M)) m.userData.shared = true;
  return M;
}

// ---------- primitive helpers (cached geometries)
const gc = new Map();
const G = (k, f) => { if (!gc.has(k)) { const g = f(); g.userData.shared = true; gc.set(k, g); } return gc.get(k); };
const rb = (w, h, d, r = 0.002) => G(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
const cyl = (r0, r1, len, seg = 16) => G(`cy${r0},${r1},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); return g; }); // along Z, r0 at +z
const lathe = (k, pts, seg = 24) => G('la' + k, () => { const g = new THREE.LatheGeometry([...pts].sort((a, b) => a[1] - b[1]).map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(-Math.PI / 2); return g; }); // profile along -Z
const tor = (r, t, arc) => G(`to${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 6, 16, arc));
const extrude = (k, pts, depth) => G('ex' + k, () => { const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 }); g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6); return g; }); // profile in (z,y) plane, extruded across x

class Builder {
  constructor(root) { this.root = root; this.cur = root; }
  at(parent) { this.cur = parent; return this; }
  p(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true; this.cur.add(m); return m;
  }
  g(x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); this.cur.add(g); return g; }
  // picatinny rail: base + teeth
  rail(x, y, z0, z1, mat, side = 0) {
    const len = z1 - z0, g = this.g(x, y, (z0 + z1) / 2); g.rotation.z = side;
    const old = this.cur; this.cur = g;
    this.p(rb(0.021, 0.006, len, 0.001), mat, 0, 0, 0);
    const n = Math.floor(len / 0.01);
    const tooth = rb(0.021, 0.004, 0.0052, 0.0008);
    for (let i = 0; i < n; i++) this.p(tooth, mat, 0, 0.005, -len / 2 + 0.005 + i * 0.01);
    this.cur = old; return g;
  }
  // M-LOK slot cut-outs on a handguard face
  mlok(x, y, z0, z1, rz = 0, mat) { const n = Math.floor((z1 - z0) / 0.045); for (let i = 0; i < n; i++) this.p(rb(0.0015, 0.008, 0.032, 0.0007), mat, x, y, z0 + 0.025 + i * 0.045, 0, 0, rz); }
  screw(x, y, z, axis = 'x', r = 0.003) { const m = this.p(G('screw' + r, () => new THREE.CylinderGeometry(r, r, 0.002, 10)), mats().bright, x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; return m; }
}

// ---------- shared sub-assemblies
function pistolGrip(b, m, x, y, z, ang = 0.32, len = 0.11, w = 0.03) {
  const g = b.g(x, y, z); g.rotation.x = -ang; const o = b.cur; b.cur = g;
  b.p(rb(w, len, 0.044, 0.008), m, 0, -len / 2, 0);
  b.p(rb(w + 0.002, len * 0.8, 0.012, 0.004), m, 0, -len / 2, -0.024); // finger grooves
  for (let i = 0; i < 3; i++) b.p(rb(w + 0.003, 0.004, 0.01, 0.002), m, 0, -0.03 - i * 0.025, -0.029);
  b.p(rb(w + 0.002, 0.008, 0.05, 0.003), m, 0, -len + 0.002, 0.002); // base cap
  b.cur = o; return g;
}
function triggerGroup(b, z, y, m) {
  b.p(tor(0.022, 0.0028, Math.PI), m, 0, y, z, 0, Math.PI / 2, Math.PI); // guard
  b.p(rb(0.005, 0.002, 0.05), m, 0, y - 0.022, z);
  b.p(G('trig', () => { const g = new THREE.TorusGeometry(0.012, 0.0025, 5, 10, Math.PI * 0.6); return g; }), mats().steel, 0, y + 0.006, z + 0.006, 0, Math.PI / 2, Math.PI * 1.15);
}
function stanag(b, m, n = 4, seg = 0.035, w = 0.024, curve = 0.08) {
  const g = b.g(0, 0, 0); const o = b.cur; b.cur = g;
  let y = 0, z = 0, a = 0;
  for (let i = 0; i < n; i++) {
    const s = b.g(0, y, z); s.rotation.x = a; const o2 = b.cur; b.cur = s;
    b.p(rb(w, seg + 0.002, 0.062, 0.003), m, 0, -seg / 2, 0);
    b.p(rb(w + 0.002, seg * 0.7, 0.003, 0.001), m, 0, -seg / 2, 0.031); // spine ridge
    b.p(rb(0.0015, seg * 0.6, 0.044, 0.0007), m, w / 2 + 0.0005, -seg / 2, -0.004); // side window ridges
    b.p(rb(0.0015, seg * 0.6, 0.044, 0.0007), m, -w / 2 - 0.0005, -seg / 2, -0.004);
    b.cur = o2;
    y -= Math.cos(a) * seg; z -= Math.sin(a) * seg; a += curve;
  }
  const bp = b.g(0, y, z); bp.rotation.x = a - curve; b.cur = bp; b.p(rb(w + 0.006, 0.01, 0.07, 0.003), m, 0, -0.003, -0.002); // base plate
  b.cur = o; return g;
}
function boxMag(b, m, h, w = 0.022, d = 0.058, lean = 0.12) {
  const g = b.g(0, 0, 0); g.rotation.x = lean; const o = b.cur; b.cur = g;
  b.p(rb(w, h, d, 0.003), m, 0, -h / 2, 0);
  b.p(rb(w + 0.004, 0.012, d + 0.008, 0.003), m, 0, -h + 0.002, 0);
  for (let i = 0; i < 3; i++) b.p(rb(0.002, 0.003, d * 0.6, 0.001), mats().dark, w / 2, -0.02 - i * h * 0.25, 0); // witness holes row
  b.cur = o; return g;
}
function drumMag(b, m, r = 0.055) {
  const g = b.g(0, 0, 0); const o = b.cur; b.cur = g;
  b.p(rb(0.024, 0.05, 0.06, 0.003), m, 0, -0.025, 0);           // feed tower
  const d = b.p(G('drum' + r, () => { const c = new THREE.CylinderGeometry(r, r, 0.07, 28); c.rotateZ(Math.PI / 2); return c; }), m, 0, -0.05 - r, 0.005);
  for (const sx of [-1, 1]) { b.p(G('drumcap' + r, () => { const c = new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.006, 28); c.rotateZ(Math.PI / 2); return c; }), mats().receiver, sx * 0.037, -0.05 - r, 0.005); b.p(G('wind', () => { const c = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6); c.rotateZ(Math.PI / 2); return c; }), mats().bright, sx * 0.043, -0.05 - r, 0.005); }
  b.cur = o; return g;
}

// ---------- attachments
function buildOptic(b, id, railY, z) {
  const m = mats(); const g = b.g(0, railY, z); const o = b.cur; b.cur = g;
  let sightY = 0.035, eye = 0.15, reticle = null;
  if (id === 'reddot') {
    b.p(rb(0.024, 0.014, 0.045, 0.002), m.receiver, 0, 0.007, 0);        // riser mount
    b.p(rb(0.03, 0.006, 0.012, 0.002), m.receiver, 0.004, 0.004, 0.012);  // cross bolt
    b.screw(0.019, 0.004, 0.012, 'x', 0.004);
    b.p(cyl(0.019, 0.019, 0.042, 24), m.receiver, 0, 0.037, -0.002);       // tube
    b.p(lathe('rdhood', [[0.019, 0.006], [0.021, 0.006], [0.021, 0.0]]), m.receiver, 0, 0.037, -0.022);
    b.p(rb(0.012, 0.01, 0.014, 0.002), m.receiver, 0, 0.058, 0);           // elevation turret
    b.p(G('cap', () => { const c = new THREE.CylinderGeometry(0.009, 0.009, 0.01, 18); c.rotateZ(Math.PI / 2); return c; }), m.receiver, 0.024, 0.037, 0); // battery cap
    b.p(cyl(0.016, 0.016, 0.001, 24), m.lens, 0, 0.037, -0.02);
    b.p(cyl(0.016, 0.016, 0.001, 24), m.lens, 0, 0.037, 0.018);
    reticle = b.p(G('dotS', () => new THREE.SphereGeometry(0.0009, 8, 6)), m.dot, 0, 0.037, -0.019);
    sightY = 0.037; eye = 0.16;
  } else if (id === 'holo') {
    b.p(rb(0.03, 0.012, 0.09, 0.002), m.receiver, 0, 0.006, 0);           // base / battery compartment
    b.p(G('holocap', () => { const c = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 18); c.rotateZ(Math.PI / 2); return c; }), m.receiver, 0, 0.008, 0.03);
    b.p(rb(0.036, 0.004, 0.012, 0.002), m.receiver, 0, 0.003, -0.025);   // throw lever clamp
    b.p(rb(0.006, 0.012, 0.006, 0.002), m.bright, 0.02, 0.006, -0.025);
    for (const sx of [-1, 1]) b.p(rb(0.004, 0.036, 0.05, 0.0015), m.receiver, sx * 0.018, 0.03, -0.012); // hood sides
    b.p(rb(0.04, 0.005, 0.054, 0.002), m.receiver, 0, 0.049, -0.012);    // hood top
    b.p(rb(0.006, 0.006, 0.01, 0.002), m.dark, 0.012, 0.016, 0.02);        // buttons
    b.p(rb(0.006, 0.006, 0.01, 0.002), m.dark, -0.012, 0.016, 0.02);
    b.p(rb(0.03, 0.028, 0.001, 0.0005), m.lens, 0, 0.031, -0.034);
    b.p(rb(0.03, 0.028, 0.001, 0.0005), m.lens, 0, 0.031, 0.01);
    reticle = b.g(0, 0.031, -0.033);
    const ring = new THREE.Mesh(G('holoring', () => new THREE.TorusGeometry(0.0045, 0.00028, 4, 32)), m.dot); reticle.add(ring);
    reticle.add(new THREE.Mesh(G('dotS', () => new THREE.SphereGeometry(0.0009, 8, 6)), m.dot));
    sightY = 0.031; eye = 0.17;
  } else if (id === 'prism') {
    b.p(rb(0.026, 0.012, 0.05, 0.002), m.receiver, 0, 0.006, 0.0);
    b.p(rb(0.04, 0.034, 0.05, 0.006), m.receiver, 0, 0.03, -0.004);       // prism housing
    b.p(cyl(0.02, 0.022, 0.03, 24), m.receiver, 0, 0.032, -0.042);        // objective bell
    b.p(cyl(0.019, 0.019, 0.001, 24), m.lensSolid, 0, 0.032, -0.0575);
    b.p(cyl(0.017, 0.018, 0.028, 24), m.receiver, 0, 0.032, 0.034);        // eyepiece
    b.p(lathe('prEye', [[0.017, 0], [0.019, -0.004], [0.019, -0.008]]), m.rubber, 0, 0.032, 0.052);
    b.p(cyl(0.015, 0.015, 0.001, 24), m.lens, 0, 0.032, 0.0475);
    b.p(G('prKnob', () => { const c = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16); c.rotateZ(Math.PI / 2); return c; }), m.receiver, 0.026, 0.032, -0.002);
    b.p(G('prTur', () => new THREE.CylinderGeometry(0.008, 0.008, 0.008, 16)), m.receiver, 0, 0.05, -0.002);
    b.p(rb(0.02, 0.004, 0.012, 0.001), m.bright, -0.022, 0.006, 0.0);
    sightY = 0.032; eye = 0.09;
  } else if (id === 'scope6') {
    b.p(rb(0.024, 0.012, 0.13, 0.002), m.receiver, 0, 0.006, 0.0);        // cantilever base
    for (const rz of [-0.04, 0.045]) { b.p(rb(0.03, 0.032, 0.016, 0.004), m.receiver, 0, 0.024, rz); b.p(G('ring' + rz, () => new THREE.TorusGeometry(0.019, 0.004, 8, 24)), m.receiver, 0, 0.045, rz); for (const sx of [-1, 1]) b.screw(sx * 0.012, 0.064, rz, 'y', 0.0025); }
    b.p(cyl(0.017, 0.017, 0.2, 28), m.receiver, 0, 0.045, 0.0);            // 34mm main tube
    b.p(lathe('scObj', [[0.017, 0.1], [0.026, 0.13], [0.027, 0.16], [0.027, 0.2]], 32), m.receiver, 0, 0.045, 0); // objective bell
    b.p(cyl(0.024, 0.024, 0.001, 28), m.lensSolid, 0, 0.045, -0.2);
    b.p(lathe('scOcu', [[0.02, -0.17], [0.021, -0.16], [0.021, -0.12], [0.017, -0.1]], 32), m.receiver, 0, 0.045, 0);
    b.p(cyl(0.021, 0.021, 0.018, 32), m.rubber, 0, 0.045, 0.145);          // knurled power ring
    for (let i = 0; i < 16; i++) b.p(rb(0.002, 0.003, 0.016, 0.0008), m.dark, Math.cos(i / 16 * 6.28) * 0.0215, 0.045 + Math.sin(i / 16 * 6.28) * 0.0215, 0.145, 0, 0, i / 16 * 6.28);
    b.p(cyl(0.019, 0.019, 0.001, 28), m.lens, 0, 0.045, 0.172);
    b.p(G('turE', () => new THREE.CylinderGeometry(0.013, 0.013, 0.024, 24)), m.receiver, 0, 0.073, 0.0);
    b.p(G('turE2', () => new THREE.CylinderGeometry(0.0135, 0.0135, 0.008, 24)), m.bright, 0, 0.083, 0.0);
    b.p(G('turW', () => { const c = new THREE.CylinderGeometry(0.012, 0.012, 0.022, 24); c.rotateZ(Math.PI / 2); return c; }), m.receiver, 0.028, 0.045, 0.0);
    b.p(G('turP', () => { const c = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 24); c.rotateZ(Math.PI / 2); return c; }), m.receiver, -0.026, 0.045, 0.0);
    sightY = 0.045; eye = 0.09;
  }
  b.cur = o;
  return { sightY: railY + sightY, eye, reticle, z };
}
function buildIrons(b, railY, zr, zf, folded) {
  const m = mats();
  // rear aperture
  const r = b.g(0, railY, zr); const o = b.cur; b.cur = r;
  b.p(rb(0.022, 0.008, 0.02, 0.002), m.receiver, 0, 0.004, 0);
  const ap = b.g(0, 0.008, 0); ap.rotation.x = folded ? -1.45 : 0; b.cur = ap;
  for (const sx of [-1, 1]) b.p(rb(0.005, 0.024, 0.005, 0.0015), m.receiver, sx * 0.0065, 0.012, 0); // protective ears
  b.p(rb(0.006, 0.006, 0.004, 0.001), m.receiver, 0, 0.0055, 0);
  b.p(G('apert', () => new THREE.TorusGeometry(0.0042, 0.0016, 6, 18)), m.receiver, 0, 0.0185, 0); // see-through peep
  // front post
  b.cur = o; const f = b.g(0, railY, zf); b.cur = f;
  b.p(rb(0.022, 0.008, 0.016, 0.002), m.receiver, 0, 0.004, 0);
  const fp = b.g(0, 0.008, 0); fp.rotation.x = folded ? 1.45 : 0; b.cur = fp;
  for (const sx of [-1, 1]) b.p(rb(0.003, 0.024, 0.006, 0.001), m.receiver, sx * 0.008, 0.012, 0);
  b.p(rb(0.0022, 0.02, 0.003, 0.0008), m.steel, 0, 0.01, 0);
  b.p(G('trit', () => new THREE.SphereGeometry(0.0012, 6, 4)), m.tritium, 0, 0.0195, 0.001);
  b.cur = o;
  return { sightY: railY + 0.0185, eye: 0.42 };
}
function buildMuzzle(b, id, r, z) {
  const m = mats(); const g = b.g(0, 0, z); const o = b.cur; b.cur = g; let len = 0;
  if (id === 'none_muz') { // A2-style birdcage flash hider
    b.p(cyl(r * 1.1, r * 1.1, 0.055, 14), m.steel, 0, 0, -0.0275);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.3; b.p(rb(0.0015, 0.004, 0.03, 0.0005), m.dark, Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, -0.035, 0, 0, a + Math.PI / 2); }
    len = 0.055;
  } else if (id === 'comp') {
    b.p(cyl(r * 1.35, r * 1.35, 0.06, 16), m.steel, 0, 0, -0.03);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.p(rb(0.002, 0.007, 0.006, 0.0008), m.dark, sx * r * 1.33, r * 0.4, -0.015 - i * 0.014);
    for (let i = 0; i < 2; i++) b.p(rb(0.006, 0.002, 0.007, 0.0008), m.dark, 0, r * 1.33, -0.02 - i * 0.016);
    len = 0.06;
  } else if (id === 'brake') {
    b.p(rb(r * 3.2, r * 2.4, 0.07, 0.004), m.steel, 0, 0, -0.035);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.p(rb(0.003, r * 1.7, 0.011, 0.001), m.dark, sx * r * 1.6, 0, -0.016 - i * 0.019);
    b.p(rb(r * 1.4, 0.002, 0.04, 0.0008), m.dark, 0, r * 1.2, -0.04);
    len = 0.07;
  } else if (id === 'supp') {
    const R = Math.max(0.019, r * 2.1);
    b.p(cyl(R * 0.75, R * 0.75, 0.02, 20), m.steel, 0, 0, -0.01);           // mount / taper
    b.p(cyl(R, R, 0.16, 28), m.receiver, 0, 0, -0.095);                    // tube
    b.p(lathe('suppEnd' + R, [[r * 1.1, 0.008], [R * 0.4, 0.008], [R * 0.95, 0.006], [R, 0]], 28), m.receiver, 0, 0, -0.175);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; b.p(rb(0.004, 0.003, 0.012, 0.001), m.receiver, Math.cos(a) * R, Math.sin(a) * R, -0.03, 0, 0, a + Math.PI / 2); } // wrench flats
    b.p(cyl(R + 0.0006, R + 0.0006, 0.004, 28), m.bright, 0, 0, -0.02);
    len = 0.183;
  }
  const tip = b.g(0, 0, -len);
  b.cur = o; return { tip, len };
}
function buildUnderbarrel(b, id, y, z) {
  const m = mats(); const g = b.g(0, y, z); const o = b.cur; b.cur = g;
  if (id === 'vgrip') {
    b.p(rb(0.022, 0.012, 0.04, 0.002), m.poly, 0, -0.006, 0);
    b.p(G('vg', () => { const c = new THREE.CylinderGeometry(0.0145, 0.016, 0.085, 16); return c; }), m.poly, 0, -0.052, 0);
    for (let i = 0; i < 5; i++) b.p(G('vgr', () => new THREE.TorusGeometry(0.0155, 0.0015, 4, 16)), m.poly, 0, -0.025 - i * 0.014, 0, Math.PI / 2);
    b.p(G('vgc', () => new THREE.CylinderGeometry(0.017, 0.017, 0.006, 16)), m.poly, 0, -0.096, 0);
  } else if (id === 'agrip') {
    b.p(extrude('agrip', [[0.04, 0], [-0.04, 0], [-0.03, -0.032], [0.03, -0.012]], 0.022), m.poly, 0, -0.003, 0);
    for (let i = 0; i < 4; i++) b.p(rb(0.024, 0.0025, 0.004, 0.001), m.dark, 0, -0.012 - i * 0.004, -0.02 + i * 0.012);
  } else if (id === 'stop') {
    b.p(extrude('hstop', [[0.012, 0], [-0.012, 0], [-0.008, -0.018], [0.006, -0.008]], 0.02), m.poly, 0, -0.003, 0);
  }
  b.cur = o;
  return g;
}
function buildTactical(b, id, x, y, z, side) {
  const m = mats(); const g = b.g(x, y, z); g.rotation.z = side; const o = b.cur; b.cur = g; let emitter = null;
  if (id === 'laser') {
    b.p(rb(0.03, 0.022, 0.07, 0.003), m.fdePoly, 0, -0.014, 0);
    b.p(cyl(0.0045, 0.0045, 0.004, 12), m.dark, 0.006, -0.012, -0.036);
    b.p(cyl(0.0035, 0.0035, 0.001, 12), m.laserLens, 0.006, -0.012, -0.0385);
    b.p(cyl(0.0045, 0.0045, 0.004, 12), m.dark, -0.007, -0.016, -0.036);
    b.p(rb(0.008, 0.006, 0.008, 0.002), m.rubber, 0, -0.026, 0.02);
    emitter = b.g(0.006, -0.012, -0.04);
  } else if (id === 'light') {
    b.p(rb(0.016, 0.012, 0.03, 0.002), m.receiver, 0, -0.006, 0.005);
    b.p(cyl(0.0125, 0.0125, 0.09, 20), m.receiver, 0, -0.024, -0.005);
    b.p(lathe('bezel', [[0.0145, 0.032], [0.016, 0.03], [0.016, 0.006], [0.0125, 0]], 24), m.receiver, 0, -0.024, -0.05);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; b.p(rb(0.0012, 0.0025, 0.022, 0.0006), m.dark, Math.cos(a) * 0.016, -0.024 + Math.sin(a) * 0.016, -0.066, 0, 0, a + Math.PI / 2); }
    b.p(cyl(0.0135, 0.0135, 0.001, 24), m.lightLens, 0, -0.024, -0.0825);
    b.p(cyl(0.006, 0.006, 0.012, 12), m.rubber, 0, -0.024, 0.045);
    emitter = b.g(0, -0.024, -0.085);
  }
  b.cur = o; return emitter;
}
function buildStock(b, id, style, y, z) {
  // style: 'buffer' (AR-type buffer tube), 'fold' (side folder), 'fixed' (shotgun/wood)
  const m = mats(); const g = b.g(0, y, z); const o = b.cur; b.cur = g;
  if (style === 'buffer') {
    b.p(cyl(0.0145, 0.0145, 0.25, 18), m.receiver, 0, 0, 0.125);
    b.p(G('castle', () => new THREE.TorusGeometry(0.0155, 0.003, 6, 16)), m.receiver, 0, 0, 0.004);
    if (id === 'std_stock') {
      b.p(rb(0.04, 0.05, 0.13, 0.008), m.poly, 0, -0.006, 0.19);
      b.p(rb(0.036, 0.11, 0.025, 0.008), m.poly, 0, -0.03, 0.255);
      b.p(rb(0.038, 0.12, 0.012, 0.004), m.rubber, 0, -0.032, 0.272);
      b.p(rb(0.012, 0.02, 0.06, 0.003), m.poly, 0, -0.04, 0.2);    // adjustment lever
      b.p(rb(0.05, 0.012, 0.03, 0.003), m.poly, 0, 0.012, 0.21);   // cheek weld
    } else if (id === 'heavy_stock') {
      b.p(rb(0.044, 0.06, 0.16, 0.008), m.fdePoly, 0, -0.01, 0.2);
      b.p(rb(0.04, 0.03, 0.12, 0.006), m.fdePoly, 0, 0.034, 0.21);   // cheek riser
      for (const sz of [0.17, 0.24]) b.p(G('knob', () => { const c = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 12); c.rotateZ(Math.PI / 2); return c; }), m.bright, 0, 0.022, sz);
      b.p(rb(0.04, 0.14, 0.03, 0.008), m.fdePoly, 0, -0.035, 0.28);
      b.p(rb(0.042, 0.15, 0.016, 0.006), m.rubber, 0, -0.035, 0.302);
      b.p(rb(0.01, 0.05, 0.03, 0.004), m.fdePoly, 0, -0.08, 0.24);   // monopod spur
    } else if (id === 'light_stock') {
      b.p(rb(0.03, 0.03, 0.04, 0.004), m.receiver, 0, 0, 0.16);
      for (const sx of [-1, 1]) b.p(rb(0.006, 0.008, 0.12, 0.002), m.receiver, sx * 0.012, -0.006, 0.21, 0.25);
      b.p(rb(0.03, 0.1, 0.012, 0.003), m.receiver, 0, -0.035, 0.265);
      b.p(rb(0.032, 0.105, 0.008, 0.003), m.rubber, 0, -0.035, 0.274);
    }
  } else if (style === 'fold') {
    b.p(rb(0.034, 0.03, 0.025, 0.004), m.receiver, 0, 0, 0.012);    // hinge block
    b.p(cyl(0.006, 0.006, 0.03, 10), m.bright, 0.018, 0, 0.012);
    if (id === 'light_stock') {
      b.p(rb(0.006, 0.006, 0.17, 0.002), m.steel, 0.012, 0.005, 0.1); b.p(rb(0.006, 0.006, 0.17, 0.002), m.steel, -0.012, -0.03, 0.1, 0.18);
      b.p(rb(0.03, 0.08, 0.008, 0.003), m.steel, 0, -0.02, 0.19);
    } else {
      b.p(rb(0.03, 0.035, 0.18, 0.006), id === 'heavy_stock' ? m.fdePoly : m.poly, 0, -0.005, 0.11);
      b.p(rb(0.03, 0.06, 0.04, 0.006), id === 'heavy_stock' ? m.fdePoly : m.poly, 0, -0.03, 0.19, 0.2);
      b.p(rb(0.032, 0.11, 0.014, 0.004), m.rubber, 0, -0.035, 0.212);
      if (id === 'heavy_stock') b.p(rb(0.03, 0.025, 0.08, 0.004), m.fdePoly, 0, 0.026, 0.12);
    }
  } else if (style === 'fixed') {
    const sm = id === 'heavy_stock' ? m.fdePoly : id === 'light_stock' ? m.receiver : m.wood;
    if (id === 'light_stock') {
      b.p(rb(0.028, 0.03, 0.06, 0.004), m.receiver, 0, -0.01, 0.03);
      b.p(rb(0.006, 0.008, 0.2, 0.002), m.steel, 0.011, -0.004, 0.14); b.p(rb(0.006, 0.008, 0.21, 0.002), m.steel, -0.011, -0.04, 0.14, 0.2);
      b.p(rb(0.03, 0.11, 0.012, 0.003), m.receiver, 0, -0.04, 0.25); b.p(rb(0.032, 0.115, 0.01, 0.003), m.rubber, 0, -0.04, 0.26);
    } else {
      b.p(extrude('shstock', [[0, 0.015], [0.24, 0.0], [0.27, 0.002], [0.27, -0.13], [0.24, -0.13], [0.07, -0.055], [0.0, -0.035]], 0.036), sm, 0, 0, 0.0);
      b.p(rb(0.04, 0.14, 0.018, 0.006), m.rubber, 0, -0.062, 0.278);
      if (id === 'heavy_stock') b.p(rb(0.03, 0.025, 0.1, 0.004), m.poly, 0, 0.025, 0.16);
    }
  }
  b.cur = o; return g;
}

function specialStock(b, style, info, stockMod, x, y, z) {
  const m = mats(); const g = b.g(x, y, z); const o = b.cur; b.cur = g;
  if (style === 'hk') { // MP5A3 retractable stock: twin steel rails + butt plate
    for (const sx of [-1, 1]) b.p(rb(0.006, 0.006, 0.2, 0.002), m.blued, sx * 0.018, 0.004, 0.1);
    b.p(rb(0.044, 0.1, 0.014, 0.004), m.blued, 0, -0.03, 0.2); b.p(rb(0.046, 0.105, 0.012, 0.005), m.rubber, 0, -0.03, 0.212); b.p(rb(0.04, 0.02, 0.03, 0.004), m.blued, 0, 0.0, 0.01);
  } else if (style === 'akwood') {
    b.p(extrude('akwood', [[0, 0.01], [0.25, -0.025], [0.27, -0.02], [0.27, -0.13], [0.24, -0.13], [0.04, -0.05], [0, -0.04]], 0.04), m.akWood, 0, 0.0, 0.0);
    b.p(rb(0.042, 0.115, 0.01, 0.004), m.blued, 0, -0.075, 0.272);
  } else if (style === 'akfold') { // AK-74M side-folding polymer stock
    b.p(extrude('akfold', [[0, 0.01], [0.24, -0.015], [0.25, -0.01], [0.25, -0.12], [0.22, -0.12], [0.05, -0.05], [0, -0.04]], 0.036), m.plum, 0, 0.0, 0.0);
    b.p(rb(0.03, 0.05, 0.12, 0.004), m.dark, 0, -0.045, 0.14); b.p(rb(0.038, 0.11, 0.012, 0.004), m.rubber, 0, -0.065, 0.255);
  } else if (style === 'svd') { // skeleton thumbhole stock with cheek rest
    b.p(rb(0.036, 0.02, 0.27, 0.006), info.fur, 0, 0.01, 0.13); b.p(rb(0.036, 0.022, 0.24, 0.006), info.fur, 0, -0.1, 0.15, -0.12);
    b.p(rb(0.036, 0.13, 0.03, 0.006), info.fur, 0, -0.045, 0.27); b.p(rb(0.03, 0.09, 0.03, 0.006), info.fur, 0, -0.05, 0.03, 0.3);
    b.p(rb(0.04, 0.03, 0.1, 0.008), m.dark, 0, 0.035, 0.16); b.p(rb(0.038, 0.14, 0.012, 0.004), m.rubber, 0, -0.045, 0.29);
  } else if (style === 'saw') {
    b.p(extrude('sawstock', [[0, 0.02], [0.24, 0.0], [0.26, 0.01], [0.26, -0.11], [0.22, -0.11], [0.06, -0.05], [0, -0.04]], 0.044), m.poly, 0, 0.0, 0.0);
    b.p(rb(0.046, 0.13, 0.014, 0.004), m.rubber, 0, -0.045, 0.262); b.p(cyl(0.01, 0.01, 0.12, 10).clone().rotateZ(Math.PI / 2), m.blued, 0, -0.06, 0.16);
  }
  b.cur = o;
}

// ---------- weapon bodies
function body(b, id, mods) {
  const m = mats(); const W = WEAPONS[id]; const info = { railY: 0.04, irons: null, muzzleR: 0.009, muzzleZ: -0.5, ub: null, tac: null, magPos: [0, -0.02, -0.04], stockStyle: 'buffer', stockPos: [0, 0, 0.11], grip: [0, -0.07, 0.07], fore: [0, -0.04, -0.25], opticZ: 0.02 };
  if (id === 'ar' || id === 'br') {
    const big = id === 'br'; const hg = big ? m.fde : m.receiver, rec = big ? m.fde : m.receiver;
    // lower receiver
    b.p(rb(0.034, 0.046, 0.2, 0.004), rec, 0, -0.036, 0.0);
    b.p(rb(0.03, 0.065, 0.08, 0.004), rec, 0, -0.06, -0.045);                // magwell
    b.p(rb(0.033, 0.01, 0.082, 0.003), rec, 0, -0.092, -0.045);              // flared magwell lip
    triggerGroup(b, 0.022, -0.078, rec);
    pistolGrip(b, big ? m.fdePoly : m.poly, 0, -0.06, 0.06);
    b.p(G('sel', () => { const c = new THREE.CylinderGeometry(0.005, 0.005, 0.038, 12); c.rotateZ(Math.PI / 2); return c; }), m.steel, 0, -0.036, 0.05);
    b.p(rb(0.002, 0.004, 0.014, 0.001), m.steel, 0.02, -0.036, 0.046);       // selector lever
    b.p(rb(0.004, 0.02, 0.012, 0.002), m.steel, -0.018, -0.045, -0.002);     // bolt catch
    b.p(rb(0.006, 0.01, 0.01, 0.002), m.steel, 0.018, -0.05, -0.006);        // mag release
    b.screw(0.017, -0.035, -0.07, 'x', 0.003); b.screw(0.017, -0.035, 0.08, 'x', 0.003);
    // upper receiver
    b.p(rb(0.032, 0.042, 0.2, 0.004), rec, 0, 0.012, 0.0);
    b.p(rb(0.002, 0.016, 0.06, 0.001), m.dark, 0.0165, 0.006, 0.01);          // ejection port
    b.p(rb(0.0015, 0.018, 0.064, 0.001), rec, 0.0178, 0.006, 0.01, 0, 0, 0.0); // dust cover
    b.p(G('fa', () => { const c = new THREE.CylinderGeometry(0.0065, 0.0065, 0.02, 12); c.rotateX(Math.PI / 2 - 0.4); return c; }), rec, 0.02, 0.02, 0.06); // forward assist
    b.p(rb(0.006, 0.006, 0.016, 0.002), rec, 0.019, 0.005, -0.03);             // brass deflector
    { const ch = b.g(0, 0.03, 0.1); const o = b.cur; b.cur = ch; b.p(rb(0.05, 0.008, 0.02, 0.003), rec, 0, 0, 0.01); b.p(rb(0.012, 0.007, 0.03, 0.002), rec, 0, 0, -0.005); b.cur = o; info.charger = { obj: ch, travel: 0.07, axis: 'z' }; info.chargerPos = [0, 0.035, 0.115]; }
    { const bc = b.g(0.0155, 0.006, 0.01); const o = b.cur; b.cur = bc; b.p(rb(0.002, 0.012, 0.05, 0.001), m.bright, 0, 0, 0); b.cur = o; info.boltc = { obj: bc, travel: 0.03 }; }
    b.rail(0, 0.036, -0.1, 0.1, rec);
    // handguard
    const hgLen = big ? 0.36 : 0.34, hz0 = -0.1, hz1 = hz0 - hgLen;
    b.p(G('hg' + big, () => { const c = new THREE.CylinderGeometry(0.029, 0.029, hgLen, 8); c.rotateX(Math.PI / 2); c.rotateZ(Math.PI / 8); return c; }), hg, 0, 0.004, (hz0 + hz1) / 2);
    b.rail(0, 0.036, hz1 + 0.005, hz0, hg);
    b.mlok(0.0275, 0.004, hz1, hz0 - 0.02, 0, m.dark); b.mlok(-0.0275, 0.004, hz1, hz0 - 0.02, 0, m.dark);
    b.mlok(0.0195, -0.0175, hz1, hz0 - 0.02, Math.PI / 4, m.dark); b.mlok(-0.0195, -0.0175, hz1, hz0 - 0.02, -Math.PI / 4, m.dark);
    b.p(G('hgnut', () => new THREE.TorusGeometry(0.0255, 0.004, 8, 20)), m.receiver, 0, 0.004, hz0 + 0.003);
    // barrel + gas
    const bl = big ? 0.13 : 0.11;
    b.p(cyl(0.0095, 0.0085, bl, 16), m.steel, 0, 0.004, hz1 - bl / 2);
    if (big) { b.p(rb(0.02, 0.02, 0.03, 0.003), m.steel, 0, 0.012, hz1 + 0.01); }
    info.muzzleZ = hz1 - bl; info.muzzleY = 0.004; info.muzzleR = big ? 0.0095 : 0.0085;
    info.fore = [0, -0.03, -0.27]; info.ub = [0, -0.025, -0.26]; info.tac = [0.031, 0.02, hz1 + 0.06, -Math.PI / 2];
    info.irons = [0.075, hz1 + 0.015]; info.railY = 0.036;
    info.magPos = [0, -0.085, -0.045]; info.magType = big ? 'box20' : 'stanag';
    info.stockPos = [0, 0.012, 0.1]; info.stockStyle = 'buffer'; info.grip = [0, -0.1, 0.075];
  } else if (id === 'dmr') {
    const c = m.fde;
    b.p(rb(0.036, 0.05, 0.26, 0.004), c, 0, -0.035, 0.0);                    // chassis
    b.p(rb(0.034, 0.042, 0.19, 0.004), m.steel, 0, 0.012, 0.0);              // action
    b.p(rb(0.002, 0.016, 0.07, 0.001), m.dark, 0.0175, 0.012, 0.0);
    { const ch = b.g(0.025, 0.02, -0.01); const o = b.cur; b.cur = ch; b.p(rb(0.03, 0.01, 0.02, 0.003), m.steel, 0, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.08, axis: 'z' }; info.chargerPos = [0.04, 0.02, -0.01]; info.boltc = { obj: ch, travel: 0.05 }; }
    b.p(rb(0.028, 0.06, 0.07, 0.004), c, 0, -0.065, -0.045);
    triggerGroup(b, 0.03, -0.078, c);
    pistolGrip(b, m.fdePoly, 0, -0.06, 0.07, 0.25, 0.12, 0.032);
    b.rail(0, 0.037, -0.13, 0.1, m.receiver);
    const hz0 = -0.13, hz1 = -0.5;
    b.p(G('dmrhg', () => { const g = new RoundedBoxGeometry(0.052, 0.055, 0.37, 2, 0.008); return g; }), c, 0, 0.003, (hz0 + hz1) / 2);
    b.mlok(0.0265, 0.0, hz1, hz0, 0, m.dark); b.mlok(-0.0265, 0.0, hz1, hz0, 0, m.dark);
    b.rail(0, 0.031, hz1 + 0.01, hz0, c);
    b.p(cyl(0.011, 0.0095, 0.17, 16), m.steel, 0, 0.004, hz1 - 0.085);
    info.muzzleZ = hz1 - 0.17; info.muzzleY = 0.004; info.muzzleR = 0.0095;
    info.ub = [0, -0.025, -0.33]; info.tac = [0.027, 0.012, hz1 + 0.05, -Math.PI / 2]; info.fore = [0, -0.03, -0.3];
    info.irons = [0.08, hz1 + 0.02]; info.railY = 0.037; info.magPos = [0, -0.095, -0.045]; info.magType = 'box10';
    info.stockPos = [0, 0.0, 0.13]; info.stockStyle = 'buffer'; info.grip = [0, -0.1, 0.085];
  } else if (id === 'vx') {
    const c = m.poly;
    b.p(rb(0.04, 0.06, 0.25, 0.008), c, 0, -0.012, 0.0);                     // receiver
    b.p(cyl(0.017, 0.017, 0.24, 18), m.receiver, 0, 0.015, -0.01);           // bolt tube
    b.p(rb(0.002, 0.014, 0.045, 0.001), m.dark, 0.0205, 0.006, 0.02);
    { const ch = b.g(-0.022, 0.016, -0.08); const o = b.cur; b.cur = ch; b.p(rb(0.03, 0.008, 0.012, 0.003), m.steel, 0, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.07, axis: 'z' }; info.chargerPos = [-0.04, 0.016, -0.08]; }
    b.p(rb(0.03, 0.05, 0.05, 0.004), c, 0, -0.06, -0.045);
    triggerGroup(b, 0.03, -0.062, c);
    pistolGrip(b, c, 0, -0.045, 0.07);
    b.rail(0, 0.034, -0.12, 0.11, m.receiver);
    b.p(rb(0.044, 0.05, 0.12, 0.008), c, 0, -0.01, -0.165);                  // handguard
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) b.p(rb(0.002, 0.012, 0.018, 0.001), m.dark, sx * 0.022, -0.01, -0.13 - i * 0.025);
    b.rail(0, -0.037, -0.215, -0.12, m.receiver, Math.PI);
    b.p(cyl(0.008, 0.0075, 0.06, 14), m.steel, 0, 0.002, -0.255);
    info.muzzleZ = -0.285; info.muzzleY = 0.002; info.muzzleR = 0.0075;
    info.ub = [0, -0.04, -0.17]; info.tac = [0.023, -0.005, -0.19, -Math.PI / 2]; info.fore = [0, -0.04, -0.17];
    info.irons = [0.09, -0.11]; info.railY = 0.034; info.magPos = [0, -0.07, -0.045]; info.magType = 'smg';
    info.stockPos = [0, 0.0, 0.125]; info.stockStyle = 'fold'; info.grip = [0, -0.085, 0.085];
  } else if (id === 'sg') {
    b.p(rb(0.036, 0.062, 0.21, 0.004), m.steel, 0, -0.015, 0.0);             // receiver
    b.p(rb(0.002, 0.026, 0.07, 0.001), m.dark, 0.0185, -0.01, -0.01);         // ejection port
    b.p(rb(0.002, 0.012, 0.05, 0.001), m.dark, 0, -0.047, -0.01);             // loading port
    triggerGroup(b, 0.035, -0.06, m.steel);
    b.rail(0, 0.018, -0.08, 0.09, m.receiver);
    b.p(cyl(0.0115, 0.0115, 0.48, 18), m.steel, 0, 0.0, -0.33);               // barrel
    b.p(rb(0.008, 0.004, 0.42, 0.001), m.steel, 0, 0.012, -0.33);             // vent rib
    b.p(G('bead', () => new THREE.SphereGeometry(0.0028, 8, 6)), m.bright, 0, 0.017, -0.555);
    const tubeL = mods.magazine === 'ext_mag' ? 0.45 : 0.32;
    b.p(cyl(0.0115, 0.0115, tubeL, 18), m.steel, 0, -0.028, -0.1 - tubeL / 2);
    b.p(cyl(0.0125, 0.0125, 0.02, 18), m.steel, 0, -0.028, -0.1 - tubeL - 0.008);
    b.p(rb(0.03, 0.03, 0.02, 0.004), m.steel, 0, -0.016, -0.1 - tubeL + 0.01); // barrel clamp
    // shell side-saddle
    b.p(rb(0.004, 0.032, 0.09, 0.002), m.receiver, -0.02, -0.012, 0.0);
    for (let i = 0; i < 4; i++) { b.p(cyl(0.0095, 0.0095, 0.05, 12), m.shellRed, -0.03, -0.012, -0.03 + i * 0.022, Math.PI / 2, 0, 0); b.p(cyl(0.0098, 0.0098, 0.012, 12), m.brass, -0.03, 0.012, -0.03 + i * 0.022, Math.PI / 2, 0, 0); }
    info.muzzleZ = -0.57; info.muzzleY = 0.0; info.muzzleR = 0.0115;
    info.pump = [0, -0.028, -0.22]; info.ub = [0, -0.05, -0.23]; info.tac = [0.02, -0.02, -0.4, -Math.PI / 2];
    info.irons = null; info.railY = 0.018; info.stockStyle = 'fixed'; info.stockPos = [0, -0.02, 0.105]; info.grip = [0, -0.08, 0.13]; info.fore = [0, -0.048, -0.22];
    info.magType = 'tube';
  } else if (id === 'p9') {
    const sl = b.g(0, 0, 0); const so = b.cur; b.cur = sl; info.slide = { obj: sl, travel: 0.032 };
    b.p(rb(0.027, 0.03, 0.185, 0.004), m.receiver, 0, 0.01, -0.01);          // slide
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) b.p(rb(0.001, 0.022, 0.0025, 0.0005), m.dark, sx * 0.0137, 0.01, 0.055 + i * 0.0045); // serrations
    b.p(rb(0.002, 0.012, 0.035, 0.001), m.dark, 0.0136, 0.017, -0.005);       // ejection port
    b.p(rb(0.018, 0.006, 0.006, 0.0015), m.receiver, 0, 0.028, 0.07);         // rear sight
    b.p(rb(0.004, 0.006, 0.004, 0.001), m.receiver, 0, 0.028, -0.095);        // front sight
    b.p(G('trit', () => new THREE.SphereGeometry(0.0012, 6, 4)), m.tritium, 0, 0.0305, -0.095);
    for (const sx of [-1, 1]) b.p(G('trit', () => new THREE.SphereGeometry(0.0012, 6, 4)), m.tritium, sx * 0.0045, 0.0305, 0.072);
    b.cur = so;
    b.p(rb(0.006, 0.006, 0.006, 0.0015), m.steel, 0.0115, 0.017, -0.005);      // barrel hood
    b.p(rb(0.026, 0.022, 0.16, 0.004), m.poly, 0, -0.016, -0.015);            // frame
    b.rail(0, -0.031, -0.09, -0.04, m.poly, Math.PI);
    triggerGroup(b, 0.006, -0.036, m.poly);
    pistolGrip(b, m.poly, 0, -0.022, 0.05, 0.28, 0.1, 0.03);
    b.p(cyl(0.006, 0.006, 0.012, 12), m.steel, 0, 0.012, -0.108);             // threaded barrel
    info.muzzleZ = -0.114; info.muzzleY = 0.012; info.muzzleR = 0.0065;
    info.ub = null; info.tac = [0, -0.031, -0.065, 0]; info.fore = null;
    info.irons = null; info.railY = 0.025; info.opticZ = 0.035; info.magPos = [0, -0.03, 0.04]; info.magType = 'pistol';
    info.stockStyle = null; info.grip = [0, -0.06, 0.07];
  } else if (id === 'm1911' || id === 'deagle' || id === 'm9') {
    const big = id === 'deagle', m9 = id === 'm9'; const S = big ? 1.22 : m9 ? 1.05 : 1; const sm = big ? m.bright : m9 ? m.receiver : m.blued;
    const sl = b.g(0, 0, 0); const so = b.cur; b.cur = sl; info.slide = { obj: sl, travel: big ? 0.035 : 0.03 };
    b.p(rb(0.024 * S, 0.028 * S, 0.2 * S, 0.003), sm, 0, 0.01, -0.012 * S);
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) b.p(rb(0.001, 0.02 * S, 0.0022, 0.0005), m.dark, sx * 0.0122 * S, 0.01, 0.06 * S + i * 0.004);
    b.p(rb(0.002, 0.011, 0.03, 0.001), m.dark, 0.0122 * S, 0.016, -0.005);
    b.p(rb(0.014, 0.006, 0.006, 0.0015), m.steel, 0, 0.027 * S, 0.075 * S); b.p(rb(0.004, 0.006, 0.005, 0.001), m.steel, 0, 0.027 * S, -0.1 * S);
    if (big) { b.rail(0, 0.03, -0.11, 0.0, m.steel); for (const sx of [-1, 1]) b.p(rb(0.002, 0.016, 0.12, 0.001), m.dark, sx * 0.0148, 0.014, -0.05); }
    if (m9) { b.p(rb(0.02, 0.008, 0.07, 0.002), m.dark, 0, 0.025, -0.06); b.p(cyl(0.0075, 0.0075, 0.07, 12), m.bright, 0, 0.018, -0.06); for (const sx of [-1, 1]) b.p(rb(0.004, 0.008, 0.014, 0.002), m.steel, sx * 0.014, 0.018, 0.08); }
    b.cur = so;
    b.p(rb(0.022 * S, 0.02, 0.16 * S, 0.003), sm, 0, -0.016, -0.01);          // frame
    triggerGroup(b, 0.006, -0.034, sm);
    const gp = pistolGrip(b, big || m9 ? m.poly : m.akWood, 0, -0.022, 0.055, 0.2, 0.1 * S, 0.028 * S);
    b.p(rb(0.016, 0.02, 0.012, 0.003), sm, 0, 0.01, 0.105 * S, -0.4);             // hammer
    b.p(rb(0.024, 0.006, 0.03, 0.002), sm, 0, -0.012, 0.09 * S);                   // beavertail
    b.p(rb(0.003, 0.006, 0.03, 0.001), m.steel, -0.0125, -0.006, 0.01);             // slide stop
    b.p(cyl(0.0055 * S, 0.0055 * S, 0.006, 12), m.steel, 0, 0.012, -0.118 * S);
    info.muzzleZ = -0.121 * S; info.muzzleY = 0.012; info.muzzleR = 0.006 * S;
    info.tac = [0, -0.028, -0.07, 0]; info.fore = null; info.irons = null; info.railY = 0.03; info.magPos = [0, -0.03, 0.045]; info.magType = 'pistol'; info.stockStyle = null; info.grip = [0, -0.06, 0.075];
    info.pistolSight = { y: 0.03 * S, z: 0.075 * S };
  } else if (id === 'mp5' || id === 'ump') {
    const ump = id === 'ump'; const rc = ump ? m.poly : m.blued;
    if (ump) { b.p(rb(0.044, 0.07, 0.3, 0.008), m.poly, 0, 0.0, -0.02); b.rail(0, 0.036, -0.15, 0.1, m.poly); b.rail(0.023, 0.0, -0.17, -0.06, m.poly, -Math.PI / 2); b.rail(-0.023, 0.0, -0.17, -0.06, m.poly, Math.PI / 2); for (let i = 0; i < 3; i++) b.p(rb(0.046, 0.004, 0.02, 0.001), m.dark, 0, -0.02, -0.12 - i * 0.03); b.p(rb(0.044, 0.052, 0.12, 0.008), m.poly, 0, -0.008, -0.225); b.rail(0, -0.036, -0.27, -0.18, m.poly, Math.PI); }
    else { b.p(cyl(0.02, 0.02, 0.26, 18), rc, 0, 0.008, 0.0); b.p(rb(0.04, 0.012, 0.24, 0.004), rc, 0, -0.012, 0.0); b.p(cyl(0.012, 0.012, 0.2, 14), rc, 0, 0.022, -0.17); // cocking tube
      b.p(G('mp5hg', () => { const g = new THREE.CylinderGeometry(0.024, 0.021, 0.15, 12); g.rotateX(Math.PI / 2); return g; }), m.poly, 0, -0.004, -0.2);
      b.p(G('mp5fs', () => new THREE.TorusGeometry(0.012, 0.003, 6, 16)), rc, 0, 0.04, -0.27); b.p(rb(0.008, 0.02, 0.012, 0.002), rc, 0, 0.03, -0.27);
      b.p(cyl(0.014, 0.014, 0.012, 12).clone().rotateZ(Math.PI / 2), rc, 0, 0.042, 0.1); b.rail(0, 0.03, -0.08, 0.06, m.receiver); }
    { const ch = b.g(-0.02, 0.022, -0.22); const o = b.cur; b.cur = ch; b.p(rb(0.03, 0.008, 0.014, 0.003), m.steel, -0.012, 0, 0); b.p(rb(0.012, 0.016, 0.012, 0.003), m.poly, -0.028, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.06, axis: 'z' }; info.chargerPos = [-0.05, 0.022, -0.22]; }
    b.p(rb(0.032, 0.035, 0.06, 0.004), m.poly, 0, -0.045, 0.06);                 // trigger group housing
    triggerGroup(b, 0.06, -0.06, m.poly); pistolGrip(b, m.poly, 0, -0.06, 0.085);
    b.p(rb(0.026, 0.03, 0.05, 0.004), rc, 0, -0.04, -0.05);                      // magwell
    b.p(cyl(0.008, 0.008, 0.05, 12), m.steel, 0, 0.008, -0.3);
    info.muzzleZ = -0.325; info.muzzleY = 0.008; info.muzzleR = 0.008; info.ub = [0, -0.03, -0.2]; info.tac = [0.026, -0.004, -0.2, -Math.PI / 2]; info.fore = [0, -0.04, -0.2];
    info.irons = [0.1, -0.26]; info.railY = ump ? 0.036 : 0.03; info.magPos = [0, -0.06, -0.05]; info.magType = ump ? 'smg' : 'mp5'; info.stockStyle = ump ? 'fold' : 'hk'; info.stockPos = [0, 0.0, 0.13]; info.grip = [0, -0.1, 0.1];
  } else if (id === 'akm' || id === 'ak74' || id === 'svd') {
    const svd = id === 'svd', a74 = id === 'ak74'; const fur = a74 ? m.plum : m.akWood; const rc = m.blued;
    b.p(rb(0.032, 0.05, 0.25, 0.003), rc, 0, -0.02, 0.0);                        // stamped receiver
    b.p(rb(0.034, 0.012, 0.2, 0.004), rc, 0, 0.012, 0.02);                       // dust cover
    for (let i = 0; i < 6; i++) b.p(rb(0.035, 0.002, 0.004, 0.001), m.dark, 0, 0.018, 0.05 + i * 0.012);
    for (const sx of [-1, 1]) b.p(rb(0.002, 0.03, 0.2, 0.001), m.steel, sx * 0.0165, -0.02, 0.0);
    b.p(rb(0.004, 0.006, 0.12, 0.002), m.steel, 0.018, -0.008, 0.02);             // safety lever
    { const ch = b.g(0.02, 0.006, -0.03); const o = b.cur; b.cur = ch; b.p(rb(0.018, 0.008, 0.012, 0.003), m.steel, 0.008, 0, 0); b.p(cyl(0.006, 0.006, 0.01, 10).clone().rotateY(Math.PI / 2), m.steel, 0.018, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.09, axis: 'z' }; info.chargerPos = [0.04, 0.006, -0.03]; info.boltc = { obj: ch, travel: 0.06 }; }
    b.p(rb(0.03, 0.022, 0.03, 0.003), rc, 0, 0.012, -0.135);                    // rear sight block
    b.p(rb(0.02, 0.004, 0.05, 0.001), m.steel, 0, 0.026, -0.12);                // sight leaf
    triggerGroup(b, 0.025, -0.06, rc);
    pistolGrip(b, a74 ? m.plum : m.poly, 0, -0.045, 0.06, 0.3, 0.1, 0.028);
    const bl = svd ? 0.58 : 0.33;
    b.p(cyl(0.0095, 0.009, bl, 16), m.steel, 0, -0.004, -0.13 - bl / 2);
    b.p(cyl(0.011, 0.011, 0.2, 14), m.steel, 0, 0.018, -0.25);                   // gas tube
    b.p(rb(0.03, 0.02, 0.16, 0.006), fur, 0, 0.022, -0.24);                       // upper handguard
    b.p(G('aklhg' + id, () => { const g = new RoundedBoxGeometry(0.04, 0.04, svd ? 0.24 : 0.17, 2, 0.01); return g; }), fur, 0, -0.012, -0.22);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.p(rb(0.002, 0.01, 0.02, 0.001), m.dark, sx * 0.0205, -0.012, -0.17 - i * 0.04);
    const fz = -0.13 - bl; b.p(rb(0.012, 0.03, 0.02, 0.002), m.steel, 0, 0.01, fz + 0.03); b.p(rb(0.004, 0.012, 0.004, 0.001), m.steel, 0, 0.03, fz + 0.03);
    if (!svd && mods.muzzle === 'none_muz') { if (a74) { b.p(cyl(0.012, 0.012, 0.08, 14), m.blued, 0, -0.004, fz - 0.04); for (let i = 0; i < 2; i++) for (const sx of [-1, 1]) b.p(rb(0.004, 0.008, 0.008, 0.001), m.dark, sx * 0.011, -0.004, fz - 0.03 - i * 0.025); } else b.p(cyl(0.0105, 0.0105, 0.03, 12), m.blued, 0, -0.004, fz - 0.015); info.noMuzzleDevice = true; }
    if (svd) { b.p(cyl(0.011, 0.011, 0.07, 12), m.blued, 0, -0.004, fz - 0.035); b.p(rb(0.006, 0.03, 0.1, 0.002), m.steel, -0.02, 0.0, 0.04); info.noMuzzleDevice = mods.muzzle === 'none_muz'; }
    info.muzzleZ = fz - (info.noMuzzleDevice ? (a74 ? 0.08 : svd ? 0.07 : 0.03) : 0); info.muzzleY = -0.004; info.muzzleR = 0.009;
    info.ub = [0, -0.035, -0.23]; info.tac = [0.026, -0.012, -0.26, -Math.PI / 2]; info.fore = [0, -0.035, -0.22];
    info.irons = null; info.akSight = { y: 0.03, z: -0.12 }; info.railY = 0.02; info.opticZOff = 0.05;
    info.magPos = [0, -0.045, -0.06]; info.magType = svd ? 'box10' : 'ak'; info.stockStyle = svd ? 'svd' : a74 ? 'akfold' : 'akwood'; info.stockPos = [0, -0.02, 0.125]; info.grip = [0, -0.085, 0.085];
    info.fur = fur;
  } else if (id === 'm24') {
    const st = m.glassFiber;
    b.p(G('m24stock', () => { const g = new RoundedBoxGeometry(0.05, 0.06, 0.62, 2, 0.015); return g; }), st, 0, -0.03, -0.12);
    b.p(extrude('m24butt', [[0, 0.02], [0.28, 0.0], [0.3, -0.02], [0.3, -0.13], [0.26, -0.13], [0.1, -0.06], [0.0, -0.06]], 0.042), st, 0, -0.005, 0.17);
    b.p(rb(0.044, 0.15, 0.016, 0.005), m.rubber, 0, -0.07, 0.475);
    b.p(rb(0.032, 0.11, 0.045, 0.01), st, 0, -0.08, 0.13, 0.35);                  // grip swell
    b.p(cyl(0.016, 0.016, 0.2, 18), m.blued, 0, 0.012, 0.03);                     // receiver
    b.p(cyl(0.012, 0.0105, 0.6, 18), m.blued, 0, 0.012, -0.37);                   // heavy barrel
    triggerGroup(b, 0.08, -0.04, m.steel);
    { const bolt = b.g(0.0, 0.012, 0.1); const o = b.cur; b.cur = bolt; b.p(cyl(0.012, 0.012, 0.09, 14), m.bright, 0, 0, 0.0);
      const handle = b.g(0, 0, 0.03); b.cur = handle; b.p(rb(0.05, 0.007, 0.008, 0.003), m.bright, 0.028, 0, 0); b.p(new THREE.SphereGeometry(0.009, 10, 8), m.bright, 0.055, -0.004, 0.004);
      b.cur = o; info.bolt = { obj: bolt, handle, travel: 0.09 }; info.boltPos = [0.055, 0.008, 0.134]; }
    b.rail(0, 0.03, -0.06, 0.1, m.receiver);
    b.p(rb(0.04, 0.012, 0.06, 0.003), st, 0, -0.07, -0.3);                         // bipod stud
    info.muzzleZ = -0.67; info.muzzleY = 0.012; info.muzzleR = 0.0105; info.tac = [0.028, -0.03, -0.32, -Math.PI / 2]; info.fore = [0, -0.06, -0.24];
    info.irons = null; info.railY = 0.03; info.magPos = [0, -0.05, 0.02]; info.magType = 'internal'; info.stockStyle = null; info.grip = [0, -0.1, 0.14];
  } else if (id === 'm249') {
    const rc = m.blued;
    b.p(rb(0.05, 0.08, 0.3, 0.004), rc, 0, -0.01, 0.0);                           // receiver
    { const cv = b.g(0, 0.03, 0.12); const o = b.cur; b.cur = cv; b.p(rb(0.054, 0.016, 0.24, 0.004), rc, 0, 0.0, -0.12); b.rail(0, 0.012, -0.21, -0.03, m.receiver); b.cur = o; info.cover = { obj: cv }; info.coverPos = [0, 0.04, -0.06]; }
    b.p(rb(0.06, 0.02, 0.06, 0.004), rc, -0.03, 0.0, -0.04);                       // feed tray
    { const ch = b.g(0.03, 0.0, -0.06); const o = b.cur; b.cur = ch; b.p(rb(0.024, 0.012, 0.016, 0.003), m.steel, 0.01, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.1, axis: 'z' }; info.chargerPos = [0.05, 0.0, -0.06]; }
    triggerGroup(b, 0.08, -0.07, rc); pistolGrip(b, m.poly, 0, -0.05, 0.09, 0.32, 0.11, 0.03);
    b.p(G('m249hg', () => { const g = new RoundedBoxGeometry(0.06, 0.05, 0.16, 2, 0.01); return g; }), m.poly, 0, -0.03, -0.23);
    b.p(cyl(0.011, 0.011, 0.36, 16), m.steel, 0, 0.0, -0.33); b.p(cyl(0.0125, 0.0125, 0.14, 16), m.steel, 0, 0.0, -0.44);
    for (let i = 0; i < 4; i++) b.p(rb(0.03, 0.002, 0.01, 0.001), m.dark, 0, 0.014, -0.36 - i * 0.03);  // heat shield ribs
    b.p(rb(0.03, 0.008, 0.12, 0.003), m.steel, 0, 0.045, -0.2); for (const z of [-0.15, -0.25]) b.p(rb(0.008, 0.02, 0.008, 0.002), m.steel, 0, 0.032, z);  // carry handle
    for (const sx of [-1, 1]) b.p(cyl(0.005, 0.005, 0.26, 8), m.steel, sx * 0.012, -0.04, -0.38, 0, 0, 0);   // folded bipod legs
    b.p(cyl(0.012, 0.012, 0.03, 14), m.blued, 0, 0.0, -0.53);
    info.muzzleZ = -0.545; info.muzzleY = 0.0; info.muzzleR = 0.012; info.ub = [0, -0.055, -0.24]; info.tac = [0.031, -0.03, -0.25, -Math.PI / 2]; info.fore = [0, -0.06, -0.23];
    info.irons = [0.14, -0.42]; info.railY = 0.042; info.opticZOff = -0.1; info.magPos = [-0.005, -0.05, -0.04]; info.magType = 'pouch'; info.stockStyle = 'saw'; info.stockPos = [0, -0.01, 0.15]; info.grip = [0, -0.11, 0.115];
  } else if (id === 'scar') {
    const up = m.fde;
    b.p(rb(0.036, 0.046, 0.42, 0.004), up, 0, 0.012, -0.1);                          // monolithic upper
    b.rail(0, 0.038, -0.3, 0.1, up); b.rail(0.02, 0.0, -0.3, -0.18, up, -Math.PI / 2); b.rail(-0.02, 0.0, -0.3, -0.18, up, Math.PI / 2); b.rail(0, -0.014, -0.3, -0.18, up, Math.PI);
    b.p(rb(0.032, 0.045, 0.2, 0.004), m.fdePoly, 0, -0.035, 0.0);                     // polymer lower
    b.p(rb(0.03, 0.065, 0.08, 0.004), m.fdePoly, 0, -0.06, -0.045);
    { const ch = b.g(-0.022, 0.012, -0.12); const o = b.cur; b.cur = ch; b.p(rb(0.016, 0.01, 0.018, 0.003), m.steel, -0.006, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.12, axis: 'z' }; info.chargerPos = [-0.04, 0.012, -0.12]; info.boltc = { obj: ch, travel: 0.06 }; }
    triggerGroup(b, 0.022, -0.078, m.fdePoly); pistolGrip(b, m.poly, 0, -0.06, 0.06);
    b.p(cyl(0.009, 0.0085, 0.12, 16), m.steel, 0, 0.006, -0.37);
    info.muzzleZ = -0.43; info.muzzleY = 0.006; info.muzzleR = 0.0085; info.ub = [0, -0.02, -0.24]; info.tac = [0.026, 0.0, -0.26, -Math.PI / 2]; info.fore = [0, -0.03, -0.24];
    info.irons = [0.08, -0.29]; info.railY = 0.038; info.magPos = [0, -0.085, -0.045]; info.magType = 'stanag'; info.stockStyle = 'fold'; info.stockPos = [0, 0.004, 0.105]; info.grip = [0, -0.1, 0.075];
  } else if (id === 'aug') { // bullpup: grip forward of the magazine, mag behind
    const g = m.odPoly;
    b.p(G('augbody', () => new RoundedBoxGeometry(0.05, 0.09, 0.42, 3, 0.018)), g, 0, -0.03, 0.12);
    b.p(rb(0.054, 0.14, 0.03, 0.01), m.rubber, 0, -0.04, 0.33);                       // buttplate
    b.p(cyl(0.017, 0.017, 0.34, 18), m.receiver, 0, 0.016, -0.05);                     // receiver tube
    b.rail(0, 0.036, -0.12, 0.06, m.receiver);
    b.p(G('augguard', () => new RoundedBoxGeometry(0.05, 0.1, 0.13, 2, 0.02)), g, 0, -0.07, -0.08);  // full trigger guard
    pistolGrip(b, g, 0, -0.06, -0.05, 0.25, 0.1, 0.032);
    { const ch = b.g(-0.022, 0.02, -0.12); const o = b.cur; b.cur = ch; b.p(rb(0.02, 0.012, 0.016, 0.004), m.steel, -0.006, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.1, axis: 'z' }; info.chargerPos = [-0.04, 0.02, -0.12]; }
    b.p(cyl(0.0095, 0.009, 0.32, 16), m.steel, 0, 0.012, -0.36);
    { const fg = b.g(0, -0.01, -0.28); const o = b.cur; b.cur = fg; b.p(rb(0.024, 0.09, 0.03, 0.008), g, 0, -0.045, 0); b.cur = o; }
    info.muzzleZ = -0.52; info.muzzleY = 0.012; info.muzzleR = 0.009; info.tac = [0.024, 0.0, -0.22, -Math.PI / 2]; info.fore = [0, -0.1, -0.28];
    info.irons = null; info.akSight = { y: 0.05, z: 0.04 }; info.railY = 0.036; info.opticZOff = -0.02; info.magPos = [0, -0.07, 0.1]; info.magType = 'stanag'; info.stockStyle = null; info.grip = [0, -0.1, -0.04];
  } else if (id === 'p90') {
    const g = m.poly;
    b.p(G('p90body', () => new RoundedBoxGeometry(0.055, 0.1, 0.5, 3, 0.02)), g, 0, -0.035, 0.03);
    b.p(G('p90hole', () => new RoundedBoxGeometry(0.058, 0.05, 0.1, 2, 0.02)), m.dark, 0, -0.07, -0.08);  // thumbhole
    b.p(rb(0.05, 0.03, 0.34, 0.006), new THREE.MeshStandardMaterial({ color: 0x6a6040, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.75 }), 0, 0.03, 0.03);  // translucent top magazine
    for (let i = 0; i < 12; i++) b.p(cyl(0.0035, 0.0035, 0.04, 6).clone().rotateY(Math.PI / 2), m.brass, 0, 0.03, -0.12 + i * 0.026);
    b.rail(0, 0.05, -0.12, 0.05, m.receiver); b.p(rb(0.05, 0.11, 0.02, 0.01), m.rubber, 0, -0.035, 0.29);
    b.p(cyl(0.008, 0.008, 0.08, 12), m.steel, 0, -0.01, -0.25);
    { const ch = b.g(-0.03, -0.04, -0.15); const o = b.cur; b.cur = ch; b.p(rb(0.012, 0.014, 0.02, 0.004), m.steel, 0, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.05, axis: 'z' }; info.chargerPos = [-0.04, -0.04, -0.15]; }
    info.muzzleZ = -0.29; info.muzzleY = -0.01; info.muzzleR = 0.008; info.tac = [0.03, -0.03, -0.18, -Math.PI / 2]; info.fore = [0, -0.11, -0.16];
    info.irons = null; info.akSight = { y: 0.068, z: 0.0 }; info.railY = 0.05; info.opticZOff = -0.03; info.magPos = [0, 0.0, 0.0]; info.magType = 'none'; info.stockStyle = null; info.grip = [0, -0.1, -0.06];
  } else if (id === 'mp7') {
    b.p(rb(0.036, 0.06, 0.26, 0.008), m.poly, 0, 0.0, -0.02); b.rail(0, 0.032, -0.14, 0.09, m.receiver); b.rail(0.02, -0.005, -0.14, -0.06, m.poly, -Math.PI / 2);
    triggerGroup(b, 0.035, -0.045, m.poly); pistolGrip(b, m.poly, 0, -0.035, 0.05, 0.12, 0.12, 0.032);
    { const fg = b.g(0, -0.03, -0.12); const o = b.cur; b.cur = fg; b.p(rb(0.02, 0.07, 0.026, 0.006), m.poly, 0, -0.035, 0); b.cur = o; }
    { const ch = b.g(0, 0.028, 0.09); const o = b.cur; b.cur = ch; b.p(rb(0.04, 0.008, 0.016, 0.003), m.poly, 0, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.05, axis: 'z' }; info.chargerPos = [0, 0.035, 0.1]; }
    for (const sx of [-1, 1]) b.p(rb(0.006, 0.006, 0.16, 0.002), m.poly, sx * 0.016, 0.0, 0.17); b.p(rb(0.04, 0.08, 0.012, 0.004), m.rubber, 0, -0.02, 0.25);
    b.p(cyl(0.0075, 0.0075, 0.05, 12), m.steel, 0, 0.005, -0.17);
    info.muzzleZ = -0.195; info.muzzleY = 0.005; info.muzzleR = 0.0075; info.tac = [0.024, -0.005, -0.1, -Math.PI / 2]; info.fore = [0, -0.09, -0.12];
    info.irons = [0.07, -0.13]; info.railY = 0.032; info.magPos = [0, -0.035, 0.05]; info.magType = 'mp7'; info.stockStyle = null; info.grip = [0, -0.08, 0.06];
  } else if (id === 'vector') {
    const g = m.poly;
    b.p(G('vecup', () => new RoundedBoxGeometry(0.04, 0.05, 0.3, 2, 0.008)), g, 0, 0.01, -0.05); b.rail(0, 0.038, -0.16, 0.08, m.receiver);
    b.p(extrude('veclow', [[0.08, 0], [-0.12, 0], [-0.16, -0.07], [-0.06, -0.12], [0.04, -0.1]], 0.038), g, 0, -0.015, 0.0);  // angled lower with the Super V block
    triggerGroup(b, 0.05, -0.06, g); pistolGrip(b, g, 0, -0.05, 0.075, 0.15);
    { const ch = b.g(-0.022, 0.015, -0.07); const o = b.cur; b.cur = ch; b.p(rb(0.014, 0.01, 0.02, 0.004), m.steel, 0, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.08, axis: 'z' }; info.chargerPos = [-0.04, 0.015, -0.07]; }
    b.p(cyl(0.009, 0.009, 0.09, 12), m.steel, 0, 0.012, -0.24);
    info.muzzleZ = -0.285; info.muzzleY = 0.012; info.muzzleR = 0.009; info.tac = [0.022, -0.01, -0.15, -Math.PI / 2]; info.fore = [0, -0.06, -0.17];
    info.irons = [0.06, -0.15]; info.railY = 0.038; info.magPos = [0, -0.1, -0.08]; info.magType = 'smg'; info.stockStyle = 'fold'; info.stockPos = [0, 0.0, 0.11]; info.grip = [0, -0.1, 0.09];
  } else if (id === 'm4s') {
    b.p(rb(0.034, 0.058, 0.2, 0.004), m.receiver, 0, -0.015, 0.0); b.rail(0, 0.016, -0.08, 0.09, m.receiver);
    b.p(rb(0.002, 0.024, 0.06, 0.001), m.dark, 0.0175, -0.01, -0.01); triggerGroup(b, 0.035, -0.058, m.receiver); pistolGrip(b, m.poly, 0, -0.045, 0.075);
    b.p(cyl(0.0115, 0.0115, 0.47, 18), m.steel, 0, 0.0, -0.33); b.p(cyl(0.0125, 0.0125, 0.34, 18), m.steel, 0, -0.028, -0.27);
    b.p(G('m4sfore', () => new RoundedBoxGeometry(0.05, 0.05, 0.22, 2, 0.012)), m.poly, 0, -0.022, -0.2);
    for (const sx of [-1, 1]) b.p(rb(0.004, 0.018, 0.01, 0.001), m.steel, sx * 0.008, 0.024, 0.07); b.p(rb(0.004, 0.012, 0.004, 0.001), m.steel, 0, 0.018, -0.55);
    { const ch = b.g(0.02, -0.01, -0.02); const o = b.cur; b.cur = ch; b.p(rb(0.02, 0.01, 0.014, 0.004), m.bright, 0.006, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.07, axis: 'z' }; info.chargerPos = [0.04, -0.01, -0.02]; info.boltc = { obj: ch, travel: 0.05 }; }
    info.muzzleZ = -0.57; info.muzzleY = 0.0; info.muzzleR = 0.0115; info.tac = [0.026, -0.022, -0.25, -Math.PI / 2]; info.fore = [0, -0.05, -0.2];
    info.irons = null; info.akSight = { y: 0.026, z: 0.07 }; info.railY = 0.016; info.magType = 'tube'; info.stockStyle = 'buffer'; info.stockPos = [0, 0.0, 0.1]; info.grip = [0, -0.085, 0.1];
  } else if (id === 'mosin') {
    b.p(extrude('mosinstock', [[0.62, 0.0], [-0.42, 0.0], [-0.42, -0.035], [0.05, -0.04], [0.14, -0.06], [0.62, -0.13], [0.66, -0.13], [0.66, 0.01]], 0.04), m.akWood, 0, -0.005, -0.04);
    b.p(cyl(0.014, 0.014, 0.18, 16), m.blued, 0, 0.012, 0.03); b.p(cyl(0.011, 0.0095, 0.8, 16), m.blued, 0, 0.012, -0.45);
    b.p(rb(0.036, 0.02, 0.3, 0.004), m.akWood, 0, 0.008, -0.3);                    // upper handguard
    for (const z of [-0.18, -0.42]) b.p(G('band' + z, () => new THREE.TorusGeometry(0.022, 0.004, 6, 16)), m.blued, 0, 0.0, z);
    b.p(G('mosinhood', () => new THREE.TorusGeometry(0.008, 0.002, 6, 12)), m.blued, 0, 0.026, -0.83); b.p(rb(0.002, 0.012, 0.003, 0.001), m.steel, 0, 0.022, -0.83);
    b.p(rb(0.024, 0.01, 0.06, 0.002), m.blued, 0, 0.03, -0.12);                      // rear tangent sight
    triggerGroup(b, 0.09, -0.035, m.blued); b.p(rb(0.02, 0.03, 0.06, 0.004), m.blued, 0, -0.03, 0.0);
    { const bolt = b.g(0.0, 0.012, 0.11); const o = b.cur; b.cur = bolt; b.p(cyl(0.011, 0.011, 0.08, 14), m.bright, 0, 0, 0);
      const handle = b.g(0, 0, 0.03); b.cur = handle; b.p(rb(0.06, 0.006, 0.007, 0.003), m.bright, 0.032, 0, 0); b.p(new THREE.SphereGeometry(0.009, 10, 8), m.bright, 0.064, 0, 0);
      b.cur = o; info.bolt = { obj: bolt, handle, travel: 0.085 }; info.boltPos = [0.064, 0.012, 0.14]; }
    info.muzzleZ = -0.85; info.muzzleY = 0.012; info.muzzleR = 0.0095; info.fore = [0, -0.03, -0.3]; info.tac = null;
    info.irons = null; info.akSight = { y: 0.035, z: -0.12 }; info.railY = 0.03; info.opticZOff = 0.0; info.magType = 'internal'; info.magPos = [0, -0.04, 0.0]; info.stockStyle = null; info.grip = [0, -0.06, 0.13];
  } else if (id === 'm82') {
    b.p(rb(0.06, 0.09, 0.62, 0.006), m.receiver, 0, -0.02, 0.05);                    // upper + lower receiver
    b.rail(0, 0.03, -0.2, 0.2, m.receiver); b.p(rb(0.06, 0.03, 0.08, 0.006), m.receiver, 0, 0.06, -0.05); for (const z of [-0.1, 0.0]) b.p(rb(0.01, 0.04, 0.01, 0.003), m.receiver, 0, 0.04, z); // carry handle
    triggerGroup(b, 0.13, -0.075, m.receiver); pistolGrip(b, m.poly, 0, -0.065, 0.16, 0.3, 0.12, 0.034);
    b.p(rb(0.05, 0.08, 0.12, 0.008), m.receiver, 0, -0.03, 0.42); b.p(rb(0.052, 0.13, 0.03, 0.008), m.rubber, 0, -0.04, 0.5); b.p(rb(0.03, 0.08, 0.03, 0.006), m.receiver, 0, -0.1, 0.38); // stock & monopod
    b.p(cyl(0.016, 0.014, 0.74, 18), m.steel, 0, 0.0, -0.6); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.p(rb(0.003, 0.003, 0.5, 0.001), m.dark, Math.cos(a) * 0.015, Math.sin(a) * 0.015, -0.55); } // fluted barrel
    b.p(rb(0.075, 0.05, 0.1, 0.008), m.receiver, 0, 0.0, -1.0); for (const sx of [-1, 1]) for (const z of [-0.97, -1.02]) b.p(rb(0.004, 0.04, 0.025, 0.002), m.dark, sx * 0.038, 0.0, z); // double-chamber brake
    for (const sx of [-1, 1]) b.p(cyl(0.007, 0.006, 0.36, 8), m.steel, sx * 0.03, -0.06, -0.38, 0, 0, sx * 0.1); // folded bipod
    { const ch = b.g(0.032, 0.0, -0.08); const o = b.cur; b.cur = ch; b.p(rb(0.02, 0.016, 0.03, 0.005), m.steel, 0.008, 0, 0); b.cur = o; info.charger = { obj: ch, travel: 0.12, axis: 'z' }; info.chargerPos = [0.05, 0.0, -0.08]; info.boltc = { obj: ch, travel: 0.08 }; }
    info.muzzleZ = -1.05; info.muzzleY = 0.0; info.muzzleR = 0.016; info.noMuzzleDevice = true; info.tac = [0.034, -0.02, -0.2, -Math.PI / 2]; info.fore = [0, -0.07, -0.12];
    info.irons = null; info.akSight = { y: 0.05, z: 0.0 }; info.railY = 0.03; info.opticZOff = -0.04; info.magPos = [0, -0.07, 0.02]; info.magType = 'box50'; info.stockStyle = null; info.grip = [0, -0.11, 0.17];
  }
  return info;
}

/** Build a complete weapon model. Returns {group, muzzle, sight:{y,z,eye}, reticle, mag, pump, laser, light, grip, fore, meta} */
export function buildGun(id, modsIn = {}) {
  const mods = { ...DEFAULT_MODS, ...modsIn };
  const m = mats(); const root = new THREE.Group(); const b = new Builder(root);
  const info = body(b, id, mods);
  const W = WEAPONS[id];
  // magazine (animated on reload)
  let mag = null;
  if (info.magType !== 'tube' && info.magType !== 'internal' && info.magType !== 'none') {
    mag = b.g(...info.magPos); const o = b.cur; b.cur = mag;
    const mm = id === 'br' || id === 'dmr' || id === 'svd' ? m.steel : m.poly;
    if (mods.magazine === 'drum' && W.slots.includes('magazine')) drumMag(b, m.poly);
    else if (info.magType === 'stanag') { const n = mods.magazine === 'ext_mag' ? 6 : 4; stanag(b, mods.magazine === 'fast_mag' ? m.fdePoly : m.poly, n); if (mods.magazine === 'fast_mag') { const s = b.g(0.03, 0, 0); b.cur = s; stanag(b, m.fdePoly, n); b.cur = mag; b.p(rb(0.06, 0.02, 0.07, 0.003), m.rubber, 0.015, -0.07, -0.004); } }
    else if (info.magType === 'box20') boxMag(b, mm, mods.magazine === 'ext_mag' ? 0.18 : 0.12, 0.026, 0.07, 0.1);
    else if (info.magType === 'box10') boxMag(b, mm, mods.magazine === 'ext_mag' ? 0.1 : 0.07, 0.026, 0.07, 0.06);
    else if (info.magType === 'smg') { boxMag(b, mm, mods.magazine === 'ext_mag' ? 0.2 : 0.14, 0.022, 0.035, 0.05); if (mods.magazine === 'fast_mag') { const s = b.g(0.026, 0, 0); b.cur = s; boxMag(b, m.poly, 0.14, 0.022, 0.035, 0.05); b.cur = mag; } }
    else if (info.magType === 'mp5') stanag(b, m.blued, mods.magazine === 'ext_mag' ? 6 : 4, 0.032, 0.02, 0.045);
    else if (info.magType === 'ak') stanag(b, id === 'ak74' ? m.plum : m.blued, mods.magazine === 'ext_mag' ? 6 : 4, 0.04, 0.026, 0.13);
    else if (info.magType === 'pouch') { b.p(rb(0.07, 0.09, 0.1, 0.02), m.odPoly, -0.01, -0.05, 0.0); b.p(rb(0.072, 0.012, 0.06, 0.004), m.rubber, -0.01, -0.005, 0.0); for (let i = 0; i < 5; i++) b.p(cyl(0.003, 0.003, 0.02, 6).clone().rotateY(Math.PI / 2), m.brass, -0.04 + i * 0.006, 0.006, -0.02); }
    else if (info.magType === 'mp7') { const g = b.g(0, 0, 0); g.rotation.x = -0.12; b.cur = g; const h = 0.19; b.p(rb(0.024, 0.016, 0.036, 0.004), m.poly, 0, -h + 0.04, 0); }
    else if (info.magType === 'box50') boxMag(b, m.steel, 0.11, 0.034, 0.12, 0.05);
    else if (info.magType === 'none') { /* P90 top magazine is part of the body */ }
    else if (info.magType === 'pistol') { const g = b.g(0, 0, 0); g.rotation.x = -0.28; b.cur = g; const h = mods.magazine === 'ext_mag' ? 0.11 : 0.085; b.p(rb(0.022, 0.01, 0.034, 0.003), m.poly, 0, -h + 0.035, 0); if (mods.magazine === 'ext_mag') b.p(rb(0.026, 0.035, 0.038, 0.004), m.poly, 0, -h + 0.015, 0); }
    b.cur = o;
  }
  // pump (shotgun)
  let pump = null;
  if (info.pump) { pump = b.g(...info.pump); const o = b.cur; b.cur = pump; b.p(cyl(0.022, 0.022, 0.14, 16), m.poly, 0, 0, 0); for (let i = 0; i < 9; i++) b.p(G('pumpRib', () => new THREE.TorusGeometry(0.0225, 0.0025, 5, 18)), m.poly, 0, 0, -0.06 + i * 0.015); b.cur = o; }
  // stock
  if (['hk', 'akwood', 'akfold', 'svd', 'saw'].includes(info.stockStyle)) specialStock(b, info.stockStyle, info, W.slots.includes('stock') ? mods.stock : 'std_stock', ...info.stockPos);
  else if (info.stockStyle) buildStock(b, W.slots.includes('stock') ? mods.stock : 'std_stock', info.stockStyle, ...info.stockPos);
  // optic / irons
  let sight;
  const optic = W.slots.includes('optic') ? mods.optic : 'iron';
  if (id === 'mosin' && optic !== 'iron') info.railY = 0.045;
  if (optic !== 'iron') { const oz = (id === 'p9' || id === 'deagle' ? 0.035 : id === 'dmr' || id === 'br' ? 0.0 : 0.02) + (info.opticZOff || 0); if (info.akSight) { b.p(rb(0.006, 0.03, 0.1, 0.002), m.steel, -0.019, 0.0, 0.03 + (info.opticZOff || 0)); b.p(rb(0.03, 0.006, 0.1, 0.002), m.steel, -0.005, info.railY - 0.003, oz); } const o = buildOptic(b, optic, info.railY, oz); sight = { y: o.sightY, z: o.z, eye: o.eye, reticle: o.reticle }; if (info.irons) buildIrons(b, info.railY, ...info.irons, true); }
  else if (info.irons) { const s = buildIrons(b, info.railY, ...info.irons, false); sight = { y: s.sightY, z: info.irons[0], eye: 0.11 }; }
  else if (id === 'sg') sight = { y: 0.017, z: 0.05, eye: 0.12 };
  else if (info.akSight) sight = { y: info.akSight.y, z: info.akSight.z, eye: 0.3 };
  else if (info.pistolSight) sight = { y: info.pistolSight.y + 0.002, z: info.pistolSight.z, eye: 0.2 };
  else if (id === 'm24') { b.p(rb(0.004, 0.012, 0.006, 0.001), m.steel, 0, 0.026, -0.65); b.p(rb(0.016, 0.012, 0.006, 0.001), m.steel, 0, 0.034, 0.0); sight = { y: 0.034, z: 0.0, eye: 0.12 }; }
  else sight = { y: 0.0305, z: 0.07, eye: 0.2 };
  // muzzle
  const pistolish = WEAPONS[id].cls === 'Pistol' || info.noMuzzleDevice || ['m24', 'm249', 'mosin', 'p90', 'mp7', 'aug', 'vector', 'm4s'].includes(id);
  const mz = buildMuzzle(b, W.slots.includes('muzzle') ? (pistolish && mods.muzzle === 'none_muz' ? null : mods.muzzle) : null, info.muzzleR, info.muzzleZ);
  const muzzle = mz.tip; muzzle.position.y += 0; mz.tip.parent.position.y = info.muzzleY ?? 0;
  // underbarrel & tactical
  if (info.ub && W.slots.includes('underbarrel') && mods.underbarrel !== 'none_ub') buildUnderbarrel(b, mods.underbarrel, info.ub[1], info.ub[2]);
  let laser = null, light = null;
  if (info.tac && mods.tactical !== 'none_tac') {
    const e = buildTactical(b, mods.tactical, info.tac[0], info.tac[1], info.tac[2], info.tac[3]);
    if (mods.tactical === 'laser') laser = e; else light = e;
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const grip = new THREE.Vector3(...info.grip);
  const fore = info.fore ? new THREE.Vector3(...info.fore) : null;
  if (mods.underbarrel !== 'none_ub' && info.ub) fore?.set(info.ub[0], info.ub[1] - 0.05, info.ub[2]);
  // animated parts and hand anchors for the animation system (all in gun-local space)
  const parts = { charger: info.charger, boltc: info.boltc, slide: info.slide, bolt: info.bolt, cover: info.cover };
  for (const k of Object.keys(parts)) { const p = parts[k]; if (p) p.rest = p.obj.position.clone(); }
  const V = (a) => a ? new THREE.Vector3(...a) : null;
  const anchors = { grip, fore: fore || grip.clone().add(new THREE.Vector3(-0.025, -0.01, -0.01)), magwell: V(info.magPos)?.add(new THREE.Vector3(0, -0.06, 0)) || grip.clone(), charger: V(info.chargerPos), bolt: V(info.boltPos), cover: V(info.coverPos),
    port: new THREE.Vector3(0.01, -0.04, -0.02), slideTop: new THREE.Vector3(0, 0.03, 0.04), pump: info.pump ? new THREE.Vector3(info.pump[0], info.pump[1] - 0.02, info.pump[2]) : null, pouch: new THREE.Vector3(-0.12, -0.34, 0.24) };
  return { group: root, muzzle, sight, reticle: sight.reticle, mag, magRest: mag?.position.clone(), pump, pumpRest: pump?.position.clone(), laser, light, grip, fore, id, mods, parts, anchors };
}

// Shell casing geometry / material for ejected brass
export function casingMesh(caliber) {
  const m = mats();
  const big = caliber === 'a762' || caliber === 'a556';
  if (caliber === 'a12') { const g = new THREE.Group(); g.add(new THREE.Mesh(cyl(0.0095, 0.0095, 0.05, 10), m.shellRed)); const h = new THREE.Mesh(cyl(0.0098, 0.0098, 0.012, 10), m.brass); h.position.z = 0.02; g.add(h); return g; }
  return new THREE.Mesh(cyl(big ? 0.0048 : 0.0045, big ? 0.0055 : 0.0048, big ? 0.045 : 0.019, 8), m.brass);
}
