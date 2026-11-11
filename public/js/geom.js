// Geometry helpers, a static mesh batcher (merges everything per material) and the collision world
// (yaw-rotated boxes + ramps in a spatial hash, ray casts, capsule movement).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- geometry with world-scaled UVs (so textures keep a constant texel density)
export function boxGeo(w, h, d, ts = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / ts, uv.getY(i) * dims[f][1] / ts); }
  return g;
}
export function cylGeo(r0, r1, h, seg = 12, ts = 2, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
  const uv = g.attributes.uv; const circ = Math.PI * (r0 + r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / ts, uv.getY(i) * h / ts);
  return g;
}
export function scaleUV(g, su, sv = su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function xform(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}
// strip attributes so heterogeneous geometries can be merged
export function normalizeGeo(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}

// ---------- static batcher
export class Batcher {
  // parts are bucketed spatially (CELL_B metres) and per material, so every merged mesh has a tight bounding sphere:
  // frustum culling and the distance LOD can then skip whole city blocks instead of drawing the entire map.
  constructor(cell = 128) { this.parts = new Map(); this.cell = cell; }
  add(geo, mat, matrix) {
    const g = normalizeGeo(matrix ? geo.clone().applyMatrix4(matrix) : geo);
    g.computeBoundingBox(); const c = g.boundingBox.getCenter(_p);
    const key = Math.floor(c.x / this.cell) + ',' + Math.floor(c.z / this.cell);
    let byMat = this.parts.get(mat); if (!byMat) this.parts.set(mat, byMat = new Map());
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(g);
  }
  // place a geometry with a parent transform (pos, yaw) plus local transform
  put(geo, mat, parent, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone(); xform(g, lx, ly, lz, rx, ry, rz);
    if (parent) { _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), parent.yaw || 0); _m.compose(_p.set(parent.x, parent.y || 0, parent.z), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); }
    this.add(g, mat);
  }
  build(group, { cast = true, receive = true } = {}) {
    for (const [mat, cells] of this.parts) for (const list of cells.values()) {
      for (let i = 0; i < list.length; i += 600) {
        const merged = mergeGeometries(list.slice(i, i + 600), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast && !mat.userData.noShadow; mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.userData.lod = mat.userData.lodKind || 'static';
        group.add(mesh);
      }
      for (const g of list) g.dispose();
    }
    this.parts.clear();
  }
}

// split one map-wide InstancedMesh into per-cell InstancedMeshes (tagged for the distance LOD)
export function splitInstances(im, kind, cell = 96) {
  const out = new THREE.Group(); const cells = new Map(); const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(m.clone()); }
  for (const list of cells.values()) {
    const n = new THREE.InstancedMesh(im.geometry, im.material, list.length); list.forEach((mm, i) => n.setMatrixAt(i, mm));
    n.castShadow = im.castShadow; n.receiveShadow = im.receiveShadow; n.computeBoundingSphere(); n.userData.lod = kind; out.add(n);
  }
  return out;
}
// every Object3D an owner object refers to (its own fields, arrays and plain objects one level down): these must
// survive mergeRigid because code animates them or swaps their materials.
export function collectRefs(owner, out = new Set(), depth = 0) {
  if (!owner || depth > 2) return out;
  for (const v of Object.values(owner)) {
    if (!v || typeof v !== 'object') continue;
    if (v.isObject3D) { out.add(v); if (depth < 2 && v.userData) collectRefs(v.userData, out, depth + 1); }
    else if (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) collectRefs(v, out, depth + 1);
  }
  return out;
}
// Groups nobody references are static relative to their parent: bake their leaf meshes into the parent so that
// mergeRigid can fold them together (a drone's four arms + nacelle shells become one mesh per material).
export function hoistStatic(root, protect = new Set()) {
  const depth = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const groups = []; root.traverse((o) => { if (o !== root && !o.isMesh && !o.isSprite && !o.isLight && !protect.has(o) && o.children.length) groups.push(o); });
  groups.sort((a, b) => depth(b) - depth(a));
  const m = new THREE.Matrix4();
  for (const g of groups) {
    const parent = g.parent; if (!parent) continue;
    const sc = g.scale; if (Math.abs(sc.x - sc.y) > 1e-6 || Math.abs(sc.x - sc.z) > 1e-6) continue; // keep shear-free
    g.updateMatrix();
    for (const c of [...g.children]) {
      if (!c.isMesh || protect.has(c) || c.children.length) continue;
      c.updateMatrix(); m.multiplyMatrices(g.matrix, c.matrix); g.remove(c); m.decompose(c.position, c.quaternion, c.scale); parent.add(c);
    }
    if (!g.children.length) parent.remove(g);
  }
  return root;
}
// Merge every node's rigid leaf meshes (same parent, same material, not referenced from code) into one mesh per
// material. Characters, guns, vehicles and machines drop from 100-180 draw calls to a few dozen.
export function mergeRigid(root, protect = new Set()) {
  const nodes = []; root.traverse((n) => nodes.push(n));
  const m = new THREE.Matrix4();
  for (const n of nodes) {
    if (n.isMesh) continue;
    const groups = new Map();
    for (const c of n.children) {
      if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || protect.has(c) || !c.visible || c.userData.keep || Array.isArray(c.material) || c.material.transparent) continue;
      const k = c.material.uuid + (c.castShadow ? 's' : '') + (c.receiveShadow ? 'r' : '') + c.renderOrder;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((c) => { c.updateMatrix(); m.copy(c.matrix); return normalizeGeo(c.geometry.clone().applyMatrix4(m)); });
      const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, list[0].material); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder;
      for (const c of list) n.remove(c);
      n.add(mesh);
    }
  }
  return root;
}

// ---------- collision world
// collider: {x, z, hw, hd, yaw, y0, y1, ramp?: {axis:'z', h0, h1}, mat, solid=true, walk=true, owner?}
const CELL = 8;
export class CollisionWorld {
  constructor(terrain) { this.terrain = terrain; this.grid = new Map(); this.all = new Set(); this.dynamic = new Set(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(c) {
    c.cos = Math.cos(c.yaw || 0); c.sin = Math.sin(c.yaw || 0); c.solid ??= true;
    const r = Math.hypot(c.hw, c.hd); c.r = r;
    c.cells = [];
    for (let i = Math.floor((c.x - r) / CELL); i <= Math.floor((c.x + r) / CELL); i++)
      for (let j = Math.floor((c.z - r) / CELL); j <= Math.floor((c.z + r) / CELL); j++) {
        const k = this.key(i, j); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c); c.cells.push(k);
      }
    this.all.add(c);
    return c;
  }
  remove(c) { for (const k of c.cells || []) { const a = this.grid.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } } this.all.delete(c); }
  box(x, z, w, d, y0, y1, yaw = 0, mat = 'concrete', extra = {}) { return this.add({ x, z, hw: w / 2, hd: d / 2, yaw, y0, y1, mat, ...extra }); }
  near(x, z, r, out = []) {
    out.length = 0; const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const a = this.grid.get(this.key(i, j)); if (!a) continue;
        for (const c of a) if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    return out;
  }
  toLocal(c, x, z) { const dx = x - c.x, dz = z - c.z; return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos]; }
  toWorldDir(c, lx, lz) { return [lx * c.cos + lz * c.sin, -lx * c.sin + lz * c.cos]; }
  topAt(c, lx, lz) { if (!c.ramp) return c.y1; const t = THREE.MathUtils.clamp((lz + c.hd) / (2 * c.hd), 0, 1); return c.ramp.h0 + (c.ramp.h1 - c.ramp.h0) * t; }

  // highest walkable surface under (x,z) that is not above maxY
  groundAt(x, z, maxY, rad = 0.25) {
    let g = this.terrain ? this.terrain.height(x, z) : 0; let hit = null;
    for (const c of this.near(x, z, rad + 1, this._n1 || (this._n1 = []))) {
      if (c.walk === false) continue;
      const [lx, lz] = this.toLocal(c, x, z);
      if (Math.abs(lx) > c.hw + rad * 0.5 || Math.abs(lz) > c.hd + rad * 0.5) continue;
      const top = this.topAt(c, THREE.MathUtils.clamp(lx, -c.hw, c.hw), THREE.MathUtils.clamp(lz, -c.hd, c.hd));
      if (top <= maxY && top > g) { g = top; hit = c; }
    }
    return { y: g, c: hit };
  }
  // ceiling: lowest collider bottom above y
  ceilingAt(x, z, y, rad = 0.3) {
    let best = Infinity;
    for (const c of this.near(x, z, rad + 1, this._n3 || (this._n3 = []))) {
      if (c.ramp || !c.solid) continue; const [lx, lz] = this.toLocal(c, x, z);
      if (Math.abs(lx) > c.hw + rad * 0.3 || Math.abs(lz) > c.hd + rad * 0.3) continue;
      if (c.y0 >= y && c.y0 < best) best = c.y0;
    }
    return best;
  }
  // push a vertical cylinder out of boxes. Returns adjusted [x,z] and whether blocked.
  resolve(x, z, rad, yFeet, height, step = 0.45) {
    let blocked = false;
    for (let it = 0; it < 3; it++) {
      for (const c of this.near(x, z, rad + 1, this._n2 || (this._n2 = []))) {
        if (!c.solid || c.ramp) continue;
        if (c.y1 <= yFeet + step || c.y0 >= yFeet + height) continue;
        const [lx, lz] = this.toLocal(c, x, z);
        const cx = THREE.MathUtils.clamp(lx, -c.hw, c.hw), cz = THREE.MathUtils.clamp(lz, -c.hd, c.hd);
        let dx = lx - cx, dz = lz - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        let nx, nz, pen;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = rad - d; }
        else { // centre inside: push out along the shallowest axis
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + rad; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + rad; }
        }
        const [wx, wz] = this.toWorldDir(c, nx, nz); x += wx * pen; z += wz * pen; blocked = true;
      }
    }
    return [x, z, blocked];
  }
  // ray vs everything static. returns {t, point, normal, c} or null
  ray(o, d, maxT, opts = {}) {
    let best = maxT, hitC = null, hitN = null;
    const steps = Math.ceil(maxT / CELL) + 1; const visited = this._vis || (this._vis = new Set()); visited.clear();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(s * CELL, maxT); if (t > best + CELL) break;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      for (const c of this.near(px, pz, CELL * 0.75, this._n4 || (this._n4 = []))) {
        if (visited.has(c) || (opts.skipNonSolid && !c.solid) || c.noRay) continue; visited.add(c);
        const r = this.rayBox(c, o, d, best);
        if (r && r.t < best) { best = r.t; hitC = c; hitN = r.n; }
      }
    }
    let terrainT = this.terrain && !opts.noTerrain ? this.terrain.ray(o, d, best) : null;
    if (terrainT !== null && terrainT < best) return { t: terrainT, point: o.clone().addScaledVector(d, terrainT), normal: this.terrain.normal(o.x + d.x * terrainT, o.z + d.z * terrainT), c: null, mat: 'dirt' };
    if (hitC) return { t: best, point: o.clone().addScaledVector(d, best), normal: hitN, c: hitC, mat: hitC.mat };
    return null;
  }
  rayBox(c, o, d, maxT) {
    const [lox, loz] = this.toLocal(c, o.x, o.z);
    const ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
    const y1 = c.ramp ? (c.ramp.h0 + c.ramp.h1) / 2 : c.y1;
    const mn = [-c.hw, c.y0, -c.hd], mx = [c.hw, y1, c.hd], or = [lox, o.y, loz], dr = [ldx, d.y, ldz];
    let t0 = 0, t1 = maxT, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dr[a]) < 1e-9) { if (or[a] < mn[a] || or[a] > mx[a]) return null; continue; }
      let ta = (mn[a] - or[a]) / dr[a], tb = (mx[a] - or[a]) / dr[a], s = -1;
      if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
      if (ta > t0) { t0 = ta; ax = a; sg = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    if (ax < 0) return null; // origin inside
    let n;
    if (ax === 1) n = new THREE.Vector3(0, sg, 0);
    else { const lx = ax === 0 ? sg : 0, lz = ax === 2 ? sg : 0; const [wx, wz] = this.toWorldDir(c, lx, lz); n = new THREE.Vector3(wx, 0, wz); }
    return { t: t0, n };
  }
  // line of sight test
  clear(a, b) { const d = b.clone().sub(a); const L = d.length(); d.divideScalar(L); return !this.ray(a, d, L - 0.3, { skipNonSolid: true }); }
}
