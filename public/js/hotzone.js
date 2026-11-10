// The Ashgrove hotzone: terrain, roads, districts (Old Quarter, Foundry Yards, Radio Hill, Farmstead, Crash Site, Gas Station),
// extraction LZs, loot placement and hostile spawn tables.
import * as THREE from 'three';
import { makeNoise, seeded } from './noise.js';
import { Batcher, CollisionWorld, boxGeo, cylGeo } from './geom.js';
import { Terrain } from './terrain.js';
import { smooth } from './textures.js';
import * as P from './props.js';

export const MAP_SIZE = 640, PLAY = 292;
export const DROP_ZONES = [
  { id: 'quarter', name: 'Old Quarter', pos: [60, 20], danger: 2, desc: 'Ruined apartment blocks. Dense loot, raider patrols.' },
  { id: 'foundry', name: 'Foundry Yards', pos: [185, -140], danger: 3, desc: 'Warehouses and container stacks. Machines nest here.' },
  { id: 'radio', name: 'Radio Hill', pos: [-175, -150], danger: 3, desc: 'Fortified relay post. Weapon caches, heavy guard.' },
  { id: 'farm', name: 'Farmstead', pos: [-170, 150], danger: 1, desc: 'Quiet farmland. Timber and fabric, light resistance.' },
  { id: 'crash', name: 'Crash Site', pos: [160, 165], danger: 4, desc: 'A downed Juggernaut. Machine cores — and a Strider.' },
  { id: 'gas', name: 'Route 9 Station', pos: [-80, 100], danger: 1, desc: 'Roadside gas station on the highway.' },
];
export const EXTRACTS = [
  { id: 'north', name: 'North Relay LZ', pos: [-10, -232] }, { id: 'east', name: 'East Docks LZ', pos: [234, 70] },
  { id: 'west', name: 'West Pass LZ', pos: [-234, 10] }, { id: 'south', name: 'Silo Field LZ', pos: [-40, 234] },
];
const ROADS = [
  [[-60, -320], [-52, -150], [-40, 0], [-55, 150], [-70, 320]],
  [[-320, 30], [-150, 25], [-40, 20], [60, 20], [160, 30], [320, 48]],
  [[60, 20], [110, -60], [160, -140], [175, -260]],
  [[-55, 150], [-120, 160], [-200, 150]],
  [[-52, -150], [-120, -162], [-178, -160]],
  [[160, 30], [168, 110], [160, 150]],
  [[-40, 20], [-160, 15], [-234, 10]], [[-55, 150], [-42, 234]], [[-52, -150], [-10, -232]], [[160, 30], [234, 70]],
];

function segDist(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz))); const x = a[0] + dx * t, z = a[1] + dz * t; return [Math.hypot(px - x, pz - z), x, z]; }
function roadDist(x, z) { let best = 1e9; for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) { const [d] = segDist(x, z, r[i], r[i + 1]); if (d < best) best = d; } return best; }

export function buildHotzone(scene, seed = 7) {
  const rand = seeded(seed), noise = makeNoise(seed);
  const root = new THREE.Group(); scene.add(root);
  // ---- pads (flattened building footprints) defined first so terrain can honour them
  const pads = [];
  const pad = (x, z, w, d, yaw = 0, drop = 0) => pads.push({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(yaw), s: Math.sin(yaw), drop });
  const low = (x, z) => noise.fbm(x / 260, z / 260, 3) * 16 + noise.fbm(x / 90 + 7, z / 90, 2) * 4;
  const hills = (x, z) => { const d = Math.max(Math.abs(x), Math.abs(z)); const m = smooth(225, 300, d); return m * (35 + noise.ridge(x / 70, z / 70, 4) * 40); };
  const hillBump = (x, z) => 18 * Math.exp(-((x + 195) ** 2 + (z + 175) ** 2) / (2 * 45 * 45)) + 6 * Math.exp(-((x - 150) ** 2 + (z + 150) ** 2) / (2 * 80 * 80)) * 0;
  const raw = (x, z) => low(x, z) + hills(x, z) + hillBump(x, z) + noise.fbm(x / 22, z / 22, 3) * 1.4;
  // layout (positions only), resolved to pad heights afterwards
  const L = { apartments: [[20, -14, Math.PI], [55, -15, Math.PI], [92, -13, Math.PI], [22, 52, 0], [62, 54, 0], [100, 50, 0]],
    houses: [[-15, -22, Math.PI], [-12, 60, 0], [130, 62, 0], [128, -24, Math.PI], [155, 66, 0], [-160, 120, Math.PI / 2], [-215, 185, -Math.PI / 2], [-140, 178, 0], [-235, 110, Math.PI]],
    warehouses: [[195, -90, Math.PI / 2], [205, -160, Math.PI / 2], [125, -205, 0]], gas: [-92, 105, -Math.PI / 2], barn: [-195, 150, Math.PI / 2],
    bunker: [-172, -158, Math.PI / 2], tower: [-205, -188], wreck: [160, 168, 0.4], tanks: [[248, -110], [252, -150], [238, -190]] };
  for (const [x, z, y] of L.apartments) pad(x, z, 20, 18, y);
  for (const [x, z, y] of L.houses) pad(x, z, 14, 13, y);
  for (const [x, z, y] of L.warehouses) pad(x, z, 32, 22, y);
  pad(L.gas[0], L.gas[1], 34, 26, L.gas[2]); pad(L.barn[0] + 4, L.barn[1], 30, 18, L.barn[2]); pad(L.bunker[0], L.bunker[1], 16, 12, L.bunker[2]); pad(L.tower[0], L.tower[1], 12, 12);
  pad(L.wreck[0], L.wreck[1], 34, 30, L.wreck[2], -2.5);
  for (const [x, z] of L.tanks) pad(x, z, 16, 16);
  pad(225, -215, 50, 30, 0); // container yard
  for (const e of EXTRACTS) pad(e.pos[0], e.pos[1], 22, 22);
  for (const p of pads) p.h = raw(p.x, p.z) * 0.6 + low(p.x, p.z) * 0.4 + p.drop;
  const height = (x, z) => {
    let h = raw(x, z);
    const rd = roadDist(x, z); const rm = smooth(9, 3.5, rd); h = h * (1 - rm) + (low(x, z) + hills(x, z) * 0.9 + hillBump(x, z)) * rm;
    for (const p of pads) { const dx = x - p.x, dz = z - p.z; const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c; const ex = Math.max(0, Math.abs(lx) - p.hw), ez = Math.max(0, Math.abs(lz) - p.hd); const d = Math.hypot(ex, ez); if (d < 12) { const m = smooth(12, 0, d); h = h * (1 - m) + p.h * m; } }
    return h;
  };
  const splat = (x, z, y, slope) => {
    const rd = roadDist(x, z); const asph = smooth(5.2, 4.2, rd);
    let inPad = 0; for (const p of pads) { const dx = x - p.x, dz = z - p.z; const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c; if (Math.abs(lx) < p.hw + 2 && Math.abs(lz) < p.hd + 2) inPad = 1; }
    const rock = smooth(0.18, 0.32, slope) + smooth(30, 50, y) * 0.5;
    const n = noise.fbm(x / 30, z / 30, 3) * 0.5 + 0.5;
    const dirt = inPad * 0.8 + smooth(0.45, 0.7, n) * 0.6 + smooth(8, 4, rd) * 0.5;
    return [Math.max(0, 1.2 - dirt - rock * 1.5) * (1 - asph), dirt * (1 - asph), rock * (1 - asph), asph * 3];
  };
  const terrain = new Terrain({ size: MAP_SIZE, res: 256, heightFn: height, splatFn: splat });
  root.add(terrain.mesh);
  const W = { root, terrain, batch: new Batcher(), col: new CollisionWorld(terrain), loot: [], spawns: [], extracts: [], dropZones: DROP_ZONES, lights: [] };
  const H = (x, z) => terrain.height(x, z);
  // invisible boundary walls
  for (const [x, z, w, d] of [[0, -PLAY - 2, 640, 4], [0, PLAY + 2, 640, 4], [-PLAY - 2, 0, 4, 640], [PLAY + 2, 0, 4, 640]]) W.col.box(x, z, w, d, -50, 300, 0, 'concrete', { noRay: true });
  const addLoot = (list) => { for (const l of list || []) W.loot.push(l); };
  const padH = (x, z) => { let best = null, bd = 1e9; for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = p; } } return best.h; };
  // ---- districts
  for (const [x, z, y] of L.apartments) addLoot(P.apartment(W, x, padH(x, z), z, y, rand, 2 + Math.floor(rand() * 2)).loot);
  for (const [x, z, y] of L.houses) addLoot(P.house(W, x, padH(x, z), z, y, rand).loot);
  for (const [x, z, y] of L.warehouses) addLoot(P.warehouse(W, x, padH(x, z), z, y, rand).loot);
  addLoot(P.gasStation(W, L.gas[0], padH(L.gas[0], L.gas[1]), L.gas[1], L.gas[2], rand).loot);
  addLoot(P.barn(W, L.barn[0], padH(L.barn[0] + 4, L.barn[1]), L.barn[1], L.barn[2], rand).loot);
  addLoot(P.bunker(W, L.bunker[0], padH(L.bunker[0], L.bunker[1]), L.bunker[1], L.bunker[2], rand).loot);
  const tower = P.radioTower(W, L.tower[0], padH(L.tower[0], L.tower[1]), L.tower[1], rand);
  addLoot(P.machineWreck(W, L.wreck[0], padH(L.wreck[0], L.wreck[1]), L.wreck[1], L.wreck[2], rand).loot);
  for (const [x, z] of L.tanks) P.tank(W, x, padH(x, z), z, rand);
  // container yard: stacks + some open ones with loot
  const yardH = padH(225, -215);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { if (rand() < 0.25) continue; const x = 205 + i * 7.5, z = -225 + j * 9; const stack = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < stack; s++) { const open = s === 0 && rand() < 0.3; addLoot(P.container(W, x, yardH + s * 2.59, z, Math.PI / 2 * 0 + (rand() - 0.5) * 0.04, rand, open).loot); } }
  // radio hill camp
  const bh = padH(L.bunker[0], L.bunker[1]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const x = L.bunker[0] - 8 + Math.cos(a) * 16, z = L.bunker[1] - 8 + Math.sin(a) * 16; P.barrier(W, x, H(x, z), z, a + Math.PI / 2, 'sandbags', rand); }
  for (let i = 0; i < 3; i++) addLoot(P.container(W, L.bunker[0] - 22 + i * 7, H(L.bunker[0] - 22 + i * 7, L.bunker[1] + 14), L.bunker[1] + 14, Math.PI / 2, rand, i === 1).loot);
  // gas station / quarter / foundry clutter
  const clutter = [[[-60, 80], 'barrels'], [[-100, 130], 'pallets'], [[40, 20], 'jersey'], [[75, 22], 'jersey'], [[110, 18], 'tires'], [[170, -120], 'barrels'], [[180, -60], 'pallets'], [[215, -130], 'barrels'], [[140, -180], 'tires'], [[-185, 135], 'pallets'], [[-170, -175], 'barrels'], [[35, 35], 'barrels'], [[85, 35], 'pallets'], [[-30, 40], 'tires']];
  for (const [[x, z], k] of clutter) P.barrier(W, x, H(x, z), z, rand() * 6, k, rand);
  // highway jersey barriers & checkpoint
  for (let i = 0; i < 10; i++) { const z = -80 + i * 6, x = -44 + (i % 3) * 0.3; P.barrier(W, x - 6 + (i % 2) * 12, H(x, z), z, 0, 'jersey', rand); }
  // ---- roads: lines, cars, poles
  const lineMat = P.worldMats().linePaint;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1]; const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
    for (let s = 2; s < len - 2; s += 6) { const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (Math.abs(x) > PLAY + 20 || Math.abs(z) > PLAY + 20) continue; W.batch.put(boxGeo(0.15, 0.02, 3), lineMat, null, x, H(x, z) + 0.04, z, 0, ang, 0); }
    for (let s = 8; s < len; s += 40) { const t = s / len, x = ax + (bx - ax) * t + Math.cos(ang) * 7, z = az + (bz - az) * t - Math.sin(ang) * 7; if (Math.abs(x) > PLAY || Math.abs(z) > PLAY) continue; P.barrier(W, x, H(x, z), z, ang, 'pole', rand); }
    for (let s = 15; s < len; s += 28 + rand() * 30) { if (rand() < 0.45) continue; const t = s / len; const off = (rand() - 0.5) * 7; const x = ax + (bx - ax) * t + Math.cos(ang) * off, z = az + (bz - az) * t - Math.sin(ang) * off;
      if (Math.abs(x) > PLAY - 5 || Math.abs(z) > PLAY - 5 || nearPad(pads, x, z, 2)) continue;
      const kind = rand() < 0.75 ? 'sedan' : rand() < 0.6 ? 'truck' : 'bus'; addLoot(P.car(W, x, H(x, z), z, ang + Math.PI / 2 + (rand() - 0.5) * 0.8, rand, kind).loot); }
  }
  // ---- extraction LZs
  for (const e of EXTRACTS) {
    const [x, z] = e.pos, y = padH(x, z); const S = new P.Site(W, x, y, z, 0); const M = P.worldMats();
    S.box(16, 0.25, 16, M.concrete, 0, -0.1, 0, 0, { ts: 4 });
    S.part(boxGeo(10, 0.02, 0.6), M.yellow, 0, 0.17, 0); for (const sx of [-1, 1]) S.part(boxGeo(0.6, 0.02, 7), M.yellow, sx * 3, 0.17, 0); // H marking
    for (const [cx, cz] of [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]]) { S.part(cylGeo(0.12, 0.12, 0.3, 8), M.steel, cx, 0.3, cz); S.part(new THREE.SphereGeometry(0.12, 8, 6), M.emOrange, cx, 0.5, cz); }
    S.box(1.0, 1.3, 0.6, M.yellow, 9.5, 0, 0, Math.PI / 2, { m: 'metal' }); S.part(boxGeo(0.7, 0.4, 0.05), M.emCyan, 9.5 - 0.31, 1.0, 0, 0, Math.PI / 2, 0);
    S.box(0.25, 6, 0.25, M.steel, 9.5, 0, 2, 0, { m: 'metal' }); S.part(boxGeo(0.6, 0.3, 0.4), M.emWarm, 9.5, 6, 2);
    W.extracts.push({ ...e, center: new THREE.Vector3(x, y + 0.15, z), console: S.world(9.2, 0, 0), active: false });
  }
  // ---- vegetation
  const avoid = (x, z, r = 3) => roadDist(x, z) < 6 + r || nearPad(pads, x, z, r);
  const treeSpots = [];
  for (let i = 0; i < 2600 && treeSpots.length < 520; i++) { const x = (rand() - 0.5) * 600, z = (rand() - 0.5) * 600; if (avoid(x, z, 4)) continue; const sl = 1 - terrain.normal(x, z).y; if (sl > 0.35) continue;
    const forest = noise.fbm(x / 80 + 3, z / 80, 3); if (forest < -0.02 && rand() > 0.12) continue; treeSpots.push({ x, z, y: H(x, z) }); }
  root.add(P.makeTrees(W, treeSpots, rand));
  const rockSpots = [];
  for (let i = 0; i < 900 && rockSpots.length < 340; i++) { const x = (rand() - 0.5) * 620, z = (rand() - 0.5) * 620; if (avoid(x, z, 2)) continue; const d = Math.max(Math.abs(x), Math.abs(z)); const sl = 1 - terrain.normal(x, z).y; if (d < 200 && sl < 0.12 && rand() < 0.75) continue; rockSpots.push({ x, z, y: H(x, z), s: d > 230 ? 2 + rand() * 4 : undefined }); }
  root.add(P.makeRocks(W, rockSpots, rand));
  root.add(terrain.grass(65000, rand, (x, z) => roadDist(x, z) < 5 || nearPad(pads, x, z, 0)));
  W.batch.build(root);
  // ---- enemy spawn plan (types per district; resolved by the game at raid start)
  const S = (type, x, z, n = 1, spread = 20, tier = 0) => { for (let i = 0; i < n; i++) { const px = x + (rand() - 0.5) * spread, pz = z + (rand() - 0.5) * spread; W.spawns.push({ type, pos: new THREE.Vector3(px, H(px, pz), pz), tier }); } };
  S('raider', 55, 20, 5, 70); S('drone', 60, 15, 3, 80); S('crawler', 70, 30, 2, 60); S('sentinel', 38, 3, 1, 1); S('sentinel', 82, 36, 1, 1);
  S('crawler', 190, -130, 4, 60); S('drone', 200, -150, 3, 70); S('raider', 150, -190, 3, 40); S('sentinel', 225, -200, 1, 1); S('sentinel', 178, -110, 1, 1);
  S('raider', -180, -160, 4, 30, 1); S('sentinel', -190, -175, 1, 1); S('sentinel', -160, -150, 1, 1); S('drone', -175, -160, 2, 40);
  S('strider', 150, 190, 1, 4); S('crawler', 165, 165, 3, 40); S('drone', 160, 170, 2, 40);
  S('raider', -180, 145, 3, 50); S('drone', -170, 150, 2, 60);
  S('raider', -85, 105, 2, 20); S('crawler', -70, 90, 1, 20);
  for (let i = 0; i < 5; i++) S('drone', (rand() - 0.5) * 500, (rand() - 0.5) * 500, 1, 1);
  W.tower = tower;
  return W;
}
function nearPad(pads, x, z, r) { for (const p of pads) { const dx = x - p.x, dz = z - p.z; const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c; if (Math.abs(lx) < p.hw + r && Math.abs(lz) < p.hd + r) return true; } return false; }
