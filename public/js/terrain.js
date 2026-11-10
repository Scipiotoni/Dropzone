// Heightfield terrain with a 4-layer PBR splat shader (grass / dirt / rock / asphalt) and wind-animated grass.
import * as THREE from 'three';
import { TEX, POM } from './textures.js';

export class Terrain {
  /** heightFn(x,z) -> y ; splatFn(x,z,y,slope) -> [grass, dirt, rock, asphalt] */
  constructor({ size, res, heightFn, splatFn }) {
    this.size = size; this.res = res; this.half = size / 2; this.fn = heightFn;
    // cache heights on a grid for fast bilinear queries
    const n = res + 1; this.n = n; this.step = size / res;
    this.h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.h[j * n + i] = heightFn(-this.half + i * this.step, -this.half + j * this.step);
    const g = new THREE.PlaneGeometry(size, size, res, res); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position; const splat = new Float32Array(pos.count * 4);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
      pos.setY(k, this.h[j * n + i]);
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const s = splatFn(pos.getX(k), pos.getZ(k), pos.getY(k), 1 - nor.getY(k));
      const sum = s[0] + s[1] + s[2] + s[3] || 1; for (let c = 0; c < 4; c++) splat[k * 4 + c] = s[c] / sum;
    }
    g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, makeSplatMaterial());
    this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    this.splatAt = (x, z) => { const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step); const k = (THREE.MathUtils.clamp(j, 0, res)) * n + THREE.MathUtils.clamp(i, 0, res); return [splat[k * 4], splat[k * 4 + 1], splat[k * 4 + 2], splat[k * 4 + 3]]; };
  }
  height(x, z) {
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const i = Math.max(0, Math.min(this.res - 1, Math.floor(fx))), j = Math.max(0, Math.min(this.res - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), n = this.n, H = this.h;
    // match the triangulation of PlaneGeometry (diagonal from (i,j+1) to (i+1,j))
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  normal(x, z) { const e = 0.5; return new THREE.Vector3(this.height(x - e, z) - this.height(x + e, z), 2 * e, this.height(x, z - e) - this.height(x, z + e)).normalize(); }
  ray(o, d, maxT) {
    let t = 0, prev = 0; const step = 0.75;
    if (o.y - this.height(o.x, o.z) < 0) return 0;
    while (t < maxT) {
      t = Math.min(maxT, t + step);
      const y = o.y + d.y * t, h = this.height(o.x + d.x * t, o.z + d.z * t);
      if (y < h) { let a = prev, b = t; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (o.y + d.y * m < this.height(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } return b; }
      prev = t; if (t >= maxT) break;
    }
    return null;
  }
  // instanced grass clumps, placed by the grass splat weight
  grass(count, rand, avoid = () => false) {
    const card = new THREE.PlaneGeometry(1.1, 0.7, 1, 2); card.translate(0, 0.35, 0);
    const c2 = card.clone().rotateY(Math.PI / 3), c3 = card.clone().rotateY(-Math.PI / 3);
    const geo = new THREE.BufferGeometry();
    const merge = [card, c2, c3]; const P = [], N = [], U = [];
    for (const g of merge) { P.push(...g.attributes.position.array); U.push(...g.attributes.uv.array); for (let i = 0; i < g.attributes.position.count; i++) N.push(0, 1, 0); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const idx = []; for (let g = 0; g < 3; g++) { const o = g * 6; idx.push(o, o + 2, o + 1, o + 2, o + 3, o + 1, o + 2, o + 4, o + 3, o + 4, o + 5, o + 3); } geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ map: TEX.grassCard.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.grassTime = { value: 0 };
      sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float sway = (sin(time * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.6 + sin(time * 3.1 + wp.x * 0.9) * 0.25) * transformed.y * 0.22;
        transformed.x += sway; transformed.z += sway * 0.6;`);
      // cards are lit as if they were the ground (no back-face normal flip, which turned them black)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let k = 0, tries = 0;
    while (k < count && tries++ < count * 8) {
      const x = (rand() - 0.5) * this.size * 0.96, z = (rand() - 0.5) * this.size * 0.96;
      const w = this.splatAt(x, z); if (rand() > w[0] * 1.25 - 0.1 || avoid(x, z)) continue;
      const sc = 0.6 + rand() * 0.8;
      m.compose(p.set(x, this.height(x, z) - 0.03, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), s.set(sc, sc * (0.7 + rand() * 0.6), sc));
      mesh.setMatrixAt(k, m); mesh.setColorAt(k, col.setHSL(0.17 + rand() * 0.06, 0.25 + rand() * 0.15, 0.55 + rand() * 0.3)); k++;
    }
    mesh.count = k; mesh.receiveShadow = true; mesh.frustumCulled = false;
    return mesh;
  }
}

function makeSplatMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const T = [TEX.grass, TEX.dirt, TEX.rock, TEX.asphalt];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.terrPom = { get value() { return POM.value; } };
    ['A', 'B', 'C', 'D'].forEach((k, i) => { sh.uniforms['t' + k] = { value: T[i].map }; sh.uniforms['n' + k] = { value: T[i].normalMap }; });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD; uniform float terrPom; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;
        vec4 W; vec2 UV;
        vec3 tri(sampler2D t, vec2 uv) { return texture2D(t, uv).rgb * 0.6 + texture2D(t, uv * 0.27 + 0.37).rgb * 0.4; } // two scales break up tiling`)
      .replace('#include <map_fragment>', `
        UV = vWP.xz / 4.0;
        { vec3 Vw = normalize(cameraPosition - vWP); vec3 Nw0 = normalize(vWN); vec3 Tw0 = normalize(vec3(1.0, 0.0, 0.0) - Nw0 * Nw0.x); vec3 Bw0 = cross(Tw0, Nw0);
          vec3 Vt = vec3(dot(Vw, Tw0), -dot(Vw, Bw0), dot(Vw, Nw0)); float hgt = texture2D(nB, UV * 0.8).a * vSplat.y + texture2D(nC, UV * 0.5).a * vSplat.z + texture2D(nA, UV).a * vSplat.x + texture2D(nD, UV * 0.6).a * vSplat.w;
          UV += Vt.xy / max(Vt.z, 0.3) * (hgt - 0.5) * 0.06 * terrPom; }
        float macro = texture2D(tB, vWP.xz / 180.0).r;
        W = vSplat;
        // height-based blending sharpens the transitions using each layer's albedo as a height proxy
        vec3 ca = tri(tA, UV), cb = tri(tB, UV * 0.8), cc = tri(tC, UV * 0.5), cd = tri(tD, UV * 0.6);
        vec4 hh = vec4(dot(ca, vec3(0.33)), dot(cb, vec3(0.33)) + 0.1, dot(cc, vec3(0.33)) + 0.15, 0.2);
        W = max(W + hh * 0.6 - 0.25, 0.0) * step(0.001, W); W /= max(dot(W, vec4(1.0)), 1e-4);
        vec3 alb = ca * W.x + cb * W.y + cc * W.z + cd * W.w;
        alb *= mix(0.78, 1.12, macro);
        diffuseColor.rgb *= alb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = dot(W, vec4(0.96, 0.95, 0.82, 0.86));')
      .replace('#include <normal_fragment_maps>', `
        vec3 tn = (texture2D(nA, UV).xyz * 2.0 - 1.0) * W.x + (texture2D(nB, UV * 0.8).xyz * 2.0 - 1.0) * W.y
                + (texture2D(nC, UV * 0.5).xyz * 2.0 - 1.0) * W.z + (texture2D(nD, UV * 0.6).xyz * 2.0 - 1.0) * W.w;
        tn.xy *= 1.3;
        vec3 Nw = normalize(vWN); vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x); vec3 Bw = cross(Tw, Nw);
        vec3 nw = normalize(Tw * tn.x - Bw * tn.y + Nw * tn.z);
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);`);
  };
  return m;
}
