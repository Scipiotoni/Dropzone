// Procedural PBR texture library. Every surface in the world gets a tileable albedo + normal + roughness set
// generated at load time from layered periodic noise, so nothing needs to be downloaded.
import * as THREE from 'three';

// ---------- seeded random & tileable noise
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

class TileNoise {
  // value noise with integer period so textures tile seamlessly
  constructor(seed, period) {
    this.p = period; const r = rng(seed * 9973 + period);
    this.v = new Float32Array(period * period); for (let i = 0; i < this.v.length; i++) this.v[i] = r();
  }
  at(x, y) { // x,y in [0,1)
    const p = this.p, fx = x * p, fy = y * p;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = this.v;
    const a = v[y0 * p + x0] + (v[y0 * p + x1] - v[y0 * p + x0]) * sx;
    const b = v[y1 * p + x0] + (v[y1 * p + x1] - v[y1 * p + x0]) * sx;
    return a + (b - a) * sy;
  }
}
export function fbm(seed, base = 4, oct = 5, gain = 0.5) {
  const ns = []; for (let o = 0; o < oct; o++) ns.push(new TileNoise(seed + o * 131, base << o));
  return (x, y) => { let s = 0, a = 1, n = 0; for (const t of ns) { s += t.at(x, y) * a; n += a; a *= gain; } return s / n; };
}
// cellular (worley) tileable – for stones, gravel, rust pits
export function worley(seed, cells) {
  const r = rng(seed); const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + r()) / cells, (j + r()) / cells]);
  return (x, y) => {
    const ci = Math.floor(x * cells), cj = Math.floor(y * cells); let d1 = 9, d2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
      const p = pts[jj * cells + ii];
      let dx = p[0] - x, dy = p[1] - y;
      dx -= Math.round(dx); dy -= Math.round(dy);
      const d = Math.sqrt(dx * dx + dy * dy) * cells;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return [d1, d2];
  };
}
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- texture baking
let ANISO = 8;
export function setAniso(a) { ANISO = a; }
function dataTex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
/** sample(u,v) -> {h, c:[r,g,b], r(rough), m(metal)?, a(alpha)?}  */
export function bake(size, sample, normalStrength = 2) {
  const n = size * size;
  const H = new Float32Array(n), col = new Uint8Array(n * 4), rough = new Uint8Array(n * 4), nor = new Uint8Array(n * 4);
  let hasAlpha = false;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, s = sample(x / size, y / size);
    H[i] = s.h ?? 0;
    col[i * 4] = clamp(s.c[0]) * 255; col[i * 4 + 1] = clamp(s.c[1]) * 255; col[i * 4 + 2] = clamp(s.c[2]) * 255;
    col[i * 4 + 3] = s.a === undefined ? 255 : (hasAlpha = true, clamp(s.a) * 255);
    // roughness in G, metalness in B (three's convention for metalnessMap/roughnessMap)
    rough[i * 4] = 255; rough[i * 4 + 1] = clamp(s.r ?? 0.8) * 255; rough[i * 4 + 2] = clamp(s.m ?? 0) * 255; rough[i * 4 + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const l = H[y * size + (x - 1 + size) % size], r = H[y * size + (x + 1) % size];
    const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
    let nx = (l - r) * normalStrength * size / 256, ny = (u - d) * normalStrength * size / 256, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    nor[i * 4] = (nx * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nor[i * 4 + 3] = 255;
  }
  return { map: dataTex(col, size, true), normalMap: dataTex(nor, size, false), roughnessMap: dataTex(rough, size, false), hasAlpha };
}

// ---------- the library (lazily built & cached)
const LIB = {};
const def = (name, fn) => { Object.defineProperty(LIB, name, { get() { const v = fn(); Object.defineProperty(LIB, name, { value: v }); return v; }, configurable: true }); };
export const TEX = LIB;

def('grass', () => { const f = fbm(11, 4, 6), g = fbm(12, 32, 3), w = worley(13, 24), bl = fbm(14, 128, 3), bl2 = worley(15, 90);
  return bake(512, (u, v) => { const n = f(u, v), b = g(u, v), [d1] = w(u, v); const dry = smooth(0.45, 0.7, n);
    const [e1, e2] = bl2(u, v); const blade = smooth(0.35, 0.75, bl(u, v)) * 0.6 + smooth(0.0, 0.25, e2 - e1) * 0.4;
    let c = lerp3(hex(0x45552a), hex(0x8a8648), dry); c = lerp3(c, hex(0x3a3a24), smooth(0.2, 0.0, d1) * 0.5);
    c = c.map((k) => k * (0.72 + blade * 0.4 + b * 0.12));
    return { h: blade * 0.5 + b * 0.4 + n * 0.3, c, r: 0.94 - blade * 0.06 }; }, 1.4); });
def('dirt', () => { const f = fbm(21, 4, 6), w = worley(22, 18), g = fbm(23, 64, 2);
  return bake(512, (u, v) => { const n = f(u, v), [d1, d2] = w(u, v), peb = smooth(0.35, 0.15, d1) * smooth(0.5, 0.75, g(u, v));
    let c = lerp3(hex(0x5a4632), hex(0x8a7154), n); c = lerp3(c, hex(0x857a6a), peb * 0.5);
    c = c.map((k) => k * (0.85 + g(u, v) * 0.3));
    return { h: n * 0.6 + peb * 0.8 + (d2 - d1) * 0.1, c, r: 0.95 - peb * 0.2 }; }, 2.5); });
def('rock', () => { const f = fbm(31, 3, 7), cr = worley(32, 12), g = fbm(33, 48, 3), w2 = fbm(34, 6, 5);
  return bake(512, (u, v) => { const n = f(u, v), [d1, d2] = cr(u + w2(u, v) * 0.08, v + w2(v, u) * 0.08), crack = smooth(0.05, 0.0, d2 - d1) * smooth(0.35, 0.6, w2(u, v)), s = g(u, v);
    let c = lerp3(hex(0x5c5a55), hex(0x9c978c), n); c = lerp3(c, hex(0x6b5a44), smooth(0.55, 0.8, s) * 0.4); c = c.map((k) => k * (1 - crack * 0.4) * (0.85 + s * 0.25));
    const lich = smooth(0.62, 0.72, f(u * 0.5 + 0.3, v)); c = lerp3(c, hex(0x7a8050), lich * 0.35);
    return { h: n * 1.2 - crack * 0.6 + s * 0.2, c, r: 0.85 + crack * 0.1 }; }, 4); });
def('asphalt', () => { const f = fbm(41, 4, 5), w = worley(42, 40), cr = worley(43, 5), g = fbm(44, 128, 2);
  return bake(512, (u, v) => { const n = f(u, v), [d1] = w(u, v), [c1, c2] = cr(u, v), crack = smooth(0.035, 0.0, c2 - c1) * smooth(0.45, 0.6, n);
    const agg = smooth(0.3, 0.1, d1) * g(u, v); let c = hex(0x3a3a3a).map((k) => k * (0.75 + n * 0.45) + agg * 0.12);
    c = c.map((k) => k * (1 - crack * 0.7)); const patch = smooth(0.66, 0.7, f(u + 0.5, v)); c = lerp3(c, hex(0x222222), patch * 0.6);
    return { h: agg * 0.5 + n * 0.2 - crack * 0.8, c, r: 0.88 - patch * 0.15 + agg * 0.05 }; }, 3); });
def('concrete', () => { const f = fbm(51, 4, 7), p = worley(52, 30), st = fbm(53, 2, 4), g = fbm(54, 128, 2);
  return bake(512, (u, v) => { const n = f(u, v), [d1] = p(u, v), pore = smooth(0.12, 0.0, d1) * g(u, v);
    const stain = smooth(0.5, 0.85, st(u, v * 0.5)) * smooth(0, 1, v); // streaks running down
    let c = lerp3(hex(0x8e8b84), hex(0xb2aea4), n); c = lerp3(c, hex(0x5a554a), stain * 0.45); c = c.map((k) => k * (1 - pore * 0.35));
    const form = (Math.abs(((v * 4) % 1) - 0.5) < 0.006) ? 0.85 : 1; c = c.map((k) => k * form); // formwork seams
    return { h: n * 0.4 - pore * 0.6 + (form < 1 ? -0.4 : 0), c, r: 0.9 - stain * 0.1 }; }, 2.2); });
def('brick', () => { const f = fbm(61, 8, 5), g = fbm(62, 64, 2);
  return bake(512, (u, v) => { const rows = 16, row = Math.floor(v * rows), off = (row % 2) * 0.5, bu = u * 8 + off, col = Math.floor(bu);
    const fx = bu - col, fy = v * rows - row, mortar = (fx < 0.05 || fy < 0.09) ? 1 : 0; const id = (row * 13 + col * 7) % 11 / 11;
    let c = mortar ? hex(0x8a8478) : lerp3(hex(0x7a3a28), hex(0xa25a3c), id * 0.7 + f(u, v) * 0.3);
    c = c.map((k) => k * (0.85 + g(u, v) * 0.25)); const soot = smooth(0.55, 0.85, f(u * 0.5, v * 0.5)); c = lerp3(c, hex(0x2a2622), soot * 0.5);
    return { h: mortar ? 0 : 0.6 + g(u, v) * 0.3, c, r: mortar ? 0.95 : 0.85 }; }, 3); });
def('corrugated', () => { const f = fbm(71, 4, 6), rs = fbm(72, 16, 4), g = fbm(73, 96, 2);
  return bake(512, (u, v) => { const wave = Math.sin(u * Math.PI * 2 * 16), rust = smooth(0.6, 0.78, rs(u, v) + (1 - v) * 0.08) * 0.85;
    let c = lerp3(hex(0x8c9296), hex(0x6a7074), f(u, v)); c = lerp3(c, lerp3(hex(0x6a3418), hex(0xa0582a), g(u, v)), rust);
    return { h: wave * 0.9 + rust * g(u, v) * 0.3, c, r: lerp(0.45, 0.95, rust), m: lerp(0.85, 0.1, rust) }; }, 3); });
def('rust', () => { const f = fbm(81, 4, 7), w = worley(82, 24), g = fbm(83, 128, 2);
  return bake(512, (u, v) => { const n = f(u, v), [d1] = w(u, v), pit = smooth(0.2, 0.0, d1);
    let c = lerp3(hex(0x5a2a14), hex(0xb0602a), n); c = lerp3(c, hex(0x3a1a0c), pit * 0.6); c = c.map((k) => k * (0.85 + g(u, v) * 0.3));
    return { h: n * 0.6 - pit * 0.5 + g(u, v) * 0.3, c, r: 0.92, m: 0.2 }; }, 3); });
const painted = (base, seed) => () => { const f = fbm(seed, 4, 6), chip = fbm(seed + 1, 16, 4), rs = fbm(seed + 2, 24, 3), g = fbm(seed + 3, 96, 2), st = fbm(seed + 4, 3, 4);
  return bake(512, (u, v) => { const ch = smooth(0.66, 0.7, chip(u, v)), rust = smooth(0.5, 0.7, rs(u, v)) * ch, streak = smooth(0.55, 0.8, st(u * 3, v * 0.4)) * 0.35, dirt = smooth(0.55, 1, v) * 0.5 + streak;
    let c = hex(base).map((k) => k * (0.9 + f(u, v) * 0.16)); c = lerp3(c, hex(0x7a7874), ch); c = lerp3(c, hex(0x7a3c1c), rust); c = lerp3(c, hex(0x3a3228), dirt * 0.4);
    return { h: (1 - ch) * 0.2 + g(u, v) * 0.12 + rust * 0.15, c, r: lerp(0.5, 0.8, ch) + dirt * 0.15, m: ch * (1 - rust) * 0.8 }; }, 2); };
def('paintRed', painted(0x8a2a1e, 91)); def('paintBlue', painted(0x2a4a6a, 95)); def('paintYellow', painted(0xb8902a, 99));
def('paintGreen', painted(0x3e4a34, 103)); def('paintWhite', painted(0xb8b6ae, 107)); def('paintOrange', painted(0xb0581e, 111));
def('woodPlank', () => { const f = fbm(121, 2, 5), g = fbm(122, 64, 3);
  return bake(512, (u, v) => { const plank = Math.floor(u * 6), pu = u * 6 - plank, gap = pu < 0.03 ? 1 : 0, id = (plank * 37 % 7) / 7;
    const grain = Math.sin((v * 40 + f(u * 0.3 + id, v) * 8) * Math.PI) * 0.5 + 0.5;
    let c = lerp3(hex(0x6a4a2c), hex(0x9a7448), grain * 0.5 + id * 0.5); c = c.map((k) => k * (0.8 + g(u, v) * 0.3) * (gap ? 0.3 : 1));
    const weather = smooth(0.5, 0.8, f(u, v * 0.3)); c = lerp3(c, hex(0x7a7468), weather * 0.5);
    return { h: gap ? 0 : 0.5 + grain * 0.3, c, r: 0.8 }; }, 3); });
def('bark', () => { const f = fbm(131, 4, 6), g = fbm(132, 32, 3);
  return bake(512, (u, v) => { const ridge = Math.abs(Math.sin((u * 14 + f(u, v * 0.25) * 3) * Math.PI)); const n = g(u, v);
    let c = lerp3(hex(0x2a2018), hex(0x6a5a48), ridge * 0.7 + n * 0.3);
    return { h: ridge * 1.0 + n * 0.3, c, r: 0.95 }; }, 5); });
def('steel', () => { const f = fbm(141, 8, 5), g = fbm(142, 256, 2), wr = fbm(143, 16, 4); // parkerized gun steel
  return bake(512, (u, v) => { const n = g(u, v), wear = smooth(0.66, 0.78, wr(u, v));
    let c = lerp3(hex(0x2a2b2c), hex(0x3a3b3d), f(u, v)); c = c.map((k) => k * (0.85 + n * 0.3)); c = lerp3(c, hex(0x7a7c80), wear * 0.6);
    return { h: n * 0.4, c, r: lerp(0.5, 0.3, wear), m: lerp(0.65, 0.95, wear) }; }, 1.5); });
def('polymer', () => { const g = fbm(151, 256, 2), w = worley(152, 64), f = fbm(153, 8, 4);
  return bake(512, (u, v) => { const [d1] = w(u, v), stip = smooth(0.4, 0.1, d1); const n = g(u, v);
    const c = hex(0x1e1f20).map((k) => k * (0.9 + n * 0.25 + f(u, v) * 0.2));
    return { h: stip * 0.6 + n * 0.2, c, r: 0.75 - stip * 0.12, m: 0 }; }, 2.5); });
def('anodized', () => { const g = fbm(161, 256, 2), wr = fbm(162, 12, 5); // aluminium hard-anodized (rails, handguards)
  return bake(512, (u, v) => { const n = g(u, v), wear = smooth(0.7, 0.8, wr(u, v));
    let c = hex(0x232426).map((k) => k * (0.9 + n * 0.2)); c = lerp3(c, hex(0x9a9c9e), wear * 0.7);
    return { h: n * 0.2, c, r: lerp(0.45, 0.25, wear), m: lerp(0.5, 1, wear) }; }, 1); });
def('fde', () => { const g = fbm(171, 256, 2), wr = fbm(172, 12, 5), f = fbm(173, 6, 4); // flat dark earth cerakote
  return bake(512, (u, v) => { const n = g(u, v), wear = smooth(0.76, 0.84, wr(u, v));
    let c = hex(0x8a7556).map((k) => k * (0.88 + n * 0.15 + f(u, v) * 0.1)); c = lerp3(c, hex(0x4a4a48), wear * 0.55);
    return { h: n * 0.2, c, r: lerp(0.62, 0.4, wear), m: wear * 0.7 }; }, 1); });
def('woodStock', () => { const f = fbm(181, 2, 5), g = fbm(182, 128, 2);
  return bake(512, (u, v) => { const grain = Math.sin((u * 30 + f(u, v) * 6) * Math.PI) * 0.5 + 0.5;
    const c = lerp3(hex(0x4a2814), hex(0x7a4a24), grain).map((k) => k * (0.85 + g(u, v) * 0.2));
    return { h: grain * 0.2, c, r: 0.45 }; }, 1); });
def('fabric', () => { const g = fbm(191, 64, 2);
  return bake(256, (u, v) => { const wx = Math.sin(u * Math.PI * 2 * 64), wy = Math.sin(v * Math.PI * 2 * 64), weave = (wx * wy) * 0.5 + 0.5;
    const c = [0.8, 0.8, 0.8].map((k) => k * (0.88 + weave * 0.12 + g(u, v) * 0.1));
    return { h: weave * 0.5, c, r: 0.95 }; }, 2); });
def('camo', () => { const a = fbm(201, 3, 4), b = fbm(202, 4, 4), c3 = fbm(203, 5, 4), g = fbm(204, 64, 2);
  return bake(256, (u, v) => { const wx = Math.sin(u * Math.PI * 2 * 48) * Math.sin(v * Math.PI * 2 * 48) * 0.5 + 0.5;
    let c = hex(0x6e6a50); if (a(u, v) > 0.55) c = hex(0x4a4a34); if (b(u, v) > 0.6) c = hex(0x8a7a5a); if (c3(u, v) > 0.64) c = hex(0x2e2c24);
    c = c.map((k) => k * (0.88 + wx * 0.1 + g(u, v) * 0.1));
    return { h: wx * 0.4, c, r: 0.95 }; }, 2); });
def('sandbag', () => { const f = fbm(211, 6, 4), g = fbm(212, 96, 2);
  return bake(256, (u, v) => { const wx = Math.sin(u * Math.PI * 2 * 40) * Math.sin(v * Math.PI * 2 * 40) * 0.5 + 0.5;
    const c = lerp3(hex(0x8a7a58), hex(0xa89a72), f(u, v)).map((k) => k * (0.85 + wx * 0.15 + g(u, v) * 0.1));
    return { h: wx * 0.5 + f(u, v) * 0.5, c, r: 0.97 }; }, 2.5); });
def('rubber', () => { const g = fbm(221, 128, 2);
  return bake(256, (u, v) => { const tread = (Math.floor(u * 24) % 2 === 0) !== (Math.floor(v * 4) % 2 === 0) ? 1 : 0;
    return { h: tread * 0.8 + g(u, v) * 0.2, c: hex(0x1c1c1c).map((k) => k * (0.9 + g(u, v) * 0.3)), r: 0.9 }; }, 3); });
def('tile', () => { const g = fbm(231, 64, 3), f = fbm(232, 4, 5);
  return bake(512, (u, v) => { const gu = (u * 8) % 1, gv = (v * 8) % 1, grout = (gu < 0.04 || gv < 0.04) ? 1 : 0;
    const id = (Math.floor(u * 8) * 7 + Math.floor(v * 8) * 3) % 5 / 5; let c = grout ? hex(0x5a5850) : lerp3(hex(0x8a8a84), hex(0xa4a29a), id);
    c = c.map((k) => k * (0.85 + g(u, v) * 0.2)); c = lerp3(c, hex(0x4a4436), smooth(0.55, 0.85, f(u, v)) * 0.5);
    return { h: grout ? 0 : 0.5, c, r: grout ? 0.95 : 0.55 }; }, 3); });
def('metalPlate', () => { const g = fbm(241, 128, 2), f = fbm(242, 4, 5), rs = fbm(243, 8, 4); // diamond tread plate
  return bake(512, (u, v) => { const du = (u * 16) % 1, dv = (v * 16) % 1, odd = (Math.floor(u * 16) + Math.floor(v * 16)) % 2;
    const d = odd ? Math.abs(du - dv) : Math.abs(du + dv - 1), bump = smooth(0.12, 0.0, d) * smooth(0.1, 0.25, Math.min(du, dv, 1 - du, 1 - dv));
    const rust = smooth(0.58, 0.8, rs(u, v));
    let c = hex(0x6a6c6e).map((k) => k * (0.8 + g(u, v) * 0.3 + bump * 0.15)); c = lerp3(c, hex(0x7a4020), rust * 0.8);
    return { h: bump + g(u, v) * 0.1, c, r: lerp(0.4, 0.9, rust) - bump * 0.1, m: lerp(0.9, 0.2, rust) }; }, 2); });
def('machine', () => { const g = fbm(251, 128, 2), f = fbm(252, 8, 5), rs = fbm(253, 6, 5); // weathered industrial robot plating
  return bake(512, (u, v) => { const panel = ((u * 4) % 1 < 0.01 || (v * 4) % 1 < 0.01) ? 1 : 0, scuff = smooth(0.68, 0.78, f(u, v)), soot = smooth(0.55, 0.85, rs(u, v));
    let c = hex(0xb8b2a0).map((k) => k * (0.85 + g(u, v) * 0.2)); c = lerp3(c, hex(0x7a7a76), scuff * 0.5); c = lerp3(c, hex(0x2a2622), soot * 0.22 + panel * 0.6);
    return { h: -panel * 0.8 + g(u, v) * 0.15, c, r: lerp(0.5, 0.75, soot) - scuff * 0.1, m: lerp(0.4, 0.85, scuff) }; }, 2); });
// alpha-cutout foliage & grass cards
def('leaves', () => { const R = rng(261); const C = document.createElement('canvas'); C.width = C.height = 512; const x = C.getContext('2d');
  for (let i = 0; i < 420; i++) { const px = 40 + R() * 432, py = 40 + R() * 432, a = R() * Math.PI * 2, s = 10 + R() * 16, g = 70 + R() * 70;
    x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = `rgb(${g * 0.55 + R() * 30 | 0},${g | 0},${g * 0.35 | 0})`;
    x.beginPath(); x.ellipse(0, 0, s * 0.42, s, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(30,40,10,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -s); x.lineTo(0, s); x.stroke(); x.restore(); }
  bleed(C, [70, 92, 40]); const t = new THREE.CanvasTexture(C); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; return { map: t }; });
def('grassCard', () => { const R = rng(271); const C = document.createElement('canvas'); C.width = 256; C.height = 256; const x = C.getContext('2d');
  for (let i = 0; i < 70; i++) { const bx = 10 + R() * 236, h = 120 + R() * 130, lean = (R() - 0.5) * 60, w = 3 + R() * 4, dry = R();
    const grd = x.createLinearGradient(0, 256, 0, 256 - h); grd.addColorStop(0, '#2e3a18'); grd.addColorStop(1, dry > 0.6 ? '#b0a060' : '#7a8a3c');
    x.fillStyle = grd; x.beginPath(); x.moveTo(bx - w, 256); x.quadraticCurveTo(bx + lean * 0.3, 256 - h * 0.6, bx + lean, 256 - h); x.quadraticCurveTo(bx + lean * 0.3 + w * 0.3, 256 - h * 0.6, bx + w, 256); x.fill(); }
  bleed(C, [92, 104, 50]); const t = new THREE.CanvasTexture(C); t.colorSpace = THREE.SRGBColorSpace; return { map: t }; });

function bleed(C, rgb) { const x = C.getContext('2d'); const d = x.getImageData(0, 0, C.width, C.height); const a = d.data; for (let i = 0; i < a.length; i += 4) if (a[i + 3] < 8) { a[i] = rgb[0]; a[i + 1] = rgb[1]; a[i + 2] = rgb[2]; a[i + 3] = 1; } x.putImageData(d, 0, 0); }
// Material helper with caching. repeat applies to all maps of that set.
const matCache = new Map();
export function pbr(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const t = LIB[name];
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap,
    roughness: 1, metalness: opts.metal ?? 1, color: opts.color ?? 0xffffff, side: opts.side ?? THREE.FrontSide });
  if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  matCache.set(key, m);
  return m;
}
