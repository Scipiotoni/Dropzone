// Renderer, physically based sky + image based lighting, sun shadows and the post-processing stack.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Height fog: thicker in the valleys, thinning with altitude, so distant terrain sits in a believable haze layer.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogY;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogY = cameraPosition.y + (transpose(mat3(viewMatrix)) * mvPosition.xyz).y;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\n #ifdef FOG_EXP2\n float hAtt = mix(1.0, 0.35, smoothstep(10.0, 90.0, vFogY));\n float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * hAtt );\n #else\n float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n #endif\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif';
import { setAniso, POM, guessQuality } from './textures.js';
export { guessQuality };

// Per-quality budgets. "low" and "medium" target integrated GPUs (old Chromebooks): no post stack on low, small
// shadow maps around the player, short grass/prop draw distances, thicker fog hiding the cull distance.
export const QUALITY = {
  low:    { pr: 0.75, prMin: 0.5, shadow: 1024, shadowSpan: 32, shadowEvery: 2, post: false, bloom: false, gtao: false, msaa: 0, pom: 0, far: 420, fog: 1.55, lod: { static: 300, prop: 120, tree: 230, grass: 34, actor: 150, detail: 48 }, grass: 0.4, trees: 0.6, tex: 0.5 },
  medium: { pr: 1.0, prMin: 0.6, shadow: 2048, shadowSpan: 48, shadowEvery: 1, post: true, bloom: true, gtao: false, msaa: 0, pom: 0, far: 650, fog: 1.25, lod: { static: 450, prop: 250, tree: 380, grass: 55, actor: 230, detail: 90 }, grass: 0.6, trees: 0.85, tex: 0.5 },
  high:   { pr: 1.5, prMin: 0.8, shadow: 4096, shadowSpan: 70, shadowEvery: 1, post: true, bloom: true, gtao: true, msaa: 4, pom: 1, far: 1600, fog: 1, lod: { static: 900, prop: 420, tree: 700, grass: 95, actor: 380, detail: 150 }, grass: 1, trees: 1, tex: 1 },
  ultra:  { pr: 2.0, prMin: 1.0, shadow: 4096, shadowSpan: 70, shadowEvery: 1, post: true, bloom: true, gtao: true, msaa: 4, pom: 1, far: 1600, fog: 1, lod: { static: 2000, prop: 600, tree: 1000, grass: 130, actor: 500, detail: 220 }, grass: 1, trees: 1, tex: 1 },
};
// Distance culling: static chunks, props, trees, grass cells and actors are hidden beyond the per-quality distance.
export class Lod {
  constructor() { this.items = []; this.t = 0; this._p = new THREE.Vector3(); }
  clear() { this.items.length = 0; }
  add(obj, kind, center = null, radius = 0) { obj.userData.lodItem = true; this.items.push({ obj, kind, c: center, r: radius }); }
  scan(root) { // pick up batcher chunks / instanced cells tagged with userData.lod
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.userData.lod && !o.userData.lodItem && o.geometry) { let bs; if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); bs = o.boundingSphere; } else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); bs = o.geometry.boundingSphere; } this.add(o, o.userData.lod, bs.center.clone().applyMatrix4(o.matrixWorld), bs.radius); } });
  }
  update(dt, cam, dist, force = false) {
    this.t -= dt; if (this.t > 0 && !force) return; this.t = 0.2;
    const cx = cam.x, cz = cam.z;
    for (const it of this.items) {
      const D = dist[it.kind] ?? 1e9; let x, z;
      if (it.c) { x = it.c.x; z = it.c.z; } else { x = it.obj.position.x; z = it.obj.position.z; }
      const dx = x - cx, dz = z - cz, lim = D + it.r;
      it.obj.visible = dx * dx + dz * dz < lim * lim;
    }
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, hurt: { value: 0 }, sat: { value: 0.9 }, tint: { value: new THREE.Vector3(1.02, 1.0, 0.96) }, grain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, hurt, sat, grain; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      // subtle chromatic aberration toward the edges
      float ca = 0.0015 * dot(c,c) * 4.0 + hurt * 0.004;
      vec3 col = vec3(texture2D(tDiffuse, uv + c*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c*ca).b);
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, sat) * tint;
      col = mix(col, col * vec3(1.5, 0.35, 0.3), hurt * smoothstep(0.15, 0.75, length(c)));
      col *= 1.0 - vignette * smoothstep(0.3, 0.85, length(c));
      col += (hash(uv * 1000.0 + time) - 0.5) * grain * (1.0 - l * 0.5);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(container) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1600);
    this.baseFov = 70;

    // sky
    this.sky = new Sky(); this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.sun = new THREE.Vector3();
    // procedural cloud layer: fbm on a high dome, lit from the sun direction
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: this.sun }, cover: { value: 0.48 }, tint: { value: new THREE.Color(1, 0.96, 0.9) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `uniform float time, cover; uniform vec3 sunDir, tint; varying vec3 vD;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += n(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        void main(){
          if (vD.y < 0.01) discard;
          vec2 uv = vD.xz / (vD.y + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float d = fbm(uv); float c = smoothstep(cover, cover + 0.28, d);
          float d2 = fbm(uv + sunDir.xz * 0.06); float lit = clamp(0.55 + (d - d2) * 3.0, 0.25, 1.2);
          vec3 col = mix(vec3(0.42, 0.44, 0.5), tint * 1.25, lit) * (0.7 + 0.5 * max(sunDir.y, 0.0));
          float fade = smoothstep(0.02, 0.25, vD.y);
          gl_FragColor = vec4(col, c * fade * 0.92);
        }`,
      transparent: true, depthWrite: false, fog: false, side: THREE.BackSide,
    }));
    this.clouds.material.side = THREE.DoubleSide; this.clouds.renderOrder = -1; this.clouds.frustumCulled = false;
    this.sunLight = new THREE.DirectionalLight(0xffe2c0, 3.2);
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow; sc.mapSize.set(4096, 4096); sc.bias = -0.0004; sc.normalBias = 0.04;
    Object.assign(sc.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
    this.hemi = new THREE.HemisphereLight(0xb8c8e0, 0x4a4030, 0.35);
    this.pmrem = new THREE.PMREMGenerator(r);

    // post
    const rt = new THREE.WebGLRenderTarget(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.35, 1.6);
    this.grade = new ShaderPass(GradeShader);
    this.gtao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.gtao.blendIntensity = 0.85; this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.renderPass); this.composer.addPass(this.gtao); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass()); this.composer.addPass(this.grade);
    addEventListener('resize', () => this.resize());
    this.quality = 'high'; this.Q = QUALITY.high; this.lod = new Lod();
  }
  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q; const Q = this.Q = QUALITY[q]; const r = this.renderer;
    this.prCap = Math.min(devicePixelRatio, Q.pr); this.prNow = this.prCap; this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    r.setPixelRatio(this.prNow);
    r.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const sh = this.sunLight.shadow; sh.mapSize.set(Q.shadow, Q.shadow); sh.radius = q === 'low' ? 1 : 2;
    Object.assign(sh.camera, { left: -Q.shadowSpan, right: Q.shadowSpan, top: Q.shadowSpan, bottom: -Q.shadowSpan }); sh.camera.updateProjectionMatrix();
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    r.shadowMap.autoUpdate = true; this.shadowTick = 0;
    this.bloom.enabled = Q.bloom; this.gtao.enabled = Q.gtao; POM.value = Q.pom; POM.low = q === 'low';
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) { rt.samples = Q.msaa; rt.dispose(); }
    this.camera.far = Q.far; this.camera.updateProjectionMatrix();
    if (this.scene.fog && this.fogBase) this.scene.fog.density = this.fogBase * Q.fog;
    this.resize();
    this.onQuality?.(q);
  }
  // dynamic resolution: keep the frame rate near 30+ by scaling the render resolution between prMin and the cap
  adapt(dt) {
    if (this.quality === 'high' || this.quality === 'ultra') return;
    this.fpsAcc += dt; this.fpsN++; this.fpsT += dt; if (this.fpsT < 1.5) return;
    const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; this.fps = fps;
    let pr = this.prNow;
    if (fps < 29) pr = Math.max(this.Q.prMin, pr - (fps < 22 ? 0.12 : 0.06)); else if (fps > 45) pr = Math.min(this.prCap, pr + 0.05);
    if (Math.abs(pr - this.prNow) > 0.001) { this.prNow = pr; this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr); this.composer.setSize(innerWidth, innerHeight); }
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight);
  }
  // configure atmosphere for a level: elevation/azimuth in degrees
  setAtmosphere({ elevation = 14, azimuth = 220, fog = 0x9aa4a8, fogDensity = 0.0042, exposure = 0.9, turbidity = 6 } = {}) {
    const s = this.scene;
    const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sun);
    this.sky.material.uniforms.turbidity.value = turbidity;
    // bake environment lighting from the sky
    const envScene = new THREE.Scene(); const sky2 = this.sky.clone(); sky2.material = this.sky.material; envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 16), new THREE.MeshBasicMaterial({ color: 0x3a3428 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -10; envScene.add(ground);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02);
    s.environment = this.envRT.texture; s.environmentIntensity = 0.55;
    s.background = null;
    this.fogBase = fogDensity; s.fog = new THREE.FogExp2(fog, fogDensity * (this.Q?.fog || 1));
    this.sunLight.color.set(elevation < 12 ? 0xffc890 : 0xffe4c4);
    this.clouds.material.uniforms.tint.value.set(elevation < 12 ? 0xffc8a0 : 0xfff4ea);
    this.renderer.toneMappingExposure = exposure;
  }
  attach() { // (re)add the persistent scene objects after a level clears the scene
    this.scene.add(this.sky, this.clouds, this.sunLight, this.sunLight.target, this.hemi);
  }
  clearScene() {
    const keep = new Set([this.sky, this.clouds, this.sunLight, this.sunLight.target, this.hemi]);
    for (const o of [...this.scene.children]) if (!keep.has(o)) {
      this.scene.remove(o);
      o.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    }
  }
  followSun(pos) { // keep the shadow frustum centred on the player, snapped to texels to avoid shimmering
    const L = this.sunLight; const step = (L.shadow.camera.right - L.shadow.camera.left) / L.shadow.mapSize.x;
    const cx = Math.round(pos.x / step) * step, cz = Math.round(pos.z / step) * step;
    L.target.position.set(cx, pos.y, cz); L.position.set(cx + this.sun.x * 200, pos.y + this.sun.y * 200, cz + this.sun.z * 200);
    L.target.updateMatrixWorld();
  }
  render(dt, t) {
    this.adapt(dt);
    this.lod.update(dt, this.camera.position, this.Q.lod);
    // shadow map refreshed every Nth frame on low (the shadow pass is a second full scene draw)
    const r = this.renderer;
    if (this.Q.shadowEvery > 1) { r.shadowMap.autoUpdate = false; if (++this.shadowTick >= this.Q.shadowEvery) { this.shadowTick = 0; r.shadowMap.needsUpdate = true; } }
    this.grade.uniforms.time.value = t % 100; this.clouds.material.uniforms.time.value = t; this.clouds.position.copy(this.camera.position);
    if (this.Q.post) this.composer.render(dt);
    else r.render(this.scene, this.camera); // low: straight to the canvas (tone mapping in the material shaders), no post passes
  }
}
