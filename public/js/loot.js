// Loot containers, salvage nodes, item rolls and the slot-based backpack.
import * as THREE from 'three';
import { boxGeo, cylGeo } from './geom.js';
import { worldMats } from './props.js';
import { ITEMS, MODS, WEAPONS, LOOT_TABLES, RARITY } from './items.js';

export const CONTAINER_INFO = {
  crate: { name: 'Military Crate', search: 1.2 }, locker: { name: 'Locker', search: 1.0 }, toolbox: { name: 'Toolbox', search: 0.8 }, medbox: { name: 'Med Cabinet', search: 0.8 },
  safe: { name: 'Safe', search: 3.0 }, weapons: { name: 'Weapon Case', search: 1.6 }, car: { name: 'Car Trunk', search: 1.4 }, bag: { name: 'Dropped Gear', search: 0.6 },
  n_scrap: { name: 'Scrap Heap', search: 2.6, node: true }, n_elec: { name: 'Junction Box', search: 2.8, node: true }, n_chem: { name: 'Chemical Drums', search: 2.4, node: true },
  n_wood: { name: 'Timber Pile', search: 2.2, node: true }, n_fabric: { name: 'Tarp Bundle', search: 2.0, node: true },
};

// ---------- rolls
const pick = (list, r) => { const tot = list.reduce((a, e) => a + e[3], 0); let x = r() * tot; for (const e of list) { x -= e[3]; if (x <= 0) return e; } return list[list.length - 1]; };
const RW = { common: 10, uncommon: 6, rare: 3, epic: 1.2, legendary: 0.4 };
export function randomMod(r) { const ids = Object.keys(MODS).filter((k) => !MODS[k].builtin); const tot = ids.reduce((a, k) => a + RW[MODS[k].rarity || 'common'], 0); let x = r() * tot; for (const k of ids) { x -= RW[MODS[k].rarity || 'common']; if (x <= 0) return k; } return ids[0]; }
export function randomWeapon(r) { const ids = Object.keys(WEAPONS); const w = ids.map((k) => RW[WEAPONS[k].rarity]); const tot = w.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < ids.length; i++) { x -= w[i]; if (x <= 0) return ids[i]; } return ids[0]; }
export function rollLoot(table, r, bonus = 0) {
  const list = LOOT_TABLES[table]; if (!list) return [];
  const node = table.startsWith('n_') || table.startsWith('m_');
  const n = node ? 1 + (r() < 0.35 + bonus ? 1 : 0) : 2 + Math.floor(r() * (2.4 + bonus));
  const out = [];
  for (let i = 0; i < n; i++) {
    const [id, a, b] = pick(list, r);
    if (id === 'mod') out.push({ mod: randomMod(r) });
    else if (id === 'weapon') { const wid = randomWeapon(r); const mods = {}; for (const s of WEAPONS[wid].slots) if (r() < 0.25) { const cand = Object.keys(MODS).filter((k) => MODS[k].slot === s && !MODS[k].builtin && (!MODS[k].only || MODS[k].only.includes(wid))); if (cand.length) mods[s] = cand[Math.floor(r() * cand.length)]; } out.push({ weapon: { id: wid, mods } }); }
    else { const k = a + Math.floor(r() * (b - a + 1)); const ex = out.find((o) => o.id === id); if (ex) ex.n += k; else out.push({ id, n: k }); }
  }
  return out;
}
export function entryName(e) { return e.weapon ? WEAPONS[e.weapon.id].name : e.mod ? MODS[e.mod].name : ITEMS[e.id].name; }
export function entryRarity(e) { const r = e.weapon ? WEAPONS[e.weapon.id].rarity : e.mod ? MODS[e.mod].rarity : ITEMS[e.id].rarity; return RARITY[r || 'common']; }
export function entryIcon(e) { return e.weapon ? '⌐' : e.mod ? '⊕' : ITEMS[e.id].icon; }

// ---------- backpack (slot based, stacking)
export class Pack {
  constructor(slots = 12, items = []) { this.slots = slots; this.items = items; }
  used() { return this.items.length; }
  count(id) { return this.items.reduce((a, e) => a + (e.id === id ? e.n : 0), 0); }
  // returns how many could NOT be added
  add(e) {
    if (e.weapon || e.mod) { if (this.items.length >= this.slots) return 1; this.items.push(structuredClone(e)); return 0; }
    let n = e.n; const max = ITEMS[e.id].stack || 1;
    for (const s of this.items) if (s.id === e.id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; if (!n) return 0; }
    while (n > 0 && this.items.length < this.slots) { const k = Math.min(n, max); this.items.push({ id: e.id, n: k }); n -= k; }
    return n;
  }
  take(id, n) { let need = n; for (let i = this.items.length - 1; i >= 0 && need > 0; i--) { const s = this.items[i]; if (s.id !== id) continue; const k = Math.min(need, s.n); s.n -= k; need -= k; if (!s.n) this.items.splice(i, 1); } return n - need; }
}

// ---------- 3D container models
let geoCache = null;
function cmodel(type) {
  const M = worldMats(); const g = new THREE.Group(); const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (type === 'crate') {
    add(boxGeo(1.1, 0.5, 0.62, 0.8), M.green, 0, 0.25, 0); const lid = add(boxGeo(1.12, 0.08, 0.64, 0.8), M.green, 0, 0.54, 0); g.userData.lid = lid;
    for (const sx of [-1, 1]) { add(boxGeo(0.06, 0.52, 0.64), M.steel, sx * 0.5, 0.26, 0); add(boxGeo(0.12, 0.04, 0.05), M.steel, sx * 0.58, 0.35, 0); }
    add(boxGeo(0.4, 0.12, 0.005), M.white, 0, 0.3, -0.312);
  } else if (type === 'locker') {
    add(boxGeo(0.62, 1.85, 0.5), M.blue, 0, 0.925, 0); for (let i = 0; i < 4; i++) add(boxGeo(0.22, 0.015, 0.01), M.steel, 0.12, 1.5 + i * 0.05, -0.255);
    add(boxGeo(0.01, 1.7, 0.005), M.steel, 0, 0.92, -0.252); add(boxGeo(0.03, 0.12, 0.03), M.steel, -0.05, 1.0, -0.26);
  } else if (type === 'toolbox') {
    add(boxGeo(0.6, 0.26, 0.3), M.red, 0, 0.13, 0); add(boxGeo(0.62, 0.06, 0.32), M.red, 0, 0.29, 0); add(boxGeo(0.3, 0.03, 0.03), M.steel, 0, 0.36, 0); for (const sx of [-1, 1]) add(boxGeo(0.02, 0.06, 0.02), M.steel, sx * 0.15, 0.33, 0);
    add(boxGeo(0.64, 0.6, 0.4), M.steel, 0, -0.3 + 0.3, 0).visible = false;
  } else if (type === 'medbox') {
    add(boxGeo(0.55, 0.4, 0.28), M.white, 0, 0.2, 0); add(boxGeo(0.2, 0.06, 0.005), M.red, 0, 0.22, -0.142); add(boxGeo(0.06, 0.2, 0.005), M.red, 0, 0.22, -0.142);
  } else if (type === 'safe') {
    add(boxGeo(0.75, 0.9, 0.7), M.steel, 0, 0.45, 0); add(cylGeo(0.07, 0.07, 0.04, 16).rotateX(Math.PI / 2), M.white, 0.1, 0.55, -0.37); add(boxGeo(0.2, 0.03, 0.04), M.white, -0.15, 0.45, -0.37);
    add(boxGeo(0.68, 0.82, 0.01), M.machineDark, 0, 0.45, -0.352);
  } else if (type === 'weapons') {
    add(boxGeo(1.25, 0.18, 0.45), M.machineDark, 0, 0.09, 0); add(boxGeo(1.27, 0.03, 0.47), M.rubber, 0, 0.18, 0);
    for (const sx of [-0.4, 0, 0.4]) add(boxGeo(0.07, 0.07, 0.03), M.yellow, sx, 0.11, -0.235);
  } else if (type === 'car') {
    add(boxGeo(0.3, 0.3, 0.3), M.steel, 0, 0.6, 0).visible = false;
  } else if (type === 'bag') {
    add(new THREE.DodecahedronGeometry(0.28, 0).scale(1.3, 0.6, 1), M.sandbag, 0, 0.15, 0); add(boxGeo(0.4, 0.05, 0.05), M.rubber, 0, 0.32, 0);
  } else if (type === 'n_scrap') {
    for (let i = 0; i < 16; i++) add(boxGeo(0.3 + Math.random() * 0.9, 0.05 + Math.random() * 0.1, 0.2 + Math.random() * 0.6), [M.rust, M.corr, M.steel, M.plate][i % 4], (Math.random() - 0.5) * 1.4, 0.05 + Math.random() * 0.6, (Math.random() - 0.5) * 1.4, Math.random(), Math.random() * 3, Math.random());
    for (let i = 0; i < 4; i++) add(cylGeo(0.05, 0.05, 1.2, 6), M.rust, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), Math.random() * 1.5, Math.random() * 3, 1.2);
  } else if (type === 'n_elec') {
    add(boxGeo(0.9, 1.5, 0.45), M.paintGrey || M.white, 0, 0.75, 0); add(boxGeo(0.86, 1.4, 0.03), M.green, 0.0, 0.77, -0.24, 0, -0.5, 0);
    for (let i = 0; i < 3; i++) add(boxGeo(0.7, 0.1, 0.1), M.machineDark, 0, 0.4 + i * 0.35, -0.12); add(new THREE.SphereGeometry(0.03, 6, 4), M.emCyan, 0.3, 1.3, -0.2);
    add(boxGeo(0.25, 0.18, 0.005), M.yellow, 0, 1.25, -0.23);
  } else if (type === 'n_chem') {
    for (let i = 0; i < 3; i++) { const a = i * 2.1; add(cylGeo(0.3, 0.3, 0.88, 14, 1.2), M.yellow, Math.cos(a) * 0.4, 0.44, Math.sin(a) * 0.4); add(boxGeo(0.2, 0.2, 0.005), M.white, Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4 - 0.302); }
  } else if (type === 'n_wood') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) add(cylGeo(0.13, 0.13, 2.2, 8, 1).rotateZ(Math.PI / 2), M.bark, 0, 0.13 + r * 0.24, -0.4 + i * 0.27 + r * 0.13);
    add(boxGeo(2.0, 0.06, 0.25), M.wood, 0, 0.78, 0.0, 0, 0.2, 0);
  } else if (type === 'n_fabric') {
    for (let i = 0; i < 3; i++) add(new THREE.CapsuleGeometry(0.22, 0.6, 2, 6).rotateZ(Math.PI / 2), i % 2 ? M.sandbag : M.blue, (Math.random() - 0.5) * 0.3, 0.22 + i * 0.3, (Math.random() - 0.5) * 0.4, 0, Math.random(), 0);
  }
  return g;
}

let glintMat = null;
function glint() {
  if (!glintMat) { const C = document.createElement('canvas'); C.width = C.height = 64; const x = C.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.25, 'rgba(255,180,80,0.5)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    glintMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(C), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }); }
  const s = new THREE.Sprite(glintMat); s.scale.setScalar(0.35); return s;
}

export class LootContainer {
  constructor(type, pos, yaw, rand, contents = null) {
    this.type = type; this.info = CONTAINER_INFO[type]; this.pos = pos.clone(); this.rand = rand;
    this.mesh = cmodel(type); this.mesh.position.copy(pos); this.mesh.rotation.y = yaw;
    this.contents = contents; this.opened = false; this.depleted = false;
    this.glint = glint(); this.glint.position.set(0, type === 'locker' ? 1.95 : type.startsWith('n_') ? 1.2 : 0.75, 0); this.mesh.add(this.glint);
  }
  open(bonus) { if (!this.contents) this.contents = rollLoot(this.type === 'bag' ? 'crate' : this.type, this.rand, bonus); this.opened = true; if (this.mesh.userData.lid) { this.mesh.userData.lid.rotation.z = 1.2; this.mesh.userData.lid.position.set(0.3, 0.7, 0); } return this.contents; }
  update(t, camPos) { if (this.glint) { const d = camPos.distanceTo(this.pos); this.glint.visible = !this.depleted && !(this.opened && !this.contents?.length) && d < 30; this.glint.material.opacity = 0.6 + Math.sin(t * 3 + this.pos.x) * 0.3; } }
  deplete() { this.depleted = true; this.mesh.traverse((o) => { if (o.isMesh && o.material && !o.material.userData.dimmed) { const m = o.material.clone(); m.userData.dimmed = true; m.color = m.color.clone().multiplyScalar(0.45); o.material = m; } }); }
}
