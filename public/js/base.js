// Haven: the player's home base in a sheltered valley. Pre-built hangar with the drop pod, stash terminal,
// and a 4m-grid construction plot with snapping foundations, walls, floors, stairs, stations and props.
import * as THREE from 'three';
import { makeNoise, seeded } from './noise.js';
import { Batcher, CollisionWorld, boxGeo, cylGeo, scaleUV } from './geom.js';
import { Terrain } from './terrain.js';
import { smooth, QNAME } from './textures.js';
import { QUALITY } from './engine.js';
import * as P from './props.js';
import { PIECES } from './items.js';

export const CELL = 4, STOREY = 3, FOUND_H = 0.5;
export const PLOT = { x0: -32, z0: -20, nx: 16, nz: 14 }; // cells
export const BASE_Y = 0;

export function buildBase(scene) {
  const rand = seeded(99), noise = makeNoise(42);
  const root = new THREE.Group(); scene.add(root);
  const height = (x, z) => {
    const r = Math.hypot(x * 0.8, (z - 5) * 0.9);
    let h = smooth(48, 95, r) * (22 + noise.ridge(x / 40, z / 40, 4) * 30) + noise.fbm(x / 25, z / 25, 3) * 1.2 * smooth(40, 60, r);
    // access road heading south out of the valley
    const road = smooth(10, 4, Math.abs(x - Math.sin(z / 40) * 6)) * smooth(30, 60, z); h *= 1 - road * 0.85;
    if (x > PLOT.x0 - 6 && x < PLOT.x0 + PLOT.nx * CELL + 6 && z > PLOT.z0 - 40 && z < PLOT.z0 + PLOT.nz * CELL + 6) h = Math.min(h, 0);
    { const m = smooth(-70, -62, x) * smooth(24, 18, z) * smooth(-30, -22, z); h = h * (1 - m) + Math.min(h, 0) * m; } // home lot
    return h + noise.fbm(x / 9, z / 9, 2) * 0.12;
  };
  const splat = (x, z, y, slope) => {
    const inPlot = x > PLOT.x0 - 2 && x < PLOT.x0 + PLOT.nx * CELL + 2 && z > PLOT.z0 - 2 && z < PLOT.z0 + PLOT.nz * CELL + 2;
    const apron = (x > -26 && x < 26 && z > -62 && z < PLOT.z0) || (x > -62 && x < -40 && z > -20 && z < -6);
    const yard = x > -64 && x < -36 && z > -6 && z < 18;
    const rock = smooth(0.2, 0.4, slope);
    return [Math.max(0, 1 - rock * 1.4) * (inPlot || apron ? 0 : 1) * (yard ? 1.4 : 1), inPlot ? 1 : 0.25, rock, apron ? 2 : 0];
  };
  const terrain = new Terrain({ size: 320, res: 160, heightFn: height, splatFn: splat });
  root.add(terrain.mesh);
  const W = { root, terrain, batch: new Batcher(), col: new CollisionWorld(terrain), loot: [], spawns: [], extracts: [], interact: [] };
  const M = P.worldMats();
  // boundary
  for (const [x, z, w, d] of [[0, -110, 300, 4], [0, 110, 300, 4], [-110, 0, 4, 300], [110, 0, 4, 300]]) W.col.box(x, z, w, d, -50, 200, 0, 'concrete', { noRay: true });
  // ---- hangar (drop pod bay)
  const hx = 0, hz = -46; const S = new P.Site(W, hx, 0, hz, Math.PI);
  const L = 28, D = 22, Hh = 11;
  S.box(L + 2, 0.3, D + 2, M.concrete, 0, -0.15, 0, 0, { ts: 4 });
  P.wallWithHoles(S, L, Hh, 0.4, M.concreteDark, 0, 0.15, -D / 2, 0, [{ x0: L / 2 - 6, x1: L / 2 + 6, y0: 0, y1: 8 }]);
  P.wallWithHoles(S, L, Hh, 0.4, M.concreteDark, 0, 0.15, D / 2, Math.PI, []);
  for (const sx of [-1, 1]) P.wallWithHoles(S, D, Hh, 0.4, M.concreteDark, sx * L / 2, 0.15, 0, sx * Math.PI / 2, [{ x0: 3, x1: 4.4, y0: 0, y1: 2.4 }]);
  S.part(boxGeo(L + 1.4, 0.6, D + 1.4, 3), M.plate, 0, Hh + 0.4, 0); S.col(L, 0.6, D, 0, Hh + 0.15, 0, 0, 'metal');
  S.part(boxGeo(12.4, 3, 0.3), M.yellow, 0, 9.6, -D / 2 - 0.2); // door header w/ hazard
  for (let i = 0; i < 4; i++) S.part(boxGeo(L - 2, 0.4, 0.3), M.steel, 0, Hh - 0.6, -D / 2 + 3 + i * 5); // roof trusses
  for (let i = 0; i < 4; i++) { S.part(boxGeo(1.6, 0.1, 0.5), M.steel, -6 + i * 4, Hh - 0.8, 0); S.part(boxGeo(1.5, 0.04, 0.4), M.emWarm, -6 + i * 4, Hh - 0.86, 0); }
  // vehicle bay / armoury racks in the hangar
  S.part(boxGeo(8, 0.04, 10), M.plate, 0, 0.17, 2);
  for (let i = 0; i < 4; i++) { S.box(0.8, 2.0, 0.5, M.green, -12 + i * 1, 0.15, -4, 0, { m: 'metal' }); }
  // helipad outside the hangar
  const hp = new P.Site(W, 24, 0, -24, 0); hp.box(16, 0.2, 16, M.concrete, 0, -0.05, 0, 0, { ts: 4 });
  hp.part(boxGeo(8, 0.02, 0.6), M.yellow, 0, 0.16, 0); for (const sx of [-1, 1]) hp.part(boxGeo(0.6, 0.02, 6), M.yellow, sx * 2.5, 0.16, 0);
  for (const [cx, cz] of [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]]) hp.part(new THREE.SphereGeometry(0.12, 8, 6), M.emOrange, cx, 0.3, cz);
  W.col.box(24, -24, 2.4, 5, 0, 3, -2.4, 'metal');
  // consoles
  const cons = (lx, lz, ry, kind, label) => { S.box(1.2, 1.1, 0.7, M.machineDark, lx, 0.15, lz, ry, { m: 'metal' }); S.part(boxGeo(1.0, 0.6, 0.05), M.emCyan, lx - Math.sin(ry) * 0.36, 1.35, lz - Math.cos(ry) * 0.36, -0.4, ry, 0); W.interact.push({ kind, label, pos: S.world(lx, 1.0, lz) }); };
  cons(5.5, 4, 0, 'launch', 'Flight Ops Console');
  cons(9, 7, 0, 'intel', 'Threat Intel Terminal');
  cons(-9, 7, 0, 'stash', 'Stash Terminal');
  // shelves of gear inside hangar
  for (let i = 0; i < 3; i++) { S.box(3, 2.2, 0.8, M.steel, -10 + i * 3.4, 0.15, D / 2 - 1, 0, { m: 'metal' }); for (let j = 0; j < 3; j++) S.part(boxGeo(0.8, 0.4, 0.5), M.green, -10.8 + i * 3.4 + j * 0.9, 0.95 + (j % 2) * 0.7, D / 2 - 1); }
  // fuel tanks & radar mast outside
  P.tank(W, 30, height(30, -55), -55, rand); P.barrier(W, 18, 0, -30, 0.3, 'barrels', rand); P.barrier(W, -18, 0, -32, 0, 'pallets', rand);
  const mast = new P.Site(W, -24, 0, -40, 0); mast.box(0.4, 14, 0.4, M.steel, 0, 0, 0, 0, { m: 'metal' }); mast.part(cylGeo(1.4, 1.4, 0.2, 18).rotateX(1.2), M.white, 0, 13, 0);
  for (let i = 0; i < 8; i++) P.barrier(W, -40 + i * 3.2, 0, PLOT.z0 + PLOT.nz * CELL + 4, 0, 'sandbags', rand);
  // trees & rocks on the valley sides
  const ts = []; for (let i = 0; i < 400 && ts.length < 120; i++) { const x = (rand() - 0.5) * 290, z = (rand() - 0.5) * 290; const r = Math.hypot(x * 0.8, (z - 5) * 0.9); if (r < 55) continue; if (1 - terrain.normal(x, z).y > 0.4) continue; ts.push({ x, z, y: terrain.height(x, z) }); }
  root.add(P.makeTrees(W, ts, rand));
  const rs = []; for (let i = 0; i < 160; i++) { const x = (rand() - 0.5) * 300, z = (rand() - 0.5) * 300; const r = Math.hypot(x * 0.8, (z - 5) * 0.9); if (r < 50) continue; rs.push({ x, z, y: terrain.height(x, z), s: 1.5 + rand() * 4 }); }
  root.add(P.makeRocks(W, rs, rand));
  root.add(terrain.grass(Math.round(18000 * (QUALITY[QNAME]?.grass ?? 1)), seeded(5151), (x, z) => (x > -59 && x < -40 && z > -19 && z < 12) || x > PLOT.x0 - 3 && x < PLOT.x0 + PLOT.nx * CELL + 3 && z > PLOT.z0 - 45 && z < PLOT.z0 + PLOT.nz * CELL + 3));
  W.home = buildHome(W, root, rand);
  W.batch.build(root);
  // plot border markers
  const g = new THREE.Group(); root.add(g);
  for (let i = 0; i <= PLOT.nx; i++) for (const k of [0, PLOT.nz]) { const m = new THREE.Mesh(boxGeo(0.12, 0.6, 0.12), M.yellow); m.position.set(PLOT.x0 + i * CELL, 0.3, PLOT.z0 + k * CELL); g.add(m); }
  for (let j = 0; j <= PLOT.nz; j++) for (const k of [0, PLOT.nx]) { const m = new THREE.Mesh(boxGeo(0.12, 0.6, 0.12), M.yellow); m.position.set(PLOT.x0 + k * CELL, 0.3, PLOT.z0 + j * CELL); g.add(m); }
  W.spawn = new THREE.Vector3(-38, 0, 4); W.spawnYaw = Math.PI / 2;
  W.build = new BuildSystem(W, root);
  return W;
}

export function makePodUnused() {
  const M = P.worldMats(); const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 3.2, 10), M.white); body.position.y = 1.9; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 10), M.white); nose.position.y = 4.15; g.add(nose);
  const heat = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.25, 0.5, 10), M.rust); heat.position.y = 0.25; g.add(heat);
  for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(boxGeo(0.12, 1.6, 0.9), M.orange); const a = i / 4 * Math.PI * 2 + Math.PI / 4; fin.position.set(Math.cos(a) * 1.35, 1.2, Math.sin(a) * 1.35); fin.rotation.y = -a; g.add(fin); }
  const door = new THREE.Mesh(boxGeo(1.0, 1.9, 0.12), M.orange); door.position.set(0, 1.6, -1.18); g.add(door); g.userData.door = door;
  const win = new THREE.Mesh(boxGeo(0.5, 0.3, 0.05), M.glass); win.position.set(0, 2.9, -1.12); g.add(win);
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(boxGeo(1.6, 0.06, 0.02), M.yellow); s.position.set(0, 0.8 + i * 1.1, -1.25); s.rotation.y = 0; g.add(s); }
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.emRed); l.position.set(0, 4.85, 0); g.add(l);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ----------------------------------------------------------------------------- construction
const EDGE_DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export class BuildSystem {
  constructor(W, root) {
    this.W = W; this.group = new THREE.Group(); root.add(this.group); this.pieces = []; this.uid = 1;
    this.ghost = new THREE.Group(); this.ghost.visible = false; root.add(this.ghost);
    this.ghostOK = new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false });
    this.lights = [];
  }
  cellCenter(cx, cz) { return [PLOT.x0 + (cx + 0.5) * CELL, PLOT.z0 + (cz + 0.5) * CELL]; }
  levelY(level) { return BASE_Y + FOUND_H + level * STOREY; }
  find(fn) { return this.pieces.find(fn); }
  has(type, cx, cz, level) { return this.pieces.some((p) => p.type === type && p.cx === cx && p.cz === cz && (level === undefined || p.level === level)); }
  supported(spec) {
    const { type, cx, cz, level, edge } = spec; const kind = PIECES[type].kind;
    if (cx < 0 || cz < 0 || cx >= PLOT.nx || cz >= PLOT.nz) return false;
    const floorAt = (x, z, l) => l === 0 ? this.has('foundation', x, z) : this.has('floor', x, z, l);
    if (kind === 'foundation') return !this.has('foundation', cx, cz);
    if (kind === 'wall') {
      if (this.pieces.some((p) => PIECES[p.type].kind === 'wall' && p.cx === cx && p.cz === cz && p.edge === edge && p.level === level)) return false;
      const [dx, dz] = EDGE_DIR[edge]; return floorAt(cx, cz, level) || floorAt(cx + dx, cz + dz, level);
    }
    if (kind === 'floor') {
      if (level < 1 || this.has('floor', cx, cz, level)) return false;
      const wallsBelow = this.pieces.some((p) => PIECES[p.type].kind === 'wall' && p.level === level - 1 && ((p.cx === cx && p.cz === cz) || (p.cx + EDGE_DIR[p.edge][0] === cx && p.cz + EDGE_DIR[p.edge][1] === cz)));
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.has('floor', cx + dx, cz + dz, level));
      return wallsBelow || adj;
    }
    if (kind === 'ramp') return floorAt(cx, cz, level) && !this.pieces.some((p) => p.cx === cx && p.cz === cz && p.level === level && (PIECES[p.type].kind === 'ramp' || PIECES[p.type].kind === 'station' || PIECES[p.type].kind === 'prop'));
    // props / stations: on the plot ground or any floor, one per cell
    if (this.pieces.some((p) => p.cx === cx && p.cz === cz && p.level === level && ['ramp', 'station', 'prop'].includes(PIECES[p.type].kind))) return false;
    return level === 0 ? true : this.has('floor', cx, cz, level);
  }
  // derive a placement from an aim point
  specFromHit(type, hit, rot) {
    const kind = PIECES[type].kind; const p = hit.point;
    const fx = (p.x - PLOT.x0) / CELL, fz = (p.z - PLOT.z0) / CELL; let cx = Math.floor(fx), cz = Math.floor(fz);
    let level = Math.max(0, Math.round((p.y - this.levelY(0)) / STOREY));
    if (kind === 'foundation') level = 0;
    if (kind === 'floor') { level = Math.max(1, Math.round((p.y - this.levelY(0) + 0.2) / STOREY)); if (hit.normal && hit.normal.y < 0.5) { cx = Math.floor(fx + hit.normal.x * 0.5); cz = Math.floor(fz + hit.normal.z * 0.5); } }
    if (kind === 'wall') { if (hit.normal && hit.normal.y > 0.5) level = Math.max(0, Math.round((p.y - this.levelY(0)) / STOREY)); else level = Math.max(0, Math.floor((p.y - this.levelY(0) + 0.1) / STOREY)); }
    let edge = 0;
    if (kind === 'wall') { const lx = fx - cx - 0.5, lz = fz - cz - 0.5; edge = Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 1 : 3) : (lz > 0 ? 2 : 0); if (rot % 2 === 1 && false) edge = (edge + 1) % 4;
      // normalise S/W edges onto the neighbour's N/E edge so walls never duplicate
      if (edge === 2) { cz += 1; edge = 0; } else if (edge === 3) { cx -= 1; edge = 1; } }
    return { type, cx, cz, level, edge, rot: rot % 4 };
  }
  place(spec) { const p = { ...spec, id: this.uid++ }; this.pieces.push(p); this.spawn(p); return p; }
  remove(p) { this.pieces = this.pieces.filter((q) => q !== p); this.despawn(p); }
  // pieces that would lose support if p were removed (simple: dependent pieces stacked on it)
  dependents(p) {
    const kind = PIECES[p.type].kind; const out = [];
    for (const q of this.pieces) { if (q === p) continue; const k = PIECES[q.type].kind;
      if (kind === 'foundation' && q.level === 0 && q.cx === p.cx && q.cz === p.cz && k !== 'wall') out.push(q);
      if (kind === 'floor' && q.level === p.level && q.cx === p.cx && q.cz === p.cz && k !== 'wall') out.push(q); }
    return out;
  }
  clearAll() { for (const p of [...this.pieces]) this.despawn(p); this.pieces = []; }
  load(list) { this.clearAll(); for (const s of list || []) { if (!PIECES[s.type]) continue; this.place(s); } }
  serialize() { return this.pieces.map(({ type, cx, cz, level, edge, rot }) => ({ type, cx, cz, level, edge, rot })); }
  pieceAt(obj) { while (obj && !obj.userData.piece) obj = obj.parent; return obj?.userData.piece; }
  // ---- geometry per piece
  modelFor(spec) {
    const M = P.worldMats(), g = new THREE.Group(); const kind = PIECES[spec.type].kind;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const cols = []; const col = (w, h, d, x, y, z, extra) => cols.push({ w, h, d, x, y, z, extra });
    const t = spec.type;
    if (t === 'foundation') { add(boxGeo(CELL, FOUND_H + 0.6, CELL, 4), M.concrete, 0, FOUND_H / 2 - 0.3, 0); add(boxGeo(CELL + 0.06, 0.08, CELL + 0.06), M.concreteDark, 0, FOUND_H - 0.02, 0); col(CELL, FOUND_H + 0.6, CELL, 0, -0.6, 0); }
    else if (t === 'floor') { add(boxGeo(CELL, 0.2, CELL, 2), M.plate, 0, -0.1, 0); for (const s of [-1, 1]) add(boxGeo(CELL, 0.25, 0.15), M.steel, 0, -0.32, s * (CELL / 2 - 0.1)); col(CELL, 0.2, CELL, 0, -0.2, 0); }
    else if (kind === 'wall') {
      const holes = t === 'doorway' ? [{ x0: 1.3, x1: 2.7, y0: 0, y1: 2.3 }] : t === 'window' ? [{ x0: 1.2, x1: 2.8, y0: 1.2, y1: 2.1 }] : [];
      const xs = [0, ...holes.flatMap((h) => [h.x0, h.x1]), CELL];
      for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], b = xs[i + 1]; const cover = holes.find((h) => h.x0 <= a && h.x1 >= b); const spans = cover ? [[0, cover.y0], [cover.y1, STOREY]].filter(([p, q]) => q - p > 0.01) : [[0, STOREY]];
        for (const [y0, y1] of spans) { add(boxGeo(b - a, y1 - y0, 0.3, 2), M.concrete, (a + b) / 2 - CELL / 2, (y0 + y1) / 2, 0); col(b - a, y1 - y0, 0.3, (a + b) / 2 - CELL / 2, y0, 0); } }
      add(boxGeo(CELL + 0.02, 0.12, 0.34), M.concreteDark, 0, STOREY - 0.06, 0);
      if (t === 'window') add(boxGeo(1.6, 0.06, 0.5), M.steel, 0, 1.2, -0.05);
    } else if (t === 'ramp') {
      const n = 12; for (let i = 0; i < n; i++) add(boxGeo(1.8, 0.08, CELL / n + 0.02), M.plate, 0, (i + 1) * STOREY / n - 0.04, -CELL / 2 + (i + 0.5) * CELL / n);
      for (const s of [-1, 1]) { const len = Math.hypot(CELL, STOREY); add(boxGeo(0.12, 0.3, len), M.yellow, s * 0.95, STOREY / 2, 0, -Math.atan2(STOREY, CELL), 0, 0); add(boxGeo(0.05, 0.9, len), M.steel, s * 0.95, STOREY / 2 + 0.7, 0, -Math.atan2(STOREY, CELL), 0, 0); }
      cols.push({ ramp: true });
    } else if (t === 'sandbags') { for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; add(new THREE.CapsuleGeometry(0.17, 0.35, 2, 6).rotateZ(Math.PI / 2).scale(1, 0.7, 1.2), M.sandbag, Math.sin(a) * 1.7, 0.13 + r * 0.24, -Math.cos(a) * 1.7 + 1.2, 0, -a, 0); } col(3.2, 0.75, 0.8, 0, 0, -0.4); }
    else if (t === 'crate') { add(boxGeo(1.2, 1.9, 0.6), M.green, 0, 0.95, 0); for (let i = 0; i < 2; i++) add(boxGeo(0.02, 1.7, 0.01), M.steel, -0.3 + i * 0.6, 0.95, -0.305); add(boxGeo(1.25, 0.05, 0.65), M.steel, 0, 1.92, 0); col(1.2, 1.9, 0.6, 0, 0, 0); }
    else if (t === 'workbench' || t === 'gunsmith' || t === 'medbay') {
      const top = t === 'medbay' ? M.white : t === 'gunsmith' ? M.machineDark : M.woodDark;
      add(boxGeo(2.4, 0.08, 1.0), top, 0, 0.95, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxGeo(0.08, 0.95, 0.08), M.steel, sx * 1.1, 0.47, sz * 0.42);
      add(boxGeo(2.3, 0.05, 0.9), M.steel, 0, 0.3, 0); add(boxGeo(2.4, 1.2, 0.06), t === 'gunsmith' ? M.steel : M.wood, 0, 1.6, 0.47);
      if (t === 'workbench') { add(boxGeo(0.5, 0.25, 0.3), M.red, -0.7, 1.12, 0.1); add(cylGeo(0.1, 0.1, 0.4, 10).rotateZ(Math.PI / 2), M.steel, 0.6, 1.1, 0); add(boxGeo(0.15, 0.3, 0.15), M.steel, 0.9, 1.15, 0.25); for (let i = 0; i < 5; i++) add(boxGeo(0.04, 0.3, 0.02), M.steel, -0.8 + i * 0.25, 1.7, 0.43); }
      if (t === 'gunsmith') { add(boxGeo(0.9, 0.12, 0.12), M.machineDark, 0.2, 1.05, 0); add(boxGeo(0.12, 0.25, 0.12), M.steel, -0.3, 1.1, 0); add(boxGeo(0.5, 0.3, 0.04), M.emCyan, 0.8, 1.6, 0.43); for (let i = 0; i < 3; i++) add(boxGeo(0.7, 0.05, 0.12), M.machineDark, -0.6, 1.4 + i * 0.25, 0.4); }
      if (t === 'medbay') { add(boxGeo(0.12, 0.4, 0.12), M.red, -0.5, 1.6, 0.42); add(boxGeo(0.4, 0.12, 0.12), M.red, -0.5, 1.6, 0.42); add(boxGeo(0.5, 0.3, 0.3), M.white, 0.6, 1.12, 0); }
      const lamp = add(boxGeo(0.6, 0.05, 0.2), M.emWarm, 0, 2.2, 0.3);
      col(2.4, 1.0, 1.0, 0, 0, 0);
    } else if (t === 'generator') { add(boxGeo(1.8, 1.1, 1.0, 2), M.yellow, 0, 0.6, 0); add(boxGeo(1.9, 0.12, 1.1), M.steel, 0, 0.05, 0); add(cylGeo(0.08, 0.08, 0.8, 8), M.steel, 0.6, 1.5, 0.2); for (let i = 0; i < 6; i++) add(boxGeo(0.02, 0.6, 0.7), M.machineDark, -0.6 + i * 0.12, 0.6, -0.51, 0, Math.PI / 2, 0); add(boxGeo(0.12, 0.12, 0.02), M.emOrange, 0.5, 0.9, -0.51); col(1.8, 1.2, 1.0, 0, 0, 0); }
    else if (t === 'floodlight') { add(cylGeo(0.1, 0.08, 6, 8), M.steel, 0, 3, 0); add(boxGeo(1.2, 0.5, 0.3), M.machineDark, 0, 6, -0.2, 0.5, 0, 0); add(boxGeo(1.1, 0.4, 0.02), M.emWarm, 0, 5.95, -0.37, 0.5, 0, 0); add(boxGeo(0.8, 0.1, 0.8), M.steel, 0, 0.05, 0); col(0.3, 6, 0.3, 0, 0, 0); g.userData.lamp = true; }
    else if (t === 'turret') { for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; add(boxGeo(0.12, 1.5, 0.12), M.machineDark, Math.cos(a) * 0.5, 0.7, Math.sin(a) * 0.5, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); }
      const head = new THREE.Group(); head.position.y = 1.9; g.add(head); const hm = new THREE.Mesh(boxGeo(0.8, 0.5, 0.9), M.machine); hm.castShadow = true; head.add(hm); const b = new THREE.Mesh(cylGeo(0.06, 0.06, 0.8, 8).rotateX(Math.PI / 2), M.steel); b.position.set(0.2, -0.1, -0.7); head.add(b); const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.emCyan); e.position.set(0, 0.05, -0.46); head.add(e); g.userData.spin = head; col(1, 2.3, 1, 0, 0, 0); }
    else if (t === 'flag') { add(cylGeo(0.06, 0.05, 6, 8), M.steel, 0, 3, 0); const f = add(boxGeo(1.8, 1.1, 0.02), M.orange, 0.92, 5.3, 0); g.userData.flag = f; col(0.2, 6, 0.2, 0, 0, 0); }
    else if (t === 'barrel') { add(cylGeo(0.32, 0.32, 0.9, 14), M.rust, 0, 0.45, 0); add(new THREE.SphereGeometry(0.25, 8, 6).scale(1, 0.6, 1), M.emOrange, 0, 0.9, 0); col(0.7, 0.9, 0.7, 0, 0, 0); g.userData.fire = true; }
    return { g, cols };
  }
  transformFor(spec) {
    const [cx, cz] = this.cellCenter(spec.cx, spec.cz); const kind = PIECES[spec.type].kind;
    let x = cx, z = cz, y = this.levelY(spec.level), ry = -spec.rot * Math.PI / 2;
    if (kind === 'foundation') y = BASE_Y;
    if (kind === 'floor') y = this.levelY(spec.level);
    if (kind === 'wall') { const [dx, dz] = EDGE_DIR[spec.edge]; x += dx * CELL / 2; z += dz * CELL / 2; ry = spec.edge % 2 === 0 ? 0 : Math.PI / 2; }
    if (spec.level === 0 && (kind === 'prop' || kind === 'station') && !this.has('foundation', spec.cx, spec.cz)) y = BASE_Y;
    return { x, y, z, ry };
  }
  spawn(p) {
    const { g, cols } = this.modelFor(p); const T = this.transformFor(p);
    g.position.set(T.x, T.y, T.z); g.rotation.y = T.ry; g.userData.piece = p; this.group.add(g); p.obj = g; p.cols = [];
    const c = Math.cos(T.ry), s = Math.sin(T.ry);
    for (const k of cols) {
      if (k.ramp) { p.cols.push(this.W.col.add({ x: T.x, z: T.z, hw: 1.0, hd: CELL / 2, yaw: T.ry, y0: T.y - 0.2, y1: T.y + STOREY, ramp: { h0: T.y, h1: T.y + STOREY + 0.02 }, mat: 'metal', build: p })); continue; }
      const wx = T.x + k.x * c + k.z * s, wz = T.z - k.x * s + k.z * c;
      p.cols.push(this.W.col.box(wx, wz, k.w, k.d, T.y + k.y, T.y + k.y + k.h, T.ry, 'concrete', { build: p }));
    }
    if (g.userData.lamp) { const L = new THREE.SpotLight(0xfff0d0, 0, 40, 0.7, 0.5, 1.5); L.position.set(0, 6, -0.3); L.target.position.set(0, 0, -8); g.add(L, L.target); g.userData.light = L; this.lights.push(L); }
    if (g.userData.fire) { const L = new THREE.PointLight(0xff8030, 4, 9, 2); L.position.y = 1.2; g.add(L); g.userData.fireLight = L; }
  }
  despawn(p) { if (p.obj) this.group.remove(p.obj); for (const c of p.cols || []) this.W.col.remove(c); if (p.obj?.userData.light) this.lights = this.lights.filter((l) => l !== p.obj.userData.light); }
  showGhost(spec, ok) {
    this.ghost.clear(); if (!spec) { this.ghost.visible = false; return; }
    const { g } = this.modelFor(spec); const T = this.transformFor(spec); const mat = ok ? this.ghostOK : this.ghostBad;
    g.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    this.ghost.add(g); this.ghost.position.set(T.x, T.y, T.z); this.ghost.rotation.y = T.ry; this.ghost.visible = true;
  }
  count(type) { return this.pieces.filter((p) => p.type === type).length; }
  stationLevel(st) { return Math.min(3, this.pieces.filter((p) => PIECES[p.type].station === st).length); }
  update(dt, t, night) {
    const powered = this.count('generator') > 0;
    for (const L of this.lights) L.intensity = powered ? 60 : 0;
    for (const p of this.pieces) { const u = p.obj?.userData; if (!u) continue; if (u.spin) u.spin.rotation.y = Math.sin(t * 0.4 + p.id) * 1.2; if (u.flag) u.flag.rotation.y = Math.sin(t * 2 + p.id) * 0.15; if (u.fireLight) u.fireLight.intensity = 3 + Math.sin(t * 13 + p.id) * 0.8 + Math.sin(t * 7.3) * 0.6; }
  }
}

// ----------------------------------------------------------------------------- your home: two-storey house + carport
function buildHome(W, root, rand) {
  const M = P.worldMats(); const hx = -50, hz = 4, yaw = -Math.PI / 2; const S = new P.Site(W, hx, 0, hz, yaw);
  const L = 14, D = 11, FH = 3.2, T = 0.3, y0 = 0.25;
  const fab = (c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }); return m; };
  const couchM = fab(0x4a5a48), bedM = fab(0x6a6e5a), rugM = fab(0x7a3a2a), pillowM = fab(0xd8d2c0);
  // foundation + floors
  S.box(L + 0.8, 0.45, D + 0.8, M.concreteDark, 0, -0.2, 0, 0, { ts: 3 });
  S.part(boxGeo(L - 0.6, 0.04, D - 0.6), M.wood, 0, y0 + 0.02, 0);
  // ground floor walls: front door + windows, back windows, side windows
  P.wallWithHoles(S, L, FH, T, M.brick, 0, y0, -D / 2, 0, [{ x0: 1.5, x1: 3.3, y0: 0.9, y1: 2.3 }, { x0: 6.3, x1: 7.7, y0: 0, y1: 2.3 }, { x0: 10.2, x1: 12.4, y0: 0.9, y1: 2.3 }]);
  P.wallWithHoles(S, L, FH, T, M.brick, 0, y0, D / 2, Math.PI, [{ x0: 2, x1: 3.6, y0: 1.0, y1: 2.2 }, { x0: 9.6, x1: 11.2, y0: 1.0, y1: 2.2 }]);
  for (const sx of [-1, 1]) P.wallWithHoles(S, D - T, FH, T, M.brick, sx * (L / 2 - T / 2), y0, 0, sx * Math.PI / 2, [{ x0: 4, x1: 6.4, y0: 0.9, y1: 2.3 }]);
  // glass panes + frames
  for (const [x0, x1, z, yb, yt] of [[1.5, 3.3, -D / 2, 0.9, 2.3], [10.2, 12.4, -D / 2, 0.9, 2.3], [2, 3.6, D / 2, 1, 2.2], [9.6, 11.2, D / 2, 1, 2.2]]) { const cx = (x0 + x1) / 2 - L / 2; S.part(boxGeo(x1 - x0, yt - yb, 0.03), M.glass, cx, y0 + (yb + yt) / 2, z); S.part(boxGeo(x1 - x0 + 0.1, 0.08, 0.34), M.wood, cx, y0 + yb - 0.04, z); S.part(boxGeo(0.06, yt - yb, 0.06), M.woodDark, cx, y0 + (yb + yt) / 2, z); }
  // interior partition: living (x<1) | armory & kitchen (x>1)
  P.wallWithHoles(S, D - 0.6, FH - 0.05, 0.16, M.plaster, 1.0, y0, 0, Math.PI / 2, [{ x0: 4.2, x1: 5.6, y0: 0, y1: 2.25 }]);
  // upper floor slab with stairwell (living side, back wall)
  const fy = y0 + FH; S.box(L - 4.4, 0.25, D, M.concrete, 2.2, fy - 0.25, 0); S.box(4.4, 0.25, D - 3.2, M.concrete, -L / 2 + 2.2, fy - 0.25, -1.6);
  S.part(boxGeo(L - 0.6, 0.03, D - 0.6), M.wood, 0, fy + 0.015, 0);
  // stairs (along the back wall, rising toward -z)
  const sx0 = -L / 2 + 1.4;
  for (let i = 0; i < 14; i++) S.part(boxGeo(1.7, 0.08, 0.24), M.wood, sx0, y0 + (i + 1) * FH / 14 - 0.04, D / 2 - 0.5 - i * 0.2);
  S.part(boxGeo(0.06, 0.9, 3.0), M.steel, sx0 + 0.88, y0 + FH / 2 + 0.4, D / 2 - 1.9, Math.atan2(FH, 2.8));
  S.ramp(1.7, 2.8, sx0, D / 2 - 1.9, y0 + 0.02, fy + 0.02, Math.PI);
  // upper walls
  P.wallWithHoles(S, L, FH, T, M.plaster, 0, fy, -D / 2, 0, [{ x0: 2, x1: 4, y0: 0.9, y1: 2.2 }, { x0: 6, x1: 8, y0: 0, y1: 2.3 }, { x0: 10, x1: 12, y0: 0.9, y1: 2.2 }]);
  P.wallWithHoles(S, L, FH, T, M.plaster, 0, fy, D / 2, Math.PI, [{ x0: 6, x1: 8, y0: 0.9, y1: 2.2 }]);
  for (const sx of [-1, 1]) P.wallWithHoles(S, D - T, FH, T, M.plaster, sx * (L / 2 - T / 2), fy, 0, sx * Math.PI / 2, [{ x0: 4.2, x1: 6.2, y0: 0.9, y1: 2.2 }]);
  // balcony over the porch + railing
  S.box(4.2, 0.2, 2.2, M.concrete, 0, fy - 0.2, -D / 2 - 1.1); S.part(boxGeo(4.2, 0.9, 0.06), M.steel, 0, fy + 0.45, -D / 2 - 2.2); for (const s2 of [-1, 1]) S.part(boxGeo(0.06, 0.9, 2.2), M.steel, s2 * 2.1, fy + 0.45, -D / 2 - 1.1);
  for (const s2 of [-1, 1]) S.box(0.25, FH - 0.2, 0.25, M.woodDark, s2 * 2.0, y0, -D / 2 - 2.0, 0, { m: 'wood' });
  // roof with parapet
  S.box(L + 0.4, 0.3, D + 0.4, M.concreteDark, 0, fy + FH, 0); for (const [w, d, x, z] of [[L + 0.4, 0.2, 0, -D / 2 - 0.1], [L + 0.4, 0.2, 0, D / 2 + 0.1], [0.2, D + 0.4, -L / 2 - 0.1, 0], [0.2, D + 0.4, L / 2 + 0.1, 0]]) S.box(w, 0.6, d, M.concreteDark, x, fy + FH + 0.3, z, 0, { noCol: true });
  S.part(cylGeo(0.5, 0.5, 1.2, 14), M.white, 4, fy + FH + 0.9, 2); S.part(boxGeo(1.2, 0.08, 0.8), M.machineDark, -3, fy + FH + 0.5, -2, -0.4); // water tank, solar panel
  // porch steps
  S.box(2.4, 0.15, 1.0, M.concrete, 0, 0, -D / 2 - 0.6); S.box(2.4, 0.15, 0.6, M.concrete, 0, -0.12, -D / 2 - 1.3);
  // ---- living room furniture (x < 1)
  const lx = -L / 2 + 3.2;
  S.box(2.6, 0.45, 0.95, couchM, lx, y0, -1.2, 0, { m: 'wood' }); S.part(boxGeo(2.6, 0.5, 0.2), couchM, lx, y0 + 0.65, -0.8); for (const s2 of [-1, 1]) S.part(boxGeo(0.2, 0.35, 0.95), couchM, lx + s2 * 1.3, y0 + 0.62, -1.2);
  S.box(1.2, 0.45, 0.6, M.woodDark, lx, y0, -2.6, 0, { m: 'wood' }); S.part(boxGeo(3.2, 0.01, 2.2), rugM, lx, y0 + 0.03, -2.2);
  S.box(1.8, 0.5, 0.45, M.woodDark, lx, y0, -D / 2 + 0.45, 0, { m: 'wood' }); S.part(boxGeo(1.4, 0.8, 0.06), M.machineDark, lx, y0 + 1.1, -D / 2 + 0.4); const tv = new THREE.Mesh(boxGeo(1.3, 0.7, 0.01), new THREE.MeshBasicMaterial({ color: 0x2a5a7a, toneMapped: false })); tv.position.copy(S.world(lx, y0 + 1.1, -D / 2 + 0.44)); tv.rotation.y = yaw; root.add(tv);
  S.part(cylGeo(0.03, 0.03, 1.5, 6), M.steel, lx + 1.8, y0 + 0.75, -0.4); S.part(cylGeo(0.12, 0.22, 0.3, 10), M.emWarm, lx + 1.8, y0 + 1.55, -0.4);
  // ---- kitchen (x > 1, back half)
  S.box(5.2, 0.9, 0.65, M.white, 4.2, y0, D / 2 - 0.5, 0, { m: 'metal' }); S.part(boxGeo(5.3, 0.05, 0.7), M.tile, 4.2, y0 + 0.92, D / 2 - 0.5);
  S.box(0.8, 1.9, 0.7, M.steel, L / 2 - 0.7, y0, D / 2 - 0.5, 0, { m: 'metal' }); S.part(boxGeo(0.5, 0.06, 0.4), M.steel, 3.0, y0 + 0.95, D / 2 - 0.5);
  S.box(1.6, 0.75, 0.9, M.woodDark, 4.4, y0, 1.6, 0, { m: 'wood' }); for (const s2 of [-1, 1]) S.part(boxGeo(0.45, 0.45, 0.45), M.wood, 4.4 + s2 * 1.0, y0 + 0.22, 1.6);
  // ---- armory (x > 1, front half): gun wall, ammo crates, map board
  S.part(boxGeo(4.8, 2.0, 0.05), M.woodDark, 4.0, y0 + 1.5, -D / 2 + 0.2);
  for (let i = 0; i < 4; i++) S.box(0.9, 0.45, 0.55, M.green, 2.6 + i * 1.0, y0, -D / 2 + 1.0 + (i % 2) * 0.1, 0.05 * i, { m: 'wood' });
  S.box(1.6, 0.9, 0.7, M.machineDark, L / 2 - 1.0, y0, -1.2, Math.PI / 2, { m: 'metal' });
  const rackSlots = []; for (let i = 0; i < 8; i++) { const r = i % 4, c = Math.floor(i / 4); rackSlots.push({ pos: S.world(2.1 + r * 1.25, y0 + 2.15 - c * 0.85, -D / 2 + 0.3), yaw }); S.part(boxGeo(0.08, 0.05, 0.12), M.steel, 2.1 + r * 1.25 - 0.3, y0 + 2.08 - c * 0.85, -D / 2 + 0.3); S.part(boxGeo(0.08, 0.05, 0.12), M.steel, 2.1 + r * 1.25 + 0.3, y0 + 2.08 - c * 0.85, -D / 2 + 0.3); }
  const mapBoard = { pos: S.world(L / 2 - 0.2, y0 + 1.6, -2.6), yaw: yaw - Math.PI / 2 };
  // ---- upstairs bunk room
  for (const bz of [-2.8, 0.8]) { S.box(2.1, 0.45, 1.0, M.steel, L / 2 - 1.5, fy, bz, 0, { m: 'metal' }); S.part(boxGeo(2.0, 0.18, 0.9), bedM, L / 2 - 1.5, fy + 0.54, bz); S.part(boxGeo(0.45, 0.12, 0.6), pillowM, L / 2 - 0.65, fy + 0.68, bz); }
  for (let i = 0; i < 3; i++) S.box(0.55, 1.8, 0.5, M.blue, -1.5 + i * 0.6, fy, D / 2 - 0.45, 0, { m: 'metal' });
  S.box(1.6, 0.75, 0.7, M.woodDark, -3.4, fy, -D / 2 + 0.6, 0, { m: 'wood' }); S.part(boxGeo(0.4, 0.25, 0.3), M.machineDark, -3.6, fy + 0.9, -D / 2 + 0.6); S.part(boxGeo(0.06, 0.06, 0.02), M.emCyan, -3.5, fy + 0.95, -D / 2 + 0.44);
  S.part(boxGeo(3.0, 0.01, 2.0), rugM, 1.5, fy + 0.04, -0.8);
  // lights
  const lights = [];
  for (const [x, y, z] of [[lx, y0 + 2.9, -1.5], [4.2, y0 + 2.9, -2.4], [4.2, y0 + 2.9, 3.0], [2, fy + 2.9, -1], [-3, fy + 2.9, 2]]) { S.part(boxGeo(0.5, 0.06, 0.5), M.emWarm, x, y, z); const Lp = new THREE.PointLight(0xffd8a0, 5, 9, 2); Lp.position.copy(S.world(x, y - 0.2, z)); root.add(Lp); lights.push(Lp); }
  // ---- carport with a parking spot, yard sandbags, mailbox-style sign
  const C = new P.Site(W, -50, 0, -14, 0);
  C.box(8, 0.15, 7, M.concrete, 0, -0.05, 0, 0, { ts: 4 });
  for (const [x, z] of [[-3.8, -3.3], [3.8, -3.3], [-3.8, 3.3], [3.8, 3.3]]) C.box(0.18, 3.2, 0.18, M.steel, x, 0, z, 0, { m: 'metal' });
  C.part(scaleUV(boxGeo(8.4, 0.08, 7.4), 1), M.corr, 0, 3.25, 0, 0.04); C.col(8.4, 0.3, 7.4, 0, 3.15, 0, 0, 'metal');
  C.box(2.2, 1.1, 0.6, M.red, -3.0, 0, 2.9, 0, { m: 'metal' }); for (let i = 0; i < 4; i++) C.part(boxGeo(0.35, 0.45, 0.16), M.green, 2.2 + (i % 2) * 0.4, 0.22 + Math.floor(i / 2) * 0.45, 3.0);
  for (let i = 0; i < 6; i++) P.barrier(W, -63 + i * 3.1, 0, 19, 0, 'sandbags', rand);
  return { rackSlots, mapBoard, lights, garage: new THREE.Vector3(-50, 0, -14), garageYaw: 0, door: S.world(0, 0, -D / 2 - 1.5) };
}
