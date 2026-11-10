// Detailed world architecture & props: ruined apartment blocks, warehouses, houses, gas station, shipping containers,
// wrecked cars, radio tower, machine wreck, barriers... All static parts are batched per material; colliders are boxes.
import * as THREE from 'three';
import { boxGeo, cylGeo, scaleUV } from './geom.js';
import { pbr, TEX } from './textures.js';

let MAT = null;
export function worldMats() {
  if (MAT) return MAT;
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2428, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55, envMapIntensity: 1.5 });
  const emRed = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  const emOrange = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
  const emCyan = new THREE.MeshBasicMaterial({ color: 0x40e0ff, toneMapped: false });
  const emWarm = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
  MAT = {
    concrete: pbr('concrete', { metal: 0 }), concreteDark: pbr('concrete', { metal: 0, color: 0x8a8680 }), plaster: pbr('concrete', { metal: 0, color: 0xd8c8b0 }),
    brick: pbr('brick', { metal: 0 }), corr: pbr('corrugated'), corrBlue: pbr('corrugated', { color: 0x8aa8c8 }), corrRed: pbr('corrugated', { color: 0xc89080 }),
    rust: pbr('rust'), red: pbr('paintRed'), blue: pbr('paintBlue'), yellow: pbr('paintYellow'), green: pbr('paintGreen'), white: pbr('paintWhite'), orange: pbr('paintOrange'),
    wood: pbr('woodPlank', { metal: 0 }), woodDark: pbr('woodPlank', { metal: 0, color: 0x8a7a6a }), asphalt: pbr('asphalt', { metal: 0 }), plate: pbr('metalPlate'), tile: pbr('tile', { metal: 0 }),
    machine: pbr('machine'), machineDark: pbr('machine', { color: 0x6a6660 }), rubber: pbr('rubber', { metal: 0 }), sandbag: pbr('sandbag', { metal: 0 }), steel: pbr('steel'),
    rock: pbr('rock', { metal: 0 }), bark: pbr('bark', { metal: 0 }), dirt: pbr('dirt', { metal: 0 }),
    roofTile: pbr('brick', { metal: 0, color: 0x7a5a4a }), linePaint: new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.7 }),
    glass, emRed, emOrange, emCyan, emWarm,
  };
  emRed.userData.noShadow = emOrange.userData.noShadow = emCyan.userData.noShadow = emWarm.userData.noShadow = glass.userData.noShadow = true;
  return MAT;
}

// A "site" places parts in a local frame (x,y,z origin, yaw) into the batcher + collision world.
export class Site {
  constructor(world, x, y, z, yaw = 0) { this.w = world; this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); }
  wx(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  part(geo, mat, lx, ly, lz, rx = 0, ry = 0, rz = 0) { this.w.batch.put(geo, mat, { x: this.x, y: this.y, z: this.z, yaw: this.yaw }, lx, ly, lz, rx, ry, rz); }
  // solid box with collider
  box(w, h, d, mat, lx, ly, lz, ry = 0, opts = {}) {
    this.part(boxGeo(w, h, d, opts.ts ?? 2), mat, lx, ly + h / 2, lz, 0, ry, 0);
    if (opts.noCol) return;
    const [x, z] = this.wx(lx, lz);
    this.w.col.box(x, z, w, d, this.y + ly, this.y + ly + h, this.yaw + ry, opts.m ?? matName(mat), opts.extra);
  }
  col(w, h, d, lx, ly, lz, ry = 0, m = 'concrete', extra) { const [x, z] = this.wx(lx, lz); return this.w.col.box(x, z, w, d, this.y + ly, this.y + ly + h, this.yaw + ry, m, extra); }
  ramp(w, d, lx, lz, h0, h1, ry = 0) { const [x, z] = this.wx(lx, lz); return this.w.col.add({ x, z, hw: w / 2, hd: d / 2, yaw: this.yaw + ry, y0: this.y + Math.min(h0, h1) - 0.2, y1: this.y + Math.max(h0, h1), ramp: { h0: this.y + h0, h1: this.y + h1 }, mat: 'metal' }); }
  world(lx, ly, lz) { const [x, z] = this.wx(lx, lz); return new THREE.Vector3(x, this.y + ly, z); }
}
function matName(m) { const M = worldMats(); if (m === M.wood || m === M.woodDark) return 'wood'; if ([M.corr, M.corrBlue, M.corrRed, M.rust, M.red, M.blue, M.yellow, M.green, M.white, M.orange, M.plate, M.steel, M.machine, M.machineDark].includes(m)) return 'metal'; if (m === M.sandbag) return 'dirt'; return 'concrete'; }

// wall with rectangular openings along local X; openings: [{x0, x1, y0, y1}] in wall-local coords (x from 0..len)
export function wallWithHoles(S, len, h, t, mat, lx, ly, lz, ry, holes = [], ts = 2) {
  // decompose into vertical strips between hole edges
  const xs = new Set([0, len]); for (const o of holes) { xs.add(o.x0); xs.add(o.x1); }
  const xsA = [...xs].sort((a, b) => a - b);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < xsA.length - 1; i++) {
    const a = xsA[i], b = xsA[i + 1], w = b - a; if (w < 0.01) continue;
    const mid = (a + b) / 2; const cover = holes.filter((o) => o.x0 <= a + 1e-3 && o.x1 >= b - 1e-3).sort((p, q) => p.y0 - q.y0);
    let y = 0; const spans = [];
    for (const o of cover) { if (o.y0 > y) spans.push([y, o.y0]); y = Math.max(y, o.y1); }
    if (y < h) spans.push([y, h]);
    for (const [y0, y1] of spans) {
      const px = lx + (mid - len / 2) * c, pz = lz - (mid - len / 2) * s;
      S.box(w, y1 - y0, t, mat, px, ly + y0, pz, ry, { ts });
    }
  }
}

// ---------------------------------------------------------------- buildings
export function apartment(W, x, y, z, yaw, rand, floors = 3) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  const L = 14, D = 10, FH = 3.2, T = 0.3, loot = [];
  // ground slab
  S.box(L + 0.6, 0.3, D + 0.6, M.concreteDark, 0, -0.1, 0);
  const ruinTop = rand() < 0.7;
  for (let f = 0; f < floors; f++) {
    const y0 = 0.2 + f * FH, last = f === floors - 1;
    const winH = (n) => { const holes = []; for (let i = 0; i < n; i++) { const cx = (i + 0.5) * (L / n); holes.push({ x0: cx - 0.7, x1: cx + 0.7, y0: 0.9, y1: 2.3 }); } return holes; };
    const frontHoles = winH(5); if (f === 0) { frontHoles[2] = { x0: L / 2 - 0.9, x1: L / 2 + 0.9, y0: 0, y1: 2.4 }; }
    const backHoles = winH(5); if (f === 0) backHoles[4] = { x0: L * 0.9 - 0.7 - 0.2, x1: L * 0.9 + 0.7 - 0.2, y0: 0, y1: 2.3 };
    const sideHoles = [{ x0: 2.2, x1: 3.6, y0: 0.9, y1: 2.3 }, { x0: 6.4, x1: 7.8, y0: 0.9, y1: 2.3 }];
    const wallH = last && ruinTop ? FH * 0.6 : FH;
    const mat = f === 0 ? M.concreteDark : M.plaster;
    wallWithHoles(S, L, wallH, T, mat, 0, y0, -D / 2, 0, frontHoles);
    wallWithHoles(S, L, wallH, T, mat, 0, y0, D / 2, Math.PI, backHoles);
    wallWithHoles(S, D - T, wallH, T, mat, -L / 2 + T / 2, y0, 0, -Math.PI / 2, sideHoles);
    if (!(last && ruinTop)) wallWithHoles(S, D - T, wallH, T, mat, L / 2 - T / 2, y0, 0, Math.PI / 2, sideHoles);
    else { S.box(T, FH * 0.3, D * 0.5, mat, L / 2 - T / 2, y0, -D / 4); }
    // window frames & sills, balconies, AC units (detail)
    for (const [i, h] of frontHoles.entries()) if (h.y0 > 0) {
      const cx = h.x0 + 0.7 - L / 2;
      S.part(boxGeo(1.6, 0.08, 0.45), M.concrete, cx, y0 + 0.86, -D / 2 - 0.05);
      S.part(boxGeo(1.56, 0.12, 0.34), M.concreteDark, cx, y0 + 2.36, -D / 2 - 0.02);
      for (const sx of [-1, 1]) S.part(boxGeo(0.08, 1.44, 0.1), M.concreteDark, cx + sx * 0.74, y0 + 1.6, -D / 2 - 0.05);
      if (f > 0 && (i + f) % 3 === 0 && !(last && ruinTop)) { S.part(boxGeo(2.2, 0.16, 1.1), M.concrete, cx, y0 - 0.02, -D / 2 - 0.55); S.part(boxGeo(2.2, 0.9, 0.05), M.rust, cx, y0 + 0.5, -D / 2 - 1.08); for (const sx of [-1, 1]) S.part(boxGeo(0.05, 0.9, 1.0), M.rust, cx + sx * 1.08, y0 + 0.5, -D / 2 - 0.58); }
      else if ((i * 7 + f) % 4 === 1) { S.part(boxGeo(0.8, 0.5, 0.45), M.white, cx + 0.3, y0 + 0.5, -D / 2 - 0.3); S.part(cylGeo(0.18, 0.18, 0.02, 12).rotateX(Math.PI / 2), M.steel, cx + 0.3, y0 + 0.5, -D / 2 - 0.53); }
    }
    if (f === 0) { S.part(boxGeo(3.6, 0.7, 0.12), [M.red, M.blue, M.yellow][Math.floor(rand() * 3)], L / 2 - 3.2, 2.9, -D / 2 - 0.12); S.part(boxGeo(3.0, 0.08, 1.2), M.steel, 0, 2.55, -D / 2 - 0.6); }
    for (const sx of [-1, 1]) S.part(cylGeo(0.07, 0.07, FH, 8), M.steel, sx * (L / 2 - 0.25), y0 + FH / 2, -D / 2 - 0.12);
    // interior partition wall with doorway
    wallWithHoles(S, D * 0.55, FH - 0.1, 0.15, M.plaster, 1.5, y0, -D / 2 + D * 0.275 + 0.15, Math.PI / 2, [{ x0: 2.0, x1: 3.0, y0: 0, y1: 2.2 }]);
    // floor slab above (with stairwell hole on the +x side)
    if (!last || !ruinTop) {
      const fy = y0 + FH - 0.2;
      S.box(L - 4, 0.25, D, M.concrete, -2, fy, 0);
      S.box(4, 0.25, D - 3, M.concrete, L / 2 - 2, fy, -1.5);
    } else { // collapsed roof chunk and exposed rebar
      S.box(L * 0.45, 0.25, D * 0.6, M.concrete, -L * 0.25, y0 + FH * 0.55, -D * 0.15, 0.04);
      for (let i = 0; i < 12; i++) S.part(cylGeo(0.012, 0.012, 0.6 + rand() * 1.2, 5), M.rust, -L / 2 + rand() * L, y0 + wallH + 0.3, (rand() < 0.5 ? -D / 2 : D / 2), (rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
    }
    // stairs up (ramp in the stairwell, along -z)
    if (!last || (!ruinTop && f < floors - 1)) {
      const sx = L / 2 - 2.0, h = FH;
      for (let i = 0; i < 14; i++) S.part(boxGeo(1.6, 0.18, 0.24), M.concrete, sx, y0 + (i + 0.5) * h / 14 - 0.09, D / 2 - 0.8 - i * 0.2);
      S.part(boxGeo(1.6, 0.2, 3.6, 2), M.concrete, sx, y0 + h / 2 - 0.25, D / 2 - 2.2, Math.atan2(h, 2.8), 0, 0);
      S.ramp(1.6, 2.8, sx, D / 2 - 2.2, y0 + 0.05, y0 + h - 0.12, Math.PI);
      S.box(0.06, 1.0, 2.8, M.rust, sx - 0.85, y0 + h / 2, D / 2 - 2.2, 0, { noCol: true });
    }
    // furniture & loot per floor
    loot.push({ type: rand() < 0.5 ? 'locker' : 'medbox', pos: S.world(-L / 2 + 1, y0, D / 2 - 1), yaw: yaw + Math.PI });
    if (rand() < 0.6) loot.push({ type: 'toolbox', pos: S.world(-3 + rand() * 3, y0, -D / 2 + 1.2), yaw: yaw + rand() * 6 });
    if (rand() < 0.4) loot.push({ type: 'n_fabric', pos: S.world(-L / 2 + 3.5, y0, 1), yaw });
    S.box(1.8, 0.75, 0.9, M.woodDark, -4, y0, 2.5, rand(), { m: 'wood' });  // table
    if (rand() < 0.5) S.box(2.0, 0.9, 0.9, M.green, -L / 2 + 1.2, y0, -1.5, Math.PI / 2, { m: 'wood' }); // couch
  }
  // rubble around the base
  for (let i = 0; i < 18; i++) { const s = 0.3 + rand() * 0.9; S.part(boxGeo(s, s * 0.6, s * 0.9), rand() < 0.7 ? M.concrete : M.brick, (rand() - 0.5) * (L + 4), s * 0.2, (rand() < 0.5 ? -1 : 1) * (D / 2 + 0.5 + rand() * 2), rand(), rand() * 3, rand()); }
  // roof parapet AC unit / water tank
  if (!ruinTop) { const ry = 0.2 + floors * FH; S.box(2, 1.2, 1.4, M.white, -3, ry, 0); S.box(1.2, 0.6, 1.2, M.plate, 3, ry, 2); }
  return { loot, footprint: [x, z, L + 6, D + 8, yaw] };
}

export function warehouse(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  const L = 26, D = 16, H = 7.5, loot = [];
  S.box(L + 1, 0.3, D + 1, M.concrete, 0, -0.1, 0);
  const wallMat = [M.corr, M.corrBlue, M.corrRed][Math.floor(rand() * 3)];
  const doorW = 6;
  // front with roller door opening (half-raised shutter), back with personnel door
  wallWithHoles(S, L, 1.2, 0.3, M.concreteDark, 0, 0.2, -D / 2, 0, [{ x0: L / 2 - doorW / 2, x1: L / 2 + doorW / 2, y0: 0, y1: 1.2 }]);
  wallWithHoles(S, L, H - 1.2, 0.12, wallMat, 0, 1.4, -D / 2, 0, [{ x0: L / 2 - doorW / 2, x1: L / 2 + doorW / 2, y0: 0, y1: 3.4 }, { x0: 3, x1: 6, y0: 3.6, y1: 4.4 }, { x0: L - 6, x1: L - 3, y0: 3.6, y1: 4.4 }], 2);
  S.box(doorW, 1.6, 0.15, M.orange, 0, 4.6, -D / 2 - 0.1, 0, { noCol: false }); // raised shutter
  wallWithHoles(S, L, 1.2, 0.3, M.concreteDark, 0, 0.2, D / 2, Math.PI, [{ x0: 4, x1: 5.2, y0: 0, y1: 1.2 }]);
  wallWithHoles(S, L, H - 1.2, 0.12, wallMat, 0, 1.4, D / 2, Math.PI, [{ x0: 4, x1: 5.2, y0: 0, y1: 0.9 }, { x0: 10, x1: 16, y0: 3.6, y1: 4.4 }]);
  for (const sx of [-1, 1]) {
    wallWithHoles(S, D, 1.2, 0.3, M.concreteDark, sx * L / 2, 0.2, 0, sx * Math.PI / 2, rand() < 0.5 ? [{ x0: 7, x1: 9, y0: 0, y1: 1.2 }] : []);
    wallWithHoles(S, D, H - 1.2, 0.12, wallMat, sx * L / 2, 1.4, 0, sx * Math.PI / 2, [{ x0: 7, x1: 9, y0: 0, y1: 1.0 }, { x0: 3, x1: 5, y0: 3, y1: 4 }]);
  }
  // steel portal frames (I-beams) and roof
  for (let i = 0; i <= 4; i++) { const px = -L / 2 + 0.3 + i * (L - 0.6) / 4;
    for (const sz of [-1, 1]) { S.box(0.25, H, 0.3, M.blue, px, 0.2, sz * (D / 2 - 0.4), 0, { m: 'metal' }); }
    S.part(boxGeo(0.2, 0.45, D), M.blue, px, H + 0.6, 0); }
  const roofAng = 0.12, half = D / 2 + 0.6, rl = half / Math.cos(roofAng);
  for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
    if (rand() < 0.22) continue; // collapsed panels let light in
    S.part(scaleUV(boxGeo(L / 4, 0.08, rl), 1, 1), wallMat, -L / 2 + L / 8 + i * L / 4, H + 0.2 + Math.sin(roofAng) * rl / 2 + 0.25, sz * rl / 2 * Math.cos(roofAng), sz * roofAng, 0, 0);
  }
  S.col(L, 0.4, D, 0, H + 0.4, 0, 0, 'metal');
  // interior: pallet racking with crates, forklift-ish, workbench
  for (const rz of [-3.5, 3.5]) {
    for (let i = 0; i < 3; i++) { const px = -8 + i * 6;
      for (const dx of [-2.4, 2.4]) for (const dz of [-0.5, 0.5]) S.part(boxGeo(0.1, 4.2, 0.1), M.orange, px + dx, 2.3, rz + dz);
      for (const ly of [0.25, 1.65, 3.05]) { S.part(boxGeo(4.9, 0.1, 1.15), M.orange, px, ly + 0.2, rz); S.part(boxGeo(4.8, 0.06, 1.1), M.wood, px, ly + 0.28, rz); if (rand() < 0.75) S.part(boxGeo(1.1 + rand() * 0.6, 0.8 + rand() * 0.4, 1.0), rand() < 0.5 ? M.wood : M.green, px + (rand() - 0.5) * 2.5, ly + 0.75, rz); }
      S.col(4.9, 4.2, 1.15, px, 0.2, rz, 0, 'metal');
    }
  }
  loot.push({ type: 'crate', pos: S.world(-10, 0.2, 0), yaw: yaw + 0.3 });
  loot.push({ type: 'toolbox', pos: S.world(9, 0.2, -5.5), yaw });
  loot.push({ type: rand() < 0.3 ? 'safe' : 'crate', pos: S.world(11, 0.2, 6), yaw: yaw + Math.PI });
  loot.push({ type: 'n_scrap', pos: S.world(3, 0.2, 0.5), yaw: rand() * 6 });
  if (rand() < 0.5) loot.push({ type: 'n_elec', pos: S.world(-L / 2 + 1, 0.2, -5), yaw: yaw + Math.PI / 2 });
  return { loot, footprint: [x, z, L + 6, D + 6, yaw] };
}

export function house(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  const L = 9, D = 7.5, H = 2.9, loot = [];
  const wm = rand() < 0.5 ? M.brick : M.plaster;
  S.box(L + 0.4, 0.35, D + 0.4, M.concreteDark, 0, -0.15, 0);
  wallWithHoles(S, L, H, 0.25, wm, 0, 0.2, -D / 2, 0, [{ x0: 1.4, x1: 2.6, y0: 0.9, y1: 2.1 }, { x0: 4.0, x1: 5.0, y0: 0, y1: 2.2 }, { x0: 6.4, x1: 7.6, y0: 0.9, y1: 2.1 }]);
  wallWithHoles(S, L, H, 0.25, wm, 0, 0.2, D / 2, Math.PI, [{ x0: 2, x1: 3.2, y0: 0.9, y1: 2.1 }, { x0: 6, x1: 7, y0: 0, y1: 2.2 }]);
  wallWithHoles(S, D - 0.25, H, 0.25, wm, -L / 2 + 0.125, 0.2, 0, -Math.PI / 2, [{ x0: 3, x1: 4.2, y0: 0.9, y1: 2.1 }]);
  wallWithHoles(S, D - 0.25, H, 0.25, wm, L / 2 - 0.125, 0.2, 0, Math.PI / 2, [{ x0: 3, x1: 4.2, y0: 0.9, y1: 2.1 }]);
  S.part(boxGeo(L - 0.5, 0.12, D - 0.5), M.wood, 0, 0.21, 0); // wooden floorboards
  // gable roof
  const pitch = 0.6, rw = D / 2 + 0.6, rlen = rw / Math.cos(pitch), top = H + 0.2 + Math.tan(pitch) * rw;
  const collapsed = rand() < 0.3;
  for (const sz of [-1, 1]) { if (collapsed && sz > 0) continue; S.part(boxGeo(L + 0.8, 0.12, rlen, 1.5), M.roofTile, 0, (H + 0.2 + top) / 2 - 0.1, sz * rw / 2, sz * pitch, 0, 0); }
  for (const sx of [-1, 1]) { const tri = new THREE.BufferGeometry(); const hw = D / 2, th = top - H - 0.2; tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hw, 0, 0, hw, 0, th, 0, 0, 0, hw, 0, 0, -hw, 0, th, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D / 2, 0, D / 4, th / 2, D / 2, 0, 0, 0, D / 4, th / 2], 2)); tri.computeVertexNormals(); S.part(tri, wm, sx * (L / 2 - 0.12), H + 0.2, 0); }
  S.col(L + 0.8, 0.4, D + 1, 0, H + 0.2, 0, 0, 'wood', { walk: true });
  S.box(0.9, 1.4, 0.7, M.brick, 2.5, top - 1, 0.6, 0, { noCol: true }); // chimney
  // interior
  S.box(1.6, 0.8, 0.8, M.woodDark, -2.5, 0.2, -1.5, 0, { m: 'wood' });
  S.box(0.6, 1.9, 1.2, M.woodDark, L / 2 - 0.6, 0.2, 2, 0, { m: 'wood' });
  loot.push({ type: rand() < 0.5 ? 'locker' : 'medbox', pos: S.world(-L / 2 + 0.7, 0.2, 2.5), yaw: yaw - Math.PI / 2 });
  if (rand() < 0.4) loot.push({ type: 'n_wood', pos: S.world(L / 2 + 1.5, 0, 1), yaw });
  // porch steps and fence
  S.box(1.6, 0.15, 0.8, M.concrete, 0, 0, -D / 2 - 0.5);
  return { loot, footprint: [x, z, L + 4, D + 4, yaw] };
}

export function gasStation(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw), loot = [];
  S.box(30, 0.2, 22, M.concrete, 0, -0.1, 0, 0, { ts: 4 });
  // canopy
  for (const [px, pz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) S.box(0.5, 5, 0.5, M.white, px, 0.1, pz, 0, { m: 'metal' });
  S.box(17, 0.9, 11, M.white, 0, 5.1, 0, 0, { m: 'metal' });
  S.part(boxGeo(17.1, 0.3, 11.1), M.red, 0, 5.55, 0);
  S.part(boxGeo(16.6, 0.04, 10.6), M.emWarm, 0, 5.08, 0);
  for (const px of [-3.5, 3.5]) { // pump islands
    S.box(1.2, 0.25, 5, M.concrete, px, 0.1, 0); for (const pz of [-1.3, 1.3]) { S.box(0.8, 1.7, 0.5, M.red, px, 0.35, pz, 0, { m: 'metal' }); S.part(boxGeo(0.6, 0.35, 0.02), M.glass, px, 1.6, pz - 0.26); S.part(boxGeo(0.06, 0.6, 0.06), M.rubber, px + 0.45, 1.2, pz); }
  }
  // shop
  const sx = 0, sz = 8.5;
  wallWithHoles(S, 12, 3.4, 0.25, M.brick, sx, 0.1, sz - 2.8, 0, [{ x0: 1, x1: 5, y0: 0.8, y1: 2.8 }, { x0: 5.6, x1: 7, y0: 0, y1: 2.4 }, { x0: 7.6, x1: 11, y0: 0.8, y1: 2.8 }]);
  S.part(boxGeo(4, 2, 0.03), M.glass, sx - 3, 1.9, sz - 2.8); // some intact windows
  wallWithHoles(S, 12, 3.4, 0.25, M.brick, sx, 0.1, sz + 2.8, Math.PI, []);
  wallWithHoles(S, 5.35, 3.4, 0.25, M.brick, sx - 6 + 0.125, 0.1, sz, -Math.PI / 2, []);
  wallWithHoles(S, 5.35, 3.4, 0.25, M.brick, sx + 6 - 0.125, 0.1, sz, Math.PI / 2, [{ x0: 2, x1: 3.2, y0: 0, y1: 2.2 }]);
  S.box(12.4, 0.3, 6, M.concreteDark, sx, 3.5, sz);
  for (let i = 0; i < 3; i++) S.box(3.5, 1.6, 0.6, M.white, sx - 3.5 + i * 3.5, 0.1, sz + 0.6, 0, { m: 'metal' }); // shelves
  S.box(2.5, 1.0, 0.8, M.woodDark, sx + 3.5, 0.1, sz - 1.6, 0, { m: 'wood' }); // counter
  loot.push({ type: 'medbox', pos: S.world(sx + 4.5, 0.1, sz + 2.2), yaw: yaw + Math.PI });
  loot.push({ type: 'toolbox', pos: S.world(sx - 4.5, 0.1, sz + 2.0), yaw: yaw + Math.PI });
  loot.push({ type: 'n_chem', pos: S.world(12, 0.1, 6), yaw: rand() * 6 });
  // sign pylon
  S.box(0.5, 9, 0.5, M.steel, -13, 0, -9, 0, { m: 'metal' }); S.part(boxGeo(3.4, 2.4, 0.4), M.red, -13, 8.6, -9); S.part(boxGeo(3.0, 0.5, 0.42), M.emOrange, -13, 9.3, -9);
  return { loot, footprint: [x, z, 32, 24, yaw] };
}

export function barn(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw), loot = [];
  const L = 16, D = 11, H = 4.5;
  S.box(L, 0.2, D, M.dirt, 0, -0.1, 0);
  const wm = M.red;
  wallWithHoles(S, L, H, 0.2, M.woodDark, 0, 0.1, -D / 2, 0, [{ x0: L / 2 - 2.2, x1: L / 2 + 2.2, y0: 0, y1: 3.6 }]);
  wallWithHoles(S, L, H, 0.2, M.woodDark, 0, 0.1, D / 2, Math.PI, [{ x0: 2, x1: 3.2, y0: 0, y1: 2.2 }]);
  for (const sx of [-1, 1]) wallWithHoles(S, D - 0.2, H, 0.2, M.woodDark, sx * (L / 2 - 0.1), 0.1, 0, sx * Math.PI / 2, [{ x0: 4.5, x1: 6, y0: 2.4, y1: 3.4 }]);
  const pitch = 0.75, rw = D / 2 + 0.5, rl = rw / Math.cos(pitch), top = H + 0.1 + Math.tan(pitch) * rw;
  for (const sz of [-1, 1]) S.part(boxGeo(L + 0.6, 0.1, rl, 2), M.corrRed, 0, (H + 0.1 + top) / 2, sz * rw / 2, sz * pitch, 0, 0);
  S.col(L, 0.3, D, 0, H + 0.1, 0, 0, 'metal');
  for (const sx of [-1, 1]) { const tri = new THREE.BufferGeometry(); const hw = D / 2, th = top - H - 0.1; tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hw, 0, 0, hw, 0, th, 0, 0, 0, hw, 0, 0, -hw, 0, th, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D / 2, 0, D / 4, th / 2, D / 2, 0, 0, 0, D / 4, th / 2], 2)); tri.computeVertexNormals(); S.part(tri, M.woodDark, sx * (L / 2 - 0.1), H + 0.1, 0); }
  // hay bales & tractor-ish wreck
  for (let i = 0; i < 6; i++) S.box(1.2, 0.8, 0.8, M.sandbag, -6 + (i % 3) * 1.3, 0.1 + Math.floor(i / 3) * 0.8, 3.5, 0, { m: 'dirt' });
  loot.push({ type: 'n_wood', pos: S.world(5, 0.1, 3), yaw }); loot.push({ type: 'toolbox', pos: S.world(6.5, 0.1, -3.5), yaw }); loot.push({ type: 'n_fabric', pos: S.world(-4, 0.1, -3), yaw });
  // grain silo next to it
  const sp = S.world(L / 2 + 4, 0, -2);
  W.batch.put(cylGeo(2.6, 2.6, 10, 20, 3), M.corr, null, sp.x, sp.y + 5, sp.z); W.batch.put(new THREE.ConeGeometry(2.8, 1.6, 20), M.corr, null, sp.x, sp.y + 10.8, sp.z);
  W.col.box(sp.x, sp.z, 4.4, 4.4, sp.y, sp.y + 11, 0, 'metal');
  return { loot, footprint: [x, z, L + 14, D + 6, yaw] };
}

export function container(W, x, y, z, yaw, rand, open = false) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  const L = 6.06, Wd = 2.44, H = 2.59, mats = [M.red, M.blue, M.green, M.orange, M.yellow, M.white], mat = mats[Math.floor(rand() * mats.length)];
  const loot = [];
  // corrugated side walls: base box plus vertical ribs
  const ribs = (len, ry, lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry); for (let i = 0; i < Math.floor(len / 0.28); i++) { const o = -len / 2 + 0.14 + i * 0.28; S.part(boxGeo(0.11, H - 0.3, 0.05), mat, lx + o * c, 1.3, lz - o * s, 0, ry, 0); } };
  if (!open) {
    S.box(L, H, Wd, mat, 0, 0, 0, 0, { m: 'metal' });
  } else {
    S.box(L, 0.15, Wd, M.plate, 0, 0, 0, 0, { m: 'metal' });
    S.box(L, 0.15, Wd, mat, 0, H - 0.15, 0, 0, { m: 'metal' });
    S.box(L, H - 0.3, 0.06, mat, 0, 0.15, -Wd / 2 + 0.03, 0, { m: 'metal' });
    S.box(L, H - 0.3, 0.06, mat, 0, 0.15, Wd / 2 - 0.03, 0, { m: 'metal' });
    S.box(0.06, H - 0.3, Wd, mat, -L / 2 + 0.03, 0.15, 0, 0, { m: 'metal' });
    // swung-open doors
    for (const sz of [-1, 1]) S.box(0.06, H - 0.1, Wd / 2, mat, L / 2 + Wd / 4, 0.05, sz * (Wd / 2 + 0.02), Math.PI / 2, { m: 'metal' });
    loot.push({ type: rand() < 0.2 ? 'weapons' : 'crate', pos: S.world(-L / 2 + 1.2, 0.15, 0), yaw: yaw + Math.PI / 2 });
  }
  ribs(L - 0.3, 0, 0, -Wd / 2 - 0.02); ribs(L - 0.3, 0, 0, Wd / 2 + 0.02);
  // corner castings & door locking bars
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) S.part(boxGeo(0.18, 0.12, 0.18), M.rust, sx * (L / 2 - 0.09), sy * (H - 0.12) + 0.06, sz * (Wd / 2 - 0.09));
  if (!open) for (let i = 0; i < 4; i++) S.part(cylGeo(0.025, 0.025, H - 0.3, 6), M.steel, L / 2 + 0.04, H / 2, -Wd / 2 + 0.35 + i * (Wd - 0.7) / 3);
  return { loot };
}

export function car(W, x, y, z, yaw, rand, kind = 'sedan') {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  const mats = [M.red, M.blue, M.white, M.green, M.yellow, M.rust], mat = rand() < 0.3 ? M.rust : mats[Math.floor(rand() * mats.length)];
  const loot = [];
  if (kind === 'sedan') {
    const L = 4.5, Wd = 1.8;
    S.part(boxGeo(L, 0.55, Wd, 1.5), mat, 0, 0.62, 0);
    S.part(boxGeo(L * 0.25, 0.12, Wd * 0.98, 1.5), mat, -L * 0.35, 0.94, 0, 0, 0, -0.08); // hood
    S.part(boxGeo(L * 0.48, 0.5, Wd * 0.9, 1.5), mat, 0.15, 1.12, 0);                 // cabin
    S.part(boxGeo(L * 0.46, 0.38, Wd * 0.92), M.glass, 0.15, 1.13, 0);
    S.part(boxGeo(0.05, 0.45, Wd * 0.85), M.glass, -0.95, 1.1, 0, 0, 0, -0.5);          // windscreen
    S.part(boxGeo(0.3, 0.12, Wd * 1.0), M.steel, -L / 2, 0.5, 0); S.part(boxGeo(0.3, 0.12, Wd * 1.0), M.steel, L / 2, 0.5, 0); // bumpers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const flat = rand() < 0.4;
      S.part(cylGeo(0.33, 0.33, 0.24, 14, 0.5).rotateX(Math.PI / 2), M.rubber, sx * L * 0.32, flat ? 0.22 : 0.33, sz * (Wd / 2 - 0.05));
      S.part(cylGeo(0.19, 0.19, 0.25, 10, 0.5).rotateX(Math.PI / 2), M.steel, sx * L * 0.32, flat ? 0.22 : 0.33, sz * (Wd / 2 - 0.04)); }
    for (const sz of [-1, 1]) { S.part(boxGeo(0.05, 0.12, 0.3), M.emWarm, -L / 2 - 0.01, 0.75, sz * 0.6); S.part(boxGeo(0.05, 0.1, 0.3), M.emRed, L / 2 + 0.01, 0.78, sz * 0.65); }
    S.col(L, 1.4, Wd, 0, 0, 0, 0, 'metal');
    if (rand() < 0.6) loot.push({ type: 'car', pos: S.world(L / 2 + 0.35, 0, 0), yaw: yaw - Math.PI / 2, attached: true });
  } else if (kind === 'truck') {
    const L = 7.5, Wd = 2.4;
    S.part(boxGeo(2.2, 2.2, Wd, 2), mat, -L / 2 + 1.1, 1.65, 0);
    S.part(boxGeo(0.05, 0.9, Wd * 0.85), M.glass, -L / 2 - 0.01, 2.1, 0);
    S.part(boxGeo(L - 2.3, 2.6, Wd + 0.1, 2), M.white, 1.15, 2.0, 0);
    S.part(boxGeo(L, 0.3, 1.0), M.steel, 0, 0.6, 0);
    for (const px of [-L / 2 + 1.1, 1.5, 2.8]) for (const sz of [-1, 1]) S.part(cylGeo(0.5, 0.5, 0.35, 14, 0.5).rotateX(Math.PI / 2), M.rubber, px, 0.5, sz * (Wd / 2 - 0.1));
    S.col(L, 3.3, Wd, 0, 0, 0, 0, 'metal');
    loot.push({ type: 'crate', pos: S.world(L / 2 + 0.5, 0, 0.5), yaw: yaw - Math.PI / 2 });
  } else if (kind === 'bus') {
    const L = 11, Wd = 2.5;
    S.part(boxGeo(L, 2.4, Wd, 2), M.yellow, 0, 1.75, 0);
    for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) S.part(boxGeo(1.1, 0.8, 0.04), M.glass, -L / 2 + 1.4 + i * 1.25, 2.3, sz * (Wd / 2 + 0.01));
    S.part(boxGeo(L + 0.02, 0.2, Wd + 0.02), M.rust, 0, 0.6, 0);
    for (const px of [-L / 2 + 2, L / 2 - 2.5]) for (const sz of [-1, 1]) S.part(cylGeo(0.5, 0.5, 0.35, 14, 0.5).rotateX(Math.PI / 2), M.rubber, px, 0.5, sz * (Wd / 2 - 0.1));
    S.col(L, 3, Wd, 0, 0, 0, 0, 'metal');
  }
  return { loot };
}

export function barrier(W, x, y, z, yaw, kind, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw);
  if (kind === 'jersey') {
    const sh = new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.28, 0.25), new THREE.Vector2(0.12, 0.45), new THREE.Vector2(0.1, 0.81), new THREE.Vector2(-0.1, 0.81), new THREE.Vector2(-0.12, 0.45), new THREE.Vector2(-0.28, 0.25)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5); scaleUV(g, 0.5);
    S.part(g, M.concrete, 0, 0, 0, 0, Math.PI / 2, 0); S.col(3, 0.81, 0.6, 0, 0, 0, 0, 'concrete');
  } else if (kind === 'sandbags') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) S.part(new THREE.CapsuleGeometry(0.17, 0.35, 2, 6).rotateZ(Math.PI / 2).scale(1, 0.7, 1.2), M.sandbag, -1.1 + i * 0.55 + (r % 2) * 0.27, 0.13 + r * 0.24, 0, 0, (rand() - 0.5) * 0.2, 0);
    S.col(2.8, 0.75, 0.6, 0, 0, 0, 0, 'dirt');
  } else if (kind === 'barrels') {
    const mats = [M.blue, M.red, M.yellow, M.rust];
    for (let i = 0; i < 3 + Math.floor(rand() * 3); i++) { const a = rand() * 6.28, r = rand() * 0.9, m = mats[Math.floor(rand() * 4)], tip = rand() < 0.15;
      S.part(cylGeo(0.3, 0.3, 0.88, 14, 1.2), m, Math.cos(a) * r, tip ? 0.3 : 0.44, Math.sin(a) * r, tip ? Math.PI / 2 : 0, rand() * 6, 0);
      for (const ry of [0.2, 0.68]) if (!tip) S.part(G_ring(), m, Math.cos(a) * r, ry, Math.sin(a) * r); }
    S.col(2, 0.9, 2, 0, 0, 0, 0, 'metal');
  } else if (kind === 'pallets') {
    for (let i = 0; i < 2 + Math.floor(rand() * 4); i++) S.part(boxGeo(1.2, 0.14, 1.0), M.wood, (rand() - 0.5) * 0.2, 0.07 + i * 0.15, (rand() - 0.5) * 0.2, 0, rand() * 0.3, 0);
    S.col(1.2, 0.8, 1.0, 0, 0, 0, 0, 'wood');
  } else if (kind === 'tires') {
    for (let i = 0; i < 5; i++) S.part(new THREE.TorusGeometry(0.33, 0.13, 8, 14).rotateX(Math.PI / 2), M.rubber, (rand() - 0.5) * 0.3, 0.13 + i * 0.25, (rand() - 0.5) * 0.3);
    S.col(0.9, 1.3, 0.9, 0, 0, 0, 0, 'dirt');
  } else if (kind === 'pole') {
    S.part(cylGeo(0.14, 0.1, 9, 8, 2), M.woodDark, 0, 4.5, 0); S.part(boxGeo(2.2, 0.12, 0.12), M.woodDark, 0, 8.4, 0);
    for (const sx of [-0.9, 0, 0.9]) S.part(cylGeo(0.05, 0.05, 0.18, 6), M.white, sx, 8.55, 0);
    S.col(0.3, 9, 0.3, 0, 0, 0, 0, 'wood');
  } else if (kind === 'lamp') {
    S.part(cylGeo(0.09, 0.07, 7, 8, 2), M.steel, 0, 3.5, 0); S.part(boxGeo(1.6, 0.08, 0.08), M.steel, 0.8, 7, 0); S.part(boxGeo(0.6, 0.12, 0.3), M.steel, 1.55, 6.95, 0);
    S.col(0.2, 7, 0.2, 0, 0, 0, 0, 'metal');
  }
}
let _ring = null; const G_ring = () => _ring || (_ring = new THREE.TorusGeometry(0.305, 0.015, 4, 18).rotateX(Math.PI / 2));

export function radioTower(W, x, y, z, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, 0);
  const H = 46, base = 3.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const g = cylGeo(0.12, 0.08, Math.hypot(H, base), 6, 2);
    const tilt = Math.atan2(base - 0.5, H);
    S.part(g, M.red, sx * (base + 0.5) / 2, H / 2, sz * (base + 0.5) / 2, -sz * tilt, 0, sx * tilt);
    S.col(0.5, 3, 0.5, sx * base, 0, sz * base, 0, 'metal');
  }
  // cross bracing
  for (let i = 0; i < 14; i++) { const y0 = i * H / 14, y1 = (i + 1) * H / 14, w0 = base - (base - 0.5) * (y0 / H), w1 = base - (base - 0.5) * (y1 / H);
    for (let f = 0; f < 4; f++) { const ry = f * Math.PI / 2; const len = Math.hypot(w0 + w1, y1 - y0); const m = i % 2 ? M.white : M.red;
      const c = Math.cos(ry), s = Math.sin(ry), mx = (w0 + w1) / 2;
      S.part(cylGeo(0.04, 0.04, len, 4, 1), m, -s * mx, (y0 + y1) / 2, -c * mx, 0, ry, Math.atan2(w0 + w1, y1 - y0) * (i % 2 ? 1 : -1));
      S.part(boxGeo(2 * w1, 0.06, 0.06), m, -s * w1, y1, -c * w1, 0, ry, 0); } }
  S.part(cylGeo(0.06, 0.04, 8, 6), M.steel, 0, H + 4, 0);
  for (const dy of [0, 4]) S.part(new THREE.SphereGeometry(0.22, 8, 6), M.emRed, 0, H + dy + 0.2, 0);
  for (let i = 0; i < 3; i++) S.part(cylGeo(0.6, 0.6, 0.25, 16).rotateX(Math.PI / 2), M.white, 0.6, H - 6 - i * 5, 0, 0, i * 2, 0); // dish antennas
  return { top: new THREE.Vector3(x, y + H + 4, z) };
}

export function bunker(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw), loot = [];
  const L = 10, D = 7, H = 3;
  S.box(L + 1, 0.3, D + 1, M.concreteDark, 0, -0.1, 0);
  wallWithHoles(S, L, H, 0.5, M.concrete, 0, 0.2, -D / 2, 0, [{ x0: 4.2, x1: 5.8, y0: 0, y1: 2.3 }, { x0: 1, x1: 3, y0: 1.5, y1: 1.9 }, { x0: 7, x1: 9, y0: 1.5, y1: 1.9 }]);
  wallWithHoles(S, L, H, 0.5, M.concrete, 0, 0.2, D / 2, Math.PI, [{ x0: 2, x1: 8, y0: 1.5, y1: 1.9 }]);
  for (const sx of [-1, 1]) wallWithHoles(S, D - 0.5, H, 0.5, M.concrete, sx * (L / 2 - 0.25), 0.2, 0, sx * Math.PI / 2, []);
  S.box(L + 0.6, 0.6, D + 0.6, M.concreteDark, 0, H + 0.2, 0);
  for (let i = 0; i < 6; i++) S.part(new THREE.CapsuleGeometry(0.17, 0.35, 2, 6).rotateZ(Math.PI / 2).scale(1, 0.7, 1.2), M.sandbag, -2 + i * 0.6, H + 0.95, -D / 2 + 0.2);
  S.part(boxGeo(1.2, 0.05, 0.8), M.white, 0, 2.6, 0); // ceiling lamp housing
  S.part(boxGeo(1.0, 0.02, 0.6), M.emWarm, 0, 2.57, 0);
  loot.push({ type: 'weapons', pos: S.world(-3, 0.2, 2), yaw: yaw + Math.PI });
  loot.push({ type: 'crate', pos: S.world(3, 0.2, 2.2), yaw: yaw + Math.PI });
  loot.push({ type: rand() < 0.5 ? 'safe' : 'medbox', pos: S.world(L / 2 - 1, 0.2, -1.5), yaw: yaw - Math.PI / 2 });
  return { loot, footprint: [x, z, L + 4, D + 4, yaw] };
}

// giant crashed machine (landmark)
export function machineWreck(W, x, y, z, yaw, rand) {
  const M = worldMats(), S = new Site(W, x, y, z, yaw), loot = [];
  // hull: tilted massive body
  S.part(boxGeo(14, 6, 9, 3), M.machine, 0, 3, 0, 0.12, 0, 0.18); S.col(14, 6.5, 9, 0, 0, 0, 0, 'metal');
  S.part(boxGeo(10, 2.5, 7, 3), M.machineDark, -1, 6.8, 0.6, 0.1, 0, 0.18);
  S.part(new THREE.SphereGeometry(2.4, 18, 12), M.machineDark, 7.5, 4.2, 0);   // sensor head
  S.part(new THREE.SphereGeometry(1.1, 16, 10), M.emRed, 9.2, 4.5, 0);
  // broken legs sprawled out
  for (const [lx, lz, ry, l] of [[-6, 6, 0.6, 14], [4, 7, -0.4, 12], [-8, -5, 2.4, 13], [5, -6.5, -2.2, 10]]) {
    const c = Math.cos(ry), s = Math.sin(ry);
    S.part(boxGeo(1.4, 1.4, l, 2), M.machine, lx + s * l / 2, 0.9, lz + c * l / 2, 0.05, ry, 0);
    S.part(cylGeo(1.0, 1.0, 1.8, 14).rotateZ(Math.PI / 2), M.machineDark, lx, 1.2, lz, 0, ry, 0);
    S.part(boxGeo(1.0, 3.5, 1.0, 2), M.machineDark, lx + s * l, 1.5, lz + c * l, 0.4, ry, 0);
    const [wx, wz] = S.wx(lx + s * l / 2, lz + c * l / 2); W.col.box(wx, wz, 1.4, l, y, y + 1.6, yaw + ry, 'metal');
  }
  // exposed cables and panels
  for (let i = 0; i < 20; i++) S.part(cylGeo(0.06, 0.06, 1 + rand() * 3, 5), rand() < 0.5 ? M.rubber : M.orange, (rand() - 0.5) * 12, 6 + rand() * 2, (rand() - 0.5) * 8, rand() * 2, rand() * 3, rand() * 2);
  for (let i = 0; i < 8; i++) S.part(boxGeo(1 + rand() * 2, 0.15, 1 + rand() * 2), M.machine, (rand() - 0.5) * 30, 0.1, (rand() - 0.5) * 30, rand() * 0.4, rand() * 3, rand() * 0.4);
  loot.push({ type: 'safe', pos: S.world(-2, 0, -6), yaw }, { type: 'n_elec', pos: S.world(3, 0, -6), yaw }, { type: 'n_scrap', pos: S.world(-9, 0, 2), yaw }, { type: 'n_elec', pos: S.world(9, 0, -4), yaw });
  return { loot, footprint: [x, z, 30, 26, yaw] };
}

export function tank(W, x, y, z, rand) { // industrial storage tank
  const M = worldMats(), S = new Site(W, x, y, z, 0), r = 4 + rand() * 2, h = 8 + rand() * 4;
  S.part(cylGeo(r, r, h, 28, 3), M.white, 0, h / 2, 0); S.part(cylGeo(r + 0.05, r + 0.05, 0.3, 28, 3), M.rust, 0, 0.15, 0);
  S.part(new THREE.SphereGeometry(r, 28, 8, 0, Math.PI * 2, 0, 0.5), M.white, 0, h - r * Math.cos(0.5) + 0.05, 0);
  // spiral stair rail
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 1.5; S.part(boxGeo(0.8, 0.08, 0.3), M.plate, Math.cos(a) * (r + 0.45), (i + 1) * h / 25, Math.sin(a) * (r + 0.45), 0, -a, 0); }
  W.col.box(x, z, r * 1.6, r * 1.6, y, y + h, 0, 'metal'); W.col.box(x, z, r * 1.6, r * 1.6, y, y + h, Math.PI / 4, 'metal');
}

export function fence(W, x0, z0, x1, z1, y0fn) {
  const M = worldMats(); const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / 3)); const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0fn(x, z); W.batch.put(cylGeo(0.04, 0.04, 2.2, 6), M.steel, null, x, y + 1.1, z);
    if (i < n) { const xm = x + (x1 - x0) / n / 2, zm = z + (z1 - z0) / n / 2, ym = y0fn(xm, zm); for (const h of [0.2, 2.1]) W.batch.put(cylGeo(0.025, 0.025, len / n, 5).rotateX(Math.PI / 2), M.steel, null, xm, ym + h, zm, 0, ang, 0);
      W.batch.put(scaleUV(new THREE.PlaneGeometry(len / n, 1.9), len / n * 2, 4), fenceMat(), null, xm, ym + 1.15, zm, 0, ang + Math.PI / 2, 0); } }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; W.col.box(cx, cz, 0.1, len, y0fn(cx, cz) - 1, y0fn(cx, cz) + 2.2, ang, 'metal', { noRay: true });
}
let _fm = null;
function fenceMat() { // chain-link: alpha-tested diamond wire pattern
  if (_fm) return _fm;
  const C = document.createElement('canvas'); C.width = C.height = 64; const x = C.getContext('2d'); x.strokeStyle = '#9a9a94'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
  const t = new THREE.CanvasTexture(C); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  _fm = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.5 }); _fm.userData.noShadow = true; return _fm;
}

// ---------------------------------------------------------------- nature
export function makeTrees(W, spots, rand) {
  const M = worldMats();
  const leafMat = new THREE.MeshStandardMaterial({ map: TEX.leaves.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0x9aa070 });
  leafMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(vNormal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.6));'); };
  const variants = [];
  for (let v = 0; v < 4; v++) {
    const dead = v === 3; const parts = { bark: [], leaf: [] };
    const h = 7 + v * 1.8;
    const trunk = cylGeo(0.32, 0.14, h, 8, 2); trunk.translate(0, h / 2, 0); parts.bark.push(trunk);
    const nb = dead ? 7 : 6;
    for (let i = 0; i < nb; i++) {
      const y = h * (0.35 + 0.6 * i / nb), a = i * 2.4 + v, len = (dead ? 2.2 : 1.8) * (1 - i / nb * 0.5);
      const br = cylGeo(0.08, 0.03, len, 5, 1); br.translate(0, len / 2, 0); br.rotateZ(-1.0); br.rotateY(a); br.translate(0, y, 0); parts.bark.push(br);
      if (!dead) { for (let k = 0; k < 3; k++) { const s = 2.2 + Math.random() * 1.2; const card = new THREE.PlaneGeometry(s, s); card.rotateX(-Math.PI / 2 + (k - 1) * 0.7); card.rotateY(a + k); card.translate(Math.cos(a) * len * 0.8, y + len * 0.5 + 0.3, -Math.sin(a) * len * 0.8); parts.leaf.push(card); } }
    }
    if (!dead) for (let k = 0; k < 5; k++) { const s = 3; const card = new THREE.PlaneGeometry(s, s); card.rotateY(k * 0.63); card.rotateX(0.3); card.translate(0, h + 0.3, 0); parts.leaf.push(card); }
    variants.push(parts);
  }
  const mergeG = (list) => { const P = [], N = [], U = [], I = []; let off = 0; for (const g0 of list) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); U.push(u.getX(i), u.getY(i)); } if (g.index) for (const k of g.index.array) I.push(k + off); off += p.count; } const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); r.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); r.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); r.setIndex(I); return r; };
  const groups = variants.map(() => []);
  for (const sp of spots) groups[Math.floor(rand() * variants.length)].push(sp);
  const out = new THREE.Group(); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  variants.forEach((v, i) => {
    const list = groups[i]; if (!list.length) return;
    for (const [key, mat] of [['bark', M.bark], ['leaf', leafMat]]) {
      if (!v[key].length) continue;
      const im = new THREE.InstancedMesh(mergeG(v[key]), mat, list.length);
      list.forEach((sp, k) => { const s = 0.8 + rand() * 0.5; m4.compose(new THREE.Vector3(sp.x, sp.y - 0.2, sp.z), q.setFromAxisAngle(up, rand() * 6.28), new THREE.Vector3(s, s, s)); im.setMatrixAt(k, m4); });
      im.castShadow = true; im.receiveShadow = true; out.add(im);
    }
    for (const sp of list) W.col.box(sp.x, sp.z, 0.5, 0.5, sp.y - 1, sp.y + 8, 0, 'wood');
  });
  return out;
}
export function makeRocks(W, spots, rand) {
  const M = worldMats(); const out = new THREE.Group();
  const geos = [];
  for (let v = 0; v < 3; v++) { const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position; const r2 = rand;
    const seeds = [r2() * 10, r2() * 10, r2() * 10];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.25 * Math.sin(x * 3 + seeds[0]) * Math.cos(z * 2.5 + seeds[1]) + 0.15 * Math.sin(y * 4 + seeds[2]); p.setXYZ(i, x * n * 1.3, y * n * 0.75, z * n); }
    g.computeVertexNormals(); scaleUV(g, 2); geos.push(g); }
  const groups = [[], [], []]; for (const s of spots) groups[Math.floor(rand() * 3)].push(s);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  groups.forEach((list, i) => { if (!list.length) return; const im = new THREE.InstancedMesh(geos[i], M.rock, list.length);
    list.forEach((sp, k) => { const s = sp.s ?? (0.6 + rand() * 2.2); m4.compose(new THREE.Vector3(sp.x, sp.y + s * 0.15, sp.z), q.setFromEuler(e.set(rand() * 0.3, rand() * 6, rand() * 0.3)), new THREE.Vector3(s, s, s)); im.setMatrixAt(k, m4); if (s > 0.9) W.col.box(sp.x, sp.z, s * 2.2, s * 1.7, sp.y - 1, sp.y + s * 0.85, 0, 'concrete'); });
    im.castShadow = true; im.receiveShadow = true; out.add(im); });
  return out;
}
