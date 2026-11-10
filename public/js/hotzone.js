// The Ashgrove hotzone: terrain, roads, districts (Old Quarter, Foundry Yards, Radio Hill, Farmstead, Crash Site, Gas Station),
// extraction LZs, loot placement and hostile spawn tables.
import * as THREE from 'three';
import { makeNoise, seeded } from './noise.js';
import { Batcher, CollisionWorld, boxGeo, cylGeo } from './geom.js';
import { Terrain } from './terrain.js';
import { smooth } from './textures.js';
import * as P from './props.js';

export const MAP_SIZE = 1024, PLAY = 490;
export const DROP_ZONES = [
  { id: 'quarter', name: 'Old Quarter', pos: [60, 20], danger: 2, desc: 'Ruined apartment blocks. Dense loot, raider patrols.' },
  { id: 'foundry', name: 'Foundry Yards', pos: [185, -140], danger: 3, desc: 'Warehouses and container stacks. Machines nest here.' },
  { id: 'radio', name: 'Radio Hill', pos: [-175, -150], danger: 3, desc: 'Fortified relay post. Weapon caches, heavy guard.' },
  { id: 'farm', name: 'Farmstead', pos: [-170, 150], danger: 1, desc: 'Quiet farmland. Timber and fabric, light resistance.' },
  { id: 'crash', name: 'Crash Site', pos: [160, 165], danger: 4, desc: 'A downed Juggernaut. Machine cores — and a Strider.' },
  { id: 'gas', name: 'Route 9 Station', pos: [-80, 100], danger: 1, desc: 'Roadside gas station on the highway.' },
  { id: 'airfield', name: 'Ashgrove Airfield', pos: [350, -330], danger: 3, desc: 'Hangars, a long runway and a control tower. Vehicles and machine patrols.' },
  { id: 'fob', name: 'FOB Kestrel', pos: [-350, -340], danger: 4, desc: 'Abandoned forward operating base. Weapon caches behind guard towers.' },
  { id: 'mill', name: 'Lumber Mill', pos: [-370, 330], danger: 1, desc: 'Sawmill sheds and timber yards. Building materials, few guards.' },
  { id: 'refinery', name: 'Refinery', pos: [370, 330], danger: 3, desc: 'Storage tanks and pipe racks. Chemicals, electronics and crawler nests.' },
  { id: 'kessler', name: 'Kessler Town', pos: [10, 390], danger: 2, desc: 'A second town on the southern highway. Apartments, shops and raiders.' },
  { id: 'quarry', name: 'Grey Quarry', pos: [410, -20], danger: 2, desc: 'A sunken rock quarry with heavy machinery and scrap.' },
];
export const EXTRACTS = [
  { id: 'north', name: 'North Relay LZ', pos: [-10, -440] }, { id: 'east', name: 'East Docks LZ', pos: [450, 120] },
  { id: 'west', name: 'West Pass LZ', pos: [-450, 10] }, { id: 'south', name: 'Silo Field LZ', pos: [-130, 450] },
  { id: 'ne', name: 'Runway End LZ', pos: [430, -440] }, { id: 'center', name: 'Old Quarter Rooftop LZ', pos: [-10, 120] },
];
const ROADS = [
  [[-60, -520], [-55, -330], [-52, -150], [-40, 0], [-55, 150], [-40, 300], [10, 380], [20, 520]],
  [[-520, 30], [-320, 30], [-150, 25], [-40, 20], [60, 20], [160, 30], [320, 48], [520, 60]],
  [[175, -260], [260, -300], [350, -330], [430, -430]], [[-55, -330], [-200, -335], [-350, -340]],
  [[-200, 150], [-300, 250], [-370, 330]], [[160, 150], [260, 250], [370, 330]], [[320, 48], [410, -20]], [[-40, 300], [-130, 450]],
  [[-450, 10], [-520, 30]], [[450, 120], [320, 48]],
  [[60, 20], [110, -60], [160, -140], [175, -260]],
  [[-55, 150], [-120, 160], [-200, 150]],
  [[-52, -150], [-120, -162], [-178, -160]],
  [[160, 30], [168, 110], [160, 150]],
  [[-40, 20], [-160, 15], [-450, 10]], [[-52, -150], [-10, -440]],
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
  const hills = (x, z) => { const d = Math.max(Math.abs(x), Math.abs(z)); const m = smooth(410, 500, d); return m * (40 + noise.ridge(x / 70, z / 70, 4) * 45) + smooth(260, 420, d) * noise.fbm(x / 120, z / 120, 3) * 14; };
  const hillBump = (x, z) => 18 * Math.exp(-((x + 195) ** 2 + (z + 175) ** 2) / (2 * 45 * 45)) - 14 * Math.exp(-((x - 410) ** 2 + (z + 20) ** 2) / (2 * 40 * 40));
  const raw = (x, z) => low(x, z) + hills(x, z) + hillBump(x, z) + noise.fbm(x / 22, z / 22, 3) * 1.4;
  // layout (positions only), resolved to pad heights afterwards
  const L = { apartments: [[20, -14, Math.PI], [55, -15, Math.PI], [92, -13, Math.PI], [22, 52, 0], [62, 54, 0], [100, 50, 0]],
    houses: [[-15, -22, Math.PI], [-12, 60, 0], [130, 62, 0], [128, -24, Math.PI], [155, 66, 0], [-160, 120, Math.PI / 2], [-215, 185, -Math.PI / 2], [-140, 178, 0], [-235, 110, Math.PI]],
    warehouses: [[195, -90, Math.PI / 2], [205, -160, Math.PI / 2], [125, -205, 0]], gas: [-92, 105, -Math.PI / 2], barn: [-195, 150, Math.PI / 2],
    bunker: [-172, -158, Math.PI / 2], tower: [-205, -188], wreck: [160, 168, 0.4], tanks: [[248, -110], [252, -150], [238, -190]] };
  L.apartments.push([-20, 360, Math.PI], [30, 362, Math.PI], [60, 420, 0]); L.houses.push([-30, 420, 0], [90, 370, Math.PI / 2], [-70, 380, Math.PI / 2], [-420, 385, 0], [-315, 385, Math.PI], [330, 360, -Math.PI / 2]);
  L.warehouses.push([330, -300, 0], [380, -300, 0], [400, 300, Math.PI / 2]); L.tanks.push([340, 330], [360, 360], [385, 360], [410, 350], [400, 395], [430, -10]);
  L.bunkers = [[-350, -330, 0], [-330, -360, Math.PI / 2], [-375, -360, Math.PI]];
  for (const [x, z, y] of L.apartments) pad(x, z, 20, 18, y);
  for (const [x, z, y] of L.houses) pad(x, z, 14, 13, y);
  for (const [x, z, y] of L.warehouses) pad(x, z, 32, 22, y);
  pad(L.gas[0], L.gas[1], 34, 26, L.gas[2]); pad(L.barn[0] + 4, L.barn[1], 30, 18, L.barn[2]); pad(L.bunker[0], L.bunker[1], 16, 12, L.bunker[2]); pad(L.tower[0], L.tower[1], 12, 12);
  pad(L.wreck[0], L.wreck[1], 34, 30, L.wreck[2], -2.5);
  for (const [x, z] of L.tanks) pad(x, z, 16, 16);
  pad(225, -215, 50, 30, 0); // container yard
  for (const e of EXTRACTS) pad(e.pos[0], e.pos[1], 22, 22);
  for (const [x, z, y] of L.bunkers) pad(x, z, 16, 12, y);
  pad(380, -380, 30, 250, 0.9); pad(455, -370, 34, 30, 2.2, -1.5); pad(-350, -345, 80, 70, 0); pad(380, 330, 90, 80, 0); pad(-370, 330, 70, 60, 0); pad(410, -20, 70, 60, 0, 0); pad(25, 395, 30, 20, 0);
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
  const terrain = new Terrain({ size: MAP_SIZE, res: 384, heightFn: height, splatFn: splat });
  root.add(terrain.mesh);
  const W = { root, terrain, batch: new Batcher(), col: new CollisionWorld(terrain), loot: [], spawns: [], extracts: [], dropZones: DROP_ZONES, lights: [] };
  const H = (x, z) => terrain.height(x, z);
  // invisible boundary walls
  for (const [x, z, w, d] of [[0, -PLAY - 2, MAP_SIZE, 4], [0, PLAY + 2, MAP_SIZE, 4], [-PLAY - 2, 0, 4, MAP_SIZE], [PLAY + 2, 0, 4, MAP_SIZE]]) W.col.box(x, z, w, d, -50, 300, 0, 'concrete', { noRay: true });
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
  for (const [x, z, y] of L.bunkers) addLoot(P.bunker(W, x, padH(x, z), z, y, rand).loot);
  addLoot(P.gasStation(W, 25, padH(25, 395), 395, Math.PI, rand).loot);
  // airfield: runway with markings, control tower, wrecked transport near the threshold
  { const ry = padH(380, -380), M = P.worldMats(); const S2 = new P.Site(W, 380, ry, -380, 0.9); S2.box(24, 0.2, 240, M.asphalt, 0, -0.08, 0, 0, { ts: 8 });
    for (let i = 0; i < 20; i++) S2.part(boxGeo(0.6, 0.02, 6), M.linePaint, 0, 0.13, -110 + i * 11.5); for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) S2.part(boxGeo(1.4, 0.02, 20), M.linePaint, sx * (4 + i * 1.6), 0.13, -108);
    const tw = new P.Site(W, 320, padH(320, -350), -350, 0); tw.box(5, 14, 5, M.concrete, 0, 0, 0); tw.box(7, 0.4, 7, M.concreteDark, 0, 14, 0); tw.part(boxGeo(6.6, 2.4, 6.6), M.glass, 0, 15.6, 0); tw.box(7.2, 0.4, 7.2, M.white, 0, 16.8, 0); tw.part(cylGeo(0.06, 0.06, 4, 6), M.steel, 2, 19, 2); tw.part(new THREE.SphereGeometry(0.2, 8, 6), M.emRed, 2, 21, 2);
    addLoot(P.machineWreck(W, 455, padH(455, -370), -370, 2.2, rand).loot); }
  // FOB: guard towers, sandbag walls, HESCO-style barriers, open containers
  { const M = P.worldMats(); for (const [x, z] of [[-390, -380], [-310, -380], [-390, -300], [-310, -300]]) { const g = new P.Site(W, x, padH(x, z), z, 0); for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) g.box(0.25, 5, 0.25, M.woodDark, a, 0, b, 0, { m: 'wood' }); g.box(3.4, 0.25, 3.4, M.wood, 0, 5, 0, 0, { m: 'wood' }); for (let i = 0; i < 4; i++) g.box(3.4, 1.0, 0.3, M.sandbag, 0, 5.25, 0, 0, { noCol: false, m: 'dirt' }); g.part(boxGeo(3.8, 0.12, 3.8), M.corr, 0, 7.4, 0); g.ramp(1, 6, 0, 4.5, 0, 5.2, 0); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const x = -350 + Math.cos(a) * 52, z = -340 + Math.sin(a) * 52; P.barrier(W, x, H(x, z), z, a + Math.PI / 2, 'sandbags', rand); }
    for (let i = 0; i < 4; i++) addLoot(P.container(W, -365 + i * 8, padH(-350, -345), -315, 0, rand, i % 2 === 0).loot); }
  // mill & refinery & quarry clutter + loot
  for (let i = 0; i < 4; i++) addLoot(P.barn(W, -370 + (i % 2) * 40 - 20, padH(-370, 330), 310 + Math.floor(i / 2) * 35, 0, rand).loot);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) addLoot(P.container(W, 350 + i * 7.5, padH(380, 330), 300 + j * 9, 0, rand, (i + j) % 3 === 0).loot);
  for (let i = 0; i < 10; i++) { const x = 400 + (rand() - 0.5) * 50, z = -20 + (rand() - 0.5) * 40; W.loot.push({ type: rand() < 0.5 ? 'n_scrap' : 'toolbox', pos: new THREE.Vector3(x, H(x, z), z), yaw: rand() * 6 }); }
  for (let i = 0; i < 8; i++) { const x = -370 + (rand() - 0.5) * 60, z = 330 + (rand() - 0.5) * 50; W.loot.push({ type: 'n_wood', pos: new THREE.Vector3(x, H(x, z), z), yaw: rand() * 6 }); }
  for (let i = 0; i < 6; i++) { const x = 380 + (rand() - 0.5) * 70, z = 330 + (rand() - 0.5) * 60; W.loot.push({ type: rand() < 0.5 ? 'n_chem' : 'n_elec', pos: new THREE.Vector3(x, H(x, z), z), yaw: rand() * 6 }); }
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
  for (let i = 0; i < 6500 && treeSpots.length < 1200; i++) { const x = (rand() - 0.5) * 960, z = (rand() - 0.5) * 960; if (avoid(x, z, 4)) continue; const sl = 1 - terrain.normal(x, z).y; if (sl > 0.35) continue;
    const forest = noise.fbm(x / 80 + 3, z / 80, 3); if (forest < -0.02 && rand() > 0.12) continue; treeSpots.push({ x, z, y: H(x, z) }); }
  root.add(P.makeTrees(W, treeSpots, rand));
  const rockSpots = [];
  for (let i = 0; i < 2400 && rockSpots.length < 700; i++) { const x = (rand() - 0.5) * 1000, z = (rand() - 0.5) * 1000; if (avoid(x, z, 2)) continue; const d = Math.max(Math.abs(x), Math.abs(z)); const sl = 1 - terrain.normal(x, z).y; const quarry = Math.hypot(x - 410, z + 20) < 45; if (d < 380 && sl < 0.12 && !quarry && rand() < 0.75) continue; rockSpots.push({ x, z, y: H(x, z), s: d > 410 || quarry ? 2 + rand() * 4 : undefined }); }
  root.add(P.makeRocks(W, rockSpots, rand));
  root.add(terrain.grass(120000, rand, (x, z) => roadDist(x, z) < 5 || nearPad(pads, x, z, 0)));
  W.batch.build(root);
  // ---- enemy spawn plan (types per district; resolved by the game at raid start)
  const S = (type, x, z, n = 1, spread = 20, tier = 0) => { for (let i = 0; i < n; i++) { const px = x + (rand() - 0.5) * spread, pz = z + (rand() - 0.5) * spread; W.spawns.push({ type, pos: new THREE.Vector3(px, H(px, pz), pz), tier }); } };
  S('raider', 55, 20, 5, 70); S('drone', 60, 15, 3, 80); S('crawler', 70, 30, 2, 60); S('sentinel', 38, 3, 1, 1); S('sentinel', 82, 36, 1, 1);
  S('crawler', 190, -130, 4, 60); S('drone', 200, -150, 3, 70); S('raider', 150, -190, 3, 40); S('sentinel', 225, -200, 1, 1); S('sentinel', 178, -110, 1, 1);
  S('raider', -180, -160, 4, 30, 1); S('sentinel', -190, -175, 1, 1); S('sentinel', -160, -150, 1, 1); S('drone', -175, -160, 2, 40);
  S('strider', 150, 190, 1, 4); S('crawler', 165, 165, 3, 40); S('drone', 160, 170, 2, 40);
  S('raider', -180, 145, 3, 50); S('drone', -170, 150, 2, 60);
  S('raider', -85, 105, 2, 20); S('crawler', -70, 90, 1, 20);
  S('raider', 350, -320, 4, 60); S('drone', 360, -360, 3, 90); S('crawler', 400, -420, 2, 30); S('sentinel', 322, -350, 1, 1); S('strider', 390, -250, 1, 4);
  S('raider', -350, -340, 6, 60, 1); S('sentinel', -390, -380, 1, 1); S('sentinel', -310, -300, 1, 1); S('drone', -350, -340, 3, 70);
  S('raider', -370, 330, 3, 60); S('drone', -360, 320, 2, 80);
  S('crawler', 380, 330, 5, 60); S('drone', 380, 330, 3, 70); S('raider', 360, 300, 2, 30); S('sentinel', 360, 345, 1, 1);
  S('raider', 20, 390, 5, 70); S('drone', 20, 390, 2, 70); S('crawler', 410, -20, 4, 40);
  for (let i = 0; i < 10; i++) S('drone', (rand() - 0.5) * 860, (rand() - 0.5) * 860, 1, 1);
  W.tower = tower;
  return W;
}
function nearPad(pads, x, z, r) { for (const p of pads) { const dx = x - p.x, dz = z - p.z; const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c; if (Math.abs(lx) < p.hw + r && Math.abs(lz) < p.hd + r) return true; } return false; }
