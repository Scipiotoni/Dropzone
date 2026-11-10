// Seeded 2D Perlin gradient noise + fBm for terrain and placement.
export function makeNoise(seed = 1) {
  const p = new Uint8Array(512); const perm = [...Array(256).keys()];
  let s = seed >>> 0 || 1; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const n2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = g(p[a], x, y) + u * (g(p[b], x - 1, y) - g(p[a], x, y));
    const l2 = g(p[a + 1], x, y - 1) + u * (g(p[b + 1], x - 1, y - 1) - g(p[a + 1], x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.7;
  };
  n2.fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => { let a = 1, fr = 1, s2 = 0, n = 0; for (let o = 0; o < oct; o++) { s2 += n2(x * fr, y * fr) * a; n += a; a *= gain; fr *= lac; } return s2 / n; };
  n2.ridge = (x, y, oct = 4) => { let a = 1, fr = 1, s2 = 0, n = 0; for (let o = 0; o < oct; o++) { s2 += (1 - Math.abs(n2(x * fr, y * fr) * 1.4)) * a; n += a; a *= 0.5; fr *= 2; } return s2 / n; };
  return n2;
}
export function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
